'use strict';

// Actual guest browser UI, source or built release. Controlled fixture scenes
// isolate task/HUD/touch lifecycle; check-storm-expedition.cjs covers normal stats.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; ({ chromium } = require('../build-tools/browser/node_modules/playwright')); }
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2), release = args.includes('--release');
const mode = release ? 'release' : 'source', folder = release ? path.join(root, 'release/web') : root;
const outputFolder = path.join(root, 'reports/storm-ui-' + mode), origin = 'http://127.0.0.1:4189';
const filter = args.includes('--case') ? args[args.indexOf('--case') + 1] : '';
const report = { generatedAt: new Date().toISOString(), mode, files: {}, cases: [], errors: [], note: 'Isolated guest Edge with actual source/release files and native requestAnimationFrame. Tower fixtures clear battle entities and position the player only to reach reproducible UI states. No cloud account writes. CDP touch is real simultaneous browser input; viewport emulation is not physical-phone certification.' };
fs.mkdirSync(outputFolder, { recursive: true });
const output = path.join(outputFolder, filter ? 'results-' + filter.replace(/[^a-z0-9-]/gi, '_') + '.json' : 'results.json');
function save() { fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
function observe() {
  const q = window.__stormQA = { events: [], updates: 0, input: {} }; let api;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
    api = value; api.Game = new Proxy(api.Game, { construct(target, args, next) {
      const game = Reflect.construct(target, args, next); q.game = game;
      const update = game.update, drain = game.drainEvents;
      game.update = function(dt, input) { q.input = { ...input }; q.updates++; return update.call(this, dt, input); };
      game.drainEvents = function() { const events = drain.call(this); q.events.push(...events.map(event => ({ ...event }))); return events; };
      return game;
    } });
  } });
  localStorage.setItem('frontier-sound', 'off');
  localStorage.setItem('frontier-secrets-v1', JSON.stringify(['rebound', 'blade-relay', 'bullet-reversal', 'fuse-resonance', 'rail-resonance', 'ice-break']));
}
async function create(browser, name, size, mobile) {
  const context = await browser.newContext({ viewport: size, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', file = path.resolve(folder, name);
    if (!file.startsWith(folder + path.sep)) return route.abort();
    try {
      const body = fs.readFileSync(file); report.files[name] = crypto.createHash('sha256').update(body).digest('hex');
      await route.fulfill({ body, contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(name)] || 'application/octet-stream' });
    } catch { await route.fulfill({ status: name === 'favicon.ico' ? 204 : 404, body: '' }); }
  });
  await context.addInitScript(observe);
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push({ name, message: error.message }));
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stormQA?.game && Expedition.MAPS.length === 4);
  return { page, context };
}
async function test(browser, name, size, mobile, fn) {
  if (filter && !name.includes(filter)) return;
  let page, context;
  try {
    ({ page, context } = await create(browser, name, size, mobile));
    const result = await fn(page, context); report.cases.push({ name, pass: true, ...result }); console.log('PASS ' + name);
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(outputFolder, name + '-failure.png') }).catch(() => {});
    report.cases.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message);
  } finally { if (context) await context.close(); save(); }
}
async function shot(page, name) { await page.screenshot({ path: path.join(outputFolder, name + '.png') }); }
async function start(page, mobile = false) {
  await page.locator('[data-map="storm"]').click();
  if (mobile) { await page.locator('#display-mode-button').tap(); await page.waitForFunction(() => document.fullscreenElement || document.getElementById('game-stage').classList.contains('immersive')); }
  await page.locator('#start-run').click(); await page.waitForFunction(() => __stormQA.game.phase === 'playing');
}
async function prepareTower(page, outside = false) {
  await page.evaluate(outside => {
    const q = __stormQA, g = q.game, relay = g.relays[0];
    g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = []; g.obstacles = []; g.spawnTimer = 999;
    g.player.x = relay.x + (outside ? relay.radius + 80 : 0); g.player.y = relay.y;
    q.events = [];
  }, outside);
}
async function state(page) {
  return page.evaluate(() => {
    const q = __stormQA, g = q.game;
    return { map: g.map.id, phase: g.phase, elapsed: g.elapsed, updates: q.updates, x: g.player.x, y: g.player.y, input: q.input, weapon: g.player.weapon, reload: g.player.reloadTimer, hp: g.player.hp,
      towers: g.relays.map(r => ({ id: r.id, status: r.status, charges: r.charges, progress: r.progress })), hazards: g.hazards.map(h => ({ x: h.x, y: h.y, remaining: h.remaining, conductionRelayId: h.conductionRelayId })), events: q.events };
  });
}
async function frozen(page) {
  await page.waitForTimeout(45); const before = await state(page); await page.waitForTimeout(190);
  assert.deepEqual(await state(page), before, 'Paused world/hazard continued updating'); return before;
}
async function camp(browser, size, mobile) {
  await test(browser, 'four-sector-camp-' + size.width + 'x' + size.height, size, mobile, async page => {
    assert.equal(await page.locator('[data-map]').count(), 4);
    const layout = await page.locator('[data-map]').evaluateAll(elements => elements.map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.map, text: e.textContent, x: r.x, y: r.y, width: r.width, height: r.height, overflow: e.scrollWidth > e.clientWidth + 1 }; }));
    assert.ok(layout.every(e => !e.text.includes('undefined') && !e.overflow));
    if (mobile) {
      assert.ok(layout.every(e => e.width >= 44 && e.height >= 44));
      assert.ok(Math.abs(layout[0].y - layout[1].y) < 2 && Math.abs(layout[2].y - layout[3].y) < 2 && layout[2].y > layout[0].y, 'Phone camp uses two rows of two cards');
    }
    for (const id of ['frontier', 'foundry', 'frost', 'storm']) {
      await page.locator('[data-map="' + id + '"]').click();
      assert.equal(await page.locator('[data-map="' + id + '"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => __stormQA.game.map.id), id);
      assert.ok(!(await page.locator('#screen-content').textContent()).includes('undefined'));
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.locator('#start-run').scrollIntoViewIfNeeded(); await shot(page, 'camp-' + size.width + 'x' + size.height);
    await page.locator('#start-run').click(); assert.equal(await page.evaluate(() => __stormQA.game.map.mode), 'conduction');
    return { layout };
  });
}
async function towerFlow(browser) {
  await test(browser, 'tower-lock-dodge-charge-map-pause', { width: 1440, height: 1000 }, false, async page => {
    await start(page); await prepareTower(page); await page.keyboard.press('KeyE');
    await page.waitForFunction(() => __stormQA.game.relays[0].status === 'charging');
    assert.match(await page.locator('#relay-progress-label').textContent(), /0\s*\/\s*3/);
    await page.keyboard.press('KeyM'); await page.locator('#close-map').waitFor();
    assert.match(await page.locator('.destination-list').textContent(), /引雷|导雷|雷击|充能/); await frozen(page);
    await page.locator('#close-map').click();
    await page.waitForFunction(() => __stormQA.game.hazards.some(h => h.conductionRelayId));
    await page.keyboard.press('KeyP'); await page.locator('#resume-run').waitFor(); const pause = await frozen(page);
    await shot(page, 'tower-paused-warning'); await page.locator('#resume-run').click();
    await page.keyboard.down('KeyD'); await page.waitForTimeout(850); await page.keyboard.up('KeyD');
    await page.waitForFunction(() => __stormQA.events.some(e => e.type === 'conduction-charge'));
    const charged = await state(page); assert.equal(charged.towers[0].charges, 1); assert.equal(charged.towers[0].progress, 1 / 3);
    await page.waitForFunction(() => /1\s*\/\s*3/.test(document.getElementById('relay-progress-label').textContent)); await shot(page, 'tower-first-charge');
    return { pause, charged, fixture: 'Player positioned at the first tower and unrelated battle entities cleared; activation, fixed-target warning, pause, movement dodge and charge use unchanged game/UI.' };
  });
}
async function mobileFlow(browser, size) {
  await test(browser, 'tower-multitouch-' + size.width + 'x' + size.height, size, true, async (page, context) => {
    await start(page, true); await prepareTower(page);
    await page.locator('#touch-interact').tap(); await page.waitForFunction(() => __stormQA.game.relays[0].status === 'charging');
    await page.evaluate(() => { const g = __stormQA.game; g.ammoByWeapon[0]--; g._syncWeapon(); });
    await page.waitForFunction(() => !document.getElementById('reload-button').disabled);
    const cdp = await context.newCDPSession(page), contacts = new Map(); let nextId = 10;
    async function point(selector, id, offset = 0) { const r = await page.locator(selector).boundingBox(); assert.ok(r); return { id, x: r.x + r.width / 2 + offset, y: r.y + r.height / 2, radiusX: 5, radiusY: 5, force: 1 }; }
    async function down(p) { contacts.set(p.id, p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); }
    async function up(id) { const p = contacts.get(id); contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p] }); }
    async function tap(selector) { const p = await point(selector, nextId++); await down(p); await page.waitForTimeout(35); await up(p.id); await page.waitForTimeout(70); }
    const before = await state(page); await down(await point('#move-stick', 1, 28)); await page.waitForTimeout(130);
    await tap('#reload-button'); const reload = await state(page); assert.ok(reload.x > before.x + 5 && reload.reload > 0 && reload.input.moveX > .5);
    await tap('[data-weapon="1"]'); assert.equal(await page.evaluate(() => __stormQA.game.player.weapon), 1);
    await down(await point('#aim-stick', 2, 28)); await tap('[data-weapon="2"]'); await page.waitForTimeout(120);
    const third = await state(page); assert.ok(third.input.moveX > .5 && third.input.shoot && third.x > reload.x); assert.equal(third.weapon, 2);
    await up(2); await up(1); await page.waitForTimeout(70); assert.equal((await state(page)).input.moveX, 0);
    const hud = await page.locator('#relay-progress-wrap').evaluate(element => { const r = element.getBoundingClientRect(); return { text: element.textContent, x: r.x, right: r.right, y: r.y, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
    assert.ok(hud.x >= -1 && hud.right <= hud.width + 1 && hud.y >= -1 && hud.bottom <= hud.height + 1); assert.match(hud.text, /0\s*\/\s*3/);
    await shot(page, 'tower-touch-' + size.width + 'x' + size.height);
    await page.setViewportSize({ width: size.height, height: size.width }); await page.locator('#resume-run').waitFor(); const rotated = await frozen(page);
    assert.equal(rotated.input.moveX, 0); assert.equal(rotated.input.shoot, false);
    await page.locator('#resume-run').click(); await page.waitForFunction(time => __stormQA.game.elapsed > time, rotated.elapsed);
    return { reload, third, hud, rotated, fixture: 'One spent round is prepared to make reload available; CDP contacts hold movement throughout secondary reload and third-finger weapon changes.' };
  });
}
async function missedStrike(browser) {
  await test(browser, 'tower-missed-strike-retry', { width: 1440, height: 1000 }, false, async page => {
    await start(page); await prepareTower(page); await page.keyboard.press('KeyE');
    await page.keyboard.down('KeyD'); await page.waitForTimeout(1000); await page.keyboard.up('KeyD');
    await page.waitForFunction(() => __stormQA.events.some(event => event.type === 'conduction-miss'));
    const miss = await state(page); assert.equal(miss.towers[0].charges, 0); assert.equal(miss.towers[0].status, 'charging');
    await page.waitForFunction(() => /进圈引雷/.test(document.getElementById('relay-progress-label').textContent));
    await shot(page, 'missed-strike-return-hint');
    await page.keyboard.down('KeyA'); await page.waitForTimeout(1000); await page.keyboard.up('KeyA');
    await page.waitForFunction(() => __stormQA.game.hazards.some(h => h.conductionRelayId && h.capturedAtLock));
    await page.keyboard.down('KeyD'); await page.waitForTimeout(850); await page.keyboard.up('KeyD');
    await page.waitForFunction(() => __stormQA.events.some(event => event.type === 'conduction-charge'));
    const retried = await state(page); assert.equal(retried.towers[0].charges, 1);
    return { miss, retried, fixture: 'Same first-tower UI scene; the player walks out before lock, receives a real miss, returns and successfully retries.' };
  });
}
async function bossBacklash(browser) {
  await test(browser, 'boss-lock-backlash-hud', { width: 1440, height: 1000 }, false, async page => {
    await start(page); await prepareTower(page);
    const originalHp = await page.evaluate(() => {
      const q = __stormQA, g = q.game; g.player.x = 1000; g.player.y = 1000;
      g._spawnBoss(); const boss = g.enemies.find(enemy => enemy.type === 'boss');
      boss.x = 1130; boss.y = 1000; boss.attackTimer = .2; boss.attackCount = 0;
      return boss.hp;
    });
    await page.waitForFunction(() => __stormQA.game.hazards.some(h => h.backlashId));
    await page.waitForFunction(() => /追身引雷|锁定雷圈/.test(document.getElementById('boss-tactic').textContent));
    await shot(page, 'boss-call-warning');
    await page.keyboard.down('KeyA'); await page.waitForTimeout(850); await page.keyboard.up('KeyA');
    await page.waitForFunction(() => __stormQA.events.some(event => event.type === 'boss-backlash'));
    const boss = await page.evaluate(() => { const b = __stormQA.game.enemies.find(e => e.type === 'boss'); return { hp: b.hp, recovery: b.recoveryTimer, kind: b.attackKind }; });
    assert.equal(originalHp - boss.hp, 240); assert.ok(boss.recovery > 0); assert.equal(boss.kind, '');
    assert.match(await page.locator('#run-log').textContent(), /引雷反噬/); await shot(page, 'boss-backlash');
    return { originalHp, boss, fixture: 'Boss phase is placed near the player with its first attack ready. Native rAF produces the real lock warning, the player walks away, and the real strike damages the boss.' };
  });
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    await camp(browser, { width: 1440, height: 1000 }, false);
    await camp(browser, { width: 360, height: 800 }, true);
    await camp(browser, { width: 844, height: 390 }, true);
    await towerFlow(browser);
    await missedStrike(browser);
    await bossBacklash(browser);
    await mobileFlow(browser, { width: 390, height: 844 });
    await mobileFlow(browser, { width: 844, height: 390 });
  } finally { await browser.close(); save(); }
  console.log(JSON.stringify({ cases: report.cases.length, failed: report.cases.filter(c => !c.pass).length, pageErrors: report.errors.length, output }));
  if (report.cases.some(c => !c.pass) || report.errors.length || !report.cases.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; save(); });
