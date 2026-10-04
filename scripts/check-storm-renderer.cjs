'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), release = process.argv.includes('--release'), mode = release ? 'release' : 'source';
const folder = release ? path.join(root, 'release/web') : root, origin = 'http://127.0.0.1:4188';
const output = path.join(root, 'reports', 'storm-renderer-' + mode + '.json');
const report = { timestamp: new Date().toISOString(), mode, files: {}, cases: [], errors: [], note: 'Actual Edge Canvas/native rAF with frozen storm fixtures. This checks shapes, geometry and safe label placement; it is not difficulty evidence or a physical-phone test. Guest storage and cross-origin/account traffic blocked.' };

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }); report.browser = browser.version();
  try {
    for (const [width, height, mobile] of [[1280, 800, false], [667, 375, true], [390, 844, true], [360, 780, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
      try {
        await context.route('**/*', async route => {
          const url = new URL(route.request().url()); if (url.origin !== origin || url.pathname.includes('/vendor/')) return route.abort();
          const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', file = path.resolve(folder, name);
          if (!file.startsWith(folder + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
          const body = fs.readFileSync(file); report.files[name] = crypto.createHash('sha256').update(body).digest('hex');
          return route.fulfill({ body, contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
        });
        await context.addInitScript(() => {
          const audit = window.__stormDrawing = { frames: 0, nonFinite: 0, negativeRadius: 0, freeze: false };
          for (const name of ['arc', 'arcTo', 'ellipse', 'moveTo', 'lineTo', 'fillRect', 'strokeRect', 'roundRect', 'translate', 'scale', 'rotate', 'setTransform', 'drawImage', 'fillText', 'strokeText']) {
            const original = CanvasRenderingContext2D.prototype[name]; if (!original) continue;
            CanvasRenderingContext2D.prototype[name] = function (...args) {
              if (args.some(v => typeof v === 'number' && !Number.isFinite(v))) audit.nonFinite++;
              if (name === 'arc' && args[2] < 0 || name === 'ellipse' && (args[2] < 0 || args[3] < 0)) audit.negativeRadius++;
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
              const renderer = Reflect.construct(target, args, next); audit.renderer = renderer; const render = renderer.render;
              renderer.render = function (game, dt) { const result = render.call(this, game, audit.freeze ? 0 : dt); audit.frames++; return result; }; return renderer;
            } });
          } });
          localStorage.setItem('frontier-sound', 'off');
        });
        const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
        await page.goto(origin); await page.locator('[data-map="storm"]').click();
        if (mobile) { await page.locator('#fullscreen-toggle').click(); await page.waitForFunction(() => !!document.fullscreenElement); }
        await page.locator('#start-run').click(); await page.waitForFunction(() => __stormDrawing.frames > 5);
        if (await page.locator('#coach-dismiss').isVisible()) await page.locator('#coach-dismiss').click();
        await page.waitForFunction(() => document.querySelector('#event-banner').classList.contains('hidden') && !document.querySelector('#notification').classList.contains('visible'));
        for (const scene of ['idle', 'charging', 'locked', 'complete', 'boss', 'reduced-motion']) {
          const before = await page.evaluate(scene => {
            const a = __stormDrawing, g = a.game, r = a.renderer; a.freeze = true;
            const tower = g.relays[0]; tower.status = scene === 'idle' ? 'idle' : scene === 'complete' ? 'active' : 'charging';
            tower.charges = scene === 'complete' ? 3 : scene === 'idle' ? 0 : 1; tower.progress = tower.charges / 3;
            g.player.x = tower.x + (scene === 'locked' ? 105 : 0); g.player.y = tower.y + 84; g.player.angle = -1;
            g.enemies = []; g.bullets = []; g.hazards = []; g.events = []; g.echoBursts = []; g.completedRelays = scene === 'complete' ? 1 : 0;
            g.encounters.forEach(e => { e.status = 'idle'; }); r.reducedMotion = scene === 'reduced-motion'; r.camera.x = g.player.x; r.camera.y = g.player.y; r.resetEffects();
            if (scene === 'locked') g.hazards.push({ id: 'test-lightning', type: 'blast', x: tower.x, y: tower.y + 84, radius: 90, remaining: .65, duration: 1.35, conductionRelayId: tower.id, capturedAtLock: true, owner: 'environment' });
            if (scene === 'boss' || scene === 'reduced-motion') {
              g.relays.forEach(r => { r.status = 'active'; r.charges = 3; r.progress = 1; }); g.completedRelays = 3;
              g.enemies.push({ id: 990, type: 'boss', variant: 'storm', name: g.map.boss.name, color: g.map.boss.color, x: tower.x + 105, y: tower.y - 10, radius: 48, hp: 1300, maxHp: 1500, stage: 2, windup: .65, attackKind: 'storm-call', angle: 2.1 });
              g.hazards.push({ id: 'test-backlash', type: 'blast', x: tower.x + 105, y: tower.y - 10, radius: 98, remaining: .65, duration: 1.5, backlashId: 990, owner: 'enemy' });
              r.consume([{ type: 'boss-backlash', x: tower.x + 105, y: tower.y - 10 }]);
            }
            return { frame: a.frames, gameplay: JSON.stringify({ player: g.player, towers: g.relays, hazards: g.hazards, enemies: g.enemies }) };
          }, scene);
          await page.waitForFunction(frame => __stormDrawing.frames > frame + 14, before.frame);
          // Frozen gameplay also freezes renderer time; refresh the normal HUD
          // cache after the DOM has shown/hidden the boss panel for this scene.
          const settledFrame = await page.evaluate(() => { __stormDrawing.renderer.pointerHudTime = -1; return __stormDrawing.frames; });
          await page.waitForFunction(frame => __stormDrawing.frames > frame + 2, settledFrame);
          const screenshot = path.join(root, 'reports', `storm-${mode}-${width}x${height}-${scene}.png`); await page.screenshot({ path: screenshot });
          const actual = await page.evaluate(() => {
            const a = __stormDrawing, r = a.renderer, player = r.encounterPlayerPoint;
            const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const labels = r.encounterLabelRects || [], blocks = [...(r.pointerHud?.blocks || []), { left: player.x - 25, right: player.x + 29, top: player.y - 27, bottom: player.y + 27 }];
            const tiny = document.createElement('canvas'); tiny.getBoundingClientRect = () => ({ width: 460, height: 280 }); r.drawMinimap(tiny, a.game, { detailed: true });
            return { frames: a.frames, nonFinite: a.nonFinite, negativeRadius: a.negativeRadius, labels,
              labelOverlaps: labels.filter((label, i) => blocks.some(block => overlap(label, block)) || labels.slice(i + 1).some(other => overlap(label, other))).length,
              particles: r.particles.length, rings: r.rings.length, shake: r.shake, invalidText: /\b(?:undefined|NaN)\b/.test(document.body.innerText),
              gameplay: JSON.stringify({ player: a.game.player, towers: a.game.relays, hazards: a.game.hazards, enemies: a.game.enemies }) };
          });
          assert.equal(actual.nonFinite, 0); assert.equal(actual.negativeRadius, 0); assert.equal(actual.gameplay, before.gameplay);
          assert.equal(actual.invalidText, false); assert.equal(actual.labelOverlaps, 0); assert.ok(actual.labels.length > 0);
          assert.ok(actual.particles <= 420 && actual.rings <= 20); assert.equal(actual.shake, 0);
          delete actual.gameplay; report.cases.push({ size: { width, height }, scene, screenshot, ...actual, passed: true });
        }
      } finally { await context.close(); }
    }
    assert.deepEqual(report.errors, []);
  } finally { await browser.close(); fs.writeFileSync(output, JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.cases.length, errors: report.errors, report: output }));
}
main().catch(error => { report.failure = error.stack; fs.writeFileSync(output, JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; });
