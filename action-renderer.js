/* Original procedural artwork: no textures, fonts, or network requests. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const colors = { cyan: '#71e8ed', amber: '#ffd784', pink: '#fd729d', green: '#a5e9a3' };

  function path(ctx, points, close = true) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    if (close) ctx.closePath();
  }

  function polygon(ctx, x, y, radius, sides, rotation = 0) {
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = rotation + i * TAU / sides;
      points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
    }
    path(ctx, points);
  }

  function circle(ctx, x, y, radius, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  function box(ctx, x, y, w, h, radius, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  function random(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  class ExpeditionRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.camera = { x: 1600, y: 1200 };
      this.width = 1;
      this.height = 1;
      this.scale = 1;
      this.dpr = 1;
      this.time = 0;
      this.reducedMotion = false;
      this.particles = [];
      this.rings = [];
      this.numbers = [];
      this.ghosts = [];
      this.muzzles = [];
      this.arcs = [];
      this.scars = [];
      this.hazardEchoes = [];
      this.hitFlashes = new Map();
      this.recoil = 0;
      this.playerHit = 0;
      this.dashTrailTimer = 0;
      this.trackedRelayId = null;
      this.targetRelay = null;
      this.terrainLayer = null;
      this.mapId = 'frontier';
      this.terrainKey = '';
      this.pointerHud = null;
      this.pointerHudTime = -1;
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.overdrive = false;
      this.overdriveProgress = 0;
      this.world = { width: 3200, height: 2400 };
      this.lastPlayer = null;
      this.spawn = null;
      this.lastPosition = null;
      this.playerMoving = false;
      this.makeTerrain();
      this.resize();
    }

    makeTerrain() {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 192;
      const ctx = tile.getContext('2d');
      const rng = random(72417);
      const foundry = this.mapId === 'foundry', frost = this.mapId === 'frost';
      ctx.fillStyle = foundry ? '#292d32' : frost ? '#2d4b5b' : '#293b36';
      ctx.fillRect(0, 0, 192, 192);
      for (let i = 0; i < 850; i++) {
        const shade = rng() > 0.52 ? frost ? 'rgba(196,236,255,.09)' : 'rgba(189,202,155,.055)' : 'rgba(0,9,14,.05)';
        ctx.fillStyle = shade;
        ctx.fillRect(rng() * 192, rng() * 192, rng() * 9 + 1, rng() * 5 + 1);
      }
      for (let i = 0; i < 45; i++) {
        const x = rng() * 192, y = rng() * 192;
        ctx.strokeStyle = foundry ? 'rgba(122,145,152,.12)' : frost ? 'rgba(175,220,242,.2)' : 'rgba(154,170,109,.23)';
        ctx.lineWidth = 1;
        path(ctx, [[x, y], [x - 2, y - 4], [x + 1, y - 2], [x + 3, y - 6]], false);
        ctx.stroke();
      }
      if (foundry) {
        for (let y = 0; y < 192; y += 96) for (let x = 0; x < 192; x += 96) {
          box(ctx, x + 2, y + 2, 92, 92, 3, null, '#3c454a');
          for (const dx of [8, 88]) for (const dy of [8, 88]) circle(ctx, x + dx, y + dy, 1.5, '#667176');
          ctx.strokeStyle = '#1f272c'; ctx.lineWidth = 2;
          path(ctx, [[x + 18, y + 81], [x + 77, y + 81]], false); ctx.stroke();
        }
      }
      this.groundPattern = this.ctx.createPattern(tile, 'repeat');
      this.decor = [];
      for (let i = 0; i < 310; i++) {
        this.decor.push({ x: rng() * this.world.width, y: rng() * this.world.height, size: 5 + rng() * 19,
          angle: rng() * TAU, kind: i % 11 === 0 ? 'ruin' : i % 4 === 0 ? 'shrub' : 'gravel', seed: rng() });
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, rect.width || this.canvas.clientWidth || 1200);
      this.height = Math.max(1, rect.height || this.canvas.clientHeight || 680);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.scale = clamp(this.width / 1190, 0.65, 1.1);
      this.pointerHudTime = -1;
    }

    screenToWorld(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - this.width / 2 - this.shakeX) / this.scale + this.camera.x,
        y: (clientY - rect.top - this.height / 2 - this.shakeY) / this.scale + this.camera.y
      };
    }

    visible(x, y, radius = 70) {
      if (this.paintingTerrain) return true;
      return Math.abs(x - this.camera.x) < this.width / this.scale / 2 + radius &&
        Math.abs(y - this.camera.y) < this.height / this.scale / 2 + radius;
    }

    consume(events = []) {
      for (const event of events) {
        const x = Number(event.x), y = Number(event.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const angle = event.angle ?? Math.atan2(event.dy || 0, event.dx || 1);
        switch (event.type) {
          case 'shot': {
            const enemy = event.owner === 'enemy', weapon = event.weapon || 0;
            const reactor = !enemy && (event.reactor || this.overdrive);
            const c = enemy ? event.color || colors.pink : reactor ? '#ffe6a2' : event.overcharged ? '#efffbc' : weapon === 4 ? '#96eaff' : weapon === 3 ? '#ffb37e' : weapon === 2 ? '#c6b5ff' : weapon === 1 ? colors.amber : '#98f6db';
            const muzzleX = x + Math.cos(angle) * (enemy ? 24 : 35) - Math.sin(angle) * (enemy ? 0 : 8);
            const muzzleY = y + Math.sin(angle) * (enemy ? 24 : 35) + Math.cos(angle) * (enemy ? 0 : 8);
            this.muzzles.push({ x: muzzleX, y: muzzleY, angle, weapon, color: c, age: 0, life: enemy ? 0.1 : weapon >= 3 ? .13 : 0.065, enemy, overcharged: event.overcharged, reactor });
            this.burst(muzzleX, muzzleY, c, enemy ? 3 : weapon === 1 ? 8 : 4, weapon === 1 ? 155 : 105, 0.2, angle);
            if (!enemy) this.recoil = Math.max(this.recoil, weapon === 0 ? 3.5 : 7);
            break;
          }
          case 'hit':
            this.burst(x, y, event.color || colors.amber, event.critical ? 9 : 5, 112, 0.25);
            if (event.enemyId != null || event.targetId != null) this.hitFlashes.set(event.enemyId ?? event.targetId, 0.12);
            if (event.amount) this.numbers.push({ x: x + (Math.random() - 0.5) * 12, y: y - 14,
              text: `${Math.round(event.amount)}${event.critical ? '!' : ''}`, age: 0, life: event.critical ? 0.85 : 0.62,
              color: event.critical ? '#fff1af' : event.color || '#f6e8b7', critical: event.critical });
            break;
          case 'kill':
            this.burst(x, y, event.enemyType === 'reactor' ? '#ffbe80' : '#df79a5', event.enemyType === 'boss' || event.enemyType === 'reactor' ? 38 : 11, 135, 0.6);
            this.rings.push({ x, y, radius: event.enemyType === 'boss' ? 230 : 33, age: 0, life: 0.4, color: event.enemyType === 'boss' ? this.bossColor || '#d96a99' : '#d96a99' });
            this.shake = Math.max(this.shake, event.enemyType === 'boss' ? 9 : 1.1);
            this.scars.push({ x, y, angle, radius: event.radius || (event.enemyType === 'boss' ? 65 : event.enemyType === 'tank' ? 31 : 20), age: 0, life: 32, seed: Math.random() });
            break;
          case 'damage':
            this.burst(x, y, '#ffac99', 12, 120, 0.4);
            this.shake = Math.max(this.shake, 5.5);
            this.playerHit = 0.16;
            if (event.amount) this.numbers.push({ x, y: y - 27, text: `−${Math.round(event.amount)}`, age: 0, life: 0.9, color: '#ffa99c' });
            break;
          case 'dash':
            if (!this.reducedMotion) this.ghosts.push({ x, y, angle, age: 0, life: 0.26 });
            this.burst(x, y, colors.cyan, 10, 105, 0.35, angle + Math.PI);
            break;
          case 'phase-mark':
            this.rings.push({ x, y, radius: 42, age: 0, life: 0.32, color: '#baa6ff', phase: true });
            this.burst(x, y, '#aaf8f0', 5, 75, 0.32);
            break;
          case 'phase-burst': {
            const radius = event.radius || 125, color = event.color || '#ac9dff';
            this.rings.push({ x, y, radius, age: 0, life: 0.42, color, phase: true, fill: true });
            this.rings.push({ x, y, radius: radius * 0.8, age: -0.045, life: 0.36, color: '#c6fff4' });
            this.burst(x, y, '#b4fff1', this.reducedMotion ? 7 : 18, 245, 0.48);
            if (!this.reducedMotion) {
              const rotation = Math.random() * TAU;
              for (let i = 0; i < 4; i++) {
                const a = rotation + i * TAU / 4, cos = Math.cos(a), sin = Math.sin(a);
                const bend = 11 * (i % 2 ? 1 : -1);
                this.arcs.push({ points: [[x, y], [x + cos * radius * .38 - sin * bend, y + sin * radius * .38 + cos * bend],
                  [x + cos * radius * .65 + sin * bend, y + sin * radius * .65 - cos * bend], [x + cos * radius, y + sin * radius]],
                  color, age: 0, life: .22 });
              }
            }
            this.shake = Math.max(this.shake, event.chain > 0 ? 2.8 : 4.4);
            if (!event.chain) this.numbers.push({ x, y: y - 36, text: '相位引爆', age: 0, life: .8, color: '#c8fff0', label: true });
            break;
          }
          case 'phase-capture': {
            this.burst(x, y, '#ffdfa1', 4, 65, .3);
            const player = this.lastPlayer;
            if (player && !this.reducedMotion) this.arcs.push({ points: [[x, y], [(x + player.x) / 2, (y + player.y) / 2 - 9], [player.x, player.y]], color: '#ffdc91', age: 0, life: .16 });
            break;
          }
          case 'overdrive-start':
            this.rings.push({ x, y, radius: 165, age: 0, life: .7, color: '#ffe5a0', phase: true });
            this.rings.push({ x, y, radius: 125, age: -.08, life: .65, color: '#86fff0' });
            this.burst(x, y, '#ffe6a9', 28, 170, .8);
            this.numbers.push({ x, y: y - 50, text: '星核 · 暴走', age: 0, life: 1.35, color: '#ffebac', label: true });
            this.shake = Math.max(this.shake, 4.5);
            break;
          case 'overdrive-end':
            this.rings.push({ x, y, radius: 45, age: 0, life: .45, color: '#89dfdc' });
            break;
          case 'combo':
            if (event.count >= 5 && event.count % 5 === 0) this.numbers.push({ x, y: y - 45, text: `${event.count} 连破`, age: 0, life: 1.05, color: '#ffe3a3', label: true });
            break;
          case 'pulse':
            this.rings.push({ x, y, radius: event.radius || 235, age: 0, life: 0.7, color: colors.cyan });
            this.rings.push({ x, y, radius: (event.radius || 235) * 0.8, age: -0.13, life: 0.55, color: '#e5fcdf' });
            this.burst(x, y, colors.cyan, 26, 230, 0.62);
            this.shake = Math.max(this.shake, 4);
            break;
          case 'relay-complete': case 'win':
            this.rings.push({ x, y, radius: 280, age: 0, life: 1.6, color: colors.green });
            this.burst(x, y, colors.green, 32, 180, 1.2);
            break;
          case 'boss-spawn':
            this.rings.push({ x, y, radius: 230, age: 0, life: 1.4, color: event.color || this.bossColor || colors.pink });
            this.shake = Math.max(this.shake, 7);
            break;
          case 'boss-phase':
            this.rings.push({ x, y, radius: 155, age: 0, life: 0.85, color: event.color || this.bossColor || '#ffadcc' });
            this.burst(x, y, event.color || this.bossColor || '#ffd0d8', 22, 160, 0.65);
            this.shake = Math.max(this.shake, 5);
            break;
          case 'boss-ring':
            this.rings.push({ x, y, radius: event.radius || 80, age: 0, life: 0.3, color: '#ffa9c1' });
            break;
          case 'reload-complete':
            if (event.perfect) {
              this.rings.push({ x, y, radius: 40, age: 0, life: 0.45, color: '#e2ffc0' });
              this.burst(x, y, '#ddffad', 7, 65, 0.4);
            }
            break;
          case 'interact': case 'upgrade': case 'relay-start':
            this.rings.push({ x, y, radius: 62, age: 0, life: 0.8, color: colors.amber });
            this.burst(x, y, colors.amber, 12, 85, 0.65);
            break;
          case 'pickup':
            this.burst(x, y, '#bbf6d2', 3, 35, 0.25);
            break;
          case 'arc':
            if (Number.isFinite(event.toX) && Number.isFinite(event.toY)) {
              const dx = event.toX - x, dy = event.toY - y, distance = Math.max(1, Math.hypot(dx, dy));
              const points = [[x, y]];
              for (let i = 1; i < 5; i++) {
                const offset = (Math.random() - 0.5) * 26;
                points.push([x + dx * i / 5 - dy / distance * offset, y + dy * i / 5 + dx / distance * offset]);
              }
              points.push([event.toX, event.toY]);
              this.arcs.push({ points, color: event.color || '#a7ebff', age: 0, life: 0.18 });
            }
            break;
          case 'explosion':
            this.rings.push({ x, y, radius: event.radius || 85, age: 0, life: 0.5, color: event.color || '#ffcf93', fill: true });
            this.burst(x, y, event.color || '#ffd5a0', 22, 210, 0.52);
            this.shake = Math.max(this.shake, 3.5);
            break;
          case 'grenade-burst':
            this.rings.push({ x, y, radius: event.radius || 135, age: 0, life: .54, color: event.color || '#ffb074', fill: true });
            this.rings.push({ x, y, radius: (event.radius || 135) * .62, age: 0, life: .35, color: '#fff1ba' });
            this.burst(x, y, '#ffd58a', 24, 260, .64);
            this.burst(x, y, '#ac775b', 10, 145, .82);
            this.shake = Math.max(this.shake, 4.2);
            break;
          case 'hazard-burst':
            this.hazardEchoes.push({ ...event, type: event.hazardType || 'blast', resolved: true, age: 0, life: .3 });
            if (event.hazardType === 'ring') {
              const distance = ((event.innerRadius || 0) + (event.radius || 85)) / 2;
              for (let i = 0; i < 4; i++) this.burst(x + Math.cos(i * TAU / 4) * distance, y + Math.sin(i * TAU / 4) * distance, event.color || '#ffcb9d', 3, 50, .3);
            } else this.burst(x, y, event.color || '#ffcb9d', 10, 110, .35);
            break;
        }
      }
      if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
      if (this.numbers.length > 50) this.numbers.splice(0, this.numbers.length - 50);
      if (this.rings.length > 20) this.rings.splice(0, this.rings.length - 20);
      if (this.ghosts.length > 20) this.ghosts.splice(0, this.ghosts.length - 20);
      if (this.muzzles.length > 24) this.muzzles.splice(0, this.muzzles.length - 24);
      if (this.arcs.length > 20) this.arcs.splice(0, this.arcs.length - 20);
      if (this.scars.length > 65) this.scars.splice(0, this.scars.length - 65);
      if (this.hazardEchoes.length > 12) this.hazardEchoes.splice(0, this.hazardEchoes.length - 12);
    }

    resetEffects() {
      this.particles.length = this.rings.length = this.numbers.length = this.ghosts.length = 0;
      this.muzzles.length = this.arcs.length = this.scars.length = 0;
      this.hazardEchoes.length = 0;
      this.hitFlashes.clear();
      this.recoil = this.playerHit = this.dashTrailTimer = this.shake = this.shakeX = this.shakeY = 0;
    }

    burst(x, y, color, count, speed, life, angle) {
      count = Math.min(this.reducedMotion ? Math.ceil(count * .4) : count, Math.max(0, 420 - this.particles.length));
      for (let i = 0; i < count; i++) {
        const a = angle === undefined ? Math.random() * TAU : angle + (Math.random() - 0.5) * 1.8;
        const s = (0.25 + Math.random() * 0.75) * speed;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          age: 0, life: life * (0.6 + Math.random() * 0.4), color, size: 1.3 + Math.random() * 2.4 });
      }
    }

    updateEffects(dt) {
      for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-dt * 3); p.vy *= Math.exp(-dt * 3); }
      for (const p of this.rings) p.age += dt;
      for (const p of this.numbers) { p.age += dt; p.y -= dt * (this.reducedMotion ? 12 : p.label ? 22 : 31); }
      for (const p of this.ghosts) p.age += dt;
      for (const p of this.muzzles) p.age += dt;
      for (const p of this.arcs) p.age += dt;
      for (const p of this.scars) p.age += dt;
      for (const p of this.hazardEchoes) p.age += dt;
      for (const [id, life] of this.hitFlashes) {
        if (life <= dt) this.hitFlashes.delete(id); else this.hitFlashes.set(id, life - dt);
      }
      this.particles = this.particles.filter(p => p.age < p.life);
      this.rings = this.rings.filter(p => p.age < p.life);
      this.numbers = this.numbers.filter(p => p.age < p.life);
      this.ghosts = this.ghosts.filter(p => p.age < p.life);
      this.muzzles = this.muzzles.filter(p => p.age < p.life);
      this.arcs = this.arcs.filter(p => p.age < p.life);
      this.scars = this.scars.filter(p => p.age < p.life);
      this.hazardEchoes = this.hazardEchoes.filter(p => p.age < p.life);
      this.recoil *= Math.exp(-dt * 22);
      this.playerHit = Math.max(0, this.playerHit - dt);
      this.shake *= Math.exp(-dt * 12);
      this.shakeX = this.reducedMotion ? 0 : Math.sin(this.time * 109) * this.shake;
      this.shakeY = this.reducedMotion ? 0 : Math.sin(this.time * 137 + 1) * this.shake * 0.7;
    }

    render(game, dt = 1 / 60) {
      if (!game?.player) return;
      dt = Math.min(Math.max(dt, 0), 0.08);
      this.time += dt;
      this.world = game.world || this.world;
      this.bossColor = game.map?.boss?.color || colors.pink;
      const terrainKey = `${game.map?.id || 'frontier'}:${this.world.width}:${this.world.height}`;
      if (terrainKey !== this.terrainKey) {
        this.mapId = game.map?.id || 'frontier'; this.terrainKey = terrainKey;
        this.terrainLayer = null; this.makeTerrain();
      }
      this.overdrive = (game.reactor?.timer || 0) > 0;
      this.overdriveProgress = clamp((game.reactor?.timer || 0) / (game.reactor?.duration || 7), 0, 1);
      const p = game.player;
      const halfW = this.width / this.scale / 2, halfH = this.height / this.scale / 2;
      const tx = this.world.width < halfW * 2 ? this.world.width / 2 : clamp(p.x, halfW, this.world.width - halfW);
      const ty = this.world.height < halfH * 2 ? this.world.height / 2 : clamp(p.y, halfH, this.world.height - halfH);
      if (this.lastPlayer !== p) {
        this.camera.x = tx; this.camera.y = ty; this.lastPlayer = p;
        this.spawn = { ...(game.spawn || p) }; this.lastPosition = { x: p.x, y: p.y };
        this.terrainLayer = null;
        this.resetEffects();
      }
      this.playerMoving = Math.hypot(p.x - this.lastPosition.x, p.y - this.lastPosition.y) > 0.1;
      this.lastPosition = { x: p.x, y: p.y };
      const incompleteRelays = (game.relays || []).filter(r => r.status !== 'active' && r.status !== 'locked');
      this.targetRelay = game.escort || incompleteRelays.find(r => r.id === this.trackedRelayId) || incompleteRelays.reduce((best, r) =>
        !best || Math.hypot(r.x - p.x, r.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? r : best, null);
      const contract = (game.contracts || []).find(item => item.id === this.trackedContractId && item.status !== 'complete');
      this.targetContract = contract ? { ...game.contractTarget(contract), name: contract.status === 'ready' ? '返回遗物终端' : contract.status === 'active' ? contract.kind === 'salvage' ? '勘探核心' : '支线目标' : contract.name } : null;
      const smoothing = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 11);
      this.camera.x += (tx - this.camera.x) * smoothing;
      this.camera.y += (ty - this.camera.y) * smoothing;
      this.updateEffects(dt);
      this.dashTrailTimer -= dt;
      if (!this.reducedMotion && p.dashTimer > 0 && this.dashTrailTimer <= 0) {
        this.ghosts.push({ x: p.x, y: p.y, angle: p.angle, age: 0, life: 0.24 });
        this.dashTrailTimer = 0.028;
      }
      if (this.ghosts.length > 20) this.ghosts.splice(0, this.ghosts.length - 20);
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#111d24';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.save();
      ctx.translate(this.width / 2 + this.shakeX, this.height / 2 + this.shakeY);
      ctx.scale(this.scale, this.scale);
      ctx.translate(-this.camera.x, -this.camera.y);
      this.drawTerrain(game);
      this.drawScars();
      if (this.mapId === 'frost') this.drawEscortRoute(game);
      for (const relay of game.relays || []) if (this.visible(relay.x, relay.y, (relay.radius || 147) + 40)) this.drawRelay(relay);
      for (const hazard of game.hazards || []) if (this.visible(hazard.x, hazard.y, (hazard.radius || 85) + (hazard.type === 'charge' || hazard.type === 'lane' ? hazard.length || 470 : 100))) this.drawHazard(hazard, game);
      for (const pickup of game.pickups || []) if (this.visible(pickup.x, pickup.y, 20)) this.drawPickup(pickup);
      for (const station of game.stations || []) if (this.visible(station.x, station.y)) this.drawStation(station, p);
      for (const crate of game.crates || []) if (this.visible(crate.x, crate.y)) this.drawCrate(crate, p);
      for (const contract of game.contracts || []) {
        if (this.visible(contract.x, contract.y, 100)) this.drawContract(contract, p);
        if (contract.kind === 'salvage' && contract.status === 'active') for (const node of contract.nodes) {
          if (!node.collected && this.visible(node.x, node.y)) this.drawCore(node, p);
        }
      }
      for (const echo of game.echoBursts || []) if (this.visible(echo.x, echo.y, echo.radius)) {
        circle(ctx, echo.x, echo.y, echo.radius * (1 - echo.remaining / .65), null, '#a9dbff', 2);
      }
      const actors = [];
      for (const obstacle of game.obstacles || []) if (this.visible(obstacle.x, obstacle.y, obstacle.radius + 30)) actors.push({ y: obstacle.y, kind: 'rock', data: obstacle });
      for (const enemy of game.enemies || []) if (this.visible(enemy.x, enemy.y, enemy.radius + 50)) actors.push({ y: enemy.y, kind: 'enemy', data: enemy });
      actors.push({ y: p.y, kind: 'player', data: p });
      for (const ghost of this.ghosts) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - ghost.age / ghost.life) * 0.25;
        this.drawPlayer({ ...p, x: ghost.x, y: ghost.y, angle: ghost.angle }, true);
        ctx.restore();
      }
      actors.sort((a, b) => a.y - b.y);
      for (const actor of actors) {
        if (actor.kind === 'rock') this.drawRock(actor.data);
        else if (actor.kind === 'enemy') this.drawEnemy(actor.data);
        else this.drawPlayer(actor.data);
      }
      for (const bullet of game.bullets || []) if (this.visible(bullet.x, bullet.y, 35)) this.drawBullet(bullet);
      this.drawEffects();
      this.drawObjectivePointers(game);
      ctx.restore();
      this.drawVignette(p);
    }

    drawTerrain(game) {
      if (!this.terrainLayer) {
        const canvas = document.createElement('canvas');
        canvas.width = this.world.width; canvas.height = this.world.height;
        const liveContext = this.ctx;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.paintingTerrain = true;
        try { this.paintTerrain(game); }
        finally { this.ctx = liveContext; this.paintingTerrain = false; }
        this.terrainLayer = canvas;
      }
      const margin = 32;
      const left = clamp(Math.floor(this.camera.x - this.width / this.scale / 2 - margin), 0, this.world.width);
      const top = clamp(Math.floor(this.camera.y - this.height / this.scale / 2 - margin), 0, this.world.height);
      const right = clamp(Math.ceil(this.camera.x + this.width / this.scale / 2 + margin), 0, this.world.width);
      const bottom = clamp(Math.ceil(this.camera.y + this.height / this.scale / 2 + margin), 0, this.world.height);
      if (right > left && bottom > top) this.ctx.drawImage(this.terrainLayer, left, top, right - left, bottom - top, left, top, right - left, bottom - top);
    }

    paintTerrain(game) {
      const ctx = this.ctx, { width: w, height: h } = this.world;
      ctx.fillStyle = this.groundPattern;
      ctx.fillRect(0, 0, w, h);
      if (this.mapId === 'foundry' || this.mapId === 'frost') { this.paintMissionTerrain(game); return; }
      // The three outlying biomes make navigation possible without the minimap.
      const zoneColors = ['rgba(159,169,81,.23)', 'rgba(67,160,164,.24)', 'rgba(164,107,157,.24)'];
      const zones = (game.relays || []).map((relay, i) => ({ ...relay, r: 720, color: zoneColors[i % 3] }));
      for (const z of zones) {
        if (!this.visible(z.x, z.y, z.r)) continue;
        const gradient = ctx.createRadialGradient(z.x, z.y, 30, z.x, z.y, z.r);
        gradient.addColorStop(0, z.color); gradient.addColorStop(0.45, z.color); gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient; ctx.fillRect(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
      }
      const cx = (game.spawn || this.spawn)?.x ?? w / 2, cy = (game.spawn || this.spawn)?.y ?? h / 2;
      for (const relay of game.relays || []) {
        ctx.strokeStyle = '#223632'; ctx.lineWidth = 86;
        path(ctx, [[cx, cy], [(cx + relay.x) / 2, cy], [relay.x, relay.y]], false); ctx.stroke();
        ctx.strokeStyle = '#344a41'; ctx.lineWidth = 70; ctx.stroke();
        ctx.strokeStyle = '#7f9270'; ctx.lineWidth = 1;
        ctx.setLineDash([4, 34]); ctx.stroke(); ctx.setLineDash([]);
      }
      zones.forEach((zone, index) => this.paintBiome(zone, index));
      if (this.visible(cx, cy, 330)) {
        polygon(ctx, cx, cy, 208, 8, Math.PI / 8); ctx.fillStyle = '#354d48'; ctx.fill();
        ctx.strokeStyle = '#7b8970'; ctx.lineWidth = 5; ctx.stroke();
        polygon(ctx, cx, cy, 188, 8, Math.PI / 8); ctx.strokeStyle = '#4f6054'; ctx.lineWidth = 1; ctx.stroke();
        for (let i = -2; i <= 2; i++) {
          ctx.strokeStyle = '#50685e'; ctx.lineWidth = 2;
          path(ctx, [[cx - 157, cy + i * 57], [cx + 157, cy + i * 57]], false); ctx.stroke();
        }
        circle(ctx, cx, cy, 57, '#304a48', '#86a398', 1.5);
        circle(ctx, cx, cy, 49, null, '#3d5653', 1);
        ctx.strokeStyle = '#617a6a'; ctx.lineWidth = 5;
        path(ctx, [[cx - 13, cy - 12], [cx - 13, cy + 12], [cx + 13, cy + 12], [cx + 13, cy - 12]], false); ctx.stroke();
        ctx.font = '600 11px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#8eaa99';
        ctx.fillText('LANDING ZONE  /  07', cx, cy + 128);
        for (const side of [-1, 1]) {
          box(ctx, cx + side * 154 - 17, cy - 26, 34, 52, 5, '#1d3034', '#61716a');
          box(ctx, cx + side * 154 - 9, cy - 21, 18, 18, 2, '#445353');
          box(ctx, cx + side * 154 - 9, cy + 5, 18, 6, 2, '#8fd8c0');
          circle(ctx, cx + side * 154, cy + 39, 3, '#b2ead1');
        }
      }
      for (const d of this.decor) {
        if (!this.visible(d.x, d.y, 50) || Math.hypot(d.x - cx, d.y - cy) < 225) continue;
        if ((game.relays || []).some(r => Math.hypot(d.x - r.x, d.y - r.y) < 130)) continue;
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle);
        if (d.kind === 'ruin') {
          ctx.fillStyle = '#101e23'; ctx.fillRect(-d.size - 2, -8, d.size * 2 + 5, 29);
          box(ctx, -d.size, -12, d.size * 2, 22, 2, '#354441', '#47524a');
          ctx.fillStyle = '#202f31'; ctx.fillRect(-d.size + 4, -6, d.size * 2 - 8, 9);
          ctx.fillStyle = d.seed > 0.5 ? '#819b77' : '#667c72'; ctx.fillRect(d.size - 6, -5, 2, 6);
        } else if (d.kind === 'shrub') {
          for (let j = 0; j < 5; j++) {
            ctx.rotate(1.25);
            path(ctx, [[0, 1], [-3, -d.size * 0.4], [2, -d.size], [5, -d.size * 0.3]]);
            ctx.fillStyle = j % 2 ? '#627849' : '#485f43'; ctx.fill();
          }
          circle(ctx, 0, 0, 3, '#617a52');
        } else {
          path(ctx, [[-d.size / 2, 0], [-d.size / 3, -3], [d.size / 2, -1], [d.size / 3, 3]]);
          ctx.fillStyle = '#35433d'; ctx.fill();
        }
        ctx.restore();
      }
      ctx.strokeStyle = '#526a5c'; ctx.lineWidth = 10;
      ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#bcc286'; ctx.lineWidth = 2; ctx.setLineDash([12, 24]);
      ctx.strokeRect(26, 26, w - 52, h - 52); ctx.setLineDash([]);
      for (let x = 80; x < w; x += 160) {
        circle(ctx, x, 29, 3, '#b4c484'); circle(ctx, x, h - 29, 3, '#b4c484');
      }
    }

    paintMissionTerrain(game) {
      const ctx = this.ctx, foundry = this.mapId === 'foundry';
      const { width: w, height: h } = this.world, spawn = game.spawn || this.spawn || { x: w / 2, y: h / 2 };
      const accent = foundry ? '#cc884d' : '#9cd3e6';
      for (const d of this.decor) {
        if (Math.hypot(d.x - spawn.x, d.y - spawn.y) < 150) continue;
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle);
        if (foundry) {
          if (d.kind === 'ruin') {
            box(ctx, -d.size * 2, -12, d.size * 4, 24, 3, '#1a242a', '#55636a');
            for (let i = -3; i <= 3; i++) { ctx.fillStyle = '#76543e'; ctx.fillRect(i * d.size * .45 - 2, -8, 3, 16); }
          } else if (d.kind === 'shrub') {
            ctx.strokeStyle = '#414144'; ctx.lineWidth = 5;
            path(ctx, [[-d.size * 2, 0], [0, 0], [0, d.size]], false); ctx.stroke();
            ctx.strokeStyle = '#a15e34'; ctx.lineWidth = 1.5; ctx.stroke();
            circle(ctx, 0, 0, 4, '#293034', '#758089', 1);
          } else {
            ctx.strokeStyle = '#485254'; ctx.lineWidth = 1;
            path(ctx, [[-d.size, 0], [d.size, 0]], false); ctx.stroke();
          }
        } else {
          ctx.strokeStyle = '#507487'; ctx.lineWidth = 5;
          path(ctx, [[-d.size * 3, 5], [-d.size, -6], [0, 0], [d.size * 1.3, -d.size], [d.size * 3, -d.size * .7]], false); ctx.stroke();
          ctx.strokeStyle = '#8cb4c5'; ctx.lineWidth = 1; ctx.stroke();
          path(ctx, [[-d.size, -6], [-d.size * .6, -d.size * 1.1]], false); ctx.stroke();
          if (d.kind === 'ruin') {
            ctx.beginPath(); ctx.ellipse(12, 16, d.size * 2.5, d.size * .7, 0, 0, TAU);
            ctx.fillStyle = 'rgba(177,216,231,.13)'; ctx.fill();
          }
        }
        ctx.restore();
      }
      for (const [index, relay] of (game.relays || []).entries()) {
        const points = !foundry && relay.waypoints?.length ? relay.waypoints.map(point => [point.x, point.y]) :
          [[spawn.x, spawn.y], [relay.x, spawn.y], [relay.x, relay.y]];
        ctx.lineJoin = 'round'; ctx.strokeStyle = foundry ? '#181f25' : '#203d4d'; ctx.lineWidth = foundry ? 91 : 72;
        path(ctx, points, false); ctx.stroke();
        ctx.strokeStyle = foundry ? '#394044' : '#476778'; ctx.lineWidth = foundry ? 72 : 59; ctx.stroke();
        ctx.strokeStyle = foundry ? '#8b7556' : '#9bc9db'; ctx.lineWidth = 2; ctx.setLineDash(foundry ? [15, 29] : [4, 29]); ctx.stroke(); ctx.setLineDash([]);
        if (foundry) {
          const glow = ctx.createRadialGradient(relay.x, relay.y, 35, relay.x, relay.y, 310);
          glow.addColorStop(0, 'rgba(249,121,38,.18)'); glow.addColorStop(1, 'rgba(249,121,38,0)');
          ctx.fillStyle = glow; ctx.fillRect(relay.x - 310, relay.y - 310, 620, 620);
          for (const side of [-1, 1]) {
            const x = relay.x + side * 168;
            box(ctx, x - 15, relay.y - 100, 30, 200, 8, '#1b2328', '#626b6a');
            box(ctx, x - 5, relay.y - 92, 10, 184, 4, '#a75f37');
            for (let y = -75; y <= 75; y += 50) { ctx.fillStyle = '#778083'; ctx.fillRect(x - 20, relay.y + y, 40, 7); }
          }
        } else {
          const destination = relay.waypoints?.at(-1) || relay;
          circle(ctx, destination.x, destination.y, 61, 'rgba(141,200,219,.08)', '#749faf', 2);
          for (let i = 0; i < 4; i++) {
            const angle = i * Math.PI / 2 + Math.PI / 4;
            circle(ctx, destination.x + Math.cos(angle) * 72, destination.y + Math.sin(angle) * 72, 5, '#95d6ec', '#365766', 2);
          }
        }
        const labelPoint = relay.waypoints?.[0] || relay;
        ctx.font = '700 25px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = accent;
        ctx.fillText(`${foundry ? 'FURNACE' : 'CONVOY'} / 0${index + 1}`, labelPoint.x, labelPoint.y + 196);
        ctx.font = '10px Consolas, monospace'; ctx.fillText(foundry ? 'BREACH THE CORE' : 'STAY WITH THE CARRIER', labelPoint.x, labelPoint.y + 216);
      }
      polygon(ctx, spawn.x, spawn.y, 126, foundry ? 4 : 6, foundry ? Math.PI / 4 : Math.PI / 6);
      ctx.fillStyle = foundry ? '#30383c' : '#375969'; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.stroke();
      circle(ctx, spawn.x, spawn.y, 58, null, foundry ? '#9e714d' : '#7daebf', 2);
      ctx.font = '600 13px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = accent;
      ctx.fillText(foundry ? 'INDUSTRIAL DROP / 02' : 'POLAR OUTPOST / 03', spawn.x, spawn.y + 98);
      ctx.strokeStyle = foundry ? '#5d5f5a' : '#7395a2'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.setLineDash([16, 22]); ctx.strokeRect(26, 26, w - 52, h - 52); ctx.setLineDash([]);
    }

    drawEscortRoute(game) {
      const ctx = this.ctx;
      for (const relay of game.relays || []) {
        if (relay.status !== 'charging' && relay.id !== this.targetRelay?.id) continue;
        const target = relay.waypoints?.[relay.waypointIndex || 0];
        if (!target) continue;
        ctx.save(); ctx.strokeStyle = '#a5e4fa'; ctx.lineWidth = 2; ctx.setLineDash([7, 13]);
        path(ctx, [[relay.x, relay.y], [target.x, target.y]], false); ctx.stroke(); ctx.setLineDash([]);
        if (this.visible(target.x, target.y, 25)) {
          polygon(ctx, target.x, target.y, 15, 4, Math.PI / 4); ctx.strokeStyle = '#c8f2ff'; ctx.stroke();
        }
        ctx.restore();
      }
    }

    paintBiome(zone, index) {
      const ctx = this.ctx, rng = random(783 + index * 1297);
      const tints = ['#7d8e53', '#599e9d', '#95799d'];
      for (let i = 0; i < 90; i++) {
        const angle = rng() * TAU, distance = 135 + rng() * 495;
        const x = zone.x + Math.cos(angle) * distance, y = zone.y + Math.sin(angle) * distance;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rng() * TAU);
        if (index === 0) {
          ctx.globalAlpha = 0.24;
          ctx.beginPath(); ctx.ellipse(0, 0, 10 + rng() * 28, 4 + rng() * 8, 0, 0, TAU); ctx.fillStyle = '#91a261'; ctx.fill();
          ctx.globalAlpha = 0.5;
          for (let j = 0; j < 4; j++) { path(ctx, [[j * 5, 4], [j * 5 + 4, -12 - rng() * 13]], false); ctx.strokeStyle = '#a0ac6c'; ctx.lineWidth = 1.3; ctx.stroke(); }
        } else if (index === 1) {
          const size = 7 + rng() * 16;
          path(ctx, [[-size, 0], [-size * 0.4, -5], [size, -2], [size * 0.25, 6]]);
          ctx.fillStyle = '#416c6c'; ctx.fill(); ctx.strokeStyle = '#6eaaa0'; ctx.lineWidth = 1; ctx.stroke();
          path(ctx, [[-size * 0.7, 0], [size * 0.4, 1], [size * 0.7, -1]], false); ctx.strokeStyle = '#94c7b4'; ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(163,120,161,.4)'; ctx.lineWidth = 2;
          path(ctx, [[-21, 3], [-9, -3], [-1, 1], [13, -8], [24, -6]], false); ctx.stroke();
          circle(ctx, -10, -3, 2, '#a185a4'); circle(ctx, 13, -8, 2.5, '#b396b2');
        }
        ctx.restore();
      }
      ctx.save(); ctx.translate(zone.x, zone.y);
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(Math.PI / 4 + i * Math.PI / 2);
        box(ctx, 128, -21, 69, 42, 4, '#2e4240', '#657667');
        ctx.fillStyle = '#263a39'; ctx.fillRect(137, -14, 51, 28);
        for (let j = 0; j < 4; j++) { ctx.fillStyle = tints[index]; ctx.fillRect(141 + j * 12, -9, 4, 18); }
        ctx.restore();
      }
      ctx.globalAlpha = 0.53;
      ctx.font = '600 32px Consolas, monospace'; ctx.fillStyle = tints[index]; ctx.textAlign = 'center';
      ctx.fillText(['ECHO / 01', 'PRISM / 02', 'TIDE / 03'][index], 0, 225);
      ctx.font = '10px Consolas, monospace'; ctx.fillText('RESEARCH ARRAY  /  RESTRICTED ACCESS', 0, 245);
      ctx.restore();
    }

    drawScars() {
      const ctx = this.ctx;
      for (const scar of this.scars) {
        if (!this.visible(scar.x, scar.y, scar.radius + 10)) continue;
        ctx.save(); ctx.translate(scar.x, scar.y); ctx.rotate(scar.angle);
        ctx.globalAlpha = Math.min(0.55, (1 - scar.age / scar.life) * 1.1);
        ctx.beginPath(); ctx.ellipse(0, 2, scar.radius * 1.1, scar.radius * 0.7, 0, 0, TAU); ctx.fillStyle = '#312938'; ctx.fill();
        for (let i = 0; i < 5; i++) {
          const angle = i * 1.7 + scar.seed * 5, d = scar.radius * (0.3 + (i % 3) * 0.27);
          polygon(ctx, Math.cos(angle) * d, Math.sin(angle) * d, scar.radius * (i === 0 ? 0.3 : 0.17), 3, angle);
          ctx.fillStyle = i % 2 ? '#755969' : '#8b7480'; ctx.fill();
        }
        ctx.restore();
      }
    }

    drawRelay(r) {
      if (r.mode === 'demolition' || r.mode === 'escort') { this.drawMissionRelay(r); return; }
      const ctx = this.ctx, active = r.status === 'active', charging = r.status === 'charging';
      const tracked = this.targetRelay?.id === r.id;
      const c = active ? colors.green : charging ? colors.cyan : colors.amber;
      const progress = clamp(r.progress || 0, 0, 1), pulse = this.reducedMotion ? 0.7 : 0.6 + Math.sin(this.time * 2.5) * 0.2;
      ctx.save(); ctx.translate(r.x, r.y);
      const light = ctx.createRadialGradient(0, 0, 15, 0, 0, 140);
      light.addColorStop(0, active ? 'rgba(143,224,151,.1)' : charging ? 'rgba(90,221,239,.13)' : 'rgba(225,176,97,.06)');
      light.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = light; ctx.fillRect(-140, -140, 280, 280);
      polygon(ctx, 0, 4, 99, 8, Math.PI / 8); ctx.fillStyle = '#122328'; ctx.fill();
      polygon(ctx, 0, 0, 94, 8, Math.PI / 8); ctx.fillStyle = '#304440'; ctx.fill();
      ctx.strokeStyle = '#637064'; ctx.lineWidth = 3; ctx.stroke();
      circle(ctx, 0, 0, 78, '#213237', '#5c6e63', 8);
      circle(ctx, 0, 0, 67, null, '#435652', 1);
      for (let i = 0; i < 12; i++) {
        ctx.save(); ctx.rotate(i * TAU / 12);
        box(ctx, 69, -6, 19, 12, 2, '#172a2d', '#55685f');
        ctx.fillStyle = active || (charging && i / 12 < progress) ? c : '#73715a'; ctx.fillRect(73, -2, 10, 4);
        ctx.restore();
      }
      if (charging || active) {
        ctx.beginPath(); ctx.arc(0, 0, 89, -Math.PI / 2, -Math.PI / 2 + TAU * (active ? 1 : progress));
        ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke();
      }
      polygon(ctx, 0, 0, 41, 6, Math.PI / 6); ctx.fillStyle = '#3b514b'; ctx.fill();
      ctx.strokeStyle = '#829181'; ctx.lineWidth = 2; ctx.stroke();
      polygon(ctx, 0, -3, 27, 6, Math.PI / 6); ctx.fillStyle = '#172e35'; ctx.fill();
      ctx.strokeStyle = c; ctx.stroke();
      ctx.globalAlpha = pulse;
      polygon(ctx, 0, -3, 17, 6, this.reducedMotion ? 0 : this.time * (active ? 0.3 : charging ? 0.7 : 0.08));
      ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
      circle(ctx, 0, -3, 5, '#ecffdd');
      if (tracked && !active) {
        for (let i = 0; i < 4; i++) {
          ctx.save(); ctx.rotate(Math.PI / 4 + i * Math.PI / 2);
          path(ctx, [[101, -8], [107, 0], [101, 8]], false); ctx.strokeStyle = '#f2dea2'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
        }
      }
      ctx.font = '600 11px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = c; ctx.fillText(r.name || '中继信标', 0, -114);
      ctx.font = '10px monospace'; ctx.fillStyle = '#b9c8b5';
      ctx.fillText(active ? 'ONLINE' : charging ? `SYNC ${Math.round(progress * 100)}%` : 'E  ·  启动', 0, 117);
      if (charging) { ctx.setLineDash([5, 12]); circle(ctx, 0, 0, r.radius || 147, null, 'rgba(140,229,231,.45)', 1.5); ctx.setLineDash([]); }
      ctx.restore();
    }

    relayStatus(r) {
      const percent = Math.round((r.progress || 0) * 100);
      if (r.mode === 'demolition') return r.status === 'active' ? '核心已拆毁' : r.status === 'charging' ? `攻击核心 · ${percent}%` : r.status === 'locked' ? '暂未开放' : 'E · 解除核心封锁';
      if (r.mode === 'escort') return r.status === 'active' ? '运输已完成' : r.status === 'charging' ? `护送进度 ${percent}%` : r.status === 'locked' ? '等待前段运输' : 'E · 启动运输车';
      return r.status === 'active' ? '已连接' : r.status === 'charging' ? `同步 ${percent}%` : '待激活';
    }

    drawMissionRelay(r) {
      const ctx = this.ctx, escort = r.mode === 'escort', active = r.status === 'active', charging = r.status === 'charging', locked = r.status === 'locked';
      const color = active ? '#a7e6b4' : locked ? '#698899' : escort ? '#a4e9fc' : '#ffc38d';
      ctx.save(); ctx.translate(r.x, r.y);
      if (escort) {
        if (charging || this.targetRelay?.id === r.id) {
          ctx.setLineDash([5, 13]); circle(ctx, 0, 0, r.radius || 147, 'rgba(119,200,230,.035)', locked ? '#547384' : '#77bcd6', 1.5); ctx.setLineDash([]);
        }
        const next = r.waypoints?.[r.waypointIndex || 0];
        const angle = next && Math.hypot(next.x - r.x, next.y - r.y) > 1 ? Math.atan2(next.y - r.y, next.x - r.x) : 0;
        ctx.save(); ctx.rotate(angle);
        ctx.beginPath(); ctx.ellipse(1, 10, 49, 29, 0, 0, TAU); ctx.fillStyle = 'rgba(6,20,32,.5)'; ctx.fill();
        for (const side of [-1, 1]) {
          box(ctx, -38, side * 25 - 7, 74, 14, 5, '#142f41', '#6995a7');
          for (let i = -3; i <= 3; i++) { ctx.strokeStyle = '#416275'; ctx.lineWidth = 3; path(ctx, [[i * 10, side * 25 - 5], [i * 10, side * 25 + 5]], false); ctx.stroke(); }
        }
        box(ctx, -42, -21, 83, 42, 7, locked ? '#395160' : '#608593', '#b1d7e1');
        box(ctx, -34, -16, 46, 32, 3, '#294a60', '#80acbd');
        for (let i = -2; i <= 1; i++) { ctx.fillStyle = locked ? '#536c77' : '#8fc4d0'; ctx.fillRect(i * 10 - 6, -13, 3, 26); }
        path(ctx, [[19, -15], [32, -12], [38, 0], [32, 12], [19, 15]]); ctx.fillStyle = '#a2c4cd'; ctx.fill();
        box(ctx, 23, -8, 11, 16, 3, '#1f445a', color);
        for (const y of [-14, 14]) circle(ctx, 39, y, 3, active ? '#b5efbe' : locked ? '#638693' : '#e3faff');
        circle(ctx, -16, 0, 6, locked ? '#66838d' : color, '#2b5166', 2);
        ctx.restore();
        if (charging) {
          circle(ctx, 0, 0, 53, null, '#37596c', 3);
          ctx.beginPath(); ctx.arc(0, 0, 53, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(r.progress || 0, 0, 1)); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
        }
      } else {
        polygon(ctx, 0, 0, 90, 8, Math.PI / 8); ctx.fillStyle = '#20282d'; ctx.fill(); ctx.strokeStyle = '#6d7171'; ctx.lineWidth = 4; ctx.stroke();
        for (let i = 0; i < 8; i++) {
          ctx.save(); ctx.rotate(i * TAU / 8); box(ctx, 66, -9, 17, 18, 2, active ? '#465555' : '#c29550');
          path(ctx, [[66, -8], [82, 5]], false); ctx.strokeStyle = '#303435'; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
        }
        circle(ctx, 0, 0, 60, '#151f27', active ? '#75817a' : '#986d4d', 3);
        if (!charging) {
          polygon(ctx, 0, 0, 45, 6, Math.PI / 6); ctx.fillStyle = active ? '#303d40' : '#626564'; ctx.fill();
          path(ctx, [[-34, -19], [34, 19], [4, 0], [-25, 30]], false); ctx.strokeStyle = active ? '#171f28' : '#202b31'; ctx.lineWidth = active ? 8 : 3; ctx.stroke();
          if (!active) circle(ctx, 0, 0, 10, '#3a302b', '#f6ba7f', 2);
        }
      }
      ctx.restore();
      this.label(r.name || (escort ? '极地运输车' : '熔炉核心'), r.x, r.y - (escort ? 73 : 111), color);
      this.label(this.relayStatus(r), r.x, r.y + (escort ? 78 : 117), color);
      if (escort && charging && this.lastPlayer && Math.hypot(r.x - this.lastPlayer.x, r.y - this.lastPlayer.y) > (r.radius || 147)) {
        this.label('靠近运输车以继续前进', r.x, r.y + 103, '#ffda9f');
      }
    }

    drawRock(r) {
      const ctx = this.ctx, size = r.radius || 30;
      const seed = Math.sin(r.x * 0.031 + r.y * 0.075);
      ctx.save(); ctx.translate(r.x, r.y);
      if (this.mapId === 'foundry') {
        ctx.rotate(seed * .3);
        box(ctx, -size * .8, -size * .68, size * 1.6, size * 1.5, 5, '#18242d');
        box(ctx, -size * .8, -size * .82, size * 1.6, size * 1.42, 4, '#52606a', '#8e9998');
        box(ctx, -size * .62, -size * .63, size * 1.24, size, 2, '#35444f', '#667b83');
        ctx.strokeStyle = '#9e804e'; ctx.lineWidth = Math.max(2, size * .1);
        path(ctx, [[-size * .58, size * .19], [size * .58, -size * .45]], false); ctx.stroke();
        for (const side of [-1, 1]) circle(ctx, side * size * .64, -size * .66, 2.2, '#b9c4ba');
        ctx.restore(); return;
      }
      if (this.mapId === 'frost') {
        ctx.beginPath(); ctx.ellipse(3, size * .4, size * 1.04, size * .65, 0, 0, TAU); ctx.fillStyle = '#203849'; ctx.fill();
        path(ctx, [[-size * .9, size * .4], [-size * .65, -size * .4], [-size * .12, -size], [size * .68, -size * .57], [size * .91, size * .35], [size * .15, size * .68]]);
        ctx.fillStyle = '#638fa6'; ctx.fill(); ctx.strokeStyle = '#a4d8e9'; ctx.lineWidth = 2; ctx.stroke();
        path(ctx, [[-size * .12, -size], [size * .12, size * .12], [-size * .9, size * .4]]); ctx.fillStyle = '#a4cbd8'; ctx.fill();
        path(ctx, [[-size * .12, -size], [size * .68, -size * .57], [size * .12, size * .12]]); ctx.fillStyle = '#d4e7e8'; ctx.fill();
        path(ctx, [[size * .12, size * .12], [size * .91, size * .35], [size * .15, size * .68]]); ctx.fillStyle = '#467a96'; ctx.fill();
        ctx.restore(); return;
      }
      ctx.beginPath(); ctx.ellipse(4, size * 0.42, size * 1.02, size * 0.67, -0.2, 0, TAU);
      ctx.fillStyle = 'rgba(6,14,18,.42)'; ctx.fill();
      const vertices = [];
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7 + seed, radius = size * (0.83 + Math.sin(i * 15 + seed) * 0.13);
        vertices.push([Math.cos(a) * radius, Math.sin(a) * radius * 0.85]);
      }
      path(ctx, vertices); ctx.fillStyle = '#657568'; ctx.fill(); ctx.strokeStyle = '#1a2c2a'; ctx.lineWidth = 3; ctx.stroke();
      path(ctx, [[-size * 0.64, -size * 0.23], [-size * 0.29, -size * 0.68], [size * 0.38, -size * 0.48], [size * 0.61, -size * 0.04], [0, size * 0.05]]);
      ctx.fillStyle = '#839078'; ctx.fill();
      path(ctx, [[-size * 0.65, size * 0.22], [0, size * 0.05], [size * 0.6, size * 0.02], [size * 0.36, size * 0.55], [-size * 0.12, size * 0.7]]);
      ctx.fillStyle = '#4f6458'; ctx.fill();
      path(ctx, [[-size * 0.28, -size * 0.46], [size * 0.1, -size * 0.15], [-size * 0.02, size * 0.23]], false);
      ctx.strokeStyle = '#3a4b43'; ctx.lineWidth = 2; ctx.stroke();
      if (size > 32) { circle(ctx, -size * 0.23, -size * 0.34, 4, '#819367'); circle(ctx, -size * 0.38, -size * 0.21, 3, '#7a8a5e'); }
      ctx.restore();
    }

    drawCrate(c, player) {
      const ctx = this.ctx;
      ctx.save(); ctx.translate(c.x, c.y);
      box(ctx, -22, -8, 45, 31, 5, 'rgba(5,15,20,.45)');
      box(ctx, -20, -17, 40, 33, 4, c.opened ? '#394443' : '#786d4d', '#b0a47a');
      box(ctx, -15, -12, 30, 21, 2, c.opened ? '#152729' : '#393f36');
      ctx.fillStyle = c.opened ? '#59645b' : '#dac37e'; ctx.fillRect(-20, -3, 40, 5);
      ctx.fillStyle = '#1c2c2c'; ctx.fillRect(-4, -7, 8, 12);
      ctx.fillStyle = c.opened ? '#738072' : '#f5db83'; ctx.fillRect(-2, -3, 4, 4);
      if (c.opened) { box(ctx, -20, -26, 40, 9, 2, '#5a6455', '#89917b'); }
      else if (Math.hypot(c.x - player.x, c.y - player.y) < 115) this.label('E  搜索补给', 0, -34, '#f4dda0');
      ctx.restore();
    }

    drawStation(s, player) {
      const ctx = this.ctx, medical = s.kind !== 'armory', color = medical ? '#a3e0c1' : '#ecbf80';
      ctx.save(); ctx.translate(s.x, s.y);
      circle(ctx, 0, 0, 40, '#253b3a', '#617468', 2);
      box(ctx, -23, -24, 46, 49, 7, '#334a4c', '#849a89');
      box(ctx, -17, -19, 34, 30, 3, '#152e36');
      ctx.fillStyle = color;
      if (medical) { ctx.fillRect(-3, -14, 6, 19); ctx.fillRect(-10, -8, 20, 6); }
      else { ctx.fillRect(-11, -9, 21, 6); ctx.fillRect(-2, -3, 5, 9); ctx.fillRect(10, -7, 5, 2); }
      ctx.fillRect(-13, 17, 7, 3); ctx.fillRect(6, 17, 7, 3);
      if (Math.hypot(s.x - player.x, s.y - player.y) < 120) this.label(medical ? 'E  医疗站' : 'E  武器工坊', 0, -42, color);
      ctx.restore();
    }

    drawContract(contract, player) {
      const ctx = this.ctx, ready = contract.status === 'ready', done = contract.status === 'complete';
      const color = done ? '#6d9a83' : ready ? '#f4d994' : '#c1afff';
      ctx.save(); ctx.translate(contract.x, contract.y);
      circle(ctx, 0, 0, 45, '#211d36', color, 1.4);
      polygon(ctx, 0, 0, 30, 6, Math.PI / 6); ctx.fillStyle = '#3c3455'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      polygon(ctx, 0, -5, 12, 4, this.reducedMotion ? 0 : this.time * .5); ctx.fillStyle = color; ctx.fill();
      if (ready) circle(ctx, 0, 0, 54 + Math.sin(this.time * 3) * 3, null, '#ecd8a2', 2);
      ctx.restore();
      this.label(contract.name, contract.x, contract.y - 57, color);
      if (Math.hypot(player.x - contract.x, player.y - contract.y) < 140) this.label(done ? '遗物已领取' : ready ? 'E · 选择战术遗物' : contract.status === 'active' ? contract.progress + '/' + contract.goal + ' · 目标已标记' : 'E · 接取支线', contract.x, contract.y + 67, color);
    }

    drawCore(node, player) {
      const ctx = this.ctx;
      ctx.save(); ctx.translate(node.x, node.y);
      circle(ctx, 0, 0, 25, 'rgba(147,111,216,.16)', '#cbb8ff', 1.5);
      polygon(ctx, 0, 0, 12, 4, this.reducedMotion ? 0 : this.time); ctx.fillStyle = '#d8caff'; ctx.fill();
      ctx.restore();
      if (Math.hypot(player.x - node.x, player.y - node.y) < 130) this.label('E · 勘探核心', node.x, node.y - 34, '#d8caff');
    }

    drawPickup(p) {
      const ctx = this.ctx, bob = this.reducedMotion ? 0 : Math.sin(this.time * 3 + p.x) * 2;
      const c = p.type === 'xp' ? '#79e2d2' : p.type === 'credits' ? '#f4d895' : '#bbec9d';
      circle(ctx, p.x, p.y + 3, 8, 'rgba(8,20,24,.35)');
      ctx.save(); ctx.translate(p.x, p.y + bob);
      if (p.type === 'heal' || p.type === 'health') {
        box(ctx, -7, -7, 14, 14, 3, '#204941', c);
        ctx.fillStyle = c; ctx.fillRect(-1.5, -4.5, 3, 9); ctx.fillRect(-4.5, -1.5, 9, 3);
      } else {
        polygon(ctx, 0, 0, p.type === 'xp' ? 5.5 : 6.5, p.type === 'xp' ? 4 : 6, p.type === 'xp' ? 0 : Math.PI / 6);
        ctx.fillStyle = c; ctx.fill();
        ctx.fillStyle = '#e8fff0'; ctx.fillRect(-1, -3, 2, 3);
      }
      ctx.restore();
    }

    drawPlayer(p, ghost = false) {
      const ctx = this.ctx;
      ctx.save(); ctx.translate(p.x, p.y);
      if (!ghost && p.slowTimer > 0) {
        circle(ctx, 0, 4, 26, null, '#b8eafa', 1.5);
        for (let i = 0; i < 3; i++) {
          polygon(ctx, (i - 1) * 13, 22 - (i % 2) * 3, 5, 4, 0); ctx.fillStyle = '#b6e3f3'; ctx.fill();
        }
      }
      if (!ghost && this.overdrive) {
        circle(ctx, 0, 0, 37, 'rgba(255,214,133,.09)', 'rgba(153,255,235,.48)', 1.5);
        const rotation = this.reducedMotion ? 0 : this.time * .85;
        ctx.strokeStyle = '#ffe2a0'; ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.arc(0, 0, 39, rotation + i * TAU / 3, rotation + i * TAU / 3 + .85); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, 44, -Math.PI / 2, -Math.PI / 2 + TAU * this.overdriveProgress);
        ctx.strokeStyle = '#96fff1'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (!ghost) { ctx.beginPath(); ctx.ellipse(1, 12, 20, 11, 0, 0, TAU); ctx.fillStyle = 'rgba(3,13,21,.55)'; ctx.fill(); }
      ctx.rotate(p.angle || 0);
      if (!ghost) {
        ctx.strokeStyle = 'rgba(131,219,205,.55)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, 23, Math.PI * 0.32, Math.PI * 1.68); ctx.stroke();
      }
      const stride = p.dashTimer > 0 ? 5 : Math.sin(this.time * 11) * (this.playerMoving ? 3.5 : 0.4);
      box(ctx, -9 + stride, -14, 17, 8, 3, '#243b4c', '#758f92');
      box(ctx, -9 - stride, 6, 17, 8, 3, '#243b4c', '#758f92');
      box(ctx, -18, -10, 11, 20, 3, '#314c55', '#718c88');
      ctx.fillStyle = '#7be2d2'; ctx.fillRect(-17, -5, 3, 10);
      path(ctx, [[-11, -10], [0, -14], [10, -9], [13, 0], [9, 10], [-5, 12], [-13, 5]]);
      ctx.fillStyle = ghost ? (this.overdrive ? '#ffe4a6' : '#8ce9ef') : '#a9c8bf'; ctx.fill(); ctx.strokeStyle = '#223b47'; ctx.lineWidth = 2; ctx.stroke();
      box(ctx, -6, -16, 13, 7, 3, '#d9aa66', '#eacf92');
      box(ctx, -5, 9, 13, 7, 3, '#577784', '#9ab8b9');
      box(ctx, 3, 6, 17, 7, 3, '#9eb7af', '#203742');
      const weapon = p.weapon || 0;
      ctx.save(); ctx.translate(-this.recoil * (this.reducedMotion ? 0.3 : 1), 0);
      if (weapon === 3) {
        box(ctx, 10, 1, 27, 14, 4, '#59646a', '#c6b091');
        circle(ctx, 17, 12, 8, '#343f47', '#e3a873', 2);
        box(ctx, 30, 0, 10, 16, 3, '#38434b', '#ffb87b');
        ctx.fillStyle = '#ffcd89'; ctx.fillRect(12, 3, 13, 3);
      } else if (weapon === 4) {
        box(ctx, 11, 6, 12, 7, 2, '#294956', '#9bcdd9');
        circle(ctx, 29, 8, 12, '#244655', '#9ddff1', 2);
        for (let i = 0; i < 3; i++) {
          const a = i * TAU / 3;
          path(ctx, [[29 + Math.cos(a) * 5, 8 + Math.sin(a) * 5], [29 + Math.cos(a + .3) * 18, 8 + Math.sin(a + .3) * 18], [29 + Math.cos(a + 1) * 12, 8 + Math.sin(a + 1) * 12]]);
          ctx.fillStyle = '#b4e8ee'; ctx.fill();
        }
        circle(ctx, 29, 8, 4, '#78d6ed');
      } else {
        box(ctx, 9, 4, weapon === 2 ? 24 : 20, 8, 2, '#233b47', '#a2b9ac');
        box(ctx, 26, 6, weapon === 1 ? 12 : 9, weapon === 1 ? 6 : 4, 1, '#546c71');
        ctx.fillStyle = this.overdrive ? '#fff0b8' : weapon === 2 ? '#c5b6ff' : weapon === 1 ? '#f4c979' : '#8bf2ce'; ctx.fillRect(15, 5, 7, 2);
      }
      if (this.overdrive) { ctx.fillStyle = '#8ffbea'; ctx.fillRect(10, 13, 22, 2); }
      if (weapon === 2) { ctx.fillStyle = '#bdaafa'; ctx.fillRect(22, 3, 3, 10); ctx.fillRect(28, 3, 3, 10); }
      if (weapon === 1) { ctx.fillStyle = '#829995'; ctx.fillRect(25, 10, 12, 3); }
      ctx.restore();
      circle(ctx, 1, -1, 10, '#d0dbbc', '#2a4451', 2);
      path(ctx, [[3, -9], [10, -6], [12, -1], [10, 5], [3, 7], [5, 0]]);
      ctx.fillStyle = '#183e52'; ctx.fill(); ctx.strokeStyle = '#86e0db'; ctx.lineWidth = 1.5; ctx.stroke();
      path(ctx, [[7, -5], [10, -2], [9, 2]], false); ctx.strokeStyle = '#b6f1e1'; ctx.lineWidth = 1.3; ctx.stroke();
      if (p.dashTimer > 0) { ctx.fillStyle = '#c3faff'; path(ctx, [[-20, -6], [-36 - (this.reducedMotion ? 0 : Math.sin(this.time * 50) * 4), 0], [-20, 6]]); ctx.fill(); }
      if (this.playerHit > 0 && !ghost) { ctx.globalAlpha = this.playerHit * 3.5; circle(ctx, 0, 0, 15, '#ffecdd'); }
      ctx.restore();
      if (!ghost && (p.invulnerable > 0 || p.invulnTimer > 0)) circle(ctx, p.x, p.y, 25, null, 'rgba(150,233,243,.65)', 1.5);
      if (!ghost && p.reloadTimer > 0) {
        const progress = clamp(p.reloadProgress || 0, 0, 1);
        circle(ctx, p.x, p.y, 29, null, 'rgba(10,26,31,.7)', 4);
        if (!p.reloadAttempted) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 29, -Math.PI / 2 + TAU * (p.reloadWindowStart || 0.52), -Math.PI / 2 + TAU * (p.reloadWindowEnd || 0.72));
          ctx.strokeStyle = '#c3eb87'; ctx.lineWidth = 4; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, 29, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
        ctx.strokeStyle = p.reloadResult === 'miss' ? '#efa7b8' : '#f8dfa8'; ctx.lineWidth = 1.7; ctx.stroke();
        const a = -Math.PI / 2 + TAU * progress;
        circle(ctx, p.x + Math.cos(a) * 29, p.y + Math.sin(a) * 29, 2.5, '#fffce3');
      }
    }

    drawEnemy(e) {
      const ctx = this.ctx, r = e.radius || 17, boss = e.type === 'boss';
      const foundryBoss = boss && e.variant === 'foundry', frostBoss = boss && e.variant === 'frost';
      if (boss && e.windup > 0 && e.attackKind === 'fan') {
        const spread = e.spread || 1.4, aim = e.shotAngle ?? e.angle ?? 0;
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(aim);
        ctx.strokeStyle = e.color || '#ffc08c'; ctx.lineWidth = 2; ctx.setLineDash([5, 11]);
        for (const angle of [-spread / 2, 0, spread / 2]) {
          path(ctx, [[Math.cos(angle) * (r + 12), Math.sin(angle) * (r + 12)], [Math.cos(angle) * 235, Math.sin(angle) * 235]], false); ctx.stroke();
        }
        ctx.setLineDash([]); ctx.restore();
      }
      if (e.phaseMarkTimer > 0) this.drawPhaseMark(e, r);
      if (e.type === 'reactor') {
        ctx.save(); ctx.translate(e.x, e.y);
        circle(ctx, 0, 0, r + 7, '#25292c', '#7c7569', 4);
        for (let i = 0; i < 4; i++) {
          ctx.save(); ctx.rotate(Math.PI / 4 + i * Math.PI / 2);
          box(ctx, r * .43, -10, r * .58, 20, 3, '#59606a', '#afb1a1');
          ctx.fillStyle = '#db9c57'; ctx.fillRect(r * .59, -7, 5, 14); ctx.restore();
        }
        polygon(ctx, 0, 0, r * .68, 6, Math.PI / 6); ctx.fillStyle = '#4b3631'; ctx.fill(); ctx.strokeStyle = '#ffae71'; ctx.lineWidth = 3; ctx.stroke();
        const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.time * 3) * .07;
        circle(ctx, 0, 0, r * .43 * pulse, '#ec9355', '#ffe0a3', 2);
        polygon(ctx, 0, 0, r * .24, 4, this.reducedMotion ? 0 : this.time * .4); ctx.fillStyle = '#ffdf9c'; ctx.fill();
        if (this.hitFlashes.get(e.id) > 0) circle(ctx, 0, 0, r * .48, 'rgba(255,245,206,.7)');
        ctx.restore(); this.healthBar(e.x, e.y - r - 15, 86, e.hp / e.maxHp, '#ffc084');
        this.label('暴露核心 · 集火拆毁', e.x, e.y - r - 33, '#ffd09d'); return;
      }
      if (e.type === 'nest') {
        ctx.save(); ctx.translate(e.x, e.y);
        for (let i = 0; i < 6; i++) {
          const angle = i * TAU / 6;
          circle(ctx, Math.cos(angle) * 24, Math.sin(angle) * 24, 16, '#614460', '#b780a5', 1.5);
        }
        circle(ctx, 0, 0, 23, '#322338', '#dc94c0', 2);
        circle(ctx, 0, 0, 10 + (this.reducedMotion ? 0 : Math.sin(this.time * 3) * 2), '#e9accb');
        ctx.restore(); this.healthBar(e.x, e.y - 51, 70, e.hp / e.maxHp, '#d995c5'); this.label('孵化虫巢', e.x, e.y - 66, '#e9accb'); return;
      }
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.beginPath(); ctx.ellipse(2, r * 0.65, r * 1.1, r * 0.55, 0, 0, TAU); ctx.fillStyle = 'rgba(5,11,20,.47)'; ctx.fill();
      ctx.rotate(e.angle || 0); ctx.scale(r / 20, r / 20);
      const stride = this.reducedMotion ? 0 : Math.sin(this.time * (boss ? 6 : 11) + (Number(e.id) || e.x) * 0.13) * 3;
      const tank = e.type === 'tank', spitter = e.type === 'spitter' || e.type === 'shooter';
      const armor = foundryBoss ? '#515a60' : frostBoss ? '#426b86' : boss ? '#685369' : tank ? '#61646f' : spitter ? '#666851' : '#74506b';
      const light = boss ? e.color || '#ff81b1' : tank ? '#cba1dd' : spitter ? '#c8d984' : '#ee9eba';
      ctx.strokeStyle = foundryBoss ? '#b79473' : frostBoss ? '#acd7e6' : boss ? '#ab7396' : '#a27996'; ctx.lineWidth = boss ? 3 : 2.5; ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const start = -12 + i * 10;
          path(ctx, [[start, side * 8], [start - 4 + (i % 2 ? stride : -stride), side * 18], [start + 4, side * (i === 1 ? 28 : 24)]], false); ctx.stroke();
        }
      }
      if (boss) {
        for (const side of [-1, 1]) {
          path(ctx, [[-10, side * 10], [-24, side * 24], [-22, side * 5], [-29, side * 1]]);
          ctx.fillStyle = foundryBoss ? '#58656a' : frostBoss ? '#9ccada' : '#685169'; ctx.fill(); ctx.strokeStyle = foundryBoss ? '#d5af87' : frostBoss ? '#c5edf4' : '#b090ad'; ctx.lineWidth = 1; ctx.stroke();
          path(ctx, [[8, side * 9], [21, side * 18], [31, side * 10], [23, side * 25], [11, side * 20]]);
          ctx.fillStyle = foundryBoss ? '#8e897b' : frostBoss ? '#70aabe' : '#977c89'; ctx.fill();
        }
      }
      ctx.beginPath(); ctx.ellipse(-7, 0, tank ? 20 : 17, tank ? 17 : 14, 0, 0, TAU);
      ctx.fillStyle = armor; ctx.fill(); ctx.strokeStyle = '#302936'; ctx.lineWidth = 2; ctx.stroke();
      path(ctx, [[-21, -2], [-14, -11], [0, -10], [5, 0], [-2, 9], [-14, 9]]);
      ctx.fillStyle = tank ? '#899087' : foundryBoss ? '#818b8a' : frostBoss ? '#88b6c6' : boss ? '#8c6a89' : '#956982'; ctx.fill();
      path(ctx, [[-18, 0], [-5, 0], [2, -5]], false); ctx.strokeStyle = light; ctx.lineWidth = boss ? 2 : 1.5; ctx.stroke();
      if (tank) {
        for (let i = -1; i <= 1; i++) { path(ctx, [[-16 + i * 6, -11], [-11 + i * 6, 0], [-16 + i * 6, 11]], false); ctx.strokeStyle = '#53646b'; ctx.lineWidth = 2; ctx.stroke(); }
      }
      if (spitter) {
        for (const side of [-1, 1]) { circle(ctx, -9, side * 8, 5, '#c0ca7c', '#626b48', 1); circle(ctx, -11, side * 8 - 1, 1.5, '#edf2b6'); }
        if (e.windup > 0) {
          ctx.setLineDash([3, 5]); circle(ctx, 0, 0, 25, null, '#e9cc9a', 1.3); ctx.setLineDash([]);
          path(ctx, [[23, -7], [30, 0], [23, 7]], false); ctx.strokeStyle = '#ffe0a9'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      circle(ctx, 9, 0, 10, foundryBoss ? '#464949' : frostBoss ? '#2b526e' : boss ? '#58364e' : '#493448', foundryBoss ? '#d7a46f' : frostBoss ? '#b3e3f0' : '#a8758e', 1.2);
      for (const side of [-1, 1]) {
        path(ctx, [[12, side * 5], [23, side * 9], [19, side * 1]]);
        ctx.fillStyle = e.type === 'charger' ? '#e6b7a0' : '#c59dae'; ctx.fill();
        circle(ctx, 14, side * 4, boss ? 2.8 : 2.2, e.windup > 0 ? '#ffffff' : light);
      }
      if (e.type === 'charger') {
        path(ctx, [[0, -5], [23, 0], [0, 5]]); ctx.fillStyle = '#c69586'; ctx.fill();
        ctx.strokeStyle = '#ecc8a4'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (foundryBoss) {
        box(ctx, -24, -14, 28, 28, 3, '#313e49', '#c3ac85');
        box(ctx, -20, -11, 20, 22, 2, e.stage === 2 ? '#f2aa65' : '#b66b40', '#ffdd9c');
        for (let i = -2; i <= 2; i++) { ctx.fillStyle = '#454b4e'; ctx.fillRect(-21, i * 4 - 1, 22, 2); }
        for (const side of [-1, 1]) {
          box(ctx, -19, side * 20 - 5, 20, 10, 2, '#46525b', '#aab0a1');
          box(ctx, -23, side * 20 - 3, 7, 6, 1, '#1f2c34', '#e9b17c');
          circle(ctx, 1, side * 14, 3, '#f5b975');
        }
      } else if (frostBoss) {
        for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
          const x = -21 + i * 12;
          path(ctx, [[x - 5, side * 8], [x - 8, side * (27 + (i === 1 ? 8 : 0))], [x + 7, side * 15], [x + 4, side * 6]]);
          ctx.fillStyle = i % 2 ? '#d0eff4' : '#85c0d4'; ctx.fill(); ctx.strokeStyle = '#3f7898'; ctx.lineWidth = 1; ctx.stroke();
        }
        polygon(ctx, -7, 0, 10, 6, Math.PI / 6); ctx.fillStyle = '#294d71'; ctx.fill(); ctx.strokeStyle = '#c6f2fb'; ctx.lineWidth = 1.5; ctx.stroke();
        polygon(ctx, -7, 0, e.stage === 2 ? 7 : 5, 4, this.reducedMotion ? 0 : this.time * .6); ctx.fillStyle = '#ccffff'; ctx.fill();
      } else if (boss) {
        circle(ctx, -7, 0, 7, '#481f47', '#ef92bb', 1.5);
        circle(ctx, -7, 0, 3.5 + (this.reducedMotion ? 0 : Math.sin(this.time * 4) * .7), e.stage === 2 ? '#ffdaaa' : '#ff82c6');
      }
      if (e.stunTimer > 0) { ctx.strokeStyle = '#a4f2ef'; ctx.lineWidth = 1.3; path(ctx, [[-10, -14], [-5, -20], [-2, -14], [4, -19]], false); ctx.stroke(); }
      if (e.recoveryTimer > 0) {
        ctx.setLineDash([4, 4]); circle(ctx, -3, 0, 25, null, '#a9e8e0', 1.5); ctx.setLineDash([]);
        circle(ctx, -7, 0, boss ? 8 : 5, '#d6f8d4', '#6bccbe', 1.3);
      }
      if (boss && e.windup > 0 && e.attackKind === 'ring') {
        const count = e.stage === 2 ? 20 : 14;
        for (let i = 0; i < count; i++) {
          ctx.save(); ctx.rotate(i * TAU / count + (e.attackCount || 0) * 0.22 - (e.angle || 0));
          path(ctx, [[26, -2.5], [31, 0], [26, 2.5]], false); ctx.strokeStyle = '#ffd5c0'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
        }
        circle(ctx, 0, 0, 29, null, 'rgba(255,166,183,.45)', 1);
      }
      const flash = this.hitFlashes.get(e.id) || 0;
      if (flash > 0) {
        ctx.globalAlpha = flash / 0.12 * 0.68;
        ctx.beginPath(); ctx.ellipse(-4, 0, 24, 14, 0, 0, TAU); ctx.fillStyle = '#fff4d7'; ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (e.type === 'mortar') {
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle || 0);
        box(ctx, -16, -10, 26, 20, 4, '#614d43', '#ffbb87'); circle(ctx, -2, 0, 7, e.windup > 0 ? '#fff0bf' : '#efaa75'); ctx.restore();
        this.label('炮击虫', e.x, e.y - r - 25, '#ffc48e');
      }
      if (e.elite) {
        circle(ctx, e.x, e.y, r + 8, null, '#e9c889', 2);
        this.label(e.name || '精英', e.x, e.y - r - 29, '#f0d59e');
      }
      if (e.hp < e.maxHp && !boss) this.healthBar(e.x, e.y - r - 12, clamp(r * 1.9, 28, 60), e.hp / e.maxHp, '#e597ab');
      if (boss) {
        this.healthBar(e.x, e.y - r - 30, 116, e.hp / e.maxHp, e.color || '#f498b7');
        this.label(`${e.name || '裂隙守卫'}${e.stage === 2 ? ' · 狂暴' : ''}`, e.x, e.y - r - 39, e.color || '#edb9ce');
      }
    }

    healthBar(x, y, width, fraction, color) {
      const ctx = this.ctx;
      box(ctx, x - width / 2 - 1, y - 1, width + 2, 5, 2, '#102327');
      box(ctx, x - width / 2, y, width * clamp(fraction, 0, 1), 3, 1, color);
    }

    label(text, x, y, color = '#c6d6c6') {
      const ctx = this.ctx;
      ctx.font = '600 11px "Segoe UI", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      const width = ctx.measureText(text).width + 15;
      box(ctx, x - width / 2, y - 13, width, 21, 5, 'rgba(13,30,35,.87)', 'rgba(115,148,133,.28)');
      ctx.fillStyle = color; ctx.fillText(text, x, y + 1);
    }

    drawPhaseMark(e, radius) {
      const ctx = this.ctx, ring = radius + 12;
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.phaseMarkTimer / .45);
      circle(ctx, 0, 0, ring, 'rgba(142,122,255,.1)', '#b5a1ff', 2);
      const rotation = this.reducedMotion ? Math.PI / 6 : this.time * .8;
      ctx.strokeStyle = '#a0fff0'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = rotation + i * TAU / 3;
        ctx.beginPath(); ctx.arc(0, 0, ring + 5, a, a + .6); ctx.stroke();
      }
      const y = -ring - 10;
      polygon(ctx, 0, y, 6, 4, 0); ctx.fillStyle = '#1a3347'; ctx.fill();
      ctx.strokeStyle = '#b9fff0'; ctx.lineWidth = 2; ctx.stroke();
      circle(ctx, 0, y, 2, '#d4baff');
      ctx.restore();
    }

    drawBullet(b) {
      const ctx = this.ctx, enemy = b.owner === 'enemy';
      const angle = Math.atan2(b.vy || 0, b.vx || 1), radius = b.radius || 3;
      if (!enemy && (b.kind === 'grenade' || b.kind === 'boomerang')) {
        ctx.save(); ctx.translate(b.x, b.y);
        const grenade = b.kind === 'grenade', color = b.reactor ? '#a6ffee' : grenade ? '#ffc187' : b.returning ? '#d6fff0' : '#9cddff';
        ctx.rotate(angle); ctx.strokeStyle = grenade ? 'rgba(255,181,111,.42)' : 'rgba(155,226,255,.35)'; ctx.lineWidth = grenade ? 5 : 3;
        path(ctx, [[-26, 0], [-12, 0], [0, 0]], false); ctx.stroke();
        if (grenade) {
          circle(ctx, 0, 0, 10, 'rgba(251,148,74,.14)');
          box(ctx, -7, -5, 12, 10, 3, '#73584b', color); circle(ctx, 3, 0, 4, '#ffdda1');
          ctx.strokeStyle = '#f6ae69'; ctx.lineWidth = 2; path(ctx, [[-11, -3], [-19, -5]], false); ctx.stroke();
        } else {
          ctx.rotate(this.reducedMotion ? 0 : (b.age ?? this.time) * (b.returning ? -19 : 19));
          circle(ctx, 0, 0, 17, null, 'rgba(165,229,247,.22)', 3);
          for (let i = 0; i < 3; i++) {
            ctx.save(); ctx.rotate(i * TAU / 3);
            path(ctx, [[1, -3], [19, -7], [12, 4], [3, 8], [7, 1]]); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#335972'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
          }
          circle(ctx, 0, 0, 5, '#f0fff0', '#4f8ca8', 2);
        }
        ctx.restore(); return;
      }
      const length = enemy ? 13 : Math.min(30, Math.hypot(b.vx || 600, b.vy || 0) * 0.027);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(angle);
      const reactor = !enemy && b.reactor;
      ctx.strokeStyle = enemy ? 'rgba(255,114,161,.25)' : reactor ? 'rgba(121,255,226,.32)' : 'rgba(251,225,145,.22)'; ctx.lineWidth = radius * (reactor ? 4 : 2.8);
      path(ctx, [[-length, 0], [0, 0]], false); ctx.stroke();
      ctx.strokeStyle = reactor ? '#a0fff0' : b.color || (enemy ? '#ff89b7' : '#ffe29a'); ctx.lineWidth = radius * (reactor ? 1.6 : 1.1);
      path(ctx, [[-length, 0], [1, 0]], false); ctx.stroke();
      circle(ctx, 0, 0, radius * 0.85, enemy ? '#ffe0ec' : '#fff9d7');
      if (b.overcharged || reactor) { ctx.strokeStyle = reactor ? '#ffe7b3' : '#efffd0'; ctx.lineWidth = 1; path(ctx, [[-length * 0.6, 0], [3, 0]], false); ctx.stroke(); }
      ctx.restore();
    }

    drawHazard(h, game = {}) {
      const ctx = this.ctx, progress = h.resolved ? 1 : 1 - clamp((h.remaining || 0) / (h.duration || 1), 0, 1);
      const source = h.sourceId == null ? null : (game.enemies || []).find(e => e.id === h.sourceId);
      const tank = source?.type === 'tank' || h.enemyType === 'tank', icy = h.effect === 'slow';
      const color = h.color || (icy ? '#a6e7ff' : h.owner === 'environment' ? this.mapId === 'foundry' ? '#ffc287' : '#c2ed8e' : source?.color || (tank ? '#ffd195' : '#ffa2bc'));
      const radius = Math.max(1, h.radius || 85), fillOpacity = h.resolved ? .3 : .08 + progress * .13;
      ctx.save(); ctx.translate(h.x, h.y);
      if (h.type === 'lane') {
        const length = Math.max(0, h.length || 240);
        ctx.rotate(h.angle || 0);
        ctx.beginPath(); ctx.roundRect(-radius, -radius, length + radius * 2, radius * 2, radius);
        ctx.save(); ctx.globalAlpha *= fillOpacity; ctx.fillStyle = color; ctx.fill(); ctx.restore();
        ctx.strokeStyle = '#26313d'; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = h.resolved ? 3 : 2; ctx.stroke();
        ctx.setLineDash([9, 12]); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        path(ctx, [[0, 0], [length, 0]], false); ctx.stroke(); ctx.setLineDash([]);
        if (!h.resolved) {
          ctx.strokeStyle = '#fff0d6'; ctx.lineWidth = 2.5;
          path(ctx, [[0, -radius - 5], [length * progress, -radius - 5]], false); ctx.stroke();
          for (let x = 40; x < length; x += 90) for (const side of [-1, 1]) {
            path(ctx, [[x - 5, side * radius * .47], [x, side * radius * .73], [x + 5, side * radius * .47]], false); ctx.stroke();
          }
        }
      } else if (h.type === 'ring') {
        const inner = clamp(h.innerRadius || 0, 0, radius);
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.moveTo(inner, 0); ctx.arc(0, 0, inner, 0, TAU, true);
        ctx.save(); ctx.globalAlpha *= fillOpacity; ctx.fillStyle = color; ctx.fill('evenodd'); ctx.restore();
        circle(ctx, 0, 0, radius, null, '#26313d', 5); circle(ctx, 0, 0, radius, null, color, 2);
        if (inner > 0) { circle(ctx, 0, 0, inner, null, '#223c47', 5); circle(ctx, 0, 0, inner, null, '#c8f2dc', 2); }
        if (!h.resolved) {
          ctx.beginPath(); ctx.arc(0, 0, radius + 6, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
          ctx.strokeStyle = '#fff1df'; ctx.lineWidth = 3; ctx.stroke();
          if (inner > 38) {
            ctx.save(); ctx.translate(0, inner * .8); ctx.scale(1 / this.scale, 1 / this.scale);
            ctx.font = '600 12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = '#183342'; ctx.lineWidth = 3;
            ctx.strokeText('内圈安全', 0, 0); ctx.fillStyle = '#d2f8e6'; ctx.fillText('内圈安全', 0, 0); ctx.restore();
          }
        }
      } else if (h.type === 'charge') {
        const halfWidth = h.radius || 25, length = h.length || 240;
        ctx.rotate(h.angle || 0);
        ctx.save(); ctx.globalAlpha *= fillOpacity; ctx.fillStyle = color; ctx.fillRect(0, -halfWidth, length, halfWidth * 2); ctx.restore();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([8, 9]);
        ctx.strokeRect(0, -halfWidth, length, halfWidth * 2); ctx.setLineDash([]);
        for (let x = 38; x < length - 10; x += 54) {
          path(ctx, [[x - 8, -8], [x, 0], [x - 8, 8]], false); ctx.strokeStyle = '#ffd1d1'; ctx.lineWidth = 1.8; ctx.stroke();
        }
      } else {
        ctx.save(); ctx.globalAlpha *= fillOpacity; circle(ctx, 0, 0, radius, color); ctx.restore();
        circle(ctx, 0, 0, radius, null, '#233544', 5); circle(ctx, 0, 0, radius, null, color, 2);
        if (!h.resolved) {
          circle(ctx, 0, 0, Math.max(1, radius * (1 - progress)), null, color, 2);
          ctx.beginPath(); ctx.arc(0, 0, radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
          ctx.strokeStyle = icy ? '#e8fbff' : '#ffe0c0'; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        if (icy) {
          for (let i = 0; i < 3; i++) {
            ctx.save(); ctx.rotate(i * Math.PI / 3);
            path(ctx, [[-12, 0], [12, 0]], false); ctx.stroke();
            for (const side of [-1, 1]) { path(ctx, [[side * 5, -4], [side * 9, 0], [side * 5, 4]], false); ctx.stroke(); }
            ctx.restore();
          }
        } else if (h.owner === 'environment' && this.mapId === 'frontier') {
          for (let i = 0; i < 3; i++) circle(ctx, Math.cos(i * TAU / 3) * 7, Math.sin(i * TAU / 3) * 7, 4, null, color, 2);
        } else {
          path(ctx, [[-7, -7], [7, 7]], false); ctx.stroke(); path(ctx, [[7, -7], [-7, 7]], false); ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawEffects() {
      const ctx = this.ctx;
      for (const hazard of this.hazardEchoes) {
        if (!this.visible(hazard.x, hazard.y, (hazard.radius || 85) + (hazard.length || 0))) continue;
        ctx.globalAlpha = 1 - hazard.age / hazard.life;
        this.drawHazard(hazard);
      }
      ctx.globalAlpha = 1;
      for (const r of this.rings) {
        if (r.age < 0 || !this.visible(r.x, r.y, r.radius)) continue;
        const t = clamp(r.age / r.life, 0, 1);
        ctx.globalAlpha = (1 - t) * 0.8;
        const radius = Math.max(1, r.radius * (1 - (1 - t) ** 2));
        circle(ctx, r.x, r.y, radius, null, r.color, (r.phase ? 5 : 3) * (1 - t) + 1);
        if (r.phase) {
          ctx.strokeStyle = '#d4fff4'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 6; i++) {
            const a = i * TAU / 6, cos = Math.cos(a), sin = Math.sin(a);
            path(ctx, [[r.x + cos * radius * .83, r.y + sin * radius * .83], [r.x + cos * radius * 1.1, r.y + sin * radius * 1.1]], false); ctx.stroke();
          }
        }
        if (r.fill) {
          ctx.globalAlpha = (1 - t) * 0.2;
          circle(ctx, r.x, r.y, Math.max(1, r.radius * (1 - (1 - t) ** 2)), r.color);
        }
      }
      for (const arc of this.arcs) {
        ctx.globalAlpha = 1 - arc.age / arc.life;
        path(ctx, arc.points, false); ctx.strokeStyle = arc.color; ctx.lineWidth = 5; ctx.globalAlpha *= 0.22; ctx.stroke();
        ctx.globalAlpha = 1 - arc.age / arc.life; ctx.lineWidth = 1.6; ctx.strokeStyle = '#ddfff6'; ctx.stroke();
      }
      for (const m of this.muzzles) {
        if (!this.visible(m.x, m.y, 45)) continue;
        const fade = 1 - m.age / m.life;
        const size = (m.enemy ? 10 : m.weapon === 1 ? 27 : m.weapon === 2 ? 34 : m.weapon === 3 ? 29 : 19) * (0.6 + fade * 0.4);
        ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.angle);
        if (!m.enemy && m.weapon === 4) {
          ctx.globalAlpha = fade * .8; ctx.strokeStyle = m.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, 11 + (1 - fade) * 15, -.95, .95); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, 8 + (1 - fade) * 12, Math.PI - .7, Math.PI + .7); ctx.stroke();
          ctx.restore(); continue;
        }
        ctx.globalAlpha = fade * 0.25; circle(ctx, 3, 0, size * 0.75, m.color);
        ctx.globalAlpha = fade;
        path(ctx, [[-3, -3], [size * 0.45, -size * 0.24], [size * 0.31, -2], [size, 0], [size * 0.31, 2], [size * 0.45, size * 0.24], [-3, 3]]);
        ctx.fillStyle = m.color; ctx.fill();
        path(ctx, [[-2, -2], [size * 0.65, 0], [-2, 2]]); ctx.fillStyle = '#f7ffe5'; ctx.fill();
        if (m.overcharged || m.reactor) { circle(ctx, 0, 0, 13 + (1 - fade) * 17, null, m.reactor ? '#9fffee' : '#efffbc', 1.5); }
        ctx.restore();
      }
      for (const p of this.particles) {
        if (!this.visible(p.x, p.y, 10)) continue;
        ctx.globalAlpha = (1 - p.age / p.life) * 0.9;
        ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.font = '700 12px monospace'; ctx.textAlign = 'center';
      for (const n of this.numbers) {
        ctx.globalAlpha = clamp((1 - n.age / n.life) * 2, 0, 1);
        ctx.font = n.label ? '800 16px "Microsoft YaHei", sans-serif' : n.critical ? '800 17px monospace' : '700 12px monospace';
        ctx.strokeStyle = '#14232b'; ctx.lineWidth = 3; ctx.strokeText(n.text, n.x, n.y);
        ctx.fillStyle = n.color; ctx.fillText(n.text, n.x, n.y);
      }
      ctx.globalAlpha = 1;
    }

    drawObjectivePointers(game) {
      const ctx = this.ctx, halfW = this.width / this.scale / 2 - 28 / this.scale, halfH = this.height / this.scale / 2 - 31 / this.scale;
      if (!this.pointerHud || this.pointerHudTime < 0 || this.time - this.pointerHudTime > 0.5) {
        const origin = this.canvas.getBoundingClientRect(), parent = this.canvas.parentElement;
        const rects = selector => Array.from(parent?.querySelectorAll(selector) || []).map(element => element.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
        const top = rects('.map-hud,.objective-hud'), bottom = rects('.weapons-hud,.ammo-hud,.skill-hud,.active-reload,.touch-stick,#touch-interact');
        this.pointerHud = {
          right: top.length ? Math.min(...top.map(r => r.left - origin.left)) : this.width - (this.width > 760 ? 235 : 170),
          topBottom: top.length ? Math.max(...top.map(r => r.bottom - origin.top)) : this.height < 450 ? 122 : this.width > 760 ? 390 : 285,
          bottom: bottom.length ? Math.min(...bottom.map(r => r.top - origin.top)) - 48 : this.height - 155
        };
        this.pointerHudTime = this.time;
      }
      const boss = (game.enemies || []).find(e => e.type === 'boss' && e.hp > 0);
      const targets = [];
      if (this.targetContract) targets.push({ ...this.targetContract, color: '#cab7ff', label: this.targetContract.name });
      else if (this.targetRelay) targets.push({ ...this.targetRelay, color: this.targetRelay.mode === 'demolition' ? '#ffc18a' : this.targetRelay.mode === 'escort' ? '#ace8ff' : this.targetRelay.status === 'charging' ? '#a4ece2' : '#f0d596', label: this.targetRelay.name || (this.targetRelay.mode === 'escort' ? '护送运输车' : this.targetRelay.mode === 'demolition' ? '拆毁反应堆' : '追踪信标') });
      if (boss) targets.push({ ...boss, color: boss.color || '#ffabbf', label: boss.name || game.map?.boss?.name || '裂隙守卫', boss: true });
      let previous = null;
      for (const target of targets) {
        const dx = target.x - this.camera.x, dy = target.y - this.camera.y;
        if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) continue;
        const factor = Math.min(halfW / Math.max(Math.abs(dx), 1), halfH / Math.max(Math.abs(dy), 1));
        let sx = this.width / 2 + dx * factor * this.scale;
        let sy = this.height / 2 + dy * factor * this.scale;
        const topLimit = this.height < 450 ? 92 : 76;
        const bottomLimit = Math.max(topLimit + 20, this.pointerHud.bottom);
        sy = clamp(sy, topLimit, bottomLimit);
        // Reserve room for the arrow and its label beside the actual HUD panels.
        if (sx + 85 > this.pointerHud.right && sy - 14 < this.pointerHud.topBottom) {
          const below = this.pointerHud.topBottom + 25;
          if (below <= bottomLimit && (this.width <= 760 || below - sy < 115)) sy = Math.max(sy, below);
          else sx = Math.max(96, this.pointerHud.right - 95);
        }
        const x = this.camera.x + (sx - this.width / 2) / this.scale;
        let y = this.camera.y + (sy - this.height / 2) / this.scale;
        if (previous && Math.hypot(x - previous.x, y - previous.y) < 80 / this.scale) {
          y = clamp(y + (y < this.camera.y ? 42 : -42) / this.scale, this.camera.y - halfH, this.camera.y + halfH);
        }
        previous = { x, y };
        ctx.save(); ctx.translate(x, y); ctx.scale(1 / this.scale, 1 / this.scale); ctx.rotate(Math.atan2(dy, dx));
        circle(ctx, 0, 0, 12, '#18302ce6', target.color, 1);
        path(ctx, [[7, 0], [-4, -4], [-1, 0], [-4, 4]]); ctx.fillStyle = target.color; ctx.fill();
        ctx.restore();
        const distance = Math.round(Math.hypot(target.x - game.player.x, target.y - game.player.y) / 10);
        const lx = clamp(x, this.camera.x - halfW + 77 / this.scale, this.camera.x + halfW - 77 / this.scale);
        const ly = y + (y > this.camera.y + halfH - 40 / this.scale ? -23 : 25) / this.scale;
        ctx.save(); ctx.translate(lx, ly); ctx.scale(1 / this.scale, 1 / this.scale);
        this.label(`${target.label} · ${distance}m`, 0, 0, target.color);
        ctx.restore();
      }
    }

    drawVignette(player) {
      const ctx = this.ctx;
      const gradient = ctx.createRadialGradient(this.width / 2, this.height / 2, this.height * 0.26,
        this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.64);
      gradient.addColorStop(0, 'rgba(3,12,22,0)'); gradient.addColorStop(1, 'rgba(3,12,22,.22)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.width, this.height);
      if (player.hp / player.maxHp < 0.3 && player.hp > 0) {
        const danger = ctx.createRadialGradient(this.width / 2, this.height / 2, this.height * 0.3,
          this.width / 2, this.height / 2, this.width * 0.65);
        danger.addColorStop(0, 'rgba(140,35,63,0)'); danger.addColorStop(1, 'rgba(190,54,82,.29)');
        ctx.fillStyle = danger; ctx.fillRect(0, 0, this.width, this.height);
      }
    }

    drawMinimap(canvas, game, options = {}) {
      if (!canvas || !game?.player) return;
      const rect = canvas.getBoundingClientRect(), width = rect.width || 180, height = rect.height || 130;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext('2d'), world = game.world || this.world;
      const foundry = game.map?.id === 'foundry', frost = game.map?.id === 'frost';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = foundry ? '#252a30' : frost ? '#224152' : '#15282d'; ctx.fillRect(0, 0, width, height);
      const scale = Math.min((width - 14) / world.width, (height - 14) / world.height);
      const ox = (width - world.width * scale) / 2, oy = (height - world.height * scale) / 2;
      const detailed = options.detailed ?? width > 360;
      ctx.save(); ctx.translate(ox, oy);
      if (detailed && this.terrainLayer) {
        ctx.drawImage(this.terrainLayer, 0, 0, world.width * scale, world.height * scale);
        ctx.fillStyle = 'rgba(10,27,32,.35)'; ctx.fillRect(0, 0, world.width * scale, world.height * scale);
      }
      ctx.strokeStyle = '#3c5553'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, world.width * scale, world.height * scale);
      ctx.fillStyle = '#354a45';
      for (const obstacle of game.obstacles || []) circle(ctx, obstacle.x * scale, obstacle.y * scale, Math.max(0.8, obstacle.radius * scale), foundry ? '#65717a' : frost ? '#83aabb' : '#43594c');
      if (frost) for (const relay of game.relays || []) {
        if (!relay.waypoints?.length) continue;
        path(ctx, relay.waypoints.map(point => [point.x * scale, point.y * scale]), false);
        ctx.strokeStyle = relay.status === 'locked' ? '#547181' : relay.status === 'active' ? '#73958f' : '#b7e5f0'; ctx.lineWidth = detailed ? 2 : 1; ctx.stroke();
        const end = relay.waypoints.at(-1);
        circle(ctx, end.x * scale, end.y * scale, detailed ? 5 : 2.5, null, '#b9e2eb', 1);
      }
      for (const c of game.crates || []) if (!c.opened) {
        const size = detailed ? 5 : 2;
        ctx.fillStyle = detailed ? '#d9be83' : '#b1a675'; ctx.fillRect(c.x * scale - size / 2, c.y * scale - size / 2, size, size);
        if (detailed) { ctx.strokeStyle = '#203532'; ctx.lineWidth = 1; ctx.strokeRect(c.x * scale - size / 2, c.y * scale - size / 2, size, size); }
      }
      for (const s of game.stations || []) {
        const medical = s.kind !== 'armory', color = medical ? '#a6edc1' : '#f0c991';
        const x = s.x * scale, y = s.y * scale;
        if (!detailed) { ctx.fillStyle = color; ctx.fillRect(x - 2, y - 2, 4, 4); continue; }
        box(ctx, x - 8, y - 8, 16, 16, 3, '#173b36', color);
        ctx.fillStyle = color;
        if (medical) { ctx.fillRect(x - 1.5, y - 5, 3, 10); ctx.fillRect(x - 5, y - 1.5, 10, 3); }
        else { ctx.fillRect(x - 5, y - 3, 10, 4); ctx.fillRect(x - 1, y + 1, 3, 5); ctx.fillRect(x + 5, y - 2, 3, 2); }
        ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#132b2d';
        ctx.strokeText(medical ? '医疗' : '工坊', x, y + 23); ctx.fillStyle = color; ctx.fillText(medical ? '医疗' : '工坊', x, y + 23);
      }
      for (const r of game.relays || []) {
        const color = r.status === 'active' ? '#9fe8ad' : r.status === 'locked' ? '#64808b' : r.status === 'charging' ? foundry ? '#ffc187' : '#8ce4e4' : frost ? '#bfecff' : '#efd59b';
        polygon(ctx, r.x * scale, r.y * scale, detailed ? 7 : 4, foundry ? 6 : 4, frost ? Math.PI / 4 : 0); ctx.fillStyle = color; ctx.fill();
        circle(ctx, r.x * scale, r.y * scale, detailed ? 11 : 6, null, r.id === this.targetRelay?.id ? '#f5e6b6' : 'rgba(163,206,163,.4)', 1);
        if (detailed) {
          ctx.textAlign = 'center'; ctx.font = '600 11px "Microsoft YaHei", sans-serif';
          ctx.lineWidth = 3; ctx.strokeStyle = '#142c2e';
          ctx.strokeText(r.name || '信标', r.x * scale, r.y * scale - 19);
          ctx.fillStyle = color; ctx.fillText(r.name || '信标', r.x * scale, r.y * scale - 19);
          ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#cadcc3';
          ctx.fillText(this.relayStatus(r), r.x * scale, r.y * scale + 25);
        }
      }
      for (const contract of game.contracts || []) {
        const x = contract.x * scale, y = contract.y * scale;
        const color = contract.status === 'complete' ? '#729587' : contract.status === 'ready' ? '#f4d994' : '#c5adff';
        polygon(ctx, x, y, detailed ? 7 : 3.5, 6); ctx.fillStyle = color; ctx.fill();
        if (contract.id === this.trackedContractId) circle(ctx, x, y, detailed ? 11 : 6, null, '#e9dbff', 1.5);
        if (detailed) { ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(contract.name, x, y - 14); }
        if (contract.status === 'active') {
          const targets = contract.kind === 'salvage' ? contract.nodes.filter(node => !node.collected) : game.enemies.filter(enemy => enemy.contractId === contract.id && enemy.hp > 0);
          for (const target of targets) circle(ctx, target.x * scale, target.y * scale, detailed ? 4 : 2, color);
        }
      }
      const spawn = game.spawn || this.spawn;
      if (detailed && spawn) {
        ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#b9d8b2';
        circle(ctx, spawn.x * scale, spawn.y * scale, 5, null, '#b9d8b2', 1);
        ctx.fillText(foundry ? '工厂入口' : frost ? '极地营地' : '着陆营地', spawn.x * scale, spawn.y * scale + 19);
      }
      for (const e of game.enemies || []) {
        if (e.type !== 'boss' && e.type !== 'reactor' && Math.hypot(e.x - game.player.x, e.y - game.player.y) > 650) continue;
        const color = e.type === 'boss' ? e.color || '#e4819f' : e.type === 'reactor' ? '#ffaf7e' : '#e4819f';
        circle(ctx, e.x * scale, e.y * scale, e.type === 'boss' ? 3.5 : e.type === 'reactor' ? 3 : 1.2, color);
        if (e.type === 'boss' && detailed) {
          ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#18303c';
          const name = e.name || game.map?.boss?.name || '裂隙守卫';
          ctx.strokeText(name, e.x * scale, e.y * scale - 11); ctx.fillStyle = color; ctx.fillText(name, e.x * scale, e.y * scale - 11);
        }
      }
      ctx.strokeStyle = 'rgba(172,215,194,.22)'; ctx.lineWidth = 1;
      ctx.strokeRect((this.camera.x - this.width / this.scale / 2) * scale,
        (this.camera.y - this.height / this.scale / 2) * scale, this.width / this.scale * scale, this.height / this.scale * scale);
      const px = game.player.x * scale, py = game.player.y * scale;
      circle(ctx, px, py, detailed ? 10 : 5.5, 'rgba(126,227,230,.18)');
      ctx.save(); ctx.translate(px, py); ctx.rotate(game.player.angle || 0);
      if (detailed) ctx.scale(1.6, 1.6);
      path(ctx, [[5, 0], [-3, -3], [-1.5, 0], [-3, 3]]); ctx.fillStyle = '#d4fff3'; ctx.fill(); ctx.restore();
      ctx.restore();
    }
  }

  window.ExpeditionRenderer = ExpeditionRenderer;
})();
