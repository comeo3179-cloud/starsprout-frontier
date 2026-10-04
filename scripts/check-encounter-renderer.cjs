'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('../build-tools/browser/node_modules/playwright');
const root = path.resolve(__dirname, '..'), release = process.argv.includes('--release'), mode = release ? 'release' : 'source';
const folder = release ? path.join(root, 'release/web') : root, origin = 'http://127.0.0.1:4183', cache = new Map();
const output = path.join(root, 'reports', 'encounter-renderer-' + mode + '.json');
const report = { timestamp: new Date().toISOString(), mode, files: {}, cases: [], errors: [], note: 'Isolated real Canvas / native rAF in Edge. Explicit encounter/tactical scene fixtures freeze engine updates and reposition the player, so this is rendering evidence, not balance or gameplay-completion evidence. The short raw timing samples are not a performance benchmark. Network and cloud requests are blocked. Mobile emulation does not replace physical devices.' };
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }); report.browser = browser.version();
  try {
    for (const [width, height, mobile] of [[1280,800,false],[667,375,true]]) {
      const context = await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
      try {
        await context.route('**/*', async route => {
          const url = new URL(route.request().url()); if (url.origin !== origin || url.pathname.includes('/vendor/')) return route.abort();
          const name = decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html', file = path.resolve(folder,name);
          if (!file.startsWith(folder+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
          if(!cache.has(file))cache.set(file,fs.readFileSync(file)); const body=cache.get(file);report.files[name]=crypto.createHash('sha256').update(body).digest('hex');
          return route.fulfill({body,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
        });
        await context.addInitScript(() => {
          const audit=window.__encounterDrawing={frames:0,nonFinite:0,cost:[],labels:[],freeze:false};
          for(const name of ['arc','arcTo','ellipse','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','fillRect','strokeRect','clearRect','rect','roundRect','translate','scale','rotate','transform','setTransform','drawImage','fillText','strokeText','createRadialGradient','createLinearGradient']) {
            const original=CanvasRenderingContext2D.prototype[name];if(!original)continue;
            CanvasRenderingContext2D.prototype[name]=function(...args){if(args.some(v=>typeof v==='number'&&!Number.isFinite(v)))audit.nonFinite++;return original.apply(this,args);};
          }
          let api,Renderer;
          Object.defineProperty(window,'Expedition',{configurable:true,get:()=>api,set(value){api=value;api.Game=new Proxy(value.Game,{construct(target,args,next){const game=Reflect.construct(target,args,next);audit.game=game;const update=game.update;game.update=function(...args){if(!audit.freeze)return update.apply(this,args)};return game;}})}});
          Object.defineProperty(window,'ExpeditionRenderer',{configurable:true,get:()=>Renderer,set(value){Renderer=new Proxy(value,{construct(target,args,next){const renderer=Reflect.construct(target,args,next);audit.renderer=renderer;const render=renderer.render,label=renderer.label;renderer.label=function(text,...args){audit.labels.push(text);return label.call(this,text,...args)};renderer.render=function(...args){audit.labels=[];const before=performance.now();const result=render.apply(this,args);audit.frames++;audit.cost.push(performance.now()-before);return result;};return renderer;}})}});
          localStorage.setItem('frontier-sound','off');
        });
        const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
        await page.goto(origin);await page.locator('#start-run').waitFor();
        if(mobile){await page.locator('#fullscreen-toggle').click();await page.waitForFunction(()=>!!document.fullscreenElement);}
        await page.locator('#start-run').click();
        await page.waitForFunction(()=>__encounterDrawing.frames>5);
        for(const [kind,status]of[['race','active'],['rings','active'],['hunt','active'],['race','ready'],['hunt','failed'],['tactics','active']]){
          const fixture=await page.evaluate(({kind,status})=>{
            const a=__encounterDrawing,g=a.game,r=a.renderer;a.freeze=true;a.cost=[];
            g.enemies=[];g.bullets=[];g.hazards=[];g.events=[];g.tactical={decoy:null,mine:null,cooldown:0};r.resetEffects();
            for(const e of g.encounters)e.status='idle';
            const e=g.encounters.find(e=>e.kind===(kind==='tactics'?'rings':kind));
            e.status=status;e.remaining=29;e.progress=kind==='rings'?6:1;e.activeNode=1;
            if(e.kind==='race')e.nodes.forEach((node,index)=>{node.collected=index<e.activeNode;});
            const near=status==='active'?(e.nodes[e.activeNode]||e):e;g.player.x=near.x-50;g.player.y=near.y+20;g.player.angle=0;g.player.reloadTimer=0;
            if(kind==='tactics'){g.player.x=e.x+100;g.player.y=e.y-150;}
            r.camera.x=g.player.x;r.camera.y=g.player.y;r.trackedEncounterId=e.id;
            for(const [type,dx,dy]of[['crawler',100,30],['spitter',-100,-40],['tank',180,-50]]){const enemy=g.spawnEnemy(type,{x:g.player.x+dx,y:g.player.y+dy});if(kind==='hunt')enemy.encounterId=e.id;}
            for(let i=0;i<7;i++)g.bullets.push({id:900+i,owner:'enemy',kind:'normal',x:g.player.x+40+i*22,y:g.player.y-50+i*8,vx:-120,vy:0,radius:3,color:'#ff9eaa',life:3});
            if(kind==='tactics'){e.status='idle';g.tactical.decoy={x:g.player.x-110,y:g.player.y-10,radius:320,remaining:1.5};g.tactical.mine={x:g.player.x+100,y:g.player.y+40,radius:70,remaining:4,blastRadius:110};r.consume([{type:'tactic-trigger',tacticId:'gravity-pulse',x:g.player.x,y:g.player.y,radius:210,targets:[{fromX:g.player.x+180,fromY:g.player.y-50,x:g.player.x+110,y:g.player.y-20}]}]);}
            return {id:e.id,kind,status,position:{x:g.player.x,y:g.player.y},startFrame:a.frames};
          },{kind,status});
          await page.waitForFunction(frame=>__encounterDrawing.frames>frame+3,fixture.startFrame);
          await page.screenshot({path:path.join(root,'reports',`encounter-${mode}-${width}x${height}-${kind}-${status}.png`)});
          const actual=await page.evaluate(()=>{const a=__encounterDrawing;return{frames:a.frames,nonFinite:a.nonFinite,labels:a.labels,cost:a.cost,encounters:a.game.encounters.map(e=>({kind:e.kind,status:e.status})),target:a.renderer.targetEncounter&&{x:a.renderer.targetEncounter.x,y:a.renderer.targetEncounter.y,name:a.renderer.targetEncounter.name}}});
          assert.equal(actual.nonFinite,0);assert.ok(actual.cost.length>=3);assert.ok(actual.cost.every(Number.isFinite));
          const expected=status==='failed'?'挑战结束':status==='ready'?'回收奖励':kind==='race'?'穿过此节点':kind==='rings'?'站稳此圈':'1/3 · 29s';
          if(kind!=='tactics')assert.ok(actual.labels.some(text=>String(text).includes(expected)));
          report.cases.push({size:{width,height},...fixture,...actual,passed:true});
        }
      } finally {await context.close();}
    }
    assert.deepEqual(report.errors,[]);
  } finally {await browser.close();fs.writeFileSync(output,JSON.stringify(report,null,2));}
  console.log(JSON.stringify({passed:report.cases.length,errors:report.errors,report:output}));
}
main().catch(error=>{report.failure=error.stack;fs.writeFileSync(output,JSON.stringify(report,null,2));console.error(error);process.exitCode=1;});
