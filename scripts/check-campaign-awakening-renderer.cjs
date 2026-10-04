'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), release = process.argv.includes('--release'), mode = release ? 'release' : 'source';
const folder = release ? path.join(root, 'release/web') : root, origin = 'http://127.0.0.1:4192';
const output = path.join(root, 'reports', '3.1-awakening-renderer-' + mode); fs.mkdirSync(output, { recursive: true });
const report = { timestamp: new Date().toISOString(), mode, files: {}, cases: [], errors: [], note: 'Real Edge Canvas/native rAF, frozen 3.1 awakening fixtures. Geometry, HUD/player label occlusion, actual remote EMP preview location and unchanged gameplay data. Not gameplay completion/balance or physical-phone speed. All account/external traffic blocked. Separate 3.1 artifacts preserve 3.0 evidence.' };

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
          const audit = window.__awakeningDrawing = { frames: 0, nonFinite: 0, negativeRadius: 0, freeze: false, chargeCircles: [] };
          for (const name of ['arc', 'arcTo', 'ellipse', 'moveTo', 'lineTo', 'fillRect', 'strokeRect', 'roundRect', 'translate', 'scale', 'rotate', 'setTransform', 'drawImage', 'fillText', 'strokeText']) {
            const original = CanvasRenderingContext2D.prototype[name]; if (!original) continue;
            CanvasRenderingContext2D.prototype[name] = function (...args) {
              if (args.some(v => typeof v === 'number' && !Number.isFinite(v))) audit.nonFinite++;
              if (name === 'arc' && args[2] < 0 || name === 'ellipse' && (args[2] < 0 || args[3] < 0)) audit.negativeRadius++;
              if (name === 'arc' && audit.inAwakening && args[2] >= 200) audit.chargeCircles.push(args.slice(0, 3));
              return original.apply(this, args);
            };
          }
          let api, Renderer;
          Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
            api = value; api.Game = new Proxy(value.Game, { construct(target, args, next) {
              const game = Reflect.construct(target, args, next); audit.game = game; const update = game.update;
              game.update = function (...args) { if (!audit.freeze) return update.apply(this, args); }; return game;
            } });
          } });
          Object.defineProperty(window, 'ExpeditionRenderer', { configurable: true, get: () => Renderer, set(value) {
            Renderer = new Proxy(value, { construct(target, args, next) {
              const renderer = Reflect.construct(target, args, next); audit.renderer = renderer; const render = renderer.render, drawAwakening = renderer.drawAwakeningFields;
              renderer.drawAwakeningFields = function (...args) { audit.chargeCircles = []; audit.inAwakening = true; try { return drawAwakening.apply(this, args); } finally { audit.inAwakening = false; } };
              renderer.render = function (game, dt) { const result = render.call(this, game, audit.freeze ? 0 : dt); audit.frames++; return result; }; return renderer;
            } });
          } });
          localStorage.setItem('frontier-sound', 'off');
        });
        const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
        await page.goto(origin); await page.locator('#campaign-entry').click();
        if (safe) await page.evaluate(() => {
          const stage = document.getElementById('game-stage'); stage.style.setProperty('--safe-left', '44px'); stage.style.setProperty('--safe-right', '44px'); stage.style.setProperty('--safe-bottom', '21px');
        });
        if (mobile) { await page.locator('#fullscreen-toggle').click(); await page.waitForFunction(() => !!document.fullscreenElement); }
        await page.locator('#start-campaign').click(); await page.waitForFunction(() => __awakeningDrawing.frames > 5);
        if (await page.locator('#coach-dismiss').isVisible()) await page.locator('#coach-dismiss').click();
        await page.waitForFunction(() => document.querySelector('#event-banner').classList.contains('hidden') && !document.querySelector('#notification').classList.contains('visible'));
        for (const scene of ['return-dash', 'slide-reload', 'mag-relay', 'interrupt-round', 'mobile-field', 'charged-pulse', 'remote-charge', 'reduced-motion']) {
          const before = await page.evaluate(scene => {
            const a = __awakeningDrawing, g = a.game, r = a.renderer; a.freeze = true;
            const id = scene === 'remote-charge' ? 'charged-pulse' : scene === 'reduced-motion' ? 'mobile-field' : scene;
            const definition = Expedition.CAMPAIGN_AWAKENINGS.find(item => item.id === id);
            g.reset('storm', { mode: 'campaign', doctrineId: definition.doctrineId, seed: 719 }); g.start();
            g.campaign.awakeningId = id; g.campaign.stage = 2; g.campaign.visited = ['frontier', 'storm'];
            g.player.x = 1600; g.player.y = 1200; g.player.angle = 0;
            g.enemies = []; g.bullets = []; g.events = []; g.relays = []; g.stations = []; g.crates = []; g.contracts = []; g.encounters = []; g.obstacles = [];
            g.hazards = [{ id: 99001, type: 'blast', x: 1660, y: 1250, radius: 75, duration: 1.4, remaining: .55, owner: 'enemy', color: '#ffc58c' }];
            const state = g.awakeningState;
            if (id === 'return-dash') { state.returnAnchor = { x: 1420, y: 1180, remaining: 1 }; g.obstacles.push({ x: 1510, y: 1190, radius: 28 }); }
            if (id === 'slide-reload') { g.reload(); g.player.reloadProgress = .65; g.player.reloadTimer = .45; }
            if (id === 'mag-relay') state.relayTimer = 2;
            if (id === 'interrupt-round') { const e = g.spawnEnemy('charger', { x: 1720, y: 1160 }); e.stunTimer = .8; }
            if (id === 'mobile-field') state.field = { remaining: 1.6, duration: 2.4, radius: 100, tick: .1, captured: 3 };
            if (id === 'charged-pulse') {
              state.charge = { remaining: .45, duration: .9 };
              if (scene === 'remote-charge') { g.switchWeapon(3); g.bullets.push({ id: 99100, owner: 'player', kind: 'grenade', x: 1940, y: 1200, vx: 640, vy: 0, radius: 6, lifetime: .7, life: .7, age: .15, color: '#ffb169' }); }
            }
            g.events = []; r.reducedMotion = scene === 'reduced-motion'; r.camera.x = g.player.x; r.camera.y = g.player.y; r.resetEffects();
            return { frame: a.frames, gameplay: JSON.stringify({ player: g.player, state, hazards: g.hazards, bullets: g.bullets, enemies: g.enemies }), id };
          }, scene);
          await page.waitForFunction(frame => __awakeningDrawing.frames > frame + 14, before.frame);
          const settledFrame = await page.evaluate(() => { const a = __awakeningDrawing; a.renderer.pointerHudTime = -1; return a.frames; });
          await page.waitForFunction(frame => __awakeningDrawing.frames > frame + 2, settledFrame);
          await page.evaluate(scene => {
            const a = __awakeningDrawing, g = a.game;
            const stage = scene === 'slide-reload' ? 'slide' : scene === 'interrupt-round' ? 'interrupt' : scene === 'mobile-field' || scene === 'reduced-motion' ? 'field-capture' : null;
            if (stage) a.renderer.consume([{ type: 'awakening-trigger', awakeningId: g.campaign.awakeningId, stage,
              x: stage === 'field-capture' ? 1680 : stage === 'interrupt' ? 1720 : g.player.x, y: stage === 'interrupt' ? 1160 : g.player.y,
              color: stage === 'interrupt' ? '#ffd18c' : '#8cf5d3' }]);
          }, scene);
          const screenshot = path.join(output, `${width}x${height}${safe ? '-safe' : ''}-${scene}.png`); await page.screenshot({ path: screenshot });
          const actual = await page.evaluate(() => {
            const a = __awakeningDrawing, r = a.renderer, p = r.encounterPlayerPoint;
            const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const labels = r.encounterLabelRects || [], blocks = [...(r.pointerHud?.blocks || []), { left: p.x - 25, right: p.x + 29, top: p.y - 27, bottom: p.y + 27 }];
            return { nonFinite: a.nonFinite, negativeRadius: a.negativeRadius, labels, labelTexts: r.stormHazardLabels.map(label => label.text),
              overlaps: labels.filter((label, i) => blocks.some(block => overlaps(label, block)) || labels.slice(i + 1).some(other => overlaps(label, other))).length,
              chargeCircles: a.chargeCircles, target: a.game.skillTarget(), particles: r.particles.length, rings: r.rings.length, shake: r.shake,
              invalidText: /\b(?:undefined|NaN)\b/.test(document.body.innerText),
              gameplay: JSON.stringify({ player: a.game.player, state: a.game.awakeningState, hazards: a.game.hazards, bullets: a.game.bullets, enemies: a.game.enemies }) };
          });
          assert.equal(actual.nonFinite, 0); assert.equal(actual.negativeRadius, 0); assert.equal(actual.gameplay, before.gameplay);
          assert.equal(actual.invalidText, false); assert.equal(actual.overlaps, 0); assert.equal(actual.shake, 0);
          assert.ok(actual.particles <= 420 && actual.rings <= 20);
          if (before.id === 'charged-pulse') {
            assert.equal(actual.chargeCircles.length, 2);
            assert.ok(actual.chargeCircles.every(circle => circle[0] === actual.target.x && circle[1] === actual.target.y));
            assert.equal(actual.chargeCircles[0][2], actual.target.radius); assert.equal(actual.chargeCircles[1][2], actual.target.radius * 1.2);
            assert.equal(actual.target.remote, scene === 'remote-charge');
          }
          delete actual.gameplay; delete actual.target.target;
          report.cases.push({ size: config, scene, screenshot, ...actual, passed: true });
        }
      } finally { await context.close(); }
    }
    assert.deepEqual(report.errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.cases.length, errors: report.errors, report: path.join(output, 'results.json') }));
}
main().catch(error => { report.failure = error.stack; fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; });
