(function (root) {
  'use strict';

  const TYPES = ['sun', 'frost', 'bloom'];
  const TILE_SIZE = 64;
  const MAX_LEVEL = 5;
  const FINAL_WAVE = 6;
  const TOWERS = {
    sun: { damage: 16, interval: 0.86, range: 230 },
    frost: { damage: 9, interval: 1.1, range: 245 },
    bloom: { damage: 12, interval: 1.32, range: 215 }
  };
  const UPGRADES = [
    { id: 'power', title: '向阳生长', description: '所有植物伤害提高 22%', icon: '✦' },
    { id: 'haste', title: '露水节拍', description: '所有植物攻击速度提高 20%', icon: '◷' },
    { id: 'vitality', title: '修复根系', description: '核心上限增加 15，并恢复 35 点生命', icon: '♡' }
  ];

  function tilePosition(index) {
    return { x: ((index % 4) - 1.5) * TILE_SIZE, y: (Math.floor(index / 4) - 1.5) * TILE_SIZE };
  }

  class Game {
    constructor(options) {
      this.random = (options && options.random) || Math.random;
      this.reset();
    }

    reset() {
      this.phase = 'build';
      this.wave = 1;
      this.maxHealth = 100;
      this.health = 100;
      this.movesLeft = 5;
      this.score = 0;
      this.kills = 0;
      this.pulseCooldown = 0;
      this.waveElapsed = 0;
      this.waveDuration = 24;
      this.spawnRemaining = 0;
      this.board = Array(16).fill(null);
      this.enemies = [];
      this.projectiles = [];
      this.upgradeChoices = [];
      this.upgrades = { power: 0, haste: 0, vitality: 0 };
      this.events = [];
      this._nextId = 1;
      this._attackTimers = {};
      this._spawnTimer = 0;
      this._spawnIndex = 0;
      this._spawnCount = 0;
      this._spawnInterval = 1;
      const initial = [[5, 'sun'], [6, 'frost'], [9, 'sun'], [10, 'bloom']];
      for (const [index, type] of initial) this.board[index] = this._seed(type, 1);
      this.nextSeed = this._rollSeed();
      return this;
    }

    _seed(type, level) {
      return { id: this._nextId++, type, level };
    }

    _rollSeed() {
      return { type: TYPES[Math.min(2, Math.floor(this.random() * TYPES.length))], level: 1 };
    }

    _emit(type, data) {
      this.events.push(Object.assign({ type }, data || {}));
    }

    drainEvents() {
      return this.events.splice(0);
    }

    move(direction) {
      if (this.phase !== 'build' || this.movesLeft <= 0) return false;
      if (!['left', 'right', 'up', 'down'].includes(direction)) return false;
      const lines = [];
      for (let outer = 0; outer < 4; outer++) {
        const line = [];
        for (let inner = 0; inner < 4; inner++) {
          if (direction === 'left') line.push(outer * 4 + inner);
          if (direction === 'right') line.push(outer * 4 + 3 - inner);
          if (direction === 'up') line.push(inner * 4 + outer);
          if (direction === 'down') line.push((3 - inner) * 4 + outer);
        }
        lines.push(line);
      }
      const next = Array(16).fill(null);
      const merges = [];
      for (const line of lines) {
        const tiles = line.map(index => this.board[index]).filter(Boolean);
        let destination = 0;
        for (let source = 0; source < tiles.length; source++) {
          const tile = tiles[source];
          const neighbor = tiles[source + 1];
          const index = line[destination++];
          if (neighbor && tile.type === neighbor.type && tile.level === neighbor.level && tile.level < MAX_LEVEL) {
            next[index] = this._seed(tile.type, tile.level + 1);
            merges.push({ index, towerType: tile.type, level: tile.level + 1, ...tilePosition(index) });
            source++;
          } else {
            next[index] = tile;
          }
        }
      }
      if (next.every((tile, index) => tile === this.board[index])) return false;
      this.board = next;
      this.movesLeft--;
      for (const merge of merges) {
        this.score += 10 * Math.pow(2, merge.level - 1);
        this._emit('merge', merge);
      }
      const empty = this.board.map((tile, index) => tile ? -1 : index).filter(index => index >= 0);
      if (empty.length) {
        const index = empty[Math.min(empty.length - 1, Math.floor(this.random() * empty.length))];
        this.board[index] = this._seed(this.nextSeed.type, this.nextSeed.level);
        this._emit('spawn', { index, towerType: this.nextSeed.type, level: this.nextSeed.level, ...tilePosition(index) });
        this.nextSeed = this._rollSeed();
      }
      this._emit('move', { direction, merges: merges.length });
      return true;
    }

    startWave() {
      if (this.phase !== 'build') return false;
      this.phase = 'wave';
      this.waveElapsed = 0;
      this.waveDuration = this.wave === FINAL_WAVE ? 27 : 24;
      this._spawnCount = 10 + this.wave * 3;
      this._spawnIndex = 0;
      this.spawnRemaining = this._spawnCount;
      this._spawnInterval = 15 / (this._spawnCount - 1);
      this._spawnTimer = 0;
      this._attackTimers = {};
      this.pulseCooldown = 0;
      this._emit('wave-start', { wave: this.wave });
      return true;
    }

    update(dt) {
      if (this.phase !== 'wave' || !Number.isFinite(dt) || dt <= 0) return;
      // Small steps keep attacks and core collisions stable after a delayed frame.
      let remaining = Math.min(dt, 30);
      while (remaining > 0 && this.phase === 'wave') {
        const step = Math.min(remaining, 0.05);
        this._updateStep(step);
        remaining -= step;
      }
    }

    _spawnEnemy() {
      const boss = this.wave === FINAL_WAVE && this._spawnIndex === Math.floor(this._spawnCount / 2);
      const roll = this.random();
      const type = boss ? 'boss' : this.wave >= 3 && roll < 0.19 ? 'tank' : roll > 0.76 ? 'runner' : 'crawler';
      const angle = this.random() * Math.PI * 2;
      const baseHp = 20 + this.wave * 7 + Math.pow(Math.max(0, this.wave - 3), 2) * 90;
      const hp = boss ? 1150 : baseHp * (type === 'tank' ? 2.2 : type === 'runner' ? 0.68 : 1);
      const enemy = {
        id: this._nextId++, type,
        x: Math.cos(angle) * 410, y: Math.sin(angle) * 264,
        hp, maxHp: hp,
        speed: (boss ? 20 : type === 'runner' ? 43 : type === 'tank' ? 23 : 30) * (this.wave > 3 ? 1.15 : 1),
        radius: boss ? 24 : type === 'tank' ? 15 : type === 'runner' ? 9 : 11,
        coreDamage: boss ? 40 : type === 'tank' ? 12 : 7,
        slowTimer: 0, alive: true
      };
      this.enemies.push(enemy);
      this._spawnIndex++;
      this.spawnRemaining--;
      this._emit('enemy-spawn', { enemyType: type, x: enemy.x, y: enemy.y, id: enemy.id });
    }

    _updateStep(dt) {
      this.waveElapsed += dt;
      this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);
      this._spawnTimer -= dt;
      while (this.spawnRemaining > 0 && this._spawnTimer <= 0) {
        this._spawnEnemy();
        this._spawnTimer += this._spawnInterval;
      }
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const distance = Math.hypot(enemy.x, enemy.y);
        const travel = enemy.speed * (enemy.slowTimer > 0 ? 0.48 : 1) * dt;
        enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
        if (distance <= 23 + travel) {
          enemy.alive = false;
          this.health = Math.max(0, this.health - enemy.coreDamage);
          this._emit('damage', { amount: enemy.coreDamage, health: this.health, x: 0, y: 0 });
          if (this.health <= 0) {
            this.phase = 'lost';
            this._emit('loss', { wave: this.wave, score: this.score });
            break;
          }
        } else {
          enemy.x -= enemy.x / distance * travel;
          enemy.y -= enemy.y / distance * travel;
        }
      }
      if (this.phase !== 'wave') {
        this.enemies = this.enemies.filter(enemy => enemy.alive);
        return;
      }
      for (let index = 0; index < 16; index++) {
        const tile = this.board[index];
        if (!tile) continue;
        const config = TOWERS[tile.type];
        this._attackTimers[tile.id] = Math.max(0, (this._attackTimers[tile.id] || 0) - dt);
        if (this._attackTimers[tile.id] > 0) continue;
        const from = tilePosition(index);
        const range = config.range + (tile.level - 1) * 15;
        let target = null;
        let closest = Infinity;
        for (const enemy of this.enemies) {
          if (!enemy.alive || Math.hypot(enemy.x - from.x, enemy.y - from.y) > range) continue;
          const coreDistance = Math.hypot(enemy.x, enemy.y);
          if (coreDistance < closest) { target = enemy; closest = coreDistance; }
        }
        if (!target) continue;
        this._attackTimers[tile.id] = config.interval / (1 + this.upgrades.haste * 0.2);
        const damage = config.damage * Math.pow(2.2, tile.level - 1) * (1 + this.upgrades.power * 0.22);
        const to = { x: target.x, y: target.y };
        this._emit('shot', { towerType: tile.type, from, to, x: to.x, y: to.y, damage, level: tile.level });
        if (tile.type === 'bloom') {
          const radius = 55 + tile.level * 5;
          for (const enemy of this.enemies) {
            if (enemy.alive && Math.hypot(enemy.x - to.x, enemy.y - to.y) <= radius) this._damageEnemy(enemy, damage, tile.type);
          }
          this._emit('splash', { x: to.x, y: to.y, radius, towerType: tile.type });
        } else {
          if (tile.type === 'frost') target.slowTimer = 1.7 + tile.level * 0.2;
          this._damageEnemy(target, damage, tile.type);
        }
      }
      this.enemies = this.enemies.filter(enemy => enemy.alive);
      if (this.spawnRemaining === 0 && this.enemies.length === 0) this._finishWave();
    }

    _damageEnemy(enemy, damage, towerType) {
      if (!enemy.alive) return;
      enemy.hp = Math.max(0, enemy.hp - damage);
      this._emit('hit', { id: enemy.id, x: enemy.x, y: enemy.y, damage, towerType });
      if (enemy.hp === 0) {
        enemy.alive = false;
        this.kills++;
        this.score += enemy.type === 'boss' ? 1000 : enemy.type === 'tank' ? 35 : 20;
        this._emit('kill', { id: enemy.id, x: enemy.x, y: enemy.y, enemyType: enemy.type });
      }
    }

    pulse() {
      if (this.phase !== 'wave' || this.pulseCooldown > 0) return false;
      this.pulseCooldown = 12;
      const damage = (20 + this.wave * 5) * (1 + this.upgrades.power * 0.22);
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const distance = Math.hypot(enemy.x, enemy.y);
        if (distance > 400) continue;
        this._damageEnemy(enemy, damage, 'pulse');
        if (enemy.alive && distance > 0) {
          const push = enemy.type === 'boss' ? 20 : 52;
          enemy.x += enemy.x / distance * push;
          enemy.y += enemy.y / distance * push;
          enemy.slowTimer = Math.max(enemy.slowTimer, 0.6);
        }
      }
      this.enemies = this.enemies.filter(enemy => enemy.alive);
      this._emit('pulse', { x: 0, y: 0, radius: 400, damage });
      if (this.spawnRemaining === 0 && this.enemies.length === 0) this._finishWave();
      return true;
    }

    _finishWave() {
      this.score += 100 * this.wave;
      this._emit('wave-end', { wave: this.wave });
      if (this.wave === FINAL_WAVE) {
        this.phase = 'won';
        this._emit('win', { score: this.score, health: this.health });
      } else {
        this.phase = 'upgrade';
        this.upgradeChoices = UPGRADES.map(upgrade => ({ ...upgrade }));
      }
    }

    chooseUpgrade(id) {
      if (this.phase !== 'upgrade' || !this.upgradeChoices.some(choice => choice.id === id)) return false;
      this.upgrades[id]++;
      if (id === 'vitality') {
        this.maxHealth += 15;
        this.health = Math.min(this.maxHealth, this.health + 35);
      }
      this.upgradeChoices = [];
      this.wave++;
      this.phase = 'build';
      this.movesLeft = 5;
      this.waveElapsed = 0;
      this._emit('upgrade', { id, wave: this.wave });
      return true;
    }
  }

  const api = { Game, TYPES, TOWERS, MAX_LEVEL, FINAL_WAVE, tilePosition };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StarGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
