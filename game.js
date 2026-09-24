(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const game = new StarGame.Game();
  const plants = {
    sun: { name: '日光芽', description: '单体追踪 · 稳定输出', color: '#edbd75' },
    frost: { name: '霜铃草', description: '冰霜减速 · 控制虫群', color: '#8ad7d7' },
    bloom: { name: '爆米花', description: '花火绽放 · 范围伤害', color: '#e8a5bc' }
  };
  const effects = [];
  const tileVisuals = new Map();
  const upgradeNames = [];
  let paused = false;
  let modal = '';
  let lastPhase = '';
  let lastTime = 0;
  let time = 0;
  let width = 960;
  let height = 660;
  let scale = 1.38;
  let toastTimer;
  let soundEnabled = readStorage('starsprout-sound') === 'on';
  let best = Number(readStorage('starsprout-best')) || 0;
  let audio;
  let lastShotSound = 0;
  let uiElapsed = 0;
  let focusBeforeModal = null;
  let returnToPause = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function readStorage(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function saveStorage(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* Private browsing can disable storage. */ } }
  function playTone(kind) {
    if (!soundEnabled) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      if (kind === 'shot' && time - lastShotSound < 0.18) return;
      if (kind === 'shot') lastShotSound = time;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const settings = { move: [240, 390, .07, .025], merge: [440, 880, .22, .065], shot: [530, 220, .07, .012], pulse: [110, 44, .5, .13], damage: [100, 50, .15, .045], upgrade: [500, 950, .3, .055] }[kind] || [660, 900, .3, .05];
      oscillator.type = kind === 'pulse' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(settings[0], audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(settings[1], audio.currentTime + settings[2]);
      gain.gain.setValueAtTime(settings[3], audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + settings[2]);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + settings[2]);
    } catch (_) { soundEnabled = false; updateSoundButton(); }
  }

  function circle(x, y, radius, fill, stroke, lineWidth) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }
  function rounded(x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function line(x1, y1, x2, y2, color, thickness) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = thickness || 1; ctx.stroke();
  }
  function leaf(x, y, angle, color, length = 15) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-length, -length, 0, -length * 1.65);
    ctx.quadraticCurveTo(length, -length, 0, 0); ctx.fillStyle = color; ctx.fill();
    line(0, 0, 0, -length * 1.2, '#d8edb033', 1); ctx.restore();
  }

  // All plants, creatures, terrain and effects are drawn here; no external image assets.
  function drawPlant(context, type, x, y, size, level, clock, firing = 0) {
    context.save(); context.translate(x, y); context.scale(size, size);
    const sway = reducedMotion ? 0 : Math.sin(clock * 2 + x * .07) * .05;
    context.rotate(sway);
    context.fillStyle = '#060f1055'; context.beginPath(); context.ellipse(0, 14, 18, 6, 0, 0, Math.PI * 2); context.fill();
    context.lineWidth = 4; context.strokeStyle = type === 'frost' ? '#528b7d' : '#789658';
    context.beginPath(); context.moveTo(0, 14); context.quadraticCurveTo(-3, 4, 0, -4); context.stroke();
    for (const side of [-1, 1]) {
      context.save(); context.translate(0, 10); context.rotate(side * .8);
      context.fillStyle = type === 'frost' ? '#669e8d' : '#7f9f55';
      context.beginPath(); context.ellipse(side * 5, -3, 5, 11, side * .5, 0, Math.PI * 2); context.fill(); context.restore();
    }
    context.shadowColor = plants[type].color; context.shadowBlur = firing > 0 ? 20 : 7;
    if (type === 'sun') {
      for (let n = 0; n < 8; n++) {
        context.save(); context.translate(0, -9); context.rotate(n * Math.PI / 4 + clock * .07);
        context.fillStyle = n % 2 ? '#e8a664' : '#f4c57b';
        context.beginPath(); context.ellipse(0, -11, 4.4, 8, 0, 0, Math.PI * 2); context.fill(); context.restore();
      }
      context.fillStyle = '#6b5030'; context.beginPath(); context.arc(0, -9, 9, 0, Math.PI * 2); context.fill();
      context.shadowBlur = 0; context.fillStyle = '#ffe3a3';
      context.beginPath(); context.arc(-3, -11, 2, 0, Math.PI * 2); context.arc(4, -11, 2, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#e4b679'; context.lineWidth = 1; context.beginPath(); context.arc(1, -8, 3, 0, Math.PI); context.stroke();
    } else if (type === 'frost') {
      context.save(); context.translate(0, -10);
      for (let n = 0; n < 6; n++) {
        context.save(); context.rotate(n * Math.PI / 3);
        context.fillStyle = n % 2 ? '#76bcc4' : '#a1e0dc';
        context.beginPath(); context.moveTo(0, -21); context.lineTo(6, -6); context.lineTo(0, 1); context.lineTo(-6, -6); context.closePath(); context.fill(); context.restore();
      }
      context.fillStyle = '#e7ffff'; context.beginPath(); context.arc(0, 0, 5, 0, Math.PI * 2); context.fill(); context.restore();
    } else {
      for (let n = 0; n < 5; n++) {
        const angle = n * Math.PI * 2 / 5 - Math.PI / 2;
        context.fillStyle = n % 2 ? '#cd8da9' : '#e8a9c0';
        context.beginPath(); context.arc(Math.cos(angle) * 10, -11 + Math.sin(angle) * 10, 7.5, 0, Math.PI * 2); context.fill();
      }
      context.fillStyle = '#f9e6b0'; context.beginPath(); context.arc(0, -11, 6, 0, Math.PI * 2); context.fill();
      context.shadowBlur = 0; context.fillStyle = '#84515e'; context.beginPath(); context.arc(-2, -12, 1.5, 0, Math.PI * 2); context.arc(2.5, -12, 1.5, 0, Math.PI * 2); context.fill();
    }
    context.shadowBlur = 0;
    if (level > 1) {
      context.fillStyle = '#dfedb4';
      for (let n = 0; n < Math.min(4, level - 1); n++) { context.beginPath(); context.arc((n - (level - 2) / 2) * 5, -36, 1.6, 0, Math.PI * 2); context.fill(); }
    }
    context.restore();
  }

  const scenery = Array.from({ length: 64 }, (_, i) => {
    const angle = i * 2.399963;
    const radius = 186 + ((i * 43) % 203);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * .76, angle, size: 2 + i % 4 };
  });

  function drawBackground() {
    ctx.fillStyle = '#121f1c'; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width / 2, height / 2, 15, width / 2, height / 2, width * .55);
    glow.addColorStop(0, '#36422a99'); glow.addColorStop(.5, '#213c2c44'); glow.addColorStop(1, '#101c1900');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    for (let x = 22; x < width; x += 27) for (let y = 20; y < height; y += 27) {
      ctx.fillStyle = '#71886c16'; ctx.fillRect(x, y, 1.2, 1.2);
    }
    ctx.save(); ctx.translate(width / 2, height / 2 - 6); ctx.scale(scale, scale);
    ctx.save(); ctx.scale(1, .78);
    circle(0, 0, 233, '#2c3b2933', '#41553855');
    circle(0, 0, 220, null, '#53604355');
    ctx.setLineDash([2, 8]); circle(0, 0, 255, null, '#81957322'); ctx.setLineDash([]);
    ctx.restore();
    // Traces of an old orbital greenhouse around the cultivated square.
    for (const item of scenery) {
      ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.angle);
      if (item.size < 5) {
        ctx.fillStyle = '#53754d44'; ctx.beginPath(); ctx.ellipse(0, 0, item.size * 2, item.size, .3, 0, Math.PI * 2); ctx.fill();
        line(-3, 1, 3, 0, '#79936644');
      } else {
        leaf(0, 0, .6, '#50694466', 5); leaf(0, 0, -.6, '#71815d44', 4);
      }
      ctx.restore();
    }
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 2);
      line(0, 161, 0, 209, '#5b715b44');
      circle(0, 216, 3, '#8d9f6544');
      ctx.strokeStyle = '#78905f66'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-9, 178); ctx.lineTo(0, 185); ctx.lineTo(9, 178); ctx.stroke();
      ctx.restore();
    }
    rounded(-139, -139, 278, 278, 18, '#111c1788', '#62754766');
    rounded(-133, -133, 266, 266, 13, '#28352699', '#c4d49711');
    for (let i = 0; i < 16; i++) {
      const x = (i % 4 - 1.5) * 64;
      const y = (Math.floor(i / 4) - 1.5) * 64;
      rounded(x - 29, y - 29, 58, 58, 7, game.board[i] ? '#3d513580' : '#26352688', game.board[i] ? '#92a66e88' : '#687a4e66');
      if (!game.board[i]) { line(x - 3, y, x + 3, y, '#5b6d4b55'); line(x, y - 3, x, y + 3, '#5b6d4b55'); }
    }
    const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 2) * .12;
    ctx.shadowColor = '#dcffc1'; ctx.shadowBlur = 20;
    circle(0, 0, 7 * pulse, '#dcffc1'); ctx.shadowBlur = 0;
    circle(0, 0, 12, null, '#d5f5a644');
    ctx.restore();
  }

  function drawEnemy(enemy) {
    ctx.save(); ctx.translate(enemy.x, enemy.y);
    const boss = enemy.type === 'boss';
    const r = enemy.radius || (boss ? 23 : 9);
    const direction = Math.atan2(-enemy.y, -enemy.x);
    const frozen = enemy.slowTimer > 0 || enemy.slowUntil > game.waveElapsed;
    const body = boss ? '#9c5c81' : enemy.type === 'tank' ? '#857999' : '#b9818c';
    const legs = reducedMotion ? 0 : Math.sin(time * 14 + enemy.id) * 2.5;
    circle(0, 3, r + 3, '#090e1655');
    ctx.rotate(direction);
    for (const side of [-1, 1]) {
      for (let n = -1; n <= 1; n++) {
        ctx.beginPath(); ctx.moveTo(n * r * .5, side * r * .5); ctx.lineTo(n * r * .8 + legs, side * r * 1.25); ctx.lineTo(n * r - 3, side * r * 1.4);
        ctx.strokeStyle = frozen ? '#81cad1' : '#936d8b'; ctx.lineWidth = boss ? 3 : 1.5; ctx.stroke();
      }
    }
    ctx.fillStyle = frozen ? '#6da6b3' : body;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * .78, 0, 0, Math.PI * 2); ctx.fill();
    line(-r * .6, 0, r * .5, 0, '#e9b4d766', 1.3);
    circle(r * .65, -r * .35, boss ? 3 : 2, '#ffe6c4'); circle(r * .65, r * .35, boss ? 3 : 2, '#ffe6c4');
    if (boss) { ctx.strokeStyle = '#ecacc8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * .7, -r * .6); ctx.lineTo(r * 1.4, -r); ctx.moveTo(r * .7, r * .6); ctx.lineTo(r * 1.4, r); ctx.stroke(); }
    ctx.rotate(-direction);
    if (enemy.hp < enemy.maxHp || boss) {
      rounded(-r, -r - 9, r * 2, 3, 1.5, '#4a3649');
      rounded(-r, -r - 9, r * 2 * Math.max(0, enemy.hp / enemy.maxHp), 3, 1.5, boss ? '#ecacd2' : '#b3c391');
    }
    ctx.restore();
  }

  function render(dt) {
    drawBackground();
    ctx.save(); ctx.translate(width / 2, height / 2 - 6); ctx.scale(scale, scale);
    const livingIds = new Set();
    for (let i = 0; i < 16; i++) {
      const tile = game.board[i]; if (!tile) continue;
      livingIds.add(tile.id);
      const tx = (i % 4 - 1.5) * 64;
      const ty = (Math.floor(i / 4) - 1.5) * 64;
      let visual = tileVisuals.get(tile.id);
      if (!visual) { visual = { x: tx, y: ty, appear: 0 }; tileVisuals.set(tile.id, visual); }
      const ease = reducedMotion ? 1 : Math.min(1, dt * 17);
      visual.x += (tx - visual.x) * ease; visual.y += (ty - visual.y) * ease;
      visual.appear = Math.min(1, visual.appear + dt * 6);
      const s = reducedMotion ? 1 : .55 + visual.appear * .45;
      drawPlant(ctx, tile.type, visual.x, visual.y - 1, s * (.78 + tile.level * .07), tile.level, time);
      ctx.font = '7px Consolas, monospace'; ctx.fillStyle = '#b1c395'; ctx.textAlign = 'right'; ctx.fillText('0' + tile.level, visual.x + 22, visual.y + 23);
    }
    for (const id of tileVisuals.keys()) if (!livingIds.has(id)) tileVisuals.delete(id);
    for (const enemy of game.enemies) drawEnemy(enemy);
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i]; effect.age += dt;
      const t = effect.age / effect.duration;
      if (t >= 1) { effects.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - t;
      if (effect.kind === 'beam') {
        line(effect.from.x, effect.from.y - 11, effect.to.x, effect.to.y, effect.color, 2.5 * (1 - t) + .5);
        circle(effect.to.x, effect.to.y, 4 + t * 6, effect.color);
      } else if (effect.kind === 'ring') {
        circle(effect.x, effect.y, effect.radius * t, null, effect.color, 2 * (1 - t) + .4);
      } else if (effect.kind === 'particle') {
        circle(effect.x + effect.vx * effect.age, effect.y + effect.vy * effect.age + effect.age * effect.age * 20, effect.size * (1 - t), effect.color);
      } else if (effect.kind === 'text') {
        ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = effect.color;
        ctx.fillText(effect.text, effect.x, effect.y - effect.age * 26);
      }
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  function burst(x, y, color, count = 9) {
    if (reducedMotion) count = 3;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * i / count + Math.random() * .3;
      const speed = 15 + Math.random() * 35;
      effects.push({ kind: 'particle', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 1.5 + Math.random() * 2, color, age: 0, duration: .5 + Math.random() * .3 });
    }
  }
  function consumeEvents() {
    for (const event of game.drainEvents()) {
      if (event.type === 'shot') {
        effects.push({ kind: 'beam', from: event.from, to: event.to, color: plants[event.towerType].color, age: 0, duration: event.towerType === 'frost' ? .25 : .16 }); playTone('shot');
      } else if (event.type === 'merge') {
        burst(event.x, event.y, plants[event.towerType].color, 14);
        effects.push({ kind: 'ring', x: event.x, y: event.y, radius: 45, color: plants[event.towerType].color, age: 0, duration: .5 });
        effects.push({ kind: 'text', text: '合成 Lv.' + event.level, x: event.x, y: event.y - 30, color: '#def7b9', age: 0, duration: .95 }); playTone('merge');
      } else if (event.type === 'splash') effects.push({ kind: 'ring', x: event.x, y: event.y, radius: event.radius, color: '#e8a5bc', age: 0, duration: .35 });
      else if (event.type === 'kill') burst(event.x, event.y, '#d3b083', 6);
      else if (event.type === 'pulse') { effects.push({ kind: 'ring', x: 0, y: 0, radius: 440, color: '#d1f9a2', age: 0, duration: .8 }); burst(0, 0, '#d1f9a2', 26); playTone('pulse'); }
      else if (event.type === 'damage') { burst(0, 0, '#e29a9f', 12); effects.push({ kind: 'text', text: '−' + Math.round(event.amount), x: 0, y: -10, color: '#ef9ea2', age: 0, duration: .8 }); playTone('damage'); }
      else if (event.type === 'wave-start') toast('守夜开始 · 植物会自动攻击，空格释放共鸣');
    }
    if (effects.length > 400) effects.splice(0, effects.length - 400);
  }

  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600);
  }

  function updateUI() {
    const phase = game.phase;
    const battle = phase === 'wave';
    $('score').textContent = game.score;
    $('health-value').innerHTML = Math.ceil(Math.max(0, game.health)) + '<span> / ' + game.maxHealth + '</span>';
    $('health-fill').style.width = Math.max(0, game.health / game.maxHealth * 100) + '%';
    $('health-fill').style.background = game.health / game.maxHealth < .3 ? '#e8a0a5' : '';
    $('best-score').textContent = String(Math.max(best, game.score)).padStart(4, '0');
    $('wave-title').textContent = 'WAVE ' + String(game.wave).padStart(2, '0') + ' / 06';
    $('phase-label').textContent = paused ? '已暂停' : ({ build: '准备阶段', wave: '怪潮来袭', upgrade: '守夜成功', won: '天亮了', lost: '星核熄灭' }[phase]);
    $('phase-tag').classList.toggle('battle', battle && !paused);
    $('arena-status').textContent = battle ? '虫群 ' + game.enemies.length + ' · 待到达 ' + game.spawnRemaining : (phase === 'build' ? '等待部署' : '花园休整');
    $('action-label').textContent = battle ? '本轮怪潮' : '本轮培育';
    $('action-tip').textContent = battle ? '已击退 ' + game.kills + ' 只虫子' : (game.movesLeft > 0 ? '还可以滑动 ' + game.movesLeft + ' 次' : '培育完成，开始守夜吧');
    const dots = battle ? Math.ceil(5 * (1 - Math.min(1, game.waveElapsed / game.waveDuration))) : game.movesLeft;
    $('move-dots').innerHTML = Array.from({ length: 5 }, (_, i) => '<i class="' + (i >= dots ? 'used' : '') + '"></i>').join('');
    $('board-hint').classList.toggle('hidden', phase !== 'build');
    const next = plants[game.nextSeed.type];
    $('next-name').textContent = next.name; $('next-description').textContent = next.description;
    const preview = $('seed-preview').getContext('2d'); preview.clearRect(0, 0, 140, 130); drawPlant(preview, game.nextSeed.type, 70, 70, 1.7, 1, time);
    document.querySelectorAll('[data-dir]').forEach(button => { button.disabled = phase !== 'build' || game.movesLeft <= 0 || paused || !!modal; });
    const primary = $('primary-action'); primary.classList.toggle('battle-button', battle);
    primary.querySelector('span').textContent = battle ? (game.pulseCooldown > 0 ? '共鸣 ' + Math.ceil(game.pulseCooldown) + 's' : '释放共鸣') : '开始守夜';
    primary.querySelector('b').textContent = battle ? '◎' : '↗';
    primary.disabled = paused || !!modal || !['build', 'wave'].includes(phase) || (battle && game.pulseCooldown > 0);
    $('cooldown-fill').style.width = Math.max(0, 1 - game.pulseCooldown / 12) * 100 + '%';
    $('pulse-status').textContent = battle ? (game.pulseCooldown > 0 ? Math.ceil(game.pulseCooldown) + ' 秒后再次共鸣' : '共鸣就绪 · 按空格或点击释放') : '等待怪潮 · 每 12 秒可用';
    $('pause').textContent = paused ? '▶' : 'Ⅱ'; $('pause').setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
    $('pause').disabled = ['won', 'lost', 'upgrade'].includes(phase) || (modal && modal !== 'pause');
    document.querySelectorAll('[data-wave]').forEach(item => { const wave = Number(item.dataset.wave); item.classList.toggle('active', wave === game.wave); item.classList.toggle('complete', wave < game.wave || phase === 'won'); });
    if (phase !== lastPhase) {
      lastPhase = phase; $('announcement').textContent = $('phase-label').textContent + '，第 ' + game.wave + ' 波。';
      if (phase === 'upgrade') showUpgrade();
      if (phase === 'won' || phase === 'lost') showResult();
    }
  }

  function showModal(kind, content) {
    if (!modal) focusBeforeModal = document.activeElement;
    modal = kind; $('modal-card').innerHTML = content; $('overlay').classList.remove('hidden');
    const first = $('modal-card').querySelector('button'); if (first) first.focus({ preventScroll: true });
  }
  function hideModal() {
    modal = ''; $('overlay').classList.add('hidden');
    if (focusBeforeModal && typeof focusBeforeModal.focus === 'function') focusBeforeModal.focus({ preventScroll: true });
  }
  function showUpgrade() {
    playTone('upgrade');
    const cards = game.upgradeChoices.map((choice, i) => '<button class="upgrade-choice" data-upgrade="' + choice.id + '"><span class="choice-icon">' + (choice.icon || ['✦', '◷', '♡'][i]) + '</span><strong>' + choice.title + '</strong><small>' + choice.description + '</small><em>选择这份成长 ↗</em></button>').join('');
    showModal('upgrade', '<div class="modal-eyebrow">ANOTHER NIGHT, ANOTHER GROWTH</div><h2 id="overlay-title">花园，又长大了一点。</h2><p>第 ' + game.wave + ' 波已守住。选择一项强化，迎接下一场守夜。</p><div class="upgrade-choices">' + cards + '</div>');
    $('modal-card').querySelectorAll('[data-upgrade]').forEach(button => button.addEventListener('click', () => {
      const choice = game.upgradeChoices.find(item => item.id === button.dataset.upgrade);
      if (!game.chooseUpgrade(choice.id)) return;
      upgradeNames.push(choice.title); $('upgrade-count').textContent = String(upgradeNames.length).padStart(2, '0');
      $('upgrade-list').innerHTML = upgradeNames.map(name => '<span class="upgrade-badge">✧ ' + name + '</span>').join('');
      hideModal(); consumeEvents(); updateUI();
    }));
  }
  function showResult() {
    const won = game.phase === 'won';
    if (game.score > best) { best = game.score; saveStorage('starsprout-best', String(best)); }
    showModal('result', '<div class="result-icon">' + (won ? '✳' : '☾') + '</div><div class="modal-eyebrow">' + (won ? 'YOU BROUGHT THE MORNING' : 'EVERY SEED IS A NEW BEGINNING') + '</div><h2 id="overlay-title">' + (won ? '看，天亮了。' : '明晚，再种一座花园。') + '</h2><p>' + (won ? '六场怪潮已退去。你守住了这颗小小星球。' : '星核暂时熄灭了。试着合成更高等级，并用共鸣守住最后一道防线。') + '</p><div class="result-score">' + game.score + '</div><div class="result-stats">守至第 ' + game.wave + ' 波 · 击退 ' + game.kills + ' 只虫子 · 最佳 ' + best + '</div><button class="primary-button" id="play-again">再种一次 <b>↗</b></button>');
    $('play-again').addEventListener('click', restart);
  }
  function showHelp() {
    if (modal && modal !== 'pause') return;
    returnToPause = paused;
    paused = true;
    showModal('help', '<div class="modal-eyebrow">A SMALL GUIDE TO A LONG NIGHT</div><h2 id="overlay-title">第一晚，从一颗种子开始。</h2><div class="help-steps"><p><b>01 / 培育</b>方向键、WASD 或滑动棋盘。相同种类、相同等级的植物相碰就会升级，最高 Lv.5。</p><p><b>02 / 布阵</b>每次有效滑动会长出一颗预告种子。每波有 5 次机会；也可以提前开始守夜。</p><p><b>03 / 守护</b>点击「开始守夜」，植物自动攻击。日光芽直击、霜铃草减速、爆米花范围伤害。</p><p><b>04 / 共鸣</b>怪潮中按空格或点击「释放共鸣」击退敌人，每 12 秒恢复。波间选择强化，守过 6 波就获胜。</p></div><button class="primary-button" id="close-help">知道了，去种花 <b>↗</b></button>');
    $('close-help').addEventListener('click', closeUtilityModal); updateUI();
  }
  function closeUtilityModal() {
    paused = false; hideModal();
    if (returnToPause) togglePause();
    returnToPause = false;
    updateUI();
  }
  function togglePause() {
    if (['won', 'lost', 'upgrade'].includes(game.phase) || (modal && modal !== 'pause')) return;
    paused = !paused;
    if (paused) {
      showModal('pause', '<div class="modal-eyebrow">TAKE YOUR TIME</div><h2 id="overlay-title">让夜晚，等你一会儿。</h2><p>花园已暂停。你的植物和星核都在原地等你。</p><button class="primary-button" id="resume">继续守夜 <b>↗</b></button>');
      $('resume').addEventListener('click', togglePause);
    } else hideModal();
    updateUI();
  }
  function restart() {
    if (game.score > best) { best = game.score; saveStorage('starsprout-best', String(best)); }
    game.reset(); effects.length = 0; tileVisuals.clear(); upgradeNames.length = 0;
    paused = false; lastPhase = ''; hideModal();
    $('upgrade-count').textContent = '00'; $('upgrade-list').innerHTML = '<p class="empty-note">每次守住怪潮，都有新的成长。</p>';
    updateUI(); toast('新的种子已经种下，试着向上滑动合成日光芽');
  }
  function askRestart() {
    if (modal && modal !== 'pause') return;
    returnToPause = paused;
    paused = true;
    showModal('restart', '<div class="modal-eyebrow">A FRESH START</div><h2 id="overlay-title">重新种下这座花园？</h2><p>本局进度会重置，已获得的最高分会保留。</p><button class="primary-button" id="confirm-restart">重新开始 <b>↗</b></button><button class="small-button" id="cancel-restart" style="width:auto;margin:14px auto 0;display:block">继续当前游戏</button>');
    $('confirm-restart').addEventListener('click', restart);
    $('cancel-restart').addEventListener('click', closeUtilityModal); updateUI();
  }
  function move(direction) {
    if (paused || modal) return;
    if (game.phase !== 'build') { toast('守夜时植物自动战斗，下一轮准备再调整阵型'); return; }
    if (game.movesLeft <= 0) { toast('本轮培育完成，点击「开始守夜」'); return; }
    if (!game.move(direction)) toast('这个方向无法移动，试试其他方向');
    else playTone('move');
    consumeEvents(); updateUI();
  }
  function primaryAction() {
    if (paused || modal) return;
    if (game.phase === 'build') game.startWave();
    else if (game.phase === 'wave') game.pulse();
    consumeEvents(); updateUI();
  }
  function updateSoundButton() { $('sound').querySelector('span').textContent = soundEnabled ? '音效开' : '音效关'; $('sound').setAttribute('aria-label', soundEnabled ? '关闭音效' : '开启音效'); }

  document.querySelectorAll('[data-dir]').forEach(button => button.addEventListener('click', () => move(button.dataset.dir)));
  $('primary-action').addEventListener('click', primaryAction);
  $('pause').addEventListener('click', togglePause); $('help').addEventListener('click', showHelp); $('restart').addEventListener('click', askRestart);
  $('sound').addEventListener('click', () => { soundEnabled = !soundEnabled; saveStorage('starsprout-sound', soundEnabled ? 'on' : 'off'); updateSoundButton(); if (soundEnabled) playTone('merge'); });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const directions = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down' };
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (modal) {
      if (key === 'Escape' && ['help', 'restart'].includes(modal)) closeUtilityModal();
      else if (key === 'Escape' && modal === 'pause' && !event.repeat) togglePause();
      else if (key === 'p' && modal === 'pause' && !event.repeat) togglePause();
      else if (key === 'Tab') {
        const buttons = [...$('modal-card').querySelectorAll('button')]; const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (directions[key]) { event.preventDefault(); if (!event.repeat) move(directions[key]); }
    else if (key === ' ' && game.phase === 'wave' && !event.target.closest('button,a,input,textarea,select')) { event.preventDefault(); if (!event.repeat) primaryAction(); }
    else if (key === 'p' || key === 'Escape') { event.preventDefault(); if (!event.repeat) togglePause(); }
  });
  let pointerStart = null;
  canvas.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointerup', event => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y; pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.phase === 'wave' && !paused && !modal) togglePause(); });
  window.addEventListener('pagehide', () => { if (game.score > best) saveStorage('starsprout-best', String(game.score)); });
  function resize() {
    const rect = $('arena').getBoundingClientRect();
    width = 960; height = 960 * rect.height / rect.width;
    scale = rect.width < 500 ? 1.55 : 1.38;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  }
  new ResizeObserver(resize).observe($('arena'));
  function frame(now) {
    const dt = Math.min(.05, (now - (lastTime || now)) / 1000); lastTime = now;
    if (!paused) { time += dt; game.update(dt); consumeEvents(); }
    render(paused ? 0 : dt);
    uiElapsed += dt;
    if (uiElapsed >= .1 || lastPhase !== game.phase) { updateUI(); uiElapsed = 0; }
    requestAnimationFrame(frame);
  }
  updateSoundButton(); resize(); updateUI(); requestAnimationFrame(frame);
  setTimeout(() => toast('试着向上滑动，让两颗日光芽合成升级'), 700);
})();
