/* Read-only landscape layout probe; scene fixtures do not measure gameplay balance. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
let chromium; try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; ({ chromium } = require('../build-tools/browser/node_modules/playwright')); }
const release=process.argv.includes('--release');
const root = path.resolve(__dirname, '..'), origin = 'http://127.0.0.1:4181', folder = path.join(root, 'reports/landscape-audit',release?'release':'updated');
const contentRoot=release?path.join(root,'release/web'):root;
const names=release?['index.html',...fs.readFileSync(path.join(contentRoot,'index.html'),'utf8').matchAll(/(?:src|href)="(assets\/[^\"]+)"/g)].map(item=>typeof item==='string'?item:item[1]):['index.html', 'expedition.css', 'profile-store.js', 'cloud-profile.js', 'account-ui.js', 'display-mode.js', 'touch-actions.js', 'action-engine.js', 'action-renderer.js', 'audio.js', 'action.js'];
const files = new Map(names.map(name => [name, fs.readFileSync(path.join(contentRoot, name))]));
const reportPath=path.join(folder,release?'release.json':'source.json');
const report = { timestamp: new Date().toISOString(), target:release?'release':'source', note: 'Read-only '+(release?'actual release bundle and CSS':'source snapshots')+'; headless Edge coarse/touch emulation, not physical device or notch verification. '+(release?'External/cloud requests blocked; guest only.':'Cloud facade disabled for guest layout only.')+' Expanded scene prepares existing boss, full reactor and reload to inspect simultaneous HUD states; not balance evidence.', files: Object.fromEntries([...files].map(([name, body]) => [name, crypto.createHash('sha256').update(body).digest('hex')])), cases: [], errors: [] };
fs.mkdirSync(folder, { recursive: true });
async function measure(page) {
  return page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    const controls = [...document.querySelectorAll('#reload-button,#touch-overdrive,#move-stick,#aim-stick,#touch-interact,#dash-button,#skill-button,#reactor-button,#field-map-toggle,#fullscreen-pause,#fullscreen-exit,[data-weapon]')].map(element => {
      const box = rect(element), visible = !!box.width && !!box.height;
      return { id: element.id || 'weapon-' + element.dataset.weapon, visible, disabled: element.disabled === true, rect: box, font: getComputedStyle(element).fontSize,
        hits: visible ? [[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]].map(([x,y]) => { const hit = document.elementFromPoint(box.x + box.width*x, box.y + box.height*y); return { pass: hit === element || element.contains(hit), target: hit?.id || hit?.className || '' }; }) : [] };
    }).filter(item => item.visible);
    const collision = []; for (let a = 0; a < controls.length; a++) for (let b = a + 1; b < controls.length; b++) { const area = overlap(controls[a].rect, controls[b].rect); if (area > .5) collision.push({ a: controls[a].id, b: controls[b].id, area }); }
    const stage = rect(document.getElementById('game-stage')), canvas = rect(document.getElementById('world')), renderer = __landscape.renderer, player = __landscape.game.player;
    const playerScreen = { x: canvas.x + renderer.width/2 + (player.x-renderer.camera.x)*renderer.scale, y: canvas.y + renderer.height/2 + (player.y-renderer.camera.y)*renderer.scale };
    const hud = ['.player-hud','.map-hud','.objective-hud','.boss-hud','.weapons-hud','.ammo-hud','.skill-hud','.active-reload','.combat-notices','.field-coach'].map(selector => {
      const element = document.querySelector(selector), box = rect(element);
      return { selector, rect: box, visible: !!box.width && !!box.height, overPlayer: box.x <= playerScreen.x && playerScreen.x <= box.right && box.y <= playerScreen.y && playerScreen.y <= box.bottom };
    });
    const visualOverlaps = [];
    for (const panel of hud.filter(item => item.visible && ['.active-reload','.combat-notices'].includes(item.selector))) for (const control of controls) {
      const area = overlap(panel.rect, control.rect); if (area > .5) visualOverlaps.push({ panel: panel.selector, control: control.id, area, controlCoveredFraction: area / (control.rect.width * control.rect.height) });
    }
    const notices = document.querySelector('.combat-notices'), notice = document.querySelector('#notification');
    const stageStyle=getComputedStyle(document.getElementById('game-stage')), inset=name=>parseFloat(stageStyle.getPropertyValue('--safe-'+name))||0;
    const safeBounds={left:stage.x+inset('left'),right:stage.right-inset('right'),top:stage.y+inset('top'),bottom:stage.bottom-inset('bottom')};
    const safeViolations=controls.filter(item=>item.rect.x<safeBounds.left-.5||item.rect.right>safeBounds.right+.5||item.rect.y<safeBounds.top-.5||item.rect.bottom>safeBounds.bottom+.5).map(item=>({id:item.id,rect:item.rect}));
    return { viewport: { width: innerWidth, height: innerHeight }, coarse: matchMedia('(pointer:coarse)').matches, fullscreen: !!document.fullscreenElement, stage, playerScreen, controls, collisions: collision, visualOverlaps, hud,
      notices: {display:getComputedStyle(notices).display, active:notice.classList.contains('visible'), text:notice.textContent, interactionDisplay:getComputedStyle(document.getElementById('interaction-hint')).display,interactionText:document.getElementById('interaction-hint').textContent},
      undersized: controls.filter(item => item.rect.width < 44 || item.rect.height < 44).map(item => ({ id:item.id, width:item.rect.width, height:item.rect.height })),
      covered: controls.filter(item => item.hits.some(hit => !hit.pass)), safeBounds,safeViolations, documentWidth: document.documentElement.scrollWidth, safeArea: 'Headless emulation reports no physical display cutout' };
  });
}
async function menus(page, full) {
  const results = [];
  async function inspect(selector, label) {
    const target = page.locator(selector); await target.scrollIntoViewIfNeeded();
    const result = await target.evaluate(element => { const r=element.getBoundingClientRect(); return {width:r.width,height:r.height,x:r.x,y:r.y,hits:[[.5,.5],[.15,.15],[.85,.85]].map(([x,y])=>{const hit=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);return hit===element||element.contains(hit);})};});
    results.push({label,...result});
  }
  await page.locator(full?'#fullscreen-pause':'#pause-toggle').click();
  for (const selector of ['#resume-run','#pause-help','#new-run','#change-sector']) await inspect(selector,selector);
  await page.locator('#pause-help').click(); await inspect('#close-help','close-help'); await page.locator('#close-help').click();
  await page.locator('#screen-content .menu-buttons button').filter({hasText:'战术地图'}).click(); await inspect('#close-map','close-map'); await page.locator('#close-map').click();
  await page.locator('#new-run').click(); await inspect('#restart-confirm','restart-confirm'); await inspect('#restart-cancel','restart-cancel'); await page.locator('#restart-cancel').click();
  await page.locator('#resume-run').click(); return results;
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const config of [{width:667,height:375},{width:844,height:390},{width:932,height:430},{width:1024,height:600},{width:667,height:375,safe:true},{width:844,height:390,safe:true}]) for (const full of [false,true]) {
      const size={width:config.width,height:config.height};
      const context = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
        const name = decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html';
        if (!files.has(name)) return route.fulfill({status:404,body:''});
        const body = name === 'cloud-profile.js' ? 'window.FrontierCloud={adapter:{},onSession(){},init:async()=>null,getSession:async()=>null};' : files.get(name);
        return route.fulfill({body,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
      });
      await context.addInitScript(() => {
        localStorage.setItem('frontier-sound','off'); const audit = window.__landscape = {}; let api, renderer;
        Object.defineProperty(window,'Expedition',{configurable:true,get:()=>api,set(value){api=value;api.Game=new Proxy(api.Game,{construct(target,args,next){audit.game=Reflect.construct(target,args,next);return audit.game;}});}});
        Object.defineProperty(window,'ExpeditionRenderer',{configurable:true,get:()=>renderer,set(value){renderer=new Proxy(value,{construct(target,args,next){audit.renderer=Reflect.construct(target,args,next);return audit.renderer;}});}});
      });
      const page=await context.newPage(), name=`${size.width}x${size.height}-${full?'fullscreen':'normal'}${config.safe?'-safe44-21':''}`;
      page.on('pageerror',error=>report.errors.push({name,error:error.message}));
      try {
        await page.goto(origin); await page.locator('#start-run').waitFor();
        if(config.safe)await page.evaluate(()=>{const stage=document.getElementById('game-stage');stage.style.setProperty('--safe-left','44px');stage.style.setProperty('--safe-right','44px');stage.style.setProperty('--safe-bottom','21px');});
        if(full){await page.locator('#fullscreen-toggle').click();await page.waitForFunction(()=>!!document.fullscreenElement);}
        await page.locator('#start-run').click(); await page.waitForTimeout(180);
        const initial=await measure(page); await page.screenshot({path:path.join(folder,name+'-initial.png')});
        await page.evaluate(()=>{const g=__landscape.game;g.player.invulnerable=999;g.reactor.charge=g.reactor.maxCharge;g._spawnBoss();g.update(.02,{shoot:true});g.reload();});
        await page.waitForTimeout(180); const expanded=await measure(page); await page.screenshot({path:path.join(folder,name+'-expanded.png')});
        let nearInteraction;
        if(config.safe&&size.width===667){
          await page.evaluate(()=>{const g=__landscape.game,c=g.crates[0];g.player.x=c.x;g.player.y=c.y+30;});
          await page.waitForTimeout(180);
          nearInteraction={before:await measure(page),button:await page.locator('#touch-interact').textContent()};
          await page.screenshot({path:path.join(folder,name+'-near-interaction.png')});
          await page.locator('#touch-interact').click();
          await page.waitForTimeout(100);
          nearInteraction.opened=await page.evaluate(()=>__landscape.game.crates[0].opened);
          nearInteraction.after=await measure(page);
        }
        const menu=await menus(page,full);
        report.cases.push({name,safeInsetsFixture:config.safe?{left:44,right:44,bottom:21}:null,initial,expanded,nearInteraction,menu}); console.log(JSON.stringify({name,stage:initial.stage,small:initial.undersized,covered:expanded.covered.map(item=>item.id),collisions:expanded.collisions,visualOverlaps:expanded.visualOverlaps,safeViolations:expanded.safeViolations,overPlayer:expanded.hud.filter(item=>item.visible&&item.overPlayer).map(item=>item.selector),nearInteraction:nearInteraction&&{button:nearInteraction.button,opened:nearInteraction.opened,visualOverlaps:nearInteraction.before.visualOverlaps,hintDisplay:nearInteraction.before.notices.interactionDisplay},menuIssues:menu.filter(item=>item.width<44||item.height<44||item.hits.some(hit=>!hit))}));
      } catch(error) {report.cases.push({name,error:error.stack}); console.error(name+': '+error.message);}
      finally {await context.close();fs.writeFileSync(reportPath,JSON.stringify(report,null,2));}
    }
  } finally {await browser.close(); report.completedAt=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(report,null,2));}
})().catch(error=>{report.failure=error.stack;fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.error(error);process.exitCode=1;});
