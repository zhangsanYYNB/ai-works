/* Structured MathLive insertion. Offsets refer to model atoms, never LaTeX characters. */
(function (root) {
  'use strict';
  const SLOT = '\\placeholder{}';
  const OPERATORS = /^(?:[+\-*/=<>:,;()[\]{}]|\\(?:times|cdot|div|pm|mp|le|leq|ge|geq|ne|neq|to|rightarrow))$/;
  const FUNCTIONS = /^\\(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|operatorname)\b/;

  function previousBoundary(mf, offset, depth) {
    let start = offset - 1;
    while (start > 0 && mf.getElementInfo(start)?.depth > depth) start--;
    return Math.max(0, start);
  }
  function operandStart(mf, offset) {
    const info = mf.getElementInfo(offset), atom = info?.latex?.trim();
    if (!atom || OPERATORS.test(atom) || /\\placeholder|^\\(?:int|sum|prod|lim)\b/.test(atom)) return offset;
    let start = previousBoundary(mf, offset, info.depth);
    // Scripts are separate atoms, but belong to their base; a fraction/root includes
    // all its descendants, whose offsets appear before the owning atom.
    if (/^[_^]|^(?:!|\\%)$/.test(atom)) return operandStart(mf, start);
    if (/^[\d.]$/.test(atom)) {
      let previous;
      while (start > 0 && (previous = mf.getElementInfo(start))?.depth === info.depth && /^[\d.]$/.test(previous.latex)) {
        start = previousBoundary(mf, start, info.depth);
      }
    }
    if (/^\\left/.test(atom) && FUNCTIONS.test(mf.getElementInfo(start)?.latex || '')) {
      start = previousBoundary(mf, start, info.depth);
    }
    return start;
  }
  function enclosingFence(mf, closer) {
    let depth = mf.getElementInfo(mf.position)?.depth;
    if (!(depth > 0)) return -1;
    for (let offset = mf.position + 1; offset <= mf.lastOffset; offset++) {
      const info = mf.getElementInfo(offset);
      if (!info || info.depth >= depth) continue;
      if (/^\\left/.test(info.latex || '') && (info.latex.endsWith('\\right' + closer) || info.latex.endsWith('\\right?'))) return offset;
      depth = info.depth;
      if (!depth) break;
    }
    return -1;
  }
  function insert(mf, latex) {
    if (/^[()[\]{}]$/.test(latex) || /^\\[{}]$/.test(latex)) {
      const delimiter = latex.replace(/^\\/, '');
      const closer = { '(': ')', '[': ']', '{': '\\}' }[delimiter];
      if (closer) {
        let selected = mf.getValue(mf.selection, 'latex');
        if (/^\\placeholder(?:\[[^\]]*\])?\{\}$/.test(selected)) selected = '';
        const body = selected || SLOT;
        mf.insert('\\left' + (delimiter === '{' ? '\\{' : delimiter) + body + '\\right' + closer,
          { format: 'latex', selectionMode: selected ? 'after' : 'placeholder', focus: true });
      } else {
        const offset = enclosingFence(mf, delimiter === '}' ? '\\}' : delimiter);
        if (offset >= 0) mf.position = offset;
        else mf.executeCommand(['typedText', delimiter, { mode: 'math' }]);
      }
      mf.focus();
      return;
    }
    if (/#(?:0|\?)/.test(latex)) {
      if (latex.includes('#0') && mf.selectionIsCollapsed) {
        const end = mf.position, start = operandStart(mf, end);
        if (start < end) mf.selection = { ranges: [[start, end]], direction: 'forward' };
      }
      let operand = mf.getValue(mf.selection, 'latex');
      if (/^\\placeholder(?:\[[^\]]*\])?\{\}$/.test(operand)) operand = '';
      if (/^#0(?:\^|!)/.test(latex) && operand && !/^(?:\d+(?:\.\d*)?|\.\d+|[a-zA-Z]|\\[a-zA-Z]+)$/.test(operand)) {
        operand = '\\left(' + operand + '\\right)';
      }
      latex = latex.replace(/#0/g, () => operand || SLOT).replace(/#\?/g, () => SLOT);
    }
    mf.insert(latex, { format: 'latex', insertionMode: 'replaceSelection', selectionMode: latex.includes(SLOT) ? 'placeholder' : 'after', focus: true });
    mf.focus();
  }
  root.MathSolverEditor = Object.freeze({ insert });
}(typeof globalThis !== 'undefined' ? globalThis : this));
