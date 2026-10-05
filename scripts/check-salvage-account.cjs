'use strict';

// Explicit synthetic Cloud facade: no real login or backend authorization claim.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || (() => { try { return require.resolve('playwright'); } catch { return require.resolve('../build-tools/browser/node_modules/playwright'); } })();
const { chromium } = require(playwrightPath), root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
const option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const online = args.includes('--online'), release = online || args.includes('--release'), failures = args.includes('--failures'), mode = online ? 'online-with-mock-cloud' : release ? 'release-with-mock-cloud' : 'source-with-mock-cloud';
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, folder = release ? path.join(root, 'release/web') : root;
const manifest = release ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4201';
const outputFolder = path.resolve(option('output', path.join(root, 'reports/expansion-6-7', `salvage-account-${mode}-${version}`))), hash = value => crypto.createHash('sha256').update(value).digest('hex'); fs.mkdirSync(outputFolder, { recursive: true });
const report = { generatedAt: new Date().toISOString(), version, mode, files: {}, browserFiles: {}, httpFiles: {}, cases: [], errors: [],
  method: 'Real guest-isolated product Game/UI/Store/session reconciliation with explicit synthetic Cloud facade and two simulated identities. Native menus/Q/E plus quiet-combat/position and Store.recordSecret fixtures. These are account boundary fixtures, NOT real sign-in/backend access tests or natural wins. No real backend writes. Online has no route/fulfill, validates five HTTP manifest files and actual JS/CSS; mocked Cloud.init deliberately does not load SDK, so SDK has HTTP-only evidence here.' };
const save = () => fs.writeFileSync(path.join(outputFolder, 'results.json'), JSON.stringify(report, null, 2) + '\n'), bytes = new Map();
if (!online) for (const file of release ? manifest.files.map(item => item.file) : ['index.html', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js', 'expedition.css', 'profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'vendor/cloudbase.full.js']) { const body = fs.readFileSync(path.join(folder, file)); bytes.set(file, body); report.files[file] = hash(body); }
function observe() {
  const q = window.__salvageAccount = { calls: [], offline: false, holdLoads: false, loadWaiters: [] }; let api, profileApi, cloudApi, session = { uid: 'QA-A', label: '模拟玩家 A' };
  const listeners = new Set(), snapshots = new Map();
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) { api = value; value.Game = new Proxy(value.Game, { construct(target, args, next) { const game = Reflect.construct(target, args, next); q.game = game; return game; } }); } });
  Object.defineProperty(window, 'FrontierProfiles', { configurable: true, get: () => profileApi, set(value) { profileApi = value; value.Store = new Proxy(value.Store, { construct(target, args, next) { const store = Reflect.construct(target, args, next); q.store = store; return store; } }); } });
  Object.defineProperty(window, 'FrontierCloud', { configurable: true, get: () => cloudApi, set() {
    cloudApi = {
      async init() { return session; }, async getSession() { return session; }, onSession(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      adapter: {
        async load(uid) { if (q.holdLoads) await new Promise(resolve => q.loadWaiters.push(resolve)); return structuredClone(snapshots.get(uid) || FrontierProfiles.normalizeSnapshot()); },
        async merge(uid, payload) { q.calls.push({ uid, payload: structuredClone(payload), offline: q.offline }); if (q.offline) throw new Error('QA synthetic offline'); const snapshot = FrontierProfiles.mergeSnapshots(snapshots.get(uid), payload); snapshots.set(uid, snapshot); return { snapshot: structuredClone(snapshot), acknowledgedRunIds: [], legacyAccepted: false }; }
      }
    };
    q.switchSession = uid => { session = { uid, label: '模拟玩家 ' + uid }; listeners.forEach(fn => fn(session)); };
    q.releaseLoads = () => { q.holdLoads = false; q.loadWaiters.splice(0).forEach(resolve => resolve()); };
  } });
  localStorage.setItem('frontier-account-v1', JSON.stringify(session)); localStorage.setItem('frontier-sound', 'off');
}
async function settled(page, uid) { await page.waitForFunction(uid => __salvageAccount.store.identity === uid && !__salvageAccount.store.status.loading && !__salvageAccount.store.status.syncing, uid); }
async function snapshot(page) { return page.evaluate(() => { const q = __salvageAccount; return { identity: q.store.identity, profile: q.store.snapshot, salvage: structuredClone(q.game.salvage), mode: q.game.mode, phase: q.game.phase,
  status: q.store.status, secrets: [...q.game.discoveredSecrets], local: JSON.parse(localStorage.getItem('frontier-account-v1:' + encodeURIComponent(q.store.identity))) }; }); }
async function sourceFixture(page, kind) { await page.evaluate(kind => { const g = __salvageAccount.game, source = g.salvage.sources.find(source => source.kind === kind); g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = []; g.salvage.pending = []; g.player.x = source.x - 50; g.player.y = source.y; }, kind); }
async function start(page, seed) { await page.locator('#salvage-entry').click(); await page.locator('#salvage-seed').fill(String(seed)); await page.locator('#start-salvage').click(); await page.waitForFunction(() => __salvageAccount.game.mode === 'salvage' && __salvageAccount.game.phase === 'playing'); }
(async () => {
  const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), browser = await chromium.launch({ channel, headless: true }), context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' }); let page;
  try {
    if (!online) await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort(); const file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html'; if (!bytes.has(file)) return route.fulfill({ status: file === 'favicon.ico' ? 204 : 404, body: '' }); return route.fulfill({ body: bytes.get(file), contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' }); });
    if (online) for (const item of manifest.files) { const response = await context.request.get(origin + '/' + item.file + '?salvage-account-verify=' + Date.now(), { headers: { 'cache-control': 'no-cache' }, timeout: 30000 }); assert.equal(response.status(), 200); report.httpFiles[item.file] = hash(await response.body()); assert.equal(report.httpFiles[item.file], item.sha256); }
    await context.addInitScript(observe); page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000); page.on('pageerror', error => report.errors.push(error.message)); const responses = [];
    if (online) page.on('response', response => { const url = new URL(response.url()), file = decodeURIComponent(url.pathname).replace(/^\//, ''); if (url.origin === origin && manifest.files.some(item => item.file === file && /\.(js|css)$/.test(file))) responses.push(response.body().then(body => { report.browserFiles[file] = hash(body); }).catch(error => report.errors.push(error.message))); });
    await page.goto(origin + '/?v=' + version, { waitUntil: 'domcontentloaded' }); if (online && await page.locator('#submitBtn').count()) { assert.match(await page.locator('body').innerText(), /测试域名/); await page.locator('#submitBtn').click(); }
    await settled(page, 'QA-A'); await page.locator('#salvage-entry').waitFor(); await start(page, 731); await sourceFixture(page, 'vault');
    await page.keyboard.press('KeyQ'); await page.waitForFunction(() => __salvageAccount.game.salvage.sources.some(source => source.quietTimer > 0)); await page.keyboard.press('KeyE'); await page.waitForFunction(() => __salvageAccount.game.salvage.carried === 3);
    await page.evaluate(() => __salvageAccount.store.recordSecret('rebound')); await settled(page, 'QA-A');
    let a = await snapshot(page); assert.equal(a.salvage.carried, 3); assert.equal(a.salvage.settled, 0); assert.equal(a.salvage.bonus, 0); assert.equal(a.profile.bestScore, 0); assert.deepEqual(a.profile.secrets, ['rebound']); assert.equal(a.profile.coachDone, true);
    assert.deepEqual(Object.keys(a.profile).sort(), ['bestScore', 'coachDone', 'secrets', 'trial']); assert.ok(!('salvage' in a.local) && !('carried' in a.local.snapshot));
    if (failures) {
      // Public Store fixture during a real unbanked run. No battle-time account
      // panel is invented: that menu is deliberately available only in camp.
      await page.evaluate(() => { __salvageAccount.offline = true; __salvageAccount.store.recordSecret('blade-relay'); });
      await page.waitForFunction(() => !__salvageAccount.store.status.syncing && __salvageAccount.store.status.error === 'QA synthetic offline');
      const offline = await snapshot(page);
      assert.ok(offline.status.pending > 0); assert.equal(offline.salvage.carried, 3); assert.equal(offline.salvage.settled, 0); assert.equal(offline.salvage.bonus, 0); assert.equal(offline.profile.bestScore, 0);
      assert.deepEqual(offline.profile.secrets, ['rebound', 'blade-relay']);
      const synced = await page.evaluate(async () => { __salvageAccount.offline = false; return __salvageAccount.store.sync(); }); assert.equal(synced, true);
      await settled(page, 'QA-A'); a = await snapshot(page); assert.equal(a.status.pending, 0); assert.equal(a.status.error, null); assert.equal(a.salvage.carried, 3); assert.equal(a.salvage.bonus, 0);
      report.cases.push({ name: 'synthetic-merge-failure-retains-local-progress-and-unbanked-samples-then-public-sync-recovers', pass: true, offline, restored: a }); save();
    }
    if (failures) {
      await page.evaluate(() => { __salvageAccount.holdLoads = true; __salvageAccount.switchSession('QA-B'); });
      await page.waitForFunction(() => __salvageAccount.store.identity === 'QA-B' && __salvageAccount.store.status.loading && __salvageAccount.loadWaiters.length > 0);
      const loading = await snapshot(page); assert.equal(loading.mode, 'expedition'); assert.equal(loading.phase, 'ready'); assert.equal(loading.salvage, null); assert.deepEqual(loading.secrets, []); assert.deepEqual(loading.profile.secrets, []);
      assert.equal(await page.evaluate(() => __salvageAccount.game.interact()), false);
      await page.waitForTimeout(250); const stillLoading = await snapshot(page); assert.equal(stillLoading.status.loading, true); assert.equal(stillLoading.salvage, null);
      await page.evaluate(() => __salvageAccount.releaseLoads()); await settled(page, 'QA-B');
      report.cases.push({ name: 'synthetic-delayed-B-load-clears-active-A-run-before-the-load-resolves', pass: true, loading, stillLoading, loaded: await snapshot(page) }); save();
    } else await page.evaluate(() => __salvageAccount.switchSession('QA-B'));
    await settled(page, 'QA-B'); await page.locator('#salvage-entry').waitFor(); const b = await snapshot(page);
    assert.equal(b.salvage, null); assert.equal(b.mode, 'expedition'); assert.equal(b.phase, 'ready'); assert.deepEqual(b.secrets, []); assert.deepEqual(b.profile, { secrets: [], bestScore: 0, coachDone: false, trial: { wins: 0, bestTime: 0, bestWave: 0 } });
    report.cases.push({ name: 'carried-samples-and-coach-secret-isolation-A-to-B', pass: true, a, b }); await page.screenshot({ path: path.join(outputFolder, 'B-fresh-camp.png') }); save();
    await start(page, 2); await sourceFixture(page, 'drill'); await page.keyboard.press('KeyE'); await page.waitForFunction(() => __salvageAccount.game.salvage.sources.some(source => source.status === 'drilling')); await page.waitForTimeout(250);
    const bActive = await snapshot(page); assert.ok(bActive.salvage.sources.some(source => source.kind === 'drill' && source.progress > 0));
    await page.evaluate(() => __salvageAccount.switchSession('QA-A')); await settled(page, 'QA-A'); await page.locator('#salvage-entry').waitFor(); const aRestored = await snapshot(page);
    assert.equal(aRestored.salvage, null); assert.deepEqual(aRestored.profile, a.profile); assert.deepEqual(aRestored.secrets, a.profile.secrets);
    await start(page, 731); const fresh = await snapshot(page); assert.equal(fresh.salvage.carried, 0); assert.equal(fresh.salvage.evac, null); assert.equal(fresh.salvage.settled, 0); assert.equal(fresh.salvage.alarm, 0); assert.ok(fresh.salvage.sources.every(source => ['locked', 'idle', 'flying'].includes(source.status)));
    report.cases.push({ name: 'drilling-session-switch-and-restored-A-has-fresh-runtime', pass: true, bActive, aRestored, fresh });
    report.mockCalls = await page.evaluate(() => __salvageAccount.calls); for (const call of report.mockCalls) { assert.ok(!('salvage' in call.payload) && !('carried' in call.payload)); assert.equal(call.payload.runs.length, 0); }
    if (online) { await Promise.all(responses); for (const item of manifest.files.filter(item => /\.(js|css)$/.test(item.file) && !item.file.startsWith('vendor/'))) assert.equal(report.browserFiles[item.file], item.sha256); }
    assert.deepEqual(report.errors, []);
  } catch (error) { report.failure = error.stack; if (page) await page.screenshot({ path: path.join(outputFolder, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
  finally { save(); await context.close(); await browser.close(); }
  console.log(JSON.stringify({ mode, pass: report.cases.length === (failures ? 4 : 2) && !report.failure, cases: report.cases.length, errors: report.errors, failure: report.failure, outputFolder }));
})();
