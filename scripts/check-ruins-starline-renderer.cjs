'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), release = process.argv.includes('--release'), mode = release ? 'release' : 'source';
const folder = release ? path.join(root, 'release/web') : root, origin = 'http://127.0.0.1:4194';
const output = path.join(root, 'reports', '4.0-ruins-renderer-' + mode); fs.mkdirSync(output, { recursive: true });
const report = { timestamp: new Date().toISOString(), mode, files: {}, cases: [], errors: [], note: 'Real Edge Canvas/native rAF with frozen ruins fixtures created using actual pickup/drop/pin/Boss attack methods. Checks finite geometry, unchanged game data, terrain cache reuse, target location and player/HUD/label occlusion on desktop and phone sizes. Not a gameplay completion test or physical-phone performance claim. External/account traffic blocked.' };

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }); report.browser = browser.version();
  try {
    for (const config of [{ width: 1280, height: 800 }, { width: 667, height: 375, mobile: true }, { width: 390, height: 844, mobile: true }, { width: 844, height: 390, mobile: true, safe: true }]) {
      const { width, height, mobile, safe } = config;
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: !!mobile, isMobile: !!mobile, deviceScaleFactor: 1 });
      try {
        await context.route('**/*', async route => {
          const url = new URL(route.request().url()); if (url.origin !== origin || url.pathname.includes('/vendor/')) return route.abort();
          const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', file = path.resolve(folder, name);
          if (!file.startsWith(folder + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
          const body = fs.readFileSync(file); report.files[name] = crypto.createHash('sha256').update(body).digest('hex');
          return route.fulfill({ body, contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
        });
        await context.addInitScript(() => {
          const a = window.__ruinsDrawing = { frames: 0, nonFinite: 0, negativeRadius: 0, freeze: false, terrainBakes: 0, order: [] };
          for (const name of ['arc', 'arcTo', 'ellipse', 'moveTo', 'lineTo', 'fillRect', 'strokeRect', 'roundRect', 'translate', 'scale', 'rotate', 'setTransform', 'drawImage', 'fillText', 'strokeText']) {
            const original = CanvasRenderingContext2D.prototype[name]; if (!original) continue;
            CanvasRenderingContext2D.prototype[name] = function (...args) {
              if (args.some(v => typeof v === 'number' && !Number.isFinite(v))) a.nonFinite++;
              if (name === 'arc' && args[2] < 0 || name === 'ellipse' && (args[2] < 0 || args[3] < 0)) a.negativeRadius++;
              return original.apply(this, args);
            };
          }
          let api, Renderer;
          Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
            api = value; api.Game = new Proxy(value.Game, { construct(target, args, next) {
              const game = Reflect.construct(target, args, next); a.game = game; const update = game.update;
              game.update = function (...args) { if (!a.freeze) return update.apply(this, args); }; return game;
            } });
          } });
          Object.defineProperty(window, 'ExpeditionRenderer', { configurable: true, get: () => Renderer, set(value) {
            Renderer = new Proxy(value, { construct(target, args, next) {
              const renderer = Reflect.construct(target, args, next); a.renderer = renderer;
              for (const method of ['drawStarlineFields', 'drawHazard', 'drawPlayer']) { const draw = renderer[method]; renderer[method] = function (...args) { a.order.push(method); return draw.apply(this, args); }; }
              const paint = renderer.paintTerrain; renderer.paintTerrain = function (...args) { a.terrainBakes++; return paint.apply(this, args); };
              const render = renderer.render; renderer.render = function (game, dt) { a.order = []; const result = render.call(this, game, a.freeze ? 0 : dt); a.frames++; return result; }; return renderer;
            } });
          } });
          localStorage.setItem('frontier-sound', 'off');
        });
        const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
        await page.goto(origin); await page.locator('[data-map="ruins"]').click();
        if (mobile) { await page.locator('#fullscreen-toggle').click(); await page.waitForFunction(() => !!document.fullscreenElement); }
        await page.locator('#start-run').click(); await page.waitForFunction(() => __ruinsDrawing.frames > 5);
        if (safe) await page.evaluate(() => { const stage = document.getElementById('game-stage'); stage.style.setProperty('--safe-left', '44px'); stage.style.setProperty('--safe-right', '44px'); stage.style.setProperty('--safe-bottom', '21px'); });
        if (await page.locator('#coach-dismiss').isVisible()) await page.locator('#coach-dismiss').click();
        await page.waitForFunction(() => document.querySelector('#event-banner').classList.contains('hidden') && !document.querySelector('#notification').classList.contains('visible'));
        for (const scene of ['source', 'carrying-pulse', 'dropped', 'wired', 'boss-lattice', 'boss-collapse', 'boss-fan', 'reduced-motion']) {
          const before = await page.evaluate(scene => {
            const a = __ruinsDrawing, g = a.game, r = a.renderer; a.freeze = true; g.reset('ruins', { seed: 420 }); g.start();
            g.enemies = []; g.bullets = []; g.events = []; g.hazards = []; g.stations = []; g.crates = []; g.contracts = []; g.encounters = [];
            const cargo = g.delivery.cargos[0];
            if (['source', 'carrying-pulse', 'dropped'].includes(scene)) { g.player.x = cargo.x - 55; g.player.y = cargo.y; }
            else { g.player.x = 1600; g.player.y = 1200; g.obstacles = []; }
            g.player.angle = 0;
            if (scene === 'carrying-pulse' || scene === 'dropped') {
              if (!g.interact()) throw new Error('Actual pickup rejected');
              if (scene === 'dropped') { if (!g.dash({ x: 1, y: 0 })) throw new Error('Actual dash rejected'); g.player.x += 60; }
              else { g.player.x = 1600; g.player.y = 1200; g.sectorThreat.timer = 0; g._updateSectorThreat(.01); g.player.x += 110; }
            }
            if (scene === 'wired' || scene === 'reduced-motion') {
              g.switchWeapon(5); if (scene === 'reduced-motion') g.evolutionId = 'star-bridge';
              g._placeStarPin({ starMultiplier: 1 }, 1450, 1310); g._placeStarPin({ starMultiplier: 1 }, 1810, 1270);
              g.bullets.push({ id: 99001, owner: 'player', kind: 'starline', x: 1680, y: 1200, vx: 880, vy: 0, radius: 3, lifetime: .5, age: .1 });
              g.hazards.push({ id: 99002, type: 'blast', x: 1710, y: 1250, radius: 95, duration: 1.4, remaining: .7, cargoPulse: true, color: '#ffd9a0' });
            }
            if (scene.startsWith('boss-')) {
              g.relays = []; for (const item of g.delivery.cargos) item.status = 'delivered';
              g._spawnBoss(); const boss = g.enemies.find(e => e.type === 'boss'); boss.x = 1730; boss.y = 1160; boss.attackTimer = 0;
              boss.attackCount = scene === 'boss-lattice' ? 0 : scene === 'boss-collapse' ? 1 : 2;
              const dx = g.player.x - boss.x, dy = g.player.y - boss.y, length = Math.hypot(dx, dy); g._updateBoss(boss, 0, dx / length, dy / length, length);
            }
            g.events = []; r.reducedMotion = scene === 'reduced-motion'; r.pointerHudTime = -1; g._objective();
            return { frame: a.frames, gameplay: JSON.stringify({ player: g.player, delivery: g.delivery, pins: g.starPins, lines: g.starLines, hazards: g.hazards, enemies: g.enemies, relays: g.relays }) };
          }, scene);
          await page.waitForFunction(frame => __ruinsDrawing.frames > frame + 8, before.frame);
          if (scene === 'wired') {
            await page.locator('[data-weapon="0"]').click(); await page.waitForFunction(() => __ruinsDrawing.game.player.weapon === 0);
            await page.locator('[data-weapon="5"]').click(); await page.waitForFunction(() => __ruinsDrawing.game.player.weapon === 5);
          }
          const settled = await page.evaluate(() => ({ frame: __ruinsDrawing.frames, bakes: __ruinsDrawing.terrainBakes }));
          await page.waitForFunction(frame => __ruinsDrawing.frames > frame + 3, settled.frame);
          const screenshot = path.join(output, `${width}x${height}${safe ? '-safe' : ''}-${scene}.png`); await page.screenshot({ path: screenshot });
          const actual = await page.evaluate(() => {
            const a = __ruinsDrawing, r = a.renderer, g = a.game, p = r.encounterPlayerPoint;
            const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const labels = r.encounterLabelRects || [], blocks = [...(r.pointerHud?.blocks || []), { left: p.x - 25, right: p.x + 29, top: p.y - 27, bottom: p.y + 27 }];
            const rect = selector => { const b = document.querySelector(selector).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
            const weaponHud = rect('.weapons-hud'), skillHud = rect('.skill-hud'), ammoHud = rect('.ammo-hud');
            const activeWeapon = document.querySelector('.weapon-slot.active'), activeRect = activeWeapon.getBoundingClientRect();
            const cx = (activeRect.left + activeRect.right) / 2, cy = (activeRect.top + activeRect.bottom) / 2;
            return { nonFinite: a.nonFinite, negativeRadius: a.negativeRadius, labels, labelTexts: r.stormHazardLabels.map(label => label.text),
              overlaps: labels.filter((label, i) => blocks.some(block => overlaps(label, block)) || labels.slice(i + 1).some(other => overlaps(label, other))).length,
              target: r.targetDelivery, expectedTarget: g.deliveryTarget(g.relays.find(relay => relay.id === r.trackedRelayId && relay.status !== 'active' && relay.status !== 'locked')), terrainBakes: a.terrainBakes, order: a.order, particles: r.particles.length, rings: r.rings.length,
              hud: { weaponHud, skillHud, ammoHud, overlaps: [overlaps(weaponHud, skillHud), overlaps(weaponHud, ammoHud), overlaps(skillHud, ammoHud)],
                activeClickable: document.elementFromPoint(cx, cy)?.closest('.weapon-slot') === activeWeapon, activeCenterInsideBar: cx >= weaponHud.left && cx <= weaponHud.right },
              invalidText: /\b(?:undefined|NaN)\b/.test(document.body.innerText),
              gameplay: JSON.stringify({ player: g.player, delivery: g.delivery, pins: g.starPins, lines: g.starLines, hazards: g.hazards, enemies: g.enemies, relays: g.relays }) };
          });
          assert.equal(actual.nonFinite, 0); assert.equal(actual.negativeRadius, 0); assert.equal(actual.gameplay, before.gameplay);
          assert.equal(actual.invalidText, false); assert.equal(actual.overlaps, 0); assert.equal(actual.terrainBakes, settled.bakes); assert.deepEqual(actual.target, actual.expectedTarget);
          assert.ok(actual.hud.overlaps.every(overlap => !overlap)); assert.ok(actual.hud.activeClickable && actual.hud.activeCenterInsideBar);
          assert.ok(actual.particles <= 420 && actual.rings <= 20);
          if (actual.order.includes('drawHazard')) assert.ok(actual.order.indexOf('drawStarlineFields') < actual.order.indexOf('drawHazard'));
          delete actual.gameplay; report.cases.push({ size: config, scene, screenshot, ...actual, passed: true });
        }
      } finally { await context.close(); }
    }
    assert.deepEqual(report.errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.cases.length, errors: report.errors, report: path.join(output, 'results.json') }));
}
main().catch(error => { report.failure = error.stack; fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; });
