'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WEAPONS, UPGRADES, EVOLUTIONS } = require('../action-engine.js');

function arena(options = {}) {
  const game = new Game({ random: () => .5, ...options }); game.start();
  game.obstacles = []; game.enemies = []; game.spawnTimer = Infinity;
  Object.assign(game.player, { x: 1000, y: 1000, angle: 0 });
  game.drainEvents(); return game;
}
function equip(game, id) {
  const evolution = EVOLUTIONS.find(item => item.id === id);
  game.player.weapon = evolution.weapon;
  game.phase = 'upgrade'; game.upgradeChoices = [UPGRADES.find(item => item.id === evolution.prerequisite)];
  assert.equal(game.chooseUpgrade(evolution.prerequisite), true);
  game.player.level = 3; game.player.xp = game.player.xpNeeded; game._levelUp();
  assert.ok(game.upgradeChoices.some(item => item.id === id));
  assert.equal(game.chooseUpgrade(id), true);
  game.drainEvents(); return evolution;
}
function fire(game, weapon = game.player.weapon) {
  game.player.weapon = weapon; game.fireTimer = 0; game._syncWeapon(); game._shoot();
  return game.bullets.at(-1);
}
function sturdy(game, x, y = 1000, type = 'crawler') {
  const enemy = game.spawnEnemy(type, { x, y });
  enemy.hp = enemy.maxHp = 1000; enemy.stunTimer = 10; return enemy;
}
function advance(game, seconds, hz = 60, update = dt => game._updateBullets(dt)) {
  while (seconds > 1e-9) { const dt = Math.min(seconds, 1 / hz); update(dt); seconds -= dt; }
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }
function triggers(game, stage) { return game.drainEvents().filter(event => event.type === 'evolution-trigger' && event.stage === stage); }

test('six evolutions require their own mod and level four, with the current eligible weapon guaranteed', () => {
  assert.equal(EVOLUTIONS.length, 6);
  for (const evolution of EVOLUTIONS) {
    assert.equal(evolution.evolution, true);
    assert.equal(UPGRADES.find(item => item.id === evolution.prerequisite).weapon, evolution.weapon);
    for (const field of ['title', 'description', 'color', 'icon', 'playHint']) assert.equal(typeof evolution[field], 'string');
    const game = arena(); game.player.weapon = evolution.weapon;
    game.player.level = 3; game.player.xp = game.player.xpNeeded; game._levelUp();
    assert.ok(!game.upgradeChoices.some(item => item.evolution));
    game.upgradeStacks[evolution.prerequisite] = 1; game.player.level = 2;
    game.player.xp = game.player.xpNeeded; game._levelUp();
    assert.ok(!game.upgradeChoices.some(item => item.evolution));
    for (const item of EVOLUTIONS) game.upgradeStacks[item.prerequisite] = 1;
    game.player.xp = game.player.xpNeeded; game._levelUp();
    assert.equal(game.upgradeChoices[0].id, evolution.id);
    assert.equal(game.upgradeChoices.filter(item => item.evolution).length, 1);
    assert.equal(new Set(game.upgradeChoices.map(item => item.id)).size, 3);
    assert.equal(game.chooseUpgrade(evolution.id), true);
    assert.equal(game.evolutionId, evolution.id);
    assert.equal(game.drainEvents().filter(event => event.type === 'weapon-evolved').length, 1);
  }
});

test('an eligible off-weapon evolution stays offered, declining is safe, and only one can be chosen per run', () => {
  const game = arena(); game.upgradeStacks['return-edge'] = 1; game.player.level = 3;
  game.player.xp = game.player.xpNeeded; game._levelUp();
  assert.equal(game.upgradeChoices[0].id, 'boomerang-twin');
  assert.equal(game.chooseUpgrade(game.upgradeChoices.find(item => !item.evolution).id), true);
  game.player.xp = game.player.xpNeeded; game._levelUp();
  assert.equal(game.upgradeChoices[0].id, 'boomerang-twin');
  assert.equal(game.chooseUpgrade('boomerang-twin'), true);
  game.upgradeStacks.arc = 1; game.player.xp = game.player.xpNeeded; game._levelUp();
  assert.ok(!game.upgradeChoices.some(item => item.evolution));
  game.upgradeChoices.push(EVOLUTIONS[0]);
  assert.equal(game.chooseUpgrade('assault-chain'), false);
  game.reset(); assert.equal(game.evolutionId, '');
  assert.deepEqual(game.evolutionState, { breachTimer: 0, echoes: [] });
});

test('trial progression uses the same earned evolution gate and does not grant it at mission start', () => {
  const game = arena({ mode: 'trial', seed: 11 });
  assert.equal(game.evolutionId, '');
  equip(game, 'piercer-mirror');
  assert.equal(game.evolutionId, 'piercer-mirror');
});

test('a fully upgraded run can still choose its one evolution without inventing ordinary upgrade cards', () => {
  const game = arena(); game.player.level = 20;
  for (const upgrade of UPGRADES) game.upgradeStacks[upgrade.id] = upgrade.maxStacks;
  game.player.xp = game.player.xpNeeded; game._levelUp();
  assert.deepEqual(game.upgradeChoices.map(item => item.id), ['assault-chain']);
  assert.equal(game.chooseUpgrade('assault-chain'), true);
  game.player.hp = 1; game.player.xp = game.player.xpNeeded; game._levelUp();
  assert.equal(game.player.hp, game.player.maxHp); assert.equal(game.phase, 'playing');
});

test('rifle chains replace the original arc with three decreasing distinct hits from each new origin', () => {
  const game = arena(); equip(game, 'assault-chain');
  const direct = sturdy(game, 1100), a = sturdy(game, 1100, 1140), b = sturdy(game, 1100, 1280), c = sturdy(game, 1100, 1420), beyond = sturdy(game, 1100, 1560);
  fire(game); advance(game, .1);
  near(direct.hp, 984); near(a.hp, 1000 - 16 * .45); near(b.hp, 1000 - 16 * .32); near(c.hp, 1000 - 16 * .24);
  near(beyond.hp, 1000);
  const arcs = game.drainEvents().filter(event => event.type === 'arc');
  assert.deepEqual(arcs.map(event => event.jump), [1, 2, 3]);
  assert.deepEqual(arcs.map(event => [event.x, event.y]), [[1100, 1000], [1100, 1140], [1100, 1280]]);
});

test('evolved chain cannot pass through a rock or hit a dead or already visited target', () => {
  const game = arena(); equip(game, 'assault-chain');
  const direct = sturdy(game, 1100), blocked = sturdy(game, 1100, 1120), alive = sturdy(game, 1210), dead = sturdy(game, 1110, 1002); dead.hp = 0;
  game.obstacles.push({ x: 1100, y: 1060, radius: 22 });
  const bullet = fire(game); game._applyAmmoEffect(bullet, direct);
  near(blocked.hp, 1000); near(alive.hp, 1000 - 16 * .45); near(direct.hp, 1000);
  assert.equal(game.drainEvents().filter(event => event.type === 'arc').length, 1);
  game._applyAmmoEffect(bullet, direct); near(alive.hp, 1000 - 16 * .45);
});

test('in-flight bullets do not gain a newly selected evolution and other weapons retain their original shot', () => {
  const game = arena(); const earlier = fire(game, 0); equip(game, 'assault-chain');
  assert.equal(earlier.evolutionId, '');
  game.bullets = []; fire(game, 1);
  assert.equal(game.bullets.length, 8);
  assert.ok(game.bullets.every(bullet => bullet.damage === 15 && bullet.evolutionId === ''));
});

test('successful dash primes one narrow piercing shotgun volley without adding damage to later volleys', () => {
  const game = arena(); equip(game, 'shotgun-breach');
  assert.equal(game.dash({ x: 1, y: 0 }), true);
  assert.equal(game.evolutionState.breachTimer, 2);
  const ammo = game.ammoByWeapon[1]; fire(game);
  assert.equal(game.bullets.length, 3); assert.equal(game.ammoByWeapon[1], ammo - 1);
  assert.ok(game.bullets.every(bullet => bullet.breach && bullet.damage === 36 && bullet.pierce === 1 && bullet.lifetime === .7));
  near(Math.atan2(game.bullets[0].vy, game.bullets[0].vx), -.12);
  assert.equal(game.evolutionState.breachTimer, 0);
  const central = game.bullets[1]; game.bullets = [central];
  const a = sturdy(game, 1200), b = sturdy(game, 1370), c = sturdy(game, 1490);
  advance(game, .6); near(a.hp, 964); near(b.hp, 964); near(c.hp, 1000);
  game.bullets = []; fire(game);
  assert.equal(game.bullets.length, 8); assert.ok(game.bullets.every(bullet => bullet.damage === 15 && !bullet.breach));
});

test('dry, cooldown and reloading shots do not consume breach; other weapons and failed dashes do not refresh it', () => {
  const game = arena(); equip(game, 'shotgun-breach'); game.dash({ x: 1, y: 0 });
  game.evolutionState.breachTimer = .4;
  assert.equal(game.dash(), false); near(game.evolutionState.breachTimer, .4);
  fire(game, 0); near(game.evolutionState.breachTimer, .4);
  game.player.weapon = 1; game.ammoByWeapon[1] = 0; fire(game);
  near(game.evolutionState.breachTimer, .4); assert.ok(game.reloadByWeapon[1] > 0);
  game._shoot(); near(game.evolutionState.breachTimer, .4);
  game.reloadByWeapon[1] = 0; game.ammoByWeapon[1] = 7; game.fireTimer = 1; game._shoot();
  near(game.evolutionState.breachTimer, .4);
});

test('breach expires in simulation time and freezes behind upgrade, pause and tactic screens', () => {
  const game = arena(); equip(game, 'shotgun-breach'); game.dash({ x: 1, y: 0 });
  for (const phase of ['paused', 'upgrade', 'tactic']) { game.phase = phase; game.update(.033); near(game.evolutionState.breachTimer, 2); }
  game.phase = 'playing'; advance(game, 2, 60, dt => game.update(dt));
  near(game.evolutionState.breachTimer, 0); game.bullets = []; fire(game); assert.equal(game.bullets.length, 8);
});

test('rail reflects exactly once, consumes the remaining frame, reduces damage and respects a second rock', () => {
  for (const hz of [30, 60, 144]) {
    const game = arena(); equip(game, 'piercer-mirror');
    game.obstacles = [{ x: 1200, y: 1000, radius: 40 }, { x: 850, y: 1000, radius: 40 }];
    const bullet = fire(game); advance(game, .15, hz);
    assert.equal(bullet.ricocheted, true); near(bullet.damage, 86 * .7); near(bullet.vx, -1600);
    near(bullet.x, 1156 - .05 - (1600 * .15 - 134));
    assert.equal(triggers(game, 'ricochet').length, 1);
    advance(game, .2, hz); assert.equal(bullet.lifetime, 0); assert.equal(game.bullets.length, 0);
    assert.equal(triggers(game, 'ricochet').length, 0);
  }
});

test('reflected rail preserves hit history and leaves the original corridor ending at the rock', () => {
  const game = arena(); equip(game, 'piercer-mirror'); game.obstacles = [{ x: 1280, y: 1000, radius: 30 }];
  const enemies = [1090, 1150, 1210].map(x => sturdy(game, x));
  const bullet = fire(game); advance(game, .18);
  assert.equal(bullet.ricocheted, true); assert.equal(bullet.railResonating, true);
  assert.deepEqual(bullet.hitIds, enemies.map(enemy => enemy.id));
  const hp = enemies.map(enemy => enemy.hp), end = game.railCorridor.endX;
  near(end, 1246); assert.equal(game.railCorridor.bulletId, null);
  advance(game, .18); assert.deepEqual(enemies.map(enemy => enemy.hp), hp); near(game.railCorridor.endX, end);
});

test('grazing mirror rail follows the surface normal and an embedded or tangent shot cannot loop', () => {
  const game = arena(); equip(game, 'piercer-mirror'); game.player.y = 1030;
  game.obstacles = [{ x: 1150, y: 1000, radius: 40 }]; const bullet = fire(game);
  advance(game, .1); assert.equal(bullet.ricocheted, true); assert.ok(bullet.vy > 0); near(Math.hypot(bullet.vx, bullet.vy), 1600);
  for (const y of [1000, 1044]) {
    const edge = arena(); equip(edge, 'piercer-mirror'); edge.player.x = 1128; edge.player.y = y;
    edge.obstacles = [{ x: 1150, y: 1000, radius: 40 }]; const shot = fire(edge);
    edge._updateBullets(.033); assert.equal(shot.lifetime, 0);
    assert.ok(triggers(edge, 'ricochet').length <= 1);
  }
});

test('grenade schedules one bounded delayed aftershock with exact damage, and never repeats the explosion', () => {
  const game = arena(); equip(game, 'grenade-echo'); const bullet = fire(game);
  bullet.x = 1200; bullet.y = 1000;
  const enemy = sturdy(game, 1240); game._burstGrenade(bullet);
  near(enemy.hp, 1000 - 78); assert.equal(game.evolutionState.echoes.length, 1);
  const echo = game.evolutionState.echoes[0]; near(echo.remaining, .55); near(echo.damage, 78 * .45); assert.equal(echo.radius, 110);
  game._burstGrenade(bullet); assert.equal(game.evolutionState.echoes.length, 1);
  game._updateEvolutionEffects(.549); near(enemy.hp, 922);
  game._updateEvolutionEffects(.001); near(enemy.hp, 922 - 78 * .45); assert.equal(game.evolutionState.echoes.length, 0);
  game._updateEvolutionEffects(2); near(enemy.hp, 922 - 78 * .45);
  assert.equal(triggers(game, 'echo').length, 1);
});

test('aftershock timing is consistent at 30, 60 and 144 Hz and still hits a target entering late', () => {
  for (const hz of [30, 60, 144]) {
    const game = arena(); equip(game, 'grenade-echo'); const bullet = fire(game);
    bullet.x = 1200; bullet.y = 1000; game._burstGrenade(bullet);
    const enemy = sturdy(game, 1600); advance(game, .549, hz, dt => game._updateEvolutionEffects(dt));
    near(enemy.hp, 1000); enemy.x = 1250;
    game._updateEvolutionEffects(.001); near(enemy.hp, 1000 - 78 * .45);
    assert.equal(game.evolutionState.echoes.length, 0);
  }
});

test('rocks block only the new aftershock and leaving its visible circle avoids its damage', () => {
  const game = arena(); equip(game, 'grenade-echo'); const bullet = fire(game);
  bullet.x = 1200; bullet.y = 1000;
  const blocked = sturdy(game, 1280), leaving = sturdy(game, 1200, 1080), open = sturdy(game, 1200, 920);
  game.obstacles = [{ x: 1240, y: 1000, radius: 20 }];
  game._burstGrenade(bullet); near(blocked.hp, 922);
  leaving.y = 1150; game._updateEvolutionEffects(.55);
  near(blocked.hp, 922); near(leaving.hp, 922); near(open.hp, 922 - 78 * .45);
});

test('EMP resonance creates one proportional aftershock and queued aftershocks freeze while paused', () => {
  const game = arena(); equip(game, 'grenade-echo'); const bullet = fire(game);
  bullet.x = 1100; game.useSkill(); assert.equal(game.evolutionState.echoes.length, 1);
  assert.equal(game.discoveredSecrets.has('fuse-resonance'), true);
  const echo = game.evolutionState.echoes[0]; near(echo.damage, bullet.damage * .45); assert.equal(echo.radius, 110);
  for (const phase of ['paused', 'upgrade', 'tactic']) { game.phase = phase; game.update(.033); near(echo.remaining, .55); }
  game.phase = 'playing'; advance(game, .55, 60, dt => game.update(dt)); assert.equal(game.evolutionState.echoes.length, 0);
});

test('aftershock queue is bounded without evicting earlier visible blasts', () => {
  const game = arena(); equip(game, 'grenade-echo');
  for (let index = 0; index < 10; index++) {
    game.ammoByWeapon[3] = 5; const bullet = fire(game); bullet.x = 1200 + index; game._burstGrenade(bullet);
  }
  assert.equal(game.evolutionState.echoes.length, 8);
  assert.deepEqual(game.evolutionState.echoes.map(echo => echo.x), [1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207]);
});

test('lethal grenade, chain or aftershock stops all later evolution damage and pending effects', () => {
  for (const cause of ['grenade', 'chain', 'echo']) {
    const game = arena(); equip(game, cause === 'chain' ? 'assault-chain' : 'grenade-echo');
    const boss = sturdy(game, 1100, 1000, 'boss'); boss.hp = 1;
    const survivor = sturdy(game, 1100, 1080);
    if (cause === 'grenade') { const bullet = fire(game); bullet.x = 1100; game._burstGrenade(bullet); }
    else if (cause === 'chain') { const direct = sturdy(game, 1100, 900); game._applyAmmoEffect(fire(game), direct); }
    else {
      game.evolutionState.echoes = [{ x: 1100, y: 1000, radius: 110, damage: 40, remaining: .01, evolutionId: game.evolutionId }, { x: 1100, y: 1080, radius: 110, damage: 40, remaining: .01, evolutionId: game.evolutionId }];
      game._updateEvolutionEffects(.01);
    }
    assert.equal(game.phase, 'won'); near(survivor.hp, 1000); assert.equal(game.evolutionState.echoes.length, 0);
    const events = game.drainEvents(), terminal = events.findIndex(event => event.type === 'win');
    assert.ok(terminal >= 0); assert.ok(!events.slice(terminal + 1).some(event => event.type === 'hit' || event.type === 'arc' || event.type === 'evolution-trigger'));
  }
});

test('death and trial clear remove pending aftershocks and breach readiness without forgetting the chosen evolution', () => {
  for (const trial of [false, true]) {
    const game = arena(trial ? { mode: 'trial', seed: 11 } : {}); equip(game, 'grenade-echo');
    game.evolutionState = { breachTimer: 1, echoes: [{ x: 1200, y: 1000, radius: 110, damage: 40, remaining: .3 }] };
    if (trial) { game.trial.status = 'combat'; game.trial.spawned = game.trial.quota; game._finishTrialWave(); }
    else { game.player.hp = 1; game.player.invulnerable = 0; game._damagePlayer(10); }
    assert.deepEqual(game.evolutionState, { breachTimer: 0, echoes: [] });
    assert.equal(game.evolutionId, 'grenade-echo');
  }
});

test('twin blades cost one round, split by twenty degrees and retain independent return bonuses', () => {
  const game = arena(); equip(game, 'boomerang-twin'); const ammo = game.ammoByWeapon[4]; fire(game);
  assert.equal(game.bullets.length, 2); assert.equal(game.ammoByWeapon[4], ammo - 1);
  const [left, right] = game.bullets;
  near(Math.atan2(left.vy, left.vx), -Math.PI / 18); near(Math.atan2(right.vy, right.vx), Math.PI / 18);
  for (const blade of game.bullets) { near(blade.damage, 42 * .7); game._returnBlade(blade); near(blade.damage, 42 * .7 * 1.6); }
  game._returnBlade(left, true); near(left.damage, 42 * .7 * 1.6 * 1.35); near(right.damage, 42 * .7 * 1.6);
});

test('both twin blades may relay once but share the existing two-round rebound recovery quota', () => {
  const game = arena(); equip(game, 'boomerang-twin'); fire(game);
  const blades = [...game.bullets]; game.player.dashTimer = .1;
  for (const blade of blades) { game._returnBlade(blade, true); blade.x = 1000; blade.y = 1000; blade.reboundHit = true; }
  const ammo = game.ammoByWeapon[4]; game._updateBullets(.01, .1);
  assert.ok(blades.every(blade => blade.relayCount === 1 && !blade.returning));
  for (const blade of blades) near(blade.damage, 42 * .7 * 1.2);
  assert.equal(game.ammoByWeapon[4], ammo);
  game.player.dashTimer = 0;
  for (const blade of blades) { game._returnBlade(blade, true); blade.x = 1000; blade.y = 1000; blade.reboundHit = true; }
  game._updateBullets(.01); assert.equal(game.ammoByWeapon[4], ammo);
  for (let wave = 0; wave < 2; wave++) {
    game.ammoByWeapon[4] = 3; fire(game);
    for (const blade of game.bullets) { game._returnBlade(blade, true); blade.x = 1000; blade.y = 1000; blade.reboundHit = true; }
    game._updateBullets(.01);
    assert.equal(game.ammoByWeapon[4], wave === 0 ? 4 : 2);
  }
  assert.equal(game.bladeRecoveryUsed, 2);
});
