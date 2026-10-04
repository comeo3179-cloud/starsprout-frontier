'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAPS, WEAPONS, UPGRADES, ENEMIES, CAMPAIGN_DOCTRINES, CAMPAIGN_CRISES, CAMPAIGN_NEXUS } = require('../action-engine.js');

function campaign(doctrineId = 'skirmisher', seed = 13) {
  const game = new Game({ mode: 'campaign', doctrineId, seed }); game.start();
  return game;
}
function clearStage(game) {
  game._spawnBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0);
  game._damageEnemy(boss, 1e9);
}
function awakening(game) { return game.campaign.stage === 1 ? { skirmisher: 'slide-reload', marksman: 'interrupt-round', conductor: 'mobile-field' }[game.campaign.doctrineId] : undefined; }
function travel(game, supply = 'power') {
  clearStage(game);
  assert.equal(game.phase, 'campaign-rest');
  assert.equal(game.chooseCampaignRoute(game.campaign.routeChoices[0].mapId, supply, awakening(game)), true);
  while (game.phase === 'upgrade') game.chooseUpgrade(game.upgradeChoices[0].id);
}
function nexus() { const game = campaign(); travel(game); travel(game); game.drainEvents(); return game; }
function shoot(game, input = {}) {
  game.player.critChance = 0; game.fireTimer = 0; game.bullets = [];
  game.update(1 / 60, { ...input, shoot: true });
  return game.bullets.find(bullet => bullet.owner === 'player');
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }

test('campaign is opt-in and the five standard maps and seeded trial pool remain separate', () => {
  assert.equal(MAPS.length, 5); assert.equal(MAPS.some(map => map.id === 'nexus'), false);
  assert.equal(CAMPAIGN_DOCTRINES.length, 3); assert.equal(CAMPAIGN_CRISES.length, 3);
  const ordinary = new Game({ doctrineId: 'marksman', mapId: 'storm' });
  assert.equal(ordinary.mode, 'expedition'); assert.equal(ordinary.campaign, null); assert.equal(ordinary.player.reloadMultiplier, 1);
  const game = new Game({ mode: 'campaign', seed: -1, doctrineId: 'unknown', mapId: 'unknown' });
  assert.equal(game.campaign.seed, 4294967295); assert.equal(game.campaign.doctrineId, 'skirmisher');
  assert.equal(game.map.id, 'frontier'); assert.equal(game.phase, 'ready'); assert.equal(game.player.maxHp, 100);
  assert.equal(new Game({ mode: 'trial', seed: 1 }).trial.bossMapId, 'foundry');
});

test('skirmisher rewards actual movement and not pushing against the world edge', () => {
  const game = campaign(); game.obstacles = [];
  near(shoot(game).damage, 16);
  near(shoot(game, { moveX: 1 }).damage, 16 * 1.18);
  game.player.x = game.player.radius + 20;
  near(shoot(game, { moveX: -1 }).damage, 16);
  game.player.x = 900; game.obstacles = [{ x: 900, y: game.player.y - 60, radius: 44 }];
  near(shoot(game, { moveY: -1, aimX: 1500, aimY: game.player.y }).damage, 16);
});

test('marksman trades slower reloads for exactly one 50 percent strengthened magazine', () => {
  const game = campaign('marksman');
  game.ammoByWeapon[0] = 10; assert.equal(game.reload(), true);
  near(game.reloadDurationByWeapon[0], WEAPONS[0].reloadTime * 1.2);
  game.reloadByWeapon[0] = game.reloadDurationByWeapon[0] * .38;
  assert.equal(game.reload(), true); assert.equal(game.overchargedByWeapon[0], 30);
  near(shoot(game).damage, 24); assert.equal(game.overchargedByWeapon[0], 29);
  game.overchargedByWeapon[0] = 0;
  near(shoot(game).damage, 16);
});

test('conductor has shorter wider EMP and a weapon-only damage cost', () => {
  const game = campaign('conductor');
  near(game.player.skillCooldownMax, 9.1); assert.equal(game.player.skillRadius, 245);
  assert.equal(game.player.skillDamage, 65); assert.equal(game.player.maxHp, 120);
  near(shoot(game).damage, 16 * .88);
  game.enemies = []; const enemy = game.spawnEnemy('tank', { x: game.player.x + 230, y: game.player.y });
  const hp = enemy.hp; assert.equal(game.useSkill(), true);
  near(enemy.hp, hp - 65 * .8);
});

test('campaign seeds reproducibly assign different crises to unvisited candidate sectors', () => {
  const a = campaign('marksman', 912), b = campaign('marksman', 912);
  clearStage(a); clearStage(b);
  assert.deepEqual(a.campaign.routeChoices, b.campaign.routeChoices);
  assert.deepEqual(a.campaign.routeChoices.map(route => route.mapId), ['foundry', 'frost', 'storm', 'ruins']);
  assert.equal(new Set(a.campaign.routeChoices.map(route => route.crisisId)).size, 3);
  assert.equal(a.campaign.routeChoices.some(route => route.mapId === 'frontier'), false);
});

test('cross-sector migration preserves explicit permanent build fields and cumulative scores', () => {
  const game = campaign('marksman');
  Object.assign(game.player, { maxHp: 165, hp: 90, speed: 264, level: 6, xp: 8, xpNeeded: 190, credits: 91,
    damageMultiplier: 1.72, fireRateMultiplier: 1.42, reloadMultiplier: .936, magazineMultiplier: 1.5,
    resistance: .24, critChance: .17, lifeOnKill: 2, dashMultiplier: 1.1, dashCooldownMax: 2.184,
    skillCooldownMax: 11.44, skillRadius: 240, skillDamage: 105, magnetRadius: 210,
    arcRounds: true, shatterRounds: true, returnEdge: true, weapon: 4 });
  game.upgradeStacks = { arc: 1, damage: 4, shatter: 1 }; game.evolutionId = 'assault-chain';
  game.relics = ['phase-mag', 'echo-pulse']; game.tacticId = 'reload-mine';
  game.elapsed = 420; game.kills = 70; game.score = 3000; game.combo.best = 28;
  game.reactor.captures = 17; game.reactor.detonations = 22;
  clearStage(game);
  const nextId = game.nextId, score = game.score, kills = game.kills;
  const stats = Object.fromEntries(['speed', 'level', 'xp', 'xpNeeded', 'credits', 'reloadMultiplier', 'resistance', 'lifeOnKill', 'weapon', 'skillDamage'].map(key => [key, game.player[key]]));
  const route = game.campaign.routeChoices[0];
  assert.equal(game.chooseCampaignRoute(route.mapId, 'mobility', awakening(game)), true);
  for (const key of Object.keys(stats)) assert.equal(game.player[key], stats[key], key);
  assert.equal(game.player.hp, 112, 'Kill recovery and universal +20 recovery carry forward once');
  assert.equal(game.player.maxHp, 165); near(game.player.skillCooldownMax, 11.44 * .88);
  assert.equal(game.elapsed, 420); assert.equal(game.kills, kills); assert.equal(game.score, score);
  assert.equal(game.combo.best, 28); assert.equal(game.reactor.captures, 17); assert.equal(game.reactor.detonations, 22);
  assert.deepEqual(game.upgradeStacks, { arc: 1, damage: 4, shatter: 1 }); assert.equal(game.evolutionId, 'assault-chain');
  assert.deepEqual(game.relics, ['phase-mag', 'echo-pulse']); assert.equal(game.tacticId, 'reload-mine');
  assert.equal(game.campaign.stage, 2); assert.equal(game.campaign.crisisId, route.crisisId); assert.equal(game.campaign.stageElapsed, 0);
  assert.ok(game.relays.every(item => item.id >= nextId));
  assert.deepEqual(game.ammoByWeapon, WEAPONS.map(weapon => Math.ceil(weapon.magSize * 1.5)));
});

test('safe rest clears every short-lived combat effect and freezes time', () => {
  const game = campaign();
  game.evolutionState = { breachTimer: 2, echoes: [{ remaining: .2 }] };
  game.tactical = { decoy: { remaining: 2 }, mine: { remaining: 4 }, cooldown: 3 };
  game.echoBursts = [{ remaining: .2 }]; game.railCorridor = { remaining: .8 }; game.iceChaseIds.add(987);
  game.reactor.timer = 4; game.reactor.charge = 72; game.combo.count = 8; game.combo.timer = 3;
  Object.assign(game.player, { reversalAmmo: 5, reversalTimer: 2, slowTimer: 1, dashTimer: .12, iceChaseReady: true });
  game.bullets = [{ id: 20000, owner: 'enemy', lifetime: 3 }]; game.hazards = [{ id: 20001, remaining: 2 }];
  game.pickups = [{ type: 'xp', value: 7 }, { type: 'credits', value: 9 }];
  clearStage(game);
  assert.equal(game.phase, 'campaign-rest'); assert.equal(game.player.xp, 7); assert.equal(game.player.credits, 9);
  for (const key of ['enemies', 'bullets', 'hazards', 'echoBursts', 'pickups']) assert.equal(game[key].length, 0, key);
  assert.deepEqual(game.evolutionState, { breachTimer: 0, echoes: [] }); assert.equal(game.tactical.mine, null); assert.equal(game.tactical.cooldown, 0);
  assert.equal(game.railCorridor, null); assert.equal(game.iceChaseIds.size, 0); assert.equal(game.reactor.timer, 0); assert.equal(game.reactor.charge, 0);
  assert.equal(game.player.reversalAmmo, 0); assert.equal(game.player.dashTimer, 0); assert.equal(game.player.slowTimer, 0);
  const elapsed = game.elapsed; game.update(.25, { moveX: 1, shoot: true }); assert.equal(game.elapsed, elapsed);
  assert.equal(game.drainEvents().filter(event => event.type === 'win').length, 0);
});

test('crisis stat effects change only the advertised classes and preserve objective health', () => {
  const game = campaign();
  game.campaign.crisisId = 'armored';
  for (const type of ['crawler', 'spitter', 'tank', 'nest']) {
    const enemy = game.spawnEnemy(type, { x: 1300, y: 900 });
    assert.equal(enemy.maxHp, Math.round(ENEMIES[type].hp * 1.2));
  }
  for (const type of ['boss', 'reactor', 'anchor']) assert.equal(game.spawnEnemy(type, { x: 1300, y: 900 }).maxHp, ENEMIES[type].hp);
  game.campaign.crisisId = 'pursuit';
  near(game.spawnEnemy('charger', { x: 1300, y: 900 }).speed, ENEMIES.charger.speed * 1.14);
  assert.equal(game.spawnEnemy('boss', { x: 1300, y: 900 }).speed, ENEMIES.boss.speed);
});

test('reinforcement crisis pauses for recovery and side events and never exceeds enemy cap', () => {
  const game = campaign(); game.campaign.crisisId = 'reinforcements'; game.spawnTimer = Infinity;
  game.breathingTimer = 6; game.campaign.reinforcementTimer = .1;
  game._spawnDirector(.2); assert.equal(game.campaign.reinforcementTimer, .1);
  game.breathingTimer = 0; game.encounters[0].status = 'active'; game._spawnDirector(.2);
  assert.equal(game.campaign.reinforcementTimer, .1);
  game.encounters[0].status = 'idle'; game._spawnDirector(.2);
  assert.equal(game.enemies.length, 2); assert.equal(game.campaign.reinforcementTimer, 20);
  assert.equal(game.drainEvents().filter(event => event.type === 'campaign-crisis').length, 1);
  while (game.enemies.length < 55) game.spawnEnemy('crawler', { x: 1300, y: 900 });
  game.campaign.reinforcementTimer = 0; game._spawnDirector(.2); assert.equal(game.enemies.length, 55);
});

test('new sectors restart their pressure clock while total campaign duration continues', () => {
  const game = campaign(); game.elapsed = 900; game.campaign.stageElapsed = 900;
  travel(game, 'repair');
  assert.equal(game.campaign.stageElapsed, 0); assert.equal(game.elapsed, 900);
  const enemy = game.spawnEnemy('crawler', { x: 1300, y: 900 });
  assert.ok(enemy.hp <= Math.round(ENEMIES.crawler.hp * 1.2), 'Old elapsed must not raise new-sector health');
  game.update(.1); near(game.elapsed, 900.1); near(game.campaign.stageElapsed, .1);
  assert.equal(game.pressurePhase, 'recovery');
});

test('nexus route follows two distinct completed sectors and carries no extra crisis', () => {
  const game = nexus();
  assert.equal(game.map, CAMPAIGN_NEXUS); assert.equal(game.campaign.stage, 3); assert.equal(game.campaign.completedStages, 2);
  assert.equal(new Set(game.campaign.visited).size, 3); assert.equal(game.campaign.crisisId, '');
  assert.deepEqual(game.world, { width: 1800, height: 1400 }); assert.equal(game.relays.length, 0);
  assert.equal(game.enemies.filter(enemy => enemy.type === 'anchor').length, 2);
  assert.match(game.currentObjective, /能量锚 0\/2/);
});

test('nexus anchors apply a breakable nonabsolute shield and never respawn or award repeated kills', () => {
  const game = nexus(), boss = game.enemies.find(enemy => enemy.type === 'boss'), anchors = game.enemies.filter(enemy => enemy.type === 'anchor');
  boss.recoveryTimer = 0;
  game._damageEnemy(boss, 100); near(boss.hp, 5400 - 35);
  game._damageEnemy(anchors[0], 1000); assert.equal(boss.shielded, true); assert.match(game.currentObjective, /1\/2/);
  const kills = game.kills; game._damageEnemy(anchors[0], 1000); assert.equal(game.kills, kills);
  game._damageEnemy(anchors[1], 1000); assert.equal(boss.shielded, false); assert.equal(boss.recoveryTimer, 2);
  const hp = boss.hp; game._damageEnemy(boss, 100); near(boss.hp, hp - 115);
  assert.equal(game.pickups.length, 0, 'Stationary anchors do not drop resources');
  assert.equal(game.drainEvents().filter(event => event.type === 'nexus-shield-break').length, 1);
  game._updateBoss(boss, .01, 1, 0, 500); assert.equal(game.enemies.filter(enemy => enemy.type === 'anchor').length, 2);
});

test('nexus anchors stay stationary under pursuit, crowd separation, EMP pull and repulsor shots', () => {
  const game = nexus(), anchor = game.enemies.find(enemy => enemy.type === 'anchor');
  const position = { x: anchor.x, y: anchor.y };
  game.spawnEnemy('crawler', position); game._updateEnemies(.2);
  game.tacticId = 'gravity-pulse'; game.player.skillRadius = 500;
  game._pullTacticEnemies({ x: anchor.x + 200, y: anchor.y });
  game._applyAmmoEffect({ repulsor: true, vx: 100, vy: 0 }, anchor);
  assert.deepEqual({ x: anchor.x, y: anchor.y }, position);
  assert.equal(anchor.knockbackTimer, 0); assert.equal(anchor.speed, 0);
});

test('nexus three attacks have distinct dodgeable warnings and finite recovery windows', () => {
  const game = nexus(), boss = game.enemies.find(enemy => enemy.type === 'boss');
  boss.recoveryTimer = 0;
  for (const [count, kind, hazards] of [[0, 'nexus-lattice', 2], [1, 'nexus-collapse', 3], [2, 'nexus-ring', 0]]) {
    Object.assign(boss, { attackCount: count, attackTimer: 0, windup: 0 }); game.hazards = []; game.bullets = [];
    game._updateBoss(boss, .01, 0, 1, 200);
    assert.equal(boss.attackKind, kind); assert.ok(boss.windup >= 1.2); assert.equal(game.hazards.length, hazards);
    if (kind === 'nexus-lattice') assert.ok(game.hazards.every(hazard => hazard.type === 'lane' && hazard.remaining === 1.55));
    if (kind === 'nexus-collapse') assert.ok(game.hazards.every(hazard => hazard.type === 'blast' && hazard.remaining === 1.7));
    if (kind === 'nexus-ring') {
      assert.equal(game.bullets.length, 0); game._updateBoss(boss, 1.21, 0, 1, 200);
      assert.equal(game.bullets.length, 16); assert.equal(boss.recoveryTimer, 1.2);
    }
  }
});

test('nexus transition to second phase cancels earlier attacks but never restores a broken shield', () => {
  const game = nexus(), boss = game.enemies.find(enemy => enemy.type === 'boss');
  for (const anchor of game.enemies.filter(enemy => enemy.type === 'anchor')) game._damageEnemy(anchor, 1000);
  boss.recoveryTimer = 0; boss.attackTimer = 0; game._updateBoss(boss, .01, 0, 1, 300);
  assert.ok(game.hazards.length); boss.hp = 2600; game._updateBoss(boss, .01, 0, 1, 300);
  assert.equal(boss.stage, 2); assert.equal(boss.shielded, false); assert.equal(game.hazards.length, 0); assert.equal(boss.windup, 0);
});

test('final victory is emitted exactly once with no live threats, rewards or delayed damage', () => {
  const game = nexus(), boss = game.enemies.find(enemy => enemy.type === 'boss');
  game.evolutionState.echoes.push({ remaining: .1 });
  game._damageEnemy(boss, 1e9);
  assert.equal(game.phase, 'won'); assert.equal(game.campaign.completedStages, 3); assert.equal(game.campaign.stages.length, 3);
  assert.equal(game.campaign.status, 'complete'); assert.equal(game.enemies.length, 0); assert.equal(game.evolutionState.echoes.length, 0);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'win').length, 1); assert.equal(events.filter(event => event.type === 'campaign-complete').length, 1);
  const score = game.score; game._damageEnemy(boss, 1e9); game.update(1);
  assert.equal(game.score, score); assert.equal(game.drainEvents().length, 0);
  assert.equal(game.chooseCampaignRoute('frontier', 'repair'), false);
});

test('campaign defeat clears all pending attacks and prevents further progression', () => {
  const game = nexus(); game.player.invulnerable = 0; game.reactor.charge = 100;
  game._damagePlayer(9999);
  assert.equal(game.phase, 'lost'); assert.equal(game.campaign.status, 'failed'); assert.equal(game.campaign.completedStages, 2);
  assert.equal(game.enemies.length, 0); assert.equal(game.bullets.length, 0); assert.equal(game.hazards.length, 0); assert.equal(game.reactor.charge, 0);
  assert.equal(game.chooseCampaignRoute('nexus', 'repair'), false); assert.equal(game.activateOverdrive(), false);
});

test('same-frame bullets, area damage and delayed echoes stop at a campaign boss defeat', () => {
  for (const final of [false, true]) for (const source of ['bullet', 'grenade', 'echo', 'evolution', 'skill', 'arc']) {
    const game = final ? nexus() : campaign();
    if (!final) game._spawnBoss();
    const boss = game.enemies.find(enemy => enemy.type === 'boss');
    game.enemies = [boss]; game.obstacles = [];
    Object.assign(boss, { x: 900, y: 700, hp: 1, shielded: false, recoveryTimer: 0 });
    Object.assign(game.player, { x: 850, y: 700, skillDamage: 9999 });
    const bystander = game.spawnEnemy('crawler', { x: 910, y: 700 }); bystander.hp = 1;
    const kills = game.kills;
    if (source === 'bullet') {
      game.bullets = [{ id: game._id(), type: 'bullet', owner: 'player', x: 780, y: 700, vx: 1000, vy: 0, radius: 4, damage: 9999, lifetime: 1, pierce: 3, hitIds: [], arc: true }];
      game._updateBullets(.2);
    }
    if (source === 'grenade') game._burstGrenade({ x: 900, y: 700, blastRadius: 200, damage: 9999, lifetime: 1, evolutionId: 'grenade-echo' });
    if (source === 'echo') {
      game.echoBursts = [{ x: 900, y: 700, radius: 200, damage: 9999, remaining: .01 }, { x: 910, y: 700, radius: 200, damage: 9999, remaining: .01 }];
      game._updateEchoes(.1);
    }
    if (source === 'evolution') {
      game.evolutionState.echoes = [{ x: 900, y: 700, radius: 200, damage: 9999, remaining: .01 }, { x: 910, y: 700, radius: 200, damage: 9999, remaining: .01 }];
      game._updateEvolutionEffects(.1);
    }
    if (source === 'skill') game.useSkill();
    if (source === 'arc') game._applyAmmoEffect({ arc: true, evolutionId: 'assault-chain', damage: 9999 }, { id: -1, x: 890, y: 700 });
    assert.equal(game.phase, final ? 'won' : 'campaign-rest', source);
    assert.equal(game.kills, kills + 1, source + ' must not kill later targets from the old array');
    assert.equal(bystander.hp, 1, source); assert.equal(game.pickups.length, 0, source);
    assert.equal(game.bullets.length, 0, source); assert.equal(game.evolutionState.echoes.length, 0, source);
    const events = game.drainEvents();
    assert.equal(events.filter(event => event.type === (final ? 'win' : 'campaign-rest')).length, 1, source);
    assert.equal(events.filter(event => event.type === 'level-up').length, 0, source);
  }
});

test('lethal first hazard suppresses every remaining hazard and boss victory in the same frame', () => {
  const game = nexus(), boss = game.enemies.find(enemy => enemy.type === 'boss');
  game.player.invulnerable = 0; game.player.hp = 1;
  game._addHazard('blast', game.player.x, game.player.y, 100, .01, 9999, { owner: 'enemy', sourceId: boss.id });
  game._addHazard('blast', game.player.x, game.player.y, 100, .01, 9999, { owner: 'enemy', sourceId: boss.id });
  game._updateHazards(.1);
  assert.equal(game.phase, 'lost'); assert.equal(game.hazards.length, 0);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'lose').length, 1);
  assert.equal(events.filter(event => event.type === 'damage').length, 1); assert.equal(events.some(event => event.type === 'win'), false);
});

test('EMP cancels nexus warnings without a delayed blast and the boss resumes its next attack', () => {
  for (const count of [0, 1, 2]) {
    const game = nexus(), boss = game.enemies.find(enemy => enemy.type === 'boss');
    Object.assign(boss, { x: 900, y: 900, attackCount: count, attackTimer: 0, recoveryTimer: 0 });
    Object.assign(game.player, { x: 900, y: 1150 });
    game._updateBoss(boss, .01, 0, 1, 250);
    assert.ok(boss.windup > 0); assert.equal(game.useSkill(), true);
    assert.equal(boss.windup, 0); assert.equal(game.hazards.length, 0); assert.equal(boss.stunTimer, .65);
    game._updateHazards(2); assert.equal(game.bullets.length, 0);
    boss.stunTimer = 0; boss.attackTimer = 0; game._updateBoss(boss, .01, 0, 1, 250);
    assert.equal(boss.attackCount, count + 2); assert.ok(boss.windup > 0);
  }
});

test('a later-sector contract stays completable after all relics are already owned', () => {
  const game = campaign(); game.relics = ['phase-mag', 'echo-pulse', 'precision-burst']; travel(game);
  const contract = game.contracts[0]; contract.status = 'ready'; contract.progress = contract.goal;
  Object.assign(game.player, { x: contract.x, y: contract.y, hp: 40 });
  const credits = game.player.credits;
  assert.match(game.interactionState().hint, /遗物已集齐/);
  assert.equal(game.interact(), true); assert.equal(game.phase, 'playing'); assert.equal(game.relicChoices.length, 0);
  assert.equal(game.player.credits, credits + 30); assert.equal(game.player.hp, 75);
  assert.equal(game.relics.length, 3); assert.equal(contract.status, 'complete');
  assert.match(game.drainEvents().find(event => event.type === 'contract-reward').message, /遗物已集齐/);
  assert.equal(game.interact(), false); assert.equal(game.player.credits, credits + 30);
});

test('an exhausted upgrade pool heals and advances levels without trapping the campaign in an empty menu', () => {
  const game = campaign();
  game.upgradeStacks = Object.fromEntries(UPGRADES.map(upgrade => [upgrade.id, upgrade.maxStacks]));
  game.evolutionId = 'assault-chain'; game.upgradeStacks['assault-chain'] = 1;
  Object.assign(game.player, { level: 60, hp: 1, xp: 10000, xpNeeded: 2000 });
  game._levelUp();
  assert.equal(game.phase, 'playing'); assert.equal(game.upgradeChoices.length, 0); assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.player.level, 61); assert.equal(game.player.xp, 8000);
  clearStage(game);
  assert.equal(game.chooseCampaignRoute(game.campaign.routeChoices[0].mapId, 'power', awakening(game)), true);
  assert.equal(game.phase, 'playing'); assert.equal(game.upgradeChoices.length, 0);
  assert.equal(game.player.level, 62); assert.ok(Number.isFinite(game.player.xpNeeded));
});

test('lethal contact stops other enemies from finishing shots on the now-cleared field', () => {
  const game = campaign(); game.obstacles = []; game.player.hp = 1;
  game.spawnEnemy('crawler', { x: game.player.x + 5, y: game.player.y });
  const spitter = game.spawnEnemy('spitter', { x: game.player.x + 250, y: game.player.y });
  spitter.windup = .01; spitter.shotAngle = Math.PI;
  game._updateEnemies(.02);
  assert.equal(game.phase, 'lost'); assert.equal(game.enemies.length, 0);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.drainEvents().some(event => event.type === 'shot'), false);
});
