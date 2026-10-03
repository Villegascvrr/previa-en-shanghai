/*
 * Lógica del juego, sin DOM. Funciona en el navegador (window.PreviaEngine)
 * y en Node (require) para los tests.
 *
 * El estado es un objeto JSON plano: se puede guardar en localStorage tal cual.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var DATA = isNode ? require('./cards.js') : root.PREVIA_DATA;

  var VERSION = 1;
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 20;
  var MAX_NAME = 20;
  var MAX_RULES = 3;
  var RECENT_SIZE = 20;

  var TYPES = {
    pregunta: { label: 'Verdad', hint: 'Responde con sinceridad o paga.', target: 'single', n: 2 },
    reto: { label: 'Reto', hint: 'Hazlo o paga.', target: 'single', n: 2 },
    yonunca: { label: 'Yo nunca', hint: 'Paga quien sí lo haya hecho.', target: 'group', n: 1 },
    probable: { label: 'Más probable', hint: 'A la de tres, todo el mundo señala. Paga quien reciba más votos.', target: 'group', n: 2, minPlayers: 3 },
    duelo: { label: 'Duelo', hint: 'Quien pierda, paga.', target: 'duel', n: 2 },
    grupo: { label: 'Todos', hint: '', target: 'group', n: 1 },
    categoria: { label: 'Categorías', hint: 'Empieza {p} y seguís en orden. Quien se quede en blanco o repita, paga.', target: 'group', n: 2 },
    regla: { label: 'Nueva regla', hint: 'Quien la rompa, paga.', target: 'group', n: 1 },
    prefieres: {
      label: '¿Qué prefieres?',
      hint: 'A la de tres, todo el mundo vota: mano arriba la primera opción, abajo la segunda. Paga el bando con menos votos. Si hay empate, paga todo el mundo.',
      target: 'group', n: 1, minPlayers: 3
    }
  };

  var MODES = [
    {
      id: 'mezcla', name: 'Todo un poco',
      desc: 'Verdades, retos, yo nunca, duelos y reglas. Para empezar, este.',
      weights: { pregunta: 3, reto: 3, yonunca: 2, probable: 2, prefieres: 1.5, duelo: 1, grupo: 1.5, categoria: 1, regla: 1 }
    },
    {
      id: 'rompehielos', name: 'Rompehielos',
      desc: 'Suave y sin picante, para cuando aún os estáis conociendo.',
      weights: { pregunta: 3, yonunca: 2, probable: 2, prefieres: 2, grupo: 2, categoria: 2, duelo: 1 },
      maxHot: 0
    },
    {
      id: 'verdadoreto', name: 'Verdad o reto',
      desc: 'En cada turno, quien juega elige qué le toca.',
      weights: { pregunta: 1, reto: 1 },
      choice: true
    },
    {
      id: 'yonunca', name: 'Yo nunca',
      desc: 'El clásico de siempre. Paga quien sí lo haya hecho.',
      weights: { yonunca: 1 }
    },
    {
      id: 'probable', name: '¿Quién es más probable?',
      desc: 'Todo el mundo señala a la vez. Desde 3 personas.',
      weights: { probable: 1 },
      minPlayers: 3
    },
    {
      id: 'prefieres', name: '¿Qué prefieres?',
      desc: 'Dilemas imposibles. Todo el mundo vota y paga el bando que pierde. Desde 3 personas.',
      weights: { prefieres: 1 },
      minPlayers: 3
    },
    {
      id: 'retos', name: 'Retos y duelos',
      desc: 'Menos hablar y más hacer. Para cuando la fiesta ya está arriba.',
      weights: { reto: 4, duelo: 2, grupo: 1, regla: 1 }
    },
    {
      id: 'picante', name: 'Picante',
      desc: 'Solo cartas picantes: rollos, cuernos, secretos y algo más. Con «Sin filtro», sin censura.',
      weights: { pregunta: 3, reto: 2.5, yonunca: 3, probable: 2, prefieres: 1.5, grupo: 1, categoria: 1, duelo: 0.5, regla: 0.5 },
      minHot: 2
    }
  ];

  var HOT_LEVELS = [
    { id: 0, name: 'Sin picante' },
    { id: 1, name: 'Un poco' },
    { id: 2, name: 'Picante' },
    { id: 3, name: 'Sin filtro' }
  ];

  var ALT_MODES = [
    { id: 'castigo', name: 'Mini-reto', desc: 'Un mini-reto rápido en lugar del trago.' },
    { id: 'sorbos', name: 'Su bebida', desc: 'Los mismos sorbos, pero de su bebida sin alcohol.' },
    { id: 'elige', name: 'Que elijan', desc: 'En cada carta eligen entre sorbos o mini-reto.' }
  ];

  var MAX_HOT = 3;
  var DEFAULT_SETTINGS = { mode: 'mezcla', hot: 2, alt: 'castigo', comodines: 2 };

  var CARD_BY_ID = {};
  DATA.cards.forEach(function (c) { CARD_BY_ID[c.id] = c; });

  /* ---------- utilidades ---------- */

  function getMode(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
    return MODES[0];
  }

  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pickIndex(length, rng) {
    return Math.min(length - 1, Math.floor(rng() * length));
  }

  function pickWeighted(entries, rng) {
    var total = 0;
    entries.forEach(function (e) { total += e.weight; });
    var r = rng() * total;
    for (var i = 0; i < entries.length; i++) {
      r -= entries[i].weight;
      if (r < 0) return entries[i].key;
    }
    return entries[entries.length - 1].key;
  }

  function tragos(n) { return n === 1 ? '1 trago' : n + ' tragos'; }
  function sorbos(n) { return n === 1 ? '1 sorbo' : n + ' sorbos'; }

  function cleanName(name) {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  function clampInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeSettings(input, base) {
    var s = Object.assign({}, base || DEFAULT_SETTINGS);
    input = input || {};
    if (input.mode !== undefined && MODES.some(function (m) { return m.id === input.mode; })) s.mode = input.mode;
    if (input.hot !== undefined) s.hot = clampInt(input.hot, 0, MAX_HOT, s.hot);
    if (input.alt !== undefined && ALT_MODES.some(function (a) { return a.id === input.alt; })) s.alt = input.alt;
    if (input.comodines !== undefined) s.comodines = clampInt(input.comodines, 0, 5, s.comodines);
    return s;
  }

  /* Rango de picante [min, max] que admite el modo con los ajustes actuales. */
  function hotRange(settings) {
    var mode = getMode(settings.mode);
    var max = settings.hot;
    var min = 0;
    if (mode.maxHot !== undefined) max = Math.min(max, mode.maxHot);
    if (mode.minHot !== undefined) {
      min = mode.minHot;
      max = Math.max(max, mode.minHot);
    }
    return [min, max];
  }

  /* playerCount es opcional: si se pasa, quita cartas que necesitan más gente. */
  /* Picante mínimo que se prioriza al robar (0 = sin preferencia). */
  function spicePreference(settings) {
    var mode = getMode(settings.mode);
    if (mode.maxHot !== undefined || settings.hot < 2) return 0;
    var range = hotRange(settings);
    var pref = settings.hot - 1;
    if (pref <= range[0]) pref = range[1] > range[0] ? range[1] : 0;
    return pref;
  }

  function eligibleIds(type, settings, playerCount) {
    var range = hotRange(settings);
    return DATA.cards
      .filter(function (c) {
        return c.type === type && c.hot >= range[0] && c.hot <= range[1] &&
          (playerCount === undefined || !c.min || playerCount >= c.min);
      })
      .map(function (c) { return c.id; });
  }

  function findPlayer(state, id) {
    for (var i = 0; i < state.players.length; i++) if (state.players[i].id === id) return state.players[i];
    return null;
  }

  function newStats() {
    return { hechos: 0, pagos: 0, tragos: 0, castigos: 0, comodines: 0, duelos: 0 };
  }

  /* ---------- creación ---------- */

  function validatePlayers(list) {
    var errors = [];
    var seen = {};
    var players = (list || []).map(function (p) {
      return { name: cleanName(p && p.name), drinks: !(p && p.drinks === false) };
    }).filter(function (p) { return p.name.length > 0; });

    players.forEach(function (p) {
      var key = p.name.toLocaleLowerCase('es');
      if (seen[key]) errors.push('Hay dos personas que se llaman «' + p.name + '». Cambiad uno de los nombres.');
      seen[key] = true;
    });
    if (players.length < MIN_PLAYERS) errors.push('Hacen falta al menos ' + MIN_PLAYERS + ' personas para jugar.');
    if (players.length > MAX_PLAYERS) errors.push('Como máximo pueden jugar ' + MAX_PLAYERS + ' personas.');
    return { players: players, errors: errors };
  }

  function createGame(options, rng) {
    rng = rng || Math.random;
    options = options || {};
    var checked = validatePlayers(options.players);
    if (checked.errors.length) throw new Error(checked.errors[0]);
    var settings = normalizeSettings(options.settings);

    var state = {
      version: VERSION,
      settings: settings,
      players: [],
      nextId: 1,
      turn: 0,
      cardCount: 0,
      decks: {},
      recent: [],
      recentCastigos: [],
      rules: [],
      current: null
    };
    checked.players.forEach(function (p) {
      state.players.push({
        id: 'j' + state.nextId++,
        name: p.name,
        drinks: p.drinks,
        comodines: settings.comodines,
        stats: newStats()
      });
    });
    rebuildDecks(state, rng);
    return state;
  }

  function rebuildDecks(state, rng) {
    state.decks = {};
    Object.keys(TYPES).forEach(function (type) {
      state.decks[type] = shuffle(eligibleIds(type, state.settings), rng);
    });
  }

  /* ---------- robar cartas ---------- */

  function availableTypes(state) {
    function collect(mode) {
      var out = [];
      Object.keys(mode.weights).forEach(function (type) {
        var weight = mode.weights[type];
        var minPlayers = TYPES[type].minPlayers || MIN_PLAYERS;
        if (weight > 0 && state.players.length >= minPlayers &&
            eligibleIds(type, state.settings, state.players.length).length > 0) {
          out.push({ key: type, weight: weight });
        }
      });
      return out;
    }
    var mode = getMode(state.settings.mode);
    var types = collect(mode);
    if (!types.length) types = collect(MODES[0]);
    return types;
  }

  function drawFromDeck(state, type, rng) {
    var deck = state.decks[type] || [];
    // Quita ids que ya no existen o que no encajan con los ajustes actuales.
    var valid = eligibleIds(type, state.settings, state.players.length);
    deck = deck.filter(function (id) { return valid.indexOf(id) !== -1; });
    if (!deck.length) {
      var fresh = valid.filter(function (id) { return state.recent.indexOf(id) === -1; });
      if (!fresh.length) fresh = valid;
      deck = shuffle(fresh, rng);
    }
    // Con picante alto, se adelantan las cartas más picantes del mazo para que
    // no queden ahogadas entre las suaves (hay más cartas suaves que picantes).
    var idx = deck.length - 1;
    var minPreferred = spicePreference(state.settings);
    if (minPreferred > 0 && rng() < 0.65) {
      for (var k = deck.length - 1; k >= 0; k--) {
        if (CARD_BY_ID[deck[k]].hot >= minPreferred) { idx = k; break; }
      }
    }
    var id = deck.splice(idx, 1)[0];
    state.decks[type] = deck;
    state.recent.push(id);
    if (state.recent.length > RECENT_SIZE) state.recent.shift();
    return CARD_BY_ID[id];
  }

  function pickCastigo(state, n, rng) {
    var pool = DATA.castigos.filter(function (c) {
      if (n <= 1) return c.nivel === 1;
      if (n >= 3) return c.nivel === 2;
      return true;
    });
    var fresh = pool.filter(function (c) { return state.recentCastigos.indexOf(c.id) === -1; });
    if (!fresh.length) fresh = pool;
    var castigo = fresh[pickIndex(fresh.length, rng)];
    state.recentCastigos.push(castigo.id);
    if (state.recentCastigos.length > 8) state.recentCastigos.shift();
    return castigo.text;
  }

  function pickOther(state, pId, rng) {
    var others = state.players.filter(function (p) { return p.id !== pId; });
    if (!others.length) return null;
    return others[pickIndex(others.length, rng)].id;
  }

  function makeCard(state, type, pId, rng) {
    var card = drawFromDeck(state, type, rng);
    var needsP2 = type === 'duelo' || card.text.indexOf('{p2}') !== -1;
    var n = card.n || TYPES[type].n;
    var current = {
      kind: 'card',
      cardId: card.id,
      type: type,
      pId: pId,
      p2Id: needsP2 ? pickOther(state, pId, rng) : null,
      n: n,
      castigo: pickCastigo(state, n, rng),
      resolved: false,
      outcome: null
    };
    if (type === 'regla') {
      state.rules.push({
        text: fillText(state, card.text, current.pId, current.p2Id),
        // +1 porque la propia carta de la regla no cuenta: dura «dura» cartas más.
        left: (card.dura || 6) + 1,
        n: n,
        castigo: current.castigo,
        fromCard: state.cardCount
      });
      while (state.rules.length > MAX_RULES) state.rules.shift();
    }
    return current;
  }

  function advance(state) {
    if (!state.current) return;
    state.turn = (state.turn + 1) % state.players.length;
    state.rules = state.rules
      .map(function (r) { return Object.assign({}, r, { left: r.left - 1 }); })
      .filter(function (r) { return r.left > 0; });
  }

  function drawNext(state, rng) {
    rng = rng || Math.random;
    advance(state);
    if (state.turn >= state.players.length) state.turn = 0;
    var player = state.players[state.turn];
    var types = availableTypes(state);
    var mode = getMode(state.settings.mode);
    state.cardCount++;

    if (mode.choice) {
      var options = types
        .map(function (t) { return t.key; })
        .filter(function (t) { return t === 'pregunta' || t === 'reto'; });
      if (options.length) {
        state.current = { kind: 'choice', pId: player.id, options: options };
        return state.current;
      }
    }
    state.current = makeCard(state, pickWeighted(types, rng), player.id, rng);
    return state.current;
  }

  function choose(state, type, rng) {
    rng = rng || Math.random;
    var cur = state.current;
    if (!cur || cur.kind !== 'choice' || cur.options.indexOf(type) === -1) return null;
    state.current = makeCard(state, type, cur.pId, rng);
    return state.current;
  }

  /* ---------- resolver ---------- */

  function charge(player, n) {
    player.stats.pagos++;
    if (player.drinks) player.stats.tragos += n;
    else player.stats.castigos++;
  }

  /*
   * outcome:
   *   cartas personales: 'hecho' | 'paso' | 'comodin'
   *   duelos:            { winner: idDelGanador }
   *   cartas de grupo:   'ok'
   * Devuelve true si se ha aplicado.
   */
  function resolve(state, outcome) {
    var cur = state.current;
    if (!cur || cur.kind !== 'card' || cur.resolved) return false;
    var target = TYPES[cur.type].target;
    var player = findPlayer(state, cur.pId);

    if (target === 'single') {
      if (!player) return false;
      if (outcome === 'hecho') {
        player.stats.hechos++;
        cur.outcome = { kind: 'hecho' };
      } else if (outcome === 'paso') {
        charge(player, cur.n);
        cur.outcome = { kind: 'paso', payerId: player.id };
      } else if (outcome === 'comodin') {
        if (player.comodines <= 0) return false;
        player.comodines--;
        player.stats.comodines++;
        cur.outcome = { kind: 'comodin' };
      } else {
        return false;
      }
    } else if (target === 'duel') {
      var winnerId = outcome && outcome.winner;
      if (winnerId !== cur.pId && winnerId !== cur.p2Id) return false;
      var loserId = winnerId === cur.pId ? cur.p2Id : cur.pId;
      var winner = findPlayer(state, winnerId);
      var loser = findPlayer(state, loserId);
      if (!winner || !loser) return false;
      winner.stats.duelos++;
      charge(loser, cur.n);
      cur.outcome = { kind: 'duelo', winnerId: winnerId, payerId: loserId };
    } else {
      if (outcome !== 'ok') return false;
      cur.outcome = { kind: 'ok' };
    }
    cur.resolved = true;
    return true;
  }

  /* ---------- textos ---------- */

  function nameOf(state, id) {
    var p = findPlayer(state, id);
    return p ? p.name : 'alguien';
  }

  /* Parte un texto con {p}/{p2} en trozos para pintar los nombres aparte. */
  function segments(state, text, pId, p2Id) {
    var out = [];
    var re = /\{(p2|p)\}/g;
    var last = 0;
    var m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) });
      out.push({ kind: 'name', value: nameOf(state, m[1] === 'p' ? pId : p2Id) });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
    return out;
  }

  function fillText(state, text, pId, p2Id) {
    return segments(state, text, pId, p2Id).map(function (s) { return s.value; }).join('');
  }

  /* Qué significa «pagar» para quien no bebe alcohol, según los ajustes. */
  function altText(settings, n, castigo) {
    if (settings.alt === 'sorbos') return sorbos(n) + ' de su bebida';
    if (settings.alt === 'elige') return sorbos(n) + ' de su bebida o este mini-reto: ' + castigo;
    return castigo;
  }

  /* Penalización concreta para una persona. */
  function penaltyFor(state, playerId, n, castigo) {
    var p = findPlayer(state, playerId);
    if (!p || p.drinks) return { drinks: true, text: 'Bebe ' + tragos(n) + '.' };
    if (state.settings.alt === 'sorbos') return { drinks: false, text: 'Bebe ' + sorbos(n) + ' de tu bebida.' };
    if (state.settings.alt === 'elige') {
      return { drinks: false, text: 'Elige: ' + sorbos(n) + ' de tu bebida o este mini-reto: ' + castigo };
    }
    return { drinks: false, text: castigo };
  }

  /* Línea de «qué es pagar» para cartas de grupo. */
  function groupPenalty(state, n, castigo) {
    var anyDrinker = state.players.some(function (p) { return p.drinks; });
    var anySober = state.players.some(function (p) { return !p.drinks; });
    return {
      drink: anyDrinker ? tragos(n) : null,
      alt: anySober ? altText(state.settings, n, castigo) : null
    };
  }

  /* Todo lo que la interfaz necesita para pintar la carta actual. */
  function view(state) {
    var cur = state.current;
    if (!cur) return null;
    var player = findPlayer(state, cur.pId);
    if (cur.kind === 'choice') {
      return { kind: 'choice', player: player, options: cur.options.slice() };
    }
    var card = CARD_BY_ID[cur.cardId];
    var info = TYPES[cur.type];
    var v = {
      kind: 'card',
      type: cur.type,
      label: info.label,
      target: info.target,
      player: player,
      p2: cur.p2Id ? findPlayer(state, cur.p2Id) : null,
      segments: segments(state, card.text, cur.pId, cur.p2Id),
      hint: cur.type === 'regla'
        ? 'Dura ' + card.dura + ' cartas. ' + info.hint
        : fillText(state, info.hint, cur.pId, cur.p2Id),
      n: cur.n,
      todos: !!card.todos,
      hot: card.hot,
      resolved: cur.resolved,
      outcome: cur.outcome,
      comodines: player ? player.comodines : 0
    };
    if (info.target === 'single') {
      v.penalty = penaltyFor(state, cur.pId, cur.n, cur.castigo);
    } else if (info.target === 'duel') {
      v.penalties = [cur.pId, cur.p2Id].map(function (id) {
        return { player: findPlayer(state, id), penalty: penaltyFor(state, id, cur.n, cur.castigo) };
      });
    } else if (!card.todos) {
      v.group = groupPenalty(state, cur.n, cur.castigo);
    }
    if (cur.outcome && cur.outcome.payerId) {
      v.payer = findPlayer(state, cur.outcome.payerId);
      v.payerPenalty = penaltyFor(state, cur.outcome.payerId, cur.n, cur.castigo);
    }
    return v;
  }

  /* Reglas activas que no son la carta que se está mostrando. */
  function activeRules(state) {
    return state.rules.filter(function (r) { return r.fromCard !== state.cardCount; }).map(function (r) {
      return {
        text: r.text,
        left: r.left,
        group: groupPenalty(state, r.n, r.castigo)
      };
    });
  }

  /* ---------- jugadores durante la partida ---------- */

  function addPlayer(state, name, drinks) {
    var clean = cleanName(name);
    if (!clean) throw new Error('Escribe un nombre.');
    if (state.players.length >= MAX_PLAYERS) throw new Error('Como máximo pueden jugar ' + MAX_PLAYERS + ' personas.');
    var key = clean.toLocaleLowerCase('es');
    if (state.players.some(function (p) { return p.name.toLocaleLowerCase('es') === key; })) {
      throw new Error('Ya hay alguien que se llama «' + clean + '».');
    }
    var player = {
      id: 'j' + state.nextId++,
      name: clean,
      drinks: drinks !== false,
      comodines: state.settings.comodines,
      stats: newStats()
    };
    state.players.push(player);
    return player;
  }

  /* Devuelve true si hay que robar carta nueva (la actual era de esa persona). */
  function removePlayer(state, id) {
    var idx = -1;
    state.players.forEach(function (p, i) { if (p.id === id) idx = i; });
    if (idx === -1) return false;
    if (state.players.length <= MIN_PLAYERS) throw new Error('Hacen falta al menos ' + MIN_PLAYERS + ' personas.');
    state.players.splice(idx, 1);
    if (idx < state.turn) state.turn--;
    if (state.turn >= state.players.length) state.turn = 0;
    var cur = state.current;
    if (cur && (cur.pId === id || cur.p2Id === id)) {
      state.current = null;
      return true;
    }
    return false;
  }

  function setDrinks(state, id, drinks) {
    var p = findPlayer(state, id);
    if (p) p.drinks = !!drinks;
    return p;
  }

  function updateSettings(state, partial, rng) {
    var before = state.settings;
    var next = normalizeSettings(partial, before);
    state.settings = next;
    if (next.mode !== before.mode || next.hot !== before.hot) {
      rebuildDecks(state, rng || Math.random);
      var cur = state.current;
      // Si la carta en pantalla ya no encaja (p. ej. se baja el picante), se cambia.
      if (cur && cur.kind === 'card' && !cur.resolved && eligibleIds(cur.type, next).indexOf(cur.cardId) === -1) {
        return true;
      }
    }
    return false;
  }

  /* Cambia la carta en pantalla por otra, sin pasar el turno. */
  function redraw(state, rng) {
    rng = rng || Math.random;
    var cur = state.current;
    if (!cur) return drawNext(state, rng);
    var pId = cur.pId;
    if (cur.kind === 'card' && cur.type === 'regla') {
      state.rules = state.rules.filter(function (r) { return r.fromCard !== state.cardCount; });
    }
    var types = availableTypes(state);
    var mode = getMode(state.settings.mode);
    if (mode.choice) {
      var options = types.map(function (t) { return t.key; })
        .filter(function (t) { return t === 'pregunta' || t === 'reto'; });
      if (options.length) {
        state.current = { kind: 'choice', pId: pId, options: options };
        return state.current;
      }
    }
    state.current = makeCard(state, pickWeighted(types, rng), pId, rng);
    return state.current;
  }

  /* ---------- final ---------- */

  var AWARDS = [
    { key: 'hechos', title: 'Sin miedo', desc: 'Más verdades y retos cumplidos' },
    { key: 'duelos', title: 'Imbatible', desc: 'Más duelos ganados' },
    { key: 'pagos', title: 'Siempre paga', desc: 'Más veces pagando en cartas personales y duelos' },
    { key: 'comodines', title: 'As en la manga', desc: 'Más comodines usados' }
  ];

  function awards(state) {
    return AWARDS.map(function (a) {
      var max = 0;
      state.players.forEach(function (p) { max = Math.max(max, p.stats[a.key]); });
      if (max === 0) return null;
      return {
        title: a.title,
        desc: a.desc,
        value: max,
        names: state.players.filter(function (p) { return p.stats[a.key] === max; }).map(function (p) { return p.name; })
      };
    }).filter(Boolean);
  }

  /* ---------- guardar / cargar ---------- */

  function restore(raw) {
    try {
      var s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!s || s.version !== VERSION || !Array.isArray(s.players) || s.players.length < MIN_PLAYERS) return null;
      s.settings = normalizeSettings(s.settings);
      s.players.forEach(function (p) {
        p.name = cleanName(p.name) || 'Sin nombre';
        p.drinks = p.drinks !== false;
        p.comodines = clampInt(p.comodines, 0, 5, 0);
        p.stats = Object.assign(newStats(), p.stats || {});
      });
      s.turn = clampInt(s.turn, 0, s.players.length - 1, 0);
      s.cardCount = clampInt(s.cardCount, 0, 1e9, 0);
      s.nextId = Math.max(clampInt(s.nextId, 1, 1e9, 1), s.players.length + 1);
      s.decks = s.decks && typeof s.decks === 'object' ? s.decks : {};
      Object.keys(TYPES).forEach(function (t) { if (!Array.isArray(s.decks[t])) s.decks[t] = []; });
      s.recent = Array.isArray(s.recent) ? s.recent : [];
      s.recentCastigos = Array.isArray(s.recentCastigos) ? s.recentCastigos : [];
      s.rules = Array.isArray(s.rules) ? s.rules : [];
      var cur = s.current;
      if (cur) {
        var valid = cur.kind === 'choice'
          ? findPlayer(s, cur.pId) && Array.isArray(cur.options)
          : cur.kind === 'card' && CARD_BY_ID[cur.cardId] && findPlayer(s, cur.pId) &&
            (!cur.p2Id || findPlayer(s, cur.p2Id));
        if (!valid) s.current = null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  var api = {
    VERSION: VERSION,
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    MAX_NAME: MAX_NAME,
    TYPES: TYPES,
    MODES: MODES,
    HOT_LEVELS: HOT_LEVELS,
    MAX_HOT: MAX_HOT,
    ALT_MODES: ALT_MODES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DATA: DATA,
    getMode: getMode,
    hotRange: hotRange,
    spicePreference: spicePreference,
    eligibleIds: eligibleIds,
    validatePlayers: validatePlayers,
    normalizeSettings: normalizeSettings,
    createGame: createGame,
    availableTypes: availableTypes,
    drawNext: drawNext,
    redraw: redraw,
    choose: choose,
    resolve: resolve,
    segments: segments,
    fillText: fillText,
    penaltyFor: penaltyFor,
    groupPenalty: groupPenalty,
    view: view,
    activeRules: activeRules,
    addPlayer: addPlayer,
    removePlayer: removePlayer,
    setDrinks: setDrinks,
    updateSettings: updateSettings,
    awards: awards,
    restore: restore,
    tragos: tragos,
    sorbos: sorbos
  };

  if (isNode) module.exports = api;
  else root.PreviaEngine = api;
})(typeof window !== 'undefined' ? window : this);
