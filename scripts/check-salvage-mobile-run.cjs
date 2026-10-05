'use strict';

// This observer never replaces Game.update, dispatches DOM events or calls a
// game action. Every playing input is an actual CDP finger on the real UI.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || (() => { try { return require.resolve('playwright'); } catch { return require.resolve('../build-tools/browser/node_modules/playwright'); } })();
const { chromium } = require(playwrightPath), root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
const option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const online = args.includes('--online'), release = online || args.includes('--release'), mode = online ? 'online' : release ? 'release' : 'source';
const difficulty = option('difficulty', 'normal');
const settings = { seed: Number(option('seed', 2)), difficulty, policy: option('policy', 'deep'), viewport: difficulty === 'normal' ? { width: 390, height: 844 } : { width: 844, height: 390 }, fullscreen: true, deviceScaleFactor: 2 };
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, folder = release ? path.join(root, 'release/web') : root;
const manifest = release ? JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8')) : null;
const origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4203';
const outputFolder = path.resolve(option('output', path.join(root, 'reports/expansion-6-7', `salvage-mobile-${mode}-${settings.difficulty}-${settings.seed}-${version}`))), hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(outputFolder, { recursive: true });
const report = { generatedAt: new Date().toISOString(), scriptSha256: hash(fs.readFileSync(__filename)), version, mode, settings, files: {}, browserFiles: {}, httpFiles: {}, errors: [], actions: [], milestones: [], screenshots: [],
  method: 'Fresh guest mobile Edge emulation, native rAF and actual CDP contacts only during play: both sticks remain held, third finger uses real enabled weapon/reload/skill/dash/interact controls. Game is observed at construction, with no update replacement or Game method calls. No stats, positions, enemies, tickets, timers, cover, source state or achievements edited; no pre-unlocked secrets. Intro seed uses native touch focus and typed text. Upgrades release old contacts before native selection, revelations try the third finger while old contacts remain down. Visible public-state policy, not human win-rate or physical-phone performance. Natural failure retained. Online no route/fulfill; five HTTP files and actual JS/CSS/SDK hashes.' };
const output = path.join(outputFolder, 'results.json'), save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'), bytes = new Map();
if (!online) for (const file of release ? manifest.files.map(item => item.file) : ['index.html', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js', 'expedition.css', 'profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'vendor/cloudbase.full.js']) { const body = fs.readFileSync(path.join(folder, file)); bytes.set(file, body); report.files[file] = hash(body); }
function observe() {
  const q = window.__salvageMobile = { pointers: [], frames: [] }; let api;
  Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) { api = value; value.Game = new Proxy(value.Game, { construct(target, args, next) { const game = Reflect.construct(target, args, next); q.game = game; return game; } }); } });
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) document.addEventListener(type, event => {
    const target = event.target.closest('button,#move-stick,#aim-stick');
    if (target) q.pointers.push({ type, target: target.id || (target.dataset.weapon != null ? 'weapon-' + target.dataset.weapon : 'upgrade-' + target.dataset.upgrade), pointerType: event.pointerType, isPrimary: event.isPrimary });
  }, { capture: true });
  localStorage.setItem('frontier-sound', 'off'); let previous = null;
  function frame(timestamp) { const g = q.game, active = g?.mode === 'salvage' && g.phase === 'playing' && document.getElementById('screen-overlay')?.classList.contains('hidden') && document.getElementById('revelation-overlay')?.classList.contains('hidden');
    if (active && previous !== null) q.frames.push(timestamp - previous); previous = active ? timestamp : null; requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
}
async function snapshot(page) { return page.evaluate(() => { const g = __salvageMobile.game; return structuredClone({ mode: g.mode, phase: g.phase, elapsed: g.elapsed, player: g.player, world: g.world,
  obstacles: g.obstacles, enemies: g.enemies, hazards: g.hazards, bullets: g.bullets, battlefield: g.battlefield, reactor: g.reactor, salvage: g.salvage,
  score: g.score, kills: g.kills, upgradeChoices: g.upgradeChoices, lastDamage: g.lastDamage }); }); }
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function decision(g) {
  const p = g.player, s = g.salvage, enemies = g.enemies.filter(enemy => enemy.hp > 0).sort((a, b) => distance(a, p) - distance(b, p)), enemy = enemies[0];
  const target = s.evac ? s.exits.find(exit => exit.id === s.evac.exitId) : settings.policy === 'empty' || settings.policy === 'early' && s.carried >= 3 ?
    [...s.exits].sort((a, b) => distance(a, p) - distance(b, p))[0] : [...s.sources.filter(source => source.status !== 'collected')].sort((a, b) => distance(a, p) - distance(b, p))[0] || [...s.exits].sort((a, b) => distance(a, p) - distance(b, p))[0];
  let destination = target;
  if (target && (s.evac || target.status === 'drilling') && distance(target, p) < 95) destination = { x: target.x + Math.cos(g.elapsed * 1.2) * 48, y: target.y + Math.sin(g.elapsed * 1.2) * 48 };
  const warnings = [...g.hazards.filter(hazard => hazard.type === 'blast' && hazard.remaining > 0 && !hazard.resolved),
    ...[...(g.battlefield?.props || []), ...(g.battlefield?.mines || [])].filter(field => field.status === 'armed').map(field => ({ ...field, radius: field.blastRadius }))];
  const warning = warnings.find(hazard => distance(hazard, p) < hazard.radius + p.radius + 18);
  if (warning) { const angle = Math.atan2(p.y - warning.y, p.x - warning.x); destination = { x: warning.x + Math.cos(angle) * (warning.radius + 85), y: warning.y + Math.sin(angle) * (warning.radius + 85) }; }
  let dx = destination.x - p.x, dy = destination.y - p.y, length = Math.hypot(dx, dy); if (length) { dx /= length; dy /= length; }
  for (const other of enemies) { const gap = distance(p, other); if (gap < other.radius + 85) { dx += (p.x - other.x) / Math.max(1, gap) * 1.25; dy += (p.y - other.y) / Math.max(1, gap) * 1.25; } }
  const desired = Math.atan2(dy, dx); let movement = { x: 0, y: 0, score: -Infinity };
  if (Math.hypot(dx, dy) > .1) for (let index = 0; index < 24; index++) {
    const angle = desired + index * Math.PI * 2 / 24, x = Math.cos(angle), y = Math.sin(angle), end = { x: p.x + x * 75, y: p.y + y * 75 }; let score = Math.cos(angle - desired);
    if (end.x < 42 || end.y < 42 || end.x > g.world.width - 42 || end.y > g.world.height - 42) score -= 8;
    for (const rock of g.obstacles) { const t = Math.max(0, Math.min(75, (rock.x - p.x) * x + (rock.y - p.y) * y)); if (Math.hypot(p.x + x * t - rock.x, p.y + y * t - rock.y) < rock.radius + p.radius + 9) score -= 6; }
    if (score > movement.score) movement = { x, y, score };
  }
  const breakSource = target.hp > 0 && ['locked', 'flying'].includes(target.status) && distance(target, p) < 520 && (!enemy || distance(enemy, p) > 175);
  const aim = breakSource ? target : enemy, gap = enemy ? distance(enemy, p) : Infinity;
  const angle = aim ? Math.atan2(aim.y - p.y, aim.x - p.x) + Math.sin(g.elapsed * 2.13 + settings.seed) * .1 : 0;
  const shoot = !!aim && distance(aim, p) < 760;
  let action = null;
  if (p.reloadTimer > 0 && !p.reloadAttempted && p.reloadProgress >= .6 && p.reloadProgress <= .7) action = '#reload-button';
  else if (distance(target, p) < 78 && (target.type === 'salvage-exit' && !s.evac || ['open', 'idle'].includes(target.status))) action = '#touch-interact';
  else if (!enemy && p.reloadTimer <= 0 && p.ammo < p.magSize * .7) action = '#reload-button';
  else if (g.reactor.charge >= g.reactor.maxCharge && g.reactor.timer <= 0) action = '#touch-overdrive';
  else {
    const weapon = breakSource ? 0 : enemy ? gap < 160 ? 1 : ['tank', 'bulwark'].includes(enemy.type) ? 2 : 0 : p.weapon;
    if (weapon !== p.weapon) action = '[data-weapon="' + weapon + '"]';
    else if (p.skillCooldown <= 0 && (enemies.filter(item => distance(item, p) < p.skillRadius).length >= 3 || gap < 62)) action = '#skill-button';
    else if (p.dashCooldown <= 0 && p.dashTimer <= 0 && (gap < 90 || warning && distance(warning, p) < warning.radius * .65)) action = '#dash-button';
  }
  return { movement, aim: shoot ? { x: Math.cos(angle), y: Math.sin(angle) } : { x: 0, y: 0 }, action, targetId: target.id };
}
(async () => {
  const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext({ viewport: settings.viewport, hasTouch: true, isMobile: true, deviceScaleFactor: settings.deviceScaleFactor, serviceWorkers: 'block' }); let page;
  const wallStart = Date.now(), contacts = new Map(); let nextId = 3;
  try {
    if (!online) await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort(); const file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      if (!bytes.has(file)) return route.fulfill({ status: file === 'favicon.ico' ? 204 : 404, body: '' }); return route.fulfill({ body: bytes.get(file), contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' }); });
    if (online) for (const item of manifest.files) { const response = await context.request.get(origin + '/' + item.file + '?salvage-mobile-verify=' + Date.now(), { headers: { 'cache-control': 'no-cache' }, timeout: 30000 }); assert.equal(response.status(), 200); report.httpFiles[item.file] = hash(await response.body()); assert.equal(report.httpFiles[item.file], item.sha256); }
    await context.addInitScript(observe); page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000); page.on('pageerror', error => report.errors.push(error.message)); const responses = [];
    if (online) page.on('response', response => { const url = new URL(response.url()), file = decodeURIComponent(url.pathname).replace(/^\//, ''); if (url.origin === origin && manifest.files.some(item => item.file === file && /\.(js|css)$/.test(file))) responses.push(response.body().then(body => { report.browserFiles[file] = hash(body); }).catch(error => report.errors.push(error.message))); });
    await page.goto(origin + '/?v=' + version, { waitUntil: 'domcontentloaded' }); const cdp = await context.newCDPSession(page);
    const point = async selector => page.locator(selector).evaluate(element => { const rect = element.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2, hit = document.elementFromPoint(x, y);
      if (element.disabled || x < 0 || x >= innerWidth || y < 0 || y >= innerHeight || !(hit === element || element.contains(hit))) return null; return { x, y, radiusX: 5, radiusY: 5, force: 1 }; });
    const start = async touch => { contacts.set(touch.id, touch); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); };
    const end = async id => { const touch = contacts.get(id); if (!touch) return; contacts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [touch] }); };
    const releaseSticks = async () => { await end(1); await end(2); };
    const tap = async (selector, required = true) => { const touch = await point(selector); if (!touch) { if (required) throw new Error('Native control not reachable: ' + selector); return false; }
      const held = contacts.size; await start({ id: nextId++, ...touch }); const id = nextId - 1; await page.waitForTimeout(30); await end(id); report.actions.push({ selector, held, wallSeconds: (Date.now() - wallStart) / 1000 }); return true; };
    if (online && await page.locator('#submitBtn').count()) { assert.match(await page.locator('body').innerText(), /测试域名/); await tap('#submitBtn'); }
    await page.locator('#salvage-entry').waitFor(); await tap('#fullscreen-toggle'); await page.waitForFunction(() => !!document.fullscreenElement || document.getElementById('game-stage').classList.contains('immersive'));
    await tap('#salvage-entry'); await tap('[data-salvage-difficulty="' + settings.difficulty + '"]'); await tap('#salvage-seed'); await page.keyboard.type(String(settings.seed)); await tap('#start-salvage');
    await page.waitForFunction(() => __salvageMobile.game.mode === 'salvage' && __salvageMobile.game.phase === 'playing');
    const initial = await snapshot(page); report.initial = { hp: initial.player.hp, maxHp: initial.player.maxHp, speed: initial.player.speed, damage: initial.player.damageMultiplier };
    report.canvas = await page.locator('canvas').first().evaluate(canvas => ({ devicePixelRatio, backingWidth: canvas.width, backingHeight: canvas.height, cssWidth: canvas.getBoundingClientRect().width, cssHeight: canvas.getBoundingClientRect().height }));
    assert.deepEqual(report.initial, { hp: 120, maxHp: 120, speed: 218, damage: 1 }); let lastSamples = -1, lastStatus = '', nextProgress = 0, nextAction = 0;
    while (Date.now() - wallStart < 300000) {
      const g = await snapshot(page); assert.equal(g.mode, 'salvage');
      if (g.salvage.carried !== lastSamples || g.salvage.status !== lastStatus) { lastSamples = g.salvage.carried; lastStatus = g.salvage.status; report.milestones.push({ elapsed: g.elapsed, carried: lastSamples, status: lastStatus, hp: g.player.hp, alarm: g.salvage.alarm }); save(); }
      if (Date.now() > nextProgress) { console.log(JSON.stringify({ difficulty: settings.difficulty, phase: g.phase, status: g.salvage.status, carried: g.salvage.carried, seconds: +g.elapsed.toFixed(2), hp: +g.player.hp.toFixed(2) })); nextProgress = Date.now() + 25000; }
      if (['won', 'lost'].includes(g.phase)) { report.ending = g; await page.locator('[data-salvage-result]').waitFor(); assert.equal(await page.locator('[data-salvage-result]').getAttribute('data-salvage-result'), g.salvage.status); break; }
      if (await page.locator('#revelation-continue:visible').count()) {
        await page.waitForFunction(() => !document.getElementById('revelation-continue').disabled); await tap('#revelation-continue');
        await page.waitForFunction(() => document.getElementById('revelation-overlay').classList.contains('hidden')); await releaseSticks(); continue;
      }
      if (g.phase === 'upgrade') {
        await releaseSticks(); const order = ['vampire', 'damage', 'rapid', 'health', 'shield', 'magnet', 'pulse', 'reload', 'crit', 'capacity', 'speed', 'dash'];
        const choice = [...g.upgradeChoices].sort((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 50) - (order.includes(b.id) ? order.indexOf(b.id) : 50))[0];
        const button = '[data-upgrade="' + choice.id + '"]:visible';
        // Menus may scroll; use a real finger swipe, never scrollIntoView or
        // DOM scroll writes. Re-check native hit coordinates after each swipe.
        for (let attempt = 0; !await point(button) && attempt < 8; attempt++) {
          const rect = await page.locator('#screen-content').boundingBox(), id = nextId++, x = Math.min(400, rect.x + rect.width / 2), fromY = Math.min(settings.viewport.height - 45, rect.y + rect.height - 30), toY = Math.max(65, fromY - 140);
          await start({ id, x, y: fromY, radiusX: 5, radiusY: 5, force: 1 }); contacts.set(id, { ...contacts.get(id), y: toY }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...contacts.values()] }); await page.waitForTimeout(70); await end(id); await page.waitForTimeout(150);
        }
        await tap(button); await page.waitForFunction(() => __salvageMobile.game.phase === 'playing'); continue;
      }
      assert.equal(g.phase, 'playing');
      const d = decision(g), moveCenter = await point('#move-stick'), aimCenter = await point('#aim-stick');
      if (!moveCenter || !aimCenter) {
        // Native rAF can end the run or open a choice after the snapshot and
        // before these DOM reads. Re-read; never assert hidden end-state sticks.
        const latest = await snapshot(page);
        if (['won', 'lost'].includes(latest.phase)) { report.ending = latest; await page.locator('[data-salvage-result]').waitFor(); assert.equal(await page.locator('[data-salvage-result]').getAttribute('data-salvage-result'), latest.salvage.status); break; }
        if (latest.phase !== 'playing' || await page.locator('#revelation-continue:visible').count()) continue;
        throw new Error('Both native sticks must be reachable during actual playing');
      }
      for (const [id, center, vector] of [[1, moveCenter, d.movement], [2, aimCenter, d.aim]]) {
        const touch = { id, ...center, x: center.x + vector.x * 32, y: center.y + vector.y * 32 };
        if (!contacts.has(id)) await start(touch); else contacts.set(id, touch);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...contacts.values()] });
      if (d.action && Date.now() >= nextAction && await tap(d.action, false)) nextAction = Date.now() + 250;
      await page.waitForTimeout(130);
    }
    if (!report.ending) { report.ending = await snapshot(page); report.timeout = true; }
    await releaseSticks(); await page.screenshot({ path: path.join(outputFolder, 'natural-' + report.ending.salvage.status + '.png') }); report.screenshots.push('natural-' + report.ending.salvage.status + '.png');
    const observed = await page.evaluate(() => ({ pointers: __salvageMobile.pointers, frames: __salvageMobile.frames })); report.pointers = observed.pointers;
    const sorted = observed.frames.sort((a, b) => a - b); if (sorted.length) report.frameTiming = { samples: sorted.length, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], p99Ms: sorted[Math.ceil(sorted.length * .99) - 1], maxMs: sorted.at(-1), over50Ms: sorted.filter(ms => ms > 50).length, method: 'Unclipped native playing rAF in mobile browser emulation, automation included; not physical-phone FPS.' };
    if (online) { await Promise.all(responses); for (const item of manifest.files.filter(item => /\.(js|css)$/.test(item.file))) assert.equal(report.browserFiles[item.file], item.sha256); }
    assert.deepEqual(report.errors, []); assert.ok(['extracted', 'withdrawn', 'failed'].includes(report.ending.salvage.status), 'The actual touch run reaches a natural terminal state');
    if (report.ending.salvage.status === 'extracted') assert.equal(report.ending.salvage.bonus, report.ending.salvage.settled * 80 + report.ending.salvage.cargoBonus);
  } catch (error) { report.failure = error.stack; if (page) { report.ending = await snapshot(page).catch(() => null); report.pointers = await page.evaluate(() => __salvageMobile.pointers).catch(() => []); await page.screenshot({ path: path.join(outputFolder, 'failure.png') }).catch(() => {}); } process.exitCode = 1; }
  finally { report.wallSeconds = (Date.now() - wallStart) / 1000; report.completedAt = new Date().toISOString(); save(); await context.close(); await browser.close(); }
  console.log(JSON.stringify({ mode, difficulty: settings.difficulty, outcome: report.ending?.salvage?.status, samples: report.ending?.salvage?.settled, gameSeconds: report.ending?.elapsed, wallSeconds: report.wallSeconds, errors: report.errors, failure: report.failure, output }));
})();
