'use strict';
// Native-frame browser checks. Install Playwright separately; no game dependency.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'reports', 'combat-notices');
fs.mkdirSync(output, { recursive: true });
const simulation = fs.readFileSync(path.join(root, 'scripts/simulate-expedition.js'), 'utf8');
const botSource = simulation.slice(simulation.indexOf('function seededRandom('), simulation.indexOf('\nfunction simulate('));
const files = Object.fromEntries(['index.html', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js', 'expedition.css'].map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const results = [], errors = [];

function hook() {
  const qa = window.noticeQA = { mode: 'idle', bot: new Explorer(), arrived: false, overdrive: false };
  const Game = Expedition.Game, Renderer = ExpeditionRenderer;
  Expedition.Game = class extends Game {
    constructor(...args) { super({ ...args[0], random: seededRandom(101) }); qa.game = this; }
    update(dt, input) {
      if (qa.mode === 'contract') {
        const move = qa.bot.move(this, this.contracts[0], this.enemies);
        input = { ...input, moveX: move.x, moveY: move.y };
      } else if (qa.mode === 'combat') input = qa.bot.input(this);
      return super.update(dt, input);
    }
    drainEvents() { const events = super.drainEvents(); if (events.some(event => event.type === 'overdrive-start')) qa.overdrive = true; return events; }
  };
  window.ExpeditionRenderer = class extends Renderer { constructor(...args) { super(...args); qa.renderer = this; } };
  const watch = () => {
    const game = qa.game;
    if (qa.mode === 'contract' && game) {
      const state = game.interactionState();
      if (state.action && state.target?.id === game.contracts[0].id) {
        document.getElementById('touch-interact').click();
        if (game.contracts[0].status === 'active') { qa.mode = 'idle'; qa.arrived = true; }
      }
    }
    if (qa.mode === 'combat' && game?.phase === 'upgrade') qa.bot.chooseUpgrade({ player: game.player, upgradeChoices: game.upgradeChoices,
      chooseUpgrade(id) { document.querySelector('[data-upgrade="' + id + '"]')?.click(); } });
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
}

function measure() {
  const { game, renderer } = noticeQA, canvas = renderer.canvas.getBoundingClientRect();
  const player = { x: canvas.left + renderer.width / 2 + renderer.shakeX + (game.player.x - renderer.camera.x) * renderer.scale,
    y: canvas.top + renderer.height / 2 + renderer.shakeY + (game.player.y - renderer.camera.y) * renderer.scale, radius: game.player.radius * renderer.scale };
  const box = selector => {
    const element = document.querySelector(selector), rect = element.getBoundingClientRect(), css = getComputedStyle(element);
    return { text: element.textContent, visible: css.display !== 'none' && Number(css.opacity) > 0,
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
      clipped: element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1 };
  };
  const notices = [box('#event-banner'), box('#notification'), box('#interaction-hint')], controls = box('.fullscreen-controls');
  for (const notice of notices) {
    const dx = player.x - Math.max(notice.left, Math.min(notice.right, player.x)), dy = player.y - Math.max(notice.top, Math.min(notice.bottom, player.y));
    notice.overlapsPlayer = notice.visible && Math.hypot(dx, dy) < player.radius;
    notice.overlapsControls = notice.visible && controls.visible && notice.left < controls.right && notice.right > controls.left && notice.top < controls.bottom && notice.bottom > controls.top;
  }
  return { map: game.map.id, elapsed: game.elapsed, fullscreen: !!document.fullscreenElement, player, notices, controls, briefing: game.map.briefing };
}

async function checkCase(browser, viewport, fullscreen, map) {
  const key = viewport.width + 'x' + viewport.height + '-' + (fullscreen ? 'full' : 'normal') + '-' + map;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage(); page.on('pageerror', error => errors.push({ key, error: error.message }));
  try {
    await page.route('http://127.0.0.1:4177/**', route => {
      const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if (!Object.hasOwn(files, file)) return route.fulfill({ status: 404, body: '' });
      let body = files[file];
      if (file === 'index.html') body = body.replace('<script src="action.js">', '<script>(()=>{const options={mode:"explore",build:"reactor"};const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);' + botSource + '\n(' + hook.toString() + ')();})();</script><script src="action.js">');
      return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body });
    });
    await page.goto('http://127.0.0.1:4177/'); await page.locator('[data-map="' + map + '"]').click();
    if (fullscreen) { await page.locator('#fullscreen-toggle').click(); await page.waitForFunction(() => !!document.fullscreenElement); }
    await page.locator('#start-run').click(); await page.waitForTimeout(150);
    const capture = async scenario => {
      const value = { key, scenario, ...await page.evaluate(measure) }; results.push(value);
      for (const notice of value.notices) if (notice.visible) {
        assert.equal(notice.overlapsPlayer, false, key + ' ' + scenario + ' hides the player');
        assert.equal(notice.overlapsControls, false, key + ' ' + scenario + ' hides fullscreen controls');
        assert.equal(notice.clipped, false, key + ' ' + scenario + ' clips the notice text');
      }
      await page.screenshot({ path: path.join(output, key + '-' + scenario + '.png') });
      return value;
    };
    const start = await capture('start'); assert.equal(start.notices[1].text, start.briefing);
    if (map === 'frontier') {
      await page.evaluate(() => noticeQA.mode = 'contract');
      await page.waitForFunction(() => noticeQA.arrived, {}, { timeout: 30000 }); await page.waitForTimeout(150);
      const contract = await capture('contract'); assert.match(contract.notices[0].text, /支线已接取/); assert.match(contract.notices[1].text, /回收三枚/);
      await page.evaluate(() => noticeQA.mode = 'combat');
      await page.waitForFunction(() => noticeQA.overdrive, {}, { timeout: 90000 }); await page.waitForTimeout(100);
      const overdrive = await capture('overdrive'); assert.match(overdrive.notices[0].text, /星核暴走/); assert.equal(overdrive.notices[1].visible, false);
    }
    console.log('PASS ' + key);
  } catch (error) { errors.push({ key, error: error.stack || String(error) }); console.error('FAIL ' + key + ' ' + error.message); }
  finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const cases = [];
    for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) for (const fullscreen of [false, true]) for (const map of ['frontier', 'foundry', 'frost']) cases.push(checkCase(browser, viewport, fullscreen, map));
    await Promise.all(cases);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ method: 'Native rAF, real menu and fullscreen, public movement/interaction and natural combat charge; no state resets or text truncation.', results, errors }, null, 2));
  }
  assert.deepEqual(errors, []); console.log('Combat notice checks passed: ' + results.length);
})().catch(error => { console.error(error); process.exitCode = 1; });
