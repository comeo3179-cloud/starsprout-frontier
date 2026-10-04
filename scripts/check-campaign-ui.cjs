'use strict';

// Actual guest browser UI, native rAF and CDP touch. Isolated fixtures reach
// intermissions and the final arena; original-stat reachability is checked by
// check-campaign-runs.cjs. No real profile, account or cloud writes are used.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; ({ chromium } = require('../build-tools/browser/node_modules/playwright')); }
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2), online = args.includes('--online'), release = online || args.includes('--release');
const mode = online ? 'online' : release ? 'release' : 'source', folder = release ? path.join(root, 'release/web') : root;
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const outputFolder = path.join(root, 'reports/campaign-ui-' + mode + '-' + version), origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4191';
const manifest = online ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const filter = args.includes('--case') ? args[args.indexOf('--case') + 1] : '';
const publicOnly = args.includes('--public-only');
const report = { generatedAt: new Date().toISOString(), mode, files: {}, browserFiles: {}, cases: [], errors: [], note: 'Isolated guest Edge, real source/release resources, native rAF and simultaneous CDP touch. Explicit fixtures enter rest/finale and spend one round for repeatable UI boundaries. Online directly loads the hosted site without route/fulfill and verifies every manifest file plus the scripts/styles actually loaded by the browser. No account login or cloud writes. Viewport emulation is not physical-phone certification.' };
fs.mkdirSync(outputFolder, { recursive: true });
const output = path.join(outputFolder, publicOnly ? 'results-public.json' : filter ? 'results-' + filter.replace(/[^a-z0-9-]/gi, '_') + '.json' : 'results.json');
function save() { fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
function observe(Bot, seed = null) {
  const q = window.__campaignQA = { events: [], input: {}, auto: false, bot: Bot ? new Bot({ id: 'piercer-mirror', prerequisite: 'shatter', weapon: 2 }) : null }; let api, Renderer;
  Object.defineProperty(window, 'ExpeditionRenderer', { configurable: true, get: () => Renderer, set(value) {
    Renderer = new Proxy(value, { construct(target, args, next) { const renderer = Reflect.construct(target, args, next); q.renderer = renderer; return renderer; } });
  } });
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
    api = value; api.Game = new Proxy(api.Game, { construct(target, args, next) {
      const game = Reflect.construct(target, args, next); q.game = game;
      const update = game.update, drain = game.drainEvents, reset = game.reset;
      game.reset = function(mapId, options, ...rest) { return reset.call(this, mapId, options?.mode === 'campaign' && seed !== null ? { ...options, seed } : options, ...rest); };
      game.update = function(dt, input) { if (q.auto && this.phase === 'playing') input = q.bot.input(this); q.input = { ...input }; return update.call(this, dt, input); };
      game.drainEvents = function() { const events = drain.call(this); q.events.push(...events.map(event => ({ ...event }))); return events; };
      return game;
    } });
  } });
  localStorage.setItem('frontier-sound', 'off');
  localStorage.setItem('frontier-secrets-v1', JSON.stringify(['rebound', 'blade-relay', 'bullet-reversal', 'fuse-resonance', 'rail-resonance', 'ice-break']));
}
async function create(browser, name, size, mobile) {
  const context = await browser.newContext({ viewport: size, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  if (!online) await context.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', file = path.resolve(folder, name);
    if (!file.startsWith(folder + path.sep)) return route.abort();
    try {
      const body = fs.readFileSync(file); report.files[name] = crypto.createHash('sha256').update(body).digest('hex');
      await route.fulfill({ body, contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(name)] || 'application/octet-stream' });
    } catch { await route.fulfill({ status: name === 'favicon.ico' ? 204 : 404, body: '' }); }
  });
  if (publicOnly) {
    const { CampaignExplorer } = require('./check-campaign-runs.cjs');
    const simulator = fs.readFileSync(path.join(__dirname, 'simulate-expedition.js'), 'utf8');
    const code = simulator.slice(simulator.indexOf('function seededRandom('), simulator.indexOf('\nfunction simulate('));
    const seed = args.includes('--seed') ? Number(args[args.indexOf('--seed') + 1]) : null;
    assert.ok(seed === null || Number.isInteger(seed), 'Use an integer test seed');
    await context.addInitScript({ content: '(() => { const options = { mode: "explore", build: "reactor" }; const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y); ' + code + '\nconst CampaignExplorer = ' + CampaignExplorer.toString() + '; (' + observe.toString() + ')(CampaignExplorer, ' + seed + '); })();' });
  } else await context.addInitScript(observe);
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push({ name, message: error.message }));
  const responses = [], browserFiles = {};
  if (online) page.on('response', response => {
    const url = new URL(response.url()), file = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (url.origin === origin && manifest.files.some(item => item.file === file && /\.(js|css)$/.test(file))) responses.push(response.body().then(body => { browserFiles[file] = crypto.createHash('sha256').update(body).digest('hex'); }).catch(error => ({ error: error.message })));
  });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  if (online && await page.locator('#submitBtn').count()) {
    assert.match(await page.locator('body').innerText(), /测试域名/);
    await page.locator('#submitBtn').click({ timeout: 20000 });
  }
  await page.waitForFunction(() => window.__campaignQA?.game);
  await page.locator('#campaign-entry').waitFor();
  assert.ok((await page.locator('#screen-content .screen-kicker').textContent()).includes(version), 'Camp must show the current game version');
  assert.ok((await page.locator('.version-label').textContent()).includes(version), 'Header must show the current game version');
  if (online) {
    // Account bootstrap loads the SDK asynchronously after constructing Game.
    await page.waitForFunction(() => window.cloudbase, null, { timeout: 20000 });
    const observed = await Promise.all(responses); assert.ok(observed.every(item => !item?.error), 'Could not read a hosted browser response');
    Object.assign(report.browserFiles, browserFiles);
    for (const item of manifest.files.filter(item => /\.(js|css)$/.test(item.file))) assert.equal(browserFiles[item.file], item.sha256, 'Browser loaded a stale hosted asset: ' + item.file);
    await page.locator('#campaign-entry').waitFor();
    const campVersion = await page.locator('#screen-content .screen-kicker').textContent();
    assert.ok(campVersion.includes(version), 'Hosted camp must show the current published version');
    (report.campVersions ||= {})[name] = campVersion;
  }
  return { page, context };
}
async function verifyHosted(browser) {
  const context = await browser.newContext();
  try {
    for (const item of manifest.files) {
      const response = await context.request.get(origin + '/' + item.file + '?campaign-verify=' + Date.now(), { headers: { 'cache-control': 'no-cache' }, timeout: 20000 });
      assert.equal(response.status(), 200, item.file);
      const actual = crypto.createHash('sha256').update(await response.body()).digest('hex');
      report.files[item.file] = actual; assert.equal(actual, item.sha256, 'Hosted file hash differs: ' + item.file);
    }
    report.hostedManifestVerified = true;
  } finally { await context.close(); save(); }
}
async function test(browser, name, size, mobile, fn) {
  if (filter && !name.includes(filter)) return;
  let page, context;
  try {
    ({ page, context } = await create(browser, name, size, mobile));
    const result = await fn(page, context); report.cases.push({ name, pass: true, ...result }); console.log('PASS ' + name);
  } catch (error) {
    if (page) report.failureStates ||= {};
    if (page) report.failureStates[name] = await state(page).catch(() => null);
    if (page) await page.screenshot({ path: path.join(outputFolder, name + '-failure.png') }).catch(() => {});
    report.cases.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message);
  } finally { if (context) await context.close(); save(); }
}
async function shot(page, name) { await page.screenshot({ path: path.join(outputFolder, name + '.png') }); }
async function start(page, { mobile = false, doctrine = 'skirmisher', map = 'frontier' } = {}) {
  if (mobile) { await page.locator('#display-mode-button').tap(); await page.waitForFunction(() => document.fullscreenElement || document.getElementById('game-stage').classList.contains('immersive')); }
  await page.locator('#campaign-entry').click();
  await page.locator('[data-doctrine="' + doctrine + '"]').click();
  await page.locator('[data-campaign-map="' + map + '"]').click();
  await page.locator('#start-campaign').click();
  await page.waitForFunction(() => __campaignQA.game.mode === 'campaign' && __campaignQA.game.phase === 'playing');
}
async function state(page) {
  return page.evaluate(() => {
    const q = __campaignQA, g = q.game;
    return { phase: g.phase, elapsed: g.elapsed, x: g.player.x, y: g.player.y, hp: g.player.hp, weapon: g.player.weapon, reload: g.player.reloadTimer, input: q.input, map: g.map.id, stage: g.campaign?.stage,
      campaign: g.campaign ? structuredClone(g.campaign) : null, awakeningState: g.awakeningState ? structuredClone(g.awakeningState) : null,
      delivery: g.delivery ? structuredClone(g.delivery) : null, starPins: structuredClone(g.starPins || []), starLines: structuredClone(g.starLines || []), bullets: g.bullets.length, hazards: g.hazards.length };
  });
}
async function frozen(page) {
  await page.waitForTimeout(100); const before = await state(page); await page.waitForTimeout(220);
  assert.deepEqual(await state(page), before, 'A menu continued advancing the world'); return before;
}
async function clearBossFixture(page, pendingXp = false) {
  await page.evaluate(pendingXp => {
    const g = __campaignQA.game;
    g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = []; g.spawnTimer = 999; g.player.invulnerable = 0;
    g.bossSpawned = false; g._spawnBoss();
    const boss = g.enemies.find(enemy => enemy.type === 'boss');
    if (!boss) throw new Error('Boss fixture did not spawn');
    if (pendingXp) g.player.xp = g.player.xpNeeded + 7;
    g._damageEnemy(boss, 1000000);
  }, pendingXp);
  await page.locator('#continue-campaign').waitFor();
}
async function chooseRoute(page, mapId, supplyId = 'repair', awakeningId = '') {
  await page.locator('[data-campaign-route="' + mapId + '"]').click();
  await page.locator('[data-campaign-supply="' + supplyId + '"]').click();
  const firstRest = (await state(page)).stage === 1;
  if (firstRest) {
    const choice = awakeningId ? page.locator('[data-campaign-awakening="' + awakeningId + '"]') : page.locator('[data-campaign-awakening]').first();
    await choice.click();
  }
  await page.locator('#continue-campaign').click();
  if (firstRest) {
    await page.locator('#continue-awakening').waitFor();
    assert.match(await page.locator('#screen-content .screen-kicker').textContent(), /流派觉醒/);
    const held = await frozen(page); assert.equal(held.stage, 2);
    const geometry = await page.evaluate(() => {
      const title = document.getElementById('screen-title').getBoundingClientRect(), stage = document.getElementById('game-stage').getBoundingClientRect();
      return { titleX: title.x + title.width / 2, titleY: title.y + title.height / 2, stageX: stage.x + stage.width / 2, stageY: stage.y + stage.height / 2, stageHeight: stage.height };
    });
    assert.ok(Math.abs(geometry.titleX - geometry.stageX) < 30, 'Awakening title must be centered in the actual game region');
    assert.ok(Math.abs(geometry.titleY - geometry.stageY) < geometry.stageHeight * .3, 'Awakening title must be within the central ceremony band');
    const size = page.viewportSize(); await shot(page, 'ceremony-' + held.campaign.awakeningId + '-' + size.width + 'x' + size.height);
    await page.keyboard.press('KeyD'); await page.keyboard.press('KeyQ'); await page.keyboard.press('ShiftLeft');
    assert.deepEqual(await state(page), held, 'The central awakening ceremony safely holds movement and abilities');
    await page.locator('#continue-awakening').click();
  }
  await page.waitForFunction(() => __campaignQA.game.phase === 'playing' || __campaignQA.game.phase === 'upgrade');
}
async function bounds(page, selector) {
  return page.locator(selector).evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect(); return { text: element.textContent.trim(), x: r.x, right: r.right, width: r.width, height: r.height, overflow: element.scrollWidth > element.clientWidth + 1 };
  }));
}
async function scrollHit(page, selector) {
  const element = page.locator(selector); await element.scrollIntoViewIfNeeded();
  const box = await element.evaluate(element => {
    const r = element.getBoundingClientRect();
    return { width: r.width, height: r.height, x: r.x, y: r.y, right: r.right, bottom: r.bottom, hits: [[.5, .5], [.2, .2], [.8, .8]].map(([x, y]) => { const hit = document.elementFromPoint(r.x + r.width * x, r.y + r.height * y); return hit === element || element.contains(hit); }) };
  });
  assert.ok(box.width >= 44 && box.height >= 44 && box.hits.every(Boolean), selector + ' must scroll into an unobstructed touch target');
  assert.ok(box.x >= -1 && box.right <= page.viewportSize().width + 1);
  return box;
}
async function entryPointers(page) {
  return page.evaluate(async () => {
    const overlaps = [], began = performance.now(); let frames = 0, pointers = 0;
    await new Promise(resolve => {
      function sample() {
        const r = __campaignQA.renderer, origin = r.canvas.getBoundingClientRect(); frames++;
        const blocks = Array.from(document.querySelectorAll('.boss-hud,.combat-notices,.player-hud,.fullscreen-controls')).map(element => {
          const box = element.getBoundingClientRect(); return { name: element.className, left: box.left - origin.left, right: box.right - origin.left, top: box.top - origin.top, bottom: box.bottom - origin.top, width: box.width, height: box.height };
        }).filter(box => box.width > 0 && box.height > 0);
        for (const pointer of r.nexusPointerRects || []) {
          pointers++;
          for (const box of blocks) if (pointer.left < box.right && pointer.right > box.left && pointer.top < box.bottom && pointer.bottom > box.top) overlaps.push({ ms: performance.now() - began, pointer, box, cachedAge: r.time - r.pointerHudTime });
        }
        if (performance.now() - began < 650) requestAnimationFrame(sample); else resolve();
      }
      requestAnimationFrame(sample);
    });
    return { frames, pointers, overlaps };
  });
}
async function setupCase(browser, size, mobile) {
  await test(browser, 'setup-' + size.width + 'x' + size.height, size, mobile, async page => {
    await page.locator('#campaign-entry').click();
    assert.equal(await page.locator('[data-doctrine]').count(), 3);
    assert.equal(await page.locator('[data-campaign-map]').count(), await page.evaluate(() => Expedition.MAPS.length));
    for (const doctrine of ['skirmisher', 'marksman', 'conductor']) {
      await page.locator('[data-doctrine="' + doctrine + '"]').click();
      assert.equal(await page.locator('[data-doctrine="' + doctrine + '"]').getAttribute('aria-pressed'), 'true');
    }
    await page.locator('[data-campaign-map="storm"]').click();
    assert.equal(await page.locator('[data-campaign-map="storm"]').getAttribute('aria-pressed'), 'true');
    const layout = await bounds(page, '[data-doctrine], [data-campaign-map]');
    assert.ok(layout.every(item => !item.text.includes('undefined') && !item.overflow && item.width >= 44 && item.height >= 44));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await shot(page, 'setup-' + size.width + 'x' + size.height);
    await page.locator('#start-campaign').scrollIntoViewIfNeeded(); await page.locator('#start-campaign').click();
    await page.waitForFunction(() => __campaignQA.game.phase === 'playing');
    const started = await state(page); assert.equal(started.campaign.doctrineId, 'conductor'); assert.equal(started.map, 'storm'); assert.equal(started.stage, 1);
    assert.match(await page.locator('#mission-state').textContent(), /1\s*\/\s*3|第一|第 1/);
    return { layout, started };
  });
}
async function restFlow(browser, size, mobile) {
  await test(browser, 'rest-finale-' + size.width + 'x' + size.height, size, mobile, async page => {
    await start(page, { mobile }); await clearBossFixture(page);
    assert.equal(await page.locator('[data-campaign-route]').count(), await page.evaluate(() => Expedition.MAPS.length - 1));
    assert.equal(await page.locator('[data-campaign-route="frontier"]').count(), 0);
    assert.equal(await page.locator('[data-campaign-supply]').count(), 3);
    assert.equal(await page.locator('[data-campaign-awakening]').count(), 2);
    assert.equal(await page.locator('#continue-campaign').isDisabled(), true, 'First intermission requires an explicit awakening choice');
    assert.equal(await page.locator('[data-campaign-awakening][aria-pressed="true"]').count(), 0);
    const first = await frozen(page), weapon = first.weapon;
    await page.keyboard.press('Digit5'); await page.keyboard.press('Space'); await page.keyboard.press('KeyR'); await page.keyboard.press('KeyE');
    assert.equal((await state(page)).weapon, weapon, 'Rest keyboard input cannot switch a weapon');
    const layout = await bounds(page, '[data-campaign-route], [data-campaign-supply], [data-campaign-awakening]');
    assert.ok(layout.every(item => !item.overflow && item.width >= 44 && item.height >= 44));
    await shot(page, 'rest-' + size.width + 'x' + size.height);
    const awakeningHits = [];
    for (const id of ['return-dash', 'slide-reload']) {
      awakeningHits.push({ id, ...await scrollHit(page, '[data-campaign-awakening="' + id + '"]') });
      await shot(page, 'rest-awakening-' + id + '-' + size.width + 'x' + size.height);
    }
    const confirmHit = await scrollHit(page, '#continue-campaign'); await shot(page, 'rest-confirm-' + size.width + 'x' + size.height);
    await chooseRoute(page, 'foundry', 'power');
    const second = await state(page); assert.equal(second.map, 'foundry'); assert.equal(second.stage, 2);
    await clearBossFixture(page);
    assert.equal(await page.locator('[data-campaign-route]').count(), 1);
    assert.equal(await page.locator('[data-campaign-route="nexus"]').count(), 1);
    assert.equal(await page.locator('[data-campaign-awakening]').count(), 0, 'Final intermission cannot change the acquired branch');
    assert.equal((await state(page)).campaign.awakeningId, second.campaign.awakeningId);
    await chooseRoute(page, 'nexus', 'mobility');
    await page.waitForFunction(() => __campaignQA.game.enemies.some(enemy => enemy.type === 'boss'));
    const finale = await state(page); assert.equal(finale.map, 'nexus'); assert.equal(finale.stage, 3);
    await shot(page, 'finale-' + size.width + 'x' + size.height);
    const entry = await entryPointers(page);
    assert.equal(entry.overlaps.length, 0, 'A final-arena direction pointer overlaps the actual entry HUD: ' + JSON.stringify(entry.overlaps[0]));
    if (!mobile) { await page.keyboard.press('KeyP'); await page.locator('#resume-run').waitFor(); await frozen(page); await page.locator('#resume-run').click(); }
    return { first, second, finale, entry, awakeningHits, confirmHit, fixture: 'Bosses are explicitly spawned and defeated to reach each real menu. Route/supply/awakening choices, scrollable hit targets, central frozen ceremony, world reset, final boss announcement and pause use actual UI/engine; pointer/HUD bounds are sampled across native entry frames without invalidating renderer caches.' };
  });
}
async function touchFlow(browser, size) {
  await test(browser, 'multitouch-rotation-' + size.width + 'x' + size.height, size, true, async (page, context) => {
    await start(page, { mobile: true, doctrine: 'marksman' });
    await clearBossFixture(page); await chooseRoute(page, 'foundry', 'power');
    await clearBossFixture(page); await chooseRoute(page, 'nexus', 'mobility');
    await page.evaluate(() => { const g = __campaignQA.game; g.enemies = []; g.bullets = []; g.hazards = []; g.obstacles = []; g.spawnTimer = 999; g.ammoByWeapon[g.player.weapon]--; g._syncWeapon(); });
    await page.waitForFunction(() => !document.getElementById('reload-button').disabled);
    const cdp = await context.newCDPSession(page), contacts = new Map(); let nextId = 10;
    async function point(selector, id, offset = 0) { const r = await page.locator(selector).boundingBox(); assert.ok(r); return { id, x: r.x + r.width / 2 + offset, y: r.y + r.height / 2, radiusX: 5, radiusY: 5, force: 1 }; }
    async function down(p) { contacts.set(p.id, p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); }
    async function up(id) { const p = contacts.get(id); contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p] }); }
    async function tap(selector) { const p = await point(selector, nextId++); await down(p); await page.waitForTimeout(35); await up(p.id); await page.waitForTimeout(70); }
    const before = await state(page); await down(await point('#move-stick', 1, 28)); await page.waitForTimeout(130);
    await tap('#reload-button'); const reload = await state(page); assert.ok(reload.x > before.x + 5 && reload.reload > 0 && reload.input.moveX > .5);
    await tap('[data-weapon="1"]'); assert.equal((await state(page)).weapon, 1);
    await down(await point('#aim-stick', 2, 28)); await tap('[data-weapon="2"]'); await page.waitForTimeout(120);
    const third = await state(page); assert.ok(third.input.moveX > .5 && third.input.shoot && third.x > reload.x); assert.equal(third.weapon, 2);
    await up(2); await up(1); await page.waitForTimeout(70); assert.equal((await state(page)).input.moveX, 0);
    await shot(page, 'touch-' + size.width + 'x' + size.height);
    await page.setViewportSize({ width: size.height, height: size.width }); await page.locator('#resume-run').waitFor(); const rotated = await frozen(page);
    assert.equal(rotated.input.moveX, 0); assert.equal(rotated.input.shoot, false);
    await page.locator('#resume-run').click(); await page.waitForFunction(time => __campaignQA.game.elapsed > time, rotated.elapsed);
    return { reload, third, rotated, fixture: 'Controlled boss clears reach the final arena and its mobile HUD. Nearby combat/rocks are cleared and one round spent to isolate three-contact movement/reload/switch and orientation lifecycle.' };
  });
}
async function ruinsFlow(browser, size, mobile) {
  await test(browser, 'ruins-cargo-starline-' + size.width + 'x' + size.height, size, mobile, async (page, context) => {
    assert.equal(await page.locator('[data-map]').count(), 5);
    assert.equal(await page.locator('[data-weapon]').count(), 6);
    await start(page, { mobile, map: 'ruins' });
    await page.evaluate(() => {
      const g = __campaignQA.game, cargo = g.delivery.cargos[0];
      g.enemies = []; g.bullets = []; g.hazards = []; g.obstacles = []; g.pickups = []; g.spawnTimer = 999;
      g.player.x = cargo.x; g.player.y = cargo.y; g.player.xpNeeded = 1e9;
    });
    await page.waitForFunction(() => document.getElementById('tracked-target').textContent.includes('拿取'));
    const interact = async () => { if (mobile) { await page.waitForFunction(() => !document.getElementById('touch-interact').disabled); await page.locator('#touch-interact').tap(); } else await page.keyboard.press('KeyE'); };
    await interact(); await page.waitForFunction(() => __campaignQA.game.delivery.carriedId !== null);
    await page.waitForFunction(() => document.getElementById('tracked-target').textContent.includes('交付'));
    const picked = await state(page); assert.equal(picked.delivery.cargos.filter(cargo => cargo.status === 'carried').length, 1);
    assert.match(await page.locator('#relay-progress-label').textContent(), /88%/);
    await page.evaluate(() => { __campaignQA.game.enemies = []; });

    const cdp = mobile ? await context.newCDPSession(page) : null, contacts = new Map(); let contactId = 10;
    async function point(selector, id, dx = 0, dy = 0) { const box = await page.locator(selector).boundingBox(); assert.ok(box); return { id, x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy, radiusX: 5, radiusY: 5, force: 1 }; }
    async function down(p) { contacts.set(p.id, p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); }
    async function up(id) { const p = contacts.get(id); contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p] }); }
    async function tap(selector) { const p = await point(selector, contactId++); await down(p); await page.waitForTimeout(30); await up(p.id); await page.waitForTimeout(35); }
    if (mobile) await down(await point('#move-stick', 1, 28)); else await page.keyboard.down('KeyD');
    await page.waitForTimeout(200);
    const beforeDash = await state(page); assert.ok(beforeDash.x > picked.x + 20 && beforeDash.delivery.carriedId !== null);
    if (mobile) await tap('#dash-button'); else await page.keyboard.press('ShiftLeft');
    await page.waitForFunction(() => __campaignQA.game.delivery.carriedId === null);
    const dropped = await state(page), cargo = dropped.delivery.cargos.find(cargo => cargo.status === 'dropped');
    assert.ok(cargo && cargo.pickupLock > 0); assert.ok(Math.abs(cargo.x - beforeDash.x) < 15, 'Cargo remains at the start of the actual dash');
    await page.waitForFunction(() => document.getElementById('tracked-target').textContent.includes('回收'));
    if (mobile) await up(1); else await page.keyboard.up('KeyD');
    await page.waitForTimeout(400);
    await page.evaluate(() => { const g = __campaignQA.game, cargo = g.delivery.cargos.find(cargo => cargo.status === 'dropped'); g.player.x = cargo.x; g.player.y = cargo.y; });
    await interact(); await page.waitForFunction(() => __campaignQA.game.delivery.carriedId !== null);
    const recovered = await state(page); assert.equal(recovered.delivery.carriedId, picked.delivery.carriedId);

    await page.locator('[data-weapon="5"]').scrollIntoViewIfNeeded(); await page.locator('[data-weapon="5"]').click();
    assert.equal((await state(page)).weapon, 5);
    await page.evaluate(() => {
      const g = __campaignQA.game; g.player.x = 1200; g.player.y = 1000; g.enemies = []; g.hazards = []; g.bullets = [];
      g.ammoByWeapon[5]--; g._syncWeapon();
    });
    await page.waitForFunction(() => !document.getElementById('reload-button').disabled);
    if (mobile) await tap('#reload-button'); else await page.keyboard.press('KeyR');
    await page.waitForFunction(() => __campaignQA.game.player.reloadTimer > 0);
    assert.equal((await state(page)).delivery.carriedId, picked.delivery.carriedId);
    await page.waitForFunction(() => __campaignQA.game.player.reloadTimer === 0);
    async function fire(angle) {
      const shots = await page.evaluate(() => __campaignQA.events.filter(event => event.type === 'shot' && event.weapon === 5).length);
      if (mobile) await down(await point('#aim-stick', 2, Math.cos(angle) * 28, Math.sin(angle) * 28));
      else {
        const aim = await page.evaluate(angle => { const q = __campaignQA, r = q.renderer, g = q.game, box = r.canvas.getBoundingClientRect(); return { x: box.x + r.width / 2 + (g.player.x + Math.cos(angle) * 100 - r.camera.x) * r.scale + r.shakeX, y: box.y + r.height / 2 + (g.player.y + Math.sin(angle) * 100 - r.camera.y) * r.scale + r.shakeY }; }, angle);
        await page.mouse.move(aim.x, aim.y); await page.mouse.down();
      }
      await page.waitForFunction(count => __campaignQA.events.filter(event => event.type === 'shot' && event.weapon === 5).length > count, shots);
      if (mobile) await up(2); else await page.mouse.up();
    }
    await fire(0); await page.waitForFunction(() => __campaignQA.game.starPins.length > 0);
    await fire(.3); await page.waitForFunction(() => __campaignQA.game.starLines.length > 0);
    const line = await state(page); assert.equal(line.delivery.carriedId, picked.delivery.carriedId);
    assert.ok(line.starLines.length <= 2 && line.starPins.length <= 4);
    if (mobile) await page.locator('#fullscreen-pause').tap(); else await page.keyboard.press('KeyP');
    await page.locator('#resume-run').waitFor(); const paused = await frozen(page);
    await shot(page, 'ruins-pause-' + size.width + 'x' + size.height);
    await page.locator('#resume-run').click();
    await page.evaluate(() => { const g = __campaignQA.game, cargo = g.delivery.cargos.find(cargo => cargo.id === g.delivery.carriedId), relay = g.relays.find(relay => relay.id === cargo.relayId); g.player.x = relay.x; g.player.y = relay.y; });
    await interact(); await page.waitForFunction(() => __campaignQA.game.completedRelays === 1);
    const delivered = await state(page); assert.equal(delivered.delivery.carriedId, null);
    assert.equal(delivered.delivery.cargos.filter(cargo => cargo.status === 'delivered').length, 1);
    const events = await page.evaluate(() => __campaignQA.events.filter(event => ['cargo-picked', 'cargo-dropped', 'cargo-delivered', 'star-pin', 'starline-created'].includes(event.type)));
    assert.equal(events.filter(event => event.type === 'cargo-picked').length, 2);
    assert.equal(events.filter(event => event.type === 'cargo-dropped').length, 1);
    assert.equal(events.filter(event => event.type === 'cargo-delivered').length, 1);
    await shot(page, 'ruins-delivery-' + size.width + 'x' + size.height);
    await clearBossFixture(page); assert.equal((await state(page)).delivery, null);
    assert.equal(await page.locator('[data-campaign-route="ruins"]').count(), 0);
    await chooseRoute(page, 'foundry', 'repair');
    const travel = await state(page); assert.equal(travel.map, 'foundry'); assert.equal(travel.weapon, 5);
    assert.equal(travel.delivery, null); assert.deepEqual(travel.starPins, []); assert.deepEqual(travel.starLines, []);
    return { picked, beforeDash, dropped, recovered, line, paused, delivered, travel, events, fixture: 'Native keyboard/CDP touch pickup, moving dash/drop/recovery, sixth-weapon reload and two aimed shots form a real wire while carrying. Controlled positions and cleared dangers isolate new UI boundaries. Pause freezes full cargo/pin/line snapshots. One controlled boss clear verifies real intermission/world reset. No account or cloud writes; not a natural playthrough.' };
  });
}
async function revelationFlow(browser) {
  await test(browser, 'secret-boss-rest-priority', { width: 1440, height: 1000 }, false, async page => {
    await start(page);
    await page.evaluate(() => {
      const g = __campaignQA.game, p = g.player;
      g.enemies = []; g.bullets = []; g.hazards = []; g.obstacles = []; g.pickups = []; g.spawnTimer = 999;
      g.discoveredSecrets.delete('bullet-reversal'); p.skillCooldown = 0;
      g.bossSpawned = false; g._spawnBoss();
      const boss = g.enemies.find(enemy => enemy.type === 'boss'); boss.x = p.x + 90; boss.y = p.y; boss.hp = 1; boss.attackTimer = 999;
      for (let i = 0; i < 5; i++) g.bullets.push({ id: 88000 + i, type: 'bullet', owner: 'enemy', x: p.x + 40 + i * 2, y: p.y, vx: 0, vy: 0, radius: 4, lifetime: 4, damage: 1, pierce: 0, color: '#f88' });
    });
    await page.keyboard.press('KeyQ'); await page.locator('#revelation-overlay:not(.hidden)').waitFor();
    await page.waitForFunction(() => __campaignQA.game.phase === 'campaign-rest');
    assert.equal(await page.locator('#screen-overlay').evaluate(element => element.inert), true);
    const before = await frozen(page);
    await page.keyboard.press('Digit1'); await page.keyboard.press('Enter'); await page.keyboard.press('KeyE');
    assert.equal((await state(page)).stage, 1, 'Discovery keyboard cannot commit an intermission choice');
    assert.equal((await state(page)).phase, 'campaign-rest');
    await shot(page, 'secret-before-intermission');
    await page.waitForFunction(() => !document.getElementById('revelation-continue').disabled);
    await page.locator('#revelation-continue').click();
    assert.equal(await page.locator('#screen-overlay').evaluate(element => element.inert), false);
    await page.locator('#continue-campaign').waitFor(); await frozen(page);
    await chooseRoute(page, 'frost', 'repair');
    const after = await state(page); assert.equal(after.stage, 2); assert.equal(after.map, 'frost');
    const events = await page.evaluate(() => __campaignQA.events.filter(event => ['secret-discovered', 'campaign-rest'].includes(event.type)));
    assert.equal(events.filter(event => event.type === 'secret-discovered').length, 1);
    assert.equal(events.filter(event => event.type === 'campaign-rest').length, 1);
    return { before, after, events, fixture: 'A one-HP boss and five nearby enemy bullets are prepared. One real Q/EMP input discovers bullet reversal and kills the boss in the same action; native UI safely serializes ceremony and intermission.' };
  });
}
async function resultFlow(browser) {
  await test(browser, 'result-seed-restart-and-camp-reset', { width: 1440, height: 1000 }, false, async page => {
    await start(page, { doctrine: 'conductor', map: 'storm' });
    const initial = await state(page);
    await clearBossFixture(page); await chooseRoute(page, 'foundry', 'power');
    await clearBossFixture(page); await chooseRoute(page, 'nexus', 'mobility');
    await page.evaluate(() => { const g = __campaignQA.game; g._damageEnemy(g.enemies.find(enemy => enemy.type === 'boss'), 1000000); });
    await page.locator('#restart-campaign').waitFor(); const result = await frozen(page);
    assert.equal(result.phase, 'won'); assert.equal(result.campaign.completedStages, 3);
    assert.match(await page.locator('#screen-content').textContent(), /雷鸣废港.*赤焰熔炉.*裂隙中枢/);
    await shot(page, 'campaign-result');
    await page.locator('#restart-campaign').click();
    await page.waitForFunction(() => __campaignQA.game.phase === 'playing');
    const replay = await state(page);
    assert.equal(replay.campaign.seed, initial.campaign.seed); assert.equal(replay.campaign.doctrineId, 'conductor'); assert.equal(replay.map, 'storm'); assert.equal(replay.stage, 1);
    assert.equal(replay.campaign.awakeningId, '', 'Retry starts a new build choice');
    await page.evaluate(() => { const g = __campaignQA.game; g.player.invulnerable = 0; g._damagePlayer(1000000); });
    await page.locator('#campaign-camp').click();
    await page.locator('#start-run').waitFor();
    const camp = await state(page); assert.equal(camp.phase, 'ready'); assert.equal(camp.campaign, null);
    assert.equal(await page.evaluate(() => __campaignQA.game.mode), 'expedition');
    return { result, replay, camp, fixture: 'Boss kills and a lethal hit are controlled boundary fixtures. Actual result buttons replay the same seed/doctrine and cleanly return to a fresh normal expedition.' };
  });
}
async function restExit(browser) {
  await test(browser, 'mobile-rest-exit-cancel-preserves-choices', { width: 390, height: 844 }, true, async page => {
    await start(page, { mobile: true }); await clearBossFixture(page);
    await page.locator('#leave-campaign-rest').tap(); await page.locator('#keep-campaign').tap();
    assert.equal(await page.locator('[data-campaign-awakening][aria-pressed="true"]').count(), 0);
    assert.equal(await page.locator('#continue-campaign').isDisabled(), true, 'Cancelling before a branch is chosen preserves the empty choice');
    await page.locator('[data-campaign-route="storm"]').tap();
    await page.locator('[data-campaign-supply="mobility"]').tap();
    await page.locator('[data-campaign-awakening="slide-reload"]').tap();
    await page.locator('#leave-campaign-rest').tap(); await page.locator('#keep-campaign').waitFor();
    const before = await frozen(page); await page.locator('#keep-campaign').tap();
    assert.equal(await page.locator('[data-campaign-route="storm"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-campaign-supply="mobility"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-campaign-awakening="slide-reload"]').getAttribute('aria-pressed'), 'true');
    assert.equal((await state(page)).stage, 1);
    await page.locator('#leave-campaign-rest').tap();
    await page.setViewportSize({ width: 844, height: 390 }); await page.locator('#finish-campaign').waitFor();
    const rotated = await frozen(page); assert.equal(rotated.phase, 'campaign-rest');
    await page.locator('#finish-campaign').tap(); await page.locator('#start-run').waitFor();
    const camp = await state(page); assert.equal(camp.campaign, null); assert.equal(camp.phase, 'ready');
    return { before, rotated, camp, fixture: 'A controlled boss kill reaches rest. Real phone tap/scroll cancellation preserves the selected route and reward; orientation keeps the exit confirmation paused; confirmed exit clears only the run.' };
  });
}
async function prepareAwakening(page, doctrine, awakening, mobile = false) {
  await start(page, { doctrine, mobile }); await clearBossFixture(page);
  await chooseRoute(page, 'foundry', 'power', awakening);
  await page.evaluate(() => {
    const g = __campaignQA.game;
    g.enemies = []; g.bullets = []; g.hazards = []; g.obstacles = []; g.pickups = []; g.spawnTimer = 999;
    g.ammoByWeapon[0] = 10; g.player.critChance = 0; g._syncWeapon();
  });
  assert.equal((await state(page)).campaign.awakeningId, awakening);
}
async function perfectReload(page) {
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => { const p = __campaignQA.game.player; return p.reloadProgress > p.reloadWindowStart + .01 && p.reloadProgress < p.reloadWindowEnd - .02; });
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => __campaignQA.events.some(event => event.type === 'reload-perfect'));
}
async function awakeningFlow(browser) {
  for (const [doctrine, awakening, trigger] of [
    ['skirmisher', 'return-dash', 'return'], ['skirmisher', 'slide-reload', 'slide'],
    ['marksman', 'mag-relay', 'relay'], ['marksman', 'interrupt-round', 'interrupt'],
    ['conductor', 'mobile-field', 'field-capture'], ['conductor', 'charged-pulse', 'release']
  ]) await test(browser, 'awakening-' + awakening, { width: 1440, height: 1000 }, false, async page => {
    await prepareAwakening(page, doctrine, awakening);
    const initial = await state(page);
    if (awakening === 'return-dash') {
      await page.keyboard.down('KeyD'); await page.keyboard.press('ShiftLeft'); await page.keyboard.up('KeyD');
      await page.waitForFunction(() => __campaignQA.game.player.dashTimer <= 0 && __campaignQA.game.awakeningState.returnAnchor);
      assert.match(await page.locator('#dash-label').textContent(), /折返/);
      await page.keyboard.press('ShiftLeft');
      await page.waitForFunction(() => __campaignQA.game.player.dashTimer <= 0 && __campaignQA.events.some(event => event.type === 'awakening-trigger' && event.stage === 'return'));
      const returned = await state(page); assert.ok(Math.hypot(returned.x - initial.x, returned.y - initial.y) < 20);
    } else if (awakening === 'slide-reload') {
      await page.keyboard.press('KeyR'); await page.waitForFunction(() => __campaignQA.game.player.reloadTimer > 0);
      await page.keyboard.down('KeyD'); await page.keyboard.press('ShiftLeft'); await page.keyboard.up('KeyD');
      await page.waitForFunction(() => __campaignQA.game.player.reloadTimer === 0);
      assert.equal(await page.evaluate(() => __campaignQA.game.overchargedByWeapon[0]), 0);
    } else if (awakening === 'mag-relay') {
      await perfectReload(page); await page.keyboard.press('Digit2');
      assert.equal((await state(page)).weapon, 1);
      assert.equal(await page.evaluate(() => __campaignQA.game.overchargedByWeapon[1]), 1);
    } else if (awakening === 'interrupt-round') {
      await perfectReload(page);
      const point = await page.evaluate(() => {
        const q = __campaignQA, g = q.game, r = q.renderer;
        const enemy = g.spawnEnemy('tank', { x: g.player.x + 150, y: g.player.y }); enemy.attackTimer = 999;
        const rect = r.canvas.getBoundingClientRect();
        return { x: rect.left + r.width / 2 + (enemy.x - r.camera.x) * r.scale, y: rect.top + r.height / 2 + (enemy.y - r.camera.y) * r.scale };
      });
      await page.mouse.move(point.x, point.y); await page.mouse.down();
      await page.waitForFunction(() => __campaignQA.events.some(event => event.type === 'awakening-trigger' && event.stage === 'interrupt'));
      await page.mouse.up();
    } else if (awakening === 'mobile-field') {
      await page.keyboard.press('KeyQ'); await page.waitForFunction(() => __campaignQA.game.awakeningState.field);
      await page.evaluate(() => {
        const g = __campaignQA.game, p = g.player;
        for (let i = 0; i < 10; i++) g.bullets.push({ id: 88000 + i, type: 'bullet', owner: 'enemy', x: p.x + 40 + i * 2, y: p.y, vx: 0, vy: 0, radius: 4, lifetime: 5, damage: 1, pierce: 0, color: '#f88' });
      });
      await page.waitForFunction(() => !__campaignQA.game.awakeningState.field);
      const captures = await page.evaluate(() => __campaignQA.events.filter(event => event.type === 'awakening-trigger' && event.stage === 'field-capture').length);
      assert.equal(captures, 8); assert.equal((await state(page)).bullets, 2);
    } else {
      await page.keyboard.down('KeyD'); await page.keyboard.press('KeyQ');
      await page.waitForFunction(() => __campaignQA.game.awakeningState.charge);
      assert.match(await page.locator('#skill-label').textContent(), /再按释放/);
      assert.equal(await page.locator('#skill-button').isDisabled(), false);
      await page.keyboard.press('KeyP'); await page.locator('#resume-run').waitFor();
      const heldCharge = await frozen(page); assert.ok(heldCharge.awakeningState.charge);
      await page.locator('#resume-run').click(); await page.keyboard.down('KeyD');
      await page.waitForFunction(() => __campaignQA.events.some(event => event.type === 'awakening-trigger' && event.stage === 'release'));
      await page.keyboard.up('KeyD');
      const release = await page.evaluate(() => __campaignQA.events.find(event => event.type === 'awakening-trigger' && event.stage === 'release'));
      assert.ok(release.x > initial.x + 100, 'Full charge releases from the current moving player location');
    }
    const events = await page.evaluate(() => __campaignQA.events.filter(event => ['awakening-acquired', 'awakening-trigger'].includes(event.type)));
    assert.equal(events.filter(event => event.type === 'awakening-acquired').length, 1);
    assert.ok(events.some(event => event.awakeningId === awakening && event.stage === trigger));
    await shot(page, 'awakening-' + awakening);
    return { initial, after: await state(page), events, fixture: 'A controlled boss clear enters first rest; actual route/supply/awakening buttons commit once. Cleared nearby threats/rocks and a partially spent magazine isolate real native keyboard/mouse ability inputs. Interruption creates one ordinary tank; electric field receives ten static nearby enemy bullets after the initial EMP.' };
  });
}
async function chargeTouchFlow(browser, size) {
  await test(browser, 'charge-multitouch-' + size.width + 'x' + size.height, size, true, async (page, context) => {
    await prepareAwakening(page, 'conductor', 'charged-pulse', true);
    const cdp = await context.newCDPSession(page), contacts = new Map(); let nextId = 10;
    async function point(selector, id, offset = 0) { const r = await page.locator(selector).boundingBox(); assert.ok(r); return { id, x: r.x + r.width / 2 + offset, y: r.y + r.height / 2, radiusX: 5, radiusY: 5, force: 1 }; }
    async function down(p) { contacts.set(p.id, p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); }
    async function up(id) { const p = contacts.get(id); contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p] }); }
    async function tap(selector) { const p = await point(selector, nextId++); await down(p); await page.waitForTimeout(30); await up(p.id); }
    const initial = await state(page);
    await down(await point('#move-stick', 1, 28)); await down(await point('#aim-stick', 2, 28));
    await tap('#skill-button'); await page.waitForFunction(() => __campaignQA.game.awakeningState.charge);
    assert.equal(await page.locator('#skill-button').isDisabled(), false);
    const charging = await state(page); assert.ok(charging.input.moveX > .5 && charging.input.shoot);
    await tap('#skill-button');
    await page.waitForFunction(() => !__campaignQA.game.awakeningState.charge && __campaignQA.events.some(event => event.type === 'awakening-trigger' && event.stage === 'release'));
    const released = await state(page); assert.ok(released.x > initial.x && released.input.moveX > .5 && released.input.shoot);
    await up(2); await up(1); await page.waitForTimeout(100);
    const idle = await state(page); assert.equal(idle.input.moveX, 0); assert.equal(idle.input.shoot, false);
    const events = await page.evaluate(() => __campaignQA.events.filter(event => event.type === 'awakening-trigger' && ['charge', 'release'].includes(event.stage)));
    assert.equal(events.filter(event => event.stage === 'charge').length, 1); assert.equal(events.filter(event => event.stage === 'release').length, 1);
    await shot(page, 'charge-multitouch-' + size.width + 'x' + size.height);
    return { charging, released, idle, events, fixture: 'First-rest boundary fixture obtains charged-pulse. CDP keeps movement and aiming fingers held while a third finger starts and manually releases EMP, using actual buttons without synthetic game actions.' };
  });
}
async function magRelayBackgroundFlow(browser) {
  await test(browser, 'mag-relay-background-reload', { width: 1440, height: 1000 }, false, async page => {
    await prepareAwakening(page, 'marksman', 'mag-relay');
    await page.evaluate(() => { const g = __campaignQA.game; g.ammoByWeapon[1] = 1; });
    await page.keyboard.press('Digit2'); await page.keyboard.press('KeyR');
    await page.waitForFunction(() => __campaignQA.game.reloadByWeapon[1] > 0);
    await page.keyboard.press('Digit1'); await perfectReload(page);
    const pending = await page.evaluate(() => { const g = __campaignQA.game; return { ammo: g.ammoByWeapon[1], timer: g.reloadByWeapon[1] }; });
    assert.equal(pending.ammo, 1); assert.ok(pending.timer > 0);
    await page.keyboard.press('Digit2');
    const switched = await page.evaluate(() => { const g = __campaignQA.game; return { ammo: g.ammoByWeapon[1], timer: g.reloadByWeapon[1] }; });
    assert.equal(switched.ammo, 1); assert.ok(switched.timer > 0 && switched.timer <= pending.timer);
    await page.waitForFunction(() => __campaignQA.game.reloadByWeapon[1] === 0);
    assert.equal(await page.evaluate(() => __campaignQA.game.overchargedByWeapon[1]), 1);
    const point = await page.evaluate(() => { const r = __campaignQA.renderer, box = r.canvas.getBoundingClientRect(); return { x: box.left + r.width / 2 + 80, y: box.top + r.height / 2 }; });
    const magazine = await page.evaluate(() => __campaignQA.game.ammoByWeapon[1]);
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.waitForFunction(ammo => __campaignQA.game.ammoByWeapon[1] < ammo, magazine); await page.mouse.up();
    const first = await page.evaluate(() => { const g = __campaignQA.game; return { bullets: g.bullets.filter(bullet => bullet.owner === 'player').map(bullet => bullet.damage), charged: g.overchargedByWeapon[1], ammo: g.ammoByWeapon[1] }; });
    assert.equal(first.charged, 0); assert.equal(first.ammo, magazine - 1);
    assert.ok(first.bullets.length && first.bullets.every(damage => Math.abs(damage - 15 * 1.1 * 1.5) < 1e-9));
    await page.waitForTimeout(700); await page.mouse.down();
    await page.waitForFunction(ammo => __campaignQA.game.ammoByWeapon[1] < ammo, first.ammo); await page.mouse.up();
    const second = await page.evaluate(() => __campaignQA.game.bullets.filter(bullet => bullet.owner === 'player').map(bullet => bullet.damage));
    assert.ok(second.length && second.every(damage => Math.abs(damage - 15 * 1.1) < 1e-9));
    return { pending, switched, first, second, fixture: 'A controlled first-rest boss clear and partially spent A/B magazines isolate the boundary. Real Digit/R precision inputs, background reload time and mouse firing prove relay survives ordinary target reload and strengthens exactly its first shot.' };
  });
}
async function ceremonyPendingXp(browser) {
  await test(browser, 'ceremony-pending-xp-upgrade-order', { width: 1440, height: 1000 }, false, async page => {
    await start(page, { doctrine: 'marksman' }); await clearBossFixture(page, true);
    const first = await state(page); assert.equal(first.phase, 'campaign-rest');
    await chooseRoute(page, 'foundry', 'repair', 'interrupt-round');
    await page.locator('[data-upgrade]').first().waitFor();
    const upgrade = await frozen(page); assert.equal(upgrade.phase, 'upgrade'); assert.equal(upgrade.stage, 2);
    assert.equal(await page.evaluate(() => __campaignQA.game.player.xp), 7);
    assert.equal(await page.locator('#continue-awakening').count(), 0);
    await page.locator('[data-upgrade]').first().click();
    await page.waitForFunction(() => __campaignQA.game.phase === 'playing');
    return { first, upgrade, after: await state(page), fixture: 'First boss boundary fixture awards enough XP in the same transaction. Actual branch confirmation presents the frozen central ceremony before the earned upgrade, then returns to second-sector combat.' };
  });
}
async function publicRun(browser) {
  await test(browser, 'public-native-three-act-run', { width: 1440, height: 1000 }, false, async page => {
    await start(page, { doctrine: 'marksman', map: 'foundry' });
    const initial = await page.evaluate(() => { const g = __campaignQA.game; return { hp: g.player.hp, maxHp: g.player.maxHp, level: g.player.level, damage: g.player.damageMultiplier, seed: g.campaign.seed, doctrine: g.campaign.doctrineId }; });
    await page.evaluate(() => { __campaignQA.auto = true; });
    const began = Date.now(), samples = []; let lastLogged = -1;
    while (Date.now() - began < 600000) {
      const current = await page.evaluate(() => { const g = __campaignQA.game; return { phase: g.phase, stage: g.campaign.stage, map: g.map.id, hp: g.player.hp, maxHp: g.player.maxHp, elapsed: g.elapsed, level: g.player.level, evolution: g.evolutionId, choices: g.upgradeChoices, remaining: g.enemies.filter(e => e.hp > 0).length }; });
      if (Math.floor(current.elapsed / 20) > lastLogged) { lastLogged = Math.floor(current.elapsed / 20); samples.push(current); console.log('NATIVE ' + JSON.stringify(current)); }
      if (['won', 'lost'].includes(current.phase)) break;
      if (await page.locator('#revelation-overlay:not(.hidden)').count()) {
        await page.waitForFunction(() => !document.getElementById('revelation-continue').disabled); await page.locator('#revelation-continue').click();
      } else if (current.phase === 'upgrade') {
        const order = current.hp < current.maxHp * .6 ? ['health', 'shield', 'vampire', 'damage', 'rapid', 'magnet', 'pulse', 'reload', 'crit', 'capacity', 'speed', 'dash'] : ['vampire', 'damage', 'rapid', 'health', 'shield', 'magnet', 'pulse', 'reload', 'crit', 'capacity', 'speed', 'dash'];
        const rank = item => item.evolution ? 99 : order.includes(item.id) ? order.indexOf(item.id) : 50;
        const choice = current.choices.find(item => item.id === 'piercer-mirror') || current.choices.find(item => item.id === 'shatter') || current.choices.toSorted((a, b) => rank(a) - rank(b))[0];
        await page.locator('[data-upgrade="' + choice.id + '"]').click();
      } else if (current.phase === 'campaign-rest') {
        await shot(page, 'public-rest-' + current.stage); await chooseRoute(page, current.stage === 1 ? 'frost' : 'nexus', current.hp < current.maxHp * .7 ? 'repair' : 'power');
      }
      await page.waitForTimeout(450);
    }
    await page.evaluate(() => { __campaignQA.auto = false; });
    const result = await page.evaluate(() => {
      const q = __campaignQA, g = q.game;
      return { phase: g.phase, elapsed: g.elapsed, hp: g.player.hp, level: g.player.level, campaign: g.campaign, evolutionId: g.evolutionId, lastDamage: g.lastDamage,
        events: q.events.filter(event => ['campaign-stage', 'campaign-rest', 'campaign-complete', 'weapon-evolved', 'anchor-break', 'nexus-shield-break', 'win', 'lose'].includes(event.type)) };
    });
    await shot(page, 'public-final');
    report.nativeResult = { initial, result, samples, wallSeconds: (Date.now() - began) / 1000 };
    assert.equal(result.phase, 'won', 'Native browser run must naturally finish all three acts');
    assert.deepEqual(result.campaign.visited, ['foundry', 'frost', 'nexus']);
    assert.equal(result.campaign.completedStages, 3); assert.equal(result.evolutionId, 'piercer-mirror');
    assert.equal(result.events.filter(event => event.type === 'anchor-break').length, 2);
    assert.equal(result.events.filter(event => event.type === 'win').length, 1);
    return { initial, result, samples, wallSeconds: (Date.now() - began) / 1000, fixture: 'Isolated guest preferences mute audio and mark existing secret techniques as previously known; --seed pins the ordinary run seed when provided. Combat stats remain original. Native requestAnimationFrame and exact source/release resources. Bot supplies public movement/aim/fire/reload/dash/EMP commands; actual visible upgrade/route buttons are clicked. No virtual time, teleport, HP/damage edits or objective shortcuts.' };
  });
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    if (online) await verifyHosted(browser);
    if (publicOnly) { await publicRun(browser); }
    else {
    for (const [size, mobile] of [[{ width: 1440, height: 1000 }, false], [{ width: 360, height: 800 }, true], [{ width: 844, height: 390 }, true]]) {
      await setupCase(browser, size, mobile); await restFlow(browser, size, mobile); await ruinsFlow(browser, size, mobile);
    }
    await touchFlow(browser, { width: 390, height: 844 }); await touchFlow(browser, { width: 844, height: 390 });
    await revelationFlow(browser); await resultFlow(browser); await restExit(browser);
    await awakeningFlow(browser);
    await chargeTouchFlow(browser, { width: 390, height: 844 }); await chargeTouchFlow(browser, { width: 844, height: 390 });
    await magRelayBackgroundFlow(browser);
    await ceremonyPendingXp(browser);
    }
  } finally { await browser.close(); save(); }
  console.log(JSON.stringify({ cases: report.cases.length, failed: report.cases.filter(item => !item.pass).length, pageErrors: report.errors.length, output }));
  if (!report.cases.length || report.cases.some(item => !item.pass) || report.errors.length) process.exitCode = 1;
})().catch(error => { report.errors.push({ message: error.stack }); console.error(error); process.exitCode = 1; save(); });
