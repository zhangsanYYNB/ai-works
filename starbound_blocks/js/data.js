/* Shared, deterministic game rules. No DOM or renderer dependency. */
(function (root) {
  'use strict';
  const S = root.StarBlocks = {};
  S.VERSION = 1;
  S.SAVE_KEY = 'starblocks-echoes-v1';
  S.SIZE = 30;
  S.BLOCKS = {
    1: { name: '草地', color: '#709856', hardness: .45, drop: 'soil' },
    2: { name: '岩石', color: '#86928e', hardness: .8, drop: 'stone' },
    3: { name: '碳木', color: '#a18462', hardness: .7, drop: 'carbon' },
    4: { name: '树冠', color: '#91b65a', hardness: .25, drop: 'carbon' },
    5: { name: '铁矿', color: '#c99273', hardness: 1, drop: 'iron' },
    6: { name: '辉光晶体', color: '#80e3e0', hardness: 1.2, drop: 'crystal', glow: true },
    7: { name: '霜晶土', color: '#b4d8dd', hardness: .45, drop: 'soil' },
    8: { name: '玄武岩', color: '#697076', hardness: .8, drop: 'stone' },
    9: { name: '金矿', color: '#ecd378', hardness: 1.6, drop: 'gold' },
    10: { name: '星核矿', color: '#db9aba', hardness: 2.3, drop: 'star', glow: true },
    11: { name: '合金方块', color: '#b8d0c5', hardness: .5, drop: 'alloy' },
    12: { name: '光能方块', color: '#e2eea0', hardness: .4, drop: 'lamp', glow: true },
    13: { name: '基岩', color: '#35464b', hardness: Infinity, drop: null },
    14: { name: '菌冠', color: '#dc929c', hardness: .3, drop: 'carbon' },
    15: { name: '赤砂', color: '#c18d7e', hardness: .45, drop: 'soil' }
  };
  S.RESOURCES = {
    soil: { name: '土壤', color: '#7a9862', block: 1 }, stone: { name: '岩石', color: '#8f9997', block: 2 },
    carbon: { name: '碳', color: '#a58d69', block: 3 }, iron: { name: '铁', color: '#c99273' },
    crystal: { name: '辉光晶体', color: '#80e3e0', block: 6 }, gold: { name: '金', color: '#ecd378' },
    star: { name: '星核矿', color: '#d99bbc' }, alloy: { name: '合金方块', color: '#bbd0c6', block: 11 },
    lamp: { name: '光能方块', color: '#e2eea0', block: 12 }, fuel: { name: '跃迁燃料', color: '#c4e488' },
    oxygen: { name: '氧气罐', color: '#a4dbe6' }, medkit: { name: '修复剂', color: '#edaaa0' }
  };
  S.PLANETS = [
    { name: '青岚星', code: 'VERDANT · IV', biome: '繁茂生态', temp: 18, sky: '#a3d5cc', fog: '#b7d4bd', ground: 1, stone: 2, leaf: 4, water: '#63bfb6', accent: '#d7ef80', seed: 74, danger: 0, gravity: 17, desc: '温暖的季风穿过方块林海。碳木与铁矿遍布丘陵，远处的古老石环仍在发送微弱信号。', fauna: ['苔背兽', '翡翠跳虫', '琥珀浮游体'], artifact: '起源碎片' },
    { name: '霜汐星', code: 'BOREALIS · II', biome: '冰晶荒原', temp: -42, sky: '#8ba6ba', fog: '#b1c7d0', ground: 7, stone: 2, leaf: 6, water: '#8fbfcf', accent: '#a2e2eb', seed: 215, danger: .55, gravity: 11, desc: '低重力的冰晶世界。晶簇在极光下生长，遗迹守卫徘徊于雪原。这里沉睡着第二枚星门碎片。', fauna: ['霜角兽', '雪绒跳虫', '冰蓝浮游体'], artifact: '潮汐碎片' },
    { name: '赤烬星', code: 'CINDER · IX', biome: '火山旷野', temp: 86, sky: '#b8a39a', fog: '#c5ada1', ground: 15, stone: 8, leaf: 14, water: '#f2a269', accent: '#e9bd8c', seed: 389, danger: 1, gravity: 18, desc: '灼热峡谷与黑色岩脊。黄金和星核矿暴露在地表，活跃的哨兵守护着最后一枚遗迹碎片。', fauna: ['熔甲兽', '赤砂跳虫', '烬火浮游体'], artifact: '烈焰碎片' },
    { name: '弥光星', code: 'LUMEN · ZERO', biome: '荧光菌林', temp: 23, sky: '#939fbb', fog: '#a9b7bd', ground: 1, stone: 8, leaf: 14, water: '#969fd2', accent: '#edb9d1', seed: 507, danger: .25, gravity: 12, desc: '巨型菌林覆盖失落的文明。星门静候三枚碎片与跃迁核心，另一端，是无人抵达的星海。', fauna: ['月白巡游兽', '荧光跳虫', '星尘浮游体'], artifact: null }
  ];
  S.RECIPES = [
    { id: 'engine', name: '修复跃迁引擎', icon: 'rocket', desc: '解锁星际旅行，附赠 3 份燃料', cost: { iron: 8, crystal: 4, carbon: 6 }, upgrade: 'engine', max: 1 },
    { id: 'fuel', name: '跃迁燃料 × 2', icon: 'fuel', desc: '每次星际旅行消耗 1 份', cost: { carbon: 3, crystal: 1 }, output: { fuel: 2 } },
    { id: 'laser', name: '采集器升级', icon: 'pickaxe', desc: '采集与战斗效率 +70%，最多 2 级', cost: { iron: 6, crystal: 3 }, upgrade: 'laser', max: 2 },
    { id: 'jet', name: '喷气背包扩容', icon: 'flame', desc: '燃料消耗降低 35%，推力增强', cost: { iron: 5, gold: 3 }, upgrade: 'jet', max: 1 },
    { id: 'suit', name: '环境防护升级', icon: 'shield-check', desc: '氧气消耗和伤害降低 60%', cost: { iron: 5, crystal: 3, gold: 2 }, upgrade: 'suit', max: 1 },
    { id: 'oxygen', name: '氧气罐 × 2', icon: 'wind', desc: '每罐恢复 70 点氧气', cost: { carbon: 2 }, output: { oxygen: 2 } },
    { id: 'medkit', name: '修复剂', icon: 'heart-pulse', desc: '恢复 60 点护盾', cost: { carbon: 2, iron: 1 }, output: { medkit: 1 } },
    { id: 'alloy', name: '合金方块 × 12', icon: 'box', desc: '用于基地建造，可拆除回收', cost: { iron: 2, stone: 4 }, output: { alloy: 12 } },
    { id: 'lamp', name: '光能方块 × 6', icon: 'lightbulb', desc: '发光的建筑材料', cost: { crystal: 1, stone: 2 }, output: { lamp: 6 } },
    { id: 'core', name: '星门跃迁核心', icon: 'orbit', desc: '集齐 3 枚遗迹碎片后激活星门', cost: { star: 5, gold: 6, crystal: 8 }, upgrade: 'core', max: 1 }
  ];
  S.HOTBAR = ['tool', 'soil', 'stone', 'carbon', 'alloy', 'lamp'];
  S.random = function (seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  S.hash = (x, z, seed) => { let h = Math.imul(x + seed, 374761393) + Math.imul(z, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967295; };
  S.freshState = () => ({ version: 1, planet: 0, position: null, inventory: { soil: 12, stone: 0, carbon: 0, iron: 0, crystal: 0, gold: 0, star: 0, alloy: 12, lamp: 6, fuel: 0, oxygen: 3, medkit: 2 }, upgrades: { engine: 0, laser: 0, jet: 0, suit: 0, core: 0 }, health: 100, oxygen: 100, credits: 0, discoveries: [], artifacts: [], visited: [0], edits: [{}, {}, {}, {}], built: 0, mined: 0, completed: false, playTime: 0, settings: { sound: true, sensitivity: 1, quality: 1, touch: null } });
  S.canCraft = (state, recipe) => !!recipe && !(recipe.upgrade && state.upgrades[recipe.upgrade] >= recipe.max) && Object.entries(recipe.cost).every(([id, n]) => state.inventory[id] >= n);
  S.craft = (state, id) => {
    const recipe = S.RECIPES.find(r => r.id === id);
    if (!S.canCraft(state, recipe)) return false;
    for (const [key, count] of Object.entries(recipe.cost)) state.inventory[key] -= count;
    if (recipe.output) for (const [key, count] of Object.entries(recipe.output)) state.inventory[key] += count;
    if (recipe.upgrade) state.upgrades[recipe.upgrade]++;
    if (id === 'engine') state.inventory.fuel += 3;
    return true;
  };
  S.parseSave = raw => {
    const v = JSON.parse(raw), state = S.freshState();
    if (!v || v.version !== 1 || !Number.isInteger(v.planet) || !S.PLANETS[v.planet]) throw Error('不兼容的存档');
    const finite = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;
    for (const id of Object.keys(state.inventory)) if (finite(v.inventory?.[id], 1e7)) state.inventory[id] = Math.floor(v.inventory[id]);
    for (const id of Object.keys(state.upgrades)) if (finite(v.upgrades?.[id], id === 'laser' ? 2 : 1)) state.upgrades[id] = Math.floor(v.upgrades[id]);
    state.planet = v.planet;
    if (v.position && ['x', 'y', 'z', 'yaw', 'pitch'].every(k => Number.isFinite(v.position[k])) && Math.abs(v.position.x) < S.SIZE && Math.abs(v.position.z) < S.SIZE && v.position.y > -3 && v.position.y < 65) state.position = v.position;
    for (const k of ['health', 'oxygen', 'credits', 'built', 'mined', 'playTime']) if (finite(v[k], k === 'health' || k === 'oxygen' ? 100 : 1e9)) state[k] = v[k];
    state.discoveries = [...new Set(Array.isArray(v.discoveries) ? v.discoveries.filter(x => typeof x === 'string' && /^\d-[a-z]+-\d$/.test(x)).slice(0, 100) : [])];
    state.artifacts = [...new Set(Array.isArray(v.artifacts) ? v.artifacts.filter(x => Number.isInteger(x) && x >= 0 && x < 3) : [])];
    state.visited = [...new Set([0, v.planet, ...(Array.isArray(v.visited) ? v.visited.filter(x => Number.isInteger(x) && x >= 0 && x < 4) : [])])];
    state.completed = v.completed === true;
    if (Array.isArray(v.edits)) for (let p = 0; p < 4; p++) for (const [key, value] of Object.entries(v.edits[p] || {}).slice(0, 50000)) {
      const coords = key.split(',').map(Number);
      if (coords.length === 3 && coords.every(Number.isInteger) && Math.abs(coords[0]) < S.SIZE && Math.abs(coords[2]) < S.SIZE && coords[1] > -4 && coords[1] < 32 && (value === 0 || S.BLOCKS[value] && value !== 13)) state.edits[p][key] = value;
    }
    if (v.settings) { state.settings.sound = v.settings.sound !== false; state.settings.touch = typeof v.settings.touch === 'boolean' ? v.settings.touch : null; if (finite(v.settings.sensitivity, 2) && v.settings.sensitivity >= .3) state.settings.sensitivity = v.settings.sensitivity; state.settings.quality = v.settings.quality === .65 ? .65 : 1; }
    return state;
  };
  if (typeof module !== 'undefined') module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
