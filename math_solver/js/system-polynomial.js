/* Exact rational Groebner bases in lex order (powers[0] is the highest variable).
 * CommonJS: require('./system-polynomial.js'); browser/worker: MathSolverSystemPolynomial.
 * No input is mutated. All algorithmic loops share maxOperations; maxTerms,
 * maxPolynomials and maxDegree also bound intermediate polynomials. Coefficient
 * numerators and denominators are limited to 4096 bits, including parsed input.
 * Cross cancellation keeps temporary integer arithmetic within 8193 bits.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MathSolverSystemPolynomial = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_BITS = 4096;
  const MAX_DIGITS = 1234;
  const ZERO = { n: 0n, d: 1n };
  const ONE = { n: 1n, d: 1n };
  const MINUS_ONE = { n: -1n, d: 1n };

  function fail(message) { throw new Error(message); }

  function basis(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      fail('多项式基参数必须是对象。');
    }
    const { dimensions, polynomials, maxOperations = 40000, maxTerms = 256,
      maxPolynomials = 40, maxDegree = 24 } = options;
    function limit(value, name) {
      if (!Number.isSafeInteger(value) || value < 0) fail(name + '必须是非负安全整数。');
    }
    limit(dimensions, '变量维数');
    limit(maxOperations, '运算预算');
    limit(maxTerms, '多项式项数上限');
    limit(maxPolynomials, '多项式数量上限');
    limit(maxDegree, '多项式总次数上限');
    if (!Array.isArray(polynomials)) fail('多项式输入必须是项数组的数组。');
    if (polynomials.length > maxPolynomials) fail('多项式数量超过上限，精确消元过于复杂。');

    let operations = 0;
    function spend() {
      if (operations >= maxOperations) fail('精确多项式消元超过运算预算，计算过于复杂。');
      operations++;
    }
    function checkTerms(count) {
      if (count > maxTerms) fail('多项式项数超过上限，精确消元过于复杂。');
    }
    function checkBits(value) {
      spend();
      if ((value < 0n ? -value : value).toString(2).length > MAX_BITS) {
        fail('有理系数超过 ' + MAX_BITS + ' 位二进制上限，精确消元过于复杂。');
      }
    }
    function gcd(a, b) {
      spend();
      if (a < 0n) a = -a;
      if (b < 0n) b = -b;
      if (a === 1n || b === 1n) return 1n;
      while (b !== 0n) {
        spend();
        const r = a % b;
        a = b;
        b = r;
      }
      return a;
    }
    // Call only with coprime n,d and d > 0; every stored rational is bounded.
    function checked(n, d) {
      checkBits(n);
      checkBits(d);
      if (n === 0n) return ZERO;
      if (d === 1n && n === 1n) return ONE;
      if (d === 1n && n === -1n) return MINUS_ONE;
      return { n, d };
    }
    function parseRational(text) {
      spend();
      // Bound text before regex, splitting or BigInt conversion.
      if (typeof text !== 'string') fail('多项式系数必须是整数或分数字符串。');
      if (text.length > 2 * (MAX_DIGITS + 1) + 3) fail('有理系数字符串过长，精确消元过于复杂。');
      const parts = text.trim().split('/');
      if (parts.length > 2) fail('多项式系数必须是整数或 n/d 格式。');
      const numerator = parts[0].trim();
      const denominator = parts.length === 2 ? parts[1].trim() : '1';
      if (numerator.length > MAX_DIGITS + 1 || denominator.length > MAX_DIGITS + 1) {
        fail('有理系数位数超过上限，精确消元过于复杂。');
      }
      if (!/^[+-]?\d+$/.test(numerator) || !/^[+-]?\d+$/.test(denominator)) {
        fail('多项式系数必须是整数或 n/d 格式。');
      }
      let n = BigInt(numerator), d = BigInt(denominator);
      checkBits(n);
      checkBits(d);
      if (d === 0n) fail('有理系数的分母不能为零。');
      if (n === 0n) return ZERO;
      if (d < 0n) { n = -n; d = -d; }
      const h = gcd(n, d);
      return checked(n / h, d / h);
    }
    function add(a, b) {
      spend();
      if (a.n === 0n) return b;
      if (b.n === 0n) return a;
      const h = gcd(a.d, b.d);
      const ad = a.d / h, bd = b.d / h;
      const n = a.n * bd + b.n * ad;
      if (n === 0n) return ZERO;
      const k = gcd(n, h);
      return checked(n / k, ad * (b.d / k));
    }
    function negate(a) {
      spend();
      return a.n === 0n ? ZERO : { n: -a.n, d: a.d };
    }
    function multiply(a, b) {
      spend();
      if (a.n === 0n || b.n === 0n) return ZERO;
      if (a.n === a.d) return b;
      if (b.n === b.d) return a;
      const h = gcd(a.n, b.d), k = gcd(b.n, a.d);
      return checked((a.n / h) * (b.n / k), (a.d / k) * (b.d / h));
    }
    function divide(a, b) {
      spend();
      if (b.n === 0n) fail('多项式约简遇到零系数除数。');
      const inverse = b.n < 0n ? { n: -b.d, d: -b.n } : { n: b.d, d: b.n };
      return multiply(a, inverse);
    }

    function comparePowers(a, b) {
      for (let i = 0; i < dimensions; i++) {
        spend();
        if (a[i] !== b[i]) return a[i] > b[i] ? -1 : 1;
      }
      return 0;
    }
    function divides(a, b) {
      for (let i = 0; i < dimensions; i++) {
        spend();
        if (a[i] > b[i]) return false;
      }
      return true;
    }
    function coprime(a, b) {
      for (let i = 0; i < dimensions; i++) {
        spend();
        if (a[i] !== 0 && b[i] !== 0) return false;
      }
      return true;
    }
    function shiftBetween(a, b) {
      const powers = [];
      let degree = 0;
      for (let i = 0; i < dimensions; i++) {
        spend();
        const exponent = a[i] - b[i];
        powers.push(exponent);
        degree += exponent; // b divides a; a already has bounded total degree.
      }
      return { powers, degree };
    }
    function parsePolynomial(input) {
      spend();
      if (!Array.isArray(input)) fail('每个多项式必须是项数组。');
      checkTerms(input.length);
      const terms = new Map();
      for (const term of input) {
        spend();
        if (!term || typeof term !== 'object' || !Array.isArray(term.powers)
          || term.powers.length !== dimensions) fail('多项式项的幂数组必须与变量维数一致。');
        const powers = [];
        let degree = 0;
        for (const exponent of term.powers) {
          spend();
          if (!Number.isSafeInteger(exponent) || exponent < 0) fail('多项式的幂必须是非负安全整数。');
          if (exponent > maxDegree - degree) fail('多项式总次数超过上限，精确消元过于复杂。');
          degree += exponent;
          powers.push(exponent);
        }
        const coefficient = parseRational(term.coefficient);
        if (coefficient.n === 0n) continue;
        const key = powers.join(',');
        const previous = terms.get(key);
        const sum = previous ? add(previous.coefficient, coefficient) : coefficient;
        if (sum.n === 0n) terms.delete(key);
        else terms.set(key, { powers, degree, coefficient: sum });
      }
      const result = [];
      for (const term of terms.values()) { spend(); result.push(term); }
      result.sort((a, b) => { spend(); return comparePowers(a.powers, b.powers); });
      return result;
    }
    function monic(poly) {
      spend();
      if (!poly.length || poly[0].coefficient.n === poly[0].coefficient.d) return poly;
      const result = [], lead = poly[0].coefficient;
      for (const term of poly) {
        spend();
        result.push({ powers: term.powers, degree: term.degree, coefficient: divide(term.coefficient, lead) });
      }
      return result;
    }
    function unit(poly) { return poly.length === 1 && poly[0].degree === 0; }

    // Monomial shifts preserve lex order. Skip both leading terms when forming
    // S-polynomials or cancelling a leading term, so their exact cancellation
    // never inflates the temporary term count or coefficient size.
    function shiftedTail(poly, shift, factor) {
      const result = [];
      for (let j = 1; j < poly.length; j++) {
        spend();
        const term = poly[j];
        if (shift.degree > maxDegree - term.degree) fail('多项式总次数超过上限，精确消元过于复杂。');
        const powers = [];
        for (let i = 0; i < dimensions; i++) {
          spend();
          powers.push(term.powers[i] + shift.powers[i]);
        }
        result.push({ powers, degree: term.degree + shift.degree, coefficient: multiply(term.coefficient, factor) });
      }
      return result;
    }
    function merge(a, start, b, heldTerms = 0) {
      const result = [];
      let i = start, j = 0;
      while (i < a.length || j < b.length) {
        spend();
        const order = i === a.length ? 1 : j === b.length ? -1 : comparePowers(a[i].powers, b[j].powers);
        let term;
        if (order < 0) term = a[i++];
        else if (order > 0) term = b[j++];
        else {
          const left = a[i++], right = b[j++];
          const coefficient = add(left.coefficient, right.coefficient);
          if (coefficient.n === 0n) continue;
          term = { powers: left.powers, degree: left.degree, coefficient };
        }
        checkTerms(result.length + heldTerms + 1);
        result.push(term);
      }
      return result;
    }
    function remainder(poly, divisors, excluded = -1) {
      let pending = poly, head = 0;
      const result = [];
      while (head < pending.length) {
        spend();
        const lead = pending[head];
        let divisor = null;
        for (let i = 0; i < divisors.length; i++) {
          spend();
          if (i !== excluded && divides(divisors[i][0].powers, lead.powers)) {
            divisor = divisors[i];
            break;
          }
        }
        if (!divisor) {
          checkTerms(result.length + 1);
          result.push(lead);
          head++;
        } else {
          // Every divisor is monic, so its multiplier is exactly lead.coefficient.
          const shift = shiftBetween(lead.powers, divisor[0].powers);
          const tail = shiftedTail(divisor, shift, negate(lead.coefficient));
          pending = merge(pending, head + 1, tail, result.length);
          head = 0;
        }
      }
      return result;
    }
    function sPolynomial(a, b) {
      const powers = [];
      let degree = 0;
      for (let i = 0; i < dimensions; i++) {
        spend();
        const exponent = Math.max(a[0].powers[i], b[0].powers[i]);
        if (exponent > maxDegree - degree) fail('消元首项公倍式的总次数超过上限，计算过于复杂。');
        degree += exponent;
        powers.push(exponent);
      }
      const left = shiftedTail(a, shiftBetween(powers, a[0].powers), ONE);
      const right = shiftedTail(b, shiftBetween(powers, b[0].powers), MINUS_ONE);
      return merge(left, 0, right);
    }
    function finish(polys) {
      const output = [];
      for (const poly of polys) {
        spend();
        const terms = [];
        for (const term of poly) {
          spend();
          const powers = [];
          for (const exponent of term.powers) { spend(); powers.push(exponent); }
          const c = term.coefficient;
          terms.push({ powers, coefficient: c.d === 1n ? c.n.toString() : c.n.toString() + '/' + c.d.toString() });
        }
        output.push(terms);
      }
      return { polynomials: output, operations };
    }

    // Normalize every input before computing; reducing a new generator modulo
    // earlier ones preserves the ideal only while those earlier ones are kept.
    const initial = [];
    for (const poly of polynomials) { spend(); initial.push(parsePolynomial(poly)); }
    const generators = [], pairs = [];
    function append(poly) {
      spend();
      if (generators.length >= maxPolynomials) fail('中间多项式数量超过上限，精确消元过于复杂。');
      const index = generators.length;
      generators.push(poly);
      for (let i = 0; i < index; i++) {
        spend();
        // Buchberger's product criterion: coprime leading monomials need no pair.
        if (!coprime(generators[i][0].powers, poly[0].powers)) pairs.push([i, index]);
      }
    }
    for (const poly of initial) {
      spend();
      const reduced = monic(remainder(poly, generators));
      if (!reduced.length) continue;
      if (unit(reduced)) return finish([reduced]);
      append(reduced);
    }
    let nextPair = 0;
    while (nextPair < pairs.length) {
      spend();
      const pair = pairs[nextPair++];
      const s = sPolynomial(generators[pair[0]], generators[pair[1]]);
      const reduced = monic(remainder(s, generators));
      if (!reduced.length) continue;
      if (unit(reduced)) return finish([reduced]);
      append(reduced);
    }

    // Only a completed Groebner basis allows removal by leading divisibility.
    // Equal leading monomials keep the earlier entry; all pairs were processed,
    // so no constraints carried by a removed generator can be lost here.
    const minimal = [];
    for (let i = 0; i < generators.length; i++) {
      spend();
      let redundant = false;
      for (let j = 0; j < generators.length; j++) {
        spend();
        if (i === j) continue;
        const a = generators[j][0].powers, b = generators[i][0].powers;
        if (divides(a, b) && (j < i || comparePowers(a, b) !== 0)) { redundant = true; break; }
      }
      if (!redundant) minimal.push(generators[i]);
    }
    const reduced = [];
    for (let i = 0; i < minimal.length; i++) {
      spend();
      reduced.push(monic(remainder(minimal[i], minimal, i)));
    }
    reduced.sort((a, b) => { spend(); return comparePowers(a[0].powers, b[0].powers); });
    return finish(reduced);
  }

  return Object.freeze({ basis });
}));
