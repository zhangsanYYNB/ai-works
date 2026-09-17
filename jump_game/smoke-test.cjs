// Headless logic checks only; this does NOT test GPU rendering or visual layout.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const THREE = { ...require('./vendor/three.min.js') };
THREE.WebGLRenderer = class {
  constructor() { this.shadowMap = {}; this.renderCount = 0; }
  setClearColor() {} setPixelRatio() {} setSize() {}
  render(scene, camera) {
    assert.ok(scene.isScene, 'render receives a Three.js scene');
    assert.ok(camera.isCamera, 'render receives a Three.js camera');
    assert.ok(Number.isFinite(camera.position.x), 'camera state stays finite');
    this.renderCount++;
  }
};
const html = fs.readFileSync(path.join(__dirname, '../jump_game.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length, new Set(ids).size, 'unique DOM ids');
function element() {
  const classes = new Set(), handlers = {};
  return { style:{}, textContent:'', handlers, offsetWidth:1,
    classList:{add(...s){s.forEach(x=>classes.add(x));},remove(...s){s.forEach(x=>classes.delete(x));},contains(s){return classes.has(s);},toggle(s,v){v=v===undefined?!classes.has(s):v;v?classes.add(s):classes.delete(s);return v;}},
    addEventListener(k,f){handlers[k]=f;},setAttribute(){},blur(){},setPointerCapture(){},
    getContext(){return {createRadialGradient(){return {addColorStop(){}};},fillRect(){}};}
  };
}
const elements = Object.fromEntries(ids.map(id=>[id,element()]));
const saved = new Map([['jump_game_best','17']]);
const windowHandlers={};
const sandbox={ THREE, console, Math, innerWidth:1280,innerHeight:800,devicePixelRatio:1,
  matchMedia:()=>({matches:false}), requestAnimationFrame(){},
  document:{getElementById(id){assert.ok(elements[id],`DOM id exists: ${id}`);return elements[id];},createElement:element,body:element(),hidden:false,addEventListener(){}},
  localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},
  navigator:{},location:{reload(){}},addEventListener(k,f){windowHandlers[k]=f;}
};
sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'game.js'),'utf8'),sandbox);
const game=sandbox.JumpGame;
assert.ok(game); assert.equal(game.G.state,'menu');assert.equal(game.G.best,17);
function settle() { for(let i=0;i<65 && ['flying','falling'].includes(game.G.state);i++)game.step(.05); }
function centerJump() {
  const p=game.plats()[game.G.cur+1];
  const distance=Math.hypot(p.x-game.P.pos.x,p.z-game.P.pos.z);
  assert.ok(distance<=game.D_MAX && distance>=game.D_MIN,'generated target is reachable');
  game.jump((distance-game.D_MIN)/(game.D_MAX-game.D_MIN));settle();
  assert.equal(game.G.state,'idle');
}
elements.start.handlers.click({currentTarget:elements.start});
assert.equal(game.G.state,'idle','start button enters gameplay');
assert.ok(elements.overlay.classList.contains('hidden'),'start button hides menu');
assert.equal(Number(elements.score.textContent),0,'start resets score HUD');
const rendersBefore=game.renderer.renderCount;
game.step(.05);
assert.equal(game.renderer.renderCount,rendersBefore+1,'step executes render path');
assert.equal(elements['charge-status'].textContent,'长按屏幕 / 空格','step updates status');
game.charge();game.step(.05);assert.ok(game.G.power>0);game.cancel();assert.equal(game.G.state,'idle');assert.equal(game.G.power,0);
game.jump(0);settle();assert.equal(game.G.score,0);assert.equal(game.G.state,'idle','short hop stays on origin');
centerJump();assert.equal(game.G.score,2);
assert.equal(Number(elements.score.textContent),2,'landing updates score HUD');
centerJump();assert.equal(game.G.score,5);assert.equal(game.G.combo,2);
for(let i=0;i<200;i++)centerJump();
assert.ok(game.plats().length<=5,'old platforms pruned');assert.equal(game.G.combo,202);
assert.equal(Number(saved.get('jump_game_best')),game.G.score,'highest score saved immediately');
for(const p of game.plats()) {assert.ok(game.contains(p,p.x,p.z));assert.ok(!game.contains(p,p.x+p.r*2,p.z));}
game.start();game.jump(1);settle();assert.equal(game.G.state,'over','overshoot falls and ends game');
assert.ok(!elements.overlay.classList.contains('hidden'));assert.equal(game.G.score,0);
assert.ok(!elements.stats.classList.contains('hidden'),'game over displays stats');
assert.equal(Number(elements['final-score'].textContent),game.G.score);
assert.equal(Number(elements['final-best'].textContent),game.G.best);
game.start();const canvas=elements.game;
canvas.handlers.pointerdown({button:0,pointerId:1,preventDefault(){}});assert.equal(game.G.state,'charging');
canvas.handlers.pointercancel({pointerId:1});assert.equal(game.G.state,'idle','cancel does not launch');
canvas.handlers.pointerdown({button:0,pointerId:2,preventDefault(){}});game.step(.05);
canvas.handlers.pointerup({pointerId:2,preventDefault(){}});assert.equal(game.G.state,'flying','pointer release launches');settle();
windowHandlers.keydown({code:'Space',target:{closest:()=>null},preventDefault(){},repeat:false});assert.equal(game.G.state,'charging');
windowHandlers.blur();assert.equal(game.G.state,'idle','blur cancels charging');
elements.quality.handlers.click({currentTarget:{blur(){}}});assert.equal(game.G.quality,false);
console.log('PASS: DOM contract, boot, legacy best, charge/cancel, short hop, 202 perfect jumps, bounded islands, score persistence, miss/restart, pointer/keyboard, quality toggle.');
console.log('Not covered: real WebGL rendering, visual layout, audio playback, device performance.');
