/* ============ 主控制器：状态机 / 关卡流程 / 交互 ============ */
'use strict';

/* 全局共享状态（level.js 的纸条文本会引用 levelCode） */
const GAME_STATE = { levelCode: '0000' };

class Game {
  constructor() {
    this.state = 'menu';   // menu | loading | playing | note | keypad | paused | dead | win
    this.levelIdx = 0;
    this.level = null;
    this.entity = null;
    this.player = null;
    this.visited = new Set();
    this.notesRead = 0;
    this.itemsGot = 0;
    this.startTime = 0;
    this.elapsed = 0;
    this._lastInteractTarget = null;

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

    if (IS_TOUCH) {
      this.player.bindTouch({
        joystickZone: document.getElementById('joystick-zone'),
        joystickBase: document.getElementById('joystick-base'),
        joystickThumb: document.getElementById('joystick-thumb'),
        lookZone: document.getElementById('look-zone'),
        btnInteract: document.getElementById('btn-interact'),
        btnFlashlight: document.getElementById('btn-flashlight'),
        btnSprint: document.getElementById('btn-sprint'),
      });
    }

    this.clock = new THREE.Clock();
    requestAnimationFrame(() => this._loop());

    // 菜单背景小场景（简单旋转的黄色走廊氛围）——直接黑屏+CSS即可，省资源
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  /* ================= 关卡生命周期 ================= */
  startFromMenu() {
    const unlocked = Store.get('unlocked', 0);
    this.startLevel(Math.min(unlocked, LEVEL_CFGS.length - 1));
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
        const seed = (Date.now() & 0xffff) ^ (idx * 7919);
        GAME_STATE.levelCode = String(Math.floor(1000 + Math.random() * 9000));
        this.level = new Level(cfg, seed);
        this.level.build(this.scene);
        this.scene.add(this.camera);   // 手电筒是相机子对象，必须把相机加入场景
        UI.setLoading(0.7);

        // 玩家复位（面向迷宫中心，避免出生即面对墙角）
        this.player.pos.set(this.level.playerStart[0], EYE_H, this.level.playerStart[1]);
        const midX = this.level.W * CELL / 2, midZ = this.level.H * CELL / 2;
        this.player.yaw = Math.atan2(-(midX - this.player.pos.x), -(midZ - this.player.pos.z));
        this.player.pitch = 0;
        this.player.stamina = 100;
      if (this.player.flashlightOn && cfg.dark) this.player.toggleFlashlight(); // 黑暗层默认关灯，玩家可自行开启

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
        this.objectiveStep = 0;
        this.hasKeycard = false;
        this.hasFuse = false;
        this.fuseUsed = false;
        this.disks = 0;
        this.terminalUsed = false;
        this.startTime = performance.now();
        this.elapsed = 0;
        this._deathHandled = false;
        this.player.boostT = 0;

        UI.setLoading(1);
        setTimeout(() => {
          UI.showOnly(null);
          UI.setHUDVisible(true);
          UI.setLevelTag(cfg.name);
          UI.applyCrosshair();
          this._refreshObjective();
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
        alert('关卡加载失败：' + err.message);
        this.quitToMenu();
      }    }, 60);
  }

  restartLevel() { Sound.setChase(false); this.startLevel(this.levelIdx); }  nextLevel() {
    if (this.levelIdx + 1 < LEVEL_CFGS.length) this.startLevel(this.levelIdx + 1);
    else this.quitToMenu();
  }
  quitToMenu() {
    Sound.setChase(false); Sound.stopAmbient(); Sound.stopBreath();
    UI.els.damage.style.opacity = 0;
    this.state = 'menu';
    UI.setHUDVisible(false);
    UI.showOnly('menu');
    UI.refreshLevelSelect();
    UI.refreshMenuStats();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    UI.showOnly('pause');
    if (document.pointerLockElement) document.exitPointerLock();
    Sound.setChase(false);
  }
  resume() {
    if (this.state !== 'paused') return;
    UI.showOnly(null);
    this.state = 'playing';
    if (!IS_TOUCH) this.canvas.requestPointerLock && this.canvas.requestPointerLock();
  }

  onNoteClosed() {
    if (this.state === 'note') { this.state = 'playing'; }
  }

  /* ================= 交互 ================= */
  toggleFlashlight() {
    if (this.state !== 'playing') return;
    const on = this.player.toggleFlashlight();
    Store.set('fl_last', on);
    UI.showToast(on ? '🔦 手电筒已开启' : '手电筒已关闭', 1200);
  }

  /** 找到玩家面前的最近可交互物 */
  _findInteractable() {
    const p = this.player.pos;
    let best = null, bestD = 2.3 * 2.3;
    for (const it of this.level.items) {
      if (it.taken) continue;
      const d = U.dist2(p.x, p.z, it.x, it.z);
      if (d < bestD) { best = it; bestD = d; }
    }
    // 出口
    if (this.level.exit && !this.level.exit.used) {
      const d = U.dist2(p.x, p.z, this.level.exit.x, this.level.exit.z);
      if (d < 3.4 * 3.4) {
        return { type: 'exit', x: this.level.exit.x, z: this.level.exit.z };
      }
    }
    return best;
  }

  tryInteract() {
    if (this.state !== 'playing') return;
    const target = this._findInteractable();
    if (!target) return;
    if (target.type === 'exit') { this._tryExit(); return; }

    switch (target.type) {
      case 'keycard':
        target.taken = true; target.mesh.visible = false;
        this.hasKeycard = true; this.itemsGot++;
        Sound.pickup();
        UI.showToast('🔑 拾取了 <b>门禁卡</b>', 2200);
        this.level.unlockExit();
        this._advanceObjective();
        break;
      case 'fuse':
        target.taken = true; target.mesh.visible = false;
        this.hasFuse = true; this.itemsGot++;
        Sound.pickup();
        UI.showToast('🔌 拾取了 <b>保险丝</b>，去找配电箱', 2600);
        this._advanceObjective();
        break;
      case 'disk':
        target.taken = true; target.mesh.visible = false;
        this.disks++; this.itemsGot++;
        Sound.pickup();
        UI.showToast(`💾 拾取了软盘（${this.disks}/3）`, 2000);
        if (this.disks >= 3) this._advanceObjective();
        else this._refreshObjective();
        break;
      case 'adrenaline':
        target.taken = true; target.mesh.visible = false;
        this.player.stamina = 100;
        this.player.boostT = 8;
        this.itemsGot++;
        Sound.pickup();
        UI.showToast('💉 <b>肾上腺素！</b>体力全满，8 秒爆发加速', 2400);
        break;
      case 'note':
        target.taken = true; target.mesh.visible = false;
        this.notesRead++; this.itemsGot++;
        this.state = 'note';
        UI.showNote(target.title, target.body);
        this._updateInventory();
        break;
      case 'notecode':
        target.taken = true; target.mesh.visible = false;
        this.notesRead++; this.itemsGot++;
        this.state = 'note';
        UI.showNote(target.title, target.body);
        this._updateInventory();
        break;
      case 'powerbox':
        if (!this.fuseUsed) {
          if (this.hasFuse) {
            this.fuseUsed = true;
            this.level.setPower(true);
            Sound.fuseOn();
            UI.showToast('💡 电力恢复了！灯光亮起——但它们也看得见你了', 3200);
            this._advanceObjective();
            this._updateInventory();
          } else {
            Sound.doorLocked();
            UI.showToast('⚠️ 配电箱缺少保险丝，先在黑暗中找到它', 2600);
          }
        } else {
          UI.showToast('配电箱运行正常。', 1500);
        }
        break;
      case 'terminal':
        if (!this.terminalUsed) {
          if (this.disks >= 3) {
            this.terminalUsed = true;
            this.level.unlockTerminal();
            Sound.keypadOk();
            UI.showToast('🖥️ 终端激活！白光之门已在某处打开……跟着感觉走', 3400);
            this._advanceObjective();
            this._updateInventory();
          } else {
            Sound.doorLocked();
            UI.showToast(`🖥️ 终端需要 3 张软盘（当前 ${this.disks}/3）`, 2400);
          }
        } else {
          UI.showToast('终端：出口已开放。快走。', 1800);
        }
        break;
    }
    if (target.type !== 'note' && target.type !== 'notecode') this._updateInventory();
  }

  _tryExit() {
    const exit = this.level.exit;
    const cfg = this.level.cfg;
    if (cfg.id === 0 && !this.hasKeycard) {
      Sound.doorLocked();
      UI.showToast('🔒 门禁卡读卡器红光闪烁——你需要一张门禁卡', 2600);
      return;
    }
    if (cfg.id === 1 && !exit.unlocked) {
      // 打开密码锁
      this.state = 'keypad';
      Sound.doorOpen();
      UI.openKeypad(ok => {
        this.state = 'playing';
        if (ok) {
          this.level.unlockExit();
          UI.showToast('✅ 密码正确！电梯门缓缓打开', 2600);
          this._advanceObjective();
        } else {
          UI.showToast('❌ 密码错误', 1600);
        }
      });
      return;
    }
    if (!exit.unlocked && cfg.id !== 0) {
      Sound.doorLocked();
      UI.showToast('这扇门还没有解锁。', 1800);
      return;
    }
    // 过关
    exit.used = true;
    this._winLevel();
  }

  checkCode(input) { return input === GAME_STATE.levelCode; }

  /* ================= 目标流程 ================= */
  _refreshObjective() {
    const flow = this.level.cfg.objectiveFlow;
    UI.setObjective(flow[Math.min(this.objectiveStep, flow.length - 1)]);
  }
  _advanceObjective() {
    this.objectiveStep++;
    this._refreshObjective();
  }

  _updateInventory() {
    const items = [];
    if (this.level.cfg.id === 0) {
      items.push({ icon: '🔑', label: '门禁卡', count: 1, used: !this.hasKeycard ? false : false });
      if (this.hasKeycard) items[0].used = false; else items.length = 0;
    } else if (this.level.cfg.id === 1) {
      if (this.hasFuse && !this.fuseUsed) items.push({ icon: '🔌', label: '保险丝', count: 1 });
      if (this.fuseUsed) items.push({ icon: '🔌', label: '保险丝', count: 1, used: true });
    } else {
      if (this.disks > 0) items.push({ icon: '💾', label: '软盘', count: this.disks, used: this.terminalUsed });
    }
    if (this.notesRead > 0) items.push({ icon: '📄', label: '纸条', count: this.notesRead });
    UI.setInventory(items);
  }

  /* ================= 死亡 / 胜利 ================= */
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

  _winLevel() {
    this.state = 'win';
    Sound.win();
    Sound.setChase(false);
    Sound.stopAmbient();
    const cfg = this.level.cfg;
    const isLast = cfg.id === LEVEL_CFGS.length - 1;
    // 解锁进度
    const unlocked = Store.get('unlocked', 0);
    Store.set('unlocked', Math.max(unlocked, Math.min(cfg.id + 1, LEVEL_CFGS.length - 1)));
    if (isLast) Store.set('unlocked', LEVEL_CFGS.length - 1);
    if (document.pointerLockElement) document.exitPointerLock();
    // 最佳纪录与逃脱次数
    const bests = Store.get('bestTimes', {});
    const prevBest = bests[cfg.id];
    const isRecord = !prevBest || this.elapsed < prevBest;
    if (isRecord) { bests[cfg.id] = this.elapsed; Store.set('bestTimes', bests); }
    Sound.stopBreath();
    UI.els.damage.style.opacity = 0;
    setTimeout(() => {
      UI.setHUDVisible(false);
      if (isLast) {
        Store.set('escapes', Store.get('escapes', 0) + 1);
        UI.els.winTitle.textContent = '🌅 你逃出来了';
        UI.els.winText.innerHTML = '穿过白光的瞬间，你闻到了雨后泥土的味道。<br>天空是真的天空。而你永远不会忘记那嗡嗡作响的黄色房间。';
        document.getElementById('btn-next-level').classList.add('hidden');
      } else {
        UI.els.winTitle.textContent = `✅ ${cfg.name} · 已突破`;
        const nextCfg = LEVEL_CFGS[cfg.id + 1];
        UI.els.winText.innerHTML = `电梯门在身后合拢。<br>下一层：<b>${nextCfg.name}</b>`;
        document.getElementById('btn-next-level').classList.remove('hidden');
      }
      UI.els.winStats.innerHTML =
        `⏱ 用时 ${fmtTime(this.elapsed)}${isRecord ? '　🏆 新纪录！' : ''}　·　📄 纸条 ${this.notesRead} 张　·　📦 物品 ${this.itemsGot} 件` +
        (prevBest && !isRecord ? `<br><span style="opacity:.65">本层最佳 ${fmtTime(prevBest)}</span>` : '');
      UI.showOnly('win');
    }, 700);
  }

  /* ================= 主循环 ================= */
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state === 'playing' || this.state === 'note' || this.state === 'keypad') {
      const pausedLike = this.state !== 'playing';
      this.elapsed += dt;

      this.player.update(dt, this.level, pausedLike);
      this.level.update(dt);

      if (this.entity && !pausedLike) {
        this.entity.update(dt, this.player.pos, this.player.running, this.player.flashlightOn, () => this.onDeath());
      }

      // 探索标记（小地图）
      const [pcx, pcy] = this.level.worldToCell(this.player.pos.x, this.player.pos.z);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const cx = pcx + dx, cy = pcy + dy;
        if (cx >= 0 && cy >= 0 && cx < this.level.W && cy < this.level.H) this.visited.add(cy * this.level.W + cx);
      }
      // 出口被发现则显示在小地图
      if (!UI._exitSeen && this.level.exit) {
        if (U.dist2(this.player.pos.x, this.player.pos.z, this.level.exit.x, this.level.exit.z) < 30 * 30)
          UI.markExitSeen();
      }

      // 交互提示
      if (!pausedLike) {
        const t = this._findInteractable();
        const key = t ? t.type : null;
        if (key !== this._lastInteractTarget) {
          this._lastInteractTarget = key;
          if (!t) UI.prompt(null);
          else {
            const label = {
              exit: this.level.cfg.id === 0 ? (this.hasKeycard ? '🚪 刷卡离开' : '🚪 检查出口')
                : this.level.cfg.id === 1 ? (this.level.exit.unlocked ? '🚪 进入电梯' : '🔒 输入密码')
                : (this.level.exit.unlocked ? '🚪 穿过白光之门' : '🚪 检查出口'),
              keycard: '🔑 拾取门禁卡',
              fuse: '🔌 拾取保险丝',
              disk: '💾 拾取软盘',
              adrenaline: '💉 注射肾上腺素',
              note: '📄 阅读纸条',
              notecode: '📄 阅读纸条',
              powerbox: this.hasFuse && !this.fuseUsed ? '💡 安装保险丝' : '⚡ 检查配电箱',
              terminal: this.disks >= 3 && !this.terminalUsed ? '🖥️ 插入软盘' : '🖥️ 使用终端',
            }[t.type] || '互动';
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

      // LEVEL 0 黑影彩蛋：远处走廊闪现一瞬
      const sf = this.level.shadowFigure;
      if (sf) {
        this.level.shadowTimer -= dt;
        if (this.level.shadowActiveT > 0) {
          this.level.shadowActiveT -= dt;
          if (this.level.shadowActiveT <= 0) sf.visible = false;
        } else if (this.level.shadowTimer <= 0) {
          // 先在视线锥形范围内（±40°）找，找不到则放宽到全向（转身才能瞥见的黑影更渗人）
          const sfL = this.level;
          for (let attempt = 0; attempt < 60; attempt++) {
            const ang = attempt < 30
              ? this.player.yaw + (Math.random() - 0.5) * 1.4
              : Math.random() * Math.PI * 2;
            const fx = -Math.sin(ang), fz = -Math.cos(ang);
            const dist = 9 + Math.random() * 5;
            const gx = this.player.pos.x + fx * dist, gz = this.player.pos.z + fz * dist;
            const cx = Math.floor(gx / CELL), cy = Math.floor(gz / CELL);
            if (!sfL.isSolidCell(cx, cy) &&
                sfL.losClear(this.player.pos.x, this.player.pos.z, (cx + 0.5) * CELL, (cy + 0.5) * CELL)) {
              sf.position.set((cx + 0.5) * CELL, 0, (cy + 0.5) * CELL);
              sf.lookAt(this.player.pos.x, 0, this.player.pos.z);
              sf.visible = true;
              this.level.shadowActiveT = 1.4 + Math.random() * 0.8;
              Sound._tone(52, 1.2, 0.06, 'sine', 40); // 极低频嗡鸣
              break;
            }
          }
          this.level.shadowTimer = 45 + Math.random() * 50;   // 下次触发间隔
        }
      }

      // 追逐层：接近出口时更新目标提示
      if (this.level.cfg.alarm && this.objectiveStep === 0 &&
          U.dist2(this.player.pos.x, this.player.pos.z, this.level.exit.x, this.level.exit.z) < 26 * 26) {
        this._advanceObjective();
      }

      UI.setStamina(this.player.stamina, this.player.running);
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
}

/* 启动 */
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
