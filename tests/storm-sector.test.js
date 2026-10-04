'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAPS } = require('../action-engine.js');

function sector() {
  const game = new Game({ mapId: 'storm', random: () => .5 }); game.start();
  // Isolate timing and damage boundaries; public-input balance runs use original stats.
  game.spawnTimer = Infinity; game.relaySpawnTimer = Infinity; game.obstacles = [];
  game.player.xpNeeded = 1e9;
  return game;
}
function at(game, point) { game.player.x = point.x; game.player.y = point.y; }
function begin(game, relay = game.relays[0]) {
  at(game, relay); assert.equal(game.interact(), true);
  game.relaySpawnTimer = Infinity; game.breathingTimer = 0; game.drainEvents();
  return relay;
}
function lock(game) { game.sectorThreat.timer = 0; game._updateSectorThreat(.01); return game.hazards.find(hazard => hazard.conductionRelayId && !hazard.resolved); }
function advance(game, seconds, input = {}, hz = 60) {
  while (seconds > 1e-9) { const dt = Math.min(seconds, 1 / hz); game.update(dt, input); seconds -= dt; }
}
function bossScene(distance = 100) {
  const game = sector(); at(game, { x: 1400, y: 1100 });
  const boss = game.spawnEnemy('boss', { x: 1400 + distance, y: 1100 });
  boss.attackTimer = 0; game._updateBoss(boss, .01, -1, 0, distance);
  const hazard = game.hazards[0];
  at(game, { x: 1400, y: 1400 }); game.drainEvents();
  return { game, boss, hazard };
}

test('storm has its own complete layout and a discrete charge objective', () => {
  const game = sector();
  assert.equal(MAPS.find(map => map.id === 'storm').mode, 'conduction');
  assert.equal(game.relays.length, 3); assert.equal(game.contracts.length, 3); assert.equal(game.encounters.length, 3);
  assert.ok(game.relays.every(relay => relay.charges === 0 && relay.chargeGoal === 3 && relay.progress === 0));
  const relay = begin(game);
  game._updateRelays(100);
  assert.equal(relay.progress, 0, 'Standing in a tower never passively uploads progress');
  assert.match(game.currentObjective, /锁定后撤出爆圈/);
  assert.equal(game.sectorThreat.timer, 2.5);
});

test('a captured lightning lock stays fixed and charges after the player leaves the tower', () => {
  const game = sector(), relay = begin(game), hazard = lock(game);
  assert.equal(hazard.capturedAtLock, true); assert.equal(hazard.duration, 1.35);
  assert.equal(hazard.conductionRelayId, relay.id); assert.equal(hazard.radius, 90);
  at(game, { x: relay.x + 300, y: relay.y });
  game._updateHazards(1.34); assert.equal(relay.charges, 0);
  game._updateHazards(.02);
  assert.equal(relay.charges, 1); assert.equal(relay.progress, 1 / 3); assert.equal(game.player.hp, 120);
  assert.equal(game.drainEvents().filter(event => event.type === 'conduction-charge').length, 1);
  game._updateHazards(5); assert.equal(relay.charges, 1);
});

test('outside locks miss even when their explosion overlaps a tower or the player returns', () => {
  const game = sector(), relay = begin(game);
  at(game, { x: relay.x + relay.radius + 1, y: relay.y });
  const hazard = lock(game); assert.equal(hazard.capturedAtLock, false);
  at(game, relay); game._updateHazards(2);
  assert.equal(relay.charges, 0); assert.equal(relay.status, 'charging');
  assert.equal(game.drainEvents().filter(event => event.type === 'conduction-miss').length, 1);
  lock(game); at(game, { x: relay.x - 250, y: relay.y }); game._updateHazards(2);
  assert.equal(relay.charges, 1, 'A miss can be retried without restarting the tower');
});

test('staying in captured lightning costs health while still counting one charge', () => {
  const game = sector(), relay = begin(game), hazard = lock(game);
  assert.equal(hazard.damage, 22);
  game._updateHazards(2);
  assert.equal(game.player.hp, 98);
  assert.equal(relay.charges, 1);
  assert.equal(game.phase, 'playing', 'One missed dodge is recoverable');
});

test('the tower boundary uses the captured lock center rather than explosion or player radius', () => {
  for (const [offset, expected] of [[147, true], [147.01, false]]) {
    const game = sector(), relay = begin(game);
    at(game, { x: relay.x + offset, y: relay.y });
    assert.equal(lock(game).capturedAtLock, expected);
  }
});

test('ordinary bombs, enemy lightning and expired hazards cannot charge an active tower', () => {
  const game = sector(), relay = begin(game); at(game, { x: relay.x + 300, y: relay.y });
  game._addHazard('blast', relay.x, relay.y, 90, .1, 5, { owner: 'environment' });
  game._addHazard('blast', relay.x, relay.y, 90, .1, 5, { owner: 'enemy', conductionRelayId: relay.id, capturedAtLock: true });
  game._addHazard('blast', relay.x, relay.y, 90, .1, 5, { owner: 'environment', conductionRelayId: relay.id, capturedAtLock: true, resolved: true });
  game._updateHazards(.2); assert.equal(relay.charges, 0);
  assert.equal(game.drainEvents().some(event => event.type === 'conduction-charge'), false);
});

test('lightning does not starve behind unrelated warnings and never overlaps another tower strike', () => {
  const game = sector(), relay = begin(game);
  game._addHazard('blast', 1000, 1000, 80, 10, 10);
  const hazard = lock(game); assert.ok(hazard);
  game.sectorThreat.timer = 0; game._updateSectorThreat(.01);
  assert.equal(game.hazards.filter(item => item.conductionRelayId === relay.id).length, 1);
  assert.equal(game.sectorThreat.count, 1);
  game.hazards = []; game.breathingTimer = 1;
  game.sectorThreat.timer = 0; game._updateSectorThreat(.01);
  assert.equal(game.sectorThreat.count, 1);
});

test('three charges complete each tower once, pay normal rewards and summon the storm boss', () => {
  const game = sector();
  for (const [index, relay] of game.relays.entries()) {
    begin(game, relay);
    for (let charge = 0; charge < 3; charge++) {
      at(game, relay); lock(game); at(game, { x: relay.x + 220, y: relay.y }); game._updateHazards(2);
      assert.equal(relay.charges, charge + 1);
    }
    assert.equal(relay.status, 'active'); assert.equal(relay.progress, 1);
    assert.equal(game.completedRelays, index + 1); assert.equal(game.player.credits, (index + 1) * 30);
    assert.equal(game.bossSpawned, index === 2);
    game._completeRelay(relay); assert.equal(game.completedRelays, index + 1);
  }
  assert.equal(game.player.xp, 180);
  assert.equal(game.enemies.find(enemy => enemy.type === 'boss').variant, 'storm');
  assert.equal(game.sectorThreat.active, false);
});

test('storm timers freeze during every decision and reset removes the active charge session', () => {
  const game = sector(), relay = begin(game), hazard = lock(game);
  const timer = game.sectorThreat.timer, remaining = hazard.remaining;
  for (const phase of ['paused', 'upgrade', 'relic', 'tactic', 'evolution']) {
    game.phase = phase; game.update(.25, { moveX: 1 });
    assert.equal(hazard.remaining, remaining); assert.equal(game.sectorThreat.timer, timer); assert.equal(relay.charges, 0);
  }
  game.reset('frontier'); assert.equal(game.hazards.length, 0); assert.equal(game.sectorThreat.interval, 12);
  game.reset('storm'); assert.ok(game.relays.every(item => item.charges === 0)); assert.equal(game.sectorThreat.interval, 5);
});

test('lethal lightning never pays the final charge or summons a boss after defeat', () => {
  const game = sector(), relay = begin(game); relay.charges = 2; relay.progress = 2 / 3;
  game.completedRelays = 2; game.player.hp = 1; lock(game); game.drainEvents(); game._updateHazards(2);
  assert.equal(game.phase, 'lost'); assert.equal(relay.charges, 2); assert.equal(relay.status, 'charging');
  assert.equal(game.bossSpawned, false); assert.equal(game.player.credits, 0);
  assert.equal(game.drainEvents().some(event => ['conduction-charge', 'relay-complete', 'boss-spawn'].includes(event.type)), false);
});

test('normal movement can bait and evade the first strike at 30, 60 and 120 Hz', () => {
  for (const hz of [30, 60, 120]) {
    const game = sector(), relay = begin(game);
    advance(game, 2.51, {}, hz);
    assert.equal(game.hazards.length, 1); assert.equal(relay.charges, 0);
    advance(game, 1.36, { moveX: 1 }, hz);
    assert.equal(relay.charges, 1); assert.equal(game.player.hp, 120);
    assert.equal(game.phase, 'playing');
  }
});

test('storm backlash deals exactly 240 damage then exposes a 1.8 second weak point', () => {
  const { game, boss, hazard } = bossScene();
  assert.equal(hazard.backlashId, boss.id); assert.equal(boss.attackKind, 'storm-call');
  const hp = boss.hp; boss.recoveryTimer = .95;
  game._updateHazards(2);
  assert.equal(hp - boss.hp, 240); assert.equal(boss.recoveryTimer, 1.8); assert.equal(boss.windup, 0);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'boss-backlash').length, 1);
  assert.equal(events.find(event => event.type === 'hazard-burst').backlashId, boss.id);
  const beforeShot = boss.hp; game._damageEnemy(boss, 100); assert.equal(beforeShot - boss.hp, 115);
});

test('backlash requires the real boss silhouette inside its own special lightning', () => {
  for (const offset of [0, .01]) {
    const { game, boss, hazard } = bossScene(96 + 58 + offset);
    // The boss can step slightly while opening the attack; set the contact boundary precisely.
    boss.x = hazard.x + hazard.radius + boss.radius + offset;
    const hp = boss.hp; game._updateHazards(2);
    assert.equal(hp - boss.hp, offset === 0 ? 240 : 0);
  }
  const { game, boss, hazard } = bossScene(); delete hazard.backlashId;
  const hp = boss.hp; game._updateHazards(2); assert.equal(boss.hp, hp);
  game._addHazard('blast', boss.x, boss.y, 150, .1, 10, { owner: 'environment' });
  game._updateHazards(.2); assert.equal(boss.hp, hp);
  game._addHazard('blast', boss.x, boss.y, 150, .1, 10, { owner: 'environment', sourceId: boss.id, backlashId: boss.id });
  game._updateHazards(.2); assert.equal(boss.hp, hp, 'Environment ownership never qualifies for the boss special attack');
});

test('a killed or phase-changing boss cancels unspent lightning rather than leaving a free backlash', () => {
  const killed = bossScene(); killed.game._damageEnemy(killed.boss, 10000);
  assert.equal(killed.game.phase, 'won'); killed.game.drainEvents(); killed.game._updateHazards(2);
  assert.equal(killed.game.drainEvents().length, 0);
  const changed = bossScene(); changed.boss.hp = changed.boss.maxHp * .49;
  changed.game._updateBoss(changed.boss, .01, 1, 0, 200);
  assert.equal(changed.boss.stage, 2); assert.equal(changed.game.hazards.length, 0);
  changed.game.drainEvents(); changed.game._updateHazards(2); assert.equal(changed.game.drainEvents().length, 0);
});

test('lethal backlash ends the run without a post-victory weak-point announcement', () => {
  const { game, boss } = bossScene(); boss.hp = 200;
  game._updateHazards(2);
  assert.equal(game.phase, 'won'); assert.equal(game.hazards.length, 0);
  assert.equal(game.drainEvents().some(event => event.type === 'boss-backlash'), false);
});

test('new storm content leaves existing seeded trial boss choices in the original pool', () => {
  const variants = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const game = new Game({ mapId: 'storm', mode: 'trial', seed });
    variants.add(game.trial.bossMapId);
    assert.equal(game.relays.length, 0); assert.equal(game.encounters.length, 0);
    assert.notEqual(game.trial.bossMapId, 'storm');
  }
  assert.deepEqual([...variants].sort(), ['foundry', 'frontier', 'frost']);
});
