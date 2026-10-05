'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, WEAPONS } = require('../action-engine.js');

// Explicit timing/collision fixtures, not ordinary-input playthroughs. Actors
// and fields may be cleared, and the player is positioned at the rule boundary.
function run(options = {}, geometry = false) {
  const game = new Game({ mode: 'salvage', seed: 731, ...options });
  game.start(); game.drainEvents(); game.salvage.pending = [];
  game.enemies = []; game.hazards = []; game.bullets = []; game.pickups = [];
  game.stations = []; game.crates = [];
  if (!geometry) { game.obstacles = []; game.battlefield.props = []; game.battlefield.mines = []; }
  return game;
}
function position(game, point) { game.player.x = point.x; game.player.y = point.y; }
function advance(game, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-10; elapsed += 1 / 60)
    game.update(Math.min(1 / 60, seconds - elapsed), input);
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, actual + ' != ' + expected); }
function cargoOf(game) { assert.ok(game.salvage.hotCargo, 'One optional black box exists'); return game.salvage.hotCargo; }
function pick(game) {
  const cargo = cargoOf(game); position(game, cargo);
  assert.equal(game.interactionState().target, cargo); assert.equal(game.interact(), true);
  assert.equal(cargo.status, 'carried'); return cargo;
}
function call(game, index = 0) {
  const exit = game.salvage.exits[index]; position(game, exit); assert.equal(game.interact(), true);
  game.salvage.pending = []; game.enemies = []; return exit;
}
function collect(game) {
  const vault = game.salvage.sources.find(source => source.kind === 'vault');
  game._damageSalvageSource(vault, vault.hp); position(game, vault); assert.equal(game.interact(), true);
  game.salvage.pending = []; return vault;
}

test('black box layout is seed-reproducible, independent of combat RNG, and separate from all seventeen samples', () => {
  const a = new Game({ mode: 'salvage', seed: 912, random: () => .1 }), b = new Game({ mode: 'salvage', seed: 912, random: () => .9 });
  const cargo = cargoOf(a); assert.deepEqual(cargo, cargoOf(b));
  assert.equal(cargo.type, 'salvage-cargo'); assert.equal(cargo.name, '黑匣子'); assert.equal(cargo.status, 'ground');
  assert.equal(cargo.bonus, 480); assert.equal(cargo.weaponBonus, .15); assert.equal(cargo.pulseInterval, 12); assert.equal(cargo.pulseRemaining, 12);
  assert.equal(a.salvage.sources.length, 5); assert.equal(a.salvage.sources.reduce((sum, source) => sum + source.value, 0), 17);
  assert.equal(a.salvage.cargoBonus, 0);
  for (let index = 0; index < 300; index++) a.random();
  assert.deepEqual(cargo, cargoOf(b));
  assert.deepEqual(cargo, cargoOf(new Game({ mode: 'salvage', seed: 912, difficulty: 'overload' })));
  const positions = new Set([0, 1, 2, 17, 731, 912, 2147483647, 4294967295].map(seed => {
    const item = cargoOf(new Game({ mode: 'salvage', seed })); return item.x + ',' + item.y;
  }));
  assert.ok(positions.size >= 3, 'Different seeds offer different black-box routes');
});

for (const [index, duration] of [[0, 10], [1, 16]]) test('exit ' + index + ' arrives after ' + duration + ' game seconds and still requires three seconds inside its own circle', () => {
  const game = run(), exit = game.salvage.exits[index];
  assert.equal(exit.arrivalDuration, duration); assert.ok(exit.coverLabel);
  game.selectSalvageTarget(exit.id); assert.match(game.salvageTarget().hint, new RegExp(duration + ''));
  position(game, exit); assert.match(game.interactionState().hint, new RegExp(duration + ''));
  call(game, index); assert.equal(game.salvage.evac.duration, duration); assert.equal(game.salvage.evac.boardingDuration, 3);
  position(game, { x: exit.x, y: exit.y + 130 }); advance(game, duration - .01);
  assert.equal(game.salvage.status, 'approaching'); advance(game, .02);
  assert.equal(game.salvage.status, 'boarding'); near(game.salvage.evac.progress, 0);
  position(game, game.salvage.exits[1 - index]); advance(game, .25); near(game.salvage.evac.progress, 0);
  position(game, exit); advance(game, 1); near(game.salvage.evac.progress, 1);
  position(game, { x: exit.x, y: exit.y + 130 }); advance(game, .5); near(game.salvage.evac.progress, 1);
  assert.equal(game.interact(), false); assert.equal(game.salvage.evac.exitId, exit.id);
});

test('east cover blocks real shots, stays intact, and leaves every boarding circle, field and boundary-seed route usable', () => {
  for (const seed of [0, 1, 2, 17, 731, 912, 2147483647, 4294967295]) {
    const game = new Game({ mode: 'salvage', seed }), east = game.salvage.exits[1], west = game.salvage.exits[0];
    const covers = game.obstacles.filter(rock => rock.evacCover);
    assert.equal(covers.length, 3, 'Three real rocks protect the slower exit');
    for (const rock of covers) {
      assert.ok(!rock.fragile, 'Extraction cover is permanent ordinary rock');
      assert.ok(Math.hypot(rock.x - east.x, rock.y - east.y) > rock.radius + east.radius + game.player.radius + 2);
      for (const field of game.battlefield.props) assert.ok(Math.hypot(field.x - rock.x, field.y - rock.y) > field.blastRadius + rock.radius);
      assert.notEqual(game._segmentHit(rock.x - 100, rock.y, 200, 0, rock, 3), null);
    }
    for (const rock of game.obstacles) assert.ok(Math.hypot(rock.x - west.x, rock.y - west.y) >= rock.radius + 240, 'Quick west exit retains open approach');
    const cargo = cargoOf(game);
    for (const rock of game.obstacles) assert.ok(Math.hypot(cargo.x - rock.x, cargo.y - rock.y) > rock.radius + cargo.radius + game.player.radius);
    const step = 40, queue = [[Math.round(game.spawn.x / step), Math.round(game.spawn.y / step)]], reached = new Set([queue[0].join(',')]);
    for (let index = 0; index < queue.length; index++) {
      const [col, row] = queue[index];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = col + dx, r = row + dy, x = c * step, y = r * step, key = c + ',' + r;
        if (reached.has(key) || x < 40 || y < 40 || x > game.world.width - 40 || y > game.world.height - 40 ||
          game.obstacles.some(rock => Math.hypot(x - rock.x, y - rock.y) <= rock.radius + game.player.radius + 2)) continue;
        reached.add(key); queue.push([c, r]);
      }
    }
    for (const target of [...game.salvage.sources, ...game.salvage.exits, cargo])
      assert.ok(queue.some(([c, r]) => Math.hypot(c * step - target.x, r * step - target.y) <= 70), 'Seed ' + seed + ' target ' + target.type + ' has a traversable approach');
  }
  const game = run({}, true), rock = game.obstacles.find(item => item.evacCover);
  position(game, { x: rock.x - 90, y: rock.y }); game.player.angle = 0; game.player.critChance = 0;
  game.update(.15, { shoot: true, aimX: rock.x + 100, aimY: rock.y });
  assert.ok(game.obstacles.includes(rock)); assert.equal(game.bullets.filter(bullet => bullet.owner === 'player').length, 0, 'A real rifle shot is absorbed by the cover');
});

test('ground cargo is not magnetized and pickup grants no immediate score, sample, XP or permanent stat mutation', () => {
  const game = run(), cargo = cargoOf(game); position(game, cargo);
  const score = game.score, xp = game.player.xp, speed = game.player.speed, damage = game.player.damageMultiplier;
  advance(game, .25); assert.equal(cargo.status, 'ground'); assert.equal(game.salvage.carried, 0); assert.equal(game.score, score);
  assert.equal(game.interact(), true); assert.equal(cargo.status, 'carried');
  assert.equal(game.score, score); assert.equal(game.player.xp, xp); assert.equal(game.player.speed, speed); assert.equal(game.player.damageMultiplier, damage);
  assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.cargoBonus, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-cargo-picked').length, 1);
});

test('carrying cargo keeps ordinary movement and dash speed, then drops at the current position with a pickup lock', () => {
  const game = run(), cargo = pick(game), start = game.player.x;
  game.update(.25, { moveX: 1 }); near(game.player.x - start, game.player.speed * .25);
  assert.equal(game.dash({ x: 1, y: 0 }), true); game.update(.1); assert.equal(cargo.status, 'carried');
  const point = { x: game.player.x, y: game.player.y }; assert.equal(game.dropSalvageCargo(), true);
  assert.equal(cargo.status, 'dropped'); near(cargo.x, point.x); near(cargo.y, point.y); near(cargo.pickupLock, .75);
  assert.equal(game.interact(), false); assert.equal(game.dropSalvageCargo(), false);
  advance(game, .76); position(game, cargo); assert.equal(game.interact(), true);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-cargo-dropped').length, 1);
});

test('dropping stops exposure and repicking cannot reset the remaining broadcast countdown', () => {
  const game = run(), cargo = pick(game); advance(game, 8); near(cargo.pulseRemaining, 4);
  assert.equal(game.dropSalvageCargo(), true); const point = { x: cargo.x, y: cargo.y };
  advance(game, 20); near(cargo.pulseRemaining, 4); assert.equal(game.salvage.alarm, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-cargo-pulse').length, 0);
  position(game, point); assert.equal(game.interact(), true); near(cargo.pulseRemaining, 4);
  advance(game, 3.9); assert.equal(game.salvage.alarm, 0); advance(game, .1);
  assert.equal(game.salvage.alarm, 6); near(cargo.pulseRemaining, 12);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-cargo-pulse').length, 1);
});

test('broadcasts raise alarm by six, dispatch two finite pursuers and cap cargo tickets at four even while spawn slots are occupied', () => {
  const game = run(), cargo = pick(game);
  // Real enemies occupy the fourteen legal slots; only the cargo director is
  // stepped to isolate queue bounds without simulating an invulnerable match.
  for (let index = 0; index < 14; index++) game.spawnEnemy('crawler', { x: 80 + index * 80, y: 80 });
  game._updateSalvage(12); assert.equal(game.salvage.alarm, 6);
  assert.deepEqual(game.salvage.pending.filter(ticket => ticket.reason === 'cargo').map(ticket => ticket.type), ['charger', 'spitter']);
  game._updateSalvage(12); game._updateSalvage(12); game._updateSalvage(12);
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'cargo').length, 4);
  assert.equal(game.salvage.alarm, 24); assert.equal(game.drainEvents().filter(event => event.type === 'salvage-cargo-pulse').length, 4);
  assert.equal(game.dropSalvageCargo(), true); const pending = JSON.stringify(game.salvage.pending), enemies = game.enemies.length;
  game._updateSalvage(12); assert.equal(JSON.stringify(game.salvage.pending), pending); assert.equal(game.enemies.length, enemies);
  assert.equal(game.salvage.alarm, 24); assert.equal(cargo.status, 'dropped');
});

for (const phase of ['ready', 'upgrade', 'relic', 'tactic']) test('cargo exposure, pickup lock and all evacuation timers freeze during ' + phase, () => {
  const game = run(); pick(game); call(game); game.phase = phase;
  const before = JSON.stringify(game.salvage); game.update(.25, { moveX: 1, shoot: true });
  assert.equal(JSON.stringify(game.salvage), before); assert.equal(game.dropSalvageCargo(), false); assert.equal(game.interact(), false);
});

for (const [index, weapon] of WEAPONS.entries()) test('carried cargo adds fifteen percent only to newly fired ' + weapon.id + ' rounds and starline power', () => {
  const plain = run(), carried = run(); pick(carried);
  for (const game of [plain, carried]) { game.player.critChance = 0; game.switchWeapon(index); game.update(.2); game._shoot(); }
  assert.equal(plain.bullets.length, carried.bullets.length); assert.ok(plain.bullets.length);
  for (let shot = 0; shot < plain.bullets.length; shot++) {
    near(carried.bullets[shot].damage, plain.bullets[shot].damage * 1.15);
    if (index === 5) near(carried.bullets[shot].starMultiplier, plain.bullets[shot].starMultiplier * 1.15);
  }
  const shot = carried.bullets[0], damage = shot.damage;
  assert.equal(carried.dropSalvageCargo(), true); assert.equal(shot.damage, damage, 'Already fired rounds keep their original damage');
  carried.bullets = []; carried.fireTimer = 0; carried._shoot();
  near(carried.bullets[0].damage, plain.bullets[0].damage);
  assert.equal(carried.player.damageMultiplier, plain.player.damageMultiplier);
});

test('cargo never replaces executable source, exit or supply actions, and remains an explicit map choice', () => {
  const game = run(), cargo = cargoOf(game), drill = game.salvage.sources.find(source => source.kind === 'drill');
  assert.notEqual(game.salvageTarget().id, cargo.id); assert.equal(game.selectSalvageTarget(cargo.id), true); assert.equal(game.salvageTarget().id, cargo.id);
  position(game, drill); cargo.x = drill.x; cargo.y = drill.y;
  assert.equal(game.interactionState().target, drill); assert.equal(game.interact(), true); assert.equal(cargo.status, 'ground');
  const exit = game.salvage.exits[0]; position(game, exit); cargo.x = exit.x; cargo.y = exit.y;
  assert.equal(game.interactionState().target, exit); assert.equal(game.interact(), true); assert.equal(cargo.status, 'ground');
  position(game, { x: 1100, y: 800 }); cargo.x = game.player.x; cargo.y = game.player.y;
  const crate = { id: game._id(), type: 'crate', x: cargo.x + 20, y: cargo.y, radius: 20, opened: false }; game.crates = [crate];
  assert.equal(game.interactionState().target, crate); assert.equal(game.interact(), true); assert.equal(cargo.status, 'ground');
  assert.equal(game.interactionState().target, cargo); assert.equal(game.interact(), true);
  assert.equal(game.selectSalvageTarget(cargo.id), false);
});

test('cargo-only withdrawal is an extracted success with one separately recorded 480 bonus and one win event', () => {
  const game = run(), cargo = pick(game); call(game); const score = game.score;
  advance(game, 12.99); assert.equal(game.salvage.status, 'boarding'); advance(game, .01);
  assert.equal(game.phase, 'won'); assert.equal(game.salvage.status, 'extracted'); assert.equal(cargo.status, 'banked');
  assert.equal(game.salvage.settled, 0); assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.cargoBonus, 480);
  assert.equal(game.salvage.bonus, 480); assert.equal(game.score, score + 480);
  assert.match(game.currentObjective, /黑匣子 \+480/);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-complete').length, 1); assert.equal(events.filter(event => event.type === 'win').length, 1);
  assert.equal(events.filter(event => event.type === 'salvage-withdraw').length, 0);
  const before = JSON.stringify(game.salvage); assert.equal(game.dropSalvageCargo(), false); assert.equal(game._finishSalvage(), false);
  game.update(.25); assert.equal(JSON.stringify(game.salvage), before); assert.equal(game.score, score + 480);
});

test('sample and cargo bonuses combine exactly once, without adding cargo to the seventeen-sample count', () => {
  const game = run(); collect(game); const cargo = pick(game); call(game);
  advance(game, 13); assert.equal(game.salvage.status, 'extracted'); assert.equal(cargo.status, 'banked');
  assert.equal(game.salvage.settled, 3); assert.equal(game.salvage.cargoBonus, 480); assert.equal(game.salvage.bonus, 720);
  assert.equal(game.salvage.sources.reduce((sum, source) => sum + source.value, 0), 17);
});

test('fatal damage on the last boarding step loses cargo and samples before either bonus can settle', () => {
  const game = run(); collect(game); const cargo = pick(game); call(game); advance(game, 12.98);
  game.salvage.evac.progress = 2.99; game.player.hp = 1; game.player.invulnerable = 0;
  game._addHazard('blast', game.player.x, game.player.y, 40, .001, 14); game.update(1 / 60);
  assert.equal(game.phase, 'lost'); assert.equal(game.salvage.status, 'failed'); assert.equal(cargo.status, 'lost');
  assert.equal(game.salvage.lostSamples, 3); assert.equal(game.salvage.settled, 0); assert.equal(game.salvage.cargoBonus, 0); assert.equal(game.salvage.bonus, 0);
  assert.match(game.currentObjective, /黑匣子遗失/);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-failed').length, 1);
  assert.equal(events.filter(event => ['win', 'salvage-complete'].includes(event.type)).length, 0);
  const before = JSON.stringify(game.salvage); assert.equal(game.dropSalvageCargo(), false); game.update(.25); assert.equal(JSON.stringify(game.salvage), before);
});

test('dropping an optional cargo before departure preserves ordinary sample rewards and excludes the cargo bonus', () => {
  const game = run(); collect(game); const cargo = pick(game); assert.equal(game.dropSalvageCargo(), true); call(game);
  advance(game, 13); assert.equal(game.salvage.status, 'extracted'); assert.equal(cargo.status, 'dropped');
  assert.equal(game.salvage.settled, 3); assert.equal(game.salvage.cargoBonus, 0); assert.equal(game.salvage.bonus, 240);
});

test('repeated pickup and drop cannot stack cargo power or erase an upgrade earned while carrying', () => {
  const game = run(), cargo = pick(game);
  // The decision fixture presents the real damage protocol, rather than
  // mutating damageMultiplier to imitate its implementation.
  game.phase = 'upgrade'; game.upgradeChoices = [{ id: 'damage' }];
  assert.equal(game.chooseUpgrade('damage'), true); near(game.player.damageMultiplier, 1.18);
  for (let index = 0; index < 3; index++) {
    assert.equal(game.dropSalvageCargo(), true); near(game.player.damageMultiplier, 1.18);
    advance(game, .76); position(game, cargo); assert.equal(game.interact(), true); near(game.player.damageMultiplier, 1.18);
  }
  game.player.critChance = 0; game._shoot(); near(game.bullets[0].damage, WEAPONS[0].damage * 1.18 * 1.15);
});

test('old modes and reset cannot inherit cargo bonuses, exposure, carry state or extraction cover', () => {
  const game = run(); pick(game);
  for (const mode of ['action', 'trial', 'campaign', 'voyage']) {
    game.reset('frontier', { mode, seed: 731 }); assert.equal(game.salvage, null);
    assert.ok(!game.obstacles.some(rock => rock.evacCover)); assert.equal(game.player.damageMultiplier, 1);
  }
  game.reset('frontier', { mode: 'salvage', seed: 731 });
  assert.equal(cargoOf(game).status, 'ground'); assert.equal(game.salvage.cargoBonus, 0); near(cargoOf(game).pulseRemaining, 12);
});
