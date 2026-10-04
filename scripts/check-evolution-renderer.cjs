'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), release = process.argv.includes('--release'), mode = release ? 'release' : 'source';
const folder = release ? path.join(root, 'release/web') : root, origin = 'http://127.0.0.1:4184';
const output = path.join(root, 'reports', 'evolution-renderer-' + mode + '.json');
const report = { timestamp: new Date().toISOString(), mode, files: {}, cases: [], errors: [], note: 'Real Edge Canvas / native animation frames. Explicit frozen scenes exercise evolution rendering, not gameplay completion or balance. Cross-origin/account traffic is blocked. Phone viewport emulation does not replace physical devices.' };

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
          const audit = window.__evolutionDrawing = { frames: 0, nonFinite: 0, negativeRadius: 0, freeze: false };
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
        await page.goto(origin); await page.locator('#start-run').waitFor();
        if (mobile) { await page.locator('#fullscreen-toggle').click(); await page.waitForFunction(() => !!document.fullscreenElement); }
        await page.locator('#start-run').click(); await page.waitForFunction(() => __evolutionDrawing.frames > 5);
        if (await page.locator('#coach-dismiss').isVisible()) await page.locator('#coach-dismiss').click();
        await page.waitForFunction(() => document.querySelector('#event-banner').classList.contains('hidden') && !document.querySelector('#notification').classList.contains('visible'));
        for (const scene of width < 600 ? ['shotgun-breach', 'shotgun-capacity'] : ['assault-chain', 'shotgun-breach', 'piercer-mirror', 'grenade-echo', 'boomerang-twin', 'reduced-motion']) {
          const before = await page.evaluate(scene => {
            const a = __evolutionDrawing, g = a.game, r = a.renderer, calm = scene === 'reduced-motion', breachScene = scene.startsWith('shotgun-'); a.freeze = true;
            const evolutionId = calm ? 'grenade-echo' : breachScene ? 'shotgun-breach' : scene, id = Expedition.EVOLUTIONS.find(e => e.id === evolutionId);
            g.enemies = []; g.bullets = []; g.hazards = []; g.events = []; g.echoBursts = []; g.evolutionId = evolutionId;
            g.evolutionState = { breachTimer: breachScene ? 1.3 : 0, echoes: [] }; g.tactical = { decoy: null, mine: null, cooldown: 0 };
            g.player.magazineMultiplier = scene === 'shotgun-capacity' ? 2 : 1; g._refillWeapons();
            g.player.x = 1600; g.player.y = 1200; g.switchWeapon(id.weapon); g.player.angle = -.15; g.player.reloadTimer = 0;
            g.obstacles = g.obstacles.filter(rock => Math.hypot(rock.x - 1600, rock.y - 1200) > 400);
            g.stations = g.stations.filter(station => Math.hypot(station.x - 1600, station.y - 1200) > 400);
            g.encounters.forEach(e => { e.status = 'idle'; }); r.reducedMotion = calm; r.camera.x = 1600; r.camera.y = 1200; r.resetEffects();
            for (const [type, x, y] of [['crawler', 1740, 1165], ['spitter', 1800, 1095], ['tank', 1840, 1180]]) g.spawnEnemy(type, { x, y });
            const bullet = properties => g.bullets.push({ id: g.bullets.length + 900, owner: 'player', kind: 'normal', evolutionId, color: id.color,
              x: 1660, y: 1190, vx: 800, vy: -120, radius: 3, age: .1, life: 1, ...properties });
            if (scene === 'assault-chain') {
              bullet({});
              for (const [from, to] of [[{ x: 1740, y: 1165 }, { x: 1800, y: 1095 }], [{ x: 1800, y: 1095 }, { x: 1840, y: 1180 }]]) r.consume([{ type: 'arc', evolutionId, ...from, toX: to.x, toY: to.y, color: id.color }]);
            } else if (breachScene) {
              for (const y of [1178, 1190, 1202]) bullet({ x: 1660, y, breach: true, radius: 4 });
            } else if (scene === 'piercer-mirror') {
              g.obstacles.push({ x: 1720, y: 1190, radius: 34, seed: .5 });
              bullet({ x: 1660, y: 1190 }); bullet({ x: 1690, y: 1145, vx: -560, vy: -500, ricocheted: true });
              r.consume([{ type: 'evolution-trigger', evolutionId, stage: 'ricochet', x: 1684, y: 1181, angle: -2.4 }]);
            } else if (evolutionId === 'grenade-echo') {
              bullet({ kind: 'grenade' }); g.evolutionState.echoes.push({ x: 1760, y: 1180, radius: 110, duration: .55, remaining: .24, evolutionId, color: id.color });
              if (calm) for (let i = 0; i < 150; i++) r.consume([{ type: 'evolution-trigger', evolutionId, stage: 'echo', x: 1770, y: 1170 }]);
            } else {
              bullet({ kind: 'boomerang', x: 1690, y: 1155, vx: 700, vy: -100 });
              bullet({ kind: 'boomerang', x: 1690, y: 1245, vx: -700, vy: -100, returning: true, rockRebounded: true });
            }
            r.updateEffects(.04);
            return { frame: a.frames, gameplay: JSON.stringify({ bullets: g.bullets, state: g.evolutionState }), evolutionId };
          }, scene);
          await page.waitForFunction(frame => __evolutionDrawing.frames > frame + 14, before.frame);
          const screenshot = path.join(root, 'reports', `evolution-${mode}-${width}x${height}-${scene}.png`); await page.screenshot({ path: screenshot });
          const actual = await page.evaluate(() => { const a = __evolutionDrawing, r = a.renderer, name = document.querySelector('#weapon-name'), range = document.createRange();
            range.selectNodeContents(name); const box = name.getBoundingClientRect(), text = range.getBoundingClientRect();
            const rect = r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
            return { frames: a.frames, nonFinite: a.nonFinite, negativeRadius: a.negativeRadius,
            particles: r.particles.length, rings: r.rings.length, arcs: r.arcs.length, shake: r.shake, reducedMotion: r.reducedMotion,
            invalidText: /\b(?:undefined|NaN)\b/.test(document.body.innerText), weaponText: name.textContent,
            weaponTextGeometry: { box: rect(box), text: rect(text), lines: Array.from(range.getClientRects(), rect), fontSize: getComputedStyle(name).fontSize },
            breachReadyClass: name.classList.contains('breach-ready'), ammo: document.querySelector('#ammo-current').textContent,
            reloadRect: rect(document.querySelector('#reload-button').getBoundingClientRect()),
            gameplay: JSON.stringify({ bullets: a.game.bullets, state: a.game.evolutionState }) }; });
          assert.equal(actual.nonFinite, 0); assert.equal(actual.negativeRadius, 0); assert.equal(actual.gameplay, before.gameplay);
          assert.equal(actual.invalidText, false); assert.ok(actual.weaponText.length > 0);
          if (scene.startsWith('shotgun-')) {
            const { box, lines } = actual.weaponTextGeometry; assert.equal(actual.weaponText, '重弹\n1.3s'); assert.equal(actual.breachReadyClass, true);
            const fits = lines.every(text => text.left >= box.left - .5 && text.right <= box.right + .5 && text.top >= box.top - .5 && text.bottom <= box.bottom + .5);
            if (!fits) report.failureScene = { width, height, scene, weaponText: actual.weaponText, ...actual.weaponTextGeometry };
            assert.ok(fits, 'Breach countdown must fit without ellipsis: ' + JSON.stringify(report.failureScene));
            assert.ok(box.bottom <= actual.reloadRect.top + .5, 'Countdown must not overlap reload button');
            if (scene === 'shotgun-capacity') assert.equal(Number(actual.ammo), 14);
            const expireFrame = await page.evaluate(() => { __evolutionDrawing.game.evolutionState.breachTimer = 0; return __evolutionDrawing.frames; });
            await page.waitForFunction(frame => __evolutionDrawing.frames > frame + 14, expireFrame);
            actual.expiredCue = await page.evaluate(() => ({ text: document.querySelector('#weapon-name').textContent, readyClass: document.querySelector('#weapon-name').classList.contains('breach-ready'), reloadDisabled: document.querySelector('#reload-button').disabled }));
            assert.equal(actual.expiredCue.readyClass, false); assert.equal(actual.expiredCue.text, '破阵重弹');
          }
          assert.ok(actual.particles <= 420 && actual.rings <= 20 && actual.arcs <= 20); assert.equal(actual.shake, 0);
          delete actual.gameplay; report.cases.push({ size: { width, height }, scene, screenshot, ...actual, passed: true });
        }
      } finally { await context.close(); }
    }
    assert.deepEqual(report.errors, []);
  } finally { await browser.close(); fs.writeFileSync(output, JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.cases.length, errors: report.errors, report: output }));
}
main().catch(error => { report.failure = error.stack; fs.writeFileSync(output, JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; });
