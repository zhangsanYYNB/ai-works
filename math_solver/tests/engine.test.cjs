'use strict';
// Run: node --test math_solver/tests/engine.test.cjs
// Uses only the local mathjs browser 14/15 and Nerdamer all 1.1.13 bundles.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../js/engine.js');
const math = require('../vendor/math.min.js');

function near(actual, expected, tolerance = 1e-9) {
  actual = typeof actual === 'number' ? actual : actual && actual.isComplex ? (assert.equal(actual.im, 0), actual.re) : Number(actual);
  assert.ok(Number.isFinite(actual), 'expected a finite real value, received ' + actual);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(Math.abs(expected), 1e-300), actual + ' != ' + expected);
}
function number(expr, scope = {}, options = {}) { return engine.evaluateAt(expr, scope, options); }
function contract(result) {
  for (const key of ['kind', 'title', 'input', 'normalized', 'answerLatex', 'answerText']) assert.equal(typeof result[key], 'string', key);
  assert.ok(result.answerText.length && result.answerLatex.length);
  assert.ok(result.approximate === null || typeof result.approximate === 'string');
  for (const key of ['steps', 'notes', 'graphs', 'related']) assert.ok(Array.isArray(result[key]), key);
  assert.ok(result.steps.every(s => typeof s.title === 'string' && typeof s.explanation === 'string' && typeof s.latex === 'string'));
  assert.ok(result.graphs.every(g => typeof g.expression === 'string' && typeof g.label === 'string'));
  assert.ok(result.related.every(r => typeof r.label === 'string' && typeof r.input === 'string' && typeof r.mode === 'string'));
  assert.doesNotThrow(() => JSON.stringify(result));
}
function rootValues(result) { return result.solutions.map(s => number(s.exact)).map(v => v && v.isComplex ? v : Number(v)); }
function statistic(result, label) {
  const row = result.table.rows.find(row => row[0] === label);
  assert.ok(row, 'missing statistic ' + label);
  return row[1];
}
function ChineseError(input, options, pattern) {
  assert.throws(() => engine.solve(input, options), error => error instanceof Error && /[\u3400-\u9fff]/.test(error.message) && (!pattern || pattern.test(error.message)));
}

// Input notation comes from both plain typing and MathLive's ASCII Math export.
test('normalization: unicode powers, π juxtaposition, roots and implicit multiplication', () => {
  assert.equal(engine.normalize('x² + 2πx − √(x+1)'), 'x^(2)+2*pi*x-sqrt(x+1)');
  assert.equal(engine.normalize('2(x+1)(x-1)'), '2*(x+1)*(x-1)');
  near(number('√(1+√(4))'), Math.sqrt(3));
  near(number('³√(-8)'), -2);
  near(number('2×3÷4'), 1.5);
  assert.equal(engine.normalize('αx+β'), 'alpha*x+beta');
});

test('MathLive ASCII roots, matrices, imaginary i and grouped/nested absolute bars', () => {
  near(number('root(3)(8)'), 2);
  near(number('root(3)(1+(1+1)^3)'), Math.cbrt(9));
  near(number('|x+|x-2||', { x: -3 }), 2);
  near(number('||x|-1|', { x: -3 }), 2);
  assert.deepEqual(number('[[1,2],[3,4]]').toArray(), [[1, 2], [3, 4]]);
  near(number('i^2'), -1);
});

test('negative power bases and exponent associativity survive every exact serializer', () => {
  const cases = [['(-2)^2', '4', 4], ['(-2)^3', '-8', -8], ['(-2)^-2', '1/4', 0.25],
    ['-2^2', '-4', -4], ['-(2+3)^2', '-25', -25], ['2^3^2', '512', 512], ['(2^3)^2', '64', 64],
    ['(-2)^(-2)^2', '16', 16], ['1/(-2)^2', '1/4', 0.25]];
  for (const [input, exact, expected] of cases) {
    const r = engine.solve(input);
    assert.equal(r.exact, exact, input);
    near(Number(r.approximate), expected);
    near(number(input), expected);
  }
  const expanded = engine.solve('(-x)^2', { mode: 'expand' });
  assert.equal(expanded.exact, 'x^2');
  near(number(expanded.exact, { x: -3 }), 9);
  const derivative = engine.solve('(-x)^2', { mode: 'derivative' });
  near(number(derivative.exact, { x: -3 }), -6);
  for (const graph of expanded.graphs) near(number(graph.expression, { x: -3 }), 9);
  assert.deepEqual(engine.solve('(-abs(x))^2<=1').solutions, [{ lower: '-1', upper: '1', lowerClosed: true, upperClosed: true }]);
  assert.equal(engine.solve('(-abs(x))^2/x^2', { mode: 'limit' }).exact, '1');
  assert.equal(engine.solve('-[1,-2;3,-4]', { mode: 'matrix' }).answerText, '[[-1, 2], [-3, 4]]');
});

test('nested LaTeX groups stay balanced (groupAt regression)', () => {
  near(number('\\frac{1}{\\frac{2}{3}}'), 1.5);
  near(number('\\sqrt[3]{1+(2+3)}'), Math.cbrt(6));
  const d = engine.solve('diff(sin((x+1)^2),x)');
  near(number(d.exact, { x: 0.3 }), 2 * 1.3 * Math.cos(1.3 ** 2));
});

test('fractions, percentages, scientific notation and explicit mod have distinct semantics', () => {
  const fraction = engine.solve('1/3+1/6');
  contract(fraction);
  assert.equal(fraction.exact, '1/2');
  near(Number(fraction.approximate), 0.5);
  assert.equal(engine.solve('50%').exact, '1/2');
  near(number('(2+3)%'), 0.05);
  near(number('1e-3%'), 0.00001);
  near(Number(engine.solve('mod(17,5)').approximate), 2);
  near(Number(engine.solve('mod(5.5,2)').approximate), 1.5);
});

test('large integer cancellation retains an exact answer', () => {
  assert.equal(engine.solve('9007199254740993-9007199254740992').exact, '1');
  const r = engine.solve('1e100+1-1e100');
  assert.equal(r.exact, '1');
  assert.equal(r.approximate, '1');
});

test('real and complex numeric operations', () => {
  const complex = engine.solve('(2+3i)*(1-2i)');
  const value = number(complex.exact);
  near(value.re, 8); near(value.im, -1);
  const square = engine.solve('sqrt(-16)');
  assert.equal(number(square.exact).im, 4);
  near(Number(engine.solve('re(2+3i)+im(4+5i)').approximate), 7);
  assert.equal(number('conj(2+3i)').im, -3);
});

test('tiny complex values stay complex and are never silently rounded to real zero', () => {
  const v = number('sqrt(-1e-30)');
  assert.equal(v.isComplex, true);
  near(v.im, 1e-15);
  assert.match(engine.solve('sqrt(-1e-30)').approximate, /i/);
  ChineseError('[sqrt(-1e-30),1]', { mode: 'statistics' }, /实数/);
});

test('factorial, exact nCr/nPr aliases, gcd/lcm, bases and hyperbolic functions', () => {
  assert.equal(engine.solve('5!').exact, '120');
  assert.equal(engine.solve('nCr(10,3)').exact, '120');
  assert.equal(engine.solve('nPr(8,3)').exact, '336');
  assert.equal(engine.solve('nCr(56,28)').exact, '7648690600760440');
  assert.equal(engine.solve('gcd(84,126,210)').exact, '42');
  assert.equal(engine.solve('lcm(12,18,24)').exact, '72');
  assert.equal(engine.solve('log(32,2)+ln(e^3)').exact, '8');
  near(Number(engine.solve('sinh(1)^2-cosh(1)^2').approximate), -1);
});

test('degree mode applies per trig operation and inverse function, not to the final answer', () => {
  const opts = { angle: 'deg' };
  near(Number(engine.solve('sin(30)+cos(60)', opts).approximate), 1);
  near(Number(engine.solve('sin(30)^2+cos(60)^2', opts).approximate), 0.5);
  assert.equal(engine.solve('asin(0.5)', opts).exact, '30');
  near(number('atan2(1,1)', {}, opts), 45);
  near(number('sin(x)+2*cos(x)', { x: 60 }, opts), Math.sqrt(3) / 2 + 1);
  near(number('sinh(1)', {}, opts), Math.sinh(1));
});

test('finite sums/products have a bound index and an explicit bounded range', () => {
  assert.equal(engine.solve('sum(k^2,k,1,10)').exact, '385');
  assert.equal(engine.solve('product(k,k,1,6)').exact, '720');
  near(number('sum(k*x,k,1,4)', { x: 2 }), 20);
  assert.equal(number('sum(k,k,4,1)'), 0);
  assert.equal(number('product(k,k,4,1)'), 1);
  ChineseError('sum(k,k,1,1000000)', {}, /200/);
});

test('linear/quadratic real equations produce exact roots and actual coefficient steps', () => {
  const linear = engine.solve('2x+3=7');
  assert.deepEqual(rootValues(linear), [2]);
  const quadratic = engine.solve('x^2-5x+6=0');
  contract(quadratic);
  assert.deepEqual(rootValues(quadratic), [2, 3]);
  assert.ok(quadratic.steps.some(s => /判别式/.test(s.title) && /1/.test(s.latex)));
  assert.equal(quadratic.graphs.length, 2);
  near(number(quadratic.graphs[0].expression, { x: 2 }), 0, 1e-8);
});

test('repeated and complex quadratic roots are distinct cases', () => {
  const repeated = engine.solve('x^2-2x+1=0');
  assert.equal(repeated.solutions.length, 1);
  assert.equal(repeated.solutions[0].multiplicity, 2);
  near(rootValues(repeated)[0], 1);
  const complex = engine.solve('x^2+2x+5=0');
  assert.equal(complex.solutions.length, 2);
  assert.ok(complex.solutions.every(s => s.real === false));
  const values = rootValues(complex);
  assert.ok(values.some(v => v.re === -1 && v.im === -2));
  assert.ok(values.some(v => v.re === -1 && v.im === 2));
  assert.ok(complex.graphs.every(g => !/\bi\b/.test(g.expression)));
});

test('tiny negative discriminants do not become repeated/real roots (Nerdamer regression)', () => {
  const result = engine.solve('x^2+1e-30=0');
  assert.equal(result.solutions.length, 2);
  assert.ok(result.solutions.every(s => s.real === false && s.multiplicity === 1));
  const values = rootValues(result);
  near(values[0].im, -1e-15); near(values[1].im, 1e-15);
  assert.equal(engine.solve('x^2+1e-30<=0').solutions.length, 0);
});

test('higher polynomials include verified real/complex roots and multiplicities', () => {
  const factored = engine.solve('x^3-6x^2+11x-6=0');
  assert.deepEqual(rootValues(factored), [1, 2, 3]);
  const repeated = engine.solve('(x-1)^3*(x+2)=0');
  assert.equal(repeated.solutions.find(s => s.exact === '1').multiplicity, 3);
  const numerical = engine.solve('x^5-x+1=0');
  assert.equal(numerical.solutions.length, 5);
  assert.ok(numerical.solutions.some(s => s.real === false));
  assert.ok(numerical.solutions.every(s => s.numerical));
  for (const root of numerical.solutions) {
    const v = number(root.exact);
    assert.ok(math.abs(number('x^5-x+1', { x: v })) < 1e-10);
  }
});

test('symbolic parameters are conditional and default variable inference is usable', () => {
  const result = engine.solve('a*x+b=0');
  assert.deepEqual(result.parameters, ['a', 'b']);
  near(number(result.solutions[0].exact, { a: 2, b: 6 }), -3);
  assert.match(result.notes.join(' '), /a.*≠ 0/);
  assert.ok(!result.notes.some(n => /复根/.test(n)));
  assert.equal(engine.solve('y+2=0').solutions[0].variable, 'y');
  near(rootValues(engine.solve('y+2=0'))[0], -2);
});

test('equations retain denominator exclusions and reject spurious cancelled roots', () => {
  const r = engine.solve('(x^2-1)/(x-1)=2');
  assert.equal(r.solutions.length, 0);
  assert.match(r.notes.join(' '), /排除.*1/);
  assert.equal(engine.solve('x^2+1=0').kind, 'equation');
  assert.match(engine.solve('x=x').answerText, /所有/);
  assert.equal(engine.solve('x=x+1').solutions.length, 0);
});

test('two/three variable systems perform real elimination and exact substitution', () => {
  const two = engine.solve('2x+y=7\nx-y=2');
  assert.deepEqual(two.solutions.map(s => Number(number(s.exact))), [3, 1]);
  assert.ok(two.steps.some(s => /消去/.test(s.title) && /R_/.test(s.latex)));
  assert.ok(two.steps.some(s => /代回/.test(s.title)));
  const three = engine.solve('x+y+z=6;2x-y+z=3;x+2y-z=2');
  assert.deepEqual(three.solutions.map(s => Number(number(s.exact))), [1, 2, 3]);
});

test('inconsistent and underdetermined systems are reported honestly', () => {
  assert.match(engine.solve('x+y=1;x+y=2').answerText, /无解/);
  const free = engine.solve('x+y=1;2x+2y=2');
  assert.deepEqual(free.parameters, ['t1']);
  const scope = { t1: 4 };
  const x = Number(number(free.solutions.find(s => s.variable === 'x').exact, scope));
  const y = Number(number(free.solutions.find(s => s.variable === 'y').exact, scope));
  near(x + y, 1);
});

test('polynomial and chained inequalities keep strict/non-strict endpoints', () => {
  assert.deepEqual(engine.solve('x^2-5x+6<=0').solutions, [{ lower: '2', upper: '3', lowerClosed: true, upperClosed: true }]);
  assert.deepEqual(engine.solve('0<x<=2').solutions, [{ lower: '0', upper: '2', lowerClosed: false, upperClosed: true }]);
  assert.deepEqual(engine.solve('x^2<=0').solutions, [{ lower: '0', upper: '0', lowerClosed: true, upperClosed: true }]);
  assert.equal(engine.solve('x^2<0').solutions.length, 0);
});

test('rational inequality holes remain excluded after cancellation, including repeated poles', () => {
  const r = engine.solve('(x^2-1)/(x-1)>=0');
  assert.deepEqual(r.solutions, [
    { lower: '-1', upper: '1', lowerClosed: true, upperClosed: false },
    { lower: '1', upper: 'Infinity', lowerClosed: false, upperClosed: false }
  ]);
  assert.match(r.notes.join(' '), /约分.*排除/);
  assert.ok(r.table.rows.length === 3);
  const pole = engine.solve('1/(x-2)^2>0');
  assert.equal(pole.solutions.length, 2);
  assert.ok(pole.solutions.every(s => !s.lowerClosed && !s.upperClosed));
});

test('near-zero real inequality roots remain separate', () => {
  const r = engine.solve('x^2-1e-30>0');
  assert.equal(r.solutions.length, 2);
  near(Number(number(r.solutions[0].upper)), -1e-15);
  near(Number(number(r.solutions[1].lower)), 1e-15);
  assert.ok(r.solutions.every(s => !s.lowerClosed && !s.upperClosed));
});

test('absolute value inequalities use actual branches', () => {
  assert.deepEqual(engine.solve('|x-1|<=2').solutions, [{ lower: '-1', upper: '3', lowerClosed: true, upperClosed: true }]);
  const outside = engine.solve('abs(x)>2');
  assert.equal(outside.solutions.length, 2);
  assert.equal(outside.solutions[0].upper, '-2');
  assert.equal(outside.solutions[1].lower, '2');
  ChineseError('abs(x)+abs(x-1)<2', {}, /绝对值|abs/);
});

test('algebra simplify, expand and factor preserve actual values and domain notes', () => {
  const simplified = engine.solve('(x^2-1)/(x-1)', { mode: 'simplify' });
  near(number(simplified.exact, { x: 3 }), 4);
  assert.match(simplified.notes.join(' '), /定义域.*ne0/);
  const expanded = engine.solve('(x+2)^4', { mode: 'expand' });
  near(number(expanded.exact, { x: -3 }), 1);
  const factored = engine.solve('x^3-x', { mode: 'factor' });
  near(number(factored.exact, { x: 2 }), 6);
  assert.ok(factored.steps.some(s => /展开验证/.test(s.title)));
});

test('incorrect Nerdamer root-containing simplify output is rejected (sign regression)', () => {
  const r = engine.solve('x^2+2*pi*x-sqrt(x+1)', { mode: 'simplify' });
  for (const x of [0.2, 1, 3]) near(number(r.exact, { x }), x * x + 2 * Math.PI * x - Math.sqrt(x + 1));
});

test('derivatives include product, chain, quotient, higher order and constant parameters', () => {
  const r = engine.solve('x*sin(x^2)', { mode: 'derivative' });
  near(number(r.exact, { x: 0.7 }), Math.sin(0.49) + 0.98 * Math.cos(0.49));
  assert.ok(r.steps.some(s => /乘积/.test(s.title)));
  assert.ok(r.steps.some(s => /链式/.test(s.title)));
  const q = engine.solve('x/(x+1)', { mode: 'derivative' });
  near(number(q.exact, { x: 2 }), 1 / 9);
  const second = engine.solve('x^4+sin(x)', { mode: 'derivative', order: 2 });
  near(number(second.exact, { x: 0.4 }), 12 * 0.16 - Math.sin(0.4));
  near(number(engine.solve('a*x^2', { mode: 'derivative' }).exact, { x: 3, a: 2 }), 12);
});

test('degree derivative and integral graphs use the same evaluator without double conversion', () => {
  const opts = { angle: 'deg' };
  const d = engine.solve('sin(x)', { mode: 'derivative', ...opts });
  near(number(d.exact, { x: 60 }), Math.PI / 360);
  near(number(d.graphs.find(g => /导数/.test(g.label)).expression, { x: 60 }, opts), Math.PI / 360);
  const primitive = engine.solve('sin(x)', { mode: 'integral', ...opts });
  near(number(primitive.graphs.find(g => /原函数/.test(g.label)).expression, { x: 60 }, opts), -90 / Math.PI);
  const definite = engine.solve('sin(x)', { mode: 'integral', angle: 'deg', lower: '0', upper: '180' });
  near(Number(definite.approximate), 360 / Math.PI);
});

test('symbolic integrals are checked by differentiation and include integration constants', () => {
  const r = engine.solve('3x^2+2x+1', { mode: 'integral' });
  assert.match(r.answerLatex, /\+C$/);
  assert.ok(r.steps.some(s => /幂函数/.test(s.title)));
  const d = engine.solve(r.exact, { mode: 'derivative' });
  near(number(d.exact, { x: 2 }), 17);
  const parts = engine.solve('x*exp(x)', { mode: 'integral' });
  assert.ok(parts.steps.some(s => /分部积分/.test(s.title)));
  near(number(parts.exact, { x: 2 }), Math.exp(2));
  assert.match(engine.solve('1/x', { mode: 'integral' }).answerText, /abs/);
});

test('definite integrals preserve exact pi bounds, reverse orientation and reject poles', () => {
  const r = engine.solve('sin(x)', { mode: 'integral', lower: '0', upper: 'pi' });
  assert.equal(r.exact, '2');
  assert.equal(engine.solve('sin(x)', { mode: 'integral', lower: 'pi', upper: '0' }).exact, '-2');
  assert.equal(engine.solve('x^2', { mode: 'integral', lower: '0', upper: '1' }).exact, '1/3');
  ChineseError('1/x', { mode: 'integral', lower: '-1', upper: '1' }, /分母零点|主值/);
  ChineseError('x', { mode: 'integral', lower: '0' }, /同时/);
});

test('finite quadrature fallback is explicit and converges for a non-elementary primitive', () => {
  const r = engine.solve('sin(x^x)', { mode: 'integral', lower: '0', upper: '1' });
  assert.equal(r.exact, undefined);
  near(Number(r.approximate), 0.702957837647, 2e-8);
  assert.ok(r.steps.some(s => /数值积分/.test(s.title) && /采样/.test(s.explanation)));
  assert.match(r.notes.join(' '), /近似/);
  const indefinite = engine.solve('sin(x^x)', { mode: 'integral' });
  assert.equal(indefinite.exact, undefined);
  assert.match(indefinite.answerText, /暂未/);
});

test('a supported improper Gaussian integral uses erf endpoint limits', () => {
  const r = engine.solve('exp(-x^2)', { mode: 'integral', lower: '-Infinity', upper: 'Infinity' });
  near(Number(r.approximate), Math.sqrt(Math.PI));
  assert.ok(r.exact);
});

test('limits use exact local coefficients for removable singularities and degree mode', () => {
  assert.equal(engine.solve('sin(x)/x', { mode: 'limit' }).exact, '1');
  assert.equal(engine.solve('(1-cos(x))/x^2', { mode: 'limit' }).exact, '1/2');
  const deg = engine.solve('sin(x)/x', { mode: 'limit', angle: 'deg' });
  assert.match(deg.exact, /pi/);
  near(number(deg.exact), Math.PI / 180);
  assert.equal(engine.solve('(3x^2+2)/(x^2-1)', { mode: 'limit', point: 'Infinity' }).exact, '3');
});

test('left/right limits, oscillation and real-domain gaps are distinct', () => {
  assert.match(engine.solve('1/x', { mode: 'limit' }).answerText, /不存在/);
  assert.equal(engine.solve('1/x', { mode: 'limit', direction: 'left' }).exact, '-Infinity');
  assert.equal(engine.solve('1/x', { mode: 'limit', direction: 'right' }).exact, 'Infinity');
  assert.match(engine.solve('abs(x)/x', { mode: 'limit' }).answerText, /不存在/);
  assert.equal(engine.solve('abs(x)/x', { mode: 'limit', direction: 'left' }).exact, '-1');
  assert.match(engine.solve('sin(1/x)', { mode: 'limit' }).answerText, /振荡/);
  assert.match(engine.solve('floor(x)', { mode: 'limit' }).answerText, /不存在/);
  assert.equal(engine.solve('log(x)', { mode: 'limit', direction: 'right' }).exact, '-Infinity');
  assert.equal(engine.solve('sqrt(x)', { mode: 'limit', direction: 'right' }).exact, '0');
  assert.match(engine.solve('sqrt(x)', { mode: 'limit' }).answerText, /无定义域/);
});

test('common absolute, root, exponential and logarithmic equations retain exact branches', () => {
  assert.deepEqual(rootValues(engine.solve('abs(x-1)=2')), [-1, 3]);
  assert.equal(engine.solve('abs(x)=-1').solutions.length, 0);
  assert.deepEqual(rootValues(engine.solve('sqrt(x+1)=3')), [8]);
  const boundary = rootValues(engine.solve('sqrt(x^2-2)=0'));
  assert.equal(boundary.length, 2);
  near(boundary[0], -Math.sqrt(2)); near(boundary[1], Math.sqrt(2));
  assert.equal(engine.solve('sqrt(x+1)=-3').solutions.length, 0);
  assert.deepEqual(rootValues(engine.solve('root(3)(x)=-2')), [-8]);
  assert.deepEqual(rootValues(engine.solve('abs(root(3)(x))=2')), [-8, 8]);
  const exp = engine.solve('exp(x)=2');
  assert.ok(exp.exact && !exp.solutions[0].numerical);
  near(number(exp.solutions[0].exact), Math.log(2));
  assert.equal(engine.solve('exp(x)=0').solutions.length, 0);
  near(number(engine.solve('log(x)=2').solutions[0].exact), Math.exp(2));
  near(number(engine.solve('log(x,2)=3').solutions[0].exact), 8);
  near(number(engine.solve('2^x=3').solutions[0].exact), Math.log(3) / Math.log(2));
  assert.deepEqual(rootValues(engine.solve('abs((x^2-1)/(x-1))=2')), [-3]);
});

test('real numerical equations report only the searched interval and validated approximate roots', () => {
  const sine = engine.solve('sin(x)=0');
  contract(sine);
  assert.equal(sine.exact, undefined);
  assert.equal(sine.solutions.length, 7);
  assert.ok(sine.solutions.every(s => s.numerical && s.real));
  assert.match(sine.answerLatex, /approx/);
  assert.match(sine.notes.join(' '), /仅搜索区间 \[-10, 10\]/);
  assert.match(sine.notes.join(' '), /不能穷尽|不能证明全局/);
  for (const root of sine.solutions) assert.ok(Math.abs(Math.sin(Number(root.exact))) < 1e-9);
  const cosine = engine.solve('cos(x)=x');
  assert.equal(cosine.solutions.length, 1);
  near(Number(cosine.solutions[0].exact), 0.7390851332151607, 1e-10);
  const degrees = engine.solve('sin(x)=0', { angle: 'deg', rootLower: '-180', rootUpper: '180' });
  assert.deepEqual(degrees.solutions.map(s => Number(s.exact)), [-180, 0, 180]);
  const bounded = engine.solve('sin(x)=0', { rootLower: 'pi/2', rootUpper: '3*pi/2' });
  assert.equal(bounded.solutions.length, 1);
  near(Number(bounded.solutions[0].exact), Math.PI);
});

test('numerical root candidates include tangencies and reject discontinuity limits', () => {
  const repeated = engine.solve('(cos(x)-x)^2=0');
  assert.equal(repeated.solutions.length, 1);
  near(Number(repeated.solutions[0].exact), 0.7390851332151607, 1e-9);
  assert.equal(repeated.solutions[0].tangent, true);
  assert.match(repeated.notes.join(' '), /重数未经符号证明/);
  const tangent = engine.solve('tan(x)=0');
  assert.equal(tangent.solutions.length, 7);
  tangent.solutions.forEach(s => assert.ok(Math.abs(Math.tan(Number(s.exact))) < 1e-9));
  for (const input of ['1/sin(x)=0', 'cos(x)/tan(x)=0', 'sin(x)/x=1', 'cos(x)^2+1e-12=0']) {
    const r = engine.solve(input);
    assert.equal(r.solutions.length, 0, input);
    assert.match(r.answerText, /有界搜索中未找到/);
    assert.ok(!/^无解$/.test(r.answerText));
  }
});

test('numeric root bounds, evaluation caps and unresolved parameters are explicit', () => {
  ChineseError('sin(x)=0', { rootLower: '1', rootUpper: '1' }, /下限|上限/);
  ChineseError('sin(x)=0', { rootLower: '-10000000', rootUpper: '10000000' }, /10\^6/);
  ChineseError('sin(x)=a', {}, /参数|未知量/);
  const r = engine.solve('sin(1000*x)=0');
  assert.ok(r.solutions.length <= engine.limits.rootSolutions);
  const step = r.steps.find(s => /定位变号/.test(s.title));
  const count = Number(/实际进行 (\d+)/.exec(step.explanation)[1]);
  assert.ok(count <= engine.limits.rootEvaluations);
  assert.match(r.notes.join(' '), /不能穷尽|预算/);
  ChineseError('sum(k,k,1,1000000000000)=0', {}, /200/);
});

test('list statistics honor the advertised 256-element cap and unwrap grouping', () => {
  const data = '[' + Array(256).fill('1').join(',') + ']';
  const r = engine.solve(data, { mode: 'statistics' });
  assert.equal(statistic(r, '数据个数 n'), '256');
  assert.equal(statistic(r, '总体方差 σ²'), '0');
  assert.equal(statistic(engine.solve('([1,2,3])'), '平均数'), '2');
  assert.equal(engine.solve('mean([' + Array(20).fill('1').join(',') + '])', { mode: 'evaluate' }).answerText, '1');
  ChineseError('[' + Array(257).fill('1').join(',') + ']', { mode: 'statistics' }, /256|过多|过大/);
});

test('non-x graphs remain functions of x and real cube root graphs keep negative values', () => {
  const r = engine.solve('t^2=4', { variable: 't' });
  assert.ok(r.graphs.every(g => !/\bt\b/.test(g.expression)));
  near(number(r.graphs[0].expression, { x: -2 }), 4);
  const root = engine.solve('root(3)(x)=-2');
  near(number(root.graphs[0].expression, { x: -8 }), -2);
  ChineseError('root(3)(x)', { mode: 'derivative' }, /分段/);
});

test('statistics expose count, center, spread, quartiles and the sample denominator', () => {
  const r = engine.solve('2,4,4,4,5,5,7,9');
  contract(r);
  assert.equal(r.kind, 'statistics');
  assert.equal(statistic(r, '数据个数 n'), '8');
  assert.equal(statistic(r, '总和'), '40');
  assert.equal(statistic(r, '平均数'), '5');
  assert.equal(statistic(r, '中位数'), '4.5');
  assert.match(statistic(r, '众数'), /^4/);
  assert.equal(statistic(r, '总体方差 σ²'), '4');
  near(Number(statistic(r, '样本方差 s²')), 32 / 7);
  assert.equal(statistic(r, '第一四分位数 Q1'), '4');
  assert.equal(statistic(r, '第三四分位数 Q3'), '6');
  assert.equal(statistic(r, '极差'), '7');
});

test('one-point/list statistics and duplicate modes avoid NaN', () => {
  const single = engine.solve('[5]');
  assert.match(statistic(single, '样本方差 s²'), /未定义/);
  assert.equal(statistic(single, '总体方差 σ²'), '0');
  assert.equal(statistic(single, '第一四分位数 Q1'), '5');
  const multiple = engine.solve('[1,1,2,2,3]', { mode: 'statistics' });
  assert.match(statistic(multiple, '众数'), /1，2/);
  const stable = engine.solve('1000000000001,1000000000002,1000000000003', { mode: 'statistics' });
  near(Number(statistic(stable, '总体方差 σ²')), 2 / 3);
});

test('matrix evaluation, determinant, inverse, transpose, dot/cross and multiplication', () => {
  assert.equal(engine.solve('det([1,2;3,4])').answerText, '-2');
  assert.equal(engine.solve('inv([2,1;1,1])').answerText, '[[1, -1], [-1, 2]]');
  assert.equal(engine.solve('transpose([1,2,3;4,5,6])').answerText, '[[1, 4], [2, 5], [3, 6]]');
  const multiply = engine.solve('[1,2;3,4]*[2,0;1,2]');
  contract(multiply);
  assert.equal(multiply.answerText, '[[4, 4], [10, 8]]');
  assert.ok(multiply.steps.some(s => /行乘列/.test(s.title)));
  assert.equal(engine.solve('dot([1,2,3],[4,5,6])').answerText, '32');
  assert.equal(engine.solve('cross([1,0,0],[0,1,0])').answerText, '[0, 0, 1]');
  ChineseError('inv([1,2;2,4])', {}, /奇异/);
  ChineseError('[1,2;3]', {}, /列数|维数/);
});

test('unit conversion includes scale, compound dimensions and affine temperatures', () => {
  assert.equal(engine.solve('2 inch to cm').answerText, '5.08 cm');
  assert.equal(engine.solve('32 degF to degC', { mode: 'units' }).answerText, '0 degC');
  assert.match(engine.solve('100 km/h to m/s').answerText, /^27\.77777778/);
  assert.match(engine.solve('1 lb to kg').answerText, /^0\.45359237/);
  assert.match(engine.solve('2 µm to m').answerText, /^2e-6/);
  ChineseError('2 cm to kg', {}, /不匹配|维度/);
});

test('invalid inputs and unsupported grammar have useful Chinese errors', () => {
  for (const input of ['', ' ', '2+', '(x+1', '1/0', 'log(0)', '1,,2', '|x', 'x[1]', 'x.constructor', 'import(2)', 'compile(1)', 'unknownFunction(2)']) {
    ChineseError(input, { mode: 'evaluate' });
  }
  ChineseError('sin(x)=y', { mode: 'solve' }, /参数|未知量/);
  ChineseError('x*y=1;x+y=2', {}, /线性/);
  ChineseError('1+2', { mode: 'not-a-mode' }, /模式/);
  ChineseError('x', { mode: 'derivative', order: 20 }, /阶数/);
  ChineseError('x', { variable: 'constructor' }, /变量/);
  ChineseError('2+2', { precision: 100 }, /精度/);
});

test('bounded computation rejects long input, deep nesting and explosive requests', () => {
  ChineseError('1'.repeat(1201), {}, /1200/);
  ChineseError('('.repeat(50) + '1' + ')'.repeat(50), {}, /嵌套/);
  ChineseError('1000000!', {}, /170/);
  ChineseError('factorial(-1)', {}, /170/);
  ChineseError('combinations(1000000,2)', {}, /170/);
  ChineseError('2^1000000', {}, /指数/);
  ChineseError('(x+y+z+w)^64', { mode: 'expand' }, /1600|复杂/);
  ChineseError('identity(1000000)', {}, /10/);
  ChineseError('x^20=0', {}, /12/);
});

test('evaluateAt does not mutate its scope, and cached ASTs respect angle changes', () => {
  const scope = Object.freeze({ x: 30 });
  near(number('sin(x)', scope, { angle: 'deg' }), 0.5);
  near(number('sin(x)', scope, { angle: 'rad' }), Math.sin(30));
  assert.deepEqual(scope, { x: 30 });
  assert.throws(() => number('x=2', scope), /表达式|方程/);
  assert.throws(() => number('x!', { x: 171 }), /170/);
});

test('LaTeX preserves large integer literals rather than printing rounded coefficients', () => {
  assert.match(engine.toLatex('9007199254740993'), /9007199254740993/);
  assert.match(engine.toLatex('x^2+1/3'), /frac/);
  assert.match(engine.toLatex('x<=2'), /le/);
});

test('every engine example conforms to the UI contract', () => {
  assert.ok(engine.examples.length >= 12);
  for (const example of engine.examples) contract(engine.solve(example.input, { mode: example.mode, ...example.options }));
});

test('browser/Worker UMD path exports globalThis.MathSolverEngine without Node dependencies', () => {
  const context = vm.createContext({ math, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../vendor/nerdamer.min.js'), 'utf8'), context, { timeout: 5000 });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8'), context, { timeout: 5000 });
  assert.equal(typeof context.MathSolverEngine.solve, 'function');
  assert.equal(context.MathSolverEngine.solve('1/3+1/6').exact, '1/2');
  const r = context.MathSolverEngine.solve('abs(x)/x', { mode: 'limit' });
  assert.match(r.answerText, /不存在/);
});

// --- LaTeX written inside the formula field ---------------------------------
// The math field stores LaTeX, and MathLive's ASCII-math export detaches the index of
// \int_a^b, so the engine reads calculus notation from the LaTeX itself.
test('fromLatex leaves ordinary LaTeX alone so the normal ASCII path is untouched', () => {
  for (const latex of ['x^2-5x+6=0', '\\frac{1}{2}', '\\sin(x)', '2x+1', '[1,2;3,4]', ''])
    assert.equal(engine.fromLatex(latex), null, latex);
});

test('fromLatex turns integral signs into the integrate command', () => {
  assert.equal(engine.fromLatex('\\int_{0}^{\\pi}\\sin(x)\\,dx'), 'integrate(\\sin(x),x,0,\\pi)');
  assert.equal(engine.fromLatex('\\int \\sin(x)\\,dx'), 'integrate(\\sin(x),x)');
  assert.equal(engine.fromLatex('\\int_{1/2}^{2}x^2\\,dx'), 'integrate(x^2,x,1/2,2)');
  // No "dx": a lone free symbol names the variable, otherwise the selected one is used.
  assert.equal(engine.fromLatex('\\int_0^{\\pi}\\left(\\sin(x)\\right)'), 'integrate(\\left(\\sin(x)\\right),x,0,\\pi)');
  assert.equal(engine.fromLatex('\\int_0^{\\pi}f(x)', { variable: 't' }), 'integrate(f(x),t,0,\\pi)');
  assert.equal(engine.fromLatex('\\int_0^{\\pi}f(g(x))', { variable: 't' }), 'integrate(f(g(x)),t,0,\\pi)');
  assert.equal(engine.fromLatex('\\int t^2\\,dt', { variable: 'x' }), 'integrate(t^2,t)');
});

test('fromLatex keeps whatever the user wrote after the differential', () => {
  assert.equal(engine.fromLatex('2\\int_0^1 x^2\\,dx+1'), '2integrate(x^2,x,0,1)+1');
  assert.equal(engine.fromLatex('\\int_0^{\\pi}\\sin(x)\\,dx; \\int_0^2 x\\,dx'), 'integrate(\\sin(x),x,0,\\pi);integrate(x,x,0,2)');
});

test('limits, sums and derivative fractions read from LaTeX', () => {
  assert.equal(engine.fromLatex('\\lim_{x\\to 0}\\frac{\\sin(x)}{x}'), 'limit(\\frac{\\sin(x)}{x},x,0)');
  assert.equal(engine.fromLatex('\\lim_{x\\to 0^+}\\frac{1}{x}'), 'limit(\\frac{1}{x},x,0,right)');
  assert.equal(engine.fromLatex('\\lim_{x\\to 0^-}f(x)'), 'limit(f(x),x,0,left)');
  assert.equal(engine.fromLatex('\\sum_{k=1}^{10}k^2'), 'sum(k^2,k,1,10)');
  assert.equal(engine.fromLatex('\\prod_{k=1}^{6}k'), 'product(k,k,1,6)');
  assert.equal(engine.fromLatex('\\frac{\\mathrm{d}}{\\mathrm{d}x}x^2'), 'diff(x^2,x)');
  assert.equal(engine.fromLatex('\\frac{\\mathrm{d}y}{\\mathrm{d}x}y^2'), 'diff(y^2,x)');
  assert.equal(engine.fromLatex('\\frac{\\mathrm{d}x}{\\mathrm{d}t}x^3'), 'diff(x^3,t)');
});

test('LaTeX integral, limit, sum and derivative signs actually solve', () => {
  const solved = (latex, options) => engine.solve(engine.fromLatex(latex, options || {}), { mode: 'auto' });
  const value = (latex, scope) => number(solved(latex).exact, scope || { x: 1.7, t: 1.7 });
  near(value('\\int_{0}^{\\pi}\\sin(x)\\,dx'), 2);
  near(value('\\int_{0}^{\\pi}(\\sin^2(x)+\\cos^2(x))\\,dx'), Math.PI);
  near(value('\\int_{0}^{1}x^2\\,dx'), 1 / 3);
  near(value('\\lim_{x\\to 0}\\frac{\\sin(x)}{x}'), 1);
  near(value('\\sum_{k=1}^{10}k^2'), 385);
  near(value('\\frac{\\mathrm{d}}{\\mathrm{d}x}x^2'), 3.4);
  near(value('\\int_{0}^{\\pi}\\left(\\sin(x)\\right)'), 2);
  assert.match(solved('\\int x^2').answerText, /C/);
  contract(solved('\\int_{0}^{\\pi}\\sin(x)\\,dx'));
});

test('malformed calculus LaTeX reports a Chinese error instead of a parser crash', () => {
  const bad = (latex) => assert.throws(() => engine.solve(engine.fromLatex(latex) || latex, { mode: 'auto' }),
    /[\u3400-\u9fff]/, latex);
  bad('\\int');
  bad('\\int_{0}');
  bad('\\lim');
  bad('\\lim_{0}');
  bad('\\sum_{k}k^2');
});

test('a second calculus command in one input is refused with guidance', () => {
  ChineseError('integrate(x^2,x,0,1)+integrate(x,x,0,2)', { mode: 'auto' }, /一次只能计算一个|写在输入最前面/);
  ChineseError('2integrate(x^2,x,0,1)+1', { mode: 'auto' }, /写在输入最前面/);
});

test('superscripted trig written in LaTeX means a power, not sin(2) times x', () => {
  near(number('\\sin^2(x)+\\cos^2(x)', { x: 0.5 }), 1);
  near(number('\\sin^2(x+1)', { x: 0.5 }), Math.pow(Math.sin(1.5), 2));
  near(number('\\cos^2(0.5)'), Math.pow(Math.cos(0.5), 2));
  const result = engine.solve(engine.fromLatex('\\int_{0}^{\\pi}\\sin^2(x)\\,dx'), { mode: 'auto' });
  near(number(result.exact), Math.PI / 2);
});

test('ASCII "sin^2(x)" from the formula field is a power, not sin(2) times x', () => {
  assert.equal(engine.normalize('sin^2(x)'), '(sin(x))^2');
  assert.equal(engine.normalize('sin^2(x)+cos^2(x)'), '(sin(x))^2+(cos(x))^2');
  assert.equal(engine.normalize('cos^2(2x)'), '(cos(2*x))^2');
  assert.equal(engine.normalize('sin^(1/2)(x)'), '(sin(x))^(1/2)');
  // Ordinary powers are untouched.
  assert.equal(engine.normalize('x^2'), 'x^2');
  assert.equal(engine.normalize('x^(1/2)'), 'x^(1/2)');
  assert.equal(engine.normalize('2^x'), '2^x');
  assert.equal(engine.normalize('e^2'), 'e^2');
  near(number('sin^2(x)+cos^2(x)', { x: 0.5 }), 1);
  const result = engine.solve('integrate(sin^2(x),x,0,pi)', { mode: 'auto' });
  near(number(result.exact), Math.PI / 2);
});

test('LaTeX pasted into the text box solves the same way as the formula field', () => {
  const solveLatex = (latex, options) => engine.solve(latex, Object.assign({ mode: 'auto' }, options));
  near(number(solveLatex('\\int_{0}^{\\pi}\\sin(x)\\,dx').exact), 2);
  near(number(solveLatex('\\lim_{x\\to 0}\\frac{\\sin(x)}{x}').exact), 1);
  near(number('2*x', { x: 3 }), 6);
  assert.match(String(solveLatex('\\frac{\\mathrm{d}}{\\mathrm{d}x}x^2').answerLatex), /2/);
  near(number(solveLatex('\\sum_{k=1}^{10}k^2').exact), 385);
  near(number(solveLatex('\\int_{0}^{\\pi}(\\sin^2(x)+\\cos^2(x))\\,dx').exact), Math.PI);
  // Plain input keeps its old behaviour.
  assert.match(String(engine.solve("x^2-5x+6=0", { mode: "solve" }).answerLatex), /x=2/);
  near(number(engine.solve('1/3+1/6', { mode: 'evaluate' }).exact), 0.5);
});
