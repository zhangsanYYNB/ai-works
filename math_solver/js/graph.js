/* MathSolverGraph — offline, Canvas 2D function plotting.
 * new MathSolverGraph(container, { angle: 'rad' | 'deg', theme: 'light' | 'dark', onProbe })
 * setFunctions([{ expression, label, color? }], parameters), setParameter(name, value),
 * setAngle(mode), setTheme(theme), setBounds(bounds), resetView(), fitView(), zoom(factor),
 * draw()/render()/redraw(), requestDraw(), exportPNG(), destroy().
 * zoom(factor > 1) zooms in. bounds is public; call draw/requestDraw after direct edits.
 * onProbe receives { x, y, values: [{ expression, label, color, value: number | null }] }
 * or null when the probe clears. View setters return this.
 * DOM hooks: .plot-root, .plot-canvas, .plot-legend, .plot-coordinate, .plot-empty.
 * The supplied container supplies its height/min-height (normally at least 320px).
 */
(function (global) {
  'use strict';

  const MAX_FUNCTIONS = 6;
  const MAX_EXPRESSION = 600;
  const MIN_SPAN = 1e-10;
  const MAX_SPAN = 1e12;
  const MAX_CENTER = 1e15;
  const TO_RAD = Math.PI / 180;
  const TO_DEG = 180 / Math.PI;
  const FONT = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  const FUNCTION_NAMES = new Set(('sqrt nthRoot cbrt abs sign exp log log10 log2 sin cos tan sec csc cot '
    + 'asin acos atan atan2 asec acsc acot sinh cosh tanh asinh acosh atanh '
    + 'floor ceil round trunc fix factorial gamma mod gcd lcm combinations permutations '
    + 'sum prod product mean median min max variance std det inv transpose trace diag '
    + 'dot cross norm identity zeros ones size re im conj arg complex fraction erf erfc').split(' '));
  const FORBIDDEN_NAMES = /^(?:__.*|constructor|prototype|import|evaluate|parse|compile|createUnit|reviver|simplifyCore|unit|help|print|random|randomInt)$/;
  const THEMES = {
    light: {
      background: '#fafbf9', minor: '#edf1ed', major: '#dce4de', axis: '#7b8983',
      text: '#52625b', strong: '#263c32', border: '#dce4de', panel: 'rgba(250,252,250,.95)',
      probe: '#87968e', focus: '#16845f',
      palette: ['#15835d', '#3478d4', '#d98127', '#8460bf', '#cb5476', '#1996a6']
    },
    dark: {
      background: '#171e1b', minor: '#212b26', major: '#303e36', axis: '#7e9387',
      text: '#acbfb3', strong: '#e0ebe3', border: '#37493e', panel: 'rgba(25,34,28,.95)',
      probe: '#9eafa3', focus: '#63cda2',
      palette: ['#63cda2', '#76aafa', '#f3ad62', '#b89bea', '#ed91ae', '#66cbd6']
    }
  };
  let instanceID = 0;

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const copyBounds = (bounds) => ({ xmin: bounds.xmin, xmax: bounds.xmax, ymin: bounds.ymin, ymax: bounds.ymax });

  function validBounds(bounds) {
    return bounds && ['xmin', 'xmax', 'ymin', 'ymax'].every(key => Number.isFinite(bounds[key]))
      && bounds.xmax > bounds.xmin && bounds.ymax > bounds.ymin
      && Number.isFinite(bounds.xmax - bounds.xmin) && Number.isFinite(bounds.ymax - bounds.ymin);
  }

  function realNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (!value || typeof value !== 'object') return NaN;
    // Strictly reject non-real values: sqrt(-epsilon) must still leave a domain gap.
    if (value.isComplex) return value.im === 0 && Number.isFinite(value.re) ? value.re : NaN;
    if (value.isBigNumber || value.isFraction) {
      const number = typeof value.toNumber === 'function' ? value.toNumber() : Number(value.valueOf());
      return Number.isFinite(number) ? number : NaN;
    }
    return NaN;
  }

  function numericParameter(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value === 'string' && value.trim()) {
      const number = Number(value);
      return Number.isFinite(number) ? number : NaN;
    }
    return NaN;
  }

  function parameterName(name) {
    return typeof name === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(name)
      && !['x', 'pi', 'e', 'i', 'Infinity'].includes(name)
      && !FORBIDDEN_NAMES.test(name) && !FUNCTION_NAMES.has(name);
  }

  function safeParameters(parameters) {
    const result = {};
    if (!parameters || typeof parameters !== 'object') return result;
    for (const name of Object.keys(parameters)) {
      const value = numericParameter(parameters[name]);
      if (parameterName(name) && Number.isFinite(value)) result[name] = value;
    }
    return result;
  }

  function formatNumber(value, step) {
    if (!Number.isFinite(value)) return '未定义';
    if (value === 0 || Object.is(value, -0) || (step && Math.abs(value) < step * 1e-8)) return '0';
    const magnitude = Math.abs(value);
    if (magnitude >= 1e6 || magnitude < 1e-4) {
      return value.toExponential(step ? 3 : 5).replace(/\.?0+e/, 'e').replace('e+', 'e');
    }
    if (step) {
      const places = clamp(Math.ceil(-Math.log10(step)) + 1, 0, 12);
      return String(Number(value.toFixed(places)));
    }
    return String(Number(value.toPrecision(7)));
  }

  function niceStep(range, pixels, target) {
    const rough = range * target / Math.max(1, pixels);
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const fraction = rough / power;
    const multiple = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
    return multiple * power;
  }

  function ticks(minimum, maximum, step) {
    if (!(step > 0) || !Number.isFinite(step)) return [];
    const first = Math.ceil(minimum / step - 1e-9);
    const last = Math.floor(maximum / step + 1e-9);
    const count = Math.min(180, Math.max(0, last - first + 1));
    return Array.from({ length: count }, (_, index) => (first + index) * step);
  }

  // Used only while the engine is unavailable. mathjs accepts implicit multiplication;
  // spelling it out also disambiguates x(x+1) from a user-defined function call.
  function fallbackNormalize(expression) {
    const superscript = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5',
      '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
    let text = expression.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, run => '^(' + Array.from(run, c => superscript[c]).join('') + ')');
    text = text.normalize('NFKC').replace(/[×·⋅∙]/g, '*').replace(/[÷∕]/g, '/')
      .replace(/[−–—]/g, '-').replace(/π/g, 'pi').replace(/ℯ/g, 'e').replace(/∞/g, 'Infinity')
      .replace(/\*\*/g, '^').replace(/\bln\b/g, 'log').replace(/\barcsin\b/g, 'asin')
      .replace(/\barccos\b/g, 'acos').replace(/\barctan\b/g, 'atan')
      .replace(/√\s*\(/g, 'sqrt(').replace(/√\s*([a-zA-Z][a-zA-Z0-9_]*|\d+(?:\.\d+)?)/g, 'sqrt($1)');
    if (text.includes('|')) {
      const parts = text.split('|');
      if (parts.length % 2 === 0) throw new Error('绝对值竖线不匹配');
      text = parts.map((part, index) => index % 2 ? 'abs(' + part + ')' : part).join('');
    }
    const tokens = text.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z_][a-zA-Z0-9_]*|[^\s]/g) || [];
    const isNumber = token => /^(?:\d|\.\d)/.test(token || '');
    const isName = token => /^[a-zA-Z_]/.test(token || '');
    const output = [];
    tokens.forEach((token, index) => {
      const previous = tokens[index - 1];
      const left = isNumber(previous) || isName(previous) || previous === ')' || previous === '!';
      const right = isNumber(token) || isName(token) || token === '(';
      if (left && right && !(token === '(' && FUNCTION_NAMES.has(previous))) output.push('*');
      output.push(token);
    });
    return output.join('');
  }

  function inspectNode(node) {
    let nodes = 0;
    let needsEngine = false;
    function visit(current, depth) {
      if (++nodes > 360 || depth > 36) throw new Error('表达式结构过于复杂');
      if (current.isConstantNode) {
        if (typeof current.value !== 'number' || !Number.isFinite(current.value)) throw new Error('只支持有限数值');
      } else if (current.isSymbolNode) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(current.name)
          || FORBIDDEN_NAMES.test(current.name)) throw new Error('不支持此变量名称');
      } else if (current.isParenthesisNode) visit(current.content, depth + 1);
      else if (current.isOperatorNode) {
        if (!['add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus',
          'factorial', 'mod', 'dotMultiply', 'dotDivide', 'dotPow'].includes(current.fn)) throw new Error('只支持数学运算');
        current.args.forEach(argument => visit(argument, depth + 1));
      } else if (current.isFunctionNode) {
        if (!current.fn.isSymbolNode || !FUNCTION_NAMES.has(current.fn.name)) throw new Error('不支持此数学函数');
        // Bound-variable sums/products have engine-specific semantics, not mathjs's sum(array).
        if (['sum', 'prod', 'product'].includes(current.fn.name) && current.args.length === 4) needsEngine = true;
        current.args.forEach(argument => visit(argument, depth + 1));
      } else throw new Error('绘图需要单个实函数，不支持赋值、矩阵或程序语法');
    }
    visit(node, 0);
    return needsEngine;
  }

  function angleFunctions(math, angle) {
    const scope = {};
    const multiply = (value, factor) => typeof value === 'number' ? value * factor : math.multiply(value, factor);
    const trigInput = value => angle === 'deg' ? multiply(value, TO_RAD) : value;
    const inverseOutput = value => angle === 'deg' ? multiply(value, TO_DEG) : value;
    for (const name of ['sin', 'cos', 'tan', 'sec', 'csc', 'cot']) {
      scope[name] = value => {
        const argument = trigInput(value);
        if (typeof argument !== 'number') return math[name](argument);
        if (name === 'sin') return Math.sin(argument);
        if (name === 'cos') return Math.cos(argument);
        const denominator = (name === 'tan' || name === 'sec') ? Math.cos(argument) : Math.sin(argument);
        if (Math.abs(denominator) <= 4 * Number.EPSILON) return NaN;
        if (name === 'tan') return Math.tan(argument);
        if (name === 'cot') return Math.cos(argument) / denominator;
        return 1 / denominator;
      };
    }
    for (const name of ['asin', 'acos', 'atan', 'asec', 'acsc', 'acot']) {
      scope[name] = value => {
        const argument = ['asec', 'acsc', 'acot'].includes(name)
          ? (typeof value === 'number' ? 1 / value : math.divide(1, value)) : value;
        const method = { asec: 'acos', acsc: 'asin', acot: 'atan' }[name] || name;
        // Keep mathjs complex intermediates, so re(asin(x)) remains meaningful.
        const result = typeof argument === 'number' && (method === 'atan' || Math.abs(argument) <= 1)
          ? Math[method](argument) : math[method](argument);
        return inverseOutput(result);
      };
    }
    scope.atan2 = (y, x) => inverseOutput(typeof y === 'number' && typeof x === 'number' ? Math.atan2(y, x) : math.atan2(y, x));
    scope.cbrt = value => typeof value === 'number' ? Math.cbrt(value) : math.nthRoot(value, 3);
    if (typeof math.trunc === 'function') scope.fix = value => math.trunc(value);
    if (typeof math.prod === 'function') scope.product = (...values) => math.prod(...values);
    return scope;
  }

  class MathSolverGraph {
    constructor(containerElement, options = {}) {
      if (!containerElement || !containerElement.ownerDocument || typeof containerElement.appendChild !== 'function') {
        throw new TypeError('MathSolverGraph 需要一个容器元素');
      }
      options = options || {};
      this.container = containerElement;
      this._document = containerElement.ownerDocument;
      this._view = this._document.defaultView || global;
      this.angle = options.angle === 'deg' ? 'deg' : 'rad';
      this.theme = options.theme === 'dark' ? 'dark' : 'light';
      this.onProbe = typeof options.onProbe === 'function' ? options.onProbe : null;
      this.bounds = { xmin: -10, xmax: 10, ymin: -6, ymax: 6 };
      this.parameters = {};
      this.functions = [];
      this._lastValidBounds = copyBounds(this.bounds);
      this._autoBounds = true;
      this._destroyed = false;
      this._listeners = [];
      this._programs = new Map();
      this._pointers = new Map();
      this._gesture = null;
      this._probe = null;
      this._probeData = null;
      this._probeDirty = true;
      this._probeNotified = false;
      this._needsPrepare = true;
      this._needsResize = true;
      this._sceneDirty = true;
      this._dataVersion = 0;
      this._geometryKey = '';
      this._curves = [];
      this._width = this._height = 0;
      this._dpr = 1;
      this._visible = false;
      this._frame = null;
      this._plot = { left: 52, top: 20, right: 620, bottom: 282, width: 568, height: 262 };
      this._originalPosition = containerElement.style.position;
      const position = this._view.getComputedStyle(containerElement).position;
      this._changedPosition = position === 'static' || !position;
      if (this._changedPosition) containerElement.style.position = 'relative';
      this._buildDOM();
      this._context = this.canvas.getContext('2d');
      this._baseCanvas = this._document.createElement('canvas');
      this._baseContext = this._baseCanvas.getContext('2d');
      if (!this._context || !this._baseContext) {
        this._root.remove();
        if (this._changedPosition) containerElement.style.position = this._originalPosition;
        throw new Error('当前浏览器不支持二维画布');
      }
      this._bindEvents();
      this._applyTheme();
      const resize = () => { this._needsResize = true; this._schedule(); };
      if (typeof this._view.ResizeObserver === 'function') {
        this._resizeObserver = new this._view.ResizeObserver(resize);
        this._resizeObserver.observe(containerElement);
      }
      this._listen(this._view, 'resize', resize);
      this._listen(this._document, 'visibilitychange', () => {
        if (!this._document.hidden) resize();
        else this._clearPointers();
      });
      this._listen(this._view, 'blur', () => this._clearPointers());
      this._schedule();
    }

    setFunctions(functions, parameters = {}) {
      if (this._destroyed) return this;
      const previous = this._programs;
      this._programs = new Map();
      this.functions = (Array.isArray(functions) ? functions : []).slice(0, MAX_FUNCTIONS).map((item, index) => {
        item = typeof item === 'string' ? { expression: item } : item || {};
        const expression = typeof item.expression === 'string' ? item.expression.trim() : '';
        let program = this._programs.get(expression) || previous.get(expression);
        if (!program) program = { expression, plans: new Map() };
        this._programs.set(expression, program);
        return {
          expression, label: String(item.label || expression || '函数 ' + (index + 1)).slice(0, MAX_EXPRESSION),
          color: this._validColor(item.color), index, program, evaluate: () => NaN, error: ''
        };
      });
      this.parameters = safeParameters(parameters);
      this._buildLegend();
      this._invalidateData();
      return this;
    }

    setParameter(name, value) {
      if (this._destroyed || !parameterName(name)) return this;
      const number = numericParameter(value);
      if (!Number.isFinite(number) || (own(this.parameters, name) && this.parameters[name] === number)) return this;
      this.parameters[name] = number;
      this._invalidateData();
      return this;
    }

    setAngle(mode) {
      if (mode !== 'rad' && mode !== 'deg') throw new RangeError('角度单位应为 rad 或 deg');
      if (!this._destroyed && mode !== this.angle) {
        this.angle = mode;
        this._invalidateData();
      }
      return this;
    }

    setTheme(theme) {
      if (this._destroyed) return this;
      theme = theme === 'dark' ? 'dark' : 'light';
      if (theme !== this.theme) {
        this.theme = theme;
        this._applyTheme();
        this._sceneDirty = this._probeDirty = true;
        this._schedule();
      }
      return this;
    }

    setBounds(bounds) {
      if (this._destroyed) return this;
      if (!validBounds(bounds)) throw new RangeError('坐标范围需要四个有限数值，且最小值应小于最大值');
      this._autoBounds = false;
      this._clearPointers(false);
      this._assignBounds(bounds);
      this._schedule();
      return this;
    }

    resetView() {
      if (this._destroyed) return this;
      this._clearPointers(false);
      this._autoBounds = true;
      this._needsResize = true;
      this._assignBounds(this._defaultBounds());
      this._schedule();
      return this;
    }

    zoom(factor) {
      if (this._destroyed) return this;
      const number = Number(factor);
      if (!Number.isFinite(number) || number <= 0 || number === 1) return this;
      this._autoBounds = false;
      this._zoomAt(number, (this._plot.left + this._plot.right) / 2, (this._plot.top + this._plot.bottom) / 2);
      return this;
    }

    fitView() {
      if (this._destroyed || !this.functions.length) return this;
      this._ensureSize(true);
      this._prepareEvaluators();
      if (!validBounds(this.bounds)) this._assignBounds(this._lastValidBounds);
      const xmin = this.bounds.xmin, xmax = this.bounds.xmax;
      const ys = [];
      let firstX = Infinity, lastX = -Infinity;
      const roots = [];
      for (const fn of this.functions) {
        let previous = null;
        for (let index = 0; index <= 320; index++) {
          const x = xmin + (xmax - xmin) * index / 320;
          const y = fn.evaluate(x);
          if (!Number.isFinite(y) || Math.abs(y) > 1e12) { previous = null; continue; }
          ys.push(y); firstX = Math.min(firstX, x); lastX = Math.max(lastX, x);
          // A sign change alone is not a root (1/x). Require a small, finite residual.
          if (previous && Math.sign(y) !== Math.sign(previous.y) && y !== 0 && previous.y !== 0) {
            let a = previous.x, b = x, fa = previous.y, candidate = NaN, residual = Infinity;
            for (let iteration = 0; iteration < 28; iteration++) {
              const middle = a + (b - a) / 2, value = fn.evaluate(middle);
              if (!Number.isFinite(value)) break;
              if (Math.abs(value) < residual) { candidate = middle; residual = Math.abs(value); }
              if (value === 0) break;
              if (Math.sign(value) === Math.sign(fa)) { a = middle; fa = value; } else b = middle;
            }
            if (residual < 1e-6 * Math.max(1, Math.abs(y), Math.abs(previous.y))) roots.push(candidate);
          }
          if (y === 0) roots.push(x);
          previous = { x, y };
        }
      }
      if (!ys.length) return this;
      ys.sort((a, b) => a - b);
      // Trim pole spikes, retain the scale of each visible function, and include y=0.
      let ymin = Math.min(0, ys[Math.floor((ys.length - 1) * 0.025)]);
      let ymax = Math.max(0, ys[Math.ceil((ys.length - 1) * 0.975)]);
      let yspan = ymax - ymin;
      if (yspan < 1e-9) {
        const center = ymin / 2 + ymax / 2;
        yspan = Math.max(2, Math.abs(center) * 0.2);
        ymin = center - yspan / 2; ymax = center + yspan / 2;
      }
      const padding = yspan * 0.12;
      ymin -= padding; ymax += padding;
      let left = xmin, right = xmax;
      if (Number.isFinite(firstX) && lastX > firstX && lastX - firstX < (xmax - xmin) * 0.8) {
        const xpadding = Math.max((lastX - firstX) * 0.1, (xmax - xmin) * 0.025);
        left = firstX - xpadding; right = lastX + xpadding;
      }
      if (roots.length) { left = Math.min(left, ...roots); right = Math.max(right, ...roots); }
      this._autoBounds = false;
      this._clearPointers(false);
      this._assignBounds({ xmin: left, xmax: right, ymin, ymax });
      this._schedule();
      return this;
    }

    draw() {
      if (this._destroyed) return this;
      this._cancelFrame();
      this._needsResize = true;
      this._render(false);
      return this;
    }

    render() { return this.draw(); }
    redraw() { return this.draw(); }

    requestDraw() {
      if (!this._destroyed) { this._needsResize = true; this._schedule(); }
      return this;
    }

    exportPNG() {
      if (this._destroyed) return '';
      this._cancelFrame();
      this._needsResize = true;
      this._render(true);
      const image = this._document.createElement('canvas');
      image.width = this.canvas.width;
      image.height = this.canvas.height;
      const context = image.getContext('2d');
      if (!context) return '';
      context.drawImage(this.canvas, 0, 0);
      context.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      this._drawExportLabels(context);
      return image.toDataURL('image/png');
    }

    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      this._cancelFrame();
      this._clearPointers(false);
      if (this._resizeObserver) this._resizeObserver.disconnect();
      for (const remove of this._listeners) remove();
      this._listeners = [];
      this._root.remove();
      if (this._changedPosition && this.container.style.position === 'relative') {
        this.container.style.position = this._originalPosition;
      }
      this.canvas.width = this.canvas.height = 0;
      this._baseCanvas.width = this._baseCanvas.height = 0;
      this._programs.clear();
      this._curves = [];
      this.functions = [];
      this._probe = this._probeData = null;
      this.onProbe = null;
    }

    _element(tag, className, text) {
      const element = this._document.createElement(tag);
      element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    _buildDOM() {
      this._root = this._element('div', 'plot-root');
      Object.assign(this._root.style, { position: 'absolute', inset: '0', overflow: 'hidden',
        borderRadius: 'inherit', fontFamily: FONT, fontSize: '11px', lineHeight: '1.5', isolation: 'isolate' });
      this.canvas = this._element('canvas', 'plot-canvas');
      this.canvas.tabIndex = 0;
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', '交互式函数图像');
      this.canvas.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight + - 0 Escape');
      Object.assign(this.canvas.style, { position: 'absolute', inset: '0', display: 'block', width: '100%',
        height: '100%', touchAction: 'none', userSelect: 'none', cursor: 'crosshair', outline: 'none', outlineOffset: '-2px' });
      const help = this._element('span', 'plot-help', '拖动平移，滚轮或双指缩放；轻触或移动指针查看坐标。键盘方向键平移，加减键缩放，0 或 Home 复位，Escape 关闭坐标。也可使用图像外的工具栏。');
      help.id = 'plot-help-' + (++instanceID);
      Object.assign(help.style, { position: 'absolute', width: '1px', height: '1px', padding: '0',
        margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' });
      this.canvas.setAttribute('aria-describedby', help.id);
      this._legend = this._element('div', 'plot-legend');
      this._legend.setAttribute('aria-label', '绘制的函数');
      Object.assign(this._legend.style, { position: 'absolute', left: '12px', top: '10px', right: '12px',
        display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', pointerEvents: 'none' });
      this._coordinate = this._element('div', 'plot-coordinate');
      this._coordinate.hidden = true;
      Object.assign(this._coordinate.style, { position: 'absolute', right: '12px', bottom: '44px',
        maxWidth: 'calc(100% - 24px)', padding: '7px 10px', border: '1px solid', borderRadius: '7px',
        boxSizing: 'border-box', pointerEvents: 'none', fontVariantNumeric: 'tabular-nums', overflow: 'hidden' });
      this._empty = this._element('div', 'plot-empty');
      Object.assign(this._empty.style, { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(280px, 80%)', padding: '12px', textAlign: 'center', borderRadius: '8px', pointerEvents: 'none' });
      this._emptyTitle = this._element('div', 'plot-empty-title', '输入函数即可绘制图像');
      this._emptyHint = this._element('div', 'plot-empty-hint', '拖动平移 · 滚轮或双指缩放');
      this._emptyHint.style.fontSize = '10px';
      this._emptyHint.style.marginTop = '4px';
      this._empty.appendChild(this._emptyTitle);
      this._empty.appendChild(this._emptyHint);
      for (const element of [this.canvas, help, this._legend, this._coordinate, this._empty]) this._root.appendChild(element);
      this.container.appendChild(this._root);
    }

    _validColor(color) {
      if (typeof color !== 'string' || color.length > 100 || /var\(|currentcolor/i.test(color)) return null;
      const value = color.trim();
      if (this._view.CSS && typeof this._view.CSS.supports === 'function') return this._view.CSS.supports('color', value) ? value : null;
      return /^(?:#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%+/-]+\))$/i.test(value) ? value : null;
    }

    _color(fn) { return fn.color || THEMES[this.theme].palette[fn.index % MAX_FUNCTIONS]; }

    _buildLegend() {
      this._legend.replaceChildren();
      for (const fn of this.functions) {
        const item = this._element('span', 'plot-legend-item');
        Object.assign(item.style, { display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: '0',
          maxWidth: '100%', padding: '2px 5px', borderRadius: '4px', fontSize: '10px' });
        const swatch = this._element('span', 'plot-legend-swatch');
        Object.assign(swatch.style, { display: 'inline-block', width: '14px', height: '2px', flex: '0 0 auto', borderRadius: '2px' });
        const label = this._element('span', 'plot-legend-label', fn.label);
        Object.assign(label.style, { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
        item.title = fn.expression;
        item.appendChild(swatch); item.appendChild(label);
        this._legend.appendChild(item);
        fn.legend = item; fn.swatch = swatch;
      }
      this._applyTheme();
      const labels = this.functions.map(fn => fn.label).join('；');
      this.canvas.setAttribute('aria-label', labels ? '交互式函数图像：' + labels : '交互式函数图像，尚未输入函数');
    }

    _applyTheme() {
      const colors = THEMES[this.theme];
      this._root.dataset.theme = this.theme;
      this._root.style.background = colors.background;
      this._root.style.color = colors.text;
      this._coordinate.style.background = colors.panel;
      this._coordinate.style.color = colors.strong;
      this._coordinate.style.borderColor = colors.border;
      this._empty.style.background = colors.panel;
      this._empty.style.color = colors.text;
      for (const fn of this.functions) {
        if (fn.swatch) fn.swatch.style.background = this._color(fn);
        if (fn.legend) { fn.legend.style.background = colors.panel; fn.legend.style.color = colors.text; }
      }
      if (this._focused) this.canvas.style.outline = '2px solid ' + colors.focus;
    }

    _listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      this._listeners.push(() => target.removeEventListener(type, handler, options));
    }

    _invalidateData() {
      ++this._dataVersion;
      this._needsPrepare = this._sceneDirty = this._probeDirty = true;
      this._schedule();
    }

    _schedule() {
      if (this._destroyed || this._frame !== null) return;
      const callback = () => { this._frame = null; if (!this._destroyed) this._render(false); };
      this._frame = typeof this._view.requestAnimationFrame === 'function'
        ? this._view.requestAnimationFrame(callback) : this._view.setTimeout(callback, 16);
    }

    _cancelFrame() {
      if (this._frame === null) return;
      if (typeof this._view.cancelAnimationFrame === 'function') this._view.cancelAnimationFrame(this._frame);
      else this._view.clearTimeout(this._frame);
      this._frame = null;
    }

    _defaultBounds() {
      const halfY = 10 * this._plot.height / Math.max(1, this._plot.width);
      return { xmin: -10, xmax: 10, ymin: -halfY, ymax: halfY };
    }

    _assignBounds(bounds) {
      if (!validBounds(bounds)) return false;
      if (!this.bounds || typeof this.bounds !== 'object') this.bounds = {};
      Object.assign(this.bounds, copyBounds(bounds));
      this._lastValidBounds = copyBounds(this.bounds);
      this._sceneDirty = this._probeDirty = true;
      return true;
    }

    _ensureSize(force) {
      if (!this._needsResize && this._width && this._height) return this._visible || force;
      this._needsResize = false;
      let width = this._root.clientWidth;
      let height = this._root.clientHeight;
      this._visible = width > 1 && height > 1 && this._root.isConnected !== false;
      if (!this._visible) {
        if (!force) return false;
        width = this._width || 640; height = this._height || 320;
      }
      const dpr = clamp(this._view.devicePixelRatio || 1, 1, 2);
      if (width === this._width && height === this._height && dpr === this._dpr) return true;
      const oldAspect = this._plot.height / this._plot.width;
      const hadSize = this._width > 0;
      this._width = width; this._height = height; this._dpr = dpr;
      const left = Math.min(56, Math.max(32, width * 0.14));
      const right = Math.max(left + 1, width - Math.min(18, width * 0.04));
      const top = Math.min(20, height * 0.08);
      const bottom = Math.max(top + 1, height - Math.min(36, height * 0.12));
      this._plot = { left, right, top, bottom, width: right - left, height: bottom - top };
      if (this._autoBounds) this._assignBounds(this._defaultBounds());
      else if (hadSize && validBounds(this.bounds)) {
        const center = this.bounds.ymin / 2 + this.bounds.ymax / 2;
        const span = (this.bounds.ymax - this.bounds.ymin) * (this._plot.height / this._plot.width) / oldAspect;
        if (Number.isFinite(span) && span > 0) this._assignBounds(Object.assign({}, this.bounds, { ymin: center - span / 2, ymax: center + span / 2 }));
      }
      for (const canvas of [this.canvas, this._baseCanvas]) {
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
      }
      if (this._probe) {
        this._probe.px = clamp(this._probe.px, left, right);
        this._probe.py = clamp(this._probe.py, top, bottom);
      }
      this._gesture = null;
      if (this._pointers.size) this._startGesture();
      this._geometryKey = '';
      this._sceneDirty = this._probeDirty = true;
      return true;
    }

    _libraries() {
      const engine = this._view.MathSolverEngine || global.MathSolverEngine;
      const math = this._view.math || global.math;
      return { engine, math, normalize: engine && (engine.normalize || engine.normalizeExpression), compile: engine && engine.compileExpression };
    }

    _buildPlan(program, libraries) {
      const { engine, math, normalize, compile } = libraries;
      const plan = { engine, math, normalize, engineCompile: compile, compiled: null, error: '', kind: 'none', angle: this.angle };
      if (!program.expression) { plan.error = '请输入函数表达式'; return plan; }
      if (program.expression.length > MAX_EXPRESSION) { plan.error = '函数表达式最多 600 个字符'; return plan; }
      try {
        const normalized = typeof normalize === 'function' ? normalize.call(engine, program.expression) : fallbackNormalize(program.expression);
        const text = typeof normalized === 'string' ? normalized : normalized && (normalized.expression || normalized.normalized);
        if (typeof text !== 'string' || !text || /[;\n<>=]/.test(text)) throw new Error('绘图需要单个表达式');
        plan.normalized = text;
        if (typeof compile === 'function') {
          try {
            const result = compile.call(engine, program.expression, { angle: this.angle });
            const compiled = result && result.compiled ? result.compiled : result;
            if (typeof compiled === 'function' || (compiled && typeof compiled.evaluate === 'function')) {
              plan.compiled = compiled; plan.kind = 'engine-compiled';
            }
          } catch (_) { /* The locally compiled mathjs path is also supported. */ }
        }
        if (!plan.compiled && math && typeof math.compile === 'function') {
          // The compiled expression is identical in both angle modes; only its scope changes.
          let cached = program.mathPlan;
          if (!cached || cached.math !== math || cached.text !== text) {
            const needsEngine = typeof math.parse === 'function' && inspectNode(math.parse(text));
            cached = { math, text, compiled: needsEngine ? null : math.compile(text) };
            program.mathPlan = cached;
          }
          if (cached.compiled) {
            plan.compiled = cached.compiled;
            plan.kind = 'math-compiled';
          }
        }
        if (!plan.compiled) {
          if (engine && typeof engine.evaluateAt === 'function') plan.kind = 'engine';
          else if (math && typeof math.evaluate === 'function') plan.kind = 'math';
          else plan.error = '数学计算库尚未加载';
        }
      } catch (error) { plan.error = String(error && error.message || '无法解析函数').slice(0, 160); }
      return plan;
    }

    _prepareEvaluators() {
      const libraries = this._libraries();
      if (!this._needsPrepare && this._activeEngine === libraries.engine && this._activeMath === libraries.math
        && this._activeNormalize === libraries.normalize && this._activeCompile === libraries.compile) return;
      this._activeEngine = libraries.engine; this._activeMath = libraries.math;
      this._activeNormalize = libraries.normalize; this._activeCompile = libraries.compile;
      this._needsPrepare = false;
      const bound = new Map();
      this._angleScope = libraries.math ? angleFunctions(libraries.math, this.angle) : {};
      for (const fn of this.functions) {
        let evaluator = bound.get(fn.program);
        if (!evaluator) {
          let plan = fn.program.plans.get(this.angle);
          if (!plan || plan.engine !== libraries.engine || plan.math !== libraries.math
            || plan.normalize !== libraries.normalize || plan.engineCompile !== libraries.compile) {
            plan = this._buildPlan(fn.program, libraries);
            fn.program.plans.set(this.angle, plan);
          }
          evaluator = this._bindPlan(fn.program, plan);
          bound.set(fn.program, evaluator);
        }
        fn.evaluate = evaluator.evaluate;
        fn.error = evaluator.error;
        fn.slow = evaluator.slow;
        if (fn.legend) fn.legend.title = fn.error || fn.expression;
      }
      this._geometryKey = '';
      this._sceneDirty = this._probeDirty = true;
    }

    _bindPlan(program, plan) {
      const { engine, math } = plan;
      const options = { angle: this.angle };
      const plainScope = Object.assign({}, this.parameters, { x: 0 });
      // mathjs can use Map directly, avoiding an object-to-scope wrapper per sample.
      const mathScope = new Map(Object.entries(Object.assign({}, this.parameters, this._angleScope, { x: 0 })));
      if (plan.error) return { evaluate: () => NaN, error: plan.error, slow: false };
      const reference = engine && typeof engine.evaluateAt === 'function' ? x => {
        plainScope.x = x;
        return realNumber(engine.evaluateAt(program.expression, plainScope, options));
      } : null;
      let evaluate;
      if (plan.kind === 'engine-compiled') {
        evaluate = x => {
          plainScope.x = x;
          const value = typeof plan.compiled === 'function' ? plan.compiled(plainScope, options) : plan.compiled.evaluate(plainScope, options);
          return realNumber(value);
        };
      } else if (plan.kind === 'math-compiled') {
        evaluate = x => { mathScope.set('x', x); return realNumber(plan.compiled.evaluate(mathScope)); };
      } else if (plan.kind === 'engine') evaluate = reference;
      else if (plan.kind === 'math') evaluate = x => { mathScope.set('x', x); return realNumber(math.evaluate(plan.normalized, mathScope)); };
      if (!evaluate) return { evaluate: () => NaN, error: '数学计算库尚未加载', slow: false };
      let slow = plan.kind === 'engine' || plan.kind === 'math';
      // Verify compiled semantics once per parameter/angle change. Never parse per pixel
      // on the normal path. Engine-only syntax or a future incompatible compiler falls back.
      if (reference && plan.compiled) {
        for (const x of [-1.23456789, 0.3456789, 2.1234567]) {
          let expected = NaN, actual = NaN;
          try { expected = reference(x); } catch (_) { /* Real domain gaps are expected. */ }
          try { actual = evaluate(x); } catch (_) { /* Same gap should occur in the compiled path. */ }
          const bothFinite = Number.isFinite(expected) && Number.isFinite(actual);
          const agrees = bothFinite ? Math.abs(expected - actual) <= 1e-9 * Math.max(1, Math.abs(expected), Math.abs(actual))
            : (!Number.isFinite(expected) && !Number.isFinite(actual))
              || (!Number.isFinite(actual) && Math.abs(expected) > 1e14);
          if (!agrees) { evaluate = reference; slow = true; break; }
        }
      }
      const cache = new Map();
      return {
        error: '', slow,
        evaluate: x => {
          if (!Number.isFinite(x)) return NaN;
          const key = Object.is(x, -0) ? '-0' : x;
          if (cache.has(key)) return cache.get(key);
          let result = NaN;
          try { result = evaluate(x); } catch (_) { /* Undefined symbols/domains do not stop other curves. */ }
          if (cache.size >= 12000) cache.clear();
          cache.set(key, result);
          return result;
        }
      };
    }

    _xToPixel(x) { return this._plot.left + ((x - this.bounds.xmin) / (this.bounds.xmax - this.bounds.xmin)) * this._plot.width; }
    _yToPixel(y) { return this._plot.bottom - ((y - this.bounds.ymin) / (this.bounds.ymax - this.bounds.ymin)) * this._plot.height; }
    _pixelToX(px, bounds = this.bounds) { return bounds.xmin + (px - this._plot.left) / this._plot.width * (bounds.xmax - bounds.xmin); }
    _pixelToY(py, bounds = this.bounds) { return bounds.ymax - (py - this._plot.top) / this._plot.height * (bounds.ymax - bounds.ymin); }

    _sampleCurve(fn) {
      const plot = this._plot, bounds = this.bounds;
      const samples = Math.min(fn.slow ? 360 : 1800, Math.max(120, Math.ceil(plot.width / 1.7)));
      const budget = Math.min(fn.slow ? 2400 : 10000, samples * 6);
      const scaleY = plot.height / (bounds.ymax - bounds.ymin);
      const segments = [];
      let evaluations = 0, valid = 0, inRange = 0;
      const isolated = [];
      const sample = x => {
        if (++evaluations > budget) return NaN;
        const y = fn.evaluate(x);
        if (Number.isFinite(y)) {
          ++valid;
          if (y >= bounds.ymin && y <= bounds.ymax) {
            ++inRange;
            if (isolated.length < 20) isolated.push([this._xToPixel(x), this._yToPixel(y)]);
          }
        }
        return y;
      };
      const emit = (xa, ya, xb, yb) => {
        if ((ya < bounds.ymin && yb < bounds.ymin) || (ya > bounds.ymax && yb > bounds.ymax)) return;
        let ta = 0, tb = 1;
        if (ya !== yb) {
          // Half-scaled arithmetic also clips finite values close to Number.MAX_VALUE.
          const denominator = yb / 2 - ya / 2;
          const lower = (bounds.ymin / 2 - ya / 2) / denominator;
          const upper = (bounds.ymax / 2 - ya / 2) / denominator;
          ta = Math.max(0, Math.min(lower, upper)); tb = Math.min(1, Math.max(lower, upper));
          if (!(tb >= ta)) return;
        }
        const x0 = xa + (xb - xa) * ta, x1 = xa + (xb - xa) * tb;
        const y0 = ta === 0 ? ya : yb > ya ? bounds.ymin : bounds.ymax;
        const y1 = tb === 1 ? yb : yb > ya ? bounds.ymax : bounds.ymin;
        const coords = [this._xToPixel(x0), this._yToPixel(y0), this._xToPixel(x1), this._yToPixel(y1)];
        if (coords.every(Number.isFinite)) segments.push(coords);
      };
      const subdivide = (xa, ya, xb, yb, depth) => {
        if (evaluations >= budget) return;
        const xm = xa + (xb - xa) / 2;
        if (xm === xa || xm === xb) return;
        const ym = sample(xm);
        const finiteA = Number.isFinite(ya), finiteB = Number.isFinite(yb), finiteM = Number.isFinite(ym);
        const canSplit = depth < 8 && (xb - xa) / (bounds.xmax - bounds.xmin) * plot.width > 0.08;
        if (!finiteA || !finiteB || !finiteM) {
          if (canSplit && (finiteA || finiteB || finiteM)) {
            subdivide(xa, ya, xm, ym, depth + 1); subdivide(xm, ym, xb, yb, depth + 1);
          }
          return;
        }
        if ((ya > bounds.ymax && yb > bounds.ymax && ym > bounds.ymax)
          || (ya < bounds.ymin && yb < bounds.ymin && ym < bounds.ymin)) return;
        const error = Math.abs(ym - (ya / 2 + yb / 2)) * scaleY;
        const jump = Math.abs(yb / 2 - ya / 2) * scaleY * 2;
        if (canSplit && (error > 0.65 || (jump > plot.height && error > 0.2))) {
          subdivide(xa, ya, xm, ym, depth + 1); subdivide(xm, ym, xb, yb, depth + 1);
          return;
        }
        // Persistent curvature/jumps at subpixel scales indicate a pole or a step.
        // A steep straight line has zero midpoint error and remains drawable.
        if (!Number.isFinite(error) || error > 1.5 || (jump > plot.height * 1.5 && error > 0.5)) return;
        emit(xa, ya, xm, ym); emit(xm, ym, xb, yb);
      };
      let xa = bounds.xmin, ya = sample(xa);
      for (let index = 1; index <= samples && evaluations < budget; index++) {
        const xb = bounds.xmin + (bounds.xmax - bounds.xmin) * index / samples;
        const yb = sample(xb);
        subdivide(xa, ya, xb, yb, 0);
        xa = xb; ya = yb;
      }
      return { segments, valid, inRange, isolated: segments.length ? [] : isolated, evaluations };
    }

    _render(force) {
      if (this._destroyed || (!force && this._document.hidden)) return;
      // Recognize bounds replaced/edited by the external range toolbar.
      if (!validBounds(this.bounds)) this._assignBounds(this._lastValidBounds);
      if (['xmin', 'xmax', 'ymin', 'ymax'].some(key => this.bounds[key] !== this._lastValidBounds[key])) {
        this._autoBounds = false;
        this._lastValidBounds = copyBounds(this.bounds);
        this._sceneDirty = this._probeDirty = true;
      }
      if (!this._ensureSize(force)) return;
      this._prepareEvaluators();
      const key = [this.bounds.xmin, this.bounds.xmax, this.bounds.ymin, this.bounds.ymax,
        this._width, this._height, this._dataVersion].join(',');
      if (key !== this._geometryKey) {
        this._curves = this.functions.map(fn => this._sampleCurve(fn));
        this._geometryKey = key;
        this._sceneDirty = this._probeDirty = true;
        this._updateEmpty();
      }
      if (this._sceneDirty) {
        this._paintScene(this._baseContext);
        this._sceneDirty = false;
      }
      const context = this._context;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      context.drawImage(this._baseCanvas, 0, 0);
      context.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      if (this._probeDirty) this._updateProbe();
      if (this._probe && this._probeData) this._paintProbe(context);
    }

    _paintScene(context) {
      const colors = THEMES[this.theme], plot = this._plot;
      context.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      context.fillStyle = colors.background;
      context.fillRect(0, 0, this._width, this._height);
      this._paintGrid(context);
      context.save();
      context.beginPath(); context.rect(plot.left, plot.top, plot.width, plot.height); context.clip();
      context.lineWidth = 2;
      context.lineCap = 'round'; context.lineJoin = 'round';
      this.functions.forEach((fn, index) => {
        const curve = this._curves[index];
        if (!curve) return;
        context.strokeStyle = context.fillStyle = this._color(fn);
        context.beginPath();
        let previous = null;
        for (const segment of curve.segments) {
          if (!previous || Math.abs(previous[2] - segment[0]) + Math.abs(previous[3] - segment[1]) > 0.01) {
            context.moveTo(segment[0], segment[1]);
          }
          context.lineTo(segment[2], segment[3]);
          previous = segment;
        }
        context.stroke();
        for (const point of curve.isolated) {
          context.beginPath(); context.arc(point[0], point[1], 2, 0, Math.PI * 2); context.fill();
        }
      });
      context.restore();
    }

    _paintGrid(context) {
      const colors = THEMES[this.theme], plot = this._plot, bounds = this.bounds;
      const xstep = Math.max(niceStep(bounds.xmax - bounds.xmin, plot.width, 85),
        Math.max(Math.abs(bounds.xmin), Math.abs(bounds.xmax)) * Number.EPSILON * 8);
      const ystep = Math.max(niceStep(bounds.ymax - bounds.ymin, plot.height, 52),
        Math.max(Math.abs(bounds.ymin), Math.abs(bounds.ymax)) * Number.EPSILON * 8);
      const subdivisions = step => {
        const mantissa = step / Math.pow(10, Math.floor(Math.log10(step)));
        return Math.abs(mantissa - 2) < 1e-6 ? 4 : 5;
      };
      const xticks = ticks(bounds.xmin, bounds.xmax, xstep);
      const yticks = ticks(bounds.ymin, bounds.ymax, ystep);
      const crisp = coordinate => (Math.round(coordinate * this._dpr) + 0.5) / this._dpr;
      const grid = (stepX, stepY, color) => {
        context.beginPath(); context.strokeStyle = color; context.lineWidth = 1 / this._dpr;
        for (const x of ticks(bounds.xmin, bounds.xmax, stepX)) {
          const px = crisp(this._xToPixel(x)); context.moveTo(px, plot.top); context.lineTo(px, plot.bottom);
        }
        for (const y of ticks(bounds.ymin, bounds.ymax, stepY)) {
          const py = crisp(this._yToPixel(y)); context.moveTo(plot.left, py); context.lineTo(plot.right, py);
        }
        context.stroke();
      };
      grid(xstep / subdivisions(xstep), ystep / subdivisions(ystep), colors.minor);
      grid(xstep, ystep, colors.major);
      context.strokeStyle = colors.border; context.lineWidth = 1 / this._dpr;
      context.strokeRect(plot.left, plot.top, plot.width, plot.height);
      context.strokeStyle = colors.axis; context.lineWidth = 1.15;
      context.beginPath();
      if (bounds.xmin <= 0 && bounds.xmax >= 0) {
        const x = crisp(this._xToPixel(0)); context.moveTo(x, plot.top); context.lineTo(x, plot.bottom);
      }
      if (bounds.ymin <= 0 && bounds.ymax >= 0) {
        const y = crisp(this._yToPixel(0)); context.moveTo(plot.left, y); context.lineTo(plot.right, y);
      }
      context.stroke();
      context.fillStyle = colors.text; context.font = '10px ' + FONT;
      context.textAlign = 'center'; context.textBaseline = 'top';
      let previousRight = -Infinity;
      for (const x of xticks) {
        const px = this._xToPixel(x), label = formatNumber(x, xstep);
        const half = context.measureText(label).width / 2;
        if (px - half < 2 || px + half > this._width - 2 || px - half < previousRight + 8) continue;
        context.fillText(label, px, plot.bottom + 8);
        previousRight = px + half;
      }
      context.textAlign = 'right'; context.textBaseline = 'middle';
      for (const y of yticks) context.fillText(formatNumber(y, ystep), plot.left - 8, this._yToPixel(y), plot.left - 10);
      context.fillStyle = colors.strong; context.font = 'italic 11px ' + FONT;
      context.textAlign = 'right'; context.textBaseline = 'bottom';
      context.fillText('x', plot.right - 3, clamp(this._yToPixel(0), plot.top + 18, plot.bottom) - 5);
      context.textAlign = 'left'; context.textBaseline = 'top';
      context.fillText('y', clamp(this._xToPixel(0), plot.left, plot.right - 18) + 5, plot.top + 3);
    }

    _updateEmpty() {
      let title = '', hint = '';
      if (!this.functions.length) {
        title = '输入函数即可绘制图像'; hint = '拖动平移 · 滚轮或双指缩放';
      } else if (!this._curves.some(curve => curve.segments.length || curve.inRange)) {
        if (this.functions.every(fn => fn.error)) {
          title = '暂时无法绘制图像'; hint = this.functions[0].error;
        } else if (this._curves.some(curve => curve.valid)) {
          title = '曲线位于当前视图之外'; hint = '尝试缩小图像或使用适应视图';
        } else {
          title = '当前范围内没有实数点'; hint = '请检查定义域、参数或坐标范围';
        }
      }
      this._empty.hidden = !title;
      if (title) { this._emptyTitle.textContent = title; this._emptyHint.textContent = hint; }
    }

    _setProbe(point, pinned = false) {
      if (!point || point.x < this._plot.left || point.x > this._plot.right || point.y < this._plot.top || point.y > this._plot.bottom) {
        if (!this._probe || !this._probe.pinned) this._hideProbe();
        return;
      }
      this._probe = { px: point.x, py: point.y, pinned };
      this._probeDirty = true;
      this._schedule();
    }

    _hideProbe() {
      if (!this._probe && !this._probeNotified) return;
      this._probe = null;
      this._probeDirty = true;
      this._coordinate.hidden = true;
      this._schedule();
    }

    _updateProbe() {
      this._probeDirty = false;
      if (!this._probe) {
        this._coordinate.hidden = true;
        this._probeData = null;
        if (this._probeNotified) { this._probeNotified = false; this._notifyProbe(null); }
        return;
      }
      const x = this._pixelToX(this._probe.px), y = this._pixelToY(this._probe.py);
      const values = this.functions.map(fn => {
        const value = fn.evaluate(x);
        return { expression: fn.expression, label: fn.label, color: this._color(fn), value: Number.isFinite(value) ? value : null };
      });
      this._probeData = { x, y, values };
      this._coordinate.replaceChildren();
      const coordinates = this._element('div', 'plot-coordinate-position', 'x = ' + formatNumber(x) + '，y = ' + formatNumber(y));
      coordinates.style.fontWeight = '600';
      this._coordinate.appendChild(coordinates);
      for (const value of values) {
        const row = this._element('div', 'plot-coordinate-value', value.label + ' = ' + (value.value === null ? '未定义' : formatNumber(value.value)));
        row.style.color = value.color;
        row.style.overflow = 'hidden'; row.style.textOverflow = 'ellipsis'; row.style.whiteSpace = 'nowrap';
        row.title = row.textContent;
        this._coordinate.appendChild(row);
      }
      this._coordinate.hidden = false;
      // Place the readout opposite the pointer, leaving the curve being inspected clear.
      const onRight = this._probe.px < (this._plot.left + this._plot.right) / 2;
      this._coordinate.style.right = onRight ? '12px' : 'auto';
      this._coordinate.style.left = onRight ? 'auto' : Math.max(12, this._plot.left + 6) + 'px';
      this._probeNotified = true;
      this._notifyProbe({ x, y, values: values.map(value => Object.assign({}, value)) });
    }

    _notifyProbe(data) {
      if (typeof this.onProbe !== 'function' || this._destroyed) return;
      try { this.onProbe(data); } catch (error) {
        if (this._view.console) this._view.console.error('MathSolverGraph onProbe:', error);
      }
    }

    _paintProbe(context) {
      const plot = this._plot, data = this._probeData, colors = THEMES[this.theme];
      context.save(); context.beginPath(); context.rect(plot.left, plot.top, plot.width, plot.height); context.clip();
      context.strokeStyle = colors.probe; context.lineWidth = 1;
      context.setLineDash([4, 4]);
      context.beginPath(); context.moveTo(this._probe.px, plot.top); context.lineTo(this._probe.px, plot.bottom); context.stroke();
      context.setLineDash([]);
      for (const value of data.values) {
        if (value.value === null || value.value < this.bounds.ymin || value.value > this.bounds.ymax) continue;
        const py = this._yToPixel(value.value);
        context.fillStyle = colors.background; context.strokeStyle = value.color; context.lineWidth = 2;
        context.beginPath(); context.arc(this._probe.px, py, 4, 0, Math.PI * 2); context.fill(); context.stroke();
      }
      context.fillStyle = colors.probe;
      context.beginPath(); context.arc(this._probe.px, this._probe.py, 2.3, 0, Math.PI * 2); context.fill();
      context.restore();
    }

    _localPoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return { x: (event.clientX - rect.left) * this._width / rect.width,
        y: (event.clientY - rect.top) * this._height / rect.height };
    }

    _boundedWindow(cx, cy, sx, sy) {
      cx = clamp(cx, -MAX_CENTER, MAX_CENTER); cy = clamp(cy, -MAX_CENTER, MAX_CENTER);
      const minimumX = Math.max(MIN_SPAN, Math.abs(cx) * Number.EPSILON * 32);
      const minimumY = Math.max(MIN_SPAN, Math.abs(cy) * Number.EPSILON * 32);
      // Apply the same limiting factor to both axes to retain the zoom anchor/aspect.
      const ratio = Math.max(minimumX / sx, minimumY / sy, Math.min(1, MAX_SPAN / sx, MAX_SPAN / sy));
      sx *= ratio; sy *= ratio;
      return { xmin: cx - sx / 2, xmax: cx + sx / 2, ymin: cy - sy / 2, ymax: cy + sy / 2 };
    }

    _zoomAt(factor, px, py) {
      if (!validBounds(this.bounds)) this._assignBounds(this._lastValidBounds);
      factor = clamp(factor, 1e-6, 1e6);
      px = clamp(px, this._plot.left, this._plot.right); py = clamp(py, this._plot.top, this._plot.bottom);
      const x = this._pixelToX(px), y = this._pixelToY(py);
      const rx = (px - this._plot.left) / this._plot.width, ry = (py - this._plot.top) / this._plot.height;
      const sx = (this.bounds.xmax - this.bounds.xmin) / factor, sy = (this.bounds.ymax - this.bounds.ymin) / factor;
      const next = this._boundedWindow(x + (0.5 - rx) * sx, y + (ry - 0.5) * sy, sx, sy);
      this._assignBounds(next);
      this._schedule();
    }

    _bindEvents() {
      const canvas = this.canvas;
      this._listen(canvas, 'pointerdown', event => this._pointerDown(event));
      this._listen(canvas, 'pointermove', event => this._pointerMove(event));
      this._listen(canvas, 'pointerup', event => this._pointerEnd(event, false));
      this._listen(canvas, 'pointercancel', event => this._pointerEnd(event, true));
      this._listen(canvas, 'lostpointercapture', event => this._pointerEnd(event, true));
      this._listen(canvas, 'pointerleave', () => {
        if (!this._pointers.size && (!this._probe || !this._probe.pinned)) this._hideProbe();
      });
      this._listen(canvas, 'wheel', event => {
        if (!event.deltaY) return;
        const point = this._localPoint(event);
        if (!point) return;
        event.preventDefault();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this._height : 1);
        this._autoBounds = false;
        this._zoomAt(Math.exp(-clamp(delta, -400, 400) * (event.ctrlKey ? 0.008 : 0.002)), point.x, point.y);
        this._setProbe(point);
      }, { passive: false });
      this._listen(canvas, 'dblclick', event => { event.preventDefault(); this.resetView(); });
      this._listen(canvas, 'keydown', event => this._keyDown(event));
      this._listen(canvas, 'focus', () => { this._focused = true; this._applyTheme(); });
      this._listen(canvas, 'blur', () => { this._focused = false; this.canvas.style.outline = 'none'; });
    }

    _pointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      // A toolbar action or a hidden-to-visible transition may precede ResizeObserver.
      this._needsResize = true;
      if (!this._ensureSize(false)) return;
      const point = this._localPoint(event);
      if (!point) return;
      if (event.cancelable) event.preventDefault();
      try { this.canvas.focus({ preventScroll: true }); } catch (_) { this.canvas.focus(); }
      this._pointers.set(event.pointerId, { x: point.x, y: point.y, type: event.pointerType || 'mouse' });
      try { this.canvas.setPointerCapture(event.pointerId); } catch (_) { /* Synthetic/detached pointers. */ }
      this._autoBounds = false;
      this._startGesture();
      if (this._pointers.size === 1) this._setProbe(point, event.pointerType === 'touch');
      else this._hideProbe();
    }

    _startGesture(moved = false) {
      const pointers = Array.from(this._pointers.entries());
      if (!pointers.length) { this._gesture = null; this.canvas.style.cursor = 'crosshair'; return; }
      const bounds = copyBounds(this.bounds);
      if (pointers.length >= 2) {
        const a = pointers[0][1], b = pointers[1][1];
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this._gesture = { type: 'pinch', ids: [pointers[0][0], pointers[1][0]], bounds,
          distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          anchorX: this._pixelToX(center.x, bounds), anchorY: this._pixelToY(center.y, bounds) };
        this.canvas.style.cursor = 'grabbing';
      } else {
        this._gesture = { type: 'pan', id: pointers[0][0], bounds, startX: pointers[0][1].x,
          startY: pointers[0][1].y, moved, pointerType: pointers[0][1].type };
        this.canvas.style.cursor = moved ? 'grabbing' : 'crosshair';
      }
    }

    _pointerMove(event) {
      const point = this._localPoint(event);
      if (!point) return;
      const pointer = this._pointers.get(event.pointerId);
      if (!pointer) {
        if (event.pointerType !== 'touch' && !this._pointers.size) this._setProbe(point);
        return;
      }
      pointer.x = point.x; pointer.y = point.y;
      if (event.cancelable) event.preventDefault();
      if (!this._gesture) this._startGesture();
      const gesture = this._gesture;
      if (!gesture) return;
      if (gesture.type === 'pinch') {
        const a = this._pointers.get(gesture.ids[0]), b = this._pointers.get(gesture.ids[1]);
        if (!a || !b) { this._startGesture(true); return; }
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        const ratio = gesture.distance / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const sx = (gesture.bounds.xmax - gesture.bounds.xmin) * ratio;
        const sy = (gesture.bounds.ymax - gesture.bounds.ymin) * ratio;
        const rx = (cx - this._plot.left) / this._plot.width, ry = (cy - this._plot.top) / this._plot.height;
        this._assignBounds(this._boundedWindow(gesture.anchorX + (0.5 - rx) * sx, gesture.anchorY + (ry - 0.5) * sy, sx, sy));
        this._hideProbe();
      } else {
        const dx = point.x - gesture.startX, dy = point.y - gesture.startY;
        if (!gesture.moved && Math.hypot(dx, dy) < (gesture.pointerType === 'touch' ? 6 : 3)) {
          this._setProbe(point, gesture.pointerType === 'touch');
          return;
        }
        gesture.moved = true;
        this.canvas.style.cursor = 'grabbing';
        const sx = gesture.bounds.xmax - gesture.bounds.xmin, sy = gesture.bounds.ymax - gesture.bounds.ymin;
        const cx = gesture.bounds.xmin / 2 + gesture.bounds.xmax / 2 - dx / this._plot.width * sx;
        const cy = gesture.bounds.ymin / 2 + gesture.bounds.ymax / 2 + dy / this._plot.height * sy;
        this._assignBounds(this._boundedWindow(cx, cy, sx, sy));
        this._hideProbe();
      }
      this._schedule();
    }

    _pointerEnd(event, cancelled) {
      const pointer = this._pointers.get(event.pointerId);
      if (!pointer) return;
      const gesture = this._gesture;
      const wasTap = !cancelled && gesture && gesture.type === 'pan' && !gesture.moved;
      this._pointers.delete(event.pointerId);
      try { if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); } catch (_) { /* Already released. */ }
      if (wasTap) this._setProbe(this._localPoint(event), pointer.type === 'touch');
      else if (cancelled) this._hideProbe();
      this._startGesture(true);
      this._schedule();
    }

    _clearPointers(clearProbe = true) {
      const ids = Array.from(this._pointers.keys());
      this._pointers.clear(); this._gesture = null;
      for (const id of ids) {
        try { if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id); } catch (_) { /* Already released. */ }
      }
      this.canvas.style.cursor = 'crosshair';
      if (clearProbe) this._hideProbe();
    }

    _keyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (['+', '=', 'Add'].includes(event.key)) { event.preventDefault(); this.zoom(1.25); }
      else if (['-', '_', 'Subtract'].includes(event.key)) { event.preventDefault(); this.zoom(0.8); }
      else if (event.key === '0' || event.key === 'Home') { event.preventDefault(); this.resetView(); }
      else if (event.key === 'Escape') { event.preventDefault(); this._hideProbe(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const b = this.bounds, amount = event.shiftKey ? 0.25 : 0.1;
        const sx = b.xmax - b.xmin, sy = b.ymax - b.ymin;
        const dx = event.key === 'ArrowLeft' ? -sx * amount : event.key === 'ArrowRight' ? sx * amount : 0;
        const dy = event.key === 'ArrowDown' ? -sy * amount : event.key === 'ArrowUp' ? sy * amount : 0;
        this._autoBounds = false;
        this._assignBounds(this._boundedWindow(b.xmin / 2 + b.xmax / 2 + dx, b.ymin / 2 + b.ymax / 2 + dy, sx, sy));
        this._schedule();
      }
    }

    _drawExportLabels(context) {
      const colors = THEMES[this.theme];
      context.font = '10px ' + FONT; context.textBaseline = 'middle'; context.textAlign = 'left';
      let x = 12, y = 20;
      for (const fn of this.functions) {
        const available = Math.max(20, this._width - 44);
        let label = fn.label;
        while (label.length > 1 && context.measureText(label).width > available) label = label.slice(0, -2) + '…';
        const width = context.measureText(label).width + 30;
        if (x + width > this._width - 12 && x > 12) { x = 12; y += 20; }
        context.fillStyle = colors.panel; context.fillRect(x, y - 9, width, 18);
        context.strokeStyle = this._color(fn); context.lineWidth = 2;
        context.beginPath(); context.moveTo(x + 5, y); context.lineTo(x + 19, y); context.stroke();
        context.fillStyle = colors.text; context.fillText(label, x + 24, y);
        x += width + 6;
      }
      if (this._probeData) {
        const lines = ['x = ' + formatNumber(this._probeData.x) + '，y = ' + formatNumber(this._probeData.y)]
          .concat(this._probeData.values.map(value => value.label + ' = ' + (value.value === null ? '未定义' : formatNumber(value.value))));
        const width = Math.min(this._width - 24, Math.max(...lines.map(line => context.measureText(line).width)) + 20);
        const height = lines.length * 17 + 12;
        const left = this._width - width - 12, top = Math.max(40, this._plot.bottom - height - 8);
        context.fillStyle = colors.panel; context.fillRect(left, top, width, height);
        context.strokeStyle = colors.border; context.lineWidth = 1; context.strokeRect(left, top, width, height);
        lines.forEach((line, index) => {
          context.fillStyle = index ? this._probeData.values[index - 1].color : colors.strong;
          context.fillText(line, left + 10, top + 14 + index * 17, width - 20);
        });
      } else if (!this._empty.hidden) {
        context.fillStyle = colors.text; context.textAlign = 'center'; context.font = '12px ' + FONT;
        context.fillText(this._emptyTitle.textContent, this._width / 2, this._height / 2, this._width - 32);
        context.font = '10px ' + FONT;
        context.fillText(this._emptyHint.textContent, this._width / 2, this._height / 2 + 20, this._width - 32);
      }
    }
  }

  global.MathSolverGraph = MathSolverGraph;
})(typeof window !== 'undefined' ? window : globalThis);
