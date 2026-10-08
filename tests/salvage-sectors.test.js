'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, ENEMIES, MAPS, SALVAGE_SECTORS, SALVAGE_MODS } = require('../action-engine.js');

// Geometry/layout fixtures are separate from a natural-input survival run.
test('three distinct salvage sectors expose compact metadata without changing general maps', () => {
  assert.deepEqual(SALVAGE_SECTORS.map(item => item.id), ['scrapyard', 'frostport', 'stormcity']);
  assert.deepEqual(SALVAGE_MODS.map(item => item.id), ['breach', 'frost', 'arc']);
  assert.deepEqual(MAPS.map(item => item.id), ['frontier', 'foundry', 'frost', 'storm', 'ruins']);
  for (const sector of SALVAGE_SECTORS) {
    for (const field of ['name', 'caption', 'icon', 'color', 'hint', 'modId']) assert.ok(sector[field]);
    assert.equal(sector.exits.length, 2);
    assert.deepEqual(sector.exits.map(exit => exit.arrivalDuration), [10, 16]);
  }
});

test('omitted and invalid salvage sector select the original scrapyard', () => {
  const original = new Game({ mode: 'salvage', seed: 731 });
  for (const sectorId of ['scrapyard', 'unknown', '', undefined]) {
    const game = new Game({ mode: 'salvage', seed: 731, sectorId });
    assert.equal(game.salvage.sectorId, 'scrapyard');
    assert.deepEqual(game.spawn, { x: 350, y: 1580 });
    for (const field of ['sources', 'exits', 'hotCargo', 'comms', 'nodes', 'hunt']) assert.deepEqual(game.salvage[field], original.salvage[field]);
    assert.deepEqual(game.obstacles, original.obstacles);
  }
});

test('new sectors change routes and collision layouts while preserving recovery economy', () => {
  const layouts = new Set();
  for (const { id, modId, exits } of SALVAGE_SECTORS) {
    const game = new Game({ mode: 'salvage', seed: 731, sectorId: id });
    assert.equal(game.map.id, 'salvage'); assert.equal(game.mode, 'salvage');
    assert.deepEqual(game.world, { width: 2600, height: 1900 });
    assert.deepEqual(game.salvage.sources.map(source => source.kind), ['vault', 'drill', 'vault', 'drill', 'drone']);
    assert.equal(game.salvage.sources.reduce((sum, source) => sum + source.value, 0), 17);
    assert.equal(game.salvage.pending.length, 8); assert.equal(game.salvage.nodes.length, 3);
    assert.equal(game.salvage.hunt.modId, modId); assert.equal(game.salvage.modId, '');
    assert.deepEqual(game.salvage.exits.map(({ name, x, y, arrivalDuration, coverLabel }) => ({ name, x, y, arrivalDuration, coverLabel })), exits);
    layouts.add(JSON.stringify({ spawn: game.spawn, sources: game.salvage.sources, obstacles: game.obstacles }));
  }
  assert.equal(layouts.size, 3);
});

test('sector geometry and opportunities are repeatable across difficulty and combat sources', () => {
  for (const sector of SALVAGE_SECTORS) for (const seed of [0, 1, 731, 4294967295]) {
    const a = new Game({ mode: 'salvage', sectorId: sector.id, seed, difficulty: 'normal', random: () => .1 });
    const b = new Game({ mode: 'salvage', sectorId: sector.id, seed, difficulty: 'overload', random: () => .9 });
    for (const field of ['sources', 'exits', 'hotCargo', 'comms', 'nodes', 'hunt']) assert.deepEqual(a.salvage[field], b.salvage[field]);
    assert.deepEqual(a.obstacles, b.obstacles);
    for (let index = 0; index < 30; index++) a.random();
    assert.deepEqual(a.salvage.nodes, b.salvage.nodes);
  }
});

test('crowded seed layouts always place three finite nodes clear of interaction objects', () => {
  for (const sector of SALVAGE_SECTORS) for (const seed of [2, 3, 4, 16, 20, 22, 31, 33, 912, 2868466484]) {
    const game = new Game({ mode: 'salvage', sectorId: sector.id, seed });
    const targets = [...game.salvage.sources, ...game.salvage.exits, game.salvage.hotCargo, game.salvage.comms, ...game.stations, ...game.crates, ...game.battlefield.props];
    assert.equal(game.salvage.nodes.length, 3);
    for (const node of game.salvage.nodes) {
      assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
      for (const target of [...targets, ...game.salvage.nodes.filter(item => item !== node)])
        assert.ok(Math.hypot(node.x - target.x, node.y - target.y) >= Math.max(90, (target.radius || 24) + 64) - 1e-7, sector.id + ' ' + seed + ' node clearance');
    }
  }
});

test('iceport southern supply crate leaves room for the player beside actual extraction cover', () => {
  for (let seed = 0; seed < 256; seed++) {
    const game = new Game({ mode: 'salvage', sectorId: 'frostport', seed });
    const crate = game.crates[4];
    assert.deepEqual({ x: crate.x, y: crate.y }, { x: 2330, y: 1470 });
    for (const rock of game.obstacles) assert.ok(Math.hypot(crate.x - rock.x, crate.y - rock.y) > rock.radius + game.player.radius + 2,
      'seed ' + seed + ': crate center and player clearance beside rock ' + rock.id);
  }
});

test('elite initialization does not consume the original combat random stream', () => {
  for (const sector of SALVAGE_SECTORS) {
    const a = new Game({ mode: 'salvage', sectorId: sector.id, seed: 731 });
    const b = new Game({ mode: 'salvage', sectorId: sector.id, seed: 731 });
    a.start();
    assert.equal(a.random(), b.random());
    const hunt = a.salvage.hunt, elite = a.enemies.find(enemy => enemy.id === hunt.enemyId);
    assert.ok(elite.elite && elite.salvageHunt); assert.equal(elite.hp, Math.round(ENEMIES[elite.type].hp * 2.2));
    assert.equal(hunt.status, 'patrolling'); assert.equal(hunt.drop.status, 'locked');
    assert.equal(a.start(), false); assert.equal(a.enemies.filter(enemy => enemy.salvageHunt).length, 1);
  }
});

test('patrol follows its world route without firing at a distant player and can be bypassed', () => {
  for (const sector of SALVAGE_SECTORS) {
    const game = new Game({ mode: 'salvage', sectorId: sector.id, seed: 731 }); game.start();
    const hunt = game.salvage.hunt, elite = game.enemies.find(enemy => enemy.id === hunt.enemyId), start = { x: elite.x, y: elite.y };
    game.salvage.pending = []; game.drainEvents();
    for (let frame = 0; frame < 120; frame++) game.update(1 / 60);
    assert.equal(hunt.status, 'patrolling'); assert.ok(Math.hypot(elite.x - start.x, elite.y - start.y) > 40);
    assert.equal(game.bullets.length, 0); assert.equal(game.hazards.length, 0);
    const exit = game.salvage.exits[0]; Object.assign(game.player, { x: exit.x, y: exit.y });
    assert.equal(game.interact(), true); game.salvage.pending = [];
    for (let frame = 0; frame < 800 && game.phase === 'playing'; frame++) game.update(1 / 60);
    assert.equal(game.phase, 'won'); assert.equal(game.salvage.status, 'withdrawn'); assert.equal(elite.hp, elite.maxHp);
  }
});

test('real damage alerts the elite once, death opens one optional drop, and E alone equips it', () => {
  const game = new Game({ mode: 'salvage', seed: 731 }); game.start(); game.salvage.pending = []; game.drainEvents();
  const hunt = game.salvage.hunt, elite = game.enemies.find(enemy => enemy.id === hunt.enemyId);
  game._damageEnemy(elite, 1); game._damageEnemy(elite, 1);
  assert.equal(hunt.status, 'alert'); assert.equal(game.drainEvents().filter(event => event.type === 'salvage-hunt-alert').length, 1);
  game._damageEnemy(elite, elite.hp + 100); assert.equal(hunt.status, 'defeated'); assert.equal(hunt.drop.status, 'open');
  assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.modId, ''); assert.equal(game.phase, 'playing');
  assert.equal(game.selectSalvageTarget(hunt.drop.id), true); assert.equal(game.salvageTarget().kind, 'mod');
  assert.equal(game.interact(), false, 'map tracking cannot pick up a remote drop');
  Object.assign(game.player, { x: elite.x, y: elite.y });
  assert.equal(game.interact(), true); assert.equal(game.salvage.carried, 3); assert.equal(game.salvage.modId, 'breach');
  assert.equal(hunt.status, 'claimed'); assert.equal(hunt.drop.status, 'collected'); assert.equal(game.phase, 'playing');
  assert.equal(game._interactSalvage(hunt.drop), false); assert.equal(game.salvage.carried, 3);
  game.player.invulnerable = 0; game._damagePlayer(10000);
  assert.equal(game.salvage.lostSamples, 3); assert.equal(game.salvage.bonus, 0);
  game.reset('frontier', { mode: 'salvage', sectorId: 'frostport', seed: 731 });
  assert.equal(game.salvage.modId, ''); assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.sectorId, 'frostport');
});

test('collected elite samples settle only once on boarding and are worth the original sample rate', () => {
  const game = new Game({ mode: 'salvage', sectorId: 'stormcity', seed: 731 }); game.start(); game.salvage.pending = [];
  const hunt = game.salvage.hunt, elite = game.enemies.find(enemy => enemy.id === hunt.enemyId);
  game._damageEnemy(elite, elite.hp + 100); Object.assign(game.player, { x: elite.x, y: elite.y });
  assert.equal(game.interact(), true); assert.equal(game.salvage.bonus, 0); assert.equal(game.salvage.carried, 3);
  const exit = game.salvage.exits[0]; Object.assign(game.player, { x: exit.x, y: exit.y });
  assert.equal(game.interact(), true); game.salvage.pending = [];
  for (let frame = 0; frame < 800 && game.phase === 'playing'; frame++) game.update(1 / 60);
  assert.equal(game.phase, 'won'); assert.equal(game.salvage.status, 'extracted'); assert.equal(game.salvage.settled, 3); assert.equal(game.salvage.bonus, 240);
  assert.equal(game._finishSalvage(), false); assert.equal(game.salvage.bonus, 240); assert.equal(game.salvage.round.remaining, 0);
});
