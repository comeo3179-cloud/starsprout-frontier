'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), release = process.argv.includes('--release'), mode = release ? 'release' : 'source';
const folder = release ? path.join(root, 'release/web') : root, origin = 'http://127.0.0.1:4190';
const output = path.join(root, 'reports', 'campaign-renderer-' + mode + '.json');
const report = { timestamp: new Date().toISOString(), mode, files: {}, cases: [], errors: [], note: 'Real Edge Canvas/native rAF, explicit frozen campaign fixtures. Geometry and HUD/player label occlusion checks, not gameplay completion or balance. Phone dimensions and safe-area CSS emulate screens, not physical phones. Guest storage and cross-origin/account traffic blocked.' };

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }); report.browser = browser.version();
  try {
    for (const config of [{ width: 1280, height: 800 }, { width: 667, height: 375, mobile: true }, { width: 390, height: 844, mobile: true },
      { width: 360, height: 780, mobile: true }, { width: 844, height: 390, mobile: true, safe: true }]) {
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
          const audit = window.__campaignDrawing = { frames: 0, nonFinite: 0, negativeRadius: 0, freeze: false };
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
        await page.goto(origin); await page.locator('#campaign-entry').click();
        if (safe) await page.evaluate(() => {
          const stage = document.getElementById('game-stage'); stage.style.setProperty('--safe-left', '44px'); stage.style.setProperty('--safe-right', '44px'); stage.style.setProperty('--safe-bottom', '21px');
        });
        if (mobile) { await page.locator('#fullscreen-toggle').click(); await page.waitForFunction(() => !!document.fullscreenElement); }
        await page.locator('#start-campaign').click(); await page.waitForFunction(() => __campaignDrawing.frames > 5);
        if (await page.locator('#coach-dismiss').isVisible()) await page.locator('#coach-dismiss').click();
        await page.waitForFunction(() => document.querySelector('#event-banner').classList.contains('hidden') && !document.querySelector('#notification').classList.contains('visible'));
        for (const scene of ['entry-notice', 'shielded', 'one-anchor', 'exposed', 'lattice', 'collapse', 'ring', 'reduced-motion', 'skirmisher', 'marksman', 'conductor']) {
          const before = await page.evaluate(scene => {
            const a = __campaignDrawing, g = a.game, r = a.renderer; a.freeze = true;
            const doctrineId = ['skirmisher', 'marksman', 'conductor'].includes(scene) ? scene : 'conductor';
            g.reset('frontier', { mode: 'campaign', doctrineId, seed: 719 }); g.start(); g.enemies = []; g.campaign.stage = 3; g._configureNexus();
            g.campaign.visited = ['frontier', 'storm', 'nexus']; g.campaign.completedStages = 2; g.events = [];
            g.player.x = 900; g.player.y = 745; g.player.angle = -Math.PI / 2;
            const boss = g.enemies.find(e => e.type === 'boss'); boss.y = 620; boss.recoveryTimer = 0;
            if (scene === 'one-anchor') g.enemies = g.enemies.filter(e => e.type !== 'anchor' || e.x < 900);
            if (['exposed', 'lattice', 'collapse', 'ring', 'reduced-motion'].includes(scene)) {
              g.enemies = g.enemies.filter(e => e.type !== 'anchor'); boss.shielded = false; boss.hp = 2450; boss.stage = 2;
            }
            if (scene === 'exposed') boss.recoveryTimer = 1.5;
            if (scene === 'lattice' || scene === 'collapse') {
              boss.attackCount = scene === 'lattice' ? 0 : 1; boss.attackTimer = 0;
              g._updateNexusBoss(boss, 0, 0, 1, 125);
            }
            if (scene === 'ring' || scene === 'reduced-motion') {
              boss.attackCount = 3; boss.attackKind = 'nexus-ring'; boss.windup = .8;
              boss.attackName = '封界弹环'; boss.attackHint = '拉开距离穿过弹幕间隙';
            }
            g.events = []; g._objective();
            if (scene === 'entry-notice') {
              g.player.y = 1150; boss.y = 500;
              g._emit('campaign-stage', g.player, { stage: 3, mapId: 'nexus' });
            }
            r.reducedMotion = scene === 'reduced-motion'; r.camera.x = g.player.x; r.camera.y = g.player.y; r.resetEffects();
            return { frame: a.frames, gameplay: JSON.stringify({ player: g.player, campaign: g.campaign, hazards: g.hazards, enemies: g.enemies }) };
          }, scene);
          await page.waitForFunction(frame => __campaignDrawing.frames > frame + 14, before.frame);
          const settledFrame = await page.evaluate(() => { __campaignDrawing.renderer.pointerHudTime = -1; return __campaignDrawing.frames; });
          await page.waitForFunction(frame => __campaignDrawing.frames > frame + 2, settledFrame);
          const screenshot = path.join(root, 'reports', `campaign-${mode}-${width}x${height}${safe ? '-safe' : ''}-${scene}.png`); await page.screenshot({ path: screenshot });
          const actual = await page.evaluate(() => {
            const a = __campaignDrawing, r = a.renderer, player = r.encounterPlayerPoint;
            const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const labels = r.encounterLabelRects || [], blocks = [...(r.pointerHud?.blocks || []), ...(r.nexusLabelBlocks || []), { left: player.x - 25, right: player.x + 29, top: player.y - 27, bottom: player.y + 27 }];
            const pointers = r.nexusPointerRects || [], safe = r.pointerHud?.safe || {};
            const tiny = document.createElement('canvas'); tiny.getBoundingClientRect = () => ({ width: 460, height: 280 }); r.drawMinimap(tiny, a.game, { detailed: true });
            return { frames: a.frames, nonFinite: a.nonFinite, negativeRadius: a.negativeRadius, labels, labelTexts: r.stormHazardLabels.map(label => label.text),
              labelOverlaps: labels.filter((label, i) => blocks.some(block => overlaps(label, block)) || labels.slice(i + 1).some(other => overlaps(label, other))).length,
              pointers, pointerOverlaps: pointers.filter(pointer => [...blocks, ...labels].some(block => overlaps(pointer, block))).length,
              pointerSafeViolations: pointers.filter(pointer => pointer.left < (safe.left || 0) || pointer.right > r.width - (safe.right || 0) || pointer.top < (safe.top || 0) || pointer.bottom > r.height - (safe.bottom || 0)).length,
              particles: r.particles.length, rings: r.rings.length, shake: r.shake, invalidText: /\b(?:undefined|NaN)\b/.test(document.body.innerText),
              bossTactic: document.querySelector('#boss-tactic').textContent, bossHudVisible: !document.querySelector('#boss-hud').classList.contains('hidden'),
              gameplay: JSON.stringify({ player: a.game.player, campaign: a.game.campaign, hazards: a.game.hazards, enemies: a.game.enemies }) };
          });
          assert.equal(actual.nonFinite, 0); assert.equal(actual.negativeRadius, 0); assert.equal(actual.gameplay, before.gameplay);
          assert.equal(actual.invalidText, false); assert.equal(actual.labelOverlaps, 0);
          assert.equal(actual.pointerOverlaps, 0); assert.equal(actual.pointerSafeViolations, 0);
          if (scene === 'entry-notice') assert.ok(actual.pointers.length > 0, 'The nearest anchor remains navigable during the arrival notice');
          assert.ok(actual.labels.length > 0 || ['ring', 'reduced-motion'].includes(scene) && actual.bossHudVisible && actual.bossTactic.includes('封界弹环'), 'Hide redundant captions only when the attack HUD still explains the ring');
          assert.ok(actual.particles <= 420 && actual.rings <= 20); assert.equal(actual.shake, 0);
          delete actual.gameplay; report.cases.push({ size: config, scene, screenshot, ...actual, passed: true });
          if (scene === 'entry-notice') await page.waitForFunction(() => document.querySelector('#event-banner').classList.contains('hidden') && !document.querySelector('#notification').classList.contains('visible'));
        }
      } finally { await context.close(); }
    }
    assert.deepEqual(report.errors, []);
  } finally { await browser.close(); fs.writeFileSync(output, JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.cases.length, errors: report.errors, report: output }));
}
main().catch(error => { report.failure = error.stack; fs.writeFileSync(output, JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; });
