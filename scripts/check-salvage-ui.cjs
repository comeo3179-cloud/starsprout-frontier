'use strict';

// Rendered boundary fixtures are deliberately separate from natural runs.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || (() => { try { return require.resolve('playwright'); } catch { return require.resolve('../build-tools/browser/node_modules/playwright'); } })();
const { chromium } = require(playwrightPath), root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
const online = args.includes('--online'), release = online || args.includes('--release'), mode = online ? 'online' : release ? 'release' : 'source';
const option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const folder = release ? path.join(root, 'release/web') : root, origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4199';
const manifest = release ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const outputFolder = path.resolve(option('output', path.join(root, 'reports/expansion-6-7', `salvage-ui-${mode}-${version}`))), hash = body => crypto.createHash('sha256').update(body).digest('hex');
fs.mkdirSync(outputFolder, { recursive: true });
const report = { generatedAt: new Date().toISOString(), version, mode, files: {}, browserFiles: {}, cases: [], errors: [],
  method: 'Fresh guest Edge contexts; native menus, keys, taps and rAF. Observational Game/Store proxies retain product behavior. Explicit quiet-combat/position/near-arrival and fatal-HP fixtures isolate UI boundaries and are NOT natural wins. No real accounts/backend writes. Phone viewports are browser simulation. Online has no route/fulfill and checks all five HTTP files and actual loaded JS/CSS/SDK hashes.' };
const save = () => fs.writeFileSync(path.join(outputFolder, 'results.json'), JSON.stringify(report, null, 2) + '\n'), bytes = new Map();
if (!online) for (const file of release ? manifest.files.map(item => item.file) : ['index.html', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js', 'expedition.css', 'profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'vendor/cloudbase.full.js']) {
  const body = fs.readFileSync(path.join(folder, file)); bytes.set(file, body); report.files[file] = hash(body);
}
function observe(settings) {
  const q = window.__salvageUI = { events: [] }; let api, profileApi;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
    api = value; value.Game = new Proxy(value.Game, { construct(target, args, next) {
      const game = Reflect.construct(target, args, next); q.game = game;
      const drain = game.drainEvents; game.drainEvents = function() { const events = drain.call(this); q.events.push(...events); return events; }; return game;
    } });
  } });
  Object.defineProperty(window, 'FrontierProfiles', { configurable: true, get: () => profileApi, set(value) {
    profileApi = value; value.Store = new Proxy(value.Store, { construct(target, args, next) { const store = Reflect.construct(target, args, next); q.store = store; return store; } });
  } });
  localStorage.setItem('frontier-sound', 'off'); if (settings.legacyDone) localStorage.setItem('frontier-coach', 'done');
}
async function button(page, selector, mobile, require44 = true) {
  const target = page.locator(selector); await target.scrollIntoViewIfNeeded(); const rect = await target.boundingBox();
  assert.ok(rect && rect.width > 0 && rect.height > 0, selector + ' has geometry');
  if (mobile && require44) assert.ok(rect.width >= 43.9 && rect.height >= 43.9, selector + ' remains a 44px touch target');
  assert.equal(await target.evaluate(element => { const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return element === hit || element.contains(hit); }), true, selector + ' is actually reachable');
  if (mobile) await target.tap(); else await target.click(); return rect;
}
async function snapshot(page) {
  return page.evaluate(() => { const q = __salvageUI, g = q.game; return { mode: g.mode, phase: g.phase, elapsed: g.elapsed, x: g.player.x, y: g.player.y, hp: g.player.hp,
    salvage: g.salvage ? structuredClone(g.salvage) : null, profile: q.store.snapshot, coachHidden: document.getElementById('field-coach').classList.contains('hidden') }; });
}
async function visible(page, selector) {
  return page.locator(selector).evaluate(element => { const rect = element.getBoundingClientRect(); for (let parent = element; parent; parent = parent.parentElement) { const s = getComputedStyle(parent); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) <= .01) return false; } return rect.width > 0 && rect.height > 0 && rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1; });
}
async function quietVault(page) {
  await page.evaluate(() => {
    const g = __salvageUI.game, vault = g.salvage.sources.find(source => source.kind === 'vault');
    g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = []; g.salvage.pending = [];
    g.player.x = vault.x - 50; g.player.y = vault.y;
  });
}
async function action(page, mobile, selector, key) { if (mobile) await button(page, selector, true); else await page.keyboard.press(key); }
async function extractFixture(page, mobile, collected) {
  if (collected) {
    await quietVault(page); await action(page, mobile, '#skill-button', 'KeyQ');
    await page.waitForFunction(() => __salvageUI.game.salvage.sources.some(source => source.quietTimer > 0));
    await action(page, mobile, '#touch-interact', 'KeyE');
    await page.waitForFunction(() => __salvageUI.game.salvage.carried === 3);
  }
  await page.evaluate(() => { const g = __salvageUI.game, exit = g.salvage.exits[0]; g.player.x = exit.x; g.player.y = exit.y; });
  await action(page, mobile, '#touch-interact', 'KeyE');
  await page.waitForFunction(() => !!__salvageUI.game.salvage.evac);
  await page.evaluate(() => {
    // Near-arrival UI fixture. Exact full 10+3 seconds is tested independently
    // in engine tests and native original-stat browser runs, not claimed here.
    const g = __salvageUI.game, exit = g.salvage.exits[0]; g.salvage.pending = []; g.enemies = []; g.hazards = []; g.bullets = [];
    g.player.x = exit.x + 180; g.player.y = exit.y; g.salvage.evac.remaining = .2;
  });
  await page.waitForFunction(() => __salvageUI.game.salvage.status === 'boarding');
  await page.waitForFunction(() => /登舰/.test(document.getElementById('objective-text').textContent));
}
async function create(browser, viewport, settings, name) {
  const mobile = viewport.width < 1000, context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' }), loaded = {}, responses = [];
  if (!online) await context.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
    const file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    if (!bytes.has(file)) return route.fulfill({ status: file === 'favicon.ico' ? 204 : 404, body: '' });
    return route.fulfill({ body: bytes.get(file), contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
  });
  await context.addInitScript(observe, settings); const page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', error => report.errors.push({ name, message: error.message }));
  if (online) page.on('response', response => { const url = new URL(response.url()), file = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (url.origin === origin && manifest.files.some(item => item.file === file && /\.(js|css)$/.test(file))) responses.push(response.body().then(body => { loaded[file] = hash(body); }).catch(error => report.errors.push({ name, message: error.message })));
  });
  await page.goto(origin + '/?v=' + version, { waitUntil: 'domcontentloaded' });
  if (online && await page.locator('#submitBtn').count()) { assert.match(await page.locator('body').innerText(), /测试域名/); await page.locator('#submitBtn').click(); }
  await page.locator('#salvage-entry').waitFor(); await page.waitForFunction(() => __salvageUI.game && __salvageUI.store);
  if (online) { await page.waitForFunction(() => window.cloudbase); await Promise.all(responses); for (const item of manifest.files.filter(item => /\.(js|css)$/.test(item.file))) assert.equal(loaded[item.file], item.sha256, 'Actually loaded asset ' + item.file); Object.assign(report.browserFiles, loaded); }
  assert.ok((await page.locator('.version-label').innerText()).includes(version)); return { context, page, mobile };
}
async function scene(browser, viewport, kind = 'full') {
  const name = `${viewport.width}x${viewport.height}-${kind}`, record = { name, viewport, kind, pass: false, checks: [] }; let context, page;
  try {
    const created = await create(browser, viewport, { legacyDone: kind === 'legacy' }, name); ({ context, page } = created); const mobile = created.mobile;
    await button(page, '#salvage-entry', mobile);
    if (kind === 'full') {
      assert.equal(await page.locator('details.salvage-rules').getAttribute('open'), null);
      await page.locator('details.salvage-rules summary').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.salvageDifficulty), 'normal', 'Closed rules wrap focus to the first visible difficulty');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.matches('details.salvage-rules summary')), true, 'Reverse focus wraps to the visible summary, not its hidden child');
      await page.keyboard.press('Escape'); await page.locator('#salvage-entry').waitFor(); await button(page, '#salvage-entry', mobile);
      await button(page, '[data-salvage-difficulty="overload"]', mobile);
      for (const value of ['-1', '4294967296', 'text']) {
        await page.locator('#salvage-seed').fill(value); await button(page, '#start-salvage', mobile); assert.equal((await snapshot(page)).mode, 'expedition');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'salvage-seed');
      }
      await page.locator('#salvage-seed').fill('0'); await button(page, 'details.salvage-rules summary', mobile, false);
      await page.locator('#salvage-battlefield').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.salvageDifficulty), 'normal', 'Expanded rules button wraps inside the intro');
      await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'salvage-battlefield');
      record.checks.push({ name: 'closed-expanded-rules-forward-and-reverse-focus-trap' });
      await button(page, '#salvage-battlefield', mobile); await page.locator('[data-field-guide]').first().waitFor(); await button(page, '#close-battlefield', mobile);
      assert.equal(await page.locator('#salvage-seed').inputValue(), '0'); assert.equal(await page.locator('[data-salvage-difficulty="overload"]').getAttribute('aria-pressed'), 'true');
      record.checks.push({ name: 'native-intro-invalid-seeds-zero-and-guide-return' });
    } else await page.locator('#salvage-seed').fill('731');
    await button(page, '#start-salvage', mobile); await page.waitForFunction(() => __salvageUI.game.mode === 'salvage' && __salvageUI.game.phase === 'playing');
    await page.waitForTimeout(240); const initial = await snapshot(page);
    assert.deepEqual(initial.salvage.sources.map(source => source.status), ['locked', 'idle', 'locked', 'idle', 'flying']);
    assert.equal(initial.profile.coachDone, kind === 'legacy'); assert.equal(initial.coachHidden, kind === 'legacy');
    if (kind !== 'legacy') {
      // The existing short entry banner temporarily suppresses coarse-pointer
      // coaching; initial persistence above must remain false throughout.
      await page.waitForFunction(() => getComputedStyle(document.getElementById('field-coach')).display !== 'none');
      assert.equal(await visible(page, '#field-coach'), true, 'Fresh tutorial is visibly discoverable after the entry banner');
      assert.equal((await snapshot(page)).profile.coachDone, false);
    }
    for (const selector of ['#objective-text', '#relay-count', '#objective-toggle']) assert.equal(await visible(page, selector), true, selector + ' stays on screen');
    record.checks.push({ name: 'fresh-idle-locked-flying-do-not-complete-coach', profile: initial.profile });
    if (kind === 'legacy') { record.pass = true; return; }
    if (kind === 'full') {
      await page.keyboard.press('KeyM'); await page.locator('[data-salvage-target]').first().waitFor();
      assert.equal(await page.locator('[data-salvage-target]').count(), 7);
      const before = await snapshot(page); await page.keyboard.down('KeyD'); await page.waitForTimeout(240); await page.keyboard.up('KeyD'); assert.deepEqual(await snapshot(page), before, 'Tactical map freezes all source and combat state');
      const drone = before.salvage.sources.find(source => source.kind === 'drone'); await button(page, '[data-salvage-target="' + drone.id + '"]', mobile);
      await page.waitForFunction(() => document.getElementById('screen-overlay').classList.contains('hidden'));
      assert.equal((await snapshot(page)).salvage.selectedId, drone.id); assert.equal((await snapshot(page)).salvage.evac, null);
      record.checks.push({ name: 'seven-map-targets-freeze-and-selection-only' });
    }
    await extractFixture(page, mobile, kind !== 'empty');
    if (kind === 'full') {
      assert.equal(await visible(page, '#relay-progress-wrap'), true); assert.equal(await visible(page, '#relay-progress-label'), true);
      assert.equal(await page.locator('#objective-toggle').getAttribute('aria-expanded'), 'false');
      await button(page, '#objective-toggle', mobile); assert.equal(await visible(page, '#objective-details'), true);
      await button(page, '#objective-toggle', mobile); assert.equal(await visible(page, '#relay-progress-label'), true);
      await page.keyboard.press('KeyM'); await page.locator('[data-salvage-target]').first().waitFor();
      const current = await snapshot(page), other = current.salvage.exits[1], done = current.salvage.sources.find(source => source.status === 'collected');
      assert.equal(await page.locator('[data-salvage-target="' + other.id + '"]').isDisabled(), true);
      assert.equal(await page.locator('[data-salvage-target="' + done.id + '"]').isDisabled(), true);
      const boardPause = await snapshot(page); await page.waitForTimeout(240); assert.deepEqual(await snapshot(page), boardPause);
      await page.screenshot({ path: path.join(outputFolder, name + '-fixed-exit-map.png') }); await button(page, '#close-map', mobile);
      record.checks.push({ name: 'called-exit-and-collected-source-disable-and-boarding-map-freeze' });
    }
    await page.evaluate(() => { const g = __salvageUI.game, exit = g.salvage.exits[0]; g.player.x = exit.x; g.player.y = exit.y; });
    await page.locator('[data-salvage-result]').waitFor(); const status = kind === 'empty' ? 'withdrawn' : 'extracted';
    assert.equal(await page.locator('[data-salvage-result]').getAttribute('data-salvage-result'), status);
    const result = await snapshot(page); assert.equal(result.salvage.settled, kind === 'empty' ? 0 : 3); assert.equal(result.salvage.bonus, kind === 'empty' ? 0 : 240);
    assert.equal(result.profile.trial.wins, 0); assert.equal(result.profile.trial.bestWave, 0);
    if (kind === 'empty') assert.ok(!(await page.evaluate(() => __salvageUI.events.some(event => event.type === 'win'))));
    await page.screenshot({ path: path.join(outputFolder, name + '-result.png') }); record.checks.push({ name: 'native-boarding-result-' + status, state: result.salvage });
    if (kind === 'empty') {
      await button(page, '#salvage-new', mobile); const next = await snapshot(page); assert.equal(next.salvage.difficulty, result.salvage.difficulty); assert.equal(next.salvage.carried, 0); assert.equal(next.salvage.evac, null);
      record.checks.push({ name: 'new-run-has-fresh-runtime', previousSeed: result.salvage.seed, nextSeed: next.salvage.seed });
    } else {
      await button(page, '#salvage-retry', mobile); const retry = await snapshot(page); assert.equal(retry.salvage.seed, 0); assert.equal(retry.salvage.difficulty, 'overload'); assert.equal(retry.salvage.carried, 0); assert.equal(retry.salvage.evac, null);
      await quietVault(page); await action(page, mobile, '#skill-button', 'KeyQ'); await action(page, mobile, '#touch-interact', 'KeyE');
      await page.evaluate(() => { const g = __salvageUI.game; g.player.hp = 1; g.player.invulnerable = 0; g._addHazard('blast', g.player.x, g.player.y, 40, .01, 14); });
      await page.locator('[data-salvage-result="failed"]').waitFor(); const failed = await snapshot(page);
      assert.equal(failed.salvage.lostSamples, 3); assert.equal(failed.salvage.bonus, 0); assert.equal(failed.salvage.carried, 0);
      await button(page, '#salvage-camp', mobile); assert.equal((await snapshot(page)).salvage, null); await page.locator('#salvage-entry').waitFor();
      record.checks.push({ name: 'same-seed-retry-real-fatal-event-and-camp-isolation' });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); record.pass = true;
  } catch (error) { record.error = error.stack; if (page) await page.screenshot({ path: path.join(outputFolder, name + '-failure.png') }).catch(() => {}); }
  finally { if (context) await context.close(); report.cases.push(record); save(); }
}
(async () => {
  const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), browser = await chromium.launch({ channel, headless: true }); report.browser = browser.version();
  try {
    if (online) { const context = await browser.newContext(); report.httpFiles = {}; try { for (const item of manifest.files) { const response = await context.request.get(origin + '/' + item.file + '?salvage-ui-verify=' + Date.now(), { timeout: 30000, headers: { 'cache-control': 'no-cache' } }); assert.equal(response.status(), 200); report.httpFiles[item.file] = hash(await response.body()); assert.equal(report.httpFiles[item.file], item.sha256); } } finally { await context.close(); } }
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 360, height: 640 }]) await scene(browser, viewport);
    await scene(browser, { width: 1440, height: 1000 }, 'empty'); await scene(browser, { width: 844, height: 390 }, 'legacy');
  } finally { await browser.close(); save(); }
  console.log(JSON.stringify({ mode, version, passed: report.cases.filter(item => item.pass).length, total: report.cases.length, errors: report.errors.length, outputFolder }));
  assert.ok(report.cases.length === 6 && report.cases.every(item => item.pass) && !report.errors.length, 'All six native rendered boundary scenes pass');
})().catch(error => { report.fatal = error.stack; save(); console.error(error.stack); process.exitCode = 1; });
