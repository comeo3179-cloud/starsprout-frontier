/* Real Chromium multi-touch input acceptance; no DOM-dispatched pointer events. */
// node scripts/check-touch-actions.cjs [--release | --online]
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; ({ chromium } = require('../build-tools/browser/node_modules/playwright')); }
const root = path.resolve(__dirname, '..');
const online = process.argv.includes('--online');
const mode = online ? 'online' : process.argv.includes('--release') ? 'release' : 'source';
const folder = mode !== 'source' ? path.join(root, 'release/web') : root;
const origin = online ? 'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com' : 'http://127.0.0.1:4178';
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const caseFilter = process.argv.includes('--case') ? process.argv[process.argv.indexOf('--case') + 1] : '';
const output = path.join(root, 'reports', `touch-actions-${mode}-${version}${caseFilter ? '-' + caseFilter : ''}.json`);
const files = new Map();
const report = { timestamp: new Date().toISOString(), mode, expectedVersion: version, files: {}, cases: [], errors: [],
  note: 'Headless Edge mobile emulation. CDP Input.dispatchTouchEvent supplies actual simultaneous contacts; DOM event dispatch is not used. Isolated storage and a cleared combat fixture; engine methods retain their original behavior. Online mode loads the actual hosted page without routing or fulfillment, uses no account, and verifies the five final manifest hashes. Local modes serve actual files and block external requests. This verifies browser input routing, not physical-device ergonomics.' };
function save() { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }

async function isolated(context) {
  if (!online) await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    const file = path.resolve(folder, name);
    if (!file.startsWith(folder + path.sep)) return route.abort();
    try {
      if (!files.has(name)) files.set(name, fs.readFileSync(file));
      const body = files.get(name);
      report.files[name] = crypto.createHash('sha256').update(body).digest('hex');
      await route.fulfill({ body, contentType: ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(name)] || 'application/octet-stream' });
    } catch { await route.fulfill({ status: name === 'favicon.ico' ? 204 : 404, body: '' }); }
  });
  await context.addInitScript(() => {
    const audit = window.__touchAudit = { events: [], input: {}, pointerEvents: [], updates: 0 };
    let api;
    Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
      api = value;
      api.Game = new Proxy(api.Game, { construct(target, args, next) {
        const game = Reflect.construct(target, args, next); audit.game = game;
        const update = game.update, drain = game.drainEvents;
        game.update = function(dt, input) {
          const result = update.call(this, dt, input);
          audit.input = { ...input }; audit.updates++;
          return result;
        };
        game.drainEvents = function(...args) {
          const events = drain.apply(this, args);
          audit.events.push(...events.map(event => ({ type: event.type, weapon: event.weapon, tacticId: event.tacticId, stage: event.stage })));
          return events;
        };
        return game;
      } });
    } });
    for (const type of ['pointerdown','pointerup','pointercancel','click']) document.addEventListener(type, event => {
      const target = event.target.closest('button') || event.target.closest('[id]');
      audit.pointerEvents.push({ type, id: event.pointerId, pointerType: event.pointerType,
        isPrimary: event.isPrimary, target: target?.id || (target?.dataset.weapon !== undefined ? 'weapon-' + target.dataset.weapon : target?.tagName) });
    }, { capture: true });
    localStorage.setItem('frontier-sound', 'off');
  });
}

async function state(page) {
  return page.evaluate(() => {
    const audit = __touchAudit, game = audit.game, p = game.player;
    return { x: p.x, y: p.y, elapsed: game.elapsed, weapon: p.weapon, ammo: p.ammo,
      reloadTimer: p.reloadTimer, reloadProgress: p.reloadProgress, reloadResult: p.reloadResult,
      reloadAttempted: p.reloadAttempted, reloadByWeapon: [...game.reloadByWeapon],
      skillCooldown: p.skillCooldown, tacticId: game.tacticId, tactical: structuredClone(game.tactical), input: audit.input, updates: audit.updates,
      moveKnob: document.querySelector('#move-stick i').style.transform,
      aimKnob: document.querySelector('#aim-stick i').style.transform,
      events: audit.events.map(event => ({ ...event })) };
  });
}

async function point(page, selector, id, xOffset = 0) {
  return page.locator(selector).evaluate((element, options) => {
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2 + options.xOffset, y = rect.y + rect.height / 2;
    if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) throw new Error('Control is outside the viewport: ' + options.selector);
    const hit = document.elementFromPoint(x, y);
    if (hit !== element && !element.contains(hit)) throw new Error('Control is obscured: ' + options.selector);
    if (element.disabled) throw new Error('Control is disabled: ' + options.selector);
    return { x, y, id: options.id, radiusX: 5, radiusY: 5, force: 1 };
  }, { selector, id, xOffset });
}

async function exercise(browser, name, viewport) {
  if (caseFilter && name !== caseFilter) return;
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  let page;
  const record = { name, viewport, checks: [] };
  try {
    await isolated(context); page = await context.newPage(); page.setDefaultTimeout(7000);
    record.navigations = [];
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) record.navigations.push(frame.url()); });
    page.on('pageerror', error => report.errors.push({ case: name, message: error.message }));
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    if (online && await page.locator('#submitBtn').count()) {
      assert.match(await page.locator('body').innerText(), /测试域名/);
      await page.screenshot({ path: path.join(root, 'reports', `touch-actions-${mode}-${version}-${name}-domain-notice.png`) });
      // Click the actual CloudBase consent button after its own countdown;
      // no cookie injection or replacement page bypasses the notice.
      await page.locator('#submitBtn').click({ timeout: 15000 });
      record.domainNoticeAcknowledged = true;
    }
    await page.waitForFunction(() => window.__touchAudit?.game);
    assert.ok((await page.locator('.screen-kicker').innerText()).includes(version));
    const displayLabel = await page.locator('#display-mode-button').innerText();
    assert.match(displayLabel, viewport.width < viewport.height ? /横屏游玩/ : /全屏游玩/);
    await point(page, '#display-mode-button', 99);
    await page.locator('#display-mode-button').tap();
    await page.waitForFunction(() => !!document.fullscreenElement || document.getElementById('game-stage').classList.contains('immersive'));
    record.checks.push({ name: 'current-version-and-landscape-entry', version, displayLabel });
    await page.locator('#start-run').tap();
    await page.evaluate(() => {
      const game = __touchAudit.game;
      game.player.x = 600; game.player.y = 1000;
      game.enemies = []; game.bullets = []; game.obstacles = []; game.hazards = []; game.pickups = [];
      game.spawnTimer = 999;
      game.ammoByWeapon[0]--; game.ammoByWeapon[1]--; game._syncWeapon();
      __touchAudit.events = []; __touchAudit.pointerEvents = [];
    });
    await page.waitForFunction(() => !document.getElementById('reload-button').disabled);
    const cdp = await context.newCDPSession(page), contacts = new Map();
    let nextId = 10;
    const start = async contact => { contacts.set(contact.id, contact); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...contacts.values()] }); };
    const end = async id => {
      const released = contacts.get(id); contacts.delete(id);
      // Chromium treats supplied touchEnd IDs as the changed/released contacts.
      // An empty list ends every contact, which would invalidate this regression.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [released] });
    };
    const tap = async selector => {
      const contact = await point(page, selector, nextId++);
      await start(contact); await page.waitForTimeout(35); await end(contact.id);
      await page.waitForTimeout(45);
    };
    const weaponBar = await page.locator('.weapons-hud').evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollLeft: element.scrollLeft }));
    if (weaponBar.scrollWidth > weaponBar.clientWidth + 1) {
      async function swipeBar(direction) {
        const box = await page.locator('.weapons-hud').boundingBox();
        // Start the reverse drag inside the bar. A gesture from the screen's
        // left edge invokes Chromium history navigation even with containment.
        const from = direction > 0 ? box.x + box.width - 18 : box.x + 44;
        const to = direction > 0 ? box.x + 44 : box.x + box.width - 18;
        const contact = { id: nextId++, x: from, y: box.y + box.height / 2, radiusX: 5, radiusY: 5, force: 1 };
        await start(contact);
        for (let step = 1; step <= 6; step++) {
          contact.x = from + (to - from) * step / 6; contacts.set(contact.id, { ...contact });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...contacts.values()] });
          await page.waitForTimeout(30);
        }
        await end(contact.id); await page.waitForTimeout(100);
        return page.locator('.weapons-hud').evaluate(element => element.scrollLeft);
      }
      const right = await swipeBar(1); assert.ok(right > weaponBar.scrollLeft + 4, 'A real horizontal swipe must reach the sixth weapon');
      await tap('[data-weapon="5"]'); assert.equal((await state(page)).weapon, 5);
      const left = await swipeBar(-1); assert.ok(left < right - 4, 'A real reverse swipe must return to the first weapon');
      await tap('[data-weapon="0"]'); assert.equal((await state(page)).weapon, 0);
      record.checks.push({ name: 'narrow-portrait-native-weapon-bar-pan-both-directions', weaponBar, right, left });
      await page.evaluate(() => { __touchAudit.events = []; __touchAudit.pointerEvents = []; });
    }
    const move = await point(page, '#move-stick', 1, 28), aim = await point(page, '#aim-stick', 2, 28);
    const before = await state(page); await start(move); await page.waitForTimeout(130);
    let current = await state(page);
    assert.ok(current.x > before.x + 5); assert.ok(current.input.moveX > .5);

    await tap('#reload-button'); current = await state(page);
    assert.ok(current.reloadTimer > 0); assert.equal(current.reloadAttempted, false);
    assert.ok(current.x > before.x + 15); assert.ok(current.input.moveX > .5);
    assert.equal(current.events.filter(event => event.type === 'reload').length, 1);
    assert.equal(current.events.filter(event => event.type === 'reload-miss').length, 0);
    record.checks.push({ name: 'secondary-finger-reload-while-moving', state: current });

    const oldReload = current.reloadByWeapon[0], oldX = current.x;
    await tap('[data-weapon="1"]'); current = await state(page);
    assert.equal(current.weapon, 1); assert.ok(current.x > oldX);
    assert.ok(current.reloadByWeapon[0] > 0 && current.reloadByWeapon[0] < oldReload);
    assert.ok(current.input.moveX > .5);
    record.checks.push({ name: 'secondary-finger-switch-keeps-background-reload', state: current });

    await page.waitForFunction(() => !document.getElementById('reload-button').disabled);
    await tap('#reload-button');
    const reloadPoint = await point(page, '#reload-button', nextId++);
    await page.waitForFunction(() => {
      const p = __touchAudit.game.player;
      return p.reloadProgress >= p.reloadWindowStart + .025 && p.reloadProgress < p.reloadWindowEnd - .045;
    });
    await start(reloadPoint); await page.waitForTimeout(25); await end(reloadPoint.id);
    await page.waitForTimeout(45); current = await state(page);
    assert.equal(current.reloadResult, 'perfect');
    assert.equal(current.events.filter(event => event.type === 'reload-perfect').length, 1);
    assert.equal(current.events.filter(event => event.type === 'reload-miss').length, 0);
    assert.ok(current.input.moveX > .5);
    record.checks.push({ name: 'precision-reload-without-lifting-moving-finger', state: current });

    const beforeSkill = current.x;
    await tap('#skill-button'); current = await state(page);
    assert.ok(current.skillCooldown > 0); assert.ok(current.x > beforeSkill);
    assert.ok(current.input.moveX > .5);
    assert.equal(current.events.filter(event => event.type === 'pulse').length, 1);
    record.checks.push({ name: 'secondary-finger-skill-while-moving', state: current });

    await start(aim); await page.waitForTimeout(200); current = await state(page);
    assert.equal(current.input.shoot, true); assert.ok(current.input.moveX > .5);
    const beforeThird = current.x;
    await tap('[data-weapon="2"]');
    // Weapon switching preserves the previous shot cooldown; wait for the
    // real next shot instead of assuming that every gun fires after 160 ms.
    await page.waitForFunction(() => __touchAudit.events.some(event => event.type === 'shot' && event.weapon === 2));
    current = await state(page);
    assert.equal(current.weapon, 2); assert.ok(current.x > beforeThird);
    assert.equal(current.input.shoot, true); assert.ok(current.input.moveX > .5);
    assert.ok(current.moveKnob); assert.ok(current.aimKnob);
    assert.ok(current.events.some(event => event.type === 'shot' && event.weapon === 2));
    record.checks.push({ name: 'third-finger-switch-with-both-sticks-held', state: current });

    if (await page.locator('[data-weapon="5"]').count()) {
      const beforeSixth = current.x;
      const scrollY = await page.evaluate(() => window.scrollY);
      await page.locator('[data-weapon="5"]').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => window.scrollY), scrollY, 'Reaching a gun slot must not scroll the game page');
      await tap('[data-weapon="5"]');
      await page.waitForFunction(() => __touchAudit.events.some(event => event.type === 'shot' && event.weapon === 5));
      current = await state(page);
      assert.equal(current.weapon, 5); assert.ok(current.x > beforeSixth);
      assert.ok(current.input.moveX > .5 && current.input.shoot);
      assert.ok(current.events.some(event => event.type === 'shot' && event.weapon === 5));
      record.checks.push({ name: 'sixth-weapon-fires-with-both-sticks-held', state: current });

      await page.waitForFunction(() => !document.getElementById('reload-button').disabled);
      await tap('#reload-button'); current = await state(page);
      assert.ok(current.reloadTimer > 0 && current.input.moveX > .5 && current.input.shoot);
      const sixthReload = current.reloadByWeapon[5], beforeLeavingSixth = current.x;
      await page.locator('[data-weapon="0"]').scrollIntoViewIfNeeded();
      await tap('[data-weapon="0"]'); current = await state(page);
      assert.equal(current.weapon, 0); assert.ok(current.x > beforeLeavingSixth);
      assert.ok(current.reloadByWeapon[5] > 0 && current.reloadByWeapon[5] < sixthReload);
      assert.ok(current.input.moveX > .5 && current.input.shoot);
      record.checks.push({ name: 'sixth-weapon-reloads-in-background-after-third-finger-switch', state: current });
    }

    await end(move.id); await page.waitForTimeout(50);
    const onlyAim = await state(page); await page.waitForTimeout(140); current = await state(page);
    assert.equal(current.input.moveX, 0); assert.equal(current.input.shoot, true);
    assert.ok(Math.abs(current.x - onlyAim.x) < .001); assert.equal(current.moveKnob, ''); assert.ok(current.aimKnob);
    record.checks.push({ name: 'releasing-left-stick-does-not-release-aim', state: current });
    await end(aim.id); await page.waitForTimeout(55);
    const released = await state(page); await page.waitForTimeout(180); current = await state(page);
    assert.equal(current.input.moveX, 0); assert.equal(current.input.shoot, false);
    assert.equal(current.aimKnob, ''); assert.ok(Math.abs(current.x - released.x) < .001);
    assert.equal(current.events.filter(event => event.type === 'shot').length, released.events.filter(event => event.type === 'shot').length);
    record.checks.push({ name: 'all-contacts-released-no-ghost-motion-or-fire', state: current });

    await start(move); await start(aim); await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); contacts.clear();
    await page.waitForTimeout(65); current = await state(page);
    assert.equal(current.input.moveX, 0); assert.equal(current.input.shoot, false);
    assert.equal(current.moveKnob, ''); assert.equal(current.aimKnob, '');
    const canceledX = current.x;
    await start(move); await page.waitForTimeout(90); await end(move.id); current = await state(page);
    assert.ok(current.x > canceledX);
    record.checks.push({ name: 'browser-touch-cancel-clears-both-sticks-and-allows-fresh-contact', state: current });

    // Prepared module states isolate routing; deployment still uses real
    // secondary touch contacts and the unchanged engine actions.
    await page.evaluate(() => {
      const g = __touchAudit.game;
      g.tacticId = 'decoy-dash'; g.tactical.cooldown = 0; g.player.dashCooldown = 0;
    });
    await page.waitForFunction(() => !document.getElementById('dash-button').disabled);
    await start(move); const beforeDecoy = await state(page);
    await tap('#dash-button'); current = await state(page);
    assert.ok(current.x > beforeDecoy.x && current.input.moveX > .5);
    assert.ok(current.tactical.decoy && current.tactical.cooldown > 0);
    assert.equal(current.events.filter(event => event.type === 'tactic-trigger' && event.tacticId === 'decoy-dash').length, 1);
    record.checks.push({ name: 'decoy-dash-deploys-once-while-movement-contact-stays-held', state: current });

    await tap('[data-weapon="0"]');
    await page.evaluate(() => {
      const g = __touchAudit.game;
      g.tacticId = 'reload-mine'; g.tactical.cooldown = 0; g.tactical.decoy = null;
      g.ammoByWeapon[0] = 10; g.reloadByWeapon[0] = 0; g._syncWeapon();
    });
    await page.waitForFunction(() => !document.getElementById('reload-button').disabled);
    await tap('#reload-button');
    await page.waitForFunction(() => {
      const p = __touchAudit.game.player;
      return p.reloadProgress >= p.reloadWindowStart + .025 && p.reloadProgress < p.reloadWindowEnd - .045;
    });
    const beforeMine = await state(page);
    await tap('#reload-button'); current = await state(page);
    assert.equal(current.reloadResult, 'perfect');
    assert.ok(current.x > beforeMine.x && current.input.moveX > .5);
    assert.ok(current.tactical.mine && current.tactical.cooldown > 0);
    assert.equal(current.events.filter(event => event.type === 'tactic-trigger' && event.tacticId === 'reload-mine').length, 1);
    record.checks.push({ name: 'precision-mine-deploys-once-while-movement-contact-stays-held', state: current });

    await page.evaluate(() => {
      const g = __touchAudit.game;
      g.tacticId = 'gravity-pulse'; g.tactical.mine = null; g.player.skillCooldown = 0;
      const enemy = g.spawnEnemy('crawler', { x: g.player.x + 160, y: g.player.y }); enemy.hp = 300;
    });
    await page.waitForFunction(() => !document.getElementById('skill-button').disabled);
    const beforeGravity = await state(page);
    await tap('#skill-button'); current = await state(page);
    assert.ok(current.x > beforeGravity.x && current.input.moveX > .5);
    assert.ok(current.skillCooldown > 0);
    assert.equal(current.events.filter(event => event.type === 'tactic-trigger' && event.tacticId === 'gravity-pulse').length, 1);
    await end(move.id);
    record.checks.push({ name: 'gravity-pulse-triggers-once-while-movement-contact-stays-held', state: current });

    record.pointerEvents = await page.evaluate(() => __touchAudit.pointerEvents);
    const nonPrimaryActions = record.pointerEvents.filter(event => event.type === 'pointerdown' && event.pointerType === 'touch' && event.isPrimary === false &&
      ['reload-button', 'skill-button', 'weapon-1', 'weapon-2', 'weapon-5'].includes(event.target));
    assert.ok(nonPrimaryActions.some(event => event.target === 'reload-button'));
    assert.ok(nonPrimaryActions.some(event => event.target === 'skill-button'));
    assert.ok(nonPrimaryActions.some(event => event.target === 'weapon-2'));
    if (await page.locator('[data-weapon="5"]').count()) assert.ok(nonPrimaryActions.some(event => event.target === 'weapon-5'));
    record.nonPrimaryActionPresses = nonPrimaryActions.length;
    await page.screenshot({ path: path.join(root, 'reports', `touch-actions-${mode}-${version}-${name}.png`) });
    record.pass = true; console.log('PASS ' + name + ': ' + record.checks.length + ' real multi-touch checks');
  } catch (error) {
    record.pass = false; record.error = error.stack;
    if (page) {
      record.failureUrl = page.url();
      record.failureState = await state(page).catch(() => null);
      record.pointerEvents = await page.evaluate(() => window.__touchAudit?.pointerEvents).catch(() => []);
      await page.screenshot({ path: path.join(root, 'reports', `touch-actions-${mode}-${version}-${name}-failure.png`) }).catch(() => {});
    }
    console.error('FAIL ' + name + ': ' + error.message);
  } finally { report.cases.push(record); await context.close(); save(); }
}

(async () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  report.browser = browser.version();
  try {
    if (online) {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build-tools/web/build-report.json'), 'utf8'));
      assert.equal(manifest.files.length, 5, 'Check the entire five-file deployment manifest');
      const context = await browser.newContext();
      report.remoteFiles = [];
      try {
        for (const file of manifest.files) {
          assert.ok(/^(index\.html|assets\/game\.[a-f0-9]+\.(js|css)|vendor\/cloudbase\.(full\.js|LICENSE\.txt))$/.test(file.file));
          const response = await context.request.get(origin + '/' + file.file, { headers: { 'Cache-Control': 'no-cache' } });
          assert.equal(response.status(), 200, 'Hosted build file must be available: ' + file.file);
          const body = await response.body(), sha256 = crypto.createHash('sha256').update(body).digest('hex');
          assert.equal(sha256, file.sha256, 'Hosted bytes must match the final manifest: ' + file.file);
          report.remoteFiles.push({ file: file.file, bytes: body.length, sha256 });
        }
      } finally { await context.close(); save(); }
    }
    await exercise(browser, 'portrait', { width: 390, height: 844 });
    await exercise(browser, 'narrow-portrait', { width: 360, height: 640 });
    await exercise(browser, 'landscape', { width: 844, height: 390 });
  } finally { await browser.close(); save(); }
  const pass = report.cases.every(item => item.pass) && report.errors.length === 0;
  console.log(JSON.stringify({ mode, pass, checks: report.cases.reduce((sum, item) => sum + item.checks.length, 0), errors: report.errors, report: output }));
  if (!pass) process.exitCode = 1;
})().catch(error => { report.errors.push({ message: error.message }); save(); console.error(error.message); process.exitCode = 1; });
