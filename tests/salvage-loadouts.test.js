'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, SALVAGE_LOADOUTS, TACTICS, WEAPONS } = require('../action-engine.js');
const choices = [['free', 0, ''], ['decoy', 4, 'decoy-dash'], ['gravity', 3, 'gravity-pulse'], ['mine', 2, 'reload-mine']];

// Boundary fixtures keep real public combat inputs while isolating patrols,
// collision and timers. Direct positioning is not a natural playthrough.
function run(loadoutId, seed = 731) {
  const game = new Game({ mode: 'salvage', seed, loadoutId }); game.start(); game.drainEvents();
  game.salvage.pending = []; game.salvage.spawnTimer = 1e6;
  game.obstacles = []; game.battlefield.props = []; game.battlefield.mines = [];
  game.enemies = []; game.bullets = []; game.hazards = []; game.pickups = []; game.stations = []; game.crates = [];
  position(game, { x: 1000, y: 1000 }); return game;
}
function position(game, point) { game.player.x = point.x; game.player.y = point.y; }
function advance(game, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-10; elapsed += 1 / 60)
    game.update(Math.min(1 / 60, seconds - elapsed), input);
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, actual + ' != ' + expected); }
function fire(game) {
  const ammo = game.player.ammo; game.update(1 / 60, { shoot: true, aimX: game.player.x, aimY: game.player.y + 500 });
  assert.equal(game.player.ammo, ammo - 1); assert.equal(game.ammoByWeapon[game.player.weapon], ammo - 1);
}
function precision(game) {
  fire(game); assert.equal(game.reload(), true); advance(game, game.player.reloadDuration * .6);
  assert.equal(game.reload(), true); assert.equal(game.player.reloadResult, 'perfect');
}
function geometry(game) {
  return JSON.stringify({ spawn: game.spawn, sources: game.salvage.sources, exits: game.salvage.exits,
    cargo: game.salvage.hotCargo, comms: game.salvage.comms, rocks: game.obstacles, fields: game.battlefield.props });
}

test('four small loadout definitions use the existing weapon and tactic identities', () => {
  assert.ok(Array.isArray(SALVAGE_LOADOUTS));
  assert.deepEqual(SALVAGE_LOADOUTS.map(item => [item.id, item.weapon, item.tacticId]), choices);
  for (const item of SALVAGE_LOADOUTS) {
    assert.ok(item.title); assert.ok(WEAPONS[item.weapon]);
    assert.ok(item.tacticId === '' || TACTICS.some(tactic => tactic.id === item.tacticId));
  }
});

for (const [id, weapon, tacticId] of choices) test(id + ' entry synchronizes the actual selected magazine without buffs or fake rewards', () => {
  const game = new Game({ mode: 'salvage', seed: 731, loadoutId: id });
  assert.equal(game.phase, 'ready'); assert.equal(game.salvage.loadoutId, id); assert.equal(game.player.weapon, weapon); assert.equal(game.tacticId, tacticId);
  assert.equal(game.player.ammo, WEAPONS[weapon].magSize); assert.equal(game.player.magSize, WEAPONS[weapon].magSize);
  assert.deepEqual(game.ammoByWeapon, WEAPONS.map(item => item.magSize)); assert.ok(game.reloadByWeapon.every(value => value === 0));
  assert.equal(game.player.skillCooldownMax, 13); assert.equal(game.player.dashCooldownMax, 2.8); assert.equal(game.player.skillCooldown, 0);
  assert.equal(game.player.hp, 120); assert.equal(game.player.maxHp, 120); assert.equal(game.player.speed, 218);
  assert.equal(game.player.damageMultiplier, 1); assert.equal(game.player.reloadMultiplier, 1); assert.equal(game.player.invulnerable, 0);
  assert.equal(game.score, 0); assert.equal(game.player.credits, 0); assert.equal(game.player.xp, 0); assert.equal(game.discoveredSecrets.size, 0);
  assert.deepEqual(game.upgradeStacks, {}); assert.deepEqual(game.relics, []); assert.deepEqual(game.tactical, { decoy: null, mine: null, cooldown: 0 });
  assert.equal(game.events.some(event => ['tactic-equipped', 'tactic-trigger', 'upgrade', 'secret-discovered', 'level-up'].includes(event.type)), false);
  assert.equal(game.start(), true); assert.equal(game.start(), false); assert.equal(game.phase, 'playing');
});

test('missing, obsolete and malformed loadout ids all retain the original neutral assault setup', () => {
  for (const loadoutId of [undefined, null, '', 'unknown', 3, { id: 'mine' }]) {
    const game = new Game({ mode: 'salvage', seed: 731, loadoutId });
    assert.equal(game.salvage.loadoutId, 'free'); assert.equal(game.player.weapon, 0); assert.equal(game.player.ammo, 30); assert.equal(game.tacticId, '');
  }
});

test('all loadouts preserve old seeded geometry, combat RNG and the last-chance detour', () => {
  for (const seed of [0, 1, 731, 4294967295]) {
    const games = choices.map(([loadoutId]) => new Game({ mode: 'salvage', seed, loadoutId })), original = geometry(games[0]);
    for (const game of games) assert.equal(geometry(game), original);
    for (let index = 0; index < 30; index++) { const value = games[0].random(); for (const game of games.slice(1)) assert.equal(game.random(), value); }
    for (const side of [0, 1]) {
      const calls = choices.map(([loadoutId]) => {
        const game = new Game({ mode: 'salvage', seed, loadoutId }); game.start(); position(game, game.salvage.exits[side]);
        assert.equal(game.interact(), true); return game.salvage.lastChance;
      });
      for (const cargo of calls) assert.deepEqual(cargo, calls[0]);
    }
  }
});

for (const [id, weapon, tacticId] of choices) test(id + ' fires its real starting weapon and ordinary switching does not replace the tactic', () => {
  const game = run(id); assert.equal(game.player.weapon, weapon); fire(game);
  assert.ok(game.bullets.some(bullet => bullet.owner === 'player' && bullet.weapon === weapon));
  assert.equal(game.switchWeapon(5), true); assert.equal(game.player.ammo, WEAPONS[5].magSize); assert.equal(game.tacticId, tacticId);
  const stored = game.ammoByWeapon[weapon]; assert.equal(game.switchWeapon(weapon), true); assert.equal(game.player.ammo, stored); assert.equal(game.tacticId, tacticId);
});

test('the decoy loadout deploys a real dash lure and redirects ordinary pursuit from the new player position', () => {
  const game = run('decoy'); assert.equal(game.dash({ x: 1, y: 0 }), true); advance(game, .2);
  const decoy = game.tactical.decoy; assert.ok(decoy); assert.equal(decoy.x, 1000); assert.equal(decoy.y, 1000);
  near(game.player.x, 1162); near(game.tactical.cooldown, 5.8);
  const crawler = game.spawnEnemy('crawler', { x: 1080, y: 1000 }); game.update(1 / 60);
  assert.ok(crawler.x < 1080, 'The old position attracts the pursuer while the player stands to its right');
  assert.equal(game.switchWeapon(0), true); assert.equal(game.tactical.decoy, decoy); assert.ok(game.tactical.cooldown > 5);
  advance(game, 2); assert.equal(game.tactical.decoy, null); assert.ok(game.tactical.cooldown > 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'tactic-trigger' && event.tacticId === 'decoy-dash').length, 1);
});

test('the gravity loadout uses real EMP damage and cooldown while moving only eligible enemies within range', () => {
  const game = run('gravity'), crawler = game.spawnEnemy('crawler', { x: 1170, y: 1000 }); crawler.hp = 200;
  const far = game.spawnEnemy('crawler', { x: 1240, y: 1000 }); far.hp = 200;
  const charger = game.spawnEnemy('charger', { x: 850, y: 1000 }); charger.windup = .5;
  const valueBefore = new Game({ mode: 'salvage', seed: 731, loadoutId: 'free' });
  for (let i = 0; i < 3; i++) valueBefore.random(); // The three real spawns consume three variant rolls.
  assert.equal(game.useSkill(), true); assert.equal(crawler.x, 1090); assert.equal(crawler.hp, 135); assert.equal(far.x, 1240); assert.equal(far.hp, 200);
  assert.equal(charger.x, 850); assert.equal(game.player.skillCooldown, 13); assert.equal(game.useSkill(), false);
  assert.equal(game.random(), valueBefore.random(), 'The tactic consumes no additional random draws');
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'pulse').length, 1);
  assert.equal(events.filter(event => event.type === 'tactic-trigger' && event.tacticId === 'gravity-pulse').length, 1);
});

test('the gravity loadout clips pulling against a real rock instead of dragging enemies through its line', () => {
  const game = run('gravity'), enemy = game.spawnEnemy('crawler', { x: 1180, y: 1000 }); enemy.hp = 200;
  game.obstacles = [{ x: 1140, y: 1000, radius: 10 }]; assert.equal(game.useSkill(), true);
  assert.ok(enemy.x >= 1165 && enemy.x < 1165.001); assert.equal(enemy.hp, 135, 'Original EMP damage is preserved');
});

test('the mine loadout requires an actual perfect reload; natural reload completion alone does not plant or refresh mines', () => {
  const game = run('mine'); fire(game); assert.equal(game.reload(), true); advance(game, 1.81);
  assert.equal(game.tactical.mine, null); assert.equal(game.tactical.cooldown, 0); assert.equal(game.player.ammo, 6);
  precision(game); const mine = game.tactical.mine; assert.ok(mine); assert.equal(mine.damage, 55); assert.equal(mine.remaining, 5); assert.equal(game.tactical.cooldown, 6);
  assert.equal(game.player.ammo, 6); assert.equal(game.player.magSize, 6); assert.equal(game.reload(), false); assert.equal(game.tactical.mine, mine);
  precision(game); assert.equal(game.tactical.mine, mine); assert.ok(game.tactical.cooldown > 4); assert.equal(game.player.ammo, 6);
  assert.equal(game.drainEvents().filter(event => event.type === 'tactic-trigger' && event.stage === 'placed').length, 1);
});

test('a naturally placed loadout mine applies its existing real damage once and consumes itself', () => {
  const game = run('mine'); precision(game); const mine = game.tactical.mine;
  const enemy = game.spawnEnemy('crawler', { x: mine.x + 60, y: mine.y }); enemy.hp = enemy.maxHp = 200; enemy.speed = 0;
  game.update(1 / 60); assert.equal(game.tactical.mine, null); assert.equal(enemy.hp, 145);
  game.update(1 / 60); assert.equal(enemy.hp, 145); assert.equal(game.drainEvents().filter(event => event.type === 'tactic-trigger' && event.stage === 'burst').length, 1);
});

test('a gravity loadout can spend EMP on the communications station without accidentally damaging or pulling enemies', () => {
  const game = run('gravity'), station = game.salvage.comms; position(game, station);
  const enemy = game.spawnEnemy('crawler', { x: station.x + 170, y: station.y }); enemy.hp = 200;
  assert.equal(game.interact(), true); assert.equal(station.status, 'linking'); assert.equal(game.player.skillCooldown, 13);
  assert.equal(enemy.x, station.x + 170); assert.equal(enemy.hp, 200); assert.equal(game.useSkill(), false);
  assert.equal(game.drainEvents().some(event => event.type === 'pulse' || event.type === 'tactic-trigger'), false);
});

for (const phase of ['ready', 'paused', 'upgrade', 'relic', 'tactic', 'won', 'lost']) test('loadout tactics and combat inputs freeze during ' + phase, () => {
  for (const loadoutId of ['decoy', 'gravity', 'mine']) {
    const game = run(loadoutId); if (loadoutId === 'decoy') game.dash({ x: 1, y: 0 }); else if (loadoutId === 'mine') precision(game);
    game.phase = phase; const snapshot = JSON.stringify({ tactical: game.tactical, player: game.player, ammo: game.ammoByWeapon });
    advance(game, 1, { moveX: 1, shoot: true }); assert.equal(game.dash({ x: 1, y: 0 }), false); assert.equal(game.useSkill(), false); assert.equal(game.reload(), false);
    assert.equal(JSON.stringify({ tactical: game.tactical, player: game.player, ammo: game.ammoByWeapon }), snapshot);
  }
});

test('all loadouts retain the optional four-sample pickup and original successful extraction settlement', () => {
  for (const [loadoutId] of choices) {
    const game = run(loadoutId), exit = game.salvage.exits[0]; position(game, exit); assert.equal(game.interact(), true);
    const cargo = game.salvage.lastChance; position(game, cargo); assert.equal(game.interact(), true); assert.equal(game.salvage.carried, 4);
    assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'lastchance').length, 2);
    position(game, exit); advance(game, 13); assert.equal(game.phase, 'won'); assert.equal(game.salvage.settled, 4); assert.equal(game.salvage.bonus, 320);
    assert.deepEqual(game.tactical, { decoy: null, mine: null, cooldown: 0 });
  }
});

test('all loadouts retain sample loss and no settlement after fatal damage', () => {
  for (const [loadoutId] of choices) {
    const game = run(loadoutId), exit = game.salvage.exits[0]; position(game, exit); assert.equal(game.interact(), true);
    position(game, game.salvage.lastChance); assert.equal(game.interact(), true); game.player.invulnerable = 0; game.player.hp = 1;
    assert.equal(game._damagePlayer(100), true); assert.equal(game.phase, 'lost'); assert.equal(game.salvage.lostSamples, 4); assert.equal(game.salvage.bonus, 0);
    assert.deepEqual(game.tactical, { decoy: null, mine: null, cooldown: 0 });
  }
});

test('same-seed reset can retain an explicitly supplied loadout but unspecified reset returns to the old neutral setup', () => {
  const game = run('mine'); precision(game); game.salvage.carried = 4;
  game.reset('frontier', { mode: 'salvage', seed: 731, loadoutId: game.salvage.loadoutId });
  assert.equal(game.salvage.loadoutId, 'mine'); assert.equal(game.player.weapon, 2); assert.equal(game.player.ammo, 6); assert.equal(game.tacticId, 'reload-mine');
  assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.lastChance, null); assert.deepEqual(game.tactical, { decoy: null, mine: null, cooldown: 0 });
  game.reset('frontier', { mode: 'salvage', seed: 731 }); assert.equal(game.salvage.loadoutId, 'free'); assert.equal(game.player.weapon, 0); assert.equal(game.tacticId, '');
});

test('ordinary maps, trials, campaigns and voyages ignore the salvage-only loadout option', () => {
  for (const mode of ['expedition', 'trial', 'campaign', 'voyage']) {
    const plain = new Game({ mode, mapId: 'frontier', seed: 731, random: () => .5 });
    const requested = new Game({ mode, mapId: 'frontier', seed: 731, random: () => .5, loadoutId: 'mine' });
    assert.equal(requested.salvage, null); assert.equal(requested.tacticId, plain.tacticId); assert.equal(requested.player.weapon, plain.player.weapon);
    assert.deepEqual(requested.player, plain.player); assert.deepEqual(requested.ammoByWeapon, plain.ammoByWeapon);
  }
});
