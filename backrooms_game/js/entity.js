/* ============ 实体 AI：巡逻 / 追踪 / 寻路 ============ */
'use strict';

class Entity {
  constructor(level, cfg) {
    this.level = level;
    this.cfg = cfg;              // speedPatrol / sightRange / hearingRange / catchRange ...
    this.pos = new THREE.Vector2(...level.entitySpawn);
    this.dir = 0;                // 朝向角
    this.state = 'patrol';       // patrol | chase | search
    this.path = [];              // BFS 路径（格子坐标）
    this.pathIdx = 0;
    this.repathTimer = 0;
    this.targetCell = null;
    this.lastKnown = null;       // 最后目击玩家位置
    this.searchTimer = 0;
    this.bob = Math.random() * 10;
    this._buildMesh();
  }

  _buildMesh() {
    const look = this.cfg.look || 'stalker';
    const g = new THREE.Group();
    // 外形变种：体色/体型
    const bodyColor = look === 'wraith' ? 0x0d0d12 : (look === 'crawler' ? 0x14100a : 0x0a0a0c);
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const bodyH = look === 'crawler' ? 1.1 : 1.7;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, look === 'crawler' ? 0.36 : 0.3, bodyH, 8), bodyMat);
    body.position.y = bodyH * 0.62;
    // 头
    const headY = bodyH * 1.2 + 0.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10), bodyMat);
    head.position.y = headY;
    head.scale.y = 1.35;
    // 发光眼睛
    const eyeBase = look === 'wraith' ? 0xffddaa : 0xffffff;
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeBase });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), eyeMat);
    e1.position.set(-0.07, headY + 0.07, -0.15);
    const e2 = e1.clone(); e2.position.x = 0.07;
    // 手臂（细长下垂）
    const armLen = look === 'wraith' ? 1.45 : 1.15;
    const armGeo = new THREE.CylinderGeometry(0.05, 0.04, armLen, 6);
    const a1 = new THREE.Mesh(armGeo, bodyMat); a1.position.set(-0.34, bodyH * 0.75, 0); a1.rotation.z = 0.12;
    const a2 = new THREE.Mesh(armGeo, bodyMat); a2.position.set(0.34, bodyH * 0.75, 0); a2.rotation.z = -0.12;
    g.add(body, head, e1, e2, a1, a2);
    if (look === 'crawler') { g.scale.set(1.15, 0.72, 1.25); }
    if (look === 'wraith') { g.scale.set(0.92, 1.18, 0.92); }
    this.mesh = g;
    this.eyeMat = eyeMat;
    this._eyeBase = eyeBase;
  }

  addTo(scene) { scene.add(this.mesh); }
  removeFrom(scene) { scene.remove(this.mesh); }

  /** BFS 寻路：返回从实体格到目标格的路径 */
  findPath(sx, sy, tx, ty) {
    const grid = this.level.grid;
    const H = grid.length, W = grid[0].length;
    const passable = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H || grid[y][x] !== 0) return false;
      const f = this.level.floorMap[y * W + x];
      return f > HOLE_DEPTH / 2 && f <= 0.5;
    };
    if (!passable(tx, ty)) return [];
    const prev = new Map();
    const key = (x, y) => y * W + x;
    const q = [[sx, sy]];
    prev.set(key(sx, sy), -1);
    let head = 0;
    while (head < q.length) {
      const [x, y] = q[head++];
      if (x === tx && y === ty) {
        // 回溯
        const path = [];
        let k = key(x, y);
        while (k !== -1) {
          path.push([k % W, Math.floor(k / W)]);
          k = prev.get(k);
        }
        path.reverse();
        if (path.length > 1) path.shift(); // 剔除起点格，避免实体被引回本格中心来回震荡
        return path;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!passable(nx, ny)) continue;
        const nk = key(nx, ny);
        if (!prev.has(nk)) { prev.set(nk, key(x, y)); q.push([nx, ny]); }
      }
    }
    return [];
  }

  _cellOf(v) { return [Math.floor(v.x / CELL), Math.floor(v.y / CELL)]; }

  _pickPatrolTarget(playerPos) {
    // 偏向在玩家附近游荡，制造压迫感
    const [px, py] = this._cellOf(this.pos);
    const rng = new RNG((Math.random() * 1e9) >>> 0);
    for (let i = 0; i < 30; i++) {
      const nx = U.clamp(px + rng.int(-7, 7), 1, this.level.W - 2);
      const ny = U.clamp(py + rng.int(-7, 7), 1, this.level.H - 2);
      if (this.level.grid[ny][nx] !== 0) continue;
      const f = this.level.floorMap[ny * this.level.W + nx];
      if (f <= HOLE_DEPTH / 2 || f > 0.5) continue;
      return [nx, ny];
    }
    return [px, py];
  }

  update(dt, playerPos, playerRunning, flashlightOn, onCatch) {
    const L = this.level;
    const distP = Math.sqrt(U.dist2(this.pos.x, this.pos.y, playerPos.x, playerPos.z));

    /* ---- 感知 ---- */
    let sees = false, hears = false;
    if (this.cfg.alwaysChase) {
      // 无限追杀模式：永远知道玩家位置
      sees = distP < 80;
    } else {
      if (distP < this.cfg.sightRange && L.losClear(this.pos.x, this.pos.y, playerPos.x, playerPos.z)) {
        sees = true;
        // 黑暗中手电筒会暴露玩家（距离加成），关手电则感知减半
        if (!flashlightOn && L.cfg.dark && distP > this.cfg.sightRange * 0.45) sees = false;
      }
      if (playerRunning && distP < (flashlightOn ? this.cfg.hearingRange : this.cfg.hearingRange * 1.25)) hears = true;
    }

    if (sees || hears) {
      if (this.state !== 'chase') {
        this.state = 'chase';
        Sound.setChase(true);
      }
      this.lastKnown = { x: playerPos.x, z: playerPos.z };
      this.searchTimer = 6;
    } else if (this.state === 'chase') {
      this.searchTimer -= dt;
      if (this.searchTimer <= 0) {
        this.state = 'patrol';
        Sound.setChase(false);
        this.lastKnown = null;
        this.path = [];
      } else {
        this.state = 'search';
      }
    }

    /* ---- 决定目标点并寻路 ---- */
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || this.path.length === 0) {
      this.repathTimer = this.state === 'chase' ? 0.4 : 1.2;
      const [ex, ey] = this._cellOf(this.pos);
      let target = null;
      if ((this.state === 'chase' || this.state === 'search') && this.lastKnown) {
        target = this._cellOf(new THREE.Vector2(this.lastKnown.x, this.lastKnown.z));
      } else {
        if (!this.targetCell || this.pathIdx >= this.path.length) this.targetCell = this._pickPatrolTarget();
        target = this.targetCell;
      }
      this.path = this.findPath(ex, ey, target[0], target[1]);
      this.pathIdx = 0;
    }

    /* ---- 移动 ---- */
    let speed = this.state === 'chase' ? this.cfg.speedChase : (this.state === 'search' ? this.cfg.speedPatrol * 1.3 : this.cfg.speedPatrol);
    if (this.path.length && this.pathIdx < this.path.length) {
      const [cx, cy] = this.path[this.pathIdx];
      const [wx, wz] = L.cellToWorld(cx, cy);
      const dx = wx - this.pos.x, dz = wz - this.pos.y;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.3) { this.pathIdx++; }
      else {
        const step = speed * dt;
        const nx = this.pos.x + dx / d * step;
        const nz = this.pos.y + dz / d * step;
        // 简单墙体保护（寻路理论上不会撞墙）
        if (!L.circleHitsWall(nx, nz, 0.3)) { this.pos.x = nx; this.pos.y = nz; }
        else this.pathIdx++;
        this.dir = U.lerpAngle(this.dir, Math.atan2(dx, dz), dt * 6);
      }
      if (this.state === 'patrol' && this.pathIdx >= this.path.length) this.targetCell = null;
    } else if ((this.state === 'chase' || this.state === 'search') && this.lastKnown) {
      // 与目标同格：直线追击
      const dx = this.lastKnown.x - this.pos.x, dz = this.lastKnown.z - this.pos.y;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.05) {
        const step = Math.min(speed * dt, d);
        const nx = this.pos.x + dx / d * step;
        const nz = this.pos.y + dz / d * step;
        if (!L.circleHitsWall(nx, nz, 0.3)) { this.pos.x = nx; this.pos.y = nz; }
        this.dir = U.lerpAngle(this.dir, Math.atan2(dx, dz), dt * 6);
      }
    }

    /* ---- 动画 & 同步 ---- */
    this.bob += dt * (this.state === 'chase' ? 11 : 5);
    const gy = L.groundAt(this.pos.x, this.pos.y);
    const baseY = gy > HOLE_DEPTH / 2 ? gy : 0;
    this.mesh.position.set(this.pos.x, baseY + Math.abs(Math.sin(this.bob)) * 0.06, this.pos.y);
    this.mesh.rotation.y = this.dir;
    // 眼睛：追逐时变红；无限追杀模式永远猩红
    if (this.state === 'chase' || this.cfg.alwaysChase) this.eyeMat.color.setHex(0xff2222);
    else if (this.state === 'search') this.eyeMat.color.setHex(this._eyeBase === 0xffffff ? 0xffcc66 : 0xffaa44);
    else this.eyeMat.color.setHex(this._eyeBase);

    /* ---- 抓捕判定 ---- */
    if (distP < this.cfg.catchRange) onCatch();
  }

  /** 与玩家的距离（供音效/心跳用） */
  distanceTo(p) { return Math.sqrt(U.dist2(this.pos.x, this.pos.y, p.x, p.z)); }

  dispose(scene) { this.removeFrom(scene); }
}
