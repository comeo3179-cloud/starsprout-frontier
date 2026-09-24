// Local, deterministic UI fixtures. Never included in the production build.
// combo: launch, press Shift (default dash direction is right), then shoot the
// purple enemies behind the player. ready: launch, press F, and shoot right.
(() => {
  const OriginalGame = Expedition.Game;
  const scene = new URLSearchParams(location.search).get('scene') || 'combo';
  Expedition.Game = class extends OriginalGame {
    reset() {
      super.reset();
      this.player.x = 1600;
      this.player.y = 1400;
      this.player.angle = 0;
      this.player.hp = this.player.maxHp = 2000;
      this.player.xpNeeded = 100000;
      this.moveVector = { x: 1, y: 0 };
      this.spawnTimer = Infinity;
      this.obstacles = [];
      if (scene === 'ready') {
        this.reactor.charge = this.reactor.maxCharge;
        const target = this.spawnEnemy('tank', { x: 1830, y: 1400 });
        target.hp = target.maxHp = 10000;
        target.speed = 0;
        target.attackTimer = Infinity;
        target.name = '暴走测试靶';
      } else {
        for (const [dx, dy] of [[58, -8], [104, 10], [148, -6]]) {
          const target = this.spawnEnemy('crawler', { x: 1600 + dx, y: 1400 + dy });
          target.speed = 0;
          target.attackTimer = Infinity;
        }
        const spitter = this.spawnEnemy('spitter', { x: 2020, y: 1260 });
        spitter.speed = 0;
        spitter.attackTimer = 5;
        for (const [x, y] of [[1685, 1394], [1730, 1410]]) {
          this._enemyBullet({ x, y, radius: 0 }, Math.PI, 8, 7);
          this.bullets[this.bullets.length - 1].lifetime = 30;
        }
      }
      return this;
    }
  };
})();
