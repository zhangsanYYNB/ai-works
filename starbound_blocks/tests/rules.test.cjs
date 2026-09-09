'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/data.js');

test('seeded generation is reproducible and bounded', () => {
  const a=S.random(74), b=S.random(74), c=S.random(215);
  const values=Array.from({length:100},()=>a());
  assert.deepEqual(values,Array.from({length:100},()=>b()));
  assert.notDeepEqual(values,Array.from({length:100},()=>c()));
  assert.ok(values.every(v=>v>=0&&v<1));
});
test('crafting is atomic when resources are insufficient', () => {
  const state=S.freshState(), before=JSON.stringify(state);
  assert.equal(S.craft(state,'engine'),false);
  assert.equal(S.craft(state,'nonexistent'),false);
  assert.equal(JSON.stringify(state),before);
});
test('engine costs, initial fuel and one-time upgrade', () => {
  const state=S.freshState();Object.assign(state.inventory,{iron:8,crystal:4,carbon:6});
  assert.equal(S.craft(state,'engine'),true);
  assert.equal(state.upgrades.engine,1);assert.equal(state.inventory.fuel,3);
  assert.equal(state.inventory.iron+state.inventory.crystal+state.inventory.carbon,0);
  Object.assign(state.inventory,{iron:8,crystal:4,carbon:6});
  assert.equal(S.craft(state,'engine'),false);assert.equal(state.inventory.iron,8);
});
test('repeatable recipes and capped upgrades', () => {
  const state=S.freshState();Object.assign(state.inventory,{iron:20,crystal:20,carbon:20});
  assert.equal(S.craft(state,'fuel'),true);assert.equal(S.craft(state,'fuel'),true);assert.equal(state.inventory.fuel,4);
  assert.equal(S.craft(state,'laser'),true);assert.equal(S.craft(state,'laser'),true);assert.equal(S.craft(state,'laser'),false);
});
test('save roundtrip keeps planets, building edits and input preferences', () => {
  const state=S.freshState();state.planet=2;state.artifacts=[0,1];state.discoveries=['0-fauna-1'];state.edits[1]['-2,8,3']=11;state.edits[0]['7,5,12']=0;state.settings.touch=false;state.position={x:3,y:5.34,z:16,yaw:1,pitch:.2};
  const saved=S.parseSave(JSON.stringify(state));
  assert.equal(saved.edits[1]['-2,8,3'],11);assert.equal(saved.edits[0]['7,5,12'],0);assert.equal(saved.settings.touch,false);assert.deepEqual(saved.position,state.position);assert.deepEqual(saved.artifacts,[0,1]);assert.ok(saved.visited.includes(2));
});
test('invalid saves reject or sanitize untrusted numeric fields', () => {
  assert.throws(()=>S.parseSave('{'));assert.throws(()=>S.parseSave('{"version":2,"planet":0}'));assert.throws(()=>S.parseSave('null'));
  const v=S.freshState();v.inventory.iron=-10;v.upgrades.engine=99;v.artifacts=[0,0,7,-1];v.edits[0]={'0,-4,0':0,'0,99,0':11,'2,8,2':13,'2,9,2':11};v.position={x:1000,y:5,z:0,yaw:0,pitch:0};
  const result=S.parseSave(JSON.stringify(v));assert.equal(result.inventory.iron,0);assert.equal(result.upgrades.engine,0);assert.deepEqual(result.artifacts,[0]);assert.deepEqual(result.edits[0],{'2,9,2':11});assert.equal(result.position,null);
});
test('all recipe inputs and outputs use known resources', () => {
  for(const r of S.RECIPES)for(const [id,n] of Object.entries({...r.cost,...r.output})){assert.ok(S.RESOURCES[id],id);assert.ok(n>0);}
  for(const id of S.HOTBAR.slice(1))assert.ok(S.BLOCKS[S.RESOURCES[id].block]);
});
