// Local 2.4 acceptance scenarios; never part of the production source list.
(() => {
  const OriginalGame = Expedition.Game;
  const query = new URLSearchParams(location.search);
  const scene = query.get('scene') || 'boss';
  const report = document.createElement('output');
  report.id = 'threats-fixture-state';
  report.hidden = true;
  document.body.append(report);

  Expedition.Game = class extends OriginalGame {
    reset(mapId) {
      super.reset(mapId);
      this.random = () => .5;
      this.fixtureEvents = [];
      this.fixtureCounts = {};
      this.fixtureReport();
      return this;
    }

    start() {
      if (!super.start()) return false;
      this.spawnTimer = Infinity;
      this.obstacles = [];
      this.player.hp = this.player.maxHp = 120;
      this.player.xpNeeded = 100000;
      if (scene === 'boss') {
        this.player.x = this.world.width / 2;
        this.player.y = this.world.height / 2;
        this._spawnBoss();
        const boss = this.enemies.find(enemy => enemy.type === 'boss');
        boss.x = this.player.x + (innerWidth < 600 ? 135 : 220);
        boss.y = this.player.y - (innerWidth < 600 ? 30 : 65);
        boss.speed = 0;
        boss.attackCount = Number(query.get('attack') || 0);
        boss.attackTimer = 3.8;
      } else {
        const relay = this.relays[0];
        relay.status = 'charging';
        this.player.x = relay.x;
        this.player.y = relay.y;
        this.relaySpawnTimer = Infinity;
        this.sectorThreat.timer = 3.8;
      }
      this._objective();
      this.fixtureReport();
      return true;
    }

    drainEvents() {
      const events = super.drainEvents();
      for (const event of events) {
        this.fixtureCounts[event.type] = (this.fixtureCounts[event.type] || 0) + 1;
        if (['sector-warning', 'boss-attack', 'damage', 'boss-spawn'].includes(event.type)) {
          this.fixtureEvents.push({ type: event.type, name: event.name, hint: event.hint, color: event.color, amount: event.amount });
        }
      }
      this.fixtureReport();
      return events;
    }

    fixtureReport() {
      const boss = this.enemies.find(enemy => enemy.type === 'boss');
      report.textContent = JSON.stringify({
        map: this.map.id, phase: this.phase, elapsed: this.elapsed,
        player: { x: this.player.x, y: this.player.y, radius: this.player.radius, hp: this.player.hp, slowTimer: this.player.slowTimer, dashTimer: this.player.dashTimer },
        boss: boss ? { name: boss.name, variant: boss.variant, color: boss.color, attackKind: boss.attackKind, windup: boss.windup, x: boss.x, y: boss.y } : null,
        hazards: this.hazards.map(hazard => ({ type: hazard.type, x: hazard.x, y: hazard.y, radius: hazard.radius, innerRadius: hazard.innerRadius,
          angle: hazard.angle, length: hazard.length, remaining: hazard.remaining, damage: hazard.damage, effect: hazard.effect, owner: hazard.owner })),
        events: this.fixtureEvents,
        counts: this.fixtureCounts
      });
    }
  };
})();
