/* ============ 层级：地图生成 / 场景构建 / 碰撞 / 高度 / 传送装置 ============ */
'use strict';

const CELL = 4;          // 每格尺寸（米）
const EYE_H = 1.62;      // 视线高度
const HOLE_DEPTH = -60;  // 破洞格的虚拟地面（表示无底）

/* ---------- 层级配置（12 层，探索式互联） ---------- */
const LEVEL_CFGS = [
  {
    id: 0, name: 'LEVEL 0 · 黄色迷宫', short: '黄色迷宫',
    size: 23, wallH: 3.1,
    fogColor: 0x14100a, fogDensity: 0.055,
    ambient: { sky: 0x8a7d55, ground: 0x3a3018, intensity: 0.85 },
    textures: { wall: 'wallpaper', floor: 'carpet', ceil: 'ceiling' },
    lampsEvery: 2, pointLights: 5, rooms: 5,
    props: {}, shadowEvent: true, entity: null,
    hint: '寻找离开此层的通路：地板破洞、现实裂缝、或陌生的门',
    introText: '你从现实中脱落了。无尽的黄色房间……传闻墙纸最薄的地方，可以直接"掉"进别的层级。',
    exits: [
      { kind: 'hole', to: 1 },
      { kind: 'glitch', to: 2 },
      { kind: 'door', to: 4 },
    ],
  },
  {
    id: 1, name: 'LEVEL 1 · 潮湿车库', short: '潮湿车库',
    size: 25, wallH: 3.0,
    fogColor: 0x05060a, fogDensity: 0.075,
    ambient: { sky: 0x232c38, ground: 0x0a0c10, intensity: 0.22 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 3, pointLights: 4, dark: true, rooms: 6, pillars: true,
    platformH: 1.6,
    props: { barrel: 8, crate: 6, pipeCol: 4, pallet: 4 },
    entity: { name: '潜行者', look: 'stalker', speedPatrol: 1.7, speedChase: 3.6, sightRange: 14, hearingRange: 9, catchRange: 1.15, deathText: '潮湿的黑暗里，它一直贴着柱子在等你。' },
    hint: '黑暗中找到保险丝，恢复供电后电梯才会运行',
    introText: '停电的车库。积水倒映着你看不见的东西。这里通向多个更深的层级。',
    exits: [
      { kind: 'elevator', to: 3, needsPower: true },
      { kind: 'pipe', to: 5 },
      { kind: 'door', to: 0 },
    ],
  },
  {
    id: 2, name: 'LEVEL 2 · 管道长廊', short: '管道长廊',
    size: 27, wallH: 2.7,
    fogColor: 0x0a0d0a, fogDensity: 0.08,
    ambient: { sky: 0x3e4a40, ground: 0x10140f, intensity: 0.3 },
    textures: { wall: 'pipeWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 4, pointLights: 4, rooms: 4, braid: 0.06,
    props: { pipeCol: 10, barrel: 4, crate: 3 },
    entity: { name: '爬行者', look: 'crawler', speedPatrol: 2.0, speedChase: 4.1, sightRange: 11, hearingRange: 13, catchRange: 1.15, deathText: '它在管道里爬行的声音，你到死都没分清和蒸汽声的区别。' },
    hint: '狭窄的管道迷宫——注意听蒸汽声之外的动静',
    introText: '铆钉钢板与纵横管道构成的狭长走廊。据说地板的破洞直通水淹隧道。',
    exits: [
      { kind: 'hole', to: 6 },
      { kind: 'door', to: 8 },
      { kind: 'glitch', to: 0 },
    ],
  },
  {
    id: 3, name: 'LEVEL 3 · 废弃办公室', short: '废弃办公室',
    size: 27, wallH: 2.9,
    fogColor: 0x0b0a08, fogDensity: 0.06,
    ambient: { sky: 0x6a6552, ground: 0x24211a, intensity: 0.4 },
    textures: { wall: 'officeWall', floor: 'officeFloor', ceil: 'garageCeil' },
    lampsEvery: 3, pointLights: 4, rooms: 6, pillars: true,
    props: { desk: 7, cabinet: 6, chair: 8, locker: 3 },
    entity: { name: '猎手', look: 'wraith', speedPatrol: 2.1, speedChase: 4.3, sightRange: 17, hearingRange: 12, catchRange: 1.15, deathText: '它比你想的更快。奔跑的声音就是它的晚餐铃。' },
    hint: '办公区的某个隔间里藏着通往病房的钥匙卡……不，那是另一层的事',
    introText: '废弃的办公区。键盘声在无人处响起时，不要寻找声源。',
    exits: [
      { kind: 'door', to: 9 },
      { kind: 'pipe', to: 7 },
      { kind: 'elevator', to: 1 },
    ],
  },
  {
    id: 4, name: 'LEVEL 4 · 恐怖酒店', short: '恐怖酒店',
    size: 25, wallH: 3.2,
    fogColor: 0x120808, fogDensity: 0.07,
    ambient: { sky: 0x7a4a38, ground: 0x2a1410, intensity: 0.42 },
    textures: { wall: 'hotelWall', floor: 'redCarpet', ceil: 'woodCeil' },
    lampsEvery: 3, pointLights: 4, rooms: 6,
    platformH: 1.8,
    props: { bed: 6, chair: 6, cabinet: 4, plant: 4 },
    items: ['keycard'],
    entity: { name: '巡游者', look: 'stalker', speedPatrol: 2.3, speedChase: 3.9, sightRange: 13, hearingRange: 10, catchRange: 1.15, deathText: '酒店的服务员永远热情。它只是想请你永远留下。' },
    hint: '找到门禁卡才能打开通往深红警报的门',
    introText: '无穷无尽的红地毯走廊，每一扇门后都是同一间房。前台没有服务员——但有别的什么东西在巡游。',
    exits: [
      { kind: 'door', to: 10, lock: 'keycard' },
      { kind: 'glitch', to: 5 },
      { kind: 'pipe', to: 2 },
    ],
  },
  {
    id: 5, name: 'LEVEL 5 · 无光之境', short: '无光之境',
    size: 23, wallH: 3.0,
    fogColor: 0x000000, fogDensity: 0.16,
    ambient: { sky: 0x000000, ground: 0x000000, intensity: 0.02 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 99, pointLights: 0, dark: true, rooms: 5,
    props: { crate: 3 },
    flashlightNote: true,
    entity: { name: '听风者', look: 'crawler', speedPatrol: 1.8, speedChase: 4.4, sightRange: 3, hearingRange: 17, catchRange: 1.2, deathText: '这里没有光，也没有眼睛。只有耳朵——你的脚步就是它的路标。' },
    hint: '绝对黑暗。它看不见你，但听得见你跑动的每一步',
    introText: '这里的灯从未亮过。关掉手电筒屏住呼吸，你几乎能感到它从身边走过。',
    exits: [
      { kind: 'door', to: 4 },
      { kind: 'hole', to: 6 },
      { kind: 'glitch', to: 9 },
    ],
  },
  {
    id: 6, name: 'LEVEL 6 · 水淹隧道', short: '水淹隧道',
    size: 25, wallH: 2.8,
    fogColor: 0x04080c, fogDensity: 0.085,
    ambient: { sky: 0x1e3038, ground: 0x06090c, intensity: 0.26 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 4, pointLights: 4, rooms: 5, water: true, drip: true,
    props: { barrel: 6, pipeCol: 8, pallet: 3 },
    entity: null, shadowEvent: true,
    hint: '齐踝深的黑水。安静得只剩滴水声……通常是这样',
    introText: '冰冷的黑水没过脚踝。远处偶尔传来落水声——希望那只是水滴。',
    exits: [
      { kind: 'pipe', to: 2 },
      { kind: 'door', to: 7 },
      { kind: 'glitch', to: 3 },
    ],
  },
  {
    id: 7, name: 'LEVEL 7 · 荒芜矿洞', short: '荒芜矿洞',
    size: 26, wallH: 3.4,
    fogColor: 0x0c0906, fogDensity: 0.075,
    ambient: { sky: 0x4a3c28, ground: 0x140f08, intensity: 0.3 },
    textures: { wall: 'dirtWall', floor: 'rockFloor', ceil: 'dirtWall' },
    lampsEvery: 5, pointLights: 4, rooms: 6, braid: 0.2,
    props: { crate: 5, barrel: 3, pallet: 4, pipeCol: 6 }, shadowEvent: true,
    hint: '支撑木在头顶呻吟。矿工们挖穿了什么，就再也没回去',
    introText: '木质支架撑起摇摇欲坠的坑道。墙上刻着歪歪扭扭的正字计数——不知道在数什么。',
    exits: [
      { kind: 'hole', to: 6 },
      { kind: 'door', to: 8 },
      { kind: 'pipe', to: 1 },
    ],
  },
  {
    id: 8, name: 'LEVEL 8 · 无尽仓库', short: '无尽仓库',
    size: 27, wallH: 4.2,
    fogColor: 0x0b0b0d, fogDensity: 0.055,
    ambient: { sky: 0x555a60, ground: 0x181a1d, intensity: 0.34 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 4, pointLights: 5, rooms: 3, pillars: true, platformH: 2.0,
    props: { shelf: 14, crate: 6, barrel: 4, locker: 3 },
    entity: { name: '守仓人', look: 'wraith', speedPatrol: 2.2, speedChase: 4.2, sightRange: 15, hearingRange: 11, catchRange: 1.15, deathText: '货架间的通道会重新排列。而它记得每一条你走过的路。' },
    hint: '高耸的货架构成峡谷。高处平台有货物堆成的天梯',
    introText: '十几米高的货架一眼望不到头。有人说登上顶层平台能看到仓库的边缘——也有人说看到的东西不该看。',
    exits: [
      { kind: 'glitch', to: 2 },
      { kind: 'door', to: 9 },
      { kind: 'elevator', to: 11, note: '货梯：直达最深处的白色空间' },
    ],
  },
  {
    id: 9, name: 'LEVEL 9 · 白色病房', short: '白色病房',
    size: 24, wallH: 2.9,
    fogColor: 0x101210, fogDensity: 0.065,
    ambient: { sky: 0x9aa89a, ground: 0x2c332c, intensity: 0.5 },
    textures: { wall: 'tileWall', floor: 'tileFloor', ceil: 'ceiling' },
    lampsEvery: 3, pointLights: 4, rooms: 6,
    props: { bed: 6, desk: 4, locker: 5, chair: 4, plant: 3 },
    flickerHeavy: true,
    entity: { name: '无脸护士', look: 'stalker', speedPatrol: 2.0, speedChase: 4.0, sightRange: 12, hearingRange: 12, catchRange: 1.15, deathText: '"别担心，这只是常规检查。"——它没有脸，但你知道它在笑。' },
    hint: '消毒水的气味。闪烁的灯管下，病床好像比刚才多了一张',
    introText: '白色的走廊无限延伸。探视时间早就结束了，但查房还在继续。',
    exits: [
      { kind: 'door', to: 3 },
      { kind: 'glitch', to: 5 },
      { kind: 'elevator', to: 8 },
    ],
  },
  {
    id: 10, name: 'LEVEL 10 · 深红警报', short: '深红警报',
    size: 21, wallH: 2.8,
    fogColor: 0x1c0606, fogDensity: 0.075,
    ambient: { sky: 0x661e1a, ground: 0x260908, intensity: 0.4 },
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 4, pointLights: 3, alarm: true, braid: 0.35, rooms: 3,
    props: { barrel: 6, crate: 6, chair: 3 },
    adrenaline: 5, siren: true,
    entity: { name: '暴走者', look: 'wraith', speedPatrol: 3.0, speedChase: 4.6, sightRange: 999, hearingRange: 999, catchRange: 1.15, alwaysChase: true, nearStart: true, deathText: '它不知疲倦。下一次，用上肾上腺素，别跑直线。' },
    hint: '<b>跑！</b>不要停下。白门就在某处',
    introText: '避难通道的警报响了。整层都醒了——它正在你身后。<b>别停下。</b>',
    exits: [
      { kind: 'lightdoor', to: 11, glowName: '白光之门' },
      { kind: 'pipe', to: 4 },
      { kind: 'hole', to: 1 },
    ],
  },
  {
    id: 11, name: 'LEVEL ∞ · 白色虚空', short: '白色虚空',
    size: 19, wallH: 3.6,
    fogColor: 0xe8e8e2, fogDensity: 0.03,
    ambient: { sky: 0xffffff, ground: 0xccccc4, intensity: 0.95 },
    textures: { wall: 'whiteVoidA', floor: 'whiteVoidB', ceil: 'whiteVoidC' },
    lampsEvery: 99, pointLights: 2, rooms: 4,
    props: {},
    noDust: true,
    entity: null,
    hint: '一切都很亮、很静。中央的光之门是唯一的出口',
    introText: '没有墙纸，没有嗡嗡声，没有实体。只有纯白的寂静——以及一扇发光的门。',
    exits: [
      { kind: 'lightdoor', to: -1, ending: true, glowName: '逃出后室' },
      { kind: 'glitch', to: 0 },
    ],
  },
];

/* 挖洞/楼梯等高度数据 */
// floorMap 值：>=0 为该格地面高度；-999 表示破洞（坠落）

/* ---------- 迷宫生成 ---------- */
function genMap(rng, W, H, opts) {
  const g = [];
  for (let y = 0; y < H; y++) { g.push(new Array(W).fill(1)); }
  const at = (x, y) => g[y][x];
  const set = (x, y, v) => { g[y][x] = v; };

  // 1. DFS 挖迷宫（步长2）
  const stack = [[1, 1]];
  set(1, 1, 0);
  const DIRS = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const cand = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && at(nx, ny) === 1) cand.push([dx, dy]);
    }
    if (cand.length) {
      const [dx, dy] = rng.pick(cand);
      set(cx + dx / 2, cy + dy / 2, 0);
      set(cx + dx, cy + dy, 0);
      stack.push([cx + dx, cy + dy]);
    } else stack.pop();
  }

  // 2. 打通部分死路（环路）
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (at(x, y) === 1 && rng.next() < (opts.braid || 0.12)) {
      if ((at(x - 1, y) === 0 && at(x + 1, y) === 0) || (at(x, y - 1) === 0 && at(x, y + 1) === 0)) set(x, y, 0);
    }
  }

  // 3. 开辟房间
  const rooms = [];
  for (let i = 0; i < (opts.rooms || 5); i++) {
    const rw = rng.int(3, 5), rh = rng.int(3, 5);
    const rx = rng.int(1, W - rw - 2), ry = rng.int(1, H - rh - 2);
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) set(x, y, 0);
    rooms.push({ x: rx, y: ry, w: rw, h: rh });
  }

  // 4. 大房间里加柱子
  if (opts.pillars) {
    for (const r of rooms) {
      if (r.w >= 4 && r.h >= 4 && rng.next() < 0.75) {
        for (let y = r.y + 1; y < r.y + r.h - 1; y += 2)
          for (let x = r.x + 1; x < r.x + r.w - 1; x += 2)
            if (rng.next() < 0.8) set(x, y, 1);
      }
    }
  }

  // 保证出生点周围畅通
  set(1, 1, 0); set(1, 2, 0); set(2, 1, 0);
  return { grid: g, rooms };
}

/** BFS 距离场 */
function bfsField(grid, sx, sy) {
  const H = grid.length, W = grid[0].length;
  const dist = Array.from({ length: H }, () => new Array(W).fill(-1));
  const q = [[sx, sy]];
  dist[sy][sx] = 0;
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    const d = dist[y][x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && grid[ny][nx] === 0 && dist[ny][nx] === -1) {
        dist[ny][nx] = d + 1;
        q.push([nx, ny]);
      }
    }
  }
  return dist;
}

/* ---------- 几何合并 ---------- */
function mergeBoxes(boxes) {
  const pos = [], nor = [], uv = [];
  for (const b of boxes) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    geo.translate(b.x, b.y, b.z);
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const u = geo.attributes.uv.array;
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); }
    for (let i = 0; i < u.length; i += 2) { uv.push(u[i] + (b.uOff || 0), u[i + 1]); }
    geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function mergeGeoms(geos) {
  const pos = [], nor = [], uv = [];
  for (const geo of geos) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const u = g.attributes.uv.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < n.length; i++) nor.push(n[i]);
    for (let i = 0; i < u.length; i++) uv.push(u[i]);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/* ================================================================
   Level 类
================================================================ */
class Level {
  constructor(cfg, seed) {
    this.cfg = cfg;
    this.seed = seed >>> 0;
    this.rng = new RNG(this.seed);
    this.group = null;
    this.grid = null;
    this.W = cfg.size; this.H = cfg.size;
    this.items = [];          // 可交互物/装置
    this.obstacles = [];      // 道具障碍 {x,z,r}
    this.exits = [];          // 传送装置运行时数据
    this.entitySpawn = null;
    this.playerStart = null;
    this.flickerMats = [];
    this.glitchMats = [];     // 裂缝材质（动画）
    this.pointLights = [];
    this.floorMap = null;     // Float32Array W*H 地面高度
    this.holeCells = [];      // {cx,cy,to}
    this.platformCells = new Set();
    this.powerOn = !((cfg.id === 1));
    this.time = 0;
    this._lampPhase = Math.random() * 10;
  }

  cellToWorld(cx, cy) { return [(cx + 0.5) * CELL, (cy + 0.5) * CELL]; }
  worldToCell(x, z) { return [Math.floor(x / CELL), Math.floor(z / CELL)]; }
  isSolidCell(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return true;
    return this.grid[cy][cx] === 1;
  }
  isHoleCell(cx, cy) { return this.floorMap && this.floorMap[cy * this.W + cx] <= HOLE_DEPTH / 2; }

  /** 该点的地面高度（破洞返回极深值） */
  groundAt(x, z) {
    const [cx, cy] = this.worldToCell(x, z);
    if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return 0;
    const f = this.floorMap[cy * this.W + cx];
    return f <= HOLE_DEPTH / 2 ? HOLE_DEPTH : f;
  }

  /** 圆形玩家与实心格碰撞检测（含道具障碍物） */
  circleHitsWall(x, z, r) {
    const minCx = Math.floor((x - r) / CELL), maxCx = Math.floor((x + r) / CELL);
    const minCy = Math.floor((z - r) / CELL), maxCy = Math.floor((z + r) / CELL);
    for (let cy = minCy; cy <= maxCy; cy++) for (let cx = minCx; cx <= maxCx; cx++) {
      if (!this.isSolidCell(cx, cy)) continue;
      const wx = U.clamp(x, cx * CELL, (cx + 1) * CELL);
      const wz = U.clamp(z, cy * CELL, (cy + 1) * CELL);
      if (U.dist2(x, z, wx, wz) < r * r) return true;
    }
    for (const o of this.obstacles) {
      const rr = r + o.r;
      if (U.dist2(x, z, o.x, o.z) < rr * rr) return true;
    }
    return false;
  }
  /** DDA 视线检测 */
  losClear(ax, az, bx, bz) {
    let [cx, cy] = this.worldToCell(ax, az);
    const [ex, ey] = this.worldToCell(bx, bz);
    const dx = bx - ax, dz = bz - az;
    const steps = Math.ceil(Math.sqrt(dx * dx + dz * dz) / (CELL * 0.4)) + 1;
    const px = dx / steps, pz = dz / steps;
    let x = ax, z = az;
    let lx = cx, lz = cy;
    for (let i = 0; i <= steps; i++) {
      const c = this.worldToCell(x, z);
      if (c[0] !== lx || c[1] !== lz) {
        if (this.isSolidCell(c[0], c[1])) return false;
        lx = c[0]; lz = c[1];
      }
      if (c[0] === ex && c[1] === ey) return true;
      x += px; z += pz;
    }
    return !this.isSolidCell(ex, ey);
  }

  /* ---------------- 构建 ---------------- */
  build(scene) {
    const cfg = this.cfg;
    const rng = this.rng;
    const { grid, rooms } = genMap(rng, this.W, this.H, {
      rooms: cfg.rooms != null ? cfg.rooms : 5,
      braid: cfg.braid || (cfg.id === 0 ? 0.1 : 0.16),
      pillars: !!cfg.pillars,
    });
    this.grid = grid;

    /* 高度图初始化 */
    this.floorMap = new Float32Array(this.W * this.H);

    const group = new THREE.Group();
    this.group = group;

    /* 材质 */
    const wallCanvas = cfg.textures.wall.startsWith('whiteVoid') ? Tex.whiteVoid('a') : Tex[cfg.textures.wall]();
    const wallTex = Tex.toTexture(wallCanvas);
    wallTex.encoding = THREE.sRGBEncoding;
    this.wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const floorTexBase = cfg.textures.floor.startsWith('whiteVoid') ? Tex.whiteVoid('f') : Tex[cfg.textures.floor]();
    const floorTex = Tex.toTexture(floorTexBase, this.W, this.H);
    floorTex.encoding = THREE.sRGBEncoding;
    this.floorMat = new THREE.MeshLambertMaterial({ map: floorTex });

    /* ---- 距离场与关键点 ---- */
    const field = bfsField(grid, 1, 1);
    this.playerStart = this.cellToWorld(1, 1);
    const empties = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++)
      if (grid[y][x] === 0 && field[y][x] > 0) empties.push({ x, y, d: field[y][x] });
    empties.sort((a, b) => b.d - a.d);
    this.empties = empties;

    /* ---- 高台 + 楼梯 ---- */
    if (cfg.platformH) this._buildPlatform(group, rooms);

    /* ---- 出口装置（含破洞） ---- */
    this._placeExits(group, empties);

    /* ---- 实体出生点（在装置之后选定，避开破洞/高台） ---- */
    if (cfg.entity) {
      const entOK = c => {
        const f = this.floorMap[c.y * this.W + c.x];
        return f > HOLE_DEPTH / 2 && f <= 0.5;
      };
      let cand = null;
      if (cfg.entity.nearStart) {
        const asc = empties.slice().reverse();
        cand = asc.find(c => c.d >= 4 && c.d <= 7 && entOK(c)) || asc.find(c => c.d >= 3 && entOK(c));
      } else {
        cand = empties.find(c => c.d >= 12 && entOK(c)) || empties.find(c => c.d >= 6 && entOK(c)) || empties.find(entOK);
      }
      if (!cand) cand = empties[Math.min(6, empties.length - 1)];
      this.entitySpawn = this.cellToWorld(cand.x, cand.y);
    }

    /* ---- 墙体（从 -2 到 wallH，覆盖坑洞侧壁） ---- */
    const wallBoxes = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (grid[y][x] !== 1) continue;
      const [wx, wz] = this.cellToWorld(x, y);
      wallBoxes.push({ w: CELL, h: cfg.wallH + 2, d: CELL, x: wx, y: (cfg.wallH - 2) / 2, z: wz, uOff: rng.int(0, 3) });
    }
    group.add(new THREE.Mesh(mergeBoxes(wallBoxes), this.wallMat));

    /* ---- 地板：逐格合并（跳过破洞，支持高差） ---- */
    this._buildFloors(group);

    /* ---- 天花板 ---- */
    const worldW = this.W * CELL, worldH = this.H * CELL;
    const ceilTexKey = cfg.textures.ceil === 'dirtWall' ? Tex.dirtWall() : (cfg.textures.ceil === 'woodCeil' ? Tex.wood() : (cfg.textures.ceil === 'whiteVoidC' ? Tex.whiteVoid('c') : Tex[cfg.textures.ceil]()));
    const ceilTex = Tex.toTexture(ceilTexKey, this.W, this.H);
    ceilTex.encoding = THREE.sRGBEncoding;
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW, worldH),
      new THREE.MeshLambertMaterial({ map: ceilTex })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(worldW / 2, cfg.wallH, worldH / 2);
    group.add(ceil);

    /* ---- 水面（水淹隧道） ---- */
    if (cfg.water) {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(worldW, worldH),
        new THREE.MeshLambertMaterial({ color: 0x0a1418, transparent: true, opacity: 0.62 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(worldW / 2, 0.16, worldH / 2);
      group.add(water);
      this.waterMesh = water;
    }

    /* ---- 物品放置 ---- */
    this._placeItems(group, empties, field);

    /* ---- 场景道具 ---- */
    if (cfg.props) this._placeProps(group, empties);

    /* ---- 黑影彩蛋 ---- */
    if (cfg.shadowEvent) {
      const sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.82, depthWrite: false });
      const sg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.45, 8), sm); body.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), sm); head.position.y = 1.82;
      sg.add(body, head);
      sg.visible = false;
      group.add(sg);
      this.shadowFigure = sg;
      this.shadowTimer = 20 + this.rng.next() * 30;
      this.shadowActiveT = 0;
    }

    /* ---- 灯光 ---- */
    scene.add(new THREE.AmbientLight(0xffffff, cfg.dark ? 0.16 : 0.34));
    const hemi = new THREE.HemisphereLight(cfg.ambient.sky, cfg.ambient.ground, cfg.ambient.intensity);
    group.add(hemi);
    this.hemi = hemi;

    const lampMatOn = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
    const lampMatFlicker = new THREE.MeshBasicMaterial({ color: 0xffedb8 });
    this.flickerMats.push(lampMatFlicker);
    let li = 0;
    const lightSpots = [];
    for (let y = 1; y < this.H - 1; y += cfg.lampsEvery) for (let x = 1; x < this.W - 1; x += cfg.lampsEvery) {
      if (grid[y][x] !== 0) continue;
      const [wx, wz] = this.cellToWorld(x, y);
      const mat = (li % 5 === 3) ? lampMatFlicker : lampMatOn;
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), mat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(wx, cfg.wallH - 0.02, wz);
      group.add(lamp);
      lightSpots.push({ x: wx, z: wz });
      li++;
    }
    const nPL = cfg.pointLights;
    for (let i = 0; i < Math.min(nPL, lightSpots.length); i++) {
      const s = lightSpots[Math.floor(i * lightSpots.length / nPL)];
      const pl = new THREE.PointLight(cfg.id === 0 ? 0xffe9b0 : (cfg.id === 11 ? 0xffffff : 0xcfe8ff), cfg.dark ? 0 : 0.55, 18, 1.6);
      pl.position.set(s.x, cfg.wallH - 0.5, s.z);
      group.add(pl);
      this.pointLights.push(pl);
    }

    if (cfg.alarm) {
      this.alarmLights = [];
      const nAL = Math.min(4, lightSpots.length);
      for (let i = 0; i < nAL; i++) {
        const s = lightSpots[Math.floor(i * lightSpots.length / nAL)];
        const al = new THREE.PointLight(0xff2a1a, 0.8, 22, 1.4);
        al.position.set(s.x, cfg.wallH - 0.4, s.z);
        group.add(al);
        this.alarmLights.push(al);
      }
    }

    /* ---- 尘埃粒子 ---- */
    if (!cfg.noDust) {
      const dustGeo = new THREE.BufferGeometry();
      const DN = 260;
      const dp = new Float32Array(DN * 3);
      for (let i = 0; i < DN; i++) {
        dp[i * 3] = rng.range(0, worldW);
        dp[i * 3 + 1] = rng.range(0.2, cfg.wallH);
        dp[i * 3 + 2] = rng.range(0, worldH);
      }
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
      this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
        color: cfg.id === 11 ? 0xffffff : 0xbbaa88, size: 0.045, transparent: true, opacity: 0.45, sizeAttenuation: true, depthWrite: false,
      }));
      group.add(this.dust);
    }

    scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
    scene.background = new THREE.Color(cfg.fogColor);
    this.sceneRef = scene;
    scene.add(group);
  }

  /* ---------------- 高台与楼梯 ---------------- */
  _buildPlatform(group, rooms) {
    const rng = this.rng;
    const h = this.cfg.platformH;
    // 选离出生点最远的房间
    let best = null, bestScore = -1;
    for (const r of rooms) {
      const score = U.dist2(this.playerStart[0], this.playerStart[1], (r.x + r.w / 2) * CELL, (r.y + r.h / 2) * CELL);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (!best) return;
    // 抬高房间所有空格
    const raised = [];
    for (let y = best.y; y < best.y + best.h; y++) for (let x = best.x; x < best.x + best.w; x++) {
      if (this.grid[y][x] === 0) { this.floorMap[y * this.W + x] = h; this.platformCells.add(y * this.W + x); raised.push({ x, y }); }
    }
    // 从房间边缘向外找直线空地做楼梯（任意方向，每级高差 <= 0.5m）
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const order = dirs.slice().sort(() => rng.next() - 0.5);
    outer:
    for (const [dx, dy] of order) {
      for (const c of raised) {
        let sx2 = c.x + dx, sy2 = c.y + dy;
        if (this.isSolidCell(sx2, sy2)) continue;
        if (this.floorMap[sy2 * this.W + sx2] !== 0 || this.isHoleCell(sx2, sy2)) continue;
        // 沿此方向数连续可用空地
        const run = [];
        while (!this.isSolidCell(sx2, sy2) && this.floorMap[sy2 * this.W + sx2] === 0 && !this.isHoleCell(sx2, sy2)) {
          run.push({ x: sx2, y: sy2 });
          sx2 += dx; sy2 += dy;
        }
        if (run.length >= 2) {
          const n = run.length;
          // 贴平台的格子最高，向外逐级降低
          run.forEach((rc, idx) => {
            this.floorMap[rc.y * this.W + rc.x] = +(h * (n - idx) / (n + 1)).toFixed(3);
          });
          this._stairsBuilt = true;
          break outer;
        }
      }
    }
    // 兜底：在房间边缘放台阶（每级 <= 0.55m 保证可攀爬）
    if (!this._stairsBuilt) {
      outer2:
      for (const [dx, dy] of order) {
        for (const c of raised) {
          const nx2 = c.x + dx, ny2 = c.y + dy;
          if (this.isSolidCell(nx2, ny2)) continue;
          if (this.floorMap[ny2 * this.W + nx2] !== 0 || this.isHoleCell(nx2, ny2)) continue;
          const nx3 = nx2 + dx, ny3 = ny2 + dy;
          if (!this.isSolidCell(nx3, ny3) && this.floorMap[ny3 * this.W + nx3] === 0 && !this.isHoleCell(nx3, ny3)) {
            this.floorMap[ny2 * this.W + nx2] = Math.min(h * 2 / 3, 1.1);
            this.floorMap[ny3 * this.W + nx3] = Math.min(h / 3, 0.52);
            this._stairsBuilt = true;
          } else {
            this.floorMap[ny2 * this.W + nx2] = Math.min(h / 3, 0.52);
            this._stairsBuilt = true;
          }
          break outer2;
        }
      }
    }
  }

  /* ---------------- 地板逐格构建 ---------------- */
  _buildFloors(group) {
    const boxes = [];
    const pitMatsBoxes = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (this.grid[y][x] === 1) continue;
      const f = this.floorMap[y * this.W + x];
      if (f <= HOLE_DEPTH / 2) continue;   // 破洞：不铺地板
      const [wx, wz] = this.cellToWorld(x, y);
      boxes.push({ w: CELL, h: 0.5, d: CELL, x: wx, y: f - 0.25, z: wz });
    }
    group.add(new THREE.Mesh(mergeBoxes(boxes), this.floorMat));
    // 破洞下方深渊提示：极深的黑色盒底（防止看见天空色）
    if (this.holeCells.length) {
      const voidMat = new THREE.MeshBasicMaterial({ color: 0x010102 });
      for (const hc of this.holeCells) {
        const [wx, wz] = this.cellToWorld(hc.cx, hc.cy);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), voidMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(wx, -22, wz);
        group.add(m);
      }
    }
  }

  /* ---------------- 出口装置 ---------------- */
  _placeExits(group, empties) {
    const rng = this.rng;
    const chosen = [];
    const okCell = c => {
      if (c.d < 5) return false;
      if (this.isHoleCell(c.x, c.y)) return false;
      if (this.floorMap[c.y * this.W + c.x] > 0.4) return false;   // 装置不在高台上（破洞除外已排除）
      const key = c.y * this.W + c.x;
      if (this.platformCells.has(key)) return false;
      // 与已选装置保持距离
      for (const o of chosen) if (Math.abs(o.c.x - c.x) + Math.abs(o.c.y - c.y) < 8) return false;
      // 与出生点距离
      if (Math.abs(c.x - 1) + Math.abs(c.y - 1) < 6) return false;
      return true;
    };
    const hasWallNeighbor = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.isSolidCell(c.x + dx, c.y + dy));
    const wallDirOf = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => this.isSolidCell(c.x + dx, c.y + dy));

    for (const exCfg of this.cfg.exits) {
      let spot = null, guard = 0;
      while (!spot && guard++ < 900) {
        const c = empties[rng.int(2, empties.length - 1)];
        if (!okCell(c)) continue;
        if ((exCfg.kind === 'door' || exCfg.kind === 'elevator' || exCfg.kind === 'pipe' || exCfg.kind === 'lightdoor') && !hasWallNeighbor(c)) continue;
        spot = c;
      }
      if (!spot) spot = empties[Math.max(2, Math.floor(empties.length * 0.3))];
      chosen.push({ c: spot });
      const dev = this._buildDevice(group, exCfg, spot);
      this.exits.push(dev);
      this.items.push({ type: 'device', ref: dev, x: dev.x, z: dev.z, taken: false, title: '', body: '' });
    }
  }

  _buildDevice(group, exCfg, cell) {
    const [wx, wz] = this.cellToWorld(cell.x, cell.y);
    const g = new THREE.Group();
    g.position.set(wx, 0, wz);
    const kinds = {};
    let yaw = 0;
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a3428 });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x50565a });

    const wallDir = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => this.isSolidCell(cell.x + dx, cell.y + dy));

    if (exCfg.kind === 'door' || exCfg.kind === 'elevator' || exCfg.kind === 'lightdoor') {
      // 门框靠墙放置，面向房间
      if (wallDir) yaw = Math.atan2(-wallDir[0], -wallDir[1]);
      g.rotation.y = yaw;
      const jgeo = new THREE.BoxGeometry(0.28, 2.5, 0.28);
      const l1 = new THREE.Mesh(jgeo, exCfg.kind === 'elevator' ? metalMat : frameMat); l1.position.set(-0.95, 1.25, 0.1);
      const l2 = new THREE.Mesh(jgeo, exCfg.kind === 'elevator' ? metalMat : frameMat); l2.position.set(0.95, 1.25, 0.1);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.28), exCfg.kind === 'elevator' ? metalMat : frameMat); top.position.set(0, 2.6, 0.1);
      g.add(l1, l2, top);
      let panelMat;
      if (exCfg.kind === 'lightdoor') {
        panelMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
        const glow = new THREE.PointLight(0xfff6e0, 1.1, 16, 1.4);
        glow.position.set(wx, 1.7, wz);
        group.add(glow);
      } else if (exCfg.kind === 'elevator') {
        const t = Tex.toTexture(Tex.door(true)); t.encoding = THREE.sRGBEncoding;
        panelMat = new THREE.MeshLambertMaterial({ map: t });
        // 电梯状态灯
        const st = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
          new THREE.MeshBasicMaterial({ color: exCfg.needsPower ? 0xff3020 : 0x33ff55 }));
        st.position.set(0, 2.75, 0.12);
        g.add(st);
        this._elevLamp = st.material;
      } else {
        const t = Tex.toTexture(Tex.door(false)); t.encoding = THREE.sRGBEncoding;
        panelMat = new THREE.MeshLambertMaterial({ map: t });
      }
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 2.45), panelMat);
      panel.position.set(0, 1.25, 0.1);
      g.add(panel);
      if (exCfg.lock) {
        // 门禁读卡器
        const reader = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xff3020 }));
        reader.position.set(1.12, 1.35, 0.14);
        g.add(reader);
        this._readerLamp = reader.material;
      }
    } else if (exCfg.kind === 'pipe') {
      if (wallDir) yaw = Math.atan2(-wallDir[0], -wallDir[1]);
      g.rotation.y = yaw;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.1, 14, 1, true),
        new THREE.MeshLambertMaterial({ color: 0x23282a, side: THREE.DoubleSide }));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(0, 0.62, 0.35);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.05, 8, 16), metalMat);
      rim.position.set(0, 0.62, 0.88);
      const dark = new THREE.Mesh(new THREE.CircleGeometry(0.48, 14),
        new THREE.MeshBasicMaterial({ color: 0x000000 }));
      dark.position.set(0, 0.62, 0.86);
      g.add(pipe, rim, dark);
    } else if (exCfg.kind === 'glitch') {
      // 现实裂缝：悬浮的闪烁半透明裂片，可直接走入
      const gm = new THREE.MeshBasicMaterial({ color: 0x1a1420, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      const shard = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.6), gm);
      shard.position.y = 1.35;
      shard.rotation.y = this.rng.next() * Math.PI;
      g.add(shard);
      const shard2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.9), gm.clone());
      shard2.position.y = 1.3;
      shard2.rotation.y = shard.rotation.y + 0.9;
      g.add(shard2);
      this.glitchMats.push(gm, shard2.material);
      const gl = new THREE.PointLight(0x8866ff, 0.5, 8, 2);
      gl.position.set(wx, 1.6, wz);
      group.add(gl);
    } else if (exCfg.kind === 'hole') {
      // 地板破洞：标记 floorMap 并加碎边装饰
      const cx = cell.x, cy = cell.y;
      this.floorMap[cy * this.W + cx] = HOLE_DEPTH;
      this.holeCells.push({ cx, cy, to: exCfg.to });
      // 碎裂边缘（几块斜板）
      const debrisMat = new THREE.MeshLambertMaterial({ color: 0x4a4438 });
      for (let i = 0; i < 5; i++) {
        const a = this.rng.next() * Math.PI * 2;
        const d = new THREE.Mesh(new THREE.BoxGeometry(this.rng.range(0.3, 0.7), 0.06, this.rng.range(0.3, 0.7)), debrisMat);
        d.position.set(wx + Math.cos(a) * (CELL * 0.42), 0.02, wz + Math.sin(a) * (CELL * 0.42));
        d.rotation.set(this.rng.range(-0.3, 0.3), this.rng.next() * 3, this.rng.range(-0.3, 0.3));
        group.add(d);
      }
      group.add(g);
      return { kind: 'hole', to: exCfg.to, x: wx, z: wz, cx, cy, used: false, label: '🕳️ 破洞' };
    }
    group.add(g);
    return {
      kind: exCfg.kind, to: exCfg.to, x: wx, z: wz,
      needsPower: !!exCfg.needsPower, lock: exCfg.lock || null,
      ending: !!exCfg.ending, used: false,
      label: { door: '🚪 门', elevator: '🛗 电梯', pipe: '🕳️ 管道', glitch: '⚡ 现实裂缝', lightdoor: '✨ 光之门' }[exCfg.kind],
    };
  }

  /* ---------------- 道具网格 ---------------- */
  _makeItemMesh(type) {
    const g = new THREE.Group();
    if (type === 'keycard') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.17),
        new THREE.MeshLambertMaterial({ color: 0xe8dfbe, emissive: 0x554a1e }));
      m.position.y = 0.03; g.add(m);
    } else if (type === 'fuse') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10),
        new THREE.MeshLambertMaterial({ color: 0xb03a2a, emissive: 0x300a05 }));
      m.rotation.z = Math.PI / 2; m.position.y = 0.07;
      g.add(m);
      const capMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
      const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10), capMat);
      c1.rotation.z = Math.PI / 2; c1.position.set(-0.1, 0.07, 0);
      const c2 = c1.clone(); c2.position.x = 0.1;
      g.add(c1, c2);
    } else if (type === 'adrenaline') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8),
        new THREE.MeshLambertMaterial({ color: 0xd8d2c0, emissive: 0x3a1010 }));
      body.rotation.z = Math.PI / 2; body.position.y = 0.05;
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6),
        new THREE.MeshLambertMaterial({ color: 0xbbbbbb }));
      needle.rotation.z = Math.PI / 2; needle.position.set(0.12, 0.05, 0);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.06, 8),
        new THREE.MeshLambertMaterial({ color: 0xb03a2a, emissive: 0x400a05 }));
      label.rotation.z = Math.PI / 2; label.position.y = 0.05;
      g.add(body, needle, label);
    } else if (type === 'almond') {
      // 杏仁水：小玻璃瓶
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.2, 10),
        new THREE.MeshLambertMaterial({ color: 0xd8e4dc, transparent: true, opacity: 0.75, emissive: 0x1a2820 }));
      bottle.position.y = 0.1;
      const water2 = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.048, 0.14, 10),
        new THREE.MeshLambertMaterial({ color: 0xcfe0d8, emissive: 0x223828 }));
      water2.position.y = 0.085;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 8),
        new THREE.MeshLambertMaterial({ color: 0x8a2a2a }));
      cap.position.y = 0.215;
      g.add(bottle, water2, cap);
    } else if (type === 'note') {
      const t = Tex.toTexture(Tex.paperNote());
      t.encoding = THREE.sRGBEncoding;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42),
        new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, emissive: 0x33301f }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * Math.PI * 2;
      m.position.y = 0.015; g.add(m);
    }
    return g;
  }

  /** 在候选格中挑选互不相同的放置点 */
  _pickSpots(empties, count, minDistCells) {
    const spots = [];
    let guard = 0;
    while (spots.length < count && guard++ < 600) {
      const c = empties[this.rng.int(4, empties.length - 1)];
      if (this.floorMap[c.y * this.W + c.x] <= HOLE_DEPTH / 2) continue;
      if (spots.every(s => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) >= minDistCells)) spots.push(c);
    }
    while (spots.length < count) spots.push(empties[this.rng.int(4, empties.length - 1)]);
    return spots;
  }

  _placeItems(group, empties, field) {
    const cfg = this.cfg;
    const types = [];
    // 纸条：每层 2 张
    types.push('note', 'note');
    // 层级专属
    if (cfg.id === 1) types.push('fuse');
    if (cfg.adrenaline) { for (let i = 0; i < cfg.adrenaline; i++) types.push('adrenaline'); }
    // 杏仁水：多数层 1-2 瓶
    if (![11].includes(cfg.id)) { types.push('almond'); if (cfg.size >= 25) types.push('almond'); }
    // 配置的额外物品（如门禁卡）
    if (cfg.items) types.push(...cfg.items);

    const spots = this._pickSpots(empties, types.length, 6);
    const NOTES = NOTE_TEXTS[cfg.id] || [];
    let noteIdx = 0;
    types.forEach((t, idx) => {
      const c = spots[idx];
      const [wx, wz] = this.cellToWorld(c.x, c.y);
      const mesh = this._makeItemMesh(t === 'fuse' ? 'fuse' : t);
      mesh.position.set(wx + this.rng.range(-1, 1), this.groundAt(mesh.position.x, mesh.position.z) > HOLE_DEPTH / 2 ? this.groundAt(mesh.position.x, mesh.position.z) : 0, wz + this.rng.range(-1, 1));
      group.add(mesh);
      let title = '', body = '';
      if (t === 'note' && NOTES.length) {
        const n = NOTES[noteIdx++ % NOTES.length];
        title = n.t; body = n.b;
      }
      this.items.push({ type: t, x: mesh.position.x, z: mesh.position.z, y: mesh.position.y, mesh, taken: false, title, body });
    });

    /* L1 配电箱 */
    if (cfg.id === 1) {
      const mid = empties[Math.floor(empties.length * 0.55)];
      const [bx, bz] = this.cellToWorld(mid.x, mid.y);
      const box = this._makePowerBox();
      box.position.set(bx, 0, bz);
      group.add(box);
      this.items.push({ type: 'powerbox', x: bx, z: bz, mesh: box, taken: false, title: '', body: '' });
    }
  }

  _makePowerBox() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x5a6360 }));
    body.position.y = 0.65;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x2c332f }));
    face.position.set(0, 0.75, 0.26);
    const lampR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    lampR.position.set(0.18, 1.15, 0.27);
    const lampG = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x113311 }));
    lampG.position.set(-0.18, 1.15, 0.27);
    this._pbLamps = { r: lampR.material, g: lampG.material };
    g.add(body, face, lampR, lampG);
    return g;
  }

  /* ---------------- 场景道具 ---------------- */
  _placeProps(group, empties) {
    const cfg = this.cfg;
    const rng = this.rng;
    const lists = { rust: [], wood: [], metal: [], dirt: [], green: [] };
    const mats = {};
    const mkMat = (key, texCanvas) => {
      const t = Tex.toTexture(texCanvas);
      t.encoding = THREE.sRGBEncoding;
      mats[key] = new THREE.MeshLambertMaterial({ map: t });
    };
    mkMat('rust', Tex.rust()); mkMat('wood', Tex.wood()); mkMat('metal', Tex.metal()); mkMat('dirt', Tex.dirtWall());

    const addBox = (list, w, h, d, x, y, z, ry) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      if (ry) geo.rotateY(ry);
      geo.translate(x, y, z);
      list.push(geo);
    };
    const addCyl = (list, r, h, x, y, z) => {
      const geo = new THREE.CylinderGeometry(r, r, h, 10);
      geo.translate(x, y, z);
      list.push(geo);
    };

    const totalCount = Object.values(cfg.props).reduce((a, b) => a + b, 0);
    const spots = this._pickSpotsAwayFromImportant(empties, totalCount, 4);
    let i = 0;
    for (const [type, count] of Object.entries(cfg.props)) {
      for (let k = 0; k < count; k++) {
        if (i >= spots.length) break;
        const cell = spots[i++];
        const [cx, cz] = this.cellToWorld(cell.x, cell.y);
        const gy = this.floorMap[cell.y * this.W + cell.x] || 0;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => this.isSolidCell(cell.x + dx, cell.y + dy));
        let px = cx + rng.range(-1.2, 1.2), pz = cz + rng.range(-1.2, 1.2);
        if (dirs.length) {
          const [dx, dy] = rng.pick(dirs);
          px = cx + dx * 1.35 + (dy !== 0 ? rng.range(-1.1, 1.1) : 0);
          pz = cz + dy * 1.35 + (dx !== 0 ? rng.range(-1.1, 1.1) : 0);
        }
        if (type === 'barrel') {
          addCyl(lists.rust, 0.42, 0.95, px, gy + 0.475, pz);
          addCyl(lists.metal, 0.44, 0.06, px, gy + 0.72, pz);
          this.obstacles.push({ x: px, z: pz, r: 0.55 });
        } else if (type === 'crate') {
          addBox(lists.wood, 0.85, 0.85, 0.85, px, gy + 0.425, pz, rng.range(0, Math.PI));
          if (rng.next() < 0.4) addBox(lists.wood, 0.65, 0.65, 0.65, px + rng.range(-0.3, 0.3), gy + 1.17, pz + rng.range(-0.3, 0.3), rng.range(0, Math.PI));
          this.obstacles.push({ x: px, z: pz, r: 0.62 });
        } else if (type === 'desk') {
          const ry = rng.pick([0, Math.PI / 2]);
          addBox(lists.wood, ry ? 0.7 : 1.5, 0.06, ry ? 1.5 : 0.7, px, gy + 0.75, pz, 0);
          addBox(lists.metal, ry ? 0.62 : 0.05, 0.72, ry ? 0.05 : 0.62, px + (ry ? 0 : 0.7), gy + 0.36, pz + (ry ? 0.7 : 0), 0);
          addBox(lists.metal, ry ? 0.62 : 0.05, 0.72, ry ? 0.05 : 0.62, px - (ry ? 0 : 0.7), gy + 0.36, pz - (ry ? 0.7 : 0), 0);
          this.obstacles.push({ x: px, z: pz, r: 0.8 });
        } else if (type === 'cabinet') {
          addBox(lists.metal, 0.55, 1.35, 0.6, px, gy + 0.675, pz, rng.range(-0.15, 0.15));
          this.obstacles.push({ x: px, z: pz, r: 0.5 });
        } else if (type === 'chair') {
          const ry = rng.range(0, Math.PI * 2);
          addBox(lists.wood, 0.46, 0.07, 0.46, px, gy + 0.12, pz, ry);
          const bx = px - Math.cos(ry) * 0.2, bz = pz - Math.sin(ry) * 0.2;
          addBox(lists.wood, 0.46, 0.5, 0.06, bx, gy + 0.3, bz, ry);
          this.obstacles.push({ x: px, z: pz, r: 0.45 });
        } else if (type === 'shelf') {
          // 高货架：双柱+三层板
          const ry = rng.pick([0, Math.PI / 2]);
          const w = ry ? 0.7 : 2.4, d = ry ? 2.4 : 0.7;
          addBox(lists.metal, w, 0.07, d, px, gy + 0.6, pz, 0);
          addBox(lists.metal, w, 0.07, d, px, gy + 1.5, pz, 0);
          addBox(lists.metal, w, 0.07, d, px, gy + 2.4, pz, 0);
          addBox(lists.metal, 0.09, 2.6, 0.09, px + (ry ? 0 : w / 2 - 0.05), gy + 1.3, pz + (ry ? d / 2 - 0.05 : 0), 0);
          addBox(lists.metal, 0.09, 2.6, 0.09, px - (ry ? 0 : w / 2 - 0.05), gy + 1.3, pz - (ry ? 0 : d / 2 - 0.05), 0);
          addBox(lists.wood, w * 0.5, 0.4, d * 0.6, px + rng.range(-0.4, 0.4), gy + 0.85, pz, rng.range(0, 1));
          this.obstacles.push({ x: px, z: pz, r: ry ? 1.0 : 1.1 });
        } else if (type === 'locker') {
          addBox(lists.metal, 0.6, 1.9, 0.55, px, gy + 0.95, pz, rng.range(-0.2, 0.2));
          this.obstacles.push({ x: px, z: pz, r: 0.5 });
        } else if (type === 'bed') {
          const ry = rng.pick([0, Math.PI / 2]);
          addBox(lists.wood, ry ? 1.0 : 2.0, 0.3, ry ? 2.0 : 1.0, px, gy + 0.25, pz, 0);
          addBox(lists.metal, ry ? 0.95 : 1.9, 0.14, ry ? 1.9 : 0.95, px, gy + 0.47, pz, 0);
          this.obstacles.push({ x: px, z: pz, r: ry ? 0.85 : 1.15 });
        } else if (type === 'plant') {
          // 枯萎盆栽
          addCyl(lists.rust, 0.18, 0.3, px, gy + 0.15, pz);
          addCyl(lists.wood, 0.03, 0.5, px, gy + 0.5, pz);
          addBox(lists.green, 0.04, 0.3, 0.22, px + 0.08, gy + 0.68, pz, rng.range(0, 3));
          addBox(lists.green, 0.22, 0.04, 0.22, px - 0.05, gy + 0.74, pz, rng.range(0, 3));
          this.obstacles.push({ x: px, z: pz, r: 0.3 });
        } else if (type === 'pipeCol') {
          // 立管
          addCyl(lists.rust, 0.16, cfg.wallH, px, gy + cfg.wallH / 2, pz);
          addCyl(lists.metal, 0.2, 0.1, px, gy + 2.2, pz);
          this.obstacles.push({ x: px, z: pz, r: 0.3 });
        } else if (type === 'pallet') {
          addBox(lists.wood, 1.1, 0.12, 1.1, px, gy + 0.06, pz, rng.range(0, Math.PI));
          if (rng.next() < 0.5) { addBox(lists.wood, 1.0, 0.12, 1.0, px, gy + 0.18, pz, rng.range(0, Math.PI));
            this.obstacles.push({ x: px, z: pz, r: 0.7 });
          } else {
            this.obstacles.push({ x: px, z: pz, r: 0.65 });
          }
        }
      }
    }

    for (const key of Object.keys(lists)) {
      if (!lists[key] || !lists[key].length) continue;
      const mesh = new THREE.Mesh(mergeGeoms(lists[key]), mats[key]);
      group.add(mesh);
    }
    // 枯叶（绿）单独材质
    if (lists.green && lists.green.length) {
      const m = new THREE.MeshLambertMaterial({ color: 0x4a5a38 });
      group.add(new THREE.Mesh(mergeGeoms(lists.green), m));
    }
  }

  /** 避开出生点/装置/物品/实体刷新点的道具选位 */
  _pickSpotsAwayFromImportant(empties, count, minDistCells) {
    const imp = [{ x: this.playerStart[0], z: this.playerStart[1] }]
      .concat(this.exits.map(e => ({ x: e.x, z: e.z })))
      .concat(this.items.map(it => ({ x: it.x, z: it.z })));
    if (this.entitySpawn) imp.push({ x: this.entitySpawn[0], z: this.entitySpawn[1] });
    const spots = [];
    let guard = 0;
    while (spots.length < count && guard++ < 800) {
      const c = empties[this.rng.int(3, empties.length - 1)];
      if (this.floorMap[c.y * this.W + c.x] > 0.4) continue;
      const [wx, wz] = this.cellToWorld(c.x, c.y);
      if (!imp.every(p => U.dist2(wx, wz, p.x, p.z) > 2.4 * 2.4)) continue;
      if (!spots.every(s => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) >= minDistCells)) continue;
      spots.push(c);
    }
    return spots;
  }

  /* ---------------- 状态推进 ---------------- */
  setPower(on) {
    this.powerOn = on;
    const cfg = this.cfg;
    if (on) {
      this.hemi.intensity = 0.5;
      this.pointLights.forEach(pl => { pl.intensity = 0.6; });
      if (this.sceneRef && this.sceneRef.fog) {
        this.sceneRef.fog.density = cfg.fogDensity * 0.55;
        this.sceneRef.background.setHex(cfg.fogColor).multiplyScalar(2.2);
      }
      if (this._pbLamps) { this._pbLamps.r.color.setHex(0x331111); this._pbLamps.g.color.setHex(0x33ff55); }
      if (this._elevLamp) this._elevLamp.color.setHex(0x33ff55);
    }
  }

  unlockDoor(dev) {
    if (dev && this._readerLamp) this._readerLamp.color.setHex(0x33ff55);
  }

  update(dt) {
    this.time += dt;
    if (this.alarmLights) {
      const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(this.time * Math.PI / 0.8));
      for (const al of this.alarmLights) al.intensity = pulse * 1.3;
    }
    // 灯光闪烁
    const ph = this.time * 13 + this._lampPhase;
    const heavy = this.cfg.flickerHeavy ? 0.72 : -0.86;
    for (const m of this.flickerMats) {
      const f = Math.sin(ph * 3.1) * Math.sin(ph * 7.7) * Math.sin(ph * 1.3);
      const on = f > heavy;
      const base = this.cfg.dark && !this.powerOn ? 0 : 1;
      const v = on ? base : base * 0.15;
      m.color.setRGB(v, v * 0.93, v * 0.72);
    }
    // 现实裂缝闪烁
    for (let i = 0; i < this.glitchMats.length; i++) {
      const m = this.glitchMats[i];
      m.opacity = 0.22 + 0.2 * Math.abs(Math.sin(this.time * (2.1 + i * 1.7) + i * 2));
    }
    // 水面微光
    if (this.waterMesh) this.waterMesh.material.opacity = 0.58 + 0.06 * Math.sin(this.time * 1.7);
    // 尘埃漂浮
    if (this.dust) {
      const p = this.dust.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * 0.06;
        if (y > this.cfg.wallH) y = 0.2;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
  }
}

function cellDist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

/* ============ 纸条内容（每层世界观） ============ */
const NOTE_TEXTS = {
  0: [
    { t: '撕下的日记', b: '第3天。\n荧光灯永远不会熄灭。数过了，从这个房间到下一个房间，是四十七步。\n\n如果有人读到这张纸：有些墙只是"看起来"是墙。走进去的时候不要闭眼。' },
    { t: '流浪者留言', b: '我亲眼看见老王从地板的破洞掉了下去。\n三天后我在一个全是水的地方又见到了他——或者说，见到了他的手电筒。\n\n破洞不会摔死人。破洞只是……换地方。' },
  ],
  1: [
    { t: '值班表背面', b: 'B2 区又停电了。老张说配电箱的保险丝被人拆走了。\n\n电梯没电就是一口铁棺材。但通向黑暗的管道一直是开的——如果你非要走那条路的话。' },
    { t: '写给上面的人', b: '如果你坐上了电梯，替我看看真正的天空是什么颜色。\n我在这里太久了，快忘了。\n\n高台上的风景也没什么好看的，别爬上去看了，会哭。' },
  ],
  2: [
    { t: '管道检修记录', b: '7 号竖井再次堵塞。堵塞物：不明有机组织。\n申请：请不要再往管道里扔东西。\n\n另：爬行声是正常的。大概率是正常的。' },
    { t: '潦草的字条', b: '它在管道里比在地上快。\n它眼睛不好，但耳朵好使得吓人。\n\n想活命就轻手轻脚，想死就继续跑。' },
  ],
  3: [
    { t: '员工守则 · 修订版', b: '欢迎来到本公司！\n1. 下班后请勿留在工位。\n2. 听到键盘声而办公室无人时，请勿寻找声源。\n3. 电梯只停它想停的楼层。' },
    { t: 'IT 部的便签', b: '服务器机房搬走了，但走廊尽头的高个子还在。\n我们叫它"猎手"。别在工位之间跑，它把奔跑声当打卡铃。' },
  ],
  4: [
    { t: '入住须知', b: '欢迎光临！\n本酒店共有 ∞ 间客房，每间都已入住。\n\n请勿打扰其他客人。请勿在走廊奔跑。请勿试图退房。' },
    { t: '门童的领结', b: '门禁卡就在酒店的某处地上——前台没有前台。\n通往地下避难所的门需要它。\n\n那扇门后面的警报声从来没停过。我不推荐去。' },
  ],
  5: [
    { t: '盲人的忠告', b: '这层没有光。好在我也不需要光。\n\n规则：走路，别跑。它分不清脚步和鼓点，但它知道哪个更香。\n手电筒？手电筒是它的开饭铃。' },
    { t: '摸黑写的字', b: '字可能歪了。手在抖。\n\n地板有个洞，洞里有水声。跳下去比留在这里强。\n——第 9 批探索队最后的留言' },
  ],
  6: [
    { t: '水位记录', b: '水位没变。永远是脚踝。\n\n但脚印会变。每天早上，水里都会多出一串不是我们的脚印，从隧道深处来，回到隧道深处去。' },
    { t: '漂流瓶里的纸', b: '居然有人在水淹层钓鱼。\n他说钓上来过一部还会响的手机。\n\n铃声是从水底传来的。' },
  ],
  7: [
    { t: '矿工的账本', b: '正字第 214 划。我们数的是支撑木断裂的声音。\n\n今天多了一根。它断的时候，坑道深处的黑暗好像……吸了一口气。' },
    { t: '警告牌残片', b: '前方塌方区\n禁止……\n（后半句被烧掉了）\n\n用炭笔补写的一行小字：禁止回头。' },
  ],
  8: [
    { t: '库存清单 #4471', b: '货架 88 排：空\n货架 89 排：空\n货架 90 排：空\n……\n货架 ∞ 排：一位顾客\n备注：顾客不是我们放进去的。' },
    { t: '货运单', b: '货梯可直达"白色空间"。\n没人知道白色空间是什么，因为去过的人描述不出来——\n他们回来后只会重复一句话：好亮，好静，好想回去。' },
  ],
  9: [
    { t: '查房记录', b: '307 床：无异常\n308 床：无异常\n309 床：（新增）\n\n我们只有 308 张床。' },
    { t: '护士站便签', b: '夜班护士说走廊尽头的灯闪的时候，能照见"她"。\n灯不闪的时候，也能照见。\n\n只是灯闪的时候，她离得比较近。' },
  ],
  10: [
    { t: '紧急广播残页', b: '……警报已激活。M.E.G. 提醒所有流浪者：\n不要进入响着警报的楼层。那里的实体处于猎杀状态，且永不疲倦。\n\n如果你已经在里面了——跑。别回头，别停下，别相信安静。' },
    { t: '针剂使用说明', b: '肾上腺素注射剂（实验批号 09）\n效果：瞬间恢复体能，短时间爆发速度。\n副作用：心悸、手抖、以及一种"背后有东西"的错觉。\n\n注：那不是错觉。' },
  ],
  11: [
    { t: '白色的第一页', b: '这里什么都没有。\n没有墙纸，没有水滴，没有脚步声。\n\n我居然开始想念那些嗡嗡声了。人真的是种很贱的东西。' },
    { t: '门边的刻字', b: '光门的另一边是天空。我发誓这次是真的。\n\n——第 7 批探索队 全员\n（下面还有一行小字：除了老王，他说他想留下看看还有没有别人。）' },
  ],
};
