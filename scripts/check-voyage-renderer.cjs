'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), online = process.argv.includes('--online'), release = process.argv.includes('--release'), mode = online ? 'online' : release ? 'release' : 'source';
const folder = release ? path.join(root, 'release/web') : root, origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com/?v=5.0.0' : 'http://127.0.0.1:4196';
const output = path.join(root, 'reports', '5.0-voyage-renderer-' + mode); fs.mkdirSync(output, { recursive: true });
const report = { timestamp: new Date().toISOString(), mode, files: {}, cases: [], errors: [], note: 'Actual Edge Canvas and native animation frames. Frozen visual fixtures use real voyage room configuration and real Boss attack methods, plus an explicit composite device state to assess rendering, not completion or real-phone performance. Local cases cover 3 biomes and 3 objectives; online cases cover 3 Boss phases on phone. No online response replacement.' };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }); report.browser = browser.version();
  try {
    const sizes = online ? [{ width: 844, height: 390, mobile: true, safe: true }] : [{ width: 1280, height: 800 }, { width: 667, height: 375, mobile: true }, { width: 390, height: 844, mobile: true }, { width: 844, height: 390, mobile: true, safe: true }];
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: !!size.mobile, isMobile: !!size.mobile, deviceScaleFactor: 1 });
      try {
        if (!online) await context.route('**/*', async route => {
          const url = new URL(route.request().url()); if (url.origin !== origin || url.pathname.includes('/vendor/')) return route.abort();
          const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html', file = path.resolve(folder, name);
          if (!file.startsWith(folder + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
          const body = fs.readFileSync(file); report.files[name] = crypto.createHash('sha256').update(body).digest('hex');
          return route.fulfill({ body, contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
        });
        await context.addInitScript(() => {
          const a = window.__voyageDrawing = { frames: 0, invalid: 0, freeze: false, bakes: 0, order: [] };
          for (const name of ['arc', 'arcTo', 'ellipse', 'moveTo', 'lineTo', 'fillRect', 'strokeRect', 'roundRect', 'translate', 'scale', 'rotate', 'setTransform', 'drawImage', 'fillText', 'strokeText']) {
            const original = CanvasRenderingContext2D.prototype[name]; if (!original) continue;
            CanvasRenderingContext2D.prototype[name] = function (...args) { if (args.some(value => typeof value === 'number' && !Number.isFinite(value)) || name === 'arc' && args[2] < 0) a.invalid++; return original.apply(this, args); };
          }
          let api, Renderer;
          Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
            api = value; api.Game = new Proxy(value.Game, { construct(target, args, next) {
              const game = Reflect.construct(target, args, next); a.game = game; const update = game.update; game.update = function (...args) { if (!a.freeze) return update.apply(this, args); }; return game;
            } });
          } });
          Object.defineProperty(window, 'ExpeditionRenderer', { configurable: true, get: () => Renderer, set(value) {
            Renderer = new Proxy(value, { construct(target, args, next) {
              const renderer = Reflect.construct(target, args, next); a.renderer = renderer;
              for (const method of ['drawVoyageFields', 'drawVoyageRoom', 'drawHazard', 'drawPlayer', 'drawEnemy']) { const draw = renderer[method]; renderer[method] = function (...args) { a.order.push(method); return draw.apply(this, args); }; }
              const paint = renderer.paintTerrain; renderer.paintTerrain = function (...args) { a.bakes++; return paint.apply(this, args); };
              const render = renderer.render; renderer.render = function (game, dt) { a.order = []; const value = render.call(this, game, a.freeze ? 0 : dt); a.frames++; return value; }; return renderer;
            } });
          } });
          localStorage.setItem('frontier-sound', 'off'); localStorage.setItem('frontier-music', 'off');
        });
        const page = await context.newPage(), responses = []; page.on('pageerror', error => report.errors.push(error.message));
        if (online) page.on('response', response => {
          const url = new URL(response.url());
          if (url.origin === new URL(origin).origin && (response.request().resourceType() === 'document' || /\.(js|css)$/.test(url.pathname))) responses.push((async () => {
            const body = await response.body(); report.files[decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html'] = { status: response.status(), sha256: crypto.createHash('sha256').update(body).digest('hex') };
          })());
        });
        await page.goto(origin);
        if (online && await page.locator('#submitBtn').count()) { assert.match(await page.locator('body').innerText(), /测试域名/); await page.locator('#submitBtn').click({ timeout: 20000 }); report.cloudbaseNoticeAccepted = true; }
        await page.locator('[data-map="frontier"]').click();
        if (size.mobile) { await page.locator('#fullscreen-toggle').click(); await page.waitForFunction(() => !!document.fullscreenElement); }
        await page.locator('#start-run').click(); await page.waitForFunction(() => __voyageDrawing.frames > 5);
        if (size.safe) await page.evaluate(() => { const stage = document.querySelector('#game-stage'); for (const side of ['left', 'right']) stage.style.setProperty('--safe-' + side, '44px'); stage.style.setProperty('--safe-bottom', '21px'); });
        if (await page.locator('#coach-dismiss').isVisible()) await page.locator('#coach-dismiss').click();
        await page.waitForFunction(() => document.querySelector('#event-banner').classList.contains('hidden') && !document.querySelector('#notification').classList.contains('visible'));
        const scenes = online ? ['boss-ring', 'boss-teleport', 'boss-finale'] : ['cosmos-clear', 'forge-clear', 'tide-clear', 'cosmos-siege', 'forge-siege', 'tide-siege', 'cosmos-harvest', 'forge-harvest', 'tide-harvest', 'boss-ring', 'boss-teleport', 'boss-finale', 'devices', 'gate-ready', 'reduced-motion'];
        for (const scene of scenes) {
          const before = await page.evaluate(scene => {
            const a = __voyageDrawing, g = a.game, r = a.renderer; a.freeze = true; g.reset('frontier', { mode: 'voyage', seed: 520 }); g.start();
            g.enemies = []; g.bullets = []; g.hazards = []; g.pickups = [];
            if (scene.startsWith('boss-')) g.voyage.node = 7;
            const [biome, type] = scene.split('-');
            const route = { ...g.voyage.plans[0][0], id: 'visual-' + scene, biome: ['cosmos', 'forge', 'tide'].includes(biome) ? biome : 'cosmos', type: ['clear', 'siege', 'harvest'].includes(type) ? type : scene.startsWith('boss-') ? 'finale' : 'clear' };
            g._configureVoyageRoom(route); g.player.x = 850; g.player.y = 630; g.player.angle = -Math.PI / 4; r.reducedMotion = scene === 'reduced-motion';
            if (route.type === 'harvest') { g.voyage.room.collectors[0].charge = 2; g.voyage.room.collectors[1].charge = 4; g.voyage.room.collectors[1].status = 'active'; g.player.x = 580; g.player.y = 650; }
            if (scene === 'gate-ready') { g.voyage.room.exit.ready = true; g.voyage.room.objectiveDone = true; g.player.y = 850; }
            if (scene === 'devices' || scene === 'reduced-motion') {
              g.voyage.effects = { trails: [{ id: 999, x: 550, y: 690, endX: 770, endY: 680, width: 24, remaining: 1.2, duration: 2, hitIds: [] }],
                needleTimer: 1.5, mirrorTimer: 2, batteryTimer: 3, batteryCharges: 2, reloadLockout: 0,
                sentry: { x: 1010, y: 620, radius: 14, remaining: 1.6, duration: 3, shots: 1, maxShots: 2 },
                well: { x: 700, y: 480, radius: 125, remaining: 1.8, duration: 2.6 } };
              g.bullets.push({ id: 9992, owner: 'player', kind: 'voyage', deviceId: 'mirror', x: 930, y: 550, vx: 800, vy: -200, radius: 4, lifetime: .5, color: '#c9b5ff' });
            }
            if (scene.startsWith('boss-')) {
              const boss = g.enemies.find(enemy => enemy.type === 'boss'); boss.x = 900; boss.y = 500; boss.attackTimer = 0;
              if (scene === 'boss-ring') Object.assign(boss, { stage: 1, attackCount: 2 });
              if (scene === 'boss-teleport') Object.assign(boss, { stage: 2, hp: 2700, attackCount: 3 });
              if (scene === 'boss-finale') Object.assign(boss, { stage: 3, hp: 1300, attackCount: 0 });
              const dx = g.player.x - boss.x, dy = g.player.y - boss.y, length = Math.hypot(dx, dy); g._updateVoyageBoss(boss, 0, dx / length, dy / length, length);
              const expected = { 'boss-ring': 'voyage-ring', 'boss-teleport': 'voyage-teleport', 'boss-finale': 'voyage-finale' }[scene];
              if (boss.attackKind !== expected) throw new Error('Actual Boss attack did not match fixture');
            }
            g.events = []; r.pointerHudTime = -1; g._objective();
            return { frame: a.frames, snapshot: JSON.stringify({ player: g.player, voyage: g.voyage, enemies: g.enemies, hazards: g.hazards, bullets: g.bullets }) };
          }, scene);
          await page.waitForFunction(frame => __voyageDrawing.frames > frame + 8, before.frame);
          if (scene.startsWith('boss-')) await page.waitForFunction(() => {
            const boss = __voyageDrawing.game.enemies.find(enemy => enemy.type === 'boss');
            return document.querySelector('#boss-phase').textContent === 'PHASE 0' + boss.stage;
          });
          const settled = await page.evaluate(() => ({ frame: __voyageDrawing.frames, bakes: __voyageDrawing.bakes }));
          await page.waitForFunction(frame => __voyageDrawing.frames > frame + 3, settled.frame);
          const screenshot = path.join(output, `${size.width}x${size.height}${size.safe ? '-safe' : ''}-${scene}.png`); await page.screenshot({ path: screenshot });
          const actual = await page.evaluate(() => {
            const a = __voyageDrawing, r = a.renderer, g = a.game, player = r.encounterPlayerPoint;
            const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const labels = r.encounterLabelRects || [], blocks = [...(r.pointerHud?.blocks || []), { left: player.x - 25, right: player.x + 29, top: player.y - 27, bottom: player.y + 27 }];
            return { invalid: a.invalid, labels, labelTexts: r.stormHazardLabels.map(label => label.text),
              overlaps: labels.filter((label, index) => blocks.some(block => overlaps(label, block)) || labels.slice(index + 1).some(other => overlaps(label, other))).length,
              bakes: a.bakes, terrainKey: r.terrainKey, roomId: g.voyage.room.id, order: a.order,
              bossPhase: { actual: g.enemies.find(enemy => enemy.type === 'boss')?.stage || null, displayed: document.querySelector('#boss-phase').textContent },
              target: g.voyageTarget(), particles: r.particles.length, rings: r.rings.length,
              invalidText: /\b(?:undefined|NaN)\b/.test(document.body.innerText), snapshot: JSON.stringify({ player: g.player, voyage: g.voyage, enemies: g.enemies, hazards: g.hazards, bullets: g.bullets }) };
          });
          assert.equal(actual.invalid, 0); assert.equal(actual.snapshot, before.snapshot); assert.equal(actual.overlaps, 0); assert.equal(actual.invalidText, false); assert.equal(actual.bakes, settled.bakes); assert.ok(actual.terrainKey.endsWith(actual.roomId));
          if (actual.order.includes('drawHazard')) assert.ok(actual.order.indexOf('drawVoyageFields') < actual.order.indexOf('drawHazard'));
          assert.ok(actual.particles <= 420 && actual.rings <= 20); delete actual.snapshot;
          report.cases.push({ size, scene, screenshot, ...actual, passed: true });
        }
        const transition = await page.evaluate(() => {
          const a = __voyageDrawing, g = a.game, r = a.renderer, player = g.player, before = a.bakes;
          g.enemies = []; g.bullets = []; g.hazards = []; g.events = [];
          g._configureVoyageRoom({ ...g.voyage.plans[0][0], id: 'same-biome-next-room', biome: g.voyage.room.biome, type: 'siege' });
          g.events = []; r.render(g, 0); return { samePlayer: g.player === player, before, after: a.bakes, terrainKey: r.terrainKey };
        });
        assert.ok(transition.samePlayer); assert.equal(transition.after, transition.before + 1); assert.ok(transition.terrainKey.endsWith('same-biome-next-room'));
        report.cases.push({ size, scene: 'same-biome-terrain-transition', ...transition, passed: true });
        await Promise.all(responses);
      } finally { await context.close(); }
    }
    assert.deepEqual(report.errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.cases.length, errors: report.errors, report: path.join(output, 'results.json') }));
})().catch(error => { report.failure = error.stack; fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; });
