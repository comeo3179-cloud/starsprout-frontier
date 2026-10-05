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
const report = { generatedAt: new Date().toISOString(), scriptSha256: hash(fs.readFileSync(__filename)), version, mode, files: {}, browserFiles: {}, httpFiles: {}, cases: [], errors: [],
  method: 'Fresh guest Edge mobile emulation, actual CDP simultaneous contacts and native menus. Quiet combat/position fixture isolates input routing; one XP-threshold/_levelUp fixture opens an upgrade while both old contacts are still held. Ready contract/rift terminals are explicit fixtures; actual Game.interact opens legal relic/tactic choices without forcing a reward phase. Game.update/drainEvents wrappers only forward and observe native calls. No forced win or real accounts. Both sticks held: third finger pauses/resumes, opens/closes map, selects upgrades, tracking and rewards at release, and drags choices without accidental selection. New contacts remain usable. Reachability setup may scrollIntoView; card gestures and menu pans are actual CDP contacts. Ordinary/fullscreen portrait/landscape. No DOM-dispatched events. Online no route/fulfill; verifies five HTTP files and actual JS/CSS/SDK responses. This is browser routing, not natural leveling, earned rewards, full matches or physical-device ergonomics.' };
const save = () => fs.writeFileSync(path.join(outputFolder, 'results.json'), JSON.stringify(report, null, 2) + '\n'), bytes = new Map();
if (!online) for (const file of release ? manifest.files.map(item => item.file) : ['index.html', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js', 'expedition.css', 'profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'vendor/cloudbase.full.js']) { const body = fs.readFileSync(path.join(folder, file)); bytes.set(file, body); report.files[file] = hash(body); }
function observe() {
  const q = window.__salvageTouch = { input: {}, events: [], pointers: [] }; let api;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) { api = value; value.Game = new Proxy(value.Game, { construct(target, args, next) {
    const game = Reflect.construct(target, args, next); q.game = game; const update = game.update, drain = game.drainEvents;
    game.update = function(dt, input) { q.input = { ...input }; return update.call(this, dt, input); };
    game.drainEvents = function() { const events = drain.call(this); q.events.push(...events.map(event => ({ type: event.type, owner: event.owner }))); return events; }; return game;
  } }); } });
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) document.addEventListener(type, event => { const button = event.target.closest('button'); q.pointers.push({ type,
    target: button?.id || (button?.dataset.upgrade ? 'upgrade-' + button.dataset.upgrade : button?.dataset.salvageTarget ? 'salvage-target-' + button.dataset.salvageTarget : button?.dataset.relic ? 'relic-' + button.dataset.relic : button?.dataset.tactic ? 'tactic-' + button.dataset.tactic : event.target.closest('[id]')?.id), pointerType: event.pointerType, isPrimary: event.isPrimary }); }, { capture: true });
  localStorage.setItem('frontier-sound', 'off');
}
async function state(page) { return page.evaluate(() => { const q = __salvageTouch, g = q.game; return { phase: g.phase, upgradeStacks: { ...g.upgradeStacks }, relics: [...g.relics], tacticId: g.tacticId, x: g.player.x, y: g.player.y, elapsed: g.elapsed, ammo: g.player.ammo, salvage: structuredClone(g.salvage), input: q.input, shots: q.events.filter(event => event.type === 'shot' && event.owner === 'player').length }; }); }
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
    const end = async id => { const contact = contacts.get(id); if (!contact) return; contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [contact] }); };
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
    await start(await point(page, '#move-stick', 20, 28)); await start(await point(page, '#aim-stick', 21, 28)); await page.waitForTimeout(180);
    const upgradeHeld = await state(page); assert.ok(upgradeHeld.input.moveX > .5 && upgradeHeld.input.shoot);
    await page.evaluate(() => { const g = __salvageTouch.game; g.player.xp = g.player.xpNeeded; g._levelUp(); }); await page.locator('[data-upgrade]').first().waitFor();
    const upgradeChoice = page.locator('[data-upgrade]').first(), upgradeId = await upgradeChoice.getAttribute('data-upgrade'), upgradeSelector = '[data-upgrade="' + upgradeId + '"]';
    await upgradeChoice.scrollIntoViewIfNeeded(); const upgradePaused = await state(page), card = await point(page, upgradeSelector, 22);
    await start(card); contacts.set(22, { ...card, y: card.y + 35 }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...contacts.values()] }); await end(22); await page.waitForTimeout(90);
    assert.deepEqual(await state(page), upgradePaused, 'Third-finger card drag does not choose or unpause');
    await start(await point(page, upgradeSelector, 23)); await page.waitForTimeout(90); assert.deepEqual(await state(page), upgradePaused, 'Choice waits for release'); await end(23);
    await page.waitForFunction(() => document.getElementById('screen-overlay').classList.contains('hidden')); await page.waitForTimeout(180); const upgradeResumed = await state(page);
    assert.equal(upgradeResumed.phase, 'playing'); assert.equal(upgradeResumed.upgradeStacks[upgradeId], 1);
    assert.ok(upgradeResumed.elapsed > upgradePaused.elapsed); assert.equal(upgradeResumed.x, upgradePaused.x); assert.equal(upgradeResumed.y, upgradePaused.y);
    assert.ok(!upgradeResumed.input.shoot && !upgradeResumed.input.moveX && !upgradeResumed.input.moveY); assert.equal(upgradeResumed.shots, upgradePaused.shots);
    record.checks.push({ name: 'third-finger-upgrade-tap-release-and-drag-cancel-while-old-sticks-held', fixture: 'Quiet scene plus XP threshold and _levelUp; native rAF opens the actual menu', upgradeId, upgradeHeld, upgradePaused, upgradeResumed });
    await tapThird(mapSelector, 24); await page.locator('#close-map').waitFor(); await page.waitForTimeout(250);
    record.mapLayout = await page.evaluate(() => { const content = document.getElementById('screen-content'); const box = selector => { const element = document.querySelector(selector), style = getComputedStyle(element), r = element.getBoundingClientRect(); return { display: style.display, visibility: style.visibility, opacity: style.opacity, x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { heading: box('#screen-title'), returnButton: box('#close-map'), targets: box('.salvage-destinations'), scrollHeight: content.scrollHeight, clientHeight: content.clientHeight, scrollTop: content.scrollTop }; });
    for (const part of [record.mapLayout.heading, record.mapLayout.returnButton, record.mapLayout.targets]) assert.ok(part.display !== 'none' && part.visibility !== 'hidden' && Number(part.opacity) > 0 && part.width > 0 && part.height > 0);
    await page.screenshot({ path: path.join(outputFolder, name + '-map-open.png') });
    const target = page.locator('[data-salvage-target]').first(), targetId = Number(await target.getAttribute('data-salvage-target')), targetSelector = '[data-salvage-target="' + targetId + '"]';
    await target.scrollIntoViewIfNeeded(); const trackingPaused = await state(page), destination = await point(page, targetSelector, 25);
    await start(destination); contacts.set(25, { ...destination, y: destination.y + 35 }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...contacts.values()] }); await end(25); await page.waitForTimeout(90);
    assert.deepEqual(await state(page), trackingPaused, 'Map target drag neither tracks nor resumes');
    await start(await point(page, targetSelector, 26)); await page.waitForTimeout(90); assert.deepEqual(await state(page), trackingPaused, 'Map target waits for release'); await end(26);
    await page.waitForFunction(() => document.getElementById('screen-overlay').classList.contains('hidden')); await page.waitForTimeout(180); const trackingResumed = await state(page);
    assert.equal(trackingResumed.salvage.selectedId, targetId); assert.ok(trackingResumed.elapsed > trackingPaused.elapsed);
    assert.equal(trackingResumed.x, trackingPaused.x); assert.equal(trackingResumed.y, trackingPaused.y); assert.ok(!trackingResumed.input.shoot && !trackingResumed.input.moveX && !trackingResumed.input.moveY); assert.equal(trackingResumed.shots, trackingPaused.shots);
    record.checks.push({ name: 'third-finger-map-target-tap-release-and-drag-cancel-while-old-sticks-held', targetId, trackingPaused, trackingResumed });
    await end(20); await end(21); const menuFreshBefore = await state(page);
    await start(await point(page, '#move-stick', 27, 28)); await start(await point(page, '#aim-stick', 28, 28)); await page.waitForTimeout(180); const menuFreshAfter = await state(page);
    assert.ok(menuFreshAfter.x > menuFreshBefore.x + 10 && menuFreshAfter.input.moveX > .5 && menuFreshAfter.input.shoot); assert.ok(menuFreshAfter.shots > menuFreshBefore.shots);
    await end(27); await end(28); record.checks.push({ name: 'fresh-sticks-after-third-finger-menu-selection', menuFreshBefore, menuFreshAfter });
    await tapThird(mapSelector, 29); await page.locator('#close-map').waitFor();
    const scrollState = () => page.evaluate(() => ['#screen-content', '.salvage-destinations'].map(selector => { const element = document.querySelector(selector); return { selector, scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }; }));
    const scrollBefore = await scrollState(), scrollable = [...scrollBefore].sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0], mapScrollPaused = await state(page);
    if (scrollable.scrollHeight > scrollable.clientHeight) {
      const swipe = await point(page, targetSelector, 30), direction = scrollable.scrollTop > 0 ? 1 : -1; await start(swipe);
      for (let step = 1; step <= 4; step++) { contacts.set(30, { ...swipe, y: swipe.y + direction * 70 * step / 4 }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...contacts.values()] }); await page.waitForTimeout(30); }
      await end(30); await page.waitForTimeout(120); const scrollAfter = await scrollState();
      assert.ok(Math.abs(scrollAfter.find(item => item.selector === scrollable.selector).scrollTop - scrollable.scrollTop) > 0, 'Primary native choice drag can scroll the menu');
      assert.deepEqual(await state(page), mapScrollPaused, 'Primary scrolling cannot track or resume');
      record.checks.push({ name: 'primary-native-map-scroll-does-not-select', scrollBefore, scrollAfter });
    }
    await page.screenshot({ path: path.join(outputFolder, name + '-map-native-scroll.png') });
    const outerBefore = (await scrollState())[0];
    if (outerBefore.scrollHeight > outerBefore.clientHeight) {
      const swipe = await point(page, '#tactical-map', 32); await start(swipe);
      for (let step = 1; step <= 4; step++) { contacts.set(32, { ...swipe, y: swipe.y - 100 * step / 4 }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...contacts.values()] }); await page.waitForTimeout(30); }
      await end(32); await page.waitForTimeout(120); const outerAfter = (await scrollState())[0];
      assert.ok(outerAfter.scrollTop > outerBefore.scrollTop, 'Native canvas-area swipe reveals the lower return control'); assert.deepEqual(await state(page), mapScrollPaused);
      record.checks.push({ name: 'primary-native-outer-map-scroll-reveals-return', outerBefore, outerAfter });
    }
    await page.screenshot({ path: path.join(outputFolder, name + '-map-return-visible.png') });
    await start(await point(page, '#close-map', 31)); await page.waitForTimeout(35); await end(31); await page.waitForFunction(() => document.getElementById('screen-overlay').classList.contains('hidden'));
    await page.locator(selector).tap(); await page.locator('#resume-run').waitFor(); await page.locator('#resume-run').tap(); await page.waitForTimeout(150);
    await page.locator(selector).tap(); await page.locator('#change-sector').tap(); await page.locator('#confirm-camp').tap(); await page.locator('#start-run').tap();
    for (const [kind, firstId] of [['relic', 40], ['tactic', 50]]) {
      const fixture = await page.evaluate(kind => { const g = __salvageTouch.game, terminal = (kind === 'relic' ? g.contracts : g.encounters)[0];
        g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = []; g.obstacles = []; g.spawnTimer = 999; g.sectorThreat.timer = 999;
        terminal.status = 'ready'; if (terminal.goal !== undefined) terminal.progress = terminal.goal;
        g.player.x = terminal.x; g.player.y = terminal.y; return { terminalId: terminal.id, x: terminal.x, y: terminal.y, entrance: 'Real configured terminal marked ready and actual Game.interact; no forced reward phase' }; }, kind);
      await page.waitForTimeout(60); await start(await point(page, '#move-stick', firstId, 28)); await start(await point(page, '#aim-stick', firstId + 1, 28)); await page.waitForTimeout(100);
      const rewardHeld = await state(page); assert.ok(rewardHeld.input.moveX > .5 && rewardHeld.input.shoot);
      const opened = await page.evaluate(() => __salvageTouch.game.interact()); assert.equal(opened, true);
      const attribute = 'data-' + kind; await page.locator('[' + attribute + ']').first().waitFor();
      const rewardId = await page.locator('[' + attribute + ']').first().getAttribute(attribute), rewardSelector = '[' + attribute + '="' + rewardId + '"]';
      await page.locator(rewardSelector).scrollIntoViewIfNeeded(); const rewardPaused = await state(page); assert.equal(rewardPaused.phase, kind);
      const swipe = await point(page, rewardSelector, firstId + 2); await start(swipe); contacts.set(firstId + 2, { ...swipe, y: swipe.y + 35 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...contacts.values()] }); await end(firstId + 2); await page.waitForTimeout(90); assert.deepEqual(await state(page), rewardPaused, 'Reward drag does not choose');
      await start(await point(page, rewardSelector, firstId + 3)); await page.waitForTimeout(90); assert.deepEqual(await state(page), rewardPaused, 'Reward waits for release'); await end(firstId + 3);
      await page.waitForFunction(() => document.getElementById('screen-overlay').classList.contains('hidden')); await page.waitForTimeout(180); const rewardResumed = await state(page);
      assert.equal(rewardResumed.phase, 'playing'); if (kind === 'relic') assert.equal(rewardResumed.relics.filter(id => id === rewardId).length, 1); else assert.equal(rewardResumed.tacticId, rewardId);
      assert.ok(rewardResumed.elapsed > rewardPaused.elapsed); assert.equal(rewardResumed.x, rewardPaused.x); assert.equal(rewardResumed.y, rewardPaused.y);
      assert.ok(!rewardResumed.input.shoot && !rewardResumed.input.moveX && !rewardResumed.input.moveY); assert.equal(rewardResumed.shots, rewardPaused.shots);
      record.checks.push({ name: 'third-finger-' + kind + '-tap-release-and-drag-cancel-with-old-sticks-held', fixture, rewardId, oldContacts: [...contacts.keys()], rewardHeld, rewardPaused, rewardResumed });
      await end(firstId); await end(firstId + 1); const freshBefore = await state(page);
      await start(await point(page, '#move-stick', firstId + 4, 28)); await start(await point(page, '#aim-stick', firstId + 5, 28)); await page.waitForTimeout(180); const freshAfter = await state(page);
      assert.ok(freshAfter.x > freshBefore.x + 10 && freshAfter.input.shoot && freshAfter.input.moveX > .5); assert.ok(freshAfter.shots > freshBefore.shots);
      await end(firstId + 4); await end(firstId + 5); record.checks.push({ name: 'fresh-sticks-after-' + kind + '-selection', freshBefore, freshAfter });
    }
    record.pointers = await page.evaluate(() => __salvageTouch.pointers); assert.ok(record.pointers.some(event => event.type === 'pointerdown' && event.target === selector.slice(1) && event.isPrimary === false));
    assert.ok(record.pointers.some(event => event.type === 'pointerdown' && event.target === 'resume-run' && event.isPrimary === false));
    assert.ok(record.pointers.some(event => event.type === 'pointerdown' && event.target === 'upgrade-' + upgradeId && event.isPrimary === false));
    assert.ok(record.pointers.some(event => event.type === 'pointerdown' && event.target === 'salvage-target-' + targetId && event.isPrimary === false));
    for (const kind of ['relic', 'tactic']) assert.ok(record.pointers.some(event => event.type === 'pointerdown' && event.target?.startsWith(kind + '-') && event.isPrimary === false));
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
