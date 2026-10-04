/* Account integration QA: real source UI/store, explicitly mocked cloud facade. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; ({ chromium } = require('../build-tools/browser/node_modules/playwright')); }
const root = path.resolve(__dirname, '..'), origin = 'http://127.0.0.1:4177', mobileOnly = process.argv.includes('--mobile'), campaignOnly = process.argv.includes('--campaign'), voyageOnly = process.argv.includes('--voyage');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const folder = path.join(root, 'reports/account-ui-' + version), output = path.join(folder, voyageOnly ? 'voyage.json' : campaignOnly ? 'campaign.json' : mobileOnly ? 'source-mobile.json' : 'source.json');
const report = { timestamp: new Date().toISOString(), mode: 'source-with-mocked-cloud', selection: voyageOnly ? 'voyage-only' : mobileOnly ? 'mobile-only' : 'full',
  note: 'Isolated headless Edge contexts. Real action.js, account-ui.js, and profile-store.js run unchanged; cloud-profile.js response is replaced by an explicit synthetic auth/cloud facade. Store public methods seed progress fixtures. This does not validate real authentication, email, backend authorization, or real mobile hardware.',
  files: {}, cases: [], errors: [] };
fs.mkdirSync(folder, { recursive: true });
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2));

function mockCloud() {
  const listeners = new Set(), copy = value => JSON.parse(JSON.stringify(value));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } };
  const session = () => read('__account-test-auth', null);
  const mock = window.__accountMock = { offline: false, holdMerge: false, holdLoad: window.__accountSettings.holdLoad || false, calls: [], mergeWaiters: [], loadWaiters: [],
    releaseMerge() { this.holdMerge = false; this.mergeWaiters.splice(0).forEach(resolve => resolve()); },
    releaseLoad() { this.holdLoad = false; this.loadWaiters.splice(0).forEach(resolve => resolve()); } };
  const publish = value => listeners.forEach(listener => listener(copy(value)));
  const authenticate = value => { localStorage.setItem('__account-test-auth', JSON.stringify(value)); publish(value); return copy(value); };
  window.addEventListener('storage', event => { if (event.key === '__account-test-auth') publish(session()); });
  const ensure = uid => { if (mock.offline) throw new Error('测试离线：云端未连接'); if (session()?.uid !== uid) throw new Error('账号已变化，本次同步已取消'); };
  const loadData = uid => read('__account-test-cloud:' + uid, { snapshot: FrontierProfiles.normalizeSnapshot(), runs: [], imports: [], legacyWins: 0 });
  window.FrontierCloud = {
    async init() { const value = session(); publish(value); return value; },
    async getSession() { return copy(session()); },
    onSession(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async signIn(email) { if (mock.offline) throw new Error('测试离线：登录未完成'); return authenticate({ uid: email.split('@')[0].toUpperCase(), label: email }); },
    async signOut() { if (mock.offline) throw new Error('测试离线：退出未完成'); return authenticate(null); },
    async signUp(email) { this._signup = email; if (mock.offline) throw new Error('测试离线：验证码未发送'); return { verificationRequired: true }; },
    async verifySignup() { return this.signIn(this._signup); },
    async requestReset(email) { this._reset = email; return { verificationRequired: true }; },
    async resetPassword() { return this.signIn(this._reset); },
    adapter: {
      async load(uid) { if (mock.holdLoad) await new Promise(resolve => mock.loadWaiters.push(resolve)); ensure(uid); return copy(loadData(uid).snapshot); },
      async merge(uid, payload) {
        mock.calls.push({ uid, payload: copy(payload) });
        if (mock.holdMerge) await new Promise(resolve => mock.mergeWaiters.push(resolve));
        ensure(uid);
        const data = loadData(uid); data.snapshot = FrontierProfiles.mergeSnapshots(data.snapshot, payload);
        for (const run of payload.runs) if (!data.runs.some(old => old.id === run.id)) {
          data.runs.push(run); data.snapshot.trial.bestWave = Math.max(data.snapshot.trial.bestWave, run.wave);
          if (run.won) data.snapshot.trial.bestTime = data.snapshot.trial.bestTime ? Math.min(data.snapshot.trial.bestTime, run.time) : run.time;
        }
        let legacyAccepted = false;
        if (payload.legacy) {
          const claims = read('__account-test-claims', {}), owner = claims[payload.legacy.id];
          if (owner && owner !== uid) throw new Error('测试存档已由其他账号认领');
          claims[payload.legacy.id] = uid; localStorage.setItem('__account-test-claims', JSON.stringify(claims));
          if (!data.imports.includes(payload.legacy.id)) {
            data.imports.push(payload.legacy.id); data.legacyWins = Math.max(data.legacyWins, payload.legacy.snapshot.trial.wins);
            data.snapshot = FrontierProfiles.mergeSnapshots(data.snapshot, payload.legacy.snapshot);
          }
          legacyAccepted = true;
        }
        data.snapshot.trial.wins = data.legacyWins + data.runs.filter(run => run.won).length;
        localStorage.setItem('__account-test-cloud:' + uid, JSON.stringify(data));
        return { snapshot: copy(data.snapshot), acknowledgedRunIds: payload.runs.map(run => run.id), legacyAccepted };
      }
    }
  };
}

async function create(browser, settings = {}) {
  const context = await browser.newContext({ viewport: settings.size || { width: 1365, height: 960 }, isMobile: !!settings.mobile, hasTouch: !!settings.mobile, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) return route.abort();
    try {
      let body = fs.readFileSync(file); report.files[name] = crypto.createHash('sha256').update(body).digest('hex');
      if (name === 'cloud-profile.js') body = Buffer.from('(' + mockCloud.toString() + ')();');
      await route.fulfill({ body, contentType: name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
    } catch (_) { await route.fulfill({ status: 404, body: '' }); }
  });
  await context.addInitScript(settings => {
    window.__accountSettings = settings;
    const audit = window.__accountAudit = { controls: [] };
    let expedition, profiles, panel;
    Object.defineProperty(window, 'Expedition', { configurable: true, get: () => expedition, set(api) { expedition = api; api.Game = new Proxy(api.Game, { construct(target, args, next) {
      const game = Reflect.construct(target, args, next); audit.game = game;
      for (const name of ['dash', 'reload', 'switchWeapon', 'useSkill', 'interact']) { const original = game[name]; game[name] = function (...args) { audit.controls.push(name); return original.apply(this, args); }; }
      return game;
    } }); } });
    Object.defineProperty(window, 'FrontierProfiles', { configurable: true, get: () => profiles, set(api) { profiles = api; api.Store = new Proxy(api.Store, { construct(target, args, next) { const store = Reflect.construct(target, args, next); audit.store = store; return store; } }); } });
    Object.defineProperty(window, 'FrontierAccountPanel', { configurable: true, get: () => panel, set(value) { panel = new Proxy(value, { construct(target, args, next) { const instance = Reflect.construct(target, args, next); audit.panel = instance; return instance; } }); } });
    if (!localStorage.getItem('__account-test-seeded')) {
      localStorage.setItem('__account-test-seeded', '1'); localStorage.setItem('frontier-sound', 'off');
      if (settings.identity) { localStorage.setItem('__account-test-auth', JSON.stringify(settings.identity)); localStorage.setItem('frontier-account-v1', JSON.stringify(settings.identity)); }
      for (const [key, value] of Object.entries(settings.legacy || {})) localStorage.setItem(key, value);
    }
  }, settings);
  return context;
}
async function pageIn(context) {
  const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(origin); await page.waitForFunction(() => window.__accountAudit?.panel && document.getElementById('open-account'));
  return page;
}
async function open(page) { await page.locator('#open-account').click(); await page.locator('#account-body').waitFor(); }
async function settled(page) { await page.waitForFunction(() => !__accountAudit.panel.busy && !__accountAudit.store.status.loading && !__accountAudit.store.status.syncing); }
async function login(page, name) {
  await page.locator('#account-email').fill(name.toLowerCase() + '@test.invalid'); await page.locator('#account-password').fill('MockOnly123');
  await page.locator('#account-form button[type=submit]').click(); await settled(page);
  await page.waitForFunction(uid => __accountAudit.store.identity === uid && !!document.querySelector('.account-name'), name.toUpperCase());
}
async function snapshot(page) { return page.evaluate(() => ({ identity: __accountAudit.store.identity, snapshot: __accountAudit.store.snapshot, status: __accountAudit.store.status, secrets: [...__accountAudit.game.discoveredSecrets] })); }
async function shot(page, name) { await page.screenshot({ path: path.join(folder, name + '.png') }); }
async function run(browser, name, settings, body) {
  let context, page;
  try { context = await create(browser, settings); page = await pageIn(context); const evidence = await body(page, context); report.cases.push({ name, pass: true, evidence }); console.log('PASS ' + name); }
  catch (error) { if (page) await shot(page, name + '-failure').catch(() => {}); report.cases.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
  finally { await context?.close(); save(); }
}

async function accountIsolation(browser) {
  await run(browser, 'guest-claim-and-account-isolation', { legacy: { 'frontier-secrets-v1': '["rebound"]', 'frontier-best': '300', 'frontier-trial-record-v1': '{"wins":2,"bestTime":95,"bestWave":6}' } }, async page => {
    assert.equal((await snapshot(page)).snapshot.trial.wins, 2); await open(page); await login(page, 'A');
    assert.equal((await snapshot(page)).snapshot.trial.wins, 0); assert.deepEqual((await snapshot(page)).secrets, []);
    await page.locator('#account-import').click(); await settled(page); assert.match(await page.locator('#account-message').textContent(), /已合并/);
    await page.evaluate(() => { const store = __accountAudit.store; store.recordSecret('blade-relay'); store.recordBest(900); store.recordRun({ id: 'qa-a-run', won: true, time: 82, wave: 6 }); });
    await settled(page); const a = await snapshot(page); assert.equal(a.snapshot.trial.wins, 3); assert.deepEqual(a.secrets, ['rebound', 'blade-relay']);
    await page.locator('#account-logout').click(); await page.locator('#account-logout').click(); await settled(page);
    assert.equal((await snapshot(page)).identity, null); assert.equal((await snapshot(page)).snapshot.trial.wins, 2);
    await login(page, 'B'); assert.deepEqual((await snapshot(page)).snapshot, { secrets: [], bestScore: 0, coachDone: false, trial: { wins: 0, bestTime: 0, bestWave: 0 } });
    assert.equal(await page.locator('#account-import').count(), 0);
    await page.evaluate(() => { __accountAudit.store.recordSecret('ice-break'); __accountAudit.store.recordBest(200); }); await settled(page); const b = await snapshot(page);
    await page.locator('#account-relogin').click(); await login(page, 'A'); const restored = await snapshot(page);
    assert.deepEqual(restored.snapshot, a.snapshot); assert.deepEqual(b.secrets, ['ice-break']); await shot(page, 'account-a-restored');
    return { a, b, restored };
  });
}
async function busySwitch(browser) {
  await run(browser, 'busy-sync-cross-tab-account-switch', { identity: { uid: 'A', label: 'a@test.invalid' } }, async (page, context) => {
    await settled(page); await open(page); await page.evaluate(() => { __accountAudit.store.recordSecret('rebound'); }); await settled(page);
    await page.evaluate(() => { __accountMock.holdMerge = true; }); await page.locator('#account-sync').click();
    await page.waitForFunction(() => __accountAudit.panel.busy && __accountMock.mergeWaiters.length > 0);
    const other = await pageIn(context); await settled(other); await open(other); await other.locator('#account-relogin').click(); await login(other, 'B');
    assert.equal((await snapshot(page)).identity, 'A', 'Busy UI must defer, not partially switch');
    await page.evaluate(() => __accountMock.releaseMerge());
    await page.waitForFunction(() => __accountAudit.store.identity === 'B' && !!document.getElementById('start-run'));
    await settled(page); const result = await snapshot(page); assert.deepEqual(result.secrets, []); assert.equal(result.snapshot.bestScore, 0);
    await shot(page, 'cross-tab-returned-camp'); await other.close(); return result;
  });
}
async function offlineAndLoading(browser) {
  await run(browser, 'offline-does-not-claim-synchronization', { identity: { uid: 'A', label: 'a@test.invalid' } }, async page => {
    await settled(page); await open(page); await page.evaluate(() => { __accountMock.offline = true; __accountAudit.store.recordSecret('ice-break'); }); await settled(page);
    await page.locator('#account-sync').click(); await settled(page);
    const offline = { ...(await snapshot(page)), message: await page.locator('#account-message').textContent(), statusText: await page.locator('.account-sync-status').textContent() };
    assert.ok(offline.status.pending > 0); assert.ok(offline.status.error); assert.match(offline.message, /尚未完成/); assert.doesNotMatch(offline.statusText, /同步完成/);
    await shot(page, 'offline-pending'); await page.evaluate(() => { __accountMock.offline = false; }); await page.locator('#account-sync').click(); await settled(page);
    const online = await snapshot(page); assert.equal(online.status.pending, 0); assert.equal(online.status.error, null); assert.match(await page.locator('#account-message').textContent(), /已同步到云端/);
    return { offline, online };
  });
  await run(browser, 'loading-is-not-complete', { identity: { uid: 'A', label: 'a@test.invalid' }, holdLoad: true }, async page => {
    await open(page); assert.equal((await snapshot(page)).status.loading, true); const text = await page.locator('.account-sync-status').textContent(); assert.match(text, /正在同步/); assert.doesNotMatch(text, /同步完成/);
    await page.evaluate(() => __accountMock.releaseLoad()); await settled(page); return { duringLoad: text, after: await snapshot(page) };
  });
}
async function box(page, selector) {
  const locator = page.locator(selector); await locator.scrollIntoViewIfNeeded();
  const result = await locator.evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, viewport: { width: innerWidth, height: innerHeight }, hits: [[.5,.5],[.2,.2],[.8,.8]].map(([x,y]) => { const hit = document.elementFromPoint(r.x+r.width*x,r.y+r.height*y); return hit === element || element.contains(hit); }) }; });
  assert.ok(result.width >= 44 && result.height >= 44, selector + ' needs a 44px hit target'); assert.ok(result.hits.every(Boolean), selector + ' is covered');
  assert.ok(result.x >= -1 && result.x + result.width <= result.viewport.width + 1, selector + ' horizontal overflow'); return result;
}
async function toolbarLayout(page, full) {
  const geometry = await page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const controls = document.querySelector('.fullscreen-controls'), overlay = document.querySelector('#screen-overlay');
    return { controls: rect(controls), overlay: rect(overlay), display: getComputedStyle(controls).display, accountOpen: document.querySelector('#game-stage').classList.contains('account-open') };
  });
  assert.equal(geometry.accountOpen, true);
  if (full) {
    const a = geometry.controls, b = geometry.overlay;
    assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y + .5 || b.bottom <= a.y, 'Fullscreen controls overlap the account overlay');
    assert.ok(a.y >= 0 && a.height >= 44, 'Fullscreen exit controls retain a usable separate band');
  } else assert.equal(geometry.display, 'none');
  return geometry;
}
async function mobile(browser) {
  for (const size of [{ width: 360, height: 640 }, { width: 667, height: 375 }]) for (const full of [false, true]) {
    const name = `mobile-${size.width}x${size.height}-${full ? 'fullscreen' : 'normal'}`;
    await run(browser, name, { size, mobile: true }, async page => {
      if (full) { await page.locator('#fullscreen-toggle').click(); await page.waitForFunction(() => !!document.fullscreenElement); }
      await open(page); const rows = {}, initialLayout = await toolbarLayout(page, full);
      for (const selector of ['#account-email', '#account-password', '#account-form button[type=submit]', '#account-alternate', '#account-forgot', '#account-back']) rows[selector] = await box(page, selector);
      const before = await page.evaluate(() => ({ elapsed: __accountAudit.game.elapsed, x: __accountAudit.game.player.x, weapon: __accountAudit.game.player.weapon, controls: __accountAudit.controls.length }));
      await page.locator('#account-email').tap(); await page.keyboard.type('wasdqerfm123'); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'account-password'); await page.keyboard.type('WasdQerf123');
      assert.equal(await page.locator('#account-email').inputValue(), 'wasdqerfm123'); assert.equal(await page.locator('#account-password').inputValue(), 'WasdQerf123');
      const after = await page.evaluate(() => ({ elapsed: __accountAudit.game.elapsed, x: __accountAudit.game.player.x, weapon: __accountAudit.game.player.weapon, controls: __accountAudit.controls.length })); assert.deepEqual(after, before);
      await page.locator('#account-alternate').tap(); rows.signupSubmit = await box(page, '#account-form button[type=submit]'); rows.signupPassword = await box(page, '#account-password');
      const overflow = await page.locator('.account-card').evaluate(element => ({ scroll: element.scrollWidth, width: element.clientWidth })); assert.ok(overflow.scroll <= overflow.width + 1);
      const scrolledLayout = await toolbarLayout(page, full);
      await shot(page, name); await page.keyboard.press('Escape'); assert.ok(await page.locator('#start-run').isVisible()); return { rows, typedInputDidNotControlGame: true, overflow, initialLayout, scrolledLayout };
    });
  }
}
async function campaignSwitch(browser) {
  await run(browser, 'awakening-charge-cross-tab-account-isolation', { identity: { uid: 'A', label: 'a@test.invalid' } }, async (page, context) => {
    await settled(page);
    await page.evaluate(() => __accountAudit.store.recordSecret('rebound')); await settled(page);
    const other = await pageIn(context); await settled(other);
    await page.locator('#campaign-entry').click(); await page.locator('[data-doctrine="conductor"]').click(); await page.locator('#start-campaign').click();
    await page.evaluate(() => {
      const g = __accountAudit.game; g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = []; g.bossSpawned = false; g._spawnBoss();
      g._damageEnemy(g.enemies.find(enemy => enemy.type === 'boss'), 1000000);
    });
    await page.locator('[data-campaign-route="foundry"]').click(); await page.locator('[data-campaign-supply="power"]').click();
    await page.locator('[data-campaign-awakening="charged-pulse"]').click(); await page.locator('#continue-campaign').click();
    await page.locator('#continue-awakening').click();
    await page.waitForFunction(() => __accountAudit.game.phase === 'playing');
    await page.keyboard.press('KeyQ'); await page.waitForFunction(() => __accountAudit.game.awakeningState.charge);
    const active = await page.evaluate(() => ({ campaign: structuredClone(__accountAudit.game.campaign), awakening: structuredClone(__accountAudit.game.awakeningState) }));
    assert.equal(active.campaign.awakeningId, 'charged-pulse');
    await other.evaluate(() => FrontierCloud.signIn('b@test.invalid'));
    await page.waitForFunction(() => __accountAudit.store.identity === 'B' && !!document.getElementById('start-run')); await settled(page);
    const b = await snapshot(page), cleared = await page.evaluate(() => ({ campaign: __accountAudit.game.campaign, awakening: structuredClone(__accountAudit.game.awakeningState), mode: __accountAudit.game.mode, phase: __accountAudit.game.phase }));
    assert.equal(cleared.campaign, null); assert.equal(cleared.mode, 'expedition'); assert.equal(cleared.phase, 'ready');
    assert.equal(cleared.awakening.charge, null); assert.equal(cleared.awakening.field, null); assert.equal(cleared.awakening.returnAnchor, null);
    assert.equal(cleared.awakening.relayTimer, 0); assert.equal(cleared.awakening.interruptCooldown, 0);
    assert.deepEqual(b.secrets, []); assert.equal(b.snapshot.bestScore, 0);
    await other.evaluate(() => FrontierCloud.signIn('a@test.invalid'));
    await page.waitForFunction(() => __accountAudit.store.identity === 'A'); await settled(page);
    const a = await snapshot(page); assert.deepEqual(a.secrets, ['rebound']);
    assert.equal(await page.evaluate(() => __accountAudit.game.campaign), null);
    const payloads = await page.evaluate(() => __accountMock.calls.map(call => call.payload));
    assert.ok(payloads.length); assert.ok(payloads.every(payload => !JSON.stringify(payload).includes('awakening')));
    await shot(page, 'awakening-account-reset'); await other.close();
    return { active, cleared, a, b, payloads, fixture: 'Real source UI/store with the existing explicit mocked cloud facade, controlled first boss clear and actual menu/EMP inputs. A second isolated-context tab changes synthetic auth A→B→A while first tab charges. No real identity, mail, cloud login or cloud writes.' };
  });
}
async function cargoSwitch(browser) {
  await run(browser, 'ruins-cargo-starline-cross-tab-account-isolation', { identity: { uid: 'A', label: 'a@test.invalid' } }, async (page, context) => {
    await settled(page); await page.evaluate(() => __accountAudit.store.recordSecret('rebound')); await settled(page);
    await page.locator('[data-map="ruins"]').click(); await page.locator('#start-run').click();
    await page.evaluate(() => {
      const g = __accountAudit.game, cargo = g.delivery.cargos[0];
      g.enemies = []; g.hazards = []; g.obstacles = []; g.spawnTimer = 999;
      g.player.x = cargo.x; g.player.y = cargo.y;
    });
    await page.keyboard.press('KeyE'); await page.waitForFunction(() => __accountAudit.game.delivery.carriedId !== null);
    await page.locator('[data-weapon="5"]').click();
    await page.evaluate(() => {
      const g = __accountAudit.game; g.enemies = [];
      g._placeStarPin({ starMultiplier: 1 }, 1000, 1000); g._placeStarPin({ starMultiplier: 1 }, 1200, 1100);
    });
    const active = await page.evaluate(() => ({ carried: __accountAudit.game.delivery.carriedId, pins: __accountAudit.game.starPins.length, lines: __accountAudit.game.starLines.length }));
    assert.ok(active.carried); assert.equal(active.pins, 2); assert.equal(active.lines, 1);
    const other = await pageIn(context); await settled(other); await other.evaluate(() => FrontierCloud.signIn('b@test.invalid'));
    await page.waitForFunction(() => __accountAudit.store.identity === 'B' && !!document.getElementById('start-run')); await settled(page);
    const b = await snapshot(page), reset = await page.evaluate(() => {
      const g = __accountAudit.game; return { phase: g.phase, mode: g.mode, map: g.map.id, delivery: structuredClone(g.delivery), pins: g.starPins, lines: g.starLines };
    });
    assert.deepEqual(b.secrets, []); assert.equal(reset.phase, 'ready'); assert.equal(reset.mode, 'expedition'); assert.equal(reset.map, 'ruins');
    assert.equal(reset.delivery.carriedId, null); assert.ok(reset.delivery.cargos.every(cargo => cargo.status === 'source' && cargo.pickupLock === 0));
    assert.deepEqual(reset.pins, []); assert.deepEqual(reset.lines, []);
    await other.evaluate(() => FrontierCloud.signIn('a@test.invalid'));
    await page.waitForFunction(() => __accountAudit.store.identity === 'A'); await settled(page);
    const a = await snapshot(page); assert.deepEqual(a.secrets, ['rebound']);
    assert.equal(await page.evaluate(() => __accountAudit.game.delivery.carriedId), null);
    const payloads = await page.evaluate(() => __accountMock.calls.map(call => call.payload));
    assert.ok(payloads.every(payload => !/starPins|starLines|carriedId|delivery/.test(JSON.stringify(payload))));
    await shot(page, 'ruins-account-reset'); await other.close();
    return { active, reset, a, b, payloads, fixture: 'Real source account/store/UI with the explicit mocked cloud facade. Native E picks cargo, then two prepared pins create a live line for the identity-change boundary. Cross-tab synthetic A→B→A clears current-run cargo/wire while preserving each account secret independently. This does not certify real cloud authorization.' };
  });
}
async function voyageSwitch(browser) {
  await run(browser, 'voyage-effects-cross-tab-account-isolation', { identity: { uid: 'A', label: 'a@test.invalid' } }, async (page, context) => {
    await settled(page); await page.evaluate(() => __accountAudit.store.recordSecret('rebound')); await settled(page);
    await page.locator('#voyage-entry').click(); await page.locator('[data-voyage-device="well"]').click();
    await page.locator('#voyage-seed').fill('731'); await page.locator('#start-voyage').click();
    await page.waitForFunction(() => __accountAudit.game.mode === 'voyage' && __accountAudit.game.phase === 'playing');
    await page.evaluate(() => {
      const g = __accountAudit.game; g.enemies = []; g.hazards = []; g.obstacles = []; g.voyage.room.spawnTimer = 999;
      // Account-boundary fixture prepares three slots; actual controls then
      // create effects. This does not claim legal equipment progression.
      g.voyage.devices = ['well', 'battery', 'afterimage'];
      g._placeStarPin({ starMultiplier: 1 }, 500, 500); g._placeStarPin({ starMultiplier: 1 }, 700, 500);
    });
    await page.keyboard.press('KeyQ'); await page.keyboard.press('Shift');
    const active = await page.evaluate(() => { const g = __accountAudit.game; return { mode: g.mode, voyage: structuredClone(g.voyage), pins: g.starPins.length, lines: g.starLines.length }; });
    assert.equal(active.mode, 'voyage'); assert.ok(active.voyage.effects.well); assert.equal(active.voyage.effects.batteryCharges, 3);
    assert.equal(active.voyage.effects.trails.length, 1); assert.equal(active.pins, 2); assert.equal(active.lines, 1);
    const other = await pageIn(context); await settled(other); await other.evaluate(() => FrontierCloud.signIn('b@test.invalid'));
    await page.waitForFunction(() => __accountAudit.store.identity === 'B' && !!document.getElementById('voyage-entry')); await settled(page);
    const b = await snapshot(page), reset = await page.evaluate(() => { const g = __accountAudit.game; return { phase: g.phase, mode: g.mode, map: g.map.id, voyage: g.voyage, pins: g.starPins, lines: g.starLines, skillCooldown: g.player.skillCooldown }; });
    assert.equal(reset.phase, 'ready'); assert.equal(reset.mode, 'expedition'); assert.equal(reset.map, 'frontier'); assert.equal(reset.voyage, null);
    assert.deepEqual(reset.pins, []); assert.deepEqual(reset.lines, []); assert.equal(reset.skillCooldown, 0);
    assert.deepEqual(b.secrets, []); assert.equal(b.snapshot.bestScore, 0);
    await other.evaluate(() => FrontierCloud.signIn('a@test.invalid')); await page.waitForFunction(() => __accountAudit.store.identity === 'A'); await settled(page);
    const a = await snapshot(page); assert.deepEqual(a.secrets, ['rebound']); assert.equal(await page.evaluate(() => __accountAudit.game.voyage), null);
    const payloads = await page.evaluate(() => __accountMock.calls.map(call => call.payload));
    assert.ok(payloads.length); assert.ok(payloads.every(payload => !/voyage|deviceChoices|batteryCharges|activeTrailId|starPins|starLines/.test(JSON.stringify(payload))));
    await shot(page, 'voyage-account-reset'); await other.close();
    return { active, reset, a, b, payloads, fixture: 'Real source UI/store with explicit mocked auth/cloud. Three prepared equipment slots and two pins set the boundary; native Q/Shift create live well/battery/trail effects. Synthetic cross-tab A→B→A clears all battle state and keeps personal secrets separate. No real account, email or cloud authorization is certified.' };
  });
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try { if (voyageOnly) await voyageSwitch(browser); else if (campaignOnly) { await campaignSwitch(browser); await cargoSwitch(browser); } else { if (!mobileOnly) { await accountIsolation(browser); await busySwitch(browser); await offlineAndLoading(browser); } await mobile(browser); } }
  finally { await browser.close(); report.passed = report.cases.filter(item => item.pass).length; report.failed = report.cases.filter(item => !item.pass).length; report.completedAt = new Date().toISOString(); save(); }
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, errors: report.errors, report: output }));
  if (report.failed || report.errors.length) process.exitCode = 1;
})().catch(error => { report.failure = error.stack; save(); console.error(error); process.exitCode = 1; });
