/* Math Solver UI — local storage, MathLive input, worker solving, and Canvas plotting. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const all = selector => Array.from(document.querySelectorAll(selector));
  const engine = window.MathSolverEngine;
  const M = window.MathLive;
  const catalog = window.MathSolverCatalog;
  const COLORS = ['#078361', '#4975c6', '#d68a35', '#9673c4', '#de637c', '#269aab'];
  const STORAGE = 'math-solver-v1';
  const modeLabels = {auto:'智能求解',evaluate:'科学计算',simplify:'化简',expand:'展开',factor:'因式分解',solve:'方程与不等式',derivative:'求导',integral:'积分',limit:'极限',matrix:'矩阵与向量',statistics:'统计',units:'单位换算'};
  const saved = readStorage();
  const state = {view:'solver',format:'math',mode:'auto',angle:saved.angle === 'deg' ? 'deg' : 'rad',precision:[6,10,14].includes(saved.precision) ? saved.precision : 10,
    theme:saved.theme === 'dark' ? 'dark' : 'light',history:Array.isArray(saved.history) ? saved.history.filter(validRecord).slice(0,60) : [],
    current:null,currentOptions:null,currentInput:'',currentRecord:null,busy:false,request:0,resultGraph:null,fullGraph:null,
    functions:[{expression:'sin(x)',label:'sin(x)',color:COLORS[0]}],parameters:{},practice:null,historyTab:'all',table:null,fullTable:null};
  let worker = null, workerDisabled = location.protocol === 'file:', jobId = 0;
  const pending = new Map();
  let toastTimer, graphTimer;
  let keyboard;

  function make(tag, className, text) { const el=document.createElement(tag); if(className) el.className=className; if(text !== undefined) el.textContent=text; return el; }
  function validRecord(record) { return record && typeof record.id === 'string' && typeof record.input === 'string' && record.input.length <= 1200 && typeof record.answer === 'string' && record.options && typeof record.options === 'object'; }
  function readStorage() { try { return JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch (_) { return {}; } }
  function store() { try { localStorage.setItem(STORAGE,JSON.stringify({angle:state.angle,precision:state.precision,theme:state.theme,history:state.history})); } catch (_) { /* private mode/storage full: the calculator remains usable */ } }
  function toast(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600); }
  function safeSource() { try { return currentInput(); } catch (_) { return null; } }
  // MathLive emits "input" asynchronously, so a message shown right after a failed solve
  // was erased before it could be read. Keep it until the expression really changes.
  let errorSource = null;
  function showError(message) { $('input-error').textContent=message; $('input-error').hidden=false; errorSource=safeSource(); }
  function clearError() { $('input-error').hidden=true; $('input-error').textContent=''; errorSource=null; }
  function mathDisplay(element, latex, fallback) {
    element.replaceChildren();
    if (!latex || !M || latex.length > 18000) { element.textContent=fallback || latex || ''; return; }
    try { element.innerHTML=M.convertLatexToMarkup(latex,{letterShapeStyle:'tex',defaultMode:'math'}); }
    catch (_) { element.textContent=fallback || latex; }
  }
  /* MathLive writes \operatorname{sum} as "s u m". Word boundaries cannot be used to find
   * the name again because the preceding token may be a digit ("2s u m"), which silently
   * turned every upright operator into a product of letters. */
  function collapseOperatorNames(ascii, latex) {
    for (const match of latex.matchAll(/\\(?:operatorname|mathrm)\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)) {
      const name=match[1];
      if(name.length<2) continue;
      const spaced=Array.from(name).join('\\s*');
      ascii=ascii.replace(new RegExp(spaced+'(?=\\s*\\()','g'),name)
                 .replace(new RegExp(spaced+'(?![a-zA-Z0-9_])','g'),name);
    }
    return ascii;
  }
  function latexFor(text) { try { return engine.toLatex(text); } catch (_) { try { return M.convertAsciiMathToLatex(text); } catch (_) { return ''; } } }
  function sourceFromField() {
    const mf=$('expression'), latex=mf.value || '';
    if (!latex.trim()) return '';
    if(/[?□▢]/.test(latex) || /\\placeholder/.test(latex)) throw new Error('请先填完公式中的空位，再开始求解。Tab 或键盘下方 ⇥ 可以跳到下一处空位。');
    // MathLive exports \int_a^b as a detached "int _a^(b)", so calculus notation is read
    // from the LaTeX itself and handed to the engine as an explicit command.
    const translated=engine.fromLatex(latex,{variable:$('variable').value.trim()});
    if(translated!==null) return translated;
    let ascii=collapseOperatorNames(mf.getValue('ascii-math'), latex);
    return ascii.replace(/\\text\{([^}]*)\}/g,'$1').replace(/\u200b/g,'').trim();
  }
  function currentInput() { return state.format === 'text' ? $('raw-expression').value.trim() : sourceFromField(); }
  function editorLatex(text) { return M.convertAsciiMathToLatex(text); }
  function setFormat(format, focus) {
    if(format === state.format) { if(focus) focusEditor(); return; }
    let source='';
    try { source=currentInput(); } catch (_) { source=state.format==='text' ? $('raw-expression').value : $('expression').getValue('ascii-math'); }
    if(format === 'math' && (source.includes('\n') || /;/.test(source) && !source.includes('[') || /\bto\b/.test(source))) { toast('方程组和单位换算请使用文本输入。'); return; }
    state.format=format;
    if(format==='text') $('raw-expression').value=source;
    else { try { $('expression').value=editorLatex(source); } catch (_) { state.format='text'; toast('这道题适合使用文本输入。'); } }
    $('expression').hidden=state.format==='text'; $('raw-expression').hidden=state.format!=='text';
    $('input-format').textContent=state.format==='text' ? '公式输入' : '文本输入';
    $('input-format').setAttribute('aria-pressed',String(state.format==='text'));
    if(state.format==='text' && matchMedia('(max-width:720px)').matches) keyboard?.hide();
    updateInputHint(); if(focus) focusEditor();
  }
  function setInput(text, options) {
    const opts=options || {};
    const preferText=opts.text || /[;\n]|\bto\b|\[|\b(?:sum|product|combinations|permutations|gcd|lcm)\(/.test(text);
    if (preferText) { if(state.format!=='text') setFormat('text',false); $('raw-expression').value=text; }
    else if(state.format==='math') { try { $('expression').value=opts.latex || editorLatex(text); } catch (_) { setFormat('text',false); $('raw-expression').value=text; } }
    else $('raw-expression').value=text;
    clearError(); updateInputHint();
  }
  function focusEditor() { (state.format==='text' ? $('raw-expression') : $('expression')).focus(); }
  function updateInputHint() {
    let source=''; try { source=currentInput(); } catch (_) { source=''; }
    $('input-hint').textContent=source ? (state.format==='text' ? '支持函数、矩阵与多行方程；Shift + Enter 换行' : '方向键移动光标，Tab 跳到下一处空位') : '输入式子，或试试下方的例题';
  }
  // Only a real edit clears the error: MathLive also emits "input" when the selection
  // moves, which used to erase the message right after a failed solve.
  function inputChanged() {
    updateInputHint();
    if (!$('input-error').hidden && safeSource() !== errorSource) clearError();
  }
  function setMode(mode, extra) {
    if(!Object.prototype.hasOwnProperty.call(modeLabels,mode)) mode='auto';
    state.mode=mode; $('operation').value=mode;
    const parent=['expand','factor'].includes(mode) ? 'simplify' : ['integral','limit'].includes(mode) ? 'derivative' : mode;
    all('#mode-nav [data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===parent));
    const calculus=['derivative','integral','limit'].includes(mode), algebra=['solve','simplify','expand','factor'].includes(mode);
    $('advanced-options').hidden=!(calculus || algebra);
    $('order-label').hidden=mode!=='derivative';
    $('root-lower-label').hidden=$('root-upper-label').hidden=mode!=='solve';
    $('lower-label').hidden=$('upper-label').hidden=mode!=='integral';
    $('point-label').hidden=$('direction-label').hidden=mode!=='limit';
    const hints={
      solve:'多项式与有理方程优先精确求解，其他单变量方程在设置的区间内搜索实根。线性方程组用分号分隔，例如 2x+y=7; x-y=2。',
      derivative:'输入要微分的函数，再选择变量和阶数。三角函数的导数会遵循当前 RAD / DEG 设置。',
      integral:'上下限同时留空为不定积分，同时填写为定积分，例如下限 0，上限 pi。',
      limit:'输入函数，设置趋近点与方向；无穷远可输入 Infinity 或 -Infinity。',
      statistics:'输入逗号分隔的数据，例如 2,4,4,5,7；将同时显示总体与样本统计量。',
      matrix:'输入 [1,2;3,4] 或 [[1,2],[3,4]]。可使用 det、inv、transpose、dot、cross、norm。',
      units:'输入数值、原单位和目标单位，例如 12 inch to cm、32 degF to degC、100 km/h to m/s。'
    };
    $('mode-hint').hidden=!hints[mode]; $('mode-hint').textContent=hints[mode] || '';
    if(['statistics','units'].includes(mode) && state.format!=='text') setFormat('text',false);
    if(extra) {
      if(extra.order) $('order').value=String(extra.order);
      if(extra.definite) { $('lower').value='0'; $('upper').value='1'; }
      if(extra.point !== undefined) $('limit-point').value=extra.point;
      if(extra.direction) $('limit-direction').value=extra.direction;
    }
    renderExamples(); clearError();
  }
  function setAngle(angle) {
    state.angle=angle==='deg' ? 'deg' : 'rad';
    all('[data-angle]').forEach(button=>{const active=button.dataset.angle===state.angle; button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    state.fullGraph?.setAngle(state.angle);
    // A solved result keeps its original angle until it is solved again.
    updateFullTable(); store();
  }
  function setTheme(theme) {
    state.theme=theme==='dark' ? 'dark' : 'light'; document.documentElement.dataset.theme=state.theme;
    $('theme-button').setAttribute('aria-label',state.theme==='dark' ? '切换浅色主题' : '切换深色主题');
    document.querySelector('meta[name="theme-color"]').content=state.theme==='dark' ? '#101a19' : '#087f5b';
    const palette=state.theme==='dark' ? ['#63d5a6','#8bb9ff','#efb369','#bf99ef','#f093ac','#68ced9'] : COLORS;
    state.functions=state.functions.map((fn,index)=>({...fn,color:palette[index%palette.length]}));
    if(state.resultFunctions) {state.resultFunctions=state.resultFunctions.map((fn,index)=>({...fn,color:palette[index%palette.length]}));state.resultGraph?.setFunctions(state.resultFunctions);renderLegend($('result-graph-legend'),state.resultFunctions);}
    state.fullGraph?.setTheme(state.theme); state.resultGraph?.setTheme(state.theme);
    if(state.fullGraph) {renderFunctionList();plotFunctions();} store();
  }
  function setView(view) {
    state.view=['solver','graph','reference'].includes(view) ? view : 'solver';
    for(const name of ['solver','graph','reference']) { $(''+name+'-view').hidden=name!==state.view; $(''+name+'-view').classList.toggle('active',name===state.view); }
    all('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===state.view));
    all('#mode-nav [data-mode]').forEach(button=>button.classList.toggle('active',state.view==='solver' && button.dataset.mode===(['expand','factor'].includes(state.mode) ? 'simplify' : ['integral','limit'].includes(state.mode) ? 'derivative' : state.mode)));
    if(state.view!=='solver') keyboard?.hide();
    if(state.view==='graph') { initializeFullGraph(); requestAnimationFrame(()=>state.fullGraph?.draw()); }
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function readOptions() {
    const options={mode:state.mode,variable:$('variable').value.trim() || 'x',angle:state.angle,precision:state.precision,order:Number($('order').value),
      lower:$('lower').value.trim(),upper:$('upper').value.trim(),point:$('limit-point').value.trim() || '0',direction:$('limit-direction').value,rootLower:$('root-lower').value.trim() || '-10',rootUpper:$('root-upper').value.trim() || '10'};
    return options;
  }
  function applyOptions(options) {
    const opts=options || {}; setMode(opts.mode || 'auto');
    $('variable').value=opts.variable || 'x'; $('order').value=String(opts.order || 1);
    $('lower').value=opts.lower || ''; $('upper').value=opts.upper || ''; $('limit-point').value=opts.point || '0'; $('limit-direction').value=opts.direction || 'both';
    $('root-lower').value=opts.rootLower || '-10'; $('root-upper').value=opts.rootUpper || '10';
    if(opts.angle) setAngle(opts.angle);
  }
  // Reuse the cache-busting query of the engine script the page loaded so the worker never
  // falls back to a stale cached copy.
  function engineVersion() {
    const script = document.querySelector('script[src*="engine.js"]');
    const query = script ? new URL(script.src, document.baseURI).search : '';
    return query || '?v=1';
  }
  function ensureWorker() {
    if(worker || workerDisabled) return;
    try {
      worker=new Worker(new URL('js/solver-worker.js'+engineVersion(),document.baseURI));
      worker.addEventListener('message',event=>{
        const job=pending.get(event.data.id); if(!job) return;
        clearTimeout(job.timer); pending.delete(event.data.id);
        event.data.error ? job.reject(new Error(event.data.error)) : job.resolve(event.data.result);
      });
      worker.addEventListener('error',()=>{
        const jobs=Array.from(pending.values()); pending.clear(); worker?.terminate(); worker=null; workerDisabled=true;
        for(const job of jobs) { clearTimeout(job.timer); try { job.resolve(engine.solve(job.input,job.options)); } catch(error) { job.reject(error); } }
      });
    } catch (_) { worker=null; workerDisabled=true; }
  }
  function solveAsync(input, options) {
    ensureWorker();
    if(!worker) return new Promise((resolve,reject)=>setTimeout(()=>{try {resolve(engine.solve(input,options));}catch(error){reject(error);}},20));
    return new Promise((resolve,reject)=>{
      const id=++jobId;
      const timer=setTimeout(()=>{
        worker?.terminate(); worker=null;
        for(const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error('计算超过 8 秒，已停止。请降低次数或拆分复杂表达式。')); }
        pending.clear();
      },8000);
      pending.set(id,{resolve,reject,timer,input,options});worker.postMessage({id,input,options});
    });
  }
  async function solve() {
    let input;
    try { input=currentInput(); } catch(error) { showError(error.message); return null; }
    if(!input) { showError('先输入一个数学问题，或选择例题。'); focusEditor(); return null; }
    if(input.length>1200) { showError('表达式最多 1200 个字符，请拆分后计算。'); return null; }
    if(state.busy) return null;
    const options=readOptions(), request=++state.request;
    state.busy=true; clearError(); $('solve-button').classList.add('loading'); $('solve-button').disabled=true;
    $('solve-button').firstChild.textContent='正在计算 '; $('expression-wrap').setAttribute('aria-busy','true');
    try {
      const result=await solveAsync(input,options);
      if(request!==state.request) return null;
      state.current=result; state.currentInput=input; state.currentOptions={...options};
      recordResult(result,input,options); renderResult(result); createPractice(result);
      if(matchMedia('(max-width:1000px)').matches) { if(matchMedia('(max-width:720px)').matches) keyboard.hide(); $('answer-card').scrollIntoView({behavior:'smooth',block:'start'}); }
      return result;
    } catch(error) { if(request===state.request) showError(error.message || '计算失败，请检查表达式。'); return null; }
    finally { if(request===state.request) {state.busy=false;$('solve-button').classList.remove('loading');$('solve-button').disabled=false;$('solve-button').firstChild.textContent='求解 ';$('expression-wrap').setAttribute('aria-busy','false');} }
  }
  function recordResult(result,input,options) {
    const existing=state.history.find(record=>record.input===input && JSON.stringify(record.options)===JSON.stringify(options));
    const record={id:existing?.id || (Date.now().toString(36)+Math.random().toString(36).slice(2,7)),input,options:{...options},answer:result.answerText || result.exact || '',title:result.title || modeLabels[options.mode],time:Date.now(),saved:!!existing?.saved};
    state.history=state.history.filter(item=>item.id!==record.id); state.history.unshift(record); state.history=state.history.slice(0,60);state.currentRecord=record.id;store();updateSavedButton();
  }
  function renderResult(result) {
    $('welcome-card').hidden=true; $('answer-card').hidden=false;
    $('result-title').textContent=result.title || '计算结果';
    if(result.kind==='units') $('result-problem').textContent=result.input;
    else mathDisplay($('result-problem'),latexFor(result.normalized || result.input),result.input);
    mathDisplay($('result-answer'),result.answerLatex,result.answerText || result.exact);
    $('result-approximate').hidden=!result.approximate;
    $('result-approximate').textContent=result.approximate ? '近似值  '+result.approximate : '';
    $('result-notes').replaceChildren();
    for(const note of result.notes || []) {
      const paragraph=make('p');
      const match=/^(.*?：)\s*(.+?)(。?)$/.exec(note);
      if(match && /[\\{}]/.test(match[2])) {
        paragraph.append(document.createTextNode(match[1]+' '));
        const formula=make('span','inline-math');mathDisplay(formula,match[2],match[2]);paragraph.append(formula,document.createTextNode(match[3]));
      } else paragraph.textContent=note;
      $('result-notes').append(paragraph);
    }
    $('steps-list').replaceChildren();
    (result.steps || []).forEach((step,index)=>{
      const row=make('div','solution-step'), number=make('span','step-number',String(index+1)), content=make('div');
      content.append(make('h3','',step.title || '计算'),make('p','',step.explanation || ''));
      if(step.latex) {const formula=make('div','math-display');mathDisplay(formula,step.latex);content.append(formula);}
      row.append(number,content);$('steps-list').append(row);
    });
    if(!result.steps?.length) $('steps-list').append(make('p','muted','此表达式由本地数学引擎直接计算。'));
    $('data-table-wrap').replaceChildren(); $('stats-chart').replaceChildren();
    if(result.table) { const wrapper=make('div','table-scroll');wrapper.append(buildTable(result.table.headers,result.table.rows));$('data-table-wrap').append(wrapper); }
    if(result.kind==='statistics') renderStatisticsChart(result.normalized);
    const palette=state.theme==='dark' ? ['#63d5a6','#8bb9ff','#efb369','#bf99ef','#f093ac','#68ced9'] : COLORS;
    const graphs=(result.graphs || []).map((fn,index)=>({...fn,color:palette[index%palette.length]}));
    state.resultFunctions=graphs;
    const graphButton=document.querySelector('[data-result-tab="graph"]'),tableButton=document.querySelector('[data-result-tab="table"]');
    graphButton.disabled=!graphs.length;tableButton.disabled=!graphs.length;
    graphButton.title=tableButton.title=graphs.length ? '' : '此结果没有可绘制的单变量实函数';
    state.resultGraph?.destroy(); state.resultGraph=null;$('result-plot').replaceChildren();renderLegend($('result-graph-legend'),graphs);
    renderRelated(result);selectResultTab('steps');
    state.table=null; $('value-table').replaceChildren();
  }
  function renderRelated(result) {
    const el=$('related-actions');el.replaceChildren();
    for(const related of result.related || []) {
      const button=make('button','secondary-button',related.label);button.type='button';
      button.addEventListener('click',()=>{setMode(related.mode || 'auto');setInput(related.input);solve();});el.append(button);
    }
    const exportButton=make('button','secondary-button','导出步骤 ↓');exportButton.type='button';exportButton.addEventListener('click',exportSolution);
    const share=make('button','secondary-button','复制题目链接');share.type='button';share.addEventListener('click',shareProblem);
    el.append(exportButton,share);
    if(result.table) {const data=make('button','secondary-button','导出数据 CSV ↓');data.type='button';data.addEventListener('click',()=>download(csvText(result.table),'数学计算数据.csv','text/csv;charset=utf-8'));el.append(data);}
  }
  function renderStatisticsChart(source) {
    try {
      const vector=engine.evaluateAt(source.trim().startsWith('[') ? source : '['+source+']',{},state.currentOptions);
      const values=(vector.toArray ? vector.toArray() : vector).map(Number).sort((a,b)=>a-b);
      const counts=new Map();for(const value of values) counts.set(value,(counts.get(value) || 0)+1);
      let buckets=[...counts].map(([value,count])=>({label:formatValue(value,4),count}));
      if(buckets.length>12) {const min=values[0],max=values.at(-1),step=(max-min)/8;buckets=Array.from({length:8},(_,i)=>({label:formatValue(min+step*i,3)+'–'+formatValue(min+step*(i+1),3),count:0}));for(const value of values)buckets[Math.min(7,Math.floor((value-min)/step))].count++;}
      const root=$('stats-chart'),title=make('h3','','频数分布'),chart=make('div','stats-bars');chart.setAttribute('role','img');chart.setAttribute('aria-label',buckets.map(item=>item.label+'：'+item.count+' 次').join('；'));
      const maxCount=Math.max(...buckets.map(item=>item.count));
      for(const item of buckets) {const column=make('div','stats-column'),bar=make('div','stats-bar'),label=make('span','stats-label',item.label);bar.style.setProperty('--bar-height',Math.max(2,item.count/maxCount*92)+'px');bar.title=item.label+'：'+item.count+' 次';bar.append(make('span','',String(item.count)));column.append(bar,label);chart.append(column);}root.append(title,chart);
    } catch (_) { /* The descriptive table remains the primary result. */ }
  }
  function selectResultTab(tab) {
    if(['graph','table'].includes(tab) && !state.resultFunctions?.length) return;
    all('[data-result-tab]').forEach(button=>{const active=button.dataset.resultTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
    for(const name of ['steps','graph','table']) $(''+name+'-panel').classList.toggle('active',tab===name);
    if(tab==='graph') requestAnimationFrame(()=>{
      if(!state.resultGraph) {state.resultGraph=new window.MathSolverGraph($('result-plot'),{angle:state.currentOptions?.angle || state.angle,theme:state.theme});state.resultGraph.setFunctions(state.resultFunctions);state.resultGraph.fitView();}
      state.resultGraph.draw();
    });
    if(tab==='table') updateResultTable();
  }
  function buildTable(headers,rows) {
    const table=make('table'),head=make('thead'),body=make('tbody'),hr=make('tr');
    (headers || []).forEach(text=>{const cell=make('th','',String(text));cell.scope='col';hr.append(cell);});head.append(hr);
    (rows || []).forEach(row=>{const tr=make('tr');row.forEach(value=>tr.append(make('td','',value===null || value===undefined ? '—' : String(value))));body.append(tr);});
    table.append(head,body);return table;
  }
  function formatValue(value,precision) {
    if(typeof value==='number') return Number.isFinite(value) ? String(Number(value.toPrecision(precision || 8))) : '未定义';
    if(value?.isComplex) return Math.abs(value.im)<1e-12 ? formatValue(value.re,precision) : '非实数';
    if(value?.isBigNumber || value?.isFraction) return formatValue(Number(value.valueOf()),precision);
    return '未定义';
  }
  function valueData(functions,start,step,count,parameters,angle) {
    const headers=['x',...functions.map(fn=>'y = '+(fn.label || fn.expression))];
    const rows=[];
    for(let index=0;index<count;index++) {
      const x=start+step*index, row=[formatValue(x,10)];
      for(const fn of functions) {try{row.push(formatValue(engine.evaluateAt(fn.expression,{x,...parameters},{angle,precision:state.precision})));}catch(_){row.push('未定义');}}
      rows.push(row);
    }
    return {headers,rows};
  }
  function updateResultTable() {
    if(!state.resultFunctions?.length) return;
    const start=Number($('table-start').value),step=Number($('table-step').value),count=Number($('table-count').value);
    if(!Number.isFinite(start) || !Number.isFinite(step) || step===0 || !Number.isInteger(count) || count<2 || count>100) {toast('起点和步长须为有限数值，步长不能为零，行数为 2–100。');return;}
    state.table=valueData(state.resultFunctions,start,step,count,{},state.currentOptions?.angle || state.angle);$('value-table').replaceChildren(buildTable(state.table.headers,state.table.rows));
  }
  function csvText(data) { return '\ufeff'+[data.headers,...data.rows].map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n'); }
  function download(text,filename,type) {const blob=new Blob([text],{type:type || 'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=make('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function copyText(text,message) {
    try {await navigator.clipboard.writeText(text);toast(message || '已复制');}
    catch (_) {const textarea=make('textarea');textarea.value=text;textarea.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(textarea);textarea.select();const copied=document.execCommand('copy');textarea.remove();toast(copied ? (message || '已复制') : '浏览器未允许复制，可手动选择文本。');}
  }
  function exportSolution() {
    const result=state.current;if(!result) return;
    const lines=['# '+result.title,'','题目：`'+state.currentInput.replace(/`/g,'')+'`','','答案：'+result.answerText,''];
    if(result.approximate) lines.push('近似值：'+result.approximate,'');
    (result.steps || []).forEach((step,index)=>{lines.push('## '+(index+1)+'. '+step.title,'',step.explanation,'');if(step.latex) lines.push('$$',step.latex,'$$','');});
    if(result.table) {lines.push('| '+result.table.headers.join(' | ')+' |','| '+result.table.headers.map(()=>'---').join(' | ')+' |');result.table.rows.forEach(row=>lines.push('| '+row.join(' | ')+' |'));lines.push('');}
    lines.push(...(result.notes || []).map(note=>'> '+note),'','由 Math Solver 在本地计算。');download(lines.join('\n'),'数学解题步骤.md','text/markdown;charset=utf-8');
  }
  function shareProblem() {if(!state.current) return;const url=new URL(location.href);const params=new URLSearchParams({q:state.currentInput,o:JSON.stringify(state.currentOptions)});url.hash=params.toString();copyText(url.href,'题目链接已复制');}
  function renderLegend(element,functions) { element.replaceChildren();functions.forEach((fn,index)=>{const item=make('span','legend-item'),dot=make('span','legend-dot');dot.style.backgroundColor=fn.color || COLORS[index%COLORS.length];item.append(dot,make('span','','y = '+(fn.label || fn.expression)));element.append(item);}); }
  function updateSavedButton() {const saved=state.history.find(record=>record.id===state.currentRecord)?.saved;$('save-result').classList.toggle('saved',!!saved);$('save-result').setAttribute('aria-label',saved ? '取消收藏本题' : '收藏本题');}
  function toggleSave(id) {const record=state.history.find(item=>item.id===(id || state.currentRecord));if(!record) return;record.saved=!record.saved;store();updateSavedButton();renderHistory();toast(record.saved ? '已收藏' : '已取消收藏');}
  function renderHistory() {
    const el=$('history-list');el.replaceChildren();const records=state.history.filter(record=>state.historyTab!=='saved' || record.saved);
    if(!records.length) {el.append(make('p','empty-state',state.historyTab==='saved' ? '还没有收藏。结果右上角的星标可以收藏题目。' : '计算记录会保存在这里。'));return;}
    for(const record of records) {
      const row=make('div','history-item'),load=make('button','history-load');load.type='button';
      load.append(make('span','history-input',record.input),make('span','history-answer',record.answer),make('small','',record.title+' · '+new Date(record.time).toLocaleString('zh-CN')));
      load.addEventListener('click',()=>{$('history-dialog').close();setView('solver');applyOptions(record.options);setInput(record.input);solve();});
      const star=make('button','icon-button'+(record.saved ? ' saved' : ''),record.saved ? '★' : '☆');star.type='button';star.setAttribute('aria-label',record.saved ? '取消收藏' : '收藏');star.addEventListener('click',()=>toggleSave(record.id));row.append(load,star);el.append(row);
    }
  }
  function exampleButton(example) {
    const button=make('button','example-item');button.type='button';button.dataset.example=example.id || '';button.title=example.label || example.input;
    button.append(make('span','example-category',example.label || example.category || modeLabels[example.mode]));const formula=make('span','example-math');mathDisplay(formula,example.latex || latexFor(example.input),example.input);button.append(formula);button.addEventListener('click',()=>loadExample(example));return button;
  }
  function loadExample(example) {
    $('examples-dialog').close();setView('solver');applyOptions({mode:example.mode || 'auto',angle:state.angle,...example.options});
    // Integral/limit display labels include the operator; the input field only contains the integrand/function.
    setInput(example.input,{text:example.text});solve();
  }
  function renderExamples() {
    if(!catalog) return;
    const categories={evaluate:'科学计算',simplify:'代数',expand:'代数',factor:'代数',solve:'方程与不等式',derivative:'微积分',integral:'微积分',limit:'微积分',matrix:'矩阵与统计',statistics:'矩阵与统计',units:'单位换算'};
    const list=state.mode==='auto' ? [catalog.examples[0],catalog.examples[1],catalog.examples[2],catalog.examples[3]] : catalog.examples.filter(example=>example.category===categories[state.mode]).slice(0,4);
    $('example-grid').replaceChildren(...list.map(exampleButton));
  }
  function showExamples(category) {
    const filters=['全部',...new Set(catalog.examples.map(example=>example.category))];$('example-filter').replaceChildren();
    const selected=category || '全部';
    filters.forEach(name=>{const button=make('button',name===selected ? 'active' : '',name);button.type='button';button.addEventListener('click',()=>showExamples(name));$('example-filter').append(button);});
    $('dialog-examples').replaceChildren(...catalog.examples.filter(example=>selected==='全部' || example.category===selected).map(exampleButton));
    if(!$('examples-dialog').open) $('examples-dialog').showModal();
  }
  function createPractice(result) {
    $('practice-card').hidden=true;state.practice=null;
    const rnd=(min,max)=>Math.floor(Math.random()*(max-min+1))+min;
    let practice;
    if(['equation','polynomial','linear','quadratic'].some(name=>String(result.kind).includes(name)) || result.solutions?.some(solution=>solution.variable==='x')) {
      const r1=rnd(-4,5),r2=r1+rnd(1,4),sum=r1+r2,product=r1*r2;
      practice={input:'x^2'+(sum<0 ? '+'+(-sum) : '-'+sum)+'x'+(product<0 ? product : '+'+product)+'=0',options:{mode:'solve',variable:'x',angle:'rad'},answer:[r1,r2],kind:'roots',question:'求下面方程的全部实数解，多个解用逗号分隔。'};
    } else if(state.currentOptions.mode==='derivative') {
      const n=rnd(2,6),a=rnd(2,5);practice={input:a+'x^'+n,options:{mode:'derivative',variable:'x',angle:'rad'},answer:(a*n)+'*x^'+(n-1),kind:'expression',question:'用幂函数法则求下面函数的一阶导数。'};
    } else if(['evaluate','numeric','number'].some(name=>String(result.kind).includes(name))) {
      const a=rnd(2,12),b=rnd(2,9),c=rnd(1,8);practice={input:a+'*('+b+'+'+c+')',options:{mode:'evaluate',angle:'rad'},answer:a*(b+c),kind:'number',question:'注意运算顺序，计算下面的表达式。'};
    }
    if(!practice) return;
    state.practice=practice;$('practice-card').hidden=false;$('practice-question').textContent=practice.question;mathDisplay($('practice-formula'),latexFor(practice.input),practice.input);$('practice-answer').value='';$('practice-feedback').textContent='';
  }
  function checkPractice() {
    const practice=state.practice, source=$('practice-answer').value.trim();if(!practice || !source) {toast('先输入练习答案。');return;}
    let correct=false;
    try {
      if(practice.kind==='roots') {
        const values=source.replace(/x\s*=/g,'').split(/[,，;\s]+/).filter(Boolean).map(text=>Number(engine.evaluateAt(text,{},practice.options))).sort((a,b)=>a-b);
        correct=values.length===practice.answer.length && values.every((value,index)=>Math.abs(value-practice.answer.slice().sort((a,b)=>a-b)[index])<1e-7);
      } else if(practice.kind==='number') correct=Math.abs(Number(engine.evaluateAt(source,{},practice.options))-practice.answer)<1e-7;
      else correct=[-2,-.5,0,1,3].every(x=>Math.abs(Number(engine.evaluateAt(source,{x},practice.options))-Number(engine.evaluateAt(practice.answer,{x},practice.options)))<1e-7);
      $('practice-feedback').style.color=correct ? 'var(--green)' : 'var(--red)';$('practice-feedback').textContent=correct ? '答对了！这道题的思路已经掌握。' : '再试一次。可以点“查看本题步骤”对照思路。';
    } catch (_) {$('practice-feedback').style.color='var(--red)';$('practice-feedback').textContent='请用有效的数学表达式输入答案。';}
  }

  function initializeFullGraph() {
    if(!state.fullGraph) {state.fullGraph=new window.MathSolverGraph($('full-plot'),{angle:state.angle,theme:state.theme});renderFunctionList();plotFunctions();}
  }
  function renderFunctionList() {
    $('function-list').replaceChildren();
    state.functions.forEach((fn,index)=>{
      const row=make('div','function-row'),dot=make('span','legend-dot'),input=make('input'),remove=make('button','icon-button','✕');dot.style.backgroundColor=fn.color || COLORS[index];
      input.value=fn.expression;input.placeholder='例如 a*x^2+b';input.setAttribute('aria-label','函数 '+(index+1));input.spellcheck=false;input.autocapitalize='off';input.dataset.functionIndex=String(index);
      input.addEventListener('input',()=>{state.functions[index].expression=input.value;state.functions[index].label=input.value;clearTimeout(graphTimer);graphTimer=setTimeout(plotFunctions,240);});
      input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();plotFunctions();}});
      remove.type='button';remove.setAttribute('aria-label','移除函数 '+(index+1));remove.addEventListener('click',()=>{state.functions.splice(index,1);renderFunctionList();plotFunctions();});
      row.append(dot,input,remove);$('function-list').append(row);
    });
    $('add-function').disabled=state.functions.length>=6;
  }
  function plotFunctions() {
    if(!state.fullGraph) return;
    all('.function-error').forEach(el=>el.remove());
    const valid=[],symbols=new Set();
    for(const [index,fn] of state.functions.entries()) {
      if(!fn.expression.trim()) continue;
      try {
        const text=engine.normalize(fn.expression.replace(/^\s*y\s*=\s*/,''));
        const node=math.parse(text);let nodes=0;
        node.traverse((part,path,parent)=>{
          if(++nodes>360) throw new Error('表达式过于复杂');
          if(part.isAssignmentNode || part.isFunctionAssignmentNode || part.isAccessorNode || part.isBlockNode) throw new Error('请输入单个关于 x 的函数');
          if(part.isFunctionNode && !['sum','prod','product'].includes(part.fn.name) && typeof math[part.fn.name]!=='function') throw new Error('不支持函数 '+part.fn.name+'；可使用 sin、cos、exp、log 等。');
          if(part.isSymbolNode && !['x','pi','e','i','Infinity'].includes(part.name) && !(parent?.isFunctionNode && path==='fn') && !(part.name in math)) symbols.add(part.name);
        });
        valid.push({...fn,expression:text,label:fn.expression,color:fn.color || COLORS[index]});
      } catch(error) {
        const rows=all('#function-list .function-row');rows[index]?.after(make('p','function-error',error.message || '函数输入有误'));
      }
    }
    const parameters={};for(const name of symbols) {if(!/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(name)) continue;parameters[name]=Number.isFinite(state.parameters[name]) ? state.parameters[name] : 1;}
    const changed=Object.keys(parameters).join('|')!==Object.keys(state.parameters).join('|');state.parameters=parameters;
    if(changed || !$('parameter-controls').childElementCount) renderParameters();
    state.validFunctions=valid;state.fullGraph.setFunctions(valid,state.parameters);renderLegend($('full-graph-legend'),valid);updateFullTable();
  }
  function renderParameters() {
    const root=$('parameter-controls');root.replaceChildren();
    for(const [name,value] of Object.entries(state.parameters)) {
      const row=make('div','parameter-row'),label=make('label','',name),number=make('input','parameter-value'),range=make('input');number.type='number';number.step='0.1';number.value=value;number.setAttribute('aria-label','参数 '+name+' 的值');range.type='range';range.min='-10';range.max='10';range.step='.1';range.value=value;range.setAttribute('aria-label','调整参数 '+name);label.append(number);row.append(label,range);
      const apply=value=>{const numeric=Number(value);if(!Number.isFinite(numeric) || Math.abs(numeric)>10000) {toast('参数须为 -10000 到 10000 的有限数。');return;}state.parameters[name]=numeric;number.value=numeric;range.value=Math.max(-10,Math.min(10,numeric));state.fullGraph.setParameter(name,numeric);updateFullTable();};
      range.addEventListener('input',()=>apply(range.value));number.addEventListener('change',()=>apply(number.value));root.append(row);
    }
    if(!root.childElementCount) root.append(make('p','muted','此处会自动出现函数中使用的参数。'));
  }
  function updateFullTable() {if(!state.fullGraph || !state.validFunctions) return;state.fullTable=valueData(state.validFunctions,-3,1,9,state.parameters,state.angle);$('full-value-table').replaceChildren(buildTable(state.fullTable.headers,state.fullTable.rows));}
  function graphAction(graph,action) {if(!graph) return;if(action==='zoom-in') graph.zoom(1.5);else if(action==='zoom-out') graph.zoom(1/1.5);else graph.resetView();}
  function openResultInGraph() {state.functions=(state.resultFunctions || []).map(fn=>({...fn})).slice(0,6);state.parameters={};setView('graph');renderFunctionList();plotFunctions();state.fullGraph?.fitView();}
  function applyRange() {const bounds={xmin:Number($('graph-xmin').value),xmax:Number($('graph-xmax').value),ymin:Number($('graph-ymin').value),ymax:Number($('graph-ymax').value)};if(!Object.values(bounds).every(Number.isFinite) || bounds.xmin>=bounds.xmax || bounds.ymin>=bounds.ymax){toast('每个轴的最小值须小于最大值。');return;}try{state.fullGraph?.setBounds(bounds);}catch(error){toast(error.message || '坐标范围不合法。');}}
  function graphExample(name) {const examples={parabola:['x^2-4'],trig:['sin(x)','cos(x)'],rational:['1/x'],parameter:['a*x^2+b']};state.functions=(examples[name] || examples.parabola).map((expression,index)=>({expression,label:expression,color:COLORS[index]}));state.parameters={};renderFunctionList();plotFunctions();state.fullGraph?.resetView();}

  function renderReference() {
    const root=$('reference-grid');root.replaceChildren();
    for(const group of catalog.reference) {
      const card=make('section','card reference-card');card.append(make('h2','',group.title));
      for(const item of group.formulas) {
        const block=make('div','reference-formula');block.append(make('p','',item.name));const formula=make('div','math-display');mathDisplay(formula,item.latex);block.append(formula);const button=make('button','text-button','试算例题 →');button.type='button';button.addEventListener('click',()=>{const example=item.example ? catalog.examples.find(example=>example.id===item.example) : item; if(example) loadExample(example);});block.append(button);card.append(block);
      }
      root.append(card);
    }
    renderBaseConverter(root); renderUnitConverter(root);
  }
  function renderBaseConverter(root) {
    const card=make('section','card reference-card');card.append(make('h2','','整数进制换算'),make('p','muted','支持有符号整数，在二、八、十、十六进制之间精确换算。'));
    const form=make('div','tool-form'),input=make('input'),from=make('select'),to=make('select'),button=make('button','secondary-button','换算'),output=make('div','tool-result','FF₁₆ = 255₁₀');input.value='FF';input.setAttribute('aria-label','待换算整数');
    for(const [value,label] of [[2,'二进制'],[8,'八进制'],[10,'十进制'],[16,'十六进制']]) {const a=make('option','',label),b=make('option','',label);a.value=b.value=value;from.append(a);to.append(b);}from.value='16';to.value='10';from.setAttribute('aria-label','原进制');to.setAttribute('aria-label','目标进制');button.type='button';form.append(input,from,to,button);
    button.addEventListener('click',()=>{
      const text=input.value.trim().replace(/\s/g,'').toUpperCase(),base=Number(from.value),target=Number(to.value);if(text.length>256 || !/^-?[0-9A-F]+$/.test(text)) {output.textContent='请输入最多 256 位的整数，不需要 0x / 0b 前缀。';return;}
      let value=0n;try{for(const char of text.replace(/^-/,'').split('')) {const digit=parseInt(char,16);if(digit>=base) throw new Error('数字 '+char+' 不属于 '+base+' 进制。');value=value*BigInt(base)+BigInt(digit);}if(text.startsWith('-')) value=-value;output.textContent=text+'（'+base+' 进制）= '+value.toString(target).toUpperCase()+'（'+target+' 进制）';}catch(error){output.textContent=error.message;}
    });card.append(form,output);root.append(card);
  }
  function renderUnitConverter(root) {
    const card=make('section','card reference-card');card.append(make('h2','','快捷单位换算'),make('p','muted','同一维度的单位可以转换；温度请使用 degC、degF、K。'));
    const form=make('div','tool-form'),value=make('input'),from=make('input'),to=make('input'),button=make('button','secondary-button','换算'),output=make('div','tool-result','1 inch = 2.54 cm');value.type='number';value.step='any';value.value='1';from.value='inch';to.value='cm';value.setAttribute('aria-label','待换算数值');from.setAttribute('aria-label','原单位');to.setAttribute('aria-label','目标单位');button.type='button';form.append(value,from,to,button);
    button.addEventListener('click',async()=>{try{button.disabled=true;const input=value.value+' '+from.value.trim()+' to '+to.value.trim();const result=await solveAsync(input,{mode:'units',precision:state.precision});output.textContent=result.answerText;}catch(error){output.textContent=error.message;}finally{button.disabled=false;}});
    card.append(form,output);root.append(card);
  }

  /* MathLive addresses positions as offsets into the field's LaTeX, so the operand a key
   * should wrap is found by scanning the LaTeX backwards. MathLive's own insert() treats
   * "#0" as a fresh placeholder, which produced empty-base superscripts and silently
   * dropped exponents; resolving the slots here keeps the base attached. */
  function latexGroupStart(latex, pos) {
    const close = latex[pos - 1];
    if (close !== '}' && close !== ')' && close !== ']') return -1;
    const open = close === '}' ? '{' : close === ')' ? '(' : '[';
    let depth = 1;
    for (let i = pos - 2; i >= 0; i--) {
      if (latex[i] === close) depth++;
      else if (latex[i] === open && --depth === 0) {
        let start = i;
        if (open !== '{' && latex.slice(Math.max(0, start - 5), start) === '\\left') start -= 5;
        return start;
      }
    }
    return -1;
  }
  function latexCommandStart(latex, pos) {
    let i = pos - 1;
    while (i >= 0 && /[a-zA-Z]/.test(latex[i])) i--;
    return latex[i] === '\\' ? i + 1 : pos - 1;
  }
  const TWO_ARGUMENT_COMMANDS = new Set(['frac', 'dfrac', 'tfrac', 'cfrac', 'binom', 'dbinom', 'tbinom']);
  const OPERATORS = new Set(['+', '-', '*', '/', '^', '_', '=', '<', '>', ',', ';', '(', '[', '{', '!', ':']);
  function latexAtomStart(latex, pos) {
    if (pos <= 0) return 0;
    const previous = latex[pos - 1];
    if (OPERATORS.has(previous)) return pos;               // nothing to wrap yet
    const group = latexGroupStart(latex, pos);
    if (group < 0) {
      if (previous === '\\') return latexCommandStart(latex, pos);
      let from = pos - 1;
      // "\left|x\right|" keeps the closing bar after \right; the atom is the whole
      // fence, because cutting at \right would leave the head with an unclosed \left.
      if (previous === '|' && latex.slice(from - 6, from) === '\\right') {
        const open = latex.lastIndexOf('\\left', from - 7);
        from = open >= 0 && latex[open + 5] === '|' ? open : from - 6;
      }
      // "\\sqrt2" ends in a bare atom that belongs to the command in front of it.
      const owner = latexCommandStart(latex, from);
      return owner < from && latex[owner - 1] === '\\' ? owner - 1 : from;
    }
    let start = group;
    // \frac{a}{b}: the atom is the command together with both arguments.
    if (latex[start - 1] === '}') {
      const first = latexGroupStart(latex, start);
      if (first < 0) return start;
      const nameStart = latexCommandStart(latex, first);
      if (latex[nameStart - 1] === '\\' && TWO_ARGUMENT_COMMANDS.has(latex.slice(nameStart - 1, first).slice(1))) return nameStart - 1;
      return first;
    }
    const nameStart = latexCommandStart(latex, start);
    if (latex[nameStart - 1] !== '\\') return start;
    // "\\left|x\\right|" puts the closing bar after \\right, so take that delimiter too.
    let from = nameStart - 1;
    if (latex.slice(from, from + 6) === '\\right' && /[|)\]}]/.test(latex[from + 6] || '')) from += 7;
    return from;
  }
    /* MathLive addresses the caret with a model offset, not a LaTeX index: "\frac{1}{2}" has
   * five atoms but eleven LaTeX characters, and assigning an out-of-range offset throws.
   * A throwaway marker atom is therefore inserted to learn where the caret really sits in
   * the LaTeX, the field is restored, and the rebuild is handed to MathLive's own insert()
   * so the placeholder ends up selected without computing model offsets by hand. */
  const CARET_MARKER = '\\mathrel{\\square}';
  const SLOT = '\\placeholder{}';
  function latexCaretOffset(mf) {
    const original = mf.value;
    mf.insert(CARET_MARKER, { selectionMode: 'after' });
    const marked = mf.value;
    mf.value = original;
    const at = marked.indexOf(CARET_MARKER);
    // A marker typed inside "\sqrt{2}" or a matrix is pulled into that structure, so only
    // a result that reproduced the field byte for byte tells us where the caret really is.
    if (at < 0 || marked !== original.slice(0, at) + CARET_MARKER + original.slice(at)) return -1;
    return at;
  }
  /* After pressing x^n the caret sits inside the exponent, and after pressing |x| it sits
   * between the fences. A following "+" or "=" has to leave that construct first: leave the
   * script outright, or close an unfinished fence before writing the operator. Returns
   * null when the caret is already at the top level. */
  function scriptExit(mf) {
    const value = mf.value, head = value.slice(0, latexCaretOffset(mf)), open = [];
    for (let i = 0; i < head.length; i++) {
      if (head[i] === '{') open.push(i);
      else if (head[i] === '}') open.pop();
    }
    if (open.length && /\^$|_$/.test(value.slice(0, open[open.length - 1]))) {
      let depth = 1, index = open[open.length - 1] + 1;
      for (; index < value.length; index++) {
        if (value[index] === '{') depth++;
        else if (value[index] === '}' && --depth === 0) break;
      }
      return { at: index + 1, closer: '' };
    }
    let fences = 0, start = -1;
    for (let i = head.length - 1; i >= 0; i--) {
      if (head.startsWith('\\right', i)) { fences++; i -= 4; continue; }
      if (head.startsWith('\\left', i)) { if (!fences--) { start = i; break; } i -= 4; }
    }
    if (start >= 0) {
      let depth = 1;
      for (let i = start + 5; i < value.length; i++) {   // the opening fence is already counted
        if (value.startsWith('\\left', i)) { depth++; i += 4; }
        else if (value.startsWith('\\right', i)) {
          if (--depth === 0) {
            let after = i + 6;                                   // past the \right command
            if (/[|)\]}.,]/.test(value[after] || '')) after++; // and past its delimiter
            return { at: after, closer: '' };
          }
          i += 5;
        }
      }
      return { at: value.length, closer: '\\right' + (value[start + 5] === '.' ? '|' : value[start + 5] || '|') };
    }
    return null;
  }
  function squareDepth(text, pos) {
    let depth = 0;
    for (let i = 0; i < pos && i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']') depth--;
    }
    return depth;
  }
  function insertMath(latex, item) {
    if(state.format==='math') {
      const mf=$('expression'),exit=item&&item.escape?scriptExit(mf):null;
      if(exit) {
        const value=mf.value;
        mf.value=value.slice(0,exit.at);
        mf.insert(exit.closer+latex+value.slice(exit.at),{selectionMode:'after',focus:true});
      } else if(/^[()[\]]$/.test(latex) || /^\\[{}]$/.test(latex)) {
        const delimiter=latex.replace(/^\\/,'');
        mf.executeCommand(['typedText',delimiter,{mode:'math'}]);
      } else if(/#(?:0|\?)/.test(latex)) {
        const value=mf.value;
        let caret=latexCaretOffset(mf);
        // Inside a matrix or another "[...]" structure a LaTeX index cannot describe the
        // caret, and rewriting around it would shred the input.
        if(caret>=0 && squareDepth(value,caret)>0) caret=-1;
        const from=caret<0?0:(latex.includes('#0')?latexAtomStart(value,caret):caret);
        const operand=caret<0?'':value.slice(from,caret);
        let body='';
        for(let i=0;i<latex.length;) {
          if(latex.startsWith('#0',i)) { body+=operand||SLOT; i+=2; }
          else if(latex.startsWith('#?',i)) { body+=SLOT; i+=2; }
          else { body+=latex[i]; i++; }
        }
        if(caret<0) {
          // The caret is somewhere a LaTeX index cannot describe (inside a matrix, say);
          // offer an empty slot rather than rewrite the formula around a guess.
          mf.insert(body,{selectionMode:'placeholder'});
        } else {
          mf.value=value.slice(0,from);
          mf.insert(body+value.slice(caret),{selectionMode:body.includes(SLOT)?'placeholder':'after'});
        }
      } else mf.insert(latex,{selectionMode:'after',focus:true});
      mf.focus();inputChanged();return;
    }
    // Use an unattached MathLive conversion for complete fragments; templates use selectable □ placeholders.
    let text=M.convertLatexToAsciiMath(latex.replace(/#0/g,'\\placeholder{}').replace(/#\?/g,'\\placeholder{}'));
    text=collapseOperatorNames(text,latex);
    text=text.replace(/\u200b/g,'');
    if(item?.id==='square') text='^2';else if(item?.id==='power') text='^()';
    const el=$('raw-expression'),start=el.selectionStart,end=el.selectionEnd,selection=el.value.slice(start,end);
    if(selection && /#0/.test(latex)) {text=M.convertLatexToAsciiMath(latex.replace(/#0/g,editorLatex(selection)).replace(/#\?/g,'\\placeholder{}'));}
    text=text.replace(/\?+/g,'□');
    el.setRangeText(text,start,end,'end');const at=el.value.indexOf('□',start);if(at>=0) el.setSelectionRange(at,at+1);el.focus();el.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function editorCommand(command) {
    if(state.format==='math') {$('expression').executeCommand(command);$('expression').focus();inputChanged();return;}
    const el=$('raw-expression');let start=el.selectionStart,end=el.selectionEnd;
    if(command==='deleteBackward') {if(start===end && start>0) start--;el.setRangeText('',start,end,'end');}
    else if(command==='moveToPreviousChar') el.setSelectionRange(Math.max(0,start-1),Math.max(0,start-1));
    else if(command==='moveToNextChar') el.setSelectionRange(Math.min(el.value.length,end+1),Math.min(el.value.length,end+1));
    else if(command==='moveToNextPlaceholder') {const next=el.value.indexOf('□',end);const index=next>=0 ? next : el.value.indexOf('□');if(index>=0) el.setSelectionRange(index,index+1);}
    else if(command==='undo' || command==='redo') {el.focus();document.execCommand(command);}
    el.focus();inputChanged();
  }
  function bind() {
    all('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
    all('#mode-nav [data-mode]').forEach(button=>button.addEventListener('click',()=>{setView('solver');setMode(button.dataset.mode);}));
    $('operation').addEventListener('change',()=>setMode($('operation').value));
    all('[data-angle]').forEach(button=>button.addEventListener('click',()=>setAngle(button.dataset.angle)));
    $('theme-button').addEventListener('click',()=>setTheme(state.theme==='dark' ? 'light' : 'dark'));
    ['help-button','shortcut-help','about-button'].forEach(id=>$(id).addEventListener('click',()=>{$('help-dialog').showModal();keyboard.hide();}));
    $('history-button').addEventListener('click',()=>{renderHistory();$('history-dialog').showModal();keyboard.hide();});
    all('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
    all('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{const rect=dialog.getBoundingClientRect();if(event.target===dialog && (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)) dialog.close();}));
    $('all-examples').addEventListener('click',()=>{showExamples();keyboard.hide();});
    $('input-format').addEventListener('click',()=>setFormat(state.format==='math' ? 'text' : 'math',true));
    $('clear-input').addEventListener('click',()=>{setInput('');focusEditor();});
    $('paste-input').addEventListener('click',async()=>{try{const text=await navigator.clipboard.readText();setInput(text,{text:/[;\n]/.test(text)});focusEditor();}catch(_){toast('浏览器不允许读取剪贴板，可在输入框直接粘贴。');}});
    $('expression').addEventListener('input',inputChanged);$('raw-expression').addEventListener('input',inputChanged);
    $('expression').addEventListener('focusin',()=>{if(state.view==='solver' && matchMedia('(max-width:720px)').matches && !keyboard.visible) keyboard.show();});
    for(const id of ['expression','raw-expression']) $(id).addEventListener('keydown',event=>{if(event.key==='Enter' && !event.shiftKey && !event.isComposing){event.preventDefault();event.stopPropagation();solve();}},true);
    $('solve-button').addEventListener('click',solve);
    all('[data-result-tab]').forEach(button=>button.addEventListener('click',()=>selectResultTab(button.dataset.resultTab)));
    $('copy-result').addEventListener('click',()=>{if(state.current) copyText(state.current.answerText,'答案已复制');});
    $('save-result').addEventListener('click',()=>toggleSave());
    all('[data-result-graph]').forEach(button=>button.addEventListener('click',()=>graphAction(state.resultGraph,button.dataset.resultGraph)));
    $('open-full-graph').addEventListener('click',openResultInGraph);
    $('update-table').addEventListener('click',updateResultTable);
    $('export-table').addEventListener('click',()=>{if(state.table) download(csvText(state.table),'函数数值表.csv','text/csv;charset=utf-8');});
    $('precision').value=String(state.precision);$('precision').addEventListener('change',()=>{state.precision=Number($('precision').value);store();toast('精度设置将在下次求解生效。');});
    all('[data-history-tab]').forEach(button=>button.addEventListener('click',()=>{state.historyTab=button.dataset.historyTab;all('[data-history-tab]').forEach(item=>item.classList.toggle('active',item===button));renderHistory();}));
    $('clear-history').addEventListener('click',()=>{state.history=state.history.filter(record=>record.saved);store();renderHistory();toast('普通历史已清空，收藏题目保留。');});
    $('export-history').addEventListener('click',()=>download(JSON.stringify({version:1,exportedAt:new Date().toISOString(),history:state.history},null,2),'数学计算记录.json','application/json'));
    $('check-practice').addEventListener('click',checkPractice);$('practice-answer').addEventListener('keydown',event=>{if(event.key==='Enter') checkPractice();});
    $('practice-solution').addEventListener('click',()=>{if(state.practice){const practice=state.practice;setView('solver');applyOptions(practice.options);setInput(practice.input);solve();}});
    $('add-function').addEventListener('click',()=>{if(state.functions.length>=6)return;state.functions.push({expression:'',label:'',color:COLORS[state.functions.length]});renderFunctionList();all('#function-list input').at(-1)?.focus();});
    all('[data-full-graph]').forEach(button=>button.addEventListener('click',()=>graphAction(state.fullGraph,button.dataset.fullGraph)));
    $('apply-range').addEventListener('click',applyRange);
    all('[data-graph-example]').forEach(button=>button.addEventListener('click',()=>graphExample(button.dataset.graphExample)));
    $('export-graph').addEventListener('click',()=>{if(!state.fullGraph)return;const link=make('a');link.href=state.fullGraph.exportPNG();link.download='函数图像.png';document.body.append(link);link.click();link.remove();});
    $('full-export-table').addEventListener('click',()=>{if(state.fullTable)download(csvText(state.fullTable),'函数数值表.csv','text/csv;charset=utf-8');});
    window.addEventListener('beforeunload',()=>worker?.terminate());
    document.addEventListener('keydown',event=>{if((event.ctrlKey || event.metaKey) && event.key==='Enter' && state.view==='solver'){event.preventDefault();solve();}});
  }
  function restoreShared() {
    if(!location.hash.includes('q=')) return;
    try {const params=new URLSearchParams(location.hash.slice(1)),input=params.get('q');if(!input || input.length>1200) return;const options=JSON.parse(params.get('o') || '{}');applyOptions(options);setInput(input);solve();}catch(_){toast('题目链接无效，请重新输入。');}
  }
  async function initialize() {
    if(!engine || !M || !catalog || !window.MathSolverKeyboard || !window.MathSolverGraph) {showError('本地资源加载失败，请确认 math_solver 文件夹完整。');return;}
    await customElements.whenDefined('math-field');
    const cls=window.MathfieldElement || M.MathfieldElement;
    cls.fontsDirectory=new URL('vendor/fonts/',document.baseURI).href;cls.soundsDirectory=null;cls.keypressSound=null;cls.plonkSound=null;cls.keypressVibration=false;cls.locale='zh-CN';cls.computeEngine=null;
    const mf=$('expression');mf.mathVirtualKeyboardPolicy='manual';mf.smartFence=true;mf.smartMode=false;mf.menuItems=[];
    mf.onScrollIntoView=()=>false;
    mf.addEventListener('keydown',event=>{
      if(state.format!=='math' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !/^[()[\]{}]$/.test(event.key)) return;
      event.preventDefault();event.stopImmediatePropagation();
      mf.executeCommand(['typedText',event.key,{mode:'math'}]);inputChanged();
    },true);
    keyboard=new window.MathSolverKeyboard($('math-keyboard'),{onInsert:insertMath,onCommand:editorCommand,onSolve:solve,onMode:(mode,item)=>{setMode(mode,item);focusEditor();},onFocus:()=>{if(state.format==='math') mf.focus();},onVisibility:(_visible,mobileOpen)=>{$('raw-expression').inputMode=mobileOpen ? 'none' : 'text';}});
    setTheme(state.theme);setAngle(state.angle);setMode('auto');renderReference();bind();restoreShared();
    window.MathSolverApp=Object.freeze({setInput,setMode,setView,setFormat,solve,sourceFromField,getState:()=>({view:state.view,format:state.format,mode:state.mode,angle:state.angle,result:state.current,busy:state.busy}),getKeyboard:()=>keyboard});
  }
  initialize().catch(error=>{console.error(error);showError('界面初始化失败：'+error.message);});
}());
