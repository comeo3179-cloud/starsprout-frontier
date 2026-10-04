/* Hidden-technique browser acceptance. All fixtures use isolated browser storage and local response snapshots. */
'use strict';
// The 2.5.0 toast and numeric expectations below are retained only for --baseline.
// Current source/release acceptance lives in the central-proclamation suite.
if (!process.argv.includes('--baseline')) {
  console.log('Current secret-technique acceptance: check-awakening-ui.cjs; evidence: reports/awakening-ui-{source|release}.json. --ui-only skips mechanic damage/cap checks but retains proclamation, archive, storage and trial UI checks.');
  require('./check-awakening-ui.cjs');
} else {
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; ({ chromium } = require('../build-tools/browser/node_modules/playwright')); }
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4176';
const baseline = process.argv.includes('--baseline');
const release = process.argv.includes('--release');
const mode = baseline ? 'baseline' : release ? 'release' : 'source';
const reportFile = path.join(root, 'reports', `secret-techniques-${mode}.json`);
const frozen = baseline ? JSON.parse(fs.readFileSync(path.join(root, 'reports/secret-techniques-before-snapshot.json'), 'utf8')) : null;
const folder = release ? path.join(root, 'release/web') : root;
const snapshot = new Map();
const report = { timestamp: new Date().toISOString(), mode, note: 'Controlled browser fixtures verify causal mechanics and UI. Player actions use the public input/action surface; fixture placement is not a normal-play balance test. No user browser or persisted profile is opened.', files: {}, checks: [], errors: [] };
function save() { fs.mkdirSync(path.dirname(reportFile), { recursive: true }); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2)); }
async function isolated(context) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    const file = path.resolve(folder, name);
    if (!file.startsWith(folder + path.sep)) return route.abort();
    try {
      if (!snapshot.has(name)) snapshot.set(name, baseline ? frozen.files[name].body : fs.readFileSync(file, 'utf8'));
      const body = snapshot.get(name);
      report.files[name] = crypto.createHash('sha256').update(body).digest('hex');
      await route.fulfill({ body, contentType: name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
    } catch { await route.fulfill({ status: name === 'favicon.ico' ? 204 : 404, body: '' }); }
  });
  await context.addInitScript(() => {
    const audit = window.__secretAudit = { events: [], trace: [], traceEnabled: false };
    let api, renderer;
    Object.defineProperty(window, 'Expedition', { configurable: true, get: () => api, set(value) {
      api = value;
      api.Game = new Proxy(api.Game, { construct(target, args, next) {
        const game = Reflect.construct(target, args, next);
        audit.game = game;
        const update = game.update, drain = game.drainEvents;
        game.update = function(...values) {
          const result = update.apply(this, values);
          if (audit.traceEnabled) audit.trace.push({ at: this.elapsed, bullets: this.bullets.map(b => ({ id:b.id,kind:b.kind,x:b.x,y:b.y,age:b.age,lifetime:b.lifetime,returning:b.returning,damage:b.damage })), discoveries: this.discoveredSecrets ? [...this.discoveredSecrets] : [] });
          return result;
        };
        game.drainEvents = function(...values) { const events = drain.apply(this, values); audit.events.push(...events.map(e => ({ ...e }))); return events; };
        return game;
      } });
    } });
    Object.defineProperty(window, 'ExpeditionRenderer', { configurable: true, get: () => renderer, set(value) {
      renderer = new Proxy(value, { construct(target, args, next) { const instance = Reflect.construct(target, args, next); audit.renderer = instance; return instance; } });
    } });
  });
}
async function openGame(browser, size = { width: 1440, height: 1000 }, mobile = false, storage) {
  const context = await browser.newContext({ viewport: size, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  await isolated(context);
  if (storage) await context.addInitScript(value => {
    if (value.raw !== undefined && !sessionStorage.getItem('secret-fixture-seeded')) {
      localStorage.setItem('frontier-secrets-v1', value.raw); sessionStorage.setItem('secret-fixture-seeded', '1');
    }
    if (value.deny) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, body) {
        if (key === 'frontier-secrets-v1') throw new DOMException('Fixture: storage denied', 'QuotaExceededError');
        return original.call(this,key,body);
      };
    }
  }, storage);
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(origin + '/');
  return { context, page };
}
async function aim(page, x, y) {
  const point = await page.evaluate(({x,y}) => {
    const renderer = __secretAudit.renderer, rect = document.getElementById('world').getBoundingClientRect();
    return { x:rect.left+renderer.width/2+(x-renderer.camera.x)*renderer.scale, y:rect.top+renderer.height/2+(y-renderer.camera.y)*renderer.scale };
  }, {x,y});
  await page.mouse.move(point.x, point.y);
}
async function baselineCollision(browser, withRock) {
  const { context, page } = await openGame(browser);
  try {
    await page.locator('#start-run').click();
    await page.evaluate(withRock => {
      const qa = __secretAudit, game = qa.game;
      game.player.x = 1000; game.player.y = 1000;
      game.enemies = []; game.bullets = [];
      game.obstacles = withRock ? [{ id:90001,type:'rock',x:1200,y:1000,radius:40,variant:0 }] : [];
      game.random = () => .5;
      qa.renderer.camera.x = 1000; qa.renderer.camera.y = 1000;
      qa.events = []; qa.trace = []; qa.traceEnabled = true;
    }, withRock);
    await page.keyboard.press('Digit5');
    await page.waitForTimeout(200);
    await aim(page, 1500, 1000);
    await page.mouse.down(); await page.waitForTimeout(35); await page.mouse.up();
    await page.waitForTimeout(760);
    const evidence = await page.evaluate(() => ({ trace:__secretAudit.trace,events:__secretAudit.events,ammo:__secretAudit.game.player.ammo,remaining:__secretAudit.game.bullets.length,phase:__secretAudit.game.phase }));
    const shots = evidence.events.filter(e => e.type === 'shot' && e.owner === 'player');
    assert.equal(shots.length, 1, 'One genuine pointer shot created one flying blade');
    assert.ok(evidence.trace.some(frame => frame.bullets.some(b => b.kind === 'boomerang')));
    evidence.returnObserved = evidence.trace.some(frame => frame.bullets.some(b => b.returning));
    evidence.impact = evidence.events.find(e => e.type === 'spark') || null;
    if (withRock) {
      assert.ok(evidence.impact, 'Rock surface produced the impact event');
      assert.equal(evidence.remaining, 0, 'Baseline blade disappears at rock');
      assert.equal(evidence.returnObserved, false, 'Baseline never enters return after impact');
    } else assert.equal(evidence.returnObserved, true, 'Unobstructed baseline blade returns normally');
    evidence.name = withRock ? 'baseline-rock-destroys-blade' : 'baseline-unobstructed-blade-returns';
    report.checks.push(evidence);
    await page.screenshot({ path:path.join(root,'reports',`secret-techniques-${withRock?'rock':'clear'}-baseline.png`) });
  } finally { await context.close(); save(); }
}
function check(name, evidence = {}) { report.checks.push({ name, ...evidence }); save(); }
async function screenshot(page, name) {
  await page.screenshot({ path:path.join(root,'reports',`secret-techniques-${mode}-${name}.png`) });
}
async function archiveContent(page, ids) {
  const state = await page.evaluate(() => ({
    secrets:Expedition.SECRETS,
    cards:[...document.querySelectorAll('.secret-card')].map(e=>({
      locked:e.classList.contains('locked'), id:e.dataset.discovery || null,
      title:e.querySelector('h3').textContent, text:e.textContent, html:e.outerHTML
    }))
  }));
  assert.equal(state.cards.length,state.secrets.length);
  for (const [index,secret] of state.secrets.entries()) {
    const card=state.cards[index], unlocked=ids.includes(secret.id);
    assert.equal(card.locked,!unlocked);
    if (unlocked) {
      assert.equal(card.id,secret.id);
      for(const value of [secret.title,secret.condition,secret.description]) assert.ok(card.text.includes(value));
    } else {
      assert.equal(card.id,null); assert.equal(card.title,'？？？');
      for(const value of [secret.id,secret.title,secret.condition,secret.description]) assert.ok(!card.html.includes(value),'Locked DOM must not reveal '+value);
    }
  }
  return state;
}
async function lockedWelcome(browser) {
  const {context,page}=await openGame(browser);
  try {
    await page.locator('#open-secrets').click();
    const state=await archiveContent(page,[]);
    await screenshot(page,'desktop-locked');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#start-run').isVisible());
    assert.equal(await page.evaluate(()=>document.activeElement.id),'open-secrets');
    check('locked-archive-has-no-metadata-in-dom',{cards:state.cards});
    return state.secrets;
  } finally {await context.close();}
}
async function fixture(page, options={}) {
  return page.evaluate(options=>{
    const qa=__secretAudit,g=qa.game,p=g.player;
    Object.assign(p,{x:1000,y:1000,hp:p.maxHp,slowTimer:0,invulnerable:0,dashTimer:0,dashCooldown:0,skillCooldown:0,fireTimer:0,reloadTimer:0});
    g.enemies=[];g.bullets=[];g.hazards=[];g.pickups=[];g.obstacles=[];g.spawnTimer=999;g.fireTimer=0;g.random=()=>.5;
    qa.renderer.camera.x=1000;qa.renderer.camera.y=1000;qa.events=[];qa.trace=[];qa.traceEnabled=true;
    if(options.rock)g.obstacles=[{id:90001,type:'rock',x:1200,y:1000,radius:40,variant:0}];
    if(options.slow)p.slowTimer=4;
    for(const point of options.enemies||[]) {
      const e=g.spawnEnemy('crawler',point);Object.assign(e,{hp:500,maxHp:500,stunTimer:10,attackTimer:10});
    }
    for(let n=0;n<(options.enemyBullets||0);n++) g.bullets.push({id:91000+n,type:'bullet',owner:'enemy',x:1100+n*2,y:1000,vx:0,vy:0,radius:4,lifetime:10,damage:1,pierce:0,hitIds:[],color:'#f88'});
    return {enemies:g.enemies.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp})),secrets:[...g.discoveredSecrets]};
  },options);
}
async function shot(page,weapon) {
  await page.keyboard.press('Digit'+(weapon+1)); await page.waitForTimeout(180);
  await aim(page,1300,1000);
  await page.mouse.down();await page.waitForTimeout(40);await page.mouse.up();
}
async function evidence(page) {
  const state=await page.evaluate(()=>({events:__secretAudit.events,trace:__secretAudit.trace,
    discoveries:[...__secretAudit.game.discoveredSecrets],
    bullets:__secretAudit.game.bullets.map(b=>({...b})),
    enemies:__secretAudit.game.enemies.map(e=>({id:e.id,hp:e.hp,stun:e.stunTimer,x:e.x,y:e.y})),
    stored:localStorage.getItem('frontier-secrets-v1'),slow:__secretAudit.game.player.slowTimer,
    notification:{text:document.getElementById('notification').textContent,classes:document.getElementById('notification').className}}));
  report.lastEvidence=state;return state;
}
function discovered(state,id) {
  assert.ok(state.discoveries.includes(id),id+' must actually discover');
  assert.equal(state.events.filter(e=>e.type==='secret-discovered'&&e.secretId===id).length,1,id+' discovery event once');
  assert.ok(state.events.some(e=>e.type==='secret-trigger'&&e.secretId===id),id+' feedback event');
  assert.ok(JSON.parse(state.stored).includes(id),id+' persisted');
  assert.ok(state.notification.classes.includes('discovery'),id+' first discovery remains visible in DOM');
  assert.ok(state.notification.text.includes(state.events.find(e=>e.type==='secret-trigger'&&e.secretId===id).message),id+' discovery names the actual technique');
}
async function mechanics(browser,secrets) {
  const {context,page}=await openGame(browser);
  try {
    await page.locator('#start-run').click();
    await fixture(page,{rock:true}); await shot(page,4); await page.waitForTimeout(650);
    let state=await evidence(page);
    assert.ok(state.trace.some(f=>f.bullets.some(b=>b.returning)),'Rock collision now returns blade');
    assert.ok(!state.discoveries.includes('rebound'),'Mere rock collision does not reveal archive');
    check('rock-return-without-hit-remains-unknown',state);
    await fixture(page,{rock:true,enemies:[{x:1100,y:1000}]}); await shot(page,4);await page.waitForTimeout(650);
    state=await evidence(page);discovered(state,'rebound');
    assert.equal(state.enemies[0].hp,395,'Outgoing42 + strengthened return63');
    check('rebound-live-enemy-hit',state);

    await fixture(page);await shot(page,4);
    // Reposition a genuine player-fired blade on its incoming flight path; dash itself is a real key action.
    await page.evaluate(()=>{const b=__secretAudit.game.bullets.find(b=>b.kind==='boomerang');Object.assign(b,{x:1200,y:1000,returning:true,age:.6,hitIds:[]});});
    await page.keyboard.down('KeyD');await page.keyboard.press('ShiftLeft');await page.keyboard.up('KeyD');
    await page.waitForTimeout(130);state=await evidence(page);discovered(state,'blade-relay');
    assert.equal(state.bullets.find(b=>b.kind==='boomerang').relayCount,1);
    assert.ok(Math.abs(state.bullets.find(b=>b.kind==='boomerang').damage-56.7)<1e-8);
    check('dash-catches-and-relays-real-blade',state);
    await page.evaluate(()=>{const g=__secretAudit.game,b=g.bullets.find(b=>b.kind==='boomerang');g.player.dashTimer=0;g.player.dashCooldown=0;Object.assign(b,{x:g.player.x+200,y:g.player.y,returning:true,age:.6});});
    await page.keyboard.down('KeyD');await page.keyboard.press('ShiftLeft');await page.keyboard.up('KeyD');await page.waitForTimeout(180);
    state=await evidence(page);assert.equal(state.events.filter(e=>e.type==='secret-trigger'&&e.secretId==='blade-relay').length,1,'Same blade cannot relay twice');
    check('same-blade-cannot-relay-again',state);

    await fixture(page,{enemyBullets:4});await page.keyboard.press('KeyQ');await page.waitForTimeout(60);
    state=await evidence(page);assert.ok(!state.discoveries.includes('bullet-reversal'));assert.equal(state.bullets.length,0);
    check('four-bullets-clear-without-reversal',state);
    await fixture(page,{enemyBullets:10});await aim(page,1600,1000);await page.keyboard.press('KeyQ');await page.waitForTimeout(60);
    state=await evidence(page);discovered(state,'bullet-reversal');assert.equal(state.bullets.filter(b=>b.reflected).length,8);assert.ok(state.bullets.every(b=>b.owner==='player'&&b.damage===18));
    check('emp-reverses-ten-into-eight',state);

    await fixture(page);await shot(page,3);
    const before=await page.evaluate(()=>({...__secretAudit.game.bullets.find(b=>b.kind==='grenade')}));assert.ok(before.id);
    await page.keyboard.press('KeyQ');await page.waitForTimeout(60);
    state=await evidence(page);discovered(state,'fuse-resonance');assert.equal(state.bullets.filter(b=>b.kind==='grenade').length,0);
    const burst=state.events.filter(e=>e.type==='grenade-burst');assert.equal(burst.length,1);assert.equal(burst[0].radius,before.blastRadius*1.35);
    check('emp-detonates-real-grenade-once',{before,...state});

    await fixture(page,{enemies:[{x:1150,y:1000},{x:1240,y:1000},{x:1330,y:1000},{x:1420,y:1000},{x:1510,y:1000},{x:1600,y:1000}]});
    await shot(page,2);await page.waitForTimeout(520);state=await evidence(page);discovered(state,'rail-resonance');
    assert.deepEqual(state.enemies.map(e=>e.hp),[414,414,371,371,371,371],'Rail targets3-6 take129; first2 take86');
    check('single-rail-resonates-on-third-live-target',state);

    await fixture(page,{slow:true,enemies:[{x:1000,y:1070},{x:1000,y:1240}]});
    await page.keyboard.down('KeyA');await page.keyboard.press('ShiftLeft');await page.keyboard.up('KeyA');await page.waitForTimeout(60);
    state=await evidence(page);discovered(state,'ice-break');assert.equal(state.slow,0);assert.equal(state.enemies[0].hp,465);assert.equal(state.enemies[1].hp,500);assert.ok(state.enemies[0].stun>0);
    check('slowed-dash-clears-and-hits-nearby-only',state);
    await fixture(page,{slow:true});await page.keyboard.press('ShiftLeft');await page.waitForTimeout(60);
    state=await evidence(page);assert.equal(state.events.filter(e=>e.type==='secret-discovered').length,0,'Repeated known technique has no duplicate discovery');
    check('repeated-known-technique-does-not-discover-again',state);
    assert.deepEqual([...state.discoveries].sort(),secrets.map(s=>s.id).sort());
    await screenshot(page,'discovery-notification');
    assert.ok(await page.locator('#notification.discovery').isVisible());

    await page.keyboard.press('KeyP');const at=await page.evaluate(()=>__secretAudit.game.elapsed);
    await page.locator('#open-secrets').click();await archiveContent(page,secrets.map(s=>s.id));await page.waitForTimeout(180);
    assert.equal(await page.evaluate(()=>__secretAudit.game.elapsed),at);
    await screenshot(page,'desktop-unlocked');await page.keyboard.press('Escape');
    assert.ok(await page.locator('#resume-run').isVisible());await page.waitForTimeout(160);assert.equal(await page.evaluate(()=>__secretAudit.game.elapsed),at);
    check('pause-archive-escape-stays-paused',{elapsed:at});
    await page.locator('#resume-run').click();await page.waitForFunction(at=>__secretAudit.game.elapsed>at,at);
    await page.keyboard.press('KeyP');await page.locator('#new-run').click();await page.locator('#restart-confirm').click();
    assert.deepEqual(await page.evaluate(()=>[...__secretAudit.game.discoveredSecrets].sort()),secrets.map(s=>s.id).sort());
    check('confirmed-new-run-preserves-all-six-discoveries');
    await page.reload();await page.locator('#open-secrets').click();await archiveContent(page,secrets.map(s=>s.id));
    check('reload-restores-all-six-discoveries');
    await page.locator('#close-secrets').click();await page.locator('#start-run').click();
    assert.deepEqual(await page.evaluate(()=>[...__secretAudit.game.discoveredSecrets].sort()),secrets.map(s=>s.id).sort());
    await fixture(page);await page.evaluate(()=>{const g=__secretAudit.game;g.bullets.push({id:99999,type:'bullet',owner:'enemy',x:g.player.x,y:g.player.y,vx:0,vy:0,radius:4,lifetime:2,damage:9999,pierce:0,hitIds:[],color:'#f88'});});
    await page.waitForFunction(()=>__secretAudit.game.phase==='lost');
    const resultBefore=await page.evaluate(()=>({phase:__secretAudit.game.phase,score:__secretAudit.game.score,elapsed:__secretAudit.game.elapsed}));
    for(const viaEscape of [false,true]) {
      await page.locator('#open-secrets').click();await archiveContent(page,secrets.map(s=>s.id));
      if(viaEscape)await page.keyboard.press('Escape');else await page.locator('#close-secrets').click();
      assert.ok(await page.locator('#screen-overlay.result-screen').isVisible());
      assert.deepEqual(await page.evaluate(()=>({phase:__secretAudit.game.phase,score:__secretAudit.game.score,elapsed:__secretAudit.game.elapsed})),resultBefore);
    }
    check('result-archive-button-and-escape-preserve-result',resultBefore);
  } finally {await context.close();save();}
}
async function storageChecks(browser,secrets) {
  for(const [name,raw,expected] of [['invalid-json','{broken',[]],['nonarray','{"rebound":true}',[]],['unknown-and-duplicate',JSON.stringify(['rebound','invalid','rebound',null,3]),['rebound']]]) {
    const {context,page}=await openGame(browser,undefined,false,{raw});
    try {await page.locator('#open-secrets').click();await archiveContent(page,expected);check('storage-'+name);}finally{await context.close();}
  }
  const {context,page}=await openGame(browser,undefined,false,{deny:true});
  try {
    await page.locator('#start-run').click();await fixture(page,{enemyBullets:5});await page.keyboard.press('KeyQ');await page.waitForTimeout(70);
    assert.ok(await page.evaluate(()=>__secretAudit.game.discoveredSecrets.has('bullet-reversal')));
    await page.keyboard.press('KeyP');await page.locator('#open-secrets').click();await archiveContent(page,['bullet-reversal']);
    assert.ok((await page.locator('.secret-save-note').textContent()).includes('本次会话'));
    check('storage-write-denial-still-keeps-session-discovery');
  }finally{await context.close();}
}
async function mobileMenus(browser,secrets) {
  for(const size of [{width:360,height:640},{width:390,height:844},{width:667,height:375},{width:844,height:390}]) for(const unlocked of [false,true]) {
    const ids=unlocked?secrets.map(s=>s.id):[],{context,page}=await openGame(browser,size,true,{raw:JSON.stringify(ids)});
    try {
      await page.locator('#open-secrets').tap();await archiveContent(page,ids);
      const cards=[];
      for(const card of await page.locator('.secret-card').all()) {
        await card.scrollIntoViewIfNeeded();
        const bounds=await card.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,viewport:innerWidth};});
        assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=bounds.viewport+1,'Card remains horizontally in viewport');
        assert.ok(bounds.scrollWidth<=bounds.clientWidth+1,'Card text does not overflow horizontally');cards.push(bounds);
        for (const text of await card.locator('h3,p,.secret-status').all()) {
          await text.evaluate(e=>e.scrollIntoView({block:'center'}));
          const readable=await text.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:e.textContent,hit:hit===e||e.contains(hit),target:hit?.className};});
          assert.ok(readable.hit,'Scrollable card text is not covered: '+JSON.stringify(readable));
        }
      }
      await page.locator('#screen-content').evaluate(e=>e.scrollTop=0);await screenshot(page,`${size.width}x${size.height}-${unlocked?'unlocked':'locked'}-top`);
      await page.locator('#screen-content').evaluate(e=>e.scrollTop=e.scrollHeight);
      await page.locator('#close-secrets').scrollIntoViewIfNeeded();
      const button=await page.locator('#close-secrets').evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {width:r.width,height:r.height,hit:hit===e||e.contains(hit)};});
      assert.ok(button.width>=44&&button.height>=44&&button.hit,'Archive close is reachable touch target');
      await screenshot(page,`${size.width}x${size.height}-${unlocked?'unlocked':'locked'}-bottom`);
      await page.locator('#close-secrets').tap();assert.ok(await page.locator('#start-run').isVisible());
      await page.locator('#start-run').tap();await page.locator('#pause-toggle').tap();await page.locator('#open-secrets').tap();
      await page.locator('#close-secrets').tap();assert.ok(await page.locator('#resume-run').isVisible());
      check('mobile-menu-'+size.width+'x'+size.height+'-'+(unlocked?'unlocked':'locked'),{cards,button});
    } finally {await context.close();}
  }
}
async function mobileCombinedDiscovery(browser,secrets) {
  const {context,page}=await openGame(browser,{width:360,height:640},true);
  try {
    await page.locator('#fullscreen-toggle').tap();await page.waitForFunction(()=>!!document.fullscreenElement);
    await page.locator('#start-run').tap();await fixture(page,{enemyBullets:5});
    // Public update shoots a genuine grenade; the touch skill control performs the combined technique.
    await page.evaluate(()=>{const g=__secretAudit.game;g.switchWeapon(3);g.fireTimer=0;g.update(.016,{aimX:1700,aimY:1000,shoot:true});});
    await page.locator('#skill-button').tap();await page.waitForTimeout(60);
    const state=await evidence(page);discovered(state,'bullet-reversal');discovered(state,'fuse-resonance');
    const notification=await page.locator('#notification.discovery').textContent();
    for(const id of ['bullet-reversal','fuse-resonance'])assert.ok(notification.includes(secrets.find(s=>s.id===id).title));
    const geometry=await page.evaluate(()=>{
      const a=__secretAudit,r=a.renderer,g=a.game,canvas=document.getElementById('world').getBoundingClientRect();
      const player={x:canvas.left+r.width/2+(g.player.x-r.camera.x)*r.scale,y:canvas.top+r.height/2+(g.player.y-r.camera.y)*r.scale,radius:g.player.radius*r.scale};
      const notices=['event-banner','notification','interaction-hint'].map(id=>{const e=document.getElementById(id),rect=e.getBoundingClientRect();return {id,text:e.textContent,visible:rect.width>0&&rect.height>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).opacity!=='0',x:rect.x,y:rect.y,width:rect.width,height:rect.height};});
      return {player,notices};
    });
    await screenshot(page,'360x640-fullscreen-combined-discovery');
    for(const n of geometry.notices.filter(n=>n.visible))assert.ok(!(n.x<geometry.player.x+geometry.player.radius&&n.x+n.width>geometry.player.x-geometry.player.radius&&n.y<geometry.player.y+geometry.player.radius&&n.y+n.height>geometry.player.y-geometry.player.radius),'Discovery notice covers player: '+JSON.stringify(n));
    check('mobile-fullscreen-combined-discovery-keeps-player-visible',{notification,geometry,events:state.events});
  }finally{await context.close();}
}
(async () => {
  const browser = await chromium.launch({ channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless:true });
  report.browser = browser.version();
  try {
    if (baseline) {await baselineCollision(browser,true);await baselineCollision(browser,false);}
    else {
      const secrets=await lockedWelcome(browser);
      if (!process.argv.includes('--ui-only')) await mechanics(browser,secrets);
      await storageChecks(browser,secrets);await mobileMenus(browser,secrets);await mobileCombinedDiscovery(browser,secrets);
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report.checks.map(c => ({name:c.name,returnObserved:c.returnObserved,remaining:c.remaining,impact:c.impact}))));
  } finally { await browser.close(); save(); }
})().catch(error => { report.failure=error.stack; save(); console.error(error); process.exitCode=1; });
}
