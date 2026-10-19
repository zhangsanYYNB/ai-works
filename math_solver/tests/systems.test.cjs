'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/engine.js');
const math = require('../vendor/math.min.js');
const value = text => engine.evaluateAt(text);
const real = text => { const v = value(text); return v && (v.isBigNumber || v.isFraction) ? Number(v.valueOf()) : Number(v); };
const tuples = result => result.solutionSets.map(set => Object.fromEntries(set.map(r => [r.variable, real(r.exact)])));
function verified(result, equations, options = {}) {
  assert.equal(result.kind, 'system');
  assert.ok(result.answerText && result.answerLatex);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
  for (const set of result.solutionSets) {
    const scope = Object.fromEntries(set.map(r => { const v = value(r.exact); return [r.variable, v && (v.isBigNumber || v.isFraction) ? Number(v.valueOf()) : v]; }));
    assert.equal(new Set(set.map(r => r.variable)).size, result.variables.length);
    for (const [left, right] of equations) {
      const a = engine.evaluateAt(left, scope, options), b = engine.evaluateAt(right, scope, options);
      const delta = Number(math.abs(math.subtract(a, b)));
      assert.ok(delta <= 2e-7 * Math.max(1, Number(math.abs(a)), Number(math.abs(b))), JSON.stringify(scope) + ': ' + left + ' != ' + right);
    }
  }
}

test('coupled quadratic products enumerate four exact variable tuples', () => {
  const r = engine.solve('x^2+y^2=5;xy=2');
  assert.equal(r.complete, true);
  assert.deepEqual(tuples(r), [{ x: -2, y: -1 }, { x: -1, y: -2 }, { x: 1, y: 2 }, { x: 2, y: 1 }]);
  assert.equal(r.solutions.length, 8);
  assert.ok(r.exact && !r.numerical);
  assert.ok(r.steps.some(s => /精确消元/.test(s.title)));
  verified(r, [['x^2+y^2', '5'], ['x*y', '2']]);
});

test('nonlinear three-variable elimination preserves all six permutations', () => {
  const r = engine.solve('x+y+z=6;xy+xz+yz=11;xyz=6');
  assert.equal(r.complete, true);
  assert.equal(r.solutionSets.length, 6);
  assert.equal(new Set(tuples(r).map(s => [s.x, s.y, s.z].join(','))).size, 6);
  verified(r, [['x+y+z', '6'], ['x*y+x*z+y*z', '11'], ['x*y*z', '6']]);
});

test('nested radicals retain both real and complex algebraic branches', () => {
  const r = engine.solve('x^2+y^2=1;x^2-y=0');
  assert.equal(r.complete, true);
  assert.equal(r.solutionSets.length, 4);
  assert.equal(r.solutionSets.filter(s => s.every(v => v.real)).length, 2);
  assert.ok(r.exact && !r.numerical);
  verified(r, [['x^2+y^2', '1'], ['x^2-y', '0']]);
});

test('elimination does not lose branches with zero coordinates or repeated roots', () => {
  const zero = engine.solve('x*y=0;x+y=1');
  assert.deepEqual(tuples(zero), [{ x: 0, y: 1 }, { x: 1, y: 0 }]);
  const repeated = engine.solve('(x-1)^2+(y-2)^2=0;x-y=-1');
  assert.equal(repeated.solutionSets.length, 1);
  verified(repeated, [['(x-1)^2+(y-2)^2', '0'], ['x-y', '-1']]);
});

test('rational systems preserve original holes and nonzero denominator conditions', () => {
  const r = engine.solve('1/x+1/y=3;x+y=3/2');
  assert.deepEqual(tuples(r), [{ x: 0.5, y: 1 }, { x: 1, y: 0.5 }]);
  verified(r, [['1/x+1/y', '3'], ['x+y', '3/2']]);
  const hole = engine.solve('(x^2-1)/(x-1)=2;y=0');
  assert.equal(hole.complete, true);
  assert.equal(hole.solutionSets.length, 0);
  assert.match(hole.answerText, /无解/);
});

test('root, absolute, exponential and logarithmic systems keep exact inverses', () => {
  const cases = [
    ['sqrt(x)+y=3;y=1', [4]],
    ['abs(x)+y=3;y=1', [-2, 2]],
    ['exp(x)+y=3;y=1', [Math.log(2)]],
    ['log(x)+y=3;y=1', [Math.exp(2)]],
    ['cbrt(x)+y=-1;y=1', [-8]]
  ];
  for (const [input, xs] of cases) {
    const r = engine.solve(input);
    assert.equal(r.complete, true, input);
    assert.ok(r.exact && !r.numerical, input);
    const actual = tuples(r).map(s => s.x).sort((a, b) => a - b);
    assert.equal(actual.length, xs.length, input);
    actual.forEach((x, i) => assert.ok(Math.abs(x - xs[i]) < 1e-9 * Math.max(1, Math.abs(xs[i])), input));
  }
  assert.equal(engine.solve('sqrt(x)=y;y=-1').solutionSets.length, 0);
});

test('coupled absolute equalities return every exact fraction regardless of search bounds', () => {
  const expected = [
    { x: '-59/4', y: '-13/8' },
    { x: '-34/7', y: '-46/7' },
    { x: '-6/5', y: '-2' },
    { x: '-6/5', y: '-23/35' }
  ];
  for (const options of [{}, { rootLower: '-1', rootUpper: '1', precision: 2 }]) {
    const r = engine.solve('|3x+y+12|=|2x-y-6|;|2x+5y+3|=|3x-9y-5|', options);
    assert.equal(r.complete, true);
    assert.ok(r.exact && !r.numerical);
    assert.deepEqual(r.solutionSets.map(set => Object.fromEntries(set.map(v => [v.variable, v.exact]))), expected);
    assert.ok(r.solutions.every(v => !v.numerical));
    assert.doesNotMatch(r.answerText + r.answerLatex, /≈|approx|\d\.\d/);
    assert.match(r.answerLatex, /frac/);
    assert.deepEqual(r.table.rows, expected.map((s, i) => [String(i + 1), s.x, s.y]));
    verified(r, [['abs(3*x+y+12)', 'abs(2*x-y-6)'], ['abs(2*x+5*y+3)', 'abs(3*x-9*y-5)']]);
  }
});

test('absolute equality branches merge duplicate zeros and reject holes and complex roots', () => {
  const zero = engine.solve('abs(x+y)=abs(x-y);x=0;y=0');
  assert.equal(zero.complete, true);
  assert.deepEqual(tuples(zero), [{ x: 0, y: 0 }]);
  const hole = engine.solve('abs((x^2-1)/(x-1))=abs(y);y=2');
  assert.equal(hole.complete, true);
  assert.deepEqual(tuples(hole), [{ x: -3, y: 2 }]);
  const complex = engine.solve('abs(x+y)=abs(x-y);x^2+y^2=-1');
  assert.equal(complex.complete, true);
  assert.deepEqual(complex.solutionSets, []);
  const moduli = engine.solve('abs(x+i*y)=abs(x-i*y);x+y=1');
  assert.equal(moduli.complete, false);
});

test('exact root boundaries survive substitution while exact denominator zeros are rejected', () => {
  const boundary = engine.solve('sqrt(x^2-2)=0;y=0');
  assert.equal(boundary.complete, true);
  assert.equal(boundary.solutionSets.length, 2);
  tuples(boundary).forEach(s => { assert.ok(Math.abs(s.x * s.x - 2) < 1e-14); assert.equal(s.y, 0); });
  const hole = engine.solve('(x^2-2)/(x^2-2)=y;x^2=2');
  assert.equal(hole.complete, true);
  assert.deepEqual(hole.solutionSets, []);
  assert.match(hole.answerText, /无解/);
});

test('parameter-independent zero roots are retained without assigning the coefficient', () => {
  for (const equation of ['a*x^2=0', 'a*x^2+x=0']) {
    const r = engine.solve(equation + ';y=0', { variables: ['x', 'y'] });
    assert.equal(r.complete, false);
    assert.ok(r.solutionSets.some(s => s.every(v => v.exact === '0')));
    assert.ok(r.parameters.includes('a'));
    assert.doesNotMatch(r.answerText, /无解/);
  }
});

test('approximate algebraic constants coexist with a free variable in a solution family', () => {
  const r = engine.solve('x^3=2;y=z');
  assert.equal(r.complete, false);
  assert.equal(r.solutionSets.length, 3);
  assert.deepEqual(r.parameters, ['t1']);
  for (const set of r.solutionSets) {
    const x = set.find(v => v.variable === 'x');
    assert.equal(x.numerical, true);
    const xv = value(x.exact);
    assert.ok(Number(math.abs(math.subtract(math.pow(xv, 3), 2))) < 1e-10);
    assert.equal(set.find(v => v.variable === 'y').exact, 't1');
    assert.equal(set.find(v => v.variable === 'z').exact, 't1');
    assert.ok(!set.find(v => v.variable === 'y').numerical);
  }
});

test('exact back substitution preserves tiny increments beyond floating point precision', () => {
  const r = engine.solve('x^2=1e-40;y=1+x');
  assert.equal(r.complete, true);
  assert.equal(r.solutionSets.length, 2);
  for (const set of r.solutionSets) {
    const x = math.fraction(set.find(v => v.variable === 'x').exact);
    const y = math.fraction(set.find(v => v.variable === 'y').exact);
    assert.ok(math.equal(math.subtract(y, math.fraction(1)), x));
    assert.ok(!math.equal(y, math.fraction(1)));
  }
  const cancellation = engine.solve('x^2=1e-40;y=x+sqrt(1e-40)');
  assert.equal(cancellation.complete, true);
  assert.equal(cancellation.solutionSets.length, 2);
  for (const set of cancellation.solutionSets) {
    const x = math.fraction(set.find(v => v.variable === 'x').exact), y = math.fraction(set.find(v => v.variable === 'y').exact);
    assert.ok(math.equal(math.subtract(y, x), math.fraction('1/100000000000000000000')));
  }
});

test('irrational coefficients fall back without losing usable numerical formatting', () => {
  for (const coefficient of ['pi', 'sqrt(5)']) {
    const r = engine.solve('x^2+y^2=' + coefficient + ';x*y=1');
    assert.equal(r.solutionSets.length, 4);
    assert.ok(r.solutionSets.every(s => s.every(v => !v.numerical || typeof v.approximate === 'string')));
    verified(r, [['x^2+y^2', coefficient], ['x*y', '1']]);
  }
});

test('nonlinear continuous families retain parameters and zero-product branches', () => {
  const circle = engine.solve('x^2+y^2=1;2*x^2+2*y^2=2');
  assert.equal(circle.solutionSets.length, 2);
  assert.deepEqual(circle.parameters, ['t1']);
  for (const set of circle.solutionSets) {
    const scope = { t1: 0.25 };
    const vals = Object.fromEntries(set.map(r => [r.variable, Number(engine.evaluateAt(r.exact, scope))]));
    assert.ok(Math.abs(vals.x ** 2 + vals.y ** 2 - 1) < 1e-10);
  }
  const product = engine.solve('x*y=0;2*x*y=0');
  assert.equal(product.solutionSets.length, 2);
  assert.ok(product.notes.some(n => /参数/.test(n)));
});

test('arbitrary variable names, four/eight unknowns and rectangular linear systems work', () => {
  const four = engine.solve('a+b+c+d=10;a-b=0;c-d=0;a-c=0');
  assert.deepEqual(four.variables, ['a', 'b', 'c', 'd']);
  assert.deepEqual(four.solutions.map(s => real(s.exact)), [2.5, 2.5, 2.5, 2.5]);
  const eight = engine.solve('a=1;b=2;c=3;d=4;u=5;v=6;w=7;t=8');
  assert.equal(eight.variables.length, 8);
  assert.equal(eight.solutionSets.length, 1);
  const over = engine.solve('x+y=3;x-y=1;2*x=4;2*y=2');
  assert.deepEqual(tuples(over), [{ x: 2, y: 1 }]);
  assert.match(engine.solve('x=1;x=2').answerText, /无解/);
  assert.deepEqual(tuples(engine.solve('x=2;2*x=4')), [{ x: 2 }]);
  assert.match(engine.solve('1=1;2=2').answerText, /成立/);
});

test('explicit system variables preserve coefficients as parameters and validate names', () => {
  const r = engine.solve('a*x+y=2;x-y=0', { variables: ['x', 'y'] });
  assert.deepEqual(r.variables, ['x', 'y']);
  assert.ok(r.parameters.includes('a'));
  for (const variables of [[], 'x,y', ['x', 'x'], ['constructor'], ['sin']]) {
    assert.throws(() => engine.solve('x^2+y^2=1;xy=0', { variables }), /未知量|名称/);
  }
  assert.throws(() => engine.solve('a=1;b=1;c=1;d=1;f=1;g=1;h=1;j=1;k=1'), /8/);
  assert.throws(() => engine.solve(Array(17).fill('x=1').join(';')), /16/);
  assert.throws(() => engine.solve('x+y=1;xy<1'), /等号|不等式/);
});

test('LaTeX cases, aligned equations, outer braces and comma separators solve identically', () => {
  const inputs = [
    '\\begin{cases}x^2+y^2=5\\\\xy=2\\end{cases}',
    '\\left\\{\\begin{aligned}x^2+y^2&=5\\\\xy&=2\\end{aligned}\\right.',
    '\\left\\{\\begin{array}{l}x^2+y^2=5\\\\xy=2\\end{array}\\right.',
    '{x^2+y^2=5;xy=2}', 'x^2+y^2=5,xy=2', 'x^2+y^2=5\nxy=2'
  ];
  for (const input of inputs) {
    const r = engine.solve(input);
    assert.equal(r.solutionSets.length, 4, input);
    verified(r, [['x^2+y^2', '5'], ['x*y', '2']]);
  }
  const root = engine.solve('nthRoot(x,3)=y;y=-2');
  assert.deepEqual(tuples(root), [{ x: -8, y: -2 }]);
});

test('near-zero exact algebraic roots stay separate and ignore numerical search bounds', () => {
  const r = engine.solve('x^2-1e-40=0;y=x', { rootLower: '1', rootUpper: '2' });
  assert.equal(r.complete, true);
  assert.equal(r.solutionSets.length, 2);
  assert.ok(tuples(r)[0].x < 0 && tuples(r)[1].x > 0);
  const outside = engine.solve('x^2=10000;y=x', { rootLower: '-1', rootUpper: '1' });
  assert.equal(outside.solutionSets.length, 2);
});

test('transcendental multivariable search finds distinct validated real tuples', () => {
  const r = engine.solve('sin(x)+y=1;x^2+y^2=1');
  assert.equal(r.complete, false);
  assert.equal(r.numerical, true);
  assert.ok(!r.exact);
  assert.equal(r.solutionSets.length, 2);
  const ts = tuples(r);
  assert.ok(ts.some(s => Math.abs(s.x) < 1e-7 && Math.abs(s.y - 1) < 1e-7));
  assert.ok(ts.some(s => Math.abs(s.x - 0.9861060642) < 1e-7));
  assert.match(r.notes.join(' '), /不能保证找全|未找到解不代表无解/);
  verified(r, [['sin(x)+y', '1'], ['x^2+y^2', '1']]);
});

test('fully coupled functions use the multivariable fallback and respect degrees', () => {
  const r = engine.solve('sin(x)+cos(y)=1;exp(x)-y=1');
  assert.equal(r.complete, false);
  assert.ok(r.solutionSets.length > 0);
  verified(r, [['sin(x)+cos(y)', '1'], ['exp(x)-y', '1']]);
  const deg = engine.solve('sin(x)+y=1;x/60-y=0', { angle: 'deg', rootLower: '0', rootUpper: '60' });
  assert.ok(tuples(deg).some(s => Math.abs(s.x - 30) < 1e-6 && Math.abs(s.y - 0.5) < 1e-7));
  verified(deg, [['sin(x)+y', '1'], ['x/60-y', '0']], { angle: 'deg' });
});

test('search failure, scale and singularity do not create a false global no-solution claim', () => {
  const no = engine.solve('exp(x)+exp(y)=0;sin(x-y)=0', { rootLower: '-20', rootUpper: '20' });
  assert.equal(no.complete, false);
  assert.equal(no.solutionSets.length, 0);
  assert.match(no.answerText, /未找到/);
  const scaled = engine.solve('1e-100*(sin(x)+y-1)=0;1e-100*(x^2+y^2-1)=0');
  assert.ok(scaled.solutionSets.length >= 2);
  verified(scaled, [['sin(x)+y', '1'], ['x^2+y^2', '1']]);
  const singular = engine.solve('exp(x)+y=3;x+y=2');
  assert.ok(singular.solutionSets.length <= 2);
  if (singular.solutionSets.length) verified(singular, [['exp(x)+y', '3'], ['x+y', '2']]);
});

test('bounded numerical search applies to every unknown and validates endpoints', () => {
  const r = engine.solve('sin(x)+cos(y)=1;exp(x)-y=1', { rootLower: '1', rootUpper: '2' });
  for (const set of tuples(r)) for (const v of Object.values(set)) assert.ok(v >= 1 && v <= 2);
  assert.throws(() => engine.solve('sin(x)+cos(y)=1;exp(x)-y=1', { rootLower: '2', rootUpper: '1' }), /下限|上限/);
  assert.throws(() => engine.solve('sin(x)+cos(y)=1;exp(x)-y=1', { rootLower: '-1e7', rootUpper: '1e7' }), /10\^6/);
});
