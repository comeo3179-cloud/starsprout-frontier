/* Original procedural artwork: no textures, fonts, or network requests. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const colors = { cyan: '#71e8ed', amber: '#ffd784', pink: '#fd729d', green: '#a5e9a3' };
  const encounterColors = { race: '#82efd0', rings: '#9cceff', hunt: '#ffc18a' };
  const tacticColors = { 'decoy-dash': '#99eadf', 'reload-mine': '#ffd08b', 'gravity-pulse': '#c4adff' };
  const evolutionColors = { 'assault-chain': '#95ffdf', 'shotgun-breach': '#ffda92', 'piercer-mirror': '#c9b5ff', 'grenade-echo': '#ffbb83', 'boomerang-twin': '#a5edff', 'star-bridge': '#8ff7db' };
  const doctrineColors = { skirmisher: '#8cf5d3', marksman: '#ffd18c', conductor: '#c9b3ff' };
  const voyageColors = { cosmos: '#c8b7ff', forge: '#ffc88c', tide: '#94eadf' };
  const voyageDeviceColors = { afterimage: '#8fffe0', needles: '#b0ffe6', mirror: '#ffd9a2', sentry: '#fff0b7', well: '#b6c5ff', battery: '#d5baff' };

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
    roundedPath(ctx, x, y, w, h, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  // All game rectangles have positive dimensions and one nonnegative radius.
  function roundedPath(ctx, x, y, w, h, radius) {
    if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, radius); return; }
    const r = Math.min(radius, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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
      this.trackedEncounterId = null;
      this.targetEncounter = null;
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
      const foundry = this.mapId === 'foundry', frost = this.mapId === 'frost', storm = this.mapId === 'storm', nexus = this.mapId === 'nexus', ruins = this.mapId === 'ruins';
      const voyage = this.mapId.startsWith('voyage-'), biome = this.mapId.slice(7);
      ctx.fillStyle = voyage ? { cosmos: '#282d43', forge: '#363435', tide: '#294345' }[biome] : foundry ? '#292d32' : frost ? '#2d4b5b' : storm ? '#303747' : nexus ? '#252a39' : ruins ? '#343933' : '#293b36';
      ctx.fillRect(0, 0, 192, 192);
      for (let i = 0; i < 850; i++) {
        const shade = rng() > 0.52 ? frost ? 'rgba(196,236,255,.09)' : 'rgba(189,202,155,.055)' : 'rgba(0,9,14,.05)';
        ctx.fillStyle = shade;
        ctx.fillRect(rng() * 192, rng() * 192, rng() * 9 + 1, rng() * 5 + 1);
      }
      for (let i = 0; i < 45; i++) {
        const x = rng() * 192, y = rng() * 192;
        ctx.strokeStyle = foundry ? 'rgba(122,145,152,.12)' : frost ? 'rgba(175,220,242,.2)' : storm ? 'rgba(150,162,201,.16)' : 'rgba(154,170,109,.23)';
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
      if (storm) {
        ctx.strokeStyle = '#41465a'; ctx.lineWidth = 2;
        for (let y = 32; y < 192; y += 64) { path(ctx, [[0, y], [192, y]], false); ctx.stroke(); }
        ctx.strokeStyle = '#282e3c'; path(ctx, [[96, 0], [96, 192]], false); ctx.stroke();
      }
      if (nexus) {
        for (let y = 0; y < 192; y += 96) for (let x = 0; x < 192; x += 96) {
          polygon(ctx, x + 48, y + 48, 46, 4, Math.PI / 4); ctx.strokeStyle = '#343747'; ctx.lineWidth = 1; ctx.stroke();
          circle(ctx, x + 48, y + 48, 2, '#555266');
        }
      }
      if (ruins) {
        ctx.strokeStyle = '#58604b'; ctx.lineWidth = 1;
        for (let y = 0; y < 192; y += 64) for (let x = 0; x < 192; x += 64) {
          path(ctx, [[x + 5, y + 4], [x + 59, y + 4], [x + 60, y + 60], [x + 4, y + 59]], false); ctx.stroke();
          path(ctx, [[x + 24, y + 17], [x + 36, y + 26], [x + 29, y + 38]], false); ctx.strokeStyle = '#77755c44'; ctx.stroke(); ctx.strokeStyle = '#58604b';
        }
      }
      if (voyage) {
        ctx.fillStyle = { cosmos: '#282d43', forge: '#363435', tide: '#294345' }[biome]; ctx.fillRect(0, 0, 192, 192);
        for (let y = 0; y < 192; y += 64) for (let x = 0; x < 192; x += 64) {
          polygon(ctx, x + 32, y + 32, 31, 6, Math.PI / 6); ctx.strokeStyle = biome === 'cosmos' ? '#3e415b' : biome === 'forge' ? '#4a4140' : '#3b5b5b'; ctx.lineWidth = 1; ctx.stroke();
          circle(ctx, x + 32, y + 32, 1.2, biome === 'cosmos' ? '#777293' : biome === 'forge' ? '#9a7454' : '#74aaa3');
          if (biome === 'forge') { ctx.fillStyle = '#5f484044'; ctx.fillRect(x + 12, y + 23, 40, 18); }
          if (biome === 'tide') { ctx.beginPath(); ctx.arc(x + 32, y + 32, 17, Math.PI * .1, Math.PI * .8); ctx.strokeStyle = '#50817b44'; ctx.stroke(); }
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
      this.touchControls = !!window.matchMedia?.('(pointer: coarse)').matches;
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
          case 'spark':
            this.burst(x, y, event.color || colors.amber, 4, 95, .22);
            break;
          case 'cargo-picked': case 'cargo-dropped': case 'cargo-delivered': {
            const delivered = event.type === 'cargo-delivered', color = event.color || '#ffe3a2';
            this.rings.push({ x, y, radius: delivered ? 82 : 29, age: 0, life: delivered ? .7 : .35, color });
            this.burst(x, y, color, delivered ? 12 : 5, delivered ? 105 : 65, delivered ? .6 : .3);
            break;
          }
          case 'voyage-device': case 'voyage-resonance': {
            const color = event.color || voyageDeviceColors[event.deviceId] || '#d2c4ff';
            this.burst(x, y, color, event.type === 'voyage-resonance' ? 12 : 5, 100, .35, event.angle);
            this.rings.push({ x, y, radius: Math.min(event.radius || 32, 180), age: 0, life: .4, color });
            if (Number.isFinite(event.endX) && Number.isFinite(event.endY)) this.arcs.push({ points: [[x, y], [event.endX, event.endY]], color, age: 0, life: .25 });
            break;
          }
          case 'voyage-objective': case 'voyage-room-complete': case 'voyage-complete':
            this.rings.push({ x, y, radius: event.type === 'voyage-complete' ? 130 : 60, age: 0, life: .8, color: event.color || '#b5f4db' });
            this.burst(x, y, event.color || '#b5f4db', 12, 100, .5);
            break;
          case 'voyage-room': case 'voyage-room-start':
            this.rings.push({ x, y, radius: 75, age: 0, life: .8, color: event.color || '#cab7ff' });
            this.burst(x, y, event.color || '#cab7ff', 9, 80, .5);
            break;
          case 'voyage-boss-phase':
            this.rings.push({ x, y, radius: 120, age: 0, life: .7, color: event.color || '#d8b8ff' }); this.burst(x, y, event.color || '#d8b8ff', 12, 95, .5);
            break;
          case 'voyage-boss-teleport':
            this.rings.push({ x, y, radius: 38, age: 0, life: .45, color: '#d8b8ff' }); this.burst(x, y, '#d8b8ff', 7, 80, .35);
            if (Number.isFinite(event.toX) && Number.isFinite(event.toY)) { this.rings.push({ x: event.toX, y: event.toY, radius: 44, age: 0, life: .4, color: '#ead7ff' }); this.burst(event.toX, event.toY, '#ead7ff', 7, 80, .35); }
            break;
          case 'star-pin':
            this.burst(x, y, '#b9ffe7', 3, 55, .22);
            break;
          case 'starline-created': case 'starline-trigger': {
            const color = event.color || '#8ff7db';
            this.burst(x, y, color, event.type === 'starline-created' ? 3 : 6, 75, .28);
            if (Number.isFinite(event.endX) && Number.isFinite(event.endY)) this.arcs.push({ points: [[event.startX ?? x, event.startY ?? y], [event.endX, event.endY]], color, age: 0, life: .24 });
            if (event.type === 'starline-trigger') this.rings.push({ x, y, radius: 23, age: 0, life: .28, color });
            break;
          }
          case 'starline-capture':
            this.burst(x, y, '#b8fff0', 4, 65, .25);
            this.rings.push({ x, y, radius: 19, age: 0, life: .25, color: '#b8fff0' });
            break;
          case 'relic-trigger':
            this.rings.push({ x, y, radius: 42, age: 0, life: .4, color: event.color || colors.cyan });
            this.burst(x, y, event.color || colors.cyan, 7, 70, .35);
            this.numbers.push({ x, y: y - 40, text: event.message || '遗物触发', age: 0, life: .9, color: event.color || colors.cyan, label: true });
            break;
          case 'encounter-start': case 'encounter-ready': case 'encounter-failed': case 'encounter-reward': {
            const color = event.type === 'encounter-failed' ? '#78858a' : event.type === 'encounter-ready' || event.type === 'encounter-reward' ? '#f4d994' : encounterColors[event.kind] || '#82efd0';
            this.rings.push({ x, y, radius: 48, age: 0, life: .55, color });
            this.burst(x, y, color, event.type === 'encounter-failed' ? 4 : 10, 90, .45);
            break;
          }
          case 'tactic-equipped': case 'tactic-trigger': {
            const color = tacticColors[event.tacticId];
            if (!color) break;
            this.burst(x, y, color, 8, 100, .35);
            if (event.tacticId === 'decoy-dash') {
              const cos = Math.cos(angle), sin = Math.sin(angle);
              this.arcs.push({ points: [[x - cos * 32 - sin * 16, y - sin * 32 + cos * 16], [x + cos * 12, y + sin * 12], [x - cos * 32 + sin * 16, y - sin * 32 - cos * 16]], color, age: 0, life: .35 });
            } else {
              const radius = event.tacticId === 'gravity-pulse' ? Math.min(event.radius || 75, 320) : event.stage === 'burst' ? Math.min(event.radius || 110, 180) : 35;
              this.rings.push({ x, y, radius, age: 0, life: .4, color });
              for (const target of (event.targets || []).slice(0, 6)) {
                if (![target.fromX, target.fromY, target.x, target.y].every(Number.isFinite)) continue;
                this.arcs.push({ points: [[target.fromX, target.fromY], [(target.fromX + target.x) / 2, (target.fromY + target.y) / 2 - 10], [target.x, target.y]], color, age: 0, life: .25 });
              }
            }
            break;
          }
          case 'awakening-acquired': case 'awakening-trigger': {
            const color = event.color || '#c4e9db', stage = event.stage;
            if (event.type === 'awakening-acquired') {
              this.rings.push({ x, y, radius: 54, age: 0, life: .65, color });
              this.burst(x, y, color, 10, 75, .5);
            } else if (stage === 'field-capture') {
              this.burst(x, y, color, 3, 58, .22);
              this.rings.push({ x, y, radius: 15, age: 0, life: .22, color });
            } else if (stage === 'interrupt') {
              this.rings.push({ x, y, radius: 25, age: 0, life: .3, color });
              this.burst(x, y, color, 4, 75, .25);
            } else if (stage === 'return' || stage === 'slide' || stage === 'relay') {
              this.burst(x, y, color, 6, 90, .3, angle);
            } else if (stage === 'relay-ready') {
              this.rings.push({ x, y, radius: 31, age: 0, life: .35, color });
            }
            break;
          }
          case 'secret-trigger': {
            const palette = { rebound: '#ffd28e', 'blade-relay': '#b4ffdc', 'bullet-reversal': '#74efff', 'fuse-resonance': '#ffae7d', 'rail-resonance': '#c8afff', 'ice-break': '#bdefff' };
            const color = event.color || palette[event.secretId];
            if (!color) break;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            if (event.secretId === 'rebound' || event.secretId === 'blade-relay') {
              this.burst(x, y, color, 8, 170, .3, angle);
              this.arcs.push({ points: [[x - cos * 12, y - sin * 12], [x + cos * 12 - sin * 6, y + sin * 12 + cos * 6], [x + cos * 46, y + sin * 46]], color, age: 0, life: .16 });
            } else if (event.secretId === 'rail-resonance') {
              this.burst(x, y, color, 6, 190, .25, angle);
              this.arcs.push({ points: [[x - cos * 38, y - sin * 38], [x - sin * 8, y + cos * 8], [x + cos * 24 + sin * 8, y + sin * 24 - cos * 8], [x + cos * 88, y + sin * 88]], color, age: 0, life: .2 });
            } else if (event.secretId === 'bullet-reversal') {
              const radius = Math.min(event.radius || 235, 320);
              this.rings.push({ x, y, radius, age: 0, life: .48, color, phase: true });
              this.rings.push({ x, y, radius: radius * .65, age: -.05, life: .36, color: '#dcfff4' });
              this.burst(x, y, color, 10, 170, .4);
            } else if (event.secretId === 'fuse-resonance') {
              this.rings.push({ x, y, radius: Math.min(event.radius || 75, 180), age: 0, life: .3, color });
              this.burst(x, y, color, 6, 110, .28);
            } else if (event.secretId === 'ice-break') {
              this.rings.push({ x, y, radius: Math.min(event.radius || 110, 180), age: 0, life: .48, color });
              const first = this.particles.length;
              this.burst(x, y, color, 14, 175, .5);
              for (let i = first; i < this.particles.length; i++) this.particles[i].ice = true;
            }
            break;
          }
          case 'secret-discovered':
            this.rings.push({ x, y, radius: 28, age: 0, life: .45, color: '#fff2be' });
            this.burst(x, y, '#fff2be', 5, 50, .4);
            break;
          case 'weapon-evolved': case 'evolution-trigger': {
            const color = evolutionColors[event.evolutionId];
            if (!color) break;
            if (event.type === 'weapon-evolved') {
              this.rings.push({ x, y, radius: 62, age: 0, life: .65, color });
              this.burst(x, y, color, 16, 100, .55);
            } else if (event.stage === 'echo') {
              this.rings.push({ x, y, radius: 110, age: 0, life: .4, color });
              this.rings.push({ x, y, radius: 66, age: 0, life: .3, color: '#ffe4b2' });
              this.burst(x, y, color, 12, 170, .4);
            } else if (event.stage === 'primed') {
              this.rings.push({ x, y, radius: 30, age: 0, life: .3, color });
              this.burst(x, y, color, 4, 55, .25);
            } else if (event.stage === 'breach' || event.stage === 'ricochet' || event.stage === 'twin') {
              const cos = Math.cos(angle), sin = Math.sin(angle);
              this.burst(x, y, color, event.stage === 'breach' ? 8 : 5, 140, .25, angle);
              const spread = event.stage === 'twin' ? 16 : 7, length = event.stage === 'breach' ? 72 : 40;
              this.arcs.push({ points: [[x + cos * 10 - sin * spread, y + sin * 10 + cos * spread], [x + cos * length, y + sin * length], [x + cos * 10 + sin * spread, y + sin * 10 - cos * spread]], color, age: 0, life: .18 });
            }
            break;
          }
          case 'shot': {
            const enemy = event.owner === 'enemy', weapon = event.weapon || 0;
            const reactor = !enemy && (event.reactor || this.overdrive);
            const c = enemy ? event.color || colors.pink : reactor ? '#ffe6a2' : event.overcharged ? '#efffbc' : weapon === 5 ? '#9ff7dd' : weapon === 4 ? '#96eaff' : weapon === 3 ? '#ffb37e' : weapon === 2 ? '#c6b5ff' : weapon === 1 ? colors.amber : '#98f6db';
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
          case 'conduction-charge': case 'boss-backlash': {
            const backlash = event.type === 'boss-backlash';
            this.rings.push({ x, y, radius: backlash ? 105 : 74, age: 0, life: .65, color: '#c1c3ff' });
            this.burst(x, y, '#b1edff', this.reducedMotion ? 5 : 14, 125, .45);
            this.numbers.push({ x, y: y - 53, text: backlash ? '雷暴反噬' : '引雷成功', age: 0, life: .9, color: '#d4edff', label: true });
            break;
          }
          case 'anchor-break': case 'nexus-shield-break': {
            const exposed = event.type === 'nexus-shield-break';
            this.rings.push({ x, y, radius: exposed ? 105 : 55, age: 0, life: .65, color: exposed ? '#ffe0a5' : '#c5bdff' });
            this.burst(x, y, exposed ? '#ffe0a5' : '#c5bdff', 14, 125, .55);
            break;
          }
          case 'campaign-stage':
            this.rings.push({ x, y, radius: 75, age: 0, life: .8, color: '#b8e7ef' });
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
                const offset = this.reducedMotion && event.evolutionId ? 0 : (Math.random() - 0.5) * 26;
                points.push([x + dx * i / 5 - dy / distance * offset, y + dy * i / 5 + dx / distance * offset]);
              }
              points.push([event.toX, event.toY]);
              this.arcs.push({ points, color: event.color || '#a7ebff', age: 0, life: event.evolutionId ? .22 : .18 });
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
      this.pointerHudTime = -1;
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
      const terrainKey = `${game.map?.id || 'frontier'}:${this.world.width}:${this.world.height}${game.voyage ? ':' + game.voyage.room.id : ''}`;
      if (terrainKey !== this.terrainKey) {
        this.mapId = game.map?.id || 'frontier'; this.terrainKey = terrainKey;
        this.terrainLayer = null; this.makeTerrain();
      }
      this.overdrive = (game.reactor?.timer || 0) > 0;
      this.overdriveProgress = clamp((game.reactor?.timer || 0) / (game.reactor?.duration || 7), 0, 1);
      this.doctrineId = game.campaign?.doctrineId || null;
      const p = game.player;
      this.interaction = game.interactionState?.();
      this.conductionHazard = (game.hazards || []).find(hazard => hazard.conductionRelayId != null && !hazard.resolved);
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
      this.targetDelivery = game.deliveryTarget?.(incompleteRelays.find(r => r.id === this.trackedRelayId)) || null;
      this.targetRelay = game.escort || incompleteRelays.find(r => r.id === this.trackedRelayId) || incompleteRelays.reduce((best, r) =>
        !best || Math.hypot(r.x - p.x, r.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? r : best, null);
      const contract = (game.contracts || []).find(item => item.id === this.trackedContractId && item.status !== 'complete');
      this.targetContract = contract ? { ...game.contractTarget(contract), name: contract.status === 'ready' ? '返回遗物终端' : contract.status === 'active' ? contract.kind === 'salvage' ? '勘探核心' : '支线目标' : contract.name } : null;
      const encounter = (game.encounters || []).find(item => item.id === this.trackedEncounterId && !['complete', 'failed'].includes(item.status));
      this.targetEncounter = encounter ? { ...game.encounterTarget(encounter), name: encounter.status === 'ready' ? '回收奖励' : encounter.name, color: encounterColors[encounter.kind] } : null;
      const smoothing = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 11);
      this.camera.x += (tx - this.camera.x) * smoothing;
      this.camera.y += (ty - this.camera.y) * smoothing;
      this.updatePointerHud();
      this.encounterLabelRects = [];
      this.stormHazardLabels = [];
      this.nexusPointerRects = [];
      this.encounterPlayerPoint = { x: (p.x - this.camera.x) * this.scale + this.width / 2, y: (p.y - this.camera.y) * this.scale + this.height / 2 };
      this.nexusLabelBlocks = (game.enemies || []).filter(e => e.windup > 0 && (e.variant === 'nexus' && e.attackKind === 'nexus-ring' || e.variant === 'voyage' && e.attackKind === 'voyage-ring')).map(e => {
        const x = (e.x - this.camera.x) * this.scale + this.width / 2, y = (e.y - this.camera.y) * this.scale + this.height / 2, radius = (e.radius + 21) * this.scale;
        return { left: x - radius, right: x + radius, top: y - radius, bottom: y + radius };
      });
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
      if (game.trial) this.drawTrialArena(game);
      if (this.mapId === 'nexus') this.drawNexusLinks(game);
      this.drawScars();
      this.drawStarlineFields(game);
      if (this.mapId === 'frost') this.drawEscortRoute(game);
      this.drawGrenadePreview(game);
      this.drawSecretFields(game);
      this.drawAwakeningFields(game);
      this.drawEvolutionFields(game);
      this.drawTactics(game);
      this.drawVoyageFields(game);
      this.drawVoyageRoom(game);
      for (const encounter of game.encounters || []) this.drawEncounterFields(encounter, p);
      for (const relay of game.relays || []) if (this.visible(relay.x, relay.y, (relay.radius || 147) + 40)) this.drawRelay(relay);
      this.drawDelivery(game);
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
      for (const encounter of game.encounters || []) if (this.visible(encounter.x, encounter.y, 110)) actors.push({ y: encounter.y, kind: 'encounter', data: encounter });
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
        else if (actor.kind === 'encounter') this.drawEncounter(actor.data, p);
        else if (actor.kind === 'enemy') this.drawEnemy(actor.data);
        else this.drawPlayer(actor.data);
      }
      for (const bullet of game.bullets || []) if (this.visible(bullet.x, bullet.y, 35)) this.drawBullet(bullet);
      this.drawEffects();
      for (const label of this.stormHazardLabels) {
        ctx.save(); ctx.translate(label.x, label.y); ctx.scale(1 / this.scale, 1 / this.scale);
        this.label(label.text, 0, 0, label.color); ctx.restore();
      }
      this.drawObjectivePointers(game);
      ctx.restore();
      this.drawVignette(p);
    }

    drawStarlineFields(game) {
      const ctx = this.ctx;
      ctx.save();
      for (const line of game.starLines || []) {
        const color = line.bridge ? '#8ff7db' : '#a8dec7';
        ctx.globalAlpha = clamp(line.remaining / .5, 0, 1) * .75;
        path(ctx, [[line.x, line.y], [line.endX, line.endY]], false);
        ctx.strokeStyle = '#152e29'; ctx.lineWidth = 5 / this.scale; ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 1.4 / this.scale; ctx.stroke();
        ctx.setLineDash([3 / this.scale, 10 / this.scale]); ctx.strokeStyle = '#c8fff0'; ctx.lineWidth = .7 / this.scale; ctx.stroke(); ctx.setLineDash([]);
      }
      for (const pin of game.starPins || []) {
        if (!this.visible(pin.x, pin.y, 20)) continue;
        ctx.globalAlpha = clamp(pin.remaining / .5, 0, 1);
        circle(ctx, pin.x, pin.y, 9, '#213832', pin.paired ? '#9ddbc6' : '#ffe2a2', 1.3 / this.scale);
        polygon(ctx, pin.x, pin.y, 5, 4, Math.PI / 4); ctx.fillStyle = '#d6ffea'; ctx.fill();
        if (!pin.paired) circle(ctx, pin.x, pin.y, 14, null, '#ffe2a266', 1 / this.scale);
      }
      const preview = game.starlinePreview?.();
      if (preview) {
        ctx.globalAlpha = game.player.reloadTimer > 0 || game.player.ammo === 0 ? .25 : .5;
        ctx.strokeStyle = preview.blocked ? '#a29179' : '#b0efda'; ctx.lineWidth = 1 / this.scale; ctx.setLineDash([3 / this.scale, 8 / this.scale]);
        path(ctx, [[preview.startX, preview.startY], [preview.x, preview.y]], false); ctx.stroke();
        if (preview.link) {
          ctx.strokeStyle = '#ffe3a4';
          path(ctx, [[preview.link.x, preview.link.y], [preview.link.endX, preview.link.endY]], false); ctx.stroke();
        }
        ctx.setLineDash([]); circle(ctx, preview.pinX, preview.pinY, 6, null, '#efffe3', 1 / this.scale);
      }
      ctx.restore();
    }

    drawCargoCrystal(x, y, color, carried = false) {
      const ctx = this.ctx;
      ctx.save(); ctx.translate(x, y);
      circle(ctx, 0, 5, carried ? 13 : 21, '#161f2899');
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.4) * 2;
      path(ctx, [[0, -19 + bob], [12, -6 + bob], [7, 12 + bob], [0, 19 + bob], [-7, 12 + bob], [-12, -6 + bob]]);
      ctx.fillStyle = '#5b675d'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      path(ctx, [[0, -17 + bob], [0, 16 + bob], [-9, -5 + bob], [9, -5 + bob]], false); ctx.strokeStyle = '#e8ffed'; ctx.lineWidth = 1; ctx.stroke();
      polygon(ctx, 0, -2 + bob, 5, 4, Math.PI / 4); ctx.fillStyle = color; ctx.fill();
      ctx.restore();
    }

    drawDelivery(game) {
      if (!game.delivery) return;
      const p = game.player, ctx = this.ctx;
      for (const cargo of game.delivery.cargos) {
        if (cargo.status === 'delivered') continue;
        const carried = cargo.status === 'carried';
        const x = carried ? p.x - Math.cos(p.angle || 0) * 32 : cargo.x, y = carried ? p.y - Math.sin(p.angle || 0) * 32 : cargo.y;
        if (!this.visible(x, y, 60)) continue;
        const color = cargo.color || '#ffe3a2';
        if (!carried) {
          ctx.save(); ctx.globalAlpha = .7;
          circle(ctx, x, y, 33, '#293a3033', color, 1.3 / this.scale);
          if (cargo.status === 'dropped') { ctx.setLineDash([4 / this.scale, 7 / this.scale]); circle(ctx, x, y, 41, null, '#fff0bc', 1 / this.scale); ctx.setLineDash([]); }
          ctx.restore();
        }
        this.drawCargoCrystal(x, y, color, carried);
        if (!carried && Math.hypot(p.x - x, p.y - y) < 265) this.drawEncounterLabel(this.interactionLabel(cargo, cargo.status === 'dropped' ? '回收掉落晶核' : '拾取晶核'), x, y - 47, color, true);
      }
    }

    drawGrenadePreview(game) {
      const preview = game.grenadePreview?.();
      if (!preview) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = game.player.reloadTimer > 0 || game.player.ammo === 0 ? .3 : .65;
      ctx.strokeStyle = '#ffd59a'; ctx.lineWidth = 1.4 / this.scale;
      ctx.setLineDash([6 / this.scale, 7 / this.scale]);
      path(ctx, [[preview.startX, preview.startY], [preview.x, preview.y]], false); ctx.stroke();
      if (preview.explodes) circle(ctx, preview.x, preview.y, preview.radius, null, '#ffd59a', 1 / this.scale);
      ctx.setLineDash([]);
      const size = 7 / this.scale;
      path(ctx, [[preview.x - size, preview.y], [preview.x + size, preview.y]], false); ctx.stroke();
      path(ctx, [[preview.x, preview.y - size], [preview.x, preview.y + size]], false); ctx.stroke();
      if (this.visible(preview.x, preview.y, 24)) this.label(preview.explodes ? '预计爆点' : '出界消失', preview.x, preview.y + 23 / this.scale, '#ffddb1');
      ctx.restore();
    }

    drawTrialArena(game) {
      const ctx = this.ctx, trial = game.trial;
      ctx.save();
      ctx.strokeStyle = '#c7a4f52b'; ctx.lineWidth = 2; ctx.setLineDash([14, 18]);
      ctx.beginPath(); ctx.ellipse(900, 700, 680, 510, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      circle(ctx, 900, 700, 145, null, '#c7a4f514', 1);
      circle(ctx, 900, 700, 175, null, '#c7a4f51d', 1);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '72px Georgia,serif'; ctx.fillStyle = '#cbb5ee16'; ctx.fillText('VI', 900, 700);
      for (let i = 0; i < 6; i++) {
        const angle = i * TAU / 6 - Math.PI / 2, completed = i < trial.completedWaves;
        circle(ctx, 900 + Math.cos(angle) * 160, 700 + Math.sin(angle) * 160, completed ? 5 : 3, completed ? '#c7efa2' : '#ad90d356');
      }
      for (const portal of trial.portals) {
        if (!this.visible(portal.x, portal.y, 60)) continue;
        const glow = trial.status === 'warning';
        circle(ctx, portal.x, portal.y, 34, glow ? '#bd8cff18' : '#5d456d15', glow ? '#d0adff90' : '#b596d54a', 1.5);
        ctx.save(); ctx.translate(portal.x, portal.y); ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = glow ? '#d9c0ff' : '#8971a9'; ctx.strokeRect(-14, -14, 28, 28); ctx.restore();
        circle(ctx, portal.x, portal.y, 4, glow ? '#e2ccff' : '#7d609b');
      }
      ctx.restore();
    }

    drawSecretFields(game) {
      const ctx = this.ctx, p = game.player, corridor = game.railCorridor;
      ctx.save();
      if (corridor && corridor.remaining > 0) {
        ctx.globalAlpha = Math.min(1, corridor.remaining / .2);
        ctx.lineWidth = corridor.width; ctx.strokeStyle = '#b39fff25';
        path(ctx, [[corridor.x, corridor.y], [corridor.endX, corridor.endY]], false); ctx.stroke();
        ctx.lineWidth = 1.5 / this.scale; ctx.strokeStyle = '#cfbfff'; ctx.setLineDash([9, 7]);
        path(ctx, [[corridor.x, corridor.y], [corridor.endX, corridor.endY]], false); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
      const target = p.skillCooldown <= 0 && !game.awakeningState?.charge && game.phase === 'playing' ? game.skillTarget?.() : null;
      if (target?.remote) {
        circle(ctx, target.x, target.y, target.radius, '#ffbf7920', '#ffd29d', 1.5 / this.scale);
        circle(ctx, target.x, target.y, 20, null, '#ffe2ad', 2 / this.scale);
        ctx.strokeStyle = '#ffd29d77'; ctx.lineWidth = 1 / this.scale; ctx.setLineDash([5, 8]);
        path(ctx, [[p.x, p.y], [target.x, target.y]], false); ctx.stroke(); ctx.setLineDash([]);
        if (this.visible(target.x, target.y, 40)) this.label('EMP 投送 · 身边无脉冲', target.x, target.y - 35, '#ffe2ad');
      }
      if (p.reversalAmmo > 0 && p.reversalTimer > 0) {
        for (let i = 0; i < p.reversalAmmo; i++) {
          const a = p.angle + Math.PI + (i - (p.reversalAmmo - 1) / 2) * .23;
          circle(ctx, p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, 2.5, '#aaffee');
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, 36, -Math.PI / 2, -Math.PI / 2 + TAU * p.reversalTimer / 2.5);
        ctx.strokeStyle = '#74efff99'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (p.iceChaseReady) circle(ctx, p.x, p.y, 24, null, '#bdefff', 2);
      ctx.restore();
    }

    drawAwakeningFields(game) {
      const state = game.awakeningState, p = game.player;
      if (!state || !game.campaign?.awakeningId || ['ready', 'won', 'lost', 'campaign-rest'].includes(game.phase)) return;
      const ctx = this.ctx, anchor = state.returnAnchor, field = state.field, charge = state.charge;
      ctx.save();
      if (anchor && anchor.remaining > 0) {
        const color = '#8cf5d3', angle = Math.atan2(anchor.y - p.y, anchor.x - p.x);
        ctx.globalAlpha = .35; ctx.strokeStyle = color; ctx.lineWidth = 1 / this.scale; ctx.setLineDash([4, 10]);
        path(ctx, [[p.x, p.y], [anchor.x, anchor.y]], false); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        polygon(ctx, anchor.x, anchor.y, 10, 4); ctx.strokeStyle = color; ctx.lineWidth = 1.5 / this.scale; ctx.stroke();
        ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(anchor.remaining / 1.4, 0, 1)); ctx.stroke();
        if (Math.hypot(anchor.x - p.x, anchor.y - p.y) > 45) {
          ctx.save(); ctx.translate(p.x + Math.cos(angle) * 37, p.y + Math.sin(angle) * 37); ctx.rotate(angle);
          path(ctx, [[-4, -4], [2, 0], [-4, 4]], false); ctx.stroke(); ctx.restore();
        }
        this.drawEncounterLabel('折返方向 · ' + anchor.remaining.toFixed(1) + 's', anchor.x, anchor.y - 28, color, true);
      }
      if (field && field.remaining > 0) {
        const color = '#b6eedf', radius = field.radius;
        ctx.setLineDash([5, 10]); circle(ctx, p.x, p.y, radius, null, '#8cdbca77', 1 / this.scale); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(field.remaining / field.duration, 0, 1));
        ctx.strokeStyle = color; ctx.lineWidth = 1.7 / this.scale; ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const angle = -Math.PI / 2 + i * TAU / 8;
          circle(ctx, p.x + Math.cos(angle) * (radius - 7), p.y + Math.sin(angle) * (radius - 7), 1.7 / this.scale, i < field.captured ? '#536866' : color);
        }
      }
      if (charge && charge.remaining > 0) {
        const target = game.skillTarget(), progress = 1 - clamp(charge.remaining / charge.duration, 0, 1), radius = target.radius;
        circle(ctx, target.x, target.y, radius, null, '#c9b3ff77', 1 / this.scale);
        ctx.setLineDash([3, 10]); circle(ctx, target.x, target.y, radius * 1.2, null, '#d8c8ff66', 1 / this.scale); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(target.x, target.y, 23, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
        ctx.strokeStyle = '#e6dbff'; ctx.lineWidth = 2.5 / this.scale; ctx.stroke();
        polygon(ctx, target.x, target.y, 6, 4); ctx.strokeStyle = '#d6c1ff'; ctx.lineWidth = 1.5 / this.scale; ctx.stroke();
        if (target.remote) {
          ctx.globalAlpha = .3; ctx.setLineDash([3, 10]);
          path(ctx, [[p.x, p.y], [target.x, target.y]], false); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        this.drawEncounterLabel((target.remote ? '远端蓄能' : '脉冲蓄能') + ' ' + charge.remaining.toFixed(1) + 's · 再按提前释放', target.x, target.y - 39, '#e2d2ff', true);
      }
      if (state.relayTimer > 0) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 34, Math.PI * .1, Math.PI * .1 + Math.PI * .7 * clamp(state.relayTimer / 3, 0, 1));
        ctx.strokeStyle = '#ffd18c'; ctx.lineWidth = 2 / this.scale; ctx.stroke();
        this.drawEncounterLabel('切枪接力 · ' + state.relayTimer.toFixed(1) + 's', p.x, p.y + 47, '#ffdfad', true);
      }
      ctx.restore();
    }

    drawEvolutionFields(game) {
      const ctx = this.ctx, state = game.evolutionState, player = game.player;
      if (!state) return;
      for (const echo of state.echoes) {
        if (echo.remaining <= 0 || !this.visible(echo.x, echo.y, echo.radius)) continue;
        const progress = 1 - clamp(echo.remaining / echo.duration, 0, 1);
        ctx.save();
        ctx.setLineDash([5, 9]); circle(ctx, echo.x, echo.y, echo.radius, null, '#ffbb8377', 1 / this.scale); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(echo.x, echo.y, echo.radius, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
        ctx.strokeStyle = '#ffd6a3'; ctx.lineWidth = 2 / this.scale; ctx.stroke();
        polygon(ctx, echo.x, echo.y, 9, 4, 0); ctx.strokeStyle = '#ffbb83'; ctx.lineWidth = 2; ctx.stroke();
        circle(ctx, echo.x, echo.y, 3, '#ffdfa9');
        ctx.restore();
      }
      if (game.evolutionId === 'shotgun-breach' && player.weapon === 1 && state.breachTimer > 0) {
        ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle || 0);
        ctx.strokeStyle = '#ffda92'; ctx.lineWidth = 2 / this.scale;
        for (const y of [-8, 0, 8]) { path(ctx, [[39, y - 3], [45, y], [39, y + 3]], false); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(0, 0, 52, -.4, -.4 + .8 * clamp(state.breachTimer / 2, 0, 1)); ctx.stroke();
        ctx.restore();
      }
    }

    drawTactics(game) {
      const ctx = this.ctx, decoy = game.tactical?.decoy, mine = game.tactical?.mine;
      if (decoy && decoy.remaining > 0 && this.visible(decoy.x, decoy.y, decoy.radius)) {
        ctx.save();
        ctx.globalAlpha = .22;
        ctx.setLineDash([4, 14]); circle(ctx, decoy.x, decoy.y, decoy.radius, null, '#99eadf', 1 / this.scale); ctx.setLineDash([]);
        ctx.globalAlpha = .5;
        box(ctx, decoy.x - 12, decoy.y - 6, 24, 24, 5, '#99eadf22', '#99eadf');
        circle(ctx, decoy.x, decoy.y - 12, 8, '#99eadf33', '#ccfff1', 2);
        path(ctx, [[decoy.x - 18, decoy.y + 3], [decoy.x + 18, decoy.y + 3]], false); ctx.strokeStyle = '#99eadf'; ctx.lineWidth = 2; ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(decoy.x, decoy.y, 31, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(decoy.remaining / 2, 0, 1));
        ctx.strokeStyle = '#99eadf'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
      if (mine && mine.remaining > 0 && this.visible(mine.x, mine.y, mine.radius)) {
        ctx.save();
        ctx.setLineDash([3, 9]); circle(ctx, mine.x, mine.y, mine.radius, null, '#ffd08b77', 1 / this.scale); ctx.setLineDash([]);
        polygon(ctx, mine.x, mine.y, 12, 6, Math.PI / 6); ctx.fillStyle = '#3b3930'; ctx.fill(); ctx.strokeStyle = '#ffd08b'; ctx.lineWidth = 2; ctx.stroke();
        circle(ctx, mine.x, mine.y, 4, '#ffe6b6');
        ctx.beginPath(); ctx.arc(mine.x, mine.y, 18, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(mine.remaining / 5, 0, 1));
        ctx.strokeStyle = '#ffd08b'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
    }

    encounterStatus(encounter) {
      if (encounter.status === 'ready') return '回收奖励';
      if (encounter.status === 'complete') return '已回收';
      if (encounter.status === 'failed') return '挑战结束';
      if (encounter.status !== 'active') return '启动挑战';
      const progress = encounter.kind === 'rings' ? Math.floor(encounter.progress) + '/' + encounter.goal + 's' : encounter.progress + '/' + encounter.goal;
      return progress + ' · ' + Math.max(0, Math.ceil(encounter.remaining)) + 's';
    }

    drawEncounterLabel(text, x, y, color, deferStormLabel = false) {
      const ctx = this.ctx, previousFont = ctx.font;
      ctx.font = '600 11px "Segoe UI", "Microsoft YaHei", sans-serif';
      const width = ctx.measureText(text).width + 15;
      ctx.font = previousFont;
      const sx = (x - this.camera.x) * this.scale + this.width / 2, sy = (y - this.camera.y) * this.scale + this.height / 2;
      const blocked = [...(this.pointerHud?.blocks || []), ...(this.encounterLabelRects || []), ...(this.nexusLabelBlocks || []), ...(this.nexusPointerRects || [])], player = this.encounterPlayerPoint;
      if (player) blocked.push({ left: player.x - 25, right: player.x + 29, top: player.y - 27, bottom: player.y + 27 });
      let placement = null;
      for (const [dx, dy] of [[0, 0], [0, -28], [0, 28], [-width / 2 - 34, 0], [width / 2 + 34, 0], [0, -56], [0, 56], [0, -84], [0, -112]]) {
        const rect = { left: sx + dx - width / 2, right: sx + dx + width / 2, top: sy + dy - 13, bottom: sy + dy + 8 };
        if (rect.left < 6 || rect.right > this.width - 6 || rect.top < 6 || rect.bottom > this.height - 6) continue;
        if (blocked.some(b => rect.left < b.right + 4 && rect.right > b.left - 4 && rect.top < b.bottom + 4 && rect.bottom > b.top - 4)) continue;
        placement = { dx, dy, rect }; break;
      }
      if (!placement) return;
      (this.encounterLabelRects ||= []).push(placement.rect);
      if (deferStormLabel) {
        (this.stormHazardLabels ||= []).push({ text, x: x + placement.dx / this.scale, y: y + placement.dy / this.scale, color });
        return;
      }
      ctx.save(); ctx.translate(x + placement.dx / this.scale, y + placement.dy / this.scale); ctx.scale(1 / this.scale, 1 / this.scale);
      this.label(text, 0, 0, color); ctx.restore();
    }

    drawEncounterFields(encounter, player) {
      if (encounter.status !== 'active' || encounter.kind === 'hunt') return;
      const ctx = this.ctx, nodes = encounter.nodes, color = encounterColors[encounter.kind];
      ctx.save();
      if (encounter.kind === 'race') {
        ctx.strokeStyle = color + '55'; ctx.lineWidth = 1.2 / this.scale; ctx.setLineDash([7, 10]);
        path(ctx, [[encounter.x, encounter.y], ...nodes.map(node => [node.x, node.y])], false); ctx.stroke(); ctx.setLineDash([]);
      }
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index], current = index === encounter.activeNode, collected = node.collected;
        if (!this.visible(node.x, node.y, node.radius + 55)) continue;
        circle(ctx, node.x, node.y, node.radius, current ? color + '13' : null, collected ? '#748f80' : color + (current ? 'dd' : '55'), (current ? 2.5 : 1) / this.scale);
        if (current) {
          circle(ctx, node.x, node.y, node.radius + 6, null, color + '70', 1 / this.scale);
          if (encounter.kind === 'rings') {
            ctx.beginPath(); ctx.arc(node.x, node.y, node.radius + 10, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(encounter.progress / encounter.goal, 0, 1));
            ctx.strokeStyle = '#d4ebff'; ctx.lineWidth = 3 / this.scale; ctx.stroke();
          }
        }
        ctx.font = '600 ' + (13 / this.scale) + 'px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = collected ? '#78988a' : color; ctx.fillText(collected ? '✓' : String(index + 1), node.x, node.y - (encounter.kind === 'rings' ? node.radius * .55 : 0));
        if (current && Math.hypot(player.x - node.x, player.y - node.y) < 260) {
          const detail = encounter.kind === 'rings' ? '站稳此圈 · 换环 ' + (Math.ceil((4 - (encounter.elapsed || 0) % 4) * 10) / 10).toFixed(1) + 's'
            : '穿过此节点 · ' + Math.max(0, Math.ceil(encounter.remaining)) + 's';
          this.drawEncounterLabel(detail, node.x, node.y + node.radius + 22, color);
        }
      }
      ctx.restore();
    }

    drawEncounter(encounter, player) {
      const ctx = this.ctx, done = encounter.status === 'complete' || encounter.status === 'failed', ready = encounter.status === 'ready';
      const color = done ? '#667d79' : ready ? '#f4d994' : encounterColors[encounter.kind];
      ctx.save(); ctx.translate(encounter.x, encounter.y);
      ctx.globalAlpha = done ? .55 : 1;
      ctx.beginPath(); ctx.ellipse(0, 16, 32, 14, 0, 0, TAU); ctx.fillStyle = '#102326aa'; ctx.fill();
      if (encounter.kind === 'race') {
        box(ctx, -23, -26, 10, 47, 3, '#28423f', color); box(ctx, 13, -26, 10, 47, 3, '#28423f', color);
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        for (const y of [-15, -2, 11]) { path(ctx, [[-8, y + 4], [0, y - 3], [8, y + 4]], false); ctx.stroke(); }
      } else if (encounter.kind === 'rings') {
        box(ctx, -8, -30, 16, 56, 4, '#25394d', color);
        circle(ctx, -14, -3, 17, '#1d344d', color, 2); circle(ctx, 14, -3, 17, '#1d344d', color, 2);
        circle(ctx, -14, -3, 5, color); circle(ctx, 14, -3, 5, null, color, 2);
      } else {
        polygon(ctx, 0, -2, 31, 3, -Math.PI / 2); ctx.fillStyle = '#443631'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        circle(ctx, 0, -1, 12, null, color, 2);
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        path(ctx, [[-17, -1], [17, -1]], false); ctx.stroke(); path(ctx, [[0, -18], [0, 16]], false); ctx.stroke();
      }
      if (ready) {
        const radius = 39 + (this.reducedMotion ? 0 : Math.sin(this.time * 3) * 2);
        circle(ctx, 0, 0, radius, null, color, 2); polygon(ctx, 0, -48, 7, 4); ctx.fillStyle = color; ctx.fill();
      }
      ctx.restore();
      if (Math.hypot(player.x - encounter.x, player.y - encounter.y) < 260) {
        this.drawEncounterLabel(encounter.name, encounter.x, encounter.y - (ready ? 68 : 46), color);
        const detail = ready ? (this.interaction?.target === encounter ? this.touchControls ? '点按 · ' : 'E · ' : '') + '回收奖励'
          : this.interactionLabel(encounter, this.encounterStatus(encounter));
        this.drawEncounterLabel(detail, encounter.x, encounter.y + 50, color);
      }
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
      if (game.voyage) { this.paintVoyageTerrain(game); return; }
      if (this.mapId === 'nexus') { this.paintNexusTerrain(game); return; }
      if (this.mapId === 'ruins') { this.paintRuinsTerrain(game); return; }
      if (this.mapId === 'storm') { this.paintStormTerrain(game); return; }
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

    paintVoyageTerrain(game) {
      const ctx = this.ctx, { width: w, height: h } = this.world, biome = game.voyage.room.biome, color = voyageColors[biome], cx = w / 2, cy = h / 2;
      const glow = ctx.createRadialGradient(cx, cy, 80, cx, cy, h * .7);
      glow.addColorStop(0, biome === 'cosmos' ? '#65599128' : biome === 'forge' ? '#ca794122' : '#529e9224'); glow.addColorStop(1, '#00000000');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      for (const radius of [155, 340, 520]) {
        circle(ctx, cx, cy, radius, null, biome === 'cosmos' ? '#61597a66' : biome === 'forge' ? '#806d5166' : '#628b8266', 2);
        if (biome === 'cosmos') for (let i = 0; i < 8; i++) {
          const angle = i * TAU / 8; polygon(ctx, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 4, 4, angle); ctx.fillStyle = '#9387b566'; ctx.fill();
        }
      }
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(i * TAU / 6);
        path(ctx, [[80, 0], [132, 0], [155, 17], [300, 17], [324, 0], [h * .43, 0]], false);
        ctx.strokeStyle = biome === 'forge' ? '#242728' : '#202a39'; ctx.lineWidth = biome === 'forge' ? 32 : 12; ctx.stroke();
        ctx.strokeStyle = biome === 'cosmos' ? '#77709066' : biome === 'forge' ? '#a67a5066' : '#7fb4a466'; ctx.lineWidth = 2; ctx.setLineDash([7, 17]); ctx.stroke(); ctx.setLineDash([]);
        if (biome === 'forge') for (let x = 190; x < h * .43; x += 45) { path(ctx, [[x, -10], [x + 8, 0], [x, 10]], false); ctx.strokeStyle = '#8b795f66'; ctx.stroke(); }
        ctx.restore();
      }
      polygon(ctx, cx, cy, 64, biome === 'tide' ? 6 : 8, Math.PI / 8); ctx.fillStyle = biome === 'forge' ? '#45403a' : biome === 'tide' ? '#304e50' : '#33364c'; ctx.fill(); ctx.strokeStyle = color + '66'; ctx.lineWidth = 2; ctx.stroke();
      polygon(ctx, cx, cy, 29, 3, -Math.PI / 2); ctx.strokeStyle = color + '88'; ctx.stroke();
      const spawn = game.spawn || { x: cx, y: h - 200 };
      circle(ctx, spawn.x, spawn.y, 58, null, color + '88', 2);
      ctx.font = '600 12px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color + 'bb';
      ctx.fillText({ cosmos: 'ASTRAL OBSERVATORY', forge: 'SOLAR ENGINE DECK', tide: 'TIDAL ARRAY' }[biome], cx, cy + 103);
      ctx.font = '10px Consolas, monospace'; ctx.fillText('VOYAGE / ' + (game.voyage.room.id || '').toUpperCase(), cx, cy + 122);
      ctx.strokeStyle = biome === 'forge' ? '#75624c' : biome === 'tide' ? '#597b76' : '#666078'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = color + 'aa'; ctx.lineWidth = 2; ctx.setLineDash([12, 22]); ctx.strokeRect(26, 26, w - 52, h - 52); ctx.setLineDash([]);
      for (let x = 80; x < w; x += 160) for (const y of [29, h - 29]) circle(ctx, x, y, 2.5, color + '99');
    }

    drawVoyageRoom(game) {
      if (!game.voyage || !['playing', 'upgrade'].includes(game.phase)) return;
      const ctx = this.ctx, room = game.voyage.room, color = voyageColors[room.biome] || '#c8b7ff';
      for (const portal of room.portals || []) {
        if (!this.visible(portal.x, portal.y, 32)) continue;
        ctx.save(); ctx.translate(portal.x, portal.y); circle(ctx, 0, 0, portal.radius, null, '#ac85b455', 1.5);
        for (let i = 0; i < 3; i++) { const a = i * TAU / 3; path(ctx, [[Math.cos(a) * 11, Math.sin(a) * 11], [Math.cos(a + .2) * 23, Math.sin(a + .2) * 23]], false); ctx.strokeStyle = '#be8ecf77'; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.restore();
      }
      for (const node of room.collectors || []) {
        if (!this.visible(node.x, node.y, node.radius + 35)) continue;
        const active = node.status === 'active', charge = clamp(node.charge / node.goal, 0, 1);
        ctx.save(); ctx.translate(node.x, node.y);
        circle(ctx, 0, 0, node.radius, null, active ? '#81ad9888' : '#7ad7bf77', 2);
        if (!active) { ctx.setLineDash([5, 16]); circle(ctx, 0, 0, node.radius - 7, null, '#74b8a566', 1); ctx.setLineDash([]); }
        polygon(ctx, 0, 0, 27, 6, Math.PI / 6); ctx.fillStyle = '#23443f'; ctx.fill(); ctx.strokeStyle = active ? '#b7f5ce' : '#94eadf'; ctx.lineWidth = 2; ctx.stroke();
        circle(ctx, 0, 0, 12, active ? '#d9ffe9' : '#6cbcae', '#c9f8df', 1);
        for (let i = 0; i < node.goal; i++) { const a = -Math.PI / 2 + i * TAU / node.goal; circle(ctx, Math.cos(a) * 38, Math.sin(a) * 38, 4.5, i < node.charge ? '#cef7bc' : '#416d60', '#8db49e', 1); }
        ctx.beginPath(); ctx.arc(0, 0, 47, -Math.PI / 2, -Math.PI / 2 + TAU * charge); ctx.strokeStyle = '#cefac4'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        if (Math.hypot(game.player.x - node.x, game.player.y - node.y) < node.radius + 80) this.drawEncounterLabel(active ? '收割器已充满' : '圈内击杀充能 · ' + node.charge + '/' + node.goal, node.x, node.y - 63, '#c5f4d8', true);
      }
      const exit = room.exit;
      if (!exit || !this.visible(exit.x, exit.y, 80)) return;
      ctx.save(); ctx.translate(exit.x, exit.y);
      circle(ctx, 0, 0, exit.radius, null, exit.ready ? '#b9fae1' : '#6d7e8b', 2);
      const spin = this.reducedMotion ? 0 : this.time * .4;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, exit.radius + 9, spin + i * TAU / 3, spin + i * TAU / 3 + 1.5); ctx.strokeStyle = exit.ready ? color : '#728090'; ctx.lineWidth = 3; ctx.stroke(); }
      path(ctx, [[-8, 9], [6, 0], [-8, -9], [-8, -4], [0, 0], [-8, 4]]); ctx.fillStyle = exit.ready ? '#d7ffe9' : '#788898'; ctx.fill(); ctx.restore();
      if (exit.ready || Math.hypot(game.player.x - exit.x, game.player.y - exit.y) < 200) this.drawEncounterLabel(exit.ready ? this.interactionLabel(exit, '进入跃迁门') : '跃迁门 · 完成目标后开启', exit.x, exit.y - exit.radius - 30, exit.ready ? '#c7f8e0' : '#a8b7c1', true);
    }

    drawVoyageFields(game) {
      if (!game.voyage || !['playing', 'upgrade'].includes(game.phase)) return;
      const ctx = this.ctx, state = game.voyage.effects, p = game.player;
      if (!state) return;
      for (const trail of state.trails || []) {
        const length = Math.hypot(trail.endX - trail.x, trail.endY - trail.y), radius = trail.width / 2;
        ctx.save(); ctx.translate(trail.x, trail.y); ctx.rotate(Math.atan2(trail.endY - trail.y, trail.endX - trail.x));
        ctx.globalAlpha *= clamp(trail.remaining / trail.duration, .15, .85); ctx.beginPath(); roundedPath(ctx, -radius, -radius, length + radius * 2, radius * 2, radius);
        ctx.strokeStyle = voyageDeviceColors.afterimage; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([7, 9]);
        path(ctx, [[0, 0], [length, 0]], false); ctx.strokeStyle = '#cefbed'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      }
      if (state.mirrorTimer > 0) for (const side of [-1, 1]) { polygon(ctx, p.x + side * 24, p.y - 20, 4, 4, Math.PI / 4); ctx.fillStyle = voyageDeviceColors.mirror; ctx.fill(); }
      if (state.needleTimer > 0) for (let i = 0; i < 3; i++) { path(ctx, [[p.x - 10 + i * 9, p.y + 25], [p.x - 7 + i * 9, p.y + 32], [p.x - 4 + i * 9, p.y + 25]], false); ctx.strokeStyle = voyageDeviceColors.needles; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (state.batteryTimer > 0) for (let i = 0; i < Math.min(3, state.batteryCharges); i++) circle(ctx, p.x + (i - 1) * 8, p.y + 39, 2.5, voyageDeviceColors.battery);
      const sentry = state.sentry;
      if (sentry && this.visible(sentry.x, sentry.y, 35)) {
        ctx.save(); ctx.translate(sentry.x, sentry.y); polygon(ctx, 0, 0, sentry.radius, 6, Math.PI / 6); ctx.fillStyle = '#4c4737'; ctx.fill(); ctx.strokeStyle = voyageDeviceColors.sentry; ctx.lineWidth = 2; ctx.stroke();
        circle(ctx, 0, 0, 5, '#fff8d7'); for (let i = 0; i < sentry.maxShots; i++) circle(ctx, (i - .5) * 8, 24, 2.5, i < sentry.maxShots - sentry.shots ? voyageDeviceColors.sentry : '#756e54');
        ctx.beginPath(); ctx.arc(0, 0, sentry.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(sentry.remaining / sentry.duration, 0, 1)); ctx.strokeStyle = voyageDeviceColors.sentry; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      }
      const well = state.well;
      if (well && this.visible(well.x, well.y, well.radius + 20)) {
        ctx.save(); ctx.translate(well.x, well.y); circle(ctx, 0, 0, well.radius, null, voyageDeviceColors.well, 2);
        ctx.setLineDash([6, 11]); circle(ctx, 0, 0, well.radius - 6, null, voyageDeviceColors.well + '55', 1.5); ctx.setLineDash([]);
        const spin = this.reducedMotion ? 0 : this.time * .5;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, well.radius * (.24 + i * .19), spin + i * 1.6, spin + i * 1.6 + 1.7); ctx.strokeStyle = voyageDeviceColors.well + '99'; ctx.lineWidth = 2; ctx.stroke(); }
        circle(ctx, 0, 0, 7, '#e3dbff'); ctx.beginPath(); ctx.arc(0, 0, well.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(well.remaining / well.duration, 0, 1)); ctx.strokeStyle = '#d5ddff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
    }

    paintRuinsTerrain(game) {
      const ctx = this.ctx, { width: w, height: h } = this.world, spawn = game.spawn || this.spawn;
      for (const d of this.decor) {
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle);
        if (d.kind === 'ruin') {
          box(ctx, -d.size * 1.6, -12, d.size * 3.2, 24, 2, '#29352e', '#797762');
          path(ctx, [[-d.size, -9], [-3, 1], [d.size * .7, -5]], false); ctx.strokeStyle = '#464c3d'; ctx.lineWidth = 3; ctx.stroke();
        } else if (d.kind === 'shrub') {
          polygon(ctx, 0, 0, d.size, 3, 0); ctx.fillStyle = '#4a5543'; ctx.fill();
          polygon(ctx, 0, 0, d.size * .4, 3, 0); ctx.fillStyle = '#777c5b'; ctx.fill();
        } else { path(ctx, [[-d.size, 0], [d.size, 0]], false); ctx.strokeStyle = '#565c4844'; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.restore();
      }
      for (const [i, relay] of (game.relays || []).entries()) {
        const cargo = game.delivery?.cargos.find(item => item.relayId === relay.id);
        if (cargo) {
          path(ctx, [[cargo.x, cargo.y], [(cargo.x + relay.x) / 2, cargo.y], [relay.x, relay.y]], false);
          ctx.strokeStyle = '#27362e'; ctx.lineWidth = 55; ctx.stroke(); ctx.strokeStyle = '#80795766'; ctx.lineWidth = 2; ctx.setLineDash([6, 31]); ctx.stroke(); ctx.setLineDash([]);
          polygon(ctx, cargo.x, cargo.y, 62, 6, Math.PI / 6); ctx.fillStyle = '#394336'; ctx.fill(); ctx.strokeStyle = '#827d60'; ctx.lineWidth = 2; ctx.stroke();
          ctx.font = '11px Consolas, monospace'; ctx.fillStyle = '#bdbe91'; ctx.textAlign = 'center'; ctx.fillText('STAR SEED / 0' + (i + 1), cargo.x, cargo.y + 88);
        }
        circle(ctx, relay.x, relay.y, 138, null, '#85826855', 2);
        for (let n = 0; n < 4; n++) {
          const a = Math.PI / 4 + n * TAU / 4, x = relay.x + Math.cos(a) * 145, y = relay.y + Math.sin(a) * 145;
          box(ctx, x - 12, y - 19, 24, 38, 2, '#29352f', '#8a8465'); ctx.fillStyle = '#b1a97655'; ctx.fillRect(x - 3, y - 12, 6, 25);
        }
        ctx.font = '700 23px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#bbb78a'; ctx.fillText('ASTRAL GATE / 0' + (i + 1), relay.x, relay.y + 190);
      }
      if (spawn) {
        polygon(ctx, spawn.x, spawn.y, 120, 6, Math.PI / 6); ctx.fillStyle = '#3c4b39'; ctx.fill(); ctx.strokeStyle = '#b7b784'; ctx.lineWidth = 3; ctx.stroke();
        circle(ctx, spawn.x, spawn.y, 55, null, '#809f86', 2);
        ctx.font = '600 13px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#c8c993'; ctx.fillText('ASTRAL RUINS / 05', spawn.x, spawn.y + 93);
      }
      ctx.strokeStyle = '#74785b'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#bdb785'; ctx.lineWidth = 2; ctx.setLineDash([10, 26]); ctx.strokeRect(26, 26, w - 52, h - 52); ctx.setLineDash([]);
    }

    paintNexusTerrain(game) {
      const ctx = this.ctx, { width: w, height: h } = this.world, cx = w / 2, cy = h / 2;
      polygon(ctx, cx, cy, Math.min(w, h) * .43, 8, Math.PI / 8);
      ctx.fillStyle = '#292e40'; ctx.fill(); ctx.strokeStyle = '#555168'; ctx.lineWidth = 5; ctx.stroke();
      for (const radius of [190, 350, 515]) {
        circle(ctx, cx, cy, radius, null, '#424356', 3);
        for (let i = 0; i < 8; i++) {
          const angle = i * TAU / 8;
          ctx.beginPath(); ctx.arc(cx, cy, radius - 8, angle + .06, angle + .45);
          ctx.strokeStyle = i % 2 ? '#665b66' : '#546f79'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(i * TAU / 8);
        path(ctx, [[75, 0], [178, 0], [198, 17], [327, 17], [350, 0], [505, 0]], false);
        ctx.strokeStyle = '#181f30'; ctx.lineWidth = 14; ctx.stroke();
        ctx.strokeStyle = '#656177'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
      polygon(ctx, cx, cy, 74, 6, Math.PI / 6); ctx.fillStyle = '#222639'; ctx.fill(); ctx.strokeStyle = '#767087'; ctx.lineWidth = 2; ctx.stroke();
      polygon(ctx, cx, cy, 46, 3, -Math.PI / 2); ctx.strokeStyle = '#8a8291'; ctx.stroke();
      const spawn = game.spawn || { x: cx, y: h - 250 };
      circle(ctx, spawn.x, spawn.y, 61, '#293747', '#658692', 2);
      ctx.font = '600 12px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#84909e';
      ctx.fillText('RIFT NEXUS / FINAL', spawn.x, spawn.y + 89);
      ctx.strokeStyle = '#5b546d'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#a08b72'; ctx.lineWidth = 2; ctx.setLineDash([12, 24]); ctx.strokeRect(26, 26, w - 52, h - 52); ctx.setLineDash([]);
    }

    drawNexusLinks(game) {
      const ctx = this.ctx;
      ctx.save(); ctx.globalAlpha = .35; ctx.lineWidth = 2; ctx.strokeStyle = '#c2b6ff';
      for (const anchor of game.enemies || []) {
        if (anchor.type !== 'anchor' || anchor.hp <= 0) continue;
        const boss = game.enemies.find(enemy => enemy.id === anchor.anchorBossId && enemy.hp > 0 && enemy.shielded);
        if (!boss) continue;
        const angle = Math.atan2(boss.y - anchor.y, boss.x - anchor.x);
        path(ctx, [[anchor.x + Math.cos(angle) * anchor.radius, anchor.y + Math.sin(angle) * anchor.radius],
          [boss.x - Math.cos(angle) * boss.radius, boss.y - Math.sin(angle) * boss.radius]], false); ctx.stroke();
      }
      ctx.restore();
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

    paintStormTerrain(game) {
      const ctx = this.ctx, { width: w, height: h } = this.world, spawn = game.spawn || this.spawn || { x: w / 2, y: h / 2 };
      for (const d of this.decor) {
        if (Math.hypot(d.x - spawn.x, d.y - spawn.y) < 150 || (game.relays || []).some(r => Math.hypot(d.x - r.x, d.y - r.y) < r.radius + 50)) continue;
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle);
        if (d.kind === 'ruin') {
          box(ctx, -d.size * 2, -10, d.size * 4, 20, 2, '#252b38', '#5c5a66');
          for (let x = -d.size * 1.6; x < d.size * 1.7; x += 9) { ctx.fillStyle = '#7c6355'; ctx.fillRect(x, -7, 3, 14); }
        } else if (d.kind === 'shrub') {
          ctx.beginPath(); ctx.ellipse(0, 0, d.size * 1.8, d.size * .6, 0, 0, TAU); ctx.fillStyle = '#253848'; ctx.fill();
          ctx.strokeStyle = '#465a76'; ctx.lineWidth = 1; ctx.stroke();
        } else {
          path(ctx, [[-d.size, 0], [0, 3], [d.size, -3]], false); ctx.strokeStyle = '#555163'; ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.restore();
      }
      for (const [index, relay] of (game.relays || []).entries()) {
        const points = [[spawn.x, spawn.y], [relay.x, spawn.y], [relay.x, relay.y]];
        path(ctx, points, false); ctx.strokeStyle = '#262c3b'; ctx.lineWidth = 72; ctx.stroke();
        ctx.strokeStyle = '#484856'; ctx.lineWidth = 56; ctx.stroke();
        ctx.strokeStyle = '#9b825e'; ctx.lineWidth = 2; ctx.setLineDash([12, 25]); ctx.stroke(); ctx.setLineDash([]);
        circle(ctx, relay.x, relay.y, (relay.radius || 147) + 24, null, '#67627b', 2);
        for (const side of [-1, 1]) {
          box(ctx, relay.x + side * 205 - 9, relay.y - 95, 18, 190, 3, '#242b3a', '#847460');
          for (let y = -80; y <= 80; y += 40) { ctx.fillStyle = '#b79a62'; ctx.fillRect(relay.x + side * 205 - 12, relay.y + y, 24, 4); }
        }
        ctx.font = '700 23px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#9e95b8';
        ctx.fillText(`STORM COIL / 0${index + 1}`, relay.x, relay.y + 207);
        ctx.font = '10px Consolas, monospace'; ctx.fillText('LURE / EVADE / CONDUCT', relay.x, relay.y + 226);
      }
      polygon(ctx, spawn.x, spawn.y, 126, 6, Math.PI / 6); ctx.fillStyle = '#3c4256'; ctx.fill(); ctx.strokeStyle = '#af976b'; ctx.lineWidth = 3; ctx.stroke();
      circle(ctx, spawn.x, spawn.y, 58, null, '#9294be', 2);
      ctx.font = '600 13px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#b8bce3'; ctx.fillText('TEMPEST DOCK / 04', spawn.x, spawn.y + 98);
      ctx.strokeStyle = '#535268'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#a78d63'; ctx.lineWidth = 3; ctx.setLineDash([16, 22]); ctx.strokeRect(26, 26, w - 52, h - 52); ctx.setLineDash([]);
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
      if (r.mode === 'delivery') { this.drawDeliveryRelay(r); return; }
      if (r.mode === 'conduction') { this.drawConductionRelay(r); return; }
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
      ctx.fillText(active ? 'ONLINE' : charging ? `SYNC ${Math.round(progress * 100)}%` : this.interactionLabel(r, '靠近启动'), 0, 117);
      if (charging) { ctx.setLineDash([5, 12]); circle(ctx, 0, 0, r.radius || 147, null, 'rgba(140,229,231,.45)', 1.5); ctx.setLineDash([]); }
      ctx.restore();
    }

    relayStatus(r) {
      const percent = Math.round((r.progress || 0) * 100);
      if (r.mode === 'delivery') return r.status === 'active' ? '晶核已归位' : this.interactionLabel(r, '运送对应晶核');
      if (r.mode === 'conduction') return r.status === 'active' ? '引雷完成' : r.status === 'charging' ? `引雷 ${r.charges || 0}/${r.chargeGoal || 3} · 入圈诱导后闪避` : this.interactionLabel(r, '靠近启动引雷塔');
      if (r.mode === 'demolition') return r.status === 'active' ? '核心已拆毁' : r.status === 'charging' ? `攻击核心 · ${percent}%` : r.status === 'locked' ? '暂未开放' : this.interactionLabel(r, '靠近解除封锁');
      if (r.mode === 'escort') return r.status === 'active' ? '运输已完成' : r.status === 'charging' ? `护送进度 ${percent}%` : r.status === 'locked' ? '等待前段运输' : this.interactionLabel(r, '靠近启动运输车');
      return r.status === 'active' ? '已连接' : r.status === 'charging' ? `同步 ${percent}%` : '待激活';
    }

    drawDeliveryRelay(r) {
      const ctx = this.ctx, active = r.status === 'active', color = active ? '#a7e6b4' : '#e9d69e';
      ctx.save(); ctx.translate(r.x, r.y);
      polygon(ctx, 0, 0, 72, 6, Math.PI / 6); ctx.fillStyle = '#273a31'; ctx.fill(); ctx.strokeStyle = '#a39c75'; ctx.lineWidth = 3; ctx.stroke();
      circle(ctx, 0, 0, 52, '#1d302a', color, 2);
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate(-Math.PI / 2 + i * TAU / 3);
        path(ctx, [[30, -7], [45, -14], [51, 0], [45, 14], [30, 7]]); ctx.fillStyle = active ? '#7ba991' : '#6f7157'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      }
      polygon(ctx, 0, 0, 22, 6, Math.PI / 6); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      if (active) { polygon(ctx, 0, 0, 12, 4, Math.PI / 4); ctx.fillStyle = '#c5ffcf'; ctx.fill(); }
      else { ctx.strokeStyle = '#b1c2a0'; ctx.lineWidth = 2; path(ctx, [[-8, -4], [0, 5], [8, -4]], false); ctx.stroke(); }
      ctx.restore();
      this.drawEncounterLabel(r.name || '归星接收站', r.x, r.y - 87, color, true);
      if (active || this.targetDelivery?.id === r.id || this.interaction?.target === r) this.drawEncounterLabel(this.relayStatus(r), r.x, r.y + 87, color, true);
    }

    drawConductionRelay(r) {
      const ctx = this.ctx, active = r.status === 'active', charging = r.status === 'charging';
      const color = active ? '#a7e6b4' : charging ? '#bfc3ff' : '#c2ab7a', radius = r.radius || 147;
      ctx.save(); ctx.translate(r.x, r.y);
      circle(ctx, 0, 0, radius, null, '#292d45', 5 / this.scale);
      ctx.setLineDash(charging ? [9, 9] : [4, 16]); circle(ctx, 0, 0, radius, null, color, (charging ? 2 : 1) / this.scale); ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(Math.PI / 4 + i * Math.PI / 2);
        path(ctx, [[radius - 12, -6], [radius - 19, 0], [radius - 12, 6]], false); ctx.strokeStyle = color; ctx.lineWidth = 2 / this.scale; ctx.stroke(); ctx.restore();
      }
      polygon(ctx, 0, 0, 55, 6, Math.PI / 6); ctx.fillStyle = '#272d3e'; ctx.fill(); ctx.strokeStyle = '#998365'; ctx.lineWidth = 3; ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const angle = -Math.PI / 2 + i * TAU / 3;
        ctx.save(); ctx.rotate(angle); box(ctx, 25, -8, 25, 16, 3, i < (r.charges || 0) ? '#b9eeff' : '#41455a', i < (r.charges || 0) ? '#e4fbff' : '#706a80'); ctx.restore();
      }
      circle(ctx, 0, 0, 23, '#252437', color, 2);
      path(ctx, [[4, -19], [-9, 1], [0, 1], [-5, 18], [11, -4], [3, -4]]); ctx.fillStyle = color; ctx.fill();
      ctx.restore();
      this.drawEncounterLabel(`${r.name || '引雷塔'} · ${r.charges || 0}/${r.chargeGoal || 3}`, r.x, r.y - 83, color);
      if (charging && this.conductionHazard?.conductionRelayId !== r.id) this.drawEncounterLabel('入圈诱导 · 锁定后离开雷圈', r.x, r.y + radius + 22, '#d9ddff');
      else if (!charging && !active) this.drawEncounterLabel(this.interactionLabel(r, '靠近启动引雷塔'), r.x, r.y + 85, color);
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
      if (this.mapId === 'ruins') {
        polygon(ctx, 2, size * .23, size, 5, seed); ctx.fillStyle = '#1e3027'; ctx.fill();
        polygon(ctx, 0, 0, size * .98, 5, seed); ctx.fillStyle = '#6b735a'; ctx.fill(); ctx.strokeStyle = '#aca384'; ctx.lineWidth = 2; ctx.stroke();
        path(ctx, [[-size * .4, -size * .35], [size * .17, -size * .12], [-size * .05, size * .4]], false); ctx.strokeStyle = '#384d3d'; ctx.lineWidth = 3; ctx.stroke();
        path(ctx, [[size * .25, -size * .39], [size * .44, -size * .11], [size * .25, size * .15]], false); ctx.strokeStyle = '#b5c89288'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore(); return;
      }
      if (this.mapId === 'nexus') {
        polygon(ctx, 2, size * .2, size, 6, Math.PI / 6); ctx.fillStyle = '#181f2d'; ctx.fill();
        polygon(ctx, 0, 0, size * .96, 6, Math.PI / 6); ctx.fillStyle = '#4d4e66'; ctx.fill(); ctx.strokeStyle = '#9990ac'; ctx.lineWidth = 2; ctx.stroke();
        polygon(ctx, 0, -size * .12, size * .68, 3, -Math.PI / 2); ctx.fillStyle = '#67637b'; ctx.fill(); ctx.strokeStyle = '#b3a7b6'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore(); return;
      }
      if (this.mapId === 'storm') {
        ctx.rotate(seed * .3);
        box(ctx, -size * .84, -size * .64, size * 1.68, size * 1.43, 4, '#202838');
        box(ctx, -size * .84, -size * .82, size * 1.68, size * 1.42, 4, '#53566f', '#ae936f');
        for (let i = -2; i <= 2; i++) { ctx.strokeStyle = i % 2 ? '#7f7180' : '#353d53'; ctx.lineWidth = Math.max(2, size * .08); path(ctx, [[i * size * .27, -size * .65], [i * size * .27, size * .4]], false); ctx.stroke(); }
        path(ctx, [[-size * .72, size * .47], [size * .72, size * .47]], false); ctx.strokeStyle = '#bf9a68'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore(); return;
      }
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

    interactionLabel(entity, fallback) {
      return this.interaction?.target === entity && this.interaction.action
        ? (this.touchControls ? '点按 · ' : 'E · ') + this.interaction.action : fallback;
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
      else if (Math.hypot(c.x - player.x, c.y - player.y) < 115) this.label(this.interactionLabel(c, '补给箱'), 0, -34, '#f4dda0');
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
      if (Math.hypot(s.x - player.x, s.y - player.y) < 120) this.label(this.interactionLabel(s, medical ? '医疗站' : '武器工坊'), 0, -42, color);
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
      if (Math.hypot(player.x - contract.x, player.y - contract.y) < 140) this.label(this.interactionLabel(contract, done ? '遗物已领取' : ready ? '返回领取遗物' : contract.status === 'active' ? contract.progress + '/' + contract.goal + ' · 目标已标记' : '支线终端'), contract.x, contract.y + 67, color);
    }

    drawCore(node, player) {
      const ctx = this.ctx;
      ctx.save(); ctx.translate(node.x, node.y);
      circle(ctx, 0, 0, 25, 'rgba(147,111,216,.16)', '#cbb8ff', 1.5);
      polygon(ctx, 0, 0, 12, 4, this.reducedMotion ? 0 : this.time); ctx.fillStyle = '#d8caff'; ctx.fill();
      ctx.restore();
      if (Math.hypot(player.x - node.x, player.y - node.y) < 130) this.label(this.interactionLabel(node, '勘探核心'), node.x, node.y - 34, '#d8caff');
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
      ctx.fillStyle = doctrineColors[this.doctrineId] || '#7be2d2'; ctx.fillRect(-17, -5, 3, 10);
      path(ctx, [[-11, -10], [0, -14], [10, -9], [13, 0], [9, 10], [-5, 12], [-13, 5]]);
      ctx.fillStyle = ghost ? (this.overdrive ? '#ffe4a6' : '#8ce9ef') : '#a9c8bf'; ctx.fill(); ctx.strokeStyle = '#223b47'; ctx.lineWidth = 2; ctx.stroke();
      box(ctx, -6, -16, 13, 7, 3, '#d9aa66', '#eacf92');
      box(ctx, -5, 9, 13, 7, 3, '#577784', '#9ab8b9');
      if (this.doctrineId) {
        ctx.strokeStyle = doctrineColors[this.doctrineId] || '#b6f3d6'; ctx.lineWidth = 1.4;
        if (this.doctrineId === 'skirmisher') path(ctx, [[-2, 11], [2, 13], [-2, 15]], false);
        else if (this.doctrineId === 'marksman') { path(ctx, [[-2, 13], [5, 13], [2, 11], [2, 15]], false); }
        else polygon(ctx, 2, 13, 2.5, 4);
        ctx.stroke();
      }
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
      } else if (weapon === 5) {
        box(ctx, 10, 2, 29, 14, 3, '#334d48', '#b8d5b3');
        for (const y of [0, 14]) box(ctx, 22, y, 20, 3, 1, '#89997b', '#c7e7b8');
        circle(ctx, 17, 9, 6, '#203c35', '#8ff7db', 1.5);
        path(ctx, [[28, 5], [35, 8], [28, 11]], false); ctx.strokeStyle = '#ffe4a2'; ctx.lineWidth = 2; ctx.stroke();
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
      if (boss && e.variant === 'voyage') { this.drawVoyageEnemy(e); return; }
      if (boss && e.variant === 'ruins') { this.drawRuinsEnemy(e); return; }
      if (e.type === 'anchor' || boss && e.variant === 'nexus') { this.drawNexusEnemy(e); return; }
      const foundryBoss = boss && e.variant === 'foundry', frostBoss = boss && e.variant === 'frost', stormBoss = boss && e.variant === 'storm';
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
        if (e.voyageCore) this.drawEncounterLabel('共鸣柱 · 集火拆毁', e.x, e.y - r - 33, '#ffd09d', true);
        else this.label('暴露核心 · 集火拆毁', e.x, e.y - r - 33, '#ffd09d'); return;
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
      const armor = foundryBoss ? '#515a60' : frostBoss ? '#426b86' : stormBoss ? '#515175' : boss ? '#685369' : tank ? '#61646f' : spitter ? '#666851' : '#74506b';
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
      } else if (stormBoss) {
        for (const side of [-1, 1]) {
          path(ctx, [[-17, side * 10], [-26, side * 25], [-12, side * 31], [-3, side * 18]]); ctx.fillStyle = '#66637e'; ctx.fill(); ctx.strokeStyle = '#c4a981'; ctx.lineWidth = 1.5; ctx.stroke();
          circle(ctx, -14, side * 20, 6, '#323552', '#bcc8ff', 1.5);
          path(ctx, [[-22, side * 24], [-31, side * 29], [-27, side * 17], [-35, side * 14]], false); ctx.strokeStyle = '#bddaff'; ctx.lineWidth = 1.2; ctx.stroke();
        }
        polygon(ctx, -7, 0, 11, 6, Math.PI / 6); ctx.fillStyle = '#272a45'; ctx.fill(); ctx.strokeStyle = '#c3c9ff'; ctx.lineWidth = 1.5; ctx.stroke();
        path(ctx, [[-5, -8], [-12, 1], [-6, 1], [-10, 9], [0, -3], [-6, -3]]); ctx.fillStyle = e.stage === 2 ? '#fff2c4' : '#bbe6ff'; ctx.fill();
        if (e.windup > 0 && e.attackKind === 'storm-call') {
          circle(ctx, -7, 0, 29, null, '#d7d8ff', 1.5);
          for (const side of [-1, 1]) { path(ctx, [[-22, side * 20], [-12, side * 12], [-17, side * 6], [-7, 0]], false); ctx.strokeStyle = '#e7f4ff'; ctx.lineWidth = 1.5; ctx.stroke(); }
        }
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
        const name = `${e.name || '裂隙守卫'}${e.stage === 2 ? ' · 狂暴' : ''}`;
        if (stormBoss) this.drawEncounterLabel(name, e.x, e.y - r - 39, e.color || '#edb9ce');
        else this.label(name, e.x, e.y - r - 39, e.color || '#edb9ce');
      }
    }

    drawRuinsEnemy(e) {
      const ctx = this.ctx, r = e.radius || 52, color = e.color || '#f0daaa';
      if (e.phaseMarkTimer > 0) this.drawPhaseMark(e, r);
      if (e.windup > 0 && e.attackKind === 'fan') {
        const aim = e.shotAngle ?? e.angle ?? 0, spread = e.spread || 1.8;
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(aim);
        ctx.setLineDash([5 / this.scale, 11 / this.scale]); ctx.strokeStyle = '#ffdeaa'; ctx.lineWidth = 1.7 / this.scale;
        for (const a of [-spread / 2, 0, spread / 2]) { path(ctx, [[Math.cos(a) * (r + 12), Math.sin(a) * (r + 12)], [Math.cos(a) * 235, Math.sin(a) * 235]], false); ctx.stroke(); }
        ctx.setLineDash([]); ctx.restore();
      }
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.beginPath(); ctx.ellipse(0, r * .35, r * .88, r * .47, 0, 0, TAU); ctx.fillStyle = '#182922bb'; ctx.fill();
      const angle = this.reducedMotion ? Math.PI / 6 : Math.PI / 6 + this.time * .12;
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.rotate(angle + i * TAU / 6);
        path(ctx, [[r * .34, -r * .15], [r * .77, -r * .26], [r * 1.07, 0], [r * .77, r * .26], [r * .34, r * .15]]);
        ctx.fillStyle = i % 2 ? '#5d735d' : '#7c8060'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
        path(ctx, [[r * .61, -r * .13], [r * .85, 0], [r * .61, r * .13]], false); ctx.strokeStyle = '#c8e8b0'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      }
      polygon(ctx, 0, 0, r * .48, 6, Math.PI / 6); ctx.fillStyle = '#1d392e'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
      path(ctx, [[0, -r * .32], [r * .2, -r * .08], [0, r * .31], [-r * .2, -r * .08]]);
      ctx.fillStyle = e.windup > 0 ? '#fff0c8' : e.stage === 2 ? '#aaffde' : '#e5d896'; ctx.fill();
      if (e.windup > 0) {
        ctx.setLineDash([4 / this.scale, 8 / this.scale]); circle(ctx, 0, 0, r + 12, null, '#ffdda8', 2 / this.scale); ctx.setLineDash([]);
      }
      if (e.recoveryTimer > 0) circle(ctx, 0, 0, r + 8, null, '#a7f4d4', 2);
      if (this.hitFlashes.get(e.id) > 0) { ctx.globalAlpha = .5; polygon(ctx, 0, 0, r * .5, 6, Math.PI / 6); ctx.fillStyle = '#fff5cb'; ctx.fill(); }
      ctx.restore();
      this.healthBar(e.x, e.y - r - 25, 116, e.hp / e.maxHp, color);
      this.drawEncounterLabel((e.name || '归星守墓者') + (e.stage === 2 ? ' · 二阶段' : ''), e.x, e.y - r - 43, color, true);
      if (e.windup > 0) {
        const hint = e.attackKind === 'ruins-lattice' ? '双斜光刃 · 避开两条斜线' : e.attackKind === 'ruins-collapse' ? '追星坍缩 · 离开锁定圈' : '守墓齐射 · 侧向走位';
        this.drawEncounterLabel(hint, e.x, e.y + r + 33, '#ffe6ba', true);
      }
    }

    drawVoyageEnemy(e) {
      const ctx = this.ctx, r = e.radius, stage = e.stage || 1, color = stage === 3 ? '#ffbeaa' : stage === 2 ? '#ceb9ff' : '#a9eaf1';
      if (e.phaseMarkTimer > 0) this.drawPhaseMark(e, r);
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.beginPath(); ctx.ellipse(0, r * .27, r * 1.1, r * .65, 0, 0, TAU); ctx.fillStyle = '#171e2ed9'; ctx.fill();
      circle(ctx, 0, 0, r, '#31354b', '#76788b', 2);
      const spin = this.reducedMotion ? 0 : this.time * (stage === 3 ? -.15 : .09);
      ctx.save(); ctx.rotate(spin);
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.rotate(i * TAU / 6);
        const reach = stage === 3 ? 1.14 : stage === 2 ? 1.04 : .96;
        path(ctx, [[r * .38, -r * .16], [r * .7, -r * .3], [r * reach, -r * .14], [r * .83, 0], [r * reach, r * .14], [r * .7, r * .3], [r * .38, r * .16]]);
        ctx.fillStyle = stage === 3 ? '#6d4c61' : stage === 2 ? '#635b7e' : '#4f6678'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
        if (stage >= 2) { path(ctx, [[r * .5, -r * .06], [r * .74, 0], [r * .5, r * .06]], false); ctx.strokeStyle = '#ecdef2'; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.restore();
      }
      ctx.restore();
      polygon(ctx, 0, 0, r * .49, stage === 3 ? 3 : 6, -Math.PI / 2); ctx.fillStyle = '#202535'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      circle(ctx, 0, 0, r * .24, e.windup > 0 ? '#fff1d7' : color, '#eef8eb', 1.5);
      polygon(ctx, 0, 0, r * .12, 3, Math.PI / 2); ctx.fillStyle = '#303747'; ctx.fill();
      if (e.recoveryTimer > 0) { ctx.setLineDash([5, 5]); circle(ctx, 0, 0, r + 10, null, '#d5f6cf', 2); ctx.setLineDash([]); }
      if (this.hitFlashes.get(e.id) > 0) circle(ctx, 0, 0, r * .33, '#ffeddd66');
      ctx.restore(); this.healthBar(e.x, e.y - r - 15, 116, e.hp / e.maxHp, color);
      this.drawEncounterLabel((e.name || '航界吞星者') + ' · ' + ['第一形态', '折跃形态', '终焉形态'][stage - 1], e.x, e.y - r - 36, color, true);
      if (e.windup > 0 && e.attackKind === 'voyage-ring') {
        ctx.save(); ctx.translate(e.x, e.y);
        const gap = e.ringGapAngle, halfGap = e.ringGapWidth / 2;
        for (let index = 0; index < e.ringCount; index++) {
          const angle = e.ringStartAngle + index * TAU / e.ringCount;
          if (Math.acos(Math.cos(angle - gap)) <= halfGap) continue;
          circle(ctx, Math.cos(angle) * (r + 16), Math.sin(angle) * (r + 16), 3, '#ffc7df');
          path(ctx, [[Math.cos(angle) * (r + 26), Math.sin(angle) * (r + 26)], [Math.cos(angle) * (r + 74), Math.sin(angle) * (r + 74)]], false); ctx.strokeStyle = '#edb0cb88'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        for (const angle of [gap - halfGap, gap + halfGap]) { path(ctx, [[Math.cos(angle) * (r + 8), Math.sin(angle) * (r + 8)], [Math.cos(angle) * (r + 95), Math.sin(angle) * (r + 95)]], false); ctx.strokeStyle = '#bbf3cc'; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(0, 0, r + 95, gap - halfGap, gap + halfGap); ctx.strokeStyle = '#bbf3cc'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        this.drawEncounterLabel('弹环蓄势 · 穿过安全缺口', e.x + Math.cos(gap) * (r + 122), e.y + Math.sin(gap) * (r + 122), '#d2f7dc', true);
      }
      if (e.windup > 0 && e.attackKind !== 'voyage-ring') {
        const hints = { 'voyage-lattice': '光栅蓄势 · 移出长条', 'voyage-collapse': '旧位坍缩 · 离开锁定圈', 'voyage-teleport': '折跃蓄势 · 注意落点', 'voyage-finale': '错时终焉 · 躲开光栅与锁定圈' };
        this.drawEncounterLabel(hints[e.attackKind] || '蓄势 · 注意地面预警', e.x, e.y + r + 35, '#f6ddc6', true);
      }
    }

    drawNexusEnemy(e) {
      const ctx = this.ctx, r = e.radius, anchor = e.type === 'anchor';
      const color = anchor || e.shielded ? '#c6baff' : '#ffda9d';
      if (e.phaseMarkTimer > 0) this.drawPhaseMark(e, r);
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.beginPath(); ctx.ellipse(2, r * .35, r, r * .65, 0, 0, TAU); ctx.fillStyle = '#161c2bd9'; ctx.fill();
      circle(ctx, 0, 0, r, '#303346', '#746d91', 2);
      const rotation = this.reducedMotion ? Math.PI / 6 : Math.PI / 6 + this.time * (anchor ? .1 : .18);
      ctx.save(); ctx.rotate(rotation);
      const sides = anchor ? 4 : 6;
      for (let i = 0; i < sides; i++) {
        ctx.save(); ctx.rotate(i * TAU / sides);
        const inner = !anchor && !e.shielded ? .6 : .42;
        path(ctx, [[r * inner, -r * .22], [r * .8, -r * .36], [r * .98, 0], [r * .8, r * .36], [r * inner, r * .22]]);
        ctx.fillStyle = anchor ? '#6a6283' : '#69677f'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      }
      polygon(ctx, 0, 0, r * (anchor ? .39 : e.shielded ? .35 : .49), anchor ? 4 : 6, Math.PI / 6);
      ctx.fillStyle = e.windup > 0 ? '#f4dfce' : color; ctx.fill();
      polygon(ctx, 0, 0, r * .2, 3, -Math.PI / 2); ctx.fillStyle = '#34344b'; ctx.fill(); ctx.restore();
      if (!anchor && e.shielded) {
        ctx.setLineDash([7, 5]); circle(ctx, 0, 0, r + 6, null, '#bcb3ee', 2); ctx.setLineDash([]);
      }
      if (!anchor && e.recoveryTimer > 0) circle(ctx, 0, 0, r + 9, null, '#ffe4b5', 2);
      if (!anchor && e.windup > 0 && e.attackKind === 'nexus-ring') {
        const count = e.stage === 2 ? 20 : 16;
        for (let i = 0; i < count; i++) {
          const angle = i * TAU / count + (e.attackCount || 0) * .18;
          circle(ctx, Math.cos(angle) * (r + 14), Math.sin(angle) * (r + 14), 2.5, '#f3d5ff');
        }
      }
      if (this.hitFlashes.get(e.id) > 0) circle(ctx, 0, 0, r * .45, '#fff0d666');
      ctx.restore();
      this.healthBar(e.x, e.y - r - 13, anchor ? 56 : 106, e.hp / e.maxHp, color);
      this.drawEncounterLabel(anchor ? '能量锚 · 射击破盾' : e.shielded ? '中枢主宰 · 先破能量锚' : '中枢主宰 · 核心暴露', e.x, e.y - r - 30, color, true);
      if (!anchor && e.windup > 0 && e.attackKind === 'nexus-ring') this.drawEncounterLabel('弹环蓄势 · 拉开距离', e.x, e.y + r + 35, '#f3d5ff', true);
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
      if (!enemy && b.kind === 'voyage') {
        const color = b.color || voyageDeviceColors[b.deviceId] || '#c8b7ff';
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(angle);
        path(ctx, [[-17, 0], [0, 0]], false); ctx.strokeStyle = color + '66'; ctx.lineWidth = radius * 2; ctx.stroke();
        polygon(ctx, 0, 0, radius + 2, b.deviceId === 'mirror' ? 4 : 3, 0); ctx.fillStyle = color; ctx.fill(); circle(ctx, 0, 0, 1.5, '#fffbea'); ctx.restore(); return;
      }
      if (!enemy && b.kind === 'starline') {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(angle);
        path(ctx, [[-28, 0], [-5, 0]], false); ctx.strokeStyle = '#94efd74d'; ctx.lineWidth = 4; ctx.stroke();
        path(ctx, [[-15, -3], [9, 0], [-15, 3], [-11, 0]]); ctx.fillStyle = b.reactor ? '#b1fff0' : '#f7e7b5'; ctx.fill(); ctx.strokeStyle = '#8ff7db'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore(); return;
      }
      if (!enemy && (b.kind === 'grenade' || b.kind === 'boomerang')) {
        ctx.save(); ctx.translate(b.x, b.y);
        const grenade = b.kind === 'grenade', chargedBlade = !grenade && (b.rockRebounded || b.relayCount > 0), twin = b.evolutionId === 'boomerang-twin';
        const color = chargedBlade ? b.rockRebounded ? '#ffd28e' : '#b4ffdc' : b.reactor ? '#a6ffee' : evolutionColors[b.evolutionId] || (grenade ? '#ffc187' : b.returning ? '#d6fff0' : '#9cddff');
        ctx.rotate(angle); ctx.strokeStyle = grenade ? 'rgba(255,181,111,.42)' : 'rgba(155,226,255,.35)'; ctx.lineWidth = grenade ? 5 : 3;
        path(ctx, [[-26, 0], [-12, 0], [0, 0]], false); ctx.stroke();
        if (chargedBlade) {
          ctx.strokeStyle = color; ctx.lineWidth = 1.5;
          path(ctx, [[-33, -4], [-17, -4], [-10, 0]], false); ctx.stroke();
          if (b.relayCount > 0) { path(ctx, [[-33, 4], [-17, 4], [-10, 0]], false); ctx.stroke(); }
        }
        if (grenade) {
          circle(ctx, 0, 0, 10, 'rgba(251,148,74,.14)');
          box(ctx, -7, -5, 12, 10, 3, '#73584b', color); circle(ctx, 3, 0, 4, '#ffdda1');
          ctx.strokeStyle = '#f6ae69'; ctx.lineWidth = 2; path(ctx, [[-11, -3], [-19, -5]], false); ctx.stroke();
          if (b.evolutionId === 'grenade-echo') { circle(ctx, -3, 0, 8, null, '#ffdfa9', 1.3); circle(ctx, -3, 0, 12, null, '#ffbb8366', 1); }
        } else {
          ctx.rotate(this.reducedMotion ? 0 : (b.age ?? this.time) * (b.returning ? -19 : 19));
          circle(ctx, 0, 0, 17, null, 'rgba(165,229,247,.22)', 3);
          const blades = twin ? 2 : 3;
          for (let i = 0; i < blades; i++) {
            ctx.save(); ctx.rotate(i * TAU / blades);
            path(ctx, twin ? [[1, -4], [21, -8], [16, 3], [4, 10], [8, 1]] : [[1, -3], [19, -7], [12, 4], [3, 8], [7, 1]]); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#335972'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
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
      if (!enemy && b.breach) {
        path(ctx, [[-length - 8, -3], [-4, -3], [7, 0], [-4, 3], [-length - 8, 3]], false); ctx.strokeStyle = '#ffda92'; ctx.lineWidth = 1.6; ctx.stroke();
      } else if (!enemy && b.evolutionId === 'piercer-mirror') {
        polygon(ctx, 2, 0, b.ricocheted ? 7 : 4, 4, 0); ctx.strokeStyle = b.ricocheted ? '#e9ddff' : '#c9b5ff'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (!enemy && b.evolutionId === 'assault-chain') {
        path(ctx, [[-length - 5, -3], [-length + 2, 0], [-length - 5, 3]], false); ctx.strokeStyle = '#95ffdf'; ctx.lineWidth = 1.4; ctx.stroke();
      }
      if (b.overcharged || reactor) { ctx.strokeStyle = reactor ? '#ffe7b3' : '#efffd0'; ctx.lineWidth = 1; path(ctx, [[-length * 0.6, 0], [3, 0]], false); ctx.stroke(); }
      ctx.restore();
    }

    drawHazard(h, game = {}) {
      const ctx = this.ctx, progress = h.resolved ? 1 : 1 - clamp((h.remaining || 0) / (h.duration || 1), 0, 1);
      if (h.voyageTeleport) {
        ctx.save(); ctx.translate(h.x, h.y); ctx.setLineDash([5, 7]); circle(ctx, 0, 0, h.radius || 46, null, h.color || '#d1baff', 2); ctx.setLineDash([]);
        for (let i = 0; i < 4; i++) { const a = i * TAU / 4; path(ctx, [[Math.cos(a) * 15, Math.sin(a) * 15], [Math.cos(a) * 28, Math.sin(a) * 28]], false); ctx.strokeStyle = '#dfcaff'; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.restore(); if (!h.resolved) this.drawEncounterLabel('折跃落点', h.x, h.y - (h.radius || 46) - 19, '#d9c3ff', true); return;
      }
      const source = h.sourceId == null ? null : (game.enemies || []).find(e => e.id === h.sourceId);
      const tank = source?.type === 'tank' || h.enemyType === 'tank', icy = h.effect === 'slow';
      const color = h.color || (icy ? '#a6e7ff' : h.owner === 'environment' ? this.mapId === 'foundry' ? '#ffc287' : '#c2ed8e' : source?.color || (tank ? '#ffd195' : '#ffa2bc'));
      const radius = Math.max(1, h.radius || 85), fillOpacity = this.mapId === 'nexus' || this.mapId?.startsWith('voyage-') ? h.resolved ? .16 : .045 + progress * .065 : h.resolved ? .3 : .08 + progress * .13;
      ctx.save(); ctx.translate(h.x, h.y);
      if (h.conductionRelayId != null || h.backlashId != null) {
        const captured = h.conductionRelayId != null && h.capturedAtLock;
        ctx.save(); ctx.globalAlpha *= h.resolved ? .16 : .045 + progress * .065; circle(ctx, 0, 0, radius, '#ffc88c'); ctx.restore();
        circle(ctx, 0, 0, radius, null, '#20283e', 5 / this.scale); circle(ctx, 0, 0, radius, null, '#ffd49d', 2.5 / this.scale);
        if (!h.resolved) {
          ctx.setLineDash([4 / this.scale, 9 / this.scale]); circle(ctx, 0, 0, Math.max(1, radius * (1 - progress)), null, '#ffba8a', 1.5 / this.scale); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(0, 0, radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * progress); ctx.strokeStyle = '#fff0c8'; ctx.lineWidth = 3 / this.scale; ctx.stroke();
        }
        path(ctx, [[5, -17], [-10, 2], [-1, 2], [-5, 17], [11, -5], [3, -5]]); ctx.fillStyle = captured ? '#d4efff' : '#ffd5aa'; ctx.fill(); ctx.strokeStyle = '#303249'; ctx.lineWidth = 2; ctx.stroke();
        if (h.resolved) {
          path(ctx, [[0, -radius - 35], [-9, -radius * .6], [8, -radius * .37], [-3, 0]], false); ctx.strokeStyle = '#e8f5ff'; ctx.lineWidth = 3 / this.scale; ctx.stroke();
        }
        if (!h.resolved) {
          ctx.restore();
          this.drawEncounterLabel(captured || h.backlashId != null ? '已锁定 · 躲开雷圈' : '落点偏离塔圈', h.x, h.y - radius - 17, '#ffe0b6', true);
          return;
        }
      } else if (h.type === 'lane') {
        const length = Math.max(0, h.length || 240);
        ctx.rotate(h.angle || 0);
        ctx.beginPath(); roundedPath(ctx, -radius, -radius, length + radius * 2, radius * 2, radius);
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
            if (this.mapId === 'nexus' || this.mapId?.startsWith('voyage-')) this.drawEncounterLabel('内圈安全', h.x, h.y + inner * .8, '#d2f8e6', true);
            else {
              ctx.save(); ctx.translate(0, inner * .8); ctx.scale(1 / this.scale, 1 / this.scale);
              ctx.font = '600 12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = '#183342'; ctx.lineWidth = 3;
              ctx.strokeText('内圈安全', 0, 0); ctx.fillStyle = '#d2f8e6'; ctx.fillText('内圈安全', 0, 0); ctx.restore();
            }
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
      if (!h.resolved && h.cargoPulse) this.drawEncounterLabel('晶核锁定 · 离开脉冲圈', h.x, h.y - radius - 20, '#ffe6a9', true);
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
        ctx.fillStyle = p.color;
        if (p.ice) { path(ctx, [[p.x, p.y - p.size * 1.5], [p.x + p.size * .7, p.y], [p.x, p.y + p.size], [p.x - p.size * .7, p.y]]); ctx.fill(); }
        else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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

    updatePointerHud() {
      if (!this.pointerHud || this.pointerHudTime < 0 || this.time - this.pointerHudTime > 0.5) {
        const origin = this.canvas.getBoundingClientRect(), parent = this.canvas.parentElement;
        const rects = selector => Array.from(parent?.querySelectorAll(selector) || []).map(element => element.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
        const top = rects('.map-hud,.objective-hud'), bottom = rects('.weapons-hud,.ammo-hud,.skill-hud,.active-reload,.touch-stick,#touch-interact');
        this.pointerHud = {
          right: top.length ? Math.min(...top.map(r => r.left - origin.left)) : this.width - (this.width > 760 ? 235 : 170),
          topBottom: top.length ? Math.max(...top.map(r => r.bottom - origin.top)) : this.height < 450 ? 122 : this.width > 760 ? 390 : 285,
          bottom: bottom.length ? Math.min(...bottom.map(r => r.top - origin.top)) - 48 : this.height - 155
        };
        const style = parent && window.getComputedStyle?.(parent);
        this.pointerHud.safe = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(side => [side, parseFloat(style?.getPropertyValue('--safe-' + side)) || 0]));
        this.pointerHud.blocks = rects('.player-hud,.map-hud,.objective-hud,.weapons-hud,.ammo-hud,.skill-hud,.active-reload,.touch-stick,#touch-interact,.fullscreen-controls,.combat-notices,.boss-hud,.field-coach')
          .map(r => ({ left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top }));
        this.pointerHudTime = this.time;
      }
    }

    nexusPointerPosition(x, y) {
      const safe = this.pointerHud?.safe || {}, left = (safe.left || 0) + 20, right = this.width - (safe.right || 0) - 20;
      const top = (safe.top || 0) + 20, bottom = this.height - (safe.bottom || 0) - 20;
      const blocked = [...(this.pointerHud?.blocks || []), ...(this.encounterLabelRects || []), ...(this.nexusLabelBlocks || [])], player = this.encounterPlayerPoint;
      if (player) blocked.push({ left: player.x - 28, right: player.x + 28, top: player.y - 28, bottom: player.y + 28 });
      const xs = [left, right, clamp(x, left, right), ...blocked.flatMap(b => [b.left - 18, b.right + 18])].filter(v => v >= left && v <= right);
      const ys = [top, bottom, clamp(y, top, bottom), ...blocked.flatMap(b => [b.top - 18, b.bottom + 18])].filter(v => v >= top && v <= bottom);
      const candidates = [{ x: clamp(x, left, right), y: clamp(y, top, bottom) }, ...xs.flatMap(x => [{ x, y: top }, { x, y: bottom }]), ...ys.flatMap(y => [{ x: left, y }, { x: right, y }])];
      const distance = p => Math.hypot(p.x - x, p.y - y) + ((p.x - this.width / 2) * (x - this.width / 2) + (p.y - this.height / 2) * (y - this.height / 2) < 0 ? this.width + this.height : 0);
      return candidates.filter(p => !blocked.some(b => p.x - 14 < b.right + 4 && p.x + 14 > b.left - 4 && p.y - 14 < b.bottom + 4 && p.y + 14 > b.top - 4))
        .sort((a, b) => distance(a) - distance(b))[0] || null;
    }

    drawObjectivePointers(game) {
      const ctx = this.ctx, halfW = this.width / this.scale / 2 - 28 / this.scale, halfH = this.height / this.scale / 2 - 31 / this.scale;
      this.updatePointerHud();
      const boss = (game.enemies || []).find(e => e.type === 'boss' && e.hp > 0);
      const targets = [];
      this.nexusPointerRects = [];
      const voyageTarget = game.voyageTarget?.();
      if (game.voyage) { if (voyageTarget) targets.push({ ...voyageTarget, color: voyageTarget.kind === 'exit' ? '#b9f5da' : '#ddc8ff', encounter: true, voyage: true }); }
      else if (this.targetEncounter) targets.push({ ...this.targetEncounter, label: this.targetEncounter.name, encounter: true });
      else if (this.targetContract) targets.push({ ...this.targetContract, color: '#cab7ff', label: this.targetContract.name });
      else if (this.targetDelivery) targets.push({ ...this.targetDelivery, encounter: true, delivery: true });
      else if (this.targetRelay) targets.push({ ...this.targetRelay, color: this.targetRelay.mode === 'demolition' ? '#ffc18a' : this.targetRelay.mode === 'escort' ? '#ace8ff' : this.targetRelay.mode === 'conduction' ? '#c4c7ff' : this.targetRelay.status === 'charging' ? '#a4ece2' : '#f0d596', label: this.targetRelay.name || (this.targetRelay.mode === 'escort' ? '护送运输车' : this.targetRelay.mode === 'demolition' ? '拆毁反应堆' : this.targetRelay.mode === 'conduction' ? '引雷充能' : '追踪信标') });
      if (boss && !game.voyage) targets.push({ ...boss, color: boss.color || '#ffabbf', label: boss.name || game.map?.boss?.name || '裂隙守卫', boss: true });
      if (boss?.variant === 'nexus' && boss.shielded) {
        const anchor = game.enemies.filter(e => e.type === 'anchor' && e.hp > 0 && e.anchorBossId === boss.id)
          .sort((a, b) => Math.hypot(a.x - game.player.x, a.y - game.player.y) - Math.hypot(b.x - game.player.x, b.y - game.player.y))[0];
        if (anchor) targets.splice(0, targets.length, { ...anchor, color: '#c6baff', label: '击破能量锚', encounter: true });
      }
      let previous = null;
      for (const target of targets) {
        const dx = target.x - this.camera.x, dy = target.y - this.camera.y;
        const targetX = this.width / 2 + dx * this.scale, targetY = this.height / 2 + dy * this.scale;
        const covered = (target.encounter || target.variant === 'nexus') && (this.pointerHud.blocks || []).some(r => targetX > r.left - 14 && targetX < r.right + 14 && targetY > r.top - 14 && targetY < r.bottom + 14);
        if (Math.abs(dx) < halfW && Math.abs(dy) < halfH && !covered) continue;
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
        if (target.voyage || target.delivery || target.type === 'anchor' || target.variant === 'nexus') {
          const position = this.nexusPointerPosition(sx, sy);
          if (!position) continue;
          sx = position.x; sy = position.y;
          this.nexusPointerRects.push({ left: sx - 14, right: sx + 14, top: sy - 14, bottom: sy + 14 });
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
        if (target.encounter || target.mode === 'conduction' || target.variant === 'storm' || target.variant === 'nexus') this.drawEncounterLabel(`${target.label} · ${distance}m`, lx, ly, target.color);
        else {
          ctx.save(); ctx.translate(lx, ly); ctx.scale(1 / this.scale, 1 / this.scale);
          this.label(`${target.label} · ${distance}m`, 0, 0, target.color);
          ctx.restore();
        }
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
      const foundry = game.map?.id === 'foundry', frost = game.map?.id === 'frost', storm = game.map?.id === 'storm', nexus = game.map?.id === 'nexus', ruins = game.map?.id === 'ruins';
      const voyage = game.voyage;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = voyage ? { cosmos: '#242a40', forge: '#332e2e', tide: '#213b3d' }[voyage.room.biome] : foundry ? '#252a30' : frost ? '#224152' : storm ? '#282d42' : nexus ? '#222638' : ruins ? '#293b2e' : '#15282d'; ctx.fillRect(0, 0, width, height);
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
      for (const obstacle of game.obstacles || []) circle(ctx, obstacle.x * scale, obstacle.y * scale, Math.max(0.8, obstacle.radius * scale), foundry ? '#65717a' : frost ? '#83aabb' : storm ? '#8b7e94' : '#43594c');
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
        const color = r.status === 'active' ? '#9fe8ad' : r.status === 'locked' ? '#64808b' : r.status === 'charging' ? foundry ? '#ffc187' : storm ? '#bfc7ff' : '#8ce4e4' : frost ? '#bfecff' : '#efd59b';
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
      for (const cargo of game.delivery?.cargos || []) {
        if (cargo.status === 'delivered') continue;
        const carried = cargo.status === 'carried', x = (carried ? game.player.x : cargo.x) * scale, y = (carried ? game.player.y : cargo.y) * scale;
        polygon(ctx, x, y, detailed ? 6 : 3.5, 4, Math.PI / 4); ctx.fillStyle = cargo.color || '#ffe3a2'; ctx.fill();
        if (cargo.status === 'dropped') circle(ctx, x, y, detailed ? 10 : 6, null, '#fff1b7', 1.5);
        if (detailed && !carried) { ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = cargo.color || '#ffe3a2'; ctx.fillText(cargo.status === 'dropped' ? '掉落晶核' : '晶核源', x, y - 15); }
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
      for (const encounter of game.encounters || []) {
        const x = encounter.x * scale, y = encounter.y * scale;
        const done = encounter.status === 'complete' || encounter.status === 'failed';
        const color = done ? '#667d79' : encounter.status === 'ready' ? '#f4d994' : encounterColors[encounter.kind];
        polygon(ctx, x, y, detailed ? 7 : 4, 4); ctx.fillStyle = '#172e32'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = detailed ? 2 : 1.5; ctx.stroke();
        if (encounter.id === this.trackedEncounterId) circle(ctx, x, y, detailed ? 12 : 7, null, color, 1.5);
        if (detailed) {
          ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#142c2e';
          ctx.strokeText(encounter.name, x, y - 18); ctx.fillStyle = color; ctx.fillText(encounter.name, x, y - 18);
          ctx.font = '10px "Microsoft YaHei", sans-serif'; const status = this.encounterStatus(encounter);
          ctx.strokeText(status, x, y + 22); ctx.fillText(status, x, y + 22);
        }
        if (encounter.status === 'active') for (let index = 0; index < encounter.nodes.length; index++) {
          const node = encounter.nodes[index];
          circle(ctx, node.x * scale, node.y * scale, detailed ? 3.5 : 2, index === encounter.activeNode ? color : null, color, 1);
        }
      }
      if (voyage) {
        for (const node of voyage.room.collectors || []) {
          const x = node.x * scale, y = node.y * scale, color = node.status === 'active' ? '#92bc9b' : '#94eadf';
          circle(ctx, x, y, node.radius * scale, null, '#7cceaf55', 1); polygon(ctx, x, y, detailed ? 6 : 3.5, 6, Math.PI / 6); ctx.fillStyle = color; ctx.fill();
          if (detailed) { ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText('收割器 ' + node.charge + '/' + node.goal, x, y - 15); }
        }
        const exit = voyage.room.exit;
        if (exit) {
          const x = exit.x * scale, y = exit.y * scale, color = exit.ready ? '#c5fce3' : '#6f8191';
          polygon(ctx, x, y, detailed ? 7 : 4, 4, Math.PI / 4); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
          if (detailed) { ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(exit.ready ? '跃迁门已开启' : '跃迁门未开启', x, y + 19); }
        }
      }
      const spawn = game.spawn || this.spawn;
      if (detailed && spawn && !voyage) {
        ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#b9d8b2';
        circle(ctx, spawn.x * scale, spawn.y * scale, 5, null, '#b9d8b2', 1);
        ctx.fillText(foundry ? '工厂入口' : frost ? '极地营地' : storm ? '废港营地' : nexus ? '跃迁入口' : '着陆营地', spawn.x * scale, spawn.y * scale + 19);
      }
      for (const e of game.enemies || []) {
        if (e.type === 'anchor' && e.hp > 0) {
          polygon(ctx, e.x * scale, e.y * scale, detailed ? 5 : 3, 4); ctx.fillStyle = '#c6baff'; ctx.fill();
          if (detailed) { ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('能量锚', e.x * scale, e.y * scale + 17); }
          continue;
        }
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
