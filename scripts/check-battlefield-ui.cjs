'use strict';
// Native menu/focus/pause checks. No combat completion, damage or account fixture.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || (() => { try { return require.resolve('playwright'); } catch { return require.resolve('../build-tools/browser/node_modules/playwright'); } })();
const { chromium } = require(playwrightPath);
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
const online = args.includes('--online'), release = online || args.includes('--release');
const mode = online ? 'online' : release ? 'release' : 'source';
const option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const folder = release ? path.join(root, 'release/web') : root;
const origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4198';
const manifest = release ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const outputFolder = path.resolve(option('output', path.join(root, 'reports/expansion-6-7', `battlefield-ui-${mode}-${version}`)));
fs.mkdirSync(outputFolder, { recursive: true });
const output = path.join(outputFolder, 'results.json'), hash = body => crypto.createHash('sha256').update(body).digest('hex');
const report = { generatedAt: new Date().toISOString(), version, mode, files: {}, browserFiles: {}, cases: [], errors: [],
  method: 'Fresh isolated guest Edge contexts, actual menu clicks, keyboard navigation and native rAF. An observational Game-constructor proxy exposes state without changing actions, combat or stats. No account login, backend mock or cloud writes. Source/release route real local bytes; online has no route/fulfill and verifies five manifest files plus actual browser JS/CSS/SDK hashes. Phone viewports are simulated, not physical-device certification.' };
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const bytes = new Map();
if (!online) for (const file of release ? manifest.files.map(item => item.file) : ['index.html', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js', 'expedition.css', 'profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'vendor/cloudbase.full.js']) {
  const body = fs.readFileSync(path.join(folder, file)); bytes.set(file, body); report.files[file] = hash(body);
}
function observe() {
  let api;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
    api = value; value.Game = new Proxy(value.Game, { construct(target, args, next) {
      const game = Reflect.construct(target, args, next); window.__fieldUI = { game }; return game;
    } });
  } });
  localStorage.setItem('frontier-sound', 'off');
}
async function state(page) {
  return page.evaluate(() => { const g = __fieldUI.game; return { mode: g.mode, phase: g.phase, elapsed: g.elapsed, x: g.player.x, y: g.player.y, hp: g.player.hp }; });
}
async function button(page, selector, mobile) {
  const target = page.locator(selector); await target.scrollIntoViewIfNeeded();
  const rect = await target.boundingBox(); assert.ok(rect && rect.width > 0 && rect.height > 0, selector + ' has a real target');
  if (mobile) assert.ok(rect.width >= 43.9 && rect.height >= 43.9, selector + ' is a 44px touch target');
  assert.equal(await target.evaluate(element => {
    const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return element === hit || element.contains(hit);
  }), true, selector + ' is actually reachable at its center');
  if (mobile) await target.tap(); else await target.click();
  return rect;
}
async function guide(page, mobile, checks) {
  await page.locator('#close-battlefield').waitFor();
  const metadata = await page.evaluate(() => Expedition.BATTLEFIELD_GUIDE.map(item => ({ id: item.id, title: item.title, description: item.description })));
  assert.ok(metadata.length >= 5, 'Actual metadata covers new enemies and terrain');
  assert.equal(await page.locator('[data-field-guide]').count(), metadata.length);
  for (const item of metadata) {
    const card = page.locator('[data-field-guide="' + item.id + '"]');
    await card.scrollIntoViewIfNeeded();
    const text = await card.innerText(); assert.ok(text.includes(item.title) && text.includes(item.description));
    const geometry = await card.evaluate(element => {
      const r = element.getBoundingClientRect(), title = element.querySelector('h3').getBoundingClientRect();
      return { x: r.x, right: r.right, titleX: title.x, titleRight: title.right, viewport: innerWidth, fits: element.scrollWidth <= element.clientWidth + 1 };
    });
    assert.ok(geometry.fits && geometry.x >= -1 && geometry.right <= geometry.viewport + 1 && geometry.titleX >= geometry.x && geometry.titleRight <= geometry.right + 1, item.id + ' text fits');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No horizontal menu overflow');
  await page.locator('#close-battlefield').scrollIntoViewIfNeeded();
  await page.locator('#close-battlefield').focus();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'close-battlefield');
  const before = await state(page); await page.keyboard.down('KeyD'); await page.waitForTimeout(240); await page.keyboard.up('KeyD');
  assert.deepEqual(await state(page), before, 'Guide freezes native combat and ignores movement');
  checks.push({ name: 'actual-guide-metadata-fit-focus-and-freeze', ids: metadata.map(item => item.id), state: before });
}
async function scene(browser, viewport) {
  const name = viewport.width + 'x' + viewport.height, record = { name, viewport, checks: [], pass: false };
  const mobile = viewport.width < 1000;
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  let page; const responses = [], loaded = {};
  try {
    if (!online) await context.route('**/*', async route => {
      const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
      const file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      if (!bytes.has(file)) return route.fulfill({ status: file === 'favicon.ico' ? 204 : 404, body: '' });
      await route.fulfill({ body: bytes.get(file), contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
    });
    await context.addInitScript(observe); page = await context.newPage();
    page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000);
    page.on('pageerror', error => report.errors.push({ name, message: error.message }));
    if (online) page.on('response', response => {
      const url = new URL(response.url()), file = decodeURIComponent(url.pathname).replace(/^\//, '');
      if (url.origin === origin && manifest.files.some(item => item.file === file && /\.(js|css)$/.test(file))) responses.push(response.body().then(body => { loaded[file] = hash(body); }).catch(error => report.errors.push({ name, message: error.message })));
    });
    await page.goto(origin + '/?v=' + version, { waitUntil: 'domcontentloaded' });
    if (online && await page.locator('#submitBtn').count()) {
      assert.match(await page.locator('body').innerText(), /测试域名/); await page.locator('#submitBtn').click();
      record.checks.push({ name: 'first-visit-domain-notice-native-click' });
    }
    await page.locator('#open-battlefield').waitFor();
    assert.ok((await page.locator('.version-label').innerText()).includes(version));
    assert.ok((await page.locator('#screen-content .screen-kicker').innerText()).includes(version));
    if (online) {
      await page.waitForFunction(() => window.cloudbase); await Promise.all(responses);
      for (const file of manifest.files.filter(item => /\.(js|css)$/.test(item.file))) assert.equal(loaded[file.file], file.sha256, 'Actually loaded asset ' + file.file);
      Object.assign(report.browserFiles, loaded);
    }
    const preserved = ['#start-run', '[data-map="frontier"]', '[data-map="foundry"]', '[data-map="frost"]', '[data-map="storm"]', '[data-map="ruins"]', '#campaign-entry', '#voyage-entry', '#open-trials', '#open-rifts', '#open-evolutions', '#open-secrets'];
    for (const selector of preserved) { assert.equal(await page.locator(selector).count(), 1, 'Old entry ' + selector); await page.locator(selector).click({ trial: true }); }
    record.checks.push({ name: 'old-camp-entries-remain-usable', selectors: preserved });
    await button(page, '#open-battlefield', mobile); await guide(page, mobile, record.checks);
    await page.screenshot({ path: path.join(outputFolder, name + '-camp-guide.png') });
    await page.keyboard.press('Escape'); await page.locator('#start-run').waitFor();
    await button(page, '#voyage-entry', mobile);
    await page.locator('[data-voyage-device="mirror"]').click();
    await page.locator('[data-voyage-difficulty="overload"]').click(); await page.locator('#voyage-seed').fill('314');
    await button(page, '#voyage-battlefield', mobile); await guide(page, mobile, record.checks);
    await button(page, '#close-battlefield', mobile);
    assert.equal(await page.locator('#voyage-seed').inputValue(), '314');
    assert.equal(await page.locator('[data-voyage-device="mirror"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-voyage-difficulty="overload"]').getAttribute('aria-pressed'), 'true');
    record.checks.push({ name: 'preparation-return-preserves-device-difficulty-seed' });
    await button(page, '#start-voyage', mobile);
    await page.waitForFunction(() => __fieldUI.game.mode === 'voyage' && __fieldUI.game.phase === 'playing');
    await page.locator('#pause-toggle').click(); await page.locator('#pause-battlefield').waitFor();
    const paused = await state(page); await button(page, '#pause-battlefield', mobile); await guide(page, mobile, record.checks);
    await page.screenshot({ path: path.join(outputFolder, name + '-paused-guide.png') });
    await page.keyboard.press('Escape'); await page.locator('#resume-run').waitFor(); assert.deepEqual(await state(page), paused);
    await button(page, '#resume-run', mobile); await page.waitForTimeout(180);
    const resumed = await state(page); assert.ok(resumed.elapsed > paused.elapsed);
    assert.equal(resumed.x, paused.x); assert.equal(resumed.y, paused.y);
    record.checks.push({ name: 'paused-guide-escape-keeps-pause-resume-clears-input', paused, resumed });
    record.pass = true;
  } catch (error) {
    record.error = error.stack; if (page) await page.screenshot({ path: path.join(outputFolder, name + '-failure.png') }).catch(() => {});
  } finally { await context.close(); report.cases.push(record); save(); }
}
(async () => {
  const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  const browser = await chromium.launch({ channel, headless: true }); report.browser = browser.version();
  try {
    if (online) {
      const context = await browser.newContext(); report.httpFiles = {};
      try {
        for (const item of manifest.files) {
          const response = await context.request.get(origin + '/' + item.file + '?field-ui-verify=' + Date.now(), { timeout: 30000, headers: { 'cache-control': 'no-cache' } });
          assert.equal(response.status(), 200); report.httpFiles[item.file] = hash(await response.body()); assert.equal(report.httpFiles[item.file], item.sha256, item.file);
        }
      } finally { await context.close(); }
    }
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 360, height: 640 }]) await scene(browser, viewport);
  } finally { await browser.close(); save(); }
  console.log(JSON.stringify({ mode, version, passed: report.cases.filter(item => item.pass).length, total: report.cases.length, errors: report.errors.length, output }));
  assert.ok(report.cases.length === 4 && report.cases.every(item => item.pass) && !report.errors.length, 'Every guide and preserved entry must work');
})().catch(error => { report.fatal = error.stack; save(); console.error(error.stack); process.exitCode = 1; });
