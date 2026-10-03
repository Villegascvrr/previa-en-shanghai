'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

/* Generador pseudoaleatorio con semilla para que los tests sean reproducibles. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYERS = [
  { name: 'Ana', drinks: true },
  { name: 'Luis', drinks: false },
  { name: 'Eva', drinks: true },
  { name: 'Wei', drinks: false }
];

function game(settings, players = PLAYERS, seed = 1) {
  return E.createGame({ players, settings }, seeded(seed));
}

function cardOf(id) { return E.DATA.cards.find((c) => c.id === id); }

test('createGame valida a las personas', () => {
  assert.throws(() => E.createGame({ players: [{ name: 'Solo' }] }), /al menos 2/);
  assert.throws(() => E.createGame({ players: [{ name: 'Ana' }, { name: ' ana ' }] }), /dos personas/);
  assert.throws(() => E.createGame({ players: [{ name: '  ' }, { name: 'Ana' }] }), /al menos 2/);
  const many = Array.from({ length: 21 }, (_, i) => ({ name: 'P' + i }));
  assert.throws(() => E.createGame({ players: many }), /máximo/);

  const g = E.createGame({ players: [{ name: '  Ana   María ' }, { name: 'Luis', drinks: false }] });
  assert.equal(g.players[0].name, 'Ana María');
  assert.equal(g.players[0].drinks, true);
  assert.equal(g.players[1].drinks, false);
  assert.equal(g.players[0].comodines, E.DEFAULT_SETTINGS.comodines);
});

test('los ajustes raros se corrigen', () => {
  const s = E.normalizeSettings({ mode: 'inventado', hot: 9, alt: 'nada', comodines: -3 });
  assert.equal(s.mode, 'mezcla');
  assert.equal(s.hot, 2);
  assert.equal(s.alt, 'castigo');
  assert.equal(s.comodines, 0);
});

test('miles de cartas seguidas en todos los modos sin romper nada', () => {
  let seed = 10;
  for (const mode of E.MODES) {
    for (const hot of [0, 1, 2]) {
      for (const count of [2, 3, 4]) {
        const rng = seeded(seed++);
        const players = PLAYERS.slice(0, count);
        const g = E.createGame({ players, settings: { mode: mode.id, hot } }, rng);
        const range = E.hotRange(g.settings);
        let lastTurn = -1;
        for (let i = 0; i < 150; i++) {
          let cur = E.drawNext(g, rng);
          assert.equal(g.cardCount, i + 1);
          assert.notEqual(g.turn, lastTurn, 'el turno tiene que rotar');
          lastTurn = g.turn;
          assert.equal(cur.pId, g.players[g.turn].id);

          if (cur.kind === 'choice') {
            assert.ok(mode.choice);
            const pick = cur.options[Math.floor(rng() * cur.options.length)];
            cur = E.choose(g, pick, rng);
            assert.equal(cur.type, pick);
          }
          const card = cardOf(cur.cardId);
          assert.ok(card, 'la carta existe');
          assert.ok(card.hot >= range[0] && card.hot <= range[1], `picante fuera de rango en ${card.id}`);
          assert.ok(!card.min || count >= card.min, `${card.id} necesita más gente`);
          assert.ok((E.TYPES[cur.type].minPlayers || 2) <= count, `${cur.type} necesita más gente`);
          if (cur.p2Id) assert.notEqual(cur.p2Id, cur.pId);
          if (cur.type === 'duelo') assert.ok(cur.p2Id);

          const v = E.view(g);
          const text = v.segments.map((s) => s.value).join('');
          assert.ok(!/[{}]/.test(text), `quedan marcadores en «${text}»`);
          assert.ok(v.segments.filter((x) => x.kind === 'name').every((x) => g.players.some((p) => p.name === x.value)), 'todos los nombres existen');
          assert.ok(!/[{}]/.test(v.hint));
          assert.ok(g.rules.length <= 3);

          if (v.target === 'single') {
            assert.ok(E.resolve(g, ['hecho', 'paso', 'comodin'][i % 3]) || i % 3 === 2);
          } else if (v.target === 'duel') {
            assert.ok(E.resolve(g, { winner: rng() < 0.5 ? cur.pId : cur.p2Id }));
          } else {
            assert.ok(E.resolve(g, 'ok'));
          }
          // Debe sobrevivir a guardarse y cargarse en cada paso.
          const back = E.restore(JSON.stringify(g));
          assert.deepEqual(back, JSON.parse(JSON.stringify(g)));
        }
      }
    }
  }
});

test('no se repite carta mientras quedan otras en el mazo', () => {
  const rng = seeded(3);
  const g = game({ mode: 'yonunca', hot: 2 }, PLAYERS, 3);
  const total = E.eligibleIds('yonunca', g.settings, 4).length;
  const seen = new Set();
  for (let i = 0; i < total; i++) {
    const cur = E.drawNext(g, rng);
    assert.ok(!seen.has(cur.cardId), `repetida ${cur.cardId} en la carta ${i + 1}`);
    seen.add(cur.cardId);
  }
  // Al barajar de nuevo, las últimas no salen justo al principio.
  const recent = g.recent.slice(-10);
  const nextCard = E.drawNext(g, rng);
  assert.ok(!recent.includes(nextCard.cardId));
});

test('¿Quién es más probable? con dos personas pasa a Todo un poco', () => {
  const rng = seeded(5);
  const g = game({ mode: 'probable' }, PLAYERS.slice(0, 2), 5);
  for (let i = 0; i < 40; i++) {
    const cur = E.drawNext(g, rng);
    assert.notEqual(cur.type, 'probable');
  }
});

test('Verdad o reto pide elegir y luego da la carta del tipo elegido', () => {
  const rng = seeded(7);
  const g = game({ mode: 'verdadoreto' }, PLAYERS, 7);
  const cur = E.drawNext(g, rng);
  assert.equal(cur.kind, 'choice');
  assert.deepEqual(cur.options.sort(), ['pregunta', 'reto']);
  assert.equal(E.choose(g, 'duelo', rng), null);
  assert.equal(E.resolve(g, 'hecho'), false, 'no se puede resolver una elección');
  const card = E.choose(g, 'reto', rng);
  assert.equal(card.type, 'reto');
  assert.equal(card.pId, cur.pId);
  assert.equal(E.choose(g, 'reto', rng), null, 'no se puede elegir dos veces');
});

function forceCard(g, type, pIndex = 0, rng = seeded(9)) {
  g.turn = pIndex;
  g.current = { kind: 'choice', pId: g.players[pIndex].id, options: [type] };
  return E.choose(g, type, rng);
}

test('pagar en una carta personal suma tragos a quien bebe y mini-retos a quien no', () => {
  const g = game({ mode: 'mezcla' });
  const ana = g.players[0];
  const luis = g.players[1];

  const c1 = forceCard(g, 'reto', 0);
  assert.equal(E.resolve(g, 'paso'), true);
  assert.equal(E.resolve(g, 'paso'), false, 'no se paga dos veces');
  assert.equal(ana.stats.pagos, 1);
  assert.equal(ana.stats.tragos, c1.n);
  assert.equal(ana.stats.castigos, 0);
  assert.equal(E.view(g).payer.id, ana.id);
  assert.match(E.view(g).payerPenalty.text, /^Bebe \d tragos?\.$/);

  forceCard(g, 'pregunta', 1);
  E.resolve(g, 'paso');
  assert.equal(luis.stats.pagos, 1);
  assert.equal(luis.stats.tragos, 0);
  assert.equal(luis.stats.castigos, 1);
  assert.equal(E.view(g).payerPenalty.drinks, false);

  forceCard(g, 'reto', 0);
  E.resolve(g, 'hecho');
  assert.equal(ana.stats.hechos, 1);
  assert.equal(E.view(g).payer, undefined);
});

test('los comodines se gastan y no bajan de cero', () => {
  const g = game({ comodines: 1 });
  const ana = g.players[0];
  forceCard(g, 'reto', 0);
  assert.equal(E.resolve(g, 'comodin'), true);
  assert.equal(ana.comodines, 0);
  assert.equal(ana.stats.comodines, 1);
  forceCard(g, 'reto', 0);
  assert.equal(E.resolve(g, 'comodin'), false);
  assert.equal(g.current.resolved, false);
  assert.equal(E.resolve(g, 'cualquiera'), false);
});

test('en un duelo paga quien pierde', () => {
  const g = game({});
  const cur = forceCard(g, 'duelo', 0);
  assert.equal(E.resolve(g, { winner: 'nadie' }), false);
  assert.equal(E.resolve(g, 'ok'), false);
  assert.equal(E.resolve(g, { winner: cur.p2Id }), true);
  const winner = g.players.find((p) => p.id === cur.p2Id);
  const loser = g.players.find((p) => p.id === cur.pId);
  assert.equal(winner.stats.duelos, 1);
  assert.equal(loser.stats.pagos, 1);
  assert.equal(E.view(g).payer.id, loser.id);
});

test('las cartas de grupo explican el pago a quien bebe y a quien no', () => {
  const g = game({ alt: 'sorbos' });
  forceCard(g, 'yonunca', 0);
  const v = E.view(g);
  assert.equal(v.group.drink, '1 trago');
  assert.equal(v.group.alt, '1 sorbo de su bebida');

  const allDrink = game({}, [{ name: 'A' }, { name: 'B' }]);
  forceCard(allDrink, 'yonunca', 0);
  assert.equal(E.view(allDrink).group.alt, null, 'si todo el mundo bebe no se muestra la alternativa');

  const nobody = game({}, [{ name: 'A', drinks: false }, { name: 'B', drinks: false }]);
  forceCard(nobody, 'yonunca', 0);
  assert.equal(E.view(nobody).group.drink, null, 'si nadie bebe no se habla de tragos');
});

test('la alternativa sin alcohol sigue el ajuste elegido', () => {
  const g = game({ alt: 'castigo' });
  const luis = g.players[1].id;
  const castigos = E.DATA.castigos.map((c) => c.text);
  assert.ok(castigos.includes(E.penaltyFor(g, luis, 2, castigos[0]).text));
  E.updateSettings(g, { alt: 'sorbos' });
  assert.equal(E.penaltyFor(g, luis, 2, castigos[0]).text, 'Bebe 2 sorbos de tu bebida.');
  E.updateSettings(g, { alt: 'elige' });
  assert.match(E.penaltyFor(g, luis, 1, castigos[0]).text, /^Elige: 1 sorbo de tu bebida o este mini-reto: /);
  assert.equal(E.penaltyFor(g, g.players[0].id, 3, 'x').text, 'Bebe 3 tragos.');
});

test('los mini-retos se ajustan a lo que cuesta la carta', () => {
  const rng = seeded(11);
  const g = game({});
  const level = (text) => E.DATA.castigos.find((c) => c.text === text).nivel;
  for (let i = 0; i < 200; i++) {
    const cur = E.drawNext(g, rng);
    if (cur.kind !== 'card') continue;
    if (cur.n === 1) assert.equal(level(cur.castigo), 1);
    if (cur.n >= 3) assert.equal(level(cur.castigo), 2);
  }
});

test('las reglas duran lo que dicen y como mucho hay tres', () => {
  const rng = seeded(13);
  const g = game({});
  E.drawNext(g, rng);
  const cur = forceCard(g, 'regla', g.turn, rng);
  g.cardCount++; // forceCard no cuenta carta: la simulamos como robada
  g.rules[g.rules.length - 1].fromCard = g.cardCount;
  const dura = cardOf(cur.cardId).dura;
  assert.equal(E.activeRules(g).length, 0, 'la regla no se repite encima de su propia carta');
  for (let i = 1; i <= dura; i++) {
    E.drawNext(g, rng);
    const rule = g.rules.find((r) => r.text === E.fillText(g, cardOf(cur.cardId).text, cur.pId, cur.p2Id));
    assert.ok(rule, `la regla sigue en la carta ${i}`);
  }
  E.drawNext(g, rng);
  // Después de «dura» cartas la regla ya no está (salvo que haya salido otra igual).
  assert.ok(g.rules.every((r) => r.left <= dura));

  for (let i = 0; i < 5; i++) forceCard(g, 'regla', 0, rng);
  assert.ok(g.rules.length <= 3);
});

test('cambiar una carta de regla no deja la regla puesta', () => {
  const rng = seeded(17);
  const g = game({});
  for (let i = 0; i < 300; i++) {
    const cur = E.drawNext(g, rng);
    if (cur.type === 'regla') {
      const before = g.rules.length;
      E.redraw(g, rng);
      const added = g.current.type === 'regla' ? 1 : 0;
      assert.equal(g.rules.length, before - 1 + added);
      return;
    }
  }
  assert.fail('no salió ninguna regla');
});

test('añadir y quitar personas durante la partida', () => {
  const rng = seeded(19);
  const g = game({}, PLAYERS);
  assert.throws(() => E.addPlayer(g, 'ana'), /Ya hay/);
  assert.throws(() => E.addPlayer(g, '   '), /nombre/);
  const nuevo = E.addPlayer(g, 'Nuria', false);
  assert.equal(g.players.length, 5);
  assert.equal(nuevo.drinks, false);
  assert.equal(nuevo.comodines, g.settings.comodines);

  // Quitar a alguien antes del turno actual mantiene a quien le toca.
  g.turn = 2;
  E.drawNext(g, rng); // ahora le toca al índice 3
  const turnId = g.players[g.turn].id;
  E.removePlayer(g, g.players[0].id);
  assert.equal(g.players[g.turn].id, turnId);

  // Quitar a quien está en la carta obliga a robar otra.
  const cur = g.current;
  assert.equal(E.removePlayer(g, cur.pId), true);
  assert.equal(g.current, null);
  const next = E.drawNext(g, rng);
  assert.ok(g.players.some((p) => p.id === next.pId));

  while (g.players.length > 2) E.removePlayer(g, g.players[g.players.length - 1].id);
  assert.throws(() => E.removePlayer(g, g.players[0].id), /al menos 2/);
  assert.ok(g.turn < g.players.length);
});

test('cambiar si alguien bebe cambia su forma de pagar al momento', () => {
  const g = game({});
  const ana = g.players[0];
  forceCard(g, 'reto', 0);
  assert.equal(E.view(g).penalty.drinks, true);
  E.setDrinks(g, ana.id, false);
  assert.equal(E.view(g).penalty.drinks, false);
});

test('bajar el picante en mitad de la partida pide cambiar la carta picante', () => {
  const rng = seeded(23);
  const g = game({ mode: 'picante', hot: 2 });
  E.drawNext(g, rng);
  assert.ok(cardOf(g.current.cardId).hot >= 1);
  const mustRedraw = E.updateSettings(g, { mode: 'rompehielos' }, rng);
  assert.equal(mustRedraw, true);
  E.redraw(g, rng);
  assert.equal(cardOf(g.current.cardId).hot, 0);
  for (let i = 0; i < 100; i++) {
    E.drawNext(g, rng);
    assert.equal(cardOf(g.current.cardId).hot, 0);
  }
});

test('restore rechaza datos rotos y arregla los incompletos', () => {
  assert.equal(E.restore('esto no es json'), null);
  assert.equal(E.restore(null), null);
  assert.equal(E.restore({ version: 99 }), null);
  assert.equal(E.restore({ version: E.VERSION, players: [] }), null);

  const g = game({});
  E.drawNext(g, seeded(1));
  const broken = JSON.parse(JSON.stringify(g));
  broken.current.cardId = 'no-existe';
  broken.decks = null;
  broken.turn = 50;
  const fixed = E.restore(broken);
  assert.equal(fixed.current, null);
  assert.ok(fixed.turn < fixed.players.length);
  assert.ok(Array.isArray(fixed.decks.reto));
  assert.ok(E.drawNext(fixed, seeded(2)));
});

test('premios finales', () => {
  const g = game({});
  assert.deepEqual(E.awards(g), [], 'sin jugar no hay premios');
  forceCard(g, 'reto', 0); E.resolve(g, 'hecho');
  forceCard(g, 'reto', 1); E.resolve(g, 'hecho');
  forceCard(g, 'reto', 2); E.resolve(g, 'paso');
  const awards = E.awards(g);
  const brave = awards.find((a) => a.title === 'Sin miedo');
  assert.deepEqual(brave.names, ['Ana', 'Luis']);
  assert.equal(brave.value, 1);
  assert.deepEqual(awards.find((a) => a.title === 'Siempre paga').names, ['Eva']);
});

test('los nombres se pintan aparte y nunca se interpretan como HTML', () => {
  const g = E.createGame({ players: [{ name: '<b>Ana</b>' }, { name: 'Luis' }] });
  const segs = E.segments(g, '{p} contra {p2}: hola', g.players[0].id, g.players[1].id);
  assert.deepEqual(segs, [
    { kind: 'name', value: '<b>Ana</b>' },
    { kind: 'text', value: ' contra ' },
    { kind: 'name', value: 'Luis' },
    { kind: 'text', value: ': hola' }
  ]);
});
