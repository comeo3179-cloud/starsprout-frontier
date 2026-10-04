/* Rift encounters UI acceptance. Real source/release/online assets, isolated guest Edge contexts.
 * Layout/phase fixtures may position the player or prepare a ready encounter; only the
 * public-action case measures a naturally completed challenge under native requestAnimationFrame.
 * Usage: node scripts/check-encounter-ui.cjs [--release | --online URL] [--public-only | --ui-only | --boundaries | --polish]
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let chromium;try{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}catch(error){if(process.env.PLAYWRIGHT_MODULE)throw error;({chromium}=require('../build-tools/browser/node_modules/playwright'));}
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),release=args.includes('--release'),onlineIndex=args.indexOf('--online');
const online=onlineIndex>=0,onlineUrl=online?(args[onlineIndex+1]&&!args[onlineIndex+1].startsWith('--')?args[onlineIndex+1]:'https://starsprout-playtest-d7bqa2fc8da1-1494842646.tcloudbaseapp.com/'):null;
const caseIndex=args.indexOf('--case'),caseFilter=caseIndex>=0?args[caseIndex+1]:'';
const mode=online?'online':release?'release':'source',origin=online?new URL(onlineUrl).origin:'http://127.0.0.1:4182',folder=release?path.join(root,'release/web'):root;
const boundaries=args.includes('--boundaries'),polish=args.includes('--polish');
const outputFolder=path.join(root,'reports','encounter-ui-'+mode),output=path.join(outputFolder,polish?'results-polish.json':boundaries?'results-boundaries.json':caseFilter?'results-'+caseFilter.replace(/[^a-z0-9-]/gi,'_')+'.json':args.includes('--public-only')?'results-public.json':args.includes('--ui-only')?'results-ui.json':'results.json'),cache=new Map();
const simulator=fs.readFileSync(path.join(root,'scripts/simulate-expedition.js'),'utf8'),botSource=simulator.slice(simulator.indexOf('function seededRandom('),simulator.indexOf('\nfunction simulate('));
const report={timestamp:new Date().toISOString(),mode,onlineUrl,selection:polish?'polish':boundaries?'boundaries':caseFilter||args.includes('--ui-only')?'ui-or-filtered':args.includes('--public-only')?'public-only':'full',note:'Isolated headless Edge and guest storage; no account mutations. Public-action cases use ordinary Game actions, original stats, native rAF/update and DOM reward choices. Other cases explicitly prepare layout and competing phase states, not difficulty/performance evidence. Mobile dimensions and CSS safe-area fixtures do not represent physical phones.',files:{},cases:[],errors:[]};
fs.mkdirSync(outputFolder,{recursive:true});
function save(){fs.writeFileSync(output,JSON.stringify(report,null,2));}
function observe(){
  const q=window.__encounterQA={events:[],updates:0,auto:false,kind:'race',sampled:[],bot:new Explorer(),inputs:0};let api,renderer;
  q.bot.route=function(game){
    const encounter=game.encounters.find(item=>item.kind===q.kind);
    if(!encounter||['failed','complete'].includes(encounter.status)){q.auto=false;return game.player;}
    const target=game.encounterTarget(encounter)||encounter;
    if(['idle','ready'].includes(encounter.status)&&distance(game.player,encounter)<65&&game.interactionState().target===encounter)game.interact();
    if(encounter.kind==='rings'&&encounter.status==='active'&&distance(game.player,target)<15)return game.player;
    return target;
  };
  Object.defineProperty(window,'Expedition',{configurable:true,get:()=>api,set(value){api=value;api.Game=new Proxy(api.Game,{construct(target,args,next){
    const game=Reflect.construct(target,[{...args[0],random:seededRandom(731)}],next);q.game=game;
    const update=game.update,drain=game.drainEvents;
    game.update=function(dt,input){q.updates++;if(q.auto&&this.phase==='playing'){input=q.bot.input(this);q.inputs++;if(q.inputs%60===0)q.sampled.push({elapsed:this.elapsed,hp:this.player.hp,x:this.player.x,y:this.player.y,encounters:this.encounters.map(e=>({kind:e.kind,status:e.status,progress:e.progress,remaining:e.remaining}))});}return update.call(this,dt,input);};
    game.drainEvents=function(){const events=drain.call(this);q.events.push(...events.map(event=>({...event})));return events;};return game;
  }});}});
  Object.defineProperty(window,'ExpeditionRenderer',{configurable:true,get:()=>renderer,set(value){renderer=new Proxy(value,{construct(target,args,next){const value=Reflect.construct(target,args,next);q.renderer=value;return value;}});}});
  localStorage.setItem('frontier-sound','off');
}
async function create(browser,settings={}){
  const context=await browser.newContext({viewport:settings.size||{width:1440,height:1000},isMobile:!!settings.mobile,hasTouch:!!settings.mobile,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    const name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
    try{
      if(!cache.has(name)){
        if(online){const response=await route.fetch();if(!response.ok())return route.fulfill({response});cache.set(name,{body:await response.body(),type:response.headers()['content-type']});}
        else{const file=path.resolve(folder,name);if(!file.startsWith(folder+path.sep))return route.abort();cache.set(name,{body:fs.readFileSync(file),type:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8'});}
      }
      const value=cache.get(name);report.files[name]=crypto.createHash('sha256').update(value.body).digest('hex');await route.fulfill({body:value.body,contentType:value.type});
    }catch(error){await route.fulfill({status:404,body:''});}
  });
  await context.addInitScript({content:'(()=>{const options={mode:"explore",build:"reactor"},distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);'+botSource+'\n('+observe.toString()+')();})();'});
  if(settings.accountMock)await context.addInitScript(()=>{
    const snapshot={secrets:[],bestScore:0,coachDone:false,trial:{wins:0,bestTime:null,bestWave:0}};
    let session={uid:'boundary-account-a',label:'边界甲'},listener;
    const facade={adapter:{load:async()=>structuredClone(snapshot),merge:async(_uid,payload)=>({snapshot:structuredClone(snapshot),acknowledgedRunIds:payload.runs.map(run=>run.id)})},init:async()=>session,getSession:async()=>session,onSession:callback=>{listener=callback;},configured:true};
    Object.defineProperty(window,'FrontierCloud',{configurable:true,get:()=>facade,set:()=>{}});
    window.__changeBoundarySession=identity=>{session=identity;listener(identity);};
    localStorage.setItem('frontier-account-v1',JSON.stringify(session));
  });
  if(settings.knownSecrets)await context.addInitScript(()=>localStorage.setItem('frontier-secrets-v1',JSON.stringify(['rebound','blade-relay','bullet-reversal','fuse-resonance','rail-resonance','ice-break'])));
  const page=await context.newPage();page.setDefaultTimeout(6500);page.on('pageerror',error=>report.errors.push({case:settings.name,error:error.message}));
  await page.goto(online?onlineUrl:origin+'/');await page.locator('#open-rifts').waitFor();
  await page.waitForFunction(()=>window.__encounterQA?.game?.encounters);
  return{context,page};
}
async function shot(page,name){await page.screenshot({path:path.join(outputFolder,name+'.png')});}
async function test(browser,name,settings,body){if(caseFilter&&!name.includes(caseFilter))return;let page,context;try{({page,context}=await create(browser,{...settings,name}));const data=await body(page);report.cases.push({name,pass:true,...data});console.log('PASS '+name);}catch(error){if(page)await shot(page,name+'-failure').catch(()=>{});const state=page?await page.evaluate(()=>{const g=window.__encounterQA?.game;return g?{phase:g.phase,elapsed:g.elapsed,tacticId:g.tacticId,encounters:g.encounters,screen:document.getElementById('screen-content')?.textContent}:null;}).catch(()=>null):null;report.cases.push({name,pass:false,error:error.stack,state});console.error('FAIL '+name+': '+error.message);}finally{if(context)await context.close();save();}}
async function hit(page,selector,{mobile=false}={}){
  const target=page.locator(selector).first();await target.scrollIntoViewIfNeeded();
  const value=await target.evaluate(element=>{const b=element.getBoundingClientRect();return{text:element.textContent,width:b.width,height:b.height,x:b.x,y:b.y,hits:[[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]].map(([x,y])=>{const h=document.elementFromPoint(b.x+b.width*x,b.y+b.height*y);return h===element||element.contains(h);}),clipped:element.scrollWidth>element.clientWidth+1};});
  assert.ok(value.hits.every(Boolean),selector+' is visually obstructed: '+JSON.stringify(value));assert.equal(value.clipped,false,selector+' text is horizontally clipped');
  if(mobile)assert.ok(value.width>=44&&value.height>=44,selector+' is below 44px: '+JSON.stringify(value));return value;
}
async function start(page,{map='frontier',full=false,guide=true}={}){
  if(map!=='frontier')await page.locator('[data-map="'+map+'"]').click();
  if(full){await page.locator('#fullscreen-toggle').click();await page.waitForFunction(()=>!!document.fullscreenElement||document.getElementById('game-stage').classList.contains('immersive'));}
  if(guide){await page.locator('#open-rifts').click();await page.locator('#start-rift-run').click();}else await page.locator('#start-run').click();
  await page.waitForFunction(()=>__encounterQA.game.phase==='playing');
}
async function freeze(page,duration=180){
  await page.waitForTimeout(35);const snapshot=()=>page.evaluate(()=>{const g=__encounterQA.game;return{elapsed:g.elapsed,phase:g.phase,encounters:g.encounters.map(e=>({status:e.status,remaining:e.remaining,progress:e.progress})),tacticId:g.tacticId,updates:__encounterQA.updates};});
  const before=await snapshot();await page.waitForTimeout(duration);const after=await snapshot();assert.deepEqual(after,before,'World/update changed behind a menu');return before;
}
async function prepareReady(page,kind='race'){
  await page.evaluate(kind=>{const g=__encounterQA.game,e=g.encounters.find(e=>e.kind===kind);g.player.invulnerable=999;g.player.x=e.x;g.player.y=e.y;g.player.dashTimer=0;e.status='ready';e.progress=e.goal;g.enemies=[];g.bullets=[];g.hazards=[];},kind);
  await page.waitForTimeout(120);await page.locator('#touch-interact').isVisible()?await page.locator('#touch-interact').click():await page.keyboard.press('KeyE');
  await page.locator('[data-tactic]').first().waitFor();assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'tactic');
  assert.notEqual(await page.locator('#mission-state').textContent(),'undefined','Tactic phase has a human-readable status');
}
async function select(page,index=0){const card=page.locator('[data-tactic]').nth(index),id=await card.getAttribute('data-tactic');await card.click();await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>__encounterQA.game.tacticId),id);return id;}
async function activeEncounter(browser,kind){await test(browser,'active-pause-timeout-'+kind,{},async page=>{
  await start(page);await page.evaluate(kind=>{const g=__encounterQA.game,e=g.encounters.find(e=>e.kind===kind);g.player.x=e.x;g.player.y=e.y;g.player.invulnerable=999;},kind);await page.waitForTimeout(100);await page.keyboard.press('KeyE');
  await page.waitForFunction(kind=>__encounterQA.game.encounters.find(e=>e.kind===kind).status==='active',kind);await page.waitForTimeout(140);
  if(kind!=='hunt'){await page.evaluate(kind=>{const g=__encounterQA.game,node=g.encounterTarget(g.encounters.find(e=>e.kind===kind));g.player.x=node.x;g.player.y=node.y;},kind);await page.waitForTimeout(120);}
  await shot(page,'active-'+kind);
  const hud=await page.evaluate(kind=>{const e=__encounterQA.game.encounters.find(e=>e.kind===kind);return{name:e.name,objective:document.getElementById('objective-text').textContent,tracked:document.getElementById('tracked-target').textContent,progress:document.getElementById('relay-progress-label').textContent,visible:!document.getElementById('relay-progress-wrap').classList.contains('hidden')};},kind);
  assert.ok(hud.visible&&hud.objective.includes(hud.name),'Active challenge has a clear objective HUD');assert.ok(hud.progress.length>0&&hud.tracked.length>0);
  await page.keyboard.press('KeyP');const pause=await freeze(page);await page.locator('#resume-run').click();
  await page.keyboard.press('KeyM');const map=await freeze(page);await page.locator('#close-map').click();
  await page.evaluate(kind=>{const e=__encounterQA.game.encounters.find(e=>e.kind===kind);e.elapsed=e.duration-.015;e.remaining=.015;},kind);
  await page.waitForFunction(kind=>__encounterQA.game.encounters.find(e=>e.kind===kind).status==='failed',kind);await page.waitForTimeout(120);
  const end=await page.evaluate(kind=>{const q=__encounterQA,g=q.game,e=g.encounters.find(e=>e.kind===kind);return{phase:g.phase,status:e.status,tacticId:g.tacticId,failEvents:q.events.filter(event=>event.type==='encounter-failed'&&event.encounterId===e.id).length,canClaim:g.interact(),objective:g.currentObjective};},kind);
  assert.equal(end.phase,'playing');assert.equal(end.failEvents,1);assert.equal(end.canClaim,false);assert.equal(end.tacticId,'');await shot(page,'timeout-'+kind);return{fixture:'Player positioned at terminal; last 15ms of deadline prepared after native pause checks',hud,pause,map,end};
});}
async function guideAndMap(browser,map){await test(browser,'guide-map-'+map,{},async page=>{
  if(map!=='frontier')await page.locator('[data-map="'+map+'"]').click();const entry=await hit(page,'#open-rifts');await page.locator('#open-rifts').click();const guide=await page.locator('#screen-content').textContent();
  assert.ok(guide.includes('45')&&guide.includes('60'),'Guide explains time limits');await hit(page,'#start-rift-run');await shot(page,'guide-'+map);await page.locator('#start-rift-run').click();
  const data=await page.evaluate(()=>({map:__encounterQA.game.map.id,kinds:__encounterQA.game.encounters.map(e=>e.kind),oldWeapons:Expedition.WEAPONS.length}));assert.equal(data.map,map);assert.deepEqual(data.kinds.toSorted(),['hunt','race','rings']);assert.equal(data.oldWeapons,5);
  await page.keyboard.press('KeyM');assert.equal(await page.locator('[data-encounter]').count(),3);await freeze(page);
  const target=page.locator('[data-encounter]').first(),targetId=await target.getAttribute('data-encounter');await target.click();await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'playing');
  return{entry,guide,map:data,targetId};
});}
async function publicAction(browser,kind){await test(browser,'public-native-'+kind+'-complete',{knownSecrets:true},async page=>{
  await start(page);const initial=await page.evaluate(kind=>{const g=__encounterQA.game;return{hp:g.player.hp,maxHp:g.player.maxHp,speed:g.player.speed,damage:g.player.damageMultiplier,encounter:g.encounters.find(e=>e.kind===kind)};},kind);
  await page.evaluate(kind=>{__encounterQA.kind=kind;__encounterQA.auto=true;},kind);
  const startTime=Date.now(),upgrades=[];while(Date.now()-startTime<150000){
    const state=await page.evaluate(kind=>({phase:__encounterQA.game.phase,status:__encounterQA.game.encounters.find(e=>e.kind===kind).status}),kind);
    if(state.phase==='tactic')break;
    assert.ok(state.phase!=='lost'&&state.status!=='failed','Public bot did not complete: '+JSON.stringify(state));
    if(state.phase==='upgrade'){const card=page.locator('[data-upgrade]').first();upgrades.push(await card.getAttribute('data-upgrade'));await card.click();}
    await page.waitForTimeout(100);
  }
  assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'tactic','Public bot must reach real reward');
  const proof=await page.evaluate(()=>({samples:__encounterQA.sampled,inputs:__encounterQA.inputs,events:__encounterQA.events.filter(e=>e.type.startsWith('encounter')),gameTime:__encounterQA.game.elapsed,hp:__encounterQA.game.player.hp}));
  assert.ok(proof.inputs>100);await freeze(page);await shot(page,'public-'+kind+'-reward');const tactic=await select(page);await page.evaluate(()=>__encounterQA.auto=false);
  if(await page.evaluate(()=>__encounterQA.game.phase==='upgrade'))await page.locator('[data-upgrade]').first().click();
  assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'playing');assert.equal(await page.evaluate(kind=>__encounterQA.game.encounters.find(e=>e.kind===kind).status,kind),'complete');
  return{initial,tactic,upgrades,wallSeconds:(Date.now()-startTime)/1000,...proof};
});}
async function mobile(browser,size,full){const name=`layout-${size.width}x${size.height}-${full?'full':'normal'}`;await test(browser,name,{size,mobile:true},async page=>{
  await hit(page,'#open-rifts',{mobile:true});await start(page,{full});
  await page.locator('#field-map-toggle').click();const cards=[];for(const card of await page.locator('[data-encounter]').all()){const id=await card.getAttribute('data-encounter');cards.push(await hit(page,'[data-encounter="'+id+'"]',{mobile:true}));}
  await page.locator('[data-encounter]').first().click();await prepareReady(page);await freeze(page);
  const choices=[];for(const card of await page.locator('[data-tactic]').all()){const id=await card.getAttribute('data-tactic');choices.push(await hit(page,'[data-tactic="'+id+'"]',{mobile:true}));}
  await shot(page,name+'-tactic');const tactic=await select(page);if(await page.evaluate(()=>__encounterQA.game.phase==='upgrade'))await page.locator('[data-upgrade]').first().click();
  await page.locator(full?'#fullscreen-pause':'#pause-toggle').click();await freeze(page);await hit(page,'#resume-run',{mobile:true});await page.locator('#resume-run').click();
  assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'playing');return{cards,choices,tactic};
});}
async function priority(browser){await test(browser,'tactic-revelation-upgrade-priority',{},async page=>{
  await start(page);
  await page.evaluate(()=>{const g=__encounterQA.game,e=g.encounters[0],p=g.player;g.enemies=[];g.bullets=[];g.hazards=[];p.x=e.x;p.y=e.y;p.skillCooldown=0;p.invulnerable=999;e.status='ready';e.progress=e.goal;
    for(let i=0;i<5;i++)g.bullets.push({id:99000+i,type:'bullet',owner:'enemy',x:p.x+40+i*2,y:p.y,vx:0,vy:0,radius:4,lifetime:4,damage:1,pierce:0,color:'#f88'});
    const use=g.useSkill;g.useSkill=function(...args){const result=use.apply(this,args);this.interact();p.xp=p.xpNeeded;return result;};
  });
  await page.keyboard.press('KeyQ');
  await page.locator('#revelation-overlay:not(.hidden)').waitFor();assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'tactic');const frozen=await freeze(page);assert.equal(await page.locator('#screen-overlay').evaluate(e=>e.inert),true);
  await page.waitForFunction(()=>!document.getElementById('revelation-continue').disabled);await shot(page,'tactic-behind-revelation');await page.locator('#revelation-continue').click();await page.locator('[data-tactic]').first().waitFor();
  const id=await page.locator('[data-tactic]').first().evaluate(button=>{const id=button.dataset.tactic;button.click();button.click();return id;});
  await page.locator('[data-upgrade]').first().waitFor();assert.equal(await page.evaluate(()=>__encounterQA.game.tacticId),id);assert.equal(await page.evaluate(()=>__encounterQA.game.chooseTactic('not-a-tactic')),false);assert.equal(await page.evaluate(id=>__encounterQA.game.chooseTactic(id),id),false);
  await page.locator('[data-upgrade]').first().click();assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'playing');
  return{frozen,tactic:id};
});}
async function resultSummary(browser){await test(browser,'result-tactic-summary',{},async page=>{
  await start(page);await prepareReady(page,'hunt');const id=await select(page);
  const title=await page.evaluate(id=>Expedition.TACTICS.find(t=>t.id===id).title,id);
  await page.evaluate(()=>{const g=__encounterQA.game;g.enemies=[];const boss=g.spawnEnemy('boss',{x:g.player.x+80,y:g.player.y});boss.hp=1;g.player.skillCooldown=0;g.useSkill();});
  await page.locator('#screen-overlay.result-screen').waitFor();const text=await page.locator('#screen-content').textContent();assert.ok(text.includes(title),'Result must disclose equipped run module');await shot(page,'result-tactic-summary');return{id,title,text};
});}
async function replaceTactic(browser){await test(browser,'single-slot-replace-no-duplicate-reward',{},async page=>{
  await start(page);await prepareReady(page,'race');const first=await select(page);
  await page.evaluate(()=>{const g=__encounterQA.game;g.tactical.cooldown=5;g.tactical.decoy={x:g.player.x,y:g.player.y,remaining:4};g.tactical.mine={x:g.player.x,y:g.player.y,remaining:4,radius:30,blastRadius:90,damage:1};});
  await prepareReady(page,'rings');const before=await page.evaluate(()=>({credits:__encounterQA.game.player.credits,cooldown:__encounterQA.game.tactical.cooldown}));
  assert.equal(await page.locator('[data-tactic]').count(),3);assert.ok((await page.locator('[data-tactic="'+first+'"]').textContent()).includes('保留'));const second=await select(page,1);
  const result=await page.evaluate(()=>{const g=__encounterQA.game;return{tacticId:g.tacticId,decoy:g.tactical.decoy,mine:g.tactical.mine,cooldown:g.tactical.cooldown,credits:g.player.credits,secondClaim:g.interact(),completed:g.encounters.filter(e=>e.status==='complete').length};});
  assert.notEqual(first,second);assert.equal(result.completed,2);assert.equal(result.decoy,null);assert.equal(result.mine,null);assert.ok(result.cooldown>0&&result.cooldown<=before.cooldown);assert.equal(result.credits,before.credits);assert.equal(result.secondClaim,false);
  return{first,second,before,result};
});}
async function boundaryCases(browser){
  await test(browser,'boundary-tactic-rotate-blur-escape',{size:{width:360,height:640},mobile:true},async page=>{
    await start(page,{full:true});await prepareReady(page);const before=await freeze(page);
    const choices=await page.locator('[data-tactic]').evaluateAll(buttons=>buttons.map(button=>button.dataset.tactic));
    await page.setViewportSize({width:667,height:375});await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    for(const key of ['Escape','KeyP','KeyM','Tab'])await page.keyboard.press(key);
    await freeze(page);assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'tactic');
    assert.deepEqual(await page.locator('[data-tactic]').evaluateAll(buttons=>buttons.map(button=>button.dataset.tactic)),choices);
    await page.locator('#fullscreen-exit').click();await page.waitForFunction(()=>!document.fullscreenElement&&!document.getElementById('game-stage').classList.contains('immersive'));
    await page.setViewportSize({width:360,height:640});const after=await freeze(page);assert.equal(after.elapsed,before.elapsed);assert.deepEqual(after.encounters,before.encounters);
    await shot(page,'boundary-tactic-after-rotation');await page.keyboard.press('Digit2');
    assert.equal(await page.evaluate(()=>__encounterQA.game.tacticId),choices[1]);assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'playing');
    return{before,after,tactic:choices[1],note:'Real viewport rotation/fullscreen exit and DOM keyboard; synthetic blur event only.'};
  });
  await test(browser,'boundary-guide-origin-and-active-clock',{size:{width:667,height:375},mobile:true},async page=>{
    await page.locator('#open-rifts').click();await page.keyboard.press('Escape');await page.locator('#start-run').waitFor();assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'ready');
    await start(page);await page.evaluate(()=>{const g=__encounterQA.game,e=g.encounters.find(e=>e.kind==='rings');g.player.x=e.x;g.player.y=e.y;g.player.invulnerable=999;});await page.waitForTimeout(140);await page.locator('#touch-interact').click();
    await page.waitForFunction(()=>__encounterQA.game.encounters.find(e=>e.kind==='rings').status==='active');await page.locator('#pause-toggle').click();await page.locator('#pause-rifts').click();const before=await freeze(page);
    await page.setViewportSize({width:360,height:640});await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.press('Escape');await page.locator('#resume-run').waitFor();await freeze(page);
    await page.locator('#pause-rifts').click();await page.locator('#rift-map').click();await page.locator('[data-encounter]').first().waitFor();await page.keyboard.press('Escape');await page.locator('#resume-run').waitFor();const after=await freeze(page);
    assert.deepEqual(after.encounters,before.encounters);assert.equal(after.elapsed,before.elapsed);await shot(page,'boundary-guide-pause-return');await page.locator('#resume-run').click();await page.waitForTimeout(160);
    const resumed=await page.evaluate(()=>__encounterQA.game.encounters.find(e=>e.kind==='rings').remaining);assert.ok(resumed<before.encounters.find(e=>e.status==='active').remaining);return{before,after,resumed};
  });
  await test(browser,'boundary-external-session-clears-old-reward',{accountMock:true},async page=>{
    await start(page);await prepareReady(page);await page.locator('[data-tactic]').first().evaluate(button=>{window.__oldTacticButton=button;});
    const previous=await page.evaluate(()=>({credits:__encounterQA.game.player.credits,phase:__encounterQA.game.phase}));
    await page.evaluate(()=>__changeBoundarySession({uid:'boundary-account-b',label:'边界乙'}));await page.locator('#open-account').waitFor();await page.waitForFunction(()=>document.getElementById('open-account').textContent.includes('边界乙'));
    await page.evaluate(()=>__oldTacticButton.click());await freeze(page);
    const account=await page.evaluate(()=>({phase:__encounterQA.game.phase,tactic:__encounterQA.game.tacticId,completed:__encounterQA.game.encounters.filter(e=>e.status==='complete').length,identity:JSON.parse(localStorage.getItem('frontier-account-v1')),notice:document.getElementById('notification').textContent}));
    assert.equal(account.phase,'ready');assert.equal(account.tactic,'');assert.equal(account.completed,0);assert.equal(account.identity.uid,'boundary-account-b');assert.ok(account.notice.includes('登录状态已变更'));
    await page.locator('#open-rifts').click();await page.evaluate(()=>__changeBoundarySession({uid:'boundary-account-c',label:'边界丙'}));await page.locator('#open-account').waitFor();assert.equal(await page.evaluate(()=>__encounterQA.game.phase),'ready');assert.equal(await page.locator('#close-rifts').count(),0);
    await shot(page,'boundary-account-return-camp');return{previous,account,note:'Mock authoritative SDK session only; real store/action/reward UI. Cross-UID reset deliberately discards old run and prevents transferring an unselected module.'};
  });
}
async function polishCases(browser){
  for(const kind of ['race','rings','hunt'])await test(browser,'polish-explicit-target-'+kind,{},async page=>{
    await start(page);await page.evaluate(kind=>{const g=__encounterQA.game,e=g.encounters.find(e=>e.kind===kind);g.player.x=e.x;g.player.y=e.y;g.player.invulnerable=999;},kind);await page.waitForTimeout(130);await page.keyboard.press('KeyE');await page.waitForFunction(kind=>__encounterQA.game.encounters.find(e=>e.kind===kind).status==='active',kind);
    await page.keyboard.press('KeyM');const relay=await page.locator('[data-target]:not(:disabled)').first().getAttribute('data-target');await page.locator('[data-target="'+relay+'"]').click();await page.waitForTimeout(130);
    const main=await page.evaluate(()=>({tracked:document.getElementById('tracked-target').textContent,encounter:__encounterQA.renderer.trackedEncounterId,relay:__encounterQA.renderer.trackedRelayId,progress:document.getElementById('relay-progress-label').textContent,visible:!document.getElementById('relay-progress-wrap').classList.contains('hidden')}));
    assert.equal(main.encounter,null,'Explicit main quest must override the active challenge arrow');assert.equal(main.relay,Number(relay));assert.ok(main.visible&&main.progress.includes('s'),'Untracked active challenge keeps its deadline');
    await page.keyboard.press('KeyM');const contract=await page.locator('[data-contract]:not(:disabled)').first().getAttribute('data-contract');await page.locator('[data-contract="'+contract+'"]').click();await page.waitForTimeout(130);assert.equal(await page.evaluate(()=>__encounterQA.renderer.trackedContractId),Number(contract));assert.equal(await page.evaluate(()=>__encounterQA.renderer.trackedEncounterId),null);
    await page.keyboard.press('KeyM');const id=await page.evaluate(kind=>__encounterQA.game.encounters.find(e=>e.kind===kind).id,kind);await page.locator('[data-encounter="'+id+'"]').click();await page.waitForTimeout(130);
    const notice=await page.locator('#notification').textContent();assert.match(notice,kind==='race'?/节点/:kind==='rings'?/环/:/守卫/);assert.ok(!notice.includes('到达终端后交互'),'Active challenge must describe its live objective');assert.equal(await page.evaluate(()=>__encounterQA.renderer.trackedEncounterId),id);
    assert.equal(await page.locator('#field-coach').evaluate(e=>e.classList.contains('hidden')),true,'Generic coach must not conflict with active challenge');
    await page.evaluate(kind=>{const e=__encounterQA.game.encounters.find(e=>e.kind===kind);e.status='ready';e.progress=e.goal;},kind);await page.waitForTimeout(130);assert.equal(await page.locator('#field-coach').evaluate(e=>e.classList.contains('hidden')),true,'Generic coach must stay suppressed while returning for the tracked reward');
    await page.keyboard.press('KeyM');await page.locator('[data-encounter="'+id+'"]').click();await page.waitForTimeout(90);const readyNotice=await page.locator('#notification').textContent();assert.match(readyNotice,/返回|领奖|领取|奖励/);await shot(page,'polish-target-'+kind);return{main,contract,notice,readyNotice};
  });
  await test(browser,'polish-ring-countdown-pause',{},async page=>{
    await start(page);await page.evaluate(()=>{const g=__encounterQA.game,e=g.encounters.find(e=>e.kind==='rings');g.player.x=e.x;g.player.y=e.y;g.player.invulnerable=999;});await page.waitForTimeout(130);await page.keyboard.press('KeyE');
    await page.evaluate(()=>{const e=__encounterQA.game.encounters.find(e=>e.kind==='rings');e.elapsed=3.3;e.remaining=e.duration-e.elapsed;});await page.waitForTimeout(160);
    const before=await page.locator('#relay-wave-label').textContent();assert.match(before,/换环|切换/);assert.equal(await page.locator('#relay-wave-label').isVisible(),true);await page.keyboard.press('KeyP');await freeze(page);const paused=await page.locator('#relay-wave-label').textContent();await page.waitForTimeout(300);assert.equal(await page.locator('#relay-wave-label').textContent(),paused);
    await page.locator('#resume-run').click();await page.waitForFunction(()=>__encounterQA.game.encounters.find(e=>e.kind==='rings').activeNode===1);await page.waitForTimeout(110);
    const after=await page.locator('#relay-wave-label').textContent();assert.match(after,/换环|切换/);assert.notEqual(after,before);await shot(page,'polish-ring-switch');return{before,paused,after};
  });
  for(const size of [{width:360,height:640},{width:667,height:375}])await test(browser,'polish-mobile-rings-'+size.width+'x'+size.height,{mobile:true,size},async page=>{
    await start(page,{full:true});await page.evaluate(()=>{const g=__encounterQA.game,e=g.encounters.find(e=>e.kind==='rings');g.player.x=e.x;g.player.y=e.y;g.player.invulnerable=999;});await page.waitForTimeout(130);await page.locator('#touch-interact').click();await page.waitForTimeout(160);
    const outside=await page.locator('#relay-progress-label').textContent();assert.match(outside,/换环/);assert.equal(await page.locator('#relay-progress-label').isVisible(),true);assert.equal(await page.locator('#relay-progress-wrap').evaluate(e=>e.classList.contains('outside')),true);
    await page.evaluate(()=>{const g=__encounterQA.game,e=g.encounters.find(e=>e.kind==='rings'),node=g.encounterTarget(e);g.player.x=node.x;g.player.y=node.y;});await page.waitForTimeout(180);
    const inside=await page.locator('#relay-progress-label').textContent();assert.match(inside,/换环/);assert.equal(await page.locator('#relay-progress-wrap').evaluate(e=>e.classList.contains('outside')),false);
    const box=await page.locator('#relay-progress-label').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,text:e.textContent}));assert.ok(box.width>0&&box.scroll<=box.width+1,'Mobile ring progress must not overflow');await shot(page,'polish-mobile-rings-'+size.width+'x'+size.height);
    await page.locator('#fullscreen-pause').click();await freeze(page);const paused=await page.locator('#relay-progress-label').textContent();await page.waitForTimeout(200);assert.equal(await page.locator('#relay-progress-label').textContent(),paused);return{outside,inside,box};
  });
  for(const size of [{width:360,height:640},{width:667,height:375},{width:844,height:390},{width:1024,height:600}])await test(browser,'polish-mobile-module-'+size.width+'x'+size.height,{mobile:true,size},async page=>{
    await start(page,{full:true});await prepareReady(page);await select(page,0);
    await page.evaluate(()=>{const g=__encounterQA.game;g.player.invulnerable=999;g.player.dashCooldown=0;g.tactical.cooldown=5;});await page.waitForTimeout(130);
    const ready=await page.locator('#dash-label').textContent();assert.match(ready,/诱饵/);assert.match(ready,/\d/);assert.equal(await page.locator('#dash-button').isDisabled(),false,'Tactic deployment cooldown must not disable ordinary dash');await hit(page,'#dash-button',{mobile:true});
    const readyBounds=await page.locator('#dash-label').evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);const parent=e.closest('button').getBoundingClientRect();return{outer:{x:parent.x,y:parent.y,right:parent.right,bottom:parent.bottom},rects:[...range.getClientRects()].map(r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom}))};});assert.ok(readyBounds.rects.length&&readyBounds.rects.every(r=>r.x>=readyBounds.outer.x-1&&r.y>=readyBounds.outer.y-1&&r.right<=readyBounds.outer.right+1&&r.bottom<=readyBounds.outer.bottom+1),'Ready dash text stays inside its touch button');await shot(page,'polish-decoy-ready-'+size.width+'x'+size.height);
    await page.locator('#dash-button').click();await page.waitForTimeout(250);
    const cooling=await page.locator('#dash-label').textContent();assert.match(cooling,/\d/);assert.ok(!cooling.includes('诱饵'),'Actual dash cooldown has label priority');assert.equal(await page.evaluate(()=>__encounterQA.game.tactical.decoy),null,'A dash during module cooldown does not spawn an unavailable decoy');
    await page.evaluate(()=>{const g=__encounterQA.game;g.tacticId='reload-mine';g.tactical.cooldown=4;g.ammoByWeapon[g.player.weapon]=1;g._syncWeapon();});await page.locator('#reload-button').click();await page.waitForTimeout(130);
    const mine=await page.locator('#active-reload-title').textContent();assert.match(mine,/布雷/);assert.match(mine,/\d/);assert.equal(await page.locator('#active-reload').isVisible(),true);await hit(page,'#reload-button',{mobile:true});
    const labels=await page.locator('#active-reload-title').evaluateAll(elements=>elements.map(e=>({text:e.textContent,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth})));assert.ok(labels.every(e=>e.scrollWidth<=e.clientWidth+1),'Module status must not overflow mobile labels');await shot(page,'polish-module-'+size.width+'x'+size.height);return{ready,cooling,mine,readyBounds,labels};
  });
}
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});try{
  if(polish)await polishCases(browser);
  else if(boundaries)await boundaryCases(browser);
  else{if(!args.includes('--public-only')){for(const map of ['frontier','foundry','frost'])await guideAndMap(browser,map);for(const kind of ['race','rings','hunt'])await activeEncounter(browser,kind);await priority(browser);await replaceTactic(browser);await resultSummary(browser);for(const size of [{width:360,height:640},{width:667,height:375},{width:844,height:390},{width:1024,height:600}])for(const full of [false,true])await mobile(browser,size,full);}
  if(!args.includes('--ui-only'))for(const kind of ['race','rings','hunt'])await publicAction(browser,kind);}
}finally{await browser.close();report.completedAt=new Date().toISOString();save();}assert.deepEqual(report.errors,[]);assert.ok(report.cases.every(item=>item.pass),'Encounter UI case failed; see '+output);console.log('Encounter UI passed: '+report.cases.length);})().catch(error=>{report.failure=error.stack;save();console.error(error);process.exitCode=1;});
