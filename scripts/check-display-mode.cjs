'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const release = process.argv.includes('--release');
const unitOnly = process.argv.includes('--unit-only');
const label = release ? 'release' : 'source';
const source = fs.readFileSync(path.join(root, 'display-mode.js'), 'utf8');
const report = { checkedAt: new Date().toISOString(), mode: label, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), transitions: [], browser: [], files: {}, errors: [], limitations: 'Edge mobile emulation is not a physical iPhone or Android device. Missing/denied browser APIs are controlled fixtures; native fullscreen, pointer input, DOM hit tests and viewport changes run in the actual browser. No cloud accounts or user browser profiles are used.' };
const classList = () => { const values = new Set(); return { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name) }; };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture(options = {}) {
  const calls = [], document = new EventTarget(), orientation = new EventTarget();
  document.body = { classList: classList() }; document.fullscreenElement = null;
  orientation.matches = true;
  const stage = { classList: classList() };
  const native = value => { document.fullscreenElement = value ? stage : null; document.dispatchEvent(new Event('fullscreenchange')); };
  if (!options.noFullscreen) stage.requestFullscreen = () => {
    calls.push('requestFullscreen');
    if (options.fullscreenReject) return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
    if (options.fullscreenPending) return options.fullscreenPending.promise.then(() => native(true));
    native(true); return Promise.resolve();
  };
  document.exitFullscreen = async () => { calls.push('exitFullscreen'); if (options.exitReject) throw new Error('Denied'); native(false); };
  const screen = {};
  if (!options.noOrientation) screen.orientation = {
    lock: value => { calls.push('lock:' + value + ':' + (document.fullscreenElement === stage)); return options.lockPending?.promise || (options.lockReject ? Promise.reject(new DOMException('Unavailable', 'NotSupportedError')) : Promise.resolve()); },
    unlock: () => { calls.push('unlock'); if (options.unlockThrows) throw new Error('Unavailable'); }
  };
  const sandbox = { document, screen, matchMedia: () => orientation };
  sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const display = new sandbox.FrontierDisplay({ stage, onBeforeChange: () => calls.push('before'), onChange: () => calls.push('change') });
  return { display, stage, document, calls, native, orientation };
}
async function test(name, action) {
  try { await action(); report.transitions.push({ name, passed: true }); }
  catch (error) { report.transitions.push({ name, passed: false, error: error.message }); throw error; }
}
async function transitions() {
  await test('Fullscreen request stays synchronous in the user action; lock follows native entry', async () => {
    const f = fixture(), pending = f.display.enter();
    assert.equal(f.calls[1], 'requestFullscreen'); await pending;
    assert.ok(f.calls.includes('lock:landscape:true')); assert.equal(f.display.native, true); assert.equal(f.display.fallback, false);
    await f.display.exit(); assert.equal(f.display.active, false); assert.equal(f.display.busy, false);
  });
  await test('Missing fullscreen and orientation APIs use reversible immersive classes', async () => {
    const f = fixture({ noFullscreen: true, noOrientation: true });
    await f.display.enter(); assert.equal(f.display.fallback, true); assert.ok(f.document.body.classList.contains('immersive-page'));
    await f.display.exit(); assert.equal(f.display.active, false); assert.equal(f.document.body.classList.contains('immersive-page'), false);
  });
  await test('Fullscreen denial and orientation denial both preserve playable fallback', async () => {
    const f = fixture({ fullscreenReject: true, lockReject: true });
    await f.display.enter(); assert.equal(f.display.native, false); assert.equal(f.display.fallback, true); assert.equal(f.display.busy, false);
  });
  await test('A denied lock keeps successful native fullscreen and reports actual portrait state', async () => {
    const f = fixture({ lockReject: true });
    await f.display.enter(); assert.equal(f.display.native, true); assert.equal(f.display.portrait, true); assert.equal(f.display.fallback, false);
  });
  await test('Desktop-style entry never requests an orientation lock', async () => {
    const f = fixture(); await f.display.enter({ landscape: false });
    assert.equal(f.calls.some(value => value.startsWith('lock:')), false);
  });
  await test('Repeated entry does not create parallel fullscreen requests', async () => {
    const fullscreenPending = deferred(), f = fixture({ fullscreenPending });
    const first = f.display.enter(), second = f.display.enter(); assert.equal(first, second); assert.equal(f.display.busy, true);
    fullscreenPending.resolve(); await first; assert.equal(f.calls.filter(value => value === 'requestFullscreen').length, 1);
  });
  await test('Exit cancels pending fullscreen and closes a late successful request', async () => {
    const fullscreenPending = deferred(), f = fixture({ fullscreenPending });
    const pending = f.display.enter(); await f.display.exit();
    const duplicate = f.display.enter(); assert.equal(duplicate, pending);
    fullscreenPending.resolve(); await pending;
    assert.equal(f.display.active, false); assert.equal(f.display.busy, false);
    assert.equal(f.calls.filter(value => value === 'requestFullscreen').length, 1);
    assert.equal(f.calls.filter(value => value === 'exitFullscreen').length, 1);
    assert.equal(f.calls.some(value => value.startsWith('lock:')), false);
  });
  await test('Exit releases a pending lock again if its promise resolves late', async () => {
    const lockPending = deferred(), f = fixture({ lockPending });
    const pending = f.display.enter(); await Promise.resolve(); await f.display.exit();
    lockPending.resolve(); await pending;
    assert.equal(f.display.active, false); assert.ok(f.calls.filter(value => value === 'unlock').length >= 2);
  });
  await test('Browser-originated fullscreen exit releases orientation and input state', async () => {
    const f = fixture(); await f.display.enter(); const before = f.calls.filter(value => value === 'before').length;
    f.native(false); assert.equal(f.display.active, false); assert.equal(f.calls.filter(value => value === 'before').length, before + 1); assert.ok(f.calls.includes('unlock'));
  });
  await test('Physical orientation media changes clear input and notify layout without rotating canvas', async () => {
    const f = fixture(); f.orientation.matches = false; f.orientation.dispatchEvent(new Event('change'));
    assert.equal(f.display.portrait, false); assert.deepEqual(f.calls, ['before', 'change']);
  });
  await test('Unavailable unlock cannot prevent fallback exit', async () => {
    const f = fixture({ noFullscreen: true, lockReject: true, unlockThrows: true });
    await f.display.enter(); await f.display.exit(); assert.equal(f.display.active, false);
  });
  await test('Rejected native exit preserves honest active state and remains retryable', async () => {
    const f = fixture({ exitReject: true }); await f.display.enter(); await f.display.exit();
    assert.equal(f.display.native, true); assert.equal(f.display.busy, false);
  });
}
async function browserTests() {
  const { chromium } = require('../build-tools/browser/node_modules/playwright');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const served = new Map(), origin = 'http://127.0.0.1:4176', sourceRoot = release ? path.join(root, 'release/web') : root;
  report.browserVersion = browser.version();
  async function hit(page, selector) {
    const target = page.locator(selector); await target.scrollIntoViewIfNeeded();
    const result = await target.evaluate(element => {
      const r = element.getBoundingClientRect();
      const found = [[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]].map(([x,y]) => document.elementFromPoint(r.x+r.width*x,r.y+r.height*y));
      return { selector: element.id, x:r.x, y:r.y, width: r.width, height: r.height,
        hits: found.map(target => target === element || element.contains(target)), obscurers:found.map(target => target && (target.id || target.className || target.tagName)) };
    });
    assert.ok(result.width >= 44 && result.height >= 44, selector + ' has a small touch target');
    assert.ok(result.hits.every(Boolean), selector + ' is obscured: ' + JSON.stringify(result));
    return result;
  }
  try {
    for (const [width, height, capability] of [[360,640,'missing'],[390,844,'native'],[667,375,'denied'],[844,390,'native'],[1440,900,'desktop']]) {
      const record = { width, height, capability, passed: false, checks: [] }; report.browser.push(record);
      const context = await browser.newContext({ viewport: { width, height }, isMobile: capability !== 'desktop', hasTouch: capability !== 'desktop', deviceScaleFactor: 1 });
      const errors = [];
      try {
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin || url.pathname.includes('/vendor/')) return route.abort();
          const file = path.resolve(sourceRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
          if (!file.startsWith(sourceRoot + path.sep)) return route.abort();
          if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
          if (!served.has(file)) served.set(file, fs.readFileSync(file));
          const bytes = served.get(file); report.files[path.relative(sourceRoot,file)] = crypto.createHash('sha256').update(bytes).digest('hex');
          return route.fulfill({ body: bytes, contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
        });
        await context.addInitScript(capability => {
          if (capability === 'missing') {
            Element.prototype.requestFullscreen = undefined;
            Object.defineProperty(screen.orientation, 'lock', { configurable: true, value: undefined });
          } else if (capability === 'denied') {
            Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Blocked for test', 'NotAllowedError'));
            Object.defineProperty(screen.orientation, 'lock', { configurable: true, value: () => Promise.reject(new DOMException('Unsupported for test', 'NotSupportedError')) });
          }
          let display, expedition;
          Object.defineProperty(window,'FrontierDisplay',{configurable:true,get:()=>display,set(value){display=new Proxy(value,{construct(target,args,next){const instance=Reflect.construct(target,args,next);window.__displayMode=instance;return instance}})}});
          Object.defineProperty(window,'Expedition',{configurable:true,get:()=>expedition,set(value){expedition=value;value.Game=new Proxy(value.Game,{construct(target,args,next){const game=Reflect.construct(target,args,next);window.__displayGame=game;const update=game.update;game.update=function(dt,input){window.__displayInput={...input};return update.call(this,dt,input)};return game}})}});
        }, capability);
        const page = await context.newPage(); page.setDefaultTimeout(7000); page.on('pageerror',error=>errors.push(error.message));
        await page.goto(origin, {waitUntil:'domcontentloaded'});
        if (capability === 'desktop') {
          await page.locator('#start-run').waitFor();
          assert.equal(await page.locator('#display-mode-button').count(),0,'Fine-pointer menu must not insert a hidden focusable display entry');
          record.checks.push({name:'desktop-no-hidden-display-entry',passed:true});
          await page.locator('#start-run').click();
          const beforeX = await page.evaluate(() => __displayGame.player.x);
          await page.keyboard.down('d');
          await page.waitForFunction(x => __displayGame.player.x>x+2,beforeX);
          await page.keyboard.up('d');
          await page.keyboard.press('2');
          await page.waitForFunction(() => __displayGame.player.weapon===1);
          const world = await page.locator('#world').boundingBox();
          await page.mouse.move(world.x+world.width*.65,world.y+world.height*.5);
          await page.mouse.down(); await page.waitForFunction(() => __displayGame.player.ammo<7); await page.mouse.up();
          await page.keyboard.press('r');
          await page.waitForFunction(() => __displayGame.player.reloadTimer>0);
          record.checks.push({name:'desktop-keyboard-move-switch-mouse-fire-reload',passed:true});
          await page.locator('#fullscreen-toggle').click();
          await page.waitForFunction(() => __displayMode.native&&!__displayMode.busy);
          await page.locator('#resume-run').waitFor({state:'visible'});
          const elapsed = await page.evaluate(() => __displayGame.elapsed);
          await page.waitForTimeout(100); assert.equal(await page.evaluate(() => __displayGame.elapsed),elapsed);
          assert.equal(await page.locator('#display-mode-button').count(),0);
          record.checks.push({name:'desktop-native-entry-pauses',passed:true});
          await page.locator('#resume-run').click();
          await page.waitForFunction(t => __displayGame.elapsed>t,elapsed);
          await page.locator('#fullscreen-exit').click();
          await page.waitForFunction(() => !__displayMode.active&&!__displayMode.busy);
          await page.locator('#resume-run').waitFor({state:'visible'});
          const ended = await page.evaluate(() => __displayGame.elapsed);
          await page.waitForTimeout(100); assert.equal(await page.evaluate(() => __displayGame.elapsed),ended);
          record.checks.push({name:'desktop-native-exit-pauses',passed:true});
          await page.screenshot({path:path.join(root,'reports',`display-${label}-${width}x${height}-${capability}.png`)});
          assert.deepEqual(errors,[]); record.passed=true;
          continue;
        }
        record.checks.push({ name:'welcome-entry', ...(await hit(page,'#display-mode-button')) });
        assert.match(await page.locator('#display-mode-button').textContent(), width < height ? /横屏游玩/ : /全屏游玩/);
        await page.locator('#display-mode-button').tap();
        await page.waitForFunction(()=>__displayMode.active&&!__displayMode.busy);
        const state = await page.evaluate(()=>{const rect=document.getElementById('game-stage').getBoundingClientRect();return{native:__displayMode.native,fallback:__displayMode.fallback,portrait:__displayMode.portrait,transform:getComputedStyle(document.getElementById('world')).transform,stage:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},viewport:{width:innerWidth,height:innerHeight}}});
        assert.equal(state.native, capability==='native'); assert.equal(state.fallback,capability!=='native'); assert.equal(state.transform,'none');
        assert.ok(Math.abs(state.stage.x)<2&&Math.abs(state.stage.y)<2&&Math.abs(state.stage.width-state.viewport.width)<2&&Math.abs(state.stage.height-state.viewport.height)<2,'Immersive stage must fill the available viewport');
        if(width<height)assert.match(await page.locator('#display-mode-hint').textContent(),/横|旋转|竖屏/);
        record.checks.push({name:'entered-display',...state});
        record.checks.push({name:'exit-entry',...(await hit(page,'#display-mode-button'))});
        await page.locator('#open-account').tap();
        record.checks.push({name:'account-user',...(await hit(page,'#account-email'))});
        record.checks.push({name:'account-password',...(await hit(page,'#account-password'))});
        record.checks.push({name:'account-back',...(await hit(page,'#account-back'))});
        await page.locator('#account-back').tap();
        await page.locator('#start-run').tap();
        await page.waitForFunction(()=>__displayGame.phase==='playing');
        const stick = await page.locator('#move-stick').boundingBox();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x+stick.width/2+25,y:stick.y+stick.height/2,id:1}]});
        await page.waitForFunction(()=>Math.abs(__displayInput?.moveX||0)>.1);
        await page.setViewportSize({width:height,height:width});
        await page.locator('#resume-run').waitFor({state:'visible'});
        const elapsed = await page.evaluate(()=>__displayGame.elapsed);
        await page.waitForTimeout(150); assert.equal(await page.evaluate(()=>__displayGame.elapsed),elapsed);
        assert.equal(await page.locator('#move-stick i').evaluate(el=>el.style.transform),'');
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        record.checks.push({name:'rotation-pauses-and-clears-stick',elapsed});
        record.checks.push({name:'pause-display-entry',...(await hit(page,'#display-mode-button'))});
        await page.locator('#resume-run').tap();
        await page.waitForFunction(()=>__displayGame.elapsed>0&&__displayInput.moveX===0&&__displayInput.moveY===0&&!__displayInput.shoot);
        for(const selector of ['#move-stick','#aim-stick','#reload-button','#touch-interact','#field-map-toggle'])record.checks.push({name:'rotated-combat',...(await hit(page,selector))});
        await page.screenshot({path:path.join(root,'reports',`display-${label}-${width}x${height}-${capability}-combat-rotated.png`)});
        if (capability === 'native') {
          // A browser-originated exit reaches fullscreenchange without calling the controller's exit method.
          await page.evaluate(() => document.exitFullscreen());
          await page.locator('#resume-run').waitFor({state:'visible'});
          assert.equal(await page.evaluate(() => __displayMode.active), false);
          record.checks.push({name:'unexpected-native-exit-pauses',passed:true});
          await page.locator('#display-mode-button').tap();
          await page.waitForFunction(() => __displayMode.native && !__displayMode.busy);
          record.checks.push({name:'native-reentry-after-browser-exit',passed:true});
        } else await page.locator('#fullscreen-pause').tap();
        await page.locator('#display-mode-button').tap();
        await page.waitForFunction(()=>!__displayMode.active&&!__displayMode.busy);
        assert.equal(await page.evaluate(()=>document.body.classList.contains('immersive-page')),false);
        record.checks.push({name:'exit-restores-page',passed:true});
        await page.screenshot({path:path.join(root,'reports',`display-${label}-${width}x${height}-${capability}.png`)});
        assert.deepEqual(errors,[]); record.passed=true;
      } catch(error) {
        record.failure=error.message; record.errors=errors; report.errors.push(`${width}x${height} ${capability}: ${error.message}`);
        await context.pages()[0]?.screenshot({path:path.join(root,'reports',`display-${label}-${width}x${height}-${capability}-failure.png`)}).catch(()=>{});
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
async function main() {
  try { await transitions(); if(!unitOnly)await browserTests(); if(report.errors.length)process.exitCode=1; }
  catch (error) { report.errors.push(error.message); process.exitCode = 1; }
  finally {
    fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(root, `reports/display-mode-${label}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.transitions.filter(value => value.passed).length, total: report.transitions.length, browserPassed:report.browser.filter(value=>value.passed).length,browserTotal:report.browser.length,errors: report.errors }));
  }
}
main();
