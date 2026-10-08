'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, WEAPONS } = require('../action-engine.js');

// Controlled real-shot fixtures isolate effects from the salvage director.
function arena(modId = '') {
  const game = new Game({ mode: 'salvage', seed: 731 }); game.start(); game.salvage.pending = []; game.enemies = [];
  game.obstacles = []; game.battlefield.props = []; game.battlefield.mines = []; game.salvage.sources = []; game.salvage.nodes = [];
  Object.assign(game.player, { x: 1000, y: 1000, angle: 0, critChance: 0 }); game.salvage.modId = modId; game.drainEvents(); return game;
}
function near(value, expected) { assert.ok(Math.abs(value - expected) < 1e-7, value + ' != ' + expected); }
function advance(game, seconds, hz = 60, input = {}) { for (let time = 0; time < seconds - 1e-10;) { const dt = Math.min(1 / hz, seconds - time); game.update(dt, input); time += dt; } }

test('nodes prepare one basic 25 percent shot even before a module is equipped', () => {
  const game = arena(); assert.equal(game._primeSalvageRound('dash'), false); assert.equal(game._primeSalvageRound('node'), true);
  near(game.salvage.round.remaining, 4); game._shoot();
  assert.equal(game.salvage.round.remaining, 0); near(game.bullets[0].damage, WEAPONS[0].damage * 1.25);
  assert.equal(game.bullets[0].refitShot.modId, '');
  game.fireTimer = 0; game._shoot(); assert.equal(game.bullets[1].refitShot, undefined); near(game.bullets[1].damage, WEAPONS[0].damage);
});

for (let weapon = 0; weapon < WEAPONS.length; weapon++) test(WEAPONS[weapon].id + ' consumes one charge for a whole accepted shot', () => {
  const game = arena('frost'); game.player.weapon = weapon; game._syncWeapon(); game._primeSalvageRound('node');
  const ammo = game.ammoByWeapon[weapon]; game._shoot();
  assert.equal(game.ammoByWeapon[weapon], ammo - 1); assert.equal(game.salvage.round.remaining, 0);
  assert.equal(game.bullets.length, WEAPONS[weapon].pellets);
  assert.equal(new Set(game.bullets.map(bullet => bullet.refitShot)).size, 1);
  for (const bullet of game.bullets) near(bullet.damage, WEAPONS[weapon].damage * 1.25);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-round-shot').length, 1);
});

test('failed fire during cooldown, reload, and empty-mag auto reload does not consume the charge', () => {
  for (const reason of ['cooldown', 'reload', 'empty']) {
    const game = arena('arc'); game._primeSalvageRound('node');
    if (reason === 'cooldown') game.fireTimer = 1;
    if (reason === 'reload') game.reloadByWeapon[0] = 1;
    if (reason === 'empty') game.ammoByWeapon[0] = 0;
    game._shoot(); assert.equal(game.bullets.length, 0); near(game.salvage.round.remaining, 4);
    assert.equal(game.drainEvents().filter(event => event.type === 'salvage-round-shot').length, 0);
  }
});

test('unspent charges expire in four simulation seconds and freeze with the game', () => {
  for (const hz of [30, 60, 120, 144]) {
    const game = arena('frost'); game._primeSalvageRound('node'); advance(game, 3.5, hz);
    near(game.salvage.round.remaining, .5); game.phase = 'upgrade'; game.update(.25); near(game.salvage.round.remaining, .5);
    game.phase = 'playing'; advance(game, .5, hz); assert.equal(game.salvage.round.remaining, 0);
    game._shoot(); assert.equal(game.bullets[0].refitShot, undefined);
  }
});

test('piercing a real enemy while dashing prepares breach, while an empty dash does not', () => {
  const empty = arena('breach'); empty.dash({ x: 1, y: 0 }); advance(empty, .2); assert.equal(empty.salvage.round.remaining, 0);
  const game = arena('breach'), target = game.spawnEnemy('tank', { x: 1100, y: 1000 }); target.stunTimer = 10;
  game.dash({ x: 1, y: 0 }); advance(game, .2); assert.ok(target.phaseMarkTimer > 0); assert.ok(game.salvage.round.remaining > 3.8);
  game._shoot(); assert.equal(game.bullets[0].refitShot.modId, 'breach'); assert.equal(game.bullets[0].pierce, 1);
});

test('frost is prepared by a real precise reload, never by an ordinary completed reload', () => {
  for (const perfect of [false, true]) {
    const game = arena('frost'); game.ammoByWeapon[0] = 10; assert.equal(game.reload(), true);
    if (perfect) { game.reloadByWeapon[0] = game.reloadDurationByWeapon[0] * .4; assert.equal(game.reload(), true); }
    else advance(game, game.reloadDurationByWeapon[0] + .1);
    assert.equal(game.salvage.round.remaining > 0, perfect);
  }
});

test('arc requires a real EMP enemy hit; empty pulses and other modules do not prime it', () => {
  const empty = arena('arc'); empty.useSkill(); assert.equal(empty.salvage.round.remaining, 0);
  for (const modId of ['arc', 'frost', 'breach']) {
    const game = arena(modId); game.spawnEnemy('tank', { x: 1070, y: 1000 }); game.useSkill();
    assert.equal(game.salvage.round.remaining > 0, modId === 'arc');
  }
});

test('breach shots ignore a frontal bulwark shield, pierce one extra enemy, and remain blocked by rock', () => {
  const game = arena('breach'), front = game.spawnEnemy('bulwark', { x: 1090, y: 1000 }), rear = game.spawnEnemy('crawler', { x: 1180, y: 1000 });
  front.shieldAngle = Math.PI; const hp = front.hp; game._primeSalvageRound('node'); game._shoot(); game._updateBullets(.25);
  near(front.hp, hp - 20); near(rear.hp, rear.maxHp - 20);
  const blocked = arena('breach'), target = blocked.spawnEnemy('crawler', { x: 1130, y: 1000 });
  blocked.obstacles = [{ id: blocked._id(), type: 'rock', x: 1080, y: 1000, radius: 20 }];
  blocked._primeSalvageRound('node'); blocked._shoot(); blocked._updateBullets(.25); assert.equal(target.hp, target.maxHp);
});

test('one frost shot slows nearby enemies without extra damage or crossing rock', () => {
  const game = arena('frost'), first = game.spawnEnemy('tank', { x: 1100, y: 1000 }), nearEnemy = game.spawnEnemy('crawler', { x: 1170, y: 1000 }), outside = game.spawnEnemy('crawler', { x: 1300, y: 1000 });
  game._primeSalvageRound('node'); game._shoot(); const hp = game.player.hp; game._updateBullets(.2);
  near(first.starSlowTimer, 1.4); near(nearEnemy.starSlowTimer, 1.4); assert.equal(outside.starSlowTimer || 0, 0);
  near(nearEnemy.hp, nearEnemy.maxHp); near(game.player.hp, hp);
  const blocked = arena('frost'), a = blocked.spawnEnemy('tank', { x: 1100, y: 1000 }), b = blocked.spawnEnemy('crawler', { x: 1170, y: 1000 });
  blocked.obstacles = [{ id: blocked._id(), type: 'rock', x: 1135, y: 1000, radius: 16 }];
  blocked._primeSalvageRound('node'); blocked._shoot(); blocked._updateBullets(.2); near(a.starSlowTimer, 1.4); assert.equal(b.starSlowTimer || 0, 0);
});

test('scatter and returning blades share one frost impact effect instead of repeating per projectile', () => {
  for (const weapon of [1, 4]) {
    const game = arena('frost'); game.player.weapon = weapon; game._syncWeapon();
    game.spawnEnemy('tank', { x: 1080, y: 1000 }); game._primeSalvageRound('node'); game._shoot();
    const shot = game.bullets[0].refitShot;
    game._updateBullets(.25); if (weapon === 4) for (let i = 0; i < 6; i++) game._updateBullets(.25);
    assert.equal(shot.triggered, true); assert.equal(game.drainEvents().filter(event => event.type === 'salvage-refit-hit' && event.modId === 'frost').length, 1);
  }
});

test('evolved twin blades share the same single frost impact and one firing charge', () => {
  const game = arena('frost'); game.player.weapon = 4; game.evolutionId = 'boomerang-twin'; game._syncWeapon();
  game.spawnEnemy('tank', { x: 1080, y: 1000 }); game._primeSalvageRound('node'); game._shoot();
  assert.equal(game.bullets.length, 2); assert.equal(game.bullets[0].refitShot, game.bullets[1].refitShot);
  for (let frame = 0; frame < 100; frame++) game._updateBullets(1 / 60);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-refit-hit').length, 1);
});

test('a grenade with several real targets generates one frost burst, never an effect per AoE target', () => {
  const game = arena('frost'); game.player.weapon = 3; game._syncWeapon();
  game.spawnEnemy('tank', { x: 1100, y: 1000 }); game.spawnEnemy('tank', { x: 1140, y: 1040 }); game.spawnEnemy('tank', { x: 1140, y: 960 });
  game._primeSalvageRound('node'); game._shoot(); const shot = game.bullets[0].refitShot; game._updateBullets(.25);
  assert.equal(shot.triggered, true); assert.equal(game.drainEvents().filter(event => event.type === 'salvage-refit-hit').length, 1);
});

test('arc makes at most two unique bounded jumps without applying its effect recursively', () => {
  const game = arena('arc'), enemies = [1100, 1210, 1340, 1460].map(x => game.spawnEnemy('crawler', { x, y: 1000 }));
  game._primeSalvageRound('node'); game._shoot(); game._updateBullets(.2);
  near(enemies[0].hp, enemies[0].maxHp - 20); near(enemies[1].hp, enemies[1].maxHp - 7); near(enemies[2].hp, enemies[2].maxHp - 4); near(enemies[3].hp, enemies[3].maxHp);
  const arcs = game.drainEvents().filter(event => event.type === 'salvage-refit-hit'); assert.equal(arcs.length, 2); assert.equal(new Set(arcs.map(event => event.targetId)).size, 2);
});

test('arc stops at blocked or out-of-range jumps and never damages the player', () => {
  const game = arena('arc'), a = game.spawnEnemy('crawler', { x: 1100, y: 1000 }), b = game.spawnEnemy('crawler', { x: 1210, y: 1000 }), c = game.spawnEnemy('crawler', { x: 1300, y: 1000 });
  game.obstacles = [{ id: game._id(), type: 'rock', x: 1155, y: 1000, radius: 16 }];
  game._primeSalvageRound('node'); game._shoot(); game._updateBullets(.2);
  near(a.hp, a.maxHp - 20); near(b.hp, b.maxHp); near(c.hp, c.maxHp); assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-refit-hit').length, 0);
});

test('grenade AoE does not repeat its bounded two-jump arc per blast target', () => {
  const game = arena('arc'); game.player.weapon = 3; game._syncWeapon();
  for (const [x, y] of [[1100, 1000], [1140, 1040], [1140, 960], [1220, 1000]]) game.spawnEnemy('tank', { x, y });
  game._primeSalvageRound('node'); game._shoot(); game._updateBullets(.25);
  const events = game.drainEvents().filter(event => event.type === 'salvage-refit-hit');
  assert.equal(events.length, 2); assert.equal(new Set(events.map(event => event.targetId)).size, 2);
});

test('missed frost and arc shots do not invent impact effects or damage', () => {
  for (const modId of ['frost', 'arc']) {
    const game = arena(modId); game._primeSalvageRound('node'); game._shoot(); for (let i = 0; i < 5; i++) game._updateBullets(.25);
    assert.equal(game.drainEvents().filter(event => event.type === 'salvage-refit-hit').length, 0); assert.equal(game.salvage.round.remaining, 0);
  }
});

test('starline lingering wires and grenade echoes do not inherit a second refit impact', () => {
  const pins = arena('arc'); pins.player.weapon = 5; pins._syncWeapon(); pins._primeSalvageRound('node'); pins._shoot();
  assert.equal(pins.bullets[0].starMultiplier, 1); assert.equal(pins.bullets[0].damage, WEAPONS[5].damage * 1.25);
  const echoes = arena('frost'); echoes.player.weapon = 3; echoes.evolutionId = 'grenade-echo'; echoes._syncWeapon();
  echoes.spawnEnemy('tank', { x: 1100, y: 1000 }); echoes._primeSalvageRound('node'); echoes._shoot(); echoes._updateBullets(.25);
  assert.equal(echoes.evolutionState.echoes.length, 1); assert.equal(echoes.evolutionState.echoes[0].refitShot, undefined);
});
