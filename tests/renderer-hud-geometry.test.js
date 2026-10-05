'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function fixture() {
  const counts = { queries: 0, bounds: 0 }, observers = [];
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.records = []; observers.push(this); }
    observe(parent, options) { this.parent = parent; this.options = options; }
    takeRecords() { return this.records.splice(0); }
    flush() { this.callback(this.takeRecords()); }
  }
  const element = (className, rect, parentElement = null) => ({
    nodeType: 1, className, rect, parentElement,
    getAttribute(name) { return name === 'class' ? this.className : this.style || null; },
    matches(selector) { return selector.split(',').some(s => s.startsWith('.') && this.className.split(' ').includes(s.slice(1)) || s.startsWith('#') && this.id === s.slice(1)); },
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
    getBoundingClientRect() { counts.bounds++; return { ...this.rect, left: this.rect.left + 100, right: this.rect.right + 100, top: this.rect.top + 20, bottom: this.rect.bottom + 20, width: this.rect.right - this.rect.left, height: this.rect.bottom - this.rect.top }; }
  });
  const stage = element('game-stage', { left: 0, right: 667, top: 0, bottom: 375 });
  const notices = element('combat-notices', { left: 170, right: 477, top: 62, bottom: 79 }, stage);
  const objective = element('objective-hud', { left: 493, right: 659, top: 60, bottom: 126 }, stage);
  const player = element('player-hud', { left: 8, right: 158, top: 8, bottom: 127 }, stage);
  const skill = element('skill-hud', { left: 420, right: 556, top: 202, bottom: 256 }, stage);
  const stick = element('touch-stick', { left: 12, right: 100, top: 275, bottom: 363 }, stage);
  const panels = [notices, objective, player, skill, stick];
  stage.querySelectorAll = selector => { counts.queries++; return panels.filter(el => el.matches(selector)); };
  const canvas = { parentElement: stage, getBoundingClientRect: () => ({ left: 100, top: 20, width: 667, height: 375 }) };
  const window = { MutationObserver, getComputedStyle: () => ({ getPropertyValue: () => '0' }) }, sandbox = { window };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'action-renderer.js'), 'utf8'), sandbox);
  const r = Object.assign(Object.create(window.ExpeditionRenderer.prototype), { canvas, time: 1, pointerHud: null, pointerHudTime: -1,
    width: 667, height: 375, camera: { x: 1050, y: 1180 }, scale: .65, encounterLabelRects: [], encounterPlayerPoint: { x: 333.5, y: 187.5 } });
  r.ctx = { font: '', measureText: text => ({ width: text.length * 7 }), save() {}, restore() {}, translate() {}, scale() {} };
  r.label = () => {};
  const change = (target, type = 'childList', attributeName = null, oldValue) => {
    for (const observer of observers) observer.records.push({ target, type, attributeName, oldValue });
  };
  return { r, counts, stage, notices, objective, player, skill, stick, panels, element, observers, change };
}
const overlaps = (a, b) => a.left < b.right + 4 && a.right > b.left - 4 && a.top < b.bottom + 4 && a.bottom > b.top - 4;

test('the first next frame uses newly visible combat-notice bounds before its observer callback', () => {
  const f = fixture(), { r, notices } = f; r.updatePointerHud();
  notices.rect.bottom = 113;
  const hint = f.element('interaction-hint', { left: 170, right: 359, top: 83, bottom: 113 }, notices);
  f.change(hint, 'attributes', 'class');
  r.time += .016; r.updatePointerHud();
  r.drawEncounterLabel('圈内钻探 50%', 1050, 1180 + (100 - 187.5) / .65, '#9ce8d3');
  assert.equal(r.encounterLabelRects.length, 1);
  assert.ok(!overlaps(r.encounterLabelRects[0], hint.rect), 'The next frame must avoid the hint, rather than waiting for the 0.5-second cache timer');
  assert.ok(r.pointerHud.blocks.some(b => b.left === 170 && b.bottom === 113));
});

test('wrapped text and changed HUD root positions invalidate fresh bounds in the same rendering turn', () => {
  const f = fixture(), { r, objective } = f; r.updatePointerHud();
  objective.rect.bottom += 40;
  f.change(f.element('objective-copy', {}, objective));
  r.time += .01; r.updatePointerHud();
  assert.ok(r.pointerHud.blocks.some(b => b.left === 493 && b.bottom === 166));
  objective.rect.left -= 60; objective.rect.right -= 60;
  f.change(objective, 'attributes', 'style');
  r.updatePointerHud();
  assert.ok(r.pointerHud.blocks.some(b => b.left === 433 && b.bottom === 166));
});

test('observer-delivered HUD changes also refresh before the next frame without changing renderer time', () => {
  const f = fixture(), { r, notices } = f; r.updatePointerHud();
  notices.rect.top = 96; notices.rect.bottom = 135;
  f.change(f.stage, 'attributes', 'class');
  for (const observer of f.observers) observer.flush();
  r.updatePointerHud();
  assert.ok(r.pointerHud.blocks.some(b => b.left === 170 && b.top === 96 && b.bottom === 135));
});

test('static HUD and moving reticle, joystick nub and cooldown fills keep layout reads bounded', () => {
  const f = fixture(), { r, counts } = f; r.updatePointerHud();
  const initial = { ...counts };
  const reticle = f.element('aim-reticle', {}, f.stage), nub = f.element('stick-nub', {}, f.stick), fill = f.element('cooldown-fill', {}, f.skill);
  for (let i = 0; i < 24; i++) {
    f.change(reticle, 'attributes', 'style'); f.change(nub, 'attributes', 'style'); f.change(fill, 'attributes', 'style');
    r.time += .016; r.updatePointerHud();
  }
  assert.deepEqual(counts, initial, 'Decorative input feedback does not remeasure HUD rectangles every frame');
  r.time += .2; r.updatePointerHud();
  assert.equal(counts.queries, initial.queries * 2, 'The existing periodic cache refresh remains bounded');
});

test('a fixed-size HUD batch with repeated HP and experience writes measures only its affected panel', () => {
  const f = fixture(), { r, counts } = f; r.updatePointerHud();
  const initial = { ...counts };
  for (let i = 0; i < 120; i++) f.change(f.element('health-number xp-label ammo-current', {}, f.player));
  r.time += .016; r.updatePointerHud();
  const refreshed = { ...counts }; r.updatePointerHud();
  assert.equal(refreshed.queries, initial.queries, 'Unchanged fixed-size panels do not rebuild all HUD rectangles');
  assert.ok(refreshed.bounds <= initial.bounds + 1, 'All text writes in one fixed panel need at most one bounds check');
  assert.deepEqual(counts, refreshed, 'A second pointer/label pass shares the frame cache');
});

test('desktop display-contents notices still reserve the real visible child bounds', () => {
  const f = fixture(), { r, notices } = f;
  notices.rect.right = notices.rect.left; notices.rect.bottom = notices.rect.top;
  const hint = f.element('interaction-hint', { left: 290, right: 380, top: 86, bottom: 111 }, notices);
  f.panels.push(hint); r.updatePointerHud();
  r.drawEncounterLabel('圈内钻探 50%', 1050, 1180 + (100 - 187.5) / .65, '#9ce8d3');
  assert.equal(r.encounterLabelRects.length, 1); assert.ok(!overlaps(r.encounterLabelRects[0], hint.rect));
});

test('same-value forced class toggles do not invalidate otherwise stable HUD geometry', () => {
  const f = fixture(), { r, counts } = f; r.updatePointerHud(); const initial = { ...counts };
  for (let i = 0; i < 24; i++) {
    f.change(f.stage, 'attributes', 'class', f.stage.className);
    f.change(f.objective, 'attributes', 'class', f.objective.className);
    r.time += .016; r.updatePointerHud();
  }
  assert.deepEqual(counts, initial);
});

test('a HUD class temporarily hidden and restored in one UI update keeps the final geometry cache', () => {
  const f = fixture(), { r, counts } = f; r.updatePointerHud(); const initial = { ...counts };
  for (let i = 0; i < 24; i++) {
    f.change(f.objective, 'attributes', 'class', f.objective.className);
    f.change(f.objective, 'attributes', 'class', f.objective.className + ' hidden');
    r.time += .016; r.updatePointerHud();
  }
  assert.deepEqual(counts, initial, 'Only the final class state changes the blocking rectangle');
});
