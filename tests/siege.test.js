'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, SIEGE_MAP, SIEGE_DIFFICULTIES, SALVAGE_LOADOUTS, WEAPONS } = require('../action-engine.js');

// These fixtures isolate real inputs and projectile collisions. Positioning,
// silencing reinforcements or granting invulnerability is not a natural victory.
function run(options = {}, quiet = true) {
  const game = new Game({ mode: 'siege', seed: 811, ...options }); game.start(); game.drainEvents();
  if (quiet) {
    game.siege.quota = 0;
    for (const part of game.siege.parts) part.attackTimer = 1e6;
    boss(game).attackTimer = 1e6;
    game.player.invulnerable = 1e6;
  }
  return game;
}
function boss(game) { return game.enemies.find(enemy => enemy.id === game.siege.bossId); }
function position(game, x, y) { game.player.x = x; game.player.y = y; }
function advance(game, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-10; elapsed += 1 / 60) {
    game.update(Math.min(1 / 60, seconds - elapsed), typeof input === 'function' ? input() : input);
    if (game.phase === 'level-up') game.chooseUpgrade(game.upgradeChoices[0].id);
  }
}
function fireAt(game, target, limit = 10) {
  game.switchWeapon(2); game.player.critChance = 0;
  for (let elapsed = 0; elapsed < limit && target.hp > 0 && game.phase === 'playing'; elapsed += 1 / 60) {
    position(game, target.x - 150, target.y);
    game.update(1 / 60, { shoot: true, aimX: target.x, aimY: target.y });
    game.pickups = [];
  }
  assert.ok(target.hp <= 0, target.name + ' was not destroyed by real shots');
}
function wreck(game, kind = 'cannon') {
  const part = game.siege.parts.find(item => item.siegePart === kind); fireAt(game, part);
  return game.siege.wrecks.find(item => item.kind === kind);
}
function capture(game, item) {
  position(game, item.x, item.y + 60); assert.equal(game.useSkill(), true);
  assert.equal(item.status, 'captured'); assert.equal(item.ammo, 3);
}
function aim(game, point) { game.update(1 / 60, { aimX: point.x, aimY: point.y }); }
function shell(game, x, y, overrides = {}) {
  const bullet = { id: game._id(), type: 'bullet', kind: 'siege', siegeHeavy: true, owner: 'enemy', x, y,
    vx: 240, vy: 0, radius: 10, lifetime: 5.5, damage: 26, pierce: 0, color: '#ffc285', age: 0, ...overrides };
  game.bullets.push(bullet); return bullet;
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, actual + ' != ' + expected);

test('an independent ready hunt has three different live moving weapon mounts, no relay or extraction obligations', () => {
  const game = new Game({ mode: 'siege', seed: 811 });
  assert.equal(game.phase, 'ready'); assert.equal(game.mode, 'siege'); assert.equal(game.map, SIEGE_MAP);
  assert.equal(game.salvage, null); assert.equal(game.voyage, null); assert.equal(game.campaign, null); assert.equal(game.trial, null);
  assert.equal(game.relays.length, 0); assert.equal(game.contracts.length, 0); assert.equal(game.encounters.length, 0);
  assert.deepEqual(game.siege.parts.map(part => part.siegePart), ['cannon', 'lance', 'mortar']);
  assert.equal(boss(game).shielded, true); assert.equal(game.siege.wrecks.length, 0);
  assert.equal(game.start(), true); assert.equal(game.start(), false);
  assert.equal(game.drainEvents().filter(event => event.type === 'siege-start').length, 1);
});

for (const loadout of SALVAGE_LOADOUTS) test(loadout.id + ' hunt starts with its real weapon magazine and reusable tactic', () => {
  const game = run({ loadoutId: loadout.id });
  assert.equal(game.siege.loadoutId, loadout.id); assert.equal(game.player.weapon, loadout.weapon); assert.equal(game.tacticId, loadout.tacticId);
  assert.equal(game.player.ammo, WEAPONS[loadout.weapon].magSize);
  const before = game.player.ammo; game.update(1 / 60, { shoot: true, aimX: 1500, aimY: 1320 });
  assert.equal(game.player.ammo, before - 1);
  assert.equal(game.switchWeapon(loadout.weapon === 0 ? 1 : 0), true); assert.equal(game.tacticId, loadout.tacticId);
});

test('unknown entry settings keep neutral defaults, while overload changes actual health and damage', () => {
  const plain = run({ difficulty: 'invalid', loadoutId: 'invalid', seed: NaN }), harder = run({ difficulty: 'overload' });
  assert.equal(plain.siege.seed, 1); assert.equal(plain.siege.difficulty, 'normal'); assert.equal(plain.siege.loadoutId, 'free');
  assert.equal(SIEGE_DIFFICULTIES.length, 2); near(boss(harder).hp / boss(plain).hp, 1.2);
  near(boss(harder).damage / boss(plain).damage, 1.12);
  near(harder.siege.parts[0].hp / plain.siege.parts[0].hp, 1.2);
});

test('same seed keeps route, cover and combat RNG independent of starting weapon', () => {
  for (const seed of [0, 1, 811, 4294967295]) {
    const games = SALVAGE_LOADOUTS.map(loadout => run({ seed, loadoutId: loadout.id }));
    for (const game of games.slice(1)) {
      assert.deepEqual(game.obstacles, games[0].obstacles); assert.deepEqual(game.siege.route, games[0].siege.route);
      assert.deepEqual(game.siege.parts, games[0].siege.parts);
    }
    for (let index = 0; index < 40; index++) {
      const random = games[0].random(); for (const game of games.slice(1)) assert.equal(game.random(), random);
    }
  }
});

test('the entire moving chassis, three mounts and dropped wrecks stay clear of rocks across seeded route positions', () => {
  for (let seed = 0; seed < 64; seed++) {
    const game = run({ seed }), body = boss(game);
    for (let sample = 0; sample < 60; sample++) {
      advance(game, 1);
      for (const entity of [body, ...game.siege.parts]) for (const rock of game.obstacles)
        assert.ok(Math.hypot(entity.x - rock.x, entity.y - rock.y) > entity.radius + rock.radius + 1,
          'seed ' + seed + ', sample ' + sample + ', entity ' + entity.id);
    }
    const part = game.siege.parts[seed % 3];
    game._damageEnemy(part, part.hp); // Geometry fixture drops a wreck at a real patrol position.
    const dropped = game.siege.wrecks[0];
    for (const rock of game.obstacles) assert.ok(Math.hypot(dropped.x - rock.x, dropped.y - rock.y) > dropped.radius + rock.radius);
    position(game, dropped.x, dropped.y + 50); game._move(game.player, 0, 0);
    assert.ok(Math.hypot(game.player.x - dropped.x, game.player.y - dropped.y) <= 94);
    assert.equal(game.useSkill(), true); assert.equal(dropped.status, 'captured');
    aim(game, { x: dropped.x, y: dropped.y + 400 }); assert.equal(game.interact(), true);
  }
});

for (const kind of ['cannon', 'lance', 'mortar']) test('ordinary projectiles dismantle ' + kind + ', create exactly one fixed wreck and silence that mount', () => {
  const game = run(), part = game.siege.parts.find(item => item.siegePart === kind), body = boss(game), before = { x: part.x, y: part.y };
  const dropped = wreck(game, kind), fixed = { x: dropped.x, y: dropped.y };
  assert.ok(Math.hypot(fixed.x - before.x, fixed.y - before.y) > 1, 'The mount really moved before its destruction');
  const count = game.siege.wrecks.length;
  assert.equal(game.siege.wrecks.filter(item => item.kind === kind).length, 1); assert.equal(part.hp <= 0, true);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'siege-part-break' && event.partId === part.id).length, 1);
  game._damageEnemy(part, 400); advance(game, 5);
  assert.deepEqual({ x: dropped.x, y: dropped.y }, fixed); assert.equal(game.siege.wrecks.length, count);
  assert.ok(!game.hazards.some(hazard => hazard.sourceId === part.id));
  assert.ok(Math.hypot(body.x - fixed.x, body.y - fixed.y) > 1);
});

test('EMP captures a destroyed gun exactly once, consumes the normal cooldown and cannot refill it', () => {
  const game = run(), dropped = wreck(game); capture(game, dropped);
  assert.equal(game.player.skillCooldown, game.player.skillCooldownMax); assert.equal(game.siege.captures, 1);
  assert.equal(game.useSkill(), false); assert.equal(game.siege.captures, 1);
  aim(game, { x: dropped.x, y: dropped.y + 500 }); assert.equal(game.interact(), true); assert.equal(dropped.ammo, 2);
  advance(game, 13); assert.equal(game.useSkill(), true); assert.equal(dropped.ammo, 2); assert.equal(game.siege.captures, 1);
  assert.equal(game.drainEvents().filter(event => event.type === 'siege-capture').length, 1);
});

test('EMP range and solid rock stop remote wreck takeover', () => {
  for (const blocked of [false, true]) {
    const game = run(), dropped = wreck(game);
    position(game, dropped.x - (blocked ? 150 : 220), dropped.y);
    if (blocked) game.obstacles = [{ id: game._id(), type: 'rock', x: dropped.x - 75, y: dropped.y, radius: 25 }];
    assert.equal(game.useSkill(), true); assert.equal(dropped.status, 'broken'); assert.equal(dropped.ammo, 0);
  }
});

test('E aims from the captured gun to the actual pointer, uses three shots and obeys a real cooldown', () => {
  const game = run(), dropped = wreck(game); capture(game, dropped);
  const target = { x: dropped.x + 300, y: dropped.y + 400 }; aim(game, target);
  assert.equal(game.interact(), true); const bullet = game.bullets.find(item => item.siegeHeavy && item.owner === 'player');
  near(bullet.vx / bullet.vy, .75); assert.equal(dropped.ammo, 2); assert.equal(game.interact(), false);
  advance(game, 1.21); assert.equal(game.interact(), true); advance(game, 1.21); assert.equal(game.interact(), true);
  assert.equal(dropped.status, 'spent'); assert.equal(dropped.ammo, 0); assert.equal(game.interact(), false);
  advance(game, 13); assert.equal(game.useSkill(), true); assert.equal(dropped.ammo, 0); assert.equal(game.siege.shotsFired, 3);
});

test('E outside 94 units or before EMP takeover cannot fire or consume ammo', () => {
  const game = run(), dropped = wreck(game);
  position(game, dropped.x, dropped.y + 50); assert.equal(game.interact(), false);
  capture(game, dropped); position(game, dropped.x, dropped.y + 94.01); assert.equal(game.interact(), false); assert.equal(dropped.ammo, 3);
});

for (const kind of ['cannon', 'lance', 'mortar']) test(kind + ' captured fire travels through real collisions and damages the boss', () => {
  const game = run(), dropped = wreck(game, kind); capture(game, dropped);
  const body = boss(game), before = body.hp; aim(game, body);
  assert.equal(game.interact(), true); advance(game, 1.4);
  assert.ok(body.hp < before, kind + ' heavy projectile did not hit the boss');
  assert.equal(game.siege.armorHits, 1); assert.equal(dropped.ammo, 2);
});

test('a rock consumes captured cannon fire before it reaches an enemy', () => {
  const game = run(), dropped = wreck(game); capture(game, dropped);
  game.obstacles = [{ id: game._id(), type: 'rock', x: dropped.x - 120, y: dropped.y, radius: 30 }];
  const enemy = game.spawnEnemy('tank', { x: dropped.x - 250, y: dropped.y }), before = enemy.hp;
  aim(game, enemy); assert.equal(game.interact(), true); advance(game, .5);
  assert.equal(enemy.hp, before); assert.equal(game.siege.armorHits, 0); assert.equal(dropped.ammo, 2);
  assert.ok(!game.bullets.some(bullet => bullet.siegeHeavy));
});

test('a genuine main-cannon windup releases a slow heavy shell that EMP redirects to the pointer once', () => {
  const game = run(), part = game.siege.parts[0]; part.attackTimer = 0;
  position(game, part.x - 400, part.y); game.update(1 / 60);
  assert.equal(part.windup, 1.2); const warning = game.hazards.find(hazard => hazard.sourceId === part.id);
  assert.equal(warning.visualOnly, true); assert.equal(warning.duration, 1.2);
  advance(game, 1.21); const bullet = game.bullets.find(item => item.owner === 'enemy' && item.siegeHeavy); assert.ok(bullet);
  position(game, bullet.x, bullet.y + 70); const target = { x: bullet.x, y: bullet.y + 400 }; aim(game, target);
  const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
  assert.equal(game.useSkill(), true); assert.equal(bullet.owner, 'player'); near(bullet.vx, Math.cos(angle) * 700); near(bullet.vy, Math.sin(angle) * 700);
  assert.equal(game.siege.reflections, 1); assert.deepEqual(bullet.hitIds, []); assert.equal(game.player.skillCooldown, 13);
  game._redirectSiegeShells(game.player, 210); assert.equal(game.siege.reflections, 1);
});

test('out-of-range or rock-covered main shells are not redirected, and ordinary bullets still clear normally', () => {
  const game = run(); position(game, 500, 1100); aim(game, { x: 900, y: 1100 });
  const far = shell(game, 730, 1100), blocked = shell(game, 650, 1100), plain = shell(game, 520, 1100, { siegeHeavy: false });
  game.obstacles = [{ id: game._id(), type: 'rock', x: 575, y: 1100, radius: 20 }];
  assert.equal(game.useSkill(), true); assert.equal(far.owner, 'enemy'); assert.equal(blocked.owner, 'enemy'); assert.equal(plain.owner, 'enemy');
  assert.equal(game.siege.reflections, 0); assert.ok(game.bullets.includes(far)); assert.ok(!game.bullets.includes(plain));
});

test('reflected heavy fire truly strikes the boss and also respects rocks', () => {
  for (const blocked of [false, true]) {
    const game = run(), body = boss(game); position(game, body.x - 300, body.y);
    const bullet = shell(game, body.x - 200, body.y); aim(game, body);
    if (blocked) game.obstacles = [{ id: game._id(), type: 'rock', x: body.x - 140, y: body.y, radius: 20 }];
    assert.equal(game.useSkill(), true); assert.equal(bullet.owner, 'player'); const hp = body.hp;
    advance(game, .6); assert.equal(game.siege.armorHits, blocked ? 0 : 1);
    assert.equal(body.hp < hp, !blocked);
  }
});

test('only real heavy hits break armor; misses do not advance it, two hits open a three-second core window', () => {
  const game = run(), dropped = wreck(game); capture(game, dropped);
  const body = boss(game); aim(game, { x: dropped.x - 500, y: dropped.y }); assert.equal(game.interact(), true); advance(game, 1.3);
  assert.equal(game.siege.armorHits, 0); assert.equal(body.shielded, true);
  for (let index = 0; index < 2; index++) { aim(game, body); assert.equal(game.interact(), true); advance(game, 1.21); }
  assert.equal(game.siege.armorHits, 2); assert.equal(body.shielded, false); assert.equal(body.stage, 2); assert.equal(game.siege.status, 'core');
  assert.ok(body.recoveryTimer > 1); assert.equal(game.drainEvents().filter(event => event.type === 'siege-armor-break').length, 1);
});

test('ordinary weapons can win with no captures or heavy ammo, naturally crossing both phase thresholds', () => {
  const game = run(), body = boss(game); game.switchWeapon(0); game.player.critChance = 0; game.obstacles = [];
  for (let elapsed = 0; elapsed < 100 && game.phase === 'playing'; elapsed += 1 / 60) {
    position(game, body.x, body.y + 210); game.update(1 / 60, { shoot: true, aimX: body.x, aimY: body.y }); game.pickups = [];
  }
  assert.equal(game.phase, 'won'); assert.ok(body.hp <= 0); assert.equal(game.siege.status, 'complete');
  assert.equal(game.siege.armorHits, 0); assert.equal(game.siege.captures, 0); assert.equal(game.siege.shotsFired, 0);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'siege-armor-break').length, 1);
  assert.equal(events.filter(event => event.type === 'siege-overload').length, 1); assert.equal(events.filter(event => event.type === 'win').length, 1);
  assert.equal(game.enemies.length, 0); assert.equal(game.bullets.length, 0); assert.equal(game.hazards.length, 0);
  assert.equal(game.interact(), false); assert.equal(game.useSkill(), false);
});

test('lance windup locks its old direction, and destroying that gun cancels only its own pending strike', () => {
  const game = run(), lance = game.siege.parts[1], mortar = game.siege.parts[2];
  lance.attackTimer = 0; mortar.attackTimer = 0; position(game, lance.x + 400, lance.y); game.update(1 / 60);
  const lane = game.hazards.find(hazard => hazard.sourceId === lance.id), blast = game.hazards.find(hazard => hazard.sourceId === mortar.id);
  assert.equal(lane.type, 'lane'); assert.equal(lane.duration, 1.4); assert.equal(blast.type, 'blast');
  const angle = lane.angle; position(game, lance.x, lance.y + 400); advance(game, .3); assert.equal(lane.angle, angle);
  game._damageEnemy(lance, lance.hp); assert.ok(!game.hazards.includes(lane)); assert.ok(game.hazards.includes(blast));
});

test('a timely EMP actually interrupts an in-range lance before its locked lane resolves', () => {
  const game = run(), lance = game.siege.parts[1]; lance.attackTimer = 0;
  position(game, lance.x + 100, lance.y); game.update(1 / 60); assert.ok(game.hazards.some(hazard => hazard.sourceId === lance.id));
  assert.equal(game.useSkill(), true); assert.equal(lance.windup, 0); assert.ok(lance.stunTimer > 0);
  assert.ok(!game.hazards.some(hazard => hazard.sourceId === lance.id));
});

test('unavoided lane damages the real player while a transverse move avoids the same locked strike', () => {
  for (const dodge of [false, true]) {
    const game = run(), lance = game.siege.parts[1]; game.player.invulnerable = 0; lance.attackTimer = 0;
    position(game, lance.x + 260, lance.y); game.update(1 / 60);
    const before = game.player.hp; advance(game, 1.41, { moveY: dodge ? 1 : 0 });
    assert.equal(game.player.hp < before, !dodge);
  }
});

test('core ring has a real gap and waits three seconds before the next fixed old-position blast', () => {
  const game = run(), body = boss(game); game._damageEnemy(body, 3400); // Boundary fixture enters core at 57.5% health.
  assert.equal(body.stage, 2); advance(game, 3.1); assert.equal(body.attackKind, 'siege-ring');
  const gap = body.ringGapAngle; advance(game, 1.3);
  const bullets = game.bullets.filter(bullet => bullet.owner === 'enemy'); assert.ok(bullets.length >= 10 && bullets.length <= 14);
  for (const bullet of bullets) {
    const angle = Math.atan2(bullet.vy, bullet.vx), delta = Math.atan2(Math.sin(angle - gap), Math.cos(angle - gap));
    assert.ok(Math.abs(delta) >= body.ringGapWidth / 2);
  }
  assert.ok(body.recoveryTimer > 2.7); advance(game, 2.7); assert.equal(body.attackKind, '');
  advance(game, .4); assert.equal(body.attackKind, 'siege-collapse');
  const target = game.hazards.find(hazard => hazard.sourceId === body.id && !hazard.visualOnly), x = target.x, y = target.y;
  advance(game, .5, { moveX: 1 }); assert.equal(target.x, x); assert.equal(target.y, y);
});

test('overload below 25% gives the same visible ordered attacks and recovery instead of concurrent spam', () => {
  const game = run(), body = boss(game); game._damageEnemy(body, 6400);
  assert.equal(body.stage, 3); assert.equal(body.shielded, false); assert.ok(body.hp > 0);
  advance(game, 3.1); assert.equal(body.attackKind, 'siege-ring'); assert.ok(body.windup > 1);
  advance(game, 1.3); assert.ok(game.bullets.filter(bullet => bullet.owner === 'enemy').length <= 18); assert.ok(body.recoveryTimer > 2.7);
  assert.ok(!game.hazards.some(hazard => hazard.sourceId === body.id && !hazard.visualOnly));
});

test('target selection follows live parts, then their wrecks, and never retains destroyed or spent targets', () => {
  const game = run(), part = game.siege.parts[0]; assert.equal(game.selectSiegeTarget(part.id), true); assert.equal(game.siegeTarget().id, part.id);
  const dropped = wreck(game); assert.notEqual(game.siegeTarget().id, part.id); assert.equal(game.selectSiegeTarget(part.id), false);
  assert.equal(game.selectSiegeTarget(dropped.id), true); assert.equal(game.siegeTarget().kind, 'capture'); capture(game, dropped);
  assert.equal(game.siegeTarget().kind, 'turret'); aim(game, { x: dropped.x - 500, y: dropped.y });
  for (let index = 0; index < 3; index++) { assert.equal(game.interact(), true); advance(game, 1.21); }
  assert.equal(game.selectSiegeTarget(dropped.id), false); assert.notEqual(game.siegeTarget().id, dropped.id);
  assert.equal(game.selectSiegeTarget(boss(game).id), true); assert.equal(game.siegeTarget().kind, 'core');
});

test('pause freezes every hunt clock and blocks takeover, fire and target changes', () => {
  const game = run(), dropped = wreck(game); capture(game, dropped); aim(game, { x: dropped.x - 500, y: dropped.y }); game.interact();
  game.phase = 'paused'; const before = JSON.stringify({ siege: game.siege, enemies: game.enemies, bullets: game.bullets, elapsed: game.elapsed });
  advance(game, 10); assert.equal(JSON.stringify({ siege: game.siege, enemies: game.enemies, bullets: game.bullets, elapsed: game.elapsed }), before);
  assert.equal(game.useSkill(), false); assert.equal(game.interact(), false); assert.equal(game.selectSiegeTarget(boss(game).id), false);
});

test('a failed hunt clears live hazards and shells, freezes guns and emits failure exactly once', () => {
  const game = run(), dropped = wreck(game); capture(game, dropped); aim(game, { x: dropped.x - 500, y: dropped.y }); game.interact();
  game.player.invulnerable = 0; game._damagePlayer(1000, { name: 'test fixture' });
  assert.equal(game.phase, 'lost'); assert.equal(game.siege.status, 'failed'); assert.equal(game.siegeTarget(), null);
  assert.equal(game.bullets.length, 0); assert.equal(game.hazards.length, 0); const time = dropped.cooldown;
  advance(game, 10); assert.equal(dropped.cooldown, time); assert.equal(game.interact(), false); assert.equal(game.useSkill(), false);
  assert.equal(game._damagePlayer(1000), false); assert.equal(game.drainEvents().filter(event => event.type === 'siege-failed').length, 1);
});

test('finite patrol reinforcements respect both the twelve-ticket budget and six live ordinary enemies', () => {
  const game = run({}, false); game.player.invulnerable = 1e6;
  for (const part of game.siege.parts) part.attackTimer = 1e6;
  advance(game, 140); assert.ok(game.siege.spawned <= 6); assert.ok(game.enemies.filter(enemy => enemy.type !== 'boss' && !enemy.siegePart).length <= 6);
  for (let index = 0; index < 160; index++) {
    game.enemies = game.enemies.filter(enemy => enemy.type === 'boss' || enemy.siegePart); advance(game, 1);
  }
  assert.equal(game.siege.spawned, 12); assert.equal(game.siege.quota, 12);
});

for (const [index, weapon] of WEAPONS.entries()) test(weapon.id + ' real firing can dismantle a moving mount without heavy ammo', () => {
  const game = run(), part = game.siege.parts[0]; game.switchWeapon(index); game.obstacles = []; game.player.critChance = 0;
  for (let elapsed = 0; elapsed < 15 && part.hp > 0; elapsed += 1 / 60) {
    position(game, part.x - 150, part.y); game.update(1 / 60, { shoot: true, aimX: part.x, aimY: part.y }); game.pickups = [];
  }
  assert.ok(part.hp <= 0); assert.equal(game.siege.wrecks.filter(item => item.kind === 'cannon').length, 1);
  assert.equal(game.siege.captures, 0); assert.equal(game.siege.shotsFired, 0);
});

test('captured mortar explosion cannot leak through the rock that stopped its flight', () => {
  const game = run(), dropped = wreck(game, 'mortar'); capture(game, dropped);
  game.obstacles = [{ id: game._id(), type: 'rock', x: dropped.x - 120, y: dropped.y, radius: 30 }];
  const enemy = game.spawnEnemy('tank', { x: dropped.x - 190, y: dropped.y }); enemy.stunTimer = 10;
  const before = enemy.hp; aim(game, enemy); assert.equal(game.interact(), true); advance(game, .5);
  assert.equal(enemy.hp, before); assert.equal(dropped.ammo, 2);
});

test('redirected heavy shells do not also supply duplicate bullet-reversal ammunition', () => {
  const game = run(); position(game, 1000, 1200); aim(game, { x: 1000, y: 800 });
  for (let index = 0; index < 5; index++) shell(game, 960 + index * 20, 1120);
  assert.equal(game.useSkill(), true); assert.equal(game.siege.reflections, 5);
  assert.equal(game.player.reversalAmmo, 0); assert.equal(game.discoveredSecrets.has('bullet-reversal'), false);
  assert.equal(game.bullets.filter(bullet => bullet.siegeHeavy && bullet.owner === 'player').length, 5);
});

test('one redirected piercing shell can touch multiple entities but counts the living boss only once', () => {
  const game = run(), body = boss(game); position(game, body.x - 300, body.y);
  const bullet = shell(game, body.x - 200, body.y); aim(game, body); assert.equal(game.useSkill(), true);
  advance(game, .6); assert.equal(game.siege.armorHits, 1); assert.equal(body.shielded, true);
  assert.ok(bullet.hitIds.includes(body.id)); assert.ok(bullet.hitIds.length >= 2);
  advance(game, 3); assert.equal(game.siege.armorHits, 1); assert.equal(game.siege.reflections, 1);
});

test('a lethal earlier collision prevents a later same-step heavy shot from awarding victory or armor progress', () => {
  const game = run(), body = boss(game); game.player.invulnerable = 0;
  position(game, 1000, 1300); shell(game, game.player.x, game.player.y, { damage: 1000 });
  game.bullets.push({ id: game._id(), type: 'bullet', kind: 'siege', siegeHeavy: true, owner: 'player',
    x: body.x, y: body.y, vx: 100, vy: 0, radius: 10, lifetime: 2, damage: 10000, pierce: 2, hitIds: [], age: 0 });
  const before = body.hp; game.update(1 / 60);
  assert.equal(game.phase, 'lost'); assert.equal(game.siege.status, 'failed'); assert.equal(body.hp, before); assert.equal(game.siege.armorHits, 0);
  assert.equal(game.drainEvents().some(event => ['win', 'siege-complete'].includes(event.type)), false);
});
