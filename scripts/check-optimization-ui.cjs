// Browser regression checks. Install Playwright separately; no production dependency.
'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), errors = [], results = [];
const baseline = process.argv.includes('--baseline');
const release = process.argv.includes('--release');
assert.ok(!(baseline && release), 'Choose a source baseline or a release build');
const productRoot = release ? path.join(root, 'release/web') : root;
const output = path.join(root, 'reports', release ? 'optimization-release' : baseline ? 'optimization-before' : 'optimization-after');
fs.mkdirSync(output, { recursive: true });

function instrument() {
  window.qa = { minimaps: 0, frames: 0, audio: [], inputs: [] };
  const Game = Expedition.Game, Renderer = ExpeditionRenderer, Audio = FrontierAudio;
  Expedition.Game = class extends Game {
    constructor(...args) { super(...args); qa.game = this; }
    update(dt, input) { qa.inputs.push(input); if (qa.inputs.length > 100) qa.inputs.shift(); return super.update(dt, input); }
  };
  window.ExpeditionRenderer = class extends Renderer {
    constructor(...args) { super(...args); qa.renderer = this; }
    drawMinimap(...args) { qa.minimaps++; return super.drawMinimap(...args); }
    render(...args) { qa.frames++; qa.worldLabels = []; return super.render(...args); }
    label(text, ...args) { qa.worldLabels.push(text); return super.label(text, ...args); }
  };
  window.FrontierAudio = class extends Audio {
    play(kind, ...args) { qa.audio.push(kind); return super.play(kind, ...args); }
  };
}

async function pageFor(browser, options = {}, legacy = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', ...options });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ legacy }) => {
    // Deterministic frame pumping through the actual UI, engine and real Canvas.
    let callbacks = [], time = 1000;
    window.requestAnimationFrame = callback => callbacks.push(callback);
    window.qaStep = (count = 1) => {
      for (let i = 0; i < count; i++) {
        time += 1000 / 60;
        const pending = callbacks; callbacks = [];
        pending.forEach(callback => callback(time));
      }
    };
    if (legacy) CanvasRenderingContext2D.prototype.roundRect = undefined;
  }, { legacy });
  await page.route('http://127.0.0.1:4175/**', async route => {
    const file = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '') || 'index.html';
    const absolute = path.resolve(productRoot, file);
    if (!absolute.startsWith(productRoot + path.sep)) return route.fulfill({ status: 403, body: '' });
    if (!fs.existsSync(absolute)) return route.fulfill({ status: 404, body: '' });
    let body = baseline && ['action.js', 'action-engine.js', 'action-renderer.js', 'audio.js'].includes(file)
      ? execFileSync('git', ['show', `d288c8f:${file}`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(absolute, 'utf8');
    if (file === 'index.html') {
      if (release) {
        // Install probes as the real bundle publishes its final class, before UI boot.
        const hook = `<script>Object.defineProperty(window, 'FrontierAudio', { configurable: true, set(Audio) { Object.defineProperty(window, 'FrontierAudio', { value: Audio, writable: true, configurable: true }); (${instrument.toString()})(); } });</script>`;
        body = body.replace(/<script src="assets\/game\.[a-f0-9]+\.js"><\/script>/, match => hook + match);
      } else body = body.replace('<script src="action.js">', `<script>(${instrument.toString()})();</script><script src="action.js">`);
    }
    const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
    await route.fulfill({ contentType, body });
  });
  await page.goto('http://127.0.0.1:4175/');
  await page.waitForFunction(() => window.qa && window.qa.game);
  await page.evaluate(() => qaStep(10));
  return page;
}
const click = (page, selector) => page.evaluate(selector => document.querySelector(selector).click(), selector);
const step = (page, n = 1) => page.evaluate(n => qaStep(n), n);

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await pageFor(browser);
    const idle = await page.evaluate(() => { const before = qa.minimaps; qaStep(60); return qa.minimaps - before; });
    if (!baseline) assert.equal(idle, 0, 'welcome screen must not redraw a frozen minimap');
    await click(page, '#start-run'); await step(page, 10);
    const burst = await page.evaluate(() => {
      const stage = document.getElementById('game-stage'), canvas = document.getElementById('world');
      const native = stage.getBoundingClientRect.bind(stage); let reads = 0;
      stage.getBoundingClientRect = () => { reads++; return native(); };
      for (let i = 0; i < 1000; i++) canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 600 + i / 100, clientY: 500 }));
      const duringEvents = reads; reads = 0; qaStep();
      const duringFrame = reads; stage.getBoundingClientRect = native;
      const expected = 609.99 - native().left - stage.clientLeft;
      const actual = parseFloat(document.getElementById('aim-reticle').style.left);
      return { duringEvents, duringFrame, aimError: Math.abs(expected - actual) };
    });
    if (!baseline) { assert.equal(burst.duringEvents, 0); assert.equal(burst.duringFrame, 1); assert.ok(burst.aimError < .01); }
    await page.evaluate(() => { document.body.style.paddingTop = '80px'; window.dispatchEvent(new Event('scroll')); qaStep(); });
    const scrollError = await page.evaluate(() => {
      const stage = document.getElementById('game-stage'), r = stage.getBoundingClientRect();
      const point = qa.renderer.screenToWorld(600, 500);
      const canvas = document.getElementById('world').getBoundingClientRect(), renderer = qa.renderer;
      const expectedY = (500 - canvas.top - renderer.height / 2 - renderer.shakeY) / renderer.scale + renderer.camera.y;
      return { reticle: Math.abs(parseFloat(document.getElementById('aim-reticle').style.top) - (500 - r.top - stage.clientTop)), world: Math.abs(point.y - expectedY) };
    });
    if (!baseline) { assert.ok(scrollError.reticle < .01); assert.ok(scrollError.world < .01); }
    await page.evaluate(() => { qa.game.relics.push('phase-mag'); qa.game.ammoByWeapon[0] = 10; });
    await page.keyboard.press('Shift'); await step(page);
    const relic = await page.evaluate(() => ({ label: qa.renderer.numbers.some(item => item.text === '相位补弹'), audio: qa.audio.includes('relic-trigger'), ammo: qa.game.ammoByWeapon[0] }));
    if (!baseline) { assert.equal(relic.label, true); assert.equal(relic.audio, true); assert.ok(relic.ammo > 10); }
    // Use a real projectile collision to check engine -> renderer event wiring.
    await page.evaluate(() => {
      const g = qa.game; g.player.x = 1000; g.player.y = 1000; g.player.dashTimer = 0;
      g.obstacles = [{ id: 900, x: 1090, y: 1000, radius: 25 }]; g.bullets = []; qa.renderer.resetEffects();
      g.bullets.push({ id: 999, x: 1000, y: 1000, vx: 1050, vy: 0, radius: 3, damage: 16, lifetime: 1, owner: 'player', pierce: 0, hitIds: [], color: '#abcdef' });
      qaStep(5);
    });
    const sparks = await page.evaluate(() => qa.renderer.particles.filter(p => p.color === '#abcdef').length);
    if (!baseline) assert.ok(sparks > 0);
    if (!baseline) {
      const timing = await page.evaluate(() => [false, true].map(calm => {
        qa.renderer.reducedMotion = calm;
        qa.game._emit('phase-burst', qa.game.player, { radius: 125 }); qaStep();
        const simBefore = qa.game.elapsed, effectsBefore = qa.renderer.time;
        qaStep(3);
        return { calm, simulation: qa.game.elapsed - simBefore, effects: qa.renderer.time - effectsBefore };
      }));
      for (const item of timing) assert.ok(Math.abs(item.simulation - item.effects) < 1e-9, 'hit stop must advance simulation and effects together');
      assert.ok(timing[0].simulation < .006 && timing[1].simulation > .049);
      results.push({ test: 'hit-stop-clocks', timing });
    }
    await click(page, '#pause-toggle'); await step(page, 10);
    const paused = await page.evaluate(() => { const maps = qa.minimaps, frames = qa.frames, elapsed = qa.game.elapsed; qaStep(120); return { maps: qa.minimaps - maps, frames: qa.frames - frames, elapsed: qa.game.elapsed - elapsed }; });
    if (!baseline) assert.deepEqual(paused, { maps: 0, frames: 0, elapsed: 0 });
    await page.setViewportSize({ width: 1100, height: 850 });
    await page.waitForTimeout(100); await step(page, 10);
    const resized = await page.evaluate(() => ({ backing: document.getElementById('minimap').width, css: document.getElementById('minimap').getBoundingClientRect().width }));
    assert.equal(resized.backing, Math.round(resized.css));
    await click(page, '#resume-run'); await step(page, 10);
    await page.evaluate(() => { document.body.style.paddingTop = ''; });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.waitForTimeout(3500); await step(page, 2);
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    results.push({ test: 'desktop', idleMinimapDraws: idle, pointerBurst: burst, scrollError, relic, sparks, paused, resized });
    if (!baseline) {
      await showDefeat(page);
      await page.screenshot({ path: path.join(output, 'desktop-defeat.png') });
      await click(page, '#play-again'); await step(page);
      assert.equal(await page.evaluate(() => qa.game.lastDamage), null);
      assert.equal(await page.evaluate(() => qa.game.phase), 'playing');
    }
    await page.context().close();

    const phone = await pageFor(browser, { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await click(phone, '#start-run'); await step(phone, 10);
    const box = await phone.locator('#move-stick').boundingBox();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await phone.mouse.move(center.x + 3, center.y); await phone.mouse.down(); await step(phone, 30);
    const tiny = await phone.evaluate(() => qa.inputs.at(-1).moveX);
    await phone.mouse.move(center.x + 18.4, center.y); await step(phone, 1);
    const middle = await phone.evaluate(() => qa.inputs.at(-1).moveX);
    await phone.mouse.move(center.x + 45, center.y); await step(phone, 1);
    const full = await phone.evaluate(() => qa.inputs.at(-1).moveX);
    await phone.mouse.up(); await step(phone, 1);
    const released = await phone.evaluate(() => qa.inputs.at(-1).moveX);
    if (!baseline) { assert.equal(tiny, 0); assert.ok(Math.abs(middle - .5) < .03); }
    assert.equal(full, 1); assert.equal(released, 0);
    if (!baseline) {
      await phone.evaluate(() => { qa.game.ammoByWeapon[0] = 20; qa.game._syncWeapon(); });
      await step(phone, 10);
      await click(phone, '#reload-button'); await step(phone);
      assert.match(await phone.locator('#reload-label').textContent(), /再点装填/);
      assert.match(await phone.locator('#active-reload-hint').textContent(), /再点装填/);
    }
    await phone.waitForTimeout(3500); await step(phone, 2);
    await phone.screenshot({ path: path.join(output, 'mobile.png') });
    results.push({ test: 'mobile-emulation', tiny, middle, full, released });
    if (!baseline) {
      const cause = await showDefeat(phone);
      await phone.evaluate(() => document.getElementById('play-again').scrollIntoView({ block: 'center' }));
      await step(phone, 2);
      const retry = await phone.evaluate(() => {
        const button = document.getElementById('play-again'), rect = button.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, viewport: innerHeight, hit: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button')?.id };
      });
      assert.ok(retry.top >= 0 && retry.bottom <= retry.viewport);
      assert.equal(retry.hit, 'play-again');
      await phone.screenshot({ path: path.join(output, 'mobile-defeat.png') });
      results.push({ test: 'mobile-defeat', cause, retry });
    }
    await phone.context().close();

    if (!baseline) {
      await checkActionClarity(browser);
      const legacy = await pageFor(browser, {}, true);
      for (const mapId of ['frontier', 'foundry', 'frost']) {
        await legacy.evaluate(mapId => {
          qa.game.reset(mapId); qa.game.start();
          qa.game.hazards = [{ type: 'lane', x: 1600, y: 1200, radius: 35, angle: .5, length: 450, duration: 1, remaining: .8 }];
          qa.renderer.render(qa.game, 0);
          const mini = document.getElementById('minimap'); qa.renderer.drawMinimap(mini, qa.game, { detailed: true });
        }, mapId);
      }
      results.push({ test: 'roundRect-unavailable', maps: 3 });
      await legacy.context().close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ browser: browser.version(), baseline, release, results, errors }, null, 2));
    console.log(JSON.stringify({ baseline, release, results, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

async function checkActionClarity(browser) {
  for (const coarse of [false, true]) {
    const page = await pageFor(browser, coarse ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {});
    await click(page, '[data-map="frost"]');
    assert.equal(await page.evaluate(() => localStorage.getItem('frontier-coach')), null, 'locked escort stages must not dismiss training in camp');
    await click(page, '#start-run'); await step(page, 10);
    assert.equal(await page.locator('#field-coach').evaluate(element => element.classList.contains('hidden')), false);

    await page.evaluate(() => {
      const g = qa.game; g.reset('foundry'); g.start(); g.spawnTimer = Infinity;
      const hunt = g.contracts.find(item => item.kind === 'hunt');
      Object.assign(g.player, { x: hunt.x, y: hunt.y }); g.interact();
      Object.assign(g.player, { x: 2280, y: 1200 }); qaStep(10);
    });
    const ready = await page.evaluate(() => ({ hint: document.getElementById('interaction-hint').textContent, action: qa.game.interactionState().action, labels: qa.worldLabels.filter(text => /^(E|点按) ·/.test(text)), button: document.getElementById('touch-interact').textContent, enabled: !document.getElementById('touch-interact').disabled }));
    assert.equal(ready.action, '开启'); assert.equal(ready.enabled, true);
    assert.deepEqual(ready.labels, [(coarse ? '点按' : 'E') + ' · 开启']);
    if (coarse) {
      const box = await page.locator('#touch-interact').boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else await page.keyboard.press('KeyE');
    await step(page, 10);
    const opened = await page.evaluate(() => ({ opened: qa.game.crates.find(item => item.x === 2280 && item.y === 1130).opened, keyHidden: document.querySelector('#interaction-hint kbd').classList.contains('hidden'), buttonDisabled: document.getElementById('touch-interact').disabled, hint: document.getElementById('interaction-hint').textContent }));
    assert.equal(opened.opened, true); assert.equal(opened.keyHidden, true); assert.equal(opened.buttonDisabled, true);

    const expected = await page.evaluate(() => {
      const g = qa.game; g.reset('frontier'); g.start(); g.spawnTimer = Infinity; g.obstacles = [];
      const contract = g.contracts.find(item => item.kind === 'salvage');
      Object.assign(g.player, { x: contract.x, y: contract.y }); g.interact();
      const node = contract.nodes[0]; Object.assign(g.player, { x: node.x + 45, y: node.y }); qaStep(10);
      const target = g.contractTarget(contract);
      return { id: contract.id, distance: Math.round(Math.hypot(target.x - g.player.x, target.y - g.player.y) / 10), terminal: Math.round(Math.hypot(contract.x - g.player.x, contract.y - g.player.y) / 10) };
    });
    await click(page, '#map-toggle'); await step(page);
    const mapCard = await page.locator(`[data-contract="${expected.id}"]`).textContent();
    assert.notEqual(expected.distance, expected.terminal);
    assert.ok(mapCard.includes(expected.distance + ' m'), 'map card must measure the current core, not the acceptance terminal');
    await click(page, '#close-map'); await step(page);

    await page.evaluate(() => { qa.game.player.dashCooldown = .08; qaStep(); });
    if (coarse) {
      assert.equal(await page.locator('#dash-button').isEnabled(), true);
      const box = await page.locator('#dash-button').boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else await page.keyboard.press('Shift');
    assert.equal(await page.evaluate(() => qa.game.player.dashTimer), 0);
    await step(page, 6);
    assert.ok(await page.evaluate(() => qa.game.player.dashTimer > 0), 'an early press must execute after cooldown');
    await step(page, 20);
    await page.evaluate(() => { qa.game.player.dashCooldown = .08; qaStep(); });
    await page.keyboard.press('Shift'); await page.keyboard.press('Escape');
    await click(page, '#resume-run'); await step(page, 10);
    assert.equal(await page.evaluate(() => qa.game.player.dashTimer), 0, 'pause must discard queued input');
    const preview = await page.evaluate(() => {
      const g = qa.game; g.reset('frontier'); g.start(); g.spawnTimer = Infinity; g.obstacles = []; g.enemies = [];
      Object.assign(g.player, { x: 1600, y: 1200, angle: 0 });
      g.switchWeapon(3);
      // A visible rock makes the preview legible even in the narrow phone view.
      g.obstacles.push({ x: 1800, y: 1200, radius: 30 }); qaStep(10);
      return { value: g.grenadePreview(), labels: qa.worldLabels.filter(text => text === '预计爆点') };
    });
    assert.ok(Math.abs(preview.value.x - 1763) < 1e-9); assert.equal(preview.labels.length, 1);
    await page.screenshot({ path: path.join(output, coarse ? 'mobile-grenade-preview.png' : 'desktop-grenade-preview.png') });
    await page.evaluate(() => { qa.game.switchWeapon(0); qaStep(); });
    assert.equal(await page.evaluate(() => qa.worldLabels.includes('预计爆点')), false, 'changing weapon removes the grenade preview');
    results.push({ test: 'action-clarity', coarse, ready, opened, mapTarget: expected, mapCard, dashBuffered: true, pauseClearedBuffer: true, grenadePreview: preview });
    await page.context().close();
  }
}

async function showDefeat(page) {
  const cause = await page.evaluate(() => {
    const game = qa.game;
    game.player.hp = 5; game.player.invulnerable = 0;
    game._addHazard('blast', game.player.x, game.player.y, 80, .001, 12, {
      owner: 'environment', name: game.map.threat.name, hint: game.map.threat.description
    });
    qaStep(5);
    return { phase: game.phase, lastDamage: game.lastDamage, text: document.querySelector('.result-cause')?.textContent };
  });
  assert.equal(cause.phase, 'lost');
  assert.equal(cause.lastDamage.kind, 'environment');
  assert.equal(cause.lastDamage.healthLost, 5);
  assert.ok(cause.text.includes(cause.lastDamage.name) && cause.text.includes(cause.lastDamage.hint));
  return cause;
}
