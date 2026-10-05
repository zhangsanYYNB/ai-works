/* Load in the Math Solver page, then await MathSolverBrowserTests.run(). */
(function (root) {
  'use strict';
  async function run() {
    const mf = document.getElementById('expression');
    const app = root.MathSolverApp, editor = root.MathSolverEditor, engine = root.MathSolverEngine;
    if (!mf || !app || !editor) throw new Error('Open math_solver/index.html before running the browser tests.');
    const keyboard = app.getKeyboard();
    const results = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const insert = latex => editor.insert(mf, latex);
    const setup = (latex, position) => {
      app.setFormat('math', false);
      mf.resetUndo();
      mf.value = '';
      mf.value = latex;
      mf.position = position === undefined ? mf.lastOffset : position;
      mf.focus();
    };
    const source = () => engine.normalize(app.sourceFromField());
    const value = scope => engine.evaluateAt(app.sourceFromField(), scope || {});
    function shape(node) {
      if(node.isParenthesisNode) return shape(node.content);
      if(node.isConstantNode) return ['number',node.value];
      if(node.isSymbolNode) return ['symbol',node.name];
      return [node.isOperatorNode?node.fn:node.fn.name,...node.args.map(shape)];
    }
    const same = expected => assert(JSON.stringify(shape(math.parse(source()))) === JSON.stringify(shape(math.parse(engine.normalize(expected)))), source() + ' != ' + expected);
    const near = expected => assert(Math.abs(Number(value()) - expected) < 1e-10, app.sourceFromField() + ' != ' + expected);
    const key = id => {
      const button = document.querySelector('.math-key[data-key="' + id + '"]');
      assert(button, 'Missing keyboard key ' + id);
      button.click();
    };
    function test(name, fn) {
      try { fn(); results.push({ name, passed: true }); }
      catch (error) { results.push({ name, passed: false, error: error.message, latex: mf.value, selection: mf.selection }); }
    }
    keyboard.show('basic');
    test('root plus stays in the radicand', () => {
      setup(''); key('sqrt'); key('2'); key('plus'); key('3'); same('sqrt(2+3)');
    });
    test('root minus/multiply/divide stay in the radicand', () => {
      setup(''); insert('\\sqrt{#0}'); for (const latex of ['2', '-', '1', '\\times', '3', '\\div', '4']) insert(latex);
      same('sqrt(2-1*3/4)');
    });
    test('fraction inside a root and explicit structural exit', () => {
      setup(''); key('sqrt'); key('1'); key('fraction'); key('2'); mf.executeCommand('moveAfterParent'); key('plus'); key('3');
      same('sqrt(1/2+3)'); mf.executeCommand('moveAfterParent'); key('plus'); key('4'); same('sqrt(1/2+3)+4');
    });
    test('fraction numerator retains addition', () => {
      setup(''); insert('\\frac{#0}{#?}'); insert('1'); insert('+'); insert('2'); mf.executeCommand('moveToNextPlaceholder'); insert('3');
      same('(1+2)/3');
    });
    test('fraction denominator retains addition', () => {
      setup('12'); insert('\\frac{#0}{#?}'); insert('2'); insert('+'); insert('3'); same('12/(2+3)');
    });
    test('multiple digits are wrapped together', () => {
      setup('123'); insert('\\frac{#0}{#?}'); insert('7'); same('123/7');
    });
    test('decimal base is wrapped together', () => {
      setup('12.3'); insert('#0^{2}'); near(151.29);
    });
    test('a completed fraction has a nonempty grouped power base', () => {
      setup('\\frac{1}{2}'); insert('#0^{2}'); near(1/4); assert(!mf.value.includes('placeholder'), 'Unexpected empty base');
    });
    test('powers of powers preserve associativity', () => {
      setup('x^{2}'); insert('#0^{3}'); assert(Number(value({x:2})) === 64, app.sourceFromField());
    });
    test('square root wraps a completed fraction', () => {
      setup('\\frac{1}{2}'); insert('\\sqrt{#0}'); same('sqrt((1)/(2))');
    });
    test('nested root is inserted at the current depth', () => {
      setup('\\sqrt{2}',2); insert('\\sqrt{#0}'); near(Math.sqrt(Math.sqrt(2)));
    });
    test('middle-of-root insertion preserves the suffix', () => {
      setup('\\sqrt{2+3}',2); insert('\\frac{#0}{#?}'); insert('4'); near(Math.sqrt(2/4+3));
    });
    test('operator insertion preserves text after the caret', () => {
      setup('\\sqrt{23}',2); insert('+'); same('sqrt(2+3)');
    });
    test('explicit selection is used as the operand', () => {
      setup('x+1'); mf.selection={ranges:[[0,mf.lastOffset]]}; insert('\\sqrt{#0}'); same('sqrt(x+1)');
    });
    test('selected operand in a root is replaced locally', () => {
      setup('\\sqrt{2+3}'); mf.selection={ranges:[[1,2]]}; insert('#0^{2}'); near(Math.sqrt(7));
    });
    test('function argument plus does not leave parentheses', () => {
      setup(''); insert('\\sin\\left(#0\\right)'); insert('x'); insert('+'); insert('1'); same('sin(x+1)');
    });
    test('completed function is used as a power base', () => {
      setup('\\sin\\left(x+1\\right)'); insert('#0^{2}'); assert(Math.abs(Number(value({x:0.2}))-Math.sin(1.2)**2)<1e-10,app.sourceFromField());
    });
    test('absolute value plus remains inside bars', () => {
      setup(''); insert('\\left|#0\\right|'); insert('x'); insert('+'); insert('1'); same('abs(x+1)');
    });
    test('closing parentheses alone exits the fence', () => {
      setup(''); insert('('); insert('2'); insert('+'); insert('3'); insert(')'); insert('+'); insert('4'); near(9);
    });
    test('right parenthesis exits an existing function template', () => {
      setup(''); insert('\\sin\\left(#0\\right)'); insert('2'); insert(')'); insert('+'); insert('3'); same('sin(2)+3');
    });
    test('opening parentheses inside a root preserve its placeholder position', () => {
      setup(''); insert('\\sqrt{#0}'); insert('('); insert('2'); insert('+'); insert('3'); insert(')'); insert('+'); insert('4'); near(3);
    });
    test('nested parentheses close one level at a time', () => {
      setup(''); insert('('); insert('1'); insert('+'); insert('('); insert('2'); insert(')'); insert('+'); insert('3'); insert(')'); insert('+'); insert('4'); near(10);
    });
    test('closing a function outside a nested fraction does not duplicate a fence', () => {
      setup(''); insert('\\sin\\left(#0\\right)'); insert('1'); insert('\\frac{#0}{#?}'); insert('2'); insert(')'); insert('+'); insert('3'); near(Math.sin(0.5)+3);
    });
    test('a percent suffix stays attached when wrapped', () => {
      setup('25\\%'); insert('\\sqrt{#0}'); near(0.5);
    });
    test('multi-digit exponents stay in the exponent', () => {
      setup('x'); insert('#0^{#?}'); insert('1'); insert('2'); same('x^12');
    });
    test('typed exponent operators stay in the exponent', () => {
      setup('x'); insert('#0^{#?}'); mf.executeCommand(['typedText','2+1',{mode:'math'}]); same('x^(2+1)');
      assert(mf.smartSuperscript === false, 'Unexpected smart superscript');
    });
    test('matrix cell fraction does not touch its neighbors', () => {
      setup('\\begin{bmatrix}12&3\\\\4&5\\end{bmatrix}',3); insert('\\frac{#0}{#?}'); insert('7');
      const array=value().toArray(); assert(array[0][0]===12/7 && array[0][1]===3 && array[1][0]===4 && array[1][1]===5, JSON.stringify(array));
    });
    test('matrix cell root preserves all other entries', () => {
      setup('\\begin{bmatrix}2&3\\\\4&5\\end{bmatrix}',2); insert('\\sqrt{#0}');
      const array=value().toArray(); assert(array[0][0]===Math.sqrt(2) && array[0][1]===3 && array[1][0]===4 && array[1][1]===5,JSON.stringify(array));
    });
    test('undo restores the entire wrapped operand', () => {
      setup('12'); insert('\\frac{#0}{#?}'); mf.executeCommand('undo'); assert(mf.value==='12',mf.value);
      mf.executeCommand('redo'); assert(/^\\frac\{12\}/.test(mf.value),mf.value);
    });
    test('no caret probe or extra undo operation is inserted', () => {
      setup('\\sqrt{2}',2); insert('+'); mf.executeCommand('undo'); near(Math.sqrt(2));
      assert(!mf.value.includes('square'),mf.value);
    });
    test('root index and radicand placeholders stay separately editable', () => {
      setup(''); insert('\\sqrt[#?]{#0}'); insert('3'); mf.executeCommand('moveToNextPlaceholder'); insert('8'); near(2);
    });
    test('all keyboard categories insert operators at the current depth', () => {
      for(const group of ['basic','calculus','letters']) {
        keyboard.show(group); setup('\\sqrt{2}',2); key(group==='basic'?'plus':group==='calculus'?'calc-plus':'letters-plus'); insert('3'); same('sqrt(2+3)');
      }
      keyboard.show('basic');
    });
    test('the physical slash handler wraps completed fractions', () => {
      setup('\\frac{1}{2}'); mf.dispatchEvent(new KeyboardEvent('keydown',{key:'/',code:'Slash',bubbles:true,cancelable:true})); insert('3'); near(1/6);
    });
    test('unfinished placeholders are rejected before solving', () => {
      setup(''); insert('\\sqrt{#0}'); let rejected=false;
      try {app.sourceFromField();} catch(error) {rejected=error.message.includes('空位');}
      assert(rejected,'Expected an unfinished-input error');
    });
    test('text powers select an editable exponent placeholder', () => {
      app.setFormat('text',false); app.setInput('12'); keyboard.show('basic'); const raw=document.getElementById('raw-expression');raw.setSelectionRange(2,2);key('power');
      assert(raw.value==='12^(□)' && raw.value.slice(raw.selectionStart,raw.selectionEnd)==='□',raw.value);
      key('2'); document.querySelector('button[aria-label="跳出当前结构"]').click(); key('plus'); key('3');
      assert(Number(engine.evaluateAt(raw.value))===147,raw.value);
    });
    test('text power wraps a compound selection', () => {
      app.setFormat('text',false);app.setInput('2+3');keyboard.show('basic');const raw=document.getElementById('raw-expression');raw.setSelectionRange(0,3);key('square');
      assert(Number(engine.evaluateAt(raw.value))===25,raw.value);
    });
    test('text long-press power variants do not insert an empty base', () => {
      app.setFormat('text',false);app.setInput('12');keyboard.show('basic');const raw=document.getElementById('raw-expression');raw.setSelectionRange(2,2);
      const button=document.querySelector('.math-key[data-key="square"]');button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
      const choice=Array.from(document.querySelectorAll('.key-variant')).find(item=>item.textContent==='x³');assert(choice,'Missing cube variant');choice.click();
      assert(Number(engine.evaluateAt(raw.value))===1728,raw.value);
    });
    setup('');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    test('mobile input stays above the expanded keyboard', () => {
      if(!matchMedia('(max-width:720px)').matches) return;
      const input=document.getElementById('expression-wrap').getBoundingClientRect();
      const top=document.getElementById('math-keyboard').getBoundingClientRect().top;
      assert(input.bottom<=top-8,'Input overlaps keyboard: '+input.bottom+' > '+top);
    });
    const failed=results.filter(item=>!item.passed);
    return { passed: results.length-failed.length, failed: failed.length, total: results.length, results };
  }
  root.MathSolverBrowserTests=Object.freeze({run});
}(typeof globalThis !== 'undefined' ? globalThis : this));
