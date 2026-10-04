'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../action-engine.js');

function arena() {
  const game = new Game({ random: () => 0.5 });
  game.start(); game.obstacles = []; game.spawnTimer = Infinity;
  Object.assign(game.player, { x: 1000, y: 1000, angle: 0, xpNeeded: Infinity });
  game.drainEvents();
  return game;
}
function fire(game, weapon = game.player.weapon) {
  game.player.weapon = weapon; game.fireTimer = 0; game._syncWeapon(); game._shoot();
  return game.bullets.at(-1);
}
function advance(game, seconds, hz = 60, bulletsOnly = false) {
  for (let elapsed = 0; elapsed < seconds - 1e-10;) {
    const dt = Math.min(1 / hz, seconds - elapsed);
    if (bulletsOnly) game._updateBullets(dt); else game.update(dt);
    elapsed += dt;
  }
}
function sturdy(game, x, y = 1000, type = 'crawler') {
  const enemy = game.spawnEnemy(type, { x, y });
  enemy.hp = enemy.maxHp = 1000; enemy.stunTimer = 10;
  return enemy;
}
function incoming(game, count, x = 1080) {
  for (let index = 0; index < count; index += 1) game._enemyBullet({ x: x + index, y: 1000, radius: 18, type: 'spitter' }, Math.PI, 0, 12);
}
function relay(game) {
  const blade = fire(game, 4);
  game._returnBlade(blade); blade.x = 1026; game.player.dashTimer = 0.2;
  game._updateBullets(1e-6);
  assert.equal(blade.relayCount, 1);
  return blade;
}
function frozenChase() {
  const game = arena(), target = sturdy(game, 940);
  target.stunTimer = 0; game.player.slowTimer = 1;
  assert.equal(game.dash({ x: 1, y: 0 }), true);
  advance(game, 0.2);
  assert.ok(game.player.dashCooldown > 0 && game.player.iceChaseReady);
  return { game, target };
}

test('ordinary banked catches recover at most two rounds until a full blade reload completes', () => {
  const game = arena(); game.obstacles = [{ x: 1280, y: 1000, radius: 35 }]; sturdy(game, 1100);
  for (const expectedAmmo of [8, 8, 7]) { fire(game, 4); advance(game, 0.8, 60, true); assert.equal(game.ammoByWeapon[4], expectedAmmo); }
  assert.equal(game.bladeRecoveryUsed, 2);
  assert.equal(game.reload(), true); assert.equal(game.bladeRecoveryUsed, 2);
  advance(game, 0.4); assert.equal(game.bladeRecoveryUsed, 2);
  advance(game, 1.2); assert.equal(game.bladeRecoveryUsed, 0);
  assert.equal(game.ammoByWeapon[4], 8);
  assert.equal(game.drainEvents().filter(event => event.type === 'secret-recover').length, 2);
});

test('empty banks and relay catches give no ammunition, while offhand normal recovery refills only blades', () => {
  const empty = arena(); empty.obstacles = [{ x: 1280, y: 1000, radius: 35 }];
  fire(empty, 4); advance(empty, 0.8, 60, true);
  assert.equal(empty.ammoByWeapon[4], 7); assert.equal(empty.bladeRecoveryUsed, 0);
  const game = arena(); game.obstacles = empty.obstacles; sturdy(game, 1100);
  fire(game, 4); game.switchWeapon(0); game.ammoByWeapon[0] = 20;
  advance(game, 0.8, 60, true);
  assert.equal(game.ammoByWeapon[4], 8); assert.equal(game.ammoByWeapon[0], 20);
  assert.equal(game.player.ammo, 20);
  const chained = arena(); const blade = relay(chained);
  blade.reboundHit = true; advance(chained, 2.5, 60, true);
  assert.equal(chained.ammoByWeapon[4], 7); assert.equal(chained.bladeRecoveryUsed, 0);
});

test('full magazines do not consume recovery quota; full resupply renews it while partial phase ammo does not', () => {
  const game = arena(); game.obstacles = [{ x: 1280, y: 1000, radius: 35 }]; sturdy(game, 1100);
  fire(game, 4); game.ammoByWeapon[4] = 8; advance(game, 0.8, 60, true);
  assert.equal(game.ammoByWeapon[4], 8); assert.equal(game.bladeRecoveryUsed, 0);
  for (let n = 0; n < 2; n += 1) { fire(game, 4); advance(game, 0.8, 60, true); }
  game.relics.push('phase-mag'); game.dash({ x: 0, y: 1 });
  assert.equal(game.bladeRecoveryUsed, 2);
  game.player.dashTimer = 0; game._refillWeapons(); assert.equal(game.bladeRecoveryUsed, 0);
  fire(game, 4); advance(game, 0.8, 60, true);
  assert.equal(game.ammoByWeapon[4], 8);
});

test('relay steering lasts 0.18 seconds, spends at most 45 degrees, and locks afterward at all refresh rates', () => {
  for (const hz of [30, 60, 144]) {
    const game = arena(), blade = relay(game);
    game.player.angle = Math.PI / 2;
    advance(game, 0.2, hz, true);
    const angle = Math.atan2(blade.vy, blade.vx);
    assert.ok(angle > Math.PI / 4 - 0.001 && angle <= Math.PI / 4 + 1e-10, `${hz} Hz angle ${angle}`);
    assert.ok(blade.relaySteerRemaining >= 0); assert.equal(blade.relaySteerTimer, 0);
    game.player.angle = -Math.PI / 2; advance(game, 0.1, hz, true);
    assert.ok(Math.abs(Math.atan2(blade.vy, blade.vx) - angle) < 1e-10);
    assert.ok(Math.abs(blade.damage - 50.4) < 1e-9);
  }
});

test('alternating aim spends the same finite relay turn budget and a rebound cancels steering', () => {
  const game = arena(), blade = relay(game); let turn = 0, previous = 0;
  for (let step = 0; step < 18; step += 1) {
    game.player.angle = step % 2 ? -Math.PI / 2 : Math.PI / 2;
    game._updateBullets(0.01);
    const next = Math.atan2(blade.vy, blade.vx); turn += Math.abs(next - previous); previous = next;
  }
  assert.ok(turn <= Math.PI / 4 + 1e-9);
  const bank = arena(), banked = relay(bank);
  bank.obstacles = [{ x: 1110, y: 1000, radius: 30 }]; bank.player.angle = 0;
  advance(bank, 0.09, 60, true);
  assert.equal(banked.returning, true); assert.equal(banked.relaySteerTimer, 0);
  assert.ok(Math.abs(banked.damage - 42 * 1.2 * 1.35) < 1e-9);
});

test('reversal waits through cooldown, dry fire and reload, then releases once along the new aim', () => {
  const game = arena(); incoming(game, 8); game.useSkill();
  game.fireTimer = 0.3; game._shoot(); assert.equal(game.player.reversalAmmo, 8);
  game.fireTimer = 0; game.ammoByWeapon[0] = 0; game._shoot();
  assert.ok(game.reloadByWeapon[0] > 0); assert.equal(game.player.reversalAmmo, 8);
  game._shoot(); assert.equal(game.player.reversalAmmo, 8);
  game.switchWeapon(1); advance(game, 0.17); game.player.angle = Math.PI / 2;
  game.player.damageMultiplier = 2; game._shoot();
  const reflected = game.bullets.filter(bullet => bullet.reflected);
  assert.equal(reflected.length, 8); assert.ok(reflected.every(bullet => bullet.vy > 0 && bullet.damage === 18));
  assert.equal(game.player.reversalAmmo, 0); assert.equal(game.player.reversalTimer, 0);
  game.fireTimer = 0; game._shoot(); assert.equal(game.bullets.filter(bullet => bullet.reflected).length, 8);
  assert.equal(game.drainEvents().filter(event => event.type === 'secret-release').length, 1);
});

test('reversal storage expires, replaces instead of stacking, and pauses with the simulation', () => {
  const game = arena(); incoming(game, 8); game.useSkill();
  game.player.skillCooldown = 0; incoming(game, 5); game.useSkill(); assert.equal(game.player.reversalAmmo, 5);
  game.phase = 'upgrade'; advance(game, 1); assert.equal(game.player.reversalTimer, 2.5);
  game.phase = 'playing'; advance(game, 2.51); assert.equal(game.player.reversalAmmo, 0);
  fire(game); assert.equal(game.bullets.some(bullet => bullet.reflected), false);
});

test('remote pulse preview is read-only and selects the nearest live own grenade inside its angle and range', () => {
  const game = arena(); const far = fire(game, 3); far.x = 1640;
  const near = fire(game, 3); near.x = 1450;
  const side = fire(game, 3); side.x = 1300; side.y = 1150;
  const before = JSON.stringify(game); let draws = 0; game.random = () => { draws += 1; return 0.5; };
  for (let i = 0; i < 100; i += 1) assert.equal(game.skillTarget().target, near);
  assert.equal(JSON.stringify(game), before); assert.equal(draws, 0);
  near.lifetime = 0; assert.equal(game.skillTarget().target, far);
  far.x = 1650; assert.equal(game.skillTarget().target, far);
  far.x = 1650.01; assert.equal(game.skillTarget().remote, false);
  far.x = 1450; far.exploded = true; assert.equal(game.skillTarget().remote, false);
  far.exploded = false; far.owner = 'enemy'; assert.equal(game.skillTarget().remote, false);
  far.owner = 'player'; game.player.weapon = 0; assert.equal(game.skillTarget().remote, false);
});

test('remote EMP pays for its distant clear by leaving the player circle unprotected and echoes remotely', () => {
  const game = arena(); game.relics.push('echo-pulse');
  const grenade = fire(game, 3); grenade.x = 1500;
  const nearby = sturdy(game, 1100), distant = sturdy(game, 1500);
  incoming(game, 1, 1080); incoming(game, 6, 1520);
  assert.equal(game.useSkill(), true);
  assert.equal(nearby.hp, 1000); assert.equal(distant.hp, 857);
  assert.equal(game.player.reversalAmmo, 6); assert.equal(game.bullets.filter(bullet => bullet.owner === 'enemy').length, 1);
  assert.equal(game.echoBursts.length, 1); assert.equal(game.echoBursts[0].x, 1500);
  assert.equal(grenade.damage, 78); assert.equal(grenade.exploded, true);
  assert.ok(game.drainEvents().some(event => event.type === 'pulse' && event.remote && event.x === 1500));
});

test('remote lock honors both signs of the ten-degree boundary and requires a target outside the local circle', () => {
  for (const sign of [-1, 1]) for (const [degrees, expected] of [[9.999999, true], [10, true], [10.000001, false]]) {
    const game = arena(), grenade = fire(game, 3), angle = sign * degrees * Math.PI / 180;
    grenade.x = 1000 + Math.cos(angle) * 400; grenade.y = 1000 + Math.sin(angle) * 400;
    assert.equal(game.skillTarget().remote, expected, `${sign * degrees} degrees`);
  }
  const game = arena(), grenade = fire(game, 3);
  grenade.x = 1210; assert.equal(game.skillTarget().remote, false);
  grenade.x += 0.001; assert.equal(game.skillTarget().remote, true);
});

test('turning away or losing the remote target restores local EMP with no stale lock', () => {
  for (const loss of ['angle', 'destroyed']) {
    const game = arena(), grenade = fire(game, 3); grenade.x = 1500;
    assert.equal(game.skillTarget().remote, true);
    if (loss === 'angle') game.player.angle = Math.PI / 2; else grenade.lifetime = 0;
    incoming(game, 5); game.useSkill();
    assert.equal(game.player.reversalAmmo, 5);
    assert.ok(game.drainEvents().some(event => event.type === 'pulse' && !event.remote && event.x === 1000));
  }
});

test('rail corridor follows real travel, stops at cover, caps its length and disappears after 0.8 seconds', () => {
  const game = arena(); for (const x of [1100, 1200, 1300]) sturdy(game, x);
  game.obstacles = [{ x: 1450, y: 1000, radius: 35 }]; fire(game, 2); advance(game, 0.5, 60, true);
  assert.equal(game.railCorridor.endX, 1411); assert.equal(game.railCorridor.x, 1022);
  assert.equal(game.railCorridor.width, 36);
  advance(game, 0.81); assert.equal(game.railCorridor, null);
  const long = arena(); for (const x of [1100, 1200, 1300]) sturdy(long, x);
  fire(long, 2); advance(long, 0.7, 60, true);
  assert.ok(Math.abs(long.railCorridor.endX - long.railCorridor.x - 500) < 1e-8);
});

test('the single rail corridor slows ordinary walking inside only, without slowing bosses or charge attacks', () => {
  const game = arena(); for (const x of [1100, 1200, 1300]) sturdy(game, x);
  fire(game, 2); advance(game, 0.3, 60, true); game.enemies = [];
  const walker = sturdy(game, 1250); walker.stunTimer = 0; walker.attackTimer = 10;
  game._updateEnemies(0.1); assert.ok(Math.abs(walker.x - (1250 - 92 * 0.1 * 0.7)) < 1e-8);
  walker.y = 1100; const before = { x: walker.x, y: walker.y }; game._steerMove(walker, 1, 0, 100, 0.1);
  assert.ok(Math.abs(walker.x - before.x - 10) < 1e-8);
  game.enemies = []; const boss = sturdy(game, 1250, 1000, 'boss'); game._steerMove(boss, 1, 0, 100, 0.1);
  assert.equal(boss.x, 1260);
  game.enemies = []; const charger = sturdy(game, 1250, 1000, 'charger');
  Object.assign(charger, { stunTimer: 0, chargeTimer: 0.5, chargeX: 1, chargeY: 0 });
  game._updateEnemies(0.1); assert.equal(charger.x, 1294);
  for (const enemy of game.enemies) enemy.hp = 0;
  game.player.y = 1300; for (const x of [1100, 1200, 1300]) sturdy(game, x, 1300);
  fire(game, 2); advance(game, 0.3, 60, true); assert.equal(game.railCorridor.y, 1300);
});

test('ice chase requires a living frozen target in the input direction and charges its full extra cooldown', () => {
  const { game, target } = frozenChase();
  assert.equal(game.dash({ x: 1, y: 0 }), false); assert.equal(game.player.iceChaseReady, true);
  assert.equal(game.dash({ x: -1, y: 0 }), true);
  assert.equal(game.player.iceChaseReady, false); assert.equal(game.player.iceChaseTimer, 0);
  assert.ok(Math.abs(game.player.dashCooldown - 3.6) < 1e-10);
  target.phaseMarkTimer = 4; game._detonatePhase(target);
  assert.ok(Math.abs(game.player.dashCooldown - 3.6) < 1e-10, 'same-action phase refunds cannot erase the chase cost');
  game.reactor.charge = 100; game.activateOverdrive(); assert.ok(Math.abs(game.player.dashCooldown - 3.6) < 1e-10);
  advance(game, 0.2); assert.equal(game.dash({ x: 1, y: 0 }), false);
  assert.equal(game.drainEvents().filter(event => event.type === 'secret-trigger' && event.chase).length, 1);
});

test('ice chase cannot target dead, thawed, distant, close or unmarked enemies, or produce an infinite second break', () => {
  for (const invalid of ['dead', 'thawed', 'far', 'close', 'different']) {
    const { game, target } = frozenChase();
    if (invalid === 'dead') target.hp = 0;
    if (invalid === 'thawed') target.iceBreakTimer = 0;
    if (invalid === 'far') target.x = game.player.x - 281;
    if (invalid === 'close') target.x = game.player.x - 79;
    if (invalid === 'different') { target.hp = 0; const other = sturdy(game, game.player.x - 100); other.iceBreakTimer = 1; }
    assert.equal(game.dash({ x: -1, y: 0 }), false, invalid);
  }
  const { game, target } = frozenChase();
  target.x = game.player.x - 100; game.player.slowTimer = 1;
  assert.equal(game.dash({ x: -1, y: 0 }), true);
  assert.equal(game.player.iceChaseReady, false); assert.equal(game.iceChaseIds.size, 0);
  advance(game, 0.2); assert.equal(game.dash({ x: 1, y: 0 }), false);
});

test('ice chase includes the 80/280 distance and 35-degree direction edges at 30, 60 and 144 Hz', () => {
  for (const hz of [30, 60, 144]) for (const [range, degrees, expected] of [[80, 35, true], [280, 35, true], [80, 35.000001, false], [280.000001, 0, false]]) {
    const game = arena(), target = sturdy(game, 940);
    game.player.slowTimer = 1; game.dash({ x: 1, y: 0 }); advance(game, 0.2, hz);
    target.x = game.player.x + range; target.y = game.player.y;
    assert.equal(game.dash({ x: Math.cos(degrees * Math.PI / 180), y: Math.sin(degrees * Math.PI / 180) }), expected, `${hz} Hz ${range} px ${degrees} deg`);
  }
});

test('ice chase windows expire consistently and all new combat state clears on reset or real terminal outcomes', () => {
  for (const hz of [30, 60, 144]) {
    const { game } = frozenChase(); advance(game, 1.01, hz);
    assert.equal(game.player.iceChaseReady, false); assert.equal(game.player.iceChaseTimer, 0);
  }
  for (const ending of ['reset', 'won', 'lost']) {
    const { game } = frozenChase(); incoming(game, 6); game.useSkill();
    game.railCorridor = { x: 0, y: 0, endX: 100, endY: 0, width: 36, remaining: 0.8 };
    if (ending === 'reset') game.reset();
    if (ending === 'won') { const boss = sturdy(game, 1700, 1300, 'boss'); game._damageEnemy(boss, 2000); }
    if (ending === 'lost') { game.player.invulnerable = 0; game._damagePlayer(9999); }
    assert.equal(game.player.reversalAmmo, 0); assert.equal(game.player.reversalTimer, 0);
    assert.equal(game.player.iceChaseReady, false); assert.equal(game.iceChaseIds.size, 0); assert.equal(game.railCorridor, null);
  }
});
