(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Expedition = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const MAPS = [
    { id: 'frontier', name: '荒原边境', subtitle: '信标防线', description: '探索遗迹，坚守三个信标，再击退裂隙守卫。', objectiveLabel: '信标', briefing: '寻找三座信标，留在光圈内上传；全部完成后击败守卫。', color: '#78fbd6', mode: 'defense', boss: { name: '裂隙守卫', subtitle: '留意爆圈、环形弹幕和直线冲锋', color: '#ec83c7' }, threat: { name: '孢子喷发', description: '远离绿色爆圈；可引诱普通敌人进入圈内。' } },
    { id: 'foundry', name: '赤焰熔炉', subtitle: '反应堆拆毁', description: '打开熔炉护罩，顶住守卫火力，炸毁三座反应堆。', objectiveLabel: '反应堆', briefing: '靠近熔炉终端按 E 暴露核心，射击摧毁反应堆；无需留在圈内。', color: '#ffa45e', mode: 'demolition', boss: { name: '熔炉监工', subtitle: '斜向躲十字热浪，侧移避开扇形熔弹', color: '#ff9955' }, threat: { name: '地脉热浪', description: '从橙色热浪带的侧边躲开；热浪也会灼伤普通敌人。' } },
    { id: 'frost', name: '霜线远征', subtitle: '冰原护送', description: '在移动战线上护送勘探运输机，依次穿越三段冰原。', objectiveLabel: '护送段', briefing: '依次启动运输机，留在护送圈内让它前进；离开时运输机停下等待。', color: '#8fdcff', mode: 'escort', boss: { name: '霜棘猎手', subtitle: '冰环内圈安全；冰缓时仍可全速冲刺', color: '#8edcff' }, threat: { name: '霜脉冰爆', description: '移出蓝色爆圈；命中减速 2 秒，冲刺速度不受影响。' } }
  ];
  const WEAPONS = [
    { id: 'assault', name: '日耀步枪', shortName: '步枪', description: '连续脉冲 · 全距离均衡', color: '#78fbd6', damage: 16, fireInterval: 0.115, magSize: 30, reloadTime: 1.3, speed: 1050, lifetime: 0.85, pellets: 1, spread: 0.055, pierce: 0 },
    { id: 'shotgun', name: '霰星散弹', shortName: '霰弹', description: '八重散射 · 近距离爆发', color: '#ffd083', damage: 15, fireInterval: 0.64, magSize: 7, reloadTime: 1.7, speed: 830, lifetime: 0.42, pellets: 8, spread: 0.35, pierce: 0 },
    { id: 'piercer', name: '离子穿透炮', shortName: '轨道', description: '高速轨道 · 贯穿四个目标', color: '#b3a5ff', damage: 86, fireInterval: 0.72, magSize: 6, reloadTime: 1.8, speed: 1600, lifetime: 0.9, pellets: 1, spread: 0.008, pierce: 3 },
    { id: 'grenade', name: '熔核榴弹', shortName: '榴弹', description: '碰撞引爆 · 预判落点清除虫群', color: '#ffb169', damage: 78, fireInterval: 0.82, magSize: 5, reloadTime: 1.9, speed: 640, lifetime: 0.9, pellets: 1, spread: 0, pierce: 0 },
    { id: 'boomerang', name: '回旋刃', shortName: '飞刃', description: '去返双击 · 走位改变回程路线', color: '#8ce8ff', damage: 42, fireInterval: 0.66, magSize: 8, reloadTime: 1.55, speed: 700, lifetime: 2.3, pellets: 1, spread: 0, pierce: 99 }
  ];
  const UPGRADES = [
    { id: 'damage', name: '高能弹芯', title: '高能弹芯', icon: '✦', description: '所有武器伤害提升 18%。', maxStacks: 5 },
    { id: 'rapid', name: '超频扳机', title: '超频扳机', icon: '»', description: '射速提升 14%。', maxStacks: 4 },
    { id: 'health', name: '纳米护甲', title: '纳米护甲', icon: '+', description: '生命上限增加 25，并恢复 35 点生命。', maxStacks: 4 },
    { id: 'speed', name: '轻量外骨骼', title: '轻量外骨骼', icon: '↗', description: '移动速度提升 10%。', maxStacks: 3 },
    { id: 'magnet', name: '引力收集器', title: '引力收集器', icon: '◎', description: '拾取范围增加 70，立即获得 12 芯片。', maxStacks: 3 },
    { id: 'dash', name: '相位驱动', title: '相位驱动', icon: 'ϟ', description: '冲刺冷却缩短 22%，冲刺距离增加 10%。', maxStacks: 3 },
    { id: 'pulse', name: '雷暴电容', title: '雷暴电容', icon: '◉', description: 'EMP 伤害增加 40、范围增加 30、冷却缩短 12%。', maxStacks: 3 },
    { id: 'reload', name: '快拆弹匣', title: '快拆弹匣', icon: '↻', description: '换弹时间缩短 22%，所有弹匣补满。', maxStacks: 3 },
    { id: 'crit', name: '弱点扫描', title: '弱点扫描', icon: '⌖', description: '暴击几率增加 12%，暴击造成双倍伤害。', maxStacks: 4 },
    { id: 'vampire', name: '战地回收', title: '战地回收', icon: '♡', description: '每击败一个敌人恢复 1 点生命。', maxStacks: 3 },
    { id: 'shield', name: '反应装甲', title: '反应装甲', icon: '◇', description: '受到的伤害降低 12%，立即恢复 20 生命。', maxStacks: 3 },
    { id: 'capacity', name: '扩容弹舱', title: '扩容弹舱', icon: '▣', description: '弹匣容量增加 25%，立即补满弹药。', maxStacks: 3 },
    { id: 'arc', name: '电弧导体', title: '电弧导体', icon: 'ϟ', description: '步枪命中后向邻近敌人传导一道 45% 伤害电弧。', maxStacks: 1, weapon: 0, category: '武器改造' },
    { id: 'repulsor', name: '震荡散射', title: '震荡散射', icon: '»', description: '霰弹击退并短暂打断普通敌人；重型敌人抵抗击退。', maxStacks: 1, weapon: 1, category: '武器改造' },
    { id: 'shatter', name: '裂解弹芯', title: '裂解弹芯', icon: '✧', description: '轨道弹首次命中时爆裂，对周围敌人造成 35% 伤害。', maxStacks: 1, weapon: 2, category: '武器改造' },
    { id: 'blast-radius', name: '熔核扩散', title: '熔核扩散', icon: '◉', description: '榴弹爆炸半径扩大 50%，更容易覆盖整片虫群。', maxStacks: 1, weapon: 3, category: '武器改造' },
    { id: 'return-edge', name: '逆刃回锋', title: '逆刃回锋', icon: '↶', description: '回旋刃回程伤害提升 60%，移动调整回收路线。', maxStacks: 1, weapon: 4, category: '武器改造' }
  ];
  const RELICS = [
    { id: 'phase-mag', title: '相位弹舱', icon: '⇢', description: '每次冲刺为当前武器补入 25% 弹匣容量的弹药。保持移动，连续压制。' },
    { id: 'echo-pulse', title: '回声电容', icon: '◎', description: '脉冲释放 0.65 秒后，在原地再次爆发，造成 65% 脉冲伤害并清除敌弹。' },
    { id: 'precision-burst', title: '猎手棱镜', icon: '⌖', description: '精准装填时向瞄准方向发射三束穿透弹，每束造成 45 点基础伤害，并恢复 10 生命。' }
  ];
  const ENEMIES = {
    crawler: { hp: 38, speed: 92, radius: 15, damage: 7, xp: 5 },
    spitter: { hp: 62, speed: 72, radius: 18, damage: 9, xp: 8 },
    charger: { hp: 88, speed: 105, radius: 19, damage: 14, xp: 10 },
    tank: { hp: 225, speed: 56, radius: 29, damage: 18, xp: 20 },
    mortar: { hp: 108, speed: 61, radius: 23, damage: 18, xp: 14 },
    nest: { hp: 310, speed: 0, radius: 34, damage: 5, xp: 24 },
    reactor: { hp: 900, speed: 0, radius: 42, damage: 0, xp: 0 },
    boss: { hp: 3200, speed: 65, radius: 58, damage: 23, xp: 0 }
  };

  class Game {
    constructor(options = {}) {
      this.random = options.random || Math.random;
      this.reset(options.mapId);
    }

    reset(mapId = this.map ? this.map.id : 'frontier') {
      this.map = MAPS.find(map => map.id === mapId) || MAPS[0];
      this.nextId = 1;
      this.phase = 'ready';
      this.elapsed = 0;
      this.kills = 0;
      this.score = 0;
      this.world = { width: 3200, height: 2400 };
      this.player = {
        x: 530, y: 1870, radius: 16, angle: -Math.PI / 2,
        hp: 120, maxHp: 120, speed: 218, weapon: 0,
        ammo: 30, magSize: 30, reloadTimer: 0, dashTimer: 0,
        reloadDuration: 0, reloadProgress: 0, reloadWindowStart: 0.52, reloadWindowEnd: 0.72,
        reloadAttempted: false, reloadResult: 'idle', overcharged: false,
        dashCooldown: 0, skillCooldown: 0, invulnerable: 0, slowTimer: 0,
        level: 1, xp: 0, xpNeeded: 32, credits: 0,
        magnetRadius: 70, damageMultiplier: 1, fireRateMultiplier: 1,
        reloadMultiplier: 1, magazineMultiplier: 1, resistance: 0,
        critChance: 0.05, lifeOnKill: 0, dashMultiplier: 1,
        dashCooldownMax: 2.8, skillCooldownMax: 13, skillRadius: 210, skillDamage: 65,
        arcRounds: false, repulsorRounds: false, shatterRounds: false, blastRadius: false, returnEdge: false
      };
      this.ammoByWeapon = WEAPONS.map(weapon => weapon.magSize);
      this.reloadByWeapon = WEAPONS.map(() => 0);
      this.reloadDurationByWeapon = WEAPONS.map(() => 0);
      this.reloadAttemptedByWeapon = WEAPONS.map(() => false);
      this.reloadResultByWeapon = WEAPONS.map(() => 'idle');
      this.overchargedByWeapon = WEAPONS.map(() => 0);
      this.fireTimer = 0;
      this.spawnTimer = 5;
      this.breathingTimer = 0;
      this.pressurePhase = 'arrival';
      this.dashVector = { x: 0, y: -1 };
      this.moveVector = { x: 0, y: -1 };
      this.enemies = [];
      this.bullets = [];
      this.pickups = [];
      this.hazards = [];
      this.events = [];
      this.upgradeChoices = [];
      this.upgradeStacks = {};
      this.relics = [];
      this.relicChoices = [];
      this.echoBursts = [];
      this.reactor = { charge: 0, maxCharge: 100, timer: 0, duration: 7, captures: 0, detonations: 0 };
      this.combo = { count: 0, timer: 0, best: 0 };
      this.sectorThreat = { timer: 6, interval: 12, name: this.map.threat.name, description: this.map.threat.description, active: false, count: 0 };
      this.dashMarkedIds = new Set();
      this.phaseDashRefund = 0;
      this.bossSpawned = false;
      this.completedRelays = 0;
      this.relaySpawnTimer = 0;
      this.relays = [
        { id: this._id(), type: 'relay', x: 1080, y: 1670, radius: 147, name: '西境 · 回声站', theme: 'swarm', wave: 0, waveName: '虫群回声', waveSpawns: 0, status: 'idle', progress: 0, duration: 40 },
        { id: this._id(), type: 'relay', x: 2660, y: 530, radius: 147, name: '东境 · 棱镜站', theme: 'crossfire', wave: 0, waveName: '交叉火力', waveSpawns: 0, status: 'idle', progress: 0, duration: 40 },
        { id: this._id(), type: 'relay', x: 2540, y: 1920, radius: 147, name: '南境 · 潮汐站', theme: 'siege', wave: 0, waveName: '重装围攻', waveSpawns: 0, status: 'idle', progress: 0, duration: 40 }
      ];
      this.stations = [
        { id: this._id(), type: 'station', kind: 'medical', x: 580, y: 1630, radius: 29, name: '医疗舱', cost: 10, uses: 0 },
        { id: this._id(), type: 'station', kind: 'armory', x: 1570, y: 1210, radius: 31, name: '武器工坊', cost: 20, uses: 0 },
        { id: this._id(), type: 'station', kind: 'medical', x: 2460, y: 1040, radius: 29, name: '医疗舱', cost: 10, uses: 0 },
        { id: this._id(), type: 'station', kind: 'armory', x: 1230, y: 540, radius: 31, name: '武器工坊', cost: 20, uses: 0 }
      ];
      this.crates = [
        [760, 1740], [420, 1260], [850, 1010], [370, 690], [900, 400], [1530, 410],
        [2080, 380], [2330, 760], [2890, 1070], [1960, 1060], [1530, 1640],
        [960, 2070], [1990, 2050], [2770, 2180], [2800, 1580], [1880, 1510]
      ].map(([x, y]) => ({ id: this._id(), type: 'crate', x, y, radius: 20, opened: false }));
      this.contracts = [
        { kind: 'salvage', name: '失落的勘探队', x: 760, y: 1430, goal: 3, description: '回收三枚散落核心，再返回终端领取遗物。', offsets: [[-170, -110], [80, -240], [200, 70]] },
        { kind: 'hunt', name: '铁棘追猎', x: 1580, y: 690, goal: 2, description: '击败铁棘重甲与疾掠先锋，再返回终端。', offsets: [[-180, -110], [190, 100]] },
        { kind: 'purge', name: '潮汐虫巢', x: 2180, y: 1690, goal: 3, description: '摧毁三座持续孵化的虫巢，再返回终端。', offsets: [[-170, -100], [70, -210], [190, 90]] }
      ].map(contract => ({ ...contract, id: this._id(), type: 'contract', radius: 30, status: 'idle', progress: 0, spawned: 0, spawnTimer: 6,
        nodes: contract.offsets.map(([dx, dy]) => ({ id: this._id(), type: 'core', x: contract.x + dx, y: contract.y + dy, radius: 16, collected: false })) }));
      this._configureMap();
      this.obstacles = [];
      const protectedPoints = [this.player, ...this.relays, ...this.stations, ...this.crates, ...this.contracts, ...this.contracts.flatMap(contract => contract.nodes), { x: 1600, y: 650 }];
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 10; col += 1) {
          if ((col + row * 3) % 4 === 0) continue;
          const x = 170 + col * 310 + Math.sin(row * 8 + col * 3) * 60;
          const y = 170 + row * 330 + Math.cos(col * 5 + row) * 65;
          const radius = 31 + ((row * 13 + col * 7) % 4) * 11;
          if (protectedPoints.some(point => distance({ x, y }, point) < radius + 140)) continue;
          if (this.map.mode === 'escort' && this.relays.some(relay => relay.waypoints.some((point, index) => index > 0 && this._segmentHit(relay.waypoints[index - 1].x, relay.waypoints[index - 1].y, point.x - relay.waypoints[index - 1].x, point.y - relay.waypoints[index - 1].y, { x, y, radius }, 165) !== null))) continue;
          this.obstacles.push({ id: this._id(), type: 'rock', x, y, radius, variant: (row + col) % 3 });
        }
      }
      this._objective();
      return this;
    }

    _configureMap() {
      const relocate = (entities, points) => entities.forEach((entity, index) => { entity.x = points[index][0]; entity.y = points[index][1]; });
      this.escort = null;
      this.relays.forEach(relay => { relay.mode = this.map.mode; });
      if (this.map.id === 'foundry') {
        Object.assign(this.player, { x: 360, y: 350 });
        relocate(this.relays, [[900, 600], [2460, 600], [1700, 1870]]);
        this.relays.forEach((relay, index) => { relay.name = ['西炉 · 炽心核心', '东炉 · 余烬核心', '南炉 · 地脉核心'][index]; relay.reactorId = null; });
        relocate(this.stations, [[500, 800], [1560, 800], [2620, 1800], [700, 1770]]);
        relocate(this.crates, [[560, 460], [800, 930], [1190, 340], [1650, 380], [2020, 340], [2760, 540], [2790, 1050], [2280, 1130], [1860, 1190], [1330, 1220], [400, 1220], [520, 2050], [1090, 2070], [1450, 2160], [2110, 2100], [2720, 2090]]);
        relocate(this.contracts, [[850, 1280], [2250, 1260], [2460, 2020]]);
      } else if (this.map.id === 'frost') {
        Object.assign(this.player, { x: 430, y: 2080 });
        const routes = [[[740, 1930], [1090, 1790], [1500, 1640]], [[1600, 1590], [1980, 1380], [2300, 1000]], [[2340, 910], [2040, 680], [1560, 420]]];
        this.relays.forEach((relay, index) => {
          relay.name = ['冰湾 · 起运段', '裂谷 · 穿越段', '极光 · 撤离段'][index];
          relay.x = routes[index][0][0]; relay.y = routes[index][0][1]; relay.radius = 165;
          relay.status = index === 0 ? 'idle' : 'locked';
          relay.waypoints = routes[index].map(([x, y]) => ({ x, y }));
          relay.waypointIndex = 1; relay.escortDistance = 0; relay.escortSpeed = 60;
          relay.routeLength = relay.waypoints.reduce((sum, point, step) => step ? sum + distance(point, relay.waypoints[step - 1]) : 0, 0);
        });
        relocate(this.stations, [[500, 1770], [1410, 1410], [2500, 1230], [1940, 400]]);
        relocate(this.crates, [[620, 2100], [870, 1570], [1160, 1990], [1500, 1890], [1790, 1740], [2200, 1590], [2660, 1710], [2730, 1060], [2110, 1090], [2440, 530], [2180, 350], [1560, 700], [1230, 350], [900, 670], [480, 1050], [1230, 1150]]);
        relocate(this.contracts, [[740, 1120], [1670, 920], [2700, 1900]]);
      }
      if (this.map.id !== 'frontier') this.contracts.forEach(contract => contract.nodes.forEach((node, index) => { node.x = contract.x + contract.offsets[index][0]; node.y = contract.y + contract.offsets[index][1]; }));
      this.spawn = { x: this.player.x, y: this.player.y };
    }

    start() {
      if (this.phase !== 'ready') return false;
      this.phase = 'playing';
      this._emit('start', this.player);
      return true;
    }

    _id() { return this.nextId++; }
    _emit(type, position = this.player, extra = {}) { this.events.push({ type, x: position.x, y: position.y, ...extra }); }
    drainEvents() { const events = this.events; this.events = []; return events; }

    _objective() {
      const charging = this.relays.find(relay => relay.status === 'charging');
      if (this.phase === 'won') this.currentObjective = '撤离成功 · 黎明已经抵达';
      else if (this.phase === 'lost') this.currentObjective = '信号中断 · 再次出发';
      else if (this.bossSpawned) this.currentObjective = `击败${this.map.boss.name}，完成撤离`;
      else if (charging) this.currentObjective = this.map.mode === 'demolition' ? `摧毁${charging.name} · 射击暴露的反应堆` : this.map.mode === 'escort' ? `护送${charging.name} · 留在移动光圈内` : `坚守${charging.name} · 留在信标光圈内`;
      else this.currentObjective = this.map.mode === 'defense' ? `探索荒原，激活信标 ${this.completedRelays} / 3` : `${this.map.mode === 'demolition' ? '寻找熔炉终端' : '前往下一段运输机'} · ${this.map.objectiveLabel} ${this.completedRelays} / 3`;
    }

    update(dt, input = {}) {
      if (this.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
      let remaining = Math.min(dt, 0.25);
      while (remaining > 0 && this.phase === 'playing') {
        const step = Math.min(remaining, 1 / 60);
        this._step(step, input);
        remaining -= step;
      }
    }

    _step(dt, input) {
      const player = this.player;
      this.elapsed += dt;
      if (this.reactor.timer > 0) {
        this.reactor.timer = Math.max(0, this.reactor.timer - dt);
        if (this.reactor.timer === 0) this._emit('overdrive-end');
      }
      this.combo.timer = Math.max(0, this.combo.timer - dt);
      if (this.combo.timer === 0) this.combo.count = 0;
      for (const enemy of this.enemies) enemy.phaseMarkTimer = Math.max(0, (enemy.phaseMarkTimer || 0) - dt);
      this.fireTimer = Math.max(0, this.fireTimer - dt);
      for (const key of ['dashCooldown', 'skillCooldown', 'invulnerable', 'slowTimer']) player[key] = Math.max(0, player[key] - dt);
      this.breathingTimer = Math.max(0, this.breathingTimer - dt);
      WEAPONS.forEach((weapon, index) => {
        if (this.reloadByWeapon[index] <= 0) return;
        this.reloadByWeapon[index] = Math.max(0, this.reloadByWeapon[index] - dt);
        if (this.reloadByWeapon[index] === 0) {
          this._finishReload(index, false);
        }
      });
      this._syncWeapon();
      if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) {
        player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
      }
      let mx = clamp(Number(input.moveX) || 0, -1, 1);
      let my = clamp(Number(input.moveY) || 0, -1, 1);
      const magnitude = Math.hypot(mx, my);
      if (magnitude > 0) {
        mx /= Math.max(1, magnitude); my /= Math.max(1, magnitude);
        this.moveVector = { x: mx / Math.hypot(mx, my), y: my / Math.hypot(mx, my) };
      }
      if (player.dashTimer > 0) {
        const start = { x: player.x, y: player.y };
        this._move(player, this.dashVector.x * 810 * player.dashMultiplier * dt, this.dashVector.y * 810 * player.dashMultiplier * dt);
        this._phaseDash(start);
        player.dashTimer = Math.max(0, player.dashTimer - dt);
      } else {
        const speed = player.speed * (player.slowTimer > 0 ? .6 : 1);
        this._move(player, mx * speed * dt, my * speed * dt);
      }
      if (input.shoot) this._shoot();
      this._updateContracts(dt);
      this._updateEchoes(dt);
      if (this.phase !== 'playing') return;
      this._updateRelays(dt);
      this._spawnDirector(dt);
      this._updateEnemies(dt);
      if (this.phase !== 'playing') return;
      this._updateSectorThreat(dt);
      this._updateHazards(dt);
      if (this.phase !== 'playing') return;
      this._updateBullets(dt);
      if (this.phase !== 'playing') return;
      this._updatePickups(dt);
      this._objective();
    }

    _move(entity, dx, dy) {
      entity.x = clamp(entity.x + dx, entity.radius + 20, this.world.width - entity.radius - 20);
      entity.y = clamp(entity.y + dy, entity.radius + 20, this.world.height - entity.radius - 20);
      for (const rock of this.obstacles) {
        const ox = entity.x - rock.x, oy = entity.y - rock.y;
        const length = Math.hypot(ox, oy), limit = entity.radius + rock.radius;
        if (length >= limit) continue;
        if (length < 0.001) entity.x = rock.x + limit;
        else { entity.x = rock.x + ox / length * limit; entity.y = rock.y + oy / length * limit; }
      }
    }

    dash(direction) {
      const player = this.player;
      if (this.phase !== 'playing' || player.dashCooldown > 0 || player.dashTimer > 0) return false;
      const dx = direction && Number.isFinite(direction.x) ? direction.x : 0;
      const dy = direction && Number.isFinite(direction.y) ? direction.y : 0;
      const length = Math.hypot(dx, dy);
      this.dashVector = length > 0 ? { x: dx / length, y: dy / length } : { ...this.moveVector };
      this.moveVector = { ...this.dashVector };
      player.dashTimer = 0.2;
      player.invulnerable = Math.max(player.invulnerable, 0.28);
      player.dashCooldown = player.dashCooldownMax;
      this.dashMarkedIds.clear();
      this.phaseDashRefund = 0.9;
      if (this.relics.includes('phase-mag')) {
        this.ammoByWeapon[player.weapon] = Math.min(this._magSize(player.weapon), this.ammoByWeapon[player.weapon] + Math.ceil(this._magSize(player.weapon) * .25));
        this._syncWeapon();
        this._emit('relic-trigger', player, { message: '相位补弹', color: '#91f0df' });
      }
      this._emit('dash', player, { dx: this.dashVector.x, dy: this.dashVector.y, angle: Math.atan2(this.dashVector.y, this.dashVector.x) });
      return true;
    }

    _chargeReactor(amount) {
      if (this.phase !== 'playing' || this.reactor.timer > 0) return;
      this.reactor.charge = Math.min(this.reactor.maxCharge, this.reactor.charge + amount);
    }

    activateOverdrive() {
      if (this.phase !== 'playing' || this.reactor.timer > 0 || this.reactor.charge < this.reactor.maxCharge) return false;
      this.reactor.charge = 0;
      this.reactor.timer = this.reactor.duration;
      this._refillWeapons();
      this.fireTimer = 0;
      this.player.dashCooldown = 0;
      this._emit('overdrive-start', this.player, { duration: this.reactor.duration });
      return true;
    }

    _capturePhaseBullet(bullet) {
      bullet.lifetime = 0;
      this.reactor.captures += 1;
      this._chargeReactor(7);
      this._emit('phase-capture', bullet, { count: 1 });
    }

    _phaseDash(start) {
      const dx = this.player.x - start.x, dy = this.player.y - start.y;
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || this.dashMarkedIds.has(enemy.id) || this._segmentHit(start.x, start.y, dx, dy, enemy, 60) === null) continue;
        this.dashMarkedIds.add(enemy.id);
        enemy.phaseMarkTimer = 4;
        this._emit('phase-mark', enemy, { enemyId: enemy.id });
      }
      for (const bullet of this.bullets) {
        if (bullet.owner !== 'enemy' || bullet.lifetime <= 0 || this._segmentHit(start.x, start.y, dx, dy, { ...bullet, radius: 0 }, 80) === null) continue;
        this._capturePhaseBullet(bullet);
      }
    }

    _detonatePhase(target) {
      if (this.phase !== 'playing' || !(target.phaseMarkTimer > 0)) return;
      const queue = [target], radius = 125;
      target.phaseMarkTimer = 0;
      for (let index = 0; index < queue.length && this.phase === 'playing'; index += 1) {
        const origin = queue[index];
        this.reactor.detonations += 1;
        this._chargeReactor(8);
        const refund = Math.min(0.45, this.phaseDashRefund);
        this.player.dashCooldown = Math.max(0, this.player.dashCooldown - refund);
        this.phaseDashRefund -= refund;
        this._emit('phase-burst', origin, { radius, color: '#8cfff1', chain: index });
        for (const enemy of this.enemies) {
          if (this.phase !== 'playing') break;
          if (enemy.hp <= 0 || distance(origin, enemy) > radius + enemy.radius) continue;
          if (enemy.phaseMarkTimer > 0 && queue.length < 8) {
            enemy.phaseMarkTimer = 0;
            queue.push(enemy);
          }
          this._damageEnemy(enemy, 55 * this.player.damageMultiplier * (enemy.type === 'boss' ? 0.55 : 1));
        }
      }
    }

    _magSize(index) { return Math.ceil(WEAPONS[index].magSize * this.player.magazineMultiplier); }
    _syncWeapon() {
      const player = this.player;
      player.ammo = this.ammoByWeapon[player.weapon];
      player.magSize = this._magSize(player.weapon);
      player.reloadTimer = this.reloadByWeapon[player.weapon];
      player.reloadDuration = this.reloadDurationByWeapon[player.weapon];
      player.reloadProgress = player.reloadDuration > 0 ? clamp(1 - player.reloadTimer / player.reloadDuration, 0, 1) : 0;
      player.reloadAttempted = this.reloadAttemptedByWeapon[player.weapon];
      player.reloadResult = this.reloadResultByWeapon[player.weapon];
      player.overcharged = this.overchargedByWeapon[player.weapon] > 0;
    }

    switchWeapon(index) {
      if (this.phase !== 'playing' || !Number.isInteger(index) || index < 0 || index >= WEAPONS.length || this.player.weapon === index) return false;
      this.player.weapon = index;
      this.fireTimer = Math.max(this.fireTimer, 0.16);
      this._syncWeapon();
      this._emit('switch', this.player, { weapon: index });
      return true;
    }

    reload() {
      const index = this.player.weapon;
      if (this.phase !== 'playing') return false;
      if (this.reloadByWeapon[index] > 0) {
        if (this.reloadAttemptedByWeapon[index]) return false;
        this.reloadAttemptedByWeapon[index] = true;
        const progress = 1 - this.reloadByWeapon[index] / this.reloadDurationByWeapon[index];
        if (progress + 1e-9 >= this.player.reloadWindowStart && progress - 1e-9 <= this.player.reloadWindowEnd) {
          this._finishReload(index, true);
          this._syncWeapon();
          this._emit('reload-perfect', this.player, { weapon: index });
          return true;
        }
        this.reloadResultByWeapon[index] = 'miss';
        this._syncWeapon();
        this._emit('reload-miss', this.player, { weapon: index });
        return false;
      }
      if (this.ammoByWeapon[index] >= this._magSize(index)) return false;
      this.reloadDurationByWeapon[index] = WEAPONS[index].reloadTime * this.player.reloadMultiplier;
      this.reloadByWeapon[index] = this.reloadDurationByWeapon[index];
      this.reloadAttemptedByWeapon[index] = false;
      this.reloadResultByWeapon[index] = 'loading';
      this.overchargedByWeapon[index] = 0;
      this._syncWeapon();
      this._emit('reload', this.player, { weapon: index });
      return true;
    }

    _finishReload(index, perfect) {
      this.reloadByWeapon[index] = 0;
      this.ammoByWeapon[index] = this._magSize(index);
      this.overchargedByWeapon[index] = perfect ? this._magSize(index) : 0;
      this.reloadResultByWeapon[index] = perfect ? 'perfect' : this.reloadAttemptedByWeapon[index] ? 'miss' : 'idle';
      if (perfect) this._chargeReactor(10);
      if (perfect && this.relics.includes('precision-burst')) {
        const player = this.player;
        player.hp = Math.min(player.maxHp, player.hp + 10);
        for (const spread of [-.16, 0, .16]) {
          const angle = player.angle + spread;
          this.bullets.push({ id: this._id(), type: 'bullet', owner: 'player', weapon: 2, x: player.x + Math.cos(angle) * 24, y: player.y + Math.sin(angle) * 24,
            vx: Math.cos(angle) * 1250, vy: Math.sin(angle) * 1250, radius: 4, lifetime: .8, damage: 45 * player.damageMultiplier, pierce: 2, hitIds: [], color: '#ffd897' });
        }
        this._emit('relic-trigger', player, { message: '猎手齐射', color: '#ffd897' });
      }
      this._emit('reload-complete', this.player, { weapon: index, perfect });
    }

    _refillWeapons() {
      this.ammoByWeapon = WEAPONS.map((weapon, index) => this._magSize(index));
      this.reloadByWeapon.fill(0);
      this.reloadDurationByWeapon.fill(0);
      this.reloadAttemptedByWeapon.fill(false);
      this.reloadResultByWeapon.fill('idle');
      this.overchargedByWeapon.fill(0);
      this._syncWeapon();
    }

    _shoot() {
      const player = this.player, index = player.weapon, weapon = WEAPONS[index];
      if (this.fireTimer > 0 || this.reloadByWeapon[index] > 0) return;
      if (this.ammoByWeapon[index] <= 0) { this.reload(); return; }
      const overcharged = this.overchargedByWeapon[index] > 0;
      const reactor = this.reactor.timer > 0;
      if (!reactor) this.ammoByWeapon[index] -= 1;
      this.overchargedByWeapon[index] = Math.max(0, this.overchargedByWeapon[index] - 1);
      this.fireTimer = weapon.fireInterval / player.fireRateMultiplier / (reactor ? 1.45 : 1);
      for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
        const spread = weapon.pellets > 1 ? ((pellet / (weapon.pellets - 1)) * 2 - 1) * weapon.spread : (this.random() * 2 - 1) * weapon.spread;
        const angle = player.angle + spread;
        const critical = this.random() < player.critChance;
        this.bullets.push({
          id: this._id(), type: 'bullet', owner: 'player', weapon: index,
          x: player.x + Math.cos(angle) * 22, y: player.y + Math.sin(angle) * 22,
          vx: Math.cos(angle) * weapon.speed, vy: Math.sin(angle) * weapon.speed,
          radius: index === 4 ? 10 : index === 3 ? 7 : index === 2 ? 4 : 3, lifetime: weapon.lifetime,
          damage: weapon.damage * player.damageMultiplier * (critical ? 2 : 1) * (overcharged ? 1.15 : 1) * (reactor ? 1.2 : 1),
          pierce: weapon.pierce, hitIds: [], color: weapon.color, critical, overcharged, reactor,
          arc: index === 0 && player.arcRounds, repulsor: index === 1 && player.repulsorRounds,
          shatter: index === 2 && player.shatterRounds
        });
        if (index >= 3) Object.assign(this.bullets[this.bullets.length - 1], {
          kind: weapon.id, age: 0, returning: false, returnAfter: 0.52,
          blastRadius: player.blastRadius ? 202.5 : 135, returnMultiplier: player.returnEdge ? 1.6 : 1
        });
      }
      this._syncWeapon();
      this._emit('shot', player, { angle: player.angle, weapon: index, owner: 'player', color: weapon.color, overcharged, reactor });
    }

    useSkill() {
      const player = this.player;
      if (this.phase !== 'playing' || player.skillCooldown > 0) return false;
      player.skillCooldown = player.skillCooldownMax;
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || distance(player, enemy) > player.skillRadius + enemy.radius) continue;
        enemy.stunTimer = enemy.type === 'boss' ? 0.65 : 2.1;
        enemy.windup = 0;
        enemy.chargeTimer = 0;
        enemy.attackKind = '';
        enemy.attackTimer = Math.max(enemy.attackTimer, 1.2);
        this.hazards = this.hazards.filter(hazard => hazard.sourceId !== enemy.id);
        this._damageEnemy(enemy, player.skillDamage);
      }
      this.bullets = this.bullets.filter(bullet => bullet.owner !== 'enemy' || distance(player, bullet) > player.skillRadius);
      this._emit('pulse', player, { radius: player.skillRadius });
      if (this.relics.includes('echo-pulse')) this.echoBursts.push({ x: player.x, y: player.y, radius: player.skillRadius, damage: player.skillDamage * .65, remaining: .65 });
      return true;
    }

    _updateEchoes(dt) {
      for (const echo of this.echoBursts) {
        echo.remaining -= dt;
        if (echo.remaining > 0) continue;
        for (const enemy of this.enemies) {
          if (this.phase !== 'playing') break;
          if (enemy.hp > 0 && distance(echo, enemy) <= echo.radius + enemy.radius) this._damageEnemy(enemy, echo.damage);
        }
        this.bullets = this.bullets.filter(bullet => bullet.owner !== 'enemy' || distance(echo, bullet) > echo.radius);
        this._emit('pulse', echo, { radius: echo.radius });
        if (this.phase !== 'playing') break;
      }
      this.echoBursts = this.echoBursts.filter(echo => echo.remaining > 0);
    }

    _updateContracts(dt) {
      const contract = this.contracts.find(item => item.status === 'active');
      if (!contract) return;
      if (contract.kind !== 'salvage') {
        while (contract.spawned < contract.goal) {
          const point = contract.nodes[contract.spawned];
          const enemy = this.spawnEnemy(contract.kind === 'purge' ? 'nest' : contract.spawned === 0 ? 'tank' : 'charger', point);
          if (!enemy) break;
          enemy.contractId = contract.id;
          if (contract.kind === 'hunt') {
            enemy.elite = true; enemy.hp = enemy.maxHp = Math.round(enemy.maxHp * 1.8); enemy.damage *= 1.2; enemy.xp *= 2;
            enemy.name = contract.spawned === 0 ? '铁棘重甲' : '疾掠先锋';
          }
          contract.spawned++;
        }
      }
      contract.spawnTimer -= dt;
      if (contract.kind === 'salvage' && contract.spawnTimer <= 0 && distance(this.player, contract) < 650) {
        contract.spawnTimer = 9;
        if (this.enemies.filter(enemy => enemy.hp > 0).length < 28) this.spawnEnemy(contract.spawned++ % 3 === 0 ? 'mortar' : 'crawler');
      }
    }

    _advanceContract(contract) {
      contract.progress = Math.min(contract.goal, contract.progress + 1);
      if (contract.progress === contract.goal) {
        contract.status = 'ready';
        this.breathingTimer = Math.max(this.breathingTimer, 5);
        this._emit('contract-ready', contract, { message: contract.name + '完成 · 返回紫色终端领取遗物' });
      } else this._emit('contract-progress', contract, { message: contract.name + ' · ' + contract.progress + '/' + contract.goal });
    }

    contractTarget(contract) {
      if (!contract || contract.status !== 'active') return contract;
      const targets = contract.kind === 'salvage' ? contract.nodes.filter(node => !node.collected) : this.enemies.filter(enemy => enemy.contractId === contract.id && enemy.hp > 0);
      return targets.sort((a, b) => distance(a, this.player) - distance(b, this.player))[0] || contract;
    }

    chooseRelic(id) {
      if (this.phase !== 'relic' || !this.relicChoices.some(relic => relic.id === id)) return false;
      this.relics.push(id); this.relicChoices = []; this.phase = 'playing';
      this.player.invulnerable = Math.max(this.player.invulnerable, 1);
      this._emit('relic-acquired', this.player, { message: '遗物已装备：' + RELICS.find(relic => relic.id === id).title });
      if (this.player.xp >= this.player.xpNeeded) this._levelUp();
      return true;
    }

    _nearestInteractable() {
      const entities = [...this.relays.filter(relay => relay.status === 'idle'), ...this.crates.filter(crate => !crate.opened), ...this.stations,
        ...this.contracts.filter(contract => contract.status !== 'complete'),
        ...this.contracts.filter(contract => contract.kind === 'salvage' && contract.status === 'active').flatMap(contract => contract.nodes.filter(node => !node.collected))];
      return entities.filter(entity => distance(this.player, entity) <= 94).sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
    }

    interactionHint() {
      const target = this._nearestInteractable();
      if (!target) {
        const charging = this.relays.find(relay => relay.status === 'charging');
        if (charging && distance(this.player, charging) > charging.radius) return this.map.mode === 'demolition' ? '射击反应堆核心，无需留在圈内' : this.map.mode === 'escort' ? '返回运输机光圈，继续护送' : '返回信标光圈，继续上传';
        return '';
      }
      if (target.type === 'relay') return this.relays.some(relay => relay.status === 'charging') ? '先完成当前主目标' : `E · ${this.map.mode === 'demolition' ? '暴露' : '启动'}${target.name} / ${this.map.mode === 'demolition' ? '射击拆毁' : this.map.mode === 'escort' ? '跟随护送' : '坚守 40 秒'}`;
      if (target.type === 'crate') return 'E · 打开补给箱';
      if (target.type === 'core') return 'E · 回收勘探核心';
      if (target.type === 'contract') {
        if (target.status === 'ready') return 'E · 领取遗物 / +30 芯片 / +35 生命';
        if (target.status === 'active') return target.name + ' · ' + target.progress + '/' + target.goal + ' · 按地图查看目标';
        return this.contracts.some(contract => contract.status === 'active' || contract.status === 'ready') ? '先完成当前支线并领取奖励' : 'E · 接受支线：' + target.name;
      }
      if (target.kind === 'medical') return this.player.hp >= this.player.maxHp ? '生命已满' : `E · 恢复 50 生命 / ${target.cost} 芯片`;
      return target.uses >= 4 ? '工坊强化已达上限' : `E · 全武器伤害 +8% / ${target.cost} 芯片`;
    }

    interact() {
      if (this.phase !== 'playing') return false;
      const target = this._nearestInteractable();
      if (!target) return false;
      if (target.type === 'relay') {
        if (this.relays.some(relay => relay.status === 'charging')) return false;
        target.status = 'charging';
        target.wave = 1;
        target.waveSpawns = 0;
        target.waveName = this._relayWaveName(target);
        if (target.mode === 'demolition') this._spawnReactor(target);
        if (target.mode === 'escort') this.escort = target;
        this.relaySpawnTimer = 1.2;
        this._emit('relay-start', target, { name: target.name, theme: target.theme, wave: target.wave, waveName: target.waveName });
      } else if (target.type === 'crate') {
        target.opened = true;
        this.player.credits += 14;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 16);
        this._drop('xp', 18, target.x + 10, target.y);
        this._emit('interact', target, { message: '补给：+14 芯片 · +16 生命 · 经验核心', kind: 'crate' });
      } else if (target.type === 'core') {
        target.collected = true;
        this._advanceContract(this.contracts.find(contract => contract.nodes.includes(target)));
      } else if (target.type === 'contract') {
        if (target.status === 'ready') {
          target.status = 'complete'; this.player.credits += 30; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35); this.score += 450;
          this.relicChoices = RELICS.filter(relic => !this.relics.includes(relic.id));
          if (this.relicChoices.length) this.phase = 'relic';
          this._emit('contract-reward', target, { message: '支线完成 · 选择一件本局遗物' });
        } else if (target.status === 'idle' && !this.contracts.some(contract => contract.status === 'active' || contract.status === 'ready')) {
          target.status = 'active'; this._updateContracts(0);
          this._emit('contract-start', target, { contractId: target.id, message: target.name + ' · ' + target.description });
        } else return false;
      } else {
        if (this.player.credits < target.cost || (target.kind === 'medical' && this.player.hp >= this.player.maxHp) || (target.kind === 'armory' && target.uses >= 4)) return false;
        this.player.credits -= target.cost;
        target.uses += 1;
        if (target.kind === 'medical') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 50);
        else { this.player.damageMultiplier += 0.08; target.cost += 10; }
        this._refillWeapons();
        this._emit('interact', target, { message: target.kind === 'medical' ? '生命恢复 · 弹药补满' : '全武器伤害提升 · 弹药补满', kind: target.kind });
      }
      this._objective();
      return true;
    }

    _updateRelays(dt) {
      const relay = this.relays.find(item => item.status === 'charging');
      if (!relay) return;
      if (relay.mode === 'demolition') {
        this._spawnReactor(relay);
        const core = this.enemies.find(enemy => enemy.id === relay.reactorId && enemy.hp > 0);
        if (core) relay.progress = clamp(1 - core.hp / core.maxHp, 0, 1);
      } else if (relay.mode === 'escort') {
        if (distance(this.player, relay) <= relay.radius) {
          let movement = relay.escortSpeed * dt;
          while (movement > 0 && relay.waypointIndex < relay.waypoints.length) {
            const point = relay.waypoints[relay.waypointIndex], gap = distance(relay, point);
            const step = Math.min(movement, gap);
            if (gap > 0) { relay.x += (point.x - relay.x) / gap * step; relay.y += (point.y - relay.y) / gap * step; }
            movement -= step; relay.escortDistance += step;
            if (step >= gap) relay.waypointIndex += 1;
          }
          relay.progress = relay.waypointIndex >= relay.waypoints.length ? 1 : Math.min(1, relay.escortDistance / relay.routeLength);
        }
      } else if (distance(this.player, relay) <= relay.radius) relay.progress = Math.min(1, relay.progress + dt / relay.duration);
      const wave = Math.min(3, Math.floor(relay.progress * 3) + 1);
      if (wave !== relay.wave) {
        relay.wave = wave;
        relay.waveSpawns = 0;
        relay.waveName = this._relayWaveName(relay);
        this.relaySpawnTimer = Math.min(this.relaySpawnTimer, 1.2);
        this._emit('relay-wave', relay, { name: relay.name, theme: relay.theme, wave, waveName: relay.waveName });
      }
      this.relaySpawnTimer -= dt;
      if (this.relaySpawnTimer <= 0 && this.elapsed >= (relay.mode === 'defense' ? 25 : 5) && this.breathingTimer <= 0 && this.pressurePhase !== 'recovery') {
        this.relaySpawnTimer = Math.max(3.4, 6 - relay.wave * 0.6);
        if (this.enemies.length < 30) {
          let type = 'crawler';
          if (relay.theme === 'swarm') type = relay.wave === 3 && relay.waveSpawns % 2 === 0 ? 'charger' : 'crawler';
          if (relay.theme === 'crossfire') type = relay.wave === 3 && relay.waveSpawns % 3 === 2 ? 'charger' : 'spitter';
          if (relay.theme === 'siege') type = relay.waveSpawns === 0 ? 'tank' : relay.wave === 3 ? 'charger' : 'crawler';
          this.spawnEnemy(type);
          relay.waveSpawns += 1;
        }
      }
      if (relay.progress < 1 || relay.mode === 'demolition') return;
      this._completeRelay(relay);
    }

    _spawnReactor(relay) {
      if (relay.reactorId !== null) return;
      const core = this.spawnEnemy('reactor', relay);
      if (!core) return;
      core.objectiveRelayId = relay.id;
      core.name = relay.name;
      relay.reactorId = core.id;
    }

    _completeRelay(relay) {
      if (!relay || relay.status !== 'charging') return;
      relay.progress = 1;
      relay.status = 'active';
      this.hazards = this.hazards.filter(hazard => hazard.owner !== 'environment');
      this.sectorThreat.active = false;
      this.sectorThreat.timer = 6;
      if (relay.mode === 'escort') {
        this.escort = null;
        const next = this.relays[this.relays.indexOf(relay) + 1];
        if (next) next.status = 'idle';
      }
      this.completedRelays += 1;
      this.score += 600;
      this.player.credits += 30;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35);
      this.player.xp += 60;
      this.breathingTimer = this.map.mode === 'defense' ? 7 : 3;
      this._emit('relay-complete', relay, { name: relay.name, completed: this.completedRelays, xp: 60, credits: 30, healing: 35 });
      if (this.completedRelays === this.relays.length) this._spawnBoss();
      this._objective();
    }

    _relayWaveName(relay) {
      const names = {
        swarm: ['虫群探路', '密集虫潮', '冲锋尾波'],
        crossfire: ['毒液前哨', '交叉弹幕', '突袭掩护'],
        siege: ['重装先锋', '铁壁护卫', '破阵强袭']
      };
      return names[relay.theme][Math.max(0, relay.wave - 1)];
    }

    _spawnDirector(dt) {
      this.pressurePhase = this.breathingTimer > 0 ? 'recovery' : this.elapsed < 25 ? 'arrival' : (this.elapsed - 25) % 32 < 24 ? 'pressure' : 'recovery';
      if (this.pressurePhase === 'recovery') {
        this.spawnTimer = Math.max(this.spawnTimer, 0.8);
        return;
      }
      this.spawnTimer -= dt;
      if (this.spawnTimer > 0) return;
      const pressure = Math.min(4, this.elapsed / 100) + this.completedRelays * 0.75;
      this.spawnTimer = this.elapsed < 25 ? 4.2 : this.bossSpawned ? 2.8 : Math.max(0.95, 2.45 - pressure * 0.23);
      const cap = this.elapsed < 25 ? 3 : this.bossSpawned ? 20 : Math.min(38, 11 + Math.floor(this.elapsed / 75) * 3 + this.completedRelays * 4);
      if (this.enemies.filter(enemy => enemy.hp > 0).length >= cap) return;
      const roll = this.random();
      const type = this.elapsed > 100 && roll > .975 ? 'mortar' : this.elapsed < 25 ? (this.elapsed >= 12 && roll > .7 ? 'spitter' : 'crawler') : roll < 0.49 ? 'crawler' : roll < 0.78 ? 'spitter' : roll < 0.94 && this.elapsed > 45 ? 'charger' : this.elapsed > 70 ? 'tank' : 'crawler';
      this.spawnEnemy(type);
    }

    spawnEnemy(type = 'crawler', position) {
      if (this.enemies.filter(enemy => enemy.hp > 0).length >= 55 || !ENEMIES[type]) return null;
      const data = ENEMIES[type];
      let point = position;
      if (!point) {
        const safeDistance = this.elapsed < 25 ? 600 : 400;
        for (let attempt = 0; attempt < 16; attempt += 1) {
          const angle = this.random() * TAU + attempt * 2.399963, range = (this.elapsed < 25 ? 710 : 570) + this.random() * 180;
          point = { x: clamp(this.player.x + Math.cos(angle) * range, 70, this.world.width - 70), y: clamp(this.player.y + Math.sin(angle) * range, 70, this.world.height - 70) };
          if (distance(point, this.player) > safeDistance && !this.obstacles.some(rock => distance(point, rock) < rock.radius + data.radius)) break;
        }
        if (distance(point, this.player) <= safeDistance || this.obstacles.some(rock => distance(point, rock) < rock.radius + data.radius)) return null;
      }
      const scale = type === 'boss' ? 1 : 1 + this.completedRelays * 0.2 + Math.min(0.8, this.elapsed / 900);
      const enemy = {
        id: this._id(), type, x: point.x, y: point.y, radius: data.radius,
        hp: Math.round(data.hp * scale), maxHp: Math.round(data.hp * scale),
        speed: data.speed, damage: data.damage, xp: data.xp, angle: 0,
        attackTimer: 1 + this.random(), contactTimer: 0, stunTimer: 0,
        windup: 0, chargeTimer: 0, chargeX: 0, chargeY: 0, stage: 1, attackCount: 0,
        recoveryTimer: 0, knockbackTimer: 0, knockbackX: 0, knockbackY: 0, attackKind: '', phaseMarkTimer: 0
      };
      if (type === 'boss') Object.assign(enemy, { variant: this.map.id, name: this.map.boss.name, color: this.map.boss.color, attackName: '', attackHint: '' });
      this.enemies.push(enemy);
      return enemy;
    }

    _spawnBoss() {
      if (this.bossSpawned) return;
      this.bossSpawned = true;
      this.hazards = this.hazards.filter(hazard => hazard.owner !== 'environment');
      this.sectorThreat.active = false;
      const player = this.player;
      let position = { x: clamp(player.x - 470, 150, this.world.width - 150), y: clamp(player.y - 350, 150, this.world.height - 150) };
      if (this.enemies.filter(enemy => enemy.hp > 0).length >= 55) this.enemies.splice(this.enemies.findIndex(enemy => enemy.hp > 0 && !enemy.contractId && !enemy.objectiveRelayId), 1);
      const boss = this.spawnEnemy('boss', position);
      this._move(boss, 0, 0);
      boss.attackTimer = 3.5;
      this._emit('boss-spawn', boss);
    }

    _updateEnemies(dt) {
      const player = this.player;
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0) continue;
        enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - dt);
        if (enemy.type === 'reactor') continue;
        enemy.contactTimer = Math.max(0, enemy.contactTimer - dt);
        if (enemy.stunTimer > 0) { enemy.stunTimer -= dt; continue; }
        enemy.attackTimer -= dt;
        if (enemy.knockbackTimer > 0) {
          enemy.knockbackTimer = Math.max(0, enemy.knockbackTimer - dt);
          this._move(enemy, enemy.knockbackX * dt, enemy.knockbackY * dt);
          continue;
        }
        if (enemy.recoveryTimer > 0) { enemy.recoveryTimer = Math.max(0, enemy.recoveryTimer - dt); continue; }
        const dx = player.x - enemy.x, dy = player.y - enemy.y, length = Math.max(1, Math.hypot(dx, dy));
        enemy.angle = Math.atan2(dy, dx);
        if (enemy.type === 'boss') this._updateBoss(enemy, dt, dx / length, dy / length, length);
        else if (enemy.type === 'nest') {
          if (enemy.attackTimer <= 0 && length < 720) {
            enemy.attackTimer = 6;
            const brood = this.enemies.filter(item => item.hp > 0 && item.nestId === enemy.id);
            if (brood.length < 3) {
              const angle = this.random() * TAU;
              const child = this.spawnEnemy('crawler', { x: enemy.x + Math.cos(angle) * 65, y: enemy.y + Math.sin(angle) * 65 });
              if (child) { child.nestId = enemy.id; this._move(child, 0, 0); }
            }
          }
        }
        else if (enemy.type === 'mortar') {
          if (enemy.windup > 0) {
            enemy.windup = Math.max(0, enemy.windup - dt);
            if (enemy.windup === 0) { enemy.recoveryTimer = 1.2; enemy.attackKind = ''; }
          } else if (enemy.attackTimer <= 0 && length < 720) {
            enemy.windup = 1.25; enemy.attackTimer = 4.8; enemy.attackKind = 'bombard';
            this._addHazard('blast', player.x, player.y, 86, 1.25, enemy.damage, { sourceId: enemy.id, color: '#ffbc82', owner: 'enemy' });
          } else this._steerMove(enemy, dx / length, dy / length, enemy.speed * (length > 460 ? 1 : length < 230 ? -.6 : 0), dt);
        }
        else if (enemy.type === 'tank') {
          if (enemy.windup > 0) {
            enemy.windup = Math.max(0, enemy.windup - dt);
            if (enemy.windup === 0) { enemy.recoveryTimer = 1.5; enemy.attackKind = ''; }
          } else if (enemy.attackTimer <= 0 && length < 155) {
            enemy.windup = 0.95;
            enemy.attackKind = 'slam';
            enemy.attackTimer = 4.1;
            this._addHazard('blast', enemy.x, enemy.y, 125, 0.95, 23, { sourceId: enemy.id, enemyType: 'tank', color: '#ffbd7b', owner: 'enemy' });
          } else this._steerMove(enemy, dx / length, dy / length, enemy.speed, dt);
        }
        else if (enemy.type === 'charger') {
          if (enemy.chargeTimer > 0) {
            enemy.chargeTimer = Math.max(0, enemy.chargeTimer - dt);
            this._move(enemy, enemy.chargeX * 440 * dt, enemy.chargeY * 440 * dt);
            if (enemy.chargeTimer === 0) enemy.recoveryTimer = 0.7;
          } else if (enemy.windup > 0) {
            enemy.windup = Math.max(0, enemy.windup - dt);
            if (enemy.windup === 0) enemy.chargeTimer = 0.63;
          } else if (enemy.attackTimer <= 0 && length < 400 && length > 85) {
            enemy.windup = 0.72;
            enemy.chargeX = dx / length; enemy.chargeY = dy / length;
            enemy.attackTimer = 4.2;
            this._addHazard('charge', enemy.x, enemy.y, 22, 0.72, 0, { angle: enemy.angle, length: 280, visualOnly: true, sourceId: enemy.id });
          } else this._steerMove(enemy, dx / length, dy / length, enemy.speed, dt);
        } else if (enemy.type === 'spitter') {
          const clearShot = !this.obstacles.some(rock => this._segmentHit(enemy.x, enemy.y, dx, dy, rock, 6) !== null);
          if (enemy.windup > 0) {
            enemy.windup = Math.max(0, enemy.windup - dt);
            enemy.angle = enemy.shotAngle;
            if (enemy.windup === 0) {
              this._enemyBullet(enemy, enemy.shotAngle, 270, enemy.damage);
              enemy.attackTimer = 2.25;
              enemy.recoveryTimer = 0.3;
            }
          } else if (enemy.attackTimer <= 0 && length < 700 && clearShot) {
            enemy.windup = 0.55;
            enemy.shotAngle = enemy.angle;
          } else {
            const move = !clearShot || length > 340 ? 1 : length < 230 ? -0.55 : 0;
            this._steerMove(enemy, dx / length, dy / length, enemy.speed * move, dt);
          }
        } else this._steerMove(enemy, dx / length, dy / length, enemy.speed, dt);
        if (enemy.windup <= 0 && enemy.recoveryTimer <= 0 && distance(player, enemy) < player.radius + enemy.radius && enemy.contactTimer <= 0) {
          this._damagePlayer(enemy.damage);
          enemy.contactTimer = 0.8;
        }
      }
      // A light separation pass keeps large crowds readable without changing pursuit.
      for (let a = 0; a < this.enemies.length; a += 1) {
        const left = this.enemies[a];
        if (left.hp <= 0 || left.type === 'boss' || left.type === 'nest' || left.type === 'reactor' || left.chargeTimer > 0 || left.windup > 0) continue;
        for (let b = a + 1; b < this.enemies.length; b += 1) {
          const right = this.enemies[b];
          if (right.hp <= 0 || right.type === 'boss' || right.type === 'nest' || right.type === 'reactor' || right.chargeTimer > 0 || right.windup > 0) continue;
          const dx = left.x - right.x, dy = left.y - right.y, length = Math.hypot(dx, dy);
          const gap = (left.radius + right.radius) * 0.96;
          if (length < gap) {
            const push = (gap - length) * Math.min(0.18, dt * 8);
            const nx = length > 0.01 ? dx / length : Math.cos(left.id + right.id);
            const ny = length > 0.01 ? dy / length : Math.sin(left.id + right.id);
            this._move(left, nx * push, ny * push);
            this._move(right, -nx * push, -ny * push);
          }
        }
      }
      this.enemies = this.enemies.filter(enemy => enemy.hp > 0);
    }

    _steerMove(enemy, nx, ny, speed, dt) {
      if (speed <= 0) { this._move(enemy, nx * speed * dt, ny * speed * dt); return; }
      let blocking = null;
      for (const rock of this.obstacles) {
        const dx = rock.x - enemy.x, dy = rock.y - enemy.y;
        const forward = dx * nx + dy * ny, side = dx * -ny + dy * nx;
        if (forward > 0 && forward < rock.radius + enemy.radius + 95 && Math.abs(side) < rock.radius + enemy.radius + 12) {
          blocking = rock;
          if (enemy.avoidRockId !== rock.id) {
            enemy.avoidRockId = rock.id;
            enemy.avoidSide = Math.abs(side) < 1 ? (enemy.id % 2 ? 1 : -1) : side > 0 ? -1 : 1;
          }
          break;
        }
      }
      if (blocking) {
        const sx = nx - ny * enemy.avoidSide * 1.8, sy = ny + nx * enemy.avoidSide * 1.8;
        const length = Math.hypot(sx, sy);
        nx = sx / length; ny = sy / length;
      } else enemy.avoidRockId = null;
      this._move(enemy, nx * speed * dt, ny * speed * dt);
    }

    _updateBoss(boss, dt, nx, ny, length) {
      const variant = boss.variant || this.map.id;
      if (boss.stage === 1 && boss.hp <= boss.maxHp * 0.5) {
        boss.stage = 2;
        boss.attackTimer = 1.6;
        boss.recoveryTimer = 1.2;
        boss.windup = 0;
        boss.chargeTimer = 0;
        boss.attackKind = '';
        boss.attackName = ''; boss.attackHint = '';
        this.hazards = this.hazards.filter(hazard => hazard.sourceId !== boss.id);
        this._emit('boss-phase', boss, { stage: 2 });
        for (let index = 0; index < 2; index += 1) this.spawnEnemy('charger');
        return;
      }
      if (boss.chargeTimer > 0) {
        boss.chargeTimer = Math.max(0, boss.chargeTimer - dt);
        this._move(boss, boss.chargeX * 550 * dt, boss.chargeY * 550 * dt);
        if (boss.chargeTimer === 0) { boss.recoveryTimer = 1.05; boss.attackKind = ''; boss.attackName = ''; boss.attackHint = ''; }
        return;
      }
      if (boss.windup > 0) {
        boss.windup = Math.max(0, boss.windup - dt);
        if (boss.windup === 0) {
          if (boss.attackKind === 'charge') boss.chargeTimer = 0.85;
          else {
            if (boss.attackKind === 'ring') {
              const count = boss.stage === 2 ? 20 : 14;
              for (let index = 0; index < count; index += 1) this._enemyBullet(boss, TAU * index / count + boss.attackCount * 0.22, boss.stage === 2 ? 220 : 180, 13);
              this._emit('boss-ring', boss, { radius: 80 });
            }
            if (boss.attackKind === 'fan') {
              const count = boss.stage === 2 ? 11 : 7;
              for (let index = 0; index < count; index += 1) this._enemyBullet(boss, boss.shotAngle + (index / (count - 1) - .5) * boss.spread, boss.stage === 2 ? 255 : 220, 11);
            }
            boss.recoveryTimer = 0.95;
            boss.attackKind = '';
            boss.attackName = ''; boss.attackHint = '';
          }
        }
        return;
      }
      if (length > 210) this._steerMove(boss, nx, ny, boss.speed, dt);
      if (boss.attackTimer > 0) return;
      boss.attackCount += 1;
      boss.attackTimer = variant === 'frontier' ? (boss.stage === 2 ? 3.5 : 4.4) : (boss.stage === 2 ? 4.2 : 5.2);
      const attack = boss.attackCount % 3;
      if (variant === 'foundry' && attack === 1) {
        boss.attackKind = 'heat-cross'; boss.windup = 1.5;
        boss.attackName = '十字热浪'; boss.attackHint = '斜向移出两条热浪带';
        for (const angle of [0, Math.PI / 2]) this._addHazard('lane', this.player.x - Math.cos(angle) * 320, this.player.y - Math.sin(angle) * 320, boss.stage === 2 ? 36 : 28, 1.5, 17,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', angle, length: 640, color: boss.color, name: boss.attackName, hint: boss.attackHint });
      } else if (variant === 'foundry' && attack === 2) {
        boss.attackKind = 'fan'; boss.windup = 1.3; boss.shotAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x); boss.spread = 1.4;
        boss.attackName = '扇形熔弹'; boss.attackHint = '朝两侧移动，离开正面扇区';
      } else if (variant === 'frost' && attack === 1) {
        boss.attackKind = 'ice-ring'; boss.windup = 1.5;
        boss.attackName = '霜棘冰环'; boss.attackHint = '进入空心内圈，或远离整个冰环';
        this._addHazard('ring', boss.x, boss.y, boss.stage === 2 ? 245 : 215, 1.5, 18,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', innerRadius: boss.stage === 2 ? 140 : 125, color: boss.color, effect: 'slow', name: boss.attackName, hint: boss.attackHint });
      } else if (variant === 'frost' && attack === 2) {
        boss.attackKind = 'ice-hunt'; boss.windup = 1.5;
        boss.attackName = '冰爆追击'; boss.attackHint = '离开锁定蓝圈，冰缓时用冲刺脱离';
        this._addHazard('blast', this.player.x, this.player.y, boss.stage === 2 ? 120 : 95, 1.5, 16,
          { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', color: boss.color, effect: 'slow', name: boss.attackName, hint: boss.attackHint });
      } else if (attack === 1) {
        boss.attackKind = 'blast';
        boss.attackName = '裂隙轰击'; boss.attackHint = '离开锁定爆圈';
        boss.windup = boss.stage === 2 ? 1.45 : 1.12;
        this._addHazard('blast', this.player.x, this.player.y, boss.stage === 2 ? 125 : 100, 1.12, 24, { sourceId: boss.id, enemyType: 'boss', owner: 'enemy', name: boss.attackName, hint: boss.attackHint });
        if (boss.stage === 2) {
          this._addHazard('blast', this.player.x + 190, this.player.y - 90, 90, 1.45, 20, { sourceId: boss.id, enemyType: 'boss', owner: 'enemy' });
          this._addHazard('blast', this.player.x - 190, this.player.y + 90, 90, 1.45, 20, { sourceId: boss.id, enemyType: 'boss', owner: 'enemy' });
        }
      } else if (attack === 2) {
        boss.attackKind = 'ring';
        boss.attackName = '环形弹幕'; boss.attackHint = '穿过弹幕间隙，冲刺可吸收敌弹';
        boss.windup = 0.85;
      } else {
        boss.windup = variant === 'frontier' ? 1 : 1.3;
        boss.attackKind = 'charge';
        boss.attackName = variant === 'foundry' ? '熔炉碾压' : variant === 'frost' ? '霜线突袭' : '断层冲锋';
        boss.attackHint = '横向移出冲锋路线';
        boss.chargeX = nx; boss.chargeY = ny;
        this._addHazard('charge', boss.x, boss.y, boss.radius, boss.windup, 0, { angle: boss.angle, length: 470, visualOnly: true, sourceId: boss.id, color: boss.color, name: boss.attackName, hint: boss.attackHint });
      }
      this._emit('boss-attack', boss, { name: boss.attackName, hint: boss.attackHint, color: boss.color });
    }

    _enemyBullet(enemy, angle, speed, damage) {
      const color = enemy.color || '#ff7791';
      this.bullets.push({ id: this._id(), type: 'bullet', owner: 'enemy', x: enemy.x + Math.cos(angle) * (enemy.radius + 8), y: enemy.y + Math.sin(angle) * (enemy.radius + 8), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 6, lifetime: 4.5, damage, pierce: 0, color });
      this._emit('shot', enemy, { angle, owner: 'enemy', color });
    }

    _updateSectorThreat(dt) {
      if (this.phase !== 'playing') return;
      const relay = this.relays.find(item => item.status === 'charging');
      this.sectorThreat.active = !!relay && !this.bossSpawned;
      if (!this.sectorThreat.active) { this.sectorThreat.timer = 6; return; }
      this.sectorThreat.timer = Math.max(0, this.sectorThreat.timer - dt);
      if (this.sectorThreat.timer > 0) return;
      if (this.breathingTimer > 0 || this.hazards.some(hazard => hazard.remaining > 0 && !hazard.visualOnly)) { this.sectorThreat.timer = .8; return; }
      this.sectorThreat.timer = this.sectorThreat.interval;
      this.sectorThreat.count += 1;
      const extra = { owner: 'environment', name: this.map.threat.name, hint: this.map.threat.description, color: this.map.color, enemyDamage: 60 };
      if (this.map.id === 'foundry') {
        const angle = this.sectorThreat.count % 2 ? 0 : Math.PI / 2;
        this._addHazard('lane', this.player.x - Math.cos(angle) * 260, this.player.y - Math.sin(angle) * 260, 32, 1.5, 14, { ...extra, angle, length: 520 });
      } else this._addHazard('blast', this.player.x, this.player.y, this.map.id === 'frost' ? 95 : 105, 1.5, this.map.id === 'frost' ? 10 : 12, { ...extra, ...(this.map.id === 'frost' ? { effect: 'slow' } : {}) });
      this._emit('sector-warning', this.player, { name: extra.name, hint: extra.hint, color: extra.color });
    }

    _addHazard(type, x, y, radius, duration, damage, extra = {}) {
      this.hazards.push({ id: this._id(), type, x, y, radius, duration, remaining: duration, damage, owner: 'enemy', ...extra });
    }

    _hazardHits(hazard, target) {
      if (hazard.type === 'lane') return this._segmentHit(hazard.x, hazard.y, Math.cos(hazard.angle) * hazard.length, Math.sin(hazard.angle) * hazard.length, target, hazard.radius) !== null;
      const gap = distance(target, hazard);
      if (hazard.type === 'ring') return gap <= hazard.radius + target.radius && gap + target.radius >= hazard.innerRadius;
      return gap <= hazard.radius + target.radius;
    }

    _updateHazards(dt) {
      for (const hazard of this.hazards) {
        if (this.phase !== 'playing') break;
        if (hazard.sourceId && !this.enemies.some(enemy => enemy.id === hazard.sourceId && enemy.hp > 0)) { hazard.remaining = 0; continue; }
        hazard.remaining -= dt;
        if (hazard.remaining > 0 || hazard.visualOnly || hazard.resolved) continue;
        hazard.resolved = true;
        if (this._hazardHits(hazard, this.player) && this._damagePlayer(hazard.damage) && hazard.effect === 'slow' && this.phase === 'playing') this.player.slowTimer = 2;
        if (hazard.owner === 'environment') {
          for (const enemy of this.enemies) {
            if (this.phase !== 'playing') break;
            if (enemy.hp > 0 && enemy.type !== 'boss' && enemy.type !== 'reactor' && this._hazardHits(hazard, enemy)) this._damageEnemy(enemy, hazard.enemyDamage || 60);
          }
        }
        this._emit('hazard-burst', hazard, { hazardType: hazard.type, radius: hazard.radius, innerRadius: hazard.innerRadius, angle: hazard.angle, length: hazard.length, owner: hazard.owner, color: hazard.color, effect: hazard.effect });
      }
      this.hazards = this.hazards.filter(hazard => hazard.remaining > 0);
    }

    _segmentHit(x, y, dx, dy, target, radius) {
      const square = dx * dx + dy * dy;
      const amount = square ? clamp(((target.x - x) * dx + (target.y - y) * dy) / square, 0, 1) : 0;
      return Math.hypot(x + dx * amount - target.x, y + dy * amount - target.y) <= target.radius + radius ? amount : null;
    }

    _updateBullets(dt) {
      for (const bullet of this.bullets) {
        if (this.phase !== 'playing') break;
        bullet.lifetime -= dt;
        if (bullet.lifetime <= 0) {
          if (bullet.kind === 'grenade') this._burstGrenade(bullet);
          continue;
        }
        if (bullet.kind) bullet.age += dt;
        if (bullet.kind === 'boomerang') {
          if (!bullet.returning && bullet.age >= bullet.returnAfter) {
            bullet.returning = true;
            bullet.hitIds = [];
            bullet.damage *= bullet.returnMultiplier;
          }
          if (bullet.returning) {
            const gap = distance(bullet, this.player);
            bullet.vx = gap > 0 ? (this.player.x - bullet.x) / gap * 860 : 0;
            bullet.vy = gap > 0 ? (this.player.y - bullet.y) / gap * 860 : 0;
          }
        }
        const dx = bullet.vx * dt, dy = bullet.vy * dt;
        const hits = [];
        for (const rock of this.obstacles) {
          const t = this._segmentHit(bullet.x, bullet.y, dx, dy, rock, bullet.radius);
          if (t !== null) hits.push({ t, obstacle: true, target: rock });
        }
        if (bullet.owner === 'player') {
          for (const enemy of this.enemies) {
            if (enemy.hp <= 0 || bullet.hitIds.includes(enemy.id)) continue;
            const t = this._segmentHit(bullet.x, bullet.y, dx, dy, enemy, bullet.radius);
            if (t !== null) hits.push({ t, target: enemy });
          }
        } else {
          if (this.player.dashTimer > 0) {
            const capture = this._segmentHit(bullet.x, bullet.y, dx, dy, { ...this.player, radius: 0 }, 80);
            if (capture !== null) hits.push({ t: capture, capture: true });
          }
          const t = this._segmentHit(bullet.x, bullet.y, dx, dy, this.player, bullet.radius);
          if (t !== null) hits.push({ t, target: this.player });
        }
        hits.sort((a, b) => a.t - b.t);
        for (const hit of hits) {
          if (this.phase !== 'playing') break;
          if (hit.capture) {
            bullet.x += dx * hit.t; bullet.y += dy * hit.t;
            this._capturePhaseBullet(bullet);
            break;
          }
          if (hit.obstacle) {
            bullet.lifetime = 0;
            const impact = { x: bullet.x + dx * hit.t, y: bullet.y + dy * hit.t };
            if (bullet.kind === 'grenade') { bullet.x = impact.x; bullet.y = impact.y; this._burstGrenade(bullet); }
            else this._emit('spark', impact, { color: bullet.color });
            break;
          }
          if (bullet.owner === 'player') {
            if (hit.target.hp <= 0) continue;
            if (hit.target.phaseMarkTimer > 0) this._detonatePhase(hit.target);
            if (this.phase !== 'playing') break;
            if (bullet.kind === 'grenade') {
              bullet.x += dx * hit.t; bullet.y += dy * hit.t;
              this._burstGrenade(bullet);
              break;
            }
            this._damageEnemy(hit.target, bullet.damage, bullet.critical);
            if (this.phase !== 'playing') break;
            this._applyAmmoEffect(bullet, hit.target);
            bullet.hitIds.push(hit.target.id);
            if (bullet.pierce > 0) bullet.pierce -= 1;
            else { bullet.lifetime = 0; break; }
          } else { this._damagePlayer(bullet.damage); bullet.lifetime = 0; break; }
        }
        if (bullet.kind === 'boomerang' && bullet.returning && this._segmentHit(bullet.x, bullet.y, dx, dy, this.player, bullet.radius) !== null) bullet.lifetime = 0;
        bullet.x += dx; bullet.y += dy;
        if (bullet.x < 0 || bullet.y < 0 || bullet.x > this.world.width || bullet.y > this.world.height) bullet.lifetime = 0;
      }
      this.bullets = this.bullets.filter(bullet => bullet.lifetime > 0);
    }

    _burstGrenade(bullet) {
      if (bullet.exploded || this.phase !== 'playing') return;
      bullet.exploded = true;
      bullet.lifetime = 0;
      this._emit('grenade-burst', bullet, { radius: bullet.blastRadius, color: bullet.color });
      for (const enemy of this.enemies) {
        if (this.phase !== 'playing') break;
        if (enemy.hp > 0 && distance(bullet, enemy) <= bullet.blastRadius + enemy.radius) this._damageEnemy(enemy, bullet.damage, bullet.critical);
      }
    }

    _applyAmmoEffect(bullet, target) {
      if (bullet.arc) {
        bullet.arc = false;
        const nearby = this.enemies.filter(enemy => enemy.id !== target.id && enemy.hp > 0 && distance(enemy, target) <= 160).sort((a, b) => distance(a, target) - distance(b, target))[0];
        if (nearby) {
          this._damageEnemy(nearby, bullet.damage * 0.45);
          this._emit('arc', target, { toX: nearby.x, toY: nearby.y, color: '#a4ffed' });
        }
      }
      if (bullet.shatter) {
        bullet.shatter = false;
        for (const enemy of this.enemies) {
          if (enemy.id !== target.id && enemy.hp > 0 && distance(enemy, target) <= 92 + enemy.radius * 0.3) this._damageEnemy(enemy, bullet.damage * 0.35);
        }
        this._emit('explosion', target, { radius: 92, owner: 'player', color: '#b3a5ff' });
      }
      if (bullet.repulsor && target.hp > 0 && target.type !== 'boss' && target.type !== 'nest' && target.type !== 'reactor') {
        const speed = Math.hypot(bullet.vx, bullet.vy);
        if (target.type === 'tank') {
          if (target.windup <= 0) this._move(target, bullet.vx / speed * 3, bullet.vy / speed * 3);
        } else {
          target.windup = 0;
          target.chargeTimer = 0;
          target.attackTimer = Math.max(target.attackTimer, 0.8);
          target.knockbackX = bullet.vx / speed * 280;
          target.knockbackY = bullet.vy / speed * 280;
          target.knockbackTimer = 0.16;
          this.hazards = this.hazards.filter(hazard => hazard.sourceId !== target.id);
        }
      }
    }

    _damageEnemy(enemy, amount, critical = false) {
      if (this.phase !== 'playing' || enemy.hp <= 0) return;
      const weakpoint = enemy.recoveryTimer > 0 && (enemy.type === 'tank' || enemy.type === 'boss');
      if (enemy.type === 'tank') amount *= weakpoint ? 1.5 : 0.8;
      else if (enemy.type === 'boss' && weakpoint) amount *= 1.15;
      enemy.hp -= amount;
      enemy.hitFlash = 0.08;
      this._emit('hit', enemy, { enemyId: enemy.id, targetId: enemy.id, amount: Math.round(amount), critical, weakpoint, color: critical ? '#ffe098' : weakpoint ? '#8cdcff' : '#dcfff7' });
      if (enemy.hp > 0) return;
      this.kills += 1;
      this._chargeReactor(8);
      this.combo.count += 1;
      this.combo.timer = 4;
      this.combo.best = Math.max(this.combo.best, this.combo.count);
      this.score += Math.min(50, (this.combo.count - 1) * 2);
      this._emit('combo', enemy, { count: this.combo.count });
      if (enemy.contractId) {
        const contract = this.contracts.find(item => item.id === enemy.contractId && item.status === 'active');
        if (contract) this._advanceContract(contract);
      }
      if (enemy.objectiveRelayId) this._completeRelay(this.relays.find(relay => relay.id === enemy.objectiveRelayId));
      this.hazards = this.hazards.filter(hazard => hazard.sourceId !== enemy.id);
      this.score += enemy.type === 'boss' ? 2500 : enemy.type === 'tank' ? 65 : 20;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.lifeOnKill);
      this._emit('kill', enemy, { enemyType: enemy.type, radius: enemy.radius, angle: enemy.angle });
      if (enemy.type === 'boss') {
        this.phase = 'won';
        this.hazards = [];
        this.player.slowTimer = 0;
        this.sectorThreat.active = false;
        this.bullets = this.bullets.filter(bullet => bullet.owner === 'player');
        this._objective();
        this._emit('win', enemy);
      } else {
        this._drop('xp', enemy.xp, enemy.x, enemy.y);
        if (this.random() < 0.34) this._drop('credits', enemy.type === 'tank' ? 8 : 3, enemy.x + 12, enemy.y);
        if (this.random() < 0.045) this._drop('heal', 16, enemy.x - 12, enemy.y);
      }
    }

    _damagePlayer(amount) {
      const player = this.player;
      if (this.phase !== 'playing' || player.invulnerable > 0) return false;
      const damage = Math.max(1, amount * (1 - player.resistance));
      player.hp = Math.max(0, player.hp - damage);
      player.invulnerable = 0.8;
      this._emit('damage', player, { amount: Math.round(damage) });
      if (player.hp <= 0) {
        this.phase = 'lost';
        this.hazards = [];
        this.player.slowTimer = 0;
        this.sectorThreat.active = false;
        this._objective();
        this._emit('lose', player);
      }
      return true;
    }

    _drop(type, value, x, y) {
      this.pickups.push({ id: this._id(), type, value, x, y, radius: type === 'xp' ? 5 : 8, lifetime: 100 });
      if (this.pickups.length > 240) {
        const first = this.pickups.shift();
        const same = this.pickups.find(pickup => pickup.type === first.type);
        if (same) same.value += first.value;
      }
    }

    _updatePickups(dt) {
      const player = this.player;
      for (const pickup of this.pickups) {
        pickup.lifetime -= dt;
        const dx = player.x - pickup.x, dy = player.y - pickup.y, length = Math.hypot(dx, dy);
        if (length < player.magnetRadius + pickup.radius && length > player.radius) {
          const step = Math.min(length, (320 + (player.magnetRadius - length) * 4) * dt);
          pickup.x += dx / length * step; pickup.y += dy / length * step;
        }
        if (distance(pickup, player) > player.radius + pickup.radius + 3) continue;
        pickup.lifetime = 0;
        if (pickup.type === 'xp') player.xp += pickup.value;
        else if (pickup.type === 'credits') player.credits += pickup.value;
        else player.hp = Math.min(player.maxHp, player.hp + pickup.value);
        this._emit('pickup', pickup, { kind: pickup.type, amount: pickup.value });
      }
      this.pickups = this.pickups.filter(pickup => pickup.lifetime > 0);
      if (this.phase === 'playing' && player.xp >= player.xpNeeded) this._levelUp();
    }

    _levelUp() {
      const player = this.player;
      player.xp -= player.xpNeeded;
      player.level += 1;
      player.xpNeeded = Math.round(32 + Math.pow(player.level - 1, 1.28) * 19);
      const available = UPGRADES.filter(upgrade => (this.upgradeStacks[upgrade.id] || 0) < upgrade.maxStacks);
      const shuffled = available.map(upgrade => ({ upgrade, value: this.random() })).sort((a, b) => a.value - b.value);
      const earlyMod = player.level <= 4 && (available.find(upgrade => upgrade.weapon === player.weapon) || available.find(upgrade => upgrade.weapon !== undefined));
      const selected = earlyMod ? [earlyMod, ...shuffled.map(item => item.upgrade).filter(upgrade => upgrade.id !== earlyMod.id).slice(0, 2)] : shuffled.slice(0, 3).map(item => item.upgrade);
      this.upgradeChoices = selected.map(upgrade => ({ ...upgrade, stacks: this.upgradeStacks[upgrade.id] || 0 }));
      if (!this.upgradeChoices.length) { player.hp = player.maxHp; return; }
      this.phase = 'upgrade';
      this._emit('level-up', player, { level: player.level });
    }

    chooseUpgrade(id) {
      if (this.phase !== 'upgrade' || !this.upgradeChoices.some(upgrade => upgrade.id === id)) return false;
      const player = this.player;
      this.upgradeStacks[id] = (this.upgradeStacks[id] || 0) + 1;
      if (id === 'damage') player.damageMultiplier += 0.18;
      if (id === 'rapid') player.fireRateMultiplier += 0.14;
      if (id === 'health') { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 35); }
      if (id === 'speed') player.speed *= 1.1;
      if (id === 'magnet') { player.magnetRadius += 70; player.credits += 12; }
      if (id === 'dash') { player.dashCooldownMax *= 0.78; player.dashMultiplier *= 1.1; }
      if (id === 'pulse') { player.skillDamage += 40; player.skillRadius += 30; player.skillCooldownMax *= 0.88; }
      if (id === 'reload') player.reloadMultiplier *= 0.78;
      if (id === 'crit') player.critChance += 0.12;
      if (id === 'vampire') player.lifeOnKill += 1;
      if (id === 'shield') { player.resistance += 0.12; player.hp = Math.min(player.maxHp, player.hp + 20); }
      if (id === 'capacity') player.magazineMultiplier += 0.25;
      if (id === 'arc') player.arcRounds = true;
      if (id === 'repulsor') player.repulsorRounds = true;
      if (id === 'shatter') player.shatterRounds = true;
      if (id === 'blast-radius') player.blastRadius = true;
      if (id === 'return-edge') player.returnEdge = true;
      if (id === 'reload' || id === 'capacity') {
        this._refillWeapons();
      }
      this.upgradeChoices = [];
      this.phase = 'playing';
      player.invulnerable = Math.max(player.invulnerable, 0.65);
      this._syncWeapon();
      this._emit('upgrade', player, { upgrade: id });
      if (player.xp >= player.xpNeeded) this._levelUp();
      return true;
    }
  }

  return { Game, WEAPONS, UPGRADES, ENEMIES, RELICS, MAPS };
});
