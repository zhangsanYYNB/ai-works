'use strict';
// Run: node --test math_solver/tests/system-numeric.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const api = require('../js/system-numeric.js');
const { search } = api;

function solve(dimensions, equations, evaluate, options = {}) {
  let calls = 0;
  const result = search({ dimensions, equations, lower: -4, upper: 4,
    evaluate(point) { calls++; return evaluate(point); }, ...options });
  assert.equal(result.evaluations, calls);
  assert.ok(result.evaluations <= (options.maxEvaluations ?? 20000));
  assert.ok(result.starts <= (options.maxStarts ?? 160));
  for (const root of result.roots) {
    assert.equal(root.values.length, dimensions);
    assert.equal(root.rank, dimensions);
    assert.ok(Number.isFinite(root.residual) && root.residual <= 1e-9);
    assert.ok(root.values.every(value => Number.isFinite(value) &&
      value >= (options.lower ?? -4) && value <= (options.upper ?? 4)));
  }
  return result;
}

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected);
}

test('frozen CommonJS API and a standalone globalThis UMD export', () => {
  assert.ok(Object.isFrozen(api));
  assert.deepEqual(Object.keys(api), ['search']);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/system-numeric.js'), 'utf8'), context);
  assert.equal(vm.runInContext('typeof MathSolverSystemNumeric.search', context), 'function');
  assert.equal(vm.runInContext('Object.isFrozen(MathSolverSystemNumeric)', context), true);
  const result = vm.runInContext('MathSolverSystemNumeric.search({ dimensions: 1, equations: 1, lower: -2, upper: 2, evaluate: p => [p[0] - 0.25], maxStarts: 8 })', context);
  assert.equal(result.roots.length, 1);
  near(result.roots[0].values[0], 0.25);
});

test('circle plus line finds both isolated roots without rounding them', () => {
  const result = solve(2, 2, ([x, y]) => [x * x + y * y - 1, x - y]);
  assert.equal(result.roots.length, 2);
  assert.equal(result.rankDeficient, false);
  for (const [index, root] of result.roots.entries()) {
    const expected = (index ? 1 : -1) / Math.sqrt(2);
    near(root.values[0], expected);
    near(root.values[1], expected);
    assert.ok(Math.abs(root.values[0] ** 2 + root.values[1] ** 2 - 1) < 1e-12);
  }
});

test('sin(x)-y and x+y-c form regular transcendental systems', () => {
  for (const offset of [0, 1]) {
    const result = solve(2, 2, ([x, y]) => [Math.sin(x) - y, x + y - offset]);
    assert.equal(result.roots.length, 1);
    const [x, y] = result.roots[0].values;
    near(x, offset ? 0.5109734293885692 : 0);
    near(Math.sin(x), y, 1e-12);
    near(x + y, offset, 1e-12);
  }
});

test('sin(x)+y=1 with a circle merges the rounded plateau near (0,1)', () => {
  const result = solve(2, 2, ([x, y]) => [Math.sin(x) + y - 1, x * x + y * y - 1],
    { lower: -10, upper: 10 });
  assert.equal(result.roots.length, 2);
  assert.equal(result.rankDeficient, false);
  near(result.roots[0].values[0], 0);
  near(result.roots[0].values[1], 1);
  near(result.roots[1].values[0], 0.986106064162781);
  near(result.roots[1].values[1], 0.16611691732448353);
});

test('exp(x)+y=3, x+y=2 flags the touching zero instead of enumerating a plateau', () => {
  const result = solve(2, 2, ([x, y]) => [Math.exp(x) + y - 3, x + y - 2],
    { lower: -10, upper: 10 });
  assert.deepEqual(result.roots, []);
  assert.equal(result.rankDeficient, true);
});

test('rectangular consistent systems converge, inconsistent systems have no roots', () => {
  const consistent = solve(2, 3, ([x, y]) => [x + y - 1, x - y, 3 * (x + y - 1)]);
  assert.equal(consistent.roots.length, 1);
  near(consistent.roots[0].values[0], 0.5);
  near(consistent.roots[0].values[1], 0.5);
  const inconsistent = solve(2, 3, ([x, y]) => [x + y - 1, x - y, x + y - 2]);
  assert.deepEqual(inconsistent.roots, []);
  assert.equal(inconsistent.rankDeficient, false);
});

test('weak but regular linear intersections remain searchable', () => {
  const result = solve(2, 2, ([x, y]) => [x + y - 1, x + (1 + 1e-5) * y - (1 + 7e-6)],
    { maxStarts: 24 });
  assert.equal(result.roots.length, 1);
  assert.equal(result.rankDeficient, false);
  near(result.roots[0].values[0], 0.3, 1e-8);
  near(result.roots[0].values[1], 0.7, 1e-8);
});

test('bounds apply to every evaluation, including differences and boundary roots', () => {
  let outOfBounds = 0;
  const boundary = solve(2, 2, point => {
    if (!point.every(value => value >= 0 && value <= 2)) outOfBounds++;
    return [point[0], point[1] - 2];
  }, { lower: 0, upper: 2 });
  assert.equal(outOfBounds, 0);
  assert.equal(boundary.roots.length, 1);
  assert.deepEqual(boundary.roots[0].values, [0, 2]);
  const excluded = solve(2, 2, ([x, y]) => [x - 3, y - 1], { lower: 0, upper: 2 });
  assert.deepEqual(excluded.roots, []);
});

test('small local seeds retain small roots inside a very wide interval', () => {
  const result = solve(2, 2, ([x, y]) => [x * x + y * y - 1, x - y], { lower: -1e12, upper: 1e12 });
  assert.equal(result.roots.length, 2);
  near(result.roots[0].values[0], -Math.SQRT1_2);
  near(result.roots[1].values[0], Math.SQRT1_2);
});

test('independent row scaling by 1e-100 preserves roots, rejects tiny nonzeros', () => {
  const scaled = solve(2, 2, ([x, y]) => [1e-100 * (x * x + y * y - 1), x - y]);
  assert.equal(scaled.roots.length, 2);
  near(scaled.roots[0].values[0], -Math.SQRT1_2);
  near(scaled.roots[1].values[0], Math.SQRT1_2);
  const falseRoot = solve(1, 1, ([x]) => [1e-100 * (2 + Math.sin(x))], { lower: -10, upper: 10 });
  assert.deepEqual(falseRoot.roots, []);
  const inconsistent = solve(1, 2, ([x]) => [x - 1, 1e-100 * (x - 2)]);
  assert.deepEqual(inconsistent.roots, []);
});

test('variable/column scales accommodate eight variables and sixteen mixed-scale rows', () => {
  const target = [1e-6, 1e5, -2, 0.25, -1e4, 3, 0.001, -0.75];
  const scales = [1e-100, 1e100, 1e-30, 1e30, 1e-70, 1e70, 1e-10, 1e10];
  const result = solve(8, 16, point => {
    const rows = point.map((value, j) => scales[j] * (value - target[j]));
    return rows.concat(rows.map((value, j) => (j + 1) * value));
  }, { lower: -1e6, upper: 1e6 });
  assert.equal(result.roots.length, 1);
  result.roots[0].values.forEach((value, j) => near(value, target[j], 1e-9 * Math.max(1, Math.abs(target[j]))));
});

test('null, thrown, nonreal, malformed and nonfinite values are invalid samples', () => {
  const result = solve(1, 1, ([x]) => {
    if (x === 0) throw new Error('undefined at zero');
    if (x < 0) return null;
    return [1 / x - 1];
  });
  assert.equal(result.roots.length, 1);
  near(result.roots[0].values[0], 1);
  for (const output of [null, [], [NaN], [Infinity], [undefined], [{ re: 0, im: 1 }], ['0']]) {
    const invalid = solve(1, 1, () => output, { maxEvaluations: 24, maxStarts: 8 });
    assert.deepEqual(invalid.roots, []);
  }
});

test('positive flat minima and asymptotic residuals never become isolated roots', () => {
  for (const offset of [0, 0.123456789]) {
    const flat = solve(1, 1, ([x]) => [(x - offset) ** 2 + 1e-20], { lower: -1, upper: 1 });
    assert.deepEqual(flat.roots, []);
  }
  const exponential = solve(1, 1, ([x]) => [Math.exp(x)], { lower: -1000, upper: 1 });
  assert.deepEqual(exponential.roots, []);
  const reciprocal = solve(1, 1, ([x]) => [1 / x], { lower: 1, upper: 1e15 });
  assert.deepEqual(reciprocal.roots, []);
});

test('close regular roots remain distinct at local numerical precision', () => {
  for (const radius of [1e-10, 1e-16]) {
    const result = solve(1, 1, ([x]) => [x * x - radius * radius], { lower: -1, upper: 1 });
    assert.equal(result.roots.length, 2);
    near(result.roots[0].values[0], -radius, radius * 1e-3);
    near(result.roots[1].values[0], radius, radius * 1e-3);
    assert.ok(result.roots[0].values[0] < 0 && result.roots[1].values[0] > 0);
  }
});

test('dependent and underdetermined zero sets are flagged, not enumerated', () => {
  for (const [equations, evaluate] of [
    [2, ([x, y]) => [x + y - 1, 2 * (x + y - 1)]],
    [1, ([x, y]) => [x + y - 1]],
    [2, ([x, y]) => [x * x + y * y - 1, 2 * (x * x + y * y - 1)]],
    [2, () => [0, 0]]
  ]) {
    const result = solve(2, equations, evaluate);
    assert.deepEqual(result.roots, []);
    assert.equal(result.rankDeficient, true);
  }
  const repeated = solve(1, 1, ([x]) => [x * x], { lower: -1, upper: 1 });
  assert.deepEqual(repeated.roots, []);
  assert.equal(repeated.rankDeficient, true);
  const mixed = solve(2, 2, ([x, y]) => {
    const circle = x * x + y * y - 1;
    return [circle * (x - 2), circle * (y - 2)];
  }, { maxStarts: 48 });
  assert.equal(mixed.rankDeficient, true);
  assert.equal(mixed.roots.length, 1);
  near(mixed.roots[0].values[0], 2);
  near(mixed.roots[0].values[1], 2);
});

test('callback budgets are strict for differences, invalid samples and validation', () => {
  for (const maxEvaluations of [0, 1, 2, 3, 7, 11, 37]) {
    let calls = 0;
    const result = search({ dimensions: 2, equations: 2, lower: -2, upper: 2,
      maxEvaluations, maxStarts: 100, evaluate([x, y]) { calls++; return [x - 0.3, y + 0.7]; } });
    assert.equal(result.evaluations, calls);
    assert.ok(calls <= maxEvaluations);
    assert.equal(result.limited, true);
  }
  const exactBudget = solve(2, 2, ([x, y]) => [x, y], {
    lower: -1, upper: 1, maxEvaluations: 10, maxStarts: 1
  });
  assert.equal(exactBudget.evaluations, 10);
  assert.equal(exactBudget.roots.length, 1);
  let calls = 0;
  const invalid = search({ dimensions: 1, equations: 1, lower: -2, upper: 2,
    maxEvaluations: 9, maxStarts: 100, evaluate() { calls++; throw new Error('hole'); } });
  assert.equal(calls, 9);
  assert.equal(invalid.evaluations, 9);
  assert.equal(invalid.starts, 9);
  assert.equal(invalid.limited, true);
  for (const option of ['maxStarts', 'maxSolutions']) {
    const zero = solve(1, 1, ([x]) => [x], { [option]: 0 });
    assert.equal(zero.evaluations, 0);
    assert.equal(zero.starts, 0);
    assert.equal(zero.limited, true);
  }
  const oneStart = solve(1, 1, ([x]) => [Math.cos(x) - x], { maxStarts: 1 });
  assert.equal(oneStart.starts, 1);
  assert.equal(oneStart.roots.length, 1);
  const oneSolution = solve(1, 1, ([x]) => [x * x - 1], { maxSolutions: 1 });
  assert.equal(oneSolution.roots.length, 1);
  assert.equal(oneSolution.limited, true);
});

test('selected points are evaluated again before acceptance; callback mutation is isolated', () => {
  let centerVisits = 0;
  const rejected = solve(1, 1, ([x]) => {
    if (x === 0 && ++centerVisits > 1) return null;
    return [x];
  }, { lower: -1, upper: 1, maxStarts: 1 });
  assert.ok(centerVisits >= 2);
  assert.deepEqual(rejected.roots, []);
  const mutated = solve(1, 1, point => {
    const value = point[0] - 0.25;
    point[0] = Infinity;
    return [value];
  });
  assert.equal(mutated.roots.length, 1);
  near(mutated.roots[0].values[0], 0.25);
});

test('option validation rejects unbounded or malformed requests before evaluating', () => {
  let calls = 0;
  const options = { dimensions: 1, equations: 1, lower: -1, upper: 1, evaluate() { calls++; return [0]; } };
  for (const invalid of [
    { dimensions: 0 }, { dimensions: 9 }, { equations: 0 }, { equations: 17 },
    { lower: -Infinity }, { upper: Infinity }, { lower: 1 }, { upper: -2 },
    { maxEvaluations: NaN }, { maxEvaluations: -1 }, { maxStarts: Infinity },
    { maxStarts: 0.5 }, { maxSolutions: -1 }, { evaluate: null }
  ]) assert.throws(() => search({ ...options, ...invalid }));
  assert.throws(() => search(null));
  assert.equal(calls, 0);
});
