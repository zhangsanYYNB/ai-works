/* Local, pointer-based math keyboard. Long press supports both drag-to-select and tap-to-select. */
(function (root) {
  'use strict';
  const key = (id, label, latex, extra) => Object.assign({ id, label, latex }, extra || {});
  const fn = (name, label, args) => key(name, label || name, '\\operatorname{' + name + '}\\left(' + (args || '#0') + '\\right)', { function: true });
  const trig = name => key(name, name, '\\' + name + '\\left(#0\\right)', { function: true });
  const alt = (label, latex, extra) => Object.assign({ label, latex }, extra || {});
  const functionKeys = [
    key('sin', 'sin', '\\sin\\left(#0\\right)', { function: true, variants: [alt('sin⁻¹', '\\arcsin\\left(#0\\right)'), alt('sinh', '\\sinh\\left(#0\\right)'), alt('asinh', '\\operatorname{asinh}\\left(#0\\right)')] }),
    key('cos', 'cos', '\\cos\\left(#0\\right)', { function: true, variants: [alt('cos⁻¹', '\\arccos\\left(#0\\right)'), alt('cosh', '\\cosh\\left(#0\\right)'), alt('acosh', '\\operatorname{acosh}\\left(#0\\right)')] }),
    key('tan', 'tan', '\\tan\\left(#0\\right)', { function: true, variants: [alt('tan⁻¹', '\\arctan\\left(#0\\right)'), alt('tanh', '\\tanh\\left(#0\\right)'), alt('atanh', '\\operatorname{atanh}\\left(#0\\right)')] }),
    key('ln', 'ln', '\\ln\\left(#0\\right)', { function: true, variants: [alt('log₂', '\\operatorname{log2}\\left(#0\\right)'), alt('log₁₀', '\\operatorname{log10}\\left(#0\\right)')] }),
    key('log', 'logₐ', '\\operatorname{log}\\left(#0,#?\\right)', { function: true, variants: [alt('log₁₀', '\\operatorname{log10}\\left(#0\\right)'), alt('ln', '\\ln\\left(#0\\right)')] }),
    key('exp', 'eˣ', 'e^{#0}', { function: true, variants: [alt('10ˣ', '10^{#0}'), alt('2ˣ', '2^{#0}')] }),
    key('abs', '|x|', '\\left|#0\\right|', { function: true, variants: [alt('sgn', '\\operatorname{sign}\\left(#0\\right)'), alt('⌊x⌋', '\\operatorname{floor}\\left(#0\\right)'), alt('⌈x⌉', '\\operatorname{ceil}\\left(#0\\right)')] }),
    trig('sec'), trig('csc'), trig('cot'), fn('round', 'round', '#0,#?'), fn('floor', '⌊x⌋'), fn('ceil', '⌈x⌉'), fn('mod', 'mod', '#0,#?'),
    fn('gcd', 'gcd', '#0,#?'), fn('lcm', 'lcm', '#0,#?'), fn('combinations', 'nCr', '#0,#?'), fn('permutations', 'nPr', '#0,#?'),
    key('factorial', 'n!', '#0!', { function: true, variants: [alt('Γ(x)', '\\operatorname{gamma}\\left(#0\\right)')] }),
    key('percent', '%', '\\%', { function: true }), key('complex-i', 'i', '\\imaginaryI', { function: true }),
    fn('re', 'Re'), fn('im', 'Im'), fn('conj', 'conj'), fn('arg', 'arg'), fn('complex', 'a+bi', '#0,#?'),
    key('root-fn', 'ⁿ√x', '\\sqrt[#?]{#0}', { function: true }), key('solve-fn', '↵', '', { action: 'solve', submit: true })
  ];
  const groups = {
    basic: { label: '基础', keys: [
      key('7', '7', '7'), key('8', '8', '8'), key('9', '9', '9'),
      key('divide', '÷', '\\div', { function: true, escape: true, variants: [alt('a/b', '\\frac{#0}{#?}'), alt('1/x', '\\frac{1}{#0}')] }),
      key('sqrt', '√', '\\sqrt{#0}', { function: true, variants: [alt('∛', '\\sqrt[3]{#0}'), alt('∜', '\\sqrt[4]{#0}'), alt('ⁿ√', '\\sqrt[#?]{#0}')] }),
      key('square', 'x²', '#0^{2}', { function: true, variants: [alt('x³', '#0^{3}'), alt('xⁿ', '#0^{#?}'), alt('x⁻¹', '#0^{-1}')] }),
      key('backspace', '⌫', '', { action: 'deleteBackward', function: true, aria: '退格，按住连续删除' }),
      key('4', '4', '4'), key('5', '5', '5'), key('6', '6', '6'),
      key('multiply', '×', '\\times', { function: true, escape: true, variants: [alt('·', '\\cdot'), alt('n!', '#0!'), alt('%', '\\%')] }),
      key('lparen', '(', '(', { function: true, variants: [alt('[', '['), alt('{', '\\{'), alt('|x|', '\\left|#0\\right|')] }),
      key('rparen', ')', ')', { function: true, variants: [alt(']', ']'), alt('}', '\\}')] }),
      key('fraction', 'a/b', '\\frac{#0}{#?}', { function: true, variants: [alt('1/x', '\\frac{1}{#0}'), alt('xⁿ', '#0^{#?}')] }),
      key('1', '1', '1'), key('2', '2', '2'), key('3', '3', '3'),
      key('minus', '−', '-', { function: true, escape: true, variants: [alt('±', '\\pm'), alt('−x', '-\\left(#0\\right)')] }),
      key('x', 'x', 'x', { function: true, variants: [alt('y', 'y'), alt('z', 'z'), alt('t', 't'), alt('a', 'a')] }),
      key('power', 'xⁿ', '#0^{#?}', { function: true, variants: [alt('x²', '#0^{2}'), alt('x³', '#0^{3}'), alt('10ˣ', '10^{#0}')] }),
      key('pi', 'π', '\\pi', { function: true, variants: [alt('e', 'e'), alt('i', '\\imaginaryI'), alt('∞', '\\infty')] }),
      key('0', '0', '0'), key('decimal', '.', '.'),
      key('equals', '=', '=', { function: true, escape: true, variants: [alt('≠', '\\ne'), alt('≤', '\\le'), alt('≥', '\\ge')] }),
      key('plus', '+', '+', { function: true, escape: true }),
      key('relation', '<', '<', { function: true, escape: true, variants: [alt('>', '>'), alt('≤', '\\le'), alt('≥', '\\ge'), alt('≠', '\\ne')] }),
      key('comma', ',', ',', { function: true, escape: true, variants: [alt(';', ';'), alt(':', ':'), alt('%', '\\%')] }),
      key('submit', '↵', '', { action: 'solve', submit: true })
    ] },
    functions: { label: '函数', keys: functionKeys },
    calculus: { label: '微积分', keys: [
      key('derivative', 'd/dx', '\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(#0\\right)', { function: true, aria: '插入求导号', variants: [alt('二阶导', '\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(#0\\right)', { mode: 'derivative', order: 2 }), alt('三阶导', '\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(#0\\right)', { mode: 'derivative', order: 3 })] }),
      key('integral', '∫', '\\int_{#?}^{#?}\\left(#0\\right)', { function: true, aria: '插入积分号', variants: [alt('不定积分', '\\int\\left(#0\\right)'), alt('二重积分', '\\int_{#?}^{#?}\\int_{#?}^{#?}\\left(#0\\right)')] }),
      key('limit', 'lim', '\\lim_{#?\\to #?}\\left(#0\\right)', { function: true, aria: '插入极限号', variants: [alt('x→∞', '\\lim_{x\\to #?}\\left(#0\\right)'), alt('x→0⁺', '\\lim_{x\\to #?^{+}}\\left(#0\\right)'), alt('x→0⁻', '\\lim_{x\\to #?^{-}}\\left(#0\\right)')] }),
      key('sum', '∑', '\\sum_{k=#?}^{#?}\\left(#0\\right)', { function: true, aria: '插入求和号',
        variants: [alt('n=1..n', '\\sum_{n=#?}^{#?}\\left(#0\\right)'), alt('i=1..n', '\\sum_{i=#?}^{#?}\\left(#0\\right)'), alt('乘积 ∏', '\\prod_{k=#?}^{#?}\\left(#0\\right)')] }),
      key('product', '∏', '\\prod_{k=#?}^{#?}\\left(#0\\right)', { function: true, aria: '插入连乘号',
        variants: [alt('n=1..n', '\\prod_{n=#?}^{#?}\\left(#0\\right)'), alt('求和 ∑', '\\sum_{k=#?}^{#?}\\left(#0\\right)')] }),
      key('infinity', '∞', '\\infty', { function: true }), key('calc-e', 'e', 'e', { function: true }),
      key('calc-x', 'x', 'x'), key('calc-t', 't', 't'), key('calc-k', 'k', 'k'), key('calc-n', 'n', 'n'), key('calc-power', 'xⁿ', '#0^{#?}', { function: true }), key('calc-sqrt', '√', '\\sqrt{#0}', { function: true }), key('calc-pi', 'π', '\\pi', { function: true }),
      trig('sin'), trig('cos'), trig('tan'), key('calc-ln', 'ln', '\\ln\\left(#0\\right)', { function: true }), key('calc-exp', 'eˣ', 'e^{#0}', { function: true }), key('calc-frac', 'a/b', '\\frac{#0}{#?}', { function: true }), key('calc-abs', '|x|', '\\left|#0\\right|', { function: true }),
      key('calc-lparen', '(', '('), key('calc-rparen', ')', ')'), key('calc-plus', '+', '+'), key('calc-minus', '−', '-'), key('calc-times', '×', '\\times'), key('calc-backspace', '⌫', '', { action: 'deleteBackward', function: true }), key('calc-submit', '↵', '', { action: 'solve', submit: true })
    ] },
    matrix: { label: '矩阵', keys: [
      key('matrix2', '2×2', '\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}', { function: true, aria: '插入二阶矩阵', variants: [alt('3×3', '\\begin{bmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{bmatrix}'), alt('2×3', '\\begin{bmatrix}#?&#?&#?\\\\#?&#?&#?\\end{bmatrix}')] }),
      key('matrix3', '3×3', '\\begin{bmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{bmatrix}', { function: true }),
      key('vector', '向量', '\\left[#?,#?,#?\\right]', { function: true, small: true, variants: [alt('列向量', '\\begin{bmatrix}#?\\\\#?\\\\#?\\end{bmatrix}')] }),
      fn('det', 'det'), fn('inv', 'A⁻¹'), fn('transpose', 'Aᵀ'), fn('trace', 'tr'),
      fn('dot', 'a·b', '#0,#?'), fn('cross', 'a×b', '#0,#?'), fn('norm', '‖v‖'), fn('identity', 'Iₙ', '#?'), fn('diag', 'diag'), fn('zeros', 'Oₙ', '#?,#?'), fn('ones', '1ₙ', '#?,#?'),
      fn('mean', '均值'), fn('median', '中位数'), fn('std', '标准差'), fn('variance', '方差'), fn('min', 'min'), fn('max', 'max'), key('stats-mode', '统计', '', { mode: 'statistics', function: true }),
      key('matrix-open', '[', '['), key('matrix-close', ']', ']'), key('matrix-comma', ',', ','), key('matrix-semi', ';', ';'), key('matrix-times', '×', '\\times'), key('matrix-backspace', '⌫', '', { action: 'deleteBackward', function: true }), key('matrix-submit', '↵', '', { action: 'solve', submit: true })
    ] },
    letters: { label: '字母', keys: [
      ...['x','y','z','a','b','c','t','d','f','g','h','k','m','n'].map(c => key('letter-'+c, c, c)),
      key('alpha', 'α', '\\alpha', { variants: [alt('β', '\\beta'), alt('γ', '\\gamma')] }), key('beta', 'β', '\\beta'), key('theta', 'θ', '\\theta', { variants: [alt('φ', '\\phi'), alt('ω', '\\omega')] }), key('lambda', 'λ', '\\lambda'), key('letter-pi', 'π', '\\pi'), key('letter-e', 'e', 'e'), key('letter-i', 'i', '\\imaginaryI'),
      key('letters-lparen', '(', '('), key('letters-rparen', ')', ')'), key('letters-equals', '=', '='), key('letters-plus', '+', '+'), key('letters-minus', '−', '-'), key('letters-backspace', '⌫', '', { action: 'deleteBackward', function: true }), key('letters-submit', '↵', '', { action: 'solve', submit: true })
    ] }
  };

  class MathSolverKeyboard {
    constructor(element, options) {
      this.element = element;
      this.options = options || {};
      this.group = 'basic';
      this.visible = true;
      this.hold = null;
      this.popup = null;
      this.mobile = matchMedia('(max-width: 720px)');
      this.onWindowResize = () => this.syncLayout();
      this.onOutsideDown = event => { if (this.popup && !this.popup.contains(event.target) && !event.target.closest('.math-key')) this.closePopup(); };
      this.onEscape = event => { if (event.key === 'Escape') { this.closePopup(); if (this.mobile.matches) this.hide(); } };
      window.addEventListener('resize', this.onWindowResize);
      document.addEventListener('pointerdown', this.onOutsideDown);
      document.addEventListener('keydown', this.onEscape);
      this.render();
      if (this.mobile.matches) this.hide();
    }
    render() {
      this.cancelHold();
      this.closePopup();
      this.element.replaceChildren();
      this.element.classList.toggle('collapsed', !this.visible);
      if (!this.visible) {
        const show = document.createElement('button');
        show.type = 'button'; show.className = 'keyboard-show'; show.textContent = '⌨  打开数学键盘'; show.setAttribute('aria-expanded', 'false');
        show.addEventListener('click', () => this.show()); this.element.append(show); this.syncLayout(); return;
      }
      const top = document.createElement('div'); top.className = 'keyboard-top';
      const tabs = document.createElement('div'); tabs.className = 'keyboard-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '键盘分类');
      for (const [name, group] of Object.entries(groups)) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = group.label;
        button.dataset.keyboardTab = name; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(name === this.group));
        if (name === this.group) button.className = 'active';
        button.addEventListener('pointerdown', e => e.preventDefault());
        button.addEventListener('click', () => { this.group = name; this.render(); }); tabs.append(button);
      }
      const close = document.createElement('button'); close.type = 'button'; close.className = 'keyboard-close'; close.textContent = '收起 ⌄'; close.setAttribute('aria-label', '收起数学键盘'); close.addEventListener('click', () => this.hide());
      top.append(tabs, close);
      const grid = document.createElement('div'); grid.className = 'keyboard-grid';
      for (const item of groups[this.group].keys) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'math-key'; button.textContent = item.label; button.dataset.key = item.id;
        button.setAttribute('aria-label', item.aria || item.label + (item.variants ? '，长按显示更多' : ''));
        if (item.function) button.classList.add('key-function');
        if (item.small || item.label.length > 5) button.classList.add('key-small');
        if (item.submit) button.classList.add('key-submit');
        if (item.variants) { button.classList.add('has-variants'); button.setAttribute('aria-haspopup', 'menu'); }
        button.addEventListener('contextmenu', e => e.preventDefault());
        button.addEventListener('pointerdown', e => this.pointerDown(e, button, item));
        button.addEventListener('pointermove', e => this.pointerMove(e));
        button.addEventListener('pointerup', e => this.pointerUp(e));
        button.addEventListener('pointercancel', () => { this.cancelHold(); this.closePopup(); });
        button.addEventListener('lostpointercapture', () => { if (this.hold && !this.hold.released) this.cancelHold(); });
        button.addEventListener('click', e => { if (e.detail === 0 && !this.popup) this.activate(item); });
        button.addEventListener('keydown', e => { if (item.variants && ['ArrowUp', 'ContextMenu'].includes(e.key)) { e.preventDefault(); this.openPopup(button, item, true); } });
        grid.append(button);
      }
      const bottom = document.createElement('div'); bottom.className = 'keyboard-bottom';
      for (const [label, command, aria] of [['↶','undo','撤销'],['↷','redo','重做'],['←','moveToPreviousChar','光标左移'],['→','moveToNextChar','光标右移'],['⇥','moveToNextPlaceholder','下一处占位']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.title = aria; button.setAttribute('aria-label', aria);
        button.addEventListener('pointerdown', e => e.preventDefault());
        button.addEventListener('click', () => { if (this.options.onCommand) this.options.onCommand(command); }); bottom.append(button);
      }
      const hint = document.createElement('span'); hint.className = 'keyboard-help'; hint.textContent = '长按角标键，滑动选择更多符号'; bottom.append(hint);
      this.element.append(top, grid, bottom); this.syncLayout();
    }
    activate(item) {
      if (item.mode && this.options.onMode) this.options.onMode(item.mode, item);
      if (item.action === 'solve') { if (this.options.onSolve) this.options.onSolve(); }
      else if (item.action) { if (this.options.onCommand) this.options.onCommand(item.action); }
      else if (item.latex && this.options.onInsert) this.options.onInsert(item.latex, item);
    }
    pointerDown(event, button, item) {
      if (event.button !== 0 || this.hold) return;
      event.preventDefault(); this.closePopup();
      this.hold = { id: event.pointerId, x: event.clientX, y: event.clientY, button, item, moved: false, long: false, repeated: false, released: false };
      button.classList.add('pressed');
      try { button.setPointerCapture(event.pointerId); } catch (_) { /* keyboard activation still works */ }
      this.timer = setTimeout(() => {
        if (!this.hold || this.hold.moved) return;
        if (item.variants) { this.hold.long = true; this.openPopup(button, item, false); }
        else if (item.action === 'deleteBackward') {
          this.hold.repeated = true; this.activate(item); this.repeat = setInterval(() => this.activate(item), 85);
        }
      }, 430);
    }
    pointerMove(event) {
      if (!this.hold || event.pointerId !== this.hold.id) return;
      if (this.popup) {
        const under = document.elementFromPoint(event.clientX, event.clientY);
        const choice = under && under.closest('.key-variant');
        this.selectedIndex = choice && this.popup.contains(choice) ? Number(choice.dataset.variantIndex) : -1;
        for (const button of this.popup.children) button.classList.toggle('selected', Number(button.dataset.variantIndex) === this.selectedIndex);
      } else if (Math.hypot(event.clientX - this.hold.x, event.clientY - this.hold.y) > 16) {
        this.hold.moved = true; clearTimeout(this.timer); clearInterval(this.repeat); this.hold.button.classList.remove('pressed');
      }
    }
    pointerUp(event) {
      if (!this.hold || event.pointerId !== this.hold.id) return;
      event.preventDefault();
      const hold = this.hold; hold.released = true;
      const shouldInsert = !hold.moved && !hold.long && !hold.repeated;
      const selected = this.popup && this.selectedIndex >= 0 ? this.variants[this.selectedIndex] : null;
      this.cancelHold();
      if (hold.long) { if (selected) { this.activate(selected); this.closePopup(); } }
      else if (shouldInsert) this.activate(hold.item);
    }
    openPopup(button, item, keyboard) {
      this.closePopup();
      this.variants = [item].concat(item.variants || []); this.selectedIndex = -1;
      this.popup = document.createElement('div'); this.popup.className = 'key-variants'; this.popup.setAttribute('role', 'menu'); this.popup.setAttribute('aria-label', item.label + '的更多符号');
      for (const [index, variant] of this.variants.entries()) {
        const option = document.createElement('button'); option.type = 'button'; option.className = 'key-variant'; option.setAttribute('role', 'menuitem'); option.dataset.variantIndex = index;
        const text = document.createElement('span'); text.textContent = variant.label; if (variant.label.length > 3) text.className = 'variant-small'; option.append(text);
        option.addEventListener('click', () => { this.activate(variant); this.closePopup(); });
        option.addEventListener('keydown', e => {
          if (e.key === 'Escape') { this.closePopup(); button.focus(); }
          else if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + this.variants.length) % this.variants.length; this.popup.children[next].focus(); }
        });
        this.popup.append(option);
      }
      document.body.append(this.popup);
      const anchor = button.getBoundingClientRect(), rect = this.popup.getBoundingClientRect();
      this.popup.style.left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, anchor.left + anchor.width / 2 - rect.width / 2)) + 'px';
      this.popup.style.top = Math.max(8, anchor.top - rect.height - 8) + 'px';
      button.setAttribute('aria-expanded', 'true'); this.popupAnchor = button;
      if (keyboard) this.popup.firstElementChild.focus();
    }
    closePopup() {
      if (this.popup) this.popup.remove(); this.popup = null;
      if (this.popupAnchor) this.popupAnchor.setAttribute('aria-expanded', 'false'); this.popupAnchor = null;
      this.selectedIndex = -1;
    }
    cancelHold() {
      clearTimeout(this.timer); clearInterval(this.repeat);
      if (this.hold) {
        const { button, id } = this.hold;
        this.hold = null; button.classList.remove('pressed');
        try { if (button.hasPointerCapture(id)) button.releasePointerCapture(id); } catch (_) { /* already released */ }
      }
    }
    syncLayout() {
      const mobileOpen = this.visible && this.mobile.matches;
      this.element.classList.toggle('mobile-open', mobileOpen);
      document.body.classList.toggle('keyboard-open', mobileOpen);
      if (mobileOpen) {
        requestAnimationFrame(() => { document.documentElement.style.setProperty('--keyboard-height', this.element.getBoundingClientRect().height + 'px'); });
      }
      if (this.options.onVisibility) this.options.onVisibility(this.visible, mobileOpen);
    }
    show(group) { if (group && groups[group]) this.group = group; this.visible = true; this.render(); if (this.options.onFocus) this.options.onFocus(); }
    hide() { this.visible = false; this.render(); }
    destroy() {
      this.cancelHold(); this.closePopup(); window.removeEventListener('resize', this.onWindowResize);
      document.removeEventListener('pointerdown', this.onOutsideDown); document.removeEventListener('keydown', this.onEscape);
      document.body.classList.remove('keyboard-open'); this.element.replaceChildren();
    }
  }
  root.MathSolverKeyboard = MathSolverKeyboard;
}(typeof globalThis !== 'undefined' ? globalThis : this));
