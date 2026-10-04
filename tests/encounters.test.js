'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, TACTICS, MAPS } = require('../action-engine.js');

function arena(mapId = 'frontier') {
  const game = new Game({ mapId, random: () => .5 }); game.start();
  game.spawnTimer = Infinity; game.obstacles = [];
  // Isolate encounter timing/mechanics from player mortality and XP menus.
  game.player.invulnerable = 1000; game.player.xpNeeded = 1e9;
  return game;
}
function advance(game, seconds, input = {}, hz = 60) {
  while (seconds > 1e-9) { const dt = Math.min(seconds, 1 / hz); game.update(dt, input); seconds -= dt; }
}
function at(game, point) { game.player.x = point.x; game.player.y = point.y; }
function walk(game, target, timeout = 12) {
  for (let frame = 0; frame < timeout * 60; frame++) {
    const dx = target.x - game.player.x, dy = target.y - game.player.y, gap = Math.hypot(dx, dy);
    if (gap < 4) return;
    game.update(1 / 60, { moveX: dx / gap, moveY: dy / gap });
    assert.equal(game.phase, 'playing');
  }
  assert.fail('Public movement did not reach the target');
}
function begin(game, kind) {
  const encounter = game.encounters.find(item => item.kind === kind);
  at(game, encounter);
  assert.equal(game.interactionState().target, encounter);
  assert.equal(game.interact(), true);
  assert.equal(encounter.status, 'active');
  return encounter;
}
function finishRace(game) {
  const encounter = begin(game, 'race');
  for (const node of encounter.nodes) walk(game, node);
  assert.equal(encounter.status, 'ready');
  walk(game, encounter);
  return encounter;
}
function equipped(id) {
  const game = arena();
  finishRace(game); assert.equal(game.interact(), true); assert.equal(game.chooseTactic(id), true);
  // Battle fixtures start away from the completed encounter and its guards.
  game.enemies = []; game.bullets = []; game.hazards = []; game.pickups = []; game.obstacles = [];
  at(game, { x: 1000, y: 1000 }); game.drainEvents();
  return game;
}
function precisionReload(game) {
  const index = game.player.weapon;
  game.ammoByWeapon[index]--; game._syncWeapon();
  assert.equal(game.reload(), true);
  advance(game, game.reloadDurationByWeapon[index] * .6);
  assert.equal(game.reload(), true);
  assert.equal(game.player.reloadResult, 'perfect');
}

test('three fixed optional encounters per map protect nodes and begin within a short walk; trials stay isolated', () => {
  assert.deepEqual(TACTICS.map(item => item.id), ['decoy-dash', 'reload-mine', 'gravity-pulse']);
  for (const map of MAPS) {
    const game = new Game({ mapId: map.id });
    assert.deepEqual(game.encounters.map(item => item.kind), ['race', 'rings', 'hunt']);
    assert.equal(game.encounters.length, 3);
    // New activity clearings should retain most of the original main-route cover.
    if (map.id !== 'ruins') assert.ok(game.obstacles.length >= { frontier: 22, foundry: 27, frost: 25, storm: 25 }[map.id]);
    const walkSeconds = Math.hypot(game.encounters[0].x - game.player.x, game.encounters[0].y - game.player.y) / game.player.speed;
    assert.ok(walkSeconds >= 5 && walkSeconds <= 10);
    for (const encounter of game.encounters) {
      assert.equal(encounter.status, 'idle'); assert.ok(encounter.spawnTotal <= 6);
      for (const point of [encounter, ...encounter.nodes]) for (const rock of game.obstacles)
        assert.ok(Math.hypot(point.x - rock.x, point.y - rock.y) > rock.radius + point.radius + game.player.radius);
      for (const point of encounter.guardPoints) for (const rock of game.obstacles)
        assert.ok(Math.hypot(point.x - rock.x, point.y - rock.y) >= rock.radius + 50, 'Guard spawn must fit the largest 29-radius guard');
    }
    game.reset(map.id, { mode: 'trial', seed: 7 }); game.start(); advance(game, 3);
    assert.deepEqual(game.encounters, []); assert.equal(game.tacticId, '');
    assert.equal(game.phase, 'playing'); assert.equal(game.chooseTactic(TACTICS[0].id), false);
  }
});

test('encounters respect the exact interaction distance and mutually exclude unfinished missions', () => {
  const game = arena(), race = game.encounters[0];
  at(game, { x: race.x + 94.001, y: race.y });
  assert.notEqual(game.interactionState().target, race);
  at(game, { x: race.x + 94, y: race.y });
  assert.equal(game.interactionState().target, race); assert.equal(game.interactionState().action, '挑战');
  game.relays[0].status = 'charging';
  assert.equal(game.interactionState().action, ''); assert.equal(game.interact(), false);
  game.relays[0].status = 'idle'; game.contracts[0].status = 'active';
  assert.equal(game.interact(), false);
  game.contracts[0].status = 'idle'; game.bossSpawned = true;
  assert.equal(game.interact(), false);
  game.bossSpawned = false; assert.equal(game.interact(), true);
  at(game, game.encounters[1]); assert.equal(game.interact(), false);
  at(game, game.relays[0]); assert.equal(game.interact(), false);
  at(game, game.contracts[0]); assert.equal(game.interact(), false);
});

test('race nodes require sequential physical visits and completion returns its target to the reward terminal', () => {
  const game = arena(), encounter = begin(game, 'race');
  walk(game, encounter.nodes[2]); assert.equal(encounter.progress, 0);
  assert.equal(game.encounterTarget(encounter), encounter.nodes[0]);
  for (let i = 0; i < 3; i++) {
    walk(game, encounter.nodes[i]); assert.equal(encounter.progress, i + 1);
    assert.equal(encounter.nodes[i].collected, true);
  }
  assert.equal(encounter.status, 'ready'); assert.ok(encounter.remaining > 0);
  assert.equal(game.encounterTarget(encounter), encounter);
  const elapsed = encounter.elapsed, spawned = encounter.spawned;
  advance(game, 1); assert.equal(encounter.elapsed, elapsed); assert.equal(encounter.spawned, spawned);
  assert.equal(game.drainEvents().filter(event => event.type === 'encounter-ready').length, 1);
});

test('alternating rings count only time inside the currently active circle at 30, 60, and 144 Hz', () => {
  for (const hz of [30, 60, 144]) {
    const game = arena(), encounter = begin(game, 'rings');
    advance(game, .5, {}, hz); assert.equal(encounter.progress, 0);
    at(game, encounter.nodes[0]); advance(game, 4, {}, hz);
    assert.ok(Math.abs(encounter.progress - 3.5) < 1e-7);
    assert.equal(encounter.activeNode, 1); assert.equal(game.encounterTarget(encounter), encounter.nodes[1]);
    at(game, encounter.nodes[1]); advance(game, 3.5, {}, hz);
    assert.ok(Math.abs(encounter.progress - 7) < 1e-7);
    assert.equal(encounter.activeNode, 0);
    at(game, encounter.nodes[0]); advance(game, 4, {}, hz);
    at(game, encounter.nodes[1]); advance(game, 1, {}, hz);
    assert.equal(encounter.status, 'ready'); assert.equal(encounter.progress, 12);
    assert.ok(encounter.spawned <= encounter.spawnTotal);
  }
});

test('timeout cannot be retried or rewarded and releases the main quest', () => {
  const game = arena(), encounter = begin(game, 'rings');
  advance(game, 45.1);
  assert.equal(encounter.status, 'failed'); assert.equal(encounter.remaining, 0);
  assert.equal(encounter.spawned, encounter.spawnTotal);
  const credits = game.player.credits, score = game.score;
  at(game, encounter); assert.equal(game.interact(), false);
  assert.equal(game.player.credits, credits); assert.equal(game.score, score);
  assert.equal(game.drainEvents().filter(event => event.type === 'encounter-failed').length, 1);
  at(game, game.relays[0]); assert.equal(game.interact(), true);
  assert.equal(game.relays[0].status, 'charging');
});

test('hunt waits at the enemy cap without losing spawn quota and counts only its living marked guards', () => {
  const game = arena();
  for (let i = 0; i < 55; i++) game.spawnEnemy('crawler', { x: 200, y: 200 + i });
  const encounter = begin(game, 'hunt'); advance(game, 2);
  assert.equal(encounter.spawned, 0); assert.equal(encounter.progress, 0);
  game.enemies[0].hp = 0; game.update(1 / 60);
  assert.equal(encounter.spawned, 1);
  const target = game.enemies.find(enemy => enemy.encounterId === encounter.id);
  assert.equal(game.encounterTarget(encounter), target);
  game._damageEnemy(game.enemies.find(enemy => !enemy.encounterId && enemy.hp > 0), 9999);
  assert.equal(encounter.progress, 0);
  game._damageEnemy(target, 9999); game._damageEnemy(target, 9999);
  assert.equal(encounter.progress, 1);
  // Clear cap blockers only; the remaining real guards still have to spawn and die.
  game.enemies = game.enemies.filter(enemy => enemy.encounterId);
  advance(game, 4);
  assert.equal(encounter.spawned, 3);
  for (const enemy of game.enemies.filter(enemy => enemy.encounterId && enemy.hp > 0)) game._damageEnemy(enemy, 9999);
  assert.equal(encounter.progress, 3); assert.equal(encounter.status, 'ready');
  advance(game, 4); assert.equal(encounter.spawned, 3);
});

test('reward is paid exactly once, choices freeze combat, and selecting a module preserves pending level-ups', () => {
  const game = arena(), encounter = finishRace(game);
  game.player.hp = 70; game.player.credits = 0; game.player.xpNeeded = 32; game.player.xp = 32;
  const score = game.score;
  assert.equal(game.interact(), true); assert.equal(game.phase, 'tactic');
  assert.equal(encounter.status, 'complete'); assert.equal(game.player.credits, 20);
  assert.equal(game.player.hp, 90); assert.equal(game.score, score + 300);
  assert.deepEqual(game.tacticChoices.map(item => item.id), TACTICS.map(item => item.id));
  const elapsed = game.elapsed; game.update(.25, { moveX: 1, shoot: true });
  assert.equal(game.elapsed, elapsed); assert.equal(game.interact(), false);
  assert.equal(game.chooseTactic('invalid'), false);
  assert.equal(game.chooseTactic('decoy-dash'), true);
  assert.equal(game.phase, 'upgrade'); assert.equal(game.player.level, 2); assert.equal(game.player.xp, 0);
  assert.equal(game.tacticId, 'decoy-dash'); assert.ok(game.player.invulnerable >= 1);
  assert.equal(game.chooseTactic('reload-mine'), false);
  game.chooseUpgrade(game.upgradeChoices[0].id); at(game, encounter);
  assert.equal(game.interact(), false); assert.equal(game.player.credits, 20);
});

test('later rewards can preserve the equipped tactic, live effect, and cooldown or replace only its effect', () => {
  const game = equipped('decoy-dash');
  const encounter = begin(game, 'rings');
  for (let frame = 0; frame < 20 * 60 && encounter.status === 'active'; frame++) {
    at(game, encounter.nodes[encounter.activeNode]); game.update(1 / 60);
  }
  assert.equal(encounter.status, 'ready'); at(game, encounter);
  assert.equal(game.dash({ x: 1, y: 0 }), true);
  const decoy = game.tactical.decoy, cooldown = game.tactical.cooldown;
  const credits = game.player.credits, score = game.score;
  assert.equal(game.interact(), true); assert.equal(game.phase, 'tactic');
  assert.ok(game.tacticChoices.some(tactic => tactic.id === 'decoy-dash'));
  assert.equal(game.chooseTactic('decoy-dash'), true);
  assert.equal(game.tactical.decoy, decoy); assert.equal(game.tactical.cooldown, cooldown);
  assert.match(game.drainEvents().find(event => event.type === 'tactic-equipped').message, /保留/);
  assert.equal(game.interact(), false); assert.equal(game.player.credits, credits + 20); assert.equal(game.score, score + 300);
  // Isolate the alternate public choice from this second reward below.
  game.phase = 'tactic'; game.tacticChoices = [...TACTICS];
  assert.equal(game.chooseTactic('reload-mine'), true);
  assert.equal(game.tactical.decoy, null); assert.equal(game.tactical.cooldown, cooldown);
  assert.equal(game.chooseTactic('gravity-pulse'), false);
});

test('encounter and tactical clocks freeze outside playing; reset clears run-only state', () => {
  const game = arena(), encounter = begin(game, 'race');
  game.tacticId = 'decoy-dash'; game.dash({ x: 1, y: 0 });
  for (const phase of ['ready', 'upgrade', 'relic', 'tactic', 'trial-reward', 'lost', 'won']) {
    game.phase = phase;
    const snapshot = JSON.stringify({ encounter, tactical: game.tactical, elapsed: game.elapsed });
    game.update(.25, { moveX: 1, shoot: true });
    assert.equal(game.interact(), false); assert.equal(game.dash({ x: 1, y: 0 }), false); assert.equal(game.useSkill(), false);
    assert.equal(JSON.stringify({ encounter, tactical: game.tactical, elapsed: game.elapsed }), snapshot);
  }
  game.reset('foundry');
  assert.equal(game.tacticId, ''); assert.deepEqual(game.tacticChoices, []);
  assert.deepEqual(game.tactical, { decoy: null, mine: null, cooldown: 0 });
  assert.ok(game.encounters.every(item => item.status === 'idle' && item.progress === 0));
});

test('dash decoy diverts ordinary pursuit but never rewrites a locked charge, ranged attack, or boss', () => {
  const game = equipped('decoy-dash');
  game.dash({ x: 1, y: 0 }); advance(game, .2);
  const crawler = game.spawnEnemy('crawler', { x: 1080, y: 1000 });
  const charger = game.spawnEnemy('charger', { x: 1080, y: 1120 });
  Object.assign(charger, { windup: .4, chargeX: 0, chargeY: -1, attackTimer: 10 });
  const spitter = game.spawnEnemy('spitter', { x: 1080, y: 880 });
  const boss = game.spawnEnemy('boss', { x: 1080, y: 1350 }); boss.attackTimer = 10;
  game.update(1 / 60);
  assert.ok(crawler.x < 1080, 'Crawler follows the old position while the player is to its right');
  assert.equal(charger.chargeX, 0); assert.equal(charger.chargeY, -1); assert.equal(charger.x, 1080);
  assert.ok(Math.abs(spitter.angle - Math.atan2(game.player.y - spitter.y, game.player.x - spitter.x)) < .1);
  assert.ok(boss.x > 1080, 'Boss continues toward the player');
  const cooldown = game.tactical.cooldown;
  game.reactor.charge = game.reactor.maxCharge; assert.equal(game.activateOverdrive(), true);
  assert.equal(game.tactical.cooldown, cooldown);
  const decoy = game.tactical.decoy; game.dash({ x: 1, y: 0 }); assert.equal(game.tactical.decoy, decoy);
  advance(game, 2); assert.equal(game.tactical.decoy, null); assert.ok(game.tactical.cooldown > 0);
});

test('precision reload plants one mine; switching, full refills, and overdrive cannot reset its six-second budget', () => {
  const game = equipped('reload-mine'); precisionReload(game);
  const mine = game.tactical.mine; assert.ok(mine); assert.equal(mine.remaining, 5); assert.equal(game.tactical.cooldown, 6);
  game.reactor.charge = game.reactor.maxCharge; game.activateOverdrive();
  assert.equal(game.tactical.mine, mine); assert.equal(game.tactical.cooldown, 6);
  game.switchWeapon(1); precisionReload(game);
  assert.equal(game.tactical.mine, mine); assert.ok(game.tactical.cooldown > 4);
  const enemy = game.spawnEnemy('crawler', { x: mine.x + 60, y: mine.y });
  enemy.hp = enemy.maxHp = 200; enemy.speed = 0;
  game.update(1 / 60); assert.equal(game.tactical.mine, null); assert.equal(enemy.hp, 145);
  game.update(1 / 60); assert.equal(enemy.hp, 145);
  assert.equal(game.drainEvents().filter(event => event.type === 'tactic-trigger' && event.stage === 'burst').length, 1);
});

test('mine expiry is finite and cover blocks both trigger and blast', () => {
  const game = equipped('reload-mine'); precisionReload(game);
  const mine = game.tactical.mine;
  const covered = game.spawnEnemy('crawler', { x: mine.x + 75, y: mine.y });
  covered.hp = covered.maxHp = 200; covered.speed = 0;
  game.obstacles = [{ x: mine.x + 36, y: mine.y, radius: 14 }];
  game.update(1 / 60); assert.equal(game.tactical.mine, mine); assert.equal(covered.hp, 200);
  const clear = game.spawnEnemy('crawler', { x: mine.x, y: mine.y + 65 }); clear.speed = 0;
  game.update(1 / 60); assert.equal(game.tactical.mine, null); assert.equal(covered.hp, 200); assert.ok(clear.hp <= 0);
  advance(game, 6); precisionReload(game);
  game.enemies = []; advance(game, 5.01); assert.equal(game.tactical.mine, null);
});

test('gravity pulse pulls once, preserves EMP damage, and excludes fixed enemies and locked charges', () => {
  const game = equipped('gravity-pulse');
  const crawler = game.spawnEnemy('crawler', { x: 1170, y: 1000 }); crawler.hp = 200;
  const close = game.spawnEnemy('crawler', { x: 1080, y: 1040 }); close.hp = 200;
  const immune = [game.spawnEnemy('nest', { x: 1000, y: 1160 }), game.spawnEnemy('reactor', { x: 1000, y: 850 }),
    game.spawnEnemy('boss', { x: 1160, y: 1100 }), game.spawnEnemy('charger', { x: 850, y: 1000 })];
  immune[3].windup = .5; immune[3].chargeX = 1;
  const positions = immune.map(enemy => [enemy.x, enemy.y]);
  assert.equal(game.useSkill(), true);
  assert.equal(crawler.x, 1090); assert.equal(crawler.hp, 135);
  assert.ok(Math.abs(Math.hypot(close.x - 1000, close.y - 1000) - 60) < 1e-9);
  assert.deepEqual(immune.map(enemy => [enemy.x, enemy.y]), positions);
  assert.equal(game.useSkill(), false); assert.equal(crawler.x, 1090);
  const effect = game.drainEvents().find(event => event.type === 'tactic-trigger');
  assert.equal(effect.tacticId, 'gravity-pulse'); assert.equal(effect.targets.length, 2);
});

test('gravity movement is clipped before first rock contact at all refresh rates, including a small rock it could otherwise cross', () => {
  for (const hz of [30, 60, 144]) {
    const game = equipped('gravity-pulse');
    const enemy = game.spawnEnemy('crawler', { x: 1180, y: 1000 }); enemy.hp = 200;
    game.obstacles = [{ x: 1140, y: 1000, radius: 10 }, { x: 1090, y: 1000, radius: 12 }];
    assert.equal(game.useSkill(), true);
    assert.ok(enemy.x >= 1165 && enemy.x < 1165.001, 'Stop outside radius 10 + enemy radius 15');
    game.update(1 / hz); assert.ok(enemy.x >= 1165);
    assert.equal(enemy.hp, 135);
  }
});

test('a lethal mine stops the simulation immediately and death clears both live tactical effects', () => {
  const game = equipped('reload-mine'); precisionReload(game);
  const boss = game.spawnEnemy('boss', { x: 1050, y: 1000 }); boss.hp = 1;
  const other = game.spawnEnemy('crawler', { x: 1000, y: 1070 }); other.hp = 200;
  game.update(1 / 30);
  assert.equal(game.phase, 'won'); assert.equal(other.hp, 200);
  assert.deepEqual(game.tactical, { decoy: null, mine: null, cooldown: 0 });
  const lost = equipped('decoy-dash'); lost.dash({ x: 1, y: 0 });
  lost.player.invulnerable = 0; lost._damagePlayer(9999);
  assert.equal(lost.phase, 'lost'); assert.deepEqual(lost.tactical, { decoy: null, mine: null, cooldown: 0 });
});

test('gravity releases outward rock contact while inward, penetrating, and later rock contacts still block', () => {
  for (const [playerX, playerY, expectedX, expectedY] of [[1000, 1000, 1060, 1000], [1200, 1000, 1100, 1000], [1100, 900, 1100, 960]]) {
    const game = equipped('gravity-pulse');
    game.obstacles = [{ x: 1150, y: 1000, radius: 35 }];
    at(game, { x: playerX, y: playerY });
    const enemy = game.spawnEnemy('crawler', { x: 1100, y: 1000 }); enemy.hp = 200;
    game.useSkill();
    assert.equal(enemy.x, expectedX); assert.equal(enemy.y, expectedY);
    assert.equal(enemy.hp, 135, 'EMP damage is unchanged even when the pull is blocked');
  }
  const game = equipped('gravity-pulse');
  game.obstacles = [{ x: 1150, y: 1000, radius: 35 }, { x: 1050, y: 1000, radius: 10 }];
  const enemy = game.spawnEnemy('crawler', { x: 1100, y: 1000 }); enemy.hp = 200;
  game.useSkill();
  assert.ok(enemy.x >= 1075 && enemy.x < 1075.001, 'Releasing the first rock never bypasses the next rock');
  game.player.skillCooldown = 0; enemy.x = 1101;
  game.useSkill(); assert.equal(enemy.x, 1101, 'A genuinely embedded start is not treated as surface contact');
});

test('race collection sweeps only the current node along actual movement consistently across refresh rates', () => {
  for (const hz of [30, 60, 144]) for (const offset of [51.95, 52.01]) {
    const game = arena(), encounter = begin(game, 'race'), node = encounter.nodes[0];
    at(game, { x: node.x - 6, y: node.y + offset });
    assert.equal(game.dash({ x: 1, y: 0 }), true);
    advance(game, 1 / 30, {}, hz);
    assert.equal(encounter.progress, offset < 52 ? 1 : 0, 'A geometric hit must not depend on whether a sampled endpoint landed inside');
  }
  const game = arena(), encounter = begin(game, 'race'), node = encounter.nodes[0];
  at(game, node); game.update(0); assert.equal(encounter.progress, 0);
  at(game, encounter.nodes[2]); game.dash({ x: 1, y: 0 }); advance(game, 1 / 30);
  assert.equal(encounter.progress, 0, 'Future nodes never count before the current one');
  game.player.dashTimer = 0; game.player.dashCooldown = 0;
  at(game, { x: node.x - 70, y: node.y });
  game.obstacles = [{ x: node.x - 24, y: node.y, radius: 30 }];
  game.dash({ x: 1, y: 0 }); advance(game, .2);
  assert.equal(encounter.progress, 0, 'A blocked requested dash must not collect a node behind the rock');
});

test('a final race node counts only if the movement reaches it before the challenge deadline', () => {
  for (const hz of [30, 60, 144]) for (const remaining of [.004, .009]) {
    const game = arena(), encounter = begin(game, 'race');
    walk(game, encounter.nodes[0]); walk(game, encounter.nodes[1]);
    assert.equal(encounter.progress, 2);
    encounter.remaining = remaining; encounter.elapsed = encounter.duration - remaining;
    const node = encounter.nodes[2]; at(game, { x: node.x - 57, y: node.y });
    game.dash({ x: 1, y: 0 }); advance(game, 1 / 30, {}, hz);
    assert.equal(encounter.status, remaining < 5 / 810 ? 'failed' : 'ready');
    assert.equal(encounter.progress, remaining < 5 / 810 ? 2 : 3);
  }
});

test('a mine can trigger during its last positive lifetime but never after expiry or beyond its five-second window', () => {
  for (const hz of [30, 60, 144]) {
    const game = equipped('reload-mine'); precisionReload(game);
    game.tactical.mine.remaining = .01;
    const enemy = game.spawnEnemy('crawler', { x: 1060, y: 1000 }); enemy.hp = 200; enemy.speed = 0;
    advance(game, 1 / 30, {}, hz);
    assert.equal(enemy.hp, 145); assert.equal(game.tactical.mine, null);
    assert.equal(game.drainEvents().filter(event => event.type === 'tactic-trigger' && event.stage === 'burst').length, 1);
    const expired = equipped('reload-mine'); precisionReload(expired);
    expired.tactical.mine.remaining = 0;
    const late = expired.spawnEnemy('crawler', { x: 1060, y: 1000 }); late.hp = 200; late.speed = 0;
    advance(expired, 1 / 30, {}, hz); assert.equal(late.hp, 200); assert.equal(expired.tactical.mine, null);
    const empty = equipped('reload-mine'); precisionReload(empty);
    advance(empty, 5, {}, hz); assert.equal(empty.tactical.mine, null);
  }
});

test('all maps permit a complete opening race using only normal public player actions', () => {
  const results = [];
  for (const map of MAPS) for (const seed of [7, 73, 731]) {
    let randomState = seed;
    const game = new Game({ mapId: map.id, random: () => {
      randomState = randomState + 0x6D2B79F5 | 0;
      let value = Math.imul(randomState ^ randomState >>> 15, 1 | randomState);
      value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    } });
    const encounter = game.encounters[0];
    const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    game.start();
    let damage = 0;
    for (let frame = 0; frame < 35 * 60 && !['lost', 'won'].includes(game.phase) && !game.tacticId; frame++) {
      if (game.phase === 'upgrade') game.chooseUpgrade(game.upgradeChoices[0].id);
      if (game.phase === 'tactic') { game.chooseTactic('decoy-dash'); break; }
      const player = game.player, target = game.encounterTarget(encounter);
      if (['idle', 'ready'].includes(encounter.status) && gap(player, encounter) <= 80 && game.interactionState().target === encounter) {
        game.interact();
        if (game.phase !== 'playing') continue;
      }
      const targetAngle = Math.atan2(target.y - player.y, target.x - player.x);
      let movement = { x: 0, y: 0 }, best = -Infinity;
      if (gap(player, target) > 12) for (let option = 0; option < 24; option++) {
        const angle = targetAngle + (option % 2 ? -1 : 1) * Math.ceil(option / 2) * Math.PI / 12;
        const x = Math.cos(angle), y = Math.sin(angle);
        let score = Math.cos(angle - targetAngle);
        for (const rock of game.obstacles) {
          const projection = Math.max(0, Math.min(75, (rock.x - player.x) * x + (rock.y - player.y) * y));
          if (Math.hypot(player.x + x * projection - rock.x, player.y + y * projection - rock.y) < rock.radius + player.radius + 9) score -= 6;
        }
        if (score > best) { best = score; movement = { x, y }; }
      }
      const enemy = game.enemies.filter(item => item.hp > 0).sort((a, b) => gap(a, player) - gap(b, player))[0];
      if (enemy && gap(enemy, player) < 70) game.useSkill();
      const aim = enemy || target;
      game.update(1 / 60, { moveX: movement.x, moveY: movement.y, aimX: aim.x, aimY: aim.y, shoot: !!enemy && gap(enemy, player) < 650 });
      for (const event of game.drainEvents()) if (event.type === 'damage') damage += event.amount;
    }
    results.push({ map: map.id, seed, status: encounter.status, seconds: +game.elapsed.toFixed(2), hp: +game.player.hp.toFixed(1), damage, spawned: encounter.spawned });
    assert.equal(encounter.status, 'complete', map.id + '/' + seed + ' must reach and claim the opening encounter');
    assert.equal(game.tacticId, 'decoy-dash'); assert.ok(game.player.hp > 0);
    assert.ok(encounter.spawned >= 3 && encounter.spawned <= encounter.spawnTotal, 'The faster finite guard cadence adds pressure without spawning after completion');
  }
  console.log('ENCOUNTER_PUBLIC_ACTION_RESULTS ' + JSON.stringify(results));
});
