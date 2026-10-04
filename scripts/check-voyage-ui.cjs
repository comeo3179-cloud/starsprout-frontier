'use strict';

// Guest-browser UI boundaries. Combat completion fixtures are explicitly
// separated from original-stat reachability in check-voyage-runs.cjs.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2), online = args.includes('--online'), release = online || args.includes('--release');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
assert.ok(version.startsWith('5.'), 'This new verifier must not overwrite 4.0 evidence');
const mode = online ? 'online' : release ? 'release' : 'source', folder = release ? path.join(root, 'release/web') : root;
const origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4195';
const manifest = online ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const filter = args.includes('--case') ? args[args.indexOf('--case') + 1] : '';
const outputFolder = path.join(root, 'reports', 'voyage-ui-' + mode + '-' + version);
fs.mkdirSync(outputFolder, { recursive: true });
const output = path.join(outputFolder, filter ? 'results-' + filter.replace(/[^a-z0-9-]/gi, '_') + '.json' : 'results.json');
const report = { generatedAt: new Date().toISOString(), version, mode, files: {}, browserFiles: {}, cases: [], errors: [],
  note: 'Isolated guest Edge with real source/release assets and native rAF. Explicit damage/position fixtures reach decision and final-result boundaries; they are not playthrough or balance evidence. CDP touch supplies real simultaneous browser contacts. Online directly loads hosted assets without route/fulfill and checks all manifest files and actual JS/CSS/SDK response hashes. No real account login or cloud writes. Viewport emulation is not physical-phone or Safari certification.' };
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
function observe() {
  const q = window.__voyageQA = { events: [], input: {} }; let api;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
    api = value; api.Game = new Proxy(api.Game, { construct(target, args, next) {
      const game = Reflect.construct(target, args, next); q.game = game;
      const update = game.update, drain = game.drainEvents;
      game.update = function(dt, input) { q.input = { ...input }; return update.call(this, dt, input); };
      game.drainEvents = function() { const events = drain.call(this); q.events.push(...events.map(event => ({ ...event }))); return events; };
      return game;
    } });
  } });
  localStorage.setItem('frontier-sound', 'off');
  localStorage.setItem('frontier-secrets-v1', JSON.stringify(['rebound', 'blade-relay', 'bullet-reversal', 'fuse-resonance', 'rail-resonance', 'ice-break']));
}
async function create(browser, name, viewport) {
  const mobile = viewport.width < 1000;
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  if (!online) await context.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', file = path.resolve(folder, name);
    if (!file.startsWith(folder + path.sep)) return route.abort();
    try { const body = fs.readFileSync(file); report.files[name] = crypto.createHash('sha256').update(body).digest('hex'); await route.fulfill({ body, contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(name)] || 'application/octet-stream' }); }
    catch { await route.fulfill({ status: name === 'favicon.ico' ? 204 : 404, body: '' }); }
  });
  await context.addInitScript(observe);
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push({ name, message: error.message }));
  const responses = [], observed = {};
  if (online) page.on('response', response => {
    const url = new URL(response.url()), file = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (url.origin === origin && manifest.files.some(item => item.file === file && /\.(js|css)$/.test(file))) responses.push(response.body().then(body => { observed[file] = crypto.createHash('sha256').update(body).digest('hex'); }));
  });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  if (online && await page.locator('#submitBtn').count()) { assert.match(await page.locator('body').innerText(), /测试域名/); await page.locator('#submitBtn').click(); }
  await page.locator('#voyage-entry').waitFor();
  assert.ok((await page.locator('#screen-content .screen-kicker').textContent()).includes(version));
  assert.ok((await page.locator('.version-label').textContent()).includes(version));
  if (online) {
    await page.waitForFunction(() => window.cloudbase, null, { timeout: 20000 }); await Promise.all(responses);
    Object.assign(report.browserFiles, observed);
    for (const item of manifest.files.filter(item => /\.(js|css)$/.test(item.file))) assert.equal(observed[item.file], item.sha256, 'Actual hosted browser asset: ' + item.file);
  }
  return { page, context, mobile };
}
async function state(page) { return page.evaluate(() => { const q = __voyageQA, g = q.game; return { phase: g.phase, elapsed: g.elapsed, player: structuredClone(g.player), voyage: structuredClone(g.voyage), mode: g.mode, input: q.input, events: q.events.map(event => ({ ...event })), pendingEvents: g.events.map(event => ({ ...event })) }; }); }
async function menu(page) {
  const items = [];
  for (const button of await page.locator('#screen-content button:not(:disabled)').all()) {
    await button.click({ trial: true });
    items.push({ text: (await button.innerText()).replace(/\s+/g, ' ').slice(0, 100), rect: await button.boundingBox() });
  }
  assert.ok(items.length > 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Menus fit viewport horizontally');
  return items;
}
async function start(page, mobile, device = 'afterimage', difficulty = 'normal') {
  if (mobile) { await page.locator('#display-mode-button').tap(); await page.waitForFunction(() => document.fullscreenElement || document.getElementById('game-stage').classList.contains('immersive')); }
  await page.locator('#voyage-entry').click();
  await page.locator('[data-voyage-device="' + device + '"]').click();
  await page.locator('[data-voyage-difficulty="' + difficulty + '"]').click();
  await page.locator('#voyage-seed').fill('731');
  const choices = await menu(page);
  await page.locator('#start-voyage').click();
  await page.waitForFunction(() => __voyageQA.game.mode === 'voyage' && __voyageQA.game.phase === 'playing');
  const current = await state(page);
  assert.equal(current.voyage.devices[0], device); assert.equal(current.voyage.difficulty, difficulty); assert.equal(current.voyage.node, 1);
  return choices;
}
async function reachExitFixture(page) {
  return page.evaluate(() => {
    const g = __voyageQA.game;
    // Boundary fixture, not a natural run: damage and invulnerability prepare
    // the real finite objective; the real exit still requires native E/touch.
    for (let frame = 0; frame < 2000 && !g.voyage.room.objectiveDone && !['won', 'lost'].includes(g.phase); frame++) {
      while (g.phase === 'upgrade') g.chooseUpgrade(g.upgradeChoices[0].id);
      g.player.invulnerable = .3; g.update(.25);
      for (const enemy of [...g.enemies]) { if (g.phase !== 'playing') break; if (enemy.hp > 0) g._damageEnemy(enemy, 1e6); }
    }
    while (g.phase === 'upgrade') g.chooseUpgrade(g.upgradeChoices[0].id);
    if (!g.voyage.room.objectiveDone && g.phase !== 'won') throw new Error('Finite room objective did not complete');
    if (g.phase !== 'won') { g.player.x = g.voyage.room.exit.x; g.player.y = g.voyage.room.exit.y; }
    return { phase: g.phase, node: g.voyage.node, room: structuredClone(g.voyage.room) };
  });
}
async function enterRest(page, mobile) {
  const reached = await reachExitFixture(page); assert.equal(reached.phase, 'playing');
  await page.waitForFunction(() => !document.getElementById('skill-button').closest('#screen-overlay') && __voyageQA.game.phase === 'playing');
  if (mobile) { await page.waitForFunction(() => !document.getElementById('touch-interact').disabled); await page.locator('#touch-interact').tap(); }
  else await page.keyboard.press('KeyE');
  await page.locator('#continue-voyage').waitFor();
  assert.equal((await state(page)).phase, 'voyage-rest');
  const before = (await state(page)).elapsed; await page.waitForTimeout(160);
  assert.equal((await state(page)).elapsed, before, 'Rest freezes native rAF simulation');
  return reached;
}
async function continueRoom(page) {
  await page.locator('[data-voyage-route]').first().click();
  await page.locator('#voyage-keep-device').click();
  await page.locator('#continue-voyage').click();
  // Route continuation may produce an upgrade or central resonance ceremony.
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await page.locator('#continue-voyage-resonance').isVisible()) await page.locator('#continue-voyage-resonance').click();
    else if (await page.locator('[data-upgrade]:visible').count()) await page.locator('[data-upgrade]:visible').first().click();
    else if ((await state(page)).phase === 'playing') return;
    await page.waitForTimeout(30);
  }
  assert.fail('Route continuation did not return to combat');
}
async function run(browser, name, viewport, fn) {
  if (filter && !name.includes(filter)) return;
  let page, context;
  try { const created = await create(browser, name, viewport); ({ page, context } = created); const result = await fn(page, created.mobile, context); assert.deepEqual(report.errors.filter(error => error.name === name), []); report.cases.push({ name, viewport, pass: true, ...result }); console.log('PASS ' + name); }
  catch (error) { if (page) { await page.screenshot({ path: path.join(outputFolder, name + '-failure.png') }).catch(() => {}); (report.failures ||= {})[name] = await state(page).catch(() => null); } report.cases.push({ name, viewport, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
  finally { if (context) await context.close(); save(); }
}
async function verifyHosted(browser) {
  const context = await browser.newContext();
  try { for (const item of manifest.files) { const response = await context.request.get(origin + '/' + item.file + '?voyage-verify=' + Date.now(), { headers: { 'cache-control': 'no-cache' }, timeout: 20000 }); assert.equal(response.status(), 200); const digest = crypto.createHash('sha256').update(await response.body()).digest('hex'); report.files[item.file] = digest; assert.equal(digest, item.sha256, 'Hosted final file: ' + item.file); } report.hostedManifestVerified = true; }
  finally { await context.close(); save(); }
}
async function resolveDecisions(page) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await page.locator('#continue-voyage-resonance').isVisible()) await page.locator('#continue-voyage-resonance').click();
    else if (await page.locator('[data-upgrade]:visible').count()) await page.locator('[data-upgrade]:visible').first().click();
    else if (await page.evaluate(() => __voyageQA.game.phase === 'playing' && document.getElementById('screen-overlay').classList.contains('hidden'))) return;
    await page.waitForTimeout(30);
  }
  assert.fail('A prepared decision did not resume play');
}
async function point(page, selector, id, offset = 0) {
  return page.locator(selector).evaluate((element, options) => {
    const box = element.getBoundingClientRect(), x = box.x + box.width / 2 + options.offset, y = box.y + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (element.disabled || x < 0 || x >= innerWidth || y < 0 || y >= innerHeight || !element.contains(hit)) throw new Error('Touch action is disabled, outside the viewport or obscured: ' + options.selector);
    return { x, y, id: options.id, radiusX: 5, radiusY: 5, force: 1 };
  }, { selector, id, offset });
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    if (online) await verifyHosted(browser);
    await run(browser, 'intro-seed-retry-1440x1000', { width: 1440, height: 1000 }, async page => {
      await page.locator('#voyage-entry').click();
      assert.equal(await page.locator('[data-voyage-device]').count(), 6); assert.equal(await page.locator('[data-voyage-difficulty]').count(), 2);
      await page.locator('[data-voyage-device="afterimage"]').focus(); let seedFocused = false;
      for (let index = 0; index < 14; index++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => document.activeElement?.id === 'voyage-seed')) { seedFocused = true; break; } }
      assert.equal(seedFocused, true, 'Native Tab reaches the seed input');
      const rejected = [];
      for (const value of ['-1', '4294967296', 'text']) {
        await page.locator('#voyage-seed').fill(value); await page.locator('#start-voyage').click();
        const g = await state(page); assert.equal(g.phase, 'ready'); assert.equal(g.voyage, null); rejected.push({ value, message: await page.locator('#voyage-selection').innerText() });
      }
      await page.keyboard.press('Escape'); await page.locator('#voyage-entry').waitFor();
      await page.locator('#voyage-entry').click(); await page.locator('[data-voyage-device="mirror"]').click(); await page.locator('[data-voyage-difficulty="overload"]').click();
      await page.locator('#voyage-seed').fill('0'); await page.locator('#start-voyage').click();
      await page.waitForFunction(() => __voyageQA.game.mode === 'voyage' && __voyageQA.game.phase === 'playing');
      const original = await state(page); assert.equal(original.voyage.seed, 0); assert.equal(original.voyage.difficulty, 'overload'); assert.equal(original.voyage.initialDeviceId, 'mirror');
      await enterRest(page, false); await page.locator('[data-voyage-device="afterimage"]').click(); await page.locator('[data-voyage-slot="0"]').click();
      await page.locator('#continue-voyage').click(); await resolveDecisions(page);
      assert.equal((await state(page)).voyage.devices[0], 'afterimage');
      await page.evaluate(() => { const g = __voyageQA.game; g.player.invulnerable = 0; g._damagePlayer(9999, { kind: 'ui-boundary-fixture', name: 'Prepared defeat' }); });
      await page.locator('#restart-voyage').waitFor(); await page.locator('#restart-voyage').click();
      await page.waitForFunction(() => __voyageQA.game.phase === 'playing' && __voyageQA.game.voyage.node === 1);
      const retried = await state(page); assert.equal(retried.voyage.seed, 0); assert.equal(retried.voyage.difficulty, 'overload'); assert.deepEqual(retried.voyage.devices, ['mirror', null, null]);
      assert.equal(retried.player.hp, 120);
      return { rejected, seedFocused, seedZeroAccepted: true, retryPreservesInitialDevice: true, fixture: 'Real intro validation and choices; first objective and lethal-damage fixtures prepare retry after replacing the starter. Retry uses native result action and restores initial seed/difficulty/device.' };
    });
    await run(browser, 'pulse-multitouch-844x390', { width: 844, height: 390 }, async (page, mobile, context) => {
      await start(page, mobile, 'well'); await enterRest(page, mobile);
      await page.locator('[data-voyage-device="battery"]').click(); await page.locator('[data-voyage-slot="1"]').click();
      await page.locator('#continue-voyage').click(); await resolveDecisions(page);
      await page.evaluate(() => {
        const g = __voyageQA.game; g.enemies = []; g.hazards = []; g.bullets = []; g.obstacles = []; g.pickups = [];
        g.voyage.room.spawnTimer = 999; g.player.x = 600; g.player.y = 800; g.ammoByWeapon[0]--; g._syncWeapon(); __voyageQA.events = [];
      });
      await page.waitForFunction(() => !document.getElementById('reload-button').disabled);
      const cdp = await context.newCDPSession(page), contacts = new Map(); let nextId = 10;
      const down = async contact => { contacts.set(contact.id, contact); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); };
      const up = async id => { const ended = contacts.get(id); contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [ended] }); };
      const tap = async selector => { const contact = await point(page, selector, nextId++); await down(contact); await page.waitForTimeout(30); await up(contact.id); await page.waitForTimeout(45); };
      const move = await point(page, '#move-stick', 1, 28), aim = await point(page, '#aim-stick', 2, 28);
      await down(move); await down(aim); await page.waitForTimeout(130); const before = await state(page);
      assert.ok(before.input.moveX > .5 && before.input.shoot);
      await tap('#skill-button'); const placed = await state(page);
      assert.ok(placed.voyage.effects.well?.remaining > 0); assert.ok(placed.player.skillCooldown > 0);
      assert.ok(placed.input.moveX > .5 && placed.input.shoot); assert.ok(placed.player.x > before.player.x);
      await page.waitForFunction(() => !document.getElementById('skill-button').disabled);
      assert.match(await page.locator('#skill-button').getAttribute('aria-label'), /引爆/);
      await tap('#skill-button'); const collapsed = await state(page);
      assert.equal(collapsed.voyage.effects.well, null); assert.ok(collapsed.player.skillCooldown > 11);
      assert.equal(collapsed.events.filter(event => event.type === 'pulse').length, 1);
      assert.equal(collapsed.events.filter(event => event.type === 'voyage-resonance' && event.stage === 'collapse').length, 1);
      assert.ok(collapsed.input.moveX > .5 && collapsed.input.shoot);
      await tap('#reload-button'); const reloading = await state(page); assert.ok(reloading.player.reloadTimer > 0); assert.ok(reloading.input.moveX > .5);
      await tap('[data-weapon="5"]'); const switched = await state(page); assert.equal(switched.player.weapon, 5); assert.ok(switched.input.moveX > .5 && switched.input.shoot);
      await up(aim.id); await page.waitForTimeout(70); const aimEnded = await state(page); assert.equal(aimEnded.input.shoot, false); assert.ok(aimEnded.input.moveX > .5);
      await up(move.id); await page.waitForTimeout(70); const ended = await state(page); assert.equal(ended.input.moveX, 0);
      await page.screenshot({ path: path.join(outputFolder, 'pulse-multitouch-844x390.png') });
      return { checks: ['dual-stick-active', 'third-finger-EMP-places-well', 'same-EMP-button-collapses-during-cooldown-once', 'reload-while-both-sticks-held', 'sixth-weapon-switch-preserves-input', 'release-aim-keeps-move', 'release-move-stops'], pulseEvents: 1, collapseEvents: 1, cooldownAfterCollapse: collapsed.player.skillCooldown, fixture: 'Actual first room/menus equip well+battery; cleared combat/spawn delay and one spent round prepare repeatable simultaneous CDP touch. No DOM-dispatched input.' };
    });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 360, height: 800 }, { width: 844, height: 390 }]) {
      const suffix = viewport.width + 'x' + viewport.height;
      await run(browser, 'shop-resonance-' + suffix, viewport, async (page, mobile) => {
        const starter = viewport.width === 360 ? 'mirror' : viewport.width === 844 ? 'well' : 'afterimage';
        const partner = { afterimage: 'needles', mirror: 'sentry', well: 'battery' }[starter];
        const intro = await start(page, mobile, starter); await enterRest(page, mobile);
        const initial = await state(page), route = initial.voyage.routeChoices.at(-1);
        await page.locator('[data-voyage-route="' + route.id + '"]').click();
        await page.locator('[data-voyage-device="' + partner + '"]').click();
        await page.locator('[data-voyage-slot="1"]').click();
        await page.locator('[data-voyage-purchase="damage"]').click();
        const purchased = await state(page);
        assert.equal(purchased.player.credits, initial.player.credits - 35); assert.equal(purchased.player.damageMultiplier, initial.player.damageMultiplier + .18);
        assert.equal(await page.locator('[data-voyage-route="' + route.id + '"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-voyage-device="' + partner + '"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-voyage-slot="1"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-voyage-purchase]:not(:disabled)').count(), 0, 'One purchase disables all shop actions');
        await page.locator('#leave-voyage-rest').click(); await page.locator('#cancel-voyage-exit').click();
        assert.equal(await page.locator('[data-voyage-route="' + route.id + '"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-voyage-device="' + partner + '"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-voyage-slot="1"]').getAttribute('aria-pressed'), 'true');
        await page.locator('#continue-voyage').click();
        await page.locator('#continue-voyage-resonance').waitFor();
        const ceremony = await menu(page), before = (await state(page)).elapsed;
        await page.waitForTimeout(180); assert.equal((await state(page)).elapsed, before, 'Central resonance ceremony freezes native simulation');
        await page.screenshot({ path: path.join(outputFolder, 'resonance-' + suffix + '.png') });
        await page.keyboard.press('Escape');
        for (let attempt = 0; attempt < 20 && await page.locator('[data-upgrade]:visible').count(); attempt++) await page.locator('[data-upgrade]:visible').first().click();
        await page.waitForFunction(() => __voyageQA.game.phase === 'playing' && document.getElementById('screen-overlay').classList.contains('hidden'));
        const equipped = await state(page); assert.deepEqual(equipped.voyage.devices, [starter, partner, null]); assert.equal(equipped.voyage.node, 2);
        await page.keyboard.press('Escape'); await page.locator('#resume-run').waitFor();
        const paused = (await state(page)).elapsed; await page.waitForTimeout(100); assert.equal((await state(page)).elapsed, paused);
        await page.locator('#pause-help').click(); const help = await menu(page); await page.locator('#close-help').click();
        await page.locator('#screen-content button').filter({ hasText: '战术地图' }).click(); await page.locator('#tactical-map').waitFor();
        const map = await menu(page); assert.match(await page.locator('#screen-title').innerText(), /航段 2\/7/);
        await page.locator('#close-map').click(); await page.locator('#resume-run').click();
        await page.waitForFunction(at => __voyageQA.game.elapsed > at, paused);
        return { starter, partner, intro, ceremony, help, map, initialCredits: initial.player.credits, afterPurchaseCredits: purchased.player.credits, fixture: 'First finite objective uses explicit combat/position fixture. Purchase, preservation after cancel, pair equipment, central paused ceremony, Esc continuation and pause/help/map controls use actual menus and native rAF.' };
      });
      await run(browser, 'rest-lifecycle-' + suffix, viewport, async (page, mobile) => {
        const intro = await start(page, mobile); await enterRest(page, mobile);
        const decisions = await menu(page); const first = await state(page);
        assert.equal(first.voyage.routeChoices.length, 2);
        await page.screenshot({ path: path.join(outputFolder, 'rest-' + suffix + '.png') });
        await continueRoom(page); const second = await state(page); assert.equal(second.voyage.node, 2);
        for (let node = 2; node <= 6; node++) { await enterRest(page, mobile); await continueRoom(page); }
        assert.equal((await state(page)).voyage.node, 7);
        const bossMap = await page.evaluate(() => {
          const g = __voyageQA.game, boss = g.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0);
          boss.attackTimer = 0; g.update(.1);
          return { hpPercent: Math.ceil(boss.hp / boss.maxHp * 100), stage: boss.stage, hint: boss.attackHint };
        });
        assert.ok(bossMap.hint);
        await page.keyboard.press('KeyM'); await page.locator('#tactical-map').waitFor();
        const mapText = await page.locator('.destination-list').innerText();
        assert.ok(mapText.includes('首领生命 ' + bossMap.hpPercent + '% · 阶段 ' + bossMap.stage));
        assert.ok(mapText.includes(bossMap.hint)); assert.doesNotMatch(mapText, /0\/0/);
        await page.screenshot({ path: path.join(outputFolder, 'finale-map-' + suffix + '.png') });
        await page.locator('#close-map').click(); await reachExitFixture(page);
        await page.locator('#restart-voyage').waitFor(); const finalMenu = await menu(page); const ending = await state(page);
        assert.equal(ending.phase, 'won'); assert.equal(ending.voyage.history.length, 7); assert.equal([...ending.events, ...ending.pendingEvents].filter(event => event.type === 'win').length, 1);
        await page.screenshot({ path: path.join(outputFolder, 'final-' + suffix + '.png') });
        await page.locator('#restart-voyage').click(); await page.waitForFunction(() => __voyageQA.game.phase === 'playing' && __voyageQA.game.voyage.node === 1);
        return { intro, decisions, finalMenu, bossMap: { ...bossMap, text: mapText }, ending: { node: ending.voyage.node, history: ending.voyage.history, winEvents: 1, consumedWinEvents: ending.events.filter(event => event.type === 'win').length, pendingWinEvents: ending.pendingEvents.filter(event => event.type === 'win').length }, fixture: 'All six finite rooms and terminal boss completed through actual spawning/objective logic using explicit lethal-damage/invulnerability boundary fixtures. Native E/touch enters rests, actual menu route/keep-device continues. A zeroed boss attack timer prepares a real attack warning for native M-map HP/phase/hint checks. A fixture can change phase before the native playing tick drains events, so consumed plus still-pending queue proves one win emission; no claim of natural combat completion.' };
      });
    }
  } finally { await browser.close(); report.completedAt = new Date().toISOString(); report.passed = report.cases.filter(item => item.pass).length; report.failed = report.cases.filter(item => !item.pass).length; save(); }
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, errors: report.errors, output }));
  if (!report.cases.length || report.failed || report.errors.length) process.exitCode = 1;
})().catch(error => { report.failure = error.stack; save(); console.error(error); process.exitCode = 1; });
