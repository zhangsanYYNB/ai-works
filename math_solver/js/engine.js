/* MathSolverEngine — synchronous, offline math engine (mathjs 14/15 + Nerdamer all).
 * Browser: window.MathSolverEngine. Node: require('./engine.js').
 * solve(input, options) returns the result contract used by the Chinese UI.
 * solutions, when present, contains { variable, exact, approximate, real, multiplicity }.
 * evaluateAt returns a mathjs scalar/matrix; a non-real scalar is a mathjs Complex.
 * examples is a readonly ARRAY of {label,input,mode,options?}, not a function.
 * graphs use x as their horizontal variable, including when options.variable is t.
 * Non-polynomial real roots use rootLower/rootUpper (default -10/10), never an
 * unbounded or exhaustive search. Numeric solutions carry numerical: true.
 * No JavaScript evaluation, assignments, object access, imports or user functions.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    function load(path) {
      try { return require(path); }
      catch (error) {
        if (error.code === 'MODULE_NOT_FOUND' && String(error.message).includes(path)) return null;
        // Nerdamer's browser "all" bundle still contains CommonJS requires for its
        // unbundled sources. Execute this trusted LOCAL vendor bundle as a browser
        // script; user expressions are never evaluated as JavaScript.
        if (path.includes('nerdamer') && error.code === 'MODULE_NOT_FOUND') {
          const fs = require('node:fs'), vm = require('node:vm'), nodePath = require('node:path');
          const context = vm.createContext({ console });
          vm.runInContext(fs.readFileSync(nodePath.join(__dirname, path), 'utf8'), context, { timeout: 5000 });
          context.nerdamer.__boundedEvaluate = function (expression) {
            context.__engineExpression = expression;
            return vm.runInContext('nerdamer(__engineExpression)', context, { timeout: 1200 });
          };
          return context.nerdamer;
        }
        throw error;
      }
    }
    module.exports = factory(load('../vendor/math.min.js'), load('../vendor/nerdamer.min.js'), root);
  } else {
    root.MathSolverEngine = factory(root.math, root.nerdamer, root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (initialMath, initialCAS, root) {
  'use strict';

  const LIMITS = Object.freeze({ input: 1200, nodes: 360, depth: 36, degree: 12,
    factorial: 170, series: 200, evaluations: 16000, data: 256, matrix: 10,
    inverse: 8, expansion: 1600, output: 18000, quadrature: 4097,
    rootSegments: 1024, rootEvaluations: 6000, rootSolutions: 64, rootOperations: 300000 });
  const MODES = new Set(['auto', 'evaluate', 'simplify', 'expand', 'factor', 'solve',
    'derivative', 'integral', 'limit', 'statistics', 'matrix', 'units']);
  const FUNCTIONS = new Set(('sqrt nthRoot cbrt abs sign exp log log10 log2 sin cos tan sec csc cot '
    + 'asin acos atan atan2 asec acsc acot sinh cosh tanh asinh acosh atanh '
    + 'floor ceil round trunc fix factorial gamma mod gcd lcm combinations permutations '
    + 'sum prod product mean median min max variance std det inv transpose trace diag '
    + 'dot cross norm identity zeros ones size re im conj arg complex fraction erf erfc').split(' '));
  const COMMANDS = new Set(['diff', 'derivative', 'integrate', 'integral', 'limit',
    'simplify', 'expand', 'factor', 'solve', 'statistics', 'stats', 'matrix', 'evaluate']);
  const CONSTANTS = new Set(['pi', 'e', 'i', 'Infinity']);
  const FORBIDDEN = /^(?:__.*|constructor|prototype|import|evaluate|parse|compile|createUnit|reviver|simplifyCore|unit|help|print|random|randomInt)$/;
  const DIRECT_TRIG = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot']);
  const INVERSE_TRIG = new Set(['asin', 'acos', 'atan', 'asec', 'acsc', 'acot']);
  let math = initialMath;
  let nerdamer = initialCAS;

  function libraries(casNeeded) {
    math = math || root.math;
    nerdamer = nerdamer || root.nerdamer;
    if (!math || typeof math.parse !== 'function') throw new Error('数学计算库尚未加载，请检查本地 vendor/math.min.js。');
    if (casNeeded && typeof nerdamer !== 'function') throw new Error('符号计算库尚未加载，请检查本地 vendor/nerdamer.min.js。');
  }
  function fail(message) { throw new Error(message); }
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function boundedText(text, limit) {
    if (text.length > limit) fail('表达式过长或计算结果过于复杂，请拆成较小的计算。');
    return text;
  }
  function optionsFor(options) {
    const source = options || {};
    const opts = Object.assign({ mode: 'auto', variable: 'x', angle: 'rad', precision: 10,
      order: 1, lower: '', upper: '', point: '0', direction: 'both', rootLower: '-10', rootUpper: '10' }, source);
    opts.variableExplicit = own(source, 'variableExplicit') ? !!source.variableExplicit : own(source, 'variable');
    if (!MODES.has(opts.mode)) fail('不支持此模式，请选择计算、代数、方程、微积分、统计或矩阵。');
    if (typeof opts.variable !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(opts.variable)
      || FUNCTIONS.has(opts.variable) || CONSTANTS.has(opts.variable) || FORBIDDEN.test(opts.variable)) {
      fail('变量名应为英文字母开头的短名称，例如 x、y 或 t。');
    }
    if (!['rad', 'deg'].includes(opts.angle)) fail('角度单位应为 rad（弧度）或 deg（角度）。');
    opts.precision = Number(opts.precision);
    if (!Number.isInteger(opts.precision) || opts.precision < 2 || opts.precision > 15) fail('精度应为 2 到 15 位有效数字。');
    opts.order = Number(opts.order);
    if (!Number.isInteger(opts.order) || opts.order < 1 || opts.order > 5) fail('求导阶数应为 1 到 5 的整数。');
    if (!['both', 'left', 'right'].includes(opts.direction)) fail('极限方向应为 both、left 或 right。');
    for (const key of ['lower', 'upper', 'point', 'rootLower', 'rootUpper']) {
      if (typeof opts[key] !== 'string' && typeof opts[key] !== 'number') fail('积分上下限、极限点及根搜索端点应为数字或数学表达式。');
      opts[key] = String(opts[key]).trim();
      if (opts[key].length > 100) fail('积分上下限、极限点或根搜索端点过长。');
    }
    return opts;
  }

  function splitTop(text, separators) {
    const pieces = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { depth--; if (depth < 0) fail('括号不匹配，请检查输入。'); }
      else if (depth === 0 && separators.includes(c)) { pieces.push(text.slice(start, i).trim()); start = i + 1; }
      if (depth > LIMITS.depth) fail('括号嵌套过深，请简化表达式。');
    }
    if (depth !== 0) fail('括号不匹配，请检查输入。');
    pieces.push(text.slice(start).trim());
    return pieces;
  }
  function groupAt(text, start, open, close) {
    if (text[start] !== open) fail('LaTeX 分数或根式缺少括号。');
    let depth = 1;
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === open) depth++;
      if (text[i] === close && --depth === 0) return { value: text.slice(start + 1, i), end: i + 1 };
    }
    fail('LaTeX 括号不匹配。');
  }
  function latexInput(text) {
    // "\sin^2(x)" means (sin x)^2; left alone it reads as sin(2)·x downstream.
    text = text.replace(/\\(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|arcsin|arccos|arctan|exp)\s*\^\s*\{?\s*(-?\d+)\s*\}?\s*\(([^()]*)\)/g,
      (all, name, power, argument) => name + '(' + argument + ')^' + power);
    text = text.replace(/\\(?:left|right)\s*/g, '')
      .replace(/\\(?:cdot|times)/g, '*').replace(/\\div/g, '/')
      .replace(/\\pi\b/g, ' pi ').replace(/\\imaginaryI\b/g, ' i ').replace(/\\infty\b/g, ' Infinity ')
      .replace(/\\(?:leq|le)\b/g, '<=').replace(/\\(?:geq|ge)\b/g, '>=')
      .replace(/\\neq\b/g, '!=').replace(/\\,/g, ' ')
      .replace(/\\(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|arcsin|arccos|arctan|log|ln|exp)\b/g, '$1')
      .replace(/\\operatorname\{([a-zA-Z][a-zA-Z0-9]*)\}/g, '$1');
    let rounds = 0;
    while (/\\(?:frac|dfrac|tfrac|sqrt)/.test(text)) {
      if (++rounds > 30) fail('LaTeX 嵌套过于复杂。');
      const match = /\\(frac|dfrac|tfrac|sqrt)\s*/.exec(text);
      let index = match.index + match[0].length, degree = null;
      if (match[1] === 'sqrt' && text[index] === '[') {
        const g = groupAt(text, index, '[', ']'); degree = g.value; index = g.end;
      }
      while (/\s/.test(text[index] || '') && index < text.length) index++;
      const first = groupAt(text, index, '{', '}');
      let end = first.end, replacement;
      if (match[1] === 'sqrt') replacement = degree ? 'nthRoot((' + first.value + '),' + degree + ')' : 'sqrt(' + first.value + ')';
      else {
        while (/\s/.test(text[end] || '') && end < text.length) end++;
        const second = groupAt(text, end, '{', '}'); end = second.end;
        replacement = '((' + first.value + ')/(' + second.value + '))';
      }
      text = text.slice(0, match.index) + replacement + text.slice(end);
    }
    if (text.includes('\\')) fail('此 LaTeX 命令暂不支持，请使用普通数学表达式。');
    return text.replace(/\{/g, '(').replace(/\}/g, ')');
  }
  function skipSpace(text, index) { while (index < text.length && (text[index] === ' ' || text[index] === '\t')) index++; return index; }
  // Reads either a braced LaTeX group or a single following token.
  function latexGroupAt(text, start) {
    const index = skipSpace(text, start);
    if (text[index] !== '{') return { value: text[index] === undefined ? '' : text[index], end: index + 1 };
    let depth = 1;
    for (let i = index + 1; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return { value: text.slice(index + 1, i), end: i + 1 };
    }
    fail('LaTeX 括号不匹配。');
  }
  // Reads the "_" or "^" script that follows a macro, or null when it is absent.
  function latexScript(text, start, marker) {
    const index = skipSpace(text, start);
    if (text[index] !== marker) return null;
    return latexGroupAt(text, index + 1);
  }
  function cleanLatexSpacing(text) {
    return text.replace(/\\[ ,;!]/g, ' ').replace(/\\(?:quad|qquad|displaystyle|textstyle|limits|nolimits)\b/g, ' ')
      .replace(/\\(?:big|Big|bigg|Bigg)(?:l|r|m)?\b/g, '').replace(/\\!+/g, '').replace(/[ \t]{2,}/g, ' ');
  }
  // "…\,dx" or "…\mathrm{d}x" names the integration/differentiation variable. Anything the
  // user wrote after that differential stays outside the integral.
  function splitDifferential(text) {
    const match = /^([\s\S]*?)\s*(?:\\[ ,;!]|\s)\s*(?:\\(?:mathrm|text|operatorname)\s*\{\s*d\s*\}|\bd)\s*([a-zA-Z][a-zA-Z0-9_]*)\s*([\s\S]*)$/.exec(text);
    if (!match || !match[1].trim()) return { body: text.trim(), variable: '', rest: '' };
    return { body: match[1].trim(), variable: match[2], rest: match[3].trim() };
  }
  const LATEX_CALCULUS = /\\(int|iint|iiint|oint|lim|sum|prod)(?![a-zA-Z])/g;
  // \frac{\mathrm{d}y}{\mathrm{d}x} and the plain \mathrm{d}y/\mathrm{d}x spellings.
  const LATEX_DIFFERENTIAL = new RegExp(
    '\\\\frac\\s*\\{\\s*\\\\(?:mathrm|text|operatorname)\\s*\\{\\s*d\\s*\\}?\\s*([a-zA-Z][a-zA-Z0-9_]*)?\\s*\\}'
    + '\\s*\\{\\s*\\\\(?:mathrm|text|operatorname)\\s*\\{\\s*d\\s*\\}?\\s*([a-zA-Z][a-zA-Z0-9_]*)?\\s*\\}'
    + '|\\\\(?:mathrm|text|operatorname)\\s*\\{\\s*d\\s*\\}?\\s*([a-zA-Z][a-zA-Z0-9_]*)?\\s*/\\s*\\\\d\\s*([a-zA-Z][a-zA-Z0-9_]*)', 'g');
  /* Turns math-field LaTeX such as \int_0^\pi \sin(x)\,dx, \lim_{x\to0^+} f(x) or
   * \frac{d}{dx}f(x) into the engine's explicit command syntax, so a formula can be written
   * where the cursor is instead of in the separate bound fields below the editor.
   * Returns null when there is nothing to translate, which leaves the ordinary ASCII-math
   * path (and everything already working) untouched. */
  // "\int_0^\pi f(x)" leaves the integration variable implicit; when only one symbol survives
  // it is the variable, otherwise the one selected in the interface is used.
  function soleVariable(text) {
    const names = new Set();
    for (const match of text.replace(/\\[a-zA-Z]+/g, ' ').matchAll(/[a-zA-Z][a-zA-Z0-9_]*/g)) {
      const name = match[0];
      if (FUNCTIONS.has(name) || CONSTANTS.has(name) || COMMANDS.has(name) || FORBIDDEN.test(name)) continue;
      names.add(name);
    }
    return names.size === 1 ? Array.from(names)[0] : '';
  }
  function fromLatex(latex, options) {
    if (typeof latex !== 'string' || !latex.trim() || latex.length > LIMITS.input * 4) return null;
    const selected = options && typeof options.variable === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(options.variable) ? options.variable : 'x';
    const hits = [];
    let found;
    LATEX_CALCULUS.lastIndex = 0;
    while ((found = LATEX_CALCULUS.exec(latex))) {
      hits.push({ index: found.index, end: found.index + found[0].length, name: found[1] });
    }
    LATEX_DIFFERENTIAL.lastIndex = 0;
    while ((found = LATEX_DIFFERENTIAL.exec(latex))) {
      hits.push({ index: found.index, end: found.index + found[0].length, name: '',
        numerator: found[1] || '', denominator: found[2] });
    }
    if (!hits.length) return null;
    hits.sort((a, b) => a.index - b.index);
    const out = [];
    let cursor = 0;
    for (let h = 0; h < hits.length; h++) {
      const hit = hits[h];
      out.push(latex.slice(cursor, hit.index));
      const bodyEnd = h + 1 < hits.length ? hits[h + 1].index : latex.length;
      const isIntegral = !hit.name || /^(?:int|iint|iiint|oint)$/.test(hit.name);
      let start = hit.end, variable = '', lower = '', upper = '', direction = '';
      if (!hit.name) {
        // \frac{\mathrm{d}y}{\mathrm{d}x} f(x) differentiates with respect to x.
        const body = cleanLatexSpacing(latex.slice(hit.end, bodyEnd)).trim();
        if (!body) fail('求导号后面缺少被求导的函数。');
        out.push('diff(' + body + ',' + hit.denominator + ')');
        cursor = bodyEnd;
        continue;
      }
      if (hit.name === 'lim') {
        const sub = latexScript(latex, start, '_');
        if (!sub) fail('极限需要写成 \\lim_{x\\to a} 的形式。');
        start = sub.end;
        const target = /^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*(?:\\to|\\rightarrow|->)\s*([\s\S]*)$/.exec(sub.value);
        if (!target) fail('极限下标应写成 \\lim_{x\\to a} 的形式。');
        variable = target[1];
        const point = target[2].trim();
        const side = /^(.*?)\s*\^\s*\{?\s*([+-])\s*\}?$/.exec(point);
        if (side) { direction = side[2] === '+' ? 'right' : 'left'; upper = side[1].trim(); } else upper = point;
      } else {
        const low = latexScript(latex, start, '_');
        const high = latexScript(latex, low ? low.end : start, '^');
        if (low) { start = low.end; lower = low.value.trim(); }
        if (high) { start = high.end; upper = high.value.trim(); }
        if (hit.name === 'sum' || hit.name === 'prod') {
          const pair = /^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*([\s\S]*)$/.exec(lower);
          if (!pair) fail('求和记号下标应写成 \\sum_{k=1}^{n} 的形式。');
          variable = pair[1]; lower = pair[2].trim();
        }
      }
      const raw = cleanLatexSpacing(latex.slice(start, bodyEnd));
      let rest = '';
      if (isIntegral) {
        const taken = splitDifferential(raw);
        if (!variable) variable = taken.variable || soleVariable(taken.body) || selected;
        rest = taken.rest;
        const body = taken.body;
        if (!body) fail('积分号后面缺少被积函数。');
        if (lower || upper) {
          if (!lower || !upper) fail('定积分需要同时写下限和上限，例如 \\int_{0}^{\\pi}。');
        }
        const bounds = lower && upper ? ',' + lower + ',' + upper : '';
        out.push('integrate(' + body + (variable ? ',' + variable : '') + bounds + ')');
      } else {
        const body = raw.trim();
        if (!body) fail(hit.name === 'lim' ? '极限号后面缺少表达式。' : '求和记号后面缺少表达式。');
        if (hit.name === 'lim') out.push('limit(' + body + ',' + variable + ',' + upper
          + (direction ? ',' + direction : '') + ')');
        else out.push((hit.name === 'sum' ? 'sum(' : 'product(') + body + ',' + variable + ',' + lower + ',' + upper + ')');
      }
      out.push(rest);
      cursor = bodyEnd;
    }
    out.push(latex.slice(cursor));
    return out.join('').replace(/[ \t]{2,}/g, ' ').trim();
  }
  function asciiGroups(text) {
    for (let count = 0; /\b(?:root|frac)\s*\(/.test(text); count++) {
      if (count > 30) fail('根式或分式嵌套过多。');
      const match = /\b(root|frac)\s*\(/.exec(text);
      const first = groupAt(text, match.index + match[0].length - 1, '(', ')');
      let index = first.end;
      while (text[index] === ' ') index++;
      const second = groupAt(text, index, '(', ')');
      const replacement = match[1] === 'root' ? 'nthRoot((' + second.value + '),(' + first.value + '))' : '((' + first.value + ')/(' + second.value + '))';
      text = text.slice(0, match.index) + replacement + text.slice(second.end);
    }
    // Opening bars occur where an operand is expected. This also accepts
    // |x+|y|| and ||x|-1|; ambiguous implicit products should use * or abs().
    if (text.includes('|')) {
      let rendered = '', depth = 0, operand = true;
      for (const c of text) {
        if (c === '|') {
          if (operand || depth === 0) { rendered += 'abs('; depth++; operand = true; }
          else { rendered += ')'; depth--; operand = false; }
        } else {
          rendered += c;
          if (!/\s/.test(c)) operand = /[([\{+\-*\/^,;=<>]/.test(c);
        }
      }
      if (depth) fail('绝对值竖线不匹配，请使用 abs(x)。');
      text = rendered;
    }
    return text;
  }
  function rootInput(text) {
    for (let pass = 0; /[√∛∜]/.test(text); pass++) {
      if (pass > 30) fail('根式嵌套过多。');
      let index = Math.max(text.lastIndexOf('√'), text.lastIndexOf('∛'), text.lastIndexOf('∜'));
      const symbol = text[index];
      let start = index + 1;
      while (text[start] === ' ') start++;
      let atom, end;
      if (text[start] === '(') { const g = groupAt(text, start, '(', ')'); atom = g.value; end = g.end; }
      else {
        const match = /^[+-]?(?:\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+|[a-zA-Z][a-zA-Z0-9_]*)/.exec(text.slice(start));
        if (!match) fail('根号后需要数字、变量或括号，例如 √(x+1)。');
        atom = match[0]; end = start + atom.length;
        if (text[end] === '^') {
          let power;
          if (text[end + 1] === '(') { const g = groupAt(text, end + 1, '(', ')'); power = '(' + g.value + ')'; end = g.end; }
          else { const p = /^[+-]?(?:\d+(?:\.\d*)?|[a-zA-Z][a-zA-Z0-9_]*)/.exec(text.slice(end + 1)); if (!p) fail('根式中的指数不完整。'); power = p[0]; end += 1 + power.length; }
          atom += '^' + power;
        }
      }
      const replacement = symbol === '√' ? 'sqrt(' + atom + ')' : 'nthRoot((' + atom + '),' + (symbol === '∛' ? 3 : 4) + ')';
      text = text.slice(0, index) + replacement + text.slice(end);
    }
    return text;
  }
  function percentages(text) {
    let count = 0;
    while (text.includes('%')) {
      if (++count > 30) fail('百分号过多，请简化表达式。');
      const index = text.indexOf('%');
      let end = index, start = end - 1;
      while (start >= 0 && /\s/.test(text[start])) start--;
      end = start + 1;
      if (text[start] === ')') {
        let depth = 1; start--;
        while (start >= 0 && depth) { if (text[start] === ')') depth++; if (text[start] === '(') depth--; start--; }
        if (depth) fail('百分号前的括号不匹配。');
        start++;
        const prefix = /[a-zA-Z][a-zA-Z0-9_]*$/.exec(text.slice(0, start));
        if (prefix && FUNCTIONS.has(prefix[0])) start -= prefix[0].length;
      } else {
        const match = /(?:\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+|[a-zA-Z][a-zA-Z0-9_]*)$/.exec(text.slice(0, end));
        if (!match) fail('百分号应写在数字或括号表达式后；取余请用 mod(a,b)。');
        start = match.index;
      }
      text = text.slice(0, start) + '(' + text.slice(start, end) + '/100)' + text.slice(index + 1);
    }
    return text;
  }
  // "sin^2(x)" means (sin(x))^2. Left alone the power is read as sin(2) and the argument is
  // turned into a separate factor, which silently changes the value. MathLive exports
  // "\sin^2(x)" as "sin^2(x)", so this is reached from the formula field too.
  function functionPowers(text) {
    for (let rounds = 0; rounds < 24; rounds++) {
      const match = /([a-zA-Z][a-zA-Z0-9_]*)\s*\^\s*/g;
      let rewritten = false;
      for (let found; (found = match.exec(text)); ) {
        const name = found[1];
        let index = found.index + found[0].length;
        let exponent;
        if (text[index] === '(') { const group = groupAt(text, index, '(', ')'); exponent = '(' + group.value + ')'; index = group.end; }
        else exponent = text[index++];
        if (!FUNCTIONS.has(name) || !exponent || text[index] !== '(') continue;
        const args = groupAt(text, index, '(', ')');
        text = text.slice(0, found.index) + '(' + name + '(' + args.value + '))^' + exponent + text.slice(args.end);
        rewritten = true;
        break;
      }
      if (!rewritten) break;
    }
    return text;
  }
  function explicitMultiplication(text) {
    const tokenPattern = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z_][a-zA-Z0-9_]*|<=|>=|!=|==|[^\s]/g;
    const tokens = text.match(tokenPattern) || [];
    const aliases = { ln: 'log', arcsin: 'asin', arccos: 'acos', arctan: 'atan', arccot: 'acot', arccsc: 'acsc', arcsec: 'asec', tg: 'tan', ctg: 'cot', nCr: 'combinations', ncr: 'combinations', nPr: 'permutations', npr: 'permutations', inf: 'Infinity', infinity: 'Infinity' };
    for (let i = 0; i < tokens.length; i++) if (own(aliases, tokens[i])) tokens[i] = aliases[tokens[i]];
    const number = value => /^(?:\d|\.\d)/.test(value || '');
    const identifier = value => /^[a-zA-Z_]/.test(value || '');
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const current = tokens[i], previous = tokens[i - 1];
      const left = number(previous) || identifier(previous) || previous === ')' || previous === ']' || previous === '!';
      const right = number(current) || identifier(current) || current === '(' || current === '[';
      const call = identifier(previous) && current === '(' && (FUNCTIONS.has(previous) || COMMANDS.has(previous));
      // Adjacent numeric literals usually indicate an accidental missing comma/operator.
      if (number(previous) && number(current)) fail('两个数字之间缺少运算符或逗号。');
      if (identifier(previous) && current === '[') fail('不支持矩阵索引或对象访问；矩阵相乘请明确使用 *。');
      if (left && right && !call) out.push('*');
      out.push(current);
    }
    return out.join('');
  }
  function normalize(input) {
    if (typeof input !== 'string') fail('请输入数学表达式文本。');
    if (!input.trim()) fail('请输入一个数学表达式。');
    if (input.length > LIMITS.input) fail('输入最多 1200 个字符，请拆成较小的表达式。');
    let text = input.trim();
    text = text.replace(/³√/g, '∛').replace(/⁴√/g, '∜');
    const supers = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', '⁽': '(', '⁾': ')' };
    text = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+/g, run => '^(' + Array.from(run, c => supers[c]).join('') + ')');
    text = text.normalize('NFKC').replace(/[×·⋅∙]/g, '*').replace(/[÷∕]/g, '/')
      .replace(/[−–—﹣]/g, '-').replace(/π/g, ' pi ').replace(/ℯ/g, ' e ').replace(/∞/g, ' Infinity ')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
      .replace(/，|、/g, ',').replace(/；/g, ';').replace(/\r\n?/g, '\n').replace(/\*\*/g, '^');
    if (/\bto\b/.test(text)) text = text.replace(/μ/g, 'u').replace(/Ω/g, 'ohm').replace(/°\s*C/g, 'degC').replace(/°\s*F/g, 'degF');
    const greek = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', θ: 'theta', λ: 'lambda', μ: 'mu', ρ: 'rho', σ: 'sigma', φ: 'phi', ω: 'omega' };
    text = text.replace(/[αβγδεθλμρσφω]/g, c => ' ' + greek[c] + ' ');
    text = latexInput(text);
    // MathLive's ASCII-math export writes the division sign as "-:", whose colon would
    // otherwise be rejected as a syntax character.
    text = text.replace(/-\s*:/g, '/');
    text = functionPowers(text);
    text = asciiGroups(text);
    text = rootInput(text);
    text = percentages(text);
    if (/[^\x20-\x7e\n\t]/.test(text)) fail('含有暂不支持的字符，请使用数字、英文字母和数学运算符。');
    if (/["'`:@?\\]/.test(text)) fail('只支持数学表达式，不支持字符串、对象访问或程序代码。');
    if (/\bto\b/.test(text)) return text.replace(/\s+/g, ' ').trim();
    const lines = splitTop(text, ';\n');
    if (lines.some(line => !line)) fail('分隔符前后缺少表达式。');
    text = lines.map(explicitMultiplication).join(';');
    boundedText(text, LIMITS.input * 2);
    return text;
  }

  function parse(expr) {
    libraries(false);
    let node;
    try { node = math.parse(expr); }
    catch (error) {
      if (/dimensions mismatch/i.test(error.message)) fail('矩阵各行的列数必须一致，请检查行列维数。');
      fail('无法解析表达式：请检查括号、运算符及函数参数。' + (error.message ? '（' + String(error.message).slice(0, 140) + '）' : ''));
    }
    const literals = expr.match(/(?<![a-zA-Z0-9_.])(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g) || [];
    let literalIndex = 0, count = 0, entries = 0;
    function visit(n, depth) {
      if (++count > LIMITS.nodes || depth > LIMITS.depth) fail('表达式结构过于复杂，请减少运算或嵌套。');
      if (n.isConstantNode) {
        if (typeof n.value !== 'number' || !Number.isFinite(n.value)) fail('数字超出有限范围，或使用了不支持的常量。');
        n._engineLiteral = literals[literalIndex++] || String(n.value);
        if (n._engineLiteral.length > 310) fail('数字过长。');
        if (n.value === 0 && /[1-9]/.test(n._engineLiteral.split(/[eE]/)[0])) fail('数值过小，超出支持的浮点范围；请缩放表达式。');
      } else if (n.isSymbolNode) {
        if (FORBIDDEN.test(n.name) || !/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(n.name)) fail('不支持此名称或程序语法：' + n.name);
      } else if (n.isParenthesisNode) visit(n.content, depth + 1);
      else if (n.isOperatorNode) {
        if (!['add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus', 'factorial', 'mod', 'dotMultiply', 'dotDivide', 'dotPow'].includes(n.fn)) fail('不支持此运算符：' + n.op);
        n.args.forEach(a => visit(a, depth + 1));
      } else if (n.isFunctionNode) {
        if (!n.fn.isSymbolNode || !FUNCTIONS.has(n.fn.name)) fail('不支持此函数；请使用常见数学函数，例如 sin、log、sqrt 或 mod。');
        if (n.args.length > LIMITS.data) fail('函数参数过多。');
        n.args.forEach(a => visit(a, depth + 1));
      } else if (n.isArrayNode) {
        if (n.items.length > LIMITS.data) fail('列表或矩阵过大。');
        for (const a of n.items) { if (!a.isArrayNode && ++entries > LIMITS.data) fail('列表或矩阵元素过多。'); visit(a, depth + 1); }
      } else fail('只支持数学运算，不支持赋值、对象访问、范围或自定义函数。');
    }
    visit(node, 0);
    return node;
  }
  function unwrap(n) { while (n.isParenthesisNode) n = n.content; return n; }
  function symbols(node) {
    const found = new Set();
    function visit(n) {
      if (n.isSymbolNode && !CONSTANTS.has(n.name)) found.add(n.name);
      else if (n.isParenthesisNode) visit(n.content);
      else if (n.isFunctionNode && ['sum', 'prod', 'product'].includes(n.fn.name) && n.args.length === 4 && unwrap(n.args[1]).isSymbolNode) {
        const bound = unwrap(n.args[1]).name;
        symbols(n.args[0]).filter(name => name !== bound).forEach(name => found.add(name));
        visit(n.args[2]); visit(n.args[3]);
      } else if (n.isFunctionNode) n.args.forEach(visit);
      else if (n.args) n.args.forEach(visit);
      else if (n.items) n.items.forEach(visit);
    }
    visit(node);
    return Array.from(found).sort();
  }
  function hasVariable(node, variable) { return symbols(node).includes(variable); }
  function operatorExpression(node, args) {
    if (node.fn === 'unaryMinus') return '(-(' + args[0] + '))';
    if (node.fn === 'unaryPlus') return '(+(' + args[0] + '))';
    if (node.fn === 'factorial') return 'factorial(' + args[0] + ')';
    if (node.fn === 'mod') return 'mod(' + args.join(',') + ')';
    // Preserve the AST, including (-2)^2 vs -2^2 and (2^3)^2 vs 2^(3^2).
    // Enclosing the entire expression alone does not protect a unary operand.
    return '(' + args.map(arg => '(' + arg + ')').join(node.op) + ')';
  }
  function plain(node, opts, replacements, graphRadians, keepRealRoots) {
    const n = unwrap(node);
    if (n.isConstantNode) return n._engineLiteral || String(n.value);
    if (n.isSymbolNode) return replacements && own(replacements, n.name) ? '(' + replacements[n.name] + ')' : n.name;
    if (n.isArrayNode) return '[' + n.items.map(a => plain(a, opts, replacements, graphRadians, keepRealRoots)).join(',') + ']';
    if (n.isOperatorNode) {
      const args = n.args.map(a => plain(a, opts, replacements, graphRadians, keepRealRoots));
      return operatorExpression(n, args);
    }
    if (n.isFunctionNode) {
      const name = n.fn.name, args = n.args.map(a => plain(a, opts, replacements, graphRadians, keepRealRoots));
      if (opts && opts.angle === 'deg') {
        if (DIRECT_TRIG.has(name)) args[0] = '(' + args[0] + (graphRadians ? '*180/pi)' : '*pi/180)');
        if (INVERSE_TRIG.has(name) || name === 'atan2') return '(' + (graphRadians ? 'pi/180*' : '180/pi*') + name + '(' + args.join(',') + '))';
      }
      if (name === 'log' && args.length === 2) return '(log(' + args[0] + ')/log(' + args[1] + '))';
      if (name === 'log10') return '(log(' + args[0] + ')/log(10))';
      if (name === 'log2') return '(log(' + args[0] + ')/log(2))';
      if ((name === 'nthRoot' || name === 'cbrt') && !keepRealRoots) {
        const degreeText = name === 'cbrt' ? '3' : args[1];
        if (!symbols(n.args[0]).length && (name === 'cbrt' || !symbols(n.args[1]).length)) {
          try {
            const contextOptions = opts ? optionsFor(opts) : optionsFor();
            const degree = name === 'cbrt' ? 3 : scalarNumber(evaluateNode(n.args[1], Object.create(null), contextOptions));
            const argument = scalarNumber(evaluateNode(n.args[0], Object.create(null), contextOptions));
            if (Number.isInteger(degree) && Math.abs(degree) % 2 === 1 && argument < 0) return '(-((abs(' + args[0] + '))^(1/(' + degreeText + '))))';
          } catch (_) { /* Other constants keep the ordinary principal power. */ }
        }
        return '((' + args[0] + ')^(1/(' + degreeText + ')))';
      }
      return name + '(' + args.join(',') + ')';
    }
    fail('无法转换此数学表达式。');
  }
  function isMatrix(value) { return !!(value && value.isMatrix); }
  function scalarNumber(value) {
    if (typeof value === 'number') return value;
    if (value && value.isFraction) return value.valueOf();
    if (value && value.isBigNumber) return value.toNumber();
    if (value && value.isComplex && value.im === 0) return value.re;
    return NaN;
  }
  function finiteValue(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (value && value.isComplex) return Number.isFinite(value.re) && Number.isFinite(value.im);
    if (value && (value.isFraction || value.isBigNumber)) return Number.isFinite(scalarNumber(value));
    if (isMatrix(value)) return finiteValue(value.toArray());
    if (Array.isArray(value)) return value.every(finiteValue);
    return false;
  }
  function ensureMatrix(value, inversion) {
    if (!isMatrix(value) && !Array.isArray(value)) return;
    const size = isMatrix(value) ? value.size() : math.size(value).valueOf();
    if (size.length === 1) {
      if (size[0] > LIMITS.data) fail('一维列表或向量最多支持 256 个元素。');
      return;
    }
    if (size.length > 2 || size.some(n => n > (inversion ? LIMITS.inverse : LIMITS.matrix))) fail('矩阵最多 10×10；求逆最多 8×8。');
    if (size.length === 2 && size[0] * size[1] > 100) fail('矩阵元素过多。');
  }
  function evaluateNode(node, scope, opts, budget) {
    budget = budget || { left: LIMITS.evaluations };
    const n = unwrap(node);
    if (--budget.left < 0) fail('计算量超过限制，请缩小求和范围或简化表达式。');
    if (n.isConstantNode) {
      const literal = n._engineLiteral || String(n.value);
      const significant = literal.split(/[eE]/)[0].replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length;
      return !Number.isSafeInteger(n.value) && Number.isInteger(n.value) || significant > 15 ? math.bignumber(literal) : n.value;
    }
    if (n.isSymbolNode) {
      if (n.name === 'pi') return Math.PI;
      if (n.name === 'e') return Math.E;
      if (n.name === 'i') return math.complex(0, 1);
      if (n.name === 'Infinity') fail('无穷大只能用作极限点或积分上下限。');
      if (!scope || !own(scope, n.name)) fail('尚未给变量 ' + n.name + ' 赋值；可改用化简或解方程模式。');
      const value = scope[n.name];
      if (!finiteValue(value)) fail('变量 ' + n.name + ' 的取值必须是有限数值。');
      ensureMatrix(value, false);
      return value;
    }
    if (n.isArrayNode) {
      const array = n.items.map(a => a.isArrayNode ? evaluateNode(a, scope, opts, budget).toArray() : evaluateNode(a, scope, opts, budget));
      let result;
      try { result = math.matrix(array); } catch (_) { fail('矩阵各行的列数必须一致。'); }
      ensureMatrix(result, false);
      return result;
    }
    if (n.isFunctionNode && ['sum', 'prod', 'product'].includes(n.fn.name) && n.args.length === 4 && unwrap(n.args[1]).isSymbolNode) {
      const variable = unwrap(n.args[1]).name;
      const start = scalarNumber(evaluateNode(n.args[2], scope, opts, budget));
      const end = scalarNumber(evaluateNode(n.args[3], scope, opts, budget));
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || Math.abs(start) > 1000000 || Math.abs(end) > 1000000 || end - start + 1 > LIMITS.series) fail('有限求和/连乘需整数上下限，且最多 200 项。');
      let result = n.fn.name === 'sum' ? 0 : 1;
      const local = Object.assign(Object.create(null), scope);
      for (let k = start; k <= end; k++) { local[variable] = k; const v = evaluateNode(n.args[0], local, opts, budget); result = n.fn.name === 'sum' ? math.add(result, v) : math.multiply(result, v); if (!finiteValue(result)) fail('求和或连乘结果超出有限数值范围。'); }
      return result;
    }
    const args = n.args.map(a => evaluateNode(a, scope, opts, budget));
    let name = n.isOperatorNode ? n.fn : n.fn.name;
    if (name === 'fix') name = 'trunc';
    if (name === 'product') name = 'prod';
    if (['factorial', 'gamma'].includes(name)) {
      const value = scalarNumber(args[0]);
      if (!Number.isFinite(value) || value > LIMITS.factorial || (name === 'factorial' && (value < 0 || !Number.isInteger(value)))) fail('阶乘只支持 0 到 170 的整数；Gamma 参数不可超过 170。');
    }
    if (['combinations', 'permutations'].includes(name) && args.some(a => !Number.isInteger(scalarNumber(a)) || scalarNumber(a) < 0 || scalarNumber(a) > 170)) fail('组合与排列的参数需为 0 到 170 的整数。');
    if (['gcd', 'lcm'].includes(name) && args.some(a => !Number.isSafeInteger(scalarNumber(a)))) fail('整数运算要求安全整数（绝对值不超过 9007199254740991）。');
    if (name === 'pow' || name === 'dotPow') {
      const exponent = args[1];
      if (isMatrix(exponent) || (exponent && exponent.isComplex ? math.abs(exponent) > 1024 : Math.abs(scalarNumber(exponent)) > 1024)) fail('指数过大，最多支持绝对值 1024 的数值指数。');
      if (isMatrix(args[0]) && (!Number.isInteger(scalarNumber(exponent)) || Math.abs(scalarNumber(exponent)) > 12)) fail('矩阵幂只支持绝对值不超过 12 的整数。');
      if (isMatrix(args[0]) && scalarNumber(exponent) < 0) ensureMatrix(args[0], true);
    }
    if (['identity', 'zeros', 'ones'].includes(name) && (args.length > 2 || args.some(a => !Number.isInteger(scalarNumber(a)) || scalarNumber(a) < 1 || scalarNumber(a) > LIMITS.matrix))) fail('生成矩阵的维数需为 1 到 10 的整数。');
    args.forEach(a => ensureMatrix(a, name === 'inv'));
    if (opts.angle === 'deg') {
      if (DIRECT_TRIG.has(name)) args[0] = math.multiply(args[0], Math.PI / 180);
    }
    let result;
    try {
      if (name === 'cbrt') result = math.nthRoot(args[0], 3);
      else if (name === 'acot') result = math.atan(math.divide(1, args[0]));
      else if (name === 'asec') result = math.acos(math.divide(1, args[0]));
      else if (name === 'acsc') result = math.asin(math.divide(1, args[0]));
      else {
        if (typeof math[name] !== 'function') fail('此数学函数暂不支持：' + name);
        result = math[name].apply(math, args);
      }
      if (opts.angle === 'deg' && (INVERSE_TRIG.has(name) || name === 'atan2')) result = math.multiply(result, 180 / Math.PI);
    } catch (error) {
      if (/限制|最多|暂不支持/.test(error.message)) throw error;
      fail('计算失败：函数参数、矩阵维数或定义域不符合要求。' + (name === 'inv' ? ' 奇异矩阵不能求逆。' : ''));
    }
    if (!finiteValue(result)) fail('结果不是有限数值，请检查除零、函数定义域或过大的数值。');
    ensureMatrix(result, false);
    return result;
  }
  const expressionCache = new Map();
  function evaluateAt(expr, scope, options) {
    const opts = optionsFor(options);
    const normalized = normalize(expr);
    if (splitTop(normalized, ';').length > 1 || /[<>=]/.test(normalized)) fail('绘图或代入计算需要单个表达式，不能是方程或不等式。');
    let node = expressionCache.get(normalized);
    if (!node) {
      node = parse(normalized);
      if (expressionCache.size >= 64) expressionCache.delete(expressionCache.keys().next().value);
      expressionCache.set(normalized, node);
    }
    return evaluateNode(node, scope || Object.create(null), opts);
  }
  function formatNumber(value, precision) {
    if (value === Infinity) return '+∞';
    if (value === -Infinity) return '-∞';
    if (Object.is(value, -0) || value === 0) return '0';
    return Number(value.toPrecision(precision || 10)).toString();
  }
  function formatValue(value, opts) {
    if (typeof value === 'number') return formatNumber(value, opts.precision);
    if (value && value.isComplex) {
      const re = value.re, im = value.im;
      if (!im) return formatNumber(re, opts.precision);
      const imag = (Math.abs(im) === 1 ? '' : formatNumber(Math.abs(im), opts.precision)) + 'i';
      return re ? formatNumber(re, opts.precision) + (im < 0 ? ' - ' : ' + ') + imag : (im < 0 ? '-' : '') + imag;
    }
    if (isMatrix(value)) return formatValue(value.toArray(), opts);
    if (Array.isArray(value)) return '[' + value.map(v => formatValue(v, opts)).join(', ') + ']';
    return math.format(value, { precision: opts.precision });
  }
  function valueLatex(value, opts) {
    if (isMatrix(value)) value = value.toArray();
    if (Array.isArray(value)) {
      const rows = Array.isArray(value[0]) ? value : [value];
      return '\\begin{bmatrix}' + rows.map(row => row.map(v => valueLatex(v, opts)).join(' & ')).join(' \\\\ ') + '\\end{bmatrix}';
    }
    return toLatex(formatValue(value, opts));
  }
  function toLatex(expr) {
    libraries(false);
    if (typeof expr === 'number') expr = String(expr);
    if (typeof expr !== 'string' || !expr.trim()) fail('需要非空表达式才能生成公式。');
    if (expr === 'Infinity' || expr === '+Infinity') return '+\\infty';
    if (expr === '-Infinity') return '-\\infty';
    // Internal CAS output can be longer than the original input, but is still bounded.
    let text = expr.length <= LIMITS.input ? normalize(expr) : boundedText(expr, LIMITS.output);
    const rows = splitTop(text, ';\n');
    function rowLatex(row) {
      const parts = row.split(/(<=|>=|!=|==|=|<|>)/);
      return parts.map((p, i) => i % 2 ? ({ '<=': '\\le ', '>=': '\\ge ', '!=': '\\ne ', '==': '=', '=': '=', '<': '<', '>': '>' })[p] : parse(p).toTex({ parenthesis: 'auto', implicit: 'hide', handler: node => {
        if (!node.isConstantNode) return undefined;
        const literal = node._engineLiteral || String(node.value);
        const scientific = /^([\d.]+)[eE]([+-]?\d+)$/.exec(literal);
        return scientific ? scientific[1] + '\\times10^{' + Number(scientific[2]) + '}' : literal;
      } })).join('');
    }
    const rendered = rows.map(rowLatex);
    return rendered.length > 1 ? '\\begin{aligned}' + rendered.join(' \\\\ ') + '\\end{aligned}' : rendered[0];
  }
  function result(kind, title, input, normalized) {
    return { kind, title, input, normalized, answerLatex: '', answerText: '', approximate: null,
      steps: [], notes: [], graphs: [], related: [] };
  }
  function step(output, title, explanation, latex) { output.steps.push({ title, explanation, latex: latex || '' }); }
  function scientificFractions(expression) {
    return expression.replace(/(?<![a-zA-Z0-9_.])((?:\d+(?:\.\d*)?|\.\d+))[eE]([+-]?\d+)/g, (_, mantissa, exponent) => {
      const decimalPlaces = (mantissa.split('.')[1] || '').length;
      const digits = mantissa.replace('.', '').replace(/^0+(?=\d)/, '');
      const power = Number(exponent) - decimalPlaces;
      if (Math.abs(power) > 350) fail('科学记数法指数超出支持范围。');
      return power >= 0 ? '(' + digits + '*10^' + power + ')' : '(' + digits + '/10^' + (-power) + ')';
    });
  }
  function cas(expression, action) {
    libraries(true);
    expression = expression.replace(/(?<![a-zA-Z0-9_.])\.(\d+)/g, (_, digits) => '0.' + digits)
      .replace(/(?<![a-zA-Z0-9_.])(\d+)\.(?!\d)/g, '$1');
    expression = scientificFractions(expression);
    boundedText(expression, LIMITS.output);
    try {
      const command = action ? action + '(' + expression + ')' : expression;
      const value = nerdamer.__boundedEvaluate ? nerdamer.__boundedEvaluate(command) : nerdamer(command);
      const text = boundedText(value.toString(), LIMITS.output);
      if (!text || /(?:undefined|NaN)/.test(text)) fail('符号计算未得到有效结果。');
      return text;
    } catch (error) { fail('符号计算暂无法处理此表达式：' + String(error.message).slice(0, 180)); }
  }
  function uncomputed(text) { return !text || /\b(?:integrate|defint|diff|limit|sum|product)\s*\(/.test(text) || /(?:undefined|NaN)/.test(text); }
  function numericallyEqual(a, b, tolerance) {
    const comparable = v => v && (v.isBigNumber || v.isFraction) ? scalarNumber(v) : v;
    const av = comparable(a), bv = comparable(b);
    return math.abs(math.subtract(av, bv)) <= (tolerance || 2e-11) * Math.max(Number.MIN_VALUE, math.abs(av), math.abs(bv));
  }
  function safeArithmetic(expression) {
    const answer = cas(expression);
    try {
      const before = parse(expression), after = parse(answer);
      if (!symbols(before).length && !symbols(after).length) {
        const opts = optionsFor();
        if (!numericallyEqual(evaluateNode(before, Object.create(null), opts), evaluateNode(after, Object.create(null), opts))) return expression;
      }
    } catch (_) { /* Symbolic coefficients remain symbolic. */ }
    return answer;
  }
  function cadd(a, b) { if (a === '0') return b; if (b === '0') return a; return safeArithmetic('(' + a + ')+(' + b + ')'); }
  function cneg(a) { return a === '0' ? '0' : safeArithmetic('-(' + a + ')'); }
  function csub(a, b) { return a === b ? '0' : cadd(a, cneg(b)); }
  function cmul(a, b) { if (a === '0' || b === '0') return '0'; if (a === '1') return b; if (b === '1') return a; return safeArithmetic('(' + a + ')*(' + b + ')'); }
  function cdiv(a, b) { if (b === '0') fail('分母不能为零。'); if (a === '0') return '0'; if (b === '1') return a; return safeArithmetic('(' + a + ')/(' + b + ')'); }
  function cpow(a, b) { return safeArithmetic('(' + a + ')^(' + b + ')'); }
  function zero(a) {
    if (a === '0') return true;
    if (cas(a, 'simplify') !== '0') return false;
    try { const node = parse(a); if (!symbols(node).length) { const magnitude = math.abs(evaluateNode(node, Object.create(null), optionsFor())); return magnitude && magnitude.isBigNumber ? magnitude.isZero() : magnitude === 0; } } catch (_) { /* Symbolic identity. */ }
    return true;
  }
  function constantValue(expr, opts, allowInfinity) {
    let n = normalize(String(expr));
    if (allowInfinity && /^(?:\+?Infinity|-Infinity)$/.test(n)) return n[0] === '-' ? -Infinity : Infinity;
    const node = parse(n);
    if (symbols(node).length) fail('此处需要不含变量的常数。');
    const v = scalarNumber(evaluateNode(node, Object.create(null), opts));
    if (!Number.isFinite(v)) fail('此处需要有限实数。');
    return v;
  }
  function addGraph(output, expression, label, opts, fromCAS) {
    try {
      const node = parse(expression);
      const vars = symbols(node);
      if (vars.some(v => v !== opts.variable) || /\bi\b/.test(expression) || node.isArrayNode) return;
      const substitutions = Object.create(null); substitutions[opts.variable] = 'x';
      output.graphs.push({ expression: plain(node, fromCAS ? opts : null, substitutions, !!fromCAS, !fromCAS), label });
    } catch (_) { /* A graph is optional and must never invalidate a successful calculation. */ }
  }
  function domainNotes(node, output, variable) {
    const restrictions = new Set();
    function visit(n) {
      n = unwrap(n);
      if (n.isOperatorNode && n.fn === 'divide') restrictions.add(toLatex(plain(n.args[1])) + '\\ne0');
      if (n.isFunctionNode) {
        const a = n.args[0] && plain(n.args[0]);
        if (['log', 'log10', 'log2'].includes(n.fn.name)) restrictions.add(toLatex(a) + '>0');
        if (n.fn.name === 'sqrt') restrictions.add(toLatex(a) + '\\ge0');
        if (['asin', 'acos'].includes(n.fn.name)) restrictions.add('-1\\le ' + toLatex(a) + '\\le1');
        if (['tan', 'sec'].includes(n.fn.name)) restrictions.add('\\cos(' + toLatex(a) + ')\\ne0');
        if (n.fn.name === 'abs' && hasVariable(n, variable)) output.notes.push('绝对值函数在内部表达式为零的位置可能不可导，需分别检查。');
      }
      if (n.args) n.args.forEach(visit);
      if (n.items) n.items.forEach(visit);
    }
    visit(node);
    if (restrictions.size) output.notes.push('实数定义域需满足：' + Array.from(restrictions).join('，') + '。');
  }

  let polynomialWork = 0;
  function chargePolynomial(amount) { if ((polynomialWork += amount) > 3200) fail('多项式计算量超过限制，请先化简或降低次数。'); }
  function ptrim(p) { while (p.length > 1 && p[p.length - 1] === '0') p.pop(); return p; }
  function padd(a, b) { chargePolynomial(Math.max(a.length, b.length)); return ptrim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => cadd(a[i] || '0', b[i] || '0'))); }
  function pneg(a) { return a.map(cneg); }
  function psub(a, b) { return padd(a, pneg(b)); }
  function pmul(a, b) {
    if (a.length + b.length - 2 > LIMITS.degree) fail('多项式最高支持 12 次；请降低次数或拆分表达式。');
    chargePolynomial(a.length * b.length);
    const p = Array(a.length + b.length - 1).fill('0');
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) p[i + j] = cadd(p[i + j], cmul(a[i], b[j]));
    return ptrim(p);
  }
  function ppow(a, exponent) { let p = ['1']; for (let k = 0; k < exponent; k++) p = pmul(p, a); return p; }
  function polynomialText(p, variable) {
    return p.map((c, i) => c === '0' ? '' : '(' + c + ')' + (i ? '*' + variable + (i > 1 ? '^' + i : '') : '')).filter(Boolean).join('+') || '0';
  }
  function integerExponent(node, opts) {
    if (symbols(node).length) fail('多项式的指数需为常整数。');
    const exponent = scalarNumber(evaluateNode(node, Object.create(null), opts));
    if (!Number.isInteger(exponent) || Math.abs(exponent) > LIMITS.degree) fail('方程和不等式中的多项式指数需为绝对值不超过 12 的整数。');
    return exponent;
  }
  function guardConstantComputations(node, opts) {
    const n = unwrap(node);
    if (!symbols(n).length) { evaluateNode(n, Object.create(null), opts); return; }
    if (n.args) n.args.forEach(child => guardConstantComputations(child, opts));
  }
  function rational(node, variable, opts) {
    const n = unwrap(node);
    if (!hasVariable(n, variable)) {
      if (n.isArrayNode) fail('矩阵不能作为一元多项式。');
      guardConstantComputations(n, opts);
      return { num: [safeArithmetic(plain(n, opts))], den: ['1'], excluded: [] };
    }
    if (n.isSymbolNode && n.name === variable) return { num: ['0', '1'], den: ['1'], excluded: [] };
    if (!n.isOperatorNode) fail('此功能支持多项式和有理式；三角、指数等超越方程需用数值方法，暂不自动猜测根。');
    if (n.fn === 'unaryPlus' || n.fn === 'unaryMinus') {
      const a = rational(n.args[0], variable, opts);
      if (n.fn === 'unaryMinus') a.num = pneg(a.num);
      return a;
    }
    if (n.fn === 'pow') {
      const a = rational(n.args[0], variable, opts), exponent = integerExponent(n.args[1], opts);
      if (exponent < 0) return { num: ppow(a.den, -exponent), den: ppow(a.num, -exponent), excluded: a.excluded.concat([a.num]) };
      // Even a zero power retains the original base's undefined points.
      return { num: ppow(a.num, exponent), den: ppow(a.den, exponent), excluded: a.excluded };
    }
    if (!['add', 'subtract', 'multiply', 'divide'].includes(n.fn)) fail('此运算不能转换为有理多项式。');
    const a = rational(n.args[0], variable, opts), b = rational(n.args[1], variable, opts);
    const excluded = a.excluded.concat(b.excluded);
    if (n.fn === 'add' || n.fn === 'subtract') {
      const right = pmul(b.num, a.den);
      return { num: n.fn === 'add' ? padd(pmul(a.num, b.den), right) : psub(pmul(a.num, b.den), right), den: pmul(a.den, b.den), excluded };
    }
    if (n.fn === 'multiply') return { num: pmul(a.num, b.num), den: pmul(a.den, b.den), excluded };
    if (b.num.length === 1 && zero(b.num[0])) fail('分母恒为零，表达式无定义。');
    return { num: pmul(a.num, b.den), den: pmul(a.den, b.num), excluded: excluded.concat([b.num]) };
  }
  function numericCoefficients(p, opts) {
    return p.map(c => {
      const n = parse(c);
      if (symbols(n).length) fail('符号参数尚未确定，无法给出数轴区间或高次方程的数值根。');
      const value = scalarNumber(evaluateNode(n, Object.create(null), opts));
      if (!Number.isFinite(value) || Math.abs(value) > 1e100) fail('多项式系数须为有限实数，且绝对值不超过 10^100。');
      return value;
    });
  }
  function peval(p, x) { let y = p[p.length - 1]; for (let i = p.length - 2; i >= 0; i--) y = y * x + p[i]; return y; }
  function pscaleAt(p, x) { let y = Math.abs(p[p.length - 1]); for (let i = p.length - 2; i >= 0; i--) y = y * Math.abs(x) + Math.abs(p[i]); return Math.max(y, Number.MIN_VALUE); }
  function closeRoot(a, b) { return a === b || Math.abs(a - b) <= 128 * Number.EPSILON * Math.max(Number.MIN_VALUE, Math.abs(a), Math.abs(b)); }
  function realRoots(p) {
    if (p.length <= 1) return [];
    if (p.length === 2) return [-p[0] / p[1]];
    const lead = p[p.length - 1], scaled = p.map(c => c / lead);
    const bound = 1 + Math.max(...scaled.slice(0, -1).map(Math.abs));
    if (!Number.isFinite(bound) || bound > 1e12) fail('根的范围或系数尺度过大，无法可靠隔离实根；请缩放变量。');
    const critical = realRoots(scaled.slice(1).map((c, i) => c * (i + 1))).filter(x => x > -bound && x < bound);
    const roots = [];
    function add(x) { if (!roots.some(v => closeRoot(v, x))) roots.push(Math.abs(x) < 1e-14 ? 0 : x); }
    for (const x of critical) if (Math.abs(peval(scaled, x)) <= 2e-11 * pscaleAt(scaled, x)) add(x);
    const points = [-bound].concat(critical, [bound]);
    for (let i = 0; i < points.length - 1; i++) {
      let a = points[i], b = points[i + 1], fa = peval(scaled, a), fb = peval(scaled, b);
      if (fa === 0) add(a); if (fb === 0) add(b);
      if (!Number.isFinite(fa) || !Number.isFinite(fb) || Math.sign(fa) === Math.sign(fb) || fa === 0 || fb === 0) continue;
      for (let k = 0; k < 100; k++) {
        const middle = a + (b - a) / 2, fm = peval(scaled, middle);
        if (fm === 0) { a = b = middle; break; }
        if (Math.sign(fm) === Math.sign(fa)) { a = middle; fa = fm; } else b = middle;
        if (b - a <= 4e-14 * Math.max(1, Math.abs(a), Math.abs(b))) break;
      }
      add(a + (b - a) / 2);
    }
    return roots.sort((a, b) => a - b);
  }
  function complexRoots(coefficients) {
    const degree = coefficients.length - 1;
    const monic = coefficients.map(c => c / coefficients[degree]);
    const variableScale = Math.max(...monic.slice(0, -1).map((c, i) => Math.pow(Math.abs(c), 1 / (degree - i))));
    if (!Number.isFinite(variableScale) || variableScale > 1e12 || variableScale < 1e-100) fail('高次根的数值尺度过大或过小，暂不能可靠求解；请缩放变量。');
    const p = monic.map((c, i) => c === 0 ? 0 : c / Math.pow(variableScale, degree - i));
    if (p.some(c => !Number.isFinite(c))) fail('高次多项式缩放失败，系数超出可靠浮点范围。');
    const radius = 2;
    const C = (r, i) => ({ r, i });
    const add = (a, b) => C(a.r + b.r, a.i + b.i);
    const sub = (a, b) => C(a.r - b.r, a.i - b.i);
    const mul = (a, b) => C(a.r * b.r - a.i * b.i, a.r * b.i + a.i * b.r);
    const div = (a, b) => { const d = b.r * b.r + b.i * b.i; return C((a.r * b.r + a.i * b.i) / d, (a.i * b.r - a.r * b.i) / d); };
    const magnitude = z => Math.hypot(z.r, z.i);
    function values(z) {
      let f = C(p[degree], 0), d = C(0, 0);
      for (let i = degree - 1; i >= 0; i--) { d = add(mul(d, z), f); f = add(mul(f, z), C(p[i], 0)); }
      return { f, d };
    }
    let roots = Array.from({ length: degree }, (_, k) => { const theta = 2 * Math.PI * (k + 0.37) / degree; return C(radius * Math.cos(theta), radius * Math.sin(theta)); });
    for (let iteration = 0; iteration < 300; iteration++) {
      let maxChange = 0;
      const next = roots.map((z, k) => {
        const v = values(z);
        if (magnitude(v.f) === 0) return z;
        const newton = div(v.f, v.d);
        let repulsion = C(0, 0);
        for (let j = 0; j < degree; j++) if (j !== k) repulsion = add(repulsion, div(C(1, 0), sub(z, roots[j])));
        const change = div(newton, sub(C(1, 0), mul(newton, repulsion)));
        maxChange = Math.max(maxChange, magnitude(change) / Math.max(1, magnitude(z)));
        return sub(z, change);
      });
      if (next.some(z => !Number.isFinite(z.r) || !Number.isFinite(z.i))) fail('高次方程数值迭代不稳定，请先因式分解或缩放变量。');
      roots = next;
      if (maxChange < 1e-13) break;
    }
    roots.forEach(z => {
      const residual = magnitude(values(z).f);
      const scale = p.reduce((s, c, i) => s + Math.abs(c) * Math.pow(magnitude(z), i), 0);
      if (residual > 1e-8 * Math.max(scale, Number.MIN_VALUE)) fail('高次方程的候选根未通过代回检验，暂不输出不可靠结果。');
      if (Math.abs(z.i) < 1e-12 * Math.max(Number.MIN_VALUE, Math.abs(z.r))) z.i = 0;
      if (Math.abs(z.r) < 1e-13 && p[0] === 0) z.r = 0;
    });
    // Vieta's identities catch duplicated converged roots (small residual alone does not).
    let reconstructed = [C(1, 0)];
    for (const z of roots) {
      const next = Array.from({ length: reconstructed.length + 1 }, () => C(0, 0));
      reconstructed.forEach((a, i) => { next[i] = add(next[i], mul(a, C(-z.r, -z.i))); next[i + 1] = add(next[i + 1], a); });
      reconstructed = next;
    }
    if (reconstructed.some((z, i) => Math.hypot(z.r - p[i], z.i) > (p[i] === 0 ? 1e-9 : 1e-7 * Math.abs(p[i])))) fail('高次根未通过系数重建检验，可能含难以分离的重根；请先因式分解。');
    return roots.map(z => C(z.r * variableScale, z.i * variableScale)).sort((a, b) => a.i === 0 && b.i !== 0 ? -1 : a.i !== 0 && b.i === 0 ? 1 : a.r - b.r || a.i - b.i);
  }
  function rootRecord(exact, variable, opts, multiplicity) {
    let value;
    try { value = evaluateNode(parse(exact), Object.create(null), Object.assign({}, opts, { angle: 'rad' })); } catch (_) { value = null; }
    return { variable, exact, approximate: value === null ? null : formatValue(value, opts),
      real: value === null ? null : Number.isFinite(scalarNumber(value)), multiplicity: multiplicity || 1,
      _value: value === null ? NaN : scalarNumber(value) };
  }
  function safeFactorCoefficients(p) {
    return p.every(coefficient => {
      const parts = /^-?(\d+)(?:\/(\d+))?$/.exec(coefficient);
      return !!parts && Number(parts[1]) <= 1e9 && (!parts[2] || Number(parts[2]) <= 1e6);
    });
  }
  function polynomialRoots(p, variable, opts, allowFactor) {
    p = ptrim(p.slice());
    const degree = p.length - 1;
    if (degree < 1) return [];
    if (p.slice(0, -1).every(c => c === '0')) return [rootRecord('0', variable, opts, degree)];
    if (degree === 1) return [rootRecord(cdiv(cneg(p[0]), p[1]), variable, opts)];
    if (degree === 2) {
      const [c, b, a] = p, discriminant = csub(cpow(b, '2'), cmul('4', cmul(a, c)));
      if (zero(discriminant)) return [rootRecord(cdiv(cneg(b), cmul('2', a)), variable, opts, 2)];
      // Keep the radical until each simplified candidate passes a relative residual
      // test. Nerdamer 1.1.13 rounds sqrt(1/10^30) to zero; this must remain complex
      // for a negative discriminant, however small its imaginary part is.
      const denominator = cmul('2', a), square = 'sqrt(' + discriminant + ')';
      const roots = [-1, 1].map(sign => {
        const raw = '(-(' + b + ')' + (sign < 0 ? '-' : '+') + square + ')/(' + denominator + ')';
        let exact = raw;
        try {
          const candidate = cas(raw);
          const params = Array.from(new Set(p.flatMap(c => symbols(parse(c)))));
          if (params.length) { if (probeEquivalence(raw, candidate) !== false) exact = candidate; }
          else {
            const value = evaluateNode(parse(candidate), Object.create(null), Object.assign({}, opts, { angle: 'rad' }));
            const scope = Object.create(null); scope[variable] = value;
            const residual = math.abs(evaluateNode(parse(polynomialText(p, variable)), scope, Object.assign({}, opts, { angle: 'rad' })));
            const magnitude = math.abs(value);
            const scale = p.reduce((sum, coefficient, i) => sum + math.abs(evaluateNode(parse(coefficient), Object.create(null), Object.assign({}, opts, { angle: 'rad' }))) * Math.pow(magnitude, i), 0);
            if (residual <= 2e-11 * Math.max(Number.MIN_VALUE, scale)) {
              const symbolicResidual = cas(substitution(polynomialText(p, variable), variable, candidate), 'expand');
              if (zero(symbolicResidual)) exact = candidate;
            }
          }
        } catch (_) { /* A valid unsimplified quadratic radical is an exact answer. */ }
        return rootRecord(exact, variable, opts);
      });
      return roots.sort((r, s) => Number.isFinite(r._value) && Number.isFinite(s._value) ? r._value - s._value : 0);
    }
    const coefficients = numericCoefficients(p, Object.assign({}, opts, { angle: 'rad' }));
    const text = polynomialText(p, variable);
    if (allowFactor !== false && text.length < 500 && safeFactorCoefficients(p)) {
      const factored = cas(text, 'factor');
      const factors = [];
      function collect(node, multiplicity) {
        const n = unwrap(node);
        if (!hasVariable(n, variable)) return;
        if (n.isOperatorNode && n.fn === 'multiply') { n.args.forEach(a => collect(a, multiplicity)); return; }
        if (n.isOperatorNode && n.fn === 'pow') { collect(n.args[0], multiplicity * integerExponent(n.args[1], opts)); return; }
        factors.push({ node: n, multiplicity });
      }
      collect(parse(factored), 1);
      if ((factors.length > 1 || factors.some(f => f.multiplicity > 1)) && zero(csub(cas(factored, 'expand'), cas(text, 'expand')))) {
        const roots = [];
        factors.forEach(f => {
          const r = rational(f.node, variable, opts);
          polynomialRoots(r.num, variable, opts, false).forEach(v => { v.multiplicity *= f.multiplicity; roots.push(v); });
        });
        return mergeRootRecords(roots);
      }
    }
    return complexRoots(coefficients).map(z => {
      const expression = formatNumber(z.r, 15) + (z.i ? (z.i >= 0 ? '+' : '-') + formatNumber(Math.abs(z.i), 15) + '*i' : '');
      const record = rootRecord(expression, variable, opts);
      record.numerical = true;
      return record;
    });
  }
  function mergeRootRecords(roots) {
    const merged = [];
    roots.forEach(r => {
      const old = merged.find(s => r.exact === s.exact || Number.isFinite(r._value) && Number.isFinite(s._value) && closeRoot(r._value, s._value));
      if (old) old.multiplicity += r.multiplicity; else merged.push(r);
    });
    return merged.sort((a, b) => Number.isFinite(a._value) && Number.isFinite(b._value) ? a._value - b._value : a.real === true ? -1 : b.real === true ? 1 : 0);
  }
  function publicRoots(roots) { return roots.map(r => { const copy = Object.assign({}, r); delete copy._value; return copy; }); }
  function comparisons(text) {
    const parts = text.split(/(<=|>=|!=|==|=|<|>)/);
    if (parts.some(p => !p)) fail('等号或不等号两侧都需要表达式。');
    return { sides: parts.filter((_, i) => i % 2 === 0), operators: parts.filter((_, i) => i % 2 === 1) };
  }
  function domainRoots(r, variable, opts) {
    const roots = [];
    r.excluded.forEach(p => {
      if (p.length === 1 && zero(p[0])) fail('原表达式分母恒为零，无定义。');
      polynomialRoots(p, variable, opts).forEach(v => { if (!roots.some(s => s.exact === v.exact)) roots.push(v); });
    });
    return roots;
  }
  function equationGraphs(output, nodes, opts) {
    output.graphs = [];
    nodes.forEach((node, i) => addGraph(output, plain(node, null, null, false, true), i === 0 ? '方程左边' : '方程右边', opts));
  }
  function emptyRealEquation(input, normalized, opts, nodes, title, explanation) {
    const output = result('equation', title, input, normalized);
    output.answerText = '无实数解'; output.answerLatex = '\\varnothing'; output.solutions = [];
    step(output, '检查实数值域', explanation, toLatex(normalized));
    output.notes.push('本次按实数未知量及实数函数定义域求解。');
    equationGraphs(output, nodes, opts);
    return output;
  }
  function collectRealBranches(input, normalized, opts, nodes, targets, inner, title, explanation, latex) {
    const output = result('equation', title, input, normalized);
    step(output, '按实数定义等价变换', explanation, latex);
    let roots = [], identity = false, bounded = false;
    const childOptions = Object.assign({}, opts, { angle: 'rad', variableExplicit: true, _rootAngle: opts._rootAngle || opts.angle });
    for (let i = 0; i < targets.length; i++) {
      const branch = equation(input, inner + '=' + targets[i], childOptions);
      identity = identity || /所有/.test(branch.answerText);
      bounded = bounded || branch.title === '区间数值求根' || branch.notes.some(n => /仅搜索区间/.test(n));
      branch.steps.forEach(s => step(output, targets.length > 1 ? '分支 ' + (i + 1) + '：' + s.title : s.title, s.explanation, s.latex));
      output.notes.push(...branch.notes.filter(n => !/复根只在/.test(n)));
      for (const s of branch.solutions || []) {
        if (s.real === false) continue;
        const r = rootRecord(s.exact, opts.variable, opts, s.multiplicity);
        if (s.numerical) r.numerical = true;
        if (s.tangent) r.tangent = true;
        roots.push(r);
      }
      if (branch.parameters && branch.parameters.length) output.parameters = Array.from(new Set((output.parameters || []).concat(branch.parameters)));
    }
    roots = mergeRootRecords(roots);
    // Inversion conditions have already excluded extraneous real branches.
    // Exact roots at a sqrt/log boundary can have an unstable floating substitute
    // (for example sqrt((sqrt(2))^2-2)). Keep their exact inverse proof; numerical
    // candidates must actually satisfy the original functions' residual and domain.
    let unstableBoundary = false;
    roots = roots.filter(r => {
      if (r.real === null) return true;
      try {
        const scope = Object.create(null); scope[opts.variable] = evaluateNode(parse(r.exact), scope, Object.assign({}, opts, { angle: 'rad' }));
        const left = scalarNumber(evaluateNode(nodes[0], scope, opts)), right = scalarNumber(evaluateNode(nodes[1], scope, opts));
        const matches = Number.isFinite(left) && Number.isFinite(right) && (r.numerical ? Math.abs(left - right) <= 1e-9 : numericallyEqual(left, right, 1e-8));
        if (matches) return true;
      } catch (_) { /* Exact algebraic inverse proofs remain valid at boundaries. */ }
      if (!r.numerical) { unstableBoundary = true; return true; }
      return false;
    });
    if (unstableBoundary) output.notes.push('部分精确根位于定义域边界，浮点代回不稳定；依据已检查的可逆变换条件与精确根式保留，不能用浮点舍入删去这些根。');
    output.solutions = publicRoots(roots);
    if (identity) {
      output.answerText = '所有满足原式实数定义域的 ' + opts.variable + ' 都是解';
      output.answerLatex = opts.variable + '\\in\\mathbb{R}\\quad\\text{（满足原式定义域）}';
      output.solutions = [];
    } else if (roots.length) {
      output.answerText = roots.map(r => opts.variable + (r.numerical ? ' ≈ ' : ' = ') + r.exact).join('；');
      output.answerLatex = roots.map(r => opts.variable + (r.numerical ? '\\approx' : '=') + toLatex(r.numerical ? r.approximate : r.exact)).join(',\\quad ');
      output.approximate = roots.every(r => r.approximate !== null) ? roots.map(r => opts.variable + ' ≈ ' + r.approximate).join('；') : null;
      if (!roots.some(r => r.numerical)) output.exact = roots.map(r => opts.variable + '=' + r.exact).join(';');
      step(output, '检查原方程与实数分支', '保留满足变换条件的实数根；可稳定数值代入时检查原函数，定义域边界处的精确根以可逆变换验证。符号参数需满足已列条件。', output.answerLatex);
    } else {
      output.answerText = bounded ? '在所设区间的有界搜索中未找到通过验证的实根' : '无实数解';
      output.answerLatex = bounded ? '\\text{区间搜索未找到已验证实根}' : '\\varnothing';
    }
    output.notes.push('此变换按实数未知量求解；原函数的值域、定义域及分母禁用点仍须满足。');
    equationGraphs(output, nodes, opts);
    return output;
  }
  function commonRealEquation(input, normalized, opts, nodes) {
    for (let index = 0; index < 2; index++) {
      const n = unwrap(nodes[index]), other = nodes[1 - index];
      if (hasVariable(other, opts.variable) || symbols(other).length || !hasVariable(n, opts.variable)) continue;
      const functionName = n.isFunctionNode ? n.fn.name : '';
      const power = n.isOperatorNode && n.fn === 'pow' && !hasVariable(n.args[0], opts.variable) && hasVariable(n.args[1], opts.variable) && !symbols(n.args[0]).length;
      if (!['abs', 'sqrt', 'nthRoot', 'cbrt', 'exp', 'log', 'log2', 'log10'].includes(functionName) && !power) continue;
      if (functionName === 'nthRoot' && symbols(n.args[1]).length) continue;
      const constant = constantValue(plain(other, null, null, false, true), opts);
      const target = numericCASExpression(other, opts);
      let innerNode = power ? n.args[1] : n.args[0], targets, title, explanation;
      if (functionName === 'abs') {
        if (constant < 0) return emptyRealEquation(input, normalized, opts, nodes, '绝对值方程', '实数绝对值非负，不能等于负数。');
        targets = constant === 0 ? [target] : [target, cneg(target)];
        title = '绝对值方程'; explanation = '实数绝对值等于非负常数时，内部表达式分别等于这个常数及其相反数；为零时只有一个分支。';
      } else if (['sqrt', 'nthRoot', 'cbrt'].includes(functionName)) {
        const degree = functionName === 'sqrt' ? 2 : functionName === 'cbrt' ? 3 : constantValue(plain(n.args[1]), opts);
        if (!Number.isInteger(degree) || degree === 0 || Math.abs(degree) > 64) return null;
        if (Math.abs(degree) % 2 === 0 && constant < 0 || degree < 0 && constant === 0) return emptyRealEquation(input, normalized, opts, nodes, '根式方程', '偶次实根不能为负；负次数的根式不能为零。');
        targets = [cpow(target, String(degree))];
        title = '根式方程'; explanation = '先检查实根的值域，再把等式两边取相应整数次幂；候选根还需代回原根式检查。';
      } else if (functionName === 'exp' || power) {
        if (power && symbols(n.args[0]).length) continue;
        const base = power ? constantValue(plain(n.args[0]), opts) : Math.E;
        if (!(base > 0) || base === 1) continue;
        if (!(constant > 0)) return emptyRealEquation(input, normalized, opts, nodes, '指数方程', '正底数的实指数函数恒为正，不能等于零或负数。');
        const denominator = power ? cas('log(' + plain(n.args[0]) + ')') : '1';
        targets = [cdiv('log(' + target + ')', denominator)];
        title = '指数方程'; explanation = '正底数且底数不为 1，右侧必须为正；取对数把指数变成新的方程。';
      } else {
        const baseNode = functionName === 'log' && n.args[1];
        if (baseNode && symbols(baseNode).length) continue;
        const base = functionName === 'log2' ? 2 : functionName === 'log10' ? 10 : baseNode ? constantValue(plain(baseNode), opts) : Math.E;
        if (!(base > 0) || base === 1) fail('实对数的底数必须大于零且不等于 1。');
        const baseText = functionName === 'log2' ? '2' : functionName === 'log10' ? '10' : baseNode ? plain(baseNode) : 'e';
        targets = [cpow(baseText, target)];
        title = '对数方程'; explanation = '实对数要求真数大于零；用相应底数取指数，所得正真数同时满足定义域。';
      }
      const inner = plain(innerNode, opts, null, false, true);
      return collectRealBranches(input, normalized, opts, nodes, targets, inner, title, explanation,
        targets.map(t => toLatex(inner) + '=' + toLatex(t)).join('\\quad\\text{或}\\quad'));
    }
    return null;
  }
  function nonPolynomialPower(nodes, opts) {
    let found = false;
    function visit(node) {
      const n = unwrap(node);
      if (n.isOperatorNode && n.fn === 'pow' && hasVariable(n, opts.variable)) {
        try { if (symbols(n.args[1]).length || !Number.isInteger(scalarNumber(evaluateNode(n.args[1], Object.create(null), opts)))) found = true; } catch (_) { found = true; }
      }
      if (n.args) n.args.forEach(visit);
    }
    nodes.forEach(visit); return found;
  }
  function numericEquation(input, normalized, opts, nodes) {
    const variables = Array.from(new Set(nodes.flatMap(symbols)));
    if (variables.some(v => v !== opts.variable)) fail('区间数值求根需要只有一个未知量；请先给其他参数赋值。');
    const boundsOptions = Object.assign({}, opts, { angle: opts._rootAngle || opts.angle });
    if (!opts.rootLower || !opts.rootUpper) fail('请填写根搜索区间的 rootLower 和 rootUpper。');
    const lower = constantValue(opts.rootLower, boundsOptions), upper = constantValue(opts.rootUpper, boundsOptions);
    if (!(lower < upper) || Math.max(Math.abs(lower), Math.abs(upper), upper - lower) > 1e6) fail('根搜索下限必须小于上限，端点绝对值及区间长度最多 10^6。');
    const output = result('equation', '区间数值求根', input, normalized), scope = Object.create(null);
    const budget = { left: LIMITS.rootOperations }, tolerance = 1e-9, tangentTolerance = 1e-13;
    let evaluations = 0, validSamples = 0, invalidSamples = 0, stopped = false, limitedRoots = false, flatZeros = false;
    let bracketCount = 0, minimumCount = 0, skippedDomains = 0;
    const criticalDenominators = [], trigPoles = [];
    function domains(node) {
      const n = unwrap(node);
      if (n.isOperatorNode && n.fn === 'divide' && hasVariable(n.args[1], opts.variable)) criticalDenominators.push(n.args[1]);
      if (n.isOperatorNode && n.fn === 'pow' && hasVariable(n.args[0], opts.variable) && !symbols(n.args[1]).length) {
        try { if (constantValue(plain(n.args[1]), opts) < 0) criticalDenominators.push(n.args[0]); } catch (_) { /* Original evaluation checks it too. */ }
      }
      if (n.isFunctionNode && ['tan', 'sec', 'cot', 'csc'].includes(n.fn.name) && hasVariable(n, opts.variable)) trigPoles.push(n);
      if (n.args) n.args.forEach(domains);
    }
    nodes.forEach(domains);
    function sample(x) {
      if (stopped || evaluations >= LIMITS.rootEvaluations || budget.left <= 0) { stopped = true; return null; }
      evaluations++;
      scope[opts.variable] = x;
      try {
        const left = scalarNumber(evaluateNode(nodes[0], scope, opts, budget)), right = scalarNumber(evaluateNode(nodes[1], scope, opts, budget));
        const f = left - right;
        if (![left, right, f].every(Number.isFinite)) { invalidSamples++; return null; }
        validSamples++; return { x, left, right, f };
      } catch (_) { invalidSamples++; if (budget.left <= 0) stopped = true; return null; }
    }
    function denominatorValue(node, x) { scope[opts.variable] = x; return scalarNumber(evaluateNode(node, scope, opts, budget)); }
    function awayFromPoles(x) {
      const delta = 1e-5 * Math.max(1, Math.abs(x));
      try {
        for (const denominator of criticalDenominators) {
          const center = denominatorValue(denominator, x), left = denominatorValue(denominator, x - delta), right = denominatorValue(denominator, x + delta);
          const scale = Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
          if (!Number.isFinite(center) || Math.abs(center) <= 1e-6 * scale) return false;
        }
        scope[opts.variable] = x;
        for (const node of trigPoles) {
          let argument = scalarNumber(evaluateNode(node.args[0], scope, opts, budget));
          if (!Number.isFinite(argument)) return false;
          if (opts.angle === 'deg') argument *= Math.PI / 180;
          const denominator = ['tan', 'sec'].includes(node.fn.name) ? Math.cos(argument) : Math.sin(argument);
          if (Math.abs(denominator) <= 1e-9 * Math.max(1, Math.abs(argument))) return false;
        }
        return true;
      } catch (_) { return false; }
    }
    const roots = [];
    function accept(candidate, source, strict) {
      if (!candidate || candidate.x < lower || candidate.x > upper || Math.abs(candidate.f) > (strict ? tangentTolerance : tolerance)) return;
      // Use the ORIGINAL difference's local scale as well as an absolute cap.
      // Otherwise 1e-100*(2+sin(x)) looks like a root everywhere. For a
      // non-sign-changing minimum, require a residual at the scale of squared
      // roundoff; a tiny positive minimum is not evidence of an actual root.
      const offset = (upper - lower) / LIMITS.rootSegments;
      const neighborLeft = candidate.x > lower ? sample(Math.max(lower, candidate.x - offset)) : null;
      const neighborRight = candidate.x < upper ? sample(Math.min(upper, candidate.x + offset)) : null;
      const localScale = Math.max(neighborLeft ? Math.abs(neighborLeft.f) : 0, neighborRight ? Math.abs(neighborRight.f) : 0, Number.MIN_VALUE);
      const relativeTolerance = source === '切触候选' ? 1e-24 : strict ? tangentTolerance : tolerance;
      if (Math.abs(candidate.f) / localScale > relativeTolerance) return;
      if (!awayFromPoles(candidate.x)) { skippedDomains++; return; }
      if (roots.some(r => Math.abs(r.x - candidate.x) <= 1e-9 * Math.max(1, Math.abs(r.x), Math.abs(candidate.x)))) return;
      if (roots.length >= LIMITS.rootSolutions) { limitedRoots = true; return; }
      roots.push({ x: candidate.x, residual: Math.abs(candidate.f), source });
    }
    const grid = [];
    for (let i = 0; i <= LIMITS.rootSegments && !stopped; i++) grid.push(sample(lower + (upper - lower) * i / LIMITS.rootSegments));
    for (let i = 0; i < grid.length && !stopped && !limitedRoots; i++) {
      const center = grid[i]; if (!center) continue;
      const left = grid[i - 1], right = grid[i + 1];
      const separated = [left, right].some(p => p && Math.abs(p.f) > tangentTolerance);
      if (center.f === 0 && !separated) flatZeros = true;
      if ((center.f === 0 || (i === 0 || i === grid.length - 1) && Math.abs(center.f) <= tangentTolerance) && separated) accept(center, '网格/端点', true);
      if (!right || center.f === 0 || right.f === 0 || Math.sign(center.f) === Math.sign(right.f)) continue;
      bracketCount++;
      let a = center, b = right, candidate = null;
      for (let k = 0; k < 64 && !stopped; k++) {
        const middle = sample(a.x + (b.x - a.x) / 2);
        if (!middle) { candidate = null; break; }
        candidate = middle;
        if (middle.f === 0) break;
        if (Math.sign(middle.f) === Math.sign(a.f)) a = middle; else b = middle;
        if (b.x - a.x <= 2e-13 * Math.max(1, Math.abs(middle.x))) break;
      }
      accept(candidate, '变号二分', false);
    }
    for (let i = 1; i < grid.length - 1 && !stopped && !limitedRoots; i++) {
      const a0 = grid[i - 1], c0 = grid[i], b0 = grid[i + 1];
      if (!a0 || !c0 || !b0 || c0.f === 0 || !(Math.abs(c0.f) < Math.abs(a0.f) && Math.abs(c0.f) < Math.abs(b0.f))) continue;
      minimumCount++;
      let a = a0.x, b = b0.x;
      const ratio = (Math.sqrt(5) - 1) / 2;
      let p = a + (1 - ratio) * (b - a), q = a + ratio * (b - a), fp = sample(p), fq = sample(q);
      for (let k = 0; k < 64 && !stopped; k++) {
        const vp = fp ? Math.abs(fp.f) : Infinity, vq = fq ? Math.abs(fq.f) : Infinity;
        if (vp < vq) { b = q; q = p; fq = fp; p = a + (1 - ratio) * (b - a); fp = sample(p); }
        else { a = p; p = q; fp = fq; q = a + ratio * (b - a); fq = sample(q); }
        if (b - a <= 2e-13 * Math.max(1, Math.abs(a), Math.abs(b))) break;
      }
      const candidate = fp && fq ? Math.abs(fp.f) < Math.abs(fq.f) ? fp : fq : fp || fq;
      accept(candidate, '切触候选', true);
    }
    if (!validSamples) fail('根搜索区间内没有可计算的实值；请检查函数定义域或更换区间。');
    roots.sort((a, b) => a.x - b.x);
    output.solutions = roots.map(r => ({ variable: opts.variable, exact: formatNumber(r.x, 15), approximate: formatNumber(r.x, opts.precision), real: true,
      multiplicity: 1, numerical: true, tangent: r.source === '切触候选' }));
    output.answerText = roots.length ? output.solutions.map(r => opts.variable + ' ≈ ' + r.approximate).join('；') : '在 [' + formatNumber(lower, opts.precision) + ', ' + formatNumber(upper, opts.precision) + '] 的有界搜索中未找到通过验证的实根';
    output.answerLatex = roots.length ? output.solutions.map(r => opts.variable + '\\approx' + toLatex(r.approximate)).join(',\\quad ') : '\\text{区间搜索未找到已验证实根}';
    output.approximate = roots.length ? output.answerText : null;
    step(output, '确定实数搜索区间', '仅在指定闭区间取有限网格；超出区间的根不在本次数值搜索结论内。', opts.variable + '\\in[' + toLatex(formatNumber(lower, 15)) + ',' + toLatex(formatNumber(upper, 15)) + ']');
    step(output, '定位变号与切触候选', '实际进行 ' + evaluations + ' 次函数采样，检查 ' + bracketCount + ' 个变号区间与 ' + minimumCount + ' 个局部极小值候选；预算用尽即停止。', toLatex(plain(nodes[0], null, null, false, true)) + '-' + toLatex(plain(nodes[1], null, null, false, true)) + '=0');
    step(output, '代回原方程检查', '只输出原式为有限实数、绝对残差和局部尺度检查均通过且不接近分母或三角断点的候选；对不变号的极小值采用更严格阈值，避免把很小的正数当作零。', output.answerLatex);
    output.notes.push('仅搜索区间 [' + formatNumber(lower, opts.precision) + ', ' + formatNumber(upper, opts.precision) + ']；有限网格与局部细化不能穷尽全部实根，也不能证明全局无解。');
    output.notes.push('≈ 表示数值近似。切触候选通过残差检查，但其重数未经符号证明；非常接近的根、剧烈振荡或更窄的零点可能被漏掉。');
    if (invalidSamples || skippedDomains) output.notes.push('跳过了非实数、无定义采样或接近断点的候选；不会把分母零点或正切渐近线当作根。');
    if (stopped || limitedRoots) output.notes.push('已达到采样、运算或 64 个候选根的预算，搜索未完成全部细化；可缩小区间再计算。');
    if (flatZeros) output.notes.push('部分相邻网格值连续为零，可能有区间解或浮点下溢；本方法寻找孤立根，不能据此宣布恒等式或完整解集。');
    if (roots.length) output.table = { headers: ['近似根', '原式绝对残差', '定位方法'], rows: roots.map(r => [formatNumber(r.x, opts.precision), formatNumber(r.residual, 4), r.source]) };
    equationGraphs(output, nodes, opts);
    return output;
  }
  function equation(input, normalized, opts) {
    const relation = comparisons(normalized);
    if (relation.operators.length !== 1 || !['=', '=='].includes(relation.operators[0])) fail('解方程需要一个等号；多个方程请用分号或换行分隔。');
    const nodes = relation.sides.map(parse);
    const vars = Array.from(new Set(nodes.flatMap(symbols)));
    if (!opts.variableExplicit && !vars.includes(opts.variable) && vars.length === 1) opts = Object.assign({}, opts, { variable: vars[0] });
    const variable = opts.variable, params = vars.filter(v => v !== variable);
    const common = commonRealEquation(input, normalized, opts, nodes);
    if (common) return common;
    let a, b;
    try { a = rational(nodes[0], variable, opts); b = rational(nodes[1], variable, opts); }
    catch (error) {
      if (/此功能支持多项式和有理式|此运算不能转换/.test(error.message) || nonPolynomialPower(nodes, opts)) {
        if (relation.sides[0] === relation.sides[1]) {
          const identity = result('equation', '恒等方程', input, normalized);
          identity.answerText = '所有满足原式实数定义域的 ' + opts.variable + ' 都是解';
          identity.answerLatex = opts.variable + '\\in\\mathbb{R}\\quad\\text{（满足原式定义域）}';
          identity.solutions = [];
          step(identity, '比较两边', '两边是同一个表达式；只需保留原式定义域。', toLatex(normalized));
          nodes.forEach(n => domainNotes(n, identity, opts.variable));
          equationGraphs(identity, nodes, opts); return identity;
        }
        return numericEquation(input, normalized, opts, nodes);
      }
      throw error;
    }
    const r = { num: psub(pmul(a.num, b.den), pmul(b.num, a.den)), den: pmul(a.den, b.den), excluded: a.excluded.concat(b.excluded) };
    const output = result('equation', '方程求解', input, normalized);
    output.parameters = params;
    const poly = ptrim(r.num), degree = poly.length - 1, polyText = polynomialText(poly, variable);
    const excluded = domainRoots(r, variable, opts);
    if (excluded.length) output.notes.push('原式分母不能为零，必须排除：' + excluded.map(v => variable + ' = ' + v.exact).join('，') + '。');
    step(output, '移项并保留定义域', '将两边的差写成有理式；只在原分母非零的位置令分子为零。', toLatex(polyText) + '=0');
    step(output, '读取多项式系数', '按 ' + variable + ' 的升幂排列，次数为 ' + degree + '。', '[' + poly.map(toLatex).join(',\\;') + ']');
    if (degree === 0) {
      const identical = zero(poly[0]);
      output.answerLatex = identical ? variable + '\\in\\mathbb{C}' + (excluded.length ? '\\setminus\\{' + excluded.map(v => toLatex(v.exact)).join(',') + '\\}' : '') : '\\varnothing';
      output.answerText = identical ? '所有满足原式定义域的 ' + variable + ' 都是解' : '无解';
      output.solutions = [];
      if (params.length && !identical) output.notes.push('结论以常数项 ' + poly[0] + ' 非零为条件；参数使它为零时，方程成为恒等式。');
      return output;
    }
    if (symbols(parse(poly[degree])).length) {
      output.notes.push('以下结果要求最高次系数 ' + poly[degree] + ' ≠ 0；为零时方程降次，需另行代入求解。');
      if (degree === 1) output.notes.push('当 ' + poly[1] + '=0 时：若 ' + poly[0] + '=0，则定义域内所有值都是解；否则无解。');
    }
    if (degree === 1) step(output, '解一次方程', '由 a' + variable + '+b=0 得 ' + variable + '=-b/a，要求 a≠0。', variable + '=\\frac{-(' + toLatex(poly[0]) + ')}{' + toLatex(poly[1]) + '}');
    if (degree === 2) {
      const d = csub(cpow(poly[1], '2'), cmul('4', cmul(poly[2], poly[0])));
      step(output, '计算判别式', 'Δ=b²−4ac；Δ=0 对应二重根，Δ<0 时有一对共轭复根。', '\\Delta=(' + toLatex(poly[1]) + ')^2-4(' + toLatex(poly[2]) + ')(' + toLatex(poly[0]) + ')=' + toLatex(d));
      step(output, '代入求根公式', '在复数范围使用平方根求解；重复的根只列一次并标注重数。', variable + '=\\frac{-b\\pm\\sqrt{\\Delta}}{2a}');
    }
    if (degree > 2) {
      const coeff = numericCoefficients(poly, opts);
      if (safeFactorCoefficients(poly) && polyText.length < 500) {
        const f = cas(polyText, 'factor');
        if (zero(csub(cas(f, 'expand'), cas(polyText, 'expand')))) step(output, '尝试因式分解', '展开检查与原多项式一致后，各因子为零给出候选根；不能分解的因子采用有界数值迭代。', toLatex(f) + '=0');
        else step(output, '数值求多项式根', '因式分解未通过精确系数检查，改用变量缩放后的有界迭代及残差、系数检验。', toLatex(polyText) + '=0');
      } else step(output, '数值求多项式根', '使用最多 300 次迭代，并以代回残差和韦达系数重建检查结果。', toLatex(polyText) + '=0');
    }
    let roots = polynomialRoots(poly, variable, opts);
    roots = roots.filter(v => !excluded.some(s => s.exact === v.exact || Number.isFinite(v._value) && Number.isFinite(s._value) && closeRoot(v._value, s._value)));
    output.solutions = publicRoots(roots);
    output.answerLatex = roots.length ? roots.map(v => variable + (v.numerical ? '\\approx' : '=') + toLatex(v.exact)).join(',\\quad ') : '\\varnothing';
    output.answerText = roots.length ? roots.map(v => variable + (v.numerical ? ' ≈ ' : ' = ') + v.exact + (v.multiplicity > 1 ? '（' + v.multiplicity + ' 重根）' : '')).join('；') : '无解';
    output.exact = roots.some(v => v.numerical) ? undefined : roots.map(v => variable + '=' + v.exact).join(';');
    output.approximate = roots.length && roots.every(v => v.approximate !== null) ? roots.map(v => variable + ' ≈ ' + v.approximate).join('；') : null;
    if (roots.some(v => v.real === false)) output.notes.push('复根只在答案中列出；图像显示原方程两边的实值部分，不标绘复数根。');
    if (roots.some(v => v.numerical)) output.notes.push('高次方程中标有 ≈ 的根为数值近似，不冒充精确根。');
    if (!params.length && roots.length) {
      let verified = true;
      for (const v of roots) {
        try {
          const scope = Object.create(null); scope[variable] = evaluateNode(parse(v.exact), scope, Object.assign({}, opts, { angle: 'rad' }));
          const left = evaluateNode(nodes[0], scope, opts), right = evaluateNode(nodes[1], scope, opts);
          if (math.abs(math.subtract(left, right)) > 1e-7 * Math.max(1, math.abs(left), math.abs(right))) verified = false;
        } catch (_) { verified = false; }
      }
      if (verified) step(output, '检查原方程', '已把候选根代回原式，两边相等且原分母非零；数值根按相对残差检验。', output.answerLatex);
      else output.notes.push('部分候选根不能用浮点数稳定代回；请以精确表达式及原定义域为准。');
    }
    addGraph(output, relation.sides[0], '方程左边', opts);
    addGraph(output, relation.sides[1], '方程右边', opts);
    output.related.push({ label: '化简两边之差', input: '(' + relation.sides[0] + ')-(' + relation.sides[1] + ')', mode: 'simplify' });
    return output;
  }

  function linearForm(node, variables, opts) {
    const n = unwrap(node), width = variables.length;
    if (!variables.some(v => hasVariable(n, v))) return [cas(plain(n, opts))].concat(Array(width).fill('0'));
    if (n.isSymbolNode && variables.includes(n.name)) return ['0'].concat(variables.map(v => v === n.name ? '1' : '0'));
    if (!n.isOperatorNode) fail('方程组只支持线性方程；未知量不能出现在函数内部。');
    if (n.fn === 'unaryPlus' || n.fn === 'unaryMinus') { const a = linearForm(n.args[0], variables, opts); return n.fn === 'unaryMinus' ? a.map(cneg) : a; }
    if (n.fn === 'pow') { const k = integerExponent(n.args[1], opts); if (k === 1) return linearForm(n.args[0], variables, opts); if (k === 0) return ['1'].concat(Array(width).fill('0')); fail('方程组包含未知量的幂，暂只支持线性系统。'); }
    const a = linearForm(n.args[0], variables, opts), b = linearForm(n.args[1], variables, opts);
    if (n.fn === 'add' || n.fn === 'subtract') return a.map((c, i) => n.fn === 'add' ? cadd(c, b[i]) : csub(c, b[i]));
    if (n.fn === 'multiply') {
      const av = a.slice(1).some(c => !zero(c)), bv = b.slice(1).some(c => !zero(c));
      if (av && bv) fail('未知量的乘积不是线性项，暂不支持非线性方程组。');
      return av ? a.map(c => cmul(c, b[0])) : b.map(c => cmul(c, a[0]));
    }
    if (n.fn === 'divide') {
      if (b.slice(1).some(c => !zero(c))) fail('未知量出现在分母中，方程组不是线性系统。');
      return a.map(c => cdiv(c, b[0]));
    }
    fail('方程组包含不支持的运算。');
  }
  function matrixTex(rows) { return '\\begin{bmatrix}' + rows.map(row => row.map(toLatex).join('&')).join('\\\\') + '\\end{bmatrix}'; }
  function linearSystem(input, normalized, opts) {
    const texts = splitTop(normalized, ';');
    if (texts.length < 2 || texts.length > 3) fail('线性方程组支持 2 或 3 个方程，以分号或换行分隔。');
    const nodes = texts.map(t => {
      const r = comparisons(t);
      if (r.operators.length !== 1 || !['=', '=='].includes(r.operators[0])) fail('方程组中的每一行都需要一个等号。');
      return r.sides.map(parse);
    });
    const all = Array.from(new Set(nodes.flatMap(pair => pair.flatMap(symbols)))).sort();
    let variables = all.filter(v => ['x', 'y', 'z'].includes(v));
    if (variables.length < 2) variables = all;
    if (Array.isArray(opts.variables)) variables = opts.variables;
    if (variables.length < 2 || variables.length > 3 || new Set(variables).size !== variables.length || variables.some(v => !/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(v) || FORBIDDEN.test(v) || CONSTANTS.has(v) || FUNCTIONS.has(v))) fail('方程组支持 2 或 3 个未知量，例如 x、y、z。');
    const parameters = all.filter(v => !variables.includes(v));
    const output = result('system', '线性方程组', input, normalized);
    output.parameters = parameters.slice();
    const rows = nodes.map(pair => {
      const a = linearForm(pair[0], variables, opts), b = linearForm(pair[1], variables, opts);
      return a.slice(1).map((c, i) => csub(c, b[i + 1])).concat(csub(b[0], a[0]));
    });
    const original = rows.map(r => r.slice());
    step(output, '建立增广矩阵', '列的顺序为 ' + variables.join('、') + '，最后一列为等号右侧常数。', matrixTex(rows));
    const pivots = [], conditions = [];
    let row = 0;
    for (let column = 0; column < variables.length && row < rows.length; column++) {
      const pivot = rows.findIndex((r, index) => index >= row && !zero(r[column]));
      if (pivot < 0) continue;
      if (pivot !== row) {
        [rows[row], rows[pivot]] = [rows[pivot], rows[row]];
        step(output, '交换行', '交换第 ' + (row + 1) + ' 行和第 ' + (pivot + 1) + ' 行，取得非零主元。', matrixTex(rows));
      }
      const divisor = rows[row][column];
      if (symbols(parse(divisor)).length) conditions.push(divisor + ' ≠ 0');
      if (divisor !== '1') {
        rows[row] = rows[row].map(c => cdiv(c, divisor));
        step(output, '主元归一化', '第 ' + (row + 1) + ' 行除以 ' + divisor + '。', 'R_{' + (row + 1) + '}\\leftarrow\\frac{R_{' + (row + 1) + '}}{' + toLatex(divisor) + '}\\quad' + matrixTex(rows));
      }
      for (let index = 0; index < rows.length; index++) {
        if (index === row || zero(rows[index][column])) continue;
        const factor = rows[index][column];
        rows[index] = rows[index].map((c, k) => csub(c, cmul(factor, rows[row][k])));
        step(output, '消去第 ' + (column + 1) + ' 列', '第 ' + (index + 1) + ' 行减去 ' + factor + ' 倍的第 ' + (row + 1) + ' 行。', 'R_{' + (index + 1) + '}\\leftarrow R_{' + (index + 1) + '}-(' + toLatex(factor) + ')R_{' + (row + 1) + '}\\quad' + matrixTex(rows));
      }
      pivots.push({ row, column }); row++;
    }
    if (conditions.length) output.notes.push('此消元分支要求：' + conditions.join('，') + '；使主元为零的参数需代入原方程组另算。');
    const contradiction = rows.find(r => r.slice(0, -1).every(zero) && !zero(r[r.length - 1]));
    if (contradiction) {
      output.answerLatex = '\\varnothing'; output.answerText = '方程组无解'; output.solutions = [];
      if (symbols(parse(contradiction[contradiction.length - 1])).length) output.notes.push('无解以矛盾行常数 ' + contradiction[contradiction.length - 1] + ' ≠ 0 为条件；当它为零时需重新判定秩和自由变量。');
      step(output, '发现矛盾行', '左侧系数全为零，但右侧常数非零，原方程组不能同时成立。', '0=' + toLatex(contradiction[contradiction.length - 1]));
      return output;
    }
    const free = variables.map((_, i) => i).filter(i => !pivots.some(p => p.column === i));
    const values = Array(variables.length).fill('0'), freeNames = [];
    let parameterIndex = 1;
    free.forEach(column => {
      while (all.includes('t' + parameterIndex) || variables.includes('t' + parameterIndex)) parameterIndex++;
      values[column] = 't' + parameterIndex++; freeNames.push(values[column]); output.parameters.push(values[column]);
    });
    pivots.forEach(p => {
      let value = rows[p.row][variables.length];
      free.forEach(c => { value = csub(value, cmul(rows[p.row][c], values[c])); });
      values[p.column] = value;
    });
    output.answerText = variables.map((v, i) => v + ' = ' + values[i]).join('；');
    output.answerLatex = '\\begin{cases}' + variables.map((v, i) => v + '=' + toLatex(values[i])).join('\\\\') + '\\end{cases}';
    output.exact = variables.map((v, i) => v + '=' + values[i]).join(';');
    output.solutions = variables.map((v, i) => publicRoots([rootRecord(values[i], v, opts)])[0]);
    if (free.length) output.notes.push('存在无穷多组解；' + freeNames.join('、') + ' 为任意实数（也可在复数域取值）。');
    else {
      const checked = original.every(r => zero(r.slice(0, -1).reduce((s, c, i) => cadd(s, cmul(c, values[i])), cneg(r[r.length - 1]))));
      if (checked) step(output, '代回验证', '精确代入原增广矩阵，每一行都满足等式。', output.answerLatex);
    }
    if (variables.includes('x') && variables.includes('y') && !parameters.length && variables.length === 2) {
      const xi = variables.indexOf('x'), yi = variables.indexOf('y');
      original.forEach((r, i) => {
        if (!zero(r[yi])) addGraph(output, cdiv(csub(r[2], cmul(r[xi], 'x')), r[yi]), '方程 ' + (i + 1), Object.assign({}, opts, { variable: 'x' }), true);
      });
    }
    return output;
  }
  function replaceAbs(node, target, replacement) {
    const n = unwrap(node);
    if (n === target) return '(' + replacement + ')';
    if (n.isOperatorNode) {
      const args = n.args.map(a => replaceAbs(a, target, replacement));
      return operatorExpression(n, args);
    }
    if (n.isFunctionNode) return n.fn.name + '(' + n.args.map(a => replaceAbs(a, target, replacement)).join(',') + ')';
    return plain(n);
  }
  function absNodes(nodes, variable) {
    const found = [];
    function visit(n) { n = unwrap(n); if (n.isFunctionNode && n.fn.name === 'abs' && hasVariable(n, variable)) found.push(n); if (n.args) n.args.forEach(visit); }
    nodes.forEach(visit); return found;
  }
  function inequality(input, normalized, opts) {
    const relation = comparisons(normalized);
    if (!relation.operators.length || relation.operators.some(op => ['=', '=='].includes(op))) fail('请输入实数不等式，例如 (x+1)/(x-2)≥0。');
    if (relation.operators.length > 3) fail('链式不等式最多包含三个比较条件。');
    const nodes = relation.sides.map(parse), vars = Array.from(new Set(nodes.flatMap(symbols)));
    if (!opts.variableExplicit && !vars.includes(opts.variable) && vars.length === 1) opts = Object.assign({}, opts, { variable: vars[0] });
    const variable = opts.variable;
    if (vars.some(v => v !== variable)) fail('数轴解集需要确定的实系数；请先给其他参数赋值。');
    if (/\bi\b/.test(normalized)) fail('复数没有与实数相同的大小顺序，不支持复数不等式。');
    const abs = absNodes(nodes, variable);
    if (abs.length > 1) fail('目前绝对值不等式支持一个含未知量的 abs；多个绝对值需手动分段。');
    const branches = [];
    function makeConstraint(left, right, op) {
      const a = rational(left, variable, opts), b = rational(right, variable, opts);
      const r = { num: psub(pmul(a.num, b.den), pmul(b.num, a.den)), den: pmul(a.den, b.den), excluded: a.excluded.concat(b.excluded) };
      const nums = numericCoefficients(r.num, opts), dens = numericCoefficients(r.den, opts);
      if (dens.every(c => c === 0)) fail('不等式的分母恒为零，无定义。');
      return { r, nums, dens, op, roots: polynomialRoots(r.num, variable, opts).filter(v => v.real), holes: domainRoots(r, variable, opts).filter(v => v.real) };
    }
    if (!abs.length) branches.push(relation.operators.map((op, i) => makeConstraint(nodes[i], nodes[i + 1], op)));
    else {
      const inner = plain(abs[0].args[0]);
      for (const positive of [true, false]) {
        const changed = nodes.map(n => parse(replaceAbs(n, abs[0], positive ? inner : '-(' + inner + ')')));
        const constraints = relation.operators.map((op, i) => makeConstraint(changed[i], changed[i + 1], op));
        constraints.push(makeConstraint(parse(inner), parse('0'), positive ? '>=' : '<'));
        branches.push(constraints);
      }
    }
    const constraints = branches.flat(), boundaries = [];
    constraints.forEach(c => c.roots.concat(c.holes).forEach(v => {
      if (!Number.isFinite(v._value)) fail('无法可靠确定实数边界。');
      const existing = boundaries.find(b => closeRoot(b.value, v._value));
      if (!existing) boundaries.push({ value: v._value, exact: v.exact, numerical: !!v.numerical });
    }));
    boundaries.sort((a, b) => a.value - b.value);
    function constraintAt(c, x, endpoint) {
      const hole = c.holes.some(r => closeRoot(r._value, x));
      if (hole) return null;
      let numerator = peval(c.nums, x), denominator = peval(c.dens, x);
      if (endpoint && c.roots.some(r => closeRoot(r._value, x))) numerator = 0;
      if (denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
      const sign = Math.sign(numerator) * Math.sign(denominator);
      return sign;
    }
    function satisfies(sign, op) { return sign !== null && (op === '>' ? sign > 0 : op === '>=' ? sign >= 0 : op === '<' ? sign < 0 : op === '<=' ? sign <= 0 : sign !== 0); }
    function allowed(x, endpoint) { return branches.some(branch => branch.every(c => satisfies(constraintAt(c, x, endpoint), c.op))); }
    const endpoints = boundaries.map(b => allowed(b.value, true));
    const points = [-Infinity].concat(boundaries.map(b => b.value), [Infinity]);
    const segments = [], chartRows = [];
    function label(index) { return index < 0 ? '-∞' : index >= boundaries.length ? '+∞' : boundaries[index].exact; }
    function texLabel(index) { return index < 0 ? '-\\infty' : index >= boundaries.length ? '+\\infty' : toLatex(boundaries[index].exact); }
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const sample = a === -Infinity ? (b === Infinity ? 0 : b - Math.max(1, Math.abs(b))) : b === Infinity ? a + Math.max(1, Math.abs(a)) : a + (b - a) / 2;
      const accepted = allowed(sample, false);
      const signs = constraints.map(c => { const sign = constraintAt(c, sample, false); return sign === null ? '无定义' : sign === 0 ? '0' : sign > 0 ? '+' : '−'; });
      chartRows.push(['(' + label(i - 1) + ', ' + label(i) + ')'].concat(signs, accepted ? '满足' : '不满足'));
      if (accepted) segments.push({ left: i - 1, right: i, lc: i > 0 && endpoints[i - 1], rc: i < boundaries.length && endpoints[i] });
    }
    for (let i = 0; i < endpoints.length; i++) if (endpoints[i] && !segments.some(s => s.left === i || s.right === i)) segments.push({ left: i, right: i, lc: true, rc: true });
    segments.sort((a, b) => a.left - b.left || a.right - b.right);
    const merged = [];
    segments.forEach(s => {
      const previous = merged[merged.length - 1];
      if (previous && previous.right === s.left && (previous.rc || s.lc)) { previous.right = s.right; previous.rc = s.rc; }
      else merged.push(Object.assign({}, s));
    });
    const output = result('inequality', '不等式与区间符号表', input, normalized);
    const intervalText = merged.map(s => s.left === s.right ? '{' + label(s.left) + '}' : (s.lc ? '[' : '(') + label(s.left) + ', ' + label(s.right) + (s.rc ? ']' : ')'));
    const intervalTex = merged.map(s => s.left === s.right ? '\\{' + texLabel(s.left) + '\\}' : (s.lc ? '[' : '(') + texLabel(s.left) + ',\\,' + texLabel(s.right) + (s.rc ? ']' : ')'));
    output.answerText = intervalText.length ? variable + ' ∈ ' + intervalText.join(' ∪ ') : '无实数解';
    output.answerLatex = intervalTex.length ? variable + '\\in ' + intervalTex.join('\\cup') : '\\varnothing';
    output.exact = intervalText.join(' union ') || 'empty';
    output.solutions = merged.map(s => ({ lower: s.left < 0 ? '-Infinity' : label(s.left), upper: s.right >= boundaries.length ? 'Infinity' : label(s.right), lowerClosed: !!s.lc, upperClosed: !!s.rc }));
    if (abs.length) step(output, '按绝对值分段', '在内部表达式 ≥0 时取原式，在 <0 时取相反数；分别求解再取并集。', '\\left|' + toLatex(plain(abs[0].args[0])) + '\\right|');
    constraints.forEach((c, i) => step(output, '条件 ' + (i + 1) + '：移项与有理化', '保留原分母的非零条件，再比较分子和分母的符号。', '\\frac{' + toLatex(polynomialText(c.r.num, variable)) + '}{' + toLatex(polynomialText(c.r.den, variable)) + '}' + ({ '>': '>0', '<': '<0', '>=': '\\ge0', '<=': '\\le0', '!=': '\\ne0' })[c.op]));
    const excluded = [];
    constraints.forEach(c => c.holes.forEach(h => { if (!excluded.some(v => closeRoot(v._value, h._value))) excluded.push(h); }));
    if (excluded.length) {
      output.notes.push('分母禁用点（即使约分消去仍排除）：' + excluded.map(h => variable + '=' + h.exact).join('，') + '。');
      step(output, '排除分母零点', '分母为零的点一律不能成为闭区间端点或孤立解。', variable + '\\notin\\{' + excluded.map(h => toLatex(h.exact)).join(',') + '\\}');
    }
    step(output, '按边界分区间检查符号', '分子零点与分母零点把数轴切开；每个开区间内符号不变，端点单独检查。', output.answerLatex);
    output.table = { headers: ['区间'].concat(constraints.map((_, i) => '条件' + (i + 1) + ' 左式符号'), '结论'), rows: chartRows };
    if (boundaries.some(b => b.numerical)) output.notes.push('不能精确分解的高次边界使用已校验的数值近似；非常接近的根建议先精确因式分解。');
    relation.sides.forEach((side, i) => addGraph(output, side, '比较式 ' + (i + 1), opts));
    return output;
  }

  function probeEquivalence(before, after) {
    try {
      const a = parse(before), b = parse(after), variables = Array.from(new Set(symbols(a).concat(symbols(b))));
      let checked = 0;
      const probes = variables.length ? [0.37, 1.21, 2.63, 4.1, -0.83, -2.17] : [0];
      for (const base of probes) {
        const scope = Object.create(null); variables.forEach((v, i) => { scope[v] = base + i * 0.31; });
        let av, bv;
        try { av = evaluateNode(a, scope, optionsFor()); bv = evaluateNode(b, scope, optionsFor()); } catch (_) { continue; }
        if (!numericallyEqual(av, bv, 1e-8)) return false;
        checked++;
      }
      return checked >= (variables.length ? 2 : 1) ? true : null;
    } catch (_) { return null; }
  }
  function guardSymbolic(node, action) {
    let count = 0, functionCount = 0;
    function visit(n) {
      n = unwrap(n); count++;
      if (n.isArrayNode) fail('代数和微积分功能不接受矩阵；请使用矩阵模式。');
      if (n.isFunctionNode) {
        functionCount++;
        if (action !== 'evaluate' && ['nthRoot', 'cbrt'].includes(n.fn.name) && symbols(n.args[0]).length) {
          const degree = n.fn.name === 'cbrt' ? 3 : symbols(n.args[1]).length ? null : constantValue(plain(n.args[1]), optionsFor());
          if (degree === null || Number.isInteger(degree) && Math.abs(degree) % 2 === 1) fail('含未知量的实奇次根需要按正负区间分段；当前符号变换暂不支持，请代入数值或解“奇次根=常数”的方程。');
        }
        if (['sqrt', 'nthRoot', 'cbrt'].includes(n.fn.name) && !symbols(n.args[0]).length) {
          try { if (Math.abs(scalarNumber(evaluateNode(n.args[0], Object.create(null), optionsFor()))) > 1e12) fail('大数根式仅使用数值计算，暂不进行可能耗时的符号分解。'); } catch (error) { if (/大数根式/.test(error.message)) throw error; }
        }
        if (['sum', 'prod', 'product', 'factorial', 'gamma', 'combinations', 'permutations'].includes(n.fn.name)) {
          if (symbols(n).length) fail('符号阶乘、无限求和或含参数的连乘暂不支持；有限数值求和最多 200 项。');
          evaluateNode(n, Object.create(null), optionsFor());
        }
      }
      if (n.isOperatorNode && n.fn === 'factorial') {
        if (symbols(n.args[0]).length) fail('符号阶乘暂不支持；数值阶乘最多 170。');
        evaluateNode(n, Object.create(null), optionsFor());
      }
      if (n.isOperatorNode && n.fn === 'pow' && symbols(n.args[0]).length && !symbols(n.args[1]).length) {
        const exponent = constantValue(plain(n.args[1]), optionsFor());
        if (Math.abs(exponent) > 64) fail('符号幂的指数绝对值最多 64；请降低复杂度。');
      }
      if (n.args) n.args.forEach(visit);
    }
    visit(node);
    if (['integral', 'limit'].includes(action) && (count > 140 || functionCount > 18)) fail('此微积分表达式过于复杂，请拆分计算。');
    if (action === 'expand') {
      function termCount(n) {
        n = unwrap(n);
        if (!n.isOperatorNode) return 1;
        const counts = n.args.map(termCount);
        let size = 1;
        if (n.fn === 'add' || n.fn === 'subtract') size = counts[0] + counts[1];
        if (n.fn === 'multiply') size = counts[0] * counts[1];
        if (n.fn === 'pow' && !symbols(n.args[1]).length) {
          const power = constantValue(plain(n.args[1]), optionsFor());
          if (Number.isInteger(power) && power >= 0 && counts[0] > 1) {
            // Number of commutative monomials in an m-term power: C(m+n-1,n).
            size = 1;
            for (let i = 1; i <= power; i++) { size *= (counts[0] + i - 1) / i; if (size > LIMITS.expansion) break; }
          }
        }
        if (size > LIMITS.expansion) fail('展开后的项数超过 1600，请降低幂次或减少项数。');
        return size;
      }
      termCount(node);
    }
    if (action === 'factor') {
      function integers(n) {
        n = unwrap(n);
        if (n.isConstantNode && Math.abs(n.value) > 1e9) fail('因式分解中的数值系数绝对值最多 10^9，以避免大整数分解耗时。');
        if (n.isOperatorNode && n.fn === 'pow' && !symbols(n).length) {
          try { if (Math.abs(scalarNumber(evaluateNode(n, Object.create(null), optionsFor()))) > 1e9) fail('因式分解的常数幂绝对值最多 10^9，请缩放系数。'); } catch (error) { if (/因式分解/.test(error.message)) throw error; }
        }
        if (n.args) n.args.forEach(integers);
      }
      integers(node);
    }
  }
  function algebra(input, normalized, opts, mode) {
    const node = parse(normalized);
    guardSymbolic(node, mode);
    if (['expand', 'factor'].includes(mode)) {
      const vars = symbols(node);
      if (vars.length === 1) {
        try {
          const r = rational(node, vars[0], opts);
          if (mode === 'factor' && (!safeFactorCoefficients(r.num) || !safeFactorCoefficients(r.den))) fail('因式分解的整数系数最多 10^9、有理系数分母最多 10^6；请缩放或使用数值求根。');
        } catch (error) { if (/因式分解的整数/.test(error.message)) throw error; }
      }
    }
    const expression = plain(node, opts), output = result(mode, { simplify: '代数化简', expand: '展开表达式', factor: '因式分解' }[mode], input, normalized);
    let answer = cas(expression, mode);
    if (uncomputed(answer) || new RegExp('\\b' + mode + '\\s*\\(').test(answer)) fail('符号库未完成此代数运算，请简化输入。');
    if (probeEquivalence(expression, answer) === false) {
      if (mode !== 'simplify') fail('符号计算结果未通过代入等价检查，暂不输出可能错误的变形。');
      answer = cas(expression, 'expand');
      if (probeEquivalence(expression, answer) === false) fail('符号化简未通过等价检查，请拆开表达式计算。');
      output.notes.push('符号库的 simplify 结果未通过代入检查，已保留通过检查的等价形式。');
    }
    output.exact = answer; output.answerText = answer; output.answerLatex = toLatex(answer);
    step(output, { simplify: '合并同类项与约分', expand: '分配乘法并合并同类项', factor: '计算因式分解' }[mode], '符号计算得到下面的等价形式；等价关系仅在原表达式有定义的位置成立。', toLatex(normalized) + '=' + output.answerLatex);
    if (mode === 'factor') {
      const expanded = cas(answer, 'expand'), original = cas(expression, 'expand');
      if (zero(csub(expanded, original))) step(output, '展开验证', '把所得因子相乘并展开，精确还原原表达式。', toLatex(expanded));
    }
    try {
      const r = rational(node, opts.variable, opts);
      const coefficients = r.num;
      if (coefficients.length > 1 && symbols(node).every(v => v === opts.variable)) {
        step(output, '系数对应', '原式分子按 ' + opts.variable + ' 的升幂排列；这里列出实际计算的系数。', '[' + coefficients.map(toLatex).join(',\\;') + ']');
      }
    } catch (_) { /* Non-polynomial algebra still has the honest equivalence step above. */ }
    domainNotes(node, output, opts.variable);
    addGraph(output, normalized, '原表达式', opts);
    addGraph(output, answer, '运算结果', opts, true);
    output.related = [{ label: '化简', input: normalized, mode: 'simplify' }, { label: '展开', input: normalized, mode: 'expand' }, { label: '因式分解', input: normalized, mode: 'factor' }].filter(r => r.mode !== mode);
    return output;
  }
  function numericSteps(node, output, opts) {
    let visited = 0;
    function visit(n) {
      n = unwrap(n);
      if (output.steps.length >= 8 || ++visited > 40) return;
      if (n.args && !(['sum', 'prod', 'product'].includes(n.fn && n.fn.name))) n.args.forEach(visit);
      if (!(n.isOperatorNode || n.isFunctionNode) || output.steps.length >= 8) return;
      try {
        let value = evaluateNode(n, Object.create(null), opts, { left: 2000 });
        if (n === unwrap(node) && output.exact) value = evaluateNode(parse(output.exact), Object.create(null), Object.assign({}, opts, { angle: 'rad' }));
        const name = n.isOperatorNode ? n.fn : n.fn.name;
        const explanation = ['sum', 'prod', 'product'].includes(name) && n.args.length === 4 ? '按整数上下限逐项计算，最多 200 项。' : DIRECT_TRIG.has(name) ? '该三角函数按' + (opts.angle === 'deg' ? '角度' : '弧度') + '解释参数。' : name === 'factorial' ? '阶乘为从 1 到 n 的整数乘积（0! = 1）。' : '依据括号和运算优先级，计算这一子表达式。';
        step(output, '计算 ' + ({ add: '加法', subtract: '减法', multiply: '乘法', divide: '除法', pow: '幂', factorial: '阶乘' }[name] || name), explanation, toLatex(plain(n)) + '\\approx' + valueLatex(value, opts));
      } catch (_) { /* Main evaluation already validates; do not invent missing substeps. */ }
    }
    visit(node);
  }
  function exactIntegerFunction(name, values) {
    if (!values.every(Number.isSafeInteger)) return null;
    const absBig = n => n < 0n ? -n : n;
    const gcdBig = (a, b) => { a = absBig(a); b = absBig(b); while (b) { const next = a % b; a = b; b = next; } return a; };
    if (name === 'gcd' || name === 'lcm') {
      let value = BigInt(values[0]);
      for (let i = 1; i < values.length; i++) { const b = BigInt(values[i]), g = gcdBig(value, b); value = name === 'gcd' ? g : g === 0n ? 0n : absBig(value / g * b); }
      return absBig(value).toString();
    }
    if (['factorial', 'gamma', 'combinations', 'permutations'].includes(name)) {
      const n = values[0], k = name === 'gamma' ? n - 1 : name === 'factorial' ? n : values.length > 1 ? values[1] : n;
      if (n < 0 || n > 170 || k < 0 || k > n) return null;
      let value = 1n;
      if (name === 'combinations') {
        const length = Math.min(k, n - k);
        for (let i = 1; i <= length; i++) value = value * BigInt(n - length + i) / BigInt(i);
      } else if (name === 'permutations') { for (let i = 0; i < k; i++) value *= BigInt(n - i); }
      else { for (let i = 2; i <= k; i++) value *= BigInt(i); }
      return value.toString();
    }
    return null;
  }
  function numericCASExpression(node, opts) {
    const n = unwrap(node);
    if (n.isConstantNode || n.isSymbolNode) return plain(n);
    if (n.isOperatorNode) {
      const args = n.args.map(a => numericCASExpression(a, opts));
      if (n.fn === 'factorial') {
        const exact = exactIntegerFunction('factorial', [scalarNumber(evaluateNode(n.args[0], Object.create(null), opts))]);
        return exact === null ? operatorExpression(n, args) : exact;
      }
      return operatorExpression(n, args);
    }
    if (!n.isFunctionNode) return plain(n, opts);
    const name = n.fn.name;
    if (['sum', 'prod', 'product'].includes(name) && n.args.length === 4) return plain(n, opts);
    const args = n.args.map(a => numericCASExpression(a, opts));
    if (['factorial', 'gamma', 'combinations', 'permutations', 'gcd', 'lcm'].includes(name)) {
      const exact = exactIntegerFunction(name, n.args.map(a => scalarNumber(evaluateNode(a, Object.create(null), opts))));
      if (exact !== null) return exact;
    }
    if (['log', 'log2', 'log10'].includes(name)) {
      const value = scalarNumber(evaluateNode(n, Object.create(null), opts)), base = name === 'log2' ? '2' : name === 'log10' ? '10' : args[1] || 'e';
      if (Number.isSafeInteger(value) && Math.abs(value) <= 1024 && zero(csub(cpow(base, String(value)), cas(args[0])))) return String(value);
    }
    if (['asin', 'acos', 'atan'].includes(name)) {
      const values = {
        asin: { '0': '0', '1/2': 'pi/6', '-1/2': '-pi/6', '1': 'pi/2', '-1': '-pi/2', '(1/2)*sqrt(2)': 'pi/4', '(-1/2)*sqrt(2)': '-pi/4', '(1/2)*sqrt(3)': 'pi/3', '(-1/2)*sqrt(3)': '-pi/3' },
        acos: { '0': 'pi/2', '1/2': 'pi/3', '-1/2': '2*pi/3', '1': '0', '-1': 'pi', '(1/2)*sqrt(2)': 'pi/4', '(-1/2)*sqrt(2)': '3*pi/4', '(1/2)*sqrt(3)': 'pi/6', '(-1/2)*sqrt(3)': '5*pi/6' },
        atan: { '0': '0', '1': 'pi/4', '-1': '-pi/4', 'sqrt(3)': 'pi/3', '-sqrt(3)': '-pi/3', '(1/3)*sqrt(3)': 'pi/6', '(-1/3)*sqrt(3)': '-pi/6' }
      };
      const argument = cas(args[0]);
      if (own(values[name], argument)) return opts.angle === 'deg' ? cmul(values[name][argument], '180/pi') : values[name][argument];
    }
    if (name === 'nthRoot' || name === 'cbrt') {
      const value = scalarNumber(evaluateNode(n, Object.create(null), opts)), degree = name === 'cbrt' ? 3 : scalarNumber(evaluateNode(n.args[1], Object.create(null), opts));
      if (Number.isSafeInteger(value) && Number.isInteger(degree) && degree > 0 && degree <= 64 && zero(csub(cpow(String(value), String(degree)), cas(args[0])))) return String(value);
      const argument = scalarNumber(evaluateNode(n.args[0], Object.create(null), opts));
      if (Number.isInteger(degree) && Math.abs(degree) % 2 === 1 && argument < 0) return '(-((abs(' + args[0] + '))^(1/(' + degree + '))))';
    }
    if (opts.angle === 'deg') {
      if (DIRECT_TRIG.has(name)) args[0] = '(' + args[0] + '*pi/180)';
      if (INVERSE_TRIG.has(name) || name === 'atan2') return '(180/pi*' + name + '(' + args.join(',') + '))';
    }
    if (name === 'log' && args.length === 2) return '(log(' + args[0] + ')/log(' + args[1] + '))';
    if (name === 'log10' || name === 'log2') return '(log(' + args[0] + ')/log(' + (name === 'log10' ? 10 : 2) + '))';
    if (name === 'nthRoot' || name === 'cbrt') return '((' + args[0] + ')^(1/(' + (name === 'cbrt' ? '3' : args[1]) + ')))';
    return name + '(' + args.join(',') + ')';
  }
  function rationalArithmeticOnly(node) {
    const n = unwrap(node);
    if (n.isConstantNode) return true;
    if (!n.isOperatorNode || !['add', 'subtract', 'multiply', 'divide', 'unaryMinus', 'unaryPlus', 'pow', 'factorial'].includes(n.fn)) return false;
    if (n.fn === 'pow') { try { if (!Number.isSafeInteger(scalarNumber(evaluateNode(n.args[1], Object.create(null), optionsFor())))) return false; } catch (_) { return false; } }
    return n.args.every(rationalArithmeticOnly);
  }
  function numeric(input, normalized, opts, forcedMatrix) {
    const node = parse(normalized);
    let value = evaluateNode(node, Object.create(null), opts);
    const matrix = isMatrix(value) || containsMatrix(node) || forcedMatrix;
    const output = result(matrix ? 'matrix' : 'evaluate', matrix ? '矩阵计算' : '数值计算', input, normalized);
    output.answerText = formatValue(value, opts); output.answerLatex = valueLatex(value, opts);
    output.approximate = isMatrix(value) ? null : formatValue(value, opts);
    if (!matrix) {
      try {
        guardSymbolic(node, 'evaluate');
        const exact = cas(numericCASExpression(node, opts), 'expand');
        if (!uncomputed(exact) && !symbols(parse(exact)).length) {
          const check = evaluateNode(parse(exact), Object.create(null), Object.assign({}, opts, { angle: 'rad' }));
          if (!numericallyEqual(value, check, 1e-10) && rationalArithmeticOnly(node)) {
            value = check;
            output.approximate = formatValue(check, opts);
            output.notes.push('纯有理数运算采用精确分数结果，避免大数相减时丢失小量。');
          }
          if (numericallyEqual(value, check, 1e-10)) {
            output.exact = exact; output.answerText = exact; output.answerLatex = toLatex(exact);
          }
        }
      } catch (_) { /* Numeric-only functions still return their verified numeric value. */ }
      numericSteps(node, output, opts);
      if (!output.steps.length) step(output, '读取数值', '按指定有效数字显示结果。', output.answerLatex);
      if (value && value.isComplex) output.notes.push('结果位于复数域；i² = −1，复对数和根式采用计算库的主值。');
      if (opts.angle === 'deg') output.notes.push('三角函数参数使用角度；反三角函数返回角度。其他运算仍按通常数学定义。');
      if (!output.exact) output.notes.push('此结果为数值计算；未给出未经验证的精确形式。');
    } else {
      matrixSteps(node, value, output, opts);
      if (isMatrix(value)) {
        const rows = value.toArray();
        const body = Array.isArray(rows[0]) ? rows : [rows];
        output.table = { headers: body[0].map((_, i) => '第 ' + (i + 1) + ' 列'), rows: body.map(row => row.map(v => formatValue(v, opts))) };
      }
    }
    return output;
  }
  function containsMatrix(node) { const n = unwrap(node); return !!(n.isArrayNode || n.args && n.args.some(containsMatrix)); }
  function matrixSteps(node, value, output, opts) {
    const n = unwrap(node);
    if (n.isFunctionNode && ['det', 'inv', 'transpose'].includes(n.fn.name)) {
      const a = evaluateNode(n.args[0], Object.create(null), opts), rows = a.toArray();
      step(output, '读取矩阵', '首先计算矩阵的每个元素，并检查行列数。', valueLatex(a, opts));
      if (rows.length === 2 && rows[0].length === 2 && ['det', 'inv'].includes(n.fn.name)) {
        const [r, s] = rows;
        const determinant = math.subtract(math.multiply(r[0], s[1]), math.multiply(r[1], s[0]));
        step(output, '计算二阶行列式', '使用 ad−bc；求逆要求此行列式非零。', '(' + valueLatex(r[0], opts) + ')(' + valueLatex(s[1], opts) + ')-(' + valueLatex(r[1], opts) + ')(' + valueLatex(s[0], opts) + ')=' + valueLatex(determinant, opts));
        if (n.fn.name === 'inv') step(output, '交换对角元并取反非对角元', '将伴随矩阵除以实际计算的行列式。', '\\frac{1}{' + valueLatex(determinant, opts) + '}' + valueLatex([[s[1], math.unaryMinus(r[1])], [math.unaryMinus(s[0]), r[0]]], opts));
      }
      if (n.fn.name === 'transpose') step(output, '交换行列', '原矩阵第 i 行第 j 列的元素移到第 j 行第 i 列。', valueLatex(value, opts));
    } else if (n.isOperatorNode && n.fn === 'multiply') {
      const a = evaluateNode(n.args[0], Object.create(null), opts), b = evaluateNode(n.args[1], Object.create(null), opts);
      if (isMatrix(a) && isMatrix(b) && a.size().length === 2 && b.size().length === 2) {
        const ar = a.toArray(), br = b.toArray();
        step(output, '按行乘列', '结果的 (1,1) 元素是左矩阵第一行与右矩阵第一列的点积。', ar[0].map((v, i) => '(' + valueLatex(v, opts) + ')(' + valueLatex(br[i][0], opts) + ')').join('+') + '=' + valueLatex(value.toArray()[0][0], opts));
      }
    }
    step(output, '计算结果', '使用数学库完成矩阵运算；维数不匹配和奇异矩阵会明确报错。', valueLatex(value, opts));
    output.notes.push('矩阵最多 10×10；求逆最多 8×8。小数元素按浮点数计算。');
  }
  function derivativeExpression(expression, variable) {
    const d = cas('diff(' + expression + ',' + variable + ')');
    if (uncomputed(d)) fail('符号库未计算出此导数，不能把未执行的 diff 当作答案。');
    return d;
  }
  function derivativeSteps(node, variable, opts, output) {
    let count = 0;
    function visit(n) {
      n = unwrap(n);
      if (!hasVariable(n, variable) || count >= 8) return;
      if (n.args) n.args.forEach(visit);
      if (count >= 8) return;
      let title, explanation;
      if (n.isOperatorNode && ['add', 'subtract'].includes(n.fn)) { title = '逐项求导'; explanation = '和与差分别求导，再按原符号组合。'; }
      if (n.isOperatorNode && n.fn === 'multiply' && n.args.every(a => hasVariable(a, variable))) { title = '乘积法则'; explanation = '两个因子都含变量，使用 (uv)′=u′v+uv′。'; }
      if (n.isOperatorNode && n.fn === 'divide' && hasVariable(n.args[1], variable)) { title = '商法则'; explanation = '使用 (u/v)′=(u′v−uv′)/v²，要求原分母非零。'; }
      if (n.isOperatorNode && n.fn === 'pow') { title = '幂与链式法则'; explanation = '按实际指数求导；复合底数的导数作为链式因子。'; }
      if (n.isFunctionNode && hasVariable(n, variable)) { title = hasVariable(n.args[0], variable) && plain(n.args[0]) !== variable ? '函数的链式法则' : '基本函数求导'; explanation = '计算外层函数导数，并乘以内部表达式的导数。'; }
      if (title) {
        try {
          const before = plain(n, opts), after = derivativeExpression(before, variable);
          step(output, title, explanation, '\\frac{d}{d' + variable + '}\\left(' + toLatex(before) + '\\right)=' + toLatex(after)); count++;
        } catch (_) { /* No unavailable derivation is presented as a worked step. */ }
      }
    }
    visit(node);
  }
  function derivative(input, normalized, opts) {
    const node = parse(normalized); guardSymbolic(node, 'derivative');
    const output = result('derivative', opts.order === 1 ? '导数' : opts.order + ' 阶导数', input, normalized);
    let answer = plain(node, opts);
    derivativeSteps(node, opts.variable, opts, output);
    for (let order = 1; order <= opts.order; order++) {
      answer = derivativeExpression(answer, opts.variable);
      if (order > 1) step(output, '第 ' + order + ' 次求导', '对上一阶导数继续求导。', 'f^{(' + order + ')}(' + opts.variable + ')=' + toLatex(answer));
    }
    output.exact = answer; output.answerText = answer; output.answerLatex = toLatex(answer);
    if (!output.steps.length) step(output, '变量与常数', '关于 ' + opts.variable + ' 求导；不含此变量的量视作常数。', output.answerLatex);
    domainNotes(node, output, opts.variable);
    if (opts.angle === 'deg') output.notes.push('已在符号求导前把三角函数参数乘以 π/180，反三角函数结果乘以 180/π。');
    const params = symbols(node).filter(v => v !== opts.variable);
    if (params.length) { output.parameters = params; output.notes.push(params.join('、') + ' 在求导时作为常参数。'); }
    addGraph(output, normalized, '原函数', opts);
    addGraph(output, answer, opts.order + ' 阶导数', opts, true);
    output.related.push({ label: '再求一次导数', input: opts.angle === 'deg' ? plain(parse(answer), opts, null, true) : answer, mode: 'derivative' });
    return output;
  }

  function integralPrinciples(node, variable, opts, output) {
    const n = unwrap(node);
    try {
      const r = rational(n, variable, opts);
      if (r.den.length === 1) {
        r.num.forEach((coefficient, power) => {
          if (coefficient === '0' || output.steps.length >= 6) return;
          const c = cdiv(coefficient, r.den[0]);
          const primitive = cmul(cdiv(c, String(power + 1)), power + 1 === 1 ? variable : variable + '^' + (power + 1));
          step(output, '幂函数积分', '对 ' + c + '·' + variable + '^' + power + ' 使用幂次加一再除以新幂次；常系数提出积分号。', '\\int ' + toLatex(cmul(c, power === 0 ? '1' : variable + '^' + power)) + '\\,d' + variable + '=' + toLatex(primitive));
        });
        return;
      }
    } catch (_) { /* Continue with structural principles when not polynomial. */ }
    if (n.isOperatorNode && ['add', 'subtract'].includes(n.fn)) step(output, '积分的线性性质', '和或差可逐项积分，常数倍可提出积分号。', '\\int(f+g)\\,d' + variable + '=\\int f\\,d' + variable + '+\\int g\\,d' + variable);
    if (n.isFunctionNode && ['sin', 'cos', 'exp'].includes(n.fn.name)) {
      try {
        const inner = rational(n.args[0], variable, opts);
        if (inner.den.length === 1 && inner.num.length === 2) {
          const slope = cdiv(inner.num[1], inner.den[0]);
          if (!zero(slope)) step(output, '线性代换', '令 u 等于内部线性表达式，du 为常数倍的 d' + variable + '。', 'u=' + toLatex(plain(n.args[0], opts)) + ',\\quad du=(' + toLatex(slope) + ')\\,d' + variable);
        }
      } catch (_) { /* Do not claim a substitution that was not established. */ }
    }
    if (n.isOperatorNode && n.fn === 'multiply') {
      const args = n.args.map(unwrap), power = args.find(a => a.isSymbolNode && a.name === variable);
      const exponential = args.find(a => a.isFunctionNode && a.fn.name === 'exp' && plain(a.args[0]) === variable);
      if (power && exponential) step(output, '分部积分', '取 u=' + variable + '、dv=e^' + variable + 'd' + variable + '，于是 du=d' + variable + '、v=e^' + variable + '。', '\\int ' + variable + 'e^{' + variable + '}\\,d' + variable + '=' + variable + 'e^{' + variable + '}-\\int e^{' + variable + '}\\,d' + variable);
    }
  }
  function numericIntegral(node, variable, lower, upper, opts) {
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) fail('数值积分回退仅支持有限上下限；无穷区间需能计算的符号原函数。');
    if (lower === upper) return { value: 0, error: 0, evaluations: 0 };
    const sign = lower < upper ? 1 : -1, a = Math.min(lower, upper), b = Math.max(lower, upper);
    let evaluations = 0;
    const scope = Object.create(null);
    function f(x) {
      if (++evaluations > LIMITS.quadrature) fail('数值积分未在 4097 次采样内收敛，可能有奇点或剧烈振荡；请拆分区间。');
      scope[variable] = x;
      const y = scalarNumber(evaluateNode(node, scope, opts, { left: 1600 }));
      if (!Number.isFinite(y)) fail('数值积分区间内出现非实数或无定义值，请检查定义域。');
      return y;
    }
    const fa = f(a), fb = f(b), middle = a + (b - a) / 2, fm = f(middle);
    const initial = (b - a) * (fa + 4 * fm + fb) / 6;
    const tolerance = Math.pow(10, -Math.min(opts.precision, 9)) * Math.max(1, Math.abs(initial));
    let errorEstimate = 0;
    function adaptive(left, right, fl, fc, fr, whole, tol, depth) {
      const center = left + (right - left) / 2;
      const q1 = left + (center - left) / 2, q3 = center + (right - center) / 2;
      const f1 = f(q1), f3 = f(q3);
      const first = (center - left) * (fl + 4 * f1 + fc) / 6, second = (right - center) * (fc + 4 * f3 + fr) / 6;
      const delta = first + second - whole;
      if (Math.abs(delta) <= 15 * tol) { errorEstimate += Math.abs(delta) / 15; return first + second + delta / 15; }
      if (depth >= 18) fail('数值积分在最大细分深度仍未收敛，不能保证精度。');
      return adaptive(left, center, fl, f1, fc, first, tol / 2, depth + 1) + adaptive(center, right, fc, f3, fr, second, tol / 2, depth + 1);
    }
    // Seed several panels to avoid the classic Simpson aliasing of periodic functions.
    const panels = 8;
    let value = 0;
    for (let i = 0; i < panels; i++) {
      const left = a + (b - a) * i / panels, right = a + (b - a) * (i + 1) / panels;
      const center = left + (right - left) / 2, fl = f(left), fc = f(center), fr = f(right);
      const whole = (right - left) * (fl + 4 * fc + fr) / 6;
      value += adaptive(left, right, fl, fc, fr, whole, tolerance / panels, 0);
    }
    if (!Number.isFinite(value)) fail('积分结果超出有限范围。');
    return { value: sign * value, error: errorEstimate, evaluations };
  }
  function checkIntegrationDomain(node, variable, lower, upper, opts, output) {
    const a = Math.min(lower, upper), b = Math.max(lower, upper);
    try {
      const r = rational(node, variable, opts);
      const poles = domainRoots(r, variable, opts).filter(v => v.real && v._value >= a - 1e-12 && v._value <= b + 1e-12);
      if (poles.length) fail('积分区间含原分母零点 ' + poles.map(p => p.exact).join('、') + '，需分段讨论广义积分；这里不把柯西主值当作普通定积分。');
    } catch (error) { if (/分母零点|分母恒/.test(error.message)) throw error; }
    const scope = Object.create(null);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      for (let k = 1; k < 17; k++) {
        scope[variable] = a + (b - a) * k / 17;
        let value;
        try { value = scalarNumber(evaluateNode(node, scope, opts)); } catch (_) { fail('积分区间内存在无定义值，需先检查并拆分定义域。'); }
        if (!Number.isFinite(value)) fail('此定积分要求区间内的被积函数为实值；当前区间产生了复数。');
      }
      output.notes.push('已检查有理式分母零点及有限采样的实数定义域；一般函数的连续性仍应结合原式定义域判断。');
    }
  }
  function substitution(expression, variable, value) { const replacements = Object.create(null); replacements[variable] = value; return plain(parse(expression), null, replacements); }
  function primitiveAt(primitive, variable, pointText, side, opts) {
    const point = constantValue(pointText, opts, true);
    if (!Number.isFinite(point)) {
      const text = safeLimitCAS(primitive, variable, point > 0 ? 'Infinity' : '-Infinity', side, opts);
      if (!text || uncomputed(text)) fail('无法求出原函数在无穷端点的极限。');
      return text;
    }
    const replaced = substitution(primitive, variable, normalize(pointText));
    try {
      const text = cas(replaced, 'simplify');
      const value = evaluateNode(parse(text), Object.create(null), Object.assign({}, opts, { angle: 'rad' }));
      if (Number.isFinite(scalarNumber(value))) return text;
    } catch (_) { /* Some integrable endpoints need a one-sided primitive limit. */ }
    const text = safeLimitCAS(primitive, variable, normalize(pointText), side, opts);
    if (!text || uncomputed(text)) fail('原函数的端点极限未求出，暂不能用基本定理计算。');
    return text;
  }
  function integral(input, normalized, opts) {
    const node = parse(normalized); guardSymbolic(node, 'integral');
    const definite = opts.lower !== '' || opts.upper !== '';
    if (definite && (opts.lower === '' || opts.upper === '')) fail('定积分需要同时填写下限和上限。');
    const params = symbols(node).filter(v => v !== opts.variable);
    const output = result('integral', definite ? '定积分' : '不定积分', input, normalized);
    if (params.length) output.parameters = params;
    domainNotes(node, output, opts.variable);
    const expression = plain(node, opts);
    let primitive = null;
    try { const text = cas('integrate(' + expression + ',' + opts.variable + ')'); if (!uncomputed(text)) primitive = text; }
    catch (_) { /* A definite integral can still use the bounded numeric fallback. */ }
    if (primitive) {
      let verified = false;
      try { verified = zero(csub(derivativeExpression(primitive, opts.variable), expression)); } catch (_) { /* Record uncertainty below. */ }
      if (verified) {
        integralPrinciples(node, opts.variable, opts, output);
        step(output, '求出原函数并求导检查', '对下面的原函数求导，符号化简后精确还原被积函数。', 'F(' + opts.variable + ')=' + toLatex(primitive) + ',\\quad F\'(' + opts.variable + ')=' + toLatex(expression));
      } else output.notes.push('符号库给出了候选原函数，但本次未能完整验证其导数；请结合定义域检查。');
    }
    if (!definite) {
      if (!primitive) {
        output.answerText = '暂未求出符号原函数；可填写有限上下限尝试数值积分';
        output.answerLatex = '\\int ' + toLatex(expression) + '\\,d' + opts.variable;
        output.notes.push('符号库返回了未执行的积分或未得到有效结果；此处保留积分记号，不冒充已求出。');
        step(output, '符号积分尚未完成', '当前计算库未得到可验证的闭式原函数。', output.answerLatex);
      } else {
        output.exact = primitive;
        output.answerText = primitive + ' + C'; output.answerLatex = toLatex(primitive) + '+C';
        if (primitive === 'log(' + opts.variable + ')' && expression.replace(/[()]/g, '') === '1/' + opts.variable) {
          output.answerText = 'log(abs(' + opts.variable + ')) + C';
          output.answerLatex = '\\ln\\left|' + opts.variable + '\\right|+C';
          output.exact = 'log(abs(' + opts.variable + '))';
          output.notes.push('在实数域分别取 x>0 与 x<0 的区间，原函数为 ln|x|+C；不能跨过 x=0。');
        }
        output.notes.push('C 为任意积分常数；原函数在各个连通的定义域区间分别成立。');
        addGraph(output, primitive, '原函数（C=0）', opts, true);
      }
    } else {
      if (params.length) fail('定积分的数值校验要求参数已确定；可先求符号不定积分。');
      const lower = constantValue(opts.lower, opts, true), upper = constantValue(opts.upper, opts, true);
      checkIntegrationDomain(node, opts.variable, lower, upper, opts, output);
      let exact = null;
      if (lower === upper && Number.isFinite(lower)) exact = '0';
      else if (primitive) {
        try {
          const lo = primitiveAt(primitive, opts.variable, opts.lower, lower < upper ? 'right' : 'left', opts);
          const hi = primitiveAt(primitive, opts.variable, opts.upper, lower < upper ? 'left' : 'right', opts);
          if (/Infinity/.test(lo) || /Infinity/.test(hi)) fail('广义积分端点的原函数发散，不能相减无穷大。');
          exact = cas('(' + hi + ')-(' + lo + ')', 'simplify');
          if (uncomputed(exact)) exact = null;
          else step(output, '代入上下限', '在区间满足定义域且原函数端点极限存在时，使用 F(上限)−F(下限)。', '\\left[F(' + opts.variable + ')\\right]_{' + toLatex(opts.lower) + '}^{' + toLatex(opts.upper) + '}=(' + toLatex(hi) + ')-(' + toLatex(lo) + ')=' + toLatex(exact));
        } catch (error) { if (/发散/.test(error.message)) throw error; output.notes.push('符号端点计算未完成，尝试有限区间的数值积分。'); }
      }
      if (exact) {
        const value = evaluateNode(parse(exact), Object.create(null), Object.assign({}, opts, { angle: 'rad' }));
        if (!Number.isFinite(scalarNumber(value))) fail('定积分未得到有限实数结果。');
        output.exact = exact; output.answerText = exact; output.answerLatex = toLatex(exact); output.approximate = formatValue(value, opts);
      } else {
        const approximation = numericIntegral(node, opts.variable, lower, upper, opts);
        output.answerText = '≈ ' + formatNumber(approximation.value, opts.precision);
        output.answerLatex = '\\approx ' + valueLatex(approximation.value, opts);
        output.approximate = formatNumber(approximation.value, opts.precision);
        step(output, '自适应数值积分', '采用分面自适应 Simpson 法，实际采样 ' + approximation.evaluations + ' 次；误差估计约 ' + formatNumber(approximation.error, 3) + '。', '\\int_{' + toLatex(opts.lower) + '}^{' + toLatex(opts.upper) + '}' + toLatex(expression) + '\\,d' + opts.variable + output.answerLatex);
        output.notes.push('这是有限精度的数值近似；误差估计适用于本次细分采样，不能作为任意函数的严格误差证明。');
      }
    }
    addGraph(output, normalized, '被积函数', opts);
    if (opts.angle === 'deg') output.notes.push('三角函数的角度参数已在积分前换算为弧度，原函数包含相应的 180/π 因子。');
    return output;
  }

  function binomial(n, k) { let v = 1; for (let i = 1; i <= k; i++) v = v * (n - i + 1) / i; return Math.round(v); }
  function localLeading(p, pointText) {
    for (let order = 0; order < p.length; order++) {
      let c = '0';
      for (let i = order; i < p.length; i++) {
        if (p[i] === '0') continue;
        c = cadd(c, cmul(cmul(p[i], String(binomial(i, order))), i === order ? '1' : cpow(pointText, String(i - order))));
      }
      c = cas(c, 'simplify');
      if (!zero(c)) return { order, coefficient: c };
    }
    return { order: Infinity, coefficient: '0' };
  }
  function rationalLimit(r, pointText, direction, opts) {
    const point = constantValue(pointText, Object.assign({}, opts, { angle: 'rad' }), true);
    let numerator, denominator;
    if (!Number.isFinite(point)) {
      const n = ptrim(r.num.slice()), d = ptrim(r.den.slice());
      if (d.length === 1 && zero(d[0])) fail('分母恒为零，极限无定义。');
      if (n.length === 1 && zero(n[0])) return '0';
      const difference = n.length - d.length;
      const ratio = cdiv(n[n.length - 1], d[d.length - 1]);
      if (difference < 0) return '0';
      if (difference === 0) return ratio;
      const sign = Math.sign(constantValue(ratio, Object.assign({}, opts, { angle: 'rad' }))) * (point < 0 && difference % 2 ? -1 : 1);
      return sign > 0 ? 'Infinity' : '-Infinity';
    }
    numerator = localLeading(r.num, pointText); denominator = localLeading(r.den, pointText);
    if (denominator.order === Infinity) fail('分母恒为零，极限无定义。');
    if (numerator.order === Infinity || numerator.order > denominator.order) return '0';
    const ratio = cdiv(numerator.coefficient, denominator.coefficient), power = numerator.order - denominator.order;
    if (power === 0) return ratio;
    const sign = Math.sign(constantValue(ratio, Object.assign({}, opts, { angle: 'rad' })));
    const right = sign > 0 ? 'Infinity' : '-Infinity';
    const left = Math.abs(power) % 2 ? (right === 'Infinity' ? '-Infinity' : 'Infinity') : right;
    return direction === 'left' ? left : direction === 'right' ? right : left === right ? right : null;
  }
  function rationalSideSign(node, variable, pointText, direction, opts) {
    const r = rational(node, variable, opts), point = constantValue(pointText, opts, true);
    if (!Number.isFinite(point)) {
      const ratio = cdiv(r.num[r.num.length - 1], r.den[r.den.length - 1]);
      return Math.sign(constantValue(ratio, opts)) * (point < 0 && Math.abs(r.num.length - r.den.length) % 2 ? -1 : 1);
    }
    const n = localLeading(r.num, pointText), d = localLeading(r.den, pointText);
    if (n.order === Infinity) return 0;
    const coefficient = cdiv(n.coefficient, d.coefficient);
    return Math.sign(constantValue(coefficient, opts)) * (direction === 'left' && Math.abs(n.order - d.order) % 2 ? -1 : 1);
  }
  function resolveLimitPieces(node, variable, pointText, direction, opts) {
    const n = unwrap(node);
    if (n.isFunctionNode && ['abs', 'sign', 'floor', 'ceil'].includes(n.fn.name) && hasVariable(n, variable)) {
      if (direction === 'both') fail('分段函数的极限需要分别计算左右方向。');
      if (['abs', 'sign'].includes(n.fn.name)) {
        const sign = rationalSideSign(n.args[0], variable, pointText, direction, opts);
        if (n.fn.name === 'sign') return String(sign);
        return sign < 0 ? '-(' + resolveLimitPieces(n.args[0], variable, pointText, direction, opts) + ')' : resolveLimitPieces(n.args[0], variable, pointText, direction, opts);
      }
      const r = rational(n.args[0], variable, opts), value = rationalLimit(r, pointText, direction, opts);
      if (value === null || /Infinity/.test(value)) fail('暂不支持此取整函数在无穷端点的极限。');
      const numeric = constantValue(value, opts);
      if (!Number.isInteger(numeric)) return String(n.fn.name === 'floor' ? Math.floor(numeric) : Math.ceil(numeric));
      const shifted = parse('(' + plain(n.args[0]) + ')-(' + value + ')');
      const sign = rationalSideSign(shifted, variable, pointText, direction, opts);
      return String(n.fn.name === 'floor' ? numeric - (sign < 0 ? 1 : 0) : numeric + (sign > 0 ? 1 : 0));
    }
    if (n.isOperatorNode) {
      const args = n.args.map(a => resolveLimitPieces(a, variable, pointText, direction, opts));
      return operatorExpression(n, args);
    }
    if (n.isFunctionNode) return n.fn.name + '(' + n.args.map(a => resolveLimitPieces(a, variable, pointText, direction, opts)).join(',') + ')';
    return plain(n);
  }
  function elementaryLimit(node, variable, pointText, direction, opts, depth) {
    if ((depth || 0) > 14) return null;
    const n = unwrap(node);
    try { return rationalLimit(rational(n, variable, opts), pointText, direction, opts); } catch (_) { /* Only supported elementary continuations follow. */ }
    if (n.isFunctionNode && n.args.length === 1) {
      const name = n.fn.name, argument = elementaryLimit(n.args[0], variable, pointText, direction, opts, (depth || 0) + 1);
      if (argument === null) return null;
      if (argument === 'Infinity' || argument === '-Infinity') {
        if (['sqrt', 'log', 'log2', 'log10'].includes(name) && argument === 'Infinity') return 'Infinity';
        if (name === 'exp') return argument === 'Infinity' ? 'Infinity' : '0';
        if (name === 'atan') return argument === 'Infinity' ? '(1/2)*pi' : '(-1/2)*pi';
        if (['tanh', 'erf'].includes(name)) return argument === 'Infinity' ? '1' : '-1';
        return null;
      }
      if (['log', 'log2', 'log10'].includes(name) && zero(argument)) return '-Infinity';
      if (name === 'sqrt' && zero(argument)) return '0';
      if (['sin', 'cos', 'exp', 'sqrt', 'log', 'log2', 'log10', 'atan', 'sinh', 'cosh', 'tanh', 'erf'].includes(name)) return safeArithmetic(name + '(' + argument + ')');
      return null;
    }
    if (n.isOperatorNode && ['add', 'subtract', 'multiply', 'divide', 'unaryMinus', 'unaryPlus'].includes(n.fn)) {
      const values = n.args.map(a => elementaryLimit(a, variable, pointText, direction, opts, (depth || 0) + 1));
      if (values.some(v => v === null)) return null;
      if (n.fn === 'unaryPlus') return values[0];
      if (n.fn === 'unaryMinus') return values[0] === 'Infinity' ? '-Infinity' : values[0] === '-Infinity' ? 'Infinity' : cneg(values[0]);
      const [a, b] = values, ai = /Infinity/.test(a), bi = /Infinity/.test(b);
      if (!ai && !bi) {
        if (n.fn === 'divide' && zero(b)) return null;
        return ({ add: cadd, subtract: csub, multiply: cmul, divide: cdiv })[n.fn](a, b);
      }
      if (['add', 'subtract'].includes(n.fn)) {
        const effectiveB = n.fn === 'subtract' ? b === 'Infinity' ? '-Infinity' : b === '-Infinity' ? 'Infinity' : b : b;
        if (ai && bi && a !== effectiveB) return null;
        return ai ? a : effectiveB;
      }
      if (n.fn === 'divide' && !ai && bi) return '0';
      if (ai && bi || n.fn === 'divide' && bi) return null;
      const finite = ai ? b : a;
      if (zero(finite)) return null;
      const finiteSign = Math.sign(constantValue(finite, opts)), infinity = ai ? a : b;
      return finiteSign < 0 ? infinity === 'Infinity' ? '-Infinity' : 'Infinity' : infinity;
    }
    return null;
  }
  function safeLimitCAS(expression, variable, pointText, direction, opts) {
    const node = parse(expression);
    try { const known = elementaryLimit(node, variable, pointText, direction, Object.assign({}, opts, { angle: 'rad' })); if (known !== null) return known; } catch (_) { /* Guarded CAS is a final fallback. */ }
    let unsafe = false;
    function visit(n) {
      n = unwrap(n);
      if (n.isFunctionNode && ['abs', 'sign', 'floor', 'ceil', 'round', 'trunc', 'mod', 'gamma', 'factorial', 'sum', 'prod', 'product'].includes(n.fn.name) && hasVariable(n, variable)) unsafe = true;
      if (n.args) n.args.forEach(visit);
    }
    visit(node);
    if (unsafe) return null;
    let argument = expression, target = variable, point = pointText;
    if (direction !== 'both' && !/Infinity/.test(pointText)) {
      target = 'zzlimit';
      if (symbols(node).includes(target)) return null;
      argument = substitution(expression, variable, '(' + pointText + ')' + (direction === 'left' ? '-' : '+') + '1/' + target);
      point = 'Infinity';
    }
    try {
      const text = cas('limit(' + argument + ',' + target + ',' + point + ')');
      return uncomputed(text) || symbols(parse(text)).some(v => v === variable || v === target) ? null : text;
    } catch (_) { return null; }
  }
  function analyticAt(node, variable, pointText, opts) {
    const scope = Object.create(null); scope[variable] = constantValue(pointText, opts);
    let valid = true;
    function visit(n) {
      n = unwrap(n);
      if (n.isFunctionNode) {
        const name = n.fn.name;
        if (['abs', 'sign', 'floor', 'ceil', 'round', 'trunc', 'gamma', 'factorial', 'sum', 'prod', 'product', 'mod'].includes(name)) valid = false;
        let arg;
        try { arg = scalarNumber(evaluateNode(n.args[0], scope, opts)); } catch (_) { valid = false; return; }
        if (['log', 'log2', 'log10', 'sqrt', 'nthRoot', 'cbrt'].includes(name) && !(arg > 0)) valid = false;
        if (['asin', 'acos'].includes(name) && !(Math.abs(arg) < 1)) valid = false;
        if (['tan', 'sec'].includes(name) && Math.abs(Math.cos(arg)) < 1e-14) valid = false;
        if (['cot', 'csc'].includes(name) && Math.abs(Math.sin(arg)) < 1e-14) valid = false;
      }
      if (n.isOperatorNode && n.fn === 'pow') {
        try {
          const exponent = scalarNumber(evaluateNode(n.args[1], scope, opts));
          if ((!Number.isInteger(exponent) || hasVariable(n.args[1], variable)) && !(scalarNumber(evaluateNode(n.args[0], scope, opts)) > 0)) valid = false;
        } catch (_) { valid = false; }
      }
      if (n.args) n.args.forEach(visit);
    }
    visit(node);
    try { if (!Number.isFinite(scalarNumber(evaluateNode(node, scope, opts)))) valid = false; } catch (_) { valid = false; }
    return valid;
  }
  function analyticLeading(expression, variable, pointText) {
    let current = expression;
    for (let order = 0; order <= 5; order++) {
      const value = cas(substitution(current, variable, pointText));
      if (!zero(value)) {
        let factorial = 1; for (let k = 2; k <= order; k++) factorial *= k;
        return { order, coefficient: cdiv(value, String(factorial)) };
      }
      current = derivativeExpression(current, variable);
      if (current === '0') return { order: Infinity, coefficient: '0' };
    }
    return null;
  }
  function analyticLimit(node, variable, pointText, direction, opts) {
    const n = unwrap(node);
    if (/Infinity/.test(pointText)) return null;
    if (analyticAt(n, variable, pointText, opts)) return { value: cas(substitution(plain(n), variable, pointText)), numerator: null, denominator: null };
    if (!n.isOperatorNode || n.fn !== 'divide' || !n.args.every(a => analyticAt(a, variable, pointText, opts))) return null;
    const numerator = analyticLeading(plain(n.args[0]), variable, pointText), denominator = analyticLeading(plain(n.args[1]), variable, pointText);
    if (!numerator || !denominator || denominator.order === Infinity) return null;
    let value;
    if (numerator.order === Infinity || numerator.order > denominator.order) value = '0';
    else {
      const ratio = cdiv(numerator.coefficient, denominator.coefficient), power = numerator.order - denominator.order;
      if (power === 0) value = ratio;
      else {
        const sign = Math.sign(constantValue(ratio, opts)) * (direction === 'left' && Math.abs(power) % 2 ? -1 : 1);
        value = sign > 0 ? 'Infinity' : '-Infinity';
      }
    }
    return { value, numerator, denominator };
  }
  function realLimitDomain(node, variable, pointText, side, opts) {
    let valid = true;
    function visit(n) {
      n = unwrap(n);
      if (n.isFunctionNode && ['sqrt', 'log', 'log10', 'log2', 'asin', 'acos'].includes(n.fn.name)) {
        try {
          const r = rational(n.args[0], variable, opts), at = rationalLimit(r, pointText, side, opts);
          if (at && !/Infinity/.test(at)) {
            const value = constantValue(at, opts), name = n.fn.name;
            if (['sqrt', 'log', 'log10', 'log2'].includes(name)) {
              if (value < 0 || value === 0 && rationalSideSign(n.args[0], variable, pointText, side, opts) < (name === 'sqrt' ? 0 : 1)) valid = false;
            } else {
              if (Math.abs(value) > 1) valid = false;
              if (value === 1 && rationalSideSign(parse('(' + plain(n.args[0]) + ')-1'), variable, pointText, side, opts) > 0) valid = false;
              if (value === -1 && rationalSideSign(parse('(' + plain(n.args[0]) + ')+1'), variable, pointText, side, opts) < 0) valid = false;
            }
          }
        } catch (_) { /* An unknown domain is not inferred from finite samples. */ }
      }
      if (n.args) n.args.forEach(visit);
    }
    visit(node); return valid;
  }
  function directOscillation(node, variable, pointText, opts) {
    const n = unwrap(node);
    if (!n.isFunctionNode || !['sin', 'cos'].includes(n.fn.name)) return false;
    try {
      const r = rational(n.args[0], variable, opts);
      const left = rationalLimit(r, pointText, 'left', opts), right = rationalLimit(r, pointText, 'right', opts);
      return /Infinity/.test(String(left)) || /Infinity/.test(String(right));
    } catch (_) { return false; }
  }
  function limit(input, normalized, opts) {
    const node = parse(normalized); guardSymbolic(node, 'limit');
    const output = result('limit', '极限', input, normalized), expression = plain(node, opts), pointText = normalize(opts.point || '0');
    constantValue(pointText, Object.assign({}, opts, { angle: 'rad' }), true);
    const params = symbols(node).filter(v => v !== opts.variable);
    if (params.length) output.parameters = params;
    let answer = null, computed = false, left = null, right = null;
    const sides = opts.direction === 'both' ? ['left', 'right'] : [opts.direction];
    const directed = {}, radOpts = Object.assign({}, opts, { angle: 'rad' });
    const missingSides = sides.filter(side => !realLimitDomain(parse(expression), opts.variable, pointText, side, radOpts));
    if (missingSides.length) {
      output.answerText = opts.direction === 'both' ? '实数双侧极限不存在（' + missingSides.map(s => s === 'left' ? '左侧' : '右侧').join('、') + '无定义域邻点）' : '此方向没有实数定义域邻点';
      output.answerLatex = '\\text{此方向的实极限不存在}';
      output.notes.push('采用实轴左右两侧均可趋近的双侧约定；只有单侧定义域时，请选择可趋近的方向。');
      addGraph(output, normalized, '原函数', opts);
      return output;
    }
    let analyticDetails = null, rationalOriginal = null;
    try { rationalOriginal = rational(parse(expression), opts.variable, Object.assign({}, opts, { angle: 'rad' })); } catch (_) { /* Handle safe transcendental and piecewise expressions below. */ }
    if (rationalOriginal) {
      for (const side of sides) directed[side] = rationalLimit(rationalOriginal, pointText, side, opts);
      computed = true;
      step(output, '比较首个非零项', '有限点比较分子、分母在极限点的首个非零幂；无穷远比较最高次项，保留左右符号。', '\\frac{' + toLatex(polynomialText(rationalOriginal.num, opts.variable)) + '}{' + toLatex(polynomialText(rationalOriginal.den, opts.variable)) + '}');
    } else if (directOscillation(parse(expression), opts.variable, pointText, opts)) {
      computed = true; output.notes.push('三角函数的内部有理式趋于无穷大，函数持续振荡，极限不存在。');
    } else {
      const pieces = /\b(?:abs|sign|floor|ceil)\(/.test(expression);
      for (const side of sides) {
        let piece;
        try { piece = pieces ? resolveLimitPieces(parse(expression), opts.variable, pointText, side, Object.assign({}, opts, { angle: 'rad' })) : expression; }
        catch (_) { directed[side] = null; continue; }
        try {
          const r = rational(parse(piece), opts.variable, Object.assign({}, opts, { angle: 'rad' }));
          directed[side] = rationalLimit(r, pointText, side, opts);
        } catch (_) {
          let analytic = null;
          try { analytic = analyticLimit(parse(piece), opts.variable, pointText, side, radOpts); } catch (_) { /* CAS fallback below is still bounded by structural guards. */ }
          if (analytic) { directed[side] = analytic.value; analyticDetails = analytic; }
          else {
            // A common analytic two-sided limit is cheaper and safer than introducing 1/t.
            directed[side] = safeLimitCAS(piece, opts.variable, pointText, opts.direction === 'both' && !pieces ? 'both' : side, opts);
          }
        }
      }
      computed = sides.every(side => directed[side] !== null);
      if (pieces && computed) step(output, '按趋近方向处理分段函数', '先由内部有理式的局部符号确定 abs、sign 或取整函数的分支，再求每侧极限。', toLatex(expression));
      if (analyticDetails && analyticDetails.numerator && analyticDetails.denominator) {
        const a = analyticDetails.numerator, b = analyticDetails.denominator;
        step(output, '计算局部首个非零项', '在解析函数的定义域内，逐阶求导得到实际的局部系数，再比较消失阶数；最多检查五阶。', 'f(' + opts.variable + ')\\sim (' + toLatex(a.coefficient) + ')(' + opts.variable + '-' + toLatex(pointText) + ')^{' + a.order + '},\\quad g(' + opts.variable + ')\\sim (' + toLatex(b.coefficient) + ')(' + opts.variable + '-' + toLatex(pointText) + ')^{' + b.order + '}');
      }
    }
    left = directed.left; right = directed.right;
    if (computed && (left != null || right != null)) answer = opts.direction === 'left' ? left : opts.direction === 'right' ? right : left === right || left && right && !/Infinity/.test(left + right) && zero(csub(left, right)) ? left : null;
    const decoration = opts.direction === 'left' ? '^-' : opts.direction === 'right' ? '^+' : '';
    const limitLatex = '\\lim_{' + opts.variable + '\\to ' + toLatex(pointText) + decoration + '}' + toLatex(expression);
    if (computed && answer === null) {
      output.answerText = '极限不存在' + (left != null && right != null ? '（左右极限不同）' : '（持续振荡）');
      output.answerLatex = '\\text{极限不存在}';
      if (left != null && right != null) step(output, '比较左右极限', '只有左右极限相同，双侧极限才存在。', '\\lim_{' + opts.variable + '\\to ' + toLatex(pointText) + '^-}f=' + toLatex(left) + ',\\quad\\lim_{' + opts.variable + '\\to ' + toLatex(pointText) + '^+}f=' + toLatex(right));
    } else if (answer !== null) {
      output.exact = answer; output.answerText = answer === 'Infinity' ? '+∞' : answer === '-Infinity' ? '-∞' : answer;
      output.answerLatex = toLatex(answer);
      if (!/Infinity/.test(answer)) {
        try { output.approximate = formatValue(evaluateNode(parse(answer), Object.create(null), Object.assign({}, opts, { angle: 'rad' })), opts); } catch (_) { /* Parameter-dependent limits need no guessed numeric value. */ }
      }
      step(output, '极限结果', '已执行符号或局部有理式分析；极限值不要求原函数在该点有定义。', limitLatex + '=' + output.answerLatex);
    } else {
      output.answerText = '暂未可靠求出此极限'; output.answerLatex = limitLatex;
      output.notes.push('符号库未完成计算，或分段/振荡结构超出受限分析范围；这里保留极限记号，不用数值采样猜测精确极限。');
    }
    addGraph(output, normalized, '原函数', opts);
    if (opts.angle === 'deg') output.notes.push('角度模式已作用于整个函数；例如 sin(x)/x 在 x→0 时趋于 π/180。');
    return output;
  }

  function medianOf(sorted) { const n = sorted.length; return n % 2 ? sorted[(n - 1) / 2] : sorted[n / 2 - 1] / 2 + sorted[n / 2] / 2; }
  function statistics(input, normalized, opts) {
    let data;
    const parts = splitTop(normalized, ',');
    const list = parts.length === 1 ? unwrap(parse(normalized)) : null;
    if (list && list.isArrayNode) {
      if (list.items.some(item => unwrap(item).isArrayNode)) fail('描述统计需要一维数据列表；二维数据请使用矩阵模式。');
      data = list.items.map(item => evaluateNode(item, Object.create(null), opts));
    } else {
      if (parts.some(p => !p)) fail('数据列表中的每个逗号之间都需要数值。');
      if (parts.length > LIMITS.data) fail('描述统计最多支持 256 个数据。');
      data = parts.map(p => evaluateNode(parse(p), Object.create(null), opts));
    }
    if (!data.length || data.length > LIMITS.data) fail('描述统计需要 1 到 256 个有限实数。');
    const values = data.map(v => { const n = scalarNumber(v); if (!Number.isFinite(n)) fail('描述统计只支持有限实数，不能包含复数或未赋值变量。'); return n; });
    const sorted = values.slice().sort((a, b) => a - b), count = values.length;
    let sum = 0, correction = 0, mean = 0, m2 = 0;
    values.forEach((x, i) => {
      const y = x - correction, next = sum + y; correction = (next - sum) - y; sum = next;
      const delta = x - mean; mean += delta / (i + 1); m2 += delta * (x - mean);
    });
    if (![sum, mean, m2].every(Number.isFinite)) fail('数据尺度过大，统计结果超出浮点数范围。');
    const variance = Math.max(0, m2 / count), sampleVariance = count > 1 ? Math.max(0, m2 / (count - 1)) : null;
    const median = medianOf(sorted), middle = Math.floor(count / 2);
    const q1 = count === 1 ? sorted[0] : medianOf(sorted.slice(0, middle));
    const q3 = count === 1 ? sorted[0] : medianOf(sorted.slice(count % 2 ? middle + 1 : middle));
    const frequencies = new Map(); values.forEach(x => frequencies.set(x, (frequencies.get(x) || 0) + 1));
    const maxFrequency = Math.max(...frequencies.values()), modes = Array.from(frequencies).filter(pair => pair[1] === maxFrequency).map(pair => pair[0]).sort((a, b) => a - b);
    const modeText = maxFrequency === 1 ? '无众数（各值仅出现一次）' : modes.map(x => formatNumber(x, opts.precision)).join('，') + '（各出现 ' + maxFrequency + ' 次）';
    const output = result('statistics', '描述统计', input, normalized);
    const f = n => n === null ? '未定义（至少需要两个数据）' : formatNumber(n, opts.precision);
    output.answerText = '共 ' + count + ' 个数据；平均数 ' + f(mean) + '；中位数 ' + f(median);
    output.answerLatex = 'n=' + count + ',\\quad\\bar{x}=' + valueLatex(mean, opts) + ',\\quad\\mathrm{median}=' + valueLatex(median, opts);
    output.approximate = f(mean);
    output.table = { headers: ['统计量', '数值'], rows: [
      ['数据个数 n', String(count)], ['总和', f(sum)], ['平均数', f(mean)], ['中位数', f(median)], ['众数', modeText],
      ['最小值', f(sorted[0])], ['最大值', f(sorted[count - 1])], ['极差', f(sorted[count - 1] - sorted[0])],
      ['总体方差 σ²', f(variance)], ['总体标准差 σ', f(Math.sqrt(variance))],
      ['样本方差 s²', f(sampleVariance)], ['样本标准差 s', f(sampleVariance === null ? null : Math.sqrt(sampleVariance))],
      ['第一四分位数 Q1', f(q1)], ['第二四分位数 Q2', f(median)], ['第三四分位数 Q3', f(q3)], ['四分位距 IQR', f(q3 - q1)] ] };
    step(output, '排序与计数', '先把实际数据按从小到大排序，计数并计算总和。', '[' + sorted.slice(0, 40).map(x => valueLatex(x, opts)).join(',') + (count > 40 ? ',\\ldots' : '') + '],\\quad n=' + count + ',\\quad\\sum x_i=' + valueLatex(sum, opts));
    step(output, '平均数与中位数', '平均数为总和除以个数；中位数是排序后的中间值，偶数个时取两个中间值的平均。', '\\bar{x}=\\frac{' + valueLatex(sum, opts) + '}{' + count + '}=' + valueLatex(mean, opts));
    step(output, '总体与样本离散程度', '总体方差除以 n；样本方差除以 n−1。使用稳定的逐项中心矩计算，避免大数平方相减。', '\\sum(x_i-\\bar{x})^2=' + valueLatex(m2, opts) + ',\\quad\\sigma^2=\\frac{' + valueLatex(m2, opts) + '}{' + count + '}=' + valueLatex(variance, opts));
    output.notes.push('四分位数采用上下半组中位数法：奇数个数据时，从两半中排除整体中位数；一个数据时 Q1=Q2=Q3。不同软件的插值定义可能不同。');
    if (count === 1) output.notes.push('样本方差和样本标准差需要至少两个数据，不能除以 n−1=0。');
    return output;
  }
  /* Only spellings mathjs lacks are aliased, and only to pure unit expressions: mathjs
   * rejects a number inside the unit part ("4.184 J"), so conversions that would need one
   * (calories, knots, stone) keep their explicit "unsupported unit" message instead. */
  const UNIT_ALIASES = new Map([
    ['mph', 'mi/h'], ['mi/hr', 'mi/h'], ['mile/hr', 'mile/h'], ['milesperhour', 'mi/h'],
    ['btu', 'BTU'],
    ['sqft', 'ft^2'], ['sqin', 'in^2'], ['sqmi', 'mile^2'], ['sqyd', 'yd^2'],
    ['cuft', 'ft^3'], ['cubicfoot', 'ft^3'], ['cubicinch', 'in^3'], ['cubicmeter', 'm^3'],
    ['degk', 'K'], ['kelvin', 'K'],
    ['litre', 'l'], ['liters', 'l'], ['litres', 'l'], ['tonne', 'ton'],
    ['metre', 'm'], ['metres', 'm'], ['meter', 'm'], ['meters', 'm'],
    ['gram', 'g'], ['grams', 'g'], ['second', 's'], ['seconds', 's'], ['minute', 'min'], ['minutes', 'min']
  ]);
  function applyUnitAliases(text) {
    return text.replace(/[a-zA-Z]+/g, word => UNIT_ALIASES.get(word.toLowerCase()) || word);
  }
  function units(input, normalized, opts) {
    libraries(false);
    normalized = applyUnitAliases(normalized);
    const pieces = normalized.split(/\s+to\s+/);
    if (pieces.length !== 2 || !pieces[0] || !pieces[1]) fail('单位换算请使用“数值 原单位 to 目标单位”，例如 2 inch to cm。');
    if (/["'`:@?;\[\]{}]/.test(normalized)) fail('单位换算只接受数值、单位和基本运算符。');
    let nodes;
    try { nodes = pieces.map(p => math.parse(p)); } catch (_) { fail('无法解析单位换算，请检查单位拼写。'); }
    let count = 0;
    function evalUnit(node, depth) {
      const n = unwrap(node);
      if (++count > LIMITS.nodes || depth > LIMITS.depth) fail('单位表达式过于复杂。');
      if (n.isConstantNode && typeof n.value === 'number' && Number.isFinite(n.value)) return n.value;
      if (n.isSymbolNode) {
        if (n.name === 'pi') return Math.PI;
        if (FORBIDDEN.test(n.name) || !math.Unit.isValuelessUnit(n.name)) fail('未知或不支持的单位：' + n.name + '。');
        return math.unit(n.name);
      }
      if (!n.isOperatorNode || !['add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus'].includes(n.fn)) fail('单位换算只支持基本数值运算和已知单位。');
      const args = n.args.map(a => evalUnit(a, depth + 1));
      if (n.fn === 'pow' && (!Number.isInteger(args[1]) || Math.abs(args[1]) > 12)) fail('单位的幂次需为绝对值不超过 12 的整数。');
      const value = math[n.fn].apply(math, args);
      if (typeof value === 'number' && !Number.isFinite(value) || value && value.isUnit && value.value !== null && !Number.isFinite(value.value)) fail('单位数值超出有限范围。');
      return value;
    }
    let source, target, converted;
    try {
      source = evalUnit(nodes[0], 0); target = evalUnit(nodes[1], 0);
      if (!source || !source.isUnit || !target || !target.isUnit) fail('换算两侧需要单位；例如 100 cm to m。');
      converted = source.to(target);
    } catch (error) {
      if (/未知|只支持|限制|最多|需要单位|幂次|有限范围/.test(error.message)) throw error;
      fail('单位不匹配或格式有误：长度、质量、温度等不同维度不能互相换算。');
    }
    const text = converted.format({ precision: opts.precision });
    const output = result('units', '单位换算', input, normalized);
    output.answerText = text; output.approximate = text;
    function tex(unit) {
      const rendered = unit.format({ precision: opts.precision });
      const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(.*)$/i.exec(rendered);
      return match ? toLatex(match[1]) + '\\,\\mathrm{' + match[2].replace(/\*/g, '\\cdot ').replace(/_/g, '\\_') + '}' : '\\mathrm{' + rendered.replace(/_/g, '\\_') + '}';
    }
    output.answerLatex = tex(converted);
    step(output, '校验单位维度', '原单位与目标单位属于相同物理维度，再依据内置单位定义转换。', tex(source) + '=' + output.answerLatex);
    if (/deg[CF]/.test(normalized)) output.notes.push('摄氏度与华氏度按带零点偏移的温标转换；不能把温度值转换当作单纯比例。');
    else output.notes.push('单位换算使用 mathjs 内置单位定义；显示值按指定有效数字舍入。');
    return output;
  }
  function extractCommand(input, opts) {
    let text = input.trim(), next = Object.assign({}, opts), command = false;
    const chinese = /^(求导|微分|积分|化简|展开|因式分解|解方程|极限|统计|矩阵|计算|单位换算)\s*[:：]?\s*(.+)$/s.exec(text);
    if (chinese) {
      const names = { 求导: 'derivative', 微分: 'derivative', 积分: 'integral', 化简: 'simplify', 展开: 'expand', 因式分解: 'factor', 解方程: 'solve', 极限: 'limit', 统计: 'statistics', 矩阵: 'matrix', 计算: 'evaluate', 单位换算: 'units' };
      if (next.mode === 'auto') next.mode = names[chinese[1]];
      text = chinese[2]; command = true;
    }
    const differential = /^d\/d([a-zA-Z][a-zA-Z0-9_]*)\s*(?:\((.*)\)|\s+(.+))$/s.exec(text);
    if (differential) {
      if (next.mode === 'auto') next.mode = 'derivative';
      next.variable = differential[1]; next.variableExplicit = true;
      text = differential[2] || differential[3]; command = true;
    }
    const wrapper = /^([a-zA-Z]+)\s*\(/.exec(text);
    if (wrapper && COMMANDS.has(wrapper[1])) {
      const group = groupAt(text, wrapper[0].length - 1, '(', ')');
      if (group.end === text.length) {
        const name = wrapper[1], args = splitTop(group.value, ',');
        const mode = { diff: 'derivative', derivative: 'derivative', integrate: 'integral', integral: 'integral', stats: 'statistics' }[name] || name;
        if (next.mode === 'auto') next.mode = mode;
        if (mode === 'statistics') text = args.length > 1 ? args.join(',') : args[0];
        else {
          text = args[0];
          if (['derivative', 'integral', 'limit'].includes(mode) && args[1]) { next.variable = args[1].trim(); next.variableExplicit = true; }
          if (mode === 'derivative' && args[2]) next.order = Number(args[2]);
          if (mode === 'integral') { if (args.length === 3) fail('定积分命令需要表达式、变量、下限和上限。'); if (args[2]) next.lower = args[2]; if (args[3]) next.upper = args[3]; }
          if (mode === 'limit') { if (args[2]) next.point = args[2]; if (args[3]) next.direction = ({ '+': 'right', '-': 'left' })[args[3]] || args[3]; }
          const maxArgs = mode === 'derivative' ? 3 : ['integral', 'limit'].includes(mode) ? 4 : 1;
          if (args.length > maxArgs) fail('命令参数过多，请检查表达式和变量。');
          // The wrapper only consumes a leading command, so a second one would otherwise
          // surface as a confusing "unsupported function" deep inside the parser.
          const rest = text.slice(args[0].length);
          if (['derivative', 'integral', 'limit'].includes(mode)
            && new RegExp('(^|[^a-zA-Z0-9_])(?:' + ['integrate', 'integral', 'diff', 'derivative', 'limit'].join('|') + ')\\s*\\(').test(rest)) {
            fail('一次只能计算一个积分、极限或求导；请分成两次计算。');
          }
        }
        command = true;
      }
    }
    if (/(?:integrate|integral|diff|derivative|limit)\s*\(/.test(text)) {
      fail('积分、极限和求导命令需要写在输入最前面，例如 integrate(f(x),x,0,1)。');
    }
    return { text, opts: optionsFor(next), command };
  }
  function solve(input, options) {
    if (typeof input !== 'string' || !input.trim()) fail('请输入一个数学表达式。');
    if (input.length > LIMITS.input) fail('输入最多 1200 个字符，请拆成较小的表达式。');
    libraries(false);
    polynomialWork = 0;
    const initial = optionsFor(options);
    // LaTeX that reached the engine as text (typed or pasted) carries the same \int, \lim,
    // \sum and \frac{d}{dx} notation the formula field produces.
    const translated = fromLatex(input, initial);
    const command = extractCommand(translated === null ? input : translated, initial), opts = command.opts;
    const normalized = normalize(command.text);
    let mode = opts.mode;
    const lines = splitTop(normalized, ';');
    const relation = comparisons(normalized);
    if (mode === 'auto') {
      if (/\bto\b/.test(normalized)) mode = 'units';
      else if (lines.length > 1 || relation.operators.length) mode = 'solve';
      else if (splitTop(normalized, ',').length > 1) mode = 'statistics';
      else {
        const node = parse(normalized);
        if (unwrap(node).isArrayNode && !unwrap(node).items.some(a => unwrap(a).isArrayNode)) mode = 'statistics';
        else if (containsMatrix(node)) mode = 'matrix';
        else mode = symbols(node).length ? 'simplify' : 'evaluate';
      }
    }
    let output;
    if (mode === 'units') output = units(input, normalized, opts);
    else if (mode === 'statistics') output = statistics(input, normalized, opts);
    else if (mode === 'solve') {
      libraries(true);
      if (lines.length > 1) output = linearSystem(input, normalized, opts);
      else if (relation.operators.some(op => !['=', '=='].includes(op))) output = inequality(input, normalized, opts);
      else if (relation.operators.length) output = equation(input, normalized, opts);
      else output = equation(input, normalized + '=0', opts);
    } else {
      if (lines.length > 1 || relation.operators.length) fail('此模式需要单个表达式；方程或不等式请使用自动或解方程模式。');
      if (['simplify', 'expand', 'factor'].includes(mode)) output = algebra(input, normalized, opts, mode);
      else if (mode === 'derivative') output = derivative(input, normalized, opts);
      else if (mode === 'integral') output = integral(input, normalized, opts);
      else if (mode === 'limit') output = limit(input, normalized, opts);
      else output = numeric(input, normalized, opts, mode === 'matrix');
    }
    if (typeof output.exact === 'undefined') delete output.exact;
    output.notes = Array.from(new Set(output.notes));
    return output;
  }
  const examples = Object.freeze([
    { label: '分数与百分比', input: '1/3+1/6+50%', mode: 'evaluate' },
    { label: '角度制三角函数', input: 'sin(30)+cos(60)', mode: 'evaluate', options: { angle: 'deg' } },
    { label: '复数运算', input: '(2+3i)*(1-2i)', mode: 'evaluate' },
    { label: '二次方程', input: 'x^2-5x+6=0', mode: 'solve' },
    { label: '复数根', input: 'x^2+1=0', mode: 'solve' },
    { label: '线性方程组', input: '2x+y=7;x-y=2', mode: 'solve' },
    { label: '有理不等式', input: '(x+1)/(x-2)>0', mode: 'solve' },
    { label: '绝对值不等式', input: 'abs(x-1)<=2', mode: 'solve' },
    { label: '代数展开', input: '(x+2)^4', mode: 'expand' },
    { label: '因式分解', input: 'x^3-x', mode: 'factor' },
    { label: '乘积与复合函数求导', input: 'x*sin(x^2)', mode: 'derivative' },
    { label: '定积分', input: 'sin(x)', mode: 'integral', options: { lower: '0', upper: 'pi' } },
    { label: '经典极限', input: 'sin(x)/x', mode: 'limit', options: { point: '0' } },
    { label: '描述统计', input: '2,4,4,4,5,5,7,9', mode: 'statistics' },
    { label: '矩阵求逆', input: 'inv([2,1;1,1])', mode: 'matrix' },
    { label: '有限求和', input: 'sum(k^2,k,1,10)', mode: 'auto' },
    { label: '温度换算', input: '32 degF to degC', mode: 'units' }
  ]);
  return Object.freeze({ solve, normalize, toLatex, fromLatex, evaluateAt, examples, limits: LIMITS });
}));
