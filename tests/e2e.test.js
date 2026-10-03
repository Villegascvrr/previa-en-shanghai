'use strict';
/*
 * Prueba de punta a punta en un navegador real (Chromium vía Playwright).
 * Ejecuta: npm run test:e2e   (necesita el paquete «playwright» instalado)
 * Se salta sola si Playwright no está disponible.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let playwright = null;
try { playwright = require('playwright'); } catch (e) { /* sin playwright */ }

const PAGE = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

async function launch() {
  const options = {};
  if (process.env.CHROMIUM_PATH) options.executablePath = process.env.CHROMIUM_PATH;
  return playwright.chromium.launch(options);
}

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true });
  // Sin fuentes externas: así el test funciona sin red.
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_FAILED/.test(msg.text())) errors.push(msg.text());
  });
  await page.goto(PAGE);
  return { page, errors, context };
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test('partida completa desde el móvil', { skip: !playwright && 'playwright no está instalado' }, async () => {
  const browser = await launch();
  try {
    const { page, errors } = await openPage(browser);

    // Preparación: nombres de ejemplo, se sustituyen al añadir el primero.
    await page.getByRole('heading', { name: /Previa/ }).waitFor();
    assert.equal(await page.locator('#player-list .player').count(), 3);
    assert.ok(await noHorizontalScroll(page), 'la preparación no se sale de la pantalla');

    await page.fill('#add-name', 'Cris');
    await page.press('#add-name', 'Enter');
    assert.equal(await page.locator('#player-list .player').count(), 1, 'los ejemplos se van al añadir a alguien');
    await page.click('#start-btn');
    await page.getByText('Hacen falta al menos 2 personas').waitFor();

    for (const name of ['Sara', 'Leo', 'Mei']) {
      await page.fill('#add-name', name);
      await page.click('#add-form button[type=submit]');
    }
    await page.fill('#add-name', 'sara');
    await page.press('#add-name', 'Enter');
    await page.getByText('Ya hay alguien que se llama').waitFor();

    // Leo no bebe.
    await page.locator('#player-list .player', { has: page.locator('input[value="Leo"]') }).locator('.toggle').click();
    assert.equal(await page.locator('#player-list .toggle.is-sober').count(), 1);

    await page.click('#mode-mezcla');
    await page.click('#set-hot-2');
    await page.click('#set-alt-castigo');
    await page.click('#start-btn');

    // Partida: jugar muchas cartas pulsando lo que haya.
    await page.locator('#screen-game').waitFor();
    const seenTypes = new Set();
    for (let i = 0; i < 80; i++) {
      const type = await page.getAttribute('#card', 'data-type');
      seenTypes.add(type);
      const text = await page.textContent('#card');
      assert.ok(!/[{}]/.test(text), `marcadores sin rellenar en: ${text}`);
      assert.ok(text.trim().length > 10);

      const buttons = page.locator('#actions .action-row button:not([disabled])');
      const count = await buttons.count();
      assert.ok(count > 0, 'siempre hay algo que pulsar');
      await buttons.nth(i % count).click();
      const next = page.locator('#next-btn');
      if (await next.count()) await next.click();
      if (i % 20 === 0) assert.ok(await noHorizontalScroll(page), 'la carta no se sale de la pantalla');
    }
    assert.ok(seenTypes.size >= 5, 'salen tipos de carta variados: ' + [...seenTypes].join(', '));

    // Marcador: alguien deja de beber y se une otra persona.
    await page.click('#open-sheet');
    await page.locator('#sheet').waitFor({ state: 'visible' });
    await page.locator('#sheet-players .player').first().locator('.toggle').click();
    await page.fill('#sheet-add-name', 'Nora');
    await page.press('#sheet-add-name', 'Enter');
    assert.equal(await page.locator('#sheet-players .player').count(), 5);
    await page.click('#game-hot-0');
    assert.ok(await noHorizontalScroll(page));
    await page.locator('#sheet .sheet-head [data-close]').click();
    await page.locator('#sheet').waitFor({ state: 'hidden' });

    // Recargar la página mantiene la partida.
    const before = await page.textContent('#g-count');
    await page.reload();
    await page.click('#resume-btn');
    assert.equal(await page.textContent('#g-count'), before);

    // Terminar pide confirmación.
    await page.click('#open-sheet');
    await page.click('#end-btn');
    assert.ok(await page.locator('#screen-game').isVisible(), 'el primer toque no termina');
    await page.click('#end-btn');
    await page.locator('#screen-end').waitFor();
    assert.ok(await page.locator('#awards li').count() > 0);
    assert.equal(await page.locator('#end-table tr').count(), 5);
    assert.ok(await noHorizontalScroll(page));

    await page.click('#rematch-btn');
    await page.locator('#screen-game').waitFor();
    assert.equal(await page.textContent('#g-count'), 'Carta 1');

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Verdad o reto y modo con pocas personas', { skip: !playwright && 'playwright no está instalado' }, async () => {
  const browser = await launch();
  try {
    const { page, errors } = await openPage(browser);
    // Dos personas: «¿Quién es más probable?» avisa de que necesita más gente.
    await page.locator('#player-list .icon-btn').last().click();
    await page.locator('#player-list .icon-btn').last().click();
    assert.equal(await page.locator('#player-list .player').count(), 2);
    await page.getByText('Necesita 3 personas o más').waitFor();

    await page.click('#mode-verdadoreto');
    await page.click('#start-btn');
    for (let i = 0; i < 20; i++) {
      assert.equal(await page.getAttribute('#card', 'data-type'), 'choice');
      await page.getByRole('button', { name: i % 2 ? 'Reto' : 'Verdad' }).click();
      const type = await page.getAttribute('#card', 'data-type');
      assert.equal(type, i % 2 ? 'reto' : 'pregunta');
      await page.getByRole('button', { name: 'Paso, pago' }).click();
      await page.getByText('Paga', { exact: true }).waitFor();
      await page.click('#next-btn');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
