'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../js/cards.js');
const E = require('../js/engine.js');

const PLACEHOLDER = /\{([^}]*)\}/g;

test('cada carta tiene id único, tipo conocido y picante válido', () => {
  const ids = new Set();
  for (const c of DATA.cards) {
    assert.ok(!ids.has(c.id), `id repetido: ${c.id}`);
    ids.add(c.id);
    assert.ok(E.TYPES[c.type], `tipo desconocido en ${c.id}`);
    assert.ok([0, 1, 2, 3].includes(c.hot), `picante inválido en ${c.id}`);
    assert.equal(typeof c.text, 'string');
    assert.ok(c.text.length > 3, `texto vacío en ${c.id}`);
  }
});

test('los textos solo usan {p} y {p2} y no tienen errores de formato', () => {
  for (const c of [...DATA.cards, ...DATA.castigos]) {
    for (const m of c.text.matchAll(PLACEHOLDER)) {
      assert.ok(m[1] === 'p' || m[1] === 'p2', `marcador raro {${m[1]}} en ${c.id}`);
    }
    assert.ok(!/ {2}/.test(c.text), `doble espacio en ${c.id}`);
    assert.equal(c.text, c.text.trim(), `espacios sobrantes en ${c.id}`);
    assert.ok(!/ [,.;:?!]/.test(c.text), `espacio antes de puntuación en ${c.id}`);
    assert.equal((c.text.match(/«/g) || []).length, (c.text.match(/»/g) || []).length, `comillas sin cerrar en ${c.id}`);
    assert.equal((c.text.match(/¿/g) || []).length, (c.text.match(/\?/g) || []).length, `interrogación sin pareja en ${c.id}`);
    if (c.type !== 'categoria') assert.match(c.text, /[.?!»…)]$/, `falta puntuación final en ${c.id}`);
  }
});

test('cada tipo de carta cumple su formato', () => {
  for (const c of DATA.cards) {
    if (c.type === 'pregunta' || c.type === 'reto') assert.ok(c.text.startsWith('{p}'), `${c.id} debe empezar por {p}`);
    if (c.type === 'duelo') assert.ok(c.text.startsWith('{p} contra {p2}'), `${c.id} debe ser {p} contra {p2}`);
    if (c.type === 'yonunca') assert.ok(c.text.startsWith('Yo nunca '), `${c.id} debe empezar por «Yo nunca»`);
    if (c.type === 'probable') assert.ok(c.text.startsWith('¿Quién es más probable que '), c.id);
    if (c.type === 'prefieres') assert.match(c.text, /^¿Prefieres .+ o .+\?$/, `${c.id} debe ser «¿Prefieres A o B?»`);
    if (c.type === 'regla') assert.ok(c.dura >= 3 && c.dura <= 12, `${c.id} necesita una duración`);
    if (c.type === 'categoria') assert.ok(!c.text.includes('{'), c.id);
    if (c.min !== undefined) assert.ok(c.min >= 3 && c.min <= 20, c.id);
  }
});

test('no hay textos repetidos', () => {
  const seen = new Map();
  for (const c of DATA.cards) {
    const key = c.text.toLowerCase();
    assert.ok(!seen.has(key), `${c.id} repite a ${seen.get(key)}`);
    seen.set(key, c.id);
  }
});

test('cada nivel de picante tiene cartas de sobra', () => {
  for (const hot of [1, 2, 3]) {
    const n = DATA.cards.filter((c) => c.hot === hot).length;
    assert.ok(n >= 40, `solo hay ${n} cartas de picante ${hot}`);
  }
});

test('hay mini-retos de los dos niveles y sin repetir', () => {
  assert.ok(DATA.castigos.filter((c) => c.nivel === 1).length >= 8);
  assert.ok(DATA.castigos.filter((c) => c.nivel === 2).length >= 8);
  assert.equal(new Set(DATA.castigos.map((c) => c.text)).size, DATA.castigos.length);
});

test('todos los modos tienen cartas suficientes con cualquier nivel de picante', () => {
  for (const mode of E.MODES) {
    for (const hot of [0, 1, 2, 3]) {
      for (const players of [2, 3, 8]) {
        const settings = E.normalizeSettings({ mode: mode.id, hot });
        let total = 0;
        for (const type of Object.keys(mode.weights)) {
          if ((E.TYPES[type].minPlayers || 2) > players) continue;
          total += E.eligibleIds(type, settings, players).length;
        }
        if (mode.minPlayers && players < mode.minPlayers) continue; // usa el modo de reserva
        assert.ok(total >= 20, `${mode.id} con picante ${hot} y ${players} personas solo tiene ${total} cartas`);
      }
    }
  }
});

test('con picante 0 no sale ninguna carta picante y el modo Picante solo da picantes', () => {
  const none = E.normalizeSettings({ mode: 'mezcla', hot: 0 });
  for (const type of Object.keys(E.TYPES)) {
    for (const id of E.eligibleIds(type, none)) {
      assert.equal(DATA.cards.find((c) => c.id === id).hot, 0);
    }
  }
  const spicy = E.normalizeSettings({ mode: 'picante', hot: 0 });
  for (const type of Object.keys(E.TYPES)) {
    for (const id of E.eligibleIds(type, spicy)) {
      assert.ok(DATA.cards.find((c) => c.id === id).hot >= 2);
    }
  }
  const ice = E.normalizeSettings({ mode: 'rompehielos', hot: 3 });
  for (const type of Object.keys(E.TYPES)) {
    for (const id of E.eligibleIds(type, ice)) {
      assert.equal(DATA.cards.find((c) => c.id === id).hot, 0);
    }
  }
});
