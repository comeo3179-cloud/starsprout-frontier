'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, WEAPONS } = require('../action-engine.js');

// Explicit controlled timing/collision fixtures, not natural survival wins.
function arena(sectorId = 'scrapyard') {
  const game = new Game({ mode: 'salvage', sectorId, seed: 731 }); game.start(); game.salvage.pending = [];
  game.enemies = []; game.obstacles = []; game.battlefield.props = []; game.battlefield.mines = []; game.stations = []; game.crates = [];
  const node = game.salvage.nodes[0]; game.salvage.nodes = [node]; Object.assign(node, { x: 1300, y: 1000 });
  Object.assign(game.player, { x: 1200, y: 1000, angle: 0 }); game.drainEvents(); return { game, node };
}
function advance(game, seconds, hz = 60, input = {}) { for (let time = 0; time < seconds - 1e-10;) { const dt = Math.min(1 / hz, seconds - time); game.update(dt, input); time += dt; } }
function near(value, expected) { assert.ok(Math.abs(value - expected) < 1e-6, value + ' != ' + expected); }

test('idle nodes remain harmless and cannot be armed by walking, E or enemy bullets', () => {
  const { game, node } = arena(); Object.assign(game.player, { x: node.x, y: node.y });
  advance(game, 30); assert.equal(node.status, 'idle'); assert.equal(game.player.hp, game.player.maxHp); assert.equal(game.hazards.length, 0);
  assert.equal(game.interact(), false);
  game.bullets.push({ id: game._id(), owner: 'enemy', x: 1200, y: 1000, vx: 1000, vy: 0, radius: 4, lifetime: 1, damage: 1 });
  game._updateBullets(.2); assert.equal(node.status, 'idle');
});

test('an ordinary fired shot arms a core once; tracking does not arm it', () => {
  const { game, node } = arena();
  assert.equal(game.selectSalvageTarget(node.id), true); assert.equal(game.salvageTarget().kind, 'node'); assert.equal(node.status, 'idle');
  game._shoot(); game._updateBullets(.2); assert.equal(node.status, 'primed');
  const remaining = node.remaining; assert.equal(game._armSalvageNode(node), false); near(node.remaining, remaining);
  assert.equal(game.hazards.filter(hazard => hazard.salvageNodeId === node.id).length, 1);
});

for (let weapon = 0; weapon < WEAPONS.length; weapon++) test(WEAPONS[weapon].id + ' awakens a transparent core without losing its projectile or pierce budget', () => {
  const { game, node } = arena(); node.x = 1250;
  game.player.weapon = weapon; game._syncWeapon(); game._shoot(); const shots = [...game.bullets];
  game._updateBullets(.06); assert.equal(node.status, 'primed');
  assert.ok(shots.every(shot => shot.lifetime > 0)); assert.ok(shots.every(shot => shot.pierce === WEAPONS[weapon].pierce));
  if (weapon === 3) assert.equal(shots[0].exploded, undefined);
  if (weapon === 5) assert.equal(game.starPins.length, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-node-arm').length, 1);
});

test('an ordinary boomerang crosses a core, hits a real enemy, and returns through the core instead of being eaten', () => {
  const { game, node } = arena(); node.x = 1250; game.player.weapon = 4; game._syncWeapon();
  const enemy = game.spawnEnemy('tank', { x: 1340, y: 1000 }), hp = enemy.hp;
  game._shoot(); const blade = game.bullets[0];
  game._updateBullets(.25); assert.equal(node.status, 'primed'); assert.ok(enemy.hp < hp); assert.ok(blade.lifetime > 0);
  for (let frame = 0; frame < 100 && blade.lifetime > 0; frame++) game._updateBullets(1 / 60);
  assert.equal(blade.returning, true); assert.equal(blade.lifetime, 0);
  assert.ok(enemy.hp < hp - WEAPONS[4].damage * .8, 'the actual return also hits the enemy');
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-node-arm').length, 1);
});

test('rocks stop a fired shot and prevent EMP from capturing a hidden core', () => {
  const { game, node } = arena(); game.obstacles = [{ id: game._id(), x: 1250, y: 1000, radius: 22, type: 'rock' }];
  game._shoot(); game._updateBullets(.2); assert.equal(node.status, 'idle');
  game.useSkill(); assert.equal(node.status, 'idle'); assert.equal(game.salvage.round.remaining, 0);
});

test('an actual dash crosses the primed core and reverses its original timer once', () => {
  const { game, node } = arena(); game._armSalvageNode(node); advance(game, .2);
  const before = node.remaining; assert.equal(game.dash({ x: 1, y: 0 }), true); advance(game, .2);
  assert.equal(node.status, 'friendly'); near(node.remaining, before - .2); assert.equal(game.salvage.fieldStats.reversals, 1);
  assert.ok(game.salvage.round.remaining > 3.8 && game.salvage.round.remaining <= 4);
  assert.equal(game._armSalvageNode(node, true), false); assert.equal(game.salvage.fieldStats.reversals, 1);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-node-reverse').length, 1);
});

test('walking through a primed core or dashing only through the outer field never reverses it', () => {
  const walk = arena(); walk.game._armSalvageNode(walk.node); advance(walk.game, .6, 60, { moveX: 1 });
  assert.equal(walk.node.status, 'primed');
  const outer = arena(); outer.game.player.y += 100; outer.game._armSalvageNode(outer.node); outer.game.dash({ x: 1, y: 0 }); advance(outer.game, .2);
  assert.equal(outer.node.status, 'primed'); assert.equal(outer.game.salvage.round.remaining, 0);
});

test('a dash blocked before the core cannot reverse it from its intended endpoint', () => {
  const { game, node } = arena(); game._armSalvageNode(node);
  game.obstacles = [{ id: game._id(), type: 'rock', x: 1240, y: 1000, radius: 28 }];
  game.dash({ x: 1, y: 0 }); advance(game, .2);
  assert.equal(node.status, 'primed'); assert.ok(game.player.x < 1240); assert.equal(game.salvage.fieldStats.reversals, 0);
});

for (const [sector, damage] of [['scrapyard', 18], ['frostport', 16], ['stormcity', 20]]) {
  test(sector + ' unreversed field resolves once with accurate damage and ice inner safety', () => {
    const { game, node } = arena(sector); game._armSalvageNode(node);
    Object.assign(game.player, { x: node.x + (node.kind === 'ring' ? 100 : 20), y: node.y });
    const hp = game.player.hp; advance(game, 1.3); near(game.player.hp, hp - damage);
    assert.equal(node.status, 'spent'); assert.equal(game.hazards.length, 0); assert.equal(game.lastDamage.kind, 'environment');
    const lost = game.player.hp; advance(game, 2); near(game.player.hp, lost); assert.equal(game._armSalvageNode(node, true), false);
    const bursts = game.drainEvents().filter(event => event.type === 'hazard-burst' && event.salvageNodeId === node.id);
    assert.equal(bursts.length, 1); assert.equal(bursts[0].friendly, false);
  });
}

test('ice inner circle is safe, and electric lanes do not damage actors outside their real width', () => {
  for (const [sector, x, y] of [['frostport', 1300, 1000], ['stormcity', 1400, 1060]]) {
    const { game, node } = arena(sector); game._armSalvageNode(node); Object.assign(game.player, { x, y });
    advance(game, 1.3); assert.equal(game.player.hp, game.player.maxHp); assert.equal(game.player.slowTimer, 0);
  }
});

for (const [sector, damage] of [['scrapyard', 150], ['frostport', 110], ['stormcity', 140]]) {
  test(sector + ' EMP activates a friendly one-shot field that never damages its owner', () => {
    const { game, node } = arena(sector); Object.assign(game.player, { x: node.x + 90, y: node.y });
    const enemy = game.spawnEnemy('tank', { x: node.x + 50, y: node.y });
    if (node.kind === 'ring') enemy.x += 60;
    game.enemies = []; assert.equal(game.useSkill(), true); game.enemies = [enemy]; enemy.stunTimer = 10;
    assert.equal(node.status, 'friendly'); near(node.remaining, 1.2); assert.equal(game.player.skillCooldown, game.player.skillCooldownMax);
    const hp = enemy.hp; advance(game, 1.3); assert.equal(game.player.hp, game.player.maxHp);
    near(enemy.hp, hp - damage * .8); assert.equal(node.status, 'spent'); assert.equal(game.salvage.fieldStats.reversals, 1);
    if (node.kind === 'ring') assert.ok(enemy.starSlowTimer > 1.2);
  });
}

test('only an unobstructed real grenade explosion arms nearby nodes', () => {
  for (const blocked of [false, true]) {
    const { game, node } = arena();
    if (blocked) game.obstacles = [{ id: game._id(), type: 'rock', x: 1250, y: 1000, radius: 22 }];
    game._burstGrenade({ x: 1200, y: 1000, blastRadius: 135, damage: 78, color: '#fff' });
    assert.equal(node.status, blocked ? 'idle' : 'primed');
  }
});

for (const kind of ['source', 'node']) test('a real grenade that destroys cover still shields the ' + kind + ' from that same blast', () => {
  const { game, node } = arena();
  const source = { ...game.salvage.sources.find(item => item.kind === 'vault'), x: 1330, y: 1000 };
  node.x = 1330; game.salvage.sources = kind === 'source' ? [source] : []; game.salvage.nodes = kind === 'node' ? [node] : [];
  const rock = { id: game._id(), type: 'rock', x: 1250, y: 1000, radius: 22, fragile: true, hp: 60, maxHp: 95 };
  game.obstacles = [rock]; game.player.weapon = 3; game.player.critChance = 0; game._syncWeapon();
  const enemy = game.spawnEnemy('crawler', { x: 1320, y: 1000 }); enemy.hp = enemy.maxHp = 500;
  function fire() {
    game.fireTimer = 0; game._shoot(); const grenade = game.bullets.find(bullet => bullet.kind === 'grenade');
    for (let frame = 0; frame < 60 && !grenade.exploded; frame++) game._updateBullets(1 / 60);
    assert.equal(grenade.exploded, true);
  }
  fire();
  assert.equal(game.obstacles.length, 0); assert.equal(rock.hp, 0);
  assert.equal(enemy.hp, 500 - WEAPONS[3].damage, 'retain the existing salvage enemy blast rule');
  if (kind === 'source') assert.equal(source.hp, source.maxHp); else assert.equal(node.status, 'idle');
  fire();
  if (kind === 'source') assert.equal(source.hp, source.maxHp - WEAPONS[3].damage); else assert.equal(node.status, 'primed');
});

test('pause phases freeze node and round clocks and terminal damage clears all armed fields', () => {
  const { game, node } = arena(); game.useSkill(); const remaining = node.remaining, round = game.salvage.round.remaining;
  game.phase = 'upgrade'; game.update(.25); near(node.remaining, remaining); near(game.salvage.round.remaining, round);
  game.phase = 'playing'; game.player.invulnerable = 0; game._damagePlayer(10000);
  assert.equal(game.phase, 'lost'); assert.equal(node.status, 'spent'); assert.equal(node.remaining, 0); assert.equal(game.salvage.round.remaining, 0); assert.equal(game.hazards.length, 0);
});

test('capture and burst timing remain stable at common refresh rates', () => {
  for (const hz of [30, 60, 120, 144]) {
    const { game, node } = arena(); game._armSalvageNode(node); game.dash({ x: 1, y: 0 }); advance(game, .2, hz);
    assert.equal(node.status, 'friendly'); near(game.player.x, 1362); advance(game, 1, hz);
    assert.equal(node.status, 'spent'); assert.equal(game.salvage.fieldStats.reversals, 1);
    assert.equal(game.drainEvents().filter(event => event.type === 'hazard-burst' && event.salvageNodeId === node.id).length, 1);
  }
});
