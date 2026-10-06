'use strict';

// Scene fixtures isolate controls/settlement; they are explicitly not natural wins.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || (() => { try { return require.resolve('playwright'); } catch { return require.resolve('../build-tools/browser/node_modules/playwright'); } })();
const { chromium } = require(playwrightPath);
const args = process.argv.slice(2), option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const release = args.includes('--release'), layoutsOnly = args.includes('--layouts-only'), folder = release ? path.join(root, 'release/web') : root;
const viewports = [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 360, height: 640 }, { width: 667, height: 375 }];
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const name = release ? 'release' : 'source', origin = 'http://127.0.0.1:4217';
const output = path.resolve(option('output', path.join(root, 'reports/review-7-2', 'risk-cargo-' + name))), hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(output, { recursive: true });
const manifest = release ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const files = release ? manifest.files.map(item => item.file) : ['index.html', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js', 'expedition.css', 'profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'vendor/cloudbase.full.js'];
const bytes = new Map(files.map(file => [file, fs.readFileSync(path.join(folder, file))]));
const report = { startedAt: new Date().toISOString(), scriptSha256: hash(fs.readFileSync(__filename)), version, mode: name, sourceFiles: Object.fromEntries([...bytes].map(([file, body]) => [file, hash(body)])), cases: [], errors: [],
  method: 'Actual native rAF and CDP contacts in mobile Edge emulation. Quiet combat, position and near-arrival fixtures isolate UI/settlement boundaries. Cargo and drone remain original seed-created objects; native controls pick/drop and original weapon projectiles shoot the moving drone. Full 10/16-second clocks run naturally in quiet scenes. The high-alarm scene uses alarm/near-arrival fixtures and is not proof of surviving high-alarm combat. No forced completion, HP/damage boosts, accelerated update or real account writes. This report is not a full natural run or physical-phone certification.' };
const save = () => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
function observe() {
  const q = window.__riskCargo = { events: [], pointers: [], input: {} }; let api, Renderer;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) { api = value; value.Game = new Proxy(value.Game, { construct(target, args, next) {
    const game = Reflect.construct(target, args, next); q.game = game;
    const update = game.update, drain = game.drainEvents;
    game.update = function(dt, input) { q.input = { ...input }; return update.call(this, dt, input); };
    game.drainEvents = function() { const events = drain.call(this); q.events.push(...events.map(event => ({ ...event, at: this.elapsed }))); return events; };
    return game;
  } }); } });
  Object.defineProperty(window, 'ExpeditionRenderer', { configurable: true, get: () => Renderer, set(value) { Renderer = new Proxy(value, { construct(target, args, next) { return q.renderer = Reflect.construct(target, args, next); } }); } });
  for (const type of ['pointerdown', 'pointerup', 'pointercancel']) document.addEventListener(type, event => { const button = event.target.closest('button'); q.pointers.push({ type, target: button?.id || event.target.id, primary: event.isPrimary, pointerType: event.pointerType }); }, { capture: true });
  localStorage.setItem('frontier-sound', 'off'); localStorage.setItem('frontier-coach', 'done');
}
async function snapshot(page) { return page.evaluate(() => { const q = __riskCargo, g = q.game; return { phase: g.phase, elapsed: g.elapsed, x: g.player.x, y: g.player.y, hp: g.player.hp, speed: g.player.speed, damage: g.player.damageMultiplier, ammo: g.player.ammo, input: q.input, salvage: structuredClone(g.salvage) }; }); }
async function quiet(page) { await page.evaluate(() => { const g = __riskCargo.game; g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = []; g.salvage.pending = []; g.battlefield.props = []; g.battlefield.mines = []; }); }
async function create(browser, viewport, full) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort(); const file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    return route.fulfill({ status: bytes.has(file) ? 200 : file === 'favicon.ico' ? 204 : 404, body: bytes.get(file) || '', contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' }); });
  await context.addInitScript(observe); const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(origin + '/?v=' + version, { waitUntil: 'domcontentloaded' }); await page.locator('#salvage-entry').waitFor();
  if (full) { await page.locator('#fullscreen-toggle').tap(); await page.waitForFunction(() => document.fullscreenElement || document.getElementById('game-stage').classList.contains('immersive')); }
  await page.locator('#salvage-entry').tap(); await page.locator('#salvage-seed').fill('731'); await page.locator('#start-salvage').tap();
  await page.waitForFunction(() => __riskCargo.game.mode === 'salvage' && __riskCargo.game.phase === 'playing'); await quiet(page);
  const cdp = await context.newCDPSession(page), contacts = new Map(); let nextId = 3;
  const point = async (selector, id, dx = 0, dy = 0) => page.locator(selector).evaluate((element, o) => { const r = element.getBoundingClientRect(), x = r.x + r.width / 2 + o.dx, y = r.y + r.height / 2 + o.dy, hit = document.elementFromPoint(x, y);
    if (element.disabled || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !(element === hit || element.contains(hit))) throw new Error(o.selector + ' is not reachable');
    return { id: o.id, x, y, radiusX: 5, radiusY: 5, force: 1 };
  }, { selector, id, dx, dy });
  const start = async touch => { contacts.set(touch.id, touch); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); };
  const end = async id => { const touch = contacts.get(id); if (!touch) return; contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [touch] }); };
  const tap = async selector => { await page.locator(selector).waitFor({ state: 'visible' }); await page.waitForFunction(selector => !document.querySelector(selector).disabled, selector); const id = nextId++; await start(await point(selector, id)); await page.waitForTimeout(35); await end(id); };
  const move = async (id, selector, dx, dy) => { const touch = await point(selector, id, dx, dy); if (!contacts.has(id)) await start(touch); else { contacts.set(id, touch); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...contacts.values()] }); } };
  return { context, page, contacts, point, start, end, tap, move };
}
async function runCase(browser, title, viewport, full, test) {
  const record = { name: title, viewport, full, pass: false, checks: [] }; let scene;
  try { scene = await create(browser, viewport, full); await test(scene, record); record.pass = true; }
  catch (error) { record.failure = error.stack; if (scene) { record.ending = await snapshot(scene.page).catch(() => null); await scene.page.screenshot({ path: path.join(output, title + '-failure.png') }).catch(() => {}); } }
  finally { if (scene) await scene.context.close(); report.cases.push(record); save(); console.log(JSON.stringify({ name: title, pass: record.pass, failure: record.failure })); }
}
async function cargoScene(scene, record) {
  const { page, tap, start, end, point } = scene;
  if (record.name === '844x390-full') {
    const initial = await snapshot(page); await page.keyboard.press('KeyM'); await page.locator('#close-map').waitFor();
    const rows = {};
    for (const exit of initial.salvage.exits) rows[exit.name] = await page.locator('[data-salvage-target="' + exit.id + '"]').innerText();
    const cargoRow = page.locator('[data-salvage-target="' + initial.salvage.hotCargo.id + '"]'); rows.cargo = await cargoRow.innerText();
    assert.match(rows[initial.salvage.exits[0].name], /10 秒接应 · 空旷快线/); assert.match(rows[initial.salvage.exits[1].name], /16 秒接应 · 固定掩体/);
    assert.match(rows.cargo, /480/); assert.match(rows.cargo, /武器 \+15% · 每 12 秒暴露 · 可以丢弃/); assert.equal(await page.locator('[data-salvage-target]').count(), 9);
    await cargoRow.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
    record.mapRisks = { rows, cards: await page.evaluate(() => [...document.querySelectorAll('.salvage-exit,.salvage-cargo')].map(e => { const r = e.getBoundingClientRect(); return { label: e.innerText, x: r.x, y: r.y, width: r.width, height: r.height }; })) };
    await page.screenshot({ path: path.join(output, record.name + '-risk-map.png') });
    await page.locator('#close-map').scrollIntoViewIfNeeded(); await page.locator('#close-map').tap(); await page.waitForFunction(() => document.getElementById('screen-overlay').classList.contains('hidden'));
    record.checks.push('Native tactical map announces both arrival/cover choices and cargo bonus/damage/exposure/drop risk before pickup');
  }
  await page.evaluate(() => { const g = __riskCargo.game, cargo = g.salvage.hotCargo; g.player.x = cargo.x - 30; g.player.y = cargo.y; });
  await tap('#touch-interact'); await page.waitForFunction(() => __riskCargo.game.salvage.hotCargo.status === 'carried'); await page.locator('#cargo-drop').waitFor(); await page.waitForTimeout(300);
  const layout = await page.evaluate(() => {
    const rect = selector => { const e = document.querySelector(selector), r = e.getBoundingClientRect(), s = getComputedStyle(e); return { x: r.x, y: r.y, width: r.width, height: r.height, visible: s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 }; };
    const q = __riskCargo, r = q.renderer, p = q.game.player, c = rect('#world');
    return { drop: rect('#cargo-drop'), cargo: rect('#cargo-control'), move: rect('#move-stick'), aim: rect('#aim-stick'), reload: rect('#reload-button'), interact: rect('#touch-interact'), skill: rect('#skill-button'), dash: rect('#dash-button'),
      player: { x: c.x + (p.x - r.camera.x) * r.scale + r.width / 2, y: c.y + (p.y - r.camera.y) * r.scale + r.height / 2, radius: 36 }, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  }); record.geometry = layout;
  const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  assert.ok(layout.drop.visible && layout.drop.width >= 43.9 && layout.drop.height >= 43.9, 'Drop is a visible 44px touch target');
  assert.ok(layout.drop.x >= -1 && layout.drop.y >= -1 && layout.drop.x + layout.drop.width <= layout.width + 1 && layout.drop.y + layout.drop.height <= layout.height + 1, 'Drop stays in viewport');
  for (const key of ['move', 'aim', 'reload', 'interact', 'skill', 'dash']) assert.equal(overlap(layout.drop, layout[key]), false, 'Drop does not occlude ' + key);
  assert.equal(overlap(layout.cargo, { x: layout.player.x - 36, y: layout.player.y - 36, width: 72, height: 72 }), false, 'Cargo control does not cover rendered player focus'); assert.equal(layout.overflow, false);
  await page.screenshot({ path: path.join(output, record.name + '-carried.png') }); record.checks.push('Visible hit-tested drop and no control/player-focus overlap');
  if (record.name === '844x390-full') {
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForFunction(() => document.getElementById('cargo-control').parentElement.classList.contains('objective-hud'));
    await page.locator('#resume-run').waitFor(); const paused = await snapshot(page); await page.waitForTimeout(120); assert.deepEqual(await snapshot(page), paused, 'Orientation safety pause freezes cargo and salvage clocks');
    await page.locator('#resume-run').scrollIntoViewIfNeeded(); await tap('#resume-run');
    await point('#cargo-drop', 100); assert.equal((await snapshot(page)).salvage.hotCargo.status, 'carried');
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForFunction(() => document.getElementById('cargo-control').parentElement.id === 'game-stage');
    await page.locator('#resume-run').waitFor(); await page.locator('#resume-run').scrollIntoViewIfNeeded(); await tap('#resume-run');
    await point('#cargo-drop', 100); assert.equal((await snapshot(page)).salvage.hotCargo.status, 'carried'); record.checks.push('Simulated landscape to portrait to landscape retains the one cargo control and native hit target');
  }
  // Position/quiet fixture isolates held-input continuity; no world object is altered.
  await page.evaluate(() => { const g = __riskCargo.game; g.player.x = g.spawn.x; g.player.y = g.spawn.y; });
  const before = await snapshot(page); await start(await point('#move-stick', 1, 28)); await start(await point('#aim-stick', 2, 28)); await page.waitForTimeout(200); const held = await snapshot(page);
  assert.ok(held.x > before.x + 10 && held.input.moveX > .5 && held.input.shoot); const pulseBefore = held.salvage.hotCargo.pulseRemaining;
  await tap('#cargo-drop'); await page.waitForFunction(() => __riskCargo.game.salvage.hotCargo.status === 'dropped'); await page.waitForTimeout(160); const dropped = await snapshot(page);
  assert.ok(dropped.input.moveX > .5 && dropped.input.shoot && dropped.x > held.x + 10, 'Third finger drop preserves both active sticks');
  assert.ok(dropped.salvage.hotCargo.pulseRemaining <= pulseBefore, 'Drop does not replenish exposure clock'); assert.equal(dropped.salvage.cargoBonus, 0); assert.equal(dropped.speed, before.speed);
  await end(1); await end(2); record.input = { before, held, dropped }; record.pointers = await page.evaluate(() => __riskCargo.pointers.filter(p => p.target === 'cargo-drop'));
  assert.ok(record.pointers.some(p => p.type === 'pointerdown' && p.pointerType === 'touch' && !p.primary), 'Actual secondary CDP pointer reached cargo drop');
  record.checks.push('Actual third CDP finger drops cargo while movement/shooting continue; no speed penalty or pre-settlement cargo bonus');
}
async function droneScene(scene, record) {
  const { page, move, tap, end } = scene;
  await page.evaluate(() => { const g = __riskCargo.game, drone = g.salvage.sources.find(s => s.kind === 'drone'); g.player.x = drone.x - 55; g.player.y = drone.y + 60; });
  const initial = await snapshot(page), d0 = initial.salvage.sources.find(s => s.kind === 'drone'); assert.equal(d0.status, 'flying'); assert.equal(d0.hp, d0.maxHp);
  const started = Date.now(); let s;
  while (Date.now() - started < 12000) { s = await snapshot(page); const drone = s.salvage.sources.find(item => item.kind === 'drone'); if (drone.status === 'open') break;
    const angle = Math.atan2(drone.y - s.y, drone.x - s.x); await move(2, '#aim-stick', Math.cos(angle) * 30, Math.sin(angle) * 30); await page.waitForTimeout(80); }
  await end(2); s = await snapshot(page); const opened = s.salvage.sources.find(item => item.kind === 'drone'); assert.equal(opened.status, 'open'); assert.equal(opened.hp, 0); assert.equal(s.salvage.carried, 0);
  while (Math.hypot(opened.x - s.x, opened.y - s.y) > 65 && Date.now() - started < 18000) { const angle = Math.atan2(opened.y - s.y, opened.x - s.x); await move(1, '#move-stick', Math.cos(angle) * 30, Math.sin(angle) * 30); await page.waitForTimeout(70); s = await snapshot(page); }
  await end(1); await tap('#touch-interact'); await page.waitForFunction(() => __riskCargo.game.salvage.sources.find(s => s.kind === 'drone').status === 'collected');
  const ending = await snapshot(page); assert.equal(ending.salvage.carried, opened.value); assert.equal(ending.damage, 1); assert.equal(ending.speed, 218);
  record.initialDrone = d0; record.openedDrone = opened; record.ending = ending; record.checks.push('Actual original-HP moving drone shot by native aim stick, cargo stationary until native E pickup; no automatic sample credit');
}
async function exitScene(scene, record, index, highAlarm) {
  const { page, tap } = scene;
  await page.evaluate(() => { const g = __riskCargo.game, cargo = g.salvage.hotCargo; g.player.x = cargo.x - 30; g.player.y = cargo.y; }); await tap('#touch-interact');
  await page.waitForFunction(() => __riskCargo.game.salvage.hotCargo.status === 'carried');
  await page.evaluate(index => { const g = __riskCargo.game, exit = g.salvage.exits[index]; g.player.x = exit.x; g.player.y = exit.y; }, index);
  await tap('#touch-interact'); await page.waitForFunction(() => !!__riskCargo.game.salvage.evac); const called = await snapshot(page); const expected = index ? 16 : 10;
  assert.equal(called.salvage.evac.duration, expected); assert.equal(called.salvage.evac.boardingDuration, 3); assert.equal(called.salvage.exits[index].arrivalDuration, expected); assert.equal(called.salvage.cargoBonus, 0);
  // Only combat tickets/hazards are removed. Clock and ship state remain real.
  await quiet(page); if (highAlarm) await page.evaluate(() => { const g = __riskCargo.game; g._raiseSalvageAlarm(80); g.salvage.pending = []; g.salvage.evac.remaining = .35; });
  await page.waitForFunction(() => __riskCargo.game.salvage.status === 'boarding', null, { timeout: 22000 }); const arrived = await snapshot(page);
  if (!highAlarm) assert.ok(arrived.elapsed - called.elapsed >= expected - .1 && arrived.elapsed - called.elapsed <= expected + .25, 'Original full arrival countdown');
  // Actual paused map freezes even the exposure clock and boarding progress.
  await page.keyboard.press('KeyM'); await page.locator('#close-map').waitFor(); const paused = await snapshot(page); await page.waitForTimeout(200); assert.deepEqual(await snapshot(page), paused, 'Map pauses all salvage/cargo clocks');
  await page.locator('#close-map').tap(); await page.waitForFunction(() => __riskCargo.game.phase === 'won', null, { timeout: 5000 }); await page.locator('[data-salvage-result="extracted"]').waitFor(); const ending = await snapshot(page);
  assert.equal(ending.salvage.evac.exitId, ending.salvage.exits[index].id); assert.equal(ending.salvage.evac.progress, 3); assert.equal(ending.salvage.hotCargo.status, 'banked');
  assert.equal(ending.salvage.cargoBonus, 480); assert.equal(ending.salvage.bonus, 480); assert.equal(ending.salvage.settled, 0); assert.ok(ending.hp > 0);
  record.called = called; record.arrived = arrived; record.ending = ending; record.events = await page.evaluate(() => __riskCargo.events.filter(e => e.type.startsWith('salvage-')));
  if (highAlarm) assert.equal(ending.salvage.alertLevel, 4);
  await page.screenshot({ path: path.join(output, record.name + '-result.png') }); record.checks.push(highAlarm ? 'High-alarm/near-arrival boundary fixture: actual east boarding, cargo settlement and map pause' : 'Full native ' + expected + 's arrival plus 3s cumulative boarding; cargo-only success and no premature bonus');
}
(async () => {
  const started = Date.now(), channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), browser = await chromium.launch({ channel, headless: true });
  try {
    for (const viewport of viewports) for (const full of [false, true]) await runCase(browser, viewport.width + 'x' + viewport.height + '-' + (full ? 'full' : 'ordinary'), viewport, full, cargoScene);
    if (!layoutsOnly) {
      await runCase(browser, 'drone-real-projectile-pickup', { width: 844, height: 390 }, true, droneScene);
      await runCase(browser, 'west-full-arrival-clock', { width: 844, height: 390 }, true, (s, r) => exitScene(s, r, 0, false));
      await runCase(browser, 'east-full-arrival-clock', { width: 844, height: 390 }, true, (s, r) => exitScene(s, r, 1, false));
      await runCase(browser, 'east-high-alarm-boundary', { width: 390, height: 844 }, true, (s, r) => exitScene(s, r, 1, true));
    }
    assert.equal(report.cases.length, viewports.length * 2 + (layoutsOnly ? 0 : 4)); assert.ok(report.cases.every(r => r.pass)); assert.deepEqual(report.errors, []); report.pass = true;
  } catch (error) { report.failure = error.stack; process.exitCode = 1; }
  finally { await browser.close(); report.completedAt = new Date().toISOString(); report.wallSeconds = (Date.now() - started) / 1000; save(); }
  console.log(JSON.stringify({ pass: report.pass, cases: report.cases.filter(r => r.pass).length, total: report.cases.length, errors: report.errors, seconds: report.wallSeconds, output }));
})();
