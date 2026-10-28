'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Test the same offline, inline physics module that the page executes.
const html = fs.readFileSync(path.join(__dirname, '..', 'Xc.html'), 'utf8');
const source = html.match(/<script id="physics-model">([\s\S]*?)<\/script>/)[1];
const sandbox = {};
vm.runInNewContext(source + '\nglobalThis.physics = XCPhysics;', sandbox);
const physics = sandbox.physics;
const G = physics.G;
const close = (a, b, tolerance = 1e-8, message = '') => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}, tolerance ${tolerance}`);
const arc = (kind, extra = {}) => physics.makeModel(kind, { M: 6, m: 2, R: 2, v0: 8, h: 1, dropSpeed: 0, wall: false, ...extra });
const wallGroove = (extra = {}) => physics.makeModel('dropgroove', { M: 6, m: 2, R: 2, h: 1, dropSpeed: 0, wallGap: 0, wallE: 0, ...extra });
const spring = (kind, extra = {}) => physics.makeModel(kind, {
  mA: 2, mB: 2, mC: 2, mD: 2, d: kind === 'spring2' ? 2 : 4,
  k1: 20, k2: 20, l1: 2, l2: 2, xA: 0, xB: 0, xC: 0, yB: 0,
  vA: kind === 'spring2' ? 2 : 0, vB: kind === 'spring2' ? 0 : 2,
  vyB: 0, vC: 0, mode: 'direct', vD: 3, vyD: 0, gap: 2, e: 1, radius: .12, ...extra
});
function invariants(model, times, tolerance = 1e-4) {
  const initial = model.at(0);
  for (const t of times) {
    const p = model.at(t);
    assert.ok(p.bodies.every(b => [b.x, b.y, b.vx, b.vy].every(Number.isFinite)), `finite state at ${t}`);
    const momentum = p.bodies.reduce((sum, b) => sum + b.m * b.vx, 0);
    const mass = p.bodies.reduce((sum, b) => sum + b.m, 0);
    const com = p.bodies.reduce((sum, b) => sum + b.m * b.x, 0) / mass;
    close(momentum, model.momentum0, 2e-7 * Math.max(1, Math.abs(model.momentum0)), `horizontal momentum at ${t}`);
    close(com, initial.com + model.comVelocity * t, 2e-6 * Math.max(1, t), `center of mass at ${t}`);
    let energy = p.bodies.reduce((sum, b) => sum + .5 * b.m * (b.vx ** 2 + b.vy ** 2), 0);
    if (model.kind === 'quarter' || model.kind === 'dropgroove') energy += p.bodies.find(b => b.id === 'block').m * G * p.bodies.find(b => b.id === 'block').y;
    for (const s of p.springs) {
      const a = p.bodies.find(b => b.id === s.a), b = p.bodies.find(b => b.id === s.b);
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      close(s.length, length, 1e-9, 'actual spring length');
      energy += .5 * s.k * (length - s.rest) ** 2;
    }
    close(energy, p.energy, 1e-7 * Math.max(1, energy), 'reported energy');
    close(energy + (p.dissipated || 0), model.energy0, tolerance * Math.max(1, Math.abs(model.energy0)), `energy with collision loss at ${t}`);
  }
}

test('original boat, groove and pendulum retain their displacement relations', () => {
  const boat = physics.makeModel('boat', 210, 70, 6);
  const b = boat.difference(0, boat.duration);
  close(b.relative, 6); close(b.base, -1.5); close(b.object, 4.5); close(b.com, 0);
  const groove = physics.makeModel('groove', 6, 2, 2);
  const g = groove.difference(0, groove.duration);
  close(g.relative, 4); close(g.base, -1); close(g.object, 3); close(g.com, 0);
  const pendulum = physics.makeModel('pendulum', 6, 2, 2);
  const p = pendulum.difference(0, pendulum.duration);
  for (const value of Object.values(p)) close(value, 0);
});

test('quarter arc conserves momentum and energy below, at and above critical speed', () => {
  const critical = Math.sqrt(2 * G * 2 / .75);
  for (const factor of [.4, 1 - 1e-6, 1, 1 + 1e-6, 1.4]) {
    const model = arc('quarter', { v0: critical * factor });
    invariants(model, Array.from({ length: 51 }, (_, i) => model.duration * i / 50), 2e-7);
    const end = model.at(model.duration);
    close(end.baseVelocity, .5 * critical * factor, 2e-7, 'exit base velocity');
    close(end.objectVelocity, -.5 * critical * factor, 2e-7, 'exit block velocity');
  }
});

test('quarter critical state reverses at the upper endpoint without a flight', () => {
  const model = arc('quarter', { v0: Math.sqrt(2 * G * 2 / .75) });
  const t = model.duration / 2, p = model.at(t);
  close(p.theta, Math.PI / 2, 2e-7);
  close(p.omega, 0, 2e-7);
  close(p.height, 2, 2e-7);
  assert.ok(model.at(t - 1e-4).omega > 0);
  assert.ok(model.at(t + 1e-4).omega < 0);
  for (let i = 0; i <= 80; i++) assert.ok(model.at(model.duration * i / 80).height <= 2 + 1e-8);
});

test('high-energy quarter arc includes upward flight and tangent return', () => {
  const model = arc('quarter', { v0: 10 });
  const airborne = Array.from({ length: 301 }, (_, i) => model.at(model.duration * i / 300)).filter(p => p.height > 2.01);
  assert.ok(airborne.length > 2);
  for (const p of airborne) {
    close(p.q, 2, 1e-8, 'relative horizontal position during flight');
    close(p.baseVelocity, p.objectVelocity, 1e-8, 'common horizontal flight speed');
  }
  assert.ok(airborne.some(p => p.objectVy > 0));
  assert.ok(airborne.some(p => p.objectVy < 0));
});

test('half groove with h=0 agrees with the original release on its first traverse', () => {
  const old = physics.makeModel('groove', 6, 2, 2), model = arc('dropgroove', { h: 0 });
  for (let i = 0; i <= 40; i++) {
    const t = old.duration * i / 40, a = old.at(t), b = model.at(t);
    close(a.base, b.base, 2e-6); close(a.object, b.object, 2e-6);
    close(a.height + 2, b.height, 2e-6);
  }
});

test('falling half groove keeps contact and repeats through tangent reentry', () => {
  const model = arc('dropgroove');
  invariants(model, Array.from({ length: 81 }, (_, i) => i * .17), 2e-7);
  const tIn = Math.sqrt(2 / G);
  const entered = model.at(tIn);
  close(entered.q, -2); close(entered.height, 2); close(entered.objectVy, -Math.sqrt(2 * G));
  const again = model.at(tIn + model.period);
  close(again.base, entered.base, 2e-7); close(again.object, entered.object, 2e-7); close(again.objectVy, entered.objectVy, 2e-7);
  for (let i = 0; i < 200; i++) {
    const p = model.at(i * .05);
    if (p.height < 2 - 1e-5) assert.ok(p.normalForce > 0);
  }
});

test('arc edge parameters remain finite and satisfy conservation', () => {
  for (const params of [{ M: .2, m: 30, R: .3, v0: .001 }, { M: 30, m: .2, R: 5, v0: 20 }, { v0: 0 }]) {
    const model = arc('quarter', params);
    invariants(model, [0, model.duration * .3, model.duration], 2e-6);
  }
  invariants(arc('dropgroove', { M: .2, m: 30, R: .3, h: 0, dropSpeed: 12 }), [0, .0001, .1, 2, 10], 2e-6);
});

test('both spring models preserve a force-free natural-length rest state', () => {
  for (const kind of ['spring2', 'spring3']) {
    const model = spring(kind, { vA: 0, vB: 0, vyB: 0, vC: 0 });
    const a = model.at(0), b = model.at(12);
    for (let i = 0; i < a.bodies.length; i++) {
      close(a.bodies[i].x, b.bodies[i].x); close(a.bodies[i].y, b.bodies[i].y);
      close(b.bodies[i].vx, 0); close(b.bodies[i].vy, 0);
    }
  }
});

test('spring masses, stiffnesses, rest lengths and all initial velocities act independently', () => {
  for (const kind of ['spring2', 'spring3']) {
    const model = spring(kind, { mA: 1.3, mB: 3.1, mC: 2.7, k1: 37, k2: 12, l1: 1.7, l2: 2.3, vA: -.7, vB: 1.2, vyB: .4, vC: .3, xA: -.2, xB: .3, xC: .2 });
    invariants(model, [0, .1, .7, 2, 8, 20], 8e-4);
  }
});

test('free middle ball follows symmetry and can leave the middle line with asymmetric springs', () => {
  const symmetric = spring('spring3'), asymmetric = spring('spring3', { k1: 45, k2: 12 });
  close(symmetric.at(5).bodies.find(b => b.id === 'B').y, 0, 1e-8);
  assert.ok(Math.abs(asymmetric.at(2).bodies.find(b => b.id === 'B').y) > .005);
});

test('collision mode retains the striker and handles repeated elastic impacts', () => {
  const model = spring('spring3', { mode: 'collision', vB: 0, mD: 6 });
  invariants(model, [0, .5, .8, 2, 5, 15, 30], 1e-3);
  const p = model.at(30);
  assert.equal(p.bodies.length, 4);
  assert.ok(p.bodies.some(b => b.id === 'D'));
  assert.ok(p.collisions >= 2, `expected repeated collisions, got ${p.collisions}`);
});

test('inelastic fast impacts account for lost mechanical energy without tunneling', () => {
  const model = spring('spring3', { mode: 'collision', vB: 0, vD: 12, gap: .1, e: .4 });
  invariants(model, [.02, .1, 1, 5], 2e-3);
  assert.ok(model.at(.02).collisions >= 1);
  assert.ok(model.at(1).dissipated > 0);
});

test('fixed left wall supports the groove until its force points away from the wall', () => {
  const model = wallGroove();
  const supported = model.at(model.entryTime + .2);
  close(supported.base, 0); close(supported.baseVelocity, 0);
  assert.equal(supported.pinned, true);
  assert.ok(supported.wallForce > 0);
  const later = model.at(5);
  const release = model.events.find(e => e.type === 'release-wall');
  assert.ok(release);
  close(model.at(release.t - 1e-5).base, 0);
  assert.ok(model.at(release.t + .02).base > 0);
  close(later.momentum, 2 * Math.sqrt(2 * G * 3), 2e-7);
  assert.equal(later.pinned, false);
  const t = (model.entryTime + release.t) / 2, dt = 1e-5;
  const dP = (model.at(t + dt).momentum - model.at(t - dt).momentum) / (2 * dt);
  close(dP, model.at(t).wallForce, 2e-4, 'wall force equals momentum rate');
});

test('wall contact, restitution and energy loss remain correct for positive initial gaps', () => {
  for (const wallE of [0, .5, 1]) {
    const model = wallGroove({ wallGap: .3, wallE });
    for (let i = 0; i <= 100; i++) {
      const p = model.at(i * .1);
      assert.ok(p.base >= model.wallLimit - 1e-8);
      close(p.energy + p.dissipated, model.energy0, 1e-7);
      close(p.wallImpulse, p.momentum - model.momentum0, 1e-8);
    }
    const event = model.events.find(e => e.type === 'wall-impact');
    assert.ok(event);
    const before = model.at(event.t - 1e-7), after = model.at(event.t + 1e-7);
    close(after.baseVelocity, -wallE * before.baseVelocity, 2e-5, 'wall restitution');
    if (wallE < 1) assert.ok(after.dissipated > 0);
    else close(after.dissipated, 0);
  }
});

test('a sufficiently distant wall leaves the original free-groove trajectory unchanged', () => {
  const wall = wallGroove({ wallGap: 4 }), free = arc('dropgroove');
  for (let i = 0; i <= 40; i++) {
    const a = wall.at(i * .15), b = free.at(i * .15);
    close(a.base, b.base, 2e-7); close(a.object, b.object, 2e-7); close(a.height, b.height, 2e-7);
    close(a.wallCollisions, 0); close(a.momentum, 0, 1e-8);
  }
});

test('wall groove supports long playback, backward seeks and extreme UI mass ratios', () => {
  for (const params of [{}, { h: 0 }, { wallGap: .3, wallE: 1 }, { M: .2, m: 30, R: .3, h: 8, wallGap: .01, wallE: 1 }, { M: 30, m: .2, R: 5, h: 0 }]) {
    const model = wallGroove(params), expected = JSON.stringify(model.at(.731));
    for (const t of [2, 10, 120]) {
      const p = model.at(t);
      assert.ok(p.base >= model.wallLimit - 1e-8);
      close(p.energy + p.dissipated, model.energy0, 1e-7 * Math.max(1, model.energy0));
    }
    assert.equal(JSON.stringify(model.at(.731)), expected);
  }
});

test('arbitrary seek order and long playback produce repeatable states', () => {
  for (const kind of ['quarter', 'dropgroove', 'spring2', 'spring3']) {
    const model = kind === 'quarter' || kind === 'dropgroove' ? arc(kind) : spring(kind, kind === 'spring3' ? { mode: 'collision', vB: 0 } : {});
    const t = Math.min(3.137, model.duration * .4), expected = JSON.stringify(model.at(t));
    model.at(Number.isFinite(model.duration) ? model.duration : 120);
    model.at(.0123);
    assert.equal(JSON.stringify(model.at(t)), expected, `${kind} seek reproducibility`);
    if (!Number.isFinite(model.duration)) invariants(model, [120], 2e-3);
  }
});
