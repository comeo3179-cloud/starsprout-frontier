'use strict';

const test = require('node:test'), assert = require('node:assert/strict');
const { Game, WEAPONS, CAMPAIGN_AWAKENINGS } = require('../action-engine.js');

function campaign(options = {}) {
  const game = new Game({ mode: 'campaign', mapId: 'frontier', doctrineId: 'skirmisher', seed: 731, ...options });
  game.start(); game.drainEvents(); return game;
}
function rest(game) {
  // Boundary fixture: all route and reward transitions use the real engine.
  game.enemies = []; game.hazards = []; game.bullets = []; game.pickups = [];
  game.bossSpawned = false; game._spawnBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  assert.ok(boss); game._damageEnemy(boss, 1000000);
  assert.equal(game.phase, 'campaign-rest');
}
function snapshot(game) {
  return JSON.stringify({ phase: game.phase, elapsed: game.elapsed, campaign: game.campaign, player: game.player, ammo: game.ammoByWeapon,
    enemies: game.enemies, hazards: game.hazards, bullets: game.bullets, score: game.score, upgrades: game.upgradeStacks });
}

test('campaign intermission rejects combat and incomplete or duplicate transactions without side effects', () => {
  const game = campaign(); rest(game); game.drainEvents();
  const before = snapshot(game);
  for (const action of [() => game.reload(), () => game.dash({ x: 1, y: 0 }), () => game.useSkill(), () => game.activateOverdrive(), () => game.switchWeapon(2), () => game.interact()]) assert.equal(action(), false);
  game.update(.25, { moveX: 1, shoot: true });
  for (const [route, supply] of [['frontier', 'power'], ['invalid', 'repair'], ['foundry', 'invalid'], ['foundry', undefined]]) assert.equal(game.chooseCampaignRoute(route, supply), false);
  assert.equal(snapshot(game), before); assert.deepEqual(game.drainEvents(), []);
  for (const awakening of [undefined, '', 'missing', 'mag-relay']) assert.equal(game.chooseCampaignRoute('foundry', 'power', awakening), false);
  assert.equal(snapshot(game), before); assert.deepEqual(game.drainEvents(), []);
  assert.equal(game.chooseCampaignRoute('foundry', 'power', 'return-dash'), true);
  const after = snapshot(game);
  assert.equal(game.chooseCampaignRoute('foundry', 'power'), false);
  assert.equal(game.chooseCampaignRoute('frost', 'repair'), false);
  assert.equal(snapshot(game), after);
  assert.equal(game.campaign.stage, 2);
});

test('boss victory takes priority over pending XP and resumes earned upgrades after committing a route', () => {
  const game = campaign(), level = game.player.level;
  game.player.xp = game.player.xpNeeded + 7;
  const xp = game.player.xp;
  rest(game);
  assert.equal(game.player.level, level); assert.equal(game.player.xp, xp);
  game.update(.25, { shoot: true }); assert.equal(game.phase, 'campaign-rest');
  assert.equal(game.chooseCampaignRoute('foundry', 'repair', 'return-dash'), true);
  assert.equal(game.phase, 'upgrade'); assert.equal(game.player.level, level + 1); assert.equal(game.player.xp, 7);
  const at = game.elapsed; game.update(.25, { shoot: true }); assert.equal(game.elapsed, at);
  assert.ok(game.upgradeChoices.length > 0);
  assert.equal(game.chooseUpgrade(game.upgradeChoices[0].id), true);
  assert.equal(game.phase, 'playing'); assert.equal(game.map.id, 'foundry'); assert.equal(game.campaign.stage, 2);
  assert.equal(game.drainEvents().filter(event => event.type === 'win').length, 0, 'Intermediate bosses never record a campaign win');
});

test('campaign route plans reproduce from their seed and never offer a completed sector', () => {
  const a = campaign({ seed: 123, random: () => .1 }), b = campaign({ seed: 123, random: () => .9 });
  rest(a); rest(b);
  assert.deepEqual(a.campaign.routeChoices, b.campaign.routeChoices);
  assert.equal(a.campaign.routeChoices.length, 4);
  assert.ok(a.campaign.routeChoices.every(choice => (choice.mapId || choice.id) !== 'frontier'));
  const route = a.campaign.routeChoices[1].mapId || a.campaign.routeChoices[1].id;
  a.chooseCampaignRoute(route, 'power', 'return-dash'); b.chooseCampaignRoute(route, 'power', 'return-dash');
  assert.deepEqual(a.obstacles, b.obstacles); assert.equal(a.campaign.crisisId, b.campaign.crisisId);
  rest(a); rest(b); assert.deepEqual(a.campaign.routeChoices, b.campaign.routeChoices);
  assert.deepEqual(a.campaign.routeChoices.map(choice => choice.mapId || choice.id), ['nexus']);
});

test('returning to a normal sector clears campaign build state but preserves only this player secret discoveries', () => {
  const game = campaign({ discoveredSecrets: ['rebound', 'ice-break'] });
  rest(game); game.chooseCampaignRoute('foundry', 'power', 'return-dash');
  game.reset('frontier');
  assert.equal(game.mode, 'expedition'); assert.equal(game.campaign, null); assert.equal(game.phase, 'ready');
  assert.equal(game.player.maxHp, 120); assert.equal(game.player.hp, 120); assert.equal(game.player.damageMultiplier, 1);
  assert.equal(game.player.speed, 218); assert.equal(game.elapsed, 0); assert.equal(game.evolutionId, '');
  assert.deepEqual(game.upgradeStacks, {}); assert.deepEqual(game.ammoByWeapon, WEAPONS.map(weapon => weapon.magSize));
  assert.deepEqual([...game.discoveredSecrets].sort(), ['ice-break', 'rebound']);
  const other = campaign({ discoveredSecrets: ['bullet-reversal'] });
  assert.deepEqual([...other.discoveredSecrets], ['bullet-reversal']);
  other.reset('frontier', { mode: 'trial', seed: 7 });
  assert.equal(other.mode, 'trial'); assert.equal(other.campaign, null); assert.equal(other.player.maxHp, 120);
});

test('campaign addition preserves existing trial seed boss selection', () => {
  const expected = [[1, 'foundry'], [2, 'frost'], [7, 'frontier'], [123, 'frost'], [124, 'frost'], [731, 'frost']];
  for (const [seed, boss] of expected) {
    const game = new Game({ mode: 'trial', seed });
    assert.equal(game.trial.bossMapId, boss, 'Previous 2.10.1 seed ' + seed);
    assert.equal(game.map.id, 'trial'); assert.equal(game.trial.plans.length, 6); assert.equal(game.campaign, null);
  }
});

test('all six awakenings commit once and persist across the final route without allowing a branch change', () => {
  assert.equal(CAMPAIGN_AWAKENINGS.length, 6);
  for (const awakening of CAMPAIGN_AWAKENINGS) {
    const game = campaign({ doctrineId: awakening.doctrineId });
    assert.equal(game.campaign.awakeningId, '');
    assert.equal(game.chooseCampaignRoute('foundry', 'power', awakening.id), false);
    rest(game);
    assert.equal(game.chooseCampaignRoute('foundry', 'power', awakening.id), true);
    assert.equal(game.campaign.awakeningId, awakening.id);
    const after = snapshot(game);
    assert.equal(game.chooseCampaignRoute('frost', 'power', awakening.id), false);
    assert.equal(snapshot(game), after);
    rest(game); game.drainEvents();
    const before = snapshot(game);
    const other = CAMPAIGN_AWAKENINGS.find(item => item.doctrineId === awakening.doctrineId && item.id !== awakening.id);
    assert.equal(game.chooseCampaignRoute('nexus', 'mobility', other.id), false);
    assert.equal(snapshot(game), before); assert.deepEqual(game.drainEvents(), []);
    assert.equal(game.chooseCampaignRoute('nexus', 'mobility', awakening.id), true);
    assert.equal(game.campaign.awakeningId, awakening.id);
    assert.equal(game.campaign.stage, 3);
  }
});

test('awakening choices belong only to one run and never become account discoveries', () => {
  const first = campaign({ doctrineId: 'conductor', discoveredSecrets: ['ice-break'] });
  rest(first); assert.equal(first.chooseCampaignRoute('foundry', 'repair', 'charged-pulse'), true);
  const second = campaign({ doctrineId: 'conductor', discoveredSecrets: ['rebound'] });
  assert.equal(second.campaign.awakeningId, '');
  assert.deepEqual([...second.discoveredSecrets], ['rebound']);
  first.reset('frontier', { mode: 'campaign', doctrineId: 'conductor', seed: first.campaign.seed });
  assert.equal(first.campaign.awakeningId, '');
  assert.deepEqual([...first.discoveredSecrets], ['ice-break']);
  first.reset('frontier'); assert.equal(first.campaign, null);
});

test('mag relay survives a target weapon background reload without granting ammo or cancelling its reload', () => {
  const game = campaign({ doctrineId: 'marksman' });
  rest(game); game.chooseCampaignRoute('foundry', 'power', 'mag-relay');
  game.obstacles = []; game.spawnTimer = Infinity; game.player.critChance = 0;
  game.ammoByWeapon[1] = 1; game.switchWeapon(1); assert.equal(game.reload(), true);
  const targetDuration = game.reloadByWeapon[1];
  game.switchWeapon(0); game.ammoByWeapon[0] = 10; game._syncWeapon(); assert.equal(game.reload(), true);
  for (let i = 0; i < 9; i++) game.update(.1);
  assert.ok(game.player.reloadProgress > game.player.reloadWindowStart && game.player.reloadProgress < game.player.reloadWindowEnd);
  assert.equal(game.reload(), true);
  const remaining = game.reloadByWeapon[1]; assert.ok(remaining > 0 && remaining < targetDuration);
  assert.equal(game.switchWeapon(1), true);
  assert.equal(game.ammoByWeapon[1], 1, 'Switching grants no magazine refill');
  assert.equal(game.reloadByWeapon[1], remaining, 'Switching does not cancel or restart background reload');
  while (game.reloadByWeapon[1] > 0) game.update(.1);
  assert.equal(game.overchargedByWeapon[1], 1, 'The pending relay survives ordinary reload completion');
  game.update(1 / 60, { shoot: true });
  const first = game.bullets.filter(bullet => bullet.owner === 'player');
  assert.equal(first.length, WEAPONS[1].pellets);
  assert.ok(first.every(bullet => Math.abs(bullet.damage - WEAPONS[1].damage * 1.1 * 1.5) < 1e-9));
  assert.equal(game.overchargedByWeapon[1], 0);
  for (let i = 0; i < 7; i++) game.update(.1);
  game.update(1 / 60, { shoot: true });
  assert.ok(game.bullets.filter(bullet => bullet.owner === 'player').every(bullet => Math.abs(bullet.damage - WEAPONS[1].damage * 1.1) < 1e-9));
});
