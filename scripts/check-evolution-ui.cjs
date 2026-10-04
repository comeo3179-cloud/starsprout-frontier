/* Weapon-evolution UI acceptance in isolated guest Edge. Fixtures prepare upgrade
 * thresholds for deterministic UI/lifecycle coverage; --public-only earns one
 * evolution through original-stat movement/combat and real DOM upgrade choices.
 * Usage: node scripts/check-evolution-ui.cjs [--release | --online URL] [--public-only] [--case NAME]
 */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; ({ chromium } = require('../build-tools/browser/node_modules/playwright')); }
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2), onlineIndex = args.indexOf('--online');
const online = onlineIndex >= 0, release = args.includes('--release');
const onlineUrl = online ? (args[onlineIndex + 1] && !args[onlineIndex + 1].startsWith('--') ? args[onlineIndex + 1] : 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com/') : null;
const origin = online ? new URL(onlineUrl).origin : 'http://127.0.0.1:4186', mode = online ? 'online' : release ? 'release' : 'source';
const folder = release ? path.join(root, 'release/web') : root, outputFolder = path.join(root, 'reports', 'evolution-ui-' + mode);
const publicOnly = args.includes('--public-only'), filter = args.includes('--case') ? args[args.indexOf('--case') + 1] : '';
const output = path.join(outputFolder, publicOnly ? 'results-public.json' : filter ? 'results-' + filter.replace(/[^a-z0-9-]/gi, '_') + '.json' : 'results.json');
const simulator = fs.readFileSync(path.join(root, 'scripts/simulate-expedition.js'), 'utf8');
const botSource = simulator.slice(simulator.indexOf('function seededRandom('), simulator.indexOf('\nfunction simulate('));
const report = { timestamp: new Date().toISOString(), mode, onlineUrl, cases: [], errors: [], files: {}, note: 'Isolated guest storage. Actual source or minified release files; online same-origin files are not replaced. Fixture cases prepare level thresholds and cleared combat, not difficulty evidence. The public case uses ordinary actions and original stats under native rAF. CDP supplies actual simultaneous touch contacts. Mobile viewport emulation is not a physical-phone claim.' };
fs.mkdirSync(outputFolder, { recursive: true });
const cache = new Map();
function save() { fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
function observer() {
  const q = window.__evolutionQA = { events: [], updates: 0, input: {}, auto: false, samples: [], bot: new Explorer() };
  let api;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
    api = value; api.Game = new Proxy(api.Game, { construct(target, args, next) {
      const game = Reflect.construct(target, [{ ...args[0], random: seededRandom(731) }], next); q.game = game;
      const update = game.update, drain = game.drainEvents;
      game.update = function(dt, input) {
        if (q.auto && this.phase === 'playing') input = q.bot.input(this);
        q.input = { ...input }; q.updates++;
        if (q.auto && q.updates % 120 === 0) q.samples.push({ time: this.elapsed, level: this.player.level, hp: this.player.hp, kills: this.kills });
        return update.call(this, dt, input);
      };
      game.drainEvents = function() { const events = drain.call(this); q.events.push(...events.map(event => ({ ...event }))); return events; };
      return game;
    } });
  } });
  localStorage.setItem('frontier-sound', 'off');
  localStorage.setItem('frontier-secrets-v1', JSON.stringify(['rebound', 'blade-relay', 'bullet-reversal', 'fuse-resonance', 'rail-resonance', 'ice-break']));
}
async function create(browser, name, settings = {}) {
  const context = await browser.newContext({ viewport: settings.size || { width: 1440, height: 1000 }, isMobile: !!settings.mobile, hasTouch: !!settings.mobile, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (online) return route.continue();
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', file = path.resolve(folder, name);
    if (!file.startsWith(folder + path.sep)) return route.abort();
    try {
      if (!cache.has(name)) cache.set(name, fs.readFileSync(file));
      const body = cache.get(name); report.files[name] = crypto.createHash('sha256').update(body).digest('hex');
      await route.fulfill({ body, contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(name)] || 'application/octet-stream' });
    } catch { await route.fulfill({ status: name === 'favicon.ico' ? 204 : 404, body: '' }); }
  });
  await context.addInitScript({ content: '(()=>{const options={mode:"explore",build:"reactor"},distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);' + botSource + '\n(' + observer.toString() + ')();})();' });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => report.errors.push({ name, message: error.message }));
  if (online) page.on('response', async response => {
    const url = new URL(response.url());
    if (url.origin === origin && response.ok() && /(?:\.js|\.css|\/|\.html)$/.test(url.pathname)) {
      try { report.files[url.pathname] = crypto.createHash('sha256').update(await response.body()).digest('hex'); } catch { /* Navigation may close a response. */ }
    }
  });
  await page.goto(online ? onlineUrl : origin + '/', { waitUntil: 'domcontentloaded' });
  if (online && await page.locator('#submitBtn').count()) {
    assert.match(await page.locator('body').innerText(), /测试域名/);
    await page.locator('#submitBtn').click({ timeout: 16000 });
  }
  await page.locator('#open-evolutions').waitFor();
  await page.waitForFunction(() => window.__evolutionQA?.game && Expedition.EVOLUTIONS?.length === 5);
  return { context, page };
}
async function shot(page, name) { await page.screenshot({ path: path.join(outputFolder, name + '.png') }); }
async function test(browser, name, settings, body) {
  if (filter && !name.includes(filter)) return;
  let page, context;
  try {
    ({ page, context } = await create(browser, name, settings));
    const data = await body(page, context);
    report.cases.push({ name, pass: true, ...data }); console.log('PASS ' + name);
  } catch (error) {
    if (page) await shot(page, name + '-failure').catch(() => {});
    const state = page ? await page.evaluate(() => ({ phase: __evolutionQA?.game?.phase, evolutionId: __evolutionQA?.game?.evolutionId, content: document.getElementById('screen-content')?.textContent })).catch(() => null) : null;
    report.cases.push({ name, pass: false, error: error.stack, state }); console.error('FAIL ' + name + ': ' + error.message);
  } finally { if (context) await context.close(); save(); }
}
async function freeze(page) {
  await page.waitForTimeout(40);
  const snapshot = () => page.evaluate(() => { const g = __evolutionQA.game; return { elapsed: g.elapsed, phase: g.phase, updates: __evolutionQA.updates, evolutionId: g.evolutionId, state: structuredClone(g.evolutionState) }; });
  const before = await snapshot(); await page.waitForTimeout(170); assert.deepEqual(await snapshot(), before, 'Simulation changed behind menu'); return before;
}
async function hit(page, selector, mobile = false) {
  const locator = page.locator(selector).first(); await locator.scrollIntoViewIfNeeded();
  const result = await locator.evaluate(element => {
    const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const text = [...element.querySelectorAll('b,p,em,small,h3')].map(child => { const range = document.createRange(); range.selectNodeContents(child); return [...range.getClientRects()].map(rect => ({ x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom })); }).flat();
    return { text: element.textContent, width: r.width, height: r.height, obscured: hit !== element && !element.contains(hit), overflow: element.scrollWidth > element.clientWidth + 1, textOutsideCard: text.some(t => t.x < r.x - 1 || t.right > r.right + 1) };
  });
  assert.equal(result.obscured, false, selector + ' blocked'); assert.equal(result.overflow, false, selector + ' overflows'); assert.equal(result.textOutsideCard, false, selector + ' text exceeds card');
  if (mobile) assert.ok(result.width >= 44 && result.height >= 44, selector + ' below touch minimum');
  return result;
}
async function start(page, full = false) {
  if (full) { await page.locator('#display-mode-button').click(); await page.waitForFunction(() => document.fullscreenElement || document.getElementById('game-stage').classList.contains('immersive')); }
  await page.locator('#start-run').click(); await page.waitForFunction(() => __evolutionQA.game.phase === 'playing');
}
async function prepareUpgrade(page, weapon, level = null) {
  await page.evaluate(({ weapon, level }) => {
    const g = __evolutionQA.game; g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = []; g.obstacles = []; g.spawnTimer = 999;
    g.player.invulnerable = 999; if (level !== null) g.player.level = level;
    g.switchWeapon(weapon); g.player.xp = g.player.xpNeeded;
  }, { weapon, level });
  await page.locator('[data-upgrade]').first().waitFor(); await freeze(page);
}
async function offerEvolution(page, weapon) {
  const evolution = await page.evaluate(weapon => Expedition.EVOLUTIONS.find(item => item.weapon === weapon), weapon);
  await prepareUpgrade(page, weapon);
  await page.locator('[data-upgrade="' + evolution.prerequisite + '"]').click();
  await page.waitForFunction(() => __evolutionQA.game.phase === 'playing');
  await prepareUpgrade(page, weapon, 3);
  await page.locator('.evolution-card[data-upgrade="' + evolution.id + '"]').waitFor();
  return evolution;
}
async function acquireCase(browser, weapon) {
  await test(browser, 'acquire-keyboard-weapon-' + weapon, {}, async page => {
    await start(page); const evolution = await offerEvolution(page, weapon);
    const card = await hit(page, '[data-upgrade="' + evolution.id + '"]');
    const index = await page.locator('[data-upgrade]').evaluateAll((buttons, id) => buttons.findIndex(button => button.dataset.upgrade === id), evolution.id);
    await page.keyboard.press('Digit' + (index + 1)); await page.waitForTimeout(130);
    assert.equal(await page.evaluate(() => __evolutionQA.game.evolutionId), evolution.id);
    assert.equal(await page.evaluate(() => __evolutionQA.game.player.weapon), weapon, 'Upgrade key must not switch weapon');
    assert.equal(await page.locator('[data-weapon="' + weapon + '"]').evaluate(e => e.classList.contains('evolved')), true);
    const chosen = await page.evaluate(() => __evolutionQA.events.filter(event => event.type === 'weapon-evolved'));
    assert.equal(chosen.length, 1); await page.keyboard.press('KeyP');
    const summary = await page.locator('#screen-content').innerText(); assert.ok(summary.includes(evolution.title));
    await page.locator('#pause-evolutions').click(); await freeze(page); assert.ok((await page.locator('#screen-content').innerText()).includes(evolution.title));
    await page.keyboard.press('Escape'); await page.locator('#resume-run').click();
    await prepareUpgrade(page, weapon);
    assert.equal(await page.locator('.evolution-card').count(), 0, 'Second evolution must not be offered');
    await page.locator('[data-upgrade]').first().click();
    assert.equal(await page.evaluate(() => __evolutionQA.events.filter(event => event.type === 'weapon-evolved').length), 1);
    return { fixture: 'Original prerequisite selected through DOM; level-three threshold prepared to exercise level-four evolution UI.', evolution, card, summary, chosen };
  });
}
async function guideCase(browser, size, mobile, full) {
  const name = 'guide-layout-' + size.width + 'x' + size.height + (full ? '-full' : '');
  await test(browser, name, { size, mobile }, async page => {
    await hit(page, '#open-evolutions', mobile); await page.locator('#open-evolutions').click();
    const initialGuide = await page.locator('#screen-content').evaluate(element => { const title = document.getElementById('screen-title').getBoundingClientRect(), box = element.getBoundingClientRect(); return { scrollTop: element.scrollTop, titleTop: title.top, titleBottom: title.bottom, contentTop: box.top }; });
    await shot(page, name + '-guide-initial');
    const text = await page.locator('#screen-content').innerText(), names = await page.evaluate(() => Expedition.EVOLUTIONS.map(item => item.title));
    names.forEach(title => assert.ok(text.includes(title))); assert.match(text, /4/); assert.match(text, /改造/);
    const guideCards = [];
    for (let i = 1; i <= 5; i++) {
      guideCards.push(await hit(page, '.evolution-catalog article:nth-child(' + i + ')'));
      if ([1, 3, 5].includes(i)) await shot(page, name + '-guide-card-' + i);
    }
    const close = await hit(page, '#close-evolutions', mobile); await freeze(page); await shot(page, name + '-guide');
    await page.keyboard.press('Escape'); await start(page, full); const evolution = await offerEvolution(page, 1);
    const cards = [];
    for (const id of await page.locator('[data-upgrade]').evaluateAll(elements => elements.map(e => e.dataset.upgrade))) cards.push(await hit(page, '[data-upgrade="' + id + '"]', mobile));
    await page.locator('[data-upgrade="' + evolution.id + '"]').scrollIntoViewIfNeeded(); await shot(page, name + '-upgrade');
    await page.locator('[data-upgrade="' + evolution.id + '"]').click(); await page.waitForTimeout(130);
    if (mobile) {
      const bounds = await page.locator('[data-weapon="1"]').boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44, 'Mobile weapon target: ' + JSON.stringify(bounds));
      await hit(page, '#reload-button', true); await hit(page, '#dash-button', true);
    }
    return { close, cards, guideCards, initialGuide, names, evolution: evolution.id, full };
  });
}
async function boundaries(browser) {
  await test(browser, 'revelation-upgrade-priority', {}, async page => {
    await start(page); await prepareUpgrade(page, 0); await page.locator('[data-upgrade="arc"]').click();
    await page.evaluate(() => {
      const g = __evolutionQA.game, p = g.player; p.level = 3; g.discoveredSecrets.delete('bullet-reversal'); p.skillCooldown = 0;
      for (let i = 0; i < 5; i++) g.bullets.push({ id: 88000 + i, type: 'bullet', owner: 'enemy', x: p.x + 40 + i * 2, y: p.y, vx: 0, vy: 0, radius: 4, lifetime: 4, damage: 1, pierce: 0, color: '#f88' });
      const skill = g.useSkill; g.useSkill = function(...args) { const result = skill.apply(this, args); p.xp = p.xpNeeded; this.update(.001, {}); return result; };
    });
    await page.keyboard.press('KeyQ'); await page.locator('#revelation-overlay:not(.hidden)').waitFor();
    assert.equal(await page.evaluate(() => __evolutionQA.game.phase), 'upgrade');
    assert.equal(await page.locator('#screen-overlay').evaluate(e => e.inert), true);
    const before = await freeze(page); await page.keyboard.press('Digit1');
    assert.equal(await page.evaluate(() => __evolutionQA.game.evolutionId), '', 'Secret ceremony blocks upgrade shortcuts');
    await page.waitForFunction(() => !document.getElementById('revelation-continue').disabled); await page.locator('#revelation-continue').click();
    await page.locator('.evolution-card').click(); assert.equal(await page.evaluate(() => __evolutionQA.game.evolutionId), 'assault-chain');
    assert.equal(await page.locator('#screen-overlay').evaluate(e => e.inert), false);
    return { before, fixture: 'Actual EMP reversal discovery coincides with a prepared XP threshold to test overlay priority.' };
  });
  await test(browser, 'trial-evolution-summary', {}, async page => {
    await page.locator('#open-trials').click(); await page.locator('#start-trial').click();
    const evolution = await offerEvolution(page, 2); await page.locator('[data-upgrade="' + evolution.id + '"]').click();
    await page.keyboard.press('KeyP'); await page.locator('#pause-evolutions').click(); await freeze(page);
    assert.equal(await page.evaluate(() => __evolutionQA.game.mode), 'trial');
    assert.match(await page.locator('#screen-content').innerText(), /本局已进化/);
    await page.locator('#close-evolutions').click(); await page.locator('#resume-run').click();
    assert.equal(await page.evaluate(() => __evolutionQA.game.phase), 'playing'); return { evolution: evolution.id, fixture: 'Trial XP thresholds and clear combat prepared; original reward choice and pause handlers.' };
  });
  await test(browser, 'chain-upgrade-rotation-reset', { size: { width: 390, height: 844 }, mobile: true }, async page => {
    await start(page, true); const evolution = await offerEvolution(page, 4);
    await page.evaluate(() => { __evolutionQA.game.player.xp = __evolutionQA.game.player.xpNeeded; });
    const before = await freeze(page); await page.setViewportSize({ width: 844, height: 390 });
    await page.keyboard.press('Escape'); await page.keyboard.press('KeyM'); await freeze(page);
    assert.equal(await page.evaluate(() => __evolutionQA.game.phase), 'upgrade');
    await page.locator('[data-upgrade="' + evolution.id + '"]').click();
    await page.waitForFunction(() => __evolutionQA.game.player.level === 5);
    assert.equal(await page.evaluate(() => __evolutionQA.game.evolutionId), evolution.id);
    assert.equal(await page.locator('.evolution-card').count(), 0); await freeze(page);
    await page.locator('[data-upgrade]').first().click();
    await page.locator('#fullscreen-pause').click(); await page.locator('#change-sector').click(); await page.locator('#confirm-camp').click();
    const reset = await page.evaluate(() => ({ evolutionId: __evolutionQA.game.evolutionId, state: __evolutionQA.game.evolutionState, phase: __evolutionQA.game.phase }));
    assert.equal(reset.evolutionId, ''); assert.equal(reset.phase, 'ready'); assert.equal(reset.state.breachTimer, 0); assert.deepEqual(reset.state.echoes, []);
    assert.equal(await page.locator('[data-weapon].evolved').count(), 0); return { before, reset, fixture: 'One additional threshold queued to cover chained upgrades; viewport rotation is real browser resize.' };
  });
}
async function multiTouch(browser, size) {
  await test(browser, 'multitouch-evolved-' + size.width + 'x' + size.height, { size, mobile: true }, async (page, context) => {
    await start(page, true); const evolution = await offerEvolution(page, 1); await page.locator('[data-upgrade="' + evolution.id + '"]').click();
    await page.evaluate(() => { const g = __evolutionQA.game; g.player.x = 600; g.player.y = 1000; g.ammoByWeapon[1]--; g._syncWeapon(); __evolutionQA.events = []; });
    await page.waitForTimeout(150);
    const cdp = await context.newCDPSession(page), contacts = new Map(); let nextId = 10;
    async function point(selector, id, dx = 0) { const box = await page.locator(selector).boundingBox(); assert.ok(box, selector); return { id, x: box.x + box.width / 2 + dx, y: box.y + box.height / 2, radiusX: 5, radiusY: 5, force: 1 }; }
    async function down(contact) { contacts.set(contact.id, contact); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); }
    async function up(id) { const contact = contacts.get(id); contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [contact] }); }
    async function tap(selector) { const contact = await point(selector, nextId++); await down(contact); await page.waitForTimeout(30); await up(contact.id); await page.waitForTimeout(60); }
    const initialX = await page.evaluate(() => __evolutionQA.game.player.x);
    await down(await point('#move-stick', 1, 28)); await page.waitForTimeout(130); await tap('#reload-button');
    let state = await page.evaluate(() => ({ x: __evolutionQA.game.player.x, reload: __evolutionQA.game.player.reloadTimer, input: __evolutionQA.input }));
    assert.ok(state.x > initialX + 10 && state.reload > 0 && state.input.moveX > .5);
    await tap('[data-weapon="0"]'); assert.equal(await page.evaluate(() => __evolutionQA.game.player.weapon), 0);
    await tap('[data-weapon="1"]'); await down(await point('#aim-stick', 2, 28)); await tap('#dash-button');
    await page.waitForFunction(() => __evolutionQA.events.some(event => event.type === 'evolution-trigger' && event.stage === 'breach'), null, { timeout: 4000 });
    const final = await page.evaluate(() => ({ x: __evolutionQA.game.player.x, input: __evolutionQA.input, weapon: __evolutionQA.game.player.weapon, events: __evolutionQA.events.filter(e => ['dash', 'shot', 'reload', 'evolution-trigger'].includes(e.type)) }));
    assert.ok(final.input.moveX > .5 && final.input.shoot && final.x > state.x + 20);
    assert.equal(final.events.filter(e => e.type === 'dash').length, 1); assert.equal(final.events.filter(e => e.type === 'reload').length, 1);
    assert.equal(final.events.filter(e => e.type === 'evolution-trigger' && e.stage === 'breach').length, 1);
    await up(2); await up(1); await page.waitForTimeout(80); assert.equal(await page.evaluate(() => __evolutionQA.input.moveX), 0);
    return { state, final, evolution: evolution.id };
  });
}
async function publicCase(browser) {
  await test(browser, 'public-native-earned-evolution', {}, async page => {
    await start(page); const initial = await page.evaluate(() => { const g = __evolutionQA.game; return { hp: g.player.hp, maxHp: g.player.maxHp, level: g.player.level, damage: g.player.damageMultiplier, speed: g.player.speed }; });
    await page.evaluate(() => { __evolutionQA.auto = true; });
    const started = Date.now(), choices = [];
    while (Date.now() - started < 190000) {
      const state = await page.evaluate(() => ({ phase: __evolutionQA.game.phase, evolutionId: __evolutionQA.game.evolutionId, choices: __evolutionQA.game.upgradeChoices }));
      if (state.evolutionId) break;
      assert.notEqual(state.phase, 'lost', 'Natural bot lost before an evolution');
      if (state.phase === 'upgrade') {
        const order = ['arc', 'vampire', 'health', 'damage', 'shield', 'magnet'], chosen = state.choices.find(c => c.evolution) || state.choices.toSorted((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 999) - (order.includes(b.id) ? order.indexOf(b.id) : 999))[0];
        choices.push(chosen.id); await page.locator('[data-upgrade="' + chosen.id + '"]').click();
      }
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => { __evolutionQA.auto = false; });
    const result = await page.evaluate(() => { const q = __evolutionQA, g = q.game; return { evolutionId: g.evolutionId, elapsed: g.elapsed, level: g.player.level, hp: g.player.hp, samples: q.samples, events: q.events.filter(e => ['upgrade', 'weapon-evolved', 'level-up'].includes(e.type)) }; });
    assert.ok(result.evolutionId, 'Native public-action bot must acquire an evolution'); assert.ok(result.elapsed > 10); assert.ok(result.samples.length > 5);
    await page.keyboard.press('KeyP'); await shot(page, 'public-earned-summary'); return { initial, result, choices, wallSeconds: (Date.now() - started) / 1000 };
  });
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    if (publicOnly) await publicCase(browser);
    else {
      for (let weapon = 0; weapon < 5; weapon++) await acquireCase(browser, weapon);
      for (const [width, height, mobile, full] of [[1440, 1000, false, false], [360, 780, true, false], [390, 844, true, false], [844, 390, true, true], [667, 375, true, true]]) await guideCase(browser, { width, height }, mobile, full);
      await boundaries(browser);
      await multiTouch(browser, { width: 390, height: 844 }); await multiTouch(browser, { width: 844, height: 390 });
    }
  } finally { await browser.close(); save(); }
  console.log(JSON.stringify({ mode, cases: report.cases.length, failed: report.cases.filter(c => !c.pass).length, errors: report.errors.length, output }));
  if (report.errors.length || report.cases.some(c => !c.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); report.errors.push({ fatal: error.stack }); save(); process.exitCode = 1; });
