'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WEAPONS, CAMPAIGN_AWAKENINGS } = require('../action-engine.js');

function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }
function clearStage(game) { game._spawnBoss(); game._damageEnemy(game.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0), 1e9); }
function advance(game, seconds, input = {}) { for (let time = 0; time < seconds - 1e-9; time += 1 / 60) game.update(Math.min(1 / 60, seconds - time), input); }
function awakened(id) {
  const choice = CAMPAIGN_AWAKENINGS.find(item => item.id === id);
  const game = new Game({ mode: 'campaign', doctrineId: choice.doctrineId, seed: 2 }); game.start(); clearStage(game);
  assert.equal(game.chooseCampaignRoute(game.campaign.routeChoices[0].mapId, 'repair', id), true);
  while (game.phase === 'upgrade') game.chooseUpgrade(game.upgradeChoices[0].id);
  game.obstacles = []; game.enemies = []; game.bullets = []; game.hazards = [];
  game.relays = []; game.contracts = []; game.encounters = []; game.crates = [];
  game.spawnTimer = Infinity; game.breathingTimer = 100; game.sectorThreat.timer = Infinity;
  Object.assign(game.player, { x: 1000, y: 1000, angle: 0, critChance: 0 }); game.drainEvents();
  return game;
}
function perfectReload(game) {
  const index = game.player.weapon; game.ammoByWeapon[index] = 1;
  assert.equal(game.reload(), true);
  game.reloadByWeapon[index] = game.reloadDurationByWeapon[index] * .38;
  assert.equal(game.reload(), true);
}
function eventStages(game) { return game.drainEvents().filter(event => event.type === 'awakening-trigger').map(event => event.stage); }
function enemyBullet(game, x = game.player.x + 60, y = game.player.y) {
  const bullet = { id: game._id(), owner: 'enemy', x, y, radius: 3, vx: 0, vy: 0, damage: 8, lifetime: 9 };
  game.bullets.push(bullet); return bullet;
}

test('awakening catalog provides two distinct described branches for each doctrine', () => {
  assert.equal(CAMPAIGN_AWAKENINGS.length, 6); assert.equal(new Set(CAMPAIGN_AWAKENINGS.map(item => item.id)).size, 6);
  for (const doctrineId of ['skirmisher', 'marksman', 'conductor']) assert.equal(CAMPAIGN_AWAKENINGS.filter(item => item.doctrineId === doctrineId).length, 2);
  for (const item of CAMPAIGN_AWAKENINGS) for (const key of ['title', 'icon', 'color', 'description', 'playHint']) assert.ok(item[key]);
});

test('first rest requires an explicit matching awakening and invalid choices do not mutate supplies or IDs', () => {
  const game = new Game({ mode: 'campaign', doctrineId: 'skirmisher', seed: 2 }); game.start(); clearStage(game);
  const route = game.campaign.routeChoices[0].mapId;
  const before = JSON.stringify({ campaign: game.campaign, player: game.player, nextId: game.nextId, events: game.events, map: game.map });
  for (const id of [undefined, null, '', 'unknown', 'mag-relay', 'charged-pulse']) {
    assert.equal(game.chooseCampaignRoute(route, 'repair', id), false);
    assert.equal(JSON.stringify({ campaign: game.campaign, player: game.player, nextId: game.nextId, events: game.events, map: game.map }), before);
  }
  assert.equal(game.chooseCampaignRoute(route, 'repair', 'return-dash'), true);
  assert.equal(game.campaign.awakeningId, 'return-dash');
  assert.equal(game.drainEvents().filter(event => event.type === 'awakening-acquired').length, 1);
  const hp = game.player.maxHp;
  assert.equal(game.chooseCampaignRoute(route, 'repair', 'return-dash'), false); assert.equal(game.player.maxHp, hp);
});

test('second rest keeps the chosen branch and clears temporary windows before the final arena', () => {
  const game = awakened('return-dash'); game.dash({ x: 1, y: 0 }); clearStage(game);
  assert.equal(game.awakeningState.returnAnchor, null); assert.equal(game.awakeningState.returning, false);
  const before = JSON.stringify(game.campaign);
  assert.equal(game.chooseCampaignRoute('nexus', 'power', 'slide-reload'), false); assert.equal(JSON.stringify(game.campaign), before);
  assert.equal(game.chooseCampaignRoute('nexus', 'power'), true); assert.equal(game.campaign.awakeningId, 'return-dash');
  assert.equal(game.drainEvents().filter(event => event.type === 'awakening-acquired').length, 0);
});

test('return dash offers exactly one collision-respecting short return without resetting the cooldown', () => {
  const game = awakened('return-dash'); const start = game.player.x;
  assert.equal(game.dash({ x: 1, y: 0 }), true); assert.equal(game.dash({ x: -1, y: 0 }), false);
  advance(game, .2); near(game.player.x, start + 162);
  const cooldown = game.player.dashCooldown;
  game.obstacles = [{ x: start + 81, y: game.player.y, radius: 31 }];
  assert.equal(game.dash({ x: 1, y: 0 }), true); near(game.player.dashCooldown, cooldown);
  assert.equal(game.awakeningState.returnAnchor, null); assert.equal(game.awakeningState.returning, true);
  advance(game, .2); assert.ok(game.player.x >= start + 81 + 31 + game.player.radius - 1e-7);
  assert.equal(game.dash({ x: 1, y: 0 }), false); assert.equal(game.awakeningState.returnAnchor, null);
  const stages = eventStages(game); assert.equal(stages.filter(stage => stage === 'anchor').length, 1); assert.equal(stages.filter(stage => stage === 'return').length, 1);
});

test('return window expires, cannot return while motionless and never repeats phase-mag or decoy bonuses', () => {
  const game = awakened('return-dash'); game.relics = ['phase-mag']; game.tacticId = 'decoy-dash'; game.ammoByWeapon[0] = 10;
  game.dash({ x: 1, y: 0 }); assert.equal(game.dash({ x: -1, y: 0 }), false);
  const ammo = game.ammoByWeapon[0]; advance(game, .2); const decoy = game.tactical.decoy;
  assert.equal(game.dash({ x: -1, y: 0 }), true); assert.equal(game.ammoByWeapon[0], ammo); assert.equal(game.tactical.decoy, decoy);
  advance(game, 2.61); assert.equal(game.awakeningState.returnAnchor, null); assert.equal(game.dash({ x: 1, y: 0 }), true);
  advance(game, 1.41); assert.equal(game.awakeningState.returnAnchor, null); assert.equal(game.dash({ x: -1, y: 0 }), false);
});

test('a return anchor at the player does not block a legitimately reset normal dash', () => {
  const game = awakened('return-dash'); game.dash({ x: 1, y: 0 }); advance(game, .2);
  Object.assign(game.player, { x: game.awakeningState.returnAnchor.x, y: game.awakeningState.returnAnchor.y });
  game.reactor.charge = game.reactor.maxCharge; assert.equal(game.activateOverdrive(), true); assert.equal(game.player.dashCooldown, 0);
  assert.equal(game.dash({ x: 1, y: 0 }), true); assert.equal(game.awakeningState.returning, false); assert.ok(game.awakeningState.returnAnchor);
});

test('slide reload completes only the current active reload as ordinary ammunition', () => {
  const game = awakened('slide-reload'); game.relics = ['precision-burst']; game.tacticId = 'reload-mine';
  game.ammoByWeapon[0] = 1; game.reload(); game.switchWeapon(1); game.ammoByWeapon[1] = 1; game.reload();
  assert.equal(game.dash({ x: 1, y: 0 }), true);
  assert.equal(game.reloadByWeapon[1], 0); assert.equal(game.ammoByWeapon[1], WEAPONS[1].magSize);
  assert.ok(game.reloadByWeapon[0] > 0); assert.equal(game.overchargedByWeapon[1], 0);
  assert.equal(game.tactical.mine, null); assert.equal(game.bullets.length, 0); assert.equal(game.reactor.charge, 0);
  const events = game.drainEvents(); assert.equal(events.some(event => event.type === 'reload-perfect'), false);
  assert.equal(events.find(event => event.type === 'reload-complete').perfect, false);
});

test('slide reload does not reward an unavailable dash or a weapon without a reload', () => {
  const game = awakened('slide-reload'); game.ammoByWeapon[0] = 2; game.reload(); game.player.dashCooldown = 1;
  const timer = game.reloadByWeapon[0]; assert.equal(game.dash({ x: 1, y: 0 }), false); assert.equal(game.reloadByWeapon[0], timer);
  game.player.dashCooldown = 0; game.switchWeapon(1); game.dash({ x: 1, y: 0 });
  assert.equal(game.reloadByWeapon[0], timer); assert.equal(eventStages(game).includes('slide'), false);
});

test('magazine relay spends one precision window on a real switch and strengthens only the first shot', () => {
  const game = awakened('mag-relay'); perfectReload(game); assert.equal(game.awakeningState.relayTimer, 3);
  assert.equal(game.switchWeapon(0), false); assert.equal(game.awakeningState.relayTimer, 3);
  assert.equal(game.switchWeapon(2), true); assert.equal(game.fireTimer, 0); assert.equal(game.overchargedByWeapon[2], 1);
  assert.equal(game.awakeningState.relayTimer, 0); const ammo = game.ammoByWeapon[2]; game._shoot();
  near(game.bullets[0].damage, 86 * 1.5); assert.equal(game.ammoByWeapon[2], ammo - 1); assert.equal(game.overchargedByWeapon[2], 0);
  game.fireTimer = 0; game._shoot(); near(game.bullets[1].damage, 86);
  game.switchWeapon(1); assert.equal(game.overchargedByWeapon[1], 0); assert.ok(game.fireTimer >= .16);
});

test('magazine relay preserves existing full enhancement and does not refill or finish another weapon reload', () => {
  const game = awakened('mag-relay'); game.overchargedByWeapon[2] = 5; perfectReload(game); game.switchWeapon(2);
  assert.equal(game.overchargedByWeapon[2], 5);
  game.switchWeapon(1); game.ammoByWeapon[1] = 1; game.reload(); game.switchWeapon(0); perfectReload(game);
  const timer = game.reloadByWeapon[1]; game.switchWeapon(1);
  assert.equal(game.ammoByWeapon[1], 1); assert.equal(game.reloadByWeapon[1], timer);
  game._shoot(); assert.equal(game.bullets.length, 0);
});

test('magazine relay expires and ordinary or missed reloads never prime it', () => {
  const game = awakened('mag-relay'); perfectReload(game); advance(game, 3.01); game.switchWeapon(2);
  assert.equal(game.overchargedByWeapon[2], 0); assert.ok(game.fireTimer >= .16);
  game.ammoByWeapon[2] = 1; game.reload(); assert.equal(game.reload(), false); advance(game, 2.2);
  assert.equal(game.awakeningState.relayTimer, 0); assert.equal(eventStages(game).filter(stage => stage === 'relay').length, 0);
});

test('relay first-shot enhancement survives a general refill and is consumed by a real overdrive shot', () => {
  const game = awakened('mag-relay'); perfectReload(game); game.switchWeapon(2);
  game.reactor.charge = game.reactor.maxCharge; assert.equal(game.activateOverdrive(), true);
  assert.equal(game.overchargedByWeapon[0], 0); assert.equal(game.overchargedByWeapon[2], 1);
  const ammo = game.ammoByWeapon[2]; game._shoot(); near(game.bullets[0].damage, 86 * 1.5 * 1.2);
  assert.equal(game.ammoByWeapon[2], ammo); assert.equal(game.overchargedByWeapon[2], 0); assert.equal(game.awakeningState.relayPending[2], false);
  game.fireTimer = 0; game._shoot(); near(game.bullets[1].damage, 86 * 1.2);
});

test('precision interrupt acts on a real first hit, cancels its hazard and is limited to one enemy in four seconds', () => {
  const game = awakened('interrupt-round'); const first = game.spawnEnemy('tank', { x: 1080, y: 1000 }), second = game.spawnEnemy('tank', { x: 1170, y: 1000 });
  first.windup = 1; first.attackKind = 'shot'; first.chargeTimer = .4;
  game.hazards = [{ sourceId: first.id }, { sourceId: second.id }];
  game.switchWeapon(2); game.fireTimer = 0; perfectReload(game); game._shoot(); game._updateBullets(.15);
  assert.equal(first.stunTimer, .8); assert.equal(first.windup, 0); assert.equal(first.chargeTimer, 0); assert.equal(first.attackKind, '');
  assert.equal(second.stunTimer, 0); assert.deepEqual(game.hazards, [{ sourceId: second.id }]);
  assert.equal(game.awakeningState.interruptCooldown, 4); assert.equal(eventStages(game).filter(stage => stage === 'interrupt').length, 1);
});

test('precision interrupt never controls bosses, reactors, anchors or nests', () => {
  const game = awakened('interrupt-round');
  for (const type of ['boss', 'reactor', 'anchor', 'nest']) {
    const enemy = game.spawnEnemy(type, { x: 1500, y: 1000 }); game._interruptAwakening({ overcharged: true }, enemy);
    assert.equal(enemy.stunTimer, 0); assert.equal(game.awakeningState.interruptCooldown, 0);
  }
  const crawler = game.spawnEnemy('crawler', { x: 1500, y: 1000 }); game._interruptAwakening({ overcharged: false }, crawler);
  assert.equal(crawler.stunTimer, 0); assert.equal(eventStages(game).length, 0);
});

test('precision interrupt cannot pass through rock and applies to the first ordinary grenade explosion target', () => {
  const game = awakened('interrupt-round'); game.obstacles = [{ x: 1060, y: 1000, radius: 24 }];
  const enemy = game.spawnEnemy('tank', { x: 1130, y: 1000 }); perfectReload(game); game._shoot(); game._updateBullets(.2);
  assert.equal(enemy.stunTimer, 0); assert.equal(game.awakeningState.interruptCooldown, 0);
  game.obstacles = []; const other = game.spawnEnemy('tank', { x: 1190, y: 1000 });
  game._burstGrenade({ owner: 'player', x: 1150, y: 1000, blastRadius: 135, damage: 2, overcharged: true, color: '#fff', lifetime: 1 });
  assert.equal(enemy.stunTimer, .8); assert.equal(other.stunTimer, 0); assert.equal(game.awakeningState.interruptCooldown, 4);
});

test('mobile field waits for each tick, clears at most one enemy projectile and leaves friendly ammunition intact', () => {
  const game = awakened('mobile-field'); game.useSkill(); const a = enemyBullet(game), b = enemyBullet(game);
  const friendly = { ...enemyBullet(game), owner: 'player' }; game.bullets[game.bullets.length - 1] = friendly;
  game._updateAwakenings(.19); assert.equal(a.lifetime, 9); game._updateAwakenings(.01);
  assert.equal(a.lifetime, 0); assert.equal(b.lifetime, 9); assert.equal(friendly.lifetime, 9); assert.equal(game.awakeningState.field.captured, 1);
  game._updateAwakenings(.2); assert.equal(b.lifetime, 0); assert.equal(friendly.lifetime, 9);
});

test('mobile field follows movement, deals no damage and vanishes after eight captures or duration', () => {
  const game = awakened('mobile-field'); game.useSkill(); game.player.x += 400;
  const enemy = game.spawnEnemy('tank', { x: game.player.x + 60, y: game.player.y }); const hp = enemy.hp;
  const distant = enemyBullet(game, 1060, 1000); const nearby = Array.from({ length: 9 }, () => enemyBullet(game));
  for (let tick = 0; tick < 8; tick++) game._updateAwakenings(.2);
  assert.equal(nearby.filter(bullet => bullet.lifetime === 0).length, 8); assert.equal(nearby[8].lifetime, 9); assert.equal(distant.lifetime, 9);
  assert.equal(game.awakeningState.field, null); assert.equal(enemy.hp, hp);
  const next = awakened('mobile-field'); next.useSkill(); advance(next, 2.41); assert.equal(next.awakeningState.field, null);
});

test('charged pulse can be manually released once during cooldown at ordinary strength', () => {
  const game = awakened('charged-pulse'); const enemy = game.spawnEnemy('anchor', { x: 1230, y: 1000 }); const hp = enemy.hp;
  assert.equal(game.useSkill(), true); assert.equal(enemy.hp, hp); assert.ok(game.awakeningState.charge); assert.ok(game.player.skillCooldown > 0);
  const cooldown = game.player.skillCooldown; assert.equal(game.useSkill(), true); near(enemy.hp, hp - 65); near(game.player.skillCooldown, cooldown);
  assert.equal(game.awakeningState.charge, null); assert.equal(game.useSkill(), false);
  const events = game.drainEvents(); const pulses = events.filter(event => event.type === 'pulse'); assert.equal(pulses.length, 1); assert.equal(pulses[0].radius, 245);
  assert.equal(events.find(event => event.type === 'awakening-trigger' && event.stage === 'release').charged, false);
});

test('fully charged pulse resolves automatically at the current location with exactly its advertised radius and damage', () => {
  const game = awakened('charged-pulse'); const enemy = game.spawnEnemy('anchor', { x: 1600, y: 1000 }); const hp = enemy.hp;
  game.useSkill(); game.player.x = 1300; advance(game, .89); assert.equal(enemy.hp, hp); assert.ok(game.awakeningState.charge);
  advance(game, .01); near(enemy.hp, hp - 65 * 1.25); assert.equal(game.awakeningState.charge, null);
  const events = game.drainEvents(), pulse = events.find(event => event.type === 'pulse'); near(pulse.radius, 245 * 1.2); near(pulse.x, 1300);
  assert.equal(events.find(event => event.type === 'awakening-trigger' && event.stage === 'release').charged, true);
  assert.equal(game.player.skillDamage, 65); assert.equal(game.player.skillRadius, 245);
});

test('charged pulse chooses a remote grenade on release and preserves fuse resonance and the echo relic', () => {
  const game = awakened('charged-pulse'); game.switchWeapon(3); game.relics = ['echo-pulse'];
  const grenade = { id: game._id(), owner: 'player', kind: 'grenade', x: 1450, y: 1000, lifetime: 1, damage: 20, blastRadius: 135, color: '#fff' };
  const enemy = game.spawnEnemy('anchor', { x: 1700, y: 1000 }); const hp = enemy.hp;
  game.useSkill(); game.bullets.push(grenade); assert.equal(game.skillTarget().remote, true); game.useSkill();
  const pulse = game.drainEvents().find(event => event.type === 'pulse'); assert.equal(pulse.x, 1450); assert.equal(pulse.remote, true);
  assert.equal(grenade.exploded, true); near(grenade.blastRadius, 135 * 1.35); near(enemy.hp, hp - 65);
  assert.equal(game.discoveredSecrets.has('fuse-resonance'), true); assert.equal(game.echoBursts.length, 1); near(game.echoBursts[0].damage, 65 * .65);
});

test('awakening timers freeze while not playing and terminal transitions cancel pending effects', () => {
  const game = awakened('charged-pulse'); game.useSkill(); const charge = game.awakeningState.charge.remaining;
  game.phase = 'paused'; game.update(.25); assert.equal(game.awakeningState.charge.remaining, charge); game.phase = 'playing';
  game.player.hp = 1; game.player.invulnerable = 0; game._damagePlayer(10);
  assert.equal(game.phase, 'lost'); assert.equal(game.awakeningState.charge, null); game.update(.25); assert.equal(game.drainEvents().filter(event => event.type === 'pulse').length, 0);
  const win = awakened('charged-pulse'); win.useSkill(); clearStage(win); assert.equal(win.phase, 'campaign-rest'); assert.equal(win.awakeningState.charge, null);
  assert.equal(win.drainEvents().filter(event => event.type === 'pulse').length, 0);
});

test('resetting a run removes its awakening, and ordinary expedition and trial keep immediate EMP', () => {
  const game = awakened('mag-relay'); perfectReload(game); game.reset('frontier');
  assert.equal(game.campaign, null); assert.equal(game.awakeningState.relayTimer, 0);
  for (const mode of ['expedition', 'trial']) {
    const ordinary = new Game({ mode, doctrineId: 'conductor', awakeningId: 'charged-pulse' }); ordinary.start(); ordinary.useSkill();
    assert.equal(ordinary.awakeningState.charge, null); assert.equal(ordinary.drainEvents().filter(event => event.type === 'pulse').length, 1);
  }
});
