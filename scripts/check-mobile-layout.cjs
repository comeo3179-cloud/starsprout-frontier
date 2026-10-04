/* Browser layout acceptance: isolated contexts, in-memory fixture states, no server or saved profile. */
// Usage: node scripts/check-mobile-layout.cjs [--release]
// Install Playwright locally or set PLAYWRIGHT_MODULE; PLAYWRIGHT_CHANNEL defaults to msedge.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) {
  if (process.env.PLAYWRIGHT_MODULE) throw error;
  ({ chromium } = require('../build-tools/browser/node_modules/playwright'));
}
const root = path.resolve(__dirname, '..');
const release = process.argv.includes('--release');
const source = release ? path.join(root, 'release', 'web') : root;
const origin = 'http://127.0.0.1:4176';
const label = release ? 'release' : 'source';
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const output = path.join(root, 'reports', `mobile-layout-${label}-${version}.json`);
const servedFiles = new Map();
const result = { timestamp: new Date().toISOString(), mode: label, expectedVersion: version,
  note: 'Headless Edge with isolated mobile contexts. Synthetic full-charge, upgrade, relic and defeat states verify UI, not balance or real-device performance. Source files are served through route.fulfill; no server, user profile, or user saved data is used.',
  files: {}, cases: [], errors: [] };
const controls = '#reload-button,#touch-overdrive,#move-stick,#aim-stick,#touch-interact,#dash-button,#skill-button,#reactor-button,#field-map-toggle,#fullscreen-pause,#fullscreen-exit,#interaction-hint,[data-weapon]';
function save() { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2)); }
async function local(context) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = path.resolve(source, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(source + path.sep)) return route.abort();
    try {
      if (!servedFiles.has(file)) servedFiles.set(file, fs.readFileSync(file));
      const body = servedFiles.get(file);
      result.files[path.relative(source, file)] = crypto.createHash('sha256').update(body).digest('hex');
      await route.fulfill({ status: 200, body, contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'text/plain' });
    } catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  // Observe the existing constructor before either source scripts or the release bundle loads.
  await context.addInitScript(() => {
    let api;
    Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
      api = value;
      api.Game = new Proxy(api.Game, { construct(target, args, next) {
        const game = Reflect.construct(target, args, next);
        window.__layoutGame = game;
        return game;
      } });
    } });
  });
}
async function settle(page) { await page.waitForTimeout(180); }
async function controlLayout(page) {
  return page.locator(controls).evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    const visible = box.width > 0 && box.height > 0;
    const bar = element.dataset.weapon !== undefined ? element.closest('.weapons-hud').getBoundingClientRect() : null;
    const inBar = !bar || box.x >= bar.x - .5 && box.right <= bar.right + .5;
    return { id: element.id || 'weapon-' + element.dataset.weapon, visible, inBar,
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      hits: visible ? [[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]].map(([fx,fy]) => {
        const hit = document.elementFromPoint(box.x + box.width * fx, box.y + box.height * fy);
        return { pass: hit === element || element.contains(hit), target: hit?.id || hit?.className || null };
      }) : [] };
  }));
}
async function checkControls(page, record, name) {
  const layout = await controlLayout(page);
  record.checks.push({ name, viewport: page.viewportSize(), layout });
  for (const item of layout.filter(item => item.visible)) {
    if (item.id !== 'interaction-hint' && item.inBar) assert.ok(item.hits.every(hit => hit.pass), name + ': obscured control ' + item.id);
    if (['reload-button','touch-overdrive','touch-interact','field-map-toggle','fullscreen-pause','fullscreen-exit'].includes(item.id))
      assert.ok(item.rect.height >= 44 && item.rect.width >= 44, name + ': small touch target ' + item.id);
  }
  const starcore = layout.find(item => item.id === 'touch-overdrive' && item.visible);
  if (starcore) for (const item of layout.filter(item => item.visible && item.inBar && item !== starcore)) {
    const a = starcore.rect, b = item.rect;
    const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    assert.equal(overlap, 0, name + ': starcore overlaps ' + item.id);
  }
}
async function checkCompactHud(page, record) {
  const hud = await page.evaluate(() => {
    const stage = document.getElementById('game-stage').getBoundingClientRect();
    const selectors = ['.player-hud','.map-hud','.objective-hud','.field-coach','.boss-hud','.weapons-hud','.ammo-hud','.skill-hud','#move-stick','#aim-stick','#touch-interact','#touch-overdrive','.fullscreen-controls'];
    const rects = selectors.map(selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      const x = Math.max(stage.x, r.x), y = Math.max(stage.y, r.y);
      return { selector, x, y, width: Math.max(0, Math.min(stage.right, r.right) - x), height: Math.max(0, Math.min(stage.bottom, r.bottom) - y) };
    }).filter(r => r.width && r.height);
    const area = items => {
      let total = 0;
      const xs = [...new Set(items.flatMap(r => [r.x,r.x+r.width]))].sort((a,b) => a-b);
      for (let i = 1; i < xs.length; i++) {
        const intervals = items.filter(r => r.x < xs[i] && r.x+r.width > xs[i-1]).map(r => [r.y,r.y+r.height]).sort((a,b) => a[0]-b[0]);
        let start = 0, end = 0, length = 0;
        for (const [a,b] of intervals) { if (a > end) { length += end-start; start = a; end = b; } else end = Math.max(end,b); }
        total += (xs[i]-xs[i-1]) * (length+end-start);
      }
      return total;
    };
    const readouts = ['health-number','objective-text','dash-button','skill-button'].map(id => {
      const element = document.getElementById(id), r = element.getBoundingClientRect();
      return { id, text: element.textContent.trim(), visible: r.width > 0 && r.height > 0 && getComputedStyle(element).visibility !== 'hidden' };
    });
    const weapons = [...document.querySelectorAll('[data-weapon]')].map(e => ({ id: e.dataset.weapon, visible: e.getBoundingClientRect().width > 0 }));
    const weaponCount = Expedition.WEAPONS.length;
    const top = rects.filter(r => ['.player-hud','.map-hud','.objective-hud','.field-coach','.boss-hud'].includes(r.selector));
    return { meaning: 'Union of HUD rectangles clipped to stage, not opaque-pixel coverage.', stage: { width: stage.width, height: stage.height }, rects, topHudRatio: area(top)/(stage.width*stage.height), allHudRatio: area(rects)/(stage.width*stage.height), readouts, weapons, weaponCount, minimapVisible: document.getElementById('minimap').getBoundingClientRect().height > 0 };
  });
  record.hud = hud;
  assert.ok(hud.readouts.every(item => item.visible && item.text), 'Health, current target and skills stay visible');
  assert.equal(hud.weapons.filter(item => item.visible).length, hud.weaponCount, 'Every weapon has a visible slot');
  // The compact HUD may hide the radar canvas, but its actual touch entrance must pause the game.
  await page.locator('#field-map-toggle').tap();
  await page.waitForSelector('#tactical-map');
  const before = await page.evaluate(() => __layoutGame.elapsed);
  await page.waitForTimeout(160);
  const during = await page.evaluate(() => __layoutGame.elapsed);
  assert.equal(during, before, 'Touch tactical map pauses the simulation');
  await page.locator('#close-map').tap();
  await page.waitForFunction(seconds => __layoutGame.elapsed > seconds, before);
  record.checks.push({ name: 'touch-map-pauses-and-returns', before, during, after: await page.evaluate(() => __layoutGame.elapsed) });
  await page.evaluate(() => { const g = __layoutGame, relay = g.relays[0]; g.player.x = relay.x; g.player.y = relay.y; g.interact(); });
  await page.waitForFunction(() => !document.getElementById('relay-progress-wrap').classList.contains('hidden'));
  const progress = await page.locator('#relay-progress-label').evaluate(element => ({ text: element.textContent.trim(), visible: element.getBoundingClientRect().height > 0 }));
  assert.ok(progress.visible && progress.text, 'Charging mission progress stays visible in the compact HUD');
  record.checks.push({ name: 'charging-mission-progress', ...progress });
}
async function checkMenu(page, record, name) {
  const options = [];
  for (const button of await page.locator('#screen-content button:not(:disabled)').all()) {
    await button.click({ trial: true });
    options.push({ text: (await button.innerText()).replace(/\s+/g, ' ').slice(0, 90), rect: await button.boundingBox() });
  }
  assert.ok(options.length, name + ': menu has an action');
  record.checks.push({ name, viewport: page.viewportSize(), options });
}
async function rotateMenu(page, record, name, size) {
  await checkMenu(page, record, name);
  await page.setViewportSize({ width: size.height, height: size.width });
  await settle(page);
  await checkMenu(page, record, name + '-rotated');
  await page.setViewportSize(size);
  await settle(page);
}
async function runCase(browser, width, height, fullscreen) {
  const size = { width, height };
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const record = { size, fullscreen, checks: [], errors: [], passed: false };
  result.cases.push(record);
  try {
    await local(context);
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => record.errors.push(error.message));
    await page.goto(origin + '/');
    assert.ok((await page.locator('.screen-kicker').textContent()).includes(version), 'The camp shows the current version');
    assert.ok((await page.locator('.version-label').textContent()).includes(version), 'The header shows the current version');
    if (fullscreen) { await page.locator('#fullscreen-toggle').tap(); assert.ok(await page.evaluate(() => !!document.fullscreenElement)); }
    await checkMenu(page, record, 'welcome');
    await page.locator('#start-run').tap();
    await checkCompactHud(page, record);
    await page.evaluate(() => { scrollTo(0, 0); __layoutGame.reactor.charge = __layoutGame.reactor.maxCharge; });
    await page.waitForFunction(() => !document.getElementById('touch-overdrive').classList.contains('hidden'));
    await settle(page);
    await checkControls(page, record, 'starcore-ready');
    await page.evaluate(() => { const g = __layoutGame, crate = g.crates[0]; g.player.x = crate.x; g.player.y = crate.y; });
    await page.waitForFunction(() => !document.getElementById('interaction-hint').classList.contains('hidden'));
    await checkControls(page, record, 'starcore-ready-near-supply');
    // This was the regression: tapping weapon five activated the overlapping starcore button.
    await page.locator('[data-weapon="4"]').tap();
    assert.equal(await page.evaluate(() => __layoutGame.player.weapon), 4);
    assert.equal(await page.evaluate(() => __layoutGame.reactor.timer), 0);
    await page.setViewportSize({ width: height, height: width });
    await settle(page);
    assert.ok(await page.locator('#resume-run').isVisible(), 'Rotation safely pauses the run');
    await page.locator('#resume-run').tap();
    await checkControls(page, record, 'starcore-ready-rotated');
    await page.setViewportSize(size);
    await settle(page);
    assert.ok(await page.locator('#resume-run').isVisible(), 'Rotating back safely pauses the run');
    await page.locator('#resume-run').tap();
    await page.locator('#touch-overdrive').tap();
    assert.ok(await page.evaluate(() => __layoutGame.reactor.timer > 0));
    await settle(page);
    await checkControls(page, record, 'starcore-active');
    const weaponSlots = await page.evaluate(() => Expedition.WEAPONS.map((weapon, index) => index));
    for (const weapon of weaponSlots) {
      await page.locator(`[data-weapon="${weapon}"]`).tap();
      assert.equal(await page.evaluate(() => __layoutGame.player.weapon), weapon);
    }
    record.checks.push({ name: 'all-weapon-slots-reachable', weaponSlots });
    if (fullscreen && ((width === 390 && height === 844) || (width === 667 && height === 375)))
      await page.screenshot({ path: path.join(root, 'reports', `mobile-layout-${label}-${version}-${width}x${height}.png`) });
    await page.locator(fullscreen ? '#fullscreen-pause' : '#pause-toggle').tap();
    await rotateMenu(page, record, 'pause', size);
    await page.locator('#screen-content button').filter({ hasText: '战术地图' }).tap();
    await rotateMenu(page, record, 'map', size);
    await page.locator('#close-map').tap();
    await page.locator('#resume-run').tap();
    await page.evaluate(() => { const g = __layoutGame; g.player.xp = g.player.xpNeeded; g._levelUp(); });
    await page.waitForSelector('[data-upgrade]');
    await rotateMenu(page, record, 'upgrade', size);
    await page.locator('[data-upgrade]').last().tap();
    await page.evaluate(() => { const g = __layoutGame, contract = g.contracts[0]; g.player.x = contract.x; g.player.y = contract.y; contract.status = 'ready'; g.interact(); });
    await page.waitForSelector('[data-relic]');
    await rotateMenu(page, record, 'relic', size);
    await page.locator('[data-relic]').last().tap();
    await page.evaluate(() => { const g = __layoutGame; g.player.invulnerable = 0; g._damagePlayer(9999, { kind: 'layout-fixture', name: '布局验证威胁', hint: '用于验证失败面板、致命伤说明和再次远征按钮是否在横竖屏切换后可达。' }); });
    await page.waitForSelector('#play-again');
    await rotateMenu(page, record, 'defeat', size);
    await page.locator('#play-again').tap();
    assert.equal(await page.evaluate(() => __layoutGame.phase), 'playing');
    assert.deepEqual(record.errors, []);
    record.passed = true;
  } catch (error) {
    record.failure = error.message;
    const page = context.pages()[0];
    if (page) await page.screenshot({ path: path.join(root, 'reports', `mobile-layout-${label}-${version}-${width}x${height}-${fullscreen ? 'full' : 'window'}-failure.png`) }).catch(() => {});
  } finally {
    await context.close();
    save();
    console.log(JSON.stringify({ size, fullscreen, passed: record.passed, checks: record.checks.length, failure: record.failure }));
  }
}
(async () => {
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  result.browser = browser.version();
  try { for (const [width,height] of [[360,640],[390,844],[667,375],[844,390]]) for (const fullscreen of [false,true]) await runCase(browser, width, height, fullscreen); }
  finally { await browser.close(); save(); }
  if (result.cases.some(item => !item.passed)) process.exitCode = 1;
})().catch(error => { result.errors.push(error.stack); save(); console.error(error); process.exitCode = 1; });
