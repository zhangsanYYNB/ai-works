/* ============ 主控制器：状态机 / 无缝探索 / 层级穿越 ============ */
'use strict';

/* 全局共享状态 */
const GAME_STATE = { levelCode: '0000' };

class Game {
  constructor() {
    this.state = 'menu';   // menu | loading | playing | note | paused | dead | win | traveling
    this.levelIdx = 0;
    this.level = null;
    this.entity = null;
    this.player = null;
    this.visited = new Set();
    this.notesRead = 0;
    this.itemsGot = 0;
    this.levelsVisited = 0;
    this.startTime = 0;
    this.elapsed = 0;
    this._lastInteractTarget = null;
    this.travelCooldown = 0;
    this.hasKeycard = false;
    this.hasFuse = false;
    this.fuseUsed = false;
    this.bottles = 0;          // 玻璃瓶（投掷声东击西）
    this.hiddenIn = null;      // 藏身柜引用
    this.lastNoise = null;     // 最近噪音事件 {x,z,range,t}
    this._bottleFly = [];      // 飞行中的瓶子

    /* 渲染器 */
    const canvas = document.getElementById('game-canvas');
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.scene = null;
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 90);
    window.addEventListener('resize', () => this._resize());
    this._resize();
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // WebGL 上下文丢失/恢复（低端设备或软件渲染时可能出现）
    canvas.addEventListener('webglcontextlost', e => e.preventDefault());

    /* 自适应画质 */
    this._frameTimes = [];
    this._qualityChecked = false;

    UI.init();
    this.player = new Player(this.camera, canvas);
    window.GAME = this;
    this._initCheatCodes();

    if (IS_TOUCH) {
      this.player.bindTouch({
        joystickZone: document.getElementById('joystick-zone'),
        joystickBase: document.getElementById('joystick-base'),
        joystickThumb: document.getElementById('joystick-thumb'),
        lookZone: document.getElementById('look-zone'),
        btnInteract: document.getElementById('btn-interact'),
        btnFlashlight: document.getElementById('btn-flashlight'),
        btnSprint: document.getElementById('btn-sprint'),
        btnJump: document.getElementById('btn-jump'),
        btnThrow: document.getElementById('btn-throw'),
        btnCrouch: document.getElementById('btn-crouch'),
      });
    }

    this.clock = new THREE.Clock();
    requestAnimationFrame(() => this._loop());
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  /* ================= 进度（探索发现） ================= */
  static ensureDiscovered() {
    let d = Store.get('discovered', null);
    if (!d || d.length !== LEVEL_CFGS.length) {
      // 扩容时保留旧发现记录
      const nd = LEVEL_CFGS.map((c, i) => !!(d && d[i]) || i === 0);
      const un = Store.get('unlocked', 0);
      if (!d && un > 0) for (let i = 0; i <= Math.min(un, LEVEL_CFGS.length - 1); i++) nd[i] = true;
      d = nd;
      Store.set('discovered', d);
    }
    return d;
  }
  static discoveredCount() {
    return Game.ensureDiscovered().filter(Boolean).length;
  }

  /* ================= 关卡生命周期 ================= */
  startFromMenu() {
    const last = Store.get('lastLevel', 0);
    this.startLevel(U.clamp(last, 0, LEVEL_CFGS.length - 1));
  }

  startLevel(idx) {
    Sound.init(); Sound.resume();
    Sound.setEnabled(Store.get('sound', true));
    Sound.stopBreath();
    this.levelIdx = idx;
    const cfg = LEVEL_CFGS[idx];
    this.state = 'loading';
    UI.showOnly('loading');
    UI.setLoading(0.15);
    UI.resetMinimapState();
    UI.setHUDVisible(false);

    // 清理旧场景
    if (this.scene) {
      this.scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); }
      });
    }
    this.scene = new THREE.Scene();

    setTimeout(() => {
      try {
        // 每次进入随机种子（地图重新生成）
        const seed = (Date.now() & 0xffff) ^ (idx * 7919) ^ (Math.random() * 0xffff);
        GAME_STATE.levelCode = String(Math.floor(1000 + Math.random() * 9000));
        this.level = new Level(cfg, seed);
        this.level.build(this.scene);
        this.scene.add(this.camera);   // 手电筒是相机子对象，必须把相机加入场景
        UI.setLoading(0.7);

        // 玩家复位（面向迷宫中心）
        const startX = this.level.playerStart[0], startZ = this.level.playerStart[1];
        const midX = this.level.W * CELL / 2, midZ = this.level.H * CELL / 2;
        this.player.pos.set(startX, EYE_H, startZ);
        this.player.yaw = Math.atan2(-(midX - startX), -(midZ - startZ));
        this.player.pitch = 0;
        const g0 = this.level.groundAt(startX, startZ);
        this.player.feetY = g0 > HOLE_DEPTH / 2 ? g0 : 0;
        this.player.vy = 0;
        this.player.onGround = true;
        this.player.stamina = 100;
        if (this.player.flashlightOn && cfg.dark && cfg.id !== 5) { /* 黑暗层保留玩家自己开灯的选择 */ }

        // 实体（按难度调整参数，克隆避免污染配置）
        this.entity = null;
        if (cfg.entity) {
          const DIFFS = {
            easy:   { speed: 0.82, sight: 0.75, stamina: 0.7 },
            normal: { speed: 1,    sight: 1,    stamina: 1 },
            hard:   { speed: 1.15, sight: 1.3,  stamina: 1.2 },
          };
          const f = DIFFS[UI.getDifficulty()] || DIFFS.normal;
          const eCfg = Object.assign({}, cfg.entity);
          eCfg.speedChase = (eCfg.speedChase || 3) * f.speed;
          eCfg.speedPatrol = (eCfg.speedPatrol || 2) * f.speed;
          if (!eCfg.alwaysChase) {
            eCfg.sightRange = (eCfg.sightRange || 14) * f.sight;
            eCfg.hearingRange = (eCfg.hearingRange || 10) * f.sight;
          }
          this.player.staminaDrainMul = f.stamina;
          this.entity = new Entity(this.level, eCfg);
          this.entity.addTo(this.scene);
        } else {
          Sound.setChase(false);
          this.player.staminaDrainMul = 1;
        }

        // 进度状态
        this.visited = new Set();
        this.notesRead = 0;
        this.itemsGot = 0;
        this.startTime = performance.now();
        this.elapsed = 0;
        this._deathHandled = false;
        // 清除藏身/飞行瓶状态
        if (this.hiddenIn) { this.hiddenIn = null; UI.setHidden(false); }
        this._bottleFly.forEach(b => this.level.group.remove(b.mesh));
        this._bottleFly.length = 0;
        this.lastNoise = null;
        this.travelCooldown = 1.4;
        this.player.boostT = 0;
        this.player.noclip = this.cheats.noclip;

        // 记录探索进度
        const disc = Game.ensureDiscovered();
        if (!disc[cfg.id]) { disc[cfg.id] = true; Store.set('discovered', disc); }
        Store.set('lastLevel', cfg.id);

        UI.setLoading(1);
        setTimeout(() => {
          UI.showOnly(null);
          UI.setHUDVisible(true);
          UI.setLevelTag(cfg.name);
          UI.setObjective(cfg.hint || '');
          UI.applyCrosshair();
          this._updateInventory();
          const diffName = { easy: '🌿 轻松', normal: '⚔ 普通', hard: '💀 哥梦' }[UI.getDifficulty()] || '普通';
          UI.showToast(cfg.introText + '<br><span style="opacity:.75">难度：' + diffName + '</span>', 5200);
          UI.fadeIn();
          this.state = 'playing';
          Sound.startAmbient(cfg.id);
          this._qualityChecked = false;
          this._frameTimes = [];
        }, 350);
      } catch (err) {
        console.error(err);
        alert('层级加载失败：' + err.message);
        this.quitToMenu();
      }
    }, 60);
  }

  restartLevel() { Sound.setChase(false); this.startLevel(this.levelIdx); }

  quitToMenu() {
    Sound.setChase(false); Sound.stopAmbient(); Sound.stopBreath();
    UI.els.damage.style.opacity = 0;
    this.state = 'menu';
    UI.setHUDVisible(false);
    UI.showOnly('menu');
    UI.refreshCodex();
    UI.refreshMenuStats();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    UI.showOnly('pause');
    UI.setHUDVisible(false);   // 手机上必须隐藏触摸层，避免透明层干扰面板
    if (document.pointerLockElement) document.exitPointerLock();
    Sound.setChase(false);
  }
  resume() {
    if (this.state !== 'paused') return;
    UI.showOnly(null);
    UI.setHUDVisible(true);
    this.state = 'playing';
    if (!IS_TOUCH) this.canvas.requestPointerLock && this.canvas.requestPointerLock();
  }

  onNoteClosed() {
    if (this.state === 'note') { this.state = 'playing'; }
  }

  /* ================= 层级穿越 ================= */
  travelTo(levelId, viaLabel) {
    if (this.state !== 'playing') return;
    if (levelId < 0) { this._ending(); return; }
    Sound.setChase(false);
    Sound.doorOpen();
    this.state = 'traveling';
    UI.setHUDVisible(false);
    UI.showOnly('loading');
    UI.setLoading(0.5);
    const fromName = this.level.cfg.short;
    setTimeout(() => {
      this.startLevel(U.clamp(levelId, 0, LEVEL_CFGS.length - 1));
      const toCfg = LEVEL_CFGS[levelId];
      const first = Game.ensureDiscovered()[levelId];
      UI.showLevelBanner(toCfg, first);
      setTimeout(() => {
        UI.showToast(`⬇ ${viaLabel || '穿行'}：<b>${fromName}</b> → <b>${toCfg.short}</b>${first ? '　✨ 新层级！' : ''}`, 3000);
      }, 600);
    }, 420);
  }

  /** 每帧检测自动触发型装置（破洞坠落 / 现实裂缝） */
  _checkTransits(dt) {
    if (this.travelCooldown > 0) { this.travelCooldown -= dt; return; }
    const L = this.level, p = this.player;
    // 破洞坠落：掉到足够深时传送
    if (p.feetY < -3 && !p.onGround) {
      const [cx, cy] = L.worldToCell(p.pos.x, p.pos.z);
      const hole = L.holeCells.find(h => h.cx === cx && h.cy === cy);
      if (hole) { this.travelTo(hole.to, '🕳️ 坠入破洞'); return; }
      // 掉进没有装置的洞（理论不会发生）：拉回地面
      p.feetY = 0; p.vy = 0; p.onGround = true;
    }
    // 现实裂缝：直接走入
    for (const dev of L.exits) {
      if (dev.kind !== 'glitch' || dev.used) continue;
      if (U.dist2(p.pos.x, p.pos.z, dev.x, dev.z) < 0.8 * 0.8) {
        dev.used = true;
        this.travelTo(dev.to, '⚡ 穿过现实裂缝');
        return;
      }
    }
  }

  /** 使用需要交互的装置（门 / 电梯 / 管道 / 光之门） */
  _useDevice(dev) {
    if (dev.kind === 'lightdoor' && dev.ending) { dev.used = true; this._ending(); return; }
    if (dev.needsPower && !this.level.powerOn) {
      Sound.doorLocked();
      UI.showToast('🛗 电梯没电。这层某处有配电箱……先找到保险丝', 3200);
      return;
    }
    if (dev.lock === 'keycard' && !this.hasKeycard) {
      Sound.doorLocked();
      UI.showToast('🔒 门禁读卡器红光闪烁——需要一张 <b>门禁卡</b>', 2800);
      return;
    }
    if (dev.kind === 'door') Sound.doorOpen();
    else if (dev.kind === 'elevator') { Sound.fuseOn(); }
    dev.used = true;
    this.travelTo(dev.to, dev.label);
  }

  checkCode(input) { return input === GAME_STATE.levelCode; }

  /* ================= 交互 ================= */
  toggleFlashlight() {
    if (this.state !== 'playing') return;
    const on = this.player.toggleFlashlight();
    Store.set('fl_last', on);
    UI.showToast(on ? '🔦 手电筒已开启' : '手电筒已关闭', 1200);
  }

  /** 找到玩家附近的最近可交互物（含装置） */
  _findInteractable() {
    if (!this.level) return null;
    const p = this.player.pos;
    let best = null, bestD = 2.2 * 2.2;
    for (const it of this.level.items) {
      if (it.taken) continue;
      const d = U.dist2(p.x, p.z, it.x, it.z);
      if (d >= bestD) continue;
      // 多层：上层物品不能隔着楼板被拾取（垂差超过 1.6m 忽略）
      if (it.y != null && Math.abs((it.y + 0.5) - (p.y - EYE_H)) > 1.6) continue;
      best = it; bestD = d;
    }
    return best;
  }

  /** 当前层级目标提示 */
  currentGoal() {
    const L = this.level;
    if (!L || !L.exits) return '';
    if (L.cfg.id === 11) return '🚪 穿过光之门，逃离后室！';
    if (this.hasFuse && !L.powerOn) return '⚡ 把保险丝装上配电箱';
    const dev = L.exits.find(e => !e.used);
    if (!dev) return '🔍 寻找出口……';
    if (dev.needsPower && !L.powerOn) return '🔌 找到保险丝给装置供电';
    if (dev.lock === 'keycard' && !this.hasKeycard) return '🔑 找一张门禁卡';
    if (L.cfg.goal) return L.cfg.goal;
    return '🚪 前往出口装置';
  }

  /** 投掷玻璃瓶：声东击西 */
  throwBottle() {
    if (this.state !== 'playing' || this.hiddenIn) return;
    if (this.bottles <= 0) { UI.showToast('🎒 没有瓶子了——留意地上发亮的东西', 1800); return; }
    this.bottles--;
    UI.updateHUD && UI.updateHUD();
    const p = this.player;
    const dir = new THREE.Vector3();
    p.camera.getWorldDirection(dir);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.22, 6),
      new THREE.MeshBasicMaterial({ color: 0x9fd8b0 })
    );
    mesh.position.set(p.pos.x + dir.x * 0.4, p.pos.y - 0.1, p.pos.z + dir.z * 0.4);
    this.level.group.add(mesh);
    this._bottleFly.push({
      mesh,
      vx: dir.x * 7.5, vy: Math.max(2, dir.y * 7.5) + 2.5, vz: dir.z * 7.5,
      y: p.feetY + 1.4,
    });
    Sound.throwWhoosh && Sound.throwWhoosh();
  }

  _updateBottles(dt) {
    for (let i = this._bottleFly.length - 1; i >= 0; i--) {
      const b = this._bottleFly[i];
      b.vy += GRAVITY * dt * 0.85;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.z += b.vz * dt;
      b.y += b.vy * dt;
      b.mesh.rotation.x += dt * 12; b.mesh.rotation.z += dt * 9;
      const g = this.level.groundAt(b.mesh.position.x, b.mesh.position.z, b.y + 0.05);
      const floorY = g > HOLE_DEPTH / 2 ? g : 0;
      if (b.y <= floorY + 0.08) {
        // 落地：碎裂声 + 噪音吸引实体
        Sound.glassBreak && Sound.glassBreak();
        this.lastNoise = { x: b.mesh.position.x, z: b.mesh.position.z, range: 15, t: 0.4 };
        this.level.group.remove(b.mesh);
        this._bottleFly.splice(i, 1);
      }
    }
  }

  /** 进入/离开藏身柜 */
  _toggleHide(locker) {
    const P = this.player;
    if (this.hiddenIn) {
      // 出柜：沿玩家朝向退出一小段
      this.hiddenIn.inUse = false;
      const dir = new THREE.Vector3(); P.camera.getWorldDirection(dir);
      const ox = this.hiddenIn.x - dir.x * 0.9, oz = this.hiddenIn.z - dir.z * 0.9;
      if (!this.level.circleHitsWall(ox, oz, P.radius)) { P.pos.x = ox; P.pos.z = oz; }
      this.hiddenIn = null;
      this.travelCooldown = Math.max(this.travelCooldown, 0.5);
      UI.setHidden(false);
      Sound.doorOpen();
    } else if (locker && !locker.inUse) {
      locker.inUse = true;
      this.hiddenIn = locker;
      P.pos.set(locker.x, P.pos.y, locker.z);
      P.feetY = locker.y != null ? locker.y : P.feetY;
      P.keys['KeyW'] = P.keys['KeyS'] = P.keys['KeyA'] = P.keys['KeyD'] = false;
      UI.setHidden(true);
      UI.showToast('🚪 已藏入柜中。它看不见你……按 E 离开', 2600);
      Sound.doorLocked();
    }
  }

  tryInteract() {
    if (this.state !== 'playing') return;
    if (this.hiddenIn) { this._toggleHide(null); return; }   // 藏身中按 E 出来
    const target = this._findInteractable();
    if (!target) return;

    switch (target.type) {
      case 'device':
        this._useDevice(target.ref);
        break;
      case 'keycard':
        target.taken = true; target.mesh.visible = false;
        this.hasKeycard = true; this.itemsGot++;
        Sound.pickup();
        UI.showToast('🔑 拾取了 <b>门禁卡</b>', 2200);
        break;
      case 'fuse':
        target.taken = true; target.mesh.visible = false;
        this.hasFuse = true; this.itemsGot++;
        Sound.pickup();
        UI.showToast('🔌 拾取了 <b>保险丝</b>，去找配电箱', 2600);
        break;
      case 'almond':
        target.taken = true; target.mesh.visible = false;
        this.player.stamina = 100;
        this.player.boostT = Math.max(this.player.boostT, 4);
        this.itemsGot++;
        Sound.pickup();
        UI.showToast('🧴 <b>杏仁水！</b>体力全满，脚步轻快了几分', 2400);
        break;
      case 'adrenaline':
        target.taken = true; target.mesh.visible = false;
        this.player.stamina = 100;
        this.player.boostT = 8;
        this.itemsGot++;
        Sound.pickup();
        UI.showToast('💉 <b>肾上腺素！</b>8 秒爆发加速', 2400);
        break;
      case 'bottle':
        target.taken = true; target.mesh.visible = false;
        this.bottles++;
        this.itemsGot++;
        Sound.pickup();
        UI.showToast(`🍾 拾取玻璃瓶（×${this.bottles}）——按 <b>Q</b> 投掷，声音能引开它`, 2600);
        break;
      case 'locker':
        this._toggleHide(target);
        break;
      case 'note':
        target.taken = true; target.mesh.visible = false;
        this.notesRead++; this.itemsGot++;
        Store.set('notesTotal', Store.get('notesTotal', 0) + 1);
        this.state = 'note';
        UI.showNote(target.title, target.body);
        break;
      case 'powerbox':
        if (!this.fuseUsed) {
          if (this.hasFuse) {
            this.fuseUsed = true;
            this.level.setPower(true);
            Sound.fuseOn();
            UI.showToast('💡 电力恢复了！灯光亮起——电梯可以用了', 3200);
          } else {
            Sound.doorLocked();
            UI.showToast('⚠️ 配电箱缺少保险丝，先在黑暗中找到它', 2600);
          }
        } else {
          UI.showToast('配电箱运行正常。', 1500);
        }
        break;
    }
    this._updateInventory();
  }

  /* ================= 秘籍后门 ================= */
  cheats = { god: false, noclip: false };
  _cheatBuf = '';
  _initCheatCodes() {
    document.addEventListener('keydown', e => {
      if (!/^[a-z]$/i.test(e.key)) return;
      this._cheatBuf = (this._cheatBuf + e.key.toUpperCase()).slice(-10);
      for (const [code, act] of Object.entries({ IDDQD: 'god', IDCLIP: 'noclip', IDKFA: 'kfa', IDLEVEL: 'skip' })) {
        if (this._cheatBuf.endsWith(code)) {
          this._cheatBuf = '';
          if (this.state === 'playing' || this.state === 'paused') this.doCheat(act);
          break;
        }
      }
    });
  }
  doCheat(action) {
    const C = this.cheats;
    if (action === 'god') {
      C.god = !C.god;
      UI.showToast(C.god ? '👻 <b>无敌模式</b> 已开启——它们抓不住你了' : '无敌模式已关闭', 2400);
    } else if (action === 'noclip') {
      C.noclip = !C.noclip;
      this.player.noclip = C.noclip;
      UI.showToast(C.noclip ? '🚧 <b>穿墙模式</b> 已开启——墙壁只是建议' : '穿墙模式已关闭', 2400);
    } else if (action === 'kfa') {
      this.hasKeycard = true;
      this.hasFuse = true;
      this.player.stamina = 100; this.player.boostT = 10;
      UI.showToast('🎒 补给包：门禁卡 ×1　保险丝 ×1<br>💉 肾上腺素直接注射！', 4000);
      this._updateInventory();
    } else if (action === 'skip') {
      if (!this.level) return;
      const exs = this.level.cfg.exits.filter(e => e.to >= 0);
      if (!exs.length) return;
      const pick = exs[Math.floor(Math.random() * exs.length)];
      UI.showToast('⏭️ 现实在眼前折叠了……', 1600);
      setTimeout(() => {
        if (pick.kind === 'hole') this.travelTo(pick.to, '🕳️ 坠入破洞');
        else if (pick.kind === 'glitch') this.travelTo(pick.to, '⚡ 穿过现实裂缝');
        else this.travelTo(pick.to, pick.kind === 'elevator' ? '🛗 电梯下行' : (pick.kind === 'pipe' ? '🕳️ 爬过管道' : '🚪 推门'));
      }, 700);
    } else if (action === 'unlockall') {
      const d = LEVEL_CFGS.map(() => true);
      Store.set('discovered', d);
      UI.refreshCodex();
      UI.showToast('🔓 全部层级已在图鉴中点亮', 2200);
    } else if (action === 'reset') {
      C.god = false; C.noclip = false; this.player.noclip = false;
      UI.showToast('🧹 作弊已全部关闭，祝你好运', 2200);
    }
    this._updateCheatBadge();
  }
  _updateCheatBadge() {
    const b = document.getElementById('cheat-badge');
    if (b) b.classList.toggle('hidden', !(this.cheats.god || this.cheats.noclip));
  }

  _updateInventory() {
    const items = [];
    if (this.hasKeycard) items.push({ icon: '🔑', label: '门禁卡', count: 1 });
    if (this.hasFuse && !this.fuseUsed) items.push({ icon: '🔌', label: '保险丝', count: 1 });
    if (this.fuseUsed) items.push({ icon: '🔌', label: '保险丝', count: 1, used: true });
    if (this.notesRead > 0) items.push({ icon: '📄', label: '纸条', count: this.notesRead });
    UI.setInventory(items);
  }

  /* ================= 死亡 / 结局 ================= */
  onDeath() {
    if (this._deathHandled || this.state !== 'playing') return;
    this._deathHandled = true;
    this.state = 'dead';
    Sound.jumpscare();
    Sound.setChase(false);
    Sound.death();
    Sound.stopAmbient();
    setTimeout(() => Sound.stopBreath(), 900); // 呼吸声渐停
    UI.damageFlash();
    UI.prompt(null);
    setTimeout(() => {
      UI.els.deathText.textContent = this.level.cfg.entity
        ? this.level.cfg.entity.deathText
        : '你消失在了无尽的走廊里。';
      UI.showOnly('death');
      UI.setHUDVisible(false);
      if (document.pointerLockElement) document.exitPointerLock();
    }, 550);
  }

  _ending() {
    this.state = 'win';
    Sound.win();
    Sound.setChase(false);
    Sound.stopAmbient();
    Sound.stopBreath();
    if (document.pointerLockElement) document.exitPointerLock();
    Store.set('escapes', Store.get('escapes', 0) + 1);
    UI.els.damage.style.opacity = 0;
    const discN = Game.discoveredCount();
    const notesTotal = Store.get('notesTotal', 0);
    setTimeout(() => {
      UI.setHUDVisible(false);
      UI.els.winTitle.textContent = '🌅 你逃出来了';
      UI.els.winText.innerHTML = '穿过白光的瞬间，你闻到了雨后泥土的味道。<br>天空是真的天空。而你永远不会忘记那嗡嗡作响的黄色房间。';
      UI.els.winStats.innerHTML =
        `🗺 已发现的层级 <b>${discN} / ${LEVEL_CFGS.length}</b>　·　📄 累计纸条 ${notesTotal} 张<br>` +
        `<span style="opacity:.75">每一次坠落都不是终点，只是另一段走廊的开始。</span>`;
      document.getElementById('btn-next-level').classList.add('hidden');
      UI.showOnly('win');
    }, 700);
  }

  /* ================= 主循环 ================= */
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if ((this.state === 'playing' || this.state === 'note') && this.level) {
      const pausedLike = this.state !== 'playing';
      this.elapsed += dt;

      this.player.update(dt, this.level, pausedLike || !!this.hiddenIn);
      this.level.update(dt);

      if (!pausedLike) this._checkTransits(dt);

      if (this.entity && !pausedLike) {
        this.entity.update(dt, this.player.pos, this.player.running, this.player.flashlightOn, () => {
          if (!this.cheats.god) this.onDeath();
          else if (Math.random() < dt * 2) UI.showToast('👻 它穿过了你……但抓不住你', 1200);
        }, this.player.crouching);
      }

      // 投掷瓶飞行物理
      this._updateBottles(dt);

      // 探索标记（小地图）
      const [pcx, pcy] = this.level.worldToCell(this.player.pos.x, this.player.pos.z);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const cx = pcx + dx, cy = pcy + dy;
        if (cx >= 0 && cy >= 0 && cx < this.level.W && cy < this.level.H) this.visited.add(cy * this.level.W + cx);
      }

      // 交互提示
      if (!pausedLike) {
        const t = this._findInteractable();
        const key = t ? (t.type === 'device' ? 'dev' + t.ref.kind : t.type) : null;
        if (key !== this._lastInteractTarget) {
          this._lastInteractTarget = key;
          if (!t) UI.prompt(null);
          else {
            let label = '互动';
            if (t.type === 'device') {
              const dev = t.ref;
              if (dev.kind === 'door') {
                label = (dev.lock === 'keycard' && !this.hasKeycard) ? '🔒 检查门禁门' : '🚪 推门而入 → ' + this._destName(dev.to);
              } else if (dev.kind === 'elevator') {
                label = (dev.needsPower && !this.level.powerOn) ? '🛗 电梯（没电）' : '🛗 乘电梯 → ' + this._destName(dev.to);
              } else if (dev.kind === 'pipe') {
                label = '🕳️ 爬进管道 → ' + this._destName(dev.to);
              } else if (dev.kind === 'lightdoor') {
                label = dev.ending ? '✨ 走进白光（离开后室）' : '✨ 穿过光之门';
              }
            } else {
              label = {
                keycard: '🔑 拾取门禁卡',
                fuse: '🔌 拾取保险丝',
                almond: '🧴 喝下杏仁水',
                adrenaline: '💉 注射肾上腺素',
                note: '📄 阅读纸条',
                bottle: '🍾 捡起玻璃瓶',
                locker: '🚪 藏进柜子',
                powerbox: this.hasFuse && !this.fuseUsed ? '💡 安装保险丝' : '⚡ 检查配电箱',
              }[t.type] || '互动';
            }
            UI.prompt((IS_TOUCH ? '✋ ' : '[E] ') + label);
          }
        }
      }

      // 音效氛围
      if (this.entity) {
        const d = this.entity.distanceTo(this.player.pos);
        const range = this.entity.cfg.sightRange > 100 ? 30 : this.entity.cfg.sightRange * 1.5;
        const near = U.clamp(1 - d / range, 0, 1);
        Sound.heartbeat(dt, this.entity.state === 'chase' ? Math.max(near, 0.55) : near * 0.6);
        // 呼吸声（距离衰减）
        Sound.startBreath();
        Sound.setBreathVolume(Math.pow(near, 2.2) * (this.entity.state === 'chase' ? 0.5 : 0.3));
        // 发现玩家瞬间：嘶吼 + 危险渐晕
        if (this.entity.state === 'chase' && this._lastEntityState !== 'chase') Sound.growl();
        this._lastEntityState = this.entity.state;
        const danger = U.clamp(near * (this.entity.state === 'chase' ? 1 : 0.55), 0, 1);
        UI.els.damage.style.opacity = (danger * danger * 0.5).toFixed(2);
      } else {
        UI.els.damage.style.opacity = 0;
      }

      // 黑影彩蛋：远处走廊闪现一瞬
      const sf = this.level.shadowFigure;
      if (sf) {
        this.level.shadowTimer -= dt;
        if (this.level.shadowActiveT > 0) {
          this.level.shadowActiveT -= dt;
          if (this.level.shadowActiveT <= 0) sf.visible = false;
        } else if (this.level.shadowTimer <= 0) {
          // 先在视线锥形范围内（±40°）找，找不到则放宽到全向
          const sfL = this.level;
          for (let attempt = 0; attempt < 60; attempt++) {
            const ang = attempt < 30
              ? this.player.yaw + (Math.random() - 0.5) * 1.4
              : Math.random() * Math.PI * 2;
            const fx = -Math.sin(ang), fz = -Math.cos(ang);
            const dist = 9 + Math.random() * 5;
            const gx = this.player.pos.x + fx * dist, gz = this.player.pos.z + fz * dist;
            const cx = Math.floor(gx / CELL), cy = Math.floor(gz / CELL);
            if (!sfL.isSolidCell(cx, cy) && sfL.groundAt(gx, gz, 0.5) > HOLE_DEPTH / 2 &&
                sfL.losClear(this.player.pos.x, this.player.pos.z, (cx + 0.5) * CELL, (cy + 0.5) * CELL)) {
              const gy = sfL.groundAt((cx + 0.5) * CELL, (cy + 0.5) * CELL, 0.5);
              sf.position.set((cx + 0.5) * CELL, gy > HOLE_DEPTH / 2 ? gy : 0, (cy + 0.5) * CELL);
              sf.lookAt(this.player.pos.x, sf.position.y, this.player.pos.z);
              sf.visible = true;
              this.level.shadowActiveT = 1.4 + Math.random() * 0.8;
              Sound._tone(52, 1.2, 0.06, 'sine', 40); // 极低频嗡鸣
              break;
            }
          }
          this.level.shadowTimer = 45 + Math.random() * 50;   // 下次触发间隔
        }
      }

      UI.setStamina(this.player.stamina, this.player.running);
      // 目标 HUD + 瓶子计数（每 ~0.5s 刷新一次）
      this._hudT = (this._hudT || 0) - dt;
      if (this._hudT <= 0) {
        this._hudT = 0.5;
        const goal = this.currentGoal();
        UI.setObjective(`${goal}<br><span style="opacity:.75">🍾 ×${this.bottles}${this.hiddenIn ? ' · 🚪 藏身中' : ''}</span>`);
      }
      UI.drawMinimap(this.level, this.player, this.visited, this.entity);
    }

    // 自适应画质：前几秒帧率低就降分辨率
    if (this.state === 'playing' && !this._qualityChecked) {
      this._frameTimes.push(dt);
      if (this._frameTimes.length >= 90) {
        const avg = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
        if (avg > 0.04) {
          this.renderer.setPixelRatio(1);
        } else if (avg > 0.028) {
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        }
        this._qualityChecked = true;
      }
    }

    if (this.scene) this.renderer.render(this.scene, this.camera);
  }

  _destName(id) {
    return id < 0 ? '？？？' : (LEVEL_CFGS[id].name.split('·')[1] || LEVEL_CFGS[id].short).trim();
  }
}

/* 启动 */
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
