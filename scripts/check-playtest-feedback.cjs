'use strict';

// Independent rendered feedback regression. Fixtures prepare a target position
// or quiet combat; all input, rAF, UI, events and persistence stay real.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2), baseline = args.includes('--baseline'), online = args.includes('--online'), release = online || args.includes('--release');
const mode = online ? 'online' : release ? 'release' : 'source';
const folder = baseline ? path.join(root, 'reports/playtest-feedback-baseline-source-5.0.0') : release ? path.join(root, 'release/web') : root;
const version = JSON.parse(fs.readFileSync(path.join(baseline ? folder : root, 'package.json'), 'utf8')).version;
const origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4197';
const manifest = release ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const filter = args.includes('--case') ? args[args.indexOf('--case') + 1] : '';
const outputFolder = path.join(root, 'reports', 'playtest-feedback-' + mode + (baseline ? '-baseline' : '') + '-' + version);
fs.mkdirSync(outputFolder, { recursive: true });
const output = path.join(outputFolder, filter ? 'results-' + filter.replace(/[^a-z0-9-]/gi, '_') + '.json' : 'results.json');
const report = { generatedAt: new Date().toISOString(), mode, baseline, version, files: {}, browserFiles: {}, cases: [], errors: [],
  note: 'Fresh guest Edge contexts, native inputs and rAF. Quiet-combat/position fixtures isolate UI boundaries and are not natural playthroughs. Original game, renderer, UI and profile store run unchanged. No real account login/cloud writes. Online never route/fulfills responses and checks five hosted files plus actual JS/CSS/SDK hashes. Phone viewports/CDP touches are not physical-device/Safari certification.' };
const bytes = new Map();
if (release && !online) for (const item of manifest.files) bytes.set(item.file, fs.readFileSync(path.join(folder, item.file)));
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
function observe(settings) {
  const q = window.__feedbackQA = { events: [] }; let api, profileApi, rendererApi, cloudApi;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
    api = value; api.Game = new Proxy(api.Game, { construct(target, args, next) {
      const game = Reflect.construct(target, args, next); q.game = game;
      const drain = game.drainEvents;
      game.drainEvents = function() { const events = drain.call(this); q.events.push(...events.map(event => ({ ...event }))); return events; };
      return game;
    } });
  } });
  Object.defineProperty(window, 'FrontierProfiles', { configurable: true, get: () => profileApi, set(value) {
    profileApi = value; value.Store = new Proxy(value.Store, { construct(target, args, next) { const store = Reflect.construct(target, args, next); q.store = store; return store; } });
  } });
  Object.defineProperty(window, 'ExpeditionRenderer', { configurable: true, get: () => rendererApi, set(value) {
    rendererApi = new Proxy(value, { construct(target, args, next) { const renderer = Reflect.construct(target, args, next); q.renderer = renderer; return renderer; } });
  } });
  localStorage.setItem('frontier-sound', 'off');
  if (settings.legacyDone) localStorage.setItem('frontier-coach', 'done');
  if (settings.mockAccounts) {
    let session = { uid: 'QA-A', label: '模拟玩家 A' }; const listeners = new Set(), snapshots = new Map(); q.mockCalls = [];
    localStorage.setItem('frontier-account-v1', JSON.stringify(session));
    Object.defineProperty(window, 'FrontierCloud', { configurable: true, get: () => cloudApi, set() {
      // Explicit synthetic account facade. Product Store/session reconciliation
      // still run; this is not authentication/backend authorization evidence.
      cloudApi = {
        async init() { return session; }, async getSession() { return session; }, onSession(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        adapter: {
          async load(uid) { return structuredClone(snapshots.get(uid) || FrontierProfiles.normalizeSnapshot()); },
          async merge(uid, payload) { q.mockCalls.push({ uid, payload: structuredClone(payload) }); const snapshot = FrontierProfiles.mergeSnapshots(snapshots.get(uid), payload); snapshots.set(uid, snapshot); return { snapshot: structuredClone(snapshot), acknowledgedRunIds: [], legacyAccepted: false }; }
        }
      };
      q.switchSession = uid => { session = { uid, label: '模拟玩家 ' + uid }; listeners.forEach(fn => fn(session)); };
    } });
  }
}
async function create(browser, name, viewport, settings = {}) {
  const mobile = viewport.width < 1000, context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  if (!online) await context.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
    const file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', target = path.resolve(folder, file);
    if (!target.startsWith(folder + path.sep)) return route.abort();
    try {
      if (!bytes.has(file)) bytes.set(file, fs.readFileSync(target)); const body = bytes.get(file);
      report.files[file] = crypto.createHash('sha256').update(body).digest('hex');
      await route.fulfill({ body, contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
    } catch { await route.fulfill({ status: file === 'favicon.ico' ? 204 : 404, body: '' }); }
  });
  await context.addInitScript(observe, settings);
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000); page.on('pageerror', error => report.errors.push({ name, message: error.message }));
  const responses = [], loaded = {};
  if (online) page.on('response', response => {
    const url = new URL(response.url()), file = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (url.origin === origin && manifest.files.some(item => item.file === file && /\.(js|css)$/.test(file))) responses.push(response.body().then(body => { loaded[file] = crypto.createHash('sha256').update(body).digest('hex'); }).catch(error => { report.errors.push({ name, message: error.message }); }));
  });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  if (online && await page.locator('#submitBtn').count()) {
    const text = await page.locator('body').innerText(); assert.match(text, /测试域名/);
    await page.screenshot({ path: path.join(outputFolder, name + '-first-visit-notice.png') });
    await page.locator('#submitBtn').click(); (report.firstVisitNotices ||= []).push({ name, text: text.slice(0, 200), acknowledgedByNativeClick: true });
  }
  await page.locator('#start-run').waitFor(); await page.waitForFunction(() => __feedbackQA.game && __feedbackQA.store && __feedbackQA.renderer);
  if (online) {
    if (!settings.mockAccounts) await page.waitForFunction(() => window.cloudbase);
    await Promise.all(responses); Object.assign(report.browserFiles, loaded);
    for (const item of manifest.files.filter(item => /\.(js|css)$/.test(item.file) && !(settings.mockAccounts && item.file === 'vendor/cloudbase.full.js'))) assert.equal(loaded[item.file], item.sha256, 'Actually loaded hosted file: ' + item.file);
    if (settings.mockAccounts) report.mockAccountSdkPolicy = 'Explicit synthetic Cloud.init does not dynamically load the real SDK. This case verifies actual JS/CSS only; normal cases require actual SDK response hashes, and all five hosted files are independently HTTP verified.';
  }
  return { page, context, mobile };
}
async function state(page) {
  return page.evaluate(() => {
    const q = __feedbackQA, g = q.game, coach = document.getElementById('field-coach');
    return { phase: g.phase, elapsed: g.elapsed, map: g.map.id, relays: g.relays.map(r => ({ id: r.id, status: r.status })), snapshot: q.store.snapshot,
      coach: { hidden: coach.classList.contains('hidden'), step: coach.dataset.step, text: document.getElementById('coach-text').textContent }, events: q.events.map(e => ({ ...e })) };
  });
}
async function start(page, map, mobile) {
  await page.locator('[data-map="' + map + '"]').click();
  if (mobile) { await page.locator('#display-mode-button').tap(); await page.waitForFunction(() => document.fullscreenElement || document.getElementById('game-stage').classList.contains('immersive')); }
  await page.locator('#start-run').click(); await page.waitForFunction(() => __feedbackQA.game.phase === 'playing');
  // Explicit quiet-combat fixture; no timers, profile values or tutorial stage
  // are changed. Retain native rAF and real player input.
  await page.evaluate(() => { const g = __feedbackQA.game; g.enemies = []; g.bullets = []; g.hazards = []; g.spawnTimer = 999; });
  await page.waitForTimeout(160);
}
async function shot(page, name) { await page.screenshot({ path: path.join(outputFolder, name + '.png') }); }
async function run(browser, name, viewport, fn, settings) {
  if (filter && !name.includes(filter)) return;
  let page, context;
  try { const created = await create(browser, name, viewport, settings); ({ page, context } = created); const result = await fn(page, created.mobile, context); assert.deepEqual(report.errors.filter(e => e.name === name), []); report.cases.push({ name, viewport, pass: true, ...result }); console.log('PASS ' + name); }
  catch (error) { if (page) { await shot(page, name + '-failure').catch(() => {}); (report.failures ||= {})[name] = await state(page).catch(() => null); } report.cases.push({ name, viewport, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
  finally { await context?.close(); save(); }
}
async function firstRelay(page, mobile) {
  // Position only prepares interaction; native E/touch starts the real relay.
  await page.evaluate(() => { const g = __feedbackQA.game, r = g.relays[0]; g.player.x = r.x; g.player.y = r.y; __feedbackQA.renderer.camera.x = r.x; __feedbackQA.renderer.camera.y = r.y; });
  await page.waitForTimeout(160);
  if (mobile) { await page.waitForFunction(() => !document.getElementById('touch-interact').disabled); await page.locator('#touch-interact').tap(); }
  else await page.keyboard.press('KeyE');
  await page.waitForFunction(() => __feedbackQA.events.some(e => e.type === 'relay-start'));
}
async function sampleBanner(page) {
  return page.evaluate(async () => {
    const q = __feedbackQA, b = document.getElementById('event-banner'), canvas = document.getElementById('world'), start = performance.now(), samples = [];
    await new Promise(resolve => {
      function frame() {
        const css = getComputedStyle(b), rect = b.getBoundingClientRect(), c = canvas.getBoundingClientRect(), r = q.renderer, g = q.game, core = g.enemies.find(e => e.type === 'reactor');
        const point = core ? { x: c.left + r.width / 2 + (core.x - r.camera.x) * r.scale + r.shakeX, y: c.top + r.height / 2 + (core.y - r.camera.y) * r.scale + r.shakeY } : null;
        const visible = !b.classList.contains('hidden') && css.display !== 'none' && css.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        const rendered = element => {
          const css = getComputedStyle(element), r = element.getBoundingClientRect();
          return !element.classList.contains('hidden') && css.display !== 'none' && css.visibility !== 'hidden' && +css.opacity > 0 && r.width > 0 && r.height > 0 ? { id: element.id, x: r.x, y: r.y, width: r.width, height: r.height } : null;
        };
        const notices = ['event-banner', 'notification', 'interaction-hint', 'field-coach'].map(id => rendered(document.getElementById(id))).filter(Boolean);
        const buttons = [...document.querySelectorAll('.fullscreen-controls button,#field-map-toggle,#objective-toggle')].map(rendered).filter(Boolean);
        const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
        const noticeOverlaps = notices.flatMap((a, index) => notices.slice(index + 1).filter(b => overlap(a, b)).map(b => [a.id, b.id]));
        const buttonOverlaps = notices.flatMap(a => buttons.filter(b => overlap(a, b)).map(b => [a.id, b.id]));
        samples.push({ ms: +(performance.now() - start).toFixed(2), visible, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, stage: { x: c.x, y: c.y, width: c.width, height: c.height }, core: point, coversCore: !!point && visible && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom, notices, noticeOverlaps, buttonOverlaps });
        if (performance.now() - start < 3000) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
    return { label: document.getElementById('banner-label').textContent, text: document.getElementById('banner-text').textContent, frameCount: samples.length, visibleFrames: samples.filter(s => s.visible).length, coversCoreFrames: samples.filter(s => s.coversCore).length, lastVisibleMs: samples.filter(s => s.visible).at(-1)?.ms, samples };
  });
}
async function visibleBox(page, selector, touch = false) {
  return page.locator(selector).evaluate((element, touch) => {
    const css = getComputedStyle(element), r = element.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
    if (css.display === 'none' || css.visibility === 'hidden' || +css.opacity === 0 || r.width <= 0 || r.height <= 0) throw new Error('Not actually rendered: ' + element.id);
    if (r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) throw new Error('Outside viewport: ' + element.id);
    if (touch && (!element.contains(hit) || r.width < 43 || r.height < 43)) throw new Error('Touch target obstructed or smaller than 44px: ' + element.id);
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, touch);
}
async function point(page, selector, id) {
  const box = await visibleBox(page, selector, true); return { x: box.x + box.width / 2, y: box.y + box.height / 2, id, radiusX: 5, radiusY: 5, force: 1 };
}
async function guideSequence(page, mobile, suffix) {
  await start(page, 'frost', mobile);
  if (mobile) await page.waitForTimeout(3500); // Temporary notices suppress coaching while retaining its stage.
  const visible = [{ step: '0', rect: await visibleBox(page, '#field-coach') }];
  if (mobile) await visibleBox(page, '#coach-dismiss', true);
  assert.equal((await state(page)).coach.step, '0');
  let expandedSuppression;
  if (mobile && (await page.viewportSize()).width < (await page.viewportSize()).height) {
    await page.locator('#objective-toggle').tap(); assert.equal(await page.locator('#field-coach').isVisible(), false);
    const expanded = await state(page); assert.equal(expanded.coach.step, '0'); assert.equal(expanded.snapshot.coachDone, false); assert.equal(expanded.phase, 'playing');
    await page.locator('#objective-toggle').tap(); expandedSuppression = { expanded, restored: await visibleBox(page, '#field-coach') };
  }
  let cdp;
  if (mobile) {
    cdp = await page.context().newCDPSession(page);
    const move = await point(page, '#move-stick', 1), aim = await point(page, '#aim-stick', 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...move, x: move.x + 30 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...move, x: move.x + 30 }, aim] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...move, x: move.x + 30 }, { ...aim, x: aim.x + 30 }] });
    await page.waitForTimeout(550);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    const box = await page.locator('#world').boundingBox(); await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2);
    await page.keyboard.down('KeyD'); await page.mouse.down(); await page.waitForTimeout(550); await page.mouse.up(); await page.keyboard.up('KeyD');
  }
  await page.waitForFunction(() => document.getElementById('field-coach').dataset.step === '1');
  assert.match((await state(page)).coach.text, /冲刺/); visible.push({ step: '1', rect: await visibleBox(page, '#field-coach') }); await shot(page, 'guide-step1-' + suffix);
  if (mobile) await page.locator('#dash-button').tap(); else await page.keyboard.press('ShiftLeft');
  await page.waitForFunction(() => document.getElementById('field-coach').dataset.step === '2');
  const reloadText = (await state(page)).coach.text; assert.match(reloadText, /装填/); assert.match(reloadText, /绿色区/); visible.push({ step: '2', rect: await visibleBox(page, '#field-coach') }); await shot(page, 'guide-step2-' + suffix);
  if (mobile) await page.locator('#reload-button').tap(); else await page.keyboard.press('KeyR');
  await page.waitForFunction(() => { const p = __feedbackQA.game.player; return p.reloadTimer > 0 && p.reloadProgress >= .56 && p.reloadProgress <= .66; });
  if (mobile) await page.locator('#reload-button').tap(); else await page.keyboard.press('KeyR');
  await page.waitForFunction(() => __feedbackQA.store.snapshot.coachDone && document.getElementById('field-coach').dataset.step === '3');
  const ending = await state(page); assert.equal(ending.coach.hidden, true); assert.equal(ending.relays[0].status, 'idle');
  const sequence = ending.events.filter(e => (e.type === 'shot' && e.owner === 'player') || ['dash', 'reload-perfect'].includes(e.type)).map(e => e.type);
  assert.ok(sequence.indexOf('shot') >= 0 && sequence.indexOf('dash') > sequence.indexOf('shot') && sequence.indexOf('reload-perfect') > sequence.indexOf('dash'));
  await shot(page, 'guide-complete-' + suffix); await cdp?.detach(); return { visible, sequence, ending, expandedSuppression, fixture: 'Fresh storage plus quiet combat. Native keyboard/mouse or CDP dual-stick movement/shooting, native dash, and precisely timed native reload. Portrait details temporarily suppress the coach without advancing or persisting its stage. No forced tutorial step or synthetic event.' };
}
async function detailsCoverage(page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.getElementById('objective-details'), NodeFilter.SHOW_TEXT), ink = []; let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const parentCss = getComputedStyle(node.parentElement); if (parentCss.display === 'none' || parentCss.visibility === 'hidden') continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width && r.height) ink.push({ text: node.textContent, x: r.x, y: r.y, width: r.width, height: r.height });
    }
    const notices = ['notification', 'interaction-hint', 'field-coach'].flatMap(id => {
      const e = document.getElementById(id), css = getComputedStyle(e), r = e.getBoundingClientRect();
      return !e.classList.contains('hidden') && css.display !== 'none' && css.visibility !== 'hidden' && +css.opacity > 0 && r.width && r.height ? [{ id, x: r.x, y: r.y, width: r.width, height: r.height }] : [];
    });
    const overlaps = ink.flatMap(a => notices.filter(b => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1).map(b => ({ text: a.text, notice: b.id })));
    return { ink, notices, overlaps, notificationActive: document.getElementById('notification').classList.contains('visible') };
  });
}
async function foldObjective(page, mobile, suffix) {
  await start(page, 'foundry', mobile); await firstRelay(page, mobile); await page.waitForTimeout(1750);
  const button = page.locator('#objective-toggle'); assert.equal(await button.getAttribute('aria-controls'), 'objective-details'); assert.equal(await button.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#objective-details').isVisible(), false); const compact = await visibleBox(page, '.objective-hud');
  const progress = await visibleBox(page, '#relay-progress-wrap'), progressLabel = await visibleBox(page, '#relay-progress-label');
  assert.equal(await page.locator('#objective-details #relay-progress-wrap').count(), 0, 'Active mission progress must remain outside folded details');
  assert.match(await page.locator('#relay-progress-label').textContent(), /拆毁进度/);
  const text = await visibleBox(page, '#objective-text'), count = await visibleBox(page, '#relay-count'), toggle = await visibleBox(page, '#objective-toggle', mobile);
  const ink = await page.evaluate(() => ['objective-text', 'relay-count', 'relay-progress-label'].map(id => {
    const range = document.createRange(); range.selectNodeContents(document.getElementById(id));
    return { id, rects: [...range.getClientRects()].map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })) };
  }));
  for (const item of ink) for (const r of item.rects) assert.ok(r.x + r.width <= toggle.x + .5 || r.x >= toggle.x + toggle.width - .5 || r.y + r.height <= toggle.y + .5 || r.y >= toggle.y + toggle.height - .5, item.id + ' text overlaps the 44px objective button');
  const portrait = mobile && (await page.viewportSize()).width < (await page.viewportSize()).height;
  const notificationBefore = await visibleBox(page, '#notification');
  if (mobile) await button.tap(); else await button.click();
  assert.equal(await button.getAttribute('aria-expanded'), 'true'); const details = await visibleBox(page, '#objective-details');
  const coverage = await detailsCoverage(page); assert.equal(coverage.notificationActive, true, 'Exercise expanded details while the real relay notification remains active'); assert.deepEqual(coverage.overlaps, []);
  if (portrait) assert.equal(await page.locator('#notification').isVisible(), false, 'Portrait expanded details suppress the temporary notice');
  assert.match(await page.locator('#objective-details').textContent(), /追踪.*核心/); const before = (await state(page)).elapsed; await page.waitForTimeout(200);
  assert.ok((await state(page)).elapsed > before); assert.equal(await page.locator('#screen-overlay').isVisible(), false);
  await shot(page, 'objective-expanded-' + suffix); await button.focus(); await page.keyboard.press('Space');
  assert.equal(await button.getAttribute('aria-expanded'), 'false'); assert.equal(await page.locator('#objective-details').isVisible(), false);
  const notificationRestored = await visibleBox(page, '#notification');
  const closed = await state(page); assert.equal(closed.phase, 'playing'); assert.equal(closed.events.filter(e => e.type === 'dash').length, 0, 'Focused button Space must not also dash');
  await button.focus(); await page.keyboard.press('Enter'); assert.equal(await button.getAttribute('aria-expanded'), 'true');
  assert.deepEqual((await detailsCoverage(page)).overlaps, []); await shot(page, 'objective-keyboard-' + suffix);
  await page.waitForFunction(() => { const e = document.getElementById('notification'), css = getComputedStyle(e); return !e.classList.contains('visible') && (css.display === 'none' || +css.opacity <= .01); });
  if (mobile) await button.tap(); else await button.click();
  assert.equal(await page.locator('#notification').evaluate(e => { const css = getComputedStyle(e); return css.display !== 'none' && css.visibility !== 'hidden' && +css.opacity > .01; }), false, 'Closing details must not revive an expired notification');
  return { compact, text, count, toggle, ink, progress, progressLabel, details, closed, coverage, notificationBefore, notificationRestored, expiredNoticeRemainsHidden: true, fixture: 'Real first relay objective prepared by position fixture, native click/tap plus Space and Enter; no DOM class/ARIA mutation. Active task progress remains visible while folded. Actual text ink avoids the 44px button and active notices. Portrait expand suppresses a still-active real notification; close restores it before expiry, and closing after its original timer expires does not resurrect it.' };
}
async function verifyHosted(browser) {
  const context = await browser.newContext();
  try { for (const item of manifest.files) { const response = await context.request.get(origin + '/' + item.file + '?feedback-verify=' + Date.now(), { headers: { 'cache-control': 'no-cache' } }); assert.equal(response.status(), 200); const hash = crypto.createHash('sha256').update(await response.body()).digest('hex'); report.files[item.file] = hash; assert.equal(hash, item.sha256, item.file); } report.hostedManifestVerified = true; }
  finally { await context.close(); save(); }
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    if (online) await verifyHosted(browser);
    const viewports = baseline ? [{ width: 1440, height: 1000 }] : [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 360, height: 640 }];
    for (const viewport of viewports) {
      const suffix = viewport.width + 'x' + viewport.height;
      await run(browser, 'fresh-frost-' + suffix, viewport, async (page, mobile) => {
        await start(page, 'frost', mobile); const initial = await state(page); await shot(page, 'fresh-frost-' + suffix);
        assert.deepEqual(initial.relays.map(r => r.status), ['idle', 'locked', 'locked']); assert.equal(initial.snapshot.coachDone, false); assert.equal(initial.coach.hidden, false);
        if (!baseline) assert.equal(initial.coach.step, '0');
        return { initial, lockedMisclassificationReproduced: initial.snapshot.coachDone, fixture: 'Fresh storage. Native start plus quiet-combat fixture only.' };
      });
      await run(browser, 'foundry-banner-' + suffix, viewport, async (page, mobile) => {
        await start(page, 'foundry', mobile); await firstRelay(page, mobile); await shot(page, 'foundry-banner-' + suffix);
        const sample = await sampleBanner(page), current = await state(page); assert.ok(sample.visibleFrames > 5); assert.equal(current.snapshot.coachDone, true); assert.equal(current.coach.hidden, true);
        if (!baseline) {
          assert.equal(sample.coversCoreFrames, 0); assert.ok(sample.lastVisibleMs <= 1600, 'Ordinary banner outlasted 1.6 seconds: ' + sample.lastVisibleMs);
          for (const frame of sample.samples.filter(s => s.visible)) assert.ok(frame.rect.y + frame.rect.height <= frame.stage.y + frame.stage.height * .24, 'Ordinary banner enters the central action area');
          assert.deepEqual(sample.samples.filter(s => s.noticeOverlaps.length).map(s => ({ ms: s.ms, overlaps: s.noticeOverlaps })), [], 'Simultaneously rendered notices overlap');
          assert.deepEqual(sample.samples.filter(s => s.buttonOverlaps.length).map(s => ({ ms: s.ms, overlaps: s.buttonOverlaps })), [], 'Visible controls overlap status notices');
        }
        return { sample, current, fixture: 'Player/camera position prepares actual first relay; native E/touch invokes relay-start and real reactor. No synthetic event or banner style changes.' };
      });
      if (!baseline) {
        await run(browser, 'guide-sequence-' + suffix, viewport, (page, mobile) => guideSequence(page, mobile, suffix));
        await run(browser, 'objective-fold-' + suffix, viewport, (page, mobile) => foldObjective(page, mobile, suffix));
      }
    }
    if (!baseline) {
      await run(browser, 'idle-nine-seconds', { width: 1440, height: 1000 }, async page => {
        await start(page, 'frost', false); await page.waitForFunction(() => __feedbackQA.game.elapsed >= 9, null, { timeout: 15000 }); const idle = await state(page);
        assert.equal(idle.coach.step, '0'); assert.equal(idle.snapshot.coachDone, false); assert.match(idle.coach.text, /WASD.*鼠标/); await visibleBox(page, '#field-coach');
        await shot(page, 'idle-nine-seconds'); return { idle, fixture: 'Nine seconds pass through unmodified native rAF; no elapsed-time assignment.' };
      });
      await run(browser, 'legacy-coach-done', { width: 1440, height: 1000 }, async page => {
        await start(page, 'frost', false); const initial = await state(page); assert.equal(initial.snapshot.coachDone, true); assert.equal(initial.coach.hidden, true); return { initial, fixture: 'Existing frontier-coach=done storage supplied before the real Store migration.' };
      }, { legacyDone: true });
      await run(browser, 'account-coach-isolation', { width: 1440, height: 1000 }, async page => {
        await start(page, 'foundry', false); await firstRelay(page, false); await page.waitForFunction(() => __feedbackQA.store.snapshot.coachDone && !__feedbackQA.store.status.syncing); const a = await state(page);
        await page.evaluate(() => __feedbackQA.switchSession('QA-B')); await page.waitForFunction(() => __feedbackQA.store.identity === 'QA-B' && !!document.getElementById('start-run'));
        await start(page, 'frost', false); const b = await state(page); assert.equal(b.snapshot.coachDone, false); assert.equal(b.coach.step, '0'); assert.equal(b.coach.hidden, false);
        await page.evaluate(() => __feedbackQA.switchSession('QA-A')); await page.waitForFunction(() => __feedbackQA.store.identity === 'QA-A' && !!document.getElementById('start-run'));
        await start(page, 'frost', false); const restored = await state(page); assert.equal(restored.snapshot.coachDone, true); assert.equal(restored.coach.hidden, true);
        const calls = await page.evaluate(() => __feedbackQA.mockCalls); assert.ok(calls.length > 0 && calls.every(call => call.uid.startsWith('QA-'))); return { a, b, restored, calls, fixture: 'Explicit in-memory auth/cloud facade; actual session reconciliation, run reset and Store switch A→B→A. No real account or cloud writes, not backend-authentication validation.' };
      }, { mockAccounts: true });
    }
  } finally { await browser.close(); save(); }
  console.log(JSON.stringify({ mode, baseline, version, passed: report.cases.filter(c => c.pass).length, total: report.cases.length, errors: report.errors.length, output }));
  if (!report.cases.length || report.cases.some(c => !c.pass) || report.errors.length) process.exitCode = 1;
})().catch(error => { report.errors.push({ message: error.stack }); save(); console.error(error); process.exitCode = 1; });
