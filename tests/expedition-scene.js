// Local UI fixtures only. The production build excludes this file and HTML.
(() => {
  const OriginalGame = Expedition.Game;
  const scene = new URLSearchParams(location.search).get('scene') || 'reward';
  Expedition.Game = class extends OriginalGame {
    reset() {
      super.reset();
      const contract = this.contracts[0];
      this.player.x = contract.x;
      this.player.y = contract.y + 50;
      this.spawnTimer = Infinity;
      if (scene === 'reward') { contract.status = 'ready'; contract.progress = contract.goal; }
      if (scene === 'combat') {
        this.spawnEnemy('mortar', { x: contract.x + 210, y: contract.y - 70 });
        this.spawnEnemy('nest', { x: contract.x - 180, y: contract.y - 80 });
        const elite = this.spawnEnemy('tank', { x: contract.x + 40, y: contract.y - 190 });
        elite.elite = true; elite.name = '铁棘重甲';
      }
      return this;
    }
  };
})();
