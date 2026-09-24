// Local acceptance fixtures only; the production build reads a fixed source list.
(() => {
  const OriginalGame = Expedition.Game;
  const scene = new URLSearchParams(location.search).get('scene') || 'maps';
  const report = document.createElement('output');
  report.id = 'sectors-fixture-state';
  report.hidden = true;
  document.body.append(report);

  Expedition.Game = class extends OriginalGame {
    reset(mapId) {
      super.reset(mapId);
      this.fixtureShots = Expedition.WEAPONS.map(() => 0);
      this.fixtureEvents = {};
      this.fixtureTarget = null;
      this.spawnTimer = Infinity;
      this.player.hp = this.player.maxHp = 2000;
      this.player.xpNeeded = 100000;
      if (scene === 'objectives') {
        this.player.x = this.relays[0].x;
        this.player.y = this.relays[0].y + 45;
      }
      if (scene === 'weapons') {
        if (this.map.id === 'foundry') {
          this.elapsed = 7;
          this.kills = 4;
          this.player.credits = 23;
          this.reactor.charge = 37;
        }
        this.player.x = this.world.width / 2;
        this.player.y = this.world.height / 2;
        this.player.angle = 0;
        this.moveVector = { x: 1, y: 0 };
        this.obstacles = [];
        this.fixtureTarget = this.spawnEnemy('tank', { x: this.player.x + 230, y: this.player.y });
        this.fixtureTarget.hp = this.fixtureTarget.maxHp = 100000;
        this.fixtureTarget.speed = 0;
        this.fixtureTarget.attackTimer = Infinity;
      }
      this.fixtureReport();
      return this;
    }

    drainEvents() {
      const events = super.drainEvents();
      for (const event of events) {
        this.fixtureEvents[event.type] = (this.fixtureEvents[event.type] || 0) + 1;
        if (event.type === 'shot' && event.owner === 'player') this.fixtureShots[event.weapon] += 1;
      }
      this.fixtureReport();
      return events;
    }

    fixtureReport() {
      report.textContent = JSON.stringify({
        map: this.map?.id || this.mapId,
        phase: this.phase,
        elapsed: this.elapsed,
        kills: this.kills,
        credits: this.player.credits,
        weapon: this.player.weapon,
        ammo: this.ammoByWeapon,
        x: this.player.x,
        y: this.player.y,
        spawn: this.spawn,
        reactor: this.reactor.charge,
        shots: this.fixtureShots,
        events: this.fixtureEvents,
        targetHp: this.fixtureTarget?.hp ?? null,
        objective: this.currentObjective
      });
    }
  };
})();
