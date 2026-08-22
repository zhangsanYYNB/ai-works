/* ============ 关卡：地图生成 / 场景构建 / 碰撞 ============ */
'use strict';

const CELL = 4;          // 每格尺寸（米）
const EYE_H = 1.62;      // 视线高度

/* ---------- 关卡配置 ---------- */
const LEVEL_CFGS = [
  {
    id: 0,
    name: 'LEVEL 0 · 黄色迷宫',
    size: 23,
    wallH: 3.1,
    fogColor: 0x14100a, fogDensity: 0.055,
    ambient: { sky: 0x8a7d55, ground: 0x3a3018, intensity: 0.85 },
    hemiExtra: 0.35,
    textures: { wall: 'wallpaper', floor: 'carpet', ceil: 'ceiling' },
    lampsEvery: 2,       // 每 N 格一盏灯（空地，黄色迷宫要亮）
    pointLights: 5,
    dark: false,
    props: {},           // 黄色迷宫保持空旷（原作氛围）
    entity: null,        // 本层无实体
    objectiveFlow: [
      '目标：探索迷宫，找到 <b>门禁卡 🔑</b>',
      '目标：找到出口，刷开门禁卡 ✅',
    ],
    introText: '你从现实中脱落了。这里是无尽的黄色房间……找一张门禁卡，打开那扇不属于任何地方的门。',
  },
  {
    id: 1,
    name: 'LEVEL 1 · 潮湿车库',
    size: 25,
    wallH: 3.0,
    fogColor: 0x05060a, fogDensity: 0.075,
    ambient: { sky: 0x232c38, ground: 0x0a0c10, intensity: 0.22 },
    hemiExtra: 0.06,
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 3,
    pointLights: 4,
    dark: true,          // 供电前几乎全黑
    props: { barrel: 8, crate: 8 },
    entity: {
      name: '潜行者',
      speedPatrol: 1.7, speedChase: 3.6,
      sightRange: 14, hearingRange: 9, catchRange: 1.15,
      deathText: '潮湿的黑暗里，它一直贴着柱子在等你。',
    },
    objectiveFlow: [
      '目标：在黑暗中找到 <b>保险丝 🔌</b>',
      '目标：把保险丝装进配电箱，恢复供电',
      '目标：在电梯面板输入 <b>4 位密码</b>',
      '目标：乘电梯离开 ⬆',
    ],
    introText: '停电的车库。积水倒映着你看不见的东西。恢复供电，找到密码，乘电梯上去。',
  },
  {
    id: 2,
    name: 'LEVEL 2 · 废弃办公室',
    size: 27,
    wallH: 2.9,
    fogColor: 0x0b0a08, fogDensity: 0.06,
    ambient: { sky: 0x6a6552, ground: 0x24211a, intensity: 0.4 },
    hemiExtra: 0.12,
    textures: { wall: 'officeWall', floor: 'officeFloor', ceil: 'garageCeil' },
    lampsEvery: 3,
    pointLights: 4,
    dark: false,
    props: { desk: 6, cabinet: 7, chair: 7 },
    entity: {
      name: '猎手',
      speedPatrol: 2.1, speedChase: 4.3,
      sightRange: 17, hearingRange: 12, catchRange: 1.15,
      deathText: '它比你想的更快。奔跑的声音就是它的晚餐铃。',
    },
    objectiveFlow: [
      '目标：收集 <b>3 张软盘 💾</b>（0/3）',
      '目标：把软盘插入主机的终端',
      '目标：穿过终端解锁的白光之门 ☀',
    ],
    introText: '最后一层——废弃的办公区。传说收集齐三张软盘、唤醒中央终端，就能撕开一道通往现实的口子。',
  },
  {
    id: 3,
    name: "LEVEL ! · 红色警报",
    size: 21,
    wallH: 2.8,
    fogColor: 0x1c0606, fogDensity: 0.075,
    ambient: { sky: 0x661e1a, ground: 0x260908, intensity: 0.4 },
    hemiExtra: 0.08,
    textures: { wall: 'concreteWall', floor: 'wetFloor', ceil: 'garageCeil' },
    lampsEvery: 4, pointLights: 3,
    dark: false,
    alarm: true,          // 红色警报灯 + 警笛
    braid: 0.35,          // 高环路迷宫，方便兜圈子
    props: { barrel: 6, crate: 6, chair: 4 },
    adrenaline: 5,        // 肾上腺素数量
    entity: {
      name: '暴走者',
      speedPatrol: 3.0, speedChase: 4.5,
      sightRange: 999, hearingRange: 999, catchRange: 1.15,
      alwaysChase: true, nearStart: true,
      deathText: '它不知疲倦。下一次，用上肾上腺素，别跑直线。',
    },
    objectiveFlow: [
      '目标：<b>跑！</b>不要停下 🏃',
      '目标：白光之门就在附近 ☀',
    ],
    introText: '避难通道的警报响了。整层都醒了——它正在你身后。<b>别停下。</b>白门是唯一的出口。',
  },
];

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

  // 2. 打通部分死路（环路，减少挫败感）
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (at(x, y) === 1 && rng.next() < (opts.braid || 0.12)) {
      // 仅当打通后两侧都是路时才开
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

  // 4. 大房间里加柱子（车库/办公室风格）
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
  // boxes: {w,h,d,x,y,z,uOff}
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

/** 合并任意已变换几何（toNonIndexed 后拼接） */
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
    this.items = [];          // 可交互物
    this.obstacles = [];      // 道具障碍 {x,z,r}
    this.exit = null;
    this.entitySpawn = null;
    this.playerStart = null;
    this.flickerMats = [];    // 会闪烁的灯材质
    this.pointLights = [];
    this.powerOn = false;     // L1 状态
    this.time = 0;
    this._lampPhase = Math.random() * 10;
  }

  cellToWorld(cx, cy) { return [(cx + 0.5) * CELL, (cy + 0.5) * CELL]; }
  worldToCell(x, z) { return [Math.floor(x / CELL), Math.floor(z / CELL)]; }
  isSolidCell(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return true;
    return this.grid[cy][cx] === 1;
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
    // 场景道具障碍
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
    const { grid } = genMap(rng, this.W, this.H, {
      rooms: cfg.id === 0 ? 4 : (cfg.id === 3 ? 2 : 6),
      braid: cfg.braid || (cfg.id === 0 ? 0.1 : 0.16),
      pillars: cfg.id === 1 || cfg.id === 2,
    });
    this.grid = grid;

    const group = new THREE.Group();
    this.group = group;

    /* 材质 */
    const wallTex = Tex.toTexture(Tex[cfg.textures.wall]());
    const floorTex = Tex.toTexture(Tex[cfg.textures.floor](), this.W, this.H);
    const ceilTex = Tex.toTexture(Tex[cfg.textures.ceil](), this.W, this.H);
    wallTex.encoding = THREE.sRGBEncoding;
    floorTex.encoding = THREE.sRGBEncoding;
    ceilTex.encoding = THREE.sRGBEncoding;
    this.wallMat = new THREE.MeshLambertMaterial({ map: wallTex });

    /* 墙体（逐格合并） */
    const wallBoxes = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (grid[y][x] !== 1) continue;
      const [wx, wz] = this.cellToWorld(x, y);
      wallBoxes.push({ w: CELL, h: cfg.wallH, d: CELL, x: wx, y: cfg.wallH / 2, z: wz, uOff: rng.int(0, 3) });
    }
    const wallMesh = new THREE.Mesh(mergeBoxes(wallBoxes), this.wallMat);
    group.add(wallMesh);

    /* 地板 / 天花板 */
    const worldW = this.W * CELL, worldH = this.H * CELL;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW, worldH),
      new THREE.MeshLambertMaterial({ map: floorTex })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(worldW / 2, 0, worldH / 2);
    group.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW, worldH),
      new THREE.MeshLambertMaterial({ map: ceilTex })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(worldW / 2, cfg.wallH, worldH / 2);
    group.add(ceil);

    /* ---- 距离场，用于放置 ---- */
    const field = bfsField(grid, 1, 1);
    this.playerStart = this.cellToWorld(1, 1);
    // 收集所有空格按距离排序
    const empties = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++)
      if (grid[y][x] === 0 && field[y][x] > 0) empties.push({ x, y, d: field[y][x] });
    empties.sort((a, b) => b.d - a.d);

    /* 出口放在最远的格子 */
    const exitCell = empties[0];
    this._buildExit(group, exitCell);

    /* 实体出生点 */
    if (cfg.entity && cfg.entity.nearStart) {
      // 追逐层：出生在玩家身后不远处
      const asc = empties.slice().reverse();
      const c = asc.find(c => c.d >= 4 && c.d <= 7) || asc[asc.length - 1];
      this.entitySpawn = this.cellToWorld(c.x, c.y);
    } else {
      const entCand = empties[Math.min(6, empties.length - 1)];
      this.entitySpawn = this.cellToWorld(entCand.x, entCand.y);
    }

    /* 物品放置 */
    this._placeItems(group, empties, field);

    /* 场景道具（家具/杂物，带碰撞） */
    if (cfg.props) this._placeProps(group, empties);

    /* ---- 灯光 ---- */
    scene.add(new THREE.AmbientLight(0xffffff, cfg.dark ? 0.16 : 0.34));
    const hemi = new THREE.HemisphereLight(cfg.ambient.sky, cfg.ambient.ground, cfg.ambient.intensity);
    group.add(hemi);
    this.hemi = hemi;

    // 吸顶灯罩（自发光面片）+ 少量点光源
    const lampMatOn = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
    const lampMatFlicker = new THREE.MeshBasicMaterial({ color: 0xffedb8 });
    this.flickerMats.push(lampMatFlicker);
    let li = 0;
    const lightSpots = [];
    for (let y = 1; y < this.H - 1; y += cfg.lampsEvery) for (let x = 1; x < this.W - 1; x += cfg.lampsEvery) {
      if (grid[y][x] !== 0) continue;
      const [wx, wz] = this.cellToWorld(x, y);
      const mat = (li % 5 === 3) ? lampMatFlicker : lampMatOn;
      const lampGeo = new THREE.PlaneGeometry(1.7, 0.85);
      const lamp = new THREE.Mesh(lampGeo, mat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(wx, cfg.wallH - 0.02, wz);
      group.add(lamp);
      lightSpots.push({ x: wx, z: wz });
      li++;
    }
    // 点光源均匀取样
    const nPL = cfg.dark ? cfg.pointLights : cfg.pointLights;
    for (let i = 0; i < Math.min(nPL, lightSpots.length); i++) {
      const s = lightSpots[Math.floor(i * lightSpots.length / nPL)];
      const pl = new THREE.PointLight(cfg.id === 0 ? 0xffe9b0 : 0xcfe8ff, cfg.dark ? 0 : 0.55, 18, 1.6);
      pl.position.set(s.x, cfg.wallH - 0.5, s.z);
      group.add(pl);
      this.pointLights.push(pl);
    }

    // 红色警报灯（脉冲）
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
      color: 0xbbaa88, size: 0.045, transparent: true, opacity: 0.45, sizeAttenuation: true, depthWrite: false,
    }));
    group.add(this.dust);

    scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
    scene.background = new THREE.Color(cfg.fogColor);
    this.sceneRef = scene;
    scene.add(group);
  }

  _buildExit(group, cell) {
    const cfg = this.cfg;
    const [wx, wz] = this.cellToWorld(cell.x, cell.y);
    const g = new THREE.Group();
    // 门框
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a3428 });
    const jgeo = new THREE.BoxGeometry(0.28, 2.5, 0.28);
    const l1 = new THREE.Mesh(jgeo, frameMat); l1.position.set(-0.95, 1.25, 0);
    const l2 = new THREE.Mesh(jgeo, frameMat); l2.position.set(0.95, 1.25, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.28), frameMat); top.position.set(0, 2.6, 0);
    // 内部"虚空"面板
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x020204, side: THREE.DoubleSide });
    const voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 2.45), voidMat);
    voidPlane.position.set(0, 1.25, 0);
    g.add(l1, l2, top, voidPlane);
    g.position.set(wx, 0, wz);
    group.add(g);
    this.exit = { x: wx, z: wz, group: g, voidMat, unlocked: false, used: false };
    // 终章白光之门：直接解锁并自发光
    if (this.cfg.id === 3) {
      voidMat.color.setHex(0xffffff);
      this.exit.unlocked = true;
      const glow = new THREE.PointLight(0xfff6e0, 1.1, 16, 1.4);
      glow.position.set(wx, 1.7, wz);
      group.add(glow);
    }
  }

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
    } else if (type === 'disk') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.24),
        new THREE.MeshLambertMaterial({ color: 0x27408b, emissive: 0x0a1230 }));
      m.position.y = 0.04; g.add(m);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xd8d2b8 }));
      lbl.rotation.x = -Math.PI / 2; lbl.position.y = 0.056; g.add(lbl);
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
      if (spots.every(s => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) >= minDistCells)) spots.push(c);
    }
    while (spots.length < count) spots.push(empties[this.rng.int(4, empties.length - 1)]);
    return spots;
  }

  _placeItems(group, empties, field) {
    const cfg = this.cfg;
    const types = [];
    if (cfg.id === 0) {
      types.push('keycard');
      types.push('note', 'note', 'note');
    } else if (cfg.id === 1) {
      types.push('fuse', 'notecode');
      types.push('note', 'note');
    } else if (cfg.id === 2) {
      types.push('disk', 'disk', 'disk');
      types.push('note', 'note', 'note');
    } else {
      types.push('note', 'note');
    }
    const spots = this._pickSpots(empties, types.length, 6);
    const noteIdx = { i: 0 };
    const NOTES = NOTE_TEXTS[cfg.id];

    types.forEach((t, idx) => {
      const c = spots[idx];
      const [wx, wz] = this.cellToWorld(c.x, c.y);
      let mesh, kind = t;
      if (t === 'notecode') { mesh = this._makeItemMesh('note'); kind = 'notecode'; }
      else mesh = this._makeItemMesh(t);
      mesh.position.set(wx + this.rng.range(-1, 1), 0, wz + this.rng.range(-1, 1));
      group.add(mesh);
      let title, body;
      if (t === 'notecode') {
        title = '皱巴巴的纸条';
        body = `电梯检修记录\n\n新面板密码被泼了咖啡……重设为：\n\n        【 ${GAME_STATE.levelCode} 】\n\n别让那东西听见你按键的声音。`;
      } else if (t === 'note') {
        const n = NOTES[noteIdx.i % NOTES.length]; noteIdx.i++;
        title = n.t; body = n.b;
      }
      this.items.push({
        type: kind, x: mesh.position.x, z: mesh.position.z,
        mesh, taken: false, title, body,
      });
    });

    /* 层级专属设备 */
    if (cfg.id === 1) {
      // 配电箱：中距离随机点
      const mid = empties[Math.floor(empties.length * 0.55)];
      const [bx, bz] = this.cellToWorld(mid.x, mid.y);
      const box = this._makePowerBox();
      box.position.set(bx, 0, bz);
      group.add(box);
      this.items.push({ type: 'powerbox', x: bx, z: bz, mesh: box, taken: false, title: '', body: '' });
    }
    if (cfg.id === 2) {
      // 终端：中远距离随机点
      const c = empties[Math.floor(empties.length * 0.35)];
      const [tx, tz] = this.cellToWorld(c.x, c.y);
      const term = this._makeTerminal();
      term.position.set(tx, 0, tz);
      group.add(term);
      this.items.push({ type: 'terminal', x: tx, z: tz, mesh: term, taken: false, title: '', body: '' });
    }

    /* 肾上腺素（追逐层）：沿路径按距离比例分布 */
    if (cfg.adrenaline) {
      let maxD = 1;
      for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) if (field[y][x] > maxD) maxD = field[y][x];
      const fracs = [0.25, 0.4, 0.55, 0.7, 0.85];
      const usedCells = new Set();
      for (const f of fracs.slice(0, cfg.adrenaline)) {
        const targetD = Math.round(maxD * f);
        let best = null, bestDiff = 1e9;
        for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
          const d = field[y][x];
          if (d <= 0 || usedCells.has(y * this.W + x)) continue;
          const diff = Math.abs(d - targetD);
          if (diff < bestDiff) { bestDiff = diff; best = { x, y }; }
        }
        if (!best) continue;
        usedCells.add(best.y * this.W + best.x);
        const [ax, az] = this.cellToWorld(best.x, best.y);
        const mesh = this._makeItemMesh('adrenaline');
        mesh.position.set(ax + this.rng.range(-0.8, 0.8), 0, az + this.rng.range(-0.8, 0.8));
        group.add(mesh);
        this.items.push({ type: 'adrenaline', x: mesh.position.x, z: mesh.position.z, mesh, taken: false, title: '', body: '' });
      }
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
    // 按材质分组收集几何
    const lists = { rust: [], wood: [], metal: [] };
    const mats = {};
    const mkMat = (key, texKey) => {
      const t = Tex.toTexture(Tex[texKey]());
      t.encoding = THREE.sRGBEncoding;
      mats[key] = new THREE.MeshLambertMaterial({ map: t });
    };
    mkMat('rust', 'rust'); mkMat('wood', 'wood'); mkMat('metal', 'metal');

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
        // 靠墙偏移：找一个相邻实心方向
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => this.isSolidCell(cell.x + dx, cell.y + dy));
        let px = cx + rng.range(-1.2, 1.2), pz = cz + rng.range(-1.2, 1.2);
        if (dirs.length) {
          const [dx, dy] = rng.pick(dirs);
          px = cx + dx * 1.35 + (dy !== 0 ? rng.range(-1.1, 1.1) : 0);
          pz = cz + dy * 1.35 + (dx !== 0 ? rng.range(-1.1, 1.1) : 0);
        }
        if (type === 'barrel') {
          addCyl(lists.rust, 0.42, 0.95, px, 0.475, pz);
          addCyl(lists.metal, 0.44, 0.06, px, 0.72, pz);
          this.obstacles.push({ x: px, z: pz, r: 0.55 });
        } else if (type === 'crate') {
          addBox(lists.wood, 0.85, 0.85, 0.85, px, 0.425, pz, rng.range(0, Math.PI));
          if (rng.next() < 0.4) addBox(lists.wood, 0.65, 0.65, 0.65, px + rng.range(-0.3, 0.3), 1.17, pz + rng.range(-0.3, 0.3), rng.range(0, Math.PI));
          this.obstacles.push({ x: px, z: pz, r: 0.62 });
        } else if (type === 'desk') {
          const ry = rng.pick([0, Math.PI / 2]);
          addBox(lists.wood, ry ? 0.7 : 1.5, 0.06, ry ? 1.5 : 0.7, px, 0.75, pz, 0);
          addBox(lists.metal, ry ? 0.62 : 0.05, 0.72, ry ? 0.05 : 0.62, px + (ry ? 0 : 0.7), 0.36, pz + (ry ? 0.7 : 0), 0);
          addBox(lists.metal, ry ? 0.62 : 0.05, 0.72, ry ? 0.05 : 0.62, px - (ry ? 0 : 0.7), 0.36, pz - (ry ? 0.7 : 0), 0);
          this.obstacles.push({ x: px, z: pz, r: 0.8 });
        } else if (type === 'cabinet') {
          addBox(lists.metal, 0.55, 1.35, 0.6, px, 0.675, pz, rng.range(-0.15, 0.15));
          this.obstacles.push({ x: px, z: pz, r: 0.5 });
        } else if (type === 'chair') {
          const ry = rng.range(0, Math.PI * 2);
          addBox(lists.wood, 0.46, 0.07, 0.46, px, 0.12, pz, ry);
          const bx = px - Math.cos(ry) * 0.2, bz = pz - Math.sin(ry) * 0.2;
          addBox(lists.wood, 0.46, 0.5, 0.06, bx, 0.3, bz, ry); // 翻倒的椅背
          this.obstacles.push({ x: px, z: pz, r: 0.45 });
        }
      }
    }

    for (const key of Object.keys(lists)) {
      if (!lists[key].length) continue;
      const mesh = new THREE.Mesh(mergeGeoms(lists[key]), mats[key]);
      group.add(mesh);
    }
  }

  /** 避开出生点/出口/物品/实体刷新点的道具选位 */
  _pickSpotsAwayFromImportant(empties, count, minDistCells) {
    const imp = [{ x: this.playerStart[0], z: this.playerStart[1] }, { x: this.exit.x, z: this.exit.z }, { x: this.entitySpawn[0], z: this.entitySpawn[1] }]
      .concat(this.items.map(it => ({ x: it.x, z: it.z })));
    const spots = [];
    let guard = 0;
    while (spots.length < count && guard++ < 800) {
      const c = empties[this.rng.int(3, empties.length - 1)];
      const [wx, wz] = this.cellToWorld(c.x, c.y);
      if (!imp.every(p => U.dist2(wx, wz, p.x, p.z) > 2.4 * 2.4)) continue;
      if (!spots.every(s => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) >= minDistCells)) continue;
      spots.push(c);
    }
    return spots;
  }

  _makeTerminal() {
    const g = new THREE.Group();
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x4a4438 }));
    desk.position.y = 0.78;
    const legG = new THREE.BoxGeometry(0.08, 0.78, 0.08);
    const legM = new THREE.MeshLambertMaterial({ color: 0x37332a });
    [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legG, legM);
      leg.position.set(lx, 0.39, lz); g.add(leg);
    });
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.6, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x2b2b26 }));
    mon.position.set(0, 1.25, -0.2); mon.rotation.x = -0.12;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.48),
      new THREE.MeshBasicMaterial({ color: 0x0a1a0a }));
    screen.position.set(0, 1.26, -0.155); screen.rotation.x = -0.12;
    this._termScreen = screen.material;
    g.add(desk, mon, screen);
    return g;
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
    }
  }
  unlockTerminal() {
    if (this._termScreen) this._termScreen.color.setHex(0x66ff88);
    if (this.exit) { this.exit.unlocked = true; this.exit.voidMat.color.setHex(0xfffbe0); }
  }
  unlockExit() { if (this.exit) { this.exit.unlocked = true; this.exit.voidMat.color.setHex(0x9fe86a); } }

  update(dt) {
    this.time += dt;
    // 警报红灯脉冲
    if (this.alarmLights) {
      const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(this.time * Math.PI / 0.8));
      for (const al of this.alarmLights) al.intensity = pulse * 1.3;
    }
    // 灯光闪烁
    const ph = this.time * 13 + this._lampPhase;
    for (const m of this.flickerMats) {
      const f = Math.sin(ph * 3.1) * Math.sin(ph * 7.7) * Math.sin(ph * 1.3);
      const on = f > -0.86;
      const base = this.cfg.dark && !this.powerOn ? 0 : 1;
      const v = on ? base : base * 0.15;
      m.color.setRGB(v, v * 0.93, v * 0.72);
    }
    // 尘埃缓慢漂浮
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

/** （保留兼容占位） */
function scene_fogEase(level, targetDensity) { level._fogTarget = targetDensity; }

/* ============ 纸条内容（世界观文本） ============ */
const NOTE_TEXTS = [
  [
    { t: '第 1 页 · 撕下的日记', b: '第3天。\n荧光灯永远不会熄灭。数过了，从这个房间到下一个房间，是四十七步。\n墙纸的味道像放了十年的茶。\n\n如果有人读到这张纸：不要跟着影子走，影子比你先知道出口在哪。' },
    { t: '第 2 页 · 潦草的字迹', b: '我找到了一张门禁卡！就在……唉，每次位置都不一样。\n这些房间会重新排列自己。你睡着的时候它们就搬家。\n\n门在离你最远的地方。永远都是。' },
    { t: '第 3 页 · 陌生人的忠告', b: '规则：\n一、不要尖叫。\n二、不要相信嗡嗡声突然停止时的寂静。\n三、看到门就跑过去，不要回头。\n\n——一个已经走出去的人' },
  ],
  [
    { t: '值班表背面', b: 'B2 区又停电了。老张说配电箱的保险丝被人拆走了。\n备用保险丝应该还在某一层的地上……谁知道呢，这鬼地方连楼层都是乱的。\n\n手电筒省着点用。光会引来不该引来的东西。' },
    { t: '血迹斑斑的安全手册', b: '遇到"潜行者"时：\n① 不要跑直线，多绕柱子；\n② 它视力很差，但听觉敏锐——奔跑等于晚餐铃；\n③ 断开视线 10 秒以上，它会忘记你。\n\n祝你好运。前任持有者敬上' },
    { t: '写给上面的人', b: '如果你坐上了电梯，替我看看真正的天空是什么颜色。\n我在这里太久了，快忘了。\n\n密码我写在另一张纸上了，咖啡洒了，抱歉。' },
  ],
  [
    { t: '员工守则 · 修订版', b: '欢迎来到本公司！\n1. 下班后请勿留在工位。\n2. 听到键盘声而办公室无人时，请勿寻找声源。\n3. 中央终端只接受三张软盘。不要问为什么是三张。' },
    { t: 'IT 部的便签', b: '主机房搬走了，但终端还活着。\n三张软盘散落在办公区，管理员喜欢把它们和文件混在一起。\n\n插齐软盘，终端会为你打开一扇门——\n不是通往大堂的门。是通往"外面"的门。' },
    { t: '最后的报告', b: '我们试过了。\n白光的另一边确实是天空。\n但只有第一个穿过去的人能保证那是真的。\n\n后面的人要自己承担风险。\n—— 第 7 批探索队' },
  ],
  [
    { t: '紧急广播残页', b: '……警报已激活。M.E.G. 提醒所有流浪者：\n不要进入响着警报的楼层。那里的实体处于猎杀状态，且永不疲倦。\n\n如果你已经在里面了——跑。别回头，别停下，别相信安静。' },
    { t: '针剂使用说明', b: '肾上腺素注射剂（实验批号 09）\n效果：瞬间恢复体能，短时间爆发速度。\n副作用：心悸、手抖、以及一种“背后有东西”的错觉。\n\n注：那不是错觉。' },
  ],
];
