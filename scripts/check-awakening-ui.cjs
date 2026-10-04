/* Central discovery proclamation QA. Isolated Edge contexts; no server or user profile. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let chromium;
try {({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}
catch(error){if(process.env.PLAYWRIGHT_MODULE)throw error;({chromium}=require('../build-tools/browser/node_modules/playwright'));}
const root=path.resolve(__dirname,'..'),release=process.argv.includes('--release'),mode=release?'release':'source';
const folder=release?path.join(root,'release/web'):root,origin='http://127.0.0.1:4176',cache=new Map();
const report={timestamp:new Date().toISOString(),mode,selection:process.argv.includes('--trials-only')?'trials-only':process.argv.includes('--ui-only')?'ui-only':'full',note:'Independent headless Edge with isolated storage and local response snapshots. Real public actions produce discovery events. Explicit same-batch phase fixtures test UI arbitration, not natural gameplay frequency. Audio instrumentation verifies authorization and synthesis calls, not subjective listening.',files:{},cases:[],errors:[]};
const output=path.join(root,'reports',`awakening-ui-${mode}.json`);
function save(){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));}
async function create(browser,settings={}){
  const context=await browser.newContext({viewport:settings.size||{width:1440,height:1000},isMobile:!!settings.mobile,hasTouch:!!settings.mobile,reducedMotion:settings.systemCalm?'reduce':'no-preference',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    const name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html',file=path.resolve(folder,name);
    if(!file.startsWith(folder+path.sep))return route.abort();
    try{if(!cache.has(name))cache.set(name,fs.readFileSync(file));const body=cache.get(name);report.files[name]=crypto.createHash('sha256').update(body).digest('hex');await route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});}
    catch{await route.fulfill({status:404,body:''});}
  });
  await context.addInitScript(settings=>{
    const q=window.__awakening={events:[],updates:0,audioCalls:[],notes:[]};let api,renderer,audio;
    Object.defineProperty(window,'Expedition',{configurable:true,get:()=>api,set(value){api=value;api.Game=new Proxy(api.Game,{construct(target,args,next){const g=Reflect.construct(target,args,next);q.game=g;const update=g.update,drain=g.drainEvents;g.update=function(...args){q.updates++;return update.apply(this,args);};g.drainEvents=function(...args){const events=drain.apply(this,args);q.events.push(...events.map(e=>({...e})));return events;};return g;}});}});
    Object.defineProperty(window,'ExpeditionRenderer',{configurable:true,get:()=>renderer,set(value){renderer=new Proxy(value,{construct(target,args,next){const r=Reflect.construct(target,args,next);q.renderer=r;return r;}});}});
    Object.defineProperty(window,'FrontierAudio',{configurable:true,get:()=>audio,set(value){audio=new Proxy(value,{construct(target,args,next){const a=Reflect.construct(target,args,next);q.audio=a;for(const kind of ['note','noiseBurst']){const original=a[kind];a[kind]=function(...args){q.notes.push({kind,args});return original.apply(this,args);};}const play=a.play;a.play=function(...args){const before=q.notes.length,beforeContext=!!this.context,state=this.context?.state;const result=play.apply(this,args);q.audioCalls.push({kind:args[0],enabled:this.enabled,state,beforeContext,afterContext:!!this.context,notes:q.notes.length-before});return result;};return a;}});}});
    if(!sessionStorage.getItem('awakening-fixture-seeded')){
      localStorage.setItem('frontier-sound',settings.sound?'on':'off');
      if(settings.calm)localStorage.setItem('frontier-motion','calm');
      if(settings.raw!==undefined)localStorage.setItem('frontier-secrets-v1',settings.raw);
      sessionStorage.setItem('awakening-fixture-seeded','1');
    }
    if(settings.deny){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='frontier-secrets-v1'||key==='frontier-guest-v1')throw new DOMException('Fixture storage rejection','QuotaExceededError');return set.call(this,key,value);};}
  },settings);
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin+'/');
  await page.waitForFunction(()=>window.__awakening?.game&&document.getElementById('revelation-overlay'));
  return{context,page};
}
async function shot(page,name){await page.screenshot({path:path.join(root,'reports',`awakening-${mode}-${name}.png`)});}
async function withGame(browser,name,settings,body){
  let context,page;
  try{({context,page}=await create(browser,settings));const data=await body(page);report.cases.push({name,pass:true,...data});console.log('PASS '+name);}
  catch(error){if(page)await shot(page,name+'-failure').catch(()=>{});report.cases.push({name,pass:false,error:error.stack});console.error('FAIL '+name+': '+error.message);}
  finally{if(context)await context.close();save();}
}
async function start(page,full=false){if(full){await page.locator('#fullscreen-toggle').click();await page.waitForFunction(()=>!!document.fullscreenElement);}await page.locator('#start-run').click();}
async function scene(page,options={}){
  await page.evaluate(options=>{
    const q=__awakening,g=q.game,p=g.player;
    Object.assign(p,{x:1000,y:1000,hp:p.maxHp,skillCooldown:0,dashCooldown:0,dashTimer:0,slowTimer:0,invulnerable:0});
    g.enemies=[];g.bullets=[];g.hazards=[];g.pickups=[];g.obstacles=[];g.spawnTimer=999;g.fireTimer=0;g.random=()=>.5;
    q.renderer.camera.x=1000;q.renderer.camera.y=1000;q.events=[];q.audioCalls=[];q.notes=[];
    g.spawnEnemy('crawler',{x:1450,y:1200});
    for(let i=0;i<5;i++)g.bullets.push({id:91000+i,type:'bullet',owner:'enemy',x:1090+i*3,y:1000,vx:0,vy:0,radius:4,lifetime:10,damage:1,pierce:0,hitIds:[],color:'#f88'});
    g.bullets.push({id:91999,type:'bullet',owner:'enemy',x:1500,y:1150,vx:-90,vy:0,radius:4,lifetime:10,damage:1,pierce:0,hitIds:[],color:'#f88'});
    if(options.combo){g.switchWeapon(3);g.fireTimer=0;g.update(.016,{aimX:1600,aimY:1000,shoot:true});}
  },options);
}
async function trigger(page,touch=false){if(touch)await page.locator('#skill-button').tap();else await page.keyboard.press('KeyQ');await page.locator('#revelation-overlay:not(.hidden)').waitFor();}
async function state(page){return page.evaluate(()=>{const g=__awakening.game;return JSON.parse(JSON.stringify({phase:g.phase,elapsed:g.elapsed,score:g.score,kills:g.kills,player:g.player,enemies:g.enemies,bullets:g.bullets,hazards:g.hazards,relays:g.relays,reactor:g.reactor,combo:g.combo,spawnTimer:g.spawnTimer,sectorThreat:g.sectorThreat}));});}
async function freeze(page,duration=800){await page.waitForTimeout(35);const before=await state(page),updates=await page.evaluate(()=>__awakening.updates);await page.waitForTimeout(duration);const after=await state(page);assert.deepEqual(after,before,'World state changes during proclamation');assert.equal(await page.evaluate(()=>__awakening.updates),updates,'No game.update while proclaiming');return{before,after,updates,duration};}
async function ready(page){await page.waitForFunction(()=>!document.getElementById('revelation-continue')?.disabled);}
async function finish(page,key){await ready(page);if(key)await page.keyboard.press(key);else await page.locator('#revelation-continue').click();}
async function hidden(page){await page.locator('#revelation-overlay.hidden').waitFor({state:'attached'});}
async function layout(page){
  const result=await page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};},overlay=document.getElementById('revelation-overlay'),dialog=overlay.querySelector('.revelation-dialog'),button=document.getElementById('revelation-continue');
    const b=button.getBoundingClientRect();return{stage:rect(document.getElementById('game-stage')),overlay:rect(overlay),dialog:rect(dialog),title:rect(document.getElementById('revelation-title')),button:rect(button),role:overlay.getAttribute('role'),modal:overlay.getAttribute('aria-modal'),focusWithin:overlay.contains(document.activeElement),screenInert:document.getElementById('screen-overlay').inert,text:overlay.textContent,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,
      hits:[[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]].map(([x,y])=>{const hit=document.elementFromPoint(b.x+b.width*x,b.y+b.height*y);return{pass:hit===button||button.contains(hit),target:hit?.id||hit?.className};}),
      animations:[...overlay.querySelectorAll('*'),overlay].map(e=>({class:e.className,name:getComputedStyle(e).animationName,opacity:getComputedStyle(e).opacity})).filter(x=>x.name!=='none')};
  });
  assert.equal(result.role,'dialog');assert.equal(result.modal,'true');assert.ok(result.focusWithin,'Modal retains focus');assert.ok(result.screenInert,'Underlying menu is inert');
  assert.ok(result.button.width>=44&&result.button.height>=44,'44px confirmation');assert.ok(result.hits.every(h=>h.pass),'Five-point confirmation hit test');
  assert.ok(result.scrollWidth<=result.clientWidth+1,'No horizontal text clipping');
  const s=result.stage,d=result.dialog;assert.ok(Math.abs(d.x+d.width/2-s.x-s.width/2)<=s.width*.08,'Horizontally central');assert.ok(Math.abs(d.y+d.height/2-s.y-s.height/2)<=s.height*.12,'Vertically central');
  return result;
}
async function single(browser){await withGame(browser,'single-freeze-input-focus',{},async page=>{
  await start(page);await scene(page);await page.keyboard.down('KeyW');
  const point=await page.locator('#world').boundingBox();await page.mouse.move(point.x+point.width/2+120,point.y+point.height/2);await page.mouse.down();
  await trigger(page);assert.ok(await page.locator('#revelation-continue').isDisabled());await page.keyboard.press('Escape');assert.ok(await page.locator('#revelation-overlay:not(.hidden)').isVisible());
  const frozen=await freeze(page);await ready(page);const geometry=await layout(page);
  for(const key of ['Digit2','KeyF','KeyQ','ShiftLeft','KeyM','KeyP','Tab'])await page.keyboard.press(key);
  assert.deepEqual(await state(page),frozen.after);assert.ok(await page.locator('#revelation-continue').evaluate(e=>e===document.activeElement));
  await shot(page,'desktop-central');await finish(page,'Enter');await hidden(page);
  const before=await state(page);await page.waitForTimeout(220);const after=await state(page);
  assert.equal(after.player.x,before.player.x);assert.equal(after.player.y,before.player.y);assert.equal(after.player.ammo,before.player.ammo,'Held mouse does not resume shooting');assert.ok(after.elapsed>before.elapsed);
  await page.mouse.up();await page.keyboard.up('KeyW');await page.keyboard.down('KeyD');await page.waitForTimeout(70);await page.keyboard.up('KeyD');assert.ok((await state(page)).player.x>after.player.x,'Fresh input works');
  return{frozen,geometry};
});}
async function queueAndPersistence(browser){await withGame(browser,'queue-known-reset-reload',{},async page=>{
  await start(page);await scene(page,{combo:true});await trigger(page);
  const names=await page.evaluate(()=>Expedition.SECRETS.filter(s=>['bullet-reversal','fuse-resonance'].includes(s.id)).map(s=>s.title));
  const first=await page.locator('#revelation-title').textContent();assert.ok(names.includes(first));const frozen=await freeze(page);
  await finish(page,'Space');const second=await page.locator('#revelation-title').textContent();assert.ok(names.includes(second)&&second!==first);assert.ok(await page.locator('#revelation-continue').isDisabled());
  await page.keyboard.press('Space');assert.equal(await page.locator('#revelation-title').textContent(),second,'Early second confirmation ignored');const secondFreeze=await freeze(page);assert.deepEqual(secondFreeze.before,frozen.before);
  await finish(page,'Escape');await hidden(page);
  await scene(page,{combo:true});await page.keyboard.press('KeyQ');await page.waitForTimeout(100);assert.ok(await page.locator('#revelation-overlay').evaluate(e=>e.classList.contains('hidden')));
  assert.equal(await page.evaluate(()=>__awakening.events.filter(e=>e.type==='secret-discovered').length),0);
  await page.keyboard.press('KeyP');await page.locator('#new-run').click();await page.locator('#restart-confirm').click();
  const ids=await page.evaluate(()=>[...__awakening.game.discoveredSecrets].sort());assert.deepEqual(ids,['bullet-reversal','fuse-resonance']);
  await page.reload();assert.ok(await page.locator('#revelation-overlay').evaluate(e=>e.classList.contains('hidden')));assert.deepEqual(await page.evaluate(()=>[...__awakening.game.discoveredSecrets].sort()),ids);
  await page.locator('#open-secrets').click();assert.equal(await page.locator('.secret-card.discovered').count(),2);
  return{first,second,frozen,secondFreeze,ids};
});}
async function priority(browser,phase){await withGame(browser,'phase-priority-'+phase,{},async page=>{
  await start(page);await scene(page);
  await page.evaluate(phase=>{
    const g=__awakening.game;
    if(phase==='won'){g.enemies=[];const boss=g.spawnEnemy('boss',{x:1100,y:1000});boss.hp=1;boss.stunTimer=10;return;}
    // Explicit public-action batch fixtures isolate UI arbitration from gameplay pacing.
    const use=g.useSkill;g.useSkill=function(...args){const value=use.apply(this,args);
      if(phase==='upgrade'){this.player.xp=this.player.xpNeeded;this.update(.001,{});}
      else if(phase==='relic'){this.crates=[];this.stations=[];for(const r of this.relays)r.status='locked';const c=this.contracts[0];Object.assign(c,{status:'ready',x:this.player.x,y:this.player.y});this.interact();}
      else if(phase==='lost'){this.player.invulnerable=0;this.bullets.unshift({id:95000,type:'bullet',owner:'enemy',x:this.player.x,y:this.player.y,vx:0,vy:0,radius:4,lifetime:1,damage:9999,pierce:0,hitIds:[],color:'#f88'});this.update(.001,{});}
      return value;};
  },phase);
  await trigger(page);await page.waitForFunction(phase=>__awakening.game.phase===phase,phase);const frozen=await freeze(page,200);await ready(page);const geometry=await layout(page);
  assert.ok(await page.locator('#screen-overlay').evaluate(e=>e.inert&&!e.classList.contains('hidden')));
  await finish(page);await hidden(page);assert.equal(await page.evaluate(()=>__awakening.game.phase),phase);
  assert.equal(await page.evaluate(()=>__awakening.game.score),frozen.before.score);
  if(phase==='upgrade'){assert.ok(await page.locator('[data-upgrade]').first().isVisible());await page.locator('[data-upgrade]').first().click();assert.equal(await page.evaluate(()=>__awakening.game.phase),'playing');}
  else if(phase==='relic'){assert.ok(await page.locator('[data-relic]').first().isVisible());await page.locator('[data-relic]').first().click();assert.equal(await page.evaluate(()=>__awakening.game.phase),'playing');}
  else assert.ok(await page.locator('#screen-overlay.result-screen').isVisible());
  return{fixture:phase==='won'?'Real EMP discovers and kills prepared living boss':'Public-action batch UI arbitration fixture',frozen,geometry};
});}
async function audioAndStorage(browser){
  for(const settings of [{sound:false},{sound:true},{calm:true},{systemCalm:true},{deny:true},{raw:'{invalid'},{raw:'{}'}]){
    const name=settings.sound===false?'muted':settings.sound?'authorized-audio':settings.calm?'calm':settings.systemCalm?'system-calm':settings.deny?'denied-storage':settings.raw==='{}'?'nonarray-storage':'invalid-storage';
    await withGame(browser,name,settings,async page=>{
      const unauthorized=await page.evaluate(()=>{const a=__awakening.audio;a.play('secret-discovered');return{context:!!a.context,call:__awakening.audioCalls.at(-1)};});assert.equal(unauthorized.context,false,'Discovery never opens AudioContext before user action');
      await start(page);await scene(page);const begun=Date.now();await trigger(page);await ready(page);const delay=Date.now()-begun;const geometry=await layout(page);
      if(settings.calm||settings.systemCalm){assert.ok(await page.locator('#revelation-overlay.calm').isVisible());assert.equal(geometry.animations.length,0,'Calm proclamation is static');assert.ok(delay<850,'Calm ready uses shorter delay');}
      else assert.ok(delay>=820,'Normal declaration prevents immediate dismissal');
      const audio=await page.evaluate(()=>__awakening.audioCalls.filter(a=>a.kind==='secret-discovered'));assert.equal(audio.length,1);
      if(settings.sound)assert.ok(audio[0].state==='running'&&audio[0].notes>0,'Authorized running context synthesizes proclamation');else assert.equal(audio[0].notes,0,'Muted proclamation emits no synthesis');
      await finish(page);await hidden(page);
      if(settings.deny){await page.keyboard.press('KeyP');await page.locator('#open-secrets').click();assert.ok((await page.locator('.secret-save-note').textContent()).includes('浏览器未允许保存'));assert.equal(await page.locator('.secret-card.discovered').count(),1);}
      return{delay,audio,unauthorized,geometry};
    });
  }
}
async function mobile(browser){
  for(const size of [{width:360,height:640},{width:390,height:844},{width:667,height:375},{width:844,height:390}])for(const full of [false,true]){
    const name=`mobile-${size.width}x${size.height}-${full?'full':'normal'}`;
    await withGame(browser,name,{size,mobile:true},async page=>{
      await start(page,full);await scene(page);
      const longest=(size.width===360&&full)||(size.width===667&&!full);
      if(longest){await page.evaluate(()=>__awakening.game.player.slowTimer=4);await page.locator('#dash-button').tap();await page.locator('#revelation-overlay:not(.hidden)').waitFor();}
      else await trigger(page,true);
      const frozen=await freeze(page,160);await ready(page);const geometry=await layout(page);
      for(const element of await page.locator('.revelation-dialog h2,.revelation-dialog p,.revelation-safe').all()){
        await element.scrollIntoViewIfNeeded();const visible=await element.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{pass:hit===e||e.contains(hit),text:e.textContent,hit:hit?.className};});assert.ok(visible.pass,'Readable declaration text: '+JSON.stringify(visible));
      }
      await page.locator('#revelation-continue').scrollIntoViewIfNeeded();await shot(page,name);await page.locator('#revelation-continue').tap();await hidden(page);assert.equal(await page.evaluate(()=>__awakening.game.phase),'playing');
      return{frozen,geometry};
    });
  }
  await withGame(browser,'mobile-fullscreen-rotation',{size:{width:390,height:844},mobile:true},async page=>{
    await start(page,true);await scene(page,{combo:true});await trigger(page,true);await ready(page);const before=await state(page),layouts=[];
    for(const size of [{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(size);await page.waitForTimeout(160);layouts.push(await layout(page));assert.deepEqual(await state(page),before);await shot(page,'rotation-'+size.width);}
    await finish(page);await finish(page);await hidden(page);return{layouts};
  });
}
async function allSix(browser){await withGame(browser,'all-six-genuine-discoveries',{},async page=>{
  await start(page);const observed=[];
  async function shoot(index){await page.keyboard.press('Digit'+(index+1));await page.waitForFunction(()=>__awakening.game.fireTimer<=0);const point=await page.evaluate(()=>{const r=__awakening.renderer,b=document.getElementById('world').getBoundingClientRect();return{x:b.left+r.width/2+(1300-r.camera.x)*r.scale,y:b.top+r.height/2+(1000-r.camera.y)*r.scale};});await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(40);await page.mouse.up();}
  async function accept(id){await page.locator('#revelation-overlay:not(.hidden)').waitFor();await ready(page);const title=await page.locator('#revelation-title').textContent(),secret=await page.evaluate(id=>Expedition.SECRETS.find(s=>s.id===id),id);assert.equal(title,secret.title);assert.ok((await page.locator('#revelation-overlay').textContent()).includes(secret.description));assert.ok(await page.evaluate(id=>__awakening.game.discoveredSecrets.has(id),id));const snapshot=await state(page);observed.push({id,title,geometry:await layout(page),snapshot});await finish(page);return snapshot;}
  await scene(page);await page.evaluate(()=>{const g=__awakening.game;g.enemies=[];g.bullets=[];g.obstacles=[{id:93000,type:'rock',x:1200,y:1000,radius:40,variant:0}];});await shoot(4);await page.waitForTimeout(430);assert.ok(await page.locator('#revelation-overlay').evaluate(e=>e.classList.contains('hidden')),'Rock contact alone remains unknown');
  await scene(page);await page.evaluate(()=>{const g=__awakening.game;g.enemies=[];g.bullets=[];g.obstacles=[{id:93000,type:'rock',x:1200,y:1000,radius:40,variant:0}];const e=g.spawnEnemy('crawler',{x:1100,y:1000});Object.assign(e,{hp:500,maxHp:500,stunTimer:10});});await shoot(4);const rebound=await accept('rebound');assert.ok(Math.abs(rebound.enemies[0].hp-(500-42-56.7))<1e-8,'New rebound damage:42+56.7');
  await scene(page);await page.evaluate(()=>{__awakening.game.bullets=[];__awakening.game.enemies=[];});await shoot(4);await page.evaluate(()=>{const b=__awakening.game.bullets.find(b=>b.kind==='boomerang');Object.assign(b,{x:1200,y:1000,returning:true,age:.6,hitIds:[]});});await page.keyboard.down('KeyD');await page.keyboard.press('ShiftLeft');await page.keyboard.up('KeyD');const relay=await accept('blade-relay');assert.ok(Math.abs(relay.bullets.find(b=>b.kind==='boomerang').damage-50.4)<1e-8);
  await page.evaluate(()=>{const g=__awakening.game,b=g.bullets.find(b=>b.kind==='boomerang');g.player.dashTimer=0;g.player.dashCooldown=0;Object.assign(b,{x:g.player.x+200,y:g.player.y,returning:true,age:.6});});await page.keyboard.down('KeyD');await page.keyboard.press('ShiftLeft');await page.keyboard.up('KeyD');await page.waitForTimeout(230);assert.equal(await page.evaluate(()=>__awakening.events.filter(e=>e.type==='secret-trigger'&&e.secretId==='blade-relay').length),1,'One relay per blade');
  await scene(page);await page.evaluate(()=>{const g=__awakening.game;g.bullets=[];g.enemies=[];for(const x of [1100,1200,1300,1400,1500,1600]){const e=g.spawnEnemy('crawler',{x,y:1000});Object.assign(e,{hp:500,maxHp:500,stunTimer:10});}});await shoot(2);await accept('rail-resonance');await page.waitForTimeout(450);assert.deepEqual((await state(page)).enemies.map(e=>e.hp),[414,414,392.5,392.5,392.5,392.5]);
  await scene(page);await page.evaluate(()=>{const g=__awakening.game;g.player.slowTimer=4;g.enemies=[];for(const y of [1070,1240]){const e=g.spawnEnemy('crawler',{x:1000,y});Object.assign(e,{hp:500,maxHp:500,stunTimer:10});}});await page.keyboard.press('ShiftLeft');const ice=await accept('ice-break');assert.equal(ice.player.slowTimer,0);assert.deepEqual(ice.enemies.map(e=>e.hp),[465,500]);
  await scene(page);await page.evaluate(()=>__awakening.game.bullets=__awakening.game.bullets.filter(b=>b.id!==91004));await page.keyboard.press('KeyQ');await page.waitForTimeout(50);assert.ok(await page.locator('#revelation-overlay').evaluate(e=>e.classList.contains('hidden')),'Four enemy bullets do not trigger');
  await scene(page,{combo:true});await page.evaluate(()=>{const g=__awakening.game;for(let i=5;i<10;i++)g.bullets.push({id:91000+i,type:'bullet',owner:'enemy',x:1090+i*3,y:1000,vx:0,vy:0,radius:4,lifetime:10,damage:1,pierce:0,hitIds:[],color:'#f88'});});await trigger(page);const reversal=await accept('bullet-reversal');assert.equal(reversal.player.reversalAmmo,8);assert.equal(reversal.bullets.filter(b=>b.reflected).length,0);const fuse=await accept('fuse-resonance');assert.equal(fuse.bullets.filter(b=>b.kind==='grenade').length,0);assert.equal(await page.evaluate(()=>__awakening.events.filter(e=>e.type==='grenade-burst').length),1);await hidden(page);
  await shoot(0);const released=await state(page);assert.equal(released.player.reversalAmmo,0);assert.equal(released.bullets.filter(b=>b.reflected).length,8);assert.ok(released.bullets.filter(b=>b.reflected).every(b=>b.damage===18));
  assert.equal(await page.evaluate(()=>__awakening.game.discoveredSecrets.size),6);return{observed};
});}
async function trialFlow(browser){await withGame(browser,'trial-six-waves-record-retry',{raw:JSON.stringify(['rebound','blade-relay','bullet-reversal','fuse-resonance','rail-resonance','ice-break'])},async page=>{
  await page.evaluate(()=>localStorage.setItem('frontier-best','4815'));
  await page.locator('#open-trials').click();assert.equal(await page.locator('.trial-route>div').count(),6);await page.locator('#start-trial').click();
  assert.equal(await page.evaluate(()=>__awakening.game.mode),'trial');
  const initial=await page.evaluate(()=>{const g=__awakening.game;return{seed:g.trial.seed,boss:g.trial.bossMapId,plans:g.trial.plans,rocks:g.obstacles.map(({x,y,radius})=>({x,y,radius}))};});
  // UI integration fixture: native wave scheduling, with explicit wide lethal EMP and health refill.
  // This is not a balance run and does not change wave counts, objectives, seeds or phase transitions.
  await page.evaluate(()=>{const g=__awakening.game,update=g.update;g.player.skillDamage=99999;g.player.skillRadius=5000;g.update=function(...args){if(this.phase==='playing'&&this.trial){this.player.hp=this.player.maxHp;if(this.trial.status==='combat'&&this.enemies.some(e=>e.hp>0)){this.player.skillCooldown=0;this.useSkill();}}return update.apply(this,args);};});
  const rewards=[],upgrades=[];const deadline=Date.now()+180000;
  while(Date.now()<deadline){
    const current=await page.evaluate(()=>({phase:__awakening.game.phase,wave:__awakening.game.trial.wave}));
    if(current.phase==='won')break;
    assert.notEqual(current.phase,'lost','Controlled UI run must reach result');
    if(current.phase==='trial-reward'){
      const buttons=page.locator('[data-trial-reward]');await buttons.first().waitFor();assert.equal(await buttons.count(),3);const frozen=await freeze(page,120),index=(current.wave-1)%3,id=await buttons.nth(index).getAttribute('data-trial-reward');
      if(current.wave===1)await shot(page,'trial-three-choices');await buttons.nth(index).click();rewards.push({wave:current.wave,id,frozen});
    }else if(current.phase==='upgrade'){
      const choice=page.locator('[data-upgrade]').first();await choice.waitFor();upgrades.push(await choice.getAttribute('data-upgrade'));await choice.click();
    }
    else await page.waitForTimeout(120);
  }
  await page.locator('#trial-retry').waitFor();assert.equal(await page.evaluate(()=>__awakening.game.phase),'won');assert.equal(rewards.length,5);assert.ok(upgrades.length>0,'Trial reward preserves pending level-up screen');
  const record=await page.evaluate(()=>new FrontierProfiles.Store({storage:localStorage}).snapshot.trial);assert.equal(record.wins,1);assert.equal(record.bestWave,6);assert.ok(record.bestTime>0);assert.equal(await page.evaluate(()=>localStorage.getItem('frontier-best')),'4815');await shot(page,'trial-result');
  await page.locator('#open-secrets').click();await page.locator('#close-secrets').click();assert.deepEqual(await page.evaluate(()=>new FrontierProfiles.Store({storage:localStorage}).snapshot.trial),record,'Returning from archive does not count win twice');
  await page.locator('#trial-retry').click();const replay=await page.evaluate(()=>{const g=__awakening.game;return{seed:g.trial.seed,boss:g.trial.bossMapId,plans:g.trial.plans,rocks:g.obstacles.map(({x,y,radius})=>({x,y,radius}))};});assert.deepEqual(replay,initial,'Same seed replays layout and encounter plans');
  async function defeat(){await page.evaluate(()=>{const g=__awakening.game;g.player.invulnerable=0;g.bullets.unshift({id:98765,type:'bullet',owner:'enemy',x:g.player.x,y:g.player.y,vx:0,vy:0,radius:4,lifetime:1,damage:99999,pierce:0,hitIds:[],color:'#f88'});});await page.locator('#trial-new').waitFor();}
  await defeat();await page.locator('#trial-new').click();const freshSeed=await page.evaluate(()=>__awakening.game.trial.seed);assert.notEqual(freshSeed,initial.seed);await defeat();await page.locator('#back-welcome').click();await page.locator('#start-run').click();assert.notEqual(await page.evaluate(()=>__awakening.game.mode),'trial');assert.equal(await page.evaluate(()=>__awakening.game.relays.length),3);assert.equal(await page.evaluate(()=>localStorage.getItem('frontier-best')),'4815');
  return{fixture:'Native requestAnimationFrame and original wave schedule; test-only lethal wide EMP and per-frame health refill. This proves UI integration, not normal-play difficulty.',initial,replay,freshSeed,rewards,upgrades,record};
});}
async function remoteHud(browser){await withGame(browser,'remote-emp-cost-and-reversal-hud',{},async page=>{
  await start(page);await scene(page);
  await page.keyboard.press('Digit4');await page.waitForTimeout(190);
  const aim=await page.evaluate(()=>{const r=__awakening.renderer,b=document.getElementById('world').getBoundingClientRect();return{x:b.left+r.width/2+300*r.scale,y:b.top+r.height/2};});await page.mouse.move(aim.x,aim.y);await page.mouse.down();await page.waitForTimeout(40);await page.mouse.up();
  await page.waitForFunction(()=>document.getElementById('skill-label').textContent==='投送遥爆'&&__awakening.game.skillTarget().x>=1420);
  const aria=await page.locator('#skill-button').getAttribute('aria-label');assert.ok(aria.includes('身边不释放'));
  const target=await page.evaluate(()=>{const t=__awakening.game.skillTarget();return{x:t.x,y:t.y,remote:t.remote};});assert.ok(target.remote);await trigger(page);await ready(page);
  const after=await state(page);assert.equal(after.bullets.filter(b=>b.id>=91000&&b.id<91005).length,5,'Remote EMP leaves local enemy bullets alive');assert.equal(after.player.reversalAmmo,0);assert.ok(await page.evaluate(()=>__awakening.events.some(e=>e.type==='grenade-burst'&&e.x>1210)));await finish(page);await hidden(page);
  await scene(page);await page.keyboard.press('Digit1');await trigger(page);await finish(page);await hidden(page);
  assert.ok((await page.locator('#weapon-name').textContent()).includes('逆流 5'));const storedLabel=await page.locator('#weapon-name').textContent();
  await page.waitForFunction(()=>__awakening.game.fireTimer<=0);await page.mouse.move(aim.x,aim.y);await page.mouse.down();await page.waitForTimeout(50);await page.mouse.up();await page.waitForFunction(()=>!document.getElementById('weapon-name').textContent.includes('逆流'));
  assert.equal(await page.evaluate(()=>__awakening.game.player.reversalAmmo),0);return{target,aria,localBulletsRetained:5,storedLabel,releasedLabel:await page.locator('#weapon-name').textContent()};
});}
async function archives(browser){
  const ids=['rebound','blade-relay','bullet-reversal','fuse-resonance','rail-resonance','ice-break'];
  await withGame(browser,'locked-archive-metadata-and-storage-filter',{raw:JSON.stringify(['rebound','rebound','invalid',null,4])},async page=>{
    await page.locator('#open-secrets').click();const state=await page.evaluate(()=>({ids:[...__awakening.game.discoveredSecrets],secrets:Expedition.SECRETS,cards:[...document.querySelectorAll('.secret-card')].map(e=>({locked:e.classList.contains('locked'),html:e.outerHTML,text:e.textContent,title:e.querySelector('h3').textContent}))}));assert.deepEqual(state.ids,['rebound']);
    for(const [index,card]of state.cards.entries()){const secret=state.secrets[index];if(card.locked){assert.equal(card.title,'？？？');for(const value of [secret.id,secret.title,secret.condition,secret.description])assert.ok(!card.html.includes(value));}else{for(const value of [secret.title,secret.condition,secret.description])assert.ok(card.text.includes(value));}}
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'open-secrets');return state;
  });
  await withGame(browser,'existing-discovery-revisit-keeps-records',{raw:JSON.stringify(ids)},async page=>{
    await page.locator('#open-secrets').click();const before=await page.evaluate(()=>({ids:[...__awakening.game.discoveredSecrets],stored:localStorage.getItem('frontier-guest-v1'),record:localStorage.getItem('frontier-account-v1'),phase:__awakening.game.phase,score:__awakening.game.score}));
    await page.locator('[data-revisit="ice-break"]').click();await page.locator('#revelation-overlay:not(.hidden)').waitFor();await ready(page);assert.ok((await page.locator('.revelation-kicker').textContent()).includes('回响重现'));const geometry=await layout(page);await finish(page,'Escape');await hidden(page);
    assert.ok(await page.locator('#screen-overlay.secret-screen').isVisible());assert.equal(await page.evaluate(()=>document.activeElement.dataset.revisit),'ice-break');assert.deepEqual(await page.evaluate(()=>({ids:[...__awakening.game.discoveredSecrets],stored:localStorage.getItem('frontier-guest-v1'),record:localStorage.getItem('frontier-account-v1'),phase:__awakening.game.phase,score:__awakening.game.score})),before);assert.equal(await page.evaluate(()=>__awakening.events.filter(e=>e.type==='secret-discovered').length),0);return{before,geometry};
  });
  for(const size of [{width:360,height:640},{width:390,height:844},{width:667,height:375},{width:844,height:390}])for(const unlocked of [false,true])await withGame(browser,`archive-${size.width}x${size.height}-${unlocked?'unlocked':'locked'}`,{size,mobile:true,raw:JSON.stringify(unlocked?ids:[])},async page=>{
    await page.locator('#open-secrets').tap();assert.equal(await page.locator('.secret-card').count(),6);assert.equal(await page.locator('.secret-card.discovered').count(),unlocked?6:0);
    const rows=[];for(const card of await page.locator('.secret-card').all()){
      for(const text of await card.locator('h3,p,.secret-status,button').all()){await text.evaluate(e=>e.scrollIntoView({block:'center'}));const r=await text.evaluate(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{text:e.textContent,pass:h===e||e.contains(h),x:r.x,width:r.width,height:r.height,button:e.tagName==='BUTTON',viewport:innerWidth};});assert.ok(r.pass&&r.x>=0&&r.x+r.width<=r.viewport+1);if(r.button)assert.ok(r.width>=44&&r.height>=44);rows.push(r);}
    }
    await page.locator('#close-secrets').scrollIntoViewIfNeeded();const button=await page.locator('#close-secrets').evaluate(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{width:r.width,height:r.height,hit:h===e||e.contains(h)};});assert.ok(button.width>=44&&button.height>=44&&button.hit);await page.locator('#close-secrets').tap();await page.locator('#start-run').tap();await page.locator('#pause-toggle').tap();const before=await state(page);await page.locator('#open-secrets').tap();await page.waitForTimeout(80);assert.deepEqual(await state(page),before);await page.locator('#close-secrets').tap();assert.ok(await page.locator('#resume-run').isVisible());return{rows,button};
  });
}
async function trialMobileMenus(browser){
  for(const [width,height,full]of [[360,640,false],[390,844,false],[667,375,false],[844,390,false],[360,640,true],[667,375,true]])await withGame(browser,`trial-menu-${width}x${height}-${full?'full':'normal'}`,{size:{width,height},mobile:true},async page=>{
    async function menuHits(selector){const hits=[];for(const button of await page.locator(selector).all()){await button.scrollIntoViewIfNeeded();const data=await button.evaluate(e=>{const r=e.getBoundingClientRect();return{id:e.id||e.dataset.trialReward,width:r.width,height:r.height,hits:[[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]].map(([x,y])=>{const h=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);return h===e||e.contains(h);})};});assert.ok(data.width>=44&&data.height>=44&&data.hits.every(Boolean),'Trial menu target smaller than 44px or obscured: '+JSON.stringify(data));hits.push(data);}return hits;}
    if(full){await page.locator('#fullscreen-toggle').tap();await page.waitForFunction(()=>!!document.fullscreenElement);}
    await page.locator('#open-trials').tap();const intro=await menuHits('#start-trial,#close-trial-intro');await page.locator('#start-trial').tap();
    // Layout-only boundary fixture; the separate full trial case clears all original waves on native rAF.
    await page.evaluate(()=>{const g=__awakening.game;g.trial.status='combat';g.trial.spawned=g.trial.quota;g.enemies=[];});await page.locator('[data-trial-reward]').first().waitFor();const frozen=await freeze(page,120),choices=await menuHits('[data-trial-reward]');assert.equal(choices.length,3);await shot(page,`trial-menu-${width}x${height}-${full?'full':'normal'}`);await page.locator('[data-trial-reward]').first().tap();assert.equal(await page.evaluate(()=>__awakening.game.trial.wave),2);
    await page.evaluate(()=>{const g=__awakening.game;g.player.invulnerable=0;g.bullets.unshift({id:98766,type:'bullet',owner:'enemy',x:g.player.x,y:g.player.y,vx:0,vy:0,radius:4,lifetime:1,damage:99999,pierce:0,hitIds:[],color:'#f88'});});await page.locator('#trial-retry').waitFor();const result=await menuHits('#trial-retry,#trial-new,#back-welcome,#open-secrets');return{fixture:'UI boundary fixture completes a prepared first wave; no balance claim',intro,choices,result,frozen};
  });
}
(async()=>{
  const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});report.browser=browser.version();
  try{if(!process.argv.includes('--trials-only')){await single(browser);await queueAndPersistence(browser);for(const phase of ['upgrade','relic','won','lost'])await priority(browser,phase);await audioAndStorage(browser);await mobile(browser);await archives(browser);if(!process.argv.includes('--ui-only')){await allSix(browser);await remoteHud(browser);}}await trialMobileMenus(browser);await trialFlow(browser);}
  finally{await browser.close();report.passed=report.cases.filter(c=>c.pass).length;report.failed=report.cases.filter(c=>!c.pass).length;report.completedAt=new Date().toISOString();save();}
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,errors:report.errors}));if(report.failed||report.errors.length)process.exitCode=1;
})().catch(error=>{report.failure=error.stack;save();console.error(error);process.exitCode=1;});
