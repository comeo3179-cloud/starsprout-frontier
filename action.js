(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('world');
  const stage = $('game-stage');
  let accountIdentity = readAccountIdentity();
  let profileReady = false, accountTransition = false, deferredSession;
  let storage; try { storage = localStorage; } catch (_) { storage = null; }
  const profiles = new FrontierProfiles.Store({ storage, adapter: FrontierCloud.adapter, onChange: () => { if (profileReady) refreshProfile(); } });
  if (accountIdentity) profiles.switchAccount(accountIdentity.uid);
  const game = new Expedition.Game({ discoveredSecrets: profiles.snapshot.secrets });
  const renderer = new ExpeditionRenderer(canvas);
  const weapons = Expedition.WEAPONS;
  const keys = new Set();
  const stickResets = [];
  const dashBufferWindow = .12;
  let queuedDash = null;
  const pointer = { x: 0, y: 0, inside: false, seen: false, down: false, shotQueued: false, dirty: false };
  const touch = { moveX: 0, moveY: 0, aimX: 1, aimY: 0, shoot: false };
  const textValues = new Map();
  let paused = false;
  let screen = 'welcome';
  let previousScreen = '';
  let evolutionReturn = 'welcome';
  let lastPhase = 'ready';
  let lastTimestamp = 0;
  let uiTimer = 0;
  let renderDirty = true;
  let hudDirty = true;
  let best = profiles.snapshot.bestScore;
  let sound = read('frontier-sound') !== 'off';
  let music = read('frontier-music') !== 'off';
  const audio = new FrontierAudio();
  audio.setEnabled(sound);
  audio.setMusicEnabled(music);
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  renderer.reducedMotion = read('frontier-motion') === 'calm' || (read('frontier-motion') === null && motionPreference.matches);
  let trackedRelayId = game.relays[0].id;
  let trackedContractId = null;
  let trackedEncounterId = null;
  let riftReturn = 'welcome';
  let mapReturn = '';
  let archiveReturn = 'welcome';
  const revelationQueue = [];
  let activeRevelation = null;
  let revelationTimer;
  let revelationReady = false;
  let trialResultRecorded = false;
  let runId = crypto.randomUUID();
  let runStats = { shots: weapons.map(() => 0), dashes: 0, perfectReloads: 0 };
  let coachDismissed = profiles.snapshot.coachDone;
  let coachStep = 0;
  let coachMoveDistance = 0;
  let objectiveExpanded = false;
  let hitTimer;
  let lastImpactTime = -1;
  let notificationTimer;
  let bannerTimer;
  let damageTimer;
  let pickupToneTime = 0;
  let impactPause = 0;
  let lastBurstTone = -1;
  let lastFieldTone = -1;
  let reactorWasReady = false;
  let visibleWeapon = -1;
  let phaseCoachSeen = false;

  function read(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* Storage is optional in local/private browsing. */ } }
  function readAccountIdentity() {
    try { const value = JSON.parse(read('frontier-account-v1')); return value && typeof value.uid === 'string' && value.uid ? { uid: value.uid, label: String(value.label || '开拓者') } : null; }
    catch (_) { return null; }
  }
  function profileSaveNote() {
    if (!accountIdentity) return profiles.status.persistent ? '游客档案仅保存在本浏览器。登录后可主动认领，换设备可同步。' : '浏览器未允许保存，关闭页面可能丢失。请登录并完成云端同步。';
    if (profiles.status.error || profiles.status.pending) return '此账号有进度待同步。请保留本机数据，联网后在个人档案重试。';
    return profiles.status.syncing || profiles.status.loading ? '正在同步此账号的成就与纪录…' : '此账号的成就与纪录已同步。其他账号拥有独立档案。';
  }
  function updateAccountEntry() {
    const button = $('open-account');
    if (button) button.textContent = accountIdentity ? '◈ ' + accountIdentity.label + ' · ' + (profiles.status.loading || profiles.status.syncing ? '同步中' : profiles.status.error || profiles.status.pending ? '待同步' : '个人档案') : '◈ 游客 · 登录账号，同步成就 ↗';
  }
  function refreshProfile() {
    const snapshot = profiles.snapshot;
    game.discoveredSecrets = new Set(snapshot.secrets);
    best = snapshot.bestScore; coachDismissed = snapshot.coachDone;
    hudDirty = true; updateAccountEntry(); accountPanel.refresh();
    const note = $('screen-content').querySelector('.secret-save-note');
    if (note) note.textContent = profileSaveNote();
  }
  async function applyAccountSession(identity) {
    const changed = (identity?.uid || null) !== (accountIdentity?.uid || null);
    if (changed) { rememberBest(); clearInput(); resetRun(game.mode === 'trial' ? 'frontier' : game.map.id); game.discoveredSecrets.clear(); }
    accountIdentity = identity;
    save('frontier-account-v1', JSON.stringify(identity));
    await profiles.switchAccount(identity?.uid || null);
    refreshProfile();
  }
  function openAccount() {
    if (activeRevelation || screen !== 'welcome') return;
    showScreen('account', ''); accountPanel.open($('screen-content'));
  }
  function setText(id, value) { value = String(value); if (textValues.get(id) !== value) { $(id).textContent = value; textValues.set(id, value); } }
  function selectChoice(attribute, value) {
    $('screen-content').querySelectorAll('[data-' + attribute + ']').forEach(button => {
      const selected = button.getAttribute('data-' + attribute) === value;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
  }
  function percentage(id, value) { $(id).style.width = Math.max(0, Math.min(100, value * 100)) + '%'; }
  function formatTime(seconds) { return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0'); }
  function clearInput() { keys.clear(); queuedDash = null; pointer.down = false; pointer.shotQueued = false; touch.moveX = 0; touch.moveY = 0; touch.shoot = false; stickResets.forEach(reset => reset()); }
  function canPlay() { return game.phase === 'playing' && !paused && !screen && !activeRevelation; }

  function tone(kind, weapon = 0) { audio.play(kind, weapon); }
  function updateMusic() { audio.setScene(!canPlay() || document.hidden ? 'silent' : game.salvage && ['approaching', 'boarding'].includes(game.salvage.status) ? 'evac' : game.enemies.some(enemy => enemy.type === 'boss' && enemy.hp > 0) ? 'boss' : game.enemies.some(enemy => enemy.hp > 0) ? 'combat' : 'explore', game.map.id); }
  function updateSound() { $('sound-toggle').querySelector('span').textContent = sound ? '声音开' : '声音关'; $('sound-toggle').setAttribute('aria-label', sound ? '关闭全部声音' : '开启音效与配乐'); }
  function notify(message) {
    $('notification').classList.remove('discovery');
    $('notification').textContent = message; $('notification').classList.add('visible');
    $('run-log').textContent = message; $('live-status').textContent = message;
    clearTimeout(notificationTimer); notificationTimer = setTimeout(() => $('notification').classList.remove('visible'), 3300);
    renderer.pointerHudTime = -1;
  }
  function banner(label, message, duration = 1200) {
    $('banner-label').textContent = label; $('banner-text').textContent = message; $('event-banner').classList.remove('hidden');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => $('event-banner').classList.add('hidden'), Math.min(1600, duration));
    renderer.pointerHudTime = -1;
  }
  function processEvents() {
    const events = game.drainEvents(); renderer.consume(events);
    const discoveries = [];
    let teachPhase = false;
    for (const event of events) {
      if (event.type === 'shot' && event.owner === 'player') { tone('shot', event.weapon); runStats.shots[event.weapon]++; advanceCoach('shot'); }
      else if (event.type === 'hit') {
        $('aim-reticle').classList.add('hit'); $('aim-reticle').classList.toggle('critical', !!event.critical);
        clearTimeout(hitTimer); hitTimer = setTimeout(() => $('aim-reticle').classList.remove('hit', 'critical'), 95);
        if (game.elapsed - lastImpactTime > .075) { tone(event.critical ? 'critical' : 'hit'); lastImpactTime = game.elapsed; }
      }
      else if (event.type === 'kill') tone('kill');
      else if (event.type === 'phase-mark') {
        if (!phaseCoachSeen) teachPhase = true;
      }
      else if (event.type === 'phase-capture') { if (game.elapsed - lastBurstTone > .12) { tone('phase-capture'); lastBurstTone = game.elapsed; } }
      else if (event.type === 'phase-burst') {
        if (!renderer.reducedMotion) impactPause = Math.max(impactPause, .045);
        if (game.elapsed - lastBurstTone > .1) { tone('phase-burst'); lastBurstTone = game.elapsed; }
      }
      else if (event.type === 'grenade-burst') tone('grenade-burst');
      else if (event.type === 'hazard-burst') tone('hazard-burst');
      else if (['field-arm', 'field-burst', 'field-capture', 'cover-break', 'shield-block', 'shield-open', 'breacher-crash'].includes(event.type)) {
        if (game.elapsed - lastFieldTone > .12) { tone(event.type, event.friendly ? 'friendly' : event.kind); lastFieldTone = game.elapsed; }
        if (event.type === 'field-capture') $('run-log').textContent = 'EMP 接管 · 蓝色爆破不伤你';
        else if (event.type === 'cover-break') $('run-log').textContent = '碎裂掩体已破坏 · 射线与通路打开';
        else if (event.type === 'shield-open') $('run-log').textContent = '棱盾敞开 · 侧后绕射，抓住破盾窗口';
      }
      else if (['cargo-picked', 'cargo-dropped', 'cargo-delivered', 'star-pin', 'starline-created', 'starline-trigger', 'starline-capture'].includes(event.type)) {
        tone(event.type, event.clearedBullets > 0 ? 'capture' : 0);
        if (event.type === 'cargo-picked') { trackedRelayId = event.relayId; trackedContractId = trackedEncounterId = null; notify(event.message || '星火已携带 · 保持火力，送至对应接收站；冲刺会放下。'); }
        else if (event.type === 'cargo-dropped') notify(event.message || '星火留在冲刺起点 · 安全后按交互取回。');
      }
      else if (event.type === 'overdrive-start') { tone('overdrive-start'); banner('STARCORE / OVERDRIVE', '星核暴走 · 火力全开', 1100); clearTimeout(notificationTimer); $('notification').classList.remove('visible'); $('run-log').textContent = '7 秒无限弹药 · 射速与伤害提升 · 冲刺已重置'; }
      else if (event.type === 'overdrive-end') { tone('overdrive-end'); notify('星核冷却 · 击杀、掠弹和精准装填重新蓄能'); }
      else if (event.type === 'combo' && event.count >= 3 && event.count % 3 === 0) tone('combo', event.count);
      else if (event.type === 'damage') {
        tone('damage'); $('damage-flash').classList.add('visible');
        clearTimeout(damageTimer); damageTimer = setTimeout(() => $('damage-flash').classList.remove('visible'), 160);
      } else if (event.type === 'dash') { tone('dash'); runStats.dashes++; advanceCoach('dash'); }
      else if (event.type === 'pulse') tone('pulse');
      else if (event.type === 'relic-trigger') tone('relic-trigger');
      else if (event.type === 'secret-trigger') { tone('secret-trigger', event.secretId); if (game.mode === 'trial') runStats.techniques = (runStats.techniques || 0) + 1; }
      else if (event.type === 'secret-recover') tone('pickup');
      else if (event.type === 'secret-release') tone('secret-trigger', 'bullet-reversal');
      else if (event.type === 'secret-discovered') {
        const secret = Expedition.SECRETS.find(item => item.id === event.secretId);
        if (secret && !discoveries.includes(secret)) discoveries.push(secret);
      }
      else if (event.type === 'reload') tone('reload');
      else if (event.type === 'reload-complete') tone('reload-complete');
      else if (event.type === 'reload-perfect') { tone('reload-perfect'); runStats.perfectReloads++; advanceCoach('reload-perfect'); notify('精准装填 · 当前弹匣伤害 +' + (game.campaign?.doctrineId === 'marksman' ? '50' : '15') + '%'); }
      else if (event.type === 'reload-miss') tone('reload-miss');
      else if (event.type === 'interact') { notify(event.message); tone('upgrade'); }
      else if (event.type === 'pickup' && game.elapsed - pickupToneTime > .14) { tone('pickup'); pickupToneTime = game.elapsed; }
      else if (event.type === 'relay-start') { trackedEncounterId = null; trackedRelayId = game.relays.find(relay => relay.status === 'charging')?.id ?? trackedRelayId; banner('MISSION / ENGAGED', game.map.mode === 'demolition' ? '反应堆暴露 · 集火拆毁' : game.map.mode === 'escort' ? '运输车启动 · 随车推进' : game.map.mode === 'conduction' ? '塔内引雷 · 锁定后撤离' : '坚守信标光圈'); $('run-log').textContent = game.map.briefing; }
      else if (event.type === 'relay-wave') { banner('DEFENSE / ' + event.wave + ' OF 3', event.waveName); }
      else if (event.type === 'relay-complete') { banner('MISSION COMPLETE · ' + event.completed + ' / 3', game.map.objectiveLabel + '完成'); notify(event.name + '完成：生命恢复、芯片与经验奖励已到达。'); tone('upgrade'); }
      else if (event.type === 'boss-spawn') { banner('WARNING / SECTOR BOSS', game.map.boss.name + '正在接近'); if (!game.siege) notify(game.map.boss.subtitle); }
      else if (event.type === 'boss-phase') { banner('PHASE 0' + (event.stage || 2), game.map.boss.name + ' · ' + (game.siege ? event.stage === 3 ? '过载反扑' : '核心裸露' : '二阶段')); tone('pulse'); }
      else if (event.type === 'conduction-charge') { tone('conduction-charge', event.charges); if (event.charges < event.chargeGoal) notify('导雷 ' + event.charges + '/' + event.chargeGoal + ' · 返回塔圈，准备下一次'); }
      else if (event.type === 'conduction-miss') { tone('reload-miss'); notify(event.message); }
      else if (event.type === 'boss-backlash') { tone('boss-backlash'); banner('STORM / REVERSED', '引雷反噬 · 弱点暴露', 1000); $('run-log').textContent = event.message; }
      else if (event.type === 'sector-warning') { tone('sector-warning'); $('run-log').textContent = event.name + ' · ' + event.hint; }
      else if (event.type === 'boss-attack') { tone('boss-attack'); $('run-log').textContent = event.name + ' · ' + event.hint; }
      else if (event.type === 'level-up') tone('upgrade');
      else if (event.type === 'trial-warning') { banner('RIFT TRIAL / ' + game.trial.wave + ' OF 6', game.trial.title + ' · 准备迎战', 2400); $('run-log').textContent = game.trial.briefing; }
      else if (event.type === 'trial-wave') { tone('sector-warning'); banner('WAVE ' + game.trial.wave, game.trial.title, 1600); }
      else if (event.type === 'campaign-rest') { tone('campaign-rest'); $('run-log').textContent = '战区已突破 · 安全整备 · 构筑已保留'; }
      else if (event.type === 'campaign-stage') { tone('campaign-stage'); banner('LONG EXPEDITION / ACT ' + game.campaign.stage, game.map.name + ' · 构筑已继承'); notify(game.map.id === 'nexus' ? '先拆双锚，护盾永久解除。斜向光带侧移躲，爆圈锁定后撤离。' : game.map.briefing); }
      else if (event.type === 'campaign-crisis') { tone('sector-warning'); $('run-log').textContent = event.message; }
      else if (event.type === 'campaign-complete') tone('campaign-complete');
      else if (event.type === 'voyage-room') { tone('voyage-room'); banner('STARFARING / NODE ' + game.voyage.node + ' OF 7', game.map.name + ' · ' + (voyageObjectiveNames[game.voyage.room.type] || '终局')); }
      else if (event.type === 'voyage-rest') { tone('voyage-rest'); $('run-log').textContent = '航段已突破 · 安全整备 · 装置和成长已保留'; }
      else if (event.type === 'voyage-complete') tone('voyage-complete');
      else if (event.type === 'voyage-boss-phase') { tone('voyage-boss-phase'); banner('DEVOURER / PHASE 0' + event.stage, '航界吞星者 · ' + (event.stage === 3 ? '终末星蚀' : '折跃裂界'), 1800); }
      else if (event.type === 'voyage-boss-teleport') tone('voyage-boss-teleport');
      else if (event.type === 'voyage-objective') { tone('voyage-objective'); notify('目标完成 · 前往出口交互'); }
      else if (event.type === 'voyage-device' || event.type === 'voyage-device-trigger') tone('voyage-device', event.deviceId);
      else if (event.type === 'voyage-resonance') tone('voyage-resonance', event.resonanceId);
      else if (event.type.startsWith('siege-')) {
        tone(event.type, event.kind);
        if (event.type === 'siege-part-break') $('run-log').textContent = '炮座落地 · EMP 接管';
        else if (event.type === 'siege-capture') $('run-log').textContent = '夺炮成功 · 瞄准后交互开火 ×3';
        else if (event.type === 'siege-redirect') $('run-log').textContent = '重弹反向 · 沿准星反击';
        else if (event.type === 'siege-armor-break') { banner('SIEGE / ARMOR BREAK', '装甲碎裂 · 核心裸露', 1000); $('run-log').textContent = '重炮反击奏效 · 全力攻击核心'; }
      }
      else if (event.type.startsWith('salvage-')) {
        tone(event.type, event.type === 'salvage-alert' ? event.level : event.kind);
        if (event.type === 'salvage-alert') banner('SALVAGE / ALERT ' + event.level, '警戒 ' + ['I', 'II', 'III', 'IV'][event.level - 1] + (event.blocked ? ' · 增援已截断' : ' · 新巡防已接近'), 1200);
        else if (event.type === 'salvage-comms-start') $('run-log').textContent = '架设通讯 · 守圈 5 秒';
        else if (event.type === 'salvage-comms-ready') { banner('SALVAGE / SIGNAL', '通讯就绪 · 下一波警戒增援被拦截', 1000); $('run-log').textContent = '拦截已准备 · 警戒与扫描仍继续'; }
        else if (event.type === 'salvage-comms-block') $('run-log').textContent = '增援拦截完成 · 通讯站已耗尽';
        else if (event.type === 'salvage-comms-expired') $('run-log').textContent = '通讯失效 · 警戒增援已全部出动';
        else if (event.type === 'salvage-call') banner('SALVAGE / EXTRACTION', '接应已呼叫 · ' + event.duration + ' 秒后到达', 1200);
        else if (event.type === 'salvage-lastchance-appear') { banner('SALVAGE / LAST CHANCE', '接应 ' + game.salvage.evac.duration + 's · 货箱 18s / +4', 1200); $('run-log').textContent = '限时货箱 · 带回 +320 · 取货招来 2 名追兵'; }
        else if (event.type === 'salvage-lastchance-collected') $('run-log').textContent = '货箱 +4 样本已携带 · 2 名追兵接近';
        else if (event.type === 'salvage-lastchance-expired') $('run-log').textContent = '货箱已过期 · 接应继续';
        else if (event.type === 'salvage-arrive') banner('SALVAGE / BOARDING', '接应已到 · 进入撤离圈登舰', 1200);
        else if (event.type === 'salvage-cargo-picked') $('run-log').textContent = '黑匣子：带回 +480 · 武器伤害 +15% · 每 12 秒暴露，可按 G / 弃货放下';
        else if (event.type === 'salvage-cargo-dropped') $('run-log').textContent = '黑匣子已放下 · 停止新广播，已来的追兵仍在';
        else if (event.type === 'salvage-cargo-pulse') $('run-log').textContent = '黑匣子广播 · 位置已暴露，追兵接近';
        else if (event.type === 'salvage-collected') $('run-log').textContent = '样本 +' + event.value + ' · 登舰后才结算奖金';
        else if (event.type === 'salvage-vault-unlock') $('run-log').textContent = '静默窗口已开启 · 靠近保险箱交互领取';
        else if (event.type === 'salvage-source-start') $('run-log').textContent = '钻探已启动 · 留在工作圈，离圈暂停';
        else if (event.type === 'salvage-source-open') $('run-log').textContent = '回收源已打开 · 靠近交互带走样本';
        else if (event.type === 'salvage-withdraw') $('run-log').textContent = '已安全撤回 · 本次没有带回样本';
      }
      else if (event.type === 'anchor-break') { tone('anchor-break'); $('run-log').textContent = '能量锚已击破 · 移向下一处锚点'; }
      else if (event.type === 'nexus-shield-break') { tone('nexus-shield-break'); banner('NEXUS / SHIELD BROKEN', '双锚断裂 · 核心永久暴露', 1800); }
      else if (event.type === 'contract-start') { trackedContractId = event.contractId; trackedEncounterId = null; banner('SIDE EXPEDITION', '支线已接取'); notify(event.message); tone('click'); }
      else if (event.type === 'contract-ready') { banner('OBJECTIVE COMPLETE', '返回终端 · 领取遗物'); notify(event.message); tone('upgrade'); }
      else if (['contract-progress', 'contract-reward', 'relic-acquired'].includes(event.type)) { notify(event.message); tone('upgrade'); }
      else if (event.type === 'encounter-start') { trackedEncounterId = event.encounterId; trackedContractId = null; banner('RIFT SALVAGE / 开始回收', '异象已唤醒', 1400); notify(event.message); tone('rift-start'); }
      else if (event.type === 'encounter-progress') { if (event.message) $('run-log').textContent = event.message; tone('rift-node'); }
      else if (event.type === 'encounter-ready') { trackedEncounterId = event.encounterId; trackedContractId = null; banner('RIFT STABILIZED', '回到终端 · 选择战术', 1800); notify(event.message); tone('rift-ready'); }
      else if (event.type === 'encounter-failed') { notify(event.message); tone('rift-failed'); }
      else if (event.type === 'encounter-reward') { notify(event.message); }
      else if (event.type === 'tactic-equipped') { notify(event.message); tone('rift-ready'); }
      else if (event.type === 'tactic-trigger') tone('tactic-trigger', event.tacticId);
      else if (event.type === 'awakening-acquired') { tone('awakening-acquired'); $('run-log').textContent = '流派觉醒 · ' + event.title; }
      else if (event.type === 'awakening-trigger') { tone('awakening-trigger', event.stage); if (event.message) $('run-log').textContent = event.message; }
      else if (event.type === 'weapon-evolved') {
        tone('weapon-evolved'); banner('WEAPON EVOLUTION / 武器进化', event.message, 2200);
        $('run-log').textContent = event.message;
      }
      else if (event.type === 'evolution-trigger') tone('evolution-trigger', event.stage);
      else if (event.type === 'win' && game.mode !== 'campaign') tone('win');
    }
    if (discoveries.length) {
      discoveries.forEach(secret => profiles.recordSecret(secret.id));
      revelationQueue.push(...discoveries);
      if (!activeRevelation) showRevelation();
    } else if (teachPhase && !activeRevelation) {
      phaseCoachSeen = true; notify('相位印记已附着！射击紫色敌人，引爆整片敌群。');
    }
  }

  function showRevelation() {
    activeRevelation = revelationQueue.shift();
    if (!activeRevelation) return;
    clearInput(); impactPause = 0; renderDirty = hudDirty = true; revelationReady = false;
    clearTimeout(notificationTimer); $('notification').classList.remove('visible');
    const secret = activeRevelation;
    const colors = { rebound: '#ffd28e', 'blade-relay': '#b4ffdc', 'bullet-reversal': '#74efff', 'fuse-resonance': '#ffae7d', 'rail-resonance': '#c8afff', 'ice-break': '#bdefff' };
    const overlay = $('revelation-overlay');
    stage.classList.add('revealing');
    overlay.style.setProperty('--revelation-color', colors[secret.id]);
    overlay.classList.toggle('calm', renderer.reducedMotion);
    overlay.innerHTML = '<div class="revelation-rays" aria-hidden="true"></div><section class="revelation-dialog" tabindex="-1"><small class="revelation-kicker">THE FRONTIER REMEMBERS · 首次领悟</small><div class="revelation-seal" aria-hidden="true"><i></i><span>' + secret.icon + '</span><i></i></div><p class="revelation-oath">荒原，铭记这一刻。</p><h2 id="revelation-title">' + secret.title + '</h2><p class="revelation-condition">' + secret.condition + '</p><p class="revelation-effect">' + secret.description + '</p><button id="revelation-continue" disabled>' + (revelationQueue.length ? '下一道回响 · 还有 ' + revelationQueue.length + ' 项' : '铭记 · 继续') + ' <b>↗</b></button><small class="revelation-safe">战斗已暂停 · 此刻属于你</small></section>';
    overlay.classList.remove('hidden'); $('screen-overlay').inert = true;
    if (secret.revisited) overlay.querySelector('.revelation-kicker').textContent = 'THE FRONTIER REMEMBERS · 回响重现';
    overlay.querySelector('.revelation-dialog').focus({ preventScroll: true });
    FrontierTouch.bindTouchAction($('revelation-continue'), continueRevelation);
    $('live-status').textContent = (secret.revisited ? '重温领悟：' : '首次领悟：') + secret.title + '。战斗已暂停。' + secret.description;
    $('run-log').textContent = '荒原铭记 · ' + secret.title + '已收录未知档案';
    tone('secret-discovered');
    clearTimeout(revelationTimer);
    revelationTimer = setTimeout(() => {
      revelationReady = true; $('revelation-continue').disabled = false;
      $('revelation-continue').focus({ preventScroll: true });
    }, renderer.reducedMotion ? 350 : 900);
    updateHUD();
  }
  function continueRevelation() {
    if (!activeRevelation || !revelationReady) return;
    clearInput(); clearTimeout(revelationTimer);
    const previous = activeRevelation;
    activeRevelation = null; revelationReady = false;
    if (revelationQueue.length) { showRevelation(); return; }
    $('revelation-overlay').classList.add('hidden'); $('revelation-overlay').innerHTML = '';
    stage.classList.remove('revealing');
    $('screen-overlay').inert = false; renderDirty = hudDirty = true;
    if (screen) ($('screen-content').querySelector('[data-revisit="' + previous.id + '"]') || $('screen-content').querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
    else canvas.focus({ preventScroll: true });
    updateHUD();
  }

  function showScreen(type, content) {
    screen = type; clearInput(); renderDirty = true;
    updateMusic();
    $('screen-overlay').classList.remove('hidden'); $('screen-overlay').classList.toggle('welcome', type === 'welcome'); $('screen-overlay').classList.toggle('map-screen', type === 'map');
    $('screen-overlay').classList.toggle('result-screen', type === 'result');
    $('screen-overlay').classList.toggle('secret-screen', type === 'secrets');
    $('screen-overlay').classList.toggle('trial-screen', ['trial-intro', 'trial-reward'].includes(type));
    $('screen-overlay').classList.toggle('campaign-screen', ['campaign-intro', 'campaign-rest'].includes(type));
    $('screen-overlay').classList.toggle('voyage-screen', ['voyage-intro', 'voyage-rest', 'voyage-resonance'].includes(type));
    $('screen-overlay').classList.toggle('awakening-screen', type === 'campaign-awakening');
    $('screen-overlay').classList.toggle('rift-screen', ['rift-guide', 'tactic'].includes(type));
    $('screen-overlay').classList.toggle('evolution-screen', type === 'evolution-guide');
    $('screen-overlay').classList.toggle('account-screen', type === 'account');
    $('screen-overlay').classList.toggle('battlefield-screen', type === 'battlefield');
    $('screen-overlay').classList.toggle('salvage-screen', ['salvage-intro', 'siege-intro'].includes(type));
    stage.classList.toggle('account-open', type === 'account');
    $('screen-content').innerHTML = content; $('aim-reticle').style.opacity = '0';
    $('screen-content').scrollTop = 0; $('screen-overlay').scrollTop = 0;
    const button = $('screen-content').querySelector('button:not(:disabled)'); if (button && !activeRevelation) button.focus({ preventScroll: true });
    updateHUD();
    renderer.pointerHudTime = -1;
  }
  function closeScreen() { screen = ''; $('screen-overlay').classList.add('hidden'); clearInput(); renderDirty = true; if (!activeRevelation) canvas.focus({ preventScroll: true }); updateHUD(); updateMusic(); renderer.pointerHudTime = -1; }
  function foldNote(selector, label) {
    const note = $('screen-content').querySelector(selector);
    const details = document.createElement('details'), summary = document.createElement('summary');
    details.className = 'peek-details'; summary.textContent = 'ⓘ ' + label;
    note.before(details); details.append(summary, note);
  }
  function addDisplayEntry(before) {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const entry = document.createElement('div'); entry.className = 'display-entry';
    entry.innerHTML = '<button id="display-mode-button" class="secondary-button" aria-describedby="display-mode-hint"></button><p id="display-mode-hint" aria-live="polite"></p>';
    before.before(entry);
    $('display-mode-button').addEventListener('click', () => display.toggle({ landscape: true }));
    updateDisplay();
  }
  function updateDisplay() {
    const label = display.active ? display.native ? '退出全屏' : '退出沉浸' : display.portrait ? '横屏游玩' : '全屏游玩';
    const button = $('display-mode-button');
    if (button) { button.textContent = label; button.disabled = display.busy && !display.active; }
    const hint = $('display-mode-hint');
    if (hint) hint.textContent = display.portrait ? '横置手机；开启自动旋转。' : '支持边走边换弹、换枪。';
    $('fullscreen-toggle').setAttribute('aria-label', label);
    $('fullscreen-toggle').setAttribute('aria-pressed', String(display.active));
    $('fullscreen-exit').textContent = display.native ? '退出全屏' : '退出沉浸';
    renderer.resize(); renderDirty = hudDirty = pointer.dirty = true;
  }
  function welcome() {
    showScreen('welcome', '<div class="screen-kicker">STARSPROUT / 荒原行动 · 8.1.2</div><h1 id="screen-title">选择战场，<em>即刻出发。</em></h1><p class="screen-description">探索 · 构筑 · 回收</p><div class="sector-grid">' + Expedition.MAPS.map((map, index) => '<button class="sector-card ' + (map.id === game.map.id ? 'selected' : '') + '" data-map="' + map.id + '" aria-pressed="' + (map.id === game.map.id) + '" style="--sector-color:' + map.color + '"><small>SECTOR 0' + (index + 1) + (map.id === 'ruins' ? ' / NEW · 归星行动' : ' / 单区行动') + '</small><span class="sector-symbol">' + ['✳', '▧', '❄', 'ϟ', '◇'][index] + '</span><b>' + map.name + '</b><span>' + map.subtitle + '</span><p>' + map.description + '</p></button>').join('') + '</div><div class="sector-brief"><b>本图目标</b><p>' + game.map.description + '</p></div><button class="launch-button" id="start-run">进入' + game.map.name + ' <b>↗</b></button><details class="peek-details" id="sector-help"><summary>ⓘ 地图说明</summary><p>' + game.map.briefing + '</p><p><b>' + game.map.threat.name + '</b> · ' + game.map.threat.description + '</p><p>首领 · ' + game.map.boss.name + '</p></details><div class="welcome-controls"><span><kbd>W A S D</kbd>移动探索</span><span><kbd>1 — 6</kbd>切换武器</span><span><kbd>SHIFT / 空格</kbd>相位冲刺</span><span><kbd>F</kbd>星核暴走</span></div>');
    $('start-run').addEventListener('click', startRun);
    $('screen-content').querySelectorAll('[data-map]').forEach(button => button.addEventListener('click', () => {
      resetRun(button.dataset.map); welcome(); tone('click');
      $('screen-content').querySelector('[data-map="' + game.map.id + '"]').focus({ preventScroll: true });
    }));
    const archiveEntry = document.createElement('div'); archiveEntry.className = 'archive-entry';
    $('start-run').after(archiveEntry); addArchiveButton(archiveEntry);
    const trialEntry = document.createElement('button'); trialEntry.id = 'open-trials'; trialEntry.className = 'trial-entry';
    trialEntry.innerHTML = '<span class="trial-entry-symbol" aria-hidden="true">⟐</span><span><small>NEW MODE / 独立挑战</small><b>裂隙试炼</b><em>六波挑战</em></span><strong>进入 ↗</strong>';
    $('screen-content').querySelector('.sector-grid').before(trialEntry); trialEntry.addEventListener('click', showTrialIntro);
    const accountEntry = document.createElement('button'); accountEntry.id = 'open-account'; accountEntry.className = 'account-entry';
    accountEntry.addEventListener('click', openAccount); $('screen-content').querySelector('.sector-grid').before(accountEntry); updateAccountEntry();
    const riftEntry = document.createElement('button'); riftEntry.id = 'open-rifts'; riftEntry.className = 'rift-entry';
    riftEntry.innerHTML = '<span aria-hidden="true">◈</span><span><small>EXPLORE / 裂隙遗珍</small><b>裂隙与战术模块</b><em>三种可选挑战 · 三枚战术模块 · 单槽择一</em></span><strong>探索 ↗</strong>';
    trialEntry.before(riftEntry); riftEntry.addEventListener('click', showRiftGuide);
    const evolutionEntry = document.createElement('button'); evolutionEntry.id = 'open-evolutions'; evolutionEntry.className = 'rift-entry evolution-entry';
    evolutionEntry.innerHTML = '<span aria-hidden="true">✧</span><span><small>NEW / 异构军械</small><b>六种武器进化</b><em>对应改造 + 4 级 · 升级时选择 · 每局限一把</em></span><strong>查看 ↗</strong>';
    riftEntry.before(evolutionEntry); evolutionEntry.addEventListener('click', showEvolutionGuide);
    const campaignEntry = document.createElement('button'); campaignEntry.id = 'campaign-entry'; campaignEntry.className = 'campaign-entry';
    campaignEntry.innerHTML = '<span class="campaign-entry-mark" aria-hidden="true">◎</span><span><small>4.0 / 归星织网</small><b>连续远征</b><em>三幕构筑</em></span><strong>进入 ↗</strong>';
    $('screen-content').querySelector('.screen-description').after(campaignEntry); campaignEntry.addEventListener('click', showCampaignIntro);
    const voyageEntry = document.createElement('button'); voyageEntry.id = 'voyage-entry'; voyageEntry.className = 'campaign-entry voyage-entry';
    voyageEntry.innerHTML = '<span class="campaign-entry-mark" aria-hidden="true">✧</span><span><small>6.0 / 破阵生态</small><b>星海远航</b><em>七段航路</em></span><strong>进入 ↗</strong>';
    campaignEntry.before(voyageEntry); voyageEntry.addEventListener('click', () => showVoyageIntro());
    const modes = document.createElement('div'); modes.className = 'camp-mode-grid';
    $('screen-content').querySelector('.screen-description').after(modes); modes.append(voyageEntry, campaignEntry, trialEntry);
    const salvageEntry = document.createElement('button'); salvageEntry.id = 'salvage-entry'; salvageEntry.className = 'campaign-entry salvage-entry';
    salvageEntry.innerHTML = '<span class="campaign-entry-mark" aria-hidden="true">◇</span><span><small>7.5 / 回收流派</small><b>危险回收</b><em>收集 · 撤离</em></span><strong>进入 ↗</strong>';
    modes.prepend(salvageEntry); salvageEntry.addEventListener('click', () => showSalvageIntro());
    const siegeEntry = document.createElement('button'); siegeEntry.id = 'siege-entry'; siegeEntry.className = 'campaign-entry siege-entry';
    siegeEntry.innerHTML = '<span class="campaign-entry-mark" aria-hidden="true">⬡</span><span><small>8.0 / 巨械猎场</small><b>巨械猎场</b><em>拆炮 · 夺枪 · 反击</em></span><strong>挑战 ↗</strong>';
    modes.prepend(siegeEntry); siegeEntry.addEventListener('click', () => showSiegeIntro());
    const tools = document.createElement('div'); tools.className = 'camp-tools';
    const fieldEntry = document.createElement('button'); fieldEntry.id = 'open-battlefield'; fieldEntry.className = 'secondary-button';
    fieldEntry.textContent = '破阵战场资料'; fieldEntry.addEventListener('click', () => showBattlefieldGuide(welcome));
    $('start-run').after(tools); tools.append(fieldEntry, evolutionEntry, riftEntry, archiveEntry);
    tools.after(accountEntry); addDisplayEntry(modes);
  }
  function showBattlefieldGuide(returnTo) {
    if (activeRevelation) return;
    showScreen('battlefield', '<div class="screen-kicker">FIELD TACTICS / 破阵生态</div><h2 id="screen-title">把威胁，变成自己的工具。</h2><p>危险回收区与远航第 3–6 段出现特化敌人与可破坏物件。走位、射击、EMP 仍是你的全部操作。</p><div class="battlefield-catalog">' + Expedition.BATTLEFIELD_GUIDE.map(item => '<article class="battlefield-card" data-field-guide="' + item.id + '"><span aria-hidden="true">' + item.icon + '</span><div><small>' + item.category + '</small><h3>' + item.title + '</h3><p>' + item.description + '</p></div></article>').join('') + '</div><p class="battlefield-note">橙色预警会伤双方，蓝色接管不伤你。完整岩石能挡新筒与雷的爆炸；掩体破坏后，后续射线会改变。资料打开期间战斗安全暂停。</p><div class="menu-buttons"><button class="launch-button" id="close-battlefield">返回准备 <b>↗</b></button></div>');
    $('close-battlefield').textContent = game.phase === 'ready' ? '返回准备 ↗' : '返回暂停 ↗';
    $('close-battlefield').addEventListener('click', returnTo);
  }
  function showSalvageIntro(difficulty = 'normal', seedValue = '', loadoutId = 'free') {
    showScreen('salvage-intro', '<div class="screen-kicker">SALVAGE / 危险回收</div><h2 id="screen-title">多拿一份，还是现在回家？</h2><p class="salvage-intro-note">西侧 10 秒 · 空旷 / 东侧 16 秒 · 掩体 / 登舰 3 秒</p><div class="salvage-config"><div class="salvage-difficulties"><button class="campaign-choice" data-salvage-difficulty="normal" aria-pressed="false"><b>启航</b><small>完整回收与撤离体验</small></button><button class="campaign-choice" data-salvage-difficulty="overload" aria-pressed="false"><b>超载</b><small>敌人耐久 +20% · 伤害 +12%</small></button></div><label class="voyage-seed-label" for="salvage-seed">战场种子 <small>选填；同种子可复测</small><input id="salvage-seed" type="text" inputmode="numeric" maxlength="10" placeholder="留空生成新战场" autocomplete="off"></label></div><div class="salvage-difficulties" role="group" aria-label="入场套装">' + Expedition.SALVAGE_LOADOUTS.map(loadout => '<button class="campaign-choice" data-salvage-loadout="' + loadout.id + '" aria-pressed="false"><b>' + loadout.title + '</b><small>' + weapons[loadout.weapon].name + ' · ' + ({ decoy: '冲刺诱敌', gravity: 'EMP 聚拢', mine: '精准装填布雷' }[loadout.id] || '自由换枪') + '</small></button>').join('') + '</div><p id="salvage-selection" class="salvage-selection" aria-live="polite"></p><div class="menu-buttons salvage-launch"><button class="launch-button" id="start-salvage">进入回收区 <b>↗</b></button><button class="secondary-button" id="close-salvage-intro">返回营地</button></div><details class="salvage-rules peek-details"><summary>ⓘ 回收与撤离说明</summary><p><b>入场套装</b> 选择初始武器与战术，套装仅本局生效；所有武器仍可切换。</p>' + Expedition.TACTICS.map(tactic => '<p><b>' + tactic.title + '</b> ' + tactic.description + '</p>').join('') + '<p><b>保险箱 ×2</b> Q / 脉冲开启 4 秒静默窗口，再靠近交互；或射击破锁，提高警戒。</p><p><b>钻探井 ×2</b> 交互启动，在圈内累计 8 秒。离圈保留进度，完成直接取得样本。</p><p><b>运输无人机 ×1</b> 射击截停，再靠近交互取货。货物不会被经验磁吸。</p><p>破锁、钻探与截停都会提高警戒，静默开箱动静较小。警戒升级会招来增援，高警戒还会出现扫描爆圈；呼叫接应也会招来追兵。</p><p>撤离点在地图提前标清：西侧 10 秒、空旷；东侧 16 秒、岩石掩体。呼叫后固定接应点，舰到后在圈内累计 3 秒登舰，离圈保留进度；射击、冲刺、装填始终可用。无需清空敌人。</p><p><b>黑匣子 ×1</b> 地图标记其位置，靠近交互拾取。带回额外 +480 分；携带时武器伤害 +15%，不减速，每 12 秒广播并提高警戒、招来追兵。G / 弃货随时放下，停止新广播；重拾保留广播倒计时。EMP 和技能不享受武器加成。</p><p><b>通讯站 ×1</b> 交互消耗一次可用 EMP，圈内累计架设 5 秒，离圈保留进度。准备后拦截下一波警戒增援；警戒、扫描、已有敌人和其他追兵仍继续。每局只能用一次，增援已全部出动后失效。</p><p><b>最后一箱</b> 首次呼叫接应后，附近出现可选货箱：18 秒内靠近交互取得额外 4 份样本，成功带回计 320 分；取货才招来 2 名追兵，不改变警戒。可以忽略，过期不影响接应。</p><p>三种来源合计 17 样本，每份成功带回计 80 分。死亡丢失未结算样本；刷新结束本局，账号仅同步已有成就与纪录。</p><button class="secondary-button" id="salvage-battlefield">查看破阵反制资料</button></details>');
    $('salvage-seed').value = seedValue;
    const update = () => {
      selectChoice('salvage-difficulty', difficulty); selectChoice('salvage-loadout', loadoutId);
      $('salvage-selection').textContent = (difficulty === 'overload' ? '超载回收' : '启航回收') + ' · ' + Expedition.SALVAGE_LOADOUTS.find(loadout => loadout.id === loadoutId).title + ' · 本局不存档';
    };
    $('screen-content').querySelectorAll('[data-salvage-difficulty]').forEach(button => button.addEventListener('click', () => { difficulty = button.dataset.salvageDifficulty; update(); tone('click'); }));
    $('screen-content').querySelectorAll('[data-salvage-loadout]').forEach(button => button.addEventListener('click', () => { loadoutId = button.dataset.salvageLoadout; update(); tone('click'); }));
    $('start-salvage').addEventListener('click', () => {
      const value = $('salvage-seed').value.trim();
      if (value && (!/^\d{1,10}$/.test(value) || Number(value) > 4294967295)) { $('salvage-selection').textContent = '请输入 0–4294967295 的整数种子，或留空。'; $('salvage-seed').focus(); return; }
      startSalvage(difficulty, value ? Number(value) : Math.floor(Math.random() * 4294967296), loadoutId);
    });
    $('salvage-battlefield').addEventListener('click', () => { const seed = $('salvage-seed').value; showBattlefieldGuide(() => showSalvageIntro(difficulty, seed, loadoutId)); });
    $('close-salvage-intro').addEventListener('click', welcome); update();
  }
  function startSalvage(difficulty = 'normal', seed = Math.floor(Math.random() * 4294967296), loadoutId = 'free') {
    resetRun('frontier', null, { mode: 'salvage', difficulty, seed, loadoutId }); startRun();
  }
  const siegePartNames = { cannon: '重弹主炮', lance: '扫射光矛', mortar: '迫击炮座' };
  function siegeRules() {
    return '<details class="peek-details salvage-rules"><summary>ⓘ 猎场说明</summary><p><b>拆炮夺枪</b> 巨械的三门炮座可以分别击碎。残骸落地后用 EMP 接管，获得 3 发重火力；靠近残骸，瞄准后按 E / 点交互发射，间隔 1.2 秒。仍可移动和射击，炮弹会被岩石阻挡。</p><p><b>重弹反向</b> 主炮的慢速重弹进入 EMP 范围时，脉冲将它朝准星改向。两次重火力命中巨械可提前破甲；打空不会计数。普通枪弹始终能造成伤害，即使残骸弹量耗尽也能通关。</p><p><b>三阶段</b> 武装期先拆威胁最大的炮座；生命降到 60% 自动裸露核心，25% 进入过载。预警锁定后侧移，穿过环弹缺口，避开旧位置爆圈；攻击后的恢复窗口适合集中火力。</p><p>入场套装仅本局生效，所有武器仍可切换。地图与菜单期间战斗暂停；同种子再战保留套装与难度，刷新结束本局。账号沿用个人成就与纪录，不保存进行中的猎场。</p></details>';
  }
  function showSiegeIntro(difficulty = 'normal', seedValue = '', loadoutId = 'free') {
    showScreen('siege-intro', '<div class="screen-kicker">8.0 / COLOSSUS HUNT</div><h2 id="screen-title">拆下它的武器，<em>亲手结束它。</em></h2><p class="salvage-intro-note">移动巨械 · 三种可夺炮座 · 三阶段决战</p><div class="salvage-difficulties" role="group" aria-label="入场套装">' + Expedition.SALVAGE_LOADOUTS.map(loadout => '<button class="campaign-choice" data-siege-loadout="' + loadout.id + '" aria-pressed="false"><b>' + loadout.title + '</b><small>' + weapons[loadout.weapon].name + '</small></button>').join('') + '</div><div class="salvage-difficulties" role="group" aria-label="猎场难度"><button class="campaign-choice" data-siege-difficulty="normal" aria-pressed="false"><b>普通猎场</b><small>标准强度</small></button><button class="campaign-choice" data-siege-difficulty="overload" aria-pressed="false"><b>过载猎场</b><small>耐久 +20% · 伤害 +12%</small></button></div><label class="voyage-seed-label" for="siege-seed">战场种子 <small>选填</small><input id="siege-seed" inputmode="numeric" maxlength="10" placeholder="留空生成新猎场" autocomplete="off"></label><p id="siege-selection" class="salvage-selection" aria-live="polite"></p><div class="menu-buttons"><button class="launch-button" id="start-siege">出击 · 巨械猎场 <b>↗</b></button><button class="secondary-button" id="close-siege-intro">返回营地</button></div>' + siegeRules());
    const update = () => {
      selectChoice('siege-difficulty', difficulty); selectChoice('siege-loadout', loadoutId);
      $('siege-selection').textContent = (difficulty === 'overload' ? '过载' : '普通') + ' · ' + Expedition.SALVAGE_LOADOUTS.find(loadout => loadout.id === loadoutId).title;
    };
    $('siege-seed').value = seedValue;
    $('screen-content').querySelectorAll('[data-siege-difficulty]').forEach(button => button.addEventListener('click', () => { difficulty = button.dataset.siegeDifficulty; update(); tone('click'); }));
    $('screen-content').querySelectorAll('[data-siege-loadout]').forEach(button => button.addEventListener('click', () => { loadoutId = button.dataset.siegeLoadout; update(); tone('click'); }));
    $('start-siege').addEventListener('click', () => {
      const value = $('siege-seed').value.trim();
      if (value && (!/^\d{1,10}$/.test(value) || Number(value) > 4294967295)) { $('siege-selection').textContent = '请输入 0–4294967295 的整数种子，或留空。'; $('siege-seed').focus(); return; }
      startSiege(difficulty, value ? Number(value) : Math.floor(Math.random() * 4294967296), loadoutId);
    });
    $('close-siege-intro').addEventListener('click', welcome); update();
  }
  function startSiege(difficulty = 'normal', seed = Math.floor(Math.random() * 4294967296), loadoutId = 'free') {
    resetRun('frontier', null, { mode: 'siege', difficulty, seed, loadoutId }); startRun();
  }
  function showSiegeResult() {
    const siege = game.siege, won = game.phase === 'won'; rememberBest();
    showScreen('result', '<div class="result-icon">⬡</div><div class="screen-kicker">SIEGE / ' + (won ? 'COLOSSUS DOWN' : 'SIGNAL LOST') + '</div><h2 id="screen-title">' + (won ? '巨械倒下，猎场归你。' : '这次，记住它的破绽。') + '</h2><div class="result-grid"><div><strong>' + game.score + '</strong><small>猎场得分</small></div><div><strong>' + siege.captures + '</strong><small>接管炮座</small></div><div><strong>' + siege.reflections + '</strong><small>重弹反向</small></div></div><p class="result-tip">拆炮 ' + siege.wrecks.length + '/3 · 重炮发射 ' + siege.shotsFired + ' · 用时 ' + formatTime(game.elapsed) + '</p><p class="campaign-note">种子 ' + siege.seed + ' · ' + (siege.difficulty === 'overload' ? '过载' : '普通') + ' · ' + profileSaveNote() + '</p><div class="menu-buttons"><button class="launch-button" id="siege-retry">同种子再战 <b>↗</b></button><button class="secondary-button" id="siege-new">新的猎场</button><button class="secondary-button" id="siege-camp">返回营地</button></div>');
    $('siege-retry').addEventListener('click', () => startSiege(siege.difficulty, siege.seed, siege.loadoutId));
    $('siege-new').addEventListener('click', () => startSiege(siege.difficulty, undefined, siege.loadoutId));
    $('siege-camp').addEventListener('click', () => { resetRun('frontier'); welcome(); });
    if (!won && game.lastDamage) {
      const cause = document.createElement('p'); cause.className = 'result-cause'; cause.textContent = game.lastDamage.name + ' · ' + game.lastDamage.hint;
      $('screen-content').querySelector('.result-grid').after(cause);
    }
    addEvolutionSummary($('screen-content').querySelector('.menu-buttons'), true); addArchiveButton($('screen-content').querySelector('.menu-buttons'));
  }
  function salvageStateText() {
    const salvage = game.salvage;
    if (salvage.status === 'approaching') return '接应 ' + salvage.evac.remaining.toFixed(1) + 's 后到达';
    if (salvage.status === 'boarding') return '登舰 ' + salvage.evac.progress.toFixed(1) + '/' + salvage.evac.boardingDuration + 's · 离圈暂停';
    return ({ extracted: '成功回收', withdrawn: '安全撤回 · 无样本', failed: '回收失败' })[salvage.status] || '选择回收目标，或靠近撤离点呼叫接应';
  }
  function showSalvageResult() {
    const salvage = game.salvage, extracted = salvage.status === 'extracted', failed = salvage.status === 'failed'; rememberBest();
    showScreen('result', '<div class="result-icon">◇</div><div class="screen-kicker">SALVAGE / ' + (extracted ? 'EXTRACTED' : failed ? 'SIGNAL LOST' : 'WITHDRAWN') + '</div><h2 id="screen-title">' + (extracted ? '带回的不止样本，还有答案。' : failed ? '样本遗落，经验留下。' : '安全撤回，下一次再拿。') + '</h2><p>' + (extracted ? '货物已经登舰，回收奖金已结算。何时离开，也是你的战术。' : failed ? '未登舰的样本已失去，没有发放回收奖金。' : '本次没有带回样本，回收奖金为 0；这次安全撤回不算成功回收。') + '</p><div class="result-grid"><div><strong>' + salvage.settled + '</strong><small>已带回样本</small></div><div><strong>' + salvage.bonus + '</strong><small>回收奖金</small></div><div><strong>' + game.score + '</strong><small>本局总得分</small></div></div><p class="salvage-result-state" data-salvage-result="' + salvage.status + '">' + salvageStateText() + ' · 黑匣子 ' + (salvage.hotCargo?.status === 'banked' ? '+' + salvage.cargoBonus + ' 已带回' : salvage.hotCargo?.status === 'lost' ? '遗失' : '未带回') + ' · 遗失样本 ' + salvage.lostSamples + ' · 用时 ' + formatTime(game.elapsed) + '</p><p class="result-tip">回收来源 ' + salvage.sources.filter(source => source.status === 'collected').length + '/5 · 警戒 ' + salvage.alertLevel + ' · 击败 ' + game.kills + ' · 精准装填 ' + runStats.perfectReloads + '</p><p class="expedition-tip">破坏掩体 ' + salvage.fieldStats.fractures + ' · 电容爆破 ' + salvage.fieldStats.detonations + ' · EMP 接管 ' + salvage.fieldStats.captures + '</p><p class="campaign-note">种子 ' + salvage.seed + ' · ' + (salvage.difficulty === 'overload' ? '超载' : '启航') + '<br>' + profileSaveNote() + '</p><div class="menu-buttons"><button class="launch-button" id="salvage-retry">同种子再战 <b>↗</b></button><button class="secondary-button" id="salvage-new">新的回收区</button><button class="secondary-button" id="salvage-camp">返回营地</button></div>');
    $('salvage-retry').addEventListener('click', () => startSalvage(salvage.difficulty, salvage.seed, salvage.loadoutId));
    $('salvage-new').addEventListener('click', () => startSalvage(salvage.difficulty, undefined, salvage.loadoutId));
    $('salvage-camp').addEventListener('click', () => { resetRun('frontier'); welcome(); });
    if (failed && game.lastDamage) {
      const cause = document.createElement('section'); cause.className = 'result-cause';
      const heading = document.createElement('strong'), hint = document.createElement('p');
      heading.textContent = game.lastDamage.name + ' · 扣除 ' + game.lastDamage.healthLost + ' 点生命'; hint.textContent = game.lastDamage.hint;
      cause.append(heading, hint); $('screen-content').querySelector('.result-grid').after(cause);
    }
    addEvolutionSummary($('screen-content').querySelector('.menu-buttons'), true); addArchiveButton($('screen-content').querySelector('.menu-buttons'));
  }
  const voyageBiomeNames = { cosmos: '星海断层', forge: '日蚀熔炉', tide: '深潮回廊' };
  const voyageObjectiveNames = { clear: '清剿', siege: '拆柱', harvest: '收割', finale: '吞星决战' };
  function voyageDevice(id) { return Expedition.VOYAGE_DEVICES.find(item => item.id === id); }
  function voyagePairs(devices = game.voyage.devices) { return Expedition.VOYAGE_RESONANCES.filter(item => item.deviceIds.every(id => devices.includes(id))); }
  function voyageBuildText() { return game.voyage.devices.map((id, i) => (i + 1) + ' · ' + (voyageDevice(id)?.title || '空槽')).join(' / '); }
  function voyageDeviceCards(devices, selected = null) {
    return devices.map(item => '<button class="campaign-choice voyage-device' + (item.id === selected ? ' selected' : '') + '" data-voyage-device="' + item.id + '" aria-pressed="' + (item.id === selected) + '"><small>' + (['afterimage', 'needles'].includes(item.id) ? '冲刺系' : ['mirror', 'sentry'].includes(item.id) ? '装填系' : '脉冲系') + '</small><b>' + item.title + '</b><p>' + item.description + '</p><em>' + Expedition.VOYAGE_RESONANCES.find(pair => pair.deviceIds.includes(item.id)).title + ' · 成对激活</em></button>').join('');
  }
  function showVoyageIntro(deviceId = 'afterimage', difficulty = 'normal', seedValue = '') {
    showScreen('voyage-intro', '<div class="screen-kicker">STARFARING / 6.0 · 破阵生态</div><h2 id="screen-title">穿过七重星海，<em>把招式组成答案。</em></h2><p>七段航路 · 三槽装置 · 成长跨图保留</p><div class="voyage-journey">' + ['清剿启航', '分支航路', '装置共鸣', '吞星决战'].map((label, i) => '<span><small>0' + (i + 1) + '</small><b>' + label + '</b></span>').join('') + '</div><div class="trial-rules"><p><b>目标改变走位</b> 清剿有限敌群；集火三座共鸣柱；将敌人引到收割器附近，双倍充能。完成后走到出口交互离开。</p><p><b>三槽，六件，三对共鸣</b> 冲刺后回身开枪、装填后移动交叉射击，或用同一个 EMP 按键二次引爆。装置仅本局生效。</p></div><h3 class="campaign-section-title">01 / 带一件起装出发</h3><div class="voyage-device-grid">' + voyageDeviceCards(Expedition.VOYAGE_DEVICES, deviceId) + '</div><h3 class="campaign-section-title">02 / 选择航行强度</h3><div class="voyage-difficulties"><button class="campaign-choice selected" data-voyage-difficulty="normal" aria-pressed="true"><b>普通远航</b><p>标准强度</p></button><button class="campaign-choice" data-voyage-difficulty="overload" aria-pressed="false"><b>过载远航</b><p>耐久 / 配额 +20% · 伤害 +12%</p></button></div><label class="voyage-seed-label" for="voyage-seed">航路种子 <small>选填 · 同种子复测</small><input id="voyage-seed" type="text" inputmode="numeric" maxlength="10" placeholder="留空生成新航路" autocomplete="off"></label><p id="voyage-selection" class="campaign-selection" aria-live="polite"></p><div class="menu-buttons"><button class="launch-button" id="start-voyage">起航 · 第一重星海 <b>↗</b></button><button class="secondary-button" id="close-voyage-intro">返回营地</button></div><p class="campaign-note">房间之间安全整备，有限敌人不会无限刷新。刷新或关闭页面结束本局；账号同步成就与既有纪录，进行中的航路不会存档。</p>');
    const update = () => {
      selectChoice('voyage-device', deviceId);
      selectChoice('voyage-difficulty', difficulty);
      $('voyage-selection').textContent = voyageDevice(deviceId).title + ' · ' + (difficulty === 'overload' ? '过载远航' : '普通远航') + ' · 本局不存档';
    };
    $('voyage-seed').value = seedValue;
    foldNote('.trial-rules', '航路玩法'); foldNote('.campaign-note', '保存与整备说明');
    const fieldEntry = document.createElement('button'); fieldEntry.id = 'voyage-battlefield'; fieldEntry.className = 'secondary-button'; fieldEntry.textContent = '中段破阵 · 查看反制资料';
    fieldEntry.addEventListener('click', () => { const seed = $('voyage-seed').value; showBattlefieldGuide(() => showVoyageIntro(deviceId, difficulty, seed)); });
    $('screen-content').querySelector('.menu-buttons').append(fieldEntry);
    $('screen-content').querySelectorAll('[data-voyage-device]').forEach(button => button.addEventListener('click', () => { deviceId = button.dataset.voyageDevice; update(); tone('click'); }));
    $('screen-content').querySelectorAll('[data-voyage-difficulty]').forEach(button => button.addEventListener('click', () => { difficulty = button.dataset.voyageDifficulty; update(); tone('click'); }));
    $('start-voyage').addEventListener('click', () => {
      const value = $('voyage-seed').value.trim();
      if (value && (!/^\d{1,10}$/.test(value) || Number(value) > 4294967295)) { $('voyage-selection').textContent = '请输入 0–4294967295 的整数种子，或留空生成新航路。'; $('voyage-seed').focus(); return; }
      startVoyage(deviceId, difficulty, value ? Number(value) : Math.floor(Math.random() * 4294967296));
    });
    $('close-voyage-intro').addEventListener('click', welcome); update();
  }
  function startVoyage(deviceId = 'afterimage', difficulty = 'normal', seed = Math.floor(Math.random() * 4294967296)) {
    resetRun('frontier', null, { mode: 'voyage', deviceId, difficulty, seed }); startRun();
  }
  function showVoyageRest(selectedRoute = null, selectedDevice = null, selectedSlot = null) {
    const voyage = game.voyage;
    let routeId = selectedRoute || voyage.routeChoices[0].id, deviceId = selectedDevice, slotIndex = selectedSlot ?? voyage.devices.findIndex(id => !id);
    if (slotIndex < 0) slotIndex = 0;
    showScreen('voyage-rest', '<div class="screen-kicker">NODE ' + voyage.node + ' / 7 CLEAR · 安全整备</div><h2 id="screen-title">下一重星海，<em>由你来选。</em></h2><p>战场已暂停。生命已恢复少量，弹药已补满，战利品已回收。选路线、调整一槽装置，再出发。</p><div class="campaign-carried"><b>当前构筑</b><p>' + voyageBuildText() + '</p><span>生命 ' + Math.ceil(game.player.hp) + '/' + game.player.maxHp + ' · 芯片 ' + game.player.credits + ' · 种子 ' + voyage.seed + '</span></div><h3 class="campaign-section-title">01 / 选择航路</h3><div class="voyage-routes">' + voyage.routeChoices.map(route => '<button class="campaign-choice" data-voyage-route="' + route.id + '" aria-pressed="false" style="--choice-color:' + route.color + '"><small>' + (route.type === 'finale' ? 'FINAL / 专属终局' : route.risk === 'surge' ? 'SURGE / 高风险 · 保底 ' + route.reward + ' 芯片' : 'CALM / 常规 · 保底 ' + route.reward + ' 芯片') + '</small><b>' + route.title + '</b><p>' + route.description + '</p></button>').join('') + '</div><h3 class="campaign-section-title">02 / 调整一件装置 <small>免费；本页最多替换一槽</small></h3><button class="secondary-button selected" id="voyage-keep-device" aria-pressed="true">保持当前装置</button><div class="voyage-device-grid">' + voyageDeviceCards(voyage.deviceChoices.map(item => typeof item === 'string' ? voyageDevice(item) : item)) + '</div><div class="voyage-slots">' + voyage.devices.map((id, index) => '<button class="campaign-choice" data-voyage-slot="' + index + '" aria-pressed="false"><small>装置槽 0' + (index + 1) + '</small><b>' + (voyageDevice(id)?.title || '空槽 · 可装备') + '</b></button>').join('') + '</div><p id="voyage-pair-preview" class="awakening-preview" aria-live="polite"></p><h3 class="campaign-section-title">03 / 芯片整备 <small>可跳过；本页限购一次</small></h3><div class="voyage-shop">' + voyage.shopChoices.map(item => '<button class="campaign-choice" data-voyage-purchase="' + item.id + '"' + (voyage.purchased || game.player.credits < item.cost || (item.id === 'repair' && game.player.hp >= game.player.maxHp) ? ' disabled' : '') + '><b>' + item.title + '</b><p>' + item.description + '</p><em>' + item.cost + ' 芯片</em></button>').join('') + '</div><p id="voyage-selection" class="campaign-selection" aria-live="polite"></p><div class="menu-buttons"><button class="launch-button" id="continue-voyage">确认航路 · 继续远航 <b>↗</b></button><button class="secondary-button" id="leave-voyage-rest">结束远航 · 返回营地</button></div><p class="campaign-note">通用强化与武器进化保留。房间中的弹幕、危险区、临时装置效果和技能冷却会重置。没有整备倒计时。</p>');
    const update = () => {
      const next = voyage.devices.slice(); if (deviceId) next[slotIndex] = deviceId;
      selectChoice('voyage-route', routeId);
      selectChoice('voyage-device', deviceId);
      $('screen-content').querySelectorAll('[data-voyage-slot]').forEach(button => { const selected = !!deviceId && Number(button.dataset.voyageSlot) === slotIndex; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); button.disabled = !deviceId; });
      $('voyage-keep-device').classList.toggle('selected', !deviceId); $('voyage-keep-device').setAttribute('aria-pressed', String(!deviceId));
      const pairs = voyagePairs(next);
      $('voyage-pair-preview').textContent = pairs.length ? '共鸣预览 · ' + pairs[0].title + '：' + pairs[0].description : '两件同系装置一起装备，会组成新的操作招式。也可三个系列混搭。';
      $('voyage-selection').textContent = voyage.routeChoices.find(item => item.id === routeId).title + ' · ' + (deviceId ? '槽 ' + (slotIndex + 1) + ' 装备 ' + voyageDevice(deviceId).title : '保持现有构筑');
    };
    $('screen-content').querySelectorAll('[data-voyage-route]').forEach(button => button.addEventListener('click', () => { routeId = button.dataset.voyageRoute; update(); tone('click'); }));
    $('screen-content').querySelectorAll('[data-voyage-device]').forEach(button => button.addEventListener('click', () => { deviceId = button.dataset.voyageDevice; update(); tone('click'); }));
    $('screen-content').querySelectorAll('[data-voyage-slot]').forEach(button => button.addEventListener('click', () => { slotIndex = Number(button.dataset.voyageSlot); update(); tone('click'); }));
    $('voyage-keep-device').addEventListener('click', () => { deviceId = null; update(); });
    $('screen-content').querySelectorAll('[data-voyage-purchase]').forEach(button => button.addEventListener('click', () => {
      if (!game.purchaseVoyage(button.dataset.voyagePurchase)) { $('voyage-selection').textContent = '本次整备不可购买：检查芯片、生命或强化上限。'; return; }
      processEvents(); tone('upgrade'); showVoyageRest(routeId, deviceId, slotIndex);
    }));
    $('continue-voyage').addEventListener('click', () => {
      const previous = voyagePairs().map(item => item.id);
      if (!game.chooseVoyageRoute(routeId, deviceId, deviceId ? slotIndex : null)) { $('voyage-selection').textContent = '航路或装置选择无效，请重新选择。'; return; }
      trackedRelayId = trackedContractId = trackedEncounterId = null; renderer.trackedRelayId = renderer.trackedContractId = renderer.trackedEncounterId = null;
      renderer.camera.x = game.player.x; renderer.camera.y = game.player.y; renderer.resetEffects(); renderer.pointerHudTime = -1;
      clearInput(); reactorWasReady = false; renderDirty = true; lastPhase = game.phase; processEvents();
      const pair = voyagePairs().find(item => !previous.includes(item.id));
      if (pair) showVoyageResonance(pair); else if (game.phase === 'upgrade') showUpgrade(); else closeScreen();
    });
    $('leave-voyage-rest').addEventListener('click', () => {
      showScreen('voyage-exit', '<div class="screen-kicker">RETURN TO CAMP</div><h2 id="screen-title">结束这次星海远航？</h2><p>当前航路与装置构筑会清空。已发现的成就和最佳分数保留。</p><div class="menu-buttons"><button class="launch-button" id="confirm-voyage-exit">结束远航 · 返回营地</button><button class="secondary-button" id="cancel-voyage-exit">继续整备</button></div>');
      $('confirm-voyage-exit').addEventListener('click', () => { rememberBest(); resetRun('frontier'); welcome(); });
      $('cancel-voyage-exit').addEventListener('click', () => showVoyageRest(routeId, deviceId, slotIndex));
    }); update();
  }
  function showVoyageResonance(pair) {
    tone('voyage-resonance', pair.id);
    showScreen('voyage-resonance', '<div class="awakening-ceremony voyage-ceremony"><div class="screen-kicker">RESONANCE / 装置共鸣</div><div class="awakening-seal" aria-hidden="true">✧</div><h2 id="screen-title">' + pair.title + '</h2><p>' + pair.deviceIds.map(id => voyageDevice(id).title).join(' × ') + '</p><div class="awakening-vow">' + pair.description + '</div><div class="menu-buttons"><button class="launch-button" id="continue-voyage-resonance">带着共鸣，继续远航 <b>↗</b></button></div><p class="campaign-note">战场已安全暂停。装置保留期间，共鸣可重复施展。</p></div>');
    $('continue-voyage-resonance').addEventListener('click', () => { if (game.phase === 'upgrade') showUpgrade(); else closeScreen(); });
  }
  function showVoyageResult() {
    const voyage = game.voyage, won = game.phase === 'won'; rememberBest();
    showScreen('result', '<div class="result-icon">✧</div><div class="screen-kicker">STARFARING / ' + (won ? 'THE SEVEN STARS' : 'SIGNAL LOST') + '</div><h2 id="screen-title">' + (won ? '七重星海，回应你的归航。' : '星海仍在，下一次再走远一点。') + '</h2><p>' + (won ? '六段航路与航界吞星者全部突破。你的招式组合，成为了这一局的答案。' : '远航止步于第 ' + voyage.node + '/7 段。根据致命伤与目标，重新选择装置和航路。') + '</p><div class="result-grid"><div><strong>' + (won ? 7 : voyage.node - 1) + '/7</strong><small>突破航段</small></div><div><strong>' + game.score + '</strong><small>远航得分</small></div><div><strong>' + formatTime(game.elapsed) + '</strong><small>战斗时间</small></div></div><div class="campaign-carried"><b>最终装置</b><p>' + voyageBuildText() + '</p><span>' + (voyagePairs().map(pair => pair.title).join(' / ') || '尚未形成成对共鸣') + ' · 击败 ' + game.kills + ' · 精准装填 ' + runStats.perfectReloads + '</span></div><p class="campaign-selection">' + voyage.history.map(room => (room.title || voyageBiomeNames[room.biome] || '吞星决战') + ' · ' + (voyageObjectiveNames[room.type] || '决战')).join(' → ') + '</p><p class="campaign-note">种子 ' + voyage.seed + ' · ' + (voyage.difficulty === 'overload' ? '过载' : '普通') + '远航<br>同种子重现航路与起装；后续路线和构筑可重新选择。<br>' + profileSaveNote() + '</p><div class="menu-buttons"><button class="launch-button" id="restart-voyage">同种子再航 <b>↗</b></button><button class="secondary-button" id="voyage-camp">返回营地</button></div>');
    $('restart-voyage').addEventListener('click', () => startVoyage(voyage.initialDeviceId || voyage.devices[0], voyage.difficulty, voyage.seed));
    $('voyage-camp').addEventListener('click', () => { resetRun('frontier'); welcome(); });
    if (!won && game.lastDamage) {
      const cause = document.createElement('section'); cause.className = 'result-cause'; const heading = document.createElement('strong'), hint = document.createElement('p');
      heading.textContent = game.lastDamage.name + ' · 扣除 ' + game.lastDamage.healthLost + ' 点生命'; hint.textContent = game.lastDamage.hint; cause.append(heading, hint); $('screen-content').querySelector('.result-grid').after(cause);
    }
    addEvolutionSummary($('screen-content').querySelector('.menu-buttons'), true); addArchiveButton($('screen-content').querySelector('.menu-buttons'));
  }
  function showCampaignIntro() {
    let doctrineId = 'skirmisher', mapId = Expedition.MAPS.some(map => map.id === game.map.id) ? game.map.id : 'frontier';
    showScreen('campaign-intro', '<div class="screen-kicker">LONG EXPEDITION / 连续远征</div><h2 id="screen-title">把一局的成长，带到世界尽头。</h2><p>两处战区 → 裂隙中枢 · 构筑跨图保留</p><div class="campaign-journey"><span><small>ACT 01</small><b>选择起点</b><em>完成主线 · 击败首领</em></span><i>→</i><span><small>ACT 02</small><b>带着构筑转战</b><em>四条路线 · 三种危机</em></span><i>→</i><span><small>FINALE</small><b>裂隙中枢</b><em>拆除能量锚 · 决战核心</em></span></div><h3 class="campaign-section-title">01 / 选一种战斗节奏 <small>仅本次连续远征生效</small></h3><div class="campaign-choices doctrine-choices">' + Expedition.CAMPAIGN_DOCTRINES.map((item, i) => '<button class="campaign-choice' + (item.id === doctrineId ? ' selected' : '') + '" data-doctrine="' + item.id + '" aria-pressed="' + (item.id === doctrineId) + '" style="--choice-color:' + item.color + '"><small>0' + (i + 1) + ' / 战斗流派</small><b>' + item.title + '</b><p>' + item.description + '</p><em>选择此流派</em></button>').join('') + '</div><h3 class="campaign-section-title">02 / 选择第一站 <small>下一站不会重复</small></h3><div class="campaign-map-choices">' + Expedition.MAPS.map(map => '<button data-campaign-map="' + map.id + '" aria-pressed="' + (map.id === mapId) + '" class="campaign-map-choice' + (map.id === mapId ? ' selected' : '') + '" style="--choice-color:' + map.color + '"><b>' + map.name + '</b><small>' + map.subtitle + '</small></button>').join('') + '</div><p id="campaign-departure" class="campaign-selection" aria-live="polite"></p><div class="menu-buttons"><button class="launch-button" id="start-campaign">开始连续远征 <b>↗</b></button><button class="secondary-button" id="close-campaign-intro">返回营地</button></div><p class="campaign-note">关间安全整备，每次选一项补给。随时可暂停；关闭或刷新页面会结束本局。账号同步成就与纪录，不保存进行中的战斗。</p>');
    const update = () => {
      selectChoice('doctrine', doctrineId);
      selectChoice('campaign-map', mapId);
      $('campaign-departure').textContent = Expedition.CAMPAIGN_DOCTRINES.find(item => item.id === doctrineId).title + ' → ' + Expedition.MAPS.find(map => map.id === mapId).name + ' · 本局不存档';
    };
    $('screen-content').querySelectorAll('[data-doctrine]').forEach(button => button.addEventListener('click', () => { doctrineId = button.dataset.doctrine; update(); tone('click'); }));
    $('screen-content').querySelectorAll('[data-campaign-map]').forEach(button => button.addEventListener('click', () => { mapId = button.dataset.campaignMap; update(); tone('click'); }));
    $('start-campaign').addEventListener('click', () => startCampaign(mapId, doctrineId));
    $('screen-content').querySelectorAll('[data-doctrine]').forEach(button => { button.querySelector('em').textContent = '觉醒可选：' + Expedition.CAMPAIGN_AWAKENINGS.filter(item => item.doctrineId === button.dataset.doctrine).map(item => item.title).join(' / '); });
    $('screen-content').querySelector('.campaign-note').textContent = '第一站突破后，选择一种流派觉醒；从下一幕起生效，本局不能改选。关间每次选一项补给。随时可暂停；关闭或刷新页面会结束本局。账号同步成就与纪录，不保存进行中的战斗。';
    foldNote('.campaign-note', '觉醒与保存说明');
    $('close-campaign-intro').addEventListener('click', welcome); update();
  }
  function startCampaign(mapId, doctrineId, seed = Math.floor(Math.random() * 4294967296)) {
    resetRun(mapId, null, { mode: 'campaign', doctrineId, seed }); startRun();
  }
  function campaignBuildText() {
    const doctrine = Expedition.CAMPAIGN_DOCTRINES.find(item => item.id === game.campaign.doctrineId);
    const awakening = Expedition.CAMPAIGN_AWAKENINGS.find(item => item.id === game.campaign.awakeningId);
    const evolution = Expedition.EVOLUTIONS.find(item => item.id === game.evolutionId);
    const tactic = Expedition.TACTICS.find(item => item.id === game.tacticId);
    return doctrine.title + (awakening ? ' / ' + awakening.title : ' · 尚未觉醒') + ' · 等级 ' + game.player.level + ' · ' + (evolution ? evolution.title : '尚未进化') + ' · 遗物 ' + game.relics.length + ' 件' + (tactic ? ' · ' + tactic.title : '');
  }
  function campaignRouteText() {
    return game.campaign.visited.map(id => id === 'nexus' ? '裂隙中枢' : Expedition.MAPS.find(map => map.id === id).name).join(' → ');
  }
  function showCampaignRest(selectedRoute = null, selectedSupply = null, selectedAwakening = null) {
    const campaign = game.campaign;
    const needsAwakening = campaign.stage === 1 && !campaign.awakeningId;
    const awakenings = Expedition.CAMPAIGN_AWAKENINGS.filter(item => item.doctrineId === campaign.doctrineId);
    let awakeningId = selectedAwakening || campaign.awakeningId || '';
    let mapId = selectedRoute || campaign.routeChoices[0].mapId, supplyId = selectedSupply || (game.player.hp < game.player.maxHp * .65 ? 'repair' : 'power');
    showScreen('campaign-rest', '<div class="screen-kicker">ACT ' + campaign.stage + ' CLEAR / 战区肃清</div><h2 id="screen-title">火种在手，下一站由你。</h2><p>' + game.map.name + '已突破。战场已暂停，选择路线和一项补给后再出发。</p><div class="campaign-carried"><b>已保留的构筑</b><p>' + campaignBuildText() + '</p><span>生命 ' + Math.ceil(game.player.hp) + '/' + game.player.maxHp + ' · 芯片 ' + game.player.credits + ' · 总用时 ' + formatTime(game.elapsed) + '</span></div><h3 class="campaign-section-title">01 / ' + (campaign.stage === 2 ? '终章已开启' : '选择下一战区') + '</h3><div class="campaign-choices route-choices">' + campaign.routeChoices.map(route => {
      const crisis = Expedition.CAMPAIGN_CRISES.find(item => item.id === route.crisisId);
      return '<button class="campaign-choice' + (route.mapId === mapId ? ' selected' : '') + '" data-campaign-route="' + route.mapId + '" aria-pressed="' + (route.mapId === mapId) + '" style="--choice-color:' + route.color + '"><small>' + (route.mapId === 'nexus' ? 'FINAL / 独立终局' : 'ACT 02 / 未探索战区') + '</small><b>' + route.title + '</b><p>' + route.description + '</p><em>' + (crisis ? '危机 · ' + crisis.title + '：' + crisis.description : '双锚供能 · 先拆锚可永久破盾') + '</em></button>';
    }).join('') + '</div><h3 class="campaign-section-title">02 / 选择一项整备 <small>均补满弹药，并恢复 20 生命</small></h3><div class="campaign-choices supply-choices">' + campaign.supplyChoices.map(item => '<button class="campaign-choice' + (item.id === supplyId ? ' selected' : '') + '" data-campaign-supply="' + item.id + '" aria-pressed="' + (item.id === supplyId) + '" style="--choice-color:' + item.color + '"><b>' + item.title + '</b><p>' + item.description + '</p></button>').join('') + '</div><p id="campaign-next" class="campaign-selection" aria-live="polite"></p><div class="menu-buttons"><button class="launch-button" id="continue-campaign">确认整备 · 继续远征 <b>↗</b></button></div><p class="campaign-note">已获得的成长带入下一站；弹幕、相位印记、暴走和临时效果重置。整备期间没有倒计时。</p>');
    const awakeningSection = document.createElement('section'); awakeningSection.className = 'campaign-awakening';
    awakeningSection.innerHTML = needsAwakening ? '<h3 class="campaign-section-title">流派觉醒 / 二选一 <small>从下一幕开始生效，本局不能改选</small></h3><div class="campaign-choices awakening-choices">' + awakenings.map(item => '<button class="campaign-choice" data-campaign-awakening="' + item.id + '" aria-pressed="false" style="--choice-color:' + item.color + '"><small>AWAKENING / 战法分岔</small><span class="awakening-symbol" aria-hidden="true">' + item.icon + '</span><b>' + item.title + '</b><p>' + item.description + '</p><em>' + item.playHint + '</em></button>').join('') + '</div><p id="awakening-preview" class="awakening-preview" aria-live="polite">选择一个觉醒方向，再决定下一站。</p>' : '<h3 class="campaign-section-title">觉醒已继承 <small>保持你的战法，迎战终局</small></h3><p class="awakening-preview">' + (awakenings.find(item => item.id === awakeningId)?.playHint || '本局觉醒随构筑保留。') + '</p>';
    $('screen-content').querySelector('.campaign-carried').after(awakeningSection);
    const update = () => {
      selectChoice('campaign-awakening', awakeningId);
      const awakening = awakenings.find(item => item.id === awakeningId);
      if (needsAwakening) $('awakening-preview').textContent = awakening ? '已选「' + awakening.title + '」 · ' + awakening.playHint : '选择一个觉醒方向，再决定下一站。';
      $('continue-campaign').disabled = needsAwakening && !awakening;
      selectChoice('campaign-route', mapId);
      selectChoice('campaign-supply', supplyId);
      $('campaign-next').textContent = campaign.routeChoices.find(item => item.mapId === mapId).title + ' · ' + campaign.supplyChoices.find(item => item.id === supplyId).title + (awakening ? ' · ' + awakening.title : ' · 待选觉醒') + ' · 构筑跨图保留';
    };
    $('screen-content').querySelectorAll('[data-campaign-awakening]').forEach(button => button.addEventListener('click', () => { awakeningId = button.dataset.campaignAwakening; update(); tone('click'); }));
    $('screen-content').querySelectorAll('[data-campaign-route]').forEach(button => button.addEventListener('click', () => { mapId = button.dataset.campaignRoute; update(); tone('click'); }));
    $('screen-content').querySelectorAll('[data-campaign-supply]').forEach(button => button.addEventListener('click', () => { supplyId = button.dataset.campaignSupply; update(); tone('click'); }));
    $('continue-campaign').addEventListener('click', () => continueCampaign(mapId, supplyId, awakeningId)); update();
    const leave = document.createElement('button'); leave.id = 'leave-campaign-rest'; leave.className = 'secondary-button'; leave.textContent = '结束本次远征';
    leave.addEventListener('click', () => {
      showScreen('campaign-exit', '<div class="screen-kicker">RETURN TO CAMP</div><h2 id="screen-title">把这次战果带回营地？</h2><p>本次连续远征将结束，进行中的路线与构筑会清空。已发现的成就与最佳纪录会保留。</p><div class="menu-buttons"><button class="launch-button" id="finish-campaign">结束并返回营地</button><button class="secondary-button" id="keep-campaign">返回安全整备</button></div>');
      $('finish-campaign').addEventListener('click', () => { rememberBest(); resetRun(campaign.visited[0]); welcome(); });
      $('keep-campaign').addEventListener('click', () => showCampaignRest(mapId, supplyId, awakeningId));
    }); $('screen-content').querySelector('.menu-buttons').append(leave);
  }
  function continueCampaign(mapId, supplyId, awakeningId) {
    const firstAwakening = !game.campaign.awakeningId;
    if (activeRevelation || !game.chooseCampaignRoute(mapId, supplyId, awakeningId)) return;
    clearInput(); paused = false; pointer.seen = false; impactPause = 0;
    trackedRelayId = game.relays[0]?.id ?? null; trackedContractId = null; trackedEncounterId = null;
    renderer.trackedContractId = null; renderer.trackedEncounterId = null;
    renderer.camera.x = game.player.x; renderer.camera.y = game.player.y; renderer.resetEffects();
    clearTimeout(hitTimer); clearTimeout(damageTimer); clearTimeout(bannerTimer); clearTimeout(notificationTimer);
    $('aim-reticle').classList.remove('hit', 'critical'); $('damage-flash').classList.remove('visible'); $('notification').classList.remove('visible'); $('event-banner').classList.add('hidden');
    reactorWasReady = false; lastPhase = game.phase; renderDirty = true; processEvents();
    if (firstAwakening) showCampaignAwakening();
    else if (game.phase === 'upgrade') showUpgrade(); else closeScreen();
  }
  function showCampaignAwakening() {
    const awakening = Expedition.CAMPAIGN_AWAKENINGS.find(item => item.id === game.campaign.awakeningId);
    showScreen('campaign-awakening', '<div class="awakening-ceremony" style="--awakening-color:' + awakening.color + '"><div class="screen-kicker">AWAKENING / 流派觉醒</div><div class="awakening-seal" aria-hidden="true">' + awakening.icon + '</div><h2 id="screen-title">' + awakening.title + '</h2><p>' + awakening.description + '</p><div class="awakening-vow">' + awakening.playHint + '</div><div class="menu-buttons"><button class="launch-button" id="continue-awakening">带着觉醒，继续远征 <b>↗</b></button></div><p class="campaign-note">战场已安全暂停。觉醒已保留，贯穿本局后半程。</p></div>');
    $('continue-awakening').addEventListener('click', () => { notify(awakening.playHint); if (game.phase === 'upgrade') showUpgrade(); else closeScreen(); });
  }
  function showCampaignResult() {
    const campaign = game.campaign, won = game.phase === 'won'; rememberBest();
    showScreen('result', '<div class="result-icon">◎</div><div class="screen-kicker">LONG EXPEDITION / ' + (won ? 'HOMEWARD' : 'SIGNAL LOST') + '</div><h2 id="screen-title">' + (won ? '世界尽头，也收到了你的信号。' : '火种未熄，再走远一点。') + '</h2><p>' + (won ? '两处战区与裂隙中枢全部突破。一路的选择，成就了最后一战。' : '远征止步于第 ' + campaign.stage + ' 幕 · ' + game.map.name + '。调整路线与补给，再次出发。') + '</p><div class="result-grid"><div><strong>' + campaign.completedStages + '/3</strong><small>突破战区</small></div><div><strong>' + game.score + '</strong><small>远征得分</small></div><div><strong>' + formatTime(game.elapsed) + '</strong><small>总战斗时间</small></div></div><p class="campaign-selection">' + campaignRouteText() + '</p><div class="campaign-carried"><b>最终构筑</b><p>' + campaignBuildText() + '</p><span>击败 ' + game.kills + ' · 最高连杀 ' + game.combo.best + ' · 精准装填 ' + runStats.perfectReloads + '</span></div><p class="campaign-note">种子 ' + campaign.seed + ' · 同种子保留起点与流派，路线与构筑仍由你选择。<br>' + profileSaveNote() + '</p><div class="menu-buttons"><button class="launch-button" id="restart-campaign">同种子再征 <b>↗</b></button><button class="secondary-button" id="campaign-camp">返回营地</button></div>');
    $('restart-campaign').addEventListener('click', () => startCampaign(campaign.visited[0], campaign.doctrineId, campaign.seed));
    $('campaign-camp').addEventListener('click', () => { resetRun(campaign.visited[0]); welcome(); });
    if (!won && game.lastDamage) {
      const cause = document.createElement('section'); cause.className = 'result-cause';
      const heading = document.createElement('strong'), hint = document.createElement('p');
      heading.textContent = game.lastDamage.name + ' · 扣除 ' + game.lastDamage.healthLost + ' 点生命'; hint.textContent = game.lastDamage.hint;
      cause.append(heading, hint); $('screen-content').querySelector('.result-grid').after(cause);
    }
    addEvolutionSummary($('screen-content').querySelector('.menu-buttons'), true); addArchiveButton($('screen-content').querySelector('.menu-buttons'));
  }
  function showEvolutionGuide() {
    if (activeRevelation || !['welcome', 'pause'].includes(screen)) return;
    evolutionReturn = screen;
    const chosen = Expedition.EVOLUTIONS.find(item => item.id === game.evolutionId);
    showScreen('evolution-guide', '<div class="screen-kicker">EVOLVING ARSENAL / 异构军械</div><h2 id="screen-title">让武器，长出新的战法。</h2><p>先选对应武器改造，达到 4 级后，在升级卡中选择进化。每局仅一把，远征与试炼都可获得；新一局重新选择。</p><div class="evolution-path"><span><b>01</b> 取得对应改造</span><span><b>02</b> 达到 4 级</span><span><b>03</b> 升级时选择进化</span></div><p class="evolution-rule">条件满足时，每次升级保证出现一张可用进化，优先当前武器。也可先选普通强化，以后再决定。</p><div class="evolution-catalog">' + Expedition.EVOLUTIONS.map(evolution => {
      const prerequisite = Expedition.UPGRADES.find(item => item.id === evolution.prerequisite);
      const owned = game.evolutionId === evolution.id;
      const available = game.player.level >= 4 && game.upgradeStacks[evolution.prerequisite];
      const status = owned ? '本局已进化' : chosen ? '本局已选 ' + chosen.title : game.phase === 'ready' ? '前置：' + prerequisite.title : available ? '可进入升级选项' : '需要' + (game.upgradeStacks[evolution.prerequisite] ? '' : '「' + prerequisite.title + '」') + (game.player.level < 4 ? ' · 4 级' : '');
      return '<article class="' + (owned ? 'selected' : '') + '" style="--evolution-color:' + evolution.color + '"><small>' + weapons[evolution.weapon].name + '</small><h3><span aria-hidden="true">' + evolution.icon + '</span>' + evolution.title + '</h3><p>' + evolution.description + '</p><b>' + evolution.playHint + '</b><em>' + status + '</em></article>';
    }).join('') + '</div><div class="menu-buttons"><button class="launch-button" id="close-evolutions">' + (evolutionReturn === 'welcome' ? '返回营地 · 选择战区' : '返回暂停') + ' <b>↗</b></button></div>');
    $('close-evolutions').addEventListener('click', returnFromEvolutionGuide);
  }
  function returnFromEvolutionGuide() { if (evolutionReturn === 'pause') showPause(); else welcome(); }
  function addEvolutionSummary(before, result = false) {
    const evolution = Expedition.EVOLUTIONS.find(item => item.id === game.evolutionId);
    const summary = document.createElement('div'); summary.className = 'tactic-summary evolution-summary';
    const heading = document.createElement('b'), detail = document.createElement('p');
    heading.textContent = evolution ? '本局进化 · ' + evolution.title : '武器进化 · 尚未选择';
    detail.textContent = evolution ? evolution.description : '先取得对应武器改造，达到 4 级后，在升级卡中选择一把武器进化。';
    summary.append(heading, detail); before.before(summary);
    if (!result) { const button = document.createElement('button'); button.id = 'pause-evolutions'; button.className = 'secondary-button'; button.textContent = '查看六种进化'; button.addEventListener('click', showEvolutionGuide); summary.append(button); }
  }
  function encounterStatus(encounter) {
    if (encounter.status === 'active') return Math.ceil(encounter.remaining) + 's · ' + (encounter.kind === 'rings' ? encounter.progress.toFixed(1) + '/' + encounter.goal + 's' : encounter.progress + '/' + encounter.goal);
    return ({ idle: '可选挑战', ready: '返回终端领奖', complete: '已回收', failed: '信号消散' })[encounter.status];
  }
  function showRiftGuide() {
    if (!['welcome', 'pause'].includes(screen)) return;
    riftReturn = screen;
    const ready = game.phase === 'ready';
    showScreen('rift-guide', '<div class="screen-kicker">RIFT SALVAGE / OPTIONAL EXPEDITION</div><h2 id="screen-title">探索风险，带走新打法。</h2><p>每张战区都有三处异象。靠近终端点交互开始，可跳过，不影响主线通关。</p><div class="rift-route">' + game.encounters.map((encounter, index) => '<article><small>0' + (index + 1) + ' / ' + encounterStatus(encounter) + '</small><h3>' + encounter.name + '</h3><p>' + encounter.description + '</p><b>限时 ' + encounter.duration + ' 秒</b></article>').join('') + '</div><div class="rift-reward-note"><b>成功后回到终端</b><span>+20 芯片 · 恢复 20 生命 · 选择一枚本局战术模块</span><small>同时仅装备一枚；后续回收可替换。超时失去这处奖励，仍可继续远征。地图与菜单中计时暂停。</small></div><div class="tactic-preview">' + Expedition.TACTICS.map(tactic => '<article style="--tactic-color:' + tactic.color + '"><span>' + tactic.icon + '</span><div><h3>' + tactic.title + '</h3><p>' + tactic.description + '</p></div></article>').join('') + '</div><div class="menu-buttons"><button class="launch-button" id="' + (ready ? 'start-rift-run' : 'rift-map') + '">' + (ready ? '出发 · 追踪最近异象' : '打开地图 · 选择异象') + ' <b>↗</b></button><button class="secondary-button" id="close-rifts">' + (ready ? '返回营地' : '返回暂停') + '</button></div>');
    $('close-rifts').addEventListener('click', returnFromRiftGuide);
    if (ready) $('start-rift-run').addEventListener('click', () => {
      startRun();
      const encounter = game.encounters.filter(item => item.status === 'idle').sort((a, b) => Math.hypot(a.x - game.player.x, a.y - game.player.y) - Math.hypot(b.x - game.player.x, b.y - game.player.y))[0];
      trackedEncounterId = encounter?.id ?? null; trackedContractId = null; updateHUD();
      notify('沿异象指引前进，靠近菱形终端点交互开启挑战。');
    });
    else $('rift-map').addEventListener('click', () => { returnFromRiftGuide(); showMap(); });
  }
  function returnFromRiftGuide() { if (riftReturn === 'pause') showPause(); else welcome(); }
  function showTactics() {
    const current = Expedition.TACTICS.find(tactic => tactic.id === game.tacticId);
    showScreen('tactic', '<div class="screen-kicker">RIFT RECOVERED / 战术模块</div><h2 id="screen-title">一枚模块，一种战法。</h2><p>战场已暂停。' + (current ? '当前装备「' + current.title + '」。可保留，或换一种打法；替换移除旧效果，战术冷却保留。' : '选择一枚本局生效的模块，沿用现有操作按键。') + '</p><div class="upgrade-grid tactic-grid">' + game.tacticChoices.map((tactic, index) => '<button class="upgrade-card tactic-card" data-tactic="' + tactic.id + '" style="--tactic-color:' + tactic.color + '"><small>单槽战术 · ' + (index + 1) + '</small><span class="upgrade-icon">' + tactic.icon + '</span><b>' + tactic.title + '</b><p>' + tactic.description + '</p><em>' + (current?.id === tactic.id ? '保留并继续' : current ? '替换并继续' : '装备并继续') + ' · 按 ' + (index + 1) + ' ↗</em></button>').join('') + '</div><p class="tactic-footnote">已装备的模块可在暂停菜单查看；本次远征结束后清空。</p>');
    $('screen-content').querySelectorAll('[data-tactic]').forEach(button => bindMenuChoice(button, () => selectTactic(button.dataset.tactic)));
  }
  function selectTactic(id) {
    if (activeRevelation || !game.chooseTactic(id)) return;
    processEvents(); lastPhase = game.phase;
    if (game.phase === 'upgrade') showUpgrade(); else closeScreen();
  }
  function addTacticSummary(before, result = false) {
    if (game.mode === 'trial' || game.mode === 'voyage' || game.mode === 'salvage') return;
    const tactic = Expedition.TACTICS.find(item => item.id === game.tacticId);
    const summary = document.createElement('div'); summary.className = 'tactic-summary';
    const heading = document.createElement('b'), detail = document.createElement('p');
    heading.textContent = (game.map.id === 'nexus' ? '跨图战术 · ' : '本区裂隙回收 ' + game.encounters.filter(item => item.status === 'complete').length + '/3 · ') + (tactic ? tactic.title : '尚未装备战术模块');
    detail.textContent = tactic ? tactic.description : '在地图追踪裂隙菱形，完成挑战并返回终端获得本局模块。';
    summary.append(heading, detail); before.before(summary);
    if (!result && game.map.id !== 'nexus') { const button = document.createElement('button'); button.id = 'pause-rifts'; button.className = 'secondary-button'; button.textContent = '查看裂隙与模块'; button.addEventListener('click', showRiftGuide); summary.append(button); }
  }
  function readTrialRecord() {
    return profiles.snapshot.trial;
  }
  function showTrialIntro() {
    const record = readTrialRecord();
    showScreen('trial-intro', '<div class="screen-kicker">RIFT TRIAL / SIX WAVES</div><h2 id="screen-title">穿过裂隙，留下名字。</h2><p>六波攻防 · 清场整备 · 终局首领</p><div class="trial-route">' + ['追击', '交叉弹幕', '冲锋', '炮击', '冰霜', '首领'].map((title, i) => '<div><small>0' + (i + 1) + '</small><b>' + title + '</b></div>').join('') + '</div><div class="trial-rules"><p><b>战斗有节奏</b> 开波预告后迎战，清场才进入下一轮。整备与首次领悟时，战场暂停。</p><p><b>抉择有代价</b> 波间选择修复、火力或机动强化；六种武器随时切换。</p><p><b>全新一局</b> 无永久数值加成。布局与遭遇由种子生成，死亡后可以原种子复战。</p></div><p class="trial-record">个人纪录 · 通关 ' + record.wins + ' 次 · 最远 ' + record.bestWave + '/6' + (record.bestTime ? ' · 最快 ' + formatTime(record.bestTime) : '') + '</p><div class="menu-buttons"><button class="launch-button" id="start-trial">踏入裂隙 <b>↗</b></button><button class="secondary-button" id="close-trial-intro">返回营地</button></div>');
    $('start-trial').addEventListener('click', () => startTrial());
    foldNote('.trial-rules', '试炼玩法');
    $('close-trial-intro').addEventListener('click', welcome);
  }
  function startTrial(seed = Math.floor(Math.random() * 4294967296)) {
    resetRun('frontier', seed); startRun();
  }
  function showTrialReward() {
    clearInput();
    const trial = game.trial;
    showScreen('trial-reward', '<div class="screen-kicker">RIFT TRIAL / WAVE ' + trial.wave + ' CLEAR</div><h2 id="screen-title">喘口气，决定下一战。</h2><p>第 ' + trial.wave + ' 波已清场。战场已暂停，选择一项整备后继续。</p><div class="upgrade-grid">' + trial.choices.map((choice, i) => '<button class="upgrade-card" data-trial-reward="' + choice.id + '"><small>波间整备 · ' + (i + 1) + '</small><span class="upgrade-icon">' + (choice.icon || '⟐') + '</span><b>' + choice.title + '</b><p>' + choice.description + '</p><em>选择并迎战 ↗</em></button>').join('') + '</div><p class="trial-record">生命 ' + Math.ceil(game.player.hp) + '/' + game.player.maxHp + ' · 用时 ' + formatTime(game.elapsed) + ' · 种子 ' + trial.seed + '</p>');
    $('screen-content').querySelectorAll('[data-trial-reward]').forEach(button => button.addEventListener('click', () => selectTrialReward(button.dataset.trialReward)));
  }
  function selectTrialReward(id) {
    if (activeRevelation || !game.chooseTrialReward(id)) return;
    tone('upgrade'); lastPhase = game.phase; processEvents();
    if (game.phase === 'upgrade') showUpgrade(); else closeScreen();
  }
  function showTrialResult() {
    const won = game.phase === 'won', trial = game.trial;
    if (!trialResultRecorded) {
      trialResultRecorded = true;
      profiles.recordRun({ id: runId, won, time: Math.min(86400, game.elapsed), wave: won ? 6 : Math.max(0, trial.wave - 1) });
    }
    const record = readTrialRecord();
    showScreen('result', '<div class="result-icon">⟐</div><div class="screen-kicker">RIFT TRIAL / ' + (won ? 'COMPLETED' : 'SIGNAL LOST') + '</div><h2 id="screen-title">' + (won ? '六道裂隙，皆已穿越。' : '这次止步，下次破局。') + '</h2><p>' + (won ? '首领已倒下，试炼完成。你的武器与选择，共同写下这一战。' : '第 ' + trial.wave + ' 波 · ' + trial.title + '。保留这次的战术经验，再来一次。') + '</p><div class="result-grid"><div><strong>' + (won ? 6 : trial.wave - 1) + '/6</strong><small>完成波次</small></div><div><strong>' + formatTime(game.elapsed) + '</strong><small>战斗时间</small></div><div><strong>' + (runStats.techniques || 0) + '</strong><small>技巧触发</small></div></div><p class="result-tip">击败 ' + game.kills + ' · 最高连杀 ' + game.combo.best + ' · 精准装填 ' + runStats.perfectReloads + '</p><p class="trial-record">种子 ' + trial.seed + ' · 个人通关 ' + record.wins + ' 次' + (record.bestTime ? ' · 最快 ' + formatTime(record.bestTime) : '') + '<br>' + profileSaveNote() + ' 不同种子难度略有差异。</p><div class="menu-buttons"><button class="launch-button" id="trial-retry">同种子复战 <b>↗</b></button><button class="secondary-button" id="trial-new">新的裂隙</button><button class="secondary-button" id="back-welcome">返回营地</button></div>');
    $('trial-retry').addEventListener('click', () => startTrial(trial.seed));
    $('trial-new').addEventListener('click', () => startTrial());
    $('back-welcome').addEventListener('click', () => { resetRun('frontier'); welcome(); });
    addEvolutionSummary($('screen-content').querySelector('.menu-buttons'), true);
    if (!won && game.lastDamage) {
      const cause = document.createElement('section'); cause.className = 'result-cause';
      const heading = document.createElement('strong'), hint = document.createElement('p');
      heading.textContent = game.lastDamage.name + ' · 扣除 ' + game.lastDamage.healthLost + ' 点生命'; hint.textContent = game.lastDamage.hint;
      cause.append(heading, hint); $('screen-content').querySelector('.result-grid').after(cause);
    }
    addArchiveButton($('screen-content').querySelector('.menu-buttons'));
  }
  function startRun() {
    if (game.phase !== 'ready') resetRun();
    game.start(); paused = false; lastPhase = 'playing';
    renderer.camera.x = game.player.x; renderer.camera.y = game.player.y;
    closeScreen(); tone('click'); processEvents();
    banner('OPERATION / ' + game.map.id.toUpperCase(), game.map.name + ' · 行动开始');
    if (game.salvage || game.siege) $('run-log').textContent = game.map.briefing; else notify(game.map.briefing);
  }
  function pauseGame() {
    if (activeRevelation || game.phase !== 'playing' || screen) return;
    paused = true; clearInput(); showPause();
  }
  function showPause() {
    const stacks = Object.entries(game.upgradeStacks).map(([id, count]) => ([...Expedition.UPGRADES, ...Expedition.EVOLUTIONS].find(upgrade => upgrade.id === id)?.title || id) + ' ×' + count);
    stacks.push(...game.relics.map(id => '遗物 · ' + Expedition.RELICS.find(relic => relic.id === id).title));
    showScreen('pause', '<div class="screen-kicker">MISSION ON HOLD</div><h2 id="screen-title">荒原，等你片刻。</h2><p>你的远征已暂停。恢复后从原地继续。</p><div class="result-grid"><div><strong>' + formatTime(game.elapsed) + '</strong><small>远征时间</small></div><div><strong>' + game.kills + '</strong><small>击败敌人</small></div><div><strong>' + (game.voyage ? (game.voyage.node - 1) + '/7' : game.mode === 'trial' ? game.trial.completedWaves + '/6' : game.campaign ? game.campaign.completedStages + '/3' : game.completedRelays + '/3') + '</strong><small>' + (game.voyage ? '突破航段' : game.mode === 'trial' ? '完成波次' : game.campaign ? '突破战区' : '主线目标') + '</small></div></div><p class="result-tip">' + (stacks.length ? stacks.join(' · ') : '尚未获得生长协议。收集敌人掉落的经验可以升级。') + '</p><div class="menu-buttons"><button class="launch-button" id="resume-run">继续远征 <b>↗</b></button><button class="secondary-button" id="pause-help">查看操作</button><button class="secondary-button" id="new-run">重新出发</button></div>');
    FrontierTouch.bindTouchAction($('resume-run'), resume);
    $('pause-help').addEventListener('click', showHelp);
    $('new-run').addEventListener('click', confirmRestart);
    const mapButton = document.createElement('button'); mapButton.className = 'secondary-button'; mapButton.textContent = '战术地图'; mapButton.addEventListener('click', showMap); $('screen-content').querySelector('.menu-buttons').append(mapButton);
    const campButton = document.createElement('button'); campButton.id = 'change-sector'; campButton.className = 'secondary-button'; campButton.textContent = '返回营地 / 换战区';
    campButton.addEventListener('click', () => {
      showScreen('camp-confirm', '<div class="screen-kicker">RETURN TO CAMP</div><h2 id="screen-title">返回营地，选择新战区？</h2><p>本局进度将重置，个人最佳纪录会保留。</p><div class="menu-buttons"><button class="launch-button" id="confirm-camp">返回营地</button><button class="secondary-button" id="cancel-camp">继续本局</button></div>');
      $('confirm-camp').addEventListener('click', () => { rememberBest(); resetRun(); welcome(); });
      $('cancel-camp').addEventListener('click', showPause);
    }); $('screen-content').querySelector('.menu-buttons').append(campButton);
    const fieldEntry = document.createElement('button'); fieldEntry.id = 'pause-battlefield'; fieldEntry.className = 'secondary-button'; fieldEntry.textContent = '破阵战场资料';
    fieldEntry.addEventListener('click', () => showBattlefieldGuide(showPause)); $('screen-content').querySelector('.menu-buttons').append(fieldEntry);
    addArchiveButton($('screen-content').querySelector('.menu-buttons'));
    addTacticSummary($('screen-content').querySelector('.menu-buttons'));
    addEvolutionSummary($('screen-content').querySelector('.menu-buttons'));
    addDisplayEntry($('screen-content').querySelector('.menu-buttons'));
    if (game.siege) {
      const rules = document.createElement('div'); rules.innerHTML = siegeRules(); $('screen-content').querySelector('.menu-buttons').after(rules);
      const stats = $('screen-content').querySelectorAll('.result-grid strong'), labels = $('screen-content').querySelectorAll('.result-grid small');
      stats[2].textContent = game.siege.wrecks.length + '/3'; labels[2].textContent = '拆毁炮座';
      $('resume-run').innerHTML = '继续猎场 <b>↗</b>';
    }
    if (game.voyage) {
      const summary = document.createElement('div'); summary.className = 'campaign-carried';
      summary.innerHTML = '<b>星海远航 · 第 ' + game.voyage.node + '/7 段</b><p>' + voyageBuildText() + '</p><span>' + (voyagePairs().map(pair => pair.title + '：' + pair.description).join(' / ') || '成对装置可激活共鸣；下一次清场可调整。') + '</span>';
      $('screen-content').querySelector('.result-grid').before(summary);
    }
    if (game.mode === 'campaign') {
      const summary = document.createElement('p'); summary.className = 'campaign-selection';
      summary.textContent = '连续远征 · 第 ' + game.campaign.stage + '/3 幕 · ' + campaignBuildText();
      $('screen-content').querySelector('.result-grid').before(summary);
      const awakening = Expedition.CAMPAIGN_AWAKENINGS.find(item => item.id === game.campaign.awakeningId);
      if (awakening) { const hint = document.createElement('p'); hint.className = 'awakening-preview'; hint.textContent = awakening.title + '：' + awakening.description; summary.after(hint); }
    }
    if (game.salvage) {
      const stats = $('screen-content').querySelectorAll('.result-grid strong'), labels = $('screen-content').querySelectorAll('.result-grid small');
      stats[2].textContent = game.salvage.carried; labels[2].textContent = '携带样本 · 尚未结算';
      const summary = document.createElement('p'); summary.className = 'salvage-selection';
      summary.textContent = '警戒 ' + game.salvage.alertLevel + ' · 来源已取 ' + game.salvage.sources.filter(source => source.status === 'collected').length + '/5 · ' + salvageStateText();
      $('screen-content').querySelector('.result-grid').after(summary);
      $('resume-run').innerHTML = '继续回收 <b>↗</b>';
    }
    for (const [selector, label] of [['.result-tip', '本局强化'], ['.tactic-summary:not(.evolution-summary)', '战术模块'], ['.evolution-summary', '武器进化'], ['.campaign-carried', '远航构筑']]) {
      if (!$('screen-content').querySelector(selector)) continue;
      foldNote(selector, label);
      $('screen-content').append($('screen-content').querySelector(selector).closest('details'));
    }
  }
  function resume() { paused = false; closeScreen(); }
  function showHelp() {
    if (activeRevelation) return;
    if (screen && !['pause', 'welcome'].includes(screen)) return;
    previousScreen = screen || 'playing'; paused = game.phase === 'playing';
    const controls = [['W A S D / ↑↓←→','自由移动；触屏使用左摇杆'],['鼠标 + 左键','手动射击；命中紫色印记触发连锁爆破'],['SHIFT / 空格','冲刺烙印敌人、吸收敌弹；冷却即将结束时可提前按下'],['F / 点星核','满能量开启 7 秒暴走：无限弹药，射速与伤害提升'],['1 / 2 / 3 / 4 / 5 / 6','步枪、散弹、轨道、榴弹、回旋刃、钉枪随时切换'],['R','绿色区再次按 R 精准装填，强化弹匣并蓄能'],['Q','脉冲震荡：打断冲锋，清除附近敌弹'],['E','靠近后交互，医疗与工坊消耗芯片'],['M / TAB','战术地图：暂停并选择追踪目标'],['P / ESC','暂停游戏，再按一次继续']];
    showScreen('help', '<div class="screen-kicker">FIELD MANUAL / 07</div><h2 id="screen-title">活着，把信号带回来。</h2><div class="guide-grid">' + controls.map(([key, text]) => '<div class="guide-item"><kbd>' + key + '</kbd><p>' + text + '</p></div>').join('') + '</div><div class="guide-tip">本图：' + game.map.briefing + ' ' + game.map.threat.description + ' 首领：' + game.map.boss.name + '，' + game.map.boss.subtitle + '。补给箱免费开启，医疗和工坊消耗芯片。移动端使用左摇杆移动、右摇杆瞄准射击；左手不松摇杆时，右手仍可换弹、换枪和释放技能。</div><div class="menu-buttons"><button class="launch-button" id="close-help">准备好了 <b>↗</b></button></div>');
    FrontierTouch.bindTouchAction($('close-help'), returnFromHelp);
    if (game.mode === 'trial') $('screen-content').querySelector('.guide-tip').textContent = '裂隙试炼共六波，每波先预告再开战。清场后自动回收掉落物、补满弹药并恢复少量生命，再选择修复、火力或机动整备。第六波击败首领即可通关；没有信标、工坊或支线终端。';
    if (game.mode === 'campaign') {
      const doctrine = Expedition.CAMPAIGN_DOCTRINES.find(item => item.id === game.campaign.doctrineId);
      $('screen-content').querySelector('.guide-tip').textContent = '连续远征 · 第 ' + game.campaign.stage + '/3 幕。' + doctrine.title + '：' + doctrine.description + ' 两处战区首领击败后可安全整备，全部构筑跨图保留。最后进入裂隙中枢，击破两座能量锚可永久解除主宰 65% 减伤。';
      const awakening = Expedition.CAMPAIGN_AWAKENINGS.find(item => item.id === game.campaign.awakeningId);
      if (awakening) $('screen-content').querySelector('.guide-tip').textContent += ' 觉醒「' + awakening.title + '」：' + awakening.description;
    }
    const preference = document.createElement('button'); preference.className = 'secondary-button';
    const label = () => { preference.textContent = renderer.reducedMotion ? '画面反馈：舒缓' : '画面反馈：标准'; preference.setAttribute('aria-pressed', String(renderer.reducedMotion)); };
    label(); preference.addEventListener('click', () => { renderer.reducedMotion = !renderer.reducedMotion; save('frontier-motion', renderer.reducedMotion ? 'calm' : 'standard'); label(); });
    $('screen-content').querySelector('.menu-buttons').append(preference);
    const musicPreference = document.createElement('button'); musicPreference.id = 'music-preference'; musicPreference.className = 'secondary-button';
    const musicLabel = () => { musicPreference.textContent = music ? '原创配乐：开' : '原创配乐：关'; musicPreference.setAttribute('aria-pressed', String(music)); };
    musicLabel(); musicPreference.addEventListener('click', () => { music = !music; save('frontier-music', music ? 'on' : 'off'); audio.setMusicEnabled(music); musicLabel(); if (music) tone('click'); });
    $('screen-content').querySelector('.menu-buttons').append(musicPreference);
    const expeditionTip = document.createElement('p'); expeditionTip.className = 'expedition-tip';
    expeditionTip.textContent = '星索钉枪命中敌人、岩石或射程终点会落钉；两钉之间没有岩石时连成绊线，移动引敌穿线即可截击。窄屏手机可横滑军械条找到全部六把武器。紫色终端可接取一条支线：回收核心、追猎精英或摧毁虫巢。完成后返回终端，选择一件遗物。榴弹虚线按当前场景估计爆点与范围；敌人移动会改变命中位置。炮击虫的橙色落点有预警，持续移动或用脉冲打断。';
    if (game.mode === 'trial') expeditionTip.textContent = '场边紫色裂隙是敌人的入口。利用掩体拆分敌群，换枪应对不同波次。首次发现隐藏技巧会安全暂停，并在画面中央留下专属铭文。';
    if (game.voyage) {
      $('screen-content').querySelector('.guide-tip').textContent = '星海远航 · 第 ' + game.voyage.node + '/7 段。清剿消灭有限敌群；拆柱集中射击三柱；收割器附近击杀双倍充能，远处击杀也会推进。完成目标后走到出口按 E 或点交互。每段结束安全整备，可选路线、免费调整一槽装置，或用芯片购买一次强化。';
      expeditionTip.textContent = voyageBuildText() + '。' + (voyagePairs().map(pair => pair.title + '：' + pair.description).join(' ') || '冲刺系：冲刺后射击；装填系：绿色区精准装填后射击；脉冲系：EMP 后射击。成对装备潮汐引擎与极光电池时，井存在期间再按 Q 或点脉冲，可二次引爆，原冷却保留。');
    }
    if (game.salvage) {
      $('screen-content').querySelector('.guide-tip').textContent = '危险回收：保险箱可用 EMP 开启 4 秒静默窗口后交互，或射击破锁。钻探启动后在圈内累计 8 秒，离圈保留进度。运输无人机射击截停，靠近交互取货。样本登舰前不计奖金，死亡会遗失。';
      expeditionTip.textContent = '破锁、钻探与截停提高警戒，静默开箱动静较小。警戒升级会招来增援，高警戒还有扫描爆圈。撤离点交互呼叫接应也会招来追兵，10 秒到达后圈内累计 3 秒登舰，离圈暂停。空手也能安全撤回，无需击败首领或清空增援。地图选择只改变追踪，不会领取或呼叫。手机保持双摇杆时，第三指仍可装填、换枪、EMP 和交互。';
    }
    if (game.siege) {
      $('screen-content').querySelector('.guide-tip').textContent = '巨械猎场：射击拆毁三种炮座，用 EMP 接管残骸，再瞄准并靠近交互开炮。EMP 也可把范围内慢速重弹朝准星改向；每座残骸只有 3 发。';
      expeditionTip.textContent = '普通武器始终有效，不必夺炮也能通关。两次重火力真实命中可提前破甲，60% 生命必进裸核阶段，25% 过载；锁向后侧移、穿环弹缺口，抓住攻击后的恢复窗口。手机双摇杆持有时仍可用第三指交互开炮、释放 EMP、换弹和换枪。';
    }
    $('screen-content').querySelector('.menu-buttons').before(expeditionTip);
  }
  function bindMenuChoice(button, select) {
    let contact = null, lastTouchTime = -Infinity;
    button.addEventListener('pointerdown', event => {
      if (button.disabled || event.pointerType !== 'touch' || event.isPrimary) { contact = null; lastTouchTime = -Infinity; return; }
      // Secondary fingers may not click; wait for a tap so scrolling cannot choose a card.
      contact = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; lastTouchTime = Date.now();
    });
    button.addEventListener('pointermove', event => {
      if (event.pointerId === contact?.id && Math.hypot(event.clientX - contact.x, event.clientY - contact.y) > 10) contact.moved = true;
    });
    button.addEventListener('pointercancel', event => {
      if (event.pointerId === contact?.id) { contact = null; lastTouchTime = Date.now(); }
    });
    button.addEventListener('pointerup', event => {
      if (event.pointerId !== contact?.id) return;
      const tap = contact; contact = null; lastTouchTime = Date.now();
      if (button.disabled || tap.moved || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) return;
      event.preventDefault(); select();
    });
    button.addEventListener('click', event => {
      if (button.disabled) return;
      if (event.detail !== 0 && Date.now() - lastTouchTime < 800 && event.pointerType !== 'mouse' && event.pointerType !== 'pen' && event.sourceCapabilities?.firesTouchEvents !== false) { event.preventDefault(); return; }
      select();
    });
  }
  function showMap() {
    if (activeRevelation) return;
    if (!['ready', 'playing'].includes(game.phase) || (screen && !['pause', 'welcome'].includes(screen))) return;
    mapReturn = screen || 'playing'; paused = game.phase === 'playing';
    if (game.salvage) { showSalvageMap(); return; }
    if (game.siege) { showSiegeMap(); return; }
    if (game.voyage) {
      const target = game.voyageTarget(), room = game.voyage.room;
      const boss = game.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0);
      const targetHint = boss?.attackHint || target?.hint || game.map.briefing;
      const progressText = room.type === 'finale' && boss ? '首领生命 ' + Math.ceil(boss.hp / boss.maxHp * 100) + '% · 阶段 ' + boss.stage : target?.total ? target.progress + '/' + target.total : '';
      showScreen('map', '<div class="screen-kicker">STARFARING / TACTICAL OVERVIEW</div><h2 id="screen-title">' + game.map.name + ' · 航段 ' + game.voyage.node + '/7</h2><div class="tactical-layout"><div class="tactical-surface"><canvas id="tactical-map" width="640" height="480" aria-label="远航战术地图：当前位置、目标、出口与地形"></canvas><div class="tactical-legend"><span>△ 你</span><span>◇ 作战目标</span><span>◎ 出口</span></div></div><div class="destination-list"><div class="campaign-carried"><b>' + (voyageObjectiveNames[room.type] || '终局') + ' · ' + (room.risk === 'surge' ? '高风险' : '常规航路') + '</b><p>' + targetHint + '</p><span>' + (target ? target.label + (progressText ? ' · ' + progressText : '') : game.currentObjective) + '</span></div><p>' + voyageBuildText() + '</p><p>' + (voyagePairs().map(pair => pair.title + '：' + pair.description).join(' ') || '下一段整备可重新组合装置。') + '</p></div></div><div class="menu-buttons"><button class="launch-button" id="close-map">返回远航 <b>↗</b></button></div><p class="map-note">战场已暂停 · M / Esc 关闭 · 种子 ' + game.voyage.seed + '</p>');
      FrontierTouch.bindTouchAction($('close-map'), closeMap); renderer.drawMinimap($('tactical-map'), game, { detailed: true }); return;
    }
    const rows = game.relays.map((relay, index) => {
      const status = relay.status === 'active' ? '已完成' : relay.status === 'locked' ? '先完成上一段' : relay.status === 'charging' ? game.map.mode === 'conduction' ? '导雷 ' + relay.charges + '/' + relay.chargeGoal : '进度 ' + Math.floor(relay.progress * 100) + '%' : Math.round(Math.hypot(relay.x - game.player.x, relay.y - game.player.y) / 10) + ' m';
      const theme = game.map.mode === 'delivery' ? '取回对应星核 → 送至接收站 · 冲刺会放下' : game.map.mode === 'demolition' ? '启动终端 → 集火反应堆' : game.map.mode === 'escort' ? '随车推进 → 到达下一站' : game.map.mode === 'conduction' ? '塔内锁雷 → 撤出爆圈 · 三次充满' : ['虫群与冲锋', '远程交叉火力', '重装破阵'][index];
      return '<button class="map-destination ' + (!trackedContractId && !trackedEncounterId && relay.id === trackedRelayId ? 'selected' : '') + '" data-target="' + relay.id + '" ' + (['active', 'locked'].includes(relay.status) ? 'disabled' : '') + '><small>主线 0' + (index + 1) + ' / ' + status + '</small><b>' + relay.name + '</b><small>' + theme + '</small><span>' + (relay.status === 'active' ? '✓ 已完成' : !trackedContractId && !trackedEncounterId && relay.id === trackedRelayId ? '◎ 正在追踪' : '选择追踪 →') + '</span></button>';
    }).join('');
    showScreen('map', '<div class="screen-kicker">KEPLER / TACTICAL OVERVIEW</div><h2 id="screen-title">' + game.map.name + ' · 战术地图</h2><div class="tactical-layout"><div class="tactical-surface"><canvas id="tactical-map" width="640" height="480" aria-label="战区全图：主线目标、补给、医疗、工坊与当前位置"></canvas><div class="tactical-legend"><span>◆ 主线</span><span>▣ 补给</span><span>＋ 医疗</span><span>▰ 工坊</span><span>△ 你</span></div></div><div class="destination-list">' + rows + '<p>' + game.map.briefing + '</p></div></div><div class="menu-buttons"><button class="launch-button" id="close-map">返回远征 <b>↗</b></button></div><p class="map-note">战场已暂停 · Tab 切换目标 · M / Esc 关闭</p>');
    FrontierTouch.bindTouchAction($('close-map'), closeMap);
    const contractList = document.createElement('div'); contractList.className = 'contract-destinations';
    contractList.innerHTML = '<h3>可选支线 · 返回终端领取奖励</h3>' + game.contracts.map(contract => {
      const status = { idle: '待接取', active: contract.progress + '/' + contract.goal, ready: '返回领取奖励', complete: '已完成' }[contract.status];
      const target = game.contractTarget(contract);
      const destination = contract.status === 'active' ? '下一目标' : contract.status === 'ready' ? '领奖终端' : '支线终端';
      const location = contract.status === 'complete' ? '' : ' · ' + destination + ' ' + Math.round(Math.hypot(target.x - game.player.x, target.y - game.player.y) / 10) + ' m';
      return '<button class="map-destination contract-destination ' + (trackedContractId === contract.id ? 'selected' : '') + '" data-contract="' + contract.id + '" ' + (contract.status === 'complete' ? 'disabled' : '') + '><small>' + status + location + '</small><b>' + contract.name + '</b><small>' + contract.description + '</small><span>' + (trackedContractId === contract.id ? '◎ 正在追踪' : contract.status === 'complete' ? '✓ 奖励已领取' : '追踪支线 →') + '</span></button>';
    }).join('');
    if (game.contracts.length) $('screen-content').querySelector('.destination-list').append(contractList);
    contractList.querySelectorAll('[data-contract]').forEach(button => bindMenuChoice(button, () => {
      trackedEncounterId = null; trackedContractId = Number(button.dataset.contract); closeMap(); tone('click'); notify('已追踪支线：' + game.contracts.find(contract => contract.id === trackedContractId).name);
    }));
    if (game.encounters.length) {
      const encounterList = document.createElement('div'); encounterList.className = 'encounter-destinations';
      encounterList.innerHTML = '<h3>裂隙遗迹 · 可选挑战 / 单槽战术</h3>' + game.encounters.map(encounter => {
        const target = game.encounterTarget(encounter), done = ['complete', 'failed'].includes(encounter.status);
        return '<button class="map-destination encounter-destination ' + (trackedEncounterId === encounter.id ? 'selected' : '') + '" data-encounter="' + encounter.id + '" ' + (done ? 'disabled' : '') + '><small>' + encounterStatus(encounter) + (done ? '' : ' · ' + Math.round(Math.hypot(target.x - game.player.x, target.y - game.player.y) / 10) + ' m') + '</small><b>◈ ' + encounter.name + '</b><small>' + encounter.description + '</small><span>' + (done ? '本次已结束' : trackedEncounterId === encounter.id ? '◎ 正在追踪' : '追踪异象 →') + '</span></button>';
      }).join('');
      $('screen-content').querySelector('.destination-list').prepend(encounterList);
      encounterList.querySelectorAll('[data-encounter]').forEach(button => bindMenuChoice(button, () => {
        trackedEncounterId = Number(button.dataset.encounter); trackedContractId = null; closeMap(); tone('click');
        const target = game.encounters.find(encounter => encounter.id === trackedEncounterId);
        const next = target.status === 'ready' ? '返回终端领取模块' : target.status === 'active' ? target.kind === 'race' ? '前往亮起的下一个节点' : target.kind === 'rings' ? '前往明亮的活跃环' : '清除标记守卫' : '到达终端后交互';
        notify('已追踪：' + target.name + ' · ' + next);
      }));
      const riftLegend = document.createElement('span'); riftLegend.textContent = '◈ 裂隙遗迹'; $('screen-content').querySelector('.tactical-legend').append(riftLegend);
    }
    const legend = document.createElement('span'); legend.textContent = '⬡ 支线 / 核心'; $('screen-content').querySelector('.tactical-legend').append(legend);
    if (game.mode === 'trial') $('screen-content').querySelector('.tactical-legend').textContent = '△ 你 · 岩石是掩体 · 场边裂隙轮流来敌';
    if (game.map.id === 'nexus') {
      $('screen-content').querySelector('.tactical-legend').textContent = '△ 你 · ◇ 能量锚 · ◆ 中枢主宰';
      const status = document.createElement('p'); status.className = 'campaign-selection';
      status.textContent = '终章 · ' + game.enemies.filter(enemy => enemy.type === 'anchor' && enemy.hp > 0).length + '/2 座能量锚存续。双锚全部摧毁后，首领护盾永久解除。';
      $('screen-content').querySelector('.destination-list').prepend(status);
    }
    $('screen-content').querySelectorAll('[data-target]').forEach(button => bindMenuChoice(button, () => {
      trackedContractId = null; trackedEncounterId = null;
      trackedRelayId = Number(button.dataset.target); renderer.trackedRelayId = trackedRelayId;
      closeMap(); tone('click'); notify('已追踪：' + game.relays.find(relay => relay.id === trackedRelayId).name);
    }));
    renderer.drawMinimap($('tactical-map'), game, { detailed: true });
  }
  function showSalvageMap() {
    const salvage = game.salvage, target = game.salvageTarget();
    const rows = salvage.sources.map(source => {
      const done = source.status === 'collected';
      const status = done ? '已取样本' : source.kind === 'drill' ? source.status === 'drilling' ? '钻探 ' + source.progress.toFixed(1) + '/' + source.duration + 's · 离圈保留' : '交互启动 · 圈内钻探' : source.status === 'open' ? '靠近交互取货' : source.kind === 'drone' ? '移动运输 · 射击截停' : source.quietTimer > 0 ? '静默窗口 ' + source.quietTimer.toFixed(1) + 's · 交互领取' : 'EMP 静默开箱 / 射击破锁';
      return '<button class="map-destination' + (source.id === target?.id ? ' selected' : '') + '" data-salvage-target="' + source.id + '"' + (done ? ' disabled' : '') + '><small>' + ({ vault: '保险箱', drill: '钻探井', drone: '无人机' })[source.kind] + ' · 样本 ' + source.value + (done ? '' : ' · ' + Math.round(Math.hypot(source.x - game.player.x, source.y - game.player.y) / 10) + ' m') + '</small><b>' + source.name + '</b><small>' + status + '</small><span>' + (done ? '✓ 已回收' : source.id === target?.id ? '◎ 正在追踪' : '追踪 →') + '</span></button>';
    }).join('');
    const exits = salvage.exits.map(exit => {
      const called = salvage.evac?.exitId === exit.id, unavailable = !!salvage.evac && !called;
      return '<button class="map-destination salvage-exit' + (exit.id === target?.id ? ' selected' : '') + '" data-salvage-target="' + exit.id + '"' + (unavailable ? ' disabled' : '') + '><small>撤离点 · ' + Math.round(Math.hypot(exit.x - game.player.x, exit.y - game.player.y) / 10) + ' m</small><b>' + (exit.name || '撤离点') + '</b><small>' + (called ? salvageStateText() : unavailable ? '接应已固定在另一处撤离点' : exit.arrivalDuration + ' 秒接应 · ' + exit.coverLabel) + '</small><span>' + (exit.id === target?.id ? '◎ 正在追踪' : unavailable ? '无法在此登舰' : '追踪 →') + '</span></button>';
    }).join('');
    const cargo = salvage.hotCargo, canTrackCargo = cargo && ['ground', 'dropped'].includes(cargo.status);
    const cargoRow = cargo ? '<button class="map-destination salvage-cargo" data-salvage-target="' + cargo.id + '"' + (canTrackCargo ? '' : ' disabled') + '><small>高价值货物 · 带回 +' + cargo.bonus + '</small><b>黑匣子</b><small>' + (cargo.status === 'carried' ? '已携带 · ' + Math.ceil(cargo.pulseRemaining) + ' 秒后广播' : canTrackCargo ? '武器 +15% · 每 12 秒暴露 · 可以丢弃' : cargo.status === 'banked' ? '已带回' : '已遗失') + '</small><span>' + (canTrackCargo ? '追踪 →' : '携带时 G / 弃货放下') + '</span></button>' : '';
    const comms = salvage.comms, canTrackComms = ['idle', 'linking'].includes(comms.status);
    const commsStatus = comms.status === 'idle' ? '消耗 EMP · 守圈 5 秒 · 拦 1 波' : comms.status === 'linking' ? '架设 ' + comms.progress.toFixed(1) + '/5s · 离圈保留进度' : ({ armed: '就绪 · 拦截下一波警戒增援', spent: '拦截完成 · 本局已用尽', expired: '已失效 · 警戒增援全部出动' })[comms.status];
    const commsRow = '<button class="map-destination' + (comms.id === target?.id ? ' selected' : '') + '" data-salvage-target="' + comms.id + '"' + (canTrackComms ? '' : ' disabled') + '><small>一次性战术设施</small><b>通讯站</b><small>' + commsStatus + '</small><span>' + (canTrackComms ? comms.id === target?.id ? '◎ 正在追踪' : '追踪 →' : '⌁') + '</span></button>';
    const chance = salvage.lastChance, canTrackChance = chance?.status === 'available' && chance.remaining > 0;
    const chanceRow = chance ? '<button class="map-destination' + (chance.id === target?.id ? ' selected' : '') + '" data-salvage-target="' + chance.id + '"' + (canTrackChance ? '' : ' disabled') + '><small>限时来源 · 样本 +' + chance.value + ' / 带回 +' + chance.value * 80 + '</small><b>应急货箱</b><small>' + (canTrackChance ? Math.ceil(chance.remaining) + ' 秒 · 取货追兵 ×2' : chance.status === 'collected' ? '已取货 · 登舰后结算' : '已过期 · 接应继续') + '</small><span>' + (canTrackChance ? chance.id === target?.id ? '◎ 正在追踪' : '追踪 →' : '—') + '</span></button>' : '';
    showScreen('map', '<div class="screen-kicker">SALVAGE / 战术地图</div><h2 id="screen-title">危险回收 · 战术地图</h2><p class="salvage-selection">样本 ' + salvage.carried + ' · 警戒 ' + salvage.alertLevel + '（' + salvage.alarm + '/100） · ' + salvageStateText() + '</p><div class="tactical-layout"><div class="tactical-surface"><canvas id="tactical-map" width="640" height="480" aria-label="回收战场：五处来源、通讯站、限时货箱、黑匣子、两个撤离点、当前位置和掩体"></canvas><div class="tactical-legend"><span>△ 你</span><span>◇ 保险箱</span><span>◎ 钻探井</span><span>▱ 运输货物</span><span>⇧ 撤离点</span><span>▣ 黑匣子</span><span>⌁ 通讯站</span><span>▣ 限时货箱</span></div></div><div class="destination-list salvage-destinations">' + rows + exits + cargoRow + commsRow + chanceRow + '</div></div><div class="menu-buttons"><button class="launch-button" id="close-map">返回回收区 <b>↗</b></button></div><p class="map-note">已暂停 · 点选追踪，靠近交互 · M / Esc 返回</p>');
    FrontierTouch.bindTouchAction($('close-map'), closeMap);
    $('screen-content').querySelectorAll('[data-salvage-target]').forEach(button => bindMenuChoice(button, () => {
      if (!game.selectSalvageTarget(Number(button.dataset.salvageTarget))) return;
      const next = game.salvageTarget(); closeMap(); tone('click'); $('run-log').textContent = '已追踪：' + next.label + ' · ' + next.hint;
    }));
    renderer.drawMinimap($('tactical-map'), game, { detailed: true });
  }
  function showSiegeMap() {
    const siege = game.siege, boss = game.enemies.find(enemy => enemy.id === siege.bossId), target = game.siegeTarget();
    const targets = [boss, ...siege.parts.filter(part => part.hp > 0), ...siege.wrecks.filter(wreck => wreck.status !== 'spent')].filter(Boolean);
    const rows = targets.map(item => {
      const wreck = item.type === 'siege-wreck', name = wreck ? siegePartNames[item.kind] + '残骸' : item.name;
      const state = wreck ? item.status === 'captured' ? '重炮 ' + item.ammo + '/3 · 瞄准后交互' : 'EMP 接管 → 重炮 ×3' : item.siegePart ? '射击拆炮 → EMP 接管' : boss.shielded ? '装甲中 · 重火力破甲' : boss.stage === 3 ? '过载反扑' : '核心裸露';
      return '<button class="map-destination' + (item.id === target?.id ? ' selected' : '') + '" data-siege-target="' + item.id + '"><small>' + Math.round(Math.hypot(item.x - game.player.x, item.y - game.player.y) / 10) + ' m</small><b>' + name + '</b><small>' + state + '</small><span>' + (item.id === target?.id ? '◎ 正在追踪' : '追踪 →') + '</span></button>';
    }).join('');
    showScreen('map', '<div class="screen-kicker">SIEGE / 战术地图</div><h2 id="screen-title">巨械猎场</h2><div class="tactical-layout"><div class="tactical-surface"><canvas id="tactical-map" width="640" height="480" aria-label="巨械猎场：巨械、炮座、残骸、掩体和当前位置"></canvas><div class="tactical-legend"><span>△ 你</span><span>⬡ 巨械</span><span>◇ 炮座</span><span>▣ 残骸</span></div></div><div class="destination-list">' + rows + '</div></div><div class="menu-buttons"><button class="launch-button" id="close-map">返回猎场 <b>↗</b></button></div><p class="map-note">已暂停 · 点选仅追踪 · 种子 ' + siege.seed + '</p>' + siegeRules());
    FrontierTouch.bindTouchAction($('close-map'), closeMap);
    $('screen-content').querySelectorAll('[data-siege-target]').forEach(button => bindMenuChoice(button, () => { if (game.selectSiegeTarget(Number(button.dataset.siegeTarget))) { closeMap(); tone('click'); } }));
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
  function addArchiveButton(container) {
    const button = document.createElement('button'); button.id = 'open-secrets'; button.className = 'secondary-button';
    button.textContent = '◇ 未知档案 · ' + game.discoveredSecrets.size + '/' + Expedition.SECRETS.length;
    button.addEventListener('click', showSecrets); container.append(button);
  }
  function showSecrets() {
    if (!['welcome', 'pause', 'result'].includes(screen)) return;
    archiveReturn = screen;
    const cards = Expedition.SECRETS.map((secret, index) => {
      const number = String(index + 1).padStart(2, '0');
      if (!game.discoveredSecrets.has(secret.id)) return '<article class="secret-card locked"><small>未知记录 / ' + number + '</small><span class="secret-icon" aria-hidden="true">◇</span><h3>？？？</h3><p>尚未发现。条件与效果将在亲手触发后揭晓。</p><span class="secret-status">未解锁</span></article>';
      return '<article class="secret-card discovered" data-discovery="' + secret.id + '"><small>已解密 / ' + number + '</small><span class="secret-icon" aria-hidden="true">' + secret.icon + '</span><h3>' + secret.title + '</h3><p class="secret-condition">' + secret.condition + '</p><p>' + secret.description + '</p><span class="secret-status">✓ 已发现 · 可重复施展</span></article>';
    }).join('');
    showScreen('secrets', '<div class="screen-kicker">UNKNOWN / FIELD ARCHIVE</div><h2 id="screen-title">荒原，还有别的答案。</h2><p class="secret-intro">已发现 <b>' + game.discoveredSecrets.size + ' / ' + Expedition.SECRETS.length + '</b> 项隐藏机制。试着让熟悉的动作产生新的联系。</p><div class="secret-grid">' + cards + '</div><p class="secret-save-note">' + profileSaveNote() + '</p><div class="menu-buttons secret-footer"><button class="launch-button" id="close-secrets">' + (archiveReturn === 'pause' ? '返回暂停' : archiveReturn === 'result' ? '返回战报' : '返回营地') + ' <b>↗</b></button></div>');
    $('close-secrets').addEventListener('click', closeSecrets);
    $('screen-content').querySelectorAll('[data-discovery]').forEach(card => {
      const secret = Expedition.SECRETS.find(item => item.id === card.dataset.discovery);
      const revisit = document.createElement('button'); revisit.className = 'secret-revisit'; revisit.dataset.revisit = secret.id; revisit.textContent = '重温领悟 ↗';
      revisit.addEventListener('click', () => { if (activeRevelation) return; revelationQueue.push({ ...secret, revisited: true }); showRevelation(); });
      card.append(revisit);
    });
  }
  function closeSecrets() {
    if (archiveReturn === 'pause') showPause();
    else if (archiveReturn === 'result') showResult();
    else { paused = false; welcome(); }
    $('open-secrets').focus({ preventScroll: true });
  }
  function confirmRestart() {
    showScreen('restart', '<div class="screen-kicker">NEW EXPEDITION</div><h2 id="screen-title">重新出发？</h2><p>本局探索和强化会重置，个人最佳纪录会保留。</p><div class="menu-buttons"><button class="launch-button" id="restart-confirm">开始新远征 <b>↗</b></button><button class="secondary-button" id="restart-cancel">返回暂停</button></div>');
    $('restart-confirm').addEventListener('click', restartRun); $('restart-cancel').addEventListener('click', showPause);
  }
  function rememberBest() { if (game.mode !== 'trial' && game.score > best) { best = game.score; profiles.recordBest(best); } }
  function resetRun(mapId = game.map.id, trialSeed = null, campaignOptions = null) {
    revelationQueue.length = 0; activeRevelation = null; revelationReady = false; clearTimeout(revelationTimer);
    stage.classList.remove('revealing');
    $('revelation-overlay').classList.add('hidden'); $('revelation-overlay').innerHTML = ''; $('screen-overlay').inert = false;
    game.reset(mapId, campaignOptions || (trialSeed === null ? {} : { mode: 'trial', seed: trialSeed })); paused = false; lastPhase = 'ready'; pickupToneTime = 0; pointer.seen = false;
    trialResultRecorded = false;
    runId = crypto.randomUUID();
    trackedRelayId = game.relays[0]?.id ?? null; trackedContractId = null; trackedEncounterId = null; renderer.trackedEncounterId = null; lastImpactTime = -1;
    renderer.camera.x = game.player.x; renderer.camera.y = game.player.y; renderDirty = true;
    impactPause = 0; lastBurstTone = -1; lastFieldTone = -1; reactorWasReady = false; phaseCoachSeen = false;
    runStats = { shots: weapons.map(() => 0), dashes: 0, perfectReloads: 0 };
    coachStep = 0; coachMoveDistance = 0; objectiveExpanded = false; updateObjectiveDetails();
    if (renderer.resetEffects) renderer.resetEffects();
    else { renderer.particles = []; renderer.rings = []; renderer.numbers = []; renderer.ghosts = []; renderer.shake = 0; }
    clearTimeout(hitTimer); clearTimeout(damageTimer); clearTimeout(bannerTimer); clearTimeout(notificationTimer);
    $('aim-reticle').classList.remove('hit', 'critical'); $('damage-flash').classList.remove('visible'); $('notification').classList.remove('visible'); $('event-banner').classList.add('hidden');
  }
  function restartRun() { if (game.siege) { rememberBest(); startSiege(game.siege.difficulty, game.siege.seed, game.siege.loadoutId); return; } if (game.salvage) { rememberBest(); startSalvage(game.salvage.difficulty, game.salvage.seed, game.salvage.loadoutId); return; } if (game.mode === 'voyage') { startVoyage(game.voyage.initialDeviceId || game.voyage.devices[0], game.voyage.difficulty, game.voyage.seed); return; } if (game.mode === 'trial') { startTrial(game.trial.seed); return; } rememberBest(); if (game.mode === 'campaign') { startCampaign(game.campaign.visited[0], game.campaign.doctrineId, game.campaign.seed); return; } resetRun(); startRun(); }
  function showUpgrade() {
    clearInput();
    const hasEvolution = game.upgradeChoices.some(upgrade => upgrade.evolution);
    showScreen('upgrade', '<div class="screen-kicker">GROWTH PROTOCOL / LEVEL ' + game.player.level + '</div><h2 id="screen-title">' + (hasEvolution ? '武器进化，改变战法。' : '让这次远征，有所不同。') + '</h2><p>' + (hasEvolution ? '进化条件已满足。本局只能进化一把；也可先选普通强化。战场已暂停。' : '选择一项本局持续生效的强化。战场已暂停。') + '</p><div class="upgrade-grid' + (hasEvolution ? ' evolution-choices' : '') + '">' + game.upgradeChoices.map((upgrade, i) => '<button class="upgrade-card ' + (upgrade.evolution ? 'evolution-card' : upgrade.weapon !== undefined ? 'weapon-mod' : '') + '" data-upgrade="' + upgrade.id + '"><small>' + (upgrade.evolution ? weapons[upgrade.weapon].shortName + ' · 进化 / 每局限一把' : upgrade.weapon !== undefined ? weapons[upgrade.weapon].shortName + ' · 武器改造' : '生长协议 · ' + (upgrade.stacks + 1) + ' / ' + upgrade.maxStacks) + '</small><span class="upgrade-icon">' + upgrade.icon + '</span><b>' + upgrade.title + '</b><p>' + upgrade.description + '</p><em>' + (upgrade.evolution ? '确认本局进化' : '选择强化') + ' · 按 ' + (i + 1) + ' ↗</em></button>').join('') + '</div>');
    $('screen-content').querySelectorAll('[data-upgrade]').forEach(button => bindMenuChoice(button, () => selectUpgrade(button.dataset.upgrade)));
  }
  function selectUpgrade(id) {
    const choice = game.upgradeChoices.find(upgrade => upgrade.id === id);
    if (!choice || !game.chooseUpgrade(id)) return;
    if (!choice.evolution) tone('upgrade'); processEvents();
    if (game.phase === 'upgrade') showUpgrade();
    else { lastPhase = 'playing'; closeScreen(); notify('强化 · ' + choice.title); }
  }
  function showRelics() {
    showScreen('relic', '<div class="screen-kicker">RELIC RECOVERED / 遗迹奖励</div><h2 id="screen-title">带走一件，改变打法。</h2><p>选择一件本局持续生效的遗物。战场已暂停，无需增加操作按键。</p><div class="upgrade-grid relic-grid">' + game.relicChoices.map((relic, i) => '<button class="upgrade-card weapon-mod" data-relic="' + relic.id + '"><small>战术遗物 · 本局唯一</small><span class="upgrade-icon">' + relic.icon + '</span><b>' + relic.title + '</b><p>' + relic.description + '</p><em>装备遗物 · 按 ' + (i + 1) + ' ↗</em></button>').join('') + '</div>');
    $('screen-content').querySelectorAll('[data-relic]').forEach(button => bindMenuChoice(button, () => selectRelic(button.dataset.relic)));
  }
  function selectRelic(id) {
    if (!game.chooseRelic(id)) return;
    processEvents(); lastPhase = game.phase;
    if (game.phase === 'upgrade') showUpgrade();
    else closeScreen();
  }
  function showResult() {
    if (game.siege) { showSiegeResult(); return; }
    if (game.mode === 'salvage') { showSalvageResult(); return; }
    if (game.mode === 'voyage') { showVoyageResult(); return; }
    if (game.mode === 'trial') { showTrialResult(); return; }
    if (game.mode === 'campaign') { showCampaignResult(); return; }
    const won = game.phase === 'won'; rememberBest();
    showScreen('result', '<div class="result-icon">' + (won ? '✳' : '◈') + '</div><div class="screen-kicker">' + (won ? 'THE SIGNAL IS HOME' : 'SIGNAL LOST / OPERATIVE 07') + '</div><h2 id="screen-title">' + (won ? '黎明，收到。' : '信号中断，火种还在。') + '</h2><p>' + (won ? '' + game.map.name + '的三项目标全部完成，' + game.map.boss.name + '已被击败。下一片战场等你探索。' : '这次远征暂时结束。根据致命伤来源，调整下一次的走位和技能时机。') + '</p><div class="result-grid"><div><strong>' + game.score + '</strong><small>远征得分</small></div><div><strong>' + game.kills + '</strong><small>击败敌人</small></div><div><strong>' + formatTime(game.elapsed) + '</strong><small>远征时间</small></div></div><p class="result-tip">主线 ' + game.completedRelays + '/3 · 等级 ' + game.player.level + ' · 个人最佳 ' + best + '</p><div class="menu-buttons"><button class="launch-button" id="play-again">再次远征 <b>↗</b></button><button class="secondary-button" id="back-welcome">返回营地</button></div>');
    $('play-again').addEventListener('click', restartRun);
    $('back-welcome').addEventListener('click', () => { resetRun(); welcome(); });
    const debrief = document.createElement('div'); debrief.className = 'debrief';
    debrief.innerHTML = '<span><b>' + game.combo.best + '</b> 最高连杀</span><span><b>' + game.reactor.detonations + '</b> 相位引爆</span><span><b>' + game.reactor.captures + '</b> 掠夺敌弹</span><span><b>' + runStats.perfectReloads + '</b> 精准装填</span>';
    $('screen-content').querySelector('.menu-buttons').before(debrief);
    if (!won && game.lastDamage) {
      const cause = document.createElement('section'); cause.className = 'result-cause';
      cause.innerHTML = '<small>致命伤来源</small><strong></strong><p></p>';
      cause.querySelector('strong').textContent = game.lastDamage.name + ' · 扣除 ' + game.lastDamage.healthLost + ' 点生命';
      cause.querySelector('p').textContent = game.lastDamage.hint;
      debrief.before(cause);
    }
    const relicDebrief = document.createElement('p'); relicDebrief.className = 'expedition-tip';
    relicDebrief.textContent = '支线完成 ' + game.contracts.filter(contract => contract.status === 'complete').length + '/3 · ' + (game.relics.length ? game.relics.map(id => Expedition.RELICS.find(relic => relic.id === id).title).join(' / ') : '本次未取得遗物');
    debrief.after(relicDebrief);
    addTacticSummary($('screen-content').querySelector('.menu-buttons'), true);
    addEvolutionSummary($('screen-content').querySelector('.menu-buttons'), true);
    addArchiveButton($('screen-content').querySelector('.menu-buttons'));
  }

  function updateReloadMeter() {
    const player = game.player;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const loading = player.reloadTimer > 0;
    const progress = player.reloadProgress ?? (loading ? 1 - player.reloadTimer / (weapons[player.weapon].reloadTime * player.reloadMultiplier) : 0);
    const start = player.reloadWindowStart ?? .52, end = player.reloadWindowEnd ?? .72;
    const available = loading && !player.reloadAttempted;
    $('active-reload').classList.toggle('hidden', !canPlay() || !loading);
    $('active-reload').classList.toggle('missed', player.reloadResult === 'miss');
    $('active-reload').classList.toggle('in-window', available && progress >= start && progress <= end);
    $('reload-window').style.left = start * 100 + '%'; $('reload-window').style.width = (end - start) * 100 + '%';
    $('reload-cursor').style.left = Math.min(1, Math.max(0, progress)) * 100 + '%';
    setText('active-reload-hint', player.reloadAttempted ? '继续装填 · 本轮已尝试' : progress > end ? '窗口已过 · 等待装填' : coarse ? '进入绿色区，再点装填' : '进入绿色区，再按 R');
    setText('active-reload-key', coarse ? '点装填' : 'R');
    setText('active-reload-title', game.tacticId === 'reload-mine' ? '精准装填 · 布雷' + (game.tactical.cooldown > 0 ? Math.ceil(game.tactical.cooldown) + 's' : '') : '精准装填');
  }

  function advanceCoach(eventType = '') {
    if (coachDismissed || game.mode === 'trial') return;
    if (coachStep === 0) {
      if (coachMoveDistance >= 60 && runStats.shots.some(count => count > 0)) coachStep = 1;
      return;
    }
    if (coachStep === 1 && eventType === 'dash') coachStep = 2;
    else if (coachStep === 2 && eventType === 'reload-perfect') coachStep = 3;
  }

  function updateObjectiveDetails() {
    const button = $('objective-toggle');
    button.setAttribute('aria-expanded', String(objectiveExpanded));
    button.textContent = objectiveExpanded ? '收起' : '详情';
    button.closest('.objective-hud').classList.toggle('collapsed', !objectiveExpanded);
    $('objective-details').classList.toggle('hidden', !objectiveExpanded);
  }

  function updateCoach() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const rift = game.encounters.find(item => ['active', 'ready'].includes(item.status) || (item.id === trackedEncounterId && item.status === 'idle'));
    const text = coachStep === 0 ? coarse ? '拖动左摇杆移动，再拖动右摇杆瞄准射击' : 'WASD 移动，鼠标瞄准并按住左键射击' : coachStep === 1 ? coarse ? '点冲刺避开攻击；掠过敌人可留下紫色印记' : 'Shift 冲刺避开攻击；掠过敌人可留下紫色印记' : coarse ? '点装填开始换弹，进入绿色区再点一次' : 'R 开始换弹，进入绿色区再按 R，完成精准装填';
    if (!coachDismissed && (coachStep === 3 || game.relays.some(relay => ['charging', 'active', 'complete'].includes(relay.status)) || game.salvage?.sources.some(source => ['drilling', 'open', 'collected'].includes(source.status) || source.quietTimer > 0))) { coachDismissed = true; profiles.recordCoach(); }
    $('field-coach').setAttribute('data-step', String(coachStep));
    $('field-coach').classList.toggle('hidden', Boolean(game.mode === 'trial' || coachDismissed || !canPlay() || (game.bossSpawned && !game.siege) || (rift && rift.status !== 'idle')));
    setText('coach-text', text);
  }

  function updateHUD() {
    hudDirty = false;
    const player = game.player, weapon = weapons[player.weapon];
    const campaign = game.campaign, doctrine = campaign ? Expedition.CAMPAIGN_DOCTRINES.find(item => item.id === campaign.doctrineId) : null;
    const crisis = campaign ? Expedition.CAMPAIGN_CRISES.find(item => item.id === campaign.crisisId) : null;
    const nexus = game.map.id === 'nexus', anchors = nexus ? game.enemies.filter(enemy => enemy.type === 'anchor' && enemy.hp > 0).length : 0;
    stage.classList.toggle('siege-mode', !!game.siege);
    stage.classList.toggle('campaign-final', nexus || !!game.siege);
    const evolution = Expedition.EVOLUTIONS.find(item => item.id === game.evolutionId);
    const weaponName = evolution?.weapon === player.weapon ? evolution.title : weapon.name;
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
    $('credits').parentElement.classList.toggle('hidden', game.mode === 'trial');
    document.querySelector('.mission-numbers .best').classList.toggle('hidden', game.mode === 'trial');
    setText('mission-state', activeRevelation ? '回响显现 · ' + (activeRevelation.revisited ? '重温领悟' : '首次领悟') : paused ? '行动暂停' : ({ ready: campaign ? '连续远征准备' : '远征准备', playing: game.mode === 'trial' ? '裂隙试炼 · 第 ' + game.trial.wave + ' 波' : campaign ? '远征 ' + campaign.stage + '/3 · ' + doctrine.title : '行动进行中', upgrade: '生长协议', relic: '遗迹奖励', 'trial-reward': '波间整备', 'campaign-rest': '战区肃清 · 安全整备', tactic: '裂隙回收 · 选择战术', won: campaign ? '连续远征完成' : '任务完成', lost: '信号中断' }[game.phase]));
    setText('player-level', player.level); setText('health-number', Math.ceil(player.hp) + ' / ' + player.maxHp);
    setText('health-label', player.slowTimer > 0 ? '冰缓 ' + player.slowTimer.toFixed(1) + 's' : campaign ? '生命 · ' + campaign.stage + '/3' : '生命');
    $('health-label').classList.toggle('slowed', player.slowTimer > 0);
    percentage('health-progress', player.hp / player.maxHp); $('health-progress').style.background = player.hp < player.maxHp * .3 ? '#ee8ca5' : '';
    setText('xp-label', '经验 ' + Math.floor(player.xp) + ' / ' + player.xpNeeded); percentage('xp-progress', player.xp / player.xpNeeded);
    setText('ammo-current', overdrive ? '∞' : String(player.ammo).padStart(2, '0')); setText('ammo-max', player.magSize); setText('weapon-name', overdrive ? weaponName + ' · 无限火力' : weaponName);
    const breachReady = game.evolutionState.breachTimer > 0 && player.weapon === 1 && player.reversalAmmo <= 0;
    $('weapon-name').classList.toggle('breach-ready', breachReady);
    if (breachReady) setText('weapon-name', '重弹\n' + game.evolutionState.breachTimer.toFixed(1) + 's');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    setText('reload-label', player.reloadTimer > 0 ? (player.reloadAttempted ? '装填中 ' : coarse ? '再点装填 · ' : '再按 R · ') + player.reloadTimer.toFixed(1) + 's' : player.overcharged ? '强化弹匣 +' + (game.campaign?.doctrineId === 'marksman' ? '50' : '15') + '%' : player.ammo === 0 ? coarse ? '点此装填' : '按 R 装填' : '装填弹药');
    setText('field-map-toggle', coarse ? '地图 ↗' : 'M · 战术地图 ↗');
    percentage('reload-progress', player.reloadTimer > 0 ? 1 - player.reloadTimer / (weapon.reloadTime * player.reloadMultiplier) : 0);
    $('ammo-current').style.color = player.ammo === 0 ? '#ee8ca5' : player.overcharged ? '#c3f076' : '';
    updateDashControl();
    const pulseCharging = game.awakeningState?.charge;
    const skillTarget = player.skillCooldown <= 0 || pulseCharging ? game.skillTarget?.() : null;
    setText('skill-label', pulseCharging ? '再按释放' : player.skillCooldown > 0 ? Math.ceil(player.skillCooldown) + 's' : campaign?.awakeningId === 'charged-pulse' ? '蓄势脉冲' : skillTarget?.remote ? '投送遥爆' : game.tacticId === 'gravity-pulse' ? '引力脉冲' : '脉冲震荡');
    $('skill-button').setAttribute('aria-label', pulseCharging ? '脉冲蓄能中，再按提前释放；蓄满自动强化释放' : campaign?.awakeningId === 'charged-pulse' ? '开始蓄能，0.9秒蓄满；再按提前释放' : skillTarget?.remote ? '投送到锁定榴弹；本次身边不释放脉冲' : game.tacticId === 'gravity-pulse' ? '引力脉冲，清除附近敌弹并聚拢普通敌人' : '脉冲震荡，清除附近敌弹');
    if (player.reversalAmmo > 0) setText('weapon-name', weaponName + ' · 逆流 ' + player.reversalAmmo);
    $('dash-cooldown').style.height = player.dashCooldown / player.dashCooldownMax * 100 + '%';
    $('skill-cooldown').style.height = (pulseCharging ? pulseCharging.remaining / pulseCharging.duration : player.skillCooldown / player.skillCooldownMax) * 100 + '%';
    const locked = !canPlay();
    $('skill-button').disabled = locked || (player.skillCooldown > 0 && !pulseCharging);
    $('reload-button').disabled = locked || (player.reloadTimer > 0 ? !!player.reloadAttempted : player.ammo === player.magSize);
    const weaponNotes = [player.arcRounds ? 'ϟ 电弧连锁' : '稳定 · 全距离', player.repulsorRounds ? '» 震荡击退' : '爆发 · 近距离', player.shatterRounds ? '✧ 命中裂解' : '贯穿 · 成群目标', '虚线爆点 · 范围清场', '去返 · 走位切割', '两钉成线 · 截击追兵'];
    document.querySelectorAll('[data-weapon]').forEach(button => {
      const index = Number(button.dataset.weapon), evolved = evolution?.weapon === index;
      button.classList.toggle('active', index === player.weapon); button.classList.toggle('evolved', evolved); button.disabled = locked;
      button.setAttribute('aria-pressed', index === player.weapon ? 'true' : 'false');
      button.setAttribute('aria-label', evolved ? evolution.title + '，' + evolution.playHint : weapons[index].name);
      button.title = evolved ? evolution.description : weapons[index].description;
      button.querySelector('span').textContent = evolved ? evolution.title : weapons[index].name;
      button.querySelector('small').textContent = evolved ? '✧ 已进化' : weaponNotes[index];
    });
    if (visibleWeapon !== player.weapon) { visibleWeapon = player.weapon; keepWeaponVisible(); }
    setText('relay-count', nexus ? '终章' : game.completedRelays + ' / 3'); setText('objective-text', game.currentObjective);
    setText('zone-label', game.map.name);
    let tracked = game.relays.find(relay => relay.id === trackedRelayId && !['active', 'locked'].includes(relay.status));
    if (!tracked) { tracked = game.relays.filter(relay => !['active', 'locked'].includes(relay.status)).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0]; trackedRelayId = tracked?.id ?? null; }
    renderer.trackedRelayId = trackedRelayId;
    const deliveryTarget = game.deliveryTarget?.(tracked);
    setText('tracked-target', deliveryTarget ? deliveryTarget.label + ' · ' + Math.round(Math.hypot(deliveryTarget.x - player.x, deliveryTarget.y - player.y) / 10) + ' m' : tracked ? (tracked.name.split(' · ')[1] || tracked.name) + ' · ' + Math.round(Math.hypot(tracked.x - player.x, tracked.y - player.y) / 10) + ' m' : nexus ? anchors ? '剩余能量锚 · ' + anchors + '/2' : '最终首领 · ' + game.map.boss.name : '主线完成 · 击败守卫');
    const contract = game.contracts.find(item => item.id === trackedContractId && item.status !== 'complete');
    if (!contract) trackedContractId = null;
    renderer.trackedContractId = trackedContractId;
    if (contract) {
      const target = game.contractTarget(contract);
      const action = contract.status === 'ready' ? '返回领奖' : contract.status === 'active' ? (contract.kind === 'salvage' ? '回收核心 ' : '清除目标 ') + contract.progress + '/' + contract.goal : '靠近终端接取';
      setText('objective-text', '支线 · ' + contract.name + ' · ' + action);
      setText('tracked-target', action + ' · ' + Math.round(Math.hypot(target.x - player.x, target.y - player.y) / 10) + ' m');
    }
    const activeEncounter = game.encounters.find(item => item.status === 'active');
    const encounter = game.encounters.find(item => item.id === trackedEncounterId && !['complete', 'failed'].includes(item.status));
    if (!encounter) trackedEncounterId = null;
    renderer.trackedEncounterId = encounter?.id ?? null;
    if (encounter) {
      const target = game.encounterTarget(encounter);
      const action = encounter.status === 'ready' ? '返回领奖' : encounter.status === 'active' ? encounter.kind === 'race' ? '追光节点 ' + Math.min(encounter.goal, encounter.progress + 1) : encounter.kind === 'rings' ? '活跃环 ' + (encounter.activeNode + 1) : '清除守卫' : encounter.name;
      setText('objective-text', encounter.name + ' · ' + encounterStatus(encounter));
      setText('tracked-target', action + ' · ' + Math.round(Math.hypot(target.x - player.x, target.y - player.y) / 10) + ' m');
    }
    const relayNames = game.relays.map((relay, index) => '0' + (index + 1) + ' ' + (relay.name.split(' · ')[1] || relay.name).slice(0, 4));
    [...$('relay-indicators').children].forEach((element, index) => { element.textContent = relayNames[index] || ''; element.classList.toggle('active', game.relays[index]?.status === 'active'); element.classList.toggle('charging', game.relays[index]?.status === 'charging'); });
    $('relay-indicators').classList.toggle('hidden', game.mode === 'trial' || game.mode === 'voyage' || game.mode === 'salvage' || game.map.id === 'nexus');
    const charging = game.relays.find(relay => relay.status === 'charging');
    $('relay-progress-wrap').classList.toggle('hidden', !charging);
    $('relay-progress-wrap').classList.toggle('delivery-progress', game.map.mode === 'delivery' && !activeEncounter);
    if (charging) {
      const inside = Math.hypot(player.x - charging.x, player.y - charging.y) <= charging.radius;
      let unsafe = game.map.mode !== 'demolition' && !inside;
      percentage('relay-progress', charging.progress);
      if (game.map.mode === 'delivery') {
        const carrying = game.delivery.carriedId != null;
        unsafe = false;
        setText('relay-progress-label', carrying ? '携带中 · 走速 88% · 可移动射击' : '星火已放下 · 回收后继续');
        setText('relay-wave-label', carrying ? '送至对应接收站 · 交互交付' : '放下的星火会保留，不会超时消失');
      } else if (game.map.mode === 'demolition') {
        const core = game.enemies.find(enemy => enemy.id === charging.reactorId);
        setText('relay-progress-label', '拆毁进度 ' + Math.floor(charging.progress * 100) + '%');
        setText('relay-wave-label', core ? '反应堆耐久 ' + Math.ceil(core.hp) + ' · 集中火力' : '反应堆已暴露');
      } else if (game.map.mode === 'escort') {
        setText('relay-progress-label', (inside ? '运输车前进 ' : '离车暂停 ') + Math.floor(charging.progress * 100) + '%');
        setText('relay-wave-label', '留在车旁光圈内 · 清除沿路敌群');
      } else if (game.map.mode === 'conduction') {
        const lightning = game.hazards.find(hazard => hazard.conductionRelayId === charging.id && hazard.remaining > 0);
        unsafe = lightning ? Math.hypot(player.x - lightning.x, player.y - lightning.y) <= lightning.radius + player.radius : !inside;
        const guidance = lightning ? (unsafe ? '撤出爆圈 ' : '已脱险 ') + lightning.remaining.toFixed(1) + 's' : (inside ? '等待锁雷 ' : '进圈引雷 ') + Math.max(0, game.sectorThreat.timer).toFixed(1) + 's';
        setText('relay-progress-label', '导雷 ' + charging.charges + '/' + charging.chargeGoal + ' · ' + guidance);
        setText('relay-wave-label', lightning ? lightning.capturedAtLock ? '落点已固定 · 等待落雷即可充能' : '落点偏离塔圈 · 下一轮重新引雷' : '塔圈内锁定落点后，走位或冲刺闪开');
      } else {
        setText('relay-progress-label', (inside ? '正在上传 ' : '离圈暂停 ') + Math.floor(charging.progress * 100) + '% · ' + Math.ceil((1 - charging.progress) * charging.duration) + 's');
        setText('relay-wave-label', '防守 ' + (charging.wave || 1) + '/3 · ' + (charging.waveName || '敌群接近'));
      }
      $('relay-progress-wrap').classList.toggle('outside', unsafe);
    }
    if (activeEncounter) {
      $('relay-progress-wrap').classList.remove('hidden', 'outside');
      percentage('relay-progress', activeEncounter.progress / activeEncounter.goal);
      setText('relay-progress-label', encounterStatus(activeEncounter));
      if (activeEncounter.kind === 'rings') {
        const ring = activeEncounter.nodes[activeEncounter.activeNode];
        const inside = Math.hypot(player.x - ring.x, player.y - ring.y) <= ring.radius;
        const switchIn = Math.max(.1, 4 - activeEncounter.elapsed % 4).toFixed(1);
        $('relay-progress-wrap').classList.toggle('outside', !inside);
        setText('relay-wave-label', (inside ? '校准中' : '移向亮环') + ' · ' + switchIn + 's 后换环');
        if (coarse) setText('relay-progress-label', Math.ceil(activeEncounter.remaining) + 's · ' + activeEncounter.progress.toFixed(1) + '/' + activeEncounter.goal + ' · 换环' + switchIn + 's');
      } else setText('relay-wave-label', activeEncounter.kind === 'race' ? '按编号触碰亮起的节点，路过即可收集' : '只需击败裂隙标记的守卫');
    }
    updateInteraction();
    const boss = game.enemies.find(enemy => enemy.type === 'boss'); $('boss-hud').classList.toggle('hidden', !boss);
    if (boss) {
      percentage('boss-progress', boss.hp / boss.maxHp); setText('boss-phase', 'PHASE 0' + (boss.stage || 1));
      setText('boss-name', boss.name || game.map.boss.name);
      $('boss-hud').style.setProperty('--boss-color', boss.color || game.map.boss.color);
      $('boss-hud').classList.toggle('winding', boss.windup > 0);
      $('boss-hud').classList.toggle('exposed', boss.recoveryTimer > 0 && !boss.shielded);
      setText('boss-tactic', boss.windup > 0 ? (boss.attackName || '攻击预警') + ' · ' + (boss.attackHint || '离开危险区域') : boss.shielded ? game.siege ? '拆炮 → EMP 接管 → 瞄准反击' : '锚点供能 · 首领减伤 65% · 先拆双锚' : boss.recoveryTimer > 0 ? '弱点暴露 · 趁现在集中火力' : nexus ? '双锚已断 · 全力攻击核心' : game.map.boss.subtitle);
    }
    const danger = game.hazards.filter(hazard => (hazard.owner === 'environment' || hazard.voyageHazard) && hazard.remaining > 0).sort((a, b) => a.remaining - b.remaining)[0];
    $('sector-status').classList.toggle('warning', !!danger);
    setText('sector-status', boss ? '终局作战 · 战区威胁已停止' : danger ? '⚠ ' + (danger.name || game.map.threat.name) + ' ' + danger.remaining.toFixed(1) + 's · ' + (danger.hint || '离开预警区') : crisis ? '危机 · ' + crisis.title + '：' + crisis.description : charging ? game.map.threat.name + ' · 留意地面预警' : '战区威胁 · ' + game.map.threat.name);
    $('sector-status').style.setProperty('--threat-color', danger?.color || game.map.color);
    if (game.mode === 'trial') {
      const trial = game.trial;
      setText('relay-count', trial.wave + ' / 6');
      setText('objective-text', trial.title);
      setText('tracked-target', trial.status === 'warning' ? '开波倒计时 · ' + Math.ceil(trial.countdown) + 's' : trial.status === 'combat' ? '剩余敌人 · ' + trial.remaining : trial.status === 'reward' ? '清场完成 · 选择整备' : '六波试炼完成');
      if (!danger && !boss) setText('sector-status', trial.briefing);
    }
    if (game.voyage) {
      const voyage = game.voyage, target = game.voyageTarget();
      stage.classList.toggle('voyage-final', voyage.node === 7);
      setText('relay-count', voyage.node + ' / 7');
      setText('mission-state', activeRevelation ? '回响显现' : paused ? '远航暂停' : game.phase === 'voyage-rest' ? '航段突破 · 安全整备' : game.phase === 'won' ? '七重星海已突破' : game.phase === 'lost' ? '远航信号中断' : game.phase === 'upgrade' ? '远航生长协议' : '远航 ' + voyage.node + '/7 · ' + (voyageObjectiveNames[voyage.room.type] || '终局'));
      setText('health-label', player.slowTimer > 0 ? '冰缓 ' + player.slowTimer.toFixed(1) + 's' : '生命 · ' + voyage.node + '/7');
      setText('objective-text', game.currentObjective);
      setText('tracked-target', target ? target.label + ' · ' + Math.round(Math.hypot(target.x - player.x, target.y - player.y) / 10) + ' m' : '航界吞星者 · 留意地面预警');
      if (!danger && !boss) setText('sector-status', target?.hint || game.map.briefing);
      if (boss && coarse) {
        const hints = { 'voyage-ring': '沿亮色缺口闪避', 'voyage-teleport': '远离虚线落点', 'voyage-collapse': '撤出锁定爆圈', 'voyage-lattice': '侧移离开光带', 'voyage-finale': '离光带，再撤出爆圈' };
        setText('boss-name', boss.windup > 0 ? (hints[boss.attackKind] || '离开预警区') : boss.recoveryTimer > 0 ? '弱点暴露 · 集火' : '航界吞星者');
        $('boss-hud').setAttribute('aria-label', '航界吞星者 · 阶段 ' + boss.stage + ' · ' + (boss.attackHint || game.map.boss.subtitle));
      }
      const action = game.voyageActionState();
      if (action.collapseReady) {
        $('skill-button').disabled = !canPlay(); $('skill-cooldown').style.height = '0%';
        setText('skill-label', '再点引爆 ' + action.remaining.toFixed(1) + 's');
        $('skill-button').setAttribute('aria-label', '潮汐共鸣已就绪，再按 Q 或点此引爆引力井，原脉冲冷却保留');
      }
    } else { stage.classList.remove('voyage-final'); $('boss-hud').removeAttribute('aria-label'); }
    stage.classList.toggle('salvage-run', !!game.salvage);
    if (game.salvage) {
      const salvage = game.salvage, target = game.salvageTarget(), evac = salvage.evac;
      const drill = salvage.sources.find(source => source.kind === 'drill' && source.status === 'drilling' && (source.id === target?.id || Math.hypot(source.x - player.x, source.y - player.y) <= source.workRadius));
      const exit = evac ? salvage.exits.find(item => item.id === evac.exitId) : null;
      const comms = salvage.comms.status === 'linking' ? salvage.comms : null, work = drill || comms;
      const inside = !!work && Math.hypot(work.x - player.x, work.y - player.y) <= work.workRadius;
      const boarding = salvage.status === 'boarding';
      setText('relay-count', '样本 ' + (salvage.carried || salvage.settled) + ' · ' + ['I', 'II', 'III', 'IV'][salvage.alertLevel - 1]);
      setText('objective-text', salvage.status === 'approaching' ? '接应 ' + evac.remaining.toFixed(1) + 's · 可继续作战' : boarding ? '登舰 ' + evac.progress.toFixed(1) + '/3s · 进圈推进' : work ? (drill ? '钻探 ' : '架设 ') + work.progress.toFixed(1) + '/' + work.duration + 's · ' + (inside ? '正在推进' : '离圈暂停') : target ? target.label + ' · ' + Math.round(Math.hypot(target.x - player.x, target.y - player.y) / 10) + ' m' : salvageStateText());
      setText('mission-state', activeRevelation ? '回响显现' : paused ? '回收暂停' : game.phase === 'upgrade' ? '回收生长协议' : game.phase === 'playing' ? '危险回收 · 警戒 ' + salvage.alertLevel : salvageStateText());
      setText('tracked-target', target?.hint || salvageStateText());
      if (!danger) setText('sector-status', '警戒 ' + salvage.alarm + '/100 · ' + (target?.hint || salvageStateText()));
      $('relay-progress-wrap').classList.toggle('hidden', !evac && !work);
      $('relay-progress-wrap').classList.toggle('outside', evac ? boarding && Math.hypot(exit.x - player.x, exit.y - player.y) > exit.radius : !!work && !inside);
      if (evac) {
        percentage('relay-progress', boarding ? evac.progress / evac.boardingDuration : (evac.duration - evac.remaining) / evac.duration);
        setText('relay-progress-label', salvageStateText()); setText('relay-wave-label', '接应固定在' + exit.name + ' · 不需要清空敌人');
        const chance = salvage.lastChance;
        if (chance?.status === 'available') {
          const offer = '箱 ' + Math.ceil(chance.remaining) + 's / +' + chance.value;
          if (!objectiveExpanded) setText('objective-text', (boarding ? '登舰 ' + evac.progress.toFixed(1) + '/3s' : '接应 ' + evac.remaining.toFixed(1) + 's') + ' · ' + offer);
          else setText('relay-progress-label', offer + ' · 取货追兵 ×2');
        }
      } else if (work) {
        percentage('relay-progress', work.progress / work.duration);
        setText('relay-progress-label', work.name + ' · ' + work.progress.toFixed(1) + '/' + work.duration + 's'); setText('relay-wave-label', drill ? '圈内累计推进 · 离圈保留进度' : (inside ? 'EMP 已消耗 · 拦截下一波增援' : '离圈暂停 · 进度保留'));
      }
    }
    if (game.siege) {
      const siege = game.siege, target = game.siegeTarget();
      const phaseName = boss?.stage === 3 ? '过载反扑' : boss?.shielded ? '武装狩猎' : '核心裸露';
      setText('relay-count', '阶段 ' + (boss?.stage || 1) + '/3');
      setText('objective-text', target ? target.label + ' · ' + Math.round(Math.hypot(target.x - player.x, target.y - player.y) / 10) + ' m' : phaseName);
      setText('tracked-target', target?.hint || game.map.briefing);
      setText('mission-state', activeRevelation ? '回响显现' : paused ? '猎场暂停' : game.phase === 'won' ? '巨械击破' : game.phase === 'lost' ? '狩猎中断' : phaseName);
      setText('sector-status', '拆炮 ' + siege.wrecks.length + '/3 · 接管 ' + siege.captures + ' · 反向 ' + siege.reflections);
      $('relay-progress-wrap').classList.add('hidden');
      $('skill-button').setAttribute('aria-label', 'EMP：接管附近炮座残骸，将范围内重弹朝准星改向，并清除普通敌弹');
      if (player.skillCooldown <= 0) setText('skill-label', '接管 / 反向');
    }
    $('relay-progress-label').classList.toggle('hidden', !objectiveExpanded && !!game.salvage && (!!game.salvage.evac || game.salvage.comms.status === 'linking'));
    $('pause-toggle').disabled = !!activeRevelation || !['playing'].includes(game.phase) || (!!screen && screen !== 'pause');
    $('pause-toggle').textContent = paused ? '▶' : 'Ⅱ'; $('pause-toggle').setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
    $('fullscreen-pause').disabled = $('pause-toggle').disabled;
    $('fullscreen-pause').textContent = paused ? '继续' : '暂停';
    $('help-toggle').disabled = !!activeRevelation || (!!screen && !['welcome', 'pause'].includes(screen));
    $('map-toggle').disabled = !!activeRevelation || !['ready', 'playing'].includes(game.phase) || (!!screen && !['welcome', 'pause', 'map'].includes(screen));
    $('field-map-toggle').disabled = $('map-toggle').disabled;
    updateCoach(); updateReloadMeter();
    if ($('minimap').getClientRects().length) renderer.drawMinimap($('minimap'), game);
  }

  function act(action) {
    if (!canPlay()) return;
    const result = action(); processEvents(); updateHUD(); if (!activeRevelation) canvas.focus({ preventScroll: true }); return result;
  }
  function interact() { act(() => { const result = game.interact(); if (!result) notify(game.interactionState().hint || '靠近补给箱、设施或终端后交互。'); return result; }); }
  function updateInteraction() {
    const state = canPlay() ? game.interactionState() : { action: '', hint: '' };
    const hint = $('interaction-hint'), key = hint.querySelector('kbd');
    hint.classList.toggle('hidden', !state.hint || (game.mode === 'voyage' && !state.action));
    hint.querySelector('span').textContent = state.hint.replace(/^E\s*·\s*/, '');
    key.classList.toggle('hidden', !state.action);
    key.textContent = window.matchMedia('(pointer: coarse)').matches ? '点按' : 'E';
    $('touch-interact').disabled = !state.action;
    setText('touch-interact', state.action || '交互');
    $('touch-interact').setAttribute('aria-label', state.action || state.hint || '附近没有可交互目标');
    const cargo = game.salvage?.hotCargo, carrying = cargo?.status === 'carried';
    const cargoControl = $('cargo-control'), stage = $('game-stage');
    if (window.matchMedia('(pointer: coarse) and (orientation: landscape)').matches) {
      if (cargoControl.parentElement !== stage) stage.append(cargoControl);
    } else if (cargoControl.parentElement === stage) document.querySelector('.objective-hud').append(cargoControl);
    $('cargo-control').classList.toggle('hidden', !carrying);
    $('cargo-drop').disabled = !carrying || !canPlay();
    if (carrying) {
      setText('cargo-status', '▣ +' + cargo.bonus + ' · 广播 ' + Math.ceil(cargo.pulseRemaining) + 's');
      $('cargo-drop').setAttribute('aria-label', '放下黑匣子：停止新广播并失去武器加成，已来的追兵不会消失');
    }
  }
  function dropCargo() { act(() => game.dropSalvageCargo()); }
  function keepWeaponVisible() {
    const bar = document.querySelector('.weapons-hud'), button = bar.querySelector('[data-weapon="' + game.player.weapon + '"]');
    if (!button || bar.scrollWidth <= bar.clientWidth) return;
    const rect = button.getBoundingClientRect(), bounds = bar.getBoundingClientRect();
    if (rect.left < bounds.left) bar.scrollLeft -= bounds.left - rect.left;
    else if (rect.right > bounds.right) bar.scrollLeft += rect.right - bounds.right;
  }
  function switchWeapon(index) { act(() => { if (game.switchWeapon(index)) tone('click'); }); }
  function movement() {
    return { x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touch.moveX, y: Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touch.moveY };
  }
  function requestDash() {
    if (!canPlay() || queuedDash) return false;
    const move = movement(), direction = move.x || move.y ? move : { ...game.moveVector };
    if (game.dash(direction)) return true;
    if (game.player.dashTimer > 0 || game.player.dashCooldown > dashBufferWindow) return false;
    queuedDash = { direction, remaining: dashBufferWindow };
    return true;
  }
  function updateDashBuffer(dt) {
    if (!queuedDash) return;
    if (!canPlay()) { queuedDash = null; return; }
    queuedDash.remaining -= dt;
    // Check readiness before expiry: this frame may have crossed the cooldown
    // boundary while the buffered press was still within its 120 ms window.
    if (game.player.dashCooldown <= 0 && game.player.dashTimer <= 0) {
      const direction = queuedDash.direction; queuedDash = null;
      game.dash(direction);
    } else if (queuedDash.remaining <= 0) queuedDash = null;
  }
  function updateDashControl() {
    const player = game.player;
    const returnAnchor = game.awakeningState?.returnAnchor;
    const canReturn = returnAnchor?.remaining > 0 && !game.awakeningState.returning && Math.hypot(player.x - returnAnchor.x, player.y - returnAnchor.y) >= 16;
    $('dash-button').disabled = !canPlay() || !!queuedDash || player.dashTimer > 0 || (player.dashCooldown > dashBufferWindow && !player.iceChaseReady && !canReturn);
    setText('dash-label', canReturn ? '折返 ' + returnAnchor.remaining.toFixed(1) + 's' : player.iceChaseReady ? '转向追击' : queuedDash ? '冲刺待发' : player.dashCooldown > 0 ? player.dashCooldown.toFixed(1) + 's' : game.tacticId === 'decoy-dash' ? game.tactical.cooldown <= 0 ? '诱饵冲刺' : '冲刺·诱饵' + Math.ceil(game.tactical.cooldown) + 's' : '相位冲刺');
    $('dash-button').setAttribute('aria-label', canReturn ? '折返跃迁，再按朝起点方向冲刺，距离不超过普通冲刺，岩石会阻挡' : game.tacticId === 'decoy-dash' ? game.tactical.cooldown > 0 ? '相位冲刺；诱饵还需 ' + Math.ceil(game.tactical.cooldown) + ' 秒可部署' : '相位冲刺并留下诱饵' : '相位冲刺');
  }
  FrontierTouch.bindTouchAction($('dash-button'), () => act(requestDash));
  FrontierTouch.bindTouchAction($('skill-button'), () => act(() => game.useSkill()));
  FrontierTouch.bindTouchAction($('reactor-button'), () => act(() => game.activateOverdrive()));
  FrontierTouch.bindTouchAction($('touch-overdrive'), () => act(() => game.activateOverdrive()));
  FrontierTouch.bindTouchAction($('reload-button'), () => act(() => game.reload()));
  FrontierTouch.bindTouchAction($('touch-interact'), interact);
  FrontierTouch.bindTouchAction($('cargo-drop'), dropCargo);
  document.querySelectorAll('[data-weapon]').forEach(button => FrontierTouch.bindTouchAction(button, () => switchWeapon(Number(button.dataset.weapon)), true));
  FrontierTouch.bindTouchAction($('pause-toggle'), () => screen === 'pause' ? resume() : pauseGame());
  FrontierTouch.bindTouchAction($('fullscreen-pause'), () => screen === 'pause' ? resume() : pauseGame());
  $('fullscreen-exit').addEventListener('click', () => display.exit());
  FrontierTouch.bindTouchAction($('help-toggle'), showHelp);
  $('sound-toggle').addEventListener('click', () => { sound = !sound; audio.setEnabled(sound); save('frontier-sound', sound ? 'on' : 'off'); updateSound(); if (sound) tone('click'); });
  FrontierTouch.bindTouchAction($('map-toggle'), () => screen === 'map' ? closeMap() : showMap());
  FrontierTouch.bindTouchAction($('field-map-toggle'), showMap);
  $('objective-toggle').addEventListener('click', () => { objectiveExpanded = !objectiveExpanded; updateObjectiveDetails(); });
  $('screen-content').addEventListener('pointerover', event => {
    const details = event.target.closest('.peek-details');
    if (!details || event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover)').matches || details.contains(event.relatedTarget)) return;
    details.open = true;
  });
  $('screen-content').addEventListener('pointerout', event => {
    const details = event.target.closest('.peek-details');
    if (!details || event.pointerType !== 'mouse' || details.contains(event.relatedTarget) || details.dataset.peekPinned) return;
    details.open = false;
  });
  $('screen-content').addEventListener('click', event => {
    const summary = event.target.closest('summary'), details = summary?.parentElement;
    if (!details?.classList.contains('peek-details')) return;
    event.preventDefault();
    if (details.dataset.peekPinned) { delete details.dataset.peekPinned; details.open = false; }
    else { details.dataset.peekPinned = 'true'; details.open = true; }
  });
  updateObjectiveDetails();
  $('coach-dismiss').addEventListener('click', () => { coachDismissed = true; profiles.recordCoach(); updateCoach(); canvas.focus({ preventScroll: true }); });
  $('fullscreen-toggle').addEventListener('click', () => display.toggle({ landscape: window.matchMedia('(pointer: coarse)').matches }));

  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const code = event.code;
    if (code === 'Escape' && screen && $('screen-content').querySelector('.peek-details[open]')) {
      const openDetails = [...$('screen-content').querySelectorAll('.peek-details[open]')];
      const focused = openDetails.find(details => details.contains(document.activeElement));
      openDetails.forEach(details => { details.open = false; delete details.dataset.peekPinned; });
      focused?.querySelector('summary').focus({ preventScroll: true });
      event.preventDefault(); return;
    }
    if (screen === 'account') {
      if (code === 'Escape') { event.preventDefault(); accountPanel.close(); }
      if (code === 'Tab') {
        const controls = [...$('screen-content').querySelectorAll('input:not(:disabled),button:not(:disabled)')];
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1]?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0]?.focus(); }
      }
      return;
    }
    if (activeRevelation) {
      if (code === 'Tab') { event.preventDefault(); $('revelation-overlay').querySelector(revelationReady ? 'button' : '.revelation-dialog').focus({ preventScroll: true }); }
      else if (['Enter', 'Space', 'Escape'].includes(code)) { event.preventDefault(); if (!event.repeat) continueRevelation(); }
      else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) event.preventDefault();
      return;
    }
    if (screen) {
      if (screen === 'map' && ['KeyM', 'Escape'].includes(code)) { event.preventDefault(); if (!event.repeat) closeMap(); return; }
      if (code === 'KeyM' && ['pause', 'welcome'].includes(screen)) { event.preventDefault(); if (!event.repeat) showMap(); return; }
      if (code === 'Tab') {
        const buttons = [...$('screen-content').querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(button => button.getClientRects().length && (!button.closest('details:not([open])') || button.tagName === 'SUMMARY')), first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (event.repeat) return;
      if (screen === 'upgrade' && /^Digit[123]$/.test(code)) { event.preventDefault(); const choice = game.upgradeChoices[Number(code.slice(-1)) - 1]; if (choice) selectUpgrade(choice.id); }
      else if (screen === 'tactic' && /^Digit[123]$/.test(code)) { event.preventDefault(); const choice = game.tacticChoices[Number(code.slice(-1)) - 1]; if (choice) selectTactic(choice.id); }
      else if (screen === 'trial-reward' && /^Digit[123]$/.test(code)) { event.preventDefault(); const choice = game.trial.choices[Number(code.slice(-1)) - 1]; if (choice) selectTrialReward(choice.id); }
      else if (screen === 'relic' && /^Digit[123]$/.test(code)) { event.preventDefault(); const choice = game.relicChoices[Number(code.slice(-1)) - 1]; if (choice) selectRelic(choice.id); }
      else if ((code === 'Escape' || code === 'KeyP') && screen === 'pause') { event.preventDefault(); resume(); }
      else if (code === 'Escape' && screen === 'help') { event.preventDefault(); returnFromHelp(); }
      else if (code === 'Escape' && screen === 'secrets') { event.preventDefault(); closeSecrets(); }
      else if (code === 'Escape' && screen === 'trial-intro') { event.preventDefault(); welcome(); }
      else if (code === 'Escape' && screen === 'voyage-intro') { event.preventDefault(); welcome(); }
      else if (code === 'Escape' && screen === 'salvage-intro') { event.preventDefault(); welcome(); }
      else if (code === 'Escape' && screen === 'voyage-resonance') { event.preventDefault(); $('continue-voyage-resonance').click(); }
      else if (code === 'Escape' && screen === 'campaign-intro') { event.preventDefault(); welcome(); }
      else if (code === 'Escape' && screen === 'campaign-awakening') { event.preventDefault(); $('continue-awakening').click(); }
      else if (code === 'Escape' && screen === 'campaign-exit') { event.preventDefault(); $('keep-campaign').click(); }
      else if (code === 'Escape' && screen === 'rift-guide') { event.preventDefault(); returnFromRiftGuide(); }
      else if (code === 'Escape' && screen === 'evolution-guide') { event.preventDefault(); returnFromEvolutionGuide(); }
      else if (code === 'Escape' && screen === 'battlefield') { event.preventDefault(); $('close-battlefield').click(); }
      else if (code === 'Escape' && screen === 'restart') { event.preventDefault(); showPause(); }
      return;
    }
    if (event.target.closest('button,a,input,textarea,select') && ['Space', 'Enter'].includes(code)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) { event.preventDefault(); if (canPlay()) keys.add(code); }
    else if (!event.repeat) {
      if (code === 'KeyP' || code === 'Escape') { event.preventDefault(); pauseGame(); }
      else if (code === 'KeyM' || code === 'Tab') { event.preventDefault(); showMap(); }
      else if (canPlay()) {
        if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') { event.preventDefault(); act(requestDash); }
        else if (code === 'KeyR') { event.preventDefault(); act(() => game.reload()); }
        else if (code === 'KeyQ') { event.preventDefault(); act(() => game.useSkill()); }
        else if (code === 'KeyF') { event.preventDefault(); act(() => game.activateOverdrive()); }
        else if (code === 'KeyE') { event.preventDefault(); interact(); }
        else if (code === 'KeyG') { event.preventDefault(); dropCargo(); }
        else if (/^Digit[123456]$/.test(code)) { event.preventDefault(); switchWeapon(Number(code.slice(-1)) - 1); }
      }
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  function pointerPosition(event) {
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.seen = true; pointer.dirty = true;
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
      else {
        // Radial dead zone: ignore thumb jitter, then smoothly reach full speed.
        const length = Math.min(1, magnitude);
        const strength = length > .15 ? (length - .15) / (.85 * length) : 0;
        touch.moveX = dx * strength; touch.moveY = dy * strength;
      }
    };
    stick.addEventListener('pointerdown', event => { if (activePointer !== null || !canPlay()) return; event.preventDefault(); activePointer = event.pointerId; stick.setPointerCapture(activePointer); move(event); });
    stick.addEventListener('pointermove', move);
    const reset = () => {
      const previous = activePointer; activePointer = null;
      stick.querySelector('i').style.transform = '';
      if (aiming) touch.shoot = false; else { touch.moveX = 0; touch.moveY = 0; }
      if (previous !== null && stick.hasPointerCapture(previous)) stick.releasePointerCapture(previous);
    };
    stickResets.push(reset);
    const stop = event => { if (event.pointerId === activePointer) reset(); };
    stick.addEventListener('pointerup', stop); stick.addEventListener('pointercancel', stop); stick.addEventListener('lostpointercapture', stop);
  }
  bindStick('move-stick', false); bindStick('aim-stick', true);
  window.addEventListener('blur', () => { clearInput(); if (canPlay()) pauseGame(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInput(); if (canPlay()) pauseGame(); }
    else if (accountIdentity) profiles.sync();
  });
  window.addEventListener('pagehide', rememberBest);
  window.addEventListener('scroll', () => { pointer.dirty = true; }, { passive: true, capture: true });
  document.addEventListener('fullscreenchange', () => { renderer.resize(); renderDirty = hudDirty = pointer.dirty = true; });
  new ResizeObserver(() => { renderer.resize(); keepWeaponVisible(); renderDirty = hudDirty = pointer.dirty = true; if (screen === 'map') renderer.drawMinimap($('tactical-map'), game, { detailed: true }); }).observe(stage);
  motionPreference.addEventListener('change', event => { if (read('frontier-motion') === null) renderer.reducedMotion = event.matches; });

  function frame(timestamp) {
    const dt = Math.min(.05, (timestamp - (lastTimestamp || timestamp)) / 1000); lastTimestamp = timestamp;
    let simulationDt = 0;
    // Coalesce pointer events into one DOM update per frame. Measure fresh bounds
    // here so scrolling and layout changes cannot leave a stale aim offset.
    if (pointer.dirty && pointer.seen) {
      const rect = stage.getBoundingClientRect();
      $('aim-reticle').style.left = pointer.x - rect.left - stage.clientLeft + 'px';
      $('aim-reticle').style.top = pointer.y - rect.top - stage.clientTop + 'px';
      pointer.dirty = false;
    }
    if (canPlay()) {
      const move = movement();
      const coachStart = !coachDismissed && coachStep === 0 && (move.x || move.y) && game.player.dashTimer <= 0 ? { x: game.player.x, y: game.player.y } : null;
      let aim = pointer.seen ? renderer.screenToWorld(pointer.x, pointer.y) : { x: game.player.x + Math.cos(game.player.angle) * 150, y: game.player.y + Math.sin(game.player.angle) * 150 };
      if (touch.shoot) aim = { x: game.player.x + touch.aimX * 300, y: game.player.y + touch.aimY * 300 };
      const heldTime = renderer.reducedMotion ? 0 : Math.min(dt, impactPause);
      impactPause = Math.max(0, impactPause - dt);
      simulationDt = dt - heldTime;
      game.update(simulationDt, { moveX: move.x, moveY: move.y, aimX: aim.x, aimY: aim.y, shoot: pointer.down || pointer.shotQueued || touch.shoot });
      if (coachStart && game.player.dashTimer <= 0) {
        coachMoveDistance = Math.min(60, coachMoveDistance + Math.hypot(game.player.x - coachStart.x, game.player.y - coachStart.y));
        advanceCoach();
      }
      updateDashBuffer(simulationDt);
      if (dt > heldTime) pointer.shotQueued = false;
      processEvents();
    }
    if (game.phase !== lastPhase) {
      lastPhase = game.phase;
      if (game.phase === 'upgrade') showUpgrade();
      else if (game.phase === 'relic') showRelics();
      else if (game.phase === 'trial-reward') showTrialReward();
      else if (game.phase === 'campaign-rest') showCampaignRest();
      else if (game.phase === 'voyage-rest') showVoyageRest();
      else if (game.phase === 'tactic') showTactics();
      else if (['won', 'lost'].includes(game.phase)) showResult();
    }
    if (canPlay() || renderDirty) {
      renderer.render(game, canPlay() ? simulationDt : 0);
      renderDirty = false;
    }
    if (canPlay() && game.player.reloadTimer > 0) updateReloadMeter();
    if (canPlay()) updateDashControl();
    $('aim-reticle').style.opacity = pointer.inside && canPlay() ? '1' : '0';
    uiTimer += dt; if (uiTimer > .09 && (canPlay() || hudDirty)) { updateHUD(); uiTimer = 0; }
    updateMusic();
    requestAnimationFrame(frame);
  }
  function reconcileSession() {
    if (deferredSession === undefined || accountTransition || accountPanel.busy || restoringSession) return;
    const identity = deferredSession; deferredSession = undefined;
    if ((identity?.uid || null) === (accountIdentity?.uid || null)) return;
    accountTransition = true;
    applyAccountSession(identity).finally(() => {
      accountTransition = false; accountPanel.host = null; welcome(); notify('登录状态已变更，已安全返回营地并切换独立档案。'); reconcileSession();
    });
  }
  const display = new FrontierDisplay({ stage, onChange: updateDisplay, onBeforeChange: () => { clearInput(); if (canPlay()) pauseGame(); } });
  const accountPanel = new FrontierAccountPanel({ store: profiles, cloud: FrontierCloud, getIdentity: () => accountIdentity,
    onIdentity: async identity => { accountTransition = true; try { await applyAccountSession(identity); } finally { accountTransition = false; } }, onClose: welcome, onSettled: reconcileSession });
  profileReady = true;
  let restoringSession = true;
  FrontierCloud.onSession(identity => {
    // A missing initial session may mean offline/expired credentials: preserve
    // the named cache until the player logs in or explicitly signs out.
    if (restoringSession && !identity) return;
    deferredSession = identity; reconcileSession();
  });
  FrontierCloud.init().then(async identity => {
    if (identity) { deferredSession = identity; if (identity.uid === accountIdentity?.uid) await profiles.sync(); }
  }).catch(() => { updateAccountEntry(); }).finally(() => { restoringSession = false; reconcileSession(); });
  window.addEventListener('online', () => { if (accountIdentity) profiles.sync(); });
  window.addEventListener('storage', event => {
    if (event.key === 'frontier-account-v1') {
      // The auth SDK remains authoritative; a local storage value cannot log in.
      FrontierCloud.getSession().then(identity => {
        deferredSession = identity; reconcileSession();
      }).catch(() => {});
    } else profiles.refreshFromStorage?.();
  });
  renderer.camera.x = game.player.x; renderer.camera.y = game.player.y;
  updateSound(); welcome(); renderer.resize(); requestAnimationFrame(frame);
})();
