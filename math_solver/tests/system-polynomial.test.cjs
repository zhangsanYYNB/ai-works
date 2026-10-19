'use strict';
// Run: node --test math_solver/tests/system-polynomial.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const solver = require('../js/system-polynomial.js');

// Rows are [coefficient, power of x, power of y, ...].
const p = rows => rows.map(([coefficient, ...powers]) => ({ powers, coefficient: String(coefficient) }));
const solve = (dimensions, polynomials, limits = {}) => solver.basis({ dimensions, polynomials, ...limits });
function chineseError(action, pattern) {
  assert.throws(action, error => error instanceof Error && /[\u3400-\u9fff]/.test(error.message)
    && (!pattern || pattern.test(error.message)));
}
function evaluate(poly, values) {
  return poly.reduce((sum, term) => {
    const [n, d = '1'] = term.coefficient.split('/');
    return sum + Number(n) / Number(d) * term.powers.reduce((v, power, i) => v * values[i] ** power, 1);
  }, 0);
}

const circle = [p([[1, 2, 0], [1, 0, 2], [-5, 0, 0]]), p([[1, 1, 1], [-2, 0, 0]])];
const circleBasis = [
  p([[1, 1, 0], ['1/2', 0, 3], ['-5/2', 0, 1]]),
  p([[1, 0, 4], [-5, 0, 2], [4, 0, 0]])
];
const sharedLeading = [p([[1, 2, 0], [1, 0, 2], [-1, 0, 0]]), p([[1, 2, 0], [-1, 0, 1]])];
const sharedLeadingBasis = [p([[1, 2, 0], [-1, 0, 1]]), p([[1, 0, 2], [1, 0, 1], [-1, 0, 0]])];
const degenerate = [p([[1, 1, 1]]), p([[1, 1, 0], [1, 0, 1], [-1, 0, 0]])];
const degenerateBasis = [p([[1, 1, 0], [1, 0, 1], [-1, 0, 0]]), p([[1, 0, 2], [-1, 0, 1]])];

test('CommonJS exports only a frozen basis API; output contains no BigInt', () => {
  assert.ok(Object.isFrozen(solver));
  assert.deepEqual(Object.keys(solver), ['basis']);
  assert.equal(typeof solver.basis, 'function');
  const result = solve(2, circle);
  assert.deepEqual(Object.keys(result).sort(), ['operations', 'polynomials']);
  assert.ok(Number.isSafeInteger(result.operations) && result.operations > 0 && result.operations <= 40000);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('UMD globalThis works in a browser/worker-like context without require', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../js/system-polynomial.js'), 'utf8'), context, { timeout: 1000 });
  assert.equal(vm.runInContext('Object.isFrozen(globalThis.MathSolverSystemPolynomial)', context), true);
  const result = vm.runInContext('MathSolverSystemPolynomial.basis({ dimensions: 2, polynomials: '
    + JSON.stringify(circle) + ' })', context, { timeout: 1000 });
  assert.deepEqual(JSON.parse(JSON.stringify(result.polynomials)), circleBasis);
});

test('x²+y²=5, xy=2 yields a reduced triangular lex basis and all four solutions', () => {
  const result = solve(2, circle);
  assert.deepEqual(result.polynomials, circleBasis);
  for (const values of [[2, 1], [1, 2], [-2, -1], [-1, -2]]) {
    for (const poly of [...circle, ...result.polynomials]) assert.equal(evaluate(poly, values), 0);
  }
});

test('x²+y²=1, x²=y retains constraints from both original generators', () => {
  assert.deepEqual(solve(2, sharedLeading).polynomials, sharedLeadingBasis);
  assert.deepEqual(solve(2, [...sharedLeading].reverse()).polynomials, sharedLeadingBasis);
});

test('three elementary symmetric equations yield the six permutations of (1,2,3)', () => {
  const input = [
    p([[1, 1, 0, 0], [1, 0, 1, 0], [1, 0, 0, 1], [-6, 0, 0, 0]]),
    p([[1, 1, 1, 0], [1, 1, 0, 1], [1, 0, 1, 1], [-11, 0, 0, 0]]),
    p([[1, 1, 1, 1], [-6, 0, 0, 0]])
  ];
  const expected = [
    input[0],
    p([[1, 0, 2, 0], [1, 0, 1, 1], [-6, 0, 1, 0], [1, 0, 0, 2], [-6, 0, 0, 1], [11, 0, 0, 0]]),
    p([[1, 0, 0, 3], [-6, 0, 0, 2], [11, 0, 0, 1], [-6, 0, 0, 0]])
  ];
  for (const order of [[0, 1, 2], [2, 1, 0], [1, 0, 2]]) {
    const result = solve(3, order.map(i => input[i]));
    assert.deepEqual(result.polynomials, expected);
    for (const values of [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) {
      for (const poly of [...input, ...result.polynomials]) assert.equal(evaluate(poly, values), 0);
    }
  }
});

test('xy=0, x+y=1 keeps both degenerate branches', () => {
  for (const input of [degenerate, [...degenerate].reverse()]) {
    const result = solve(2, input);
    assert.deepEqual(result.polynomials, degenerateBasis);
    for (const values of [[0, 1], [1, 0]]) {
      for (const poly of result.polynomials) assert.equal(evaluate(poly, values), 0);
    }
  }
});

test('contradictions found initially or through S-polynomials return exactly [1]', () => {
  const expected = [p([[1, 0, 0]])];
  for (const input of [
    [p([['-6/8', 0, 0]])],
    [p([[1, 1, 1], [-1, 0, 0]]), p([[1, 1, 1]])],
    [p([[1, 1, 1], [-1, 0, 0]]), p([[1, 1, 0]])],
    [p([[1, 1, 1], [-1, 0, 0]]), p([[1, 2, 1]])]
  ]) assert.deepEqual(solve(2, input).polynomials, expected);
});

test('a removable-looking generator can force x=y=1', () => {
  const input = [p([[1, 1, 1], [-1, 0, 0]]), p([[1, 0, 2], [-1, 0, 1]])];
  const expected = [p([[1, 1, 0], [-1, 0, 0]]), p([[1, 0, 1], [-1, 0, 0]])];
  assert.deepEqual(solve(2, input).polynomials, expected);
});

test('positive-dimensional ideals and non-radical multiplicities are preserved', () => {
  const family = [p([[1, 1, 1, 0]]), p([[1, 1, 0, 1]])];
  assert.deepEqual(solve(3, family).polynomials, family);
  const nonRadical = [p([[1, 2, 0]]), p([[1, 1, 1]]), p([[1, 0, 2]])];
  assert.deepEqual(solve(2, nonRadical).polynomials, nonRadical);
  assert.deepEqual(solve(2, [p([[1, 1, 1]])]).polynomials, [p([[1, 1, 1]])]);
});

test('empty and zero ideals, including cancelling terms, return []', () => {
  assert.deepEqual(solve(2, [], { maxOperations: 0, maxTerms: 0, maxPolynomials: 0, maxDegree: 0 }),
    { polynomials: [], operations: 0 });
  assert.deepEqual(solve(2, [[], p([['0/7', 2, 0]]), p([['2/3', 1, 1], ['-4/6', 1, 1]])]).polynomials, []);
  assert.deepEqual(solve(0, [p([['0']])]).polynomials, []);
  assert.deepEqual(solve(0, [p([['2/3']])]).polynomials, [p([[1]])]);
});

test('normalization combines repeated powers, signs and reducible fractions exactly', () => {
  const input = [p([['-6/9', 0, 1], ['-4/-6', 1, 0], ['+1/3', 1, 0], ['5/10', 0, 0], ['-1/2', 0, 0]])];
  assert.deepEqual(solve(2, input).polynomials, [p([[1, 1, 0], ['-2/3', 0, 1]])]);
  assert.deepEqual(solve(2, [p([[' 6 / 4 ', 1, 0], ['-9/8', 0, 1]])]).polynomials,
    [p([[1, 1, 0], ['-3/4', 0, 1]])]);
});

test('lex order prioritizes powers[0] over total degree and follows variable permutations', () => {
  assert.deepEqual(solve(2, [p([[1, 0, 5], [1, 1, 0]])]).polynomials, [p([[1, 1, 0], [1, 0, 5]])]);
  const input = [p([[1, 1, 0], [-1, 0, 2]]), p([[1, 0, 3], [-2, 0, 0]])];
  assert.deepEqual(solve(2, input).polynomials, input);
  const swapped = input.map(poly => poly.map(term => ({ ...term, powers: [...term.powers].reverse() })));
  assert.deepEqual(solve(2, swapped).polynomials,
    [p([[1, 1, 0], ['-1/2', 0, 2]]), p([[1, 0, 3], [-4, 0, 0]])]);
});

test('duplicate generators and leading-divisible generators reduce to the same canonical basis', () => {
  const input = [...sharedLeading, sharedLeading[0], p([[2, 2, 0], [-2, 0, 1]]), []];
  assert.deepEqual(solve(2, input).polynomials, sharedLeadingBasis);
  assert.deepEqual(solve(2, sharedLeadingBasis).polynomials, sharedLeadingBasis);
});

test('univariate Euclidean elimination and rational constants stay exact beyond Number precision', () => {
  assert.deepEqual(solve(1, [p([[1, 3], [-1, 1]]), p([[1, 2], [-1, 0]])]).polynomials,
    [p([[1, 2], [-1, 0]])]);
  assert.deepEqual(solve(1, [p([['9007199254740993', 1], ['-9007199254740992', 0]])]).polynomials,
    [p([[1, 1], ['-9007199254740992/9007199254740993', 0]])]);
});

test('nontrivial rational S-polynomials reduce exactly with fractional leading coefficients', () => {
  const input = [p([['3/7', 2, 0], ['27/28', 0, 2], ['-15/7', 0, 0]]),
    p([['-5/6', 1, 1], ['10/9', 0, 0]])];
  const expected = [p([[1, 1, 0], ['27/16', 0, 3], ['-15/4', 0, 1]]),
    p([[1, 0, 4], ['-20/9', 0, 2], ['64/81', 0, 0]])];
  assert.deepEqual(solve(2, input).polynomials, expected);
  assert.deepEqual(solve(2, [...input].reverse()).polynomials, expected);
});

test('product criterion skips coprime leading terms before forming an over-degree LCM', () => {
  const input = [p([[1, 2, 0, 0], [1, 0, 0, 1]]), p([[1, 0, 2, 0], [1, 0, 0, 1]])];
  assert.deepEqual(solve(3, input, { maxDegree: 2 }).polynomials, input);
});

// Elementary polynomial row operations are invertible and preserve the ideal.
// Check canonical answers after scrambling generators, rather than implementing
// a second Buchberger algorithm as the test oracle.
function addMultiple(target, source, shift, factor) {
  const terms = new Map();
  for (const [poly, multiplier, powers] of [[target, 1n, shift.map(() => 0)], [source, BigInt(factor), shift]]) {
    for (const term of poly) {
      const exponents = term.powers.map((power, i) => power + powers[i]);
      const key = exponents.join(',');
      const coefficient = (terms.get(key)?.value || 0n) + BigInt(term.coefficient) * multiplier;
      terms.set(key, { powers: exponents, value: coefficient });
    }
  }
  return [...terms.values()].filter(term => term.value !== 0n)
    .map(term => ({ powers: term.powers, coefficient: String(term.value) }));
}

test('36 invertible generator scramblings preserve exact reduced bases', () => {
  const families = [sharedLeadingBasis, degenerateBasis,
    [p([[1, 1, 0], [-1, 0, 2]]), p([[1, 0, 3], [-1, 0, 1], [-1, 0, 0]])]];
  let seed = 731;
  function next() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; }
  for (const expected of families) {
    for (let trial = 0; trial < 12; trial++) {
      const input = structuredClone(expected);
      for (let step = 0; step < 3; step++) {
        const i = next() % 2;
        const shift = [[0, 0], [1, 0], [0, 1]][next() % 3];
        input[i] = addMultiple(input[i], input[1 - i], shift, next() % 2 ? 1 : -2);
        input.reverse();
      }
      assert.deepEqual(solve(2, input).polynomials, expected, 'trial ' + trial);
    }
  }
});

test('input and previous output remain independent across calls', () => {
  const input = structuredClone(circle), snapshot = structuredClone(input);
  for (const poly of input) {
    for (const term of poly) { Object.freeze(term.powers); Object.freeze(term); }
    Object.freeze(poly);
  }
  Object.freeze(input);
  const first = solve(2, input);
  assert.deepEqual(input, snapshot);
  first.polynomials[0][0].powers[0] = 99;
  first.polynomials[0][0].coefficient = '999';
  assert.deepEqual(solve(2, input).polynomials, circleBasis);
});

test('operation budget is deterministic, counts final serialization, and can be set exactly', () => {
  const result = solve(2, circle);
  assert.deepEqual(solve(2, circle, { maxOperations: result.operations }), result);
  chineseError(() => solve(2, circle, { maxOperations: result.operations - 1 }), /预算/);
  chineseError(() => solve(2, circle, { maxOperations: 1 }), /预算/);
  chineseError(() => solve(1, [p([[1, 0]])], { maxOperations: 0 }), /预算/);
});

test('GCD iterations share the operation budget', () => {
  let a = 1n, b = 1n;
  for (let i = 0; i < 400; i++) [a, b] = [b, a + b];
  chineseError(() => solve(1, [p([[String(a) + '/' + String(b), 1]])], { maxOperations: 100 }), /预算/);
});

test('term limits cover input and intermediate S-polynomials', () => {
  chineseError(() => solve(2, circle, { maxTerms: 2 }), /项数/);
  const input = [p([[1, 2, 0], [1, 0, 1], [1, 0, 0]]), p([[1, 1, 1], [1, 0, 2], [1, 0, 0]])];
  chineseError(() => solve(2, input, { maxTerms: 3 }), /项数/);
});

test('polynomial limits cover both input and newly derived constraints', () => {
  chineseError(() => solve(2, circle, { maxPolynomials: 1 }), /数量/);
  chineseError(() => solve(2, circle, { maxPolynomials: 2 }), /中间多项式数量/);
});

test('degree limits cover total input degree, pair LCMs and shifted tails', () => {
  chineseError(() => solve(2, [p([[1, 2, 2]])], { maxDegree: 3 }), /总次数/);
  chineseError(() => solve(2, circle, { maxDegree: 2 }), /总次数/);
  const input = [p([[1, 2, 0], [1, 0, 4]]), p([[1, 1, 1], [1, 0, 0]])];
  chineseError(() => solve(2, input, { maxDegree: 4 }), /总次数/);
  assert.deepEqual(solve(1, [p([[1, 0]])], { maxDegree: 0 }).polynomials, [p([[1, 0]])]);
});

test('BigInt limits bound parsing and intermediate rational growth', () => {
  const tooLarge = String(1n << 4096n);
  chineseError(() => solve(1, [p([[tooLarge, 1]])]), /系数/);
  chineseError(() => solve(1, [p([['1/' + tooLarge, 1]])]), /系数/);
  chineseError(() => solve(1, [p([['9'.repeat(5000), 1]])]), /系数/);
  const large = String(1n << 4095n);
  chineseError(() => solve(2, [p([[large, 1, 0], ['1/' + large, 0, 1]])]), /系数/);
  assert.deepEqual(solve(2, [p([[large, 1, 0], [large, 0, 1]])]).polynomials, [p([[1, 1, 0], [1, 0, 1]])]);
  const almostOne = String((1n << 4095n) - 1n) + '/' + large;
  assert.deepEqual(solve(1, [p([['1/' + large, 1], [almostOne, 1]])]).polynomials, [p([[1, 1]])]);
});

test('malformed options, powers and rational coefficients fail with Chinese errors', () => {
  for (const options of [undefined, null, [], {}, { dimensions: -1, polynomials: [] },
    { dimensions: 1.5, polynomials: [] }, { dimensions: 1, polynomials: null },
    { dimensions: 1, polynomials: [null] }]) chineseError(() => solver.basis(options));
  for (const key of ['maxOperations', 'maxTerms', 'maxPolynomials', 'maxDegree']) {
    for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '40', null]) {
      chineseError(() => solve(1, [], { [key]: value }));
    }
  }
  for (const powers of [null, [1], [1, -1], [0.5, 0], [NaN, 0], [Number.MAX_SAFE_INTEGER + 1, 0], ['1', 0]]) {
    chineseError(() => solve(2, [[{ powers, coefficient: '1' }]]));
  }
  for (const coefficient of ['', '1/0', '0/0', '1.5', '1e3', '1/2/3', '1/', '--1', 2, null]) {
    chineseError(() => solve(1, [[{ powers: [1], coefficient }]]));
  }
});
