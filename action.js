(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('world');
  const stage = $('game-stage');
  const game = new Expedition.Game();
  const renderer = new ExpeditionRenderer(canvas);
  const weapons = Expedition.WEAPONS;
  const keys = new Set();
  const pointer = { x: 0, y: 0, inside: false, seen: false, down: false, shotQueued: false };
  const touch = { moveX: 0, moveY: 0, aimX: 1, aimY: 0, shoot: false };
  const textValues = new Map();
  let paused = false;
  let screen = 'welcome';
  let previousScreen = '';
  let lastPhase = 'ready';
  let lastTimestamp = 0;
  let uiTimer = 0;
  let renderDirty = true;
  let best = Number(read('frontier-best')) || 0;
  let sound = read('frontier-sound') !== 'off';
  const audio = new FrontierAudio();
  audio.setEnabled(sound);
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  renderer.reducedMotion = read('frontier-motion') === 'calm' || (read('frontier-motion') === null && motionPreference.matches);
  let trackedRelayId = game.relays[0].id;
  let trackedContractId = null;
  let mapReturn = '';
  let runStats = { shots: weapons.map(() => 0), dashes: 0, perfectReloads: 0 };
  let coachDismissed = read('frontier-coach') === 'done';
  let hitTimer;
  let lastImpactTime = -1;
  let notificationTimer;
  let bannerTimer;
  let damageTimer;
  let pickupToneTime = 0;
  let impactPause = 0;
  let lastBurstTone = -1;
  let reactorWasReady = false;
  let phaseCoachSeen = false;

  function read(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* Storage is optional in local/private browsing. */ } }
  function setText(id, value) { value = String(value); if (textValues.get(id) !== value) { $(id).textContent = value; textValues.set(id, value); } }
  function percentage(id, value) { $(id).style.width = Math.max(0, Math.min(100, value * 100)) + '%'; }
  function formatTime(seconds) { return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0'); }
  function clearInput() { keys.clear(); pointer.down = false; pointer.shotQueued = false; touch.moveX = 0; touch.moveY = 0; touch.shoot = false; document.querySelectorAll('.touch-stick i').forEach(knob => { knob.style.transform = ''; }); }
  function canPlay() { return game.phase === 'playing' && !paused && !screen; }

  function tone(kind, weapon = 0) { audio.play(kind, weapon); }
  function updateSound() { $('sound-toggle').querySelector('span').textContent = sound ? '音效开' : '音效关'; $('sound-toggle').setAttribute('aria-label', sound ? '关闭音效' : '开启音效'); }
  function notify(message) {
    $('notification').textContent = message; $('notification').classList.add('visible');
    $('run-log').textContent = message; $('live-status').textContent = message;
    clearTimeout(notificationTimer); notificationTimer = setTimeout(() => $('notification').classList.remove('visible'), 3300);
  }
  function banner(label, message, duration = 2800) {
    $('banner-label').textContent = label; $('banner-text').textContent = message; $('event-banner').classList.remove('hidden');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => $('event-banner').classList.add('hidden'), duration);
  }
  function processEvents() {
    const events = game.drainEvents(); renderer.consume(events);
    for (const event of events) {
      if (event.type === 'shot' && event.owner === 'player') { tone('shot', event.weapon); runStats.shots[event.weapon]++; }
      else if (event.type === 'hit') {
        $('aim-reticle').classList.add('hit'); $('aim-reticle').classList.toggle('critical', !!event.critical);
        clearTimeout(hitTimer); hitTimer = setTimeout(() => $('aim-reticle').classList.remove('hit', 'critical'), 95);
        if (game.elapsed - lastImpactTime > .075) { tone(event.critical ? 'critical' : 'hit'); lastImpactTime = game.elapsed; }
      }
      else if (event.type === 'kill') tone('kill');
      else if (event.type === 'phase-mark') {
        if (!phaseCoachSeen) { phaseCoachSeen = true; notify('相位印记已附着！射击紫色敌人，引爆整片敌群。'); }
      }
      else if (event.type === 'phase-capture') { if (game.elapsed - lastBurstTone > .12) { tone('phase-capture'); lastBurstTone = game.elapsed; } }
      else if (event.type === 'phase-burst') {
        if (!renderer.reducedMotion) impactPause = Math.max(impactPause, .045);
        if (game.elapsed - lastBurstTone > .1) { tone('phase-burst'); lastBurstTone = game.elapsed; }
      }
      else if (event.type === 'grenade-burst') tone('grenade-burst');
      else if (event.type === 'hazard-burst') tone('hazard-burst');
      else if (event.type === 'overdrive-start') { tone('overdrive-start'); banner('STARCORE / OVERDRIVE', '星核暴走 · 火力全开', 1100); clearTimeout(notificationTimer); $('notification').classList.remove('visible'); $('run-log').textContent = '7 秒无限弹药 · 射速与伤害提升 · 冲刺已重置'; }
      else if (event.type === 'overdrive-end') { tone('overdrive-end'); notify('星核冷却 · 击杀、掠弹和精准装填重新蓄能'); }
      else if (event.type === 'combo' && event.count >= 3 && event.count % 3 === 0) tone('combo', event.count);
      else if (event.type === 'damage') {
        tone('damage'); $('damage-flash').classList.add('visible');
        clearTimeout(damageTimer); damageTimer = setTimeout(() => $('damage-flash').classList.remove('visible'), 160);
      } else if (event.type === 'dash') { tone('dash'); runStats.dashes++; }
      else if (event.type === 'pulse') tone('pulse');
      else if (event.type === 'reload') tone('reload');
      else if (event.type === 'reload-complete') tone('reload-complete');
      else if (event.type === 'reload-perfect') { tone('reload-perfect'); runStats.perfectReloads++; notify('精准装填 · 当前弹匣伤害 +15%'); }
      else if (event.type === 'reload-miss') tone('reload-miss');
      else if (event.type === 'interact') { notify(event.message); tone('upgrade'); }
      else if (event.type === 'pickup' && game.elapsed - pickupToneTime > .14) { tone('pickup'); pickupToneTime = game.elapsed; }
      else if (event.type === 'relay-start') { trackedRelayId = game.relays.find(relay => relay.status === 'charging')?.id ?? trackedRelayId; banner('MISSION / ENGAGED', game.map.mode === 'demolition' ? '反应堆暴露 · 集火拆毁' : game.map.mode === 'escort' ? '运输车启动 · 随车推进' : '坚守信标光圈'); notify(game.map.briefing); }
      else if (event.type === 'relay-wave') { banner('DEFENSE / ' + event.wave + ' OF 3', event.waveName); }
      else if (event.type === 'relay-complete') { banner('MISSION COMPLETE · ' + event.completed + ' / 3', game.map.objectiveLabel + '完成'); notify(event.name + '完成：生命恢复、芯片与经验奖励已到达。'); tone('upgrade'); }
      else if (event.type === 'boss-spawn') { banner('WARNING / SECTOR BOSS', game.map.boss.name + '正在接近'); notify(game.map.boss.subtitle); }
      else if (event.type === 'boss-phase') { banner('PHASE 02 / OVERLOAD', game.map.boss.name + ' · 二阶段'); tone('pulse'); }
      else if (event.type === 'sector-warning') { tone('sector-warning'); $('run-log').textContent = event.name + ' · ' + event.hint; }
      else if (event.type === 'boss-attack') { tone('boss-attack'); $('run-log').textContent = event.name + ' · ' + event.hint; }
      else if (event.type === 'level-up') tone('upgrade');
      else if (event.type === 'contract-start') { trackedContractId = event.contractId; banner('SIDE EXPEDITION', '支线已接取'); notify(event.message); tone('click'); }
      else if (event.type === 'contract-ready') { banner('OBJECTIVE COMPLETE', '返回终端 · 领取遗物'); notify(event.message); tone('upgrade'); }
      else if (['contract-progress', 'contract-reward', 'relic-acquired'].includes(event.type)) { notify(event.message); tone('upgrade'); }
      else if (event.type === 'win') tone('win');
    }
  }

  function showScreen(type, content) {
    screen = type; clearInput(); renderDirty = true;
    $('screen-overlay').classList.remove('hidden'); $('screen-overlay').classList.toggle('welcome', type === 'welcome'); $('screen-overlay').classList.toggle('map-screen', type === 'map');
    $('screen-content').innerHTML = content; $('aim-reticle').style.opacity = '0';
    const button = $('screen-content').querySelector('button:not(:disabled)'); if (button) button.focus({ preventScroll: true });
    updateHUD();
  }
  function closeScreen() { screen = ''; $('screen-overlay').classList.add('hidden'); clearInput(); renderDirty = true; canvas.focus({ preventScroll: true }); updateHUD(); }
  function welcome() {
    showScreen('welcome', '<div class="screen-kicker">STARSPROUT / 战区异变 · 2.4</div><h1 id="screen-title">识破杀招，<em>借势反击。</em></h1><p class="screen-description">三位战区首领，三种环境威胁。看准预警，冲刺脱险，把敌群引进险区。</p><div class="sector-grid">' + Expedition.MAPS.map((map, index) => '<button class="sector-card ' + (map.id === game.map.id ? 'selected' : '') + '" data-map="' + map.id + '" aria-pressed="' + (map.id === game.map.id) + '" style="--sector-color:' + map.color + '"><small>SECTOR 0' + (index + 1) + '</small><span class="sector-symbol">' + ['✳', '▧', '❄'][index] + '</span><b>' + map.name + '</b><span>' + map.subtitle + '</span><p>' + map.description + '</p></button>').join('') + '</div><div class="sector-brief"><b>' + game.map.name + ' · 行动简报</b><p>' + game.map.briefing + '</p></div><div class="sector-intel"><span><b>战区威胁</b>' + game.map.threat.name + '</span><span><b>终局首领</b>' + game.map.boss.name + '</span></div><button class="launch-button" id="start-run">进入' + game.map.name + ' <b>↗</b></button><p class="welcome-note">' + game.map.threat.description + '</p><div class="welcome-controls"><span><kbd>W A S D</kbd>移动探索</span><span><kbd>1 — 5</kbd>切换武器</span><span><kbd>SHIFT / 空格</kbd>相位冲刺</span><span><kbd>F</kbd>星核暴走</span></div>');
    $('start-run').addEventListener('click', startRun);
    $('screen-content').querySelectorAll('[data-map]').forEach(button => button.addEventListener('click', () => {
      resetRun(button.dataset.map); welcome(); tone('click');
      $('screen-content').querySelector('[data-map="' + game.map.id + '"]').focus({ preventScroll: true });
    }));
  }
  function startRun() {
    if (game.phase !== 'ready') resetRun();
    game.start(); paused = false; lastPhase = 'playing';
    renderer.camera.x = game.player.x; renderer.camera.y = game.player.y;
    closeScreen(); tone('click'); processEvents();
    banner('OPERATION / ' + game.map.id.toUpperCase(), game.map.name + ' · 行动开始');
    notify(game.map.briefing);
  }
  function pauseGame() {
    if (game.phase !== 'playing' || screen) return;
    paused = true; clearInput(); showPause();
  }
  function showPause() {
    const stacks = Object.entries(game.upgradeStacks).map(([id, count]) => (Expedition.UPGRADES.find(upgrade => upgrade.id === id)?.title || id) + ' ×' + count);
    stacks.push(...game.relics.map(id => '遗物 · ' + Expedition.RELICS.find(relic => relic.id === id).title));
    showScreen('pause', '<div class="screen-kicker">MISSION ON HOLD</div><h2 id="screen-title">荒原，等你片刻。</h2><p>你的远征已暂停。恢复后从原地继续。</p><div class="result-grid"><div><strong>' + formatTime(game.elapsed) + '</strong><small>远征时间</small></div><div><strong>' + game.kills + '</strong><small>击败敌人</small></div><div><strong>' + game.completedRelays + '/3</strong><small>主线目标</small></div></div><p class="result-tip">' + (stacks.length ? stacks.join(' · ') : '尚未获得生长协议。收集敌人掉落的经验可以升级。') + '</p><div class="menu-buttons"><button class="launch-button" id="resume-run">继续远征 <b>↗</b></button><button class="secondary-button" id="pause-help">查看操作</button><button class="secondary-button" id="new-run">重新出发</button></div>');
    $('resume-run').addEventListener('click', resume);
    $('pause-help').addEventListener('click', showHelp);
    $('new-run').addEventListener('click', confirmRestart);
    const mapButton = document.createElement('button'); mapButton.className = 'secondary-button'; mapButton.textContent = '战术地图'; mapButton.addEventListener('click', showMap); $('screen-content').querySelector('.menu-buttons').append(mapButton);
    const campButton = document.createElement('button'); campButton.id = 'change-sector'; campButton.className = 'secondary-button'; campButton.textContent = '返回营地 / 换战区';
    campButton.addEventListener('click', () => {
      showScreen('camp-confirm', '<div class="screen-kicker">RETURN TO CAMP</div><h2 id="screen-title">返回营地，选择新战区？</h2><p>本局进度将重置，个人最佳纪录会保留。</p><div class="menu-buttons"><button class="launch-button" id="confirm-camp">返回营地</button><button class="secondary-button" id="cancel-camp">继续本局</button></div>');
      $('confirm-camp').addEventListener('click', () => { rememberBest(); resetRun(); welcome(); });
      $('cancel-camp').addEventListener('click', showPause);
    }); $('screen-content').querySelector('.menu-buttons').append(campButton);
  }
  function resume() { paused = false; closeScreen(); }
  function showHelp() {
    if (screen && !['pause', 'welcome'].includes(screen)) return;
    previousScreen = screen || 'playing'; paused = game.phase === 'playing';
    const controls = [['W A S D / ↑↓←→','自由移动；触屏使用左摇杆'],['鼠标 + 左键','手动射击；命中紫色印记触发连锁爆破'],['SHIFT / 空格','冲刺给近身敌人烙印 4 秒，并吸收附近敌弹蓄能'],['F / 点星核','满能量开启 7 秒暴走：无限弹药，射速与伤害提升'],['1 / 2 / 3 / 4 / 5','步枪、散弹、轨道、榴弹、回旋刃随时切换'],['R','绿色区再次按 R 精准装填，强化弹匣并蓄能'],['Q','脉冲震荡：打断冲锋，清除附近敌弹'],['E','靠近后交互，医疗与工坊消耗芯片'],['M / TAB','战术地图：暂停并选择追踪目标'],['P / ESC','暂停游戏，再按一次继续']];
    showScreen('help', '<div class="screen-kicker">FIELD MANUAL / 07</div><h2 id="screen-title">活着，把信号带回来。</h2><div class="guide-grid">' + controls.map(([key, text]) => '<div class="guide-item"><kbd>' + key + '</kbd><p>' + text + '</p></div>').join('') + '</div><div class="guide-tip">本图：' + game.map.briefing + ' ' + game.map.threat.description + ' 首领：' + game.map.boss.name + '，' + game.map.boss.subtitle + '。补给箱免费开启，医疗和工坊消耗芯片。移动端使用左摇杆移动、右摇杆瞄准射击。</div><div class="menu-buttons"><button class="launch-button" id="close-help">准备好了 <b>↗</b></button></div>');
    $('close-help').addEventListener('click', returnFromHelp);
    const preference = document.createElement('button'); preference.className = 'secondary-button';
    const label = () => { preference.textContent = renderer.reducedMotion ? '画面反馈：舒缓' : '画面反馈：标准'; preference.setAttribute('aria-pressed', String(renderer.reducedMotion)); };
    label(); preference.addEventListener('click', () => { renderer.reducedMotion = !renderer.reducedMotion; save('frontier-motion', renderer.reducedMotion ? 'calm' : 'standard'); label(); });
    $('screen-content').querySelector('.menu-buttons').append(preference);
    const expeditionTip = document.createElement('p'); expeditionTip.className = 'expedition-tip';
    expeditionTip.textContent = '紫色终端可接取一条支线：回收核心、追猎精英或摧毁虫巢。完成后返回终端，选择一件遗物。炮击虫的橙色落点有预警，持续移动或用脉冲打断。';
    $('screen-content').querySelector('.menu-buttons').before(expeditionTip);
  }
  function showMap() {
    if (!['ready', 'playing'].includes(game.phase) || (screen && !['pause', 'welcome'].includes(screen))) return;
    mapReturn = screen || 'playing'; paused = game.phase === 'playing';
    const rows = game.relays.map((relay, index) => {
      const status = relay.status === 'active' ? '已完成' : relay.status === 'locked' ? '先完成上一段' : relay.status === 'charging' ? '进度 ' + Math.floor(relay.progress * 100) + '%' : Math.round(Math.hypot(relay.x - game.player.x, relay.y - game.player.y) / 10) + ' m';
      const theme = game.map.mode === 'demolition' ? '启动终端 → 集火反应堆' : game.map.mode === 'escort' ? '随车推进 → 到达下一站' : ['虫群与冲锋', '远程交叉火力', '重装破阵'][index];
      return '<button class="map-destination ' + (!trackedContractId && relay.id === trackedRelayId ? 'selected' : '') + '" data-target="' + relay.id + '" ' + (['active', 'locked'].includes(relay.status) ? 'disabled' : '') + '><small>主线 0' + (index + 1) + ' / ' + status + '</small><b>' + relay.name + '</b><small>' + theme + '</small><span>' + (relay.status === 'active' ? '✓ 已完成' : !trackedContractId && relay.id === trackedRelayId ? '◎ 正在追踪' : '选择追踪 →') + '</span></button>';
    }).join('');
    showScreen('map', '<div class="screen-kicker">KEPLER / TACTICAL OVERVIEW</div><h2 id="screen-title">' + game.map.name + ' · 战术地图</h2><div class="tactical-layout"><div class="tactical-surface"><canvas id="tactical-map" width="640" height="480" aria-label="战区全图：主线目标、补给、医疗、工坊与当前位置"></canvas><div class="tactical-legend"><span>◆ 主线</span><span>▣ 补给</span><span>＋ 医疗</span><span>▰ 工坊</span><span>△ 你</span></div></div><div class="destination-list">' + rows + '<p>' + game.map.briefing + '</p></div></div><div class="menu-buttons"><button class="launch-button" id="close-map">返回远征 <b>↗</b></button></div><p class="map-note">战场已暂停 · Tab 切换目标 · M / Esc 关闭</p>');
    $('close-map').addEventListener('click', closeMap);
    const contractList = document.createElement('div'); contractList.className = 'contract-destinations';
    contractList.innerHTML = '<h3>可选支线 · 完成后选择遗物</h3>' + game.contracts.map(contract => {
      const status = { idle: '待接取', active: contract.progress + '/' + contract.goal, ready: '返回领取奖励', complete: '已完成' }[contract.status];
      return '<button class="map-destination contract-destination ' + (trackedContractId === contract.id ? 'selected' : '') + '" data-contract="' + contract.id + '" ' + (contract.status === 'complete' ? 'disabled' : '') + '><small>' + status + ' · ' + Math.round(Math.hypot(contract.x - game.player.x, contract.y - game.player.y) / 10) + ' m</small><b>' + contract.name + '</b><small>' + contract.description + '</small><span>' + (trackedContractId === contract.id ? '◎ 正在追踪' : contract.status === 'complete' ? '✓ 遗物已领取' : '追踪支线 →') + '</span></button>';
    }).join('');
    $('screen-content').querySelector('.destination-list').append(contractList);
    contractList.querySelectorAll('[data-contract]').forEach(button => button.addEventListener('click', () => {
      trackedContractId = Number(button.dataset.contract); closeMap(); tone('click'); notify('已追踪支线：' + game.contracts.find(contract => contract.id === trackedContractId).name);
    }));
    const legend = document.createElement('span'); legend.textContent = '⬡ 支线 / 核心'; $('screen-content').querySelector('.tactical-legend').append(legend);
    $('screen-content').querySelectorAll('[data-target]').forEach(button => button.addEventListener('click', () => {
      trackedContractId = null;
      trackedRelayId = Number(button.dataset.target); renderer.trackedRelayId = trackedRelayId;
      closeMap(); tone('click'); notify('已追踪：' + game.relays.find(relay => relay.id === trackedRelayId).name);
    }));
    renderer.drawMinimap($('tactical-map'), game, { detailed: true });
  }
  function closeMap() {
    if (mapReturn === 'pause') showPause();
    else if (mapReturn === 'welcome') { paused = false; welcome(); }
    else resume();
  }
  function returnFromHelp() {
    if (previousScreen === 'pause') showPause();
    else if (previousScreen === 'welcome') { paused = false; welcome(); }
    else resume();
  }
  function confirmRestart() {
    showScreen('restart', '<div class="screen-kicker">NEW EXPEDITION</div><h2 id="screen-title">重新出发？</h2><p>本局探索和强化会重置，个人最佳纪录会保留。</p><div class="menu-buttons"><button class="launch-button" id="restart-confirm">开始新远征 <b>↗</b></button><button class="secondary-button" id="restart-cancel">返回暂停</button></div>');
    $('restart-confirm').addEventListener('click', restartRun); $('restart-cancel').addEventListener('click', showPause);
  }
  function rememberBest() { if (game.score > best) { best = game.score; save('frontier-best', String(best)); } }
  function resetRun(mapId = game.map.id) {
    game.reset(mapId); paused = false; lastPhase = 'ready'; pickupToneTime = 0; pointer.seen = false;
    trackedRelayId = game.relays[0].id; trackedContractId = null; lastImpactTime = -1;
    renderer.camera.x = game.player.x; renderer.camera.y = game.player.y; renderDirty = true;
    impactPause = 0; lastBurstTone = -1; reactorWasReady = false; phaseCoachSeen = false;
    runStats = { shots: weapons.map(() => 0), dashes: 0, perfectReloads: 0 };
    if (renderer.resetEffects) renderer.resetEffects();
    else { renderer.particles = []; renderer.rings = []; renderer.numbers = []; renderer.ghosts = []; renderer.shake = 0; }
    clearTimeout(hitTimer); clearTimeout(damageTimer); clearTimeout(bannerTimer); clearTimeout(notificationTimer);
    $('aim-reticle').classList.remove('hit', 'critical'); $('damage-flash').classList.remove('visible'); $('notification').classList.remove('visible'); $('event-banner').classList.add('hidden');
  }
  function restartRun() { rememberBest(); resetRun(); startRun(); }
  function showUpgrade() {
    clearInput();
    showScreen('upgrade', '<div class="screen-kicker">GROWTH PROTOCOL / LEVEL ' + game.player.level + '</div><h2 id="screen-title">让这次远征，有所不同。</h2><p>选择一项本局持续生效的强化。战场已暂停。</p><div class="upgrade-grid">' + game.upgradeChoices.map((upgrade, i) => '<button class="upgrade-card ' + (upgrade.weapon !== undefined ? 'weapon-mod' : '') + '" data-upgrade="' + upgrade.id + '"><small>' + (upgrade.weapon !== undefined ? weapons[upgrade.weapon].shortName + ' · 武器改造' : '生长协议 · ' + (upgrade.stacks + 1) + ' / ' + upgrade.maxStacks) + '</small><span class="upgrade-icon">' + upgrade.icon + '</span><b>' + upgrade.title + '</b><p>' + upgrade.description + '</p><em>选择强化 · 按 ' + (i + 1) + ' ↗</em></button>').join('') + '</div>');
    $('screen-content').querySelectorAll('[data-upgrade]').forEach(button => button.addEventListener('click', () => selectUpgrade(button.dataset.upgrade)));
  }
  function selectUpgrade(id) {
    const choice = game.upgradeChoices.find(upgrade => upgrade.id === id);
    if (!choice || !game.chooseUpgrade(id)) return;
    tone('upgrade'); processEvents();
    if (game.phase === 'upgrade') showUpgrade();
    else { lastPhase = 'playing'; closeScreen(); notify('已应用：' + choice.title + ' · ' + choice.description); }
  }
  function showRelics() {
    showScreen('relic', '<div class="screen-kicker">RELIC RECOVERED / 遗迹奖励</div><h2 id="screen-title">带走一件，改变打法。</h2><p>选择一件本局持续生效的遗物。战场已暂停，无需增加操作按键。</p><div class="upgrade-grid relic-grid">' + game.relicChoices.map((relic, i) => '<button class="upgrade-card weapon-mod" data-relic="' + relic.id + '"><small>战术遗物 · 本局唯一</small><span class="upgrade-icon">' + relic.icon + '</span><b>' + relic.title + '</b><p>' + relic.description + '</p><em>装备遗物 · 按 ' + (i + 1) + ' ↗</em></button>').join('') + '</div>');
    $('screen-content').querySelectorAll('[data-relic]').forEach(button => button.addEventListener('click', () => selectRelic(button.dataset.relic)));
  }
  function selectRelic(id) {
    if (!game.chooseRelic(id)) return;
    processEvents(); lastPhase = game.phase;
    if (game.phase === 'upgrade') showUpgrade();
    else closeScreen();
  }
  function showResult() {
    const won = game.phase === 'won'; rememberBest();
    showScreen('result', '<div class="result-icon">' + (won ? '✳' : '◈') + '</div><div class="screen-kicker">' + (won ? 'THE SIGNAL IS HOME' : 'SIGNAL LOST / OPERATIVE 07') + '</div><h2 id="screen-title">' + (won ? '黎明，收到。' : '信号中断，火种还在。') + '</h2><p>' + (won ? '' + game.map.name + '的三项目标全部完成，' + game.map.boss.name + '已被击败。下一片战场等你探索。' : '这次远征暂时结束。保持移动，利用冲刺与掩体，优先清除远程敌人。') + '</p><div class="result-grid"><div><strong>' + game.score + '</strong><small>远征得分</small></div><div><strong>' + game.kills + '</strong><small>击败敌人</small></div><div><strong>' + formatTime(game.elapsed) + '</strong><small>远征时间</small></div></div><p class="result-tip">主线 ' + game.completedRelays + '/3 · 等级 ' + game.player.level + ' · 个人最佳 ' + best + '</p><div class="menu-buttons"><button class="launch-button" id="play-again">再次远征 <b>↗</b></button><button class="secondary-button" id="back-welcome">返回营地</button></div>');
    $('play-again').addEventListener('click', restartRun);
    $('back-welcome').addEventListener('click', () => { resetRun(); welcome(); });
    const debrief = document.createElement('div'); debrief.className = 'debrief';
    debrief.innerHTML = '<span><b>' + game.combo.best + '</b> 最高连杀</span><span><b>' + game.reactor.detonations + '</b> 相位引爆</span><span><b>' + game.reactor.captures + '</b> 掠夺敌弹</span><span><b>' + runStats.perfectReloads + '</b> 精准装填</span>';
    $('screen-content').querySelector('.menu-buttons').before(debrief);
    const relicDebrief = document.createElement('p'); relicDebrief.className = 'expedition-tip';
    relicDebrief.textContent = '支线完成 ' + game.contracts.filter(contract => contract.status === 'complete').length + '/3 · ' + (game.relics.length ? game.relics.map(id => Expedition.RELICS.find(relic => relic.id === id).title).join(' / ') : '本次未取得遗物');
    debrief.after(relicDebrief);
  }

  function updateReloadMeter() {
    const player = game.player;
    const loading = player.reloadTimer > 0;
    const progress = player.reloadProgress ?? (loading ? 1 - player.reloadTimer / (weapons[player.weapon].reloadTime * player.reloadMultiplier) : 0);
    const start = player.reloadWindowStart ?? .52, end = player.reloadWindowEnd ?? .72;
    const available = loading && !player.reloadAttempted;
    $('active-reload').classList.toggle('hidden', !canPlay() || !loading);
    $('active-reload').classList.toggle('missed', player.reloadResult === 'miss');
    $('active-reload').classList.toggle('in-window', available && progress >= start && progress <= end);
    $('reload-window').style.left = start * 100 + '%'; $('reload-window').style.width = (end - start) * 100 + '%';
    $('reload-cursor').style.left = Math.min(1, Math.max(0, progress)) * 100 + '%';
    setText('active-reload-hint', player.reloadAttempted ? '继续装填 · 本轮已尝试' : progress > end ? '窗口已过 · 等待装填' : '进入绿色区，再按 R');
    setText('active-reload-key', window.matchMedia('(pointer: coarse)').matches ? '点装填' : 'R');
  }

  function updateCoach() {
    const nearSpawn = Math.hypot(game.player.x - game.spawn.x, game.player.y - game.spawn.y) < 70;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    let text = nearSpawn ? coarse ? '拖动左摇杆，沿主线箭头探索' : 'WASD 移动，沿主线箭头探索' : runStats.shots.every(count => !count) ? coarse ? '拖动右摇杆，瞄准并持续射击' : '移动鼠标瞄准，按住左键射击' : !game.crates.some(crate => crate.opened) ? coarse ? '靠近金色补给箱，点交互开启' : '靠近金色补给箱，按 E 开启' : coarse ? '点小地图下方按钮，查看补给与信标' : '跟随信标箭头。按 M 看全图与补给点';
    if (game.elapsed > 8 && !phaseCoachSeen) text = coarse ? '点冲刺掠过敌人，再用右摇杆射击紫色印记！' : 'Shift 穿过敌人 → 回头开枪，引爆紫色印记！';
    if (game.relays.some(relay => relay.status !== 'idle')) { coachDismissed = true; save('frontier-coach', 'done'); }
    $('field-coach').classList.toggle('hidden', coachDismissed || !canPlay() || game.elapsed > 60 || game.bossSpawned);
    setText('coach-text', text);
  }

  function updateHUD() {
    const player = game.player, weapon = weapons[player.weapon];
    const reactor = game.reactor, overdrive = reactor.timer > 0, charged = reactor.charge >= reactor.maxCharge;
    stage.classList.toggle('overdrive-active', overdrive);
    $('reactor-button').classList.toggle('ready', charged && !overdrive);
    $('reactor-button').classList.toggle('active', overdrive);
    $('reactor-button').disabled = !canPlay() || !charged || overdrive;
    $('touch-overdrive').classList.toggle('hidden', !canPlay() || (!charged && !overdrive));
    $('touch-overdrive').disabled = overdrive || !canPlay();
    $('touch-overdrive').textContent = overdrive ? '暴走 ' + reactor.timer.toFixed(1) + 's' : '✳ 星核暴走';
    setText('reactor-label', overdrive ? '暴走 ' + reactor.timer.toFixed(1) + 's' : charged ? '星核就绪 · 点此释放' : '星核暴走');
    setText('reactor-charge', overdrive ? '∞' : Math.floor(reactor.charge) + '%');
    percentage('reactor-progress', overdrive ? reactor.timer / reactor.duration : reactor.charge / reactor.maxCharge);
    setText('combo-count', game.combo.count >= 2 ? game.combo.count + ' 连杀' : '冲刺 → 射击引爆');
    $('combo-count').classList.toggle('hot', game.combo.count >= 5);
    percentage('combo-progress', game.combo.timer / 4);
    if (charged && !overdrive && !reactorWasReady && canPlay()) { tone('upgrade'); notify(window.matchMedia('(pointer: coarse)').matches ? '星核蓄满！点击左上「星核就绪」释放 7 秒无限火力。' : '星核蓄满！按 F 释放 7 秒无限火力。'); }
    reactorWasReady = charged;
    setText('run-time', formatTime(game.elapsed)); setText('kill-count', String(game.kills).padStart(3, '0'));
    setText('credits', player.credits); setText('best-score', Math.max(best, game.score));
    setText('mission-state', paused ? '远征暂停' : ({ ready: '远征准备', playing: '行动进行中', upgrade: '生长协议', relic: '遗迹奖励', won: '任务完成', lost: '信号中断' }[game.phase]));
    setText('player-level', player.level); setText('health-number', Math.ceil(player.hp) + ' / ' + player.maxHp);
    setText('health-label', player.slowTimer > 0 ? '冰缓 ' + player.slowTimer.toFixed(1) + 's' : '生命');
    $('health-label').classList.toggle('slowed', player.slowTimer > 0);
    percentage('health-progress', player.hp / player.maxHp); $('health-progress').style.background = player.hp < player.maxHp * .3 ? '#ee8ca5' : '';
    setText('xp-label', '经验 ' + Math.floor(player.xp) + ' / ' + player.xpNeeded); percentage('xp-progress', player.xp / player.xpNeeded);
    setText('ammo-current', overdrive ? '∞' : String(player.ammo).padStart(2, '0')); setText('ammo-max', player.magSize); setText('weapon-name', overdrive ? weapon.name + ' · 无限火力' : weapon.name);
    setText('reload-label', player.reloadTimer > 0 ? (player.reloadAttempted ? '装填中 ' : '再按 R · ') + player.reloadTimer.toFixed(1) + 's' : player.overcharged ? '强化弹匣 +15%' : player.ammo === 0 ? '按 R 装填' : '装填弹药');
    percentage('reload-progress', player.reloadTimer > 0 ? 1 - player.reloadTimer / (weapon.reloadTime * player.reloadMultiplier) : 0);
    $('ammo-current').style.color = player.ammo === 0 ? '#ee8ca5' : player.overcharged ? '#c3f076' : '';
    setText('dash-label', player.dashCooldown > 0 ? player.dashCooldown.toFixed(1) + 's' : '相位冲刺');
    setText('skill-label', player.skillCooldown > 0 ? Math.ceil(player.skillCooldown) + 's' : '脉冲震荡');
    $('dash-cooldown').style.height = player.dashCooldown / player.dashCooldownMax * 100 + '%';
    $('skill-cooldown').style.height = player.skillCooldown / player.skillCooldownMax * 100 + '%';
    const locked = !canPlay();
    $('dash-button').disabled = locked || player.dashCooldown > 0; $('skill-button').disabled = locked || player.skillCooldown > 0;
    $('reload-button').disabled = locked || (player.reloadTimer > 0 ? !!player.reloadAttempted : player.ammo === player.magSize);
    $('touch-interact').disabled = locked;
    const weaponNotes = [player.arcRounds ? 'ϟ 电弧连锁' : '稳定 · 全距离', player.repulsorRounds ? '» 震荡击退' : '爆发 · 近距离', player.shatterRounds ? '✧ 命中裂解' : '贯穿 · 成群目标', '爆炸 · 密集敌群', '去返 · 走位切割'];
    document.querySelectorAll('[data-weapon]').forEach(button => { const index = Number(button.dataset.weapon); button.classList.toggle('active', index === player.weapon); button.disabled = locked; button.setAttribute('aria-pressed', index === player.weapon ? 'true' : 'false'); button.querySelector('small').textContent = weaponNotes[index]; });
    setText('relay-count', game.completedRelays + ' / 3'); setText('objective-text', game.currentObjective);
    setText('zone-label', game.map.name);
    let tracked = game.relays.find(relay => relay.id === trackedRelayId && !['active', 'locked'].includes(relay.status));
    if (!tracked) { tracked = game.relays.filter(relay => !['active', 'locked'].includes(relay.status)).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0]; trackedRelayId = tracked?.id ?? null; }
    renderer.trackedRelayId = trackedRelayId;
    setText('tracked-target', tracked ? (tracked.name.split(' · ')[1] || tracked.name) + ' · ' + Math.round(Math.hypot(tracked.x - player.x, tracked.y - player.y) / 10) + ' m' : '主线完成 · 击败守卫');
    const contract = game.contracts.find(item => item.id === trackedContractId && item.status !== 'complete');
    if (!contract) trackedContractId = null;
    renderer.trackedContractId = trackedContractId;
    if (contract) {
      const target = game.contractTarget(contract);
      const action = contract.status === 'ready' ? '返回领奖' : contract.status === 'active' ? (contract.kind === 'salvage' ? '回收核心 ' : '清除目标 ') + contract.progress + '/' + contract.goal : '靠近终端接取';
      setText('objective-text', '支线 · ' + contract.name + ' · ' + action);
      setText('tracked-target', action + ' · ' + Math.round(Math.hypot(target.x - player.x, target.y - player.y) / 10) + ' m');
    }
    const relayNames = game.relays.map((relay, index) => '0' + (index + 1) + ' ' + (relay.name.split(' · ')[1] || relay.name).slice(0, 4));
    [...$('relay-indicators').children].forEach((element, index) => { element.textContent = relayNames[index]; element.classList.toggle('active', game.relays[index].status === 'active'); element.classList.toggle('charging', game.relays[index].status === 'charging'); });
    const charging = game.relays.find(relay => relay.status === 'charging');
    $('relay-progress-wrap').classList.toggle('hidden', !charging);
    if (charging) {
      const inside = Math.hypot(player.x - charging.x, player.y - charging.y) <= charging.radius;
      percentage('relay-progress', charging.progress);
      if (game.map.mode === 'demolition') {
        const core = game.enemies.find(enemy => enemy.id === charging.reactorId);
        setText('relay-progress-label', '拆毁进度 ' + Math.floor(charging.progress * 100) + '%');
        setText('relay-wave-label', core ? '反应堆耐久 ' + Math.ceil(core.hp) + ' · 集中火力' : '反应堆已暴露');
      } else if (game.map.mode === 'escort') {
        setText('relay-progress-label', (inside ? '运输车前进 ' : '离车暂停 ') + Math.floor(charging.progress * 100) + '%');
        setText('relay-wave-label', '留在车旁光圈内 · 清除沿路敌群');
      } else {
        setText('relay-progress-label', (inside ? '正在上传 ' : '离圈暂停 ') + Math.floor(charging.progress * 100) + '% · ' + Math.ceil((1 - charging.progress) * charging.duration) + 's');
        setText('relay-wave-label', '防守 ' + (charging.wave || 1) + '/3 · ' + (charging.waveName || '敌群接近'));
      }
      $('relay-progress-wrap').classList.toggle('outside', game.map.mode !== 'demolition' && !inside);
    }
    const hint = canPlay() ? game.interactionHint() : '';
    $('interaction-hint').classList.toggle('hidden', !hint); $('interaction-hint').querySelector('span').textContent = hint.replace(/^E\s*·\s*/, '');
    const boss = game.enemies.find(enemy => enemy.type === 'boss'); $('boss-hud').classList.toggle('hidden', !boss);
    if (boss) {
      percentage('boss-progress', boss.hp / boss.maxHp); setText('boss-phase', 'PHASE 0' + (boss.stage || 1));
      setText('boss-name', boss.name || game.map.boss.name);
      $('boss-hud').style.setProperty('--boss-color', boss.color || game.map.boss.color);
      $('boss-hud').classList.toggle('winding', boss.windup > 0);
      $('boss-hud').classList.toggle('exposed', boss.recoveryTimer > 0);
      setText('boss-tactic', boss.windup > 0 ? (boss.attackName || '攻击预警') + ' · ' + (boss.attackHint || '离开危险区域') : boss.recoveryTimer > 0 ? '弱点暴露 · 趁现在集中火力' : game.map.boss.subtitle);
    }
    const danger = game.hazards.filter(hazard => hazard.owner === 'environment' && hazard.remaining > 0).sort((a, b) => a.remaining - b.remaining)[0];
    $('sector-status').classList.toggle('warning', !!danger);
    setText('sector-status', boss ? '终局作战 · 战区威胁已停止' : danger ? '⚠ ' + (danger.name || game.map.threat.name) + ' ' + danger.remaining.toFixed(1) + 's · ' + (danger.hint || '离开预警区') : charging ? game.map.threat.name + ' · 留意地面预警' : '战区威胁 · ' + game.map.threat.name);
    $('sector-status').style.setProperty('--threat-color', danger?.color || game.map.color);
    $('pause-toggle').disabled = !['playing'].includes(game.phase) || (!!screen && screen !== 'pause');
    $('pause-toggle').textContent = paused ? '▶' : 'Ⅱ'; $('pause-toggle').setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
    $('fullscreen-pause').disabled = $('pause-toggle').disabled;
    $('fullscreen-pause').textContent = paused ? '继续' : '暂停';
    $('help-toggle').disabled = !!screen && !['welcome', 'pause'].includes(screen);
    $('map-toggle').disabled = !['ready', 'playing'].includes(game.phase) || (!!screen && !['welcome', 'pause', 'map'].includes(screen));
    $('field-map-toggle').disabled = $('map-toggle').disabled;
    updateCoach(); updateReloadMeter();
    renderer.drawMinimap($('minimap'), game);
  }

  function act(action) {
    if (!canPlay()) return;
    const result = action(); processEvents(); updateHUD(); canvas.focus({ preventScroll: true }); return result;
  }
  function interact() { act(() => { const result = game.interact(); if (!result) notify(game.interactionHint() ? '暂时无法使用：检查芯片数量、生命或当前任务。' : '靠近信标、补给箱或设施，再按 E 交互。'); return result; }); }
  function switchWeapon(index) { act(() => { if (game.switchWeapon(index)) tone('click'); }); }
  function movement() {
    return { x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touch.moveX, y: Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touch.moveY };
  }
  $('dash-button').addEventListener('click', () => act(() => game.dash(movement())));
  $('skill-button').addEventListener('click', () => act(() => game.useSkill()));
  $('reactor-button').addEventListener('click', () => act(() => game.activateOverdrive()));
  $('touch-overdrive').addEventListener('click', () => act(() => game.activateOverdrive()));
  $('reload-button').addEventListener('click', () => act(() => game.reload()));
  $('touch-interact').addEventListener('click', interact);
  document.querySelectorAll('[data-weapon]').forEach(button => button.addEventListener('click', () => switchWeapon(Number(button.dataset.weapon))));
  $('pause-toggle').addEventListener('click', () => screen === 'pause' ? resume() : pauseGame());
  $('fullscreen-pause').addEventListener('click', () => screen === 'pause' ? resume() : pauseGame());
  $('fullscreen-exit').addEventListener('click', () => document.exitFullscreen());
  $('help-toggle').addEventListener('click', showHelp);
  $('sound-toggle').addEventListener('click', () => { sound = !sound; audio.setEnabled(sound); save('frontier-sound', sound ? 'on' : 'off'); updateSound(); if (sound) tone('click'); });
  $('map-toggle').addEventListener('click', () => screen === 'map' ? closeMap() : showMap());
  $('field-map-toggle').addEventListener('click', showMap);
  $('coach-dismiss').addEventListener('click', () => { coachDismissed = true; save('frontier-coach', 'done'); updateCoach(); canvas.focus({ preventScroll: true }); });
  $('fullscreen-toggle').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.requestFullscreen(); renderer.resize(); }
    catch (_) { notify('当前浏览器未允许全屏，可以使用浏览器的全屏功能。'); }
  });

  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const code = event.code;
    if (screen) {
      if (screen === 'map' && ['KeyM', 'Escape'].includes(code)) { event.preventDefault(); if (!event.repeat) closeMap(); return; }
      if (code === 'KeyM' && ['pause', 'welcome'].includes(screen)) { event.preventDefault(); if (!event.repeat) showMap(); return; }
      if (code === 'Tab') {
        const buttons = [...$('screen-content').querySelectorAll('button:not(:disabled)')], first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (event.repeat) return;
      if (screen === 'upgrade' && /^Digit[123]$/.test(code)) { event.preventDefault(); const choice = game.upgradeChoices[Number(code.slice(-1)) - 1]; if (choice) selectUpgrade(choice.id); }
      else if (screen === 'relic' && /^Digit[123]$/.test(code)) { event.preventDefault(); const choice = game.relicChoices[Number(code.slice(-1)) - 1]; if (choice) selectRelic(choice.id); }
      else if ((code === 'Escape' || code === 'KeyP') && screen === 'pause') { event.preventDefault(); resume(); }
      else if (code === 'Escape' && screen === 'help') { event.preventDefault(); returnFromHelp(); }
      else if (code === 'Escape' && screen === 'restart') { event.preventDefault(); showPause(); }
      return;
    }
    if (event.target.closest('button,a,input,textarea,select') && ['Space', 'Enter'].includes(code)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) { event.preventDefault(); if (canPlay()) keys.add(code); }
    else if (!event.repeat) {
      if (code === 'KeyP' || code === 'Escape') { event.preventDefault(); pauseGame(); }
      else if (code === 'KeyM' || code === 'Tab') { event.preventDefault(); showMap(); }
      else if (canPlay()) {
        if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') { event.preventDefault(); act(() => game.dash(movement())); }
        else if (code === 'KeyR') { event.preventDefault(); act(() => game.reload()); }
        else if (code === 'KeyQ') { event.preventDefault(); act(() => game.useSkill()); }
        else if (code === 'KeyF') { event.preventDefault(); act(() => game.activateOverdrive()); }
        else if (code === 'KeyE') { event.preventDefault(); interact(); }
        else if (/^Digit[12345]$/.test(code)) { event.preventDefault(); switchWeapon(Number(code.slice(-1)) - 1); }
      }
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  function pointerPosition(event) {
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.seen = true;
    const rect = stage.getBoundingClientRect(); $('aim-reticle').style.left = event.clientX - rect.left + 'px'; $('aim-reticle').style.top = event.clientY - rect.top + 'px';
  }
  canvas.addEventListener('pointermove', pointerPosition);
  canvas.addEventListener('pointerenter', () => { pointer.inside = true; });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
  canvas.addEventListener('pointerdown', event => { if (event.button !== 0 || !canPlay()) return; pointerPosition(event); pointer.down = true; pointer.shotQueued = true; canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); });
  window.addEventListener('pointerup', () => { pointer.down = false; });
  canvas.addEventListener('pointercancel', () => { pointer.down = false; pointer.shotQueued = false; });
  canvas.addEventListener('lostpointercapture', () => { pointer.down = false; });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  function bindStick(id, aiming) {
    const stick = $(id); let activePointer = null;
    const move = event => {
      if (activePointer !== event.pointerId || !canPlay()) return;
      const rect = stick.getBoundingClientRect(); let dx = (event.clientX - rect.left - rect.width / 2) / 32, dy = (event.clientY - rect.top - rect.height / 2) / 32;
      const magnitude = Math.hypot(dx, dy); if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
      stick.querySelector('i').style.transform = 'translate(' + dx * 26 + 'px,' + dy * 26 + 'px)';
      if (aiming) { touch.aimX = dx; touch.aimY = dy; touch.shoot = magnitude > .16; }
      else { touch.moveX = dx; touch.moveY = dy; }
    };
    stick.addEventListener('pointerdown', event => { if (!canPlay()) return; event.preventDefault(); activePointer = event.pointerId; stick.setPointerCapture(activePointer); move(event); });
    stick.addEventListener('pointermove', move);
    const stop = event => { if (event.pointerId !== activePointer) return; activePointer = null; stick.querySelector('i').style.transform = ''; if (aiming) touch.shoot = false; else { touch.moveX = 0; touch.moveY = 0; } };
    stick.addEventListener('pointerup', stop); stick.addEventListener('pointercancel', stop); stick.addEventListener('lostpointercapture', stop);
  }
  bindStick('move-stick', false); bindStick('aim-stick', true);
  window.addEventListener('blur', () => { clearInput(); if (canPlay()) pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (canPlay()) pauseGame(); } });
  window.addEventListener('pagehide', rememberBest);
  document.addEventListener('fullscreenchange', () => { renderer.resize(); renderDirty = true; });
  new ResizeObserver(() => { renderer.resize(); renderDirty = true; if (screen === 'map') renderer.drawMinimap($('tactical-map'), game, { detailed: true }); }).observe(stage);
  motionPreference.addEventListener('change', event => { if (read('frontier-motion') === null) renderer.reducedMotion = event.matches; });

  function frame(timestamp) {
    const dt = Math.min(.05, (timestamp - (lastTimestamp || timestamp)) / 1000); lastTimestamp = timestamp;
    if (canPlay()) {
      const move = movement();
      let aim = pointer.seen ? renderer.screenToWorld(pointer.x, pointer.y) : { x: game.player.x + Math.cos(game.player.angle) * 150, y: game.player.y + Math.sin(game.player.angle) * 150 };
      if (touch.shoot) aim = { x: game.player.x + touch.aimX * 300, y: game.player.y + touch.aimY * 300 };
      const heldTime = renderer.reducedMotion ? 0 : Math.min(dt, impactPause);
      impactPause = Math.max(0, impactPause - dt);
      game.update(dt - heldTime, { moveX: move.x, moveY: move.y, aimX: aim.x, aimY: aim.y, shoot: pointer.down || pointer.shotQueued || touch.shoot });
      if (dt > heldTime) pointer.shotQueued = false;
      processEvents();
    }
    if (game.phase !== lastPhase) {
      lastPhase = game.phase;
      if (game.phase === 'upgrade') showUpgrade();
      else if (game.phase === 'relic') showRelics();
      else if (['won', 'lost'].includes(game.phase)) showResult();
    }
    if (canPlay() || renderDirty) {
      renderer.render(game, canPlay() ? dt : 0);
      renderDirty = false;
    }
    if (game.player.reloadTimer > 0) updateReloadMeter();
    $('aim-reticle').style.opacity = pointer.inside && canPlay() ? '1' : '0';
    uiTimer += dt; if (uiTimer > .09) { updateHUD(); uiTimer = 0; }
    requestAnimationFrame(frame);
  }
  renderer.camera.x = game.player.x; renderer.camera.y = game.player.y;
  updateSound(); welcome(); renderer.resize(); requestAnimationFrame(frame);
})();
