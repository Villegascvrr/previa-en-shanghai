/* Interfaz del juego. Toda la lógica vive en engine.js. */
(function () {
  'use strict';

  var E = window.PreviaEngine;
  var KEY_SETUP = 'previa-shanghai:setup';
  var KEY_GAME = 'previa-shanghai:partida';

  var SAMPLE_PLAYERS = [
    { name: 'Lucía', drinks: true },
    { name: 'Dani', drinks: false },
    { name: 'Marta', drinks: true }
  ];

  var app = {
    screen: 'setup',
    setup: { players: SAMPLE_PLAYERS.slice(), settings: Object.assign({}, E.DEFAULT_SETTINGS), sample: true },
    game: null,
    confirmEnd: false,
    confirmRemove: null
  };

  /* ---------- utilidades ---------- */

  function $(id) { return document.getElementById(id); }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') el.textContent = v;
        else if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function load(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* sin almacenamiento: el juego sigue funcionando */ }
  }

  function persist() {
    save(KEY_SETUP, { players: app.setup.players, settings: app.setup.settings });
    save(KEY_GAME, app.game && app.screen !== 'end' ? app.game : null);
  }

  function showError(el, msg) {
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function nameSpan(name) { return h('strong', { class: 'name', text: name }); }

  function renderSegments(segments) {
    return segments.map(function (s) { return s.kind === 'name' ? nameSpan(s.value) : document.createTextNode(s.value); });
  }

  function drinkTag(drinks) {
    return h('span', { class: 'tag ' + (drinks ? 'tag-drink' : 'tag-sober'), text: drinks ? '🍺 Bebe' : '🧃 Sin alcohol' });
  }

  /* ---------- pantallas ---------- */

  function show(screen) {
    app.screen = screen;
    ['setup', 'game', 'end'].forEach(function (s) { $('screen-' + s).hidden = s !== screen; });
    closeSheet();
    window.scrollTo(0, 0);
    render();
    persist();
  }

  function render() {
    if (app.screen === 'setup') renderSetup();
    else if (app.screen === 'game') renderGame();
    else renderEnd();
  }

  /* ---------- ajustes (compartido entre preparación y partida) ---------- */

  function segmented(id, label, options, value, onChange, help) {
    var group = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': id + '-label' },
      options.map(function (o) {
        var selected = o.id === value;
        return h('button', {
          type: 'button',
          id: id + '-' + o.id,
          class: 'seg-btn',
          role: 'radio',
          'aria-checked': selected ? 'true' : 'false',
          onclick: function () { onChange(o.id); }
        }, [o.name]);
      }));
    return h('div', { class: 'field' }, [
      h('span', { class: 'field-label', id: id + '-label', text: label }),
      group,
      help ? h('p', { class: 'field-help', text: help }) : null
    ]);
  }

  function hotHelp(settings) {
    var mode = E.getMode(settings.mode);
    if (mode.maxHot === 0) return 'El modo Rompehielos nunca tiene picante.';
    if (mode.minHot && settings.hot < mode.minHot) return 'El modo Picante usa como mínimo «Un poco».';
    return ['Ni una pregunta de ligoteo.', 'Algo de ligoteo y citas, nada fuerte.', 'Preguntas y retos más atrevidos, sin pasarse.'][settings.hot];
  }

  function altHelp(settings) {
    for (var i = 0; i < E.ALT_MODES.length; i++) if (E.ALT_MODES[i].id === settings.alt) return E.ALT_MODES[i].desc;
    return '';
  }

  function renderSettings(container, prefix, settings, onChange, inGame) {
    clear(container);
    if (inGame) {
      var select = h('select', {
        id: prefix + '-mode',
        class: 'input',
        onchange: function (e) { onChange({ mode: e.target.value }); }
      }, E.MODES.map(function (m) {
        return h('option', { value: m.id, selected: m.id === settings.mode }, [m.name]);
      }));
      container.appendChild(h('div', { class: 'field' }, [
        h('label', { class: 'field-label', for: prefix + '-mode', text: 'Modo' }), select
      ]));
    }
    container.appendChild(segmented(prefix + '-hot', 'Picante', E.HOT_LEVELS, settings.hot,
      function (v) { onChange({ hot: v }); }, hotHelp(settings)));
    container.appendChild(segmented(prefix + '-alt', 'Quien no bebe, cuando paga…', E.ALT_MODES, settings.alt,
      function (v) { onChange({ alt: v }); }, altHelp(settings)));
    if (!inGame) {
      container.appendChild(segmented(prefix + '-com', 'Comodines por persona', [0, 1, 2, 3].map(function (n) {
        return { id: n, name: String(n) };
      }), settings.comodines, function (v) { onChange({ comodines: v }); },
      'Un comodín salta una verdad o un reto sin pagar.'));
    }
  }

  /* ---------- preparación ---------- */

  function setupPlayerRow(p, i) {
    var removing = app.confirmRemove === 'setup-' + i;
    return h('li', { class: 'player' }, [
      h('label', { class: 'sr-only', for: 'p-name-' + i, text: 'Nombre de la persona ' + (i + 1) }),
      h('input', {
        id: 'p-name-' + i,
        class: 'input player-name',
        type: 'text',
        maxlength: String(E.MAX_NAME),
        value: p.name,
        oninput: function (e) {
          app.setup.players[i].name = e.target.value;
          app.setup.sample = false;
          persist();
        }
      }),
      h('button', {
        type: 'button',
        class: 'toggle ' + (p.drinks ? 'is-drink' : 'is-sober'),
        'aria-pressed': p.drinks ? 'true' : 'false',
        'aria-label': p.name + (p.drinks ? ' bebe alcohol. Toca para cambiar.' : ' no bebe alcohol. Toca para cambiar.'),
        onclick: function () {
          app.setup.players[i].drinks = !p.drinks;
          app.setup.sample = false;
          renderSetup(); persist();
        }
      }, [p.drinks ? '🍺 Bebe' : '🧃 Sin alcohol']),
      h('button', {
        type: 'button',
        class: 'icon-btn' + (removing ? ' is-confirm' : ''),
        'aria-label': removing ? 'Confirmar: quitar a ' + p.name : 'Quitar a ' + p.name,
        onclick: function () {
          if (!removing && p.name.trim()) { app.confirmRemove = 'setup-' + i; renderSetup(); return; }
          app.confirmRemove = null;
          app.setup.players.splice(i, 1);
          app.setup.sample = false;
          renderSetup(); persist();
        }
      }, [removing ? '¿Quitar?' : '×'])
    ]);
  }

  function renderSetup() {
    var list = $('player-list');
    clear(list);
    app.setup.players.forEach(function (p, i) { list.appendChild(setupPlayerRow(p, i)); });
    if (app.setup.sample) {
      list.appendChild(h('li', { class: 'sample-note', text: 'Son nombres de ejemplo: cámbialos por los vuestros.' }));
    }

    var modes = $('mode-list');
    clear(modes);
    var count = app.setup.players.filter(function (p) { return p.name.trim(); }).length;
    E.MODES.forEach(function (m) {
      var selected = m.id === app.setup.settings.mode;
      var tooFew = m.minPlayers && count < m.minPlayers;
      modes.appendChild(h('button', {
        type: 'button',
        id: 'mode-' + m.id,
        class: 'mode',
        role: 'radio',
        'data-mode': m.id,
        'aria-checked': selected ? 'true' : 'false',
        onclick: function () { changeSetupSettings({ mode: m.id }); }
      }, [
        h('span', { class: 'mode-name', text: m.name }),
        h('span', { class: 'mode-desc', text: tooFew ? 'Necesita ' + m.minPlayers + ' personas o más. Mientras tanto se juega Todo un poco.' : m.desc })
      ]));
    });

    renderSettings($('setup-settings'), 'set', app.setup.settings, changeSetupSettings, false);
    $('resume-btn').hidden = !app.game || !app.game.current;
  }

  function changeSetupSettings(partial) {
    app.setup.settings = E.normalizeSettings(partial, app.setup.settings);
    renderSetup(); persist();
  }

  function addSetupPlayer(e) {
    e.preventDefault();
    var input = $('add-name');
    var name = input.value.replace(/\s+/g, ' ').trim();
    if (!name) { showError($('setup-error'), 'Escribe un nombre para añadir a alguien.'); input.focus(); return; }
    var exists = app.setup.players.some(function (p) { return p.name.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'); });
    if (exists) { showError($('setup-error'), 'Ya hay alguien que se llama «' + name + '».'); return; }
    if (app.setup.players.length >= E.MAX_PLAYERS) { showError($('setup-error'), 'Como máximo pueden jugar ' + E.MAX_PLAYERS + ' personas.'); return; }
    if (app.setup.sample) { app.setup.players = []; app.setup.sample = false; }
    app.setup.players.push({ name: name, drinks: true });
    input.value = '';
    showError($('setup-error'), '');
    renderSetup(); persist();
    input.focus();
  }

  function startGame() {
    var checked = E.validatePlayers(app.setup.players);
    if (checked.errors.length) { showError($('setup-error'), checked.errors[0]); $('player-list').scrollIntoView({ block: 'center' }); return; }
    showError($('setup-error'), '');
    app.game = E.createGame({ players: checked.players, settings: app.setup.settings });
    E.drawNext(app.game);
    show('game');
  }

  /* ---------- partida ---------- */

  function renderRules() {
    var list = $('rules');
    clear(list);
    E.activeRules(app.game).forEach(function (r) {
      list.appendChild(h('li', { class: 'rule' }, [
        h('span', { class: 'rule-left num', text: r.left === 1 ? 'Última carta' : 'Quedan ' + r.left }),
        h('span', { class: 'rule-text', text: r.text })
      ]));
    });
    list.hidden = !list.firstChild;
  }

  function penaltyLine(drinks, text, who) {
    return h('p', { class: 'pay ' + (drinks ? 'pay-drink' : 'pay-sober') }, [
      h('span', { class: 'pay-icon', 'aria-hidden': 'true', text: drinks ? '🍺' : '🧃' }),
      h('span', { class: 'pay-text' }, [who ? nameSpan(who) : null, who ? ': ' : null, text])
    ]);
  }

  function renderCardBody(v) {
    var card = $('card');
    clear(card);
    card.setAttribute('data-type', v.kind === 'choice' ? 'choice' : v.type);

    if (v.kind === 'choice') {
      card.appendChild(h('div', { class: 'card-top' }, [h('span', { class: 'card-label', text: 'Verdad o reto' })]));
      card.appendChild(h('p', { class: 'card-text' }, [nameSpan(v.player.name), ', ¿verdad o reto?']));
      card.appendChild(h('p', { class: 'card-hint', text: 'Elige antes de ver la carta. Luego no vale cambiar.' }));
      return;
    }

    var top = h('div', { class: 'card-top' }, [
      h('span', { class: 'card-label', text: v.label }),
      v.hot ? h('span', { class: 'card-hot', text: v.hot === 2 ? 'Picante' : 'Un poco picante' }) : null
    ]);
    card.appendChild(top);

    if (v.target === 'single') {
      card.appendChild(h('p', { class: 'card-turn' }, ['Le toca a ', nameSpan(v.player.name), ' ', drinkTag(v.player.drinks)]));
    } else if (v.target === 'group') {
      card.appendChild(h('p', { class: 'card-turn' }, ['Lee en voz alta ', nameSpan(v.player.name)]));
    }

    if (v.type === 'categoria') {
      card.appendChild(h('p', { class: 'card-kicker', text: 'Por turnos, decid…' }));
    }
    card.appendChild(h('p', { class: 'card-text' }, renderSegments(v.segments)));
    if (v.hint) card.appendChild(h('p', { class: 'card-hint', text: v.hint }));

    var pay = h('div', { class: 'pay-box' });
    if (v.resolved) {
      var o = v.outcome;
      if (o.kind === 'hecho') pay.appendChild(h('p', { class: 'outcome good' }, ['¡Hecho! ', nameSpan(v.player.name), ' se libra.']));
      else if (o.kind === 'comodin') pay.appendChild(h('p', { class: 'outcome' }, [nameSpan(v.player.name), ' usa un comodín. Le quedan ' + v.comodines + '.']));
      if (v.payer) {
        if (o.kind === 'duelo') pay.appendChild(h('p', { class: 'outcome good' }, ['Gana ', nameSpan(o.winnerId === v.player.id ? v.player.name : v.p2.name), '.']));
        pay.appendChild(h('p', { class: 'pay-title', text: 'Paga' }));
        pay.appendChild(penaltyLine(v.payerPenalty.drinks, v.payerPenalty.text, v.payer.name));
      }
    } else if (v.target === 'single') {
      pay.appendChild(h('p', { class: 'pay-title', text: 'Si pasa' }));
      pay.appendChild(penaltyLine(v.penalty.drinks, v.penalty.text));
    } else if (v.target === 'duel') {
      pay.appendChild(h('p', { class: 'pay-title', text: 'Quien pierda' }));
      v.penalties.forEach(function (x) { pay.appendChild(penaltyLine(x.penalty.drinks, x.penalty.text, x.player.name)); });
    } else if (v.group) {
      pay.appendChild(h('p', { class: 'pay-title', text: 'Pagar es' }));
      if (v.group.drink) pay.appendChild(penaltyLine(true, v.group.drink + ' para quien bebe.'));
      if (v.group.alt) pay.appendChild(penaltyLine(false, v.group.alt));
    }
    if (pay.firstChild) card.appendChild(pay);
  }

  function actionBtn(label, cls, onClick, attrs) {
    return h('button', Object.assign({ type: 'button', class: 'btn ' + cls, onclick: onClick }, attrs || {}), [label]);
  }

  function renderActions(v) {
    var box = $('actions');
    clear(box);
    var row = h('div', { class: 'action-row' });
    box.appendChild(row);

    if (v.kind === 'choice') {
      v.options.forEach(function (t) {
        row.appendChild(actionBtn(t === 'pregunta' ? 'Verdad' : 'Reto', 'big ' + (t === 'pregunta' ? 'choice-truth' : 'choice-dare'), function () {
          E.choose(app.game, t); afterAction(true);
        }));
      });
      return;
    }

    if (v.resolved || v.target === 'group') {
      row.appendChild(actionBtn('Siguiente carta', 'primary big', next, { id: 'next-btn' }));
    } else if (v.target === 'single') {
      row.appendChild(actionBtn(v.type === 'pregunta' ? 'Respondido' : 'Hecho', 'primary big', function () { resolve('hecho'); }));
      row.appendChild(actionBtn('Paso, pago', 'big', function () { resolve('paso'); }));
      if (app.game.settings.comodines > 0 || v.comodines > 0) {
        row.appendChild(actionBtn('Comodín (' + v.comodines + ')', 'ghost', function () { resolve('comodin'); },
          { disabled: v.comodines <= 0, 'aria-label': 'Usar comodín. Quedan ' + v.comodines }));
      }
    } else if (v.target === 'duel') {
      [v.player, v.p2].forEach(function (p) {
        row.appendChild(h('button', { type: 'button', class: 'btn big', onclick: function () { resolve({ winner: p.id }); } },
          ['Gana ', nameSpan(p.name)]));
      });
    }

    if (!v.resolved) {
      box.appendChild(h('button', { type: 'button', class: 'link-btn', onclick: function () { E.redraw(app.game); afterAction(true); } },
        ['Esta carta no encaja: cambiar']));
    }
  }

  function renderGame() {
    var g = app.game;
    if (!g) { show('setup'); return; }
    if (!g.current) E.drawNext(g);
    $('g-count').textContent = 'Carta ' + g.cardCount;
    $('g-mode').textContent = E.getMode(g.settings.mode).name;
    renderRules();
    var v = E.view(g);
    renderCardBody(v);
    renderActions(v);
  }

  function animateCard() {
    var card = $('card');
    card.classList.remove('deal');
    void card.offsetWidth;
    card.classList.add('deal');
  }

  function afterAction(animate) {
    renderGame(); persist();
    if (animate) animateCard();
  }

  function resolve(outcome) {
    if (E.resolve(app.game, outcome)) {
      afterAction();
      var nextBtn = $('next-btn');
      if (nextBtn) nextBtn.focus({ preventScroll: true });
    }
  }

  function next() {
    var cur = app.game.current;
    if (cur && cur.kind === 'card' && !cur.resolved && E.TYPES[cur.type].target === 'group') E.resolve(app.game, 'ok');
    E.drawNext(app.game);
    afterAction(true);
    window.scrollTo(0, 0);
  }

  /* ---------- marcador ---------- */

  function statLine(p) {
    var s = p.stats;
    var parts = [s.hechos + ' cumplidos', s.pagos + ' pagos'];
    if (s.duelos) parts.push(s.duelos + (s.duelos === 1 ? ' duelo' : ' duelos'));
    parts.push(p.comodines + (p.comodines === 1 ? ' comodín' : ' comodines'));
    return parts.join(' · ');
  }

  function renderSheet() {
    var g = app.game;
    var list = $('sheet-players');
    clear(list);
    g.players.forEach(function (p, i) {
      var removing = app.confirmRemove === p.id;
      var isTurn = i === g.turn;
      list.appendChild(h('li', { class: 'player sheet-player' + (isTurn ? ' is-turn' : '') }, [
        h('div', { class: 'sheet-player-main' }, [
          h('span', { class: 'sheet-name' }, [p.name, isTurn ? h('span', { class: 'turn-pill', text: 'Turno' }) : null]),
          h('span', { class: 'sheet-stats num', text: statLine(p) })
        ]),
        h('button', {
          type: 'button',
          class: 'toggle ' + (p.drinks ? 'is-drink' : 'is-sober'),
          'aria-pressed': p.drinks ? 'true' : 'false',
          'aria-label': p.name + (p.drinks ? ' bebe alcohol. Toca para cambiar.' : ' no bebe alcohol. Toca para cambiar.'),
          onclick: function () { E.setDrinks(g, p.id, !p.drinks); renderSheet(); afterAction(); }
        }, [p.drinks ? '🍺' : '🧃']),
        h('button', {
          type: 'button',
          class: 'icon-btn' + (removing ? ' is-confirm' : ''),
          'aria-label': removing ? 'Confirmar: quitar a ' + p.name : 'Quitar a ' + p.name,
          onclick: function () {
            if (!removing) { app.confirmRemove = p.id; renderSheet(); return; }
            app.confirmRemove = null;
            try {
              if (E.removePlayer(g, p.id)) E.drawNext(g);
              showError($('sheet-error'), '');
            } catch (err) { showError($('sheet-error'), err.message); }
            renderSheet(); afterAction();
          }
        }, [removing ? '¿Quitar?' : '×'])
      ]));
    });

    renderSettings($('sheet-settings'), 'game', g.settings, function (partial) {
      if (E.updateSettings(g, partial)) E.redraw(g);
      renderSheet(); afterAction();
    }, true);

    var endBtn = $('end-btn');
    endBtn.textContent = app.confirmEnd ? 'Toca otra vez para terminar' : 'Terminar partida';
    endBtn.classList.toggle('is-confirm', app.confirmEnd);
  }

  var lastFocus = null;

  function openSheet() {
    app.confirmEnd = false;
    app.confirmRemove = null;
    showError($('sheet-error'), '');
    renderSheet();
    lastFocus = document.activeElement;
    $('sheet').hidden = false;
    document.body.classList.add('no-scroll');
    $('sheet').querySelector('.sheet-head [data-close]').focus();
  }

  function closeSheet() {
    var sheet = $('sheet');
    if (sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove('no-scroll');
    app.confirmEnd = false;
    app.confirmRemove = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function addGamePlayer(e) {
    e.preventDefault();
    var input = $('sheet-add-name');
    try {
      E.addPlayer(app.game, input.value, true);
      input.value = '';
      showError($('sheet-error'), '');
    } catch (err) { showError($('sheet-error'), err.message); }
    renderSheet(); afterAction();
  }

  function endGame() {
    if (!app.confirmEnd) { app.confirmEnd = true; renderSheet(); return; }
    show('end');
  }

  /* ---------- final ---------- */

  function renderEnd() {
    var g = app.game;
    if (!g) { show('setup'); return; }
    $('end-sub').textContent = g.cardCount + ' cartas jugadas en modo ' + E.getMode(g.settings.mode).name + '.';
    var list = $('awards');
    clear(list);
    var awards = E.awards(g);
    if (!awards.length) list.appendChild(h('li', { class: 'award' }, [h('span', { class: 'award-desc', text: 'Esta vez no hubo ni retos ni duelos. La próxima, más cartas.' })]));
    awards.forEach(function (a) {
      list.appendChild(h('li', { class: 'award' }, [
        h('span', { class: 'award-title', text: a.title }),
        h('span', { class: 'award-names', text: a.names.join(', ') }),
        h('span', { class: 'award-desc', text: a.desc + ': ' + a.value })
      ]));
    });
    var body = $('end-table');
    clear(body);
    g.players.forEach(function (p) {
      body.appendChild(h('tr', null, [
        h('th', { scope: 'row' }, [p.name, ' ', h('span', { class: 'end-drink', 'aria-label': p.drinks ? 'bebe' : 'sin alcohol', text: p.drinks ? '🍺' : '🧃' })]),
        h('td', { class: 'num', text: String(p.stats.hechos) }),
        h('td', { class: 'num', text: String(p.stats.pagos) }),
        h('td', { class: 'num', text: String(p.stats.duelos) }),
        h('td', { class: 'num', text: String(p.stats.comodines) })
      ]));
    });
  }

  function rematch() {
    var g = app.game;
    app.setup.players = g.players.map(function (p) { return { name: p.name, drinks: p.drinks }; });
    app.setup.settings = Object.assign({}, app.setup.settings, g.settings);
    app.setup.sample = false;
    app.game = E.createGame({ players: app.setup.players, settings: app.setup.settings });
    E.drawNext(app.game);
    show('game');
  }

  function goHome() {
    if (app.game) {
      app.setup.players = app.game.players.map(function (p) { return { name: p.name, drinks: p.drinks }; });
      app.setup.sample = false;
    }
    app.game = null;
    show('setup');
  }

  /* ---------- arranque ---------- */

  function bind() {
    $('add-form').addEventListener('submit', addSetupPlayer);
    $('start-btn').addEventListener('click', startGame);
    $('resume-btn').addEventListener('click', function () { show('game'); });
    $('open-sheet').addEventListener('click', openSheet);
    $('sheet-add').addEventListener('submit', addGamePlayer);
    $('end-btn').addEventListener('click', endGame);
    $('rematch-btn').addEventListener('click', rematch);
    $('home-btn').addEventListener('click', goHome);
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (el) {
      el.addEventListener('click', closeSheet);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
    });
  }

  function restoreFrom(data) {
    data = data || {};
    var setup = data.setup;
    if (!setup) {
      try { setup = JSON.parse(load(KEY_SETUP) || 'null'); } catch (e) { setup = null; }
    }
    if (setup && Array.isArray(setup.players)) {
      app.setup.players = setup.players
        .filter(function (p) { return p && typeof p.name === 'string'; })
        .slice(0, E.MAX_PLAYERS)
        .map(function (p) { return { name: p.name.slice(0, E.MAX_NAME), drinks: p.drinks !== false }; });
      app.setup.settings = E.normalizeSettings(setup.settings);
      app.setup.sample = !!setup.sample;
    }
    var game = E.restore(data.game || load(KEY_GAME));
    if (game) app.game = game;
    var screen = data.screen;
    if (screen === 'game' && !app.game) screen = 'setup';
    if (screen === 'end' && !app.game) screen = 'setup';
    return screen || 'setup';
  }

  function start(data) {
    bind();
    show(restoreFrom(data));
  }

  var hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) {
    hot.snapshot(function () {
      return { screen: app.screen, setup: app.setup, game: app.game };
    });
  }
  if (hot && hot.ready) hot.ready(start);
  else start((hot && hot.data) || {});
})();
