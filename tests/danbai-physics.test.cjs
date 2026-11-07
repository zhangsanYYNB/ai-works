'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const physics = require('../danbai/physics.js');

const close = (actual, expected, tolerance = 1e-10, label = '') => {
  assert.ok(Number.isFinite(actual), `${label} should be finite: ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != ${expected}`);
};

test('browser script exposes window.PendulumPhysics without CommonJS', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'danbai', 'physics.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, Math, Number, Object, Array });
  assert.equal(typeof window.PendulumPhysics.compute, 'function');
  assert.equal(window.PendulumPhysics.DEFAULTS.model, 'double');
});

test('defaults and parameter descriptors preserve the original controls', () => {
  assert.deepEqual({
    g: physics.DEFAULTS.g, r: physics.DEFAULTS.r, ampDeg: physics.DEFAULTS.ampDeg,
    l: physics.DEFAULTS.l, alphaDeg: physics.DEFAULTS.alphaDeg, d: physics.DEFAULTS.d,
    l1: physics.DEFAULTS.l1, l2: physics.DEFAULTS.l2, R: physics.DEFAULTS.R,
    inclineL: physics.DEFAULTS.inclineL, inclineDeg: physics.DEFAULTS.inclineDeg,
    coneL: physics.DEFAULTS.coneL, coneThetaDeg: physics.DEFAULTS.coneThetaDeg
  }, {
    g: 9.8, r: 0.12, ampDeg: 14, l: 2, alphaDeg: 35, d: 1.2,
    l1: 2.2, l2: 1, R: 2.5, inclineL: 2, inclineDeg: 25,
    coneL: 2, coneThetaDeg: 25
  });
  assert.deepEqual(Object.keys(physics.PARAMS).sort(), ['speed', 'g', 'r', 'ampDeg', 'l', 'alphaDeg', 'd', 'l1', 'l2', 'R', 'inclineL', 'inclineDeg', 'coneL', 'coneThetaDeg'].sort());
  for (const key of ['speed', 'g', 'r', 'ampDeg', 'l', 'alphaDeg', 'd', 'l1', 'l2', 'R', 'inclineL', 'inclineDeg', 'coneL', 'coneThetaDeg']) {
    const descriptor = physics.PARAMS[key];
    assert.deepEqual(Object.keys(descriptor).sort(), ['decimals', 'label', 'max', 'min', 'step', 'symbol', 'unit', 'value'].sort());
    assert.equal(descriptor.value, physics.DEFAULTS[key]);
    assert.match(descriptor.label, /[\u3400-\u9fff]/);
    assert.equal(typeof descriptor.symbol, 'string');
  }
  assert.equal(physics.DEFAULTS.theme, 'light');
  assert.equal(physics.DEFAULTS.autoRotate, false);
  assert.equal(physics.DEFAULTS.showAnnotations, true);
});

test('five models compute the original radius-corrected period formulas', () => {
  let s = { ...physics.DEFAULTS };
  let p = physics.compute(s);
  close(p.h, 2 * Math.sin(35 * Math.PI / 180));
  close(p.L, p.h + 0.12);
  close(p.T, 2 * Math.PI * Math.sqrt(p.L / 9.8));
  assert.equal(p.mode, 'classic');

  s.hangOn = true;
  p = physics.compute(s);
  close(p.L, p.h + 1.2 + 0.12);
  assert.equal(p.mode, 'normal');
  s.hangMode = 'side';
  p = physics.compute(s);
  close(p.L, 1.2 + 0.12);
  assert.equal(p.mode, 'side');

  s = { ...physics.DEFAULTS, model: 'fold' };
  p = physics.compute(s);
  close(p.L1, 2.2 + 0.12);
  close(p.L2, 1 + 0.12);
  close(p.T, Math.PI * (Math.sqrt(p.L1 / p.g) + Math.sqrt(p.L2 / p.g)));
  close(p.halfLong, Math.PI * Math.sqrt(p.L1 / p.g));
  close(p.halfShort, Math.PI * Math.sqrt(p.L2 / p.g));
  close(p.A1, p.A);
  close(p.A2, p.A1 * Math.sqrt(p.L1 / p.L2));
  close(p.omega1, Math.sqrt(p.g / p.L1));
  close(p.omega2, Math.sqrt(p.g / p.L2));

  s = { ...physics.DEFAULTS, model: 'arc' };
  p = physics.compute(s);
  close(p.L, 2.5 - 0.12);
  close(p.T, 2 * Math.PI * Math.sqrt(p.L / p.g));

  s = { ...physics.DEFAULTS, model: 'incline' };
  p = physics.compute(s);
  close(p.L, 2 + 0.12);
  close(p.geff, 9.8 * Math.sin(25 * Math.PI / 180));
  close(p.T, 2 * Math.PI * Math.sqrt(p.L / p.geff));

  s = { ...physics.DEFAULTS, model: 'cone' };
  p = physics.compute(s);
  close(p.L, 2 + 0.12);
  close(p.hCone, p.L * Math.cos(25 * Math.PI / 180));
  close(p.rCirc, p.L * Math.sin(25 * Math.PI / 180));
  close(p.omega, Math.sqrt(p.g / p.hCone));
  close(p.T, 2 * Math.PI * Math.sqrt(p.hCone / p.g));
  assert.equal(p.geff, null);
});

test('normalization is in-place, bounded, and compute uses identical effective values', () => {
  const state = {
    model: 'fold', g: NaN, r: Infinity, ampDeg: 999, l1: 1.05, l2: 99,
    alphaDeg: -100, speed: -5, t: Infinity, theme: 'invalid', hangMode: 'invalid'
  };
  const normalized = physics.normalize(state);
  assert.equal(normalized, state);
  assert.equal(state.g, physics.PARAMS.g.value);
  assert.equal(state.r, physics.PARAMS.r.value);
  close(state.l2, state.l1 - 0.2);
  assert.ok(state.ampDeg <= physics.limits(state).ampDeg.max);
  assert.equal(state.speed, 0.25);
  assert.equal(state.t, 0);
  assert.equal(state.theme, 'light');
  assert.equal(state.hangMode, 'normal');

  const raw = { ...state, g: 4.35, r: 0.18, l1: 2.3, l2: 1.4, ampDeg: 7.3 };
  const before = { ...raw };
  const computed = physics.compute(raw);
  assert.deepEqual(raw, before, 'compute must not mutate its input');
  const normalizedRaw = { ...raw };
  physics.normalize(normalizedRaw);
  const computedNormalized = physics.compute(normalizedRaw);
  for (const key of ['g', 'r', 'A', 'l1', 'l2', 'L1', 'L2', 'T', 'A1', 'A2']) {
    close(computed[key], computedNormalized[key], 1e-12, key);
  }
});

test('fold limits expose rounded dynamic bounds and keep both amplitudes within 18 degrees', () => {
  const state = { ...physics.DEFAULTS, model: 'fold', l1: 3, l2: 0.4, ampDeg: 18 };
  const bounds = physics.limits(state);
  assert.deepEqual(Object.keys(bounds).sort(), ['ampDeg', 'l2']);
  assert.deepEqual(Object.keys(bounds.ampDeg).sort(), ['max', 'min']);
  assert.deepEqual(Object.keys(bounds.l2).sort(), ['max', 'min']);
  close(bounds.l2.max, 2);
  close(bounds.ampDeg.max, Math.floor(18 * Math.sqrt((0.4 + 0.12) / (3 + 0.12)) * 10) / 10);
  physics.normalize(state);
  const p = physics.compute(state);
  assert.ok(p.A1 <= 18 * Math.PI / 180 + 1e-12);
  assert.ok(p.A2 <= 18 * Math.PI / 180 + 1e-12);

  const constrained = { ...physics.DEFAULTS, model: 'fold', l1: 1.05, l2: 2 };
  close(physics.limits(constrained).l2.max, 0.85);
  physics.normalize(constrained);
  close(constrained.l2, 0.85);
});

function foldPoint(angle, side, p) {
  if (side === 'short') {
    return { x: p.L2 * Math.sin(angle), y: -(p.L1 - p.L2) - p.L2 * Math.cos(angle) };
  }
  return { x: p.L1 * Math.sin(angle), y: -p.L1 * Math.cos(angle) };
}

function foldVelocity(sample, side, p) {
  const length = side === 'short' ? p.L2 : p.L1;
  return {
    x: length * Math.cos(sample.angle) * sample.angularVelocity,
    y: length * Math.sin(sample.angle) * sample.angularVelocity
  };
}

test('fold switches at physical half periods with continuous projected position and line velocity', () => {
  const state = { ...physics.DEFAULTS, model: 'fold' };
  const p = physics.compute(state);
  const epsilon = 1e-7;
  const before = physics.sample(state, p, p.halfShort - epsilon);
  const at = physics.sample(state, p, p.halfShort);
  const after = physics.sample(state, p, p.halfShort + epsilon);
  assert.equal(before.side, 'short');
  assert.equal(at.side, 'long');
  assert.equal(after.side, 'long');

  const pointBefore = foldPoint(before.angle, before.side, p);
  const pointAfter = foldPoint(after.angle, after.side, p);
  const velocityBefore = foldVelocity(before, before.side, p);
  const velocityAfter = foldVelocity(after, after.side, p);
  close(pointBefore.x, pointAfter.x, 1e-6, 'projected x');
  close(pointBefore.y, pointAfter.y, 1e-6, 'projected y');
  close(velocityBefore.x, velocityAfter.x, 1e-6, 'line velocity x');
  close(velocityBefore.y, velocityAfter.y, 1e-6, 'line velocity y');
  close(at.angle, 0, 1e-12);

  const longEnd = physics.sample(state, p, p.halfShort + p.halfLong);
  assert.equal(longEnd.side, 'short');
  close(longEnd.angle, 0, 1e-12);
});

test('absolute-time sampling is stable over long durations and large spans', () => {
  for (const model of ['double', 'fold', 'arc', 'incline', 'cone']) {
    const state = { ...physics.DEFAULTS, model };
    const p = physics.compute(state);
    for (const time of [0, 1e4, 1e9, Number.MAX_VALUE, -1e9]) {
      const sample = physics.sample(state, p, time);
      for (const value of Object.values(sample)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value), `${model} at ${time}: ${value}`);
      }
    }
  }
  const coneState = { ...physics.DEFAULTS, model: 'cone' };
  const cone = physics.compute(coneState);
  close(physics.sample(coneState, cone, 2).angle, cone.omega * 2);
  assert.equal(physics.sample(coneState, cone, 2).angleLabel, 'φ');

  const ordinaryState = { ...physics.DEFAULTS, model: 'arc' };
  const ordinary = physics.compute(ordinaryState);
  const ordinaryCopy = { ...ordinary };
  const sampleState = { ...ordinaryState };
  const stateCopy = { ...sampleState };
  const sample = physics.sample(sampleState, ordinary, 0.4);
  assert.deepEqual(sampleState, stateCopy);
  assert.deepEqual(ordinary, ordinaryCopy);
  close(sample.angle, ordinary.A * Math.sin(Math.sqrt(ordinary.geff / ordinary.L) * 0.4));
  close(sample.angularVelocity, ordinary.A * Math.sqrt(ordinary.geff / ordinary.L) * Math.cos(Math.sqrt(ordinary.geff / ordinary.L) * 0.4));
  assert.equal(sample.angleLabel, 'θ');
});

test('invalid parameter objects and times never produce NaN', () => {
  const invalid = {
    model: 'not-a-model', g: 'bad', r: null, ampDeg: NaN, l: -Infinity,
    alphaDeg: Infinity, d: undefined, l1: -100, l2: Infinity, R: NaN,
    inclineL: 'bad', inclineDeg: -Infinity, coneL: NaN, coneThetaDeg: Infinity,
    speed: NaN, t: NaN
  };
  const result = physics.compute(invalid);
  for (const value of Object.values(result)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  for (const model of ['double', 'fold', 'arc', 'incline', 'cone']) {
    const state = { ...invalid, model };
    const normalized = physics.normalize(state);
    const p = physics.compute(state);
    const sample = physics.sample(normalized, p, NaN);
    for (const value of Object.values(sample)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${model}: ${value}`);
    }
  }
});
