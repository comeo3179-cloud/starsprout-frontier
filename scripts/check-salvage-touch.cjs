'use strict';

// Actual CDP contacts, never DOM-dispatched touch/pointer events.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || (() => { try { return require.resolve('playwright'); } catch { return require.resolve('../build-tools/browser/node_modules/playwright'); } })();
const { chromium } = require(playwrightPath), root = path.resolve(__dirname, '..'), args = process.argv.slice(2), option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const online = args.includes('--online'), release = online || args.includes('--release'), mode = online ? 'online' : release ? 'release' : 'source';
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, folder = release ? path.join(root, 'release/web') : root;
const manifest = release ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4202';
const outputFolder = path.resolve(option('output', path.join(root, 'reports/expansion-6-7', `salvage-touch-${mode}-${version}`))), hash = value => crypto.createHash('sha256').update(value).digest('hex'); fs.mkdirSync(outputFolder, { recursive: true });
const report = { generatedAt: new Date().toISOString(), version, mode, files: {}, browserFiles: {}, httpFiles: {}, cases: [], errors: [],
  method: 'Fresh guest Edge mobile emulation, actual CDP simultaneous contacts and native menus. Quiet combat/position fixture isolates input routing; no forced win or real accounts. Both sticks held: third finger pauses, then third finger uses actual resume-run without held-input residue; third finger opens/closes map, and ordinary-header help. New contacts remain usable. Ordinary/fullscreen portrait/landscape. No DOM-dispatched events. Online no route/fulfill; verifies five HTTP files and actual JS/CSS/SDK responses. This is browser routing, not physical-device ergonomics.' };
const save = () => fs.writeFileSync(path.join(outputFolder, 'results.json'), JSON.stringify(report, null, 2) + '\n'), bytes = new Map();
if (!online) for (const file of release ? manifest.files.map(item => item.file) : ['index.html', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js', 'expedition.css', 'profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'vendor/cloudbase.full.js']) { const body = fs.readFileSync(path.join(folder, file)); bytes.set(file, body); report.files[file] = hash(body); }
function observe() {
  const q = window.__salvageTouch = { input: {}, events: [], pointers: [] }; let api;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) { api = value; value.Game = new Proxy(value.Game, { construct(target, args, next) {
    const game = Reflect.construct(target, args, next); q.game = game; const update = game.update, drain = game.drainEvents;
    game.update = function(dt, input) { q.input = { ...input }; return update.call(this, dt, input); };
    game.drainEvents = function() { const events = drain.call(this); q.events.push(...events.map(event => ({ type: event.type, owner: event.owner }))); return events; }; return game;
  } }); } });
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) document.addEventListener(type, event => q.pointers.push({ type, target: event.target.closest('button')?.id || event.target.closest('[id]')?.id, pointerType: event.pointerType, isPrimary: event.isPrimary }), { capture: true });
  localStorage.setItem('frontier-sound', 'off');
}
async function state(page) { return page.evaluate(() => { const q = __salvageTouch, g = q.game; return { x: g.player.x, y: g.player.y, elapsed: g.elapsed, ammo: g.player.ammo, salvage: structuredClone(g.salvage), input: q.input, shots: q.events.filter(event => event.type === 'shot' && event.owner === 'player').length }; }); }
async function point(page, selector, id, offset = 0) { return page.locator(selector).evaluate((element, options) => { const r = element.getBoundingClientRect(), x = r.x + r.width / 2 + options.offset, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
  if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight || !(hit === element || element.contains(hit)) || element.disabled) throw new Error(options.selector + ' is not actually reachable'); return { id: options.id, x, y, radiusX: 5, radiusY: 5, force: 1 };
}, { selector, id, offset }); }
async function scene(browser, viewport, full) {
  const name = `${viewport.width}x${viewport.height}-${full ? 'fullscreen' : 'ordinary'}`, record = { name, viewport, full, pass: false, checks: [] }, context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1, serviceWorkers: 'block' }); let page;
  try {
    if (!online) await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort(); const file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html'; if (!bytes.has(file)) return route.fulfill({ status: file === 'favicon.ico' ? 204 : 404, body: '' }); return route.fulfill({ body: bytes.get(file), contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' }); });
    await context.addInitScript(observe); page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000); page.on('pageerror', error => report.errors.push({ name, message: error.message })); const loaded = {}, responses = [];
    if (online) page.on('response', response => { const url = new URL(response.url()), file = decodeURIComponent(url.pathname).replace(/^\//, ''); if (url.origin === origin && manifest.files.some(item => item.file === file && /\.(js|css)$/.test(file))) responses.push(response.body().then(body => { loaded[file] = hash(body); }).catch(error => report.errors.push({ name, message: error.message }))); });
    await page.goto(origin + '/?v=' + version, { waitUntil: 'domcontentloaded' }); if (online && await page.locator('#submitBtn').count()) { assert.match(await page.locator('body').innerText(), /测试域名/); await page.locator('#submitBtn').click(); }
    await page.locator('#salvage-entry').waitFor(); if (full) { await page.locator('#fullscreen-toggle').tap(); await page.waitForFunction(() => !!document.fullscreenElement || document.getElementById('game-stage').classList.contains('immersive')); }
    await page.locator('#salvage-entry').tap(); await page.locator('#salvage-seed').fill('731'); await page.locator('#start-salvage').tap();
    await page.evaluate(() => { const g = __salvageTouch.game; g.player.x = 600; g.player.y = 1000; g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = []; g.obstacles = []; g.salvage.pending = []; g.battlefield.props = []; g.battlefield.mines = []; });
    const cdp = await context.newCDPSession(page), contacts = new Map();
    const start = async contact => { contacts.set(contact.id, contact); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); };
    const end = async id => { const contact = contacts.get(id); contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [contact] }); };
    const tapThird = async (target, id) => { await page.locator(target).scrollIntoViewIfNeeded(); const contact = await point(page, target, id); await start(contact); await page.waitForTimeout(35); await end(id); };
    const move = await point(page, '#move-stick', 1, 28), aim = await point(page, '#aim-stick', 2, 28), before = await state(page);
    await start(move); await start(aim); await page.waitForTimeout(200); const held = await state(page);
    assert.ok(held.x > before.x + 10); assert.ok(held.input.moveX > .5 && held.input.shoot); assert.ok(held.shots > before.shots);
    const selector = full ? '#fullscreen-pause' : '#pause-toggle', pause = await point(page, selector, 3); await start(pause); await page.waitForTimeout(35); await end(3);
    await page.locator('#resume-run').waitFor(); const paused = await state(page); await page.waitForTimeout(300); assert.deepEqual(await state(page), paused, 'Native pause freezes every salvage clock and input');
    record.checks.push({ name: 'third-finger-pause-with-both-sticks-held', selector, held, paused }); await page.screenshot({ path: path.join(outputFolder, name + '-paused.png') });
    await tapThird('#resume-run', 12); await page.waitForFunction(() => document.getElementById('screen-overlay').classList.contains('hidden')); await page.waitForTimeout(220); const resumed = await state(page);
    assert.ok(resumed.elapsed > paused.elapsed); assert.equal(resumed.x, paused.x); assert.equal(resumed.y, paused.y); assert.ok(!resumed.input.shoot && !resumed.input.moveX && !resumed.input.moveY); assert.equal(resumed.shots, paused.shots);
    await end(1); await end(2); await page.waitForTimeout(80);
    const freshBefore = await state(page); await start(await point(page, '#move-stick', 4, 28)); await start(await point(page, '#aim-stick', 5, 28)); await page.waitForTimeout(200); const freshAfter = await state(page);
    assert.ok(freshAfter.x > freshBefore.x + 10); assert.ok(freshAfter.input.moveX > .5 && freshAfter.input.shoot); assert.ok(freshAfter.shots > freshBefore.shots);
    record.checks.push({ name: 'third-finger-resume-run-clears-held-input-and-fresh-contacts-work', resumed, freshBefore, freshAfter });
    const mapSelector = full ? '#field-map-toggle' : '#map-toggle';
    await tapThird(mapSelector, 6); await page.locator('#close-map').waitFor();
    const mapPaused = await state(page); await page.waitForTimeout(240); assert.deepEqual(await state(page), mapPaused);
    await tapThird('#close-map', 7); await page.waitForFunction(() => document.getElementById('screen-overlay').classList.contains('hidden')); await page.waitForTimeout(180); const mapResumed = await state(page);
    assert.ok(mapResumed.elapsed > mapPaused.elapsed); assert.equal(mapResumed.x, mapPaused.x); assert.equal(mapResumed.y, mapPaused.y); assert.ok(!mapResumed.input.shoot && !mapResumed.input.moveX && !mapResumed.input.moveY); assert.equal(mapResumed.shots, mapPaused.shots);
    record.checks.push({ name: 'third-finger-map-open-and-native-close-while-sticks-held', mapSelector, mapPaused, mapResumed });
    await end(4); await end(5);
    if (!full) {
      await start(await point(page, '#move-stick', 8, 28)); await start(await point(page, '#aim-stick', 9, 28)); await page.waitForTimeout(180); const helpHeld = await state(page);
      assert.ok(helpHeld.input.moveX > .5 && helpHeld.input.shoot);
      await tapThird('#help-toggle', 10); await page.locator('#close-help').waitFor(); const helpPaused = await state(page); await page.waitForTimeout(240); assert.deepEqual(await state(page), helpPaused);
      await tapThird('#close-help', 11); await page.waitForFunction(() => document.getElementById('screen-overlay').classList.contains('hidden')); await page.waitForTimeout(180); const helpResumed = await state(page);
      assert.ok(helpResumed.elapsed > helpPaused.elapsed); assert.equal(helpResumed.x, helpPaused.x); assert.equal(helpResumed.y, helpPaused.y); assert.ok(!helpResumed.input.shoot && !helpResumed.input.moveX && !helpResumed.input.moveY); assert.equal(helpResumed.shots, helpPaused.shots);
      await end(8); await end(9); record.checks.push({ name: 'third-finger-header-help-open-and-native-close-without-residue', helpHeld, helpPaused, helpResumed });
    }
    await page.locator(selector).tap(); await page.locator('#resume-run').waitFor(); await page.locator('#resume-run').tap(); await page.waitForTimeout(150);
    record.pointers = await page.evaluate(() => __salvageTouch.pointers); assert.ok(record.pointers.some(event => event.type === 'pointerdown' && event.target === selector.slice(1) && event.isPrimary === false));
    assert.ok(record.pointers.some(event => event.type === 'pointerdown' && event.target === 'resume-run' && event.isPrimary === false));
    if (online) { await page.waitForFunction(() => window.cloudbase); await Promise.all(responses); for (const item of manifest.files.filter(item => /\.(js|css)$/.test(item.file))) assert.equal(loaded[item.file], item.sha256); Object.assign(report.browserFiles, loaded); }
    record.pass = true;
  } catch (error) { record.error = error.stack; if (page) { record.pointers = await page.evaluate(() => __salvageTouch?.pointers).catch(() => []); await page.screenshot({ path: path.join(outputFolder, name + '-failure.png') }).catch(() => {}); } }
  finally { await context.close(); report.cases.push(record); save(); }
}
(async () => {
  const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), browser = await chromium.launch({ channel, headless: true });
  try {
    if (online) { const context = await browser.newContext(); try { for (const item of manifest.files) { const response = await context.request.get(origin + '/' + item.file + '?salvage-touch-verify=' + Date.now(), { headers: { 'cache-control': 'no-cache' }, timeout: 30000 }); assert.equal(response.status(), 200); report.httpFiles[item.file] = hash(await response.body()); assert.equal(report.httpFiles[item.file], item.sha256); } } finally { await context.close(); } }
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) for (const full of [false, true]) await scene(browser, viewport, full);
  } finally { await browser.close(); save(); }
  console.log(JSON.stringify({ mode, passed: report.cases.filter(item => item.pass).length, total: report.cases.length, errors: report.errors.length, outputFolder })); assert.ok(report.cases.length === 4 && report.cases.every(item => item.pass) && !report.errors.length);
})().catch(error => { report.failure = error.stack; save(); console.error(error.stack); process.exitCode = 1; });
