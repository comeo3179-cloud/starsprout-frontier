'use strict';

// Native-rAF attempt. Keep natural defeat; never edit entities or clock.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || (() => { try { return require.resolve('playwright'); } catch { return require.resolve('../build-tools/browser/node_modules/playwright'); } })();
const { chromium } = require(playwrightPath), { CampaignExplorer } = require('./check-campaign-runs.cjs'), { SalvageExplorer } = require('./check-salvage-runs.cjs');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2), option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const online = args.includes('--online'), release = online || args.includes('--release'), mode = online ? 'online' : release ? 'release' : 'source';
const origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4200', folder = release ? path.join(root, 'release/web') : root;
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, manifest = release ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const settings = { seed: Number(option('seed', 2)), difficulty: option('difficulty', 'normal'), policy: option('policy', 'deep'), quiet: args.includes('--quiet'), aimError: .1 };
const outputFolder = path.resolve(option('output', path.join(root, 'reports/expansion-6-7', `salvage-native-${mode}-${settings.policy}-${settings.seed}-${version}`))); fs.mkdirSync(outputFolder, { recursive: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex'), output = path.join(outputFolder, 'results.json');
const report = { generatedAt: new Date().toISOString(), version, mode, settings, files: {}, browserFiles: {}, httpFiles: {}, errors: [], screenshots: [],
  method: 'Actual browser renders unchanged game/audio/UI at native rAF. Original stats; public visible-state bot actions with 250ms decisions and +/-0.1 rad aim error, real intro/upgrade menu clicks. No position/HP/damage/spawn/source/timer edits or forced endings. Old discovery achievements marked known only to suppress ceremonies; no account/backend writes. Retains natural failures. Online no route/fulfill and verifies five HTTP files plus actual JS/CSS/SDK. Desktop browser observation, not physical-phone or human balance certification.' };
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'), bytes = new Map();
if (!online) for (const file of release ? manifest.files.map(item => item.file) : ['index.html', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js', 'expedition.css', 'profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'vendor/cloudbase.full.js']) {
  const body = fs.readFileSync(path.join(folder, file)); bytes.set(file, body); report.files[file] = hash(body);
}
function observe(Bot, settings) {
  const q = window.__salvageRun = { auto: false, bot: new Bot(settings), events: [], held: null, nextDecision: 0, spawns: {}, peaks: { enemies: 0, bullets: 0, hazards: 0, mines: 0 }, frameMs: [] }; let api;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
    api = value; value.Game = new Proxy(value.Game, { construct(target, args, next) {
      const game = Reflect.construct(target, args, next); q.game = game;
      const update = game.update, drain = game.drainEvents, spawn = game.spawnEnemy;
      game.update = function(dt, input) {
        if (q.auto && this.mode === 'salvage' && this.phase === 'playing') {
          if (!q.held || this.elapsed >= q.nextDecision) { q.held = settings.policy === 'idle' ? {} : q.bot.input(this); q.nextDecision = this.elapsed + .25; }
          input = q.held;
        }
        return update.call(this, dt, input);
      };
      game.drainEvents = function() { const events = drain.call(this); q.events.push(...events.map(event => ({ ...event, at: this.elapsed }))); return events; };
      game.spawnEnemy = function(...args) { const enemy = spawn.apply(this, args); if (enemy) q.spawns[enemy.type] = (q.spawns[enemy.type] || 0) + 1; return enemy; }; return game;
    } });
  } });
  localStorage.setItem('frontier-sound', 'off'); localStorage.setItem('frontier-secrets-v1', JSON.stringify(['rebound', 'blade-relay', 'bullet-reversal', 'fuse-resonance', 'rail-resonance', 'ice-break']));
  let previous = null;
  function frame(timestamp) {
    const g = q.game, active = g?.mode === 'salvage' && g.phase === 'playing' && document.getElementById('screen-overlay')?.classList.contains('hidden');
    if (active && previous !== null) q.frameMs.push(timestamp - previous); previous = active ? timestamp : null;
    if (active) for (const [name, count] of [['enemies', g.enemies.length], ['bullets', g.bullets.length], ['hazards', g.hazards.length], ['mines', g.battlefield?.mines.length || 0]]) q.peaks[name] = Math.max(q.peaks[name], count);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
async function snapshot(page) { return page.evaluate(() => { const g = __salvageRun.game; return { phase: g.phase, elapsed: g.elapsed, hp: g.player.hp, maxHp: g.player.maxHp, level: g.player.level, kills: g.kills, score: g.score, salvage: structuredClone(g.salvage), lastDamage: g.lastDamage }; }); }
(async () => {
  const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), browser = await chromium.launch({ channel, headless: true }), context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const startWall = Date.now(); let page;
  const shot = async name => { await page.screenshot({ path: path.join(outputFolder, name + '.png') }); report.screenshots.push(name + '.png'); };
  try {
    if (!online) await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort(); const file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      if (!bytes.has(file)) return route.fulfill({ status: file === 'favicon.ico' ? 204 : 404, body: '' }); return route.fulfill({ body: bytes.get(file), contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
    });
    if (online) for (const item of manifest.files) { const response = await context.request.get(origin + '/' + item.file + '?salvage-native-verify=' + Date.now(), { headers: { 'cache-control': 'no-cache' }, timeout: 30000 }); assert.equal(response.status(), 200); report.httpFiles[item.file] = hash(await response.body()); assert.equal(report.httpFiles[item.file], item.sha256); }
    const simulator = fs.readFileSync(path.join(root, 'scripts/simulate-expedition.js'), 'utf8'), botCode = simulator.slice(simulator.indexOf('function seededRandom('), simulator.indexOf('\nfunction simulate('));
    await context.addInitScript({ content: '(() => { const options={mode:"explore",build:"reactor"}; const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y); ' + botCode + '\n' + CampaignExplorer.toString() + '\n' + SalvageExplorer.toString() + '\n(' + observe.toString() + ')(SalvageExplorer,' + JSON.stringify(settings) + '); })();' });
    page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000); page.on('pageerror', error => report.errors.push(error.message)); const responses = [];
    if (online) page.on('response', response => { const url = new URL(response.url()), file = decodeURIComponent(url.pathname).replace(/^\//, ''); if (url.origin === origin && manifest.files.some(item => item.file === file && /\.(js|css)$/.test(file))) responses.push(response.body().then(body => { report.browserFiles[file] = hash(body); }).catch(error => report.errors.push(error.message))); });
    await page.goto(origin + '/?v=' + version, { waitUntil: 'domcontentloaded' }); if (online && await page.locator('#submitBtn').count()) { assert.match(await page.locator('body').innerText(), /测试域名/); await page.locator('#submitBtn').click(); }
    await page.locator('#salvage-entry').click(); await page.locator('[data-salvage-difficulty="' + settings.difficulty + '"]').click(); await page.locator('#salvage-seed').fill(String(settings.seed)); await page.locator('#start-salvage').click();
    await page.waitForFunction(() => __salvageRun.game.mode === 'salvage' && __salvageRun.game.phase === 'playing');
    report.initial = await page.evaluate(() => { const p = __salvageRun.game.player; return { hp: p.hp, maxHp: p.maxHp, speed: p.speed, damage: p.damageMultiplier }; }); assert.deepEqual(report.initial, { hp: 120, maxHp: 120, speed: 218, damage: 1 });
    await page.evaluate(() => { __salvageRun.auto = true; }); let nextProgress = 0, lastStatus = '';
    while (Date.now() - startWall < 480000) {
      const current = await snapshot(page);
      if (current.salvage.status !== lastStatus) { lastStatus = current.salvage.status; await shot('status-' + lastStatus); }
      if (Date.now() > nextProgress) { console.log(JSON.stringify({ phase: current.phase, status: current.salvage.status, carried: current.salvage.carried, seconds: +current.elapsed.toFixed(2), hp: +current.hp.toFixed(2) })); nextProgress = Date.now() + 25000; save(); }
      if (['won', 'lost'].includes(current.phase)) { report.ending = current; await page.locator('[data-salvage-result]').waitFor(); assert.equal(await page.locator('[data-salvage-result]').getAttribute('data-salvage-result'), current.salvage.status); await shot('natural-' + current.salvage.status); break; }
      if (current.phase === 'upgrade') {
        const id = await page.evaluate(() => { const g = __salvageRun.game, order = g.player.hp < g.player.maxHp * .6 ? ['health', 'shield', 'vampire', 'damage', 'rapid', 'magnet', 'pulse', 'reload', 'crit', 'capacity', 'speed', 'dash'] : ['vampire', 'damage', 'rapid', 'health', 'shield', 'magnet', 'pulse', 'reload', 'crit', 'capacity', 'speed', 'dash'];
          return (g.upgradeChoices.find(choice => choice.evolution) || g.upgradeChoices.toSorted((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 50) - (order.includes(b.id) ? order.indexOf(b.id) : 50))[0]).id; }); await page.locator('[data-upgrade="' + id + '"]:visible').click();
      }
      await page.waitForTimeout(150);
    }
    if (!report.ending) { report.ending = await snapshot(page); report.timeout = true; }
    const observed = await page.evaluate(() => ({ events: __salvageRun.events, peaks: __salvageRun.peaks, spawns: __salvageRun.spawns, frames: __salvageRun.frameMs }));
    report.events = {}; for (const event of observed.events) report.events[event.type] = (report.events[event.type] || 0) + 1;
    report.significantEvents = observed.events.filter(event => event.type.startsWith('salvage-') || ['win', 'lose', 'field-burst', 'field-capture'].includes(event.type)); report.peaks = observed.peaks; report.spawns = observed.spawns;
    const sorted = observed.frames.toSorted((a, b) => a - b), percentile = fraction => +sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(3);
    if (sorted.length) report.frameTiming = { samples: sorted.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: +sorted.at(-1).toFixed(3), over50Ms: sorted.filter(value => value > 50).length,
      method: 'Unclipped native rAF intervals during actual playing with hidden overlay; paused decision screens excluded. Automation/screenshots and parallel workloads retained; unpaired desktop observation, not a phone FPS estimate.' };
    if (online) { await Promise.all(responses); for (const item of manifest.files.filter(item => /\.(js|css)$/.test(item.file))) assert.equal(report.browserFiles[item.file], item.sha256); }
    assert.deepEqual(report.errors, []); assert.ok(['extracted', 'withdrawn', 'failed'].includes(report.ending.salvage.status));
    if (report.ending.salvage.status === 'extracted') { assert.ok(report.ending.salvage.settled > 0); assert.equal(report.events.win, 1); assert.equal(report.ending.salvage.bonus, report.ending.salvage.settled * 80); }
    else if (report.ending.salvage.status === 'withdrawn') { assert.equal(report.ending.salvage.bonus, 0); assert.ok(!report.events.win); }
  } catch (error) { report.failure = error.stack; if (page) { report.ending = await snapshot(page).catch(() => null); await shot('failure').catch(() => {}); } process.exitCode = 1; }
  finally { report.wallSeconds = (Date.now() - startWall) / 1000; report.completedAt = new Date().toISOString(); save(); await context.close(); await browser.close(); }
  console.log(JSON.stringify({ mode, outcome: report.ending?.salvage?.status, samples: report.ending?.salvage?.settled, gameSeconds: report.ending?.elapsed, wallSeconds: report.wallSeconds, failure: report.failure, errors: report.errors, output }));
})();
