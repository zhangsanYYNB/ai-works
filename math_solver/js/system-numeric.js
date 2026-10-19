/* Standalone, deterministic search for isolated real zeros (no CAS dependencies). */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MathSolverSystemNumeric = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPS = Number.EPSILON;
  const DIFFERENCE_STEP = Math.cbrt(EPS);
  const ROOT_TOLERANCE = 1e-9;
  const RANK_TOLERANCE = 1e-8;
  const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19];

  function integer(value, name, minimum, maximum) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(name + ' must be an integer in [' + minimum + ', ' + maximum + ']');
    }
    return value;
  }

  function halton(index, base) {
    let result = 0, fraction = 1;
    // A safe integer has at most 53 binary digits.
    for (let k = 0; k < 54 && index > 0; k++) {
      fraction /= base;
      result += fraction * (index % base);
      index = Math.floor(index / base);
    }
    return result;
  }

  function norm(vector) {
    return Math.hypot.apply(null, vector);
  }

  function dot(a, b) {
    let value = 0;
    for (let i = 0; i < a.length; i++) value += a[i] * b[i];
    return value;
  }

  // Column-pivoted, twice-orthogonalized QR. Unlike normal equations this
  // preserves useful rank information for rectangular and nearly singular J.
  function factor(matrix, rhs) {
    const m = matrix.length, n = matrix[0].length;
    const scales = Array.from({ length: n }, (_, j) => norm(matrix.map(row => row[j])) || 1);
    const columns = scales.map((scale, j) => matrix.map(row => row[j] / scale));
    const permutation = Array.from({ length: n }, (_, j) => j);
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    const projected = Array(n).fill(0);
    let rank = 0;
    for (let k = 0; k < Math.min(m, n); k++) {
      let pivot = k;
      for (let j = k + 1; j < n; j++) {
        if (norm(columns[j]) > norm(columns[pivot])) pivot = j;
      }
      [columns[k], columns[pivot]] = [columns[pivot], columns[k]];
      [permutation[k], permutation[pivot]] = [permutation[pivot], permutation[k]];
      for (let i = 0; i < k; i++) [r[i][k], r[i][pivot]] = [r[i][pivot], r[i][k]];
      const diagonal = norm(columns[k]);
      if (!(diagonal > RANK_TOLERANCE)) break;
      r[k][k] = diagonal;
      const q = columns[k].map(value => value / diagonal);
      projected[k] = -dot(q, rhs);
      for (let j = k + 1; j < n; j++) {
        for (let pass = 0; pass < 2; pass++) {
          const projection = dot(q, columns[j]);
          r[k][j] += projection;
          for (let i = 0; i < m; i++) columns[j][i] -= projection * q[i];
        }
      }
      rank++;
    }
    const z = Array(n).fill(0);
    for (let i = rank - 1; i >= 0; i--) {
      let value = projected[i];
      for (let j = i + 1; j < rank; j++) value -= r[i][j] * z[j];
      z[i] = value / r[i][i];
    }
    const step = Array(n).fill(0);
    for (let j = 0; j < n; j++) step[permutation[j]] = z[j] / scales[permutation[j]];
    let weakDirection = null, weakness = 0;
    if (rank === n) {
      const direction = Array(n).fill(0);
      direction[n - 1] = 1;
      for (let i = n - 2; i >= 0; i--) {
        for (let j = i + 1; j < n; j++) direction[i] -= r[i][j] * direction[j];
        direction[i] /= r[i][i];
      }
      const smallestScale = Math.min.apply(null, scales);
      weakDirection = Array(n).fill(0);
      for (let j = 0; j < n; j++) {
        weakDirection[permutation[j]] = direction[j] * (smallestScale / scales[permutation[j]]);
      }
      const length = Math.max.apply(null, weakDirection.map(Math.abs));
      weakDirection = weakDirection.map(value => value / length);
      weakness = norm(matrix.map(row => dot(row, weakDirection)));
    }
    return { rank, step, scales, weakDirection, weakness };
  }

  // LM is a fallback when the undamped QR step does not reduce the residual.
  // Column equilibration keeps these small damped normal equations well scaled.
  function dampedStep(matrix, rhs, scales, damping) {
    const n = scales.length;
    const a = Array.from({ length: n }, () => Array(n + 1).fill(0));
    for (let i = 0; i < n; i++) {
      for (let row = 0; row < matrix.length; row++) {
        const entry = matrix[row][i] / scales[i];
        a[i][n] -= entry * rhs[row];
        for (let j = 0; j < n; j++) a[i][j] += entry * matrix[row][j] / scales[j];
      }
      a[i][i] += damping;
    }
    for (let k = 0; k < n; k++) {
      let pivot = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
      [a[k], a[pivot]] = [a[pivot], a[k]];
      if (!(Math.abs(a[k][k]) > EPS * damping)) return null;
      for (let i = k + 1; i < n; i++) {
        const multiplier = a[i][k] / a[k][k];
        for (let j = k + 1; j <= n; j++) a[i][j] -= multiplier * a[k][j];
      }
    }
    const step = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let value = a[i][n];
      for (let j = i + 1; j < n; j++) value -= a[i][j] * step[j];
      step[i] = value / a[i][i];
    }
    return step.map((value, j) => value / scales[j]);
  }

  /**
   * Search a scalar box, lower <= x[j] <= upper, for n <= 8, m <= 16.
   * Invalid options throw; invalid/throwing/nonfinite evaluations are samples
   * outside the domain. Every callback invocation, including validation and
   * differences, counts against maxEvaluations. Inputs/outputs are copied.
   *
   * residual is the maximum dimensionless, locally row-scaled residual, not
   * the raw infinity norm. There is no absolute residual floor: multiplying a
   * row by 1e-100 must not change its meaning.
   *
   * Only locally regular, full-column-rank zeros are returned. Sign checks,
   * finer differences and probes along weak directions guard flat positive
   * minima, touching roots and spurious rank from finite-difference errors.
   * Singular/repeated zeros can set rankDeficient, but are not emitted as
   * isolated roots. That flag is a candidate warning, not proof of a family.
   * Close/ill-conditioned roots, discontinuities and opaque floating-point
   * callbacks cannot be certified in general; this finite search is heuristic.
   * Deduplication combines an 8e-9 coordinate-scale floor with Newton and
   * conditioning error estimates; opposite local crossings preserve resolvable
   * close roots. Coordinates are never rounded or snapped to an exact value.
   * limited means an evaluation/start/solution/iteration cap was reached; even
   * limited:false does not certify that the box has no other roots.
   */
  function search(options) {
    if (!options || typeof options !== 'object') throw new TypeError('search requires options');
    const {
      dimensions, equations, lower, upper, evaluate,
      maxEvaluations = 20000, maxStarts = 160, maxSolutions = 64
    } = options;
    const n = integer(dimensions, 'dimensions', 1, 8);
    const m = integer(equations, 'equations', 1, 16);
    integer(maxEvaluations, 'maxEvaluations', 0, Number.MAX_SAFE_INTEGER);
    integer(maxStarts, 'maxStarts', 0, Number.MAX_SAFE_INTEGER);
    integer(maxSolutions, 'maxSolutions', 0, Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || !(lower < upper)) {
      throw new RangeError('lower and upper must be finite scalars with lower < upper');
    }
    if (typeof evaluate !== 'function') throw new TypeError('evaluate must be a function');

    const result = { roots: [], evaluations: 0, starts: 0, limited: false, rankDeficient: false };
    if (!maxEvaluations || !maxStarts || !maxSolutions) {
      result.limited = true;
      return result;
    }
    const clamp = value => Math.max(lower, Math.min(upper, value));
    const midpoint = lower / 2 + upper / 2;
    const width = upper - lower; // May be Infinity even though both bounds are finite.
    const origin = clamp(0);
    const coordinateScales = point => point.map(value => Math.max(Math.abs(value), Math.min(1, width)));
    let startEnd = maxEvaluations;

    function sample(point) {
      if (result.evaluations >= maxEvaluations || result.evaluations >= startEnd) {
        result.limited = true;
        return null;
      }
      if (!point.every(value => Number.isFinite(value) && value >= lower && value <= upper)) return null;
      result.evaluations++;
      try {
        const values = evaluate(point.slice());
        if (!Array.isArray(values) || values.length !== m) return null;
        const copy = Array(m);
        for (let i = 0; i < m; i++) {
          if (typeof values[i] !== 'number' || !Number.isFinite(values[i])) return null;
          copy[i] = values[i];
        }
        return copy;
      } catch (_) {
        return null;
      }
    }

    function available() {
      return result.evaluations < maxEvaluations && result.evaluations < startEnd;
    }

    function probe(point, column, distance) {
      // Shorten differences near domain holes, with a fixed retry bound.
      for (let attempt = 0; attempt < 4 && available(); attempt++) {
        const next = point.slice();
        next[column] = clamp(point[column] + distance);
        if (next[column] === point[column]) return null;
        const values = sample(next);
        if (values) return { values, delta: next[column] - point[column] };
        distance *= 0.25;
      }
      return null;
    }

    function jacobian(point, values, fraction = DIFFERENCE_STEP) {
      const scales = coordinateScales(point);
      const probes = [];
      for (let j = 0; j < n; j++) {
        if (!available()) return null;
        const distance = Math.max(fraction * scales[j], 8 * EPS * Math.abs(point[j]), Number.MIN_VALUE);
        let plus = probe(point, j, distance);
        let minus = probe(point, j, -distance);
        if (!plus && !minus) return null;
        // At a box/domain boundary, extrapolate two one-sided secants back to
        // the candidate. A single forward difference would give x^2 a false J.
        if (!plus || !minus) {
          const far = plus || minus;
          const near = probe(point, j, far.delta / 2);
          if (!near || near.delta === far.delta) return null;
          plus = far;
          minus = near;
        }
        probes.push([plus, minus]);
      }
      const amplitudes = values.map(Math.abs);
      for (const pair of probes) for (const p of pair) {
        for (let i = 0; i < m; i++) amplitudes[i] = Math.max(amplitudes[i], Math.abs(p.values[i]));
      }
      const matrix = Array.from({ length: m }, () => Array(n).fill(0));
      const rhs = Array(m).fill(0), divisors = Array(m).fill(1);
      const gradients = Array(m).fill(0), curvature = Array(m).fill(0);
      const positive = values.map(value => value > 0), negative = values.map(value => value < 0);
      const oneSided = Array(m).fill(false);
      for (let i = 0; i < m; i++) {
        const amplitude = amplitudes[i];
        if (!amplitude) continue;
        const center = values[i] / amplitude;
        for (let j = 0; j < n; j++) {
          const [p, q] = probes[j];
          const tp = p.delta / scales[j], tq = q.delta / scales[j];
          const sp = (p.values[i] / amplitude - center) / tp;
          const sq = (q.values[i] / amplitude - center) / tq;
          // Quadratic interpolation works for unequal and one-sided steps.
          const denominator = tp - tq;
          const derivative = (tp / denominator) * sq - (tq / denominator) * sp;
          if (!Number.isFinite(derivative) || !Number.isFinite(sp) || !Number.isFinite(sq)) return null;
          matrix[i][j] = derivative;
          gradients[i] = Math.max(gradients[i], Math.abs(derivative));
          curvature[i] = Math.max(curvature[i], Math.abs(sp - sq));
          positive[i] = positive[i] || p.values[i] > 0 || q.values[i] > 0;
          negative[i] = negative[i] || p.values[i] < 0 || q.values[i] < 0;
          if (tp * tq > 0 && Math.abs(derivative) > 0) oneSided[i] = true;
        }
        divisors[i] = Math.max(Math.abs(center), gradients[i]) || 1;
        rhs[i] = center / divisors[i];
        for (let j = 0; j < n; j++) matrix[i][j] /= divisors[i];
      }
      return { matrix, rhs, scales, amplitudes, divisors, gradients, curvature, positive, negative, oneSided,
        residual: Math.max.apply(null, rhs.map(Math.abs)) };
    }

    function merit(values, model) {
      let sum = 0;
      for (let i = 0; i < m; i++) {
        if (!model.amplitudes[i]) {
          if (values[i] !== 0) return Infinity;
        } else {
          const relative = (values[i] / model.amplitudes[i]) / model.divisors[i];
          sum += relative * relative;
        }
      }
      return sum;
    }

    // Individual rows can cross zero even when their intersection merely
    // touches (exp(x)+y=3, x+y=2). Check the weakest *combined* direction too.
    // This also catches a tiny, artificial J column caused by truncation at a
    // continuous family: column equilibration alone would magnify that error.
    function weakDirectionIsRegular(point, model, decomposition) {
      if (decomposition.weakness >= 1e-4) return true;
      const direction = decomposition.weakDirection;
      if (!direction || !direction.every(Number.isFinite)) return false;
      let anchor = 0;
      for (let j = 1; j < n; j++) if (Math.abs(direction[j]) > Math.abs(direction[anchor])) anchor = j;

      function directionalProbe(distance) {
        let alpha = 1;
        for (let j = 0; j < n; j++) {
          const change = distance * direction[j];
          if (change > 0) alpha = Math.min(alpha,
            (upper / model.scales[j] - point[j] / model.scales[j]) / change);
          if (change < 0) alpha = Math.min(alpha,
            (lower / model.scales[j] - point[j] / model.scales[j]) / change);
        }
        distance *= alpha;
        for (let attempt = 0; attempt < 4 && available(); attempt++) {
          const next = point.map((value, j) => clamp(value + (distance * direction[j]) * model.scales[j]));
          const delta = ((next[anchor] - point[anchor]) / model.scales[anchor]) / direction[anchor];
          if (!delta) return null;
          const sampled = sample(next);
          if (sampled) return { values: sampled, delta };
          distance *= 0.25;
        }
        return null;
      }

      function directionalModel(distance) {
        let p = directionalProbe(distance), q = directionalProbe(-distance);
        if (!p && !q) return null;
        if (!p || !q) {
          p = p || q;
          q = directionalProbe(p.delta / 2);
          if (!q || q.delta === p.delta) return null;
        }
        const derivative = [], curvature = [], fp = [], fq = [];
        for (let i = 0; i < m; i++) {
          const relative = value => model.amplitudes[i] ?
            (value / model.amplitudes[i]) / model.divisors[i] : (value === 0 ? 0 : NaN);
          fp.push(relative(p.values[i]));
          fq.push(relative(q.values[i]));
          const sp = (fp[i] - model.rhs[i]) / p.delta;
          const sq = (fq[i] - model.rhs[i]) / q.delta;
          const denominator = p.delta - q.delta;
          derivative.push((p.delta / denominator) * sq - (q.delta / denominator) * sp);
          curvature.push(sp - sq);
        }
        if (!derivative.concat(curvature).every(Number.isFinite)) return null;
        return { derivative, curvature: norm(curvature), fp, fq, twoSided: p.delta * q.delta < 0 };
      }

      let distance = DIFFERENCE_STEP;
      let local = directionalModel(distance);
      if (!local) return null;
      let strength = norm(local.derivative);
      if (!strength) return false;
      if (local.curvature > 0.02 * strength) {
        distance *= 0.005 * strength / local.curvature;
        local = directionalModel(distance);
        if (!local) return null;
        strength = norm(local.derivative);
      }
      const predicted = model.matrix.map(row => dot(row, direction));
      const discrepancy = norm(local.derivative.map((value, i) => value - predicted[i]));
      if (!strength || local.curvature > 0.05 * strength ||
          discrepancy > 0.1 * Math.max(strength, decomposition.weakness)) return false;
      if (local.twoSided) {
        const p = dot(local.fp, local.derivative), q = dot(local.fq, local.derivative);
        if (!((p > 0 && q < 0) || (p < 0 && q > 0))) return false;
      }
      return true;
    }

    function verify(point) {
      // Always re-evaluate the selected point; never accept a cached iterate.
      const values = sample(point);
      if (!values) return null;
      let model = jacobian(point, values);
      if (!model || model.residual > ROOT_TOLERANCE) return null;
      const flat = model.gradients.map((gradient, i) => model.curvature[i] > 0.02 * gradient);
      let finerFraction = DIFFERENCE_STEP;
      for (let i = 0; i < m; i++) {
        if (flat[i] && model.gradients[i] > 0) {
          finerFraction = Math.min(finerFraction,
            DIFFERENCE_STEP * 0.005 * model.gradients[i] / model.curvature[i]);
        }
      }
      if (finerFraction < DIFFERENCE_STEP) {
        const fine = jacobian(point, values, finerFraction);
        if (!fine || fine.residual > ROOT_TOLERANCE) return null;
        model = fine;
      }
      for (let i = 0; i < m; i++) {
        const crossing = model.positive[i] && model.negative[i];
        const regularBoundary = !flat[i] && model.oneSided[i] &&
          model.curvature[i] <= 0.02 * model.gradients[i];
        if (values[i] === 0) {
          // A zero with no sign change supplies no evidence of a regular
          // derivative (e.g. a squared row or an exp-underflow plateau).
          if (!crossing && !regularBoundary) model.matrix[i].fill(0);
        } else if (!crossing && !regularBoundary) {
          return null;
        }
        // Historically flat rows must actually cross zero at the finer scale.
        // In particular x^2 + 1e-20 can never pass by having a tiny |f|/|J|.
        if (flat[i] && values[i] !== 0 && !crossing) return null;
        if (regularBoundary && Math.abs(model.rhs[i]) > 1e-12) return null;
      }
      const decomposition = factor(model.matrix, model.rhs);
      if (decomposition.rank < n) {
        result.rankDeficient = true;
        return { singular: true };
      }
      const regular = weakDirectionIsRegular(point, model, decomposition);
      if (regular === null) return null;
      if (!regular) {
        result.rankDeficient = true;
        return { singular: true };
      }
      if (!decomposition.step.every(step => Number.isFinite(step) && Math.abs(step) <= ROOT_TOLERANCE)) return null;
      // The floor merges ordinary floating-point plateaus near zero. A small
      // weak-direction response increases uncertainty through conditioning.
      const uncertainty = decomposition.step.map((step, j) => Math.max(
        4 * Math.abs(step) * model.scales[j],
        8 * ROOT_TOLERANCE * model.scales[j],
        16 * EPS * model.scales[j] / Math.max(EPS, decomposition.weakness)));
      return { values: point.slice(), residual: model.residual, rank: decomposition.rank, uncertainty,
        matrix: model.matrix, scales: model.scales };
    }

    const accepted = [];
    function oppositeCrossings(a, b) {
      // Preserve distinguishable close roots, e.g. x^2-1e-32: their local
      // directional slopes point in opposite directions. A single rounded
      // plateau around a regular root has the same slope at both candidates.
      const chord = a.values.map((value, j) => value - b.values[j]);
      for (let i = 0; i < m; i++) {
        const ta = a.matrix[i].map((value, j) => value * (chord[j] / a.scales[j]));
        const tb = b.matrix[i].map((value, j) => value * (chord[j] / b.scales[j]));
        const sa = ta.reduce((sum, value) => sum + value, 0);
        const sb = tb.reduce((sum, value) => sum + value, 0);
        if (((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) &&
            Math.abs(sa) > 1e-3 * ta.reduce((sum, value) => sum + Math.abs(value), 0) &&
            Math.abs(sb) > 1e-3 * tb.reduce((sum, value) => sum + Math.abs(value), 0)) return true;
      }
      return false;
    }

    function remember(candidate) {
      for (let i = 0; i < accepted.length; i++) {
        const previous = accepted[i];
        if (candidate.values.every((value, j) => Math.abs(value - previous.values[j]) <=
          candidate.uncertainty[j] + previous.uncertainty[j]) && !oppositeCrossings(candidate, previous)) {
          if (candidate.residual < previous.residual) accepted[i] = candidate;
          return;
        }
      }
      accepted.push(candidate);
    }

    const seeds = [], seenSeeds = new Set();
    function seed(point) {
      const bounded = point.map(clamp);
      const key = bounded.join(','); // Exact Number serialization, no rounding.
      if (!seenSeeds.has(key)) {
        seenSeeds.add(key);
        seeds.push(bounded);
      }
    }
    seed(Array(n).fill(midpoint));
    seed(Array(n).fill(origin));
    for (const radius of [-1, 1, -0.1, 0.1, -10, 10]) seed(Array(n).fill(radius));
    for (let j = 0; j < n; j++) for (const value of [-1, 1]) {
      const point = Array(n).fill(origin);
      point[j] = value;
      seed(point);
    }
    if (n <= 3) {
      for (let k = 0; k < 3 ** n; k++) {
        let code = k;
        seed(Array.from({ length: n }, () => {
          const value = code % 3 - 1;
          code = Math.floor(code / 3);
          return value;
        }));
      }
    }
    seed(Array(n).fill(lower));
    seed(Array(n).fill(upper));
    for (let k = 0; k < Math.min(16, 2 ** n); k++) {
      seed(Array.from({ length: n }, (_, j) => (k & (1 << j)) ? upper : lower));
    }
    for (let j = 0; j < n; j++) for (const value of [lower, upper]) {
      const point = Array(n).fill(origin);
      point[j] = value;
      seed(point);
    }

    function startPoint(index) {
      if (index < seeds.length) return seeds[index];
      const k = index - seeds.length + 1;
      const mode = (k - 1) % 4;
      const radius = (mode === 1 ? 1 : mode === 2 ? 10 : 10 ** (Math.floor(k / 4) % 13 - 6)) *
        Math.max(1, Math.abs(origin));
      return Array.from({ length: n }, (_, j) => {
        const t = halton(k, PRIMES[j]);
        return mode === 0 ? clamp((1 - t) * lower + t * upper) : clamp(origin + (2 * t - 1) * radius);
      });
    }

    const perStart = Math.max(32 + 8 * n, Math.min(700, Math.floor(maxEvaluations / Math.min(maxStarts, 32))));
    for (let start = 0; start < maxStarts && result.evaluations < maxEvaluations; start++) {
      if (accepted.length >= maxSolutions) break;
      result.starts++;
      startEnd = Math.min(maxEvaluations, result.evaluations + perStart);
      let point = startPoint(start), values = sample(point);
      if (!values) continue;
      for (let iteration = 0; iteration < 64 && available(); iteration++) {
        const model = jacobian(point, values);
        if (!model) break;
        const qr = factor(model.matrix, model.rhs);
        const correction = Math.max.apply(null, qr.step.map(Math.abs));
        if (model.residual <= 2e-13 && (correction <= 2e-12 || qr.rank < n)) {
          const candidate = verify(point);
          if (candidate) {
            if (!candidate.singular) remember(candidate);
            break;
          }
        }
        const previousMerit = dot(model.rhs, model.rhs);
        let improved = false;
        for (let attempt = 0; attempt < 5 && available() && !improved; attempt++) {
          let step = attempt === 0 ? qr.step :
            dampedStep(model.matrix, model.rhs, qr.scales, 10 ** (2 * attempt - 6));
          if (!step || !step.every(Number.isFinite)) continue;
          const length = Math.max.apply(null, step.map(Math.abs));
          if (!length) continue;
          if (length > 8) step = step.map(value => value * (8 / length));
          // Uniformly shorten the step to remain in the box before backtracking.
          let alpha = 1;
          for (let j = 0; j < n; j++) {
            if (step[j] > 0) alpha = Math.min(alpha, (upper / model.scales[j] - point[j] / model.scales[j]) / step[j]);
            if (step[j] < 0) alpha = Math.min(alpha, (lower / model.scales[j] - point[j] / model.scales[j]) / step[j]);
          }
          for (let line = 0; line < 12 && alpha > 0 && available(); line++, alpha *= 0.5) {
            const next = point.map((value, j) => clamp(value + (alpha * step[j]) * model.scales[j]));
            if (next.every((value, j) => value === point[j])) break;
            const nextValues = sample(next);
            if (nextValues && merit(nextValues, model) < previousMerit * (1 - 1e-4 * alpha)) {
              point = next;
              values = nextValues;
              improved = true;
              break;
            }
          }
        }
        if (!improved) {
          // At floating-point stagnation, apply the same fresh validation with
          // the public tolerance; no coordinate snapping or rounded roots.
          if (model.residual <= ROOT_TOLERANCE && available()) {
            const candidate = verify(point);
            if (candidate && !candidate.singular) remember(candidate);
          }
          break;
        }
        if (iteration === 63) result.limited = true;
      }
      if (result.evaluations >= startEnd) result.limited = true;
    }
    if (result.evaluations >= maxEvaluations || result.starts >= maxStarts || accepted.length >= maxSolutions) {
      result.limited = true;
    }
    accepted.sort((a, b) => {
      for (let j = 0; j < n; j++) if (a.values[j] !== b.values[j]) return a.values[j] - b.values[j];
      return 0;
    });
    result.roots = accepted.map(({ values, residual, rank }) => ({ values, residual, rank }));
    return result;
  }

  return Object.freeze({ search });
}));
