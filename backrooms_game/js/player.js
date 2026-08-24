/* ============ 玩家：移动 / 视角 / 触屏控制 / 跳跃与重力 ============ */
'use strict';

const GRAVITY = -22;
const JUMP_V = 5.2;
const STEP_UP_MAX = 0.72;   // 可直接迈上的最大高差

class Player {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.pos = new THREE.Vector3(CELL * 1.5, EYE_H, CELL * 1.5);
    this.feetY = 0;          // 脚底高度
    this.vy = 0;             // 垂直速度
    this.onGround = true;
    this.yaw = Math.PI * 0.25;
    this.pitch = 0;
    this.radius = 0.34;
    this.speedWalk = 3.0;
    this.speedRun = 5.1;
    this.stamina = 100;
    this.running = false;
    this.moving = false;
    this.flashlightOn = false;
    this.sensitivity = Store.get('sensitivity', 1.0);
    this.invertY = Store.get('inverty', false);

    /* 手电筒 */
    this.flashlight = new THREE.SpotLight(0xfff4d8, 0, 26, 0.62, 0.45, 1.2);
    this.flashlight.position.set(0.12, -0.08, 0);
    camera.add(this.flashlight);
    this.flashlight.target.position.set(0, -0.04, -3);
    camera.add(this.flashlight.target);

    /* 输入状态 */
    this.keys = {};
    this.lookDX = 0; this.lookDY = 0;      // 待处理的视角增量
    this.moveVec = { x: 0, y: 0 };         // 摇杆向量 (-1..1)
    this.touchSprint = false;
    this.wantJump = false;

    this._bobT = 0;
    this._stepT = 0;
    this.boostT = 0;   // 肾上腺素加速剩余时间
    this.noclip = false; // 作弊：穿墙（飞行）
    this._ladderCd = 0;  // 天梯脱离冷却
    this.onLadder = null;

    this._bindDesktop();
  }

  reset(x, z, yaw) {
    this.pos.set(x, EYE_H, z);
    this.yaw = yaw != null ? yaw : this.yaw;
    this.pitch = 0;
    const g = window.GAME;
    const gy = g && g.level ? g.level.groundAt(x, z) : 0;
    this.feetY = (gy > HOLE_DEPTH / 2) ? gy : 0;
    this.vy = 0;
    this.onGround = true;
    this.stamina = 100;
    this.boostT = 0;
  }

  /* ---------------- 桌面输入 ---------------- */
  _bindDesktop() {
    document.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      const G = window.GAME;
      if (!G) return;
      if (e.code === 'KeyE') G.tryInteract();
      if (e.code === 'KeyF') G.toggleFlashlight();
      if (e.code === 'Space') { this.wantJump = true; e.preventDefault(); }
    });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });

    // 鼠标视角（指针锁定）
    this.canvas.addEventListener('click', () => {
      const G = window.GAME;
      if (G && G.state === 'playing' && !IS_TOUCH && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock && this.canvas.requestPointerLock();
        Sound.resume();
      }
    });
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement === this.canvas) {
        this.lookDX += e.movementX * 0.0022 * this.sensitivity;
        this.lookDY += e.movementY * 0.0022 * this.sensitivity;
      }
    });
  }

  /* ---------------- 触屏绑定（由 UI 调用） ---------------- */
  bindTouch(els) {
    const joyBase = els.joystickBase, joyThumb = els.joystickThumb, joyZone = els.joystickZone;
    let joyId = null, joyCX = 0, joyCY = 0;
    const JR = 44; // 摇杆半径

    const setThumb = (dx, dy) => {
      joyThumb.style.left = `calc(50% + ${dx}px)`;
      joyThumb.style.top = `calc(50% + ${dy}px)`;
    };

    joyZone.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (joyId !== null) continue;
        joyId = t.identifier;
        const rect = joyBase.getBoundingClientRect();
        joyCX = rect.left + rect.width / 2;
        joyCY = rect.top + rect.height / 2;
        this._updateJoy(t.clientX, t.clientY, joyCX, joyCY, JR, this.moveVec, setThumb);
      }
      e.preventDefault();
    }, { passive: false });

    const joyMove = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) this._updateJoy(t.clientX, t.clientY, joyCX, joyCY, JR, this.moveVec, setThumb);
      }
      e.preventDefault();
    };
    joyZone.addEventListener('touchmove', joyMove, { passive: false });
    const joyEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          this.moveVec.x = 0; this.moveVec.y = 0;
          setThumb(0, 0);
        }
      }
    };
    joyZone.addEventListener('touchend', joyEnd);
    joyZone.addEventListener('touchcancel', joyEnd);

    /* 右半屏滑动视角 */
    let lookId = null, lx = 0, ly = 0;
    els.lookZone.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (lookId !== null) continue;
        lookId = t.identifier; lx = t.clientX; ly = t.clientY;
      }
      e.preventDefault();
      Sound.resume();
    }, { passive: false });
    els.lookZone.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const dx = t.clientX - lx, dy = t.clientY - ly;
        lx = t.clientX; ly = t.clientY;
        this.lookDX += dx * 0.0052 * this.sensitivity;
        this.lookDY += dy * 0.0052 * this.sensitivity;
      }
      e.preventDefault();
    }, { passive: false });
    const lookEnd = e => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    };
    els.lookZone.addEventListener('touchend', lookEnd);
    els.lookZone.addEventListener('touchcancel', lookEnd);

    /* 动作按钮 */
    const bindBtn = (el, down, up) => {
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('pressed'); down(); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); el.classList.remove('pressed'); if (up) up(); }, { passive: false });
    };
    bindBtn(els.btnInteract, () => window.GAME && window.GAME.tryInteract());
    bindBtn(els.btnFlashlight, () => window.GAME && window.GAME.toggleFlashlight());
    bindBtn(els.btnSprint, () => { this.touchSprint = true; }, () => { this.touchSprint = false; });
    bindBtn(els.btnJump, () => { this.wantJump = true; });
  }

  _updateJoy(x, y, cx, cy, R, out, setThumb) {
    let dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    out.x = dx / R;
    out.y = dy / R;
    setThumb(dx, dy);
  }

  /* ---------------- 每帧更新 ----------------
     level: 当前关卡（碰撞），dt 秒
     返回 running 状态供实体听觉用
  --------------------------------------------- */
  update(dt, level, paused) {
    // 视角
    if (!paused) {
      this.yaw -= this.lookDX;
      let pdy = this.lookDY * (this.invertY ? -1 : 1);
      this.pitch = U.clamp(this.pitch - pdy, -1.35, 1.35);
    }
    this.lookDX = 0; this.lookDY = 0;

    // 移动输入
    let mx = 0, mz = 0;
    if (!paused) {
      if (this.keys['KeyW'] || this.keys['ArrowUp']) mz += 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) mz -= 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) mx -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;
      mx += this.moveVec.x;
      mz += -this.moveVec.y;
    }
    const mag = Math.min(1, Math.sqrt(mx * mx + mz * mz));
    this.moving = mag > 0.05;

    // 奔跑与体力
    const wantRun = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchSprint;
    this.running = wantRun && this.moving && this.stamina > 1;
    if (this.running) this.stamina = Math.max(0, this.stamina - dt * 22 * (this.staminaDrainMul || 1));
    else this.stamina = Math.min(100, this.stamina + dt * 13);

    // 动态 FOV：冲刺/肾上腺素时视野扩展，增强速度感
    const cam = this.camera;
    if (cam) {
      const targetFov = this.boostT > 0 ? 82 : (this.running ? 79 : 72);
      if (Math.abs(cam.fov - targetFov) > 0.05) {
        cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 5);
        cam.updateProjectionMatrix();
      }
    }

    /* ---- 天梯检测与攀爬 ---- */
    if (this._ladderCd > 0) this._ladderCd -= dt;
    this.onLadder = null;
    if (!this.noclip && this._ladderCd <= 0 && level && level.ladders && level.ladders.length) {
      const pcx = Math.floor(this.pos.x / CELL), pcz = Math.floor(this.pos.z / CELL);
      for (const L of level.ladders) {
        // 按竖井整格捕获：在井格内且高度合适即视为在天梯上
        if (pcx === L.scx && pcz === L.scy &&
            this.feetY > L.y0 - 0.7 && this.feetY < L.y1 + 0.45) { this.onLadder = L; break; }
      }
    }
    let climbing = false;
    if (this.onLadder && !this.noclip) {
      const Ld = this.onLadder;
      const botMin = Math.max(Ld.y0, 0);
      const atTop = this.feetY >= Ld.y1 - 0.03;
      const atBottom = this.feetY <= botMin + 0.08;
      const wantUp = mz > 0.05 || this.keys['Space'];
      const wantDown = mz < -0.05;
      let cvy = 0;
      if (!atTop && !atBottom) {
        if (wantUp) cvy = 2.35;
        else if (wantDown) cvy = -2.1;
      } else if (atBottom && wantUp) {
        cvy = 2.35;                                   // 底部向上爬
      } else if (atTop && wantDown) {
        cvy = -2.1;                                    // 顶部向下爬
      }
      if (cvy !== 0) {
        this.feetY += cvy * dt;
        this._stepT -= dt * 1.7;
        if (this._stepT <= 0) { Sound.step(false); this._stepT = 0.42; }
        climbing = true;
      }
      if (this.feetY >= Ld.y1) this.feetY = Ld.y1;          // 到顶限位
      if (this.feetY <= botMin) this.feetY = botMin;
      // 顶部（未按下）或底部（后退）且在移动 → 沿出口方向自动滑出井口
      const slideOut = ((atTop && !wantDown) || (atBottom && !wantUp)) && this.moving;
      if (slideOut && Ld.ex != null) {
        this.pos.x += Ld.ex * 2.4 * dt;
        this.pos.z += Ld.ez * 2.4 * dt;
        climbing = true;
        this.vy = 0;
      }
      if (this.wantJump && !paused) {                        // 跳离天梯
        this.vy = 3.4;
        this.onLadder = null;
        this._ladderCd = 0.45;
      }
      this.onGround = false;
    }

    /* ---- 垂直物理 ---- */
    if (this.noclip) {
      // 穿墙模式：悬浮飞行，不受重力
      this.vy = 0;
      const gHere = level ? level.groundAt(this.pos.x, this.pos.z) : 0;
      this.feetY = Math.max(this.feetY, (gHere > HOLE_DEPTH / 2 ? gHere : 0));
      this.onGround = false;
    } else if (level && !climbing) {
      if (this.onGround) {
        const g = level.groundAt(this.pos.x, this.pos.z, this.feetY + STEP_UP_MAX);
        if (g <= HOLE_DEPTH / 2 || g < this.feetY - 0.02) {
          // 走出边缘 → 开始下落
          this.onGround = false;
          this.vy = 0;
        } else {
          this.feetY = g;
        }
        // 跳跃
        if (this.wantJump && !paused && !(g <= HOLE_DEPTH / 2)) {
          this.vy = JUMP_V;
          this.onGround = false;
          Sound.jump && Sound.jump();
        }
      }
      if (!this.onGround) {
        this.vy += GRAVITY * dt;
        if (this.vy < -30) this.vy = -30;
        this.feetY += this.vy * dt;
        const g = level.groundAt(this.pos.x, this.pos.z, this.feetY + 0.05);
        if (this.vy <= 0 && g > HOLE_DEPTH / 2 && this.feetY <= g) {
          this.feetY = g;
          this.vy = 0;
          this.onGround = true;
          Sound.land && Sound.land();
        }
      }
    } else if (level && climbing) {
      // 攀爬中：不吸地不重置，仅检查是否已站上楼面
      const gTop = level.groundAt(this.pos.x, this.pos.z, this.feetY + 0.1);
      if (!this.onLadder && gTop > HOLE_DEPTH / 2 && Math.abs(gTop - this.feetY) < 0.15) {
        this.feetY = gTop; this.vy = 0; this.onGround = true;
      }
    }
    this.wantJump = false;
    if (this.boostT > 0) this.boostT -= dt;

    // 世界空间移动
    if (this.moving && !paused) {
      const speed = (this.running ? this.speedRun : this.speedWalk) * mag * (this.boostT > 0 ? 1.22 : 1) * (this.onLadder ? 0.35 : 1);
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // 前方向（yaw=0 时面向 -Z）
      const fx = -sin, fz = -cos;
      const rx = cos, rz = -sin;
      const wx = (fx * mz + rx * mx), wz = (fz * mz + rz * mx);
      const len = Math.sqrt(wx * wx + wz * wz) || 1;
      const nx = this.pos.x + wx / len * speed * dt;
      const nz = this.pos.z + wz / len * speed * dt;
      // 轴分离碰撞（noclip 穿墙时跳过，但限制在地图范围内防止走丢）
      if (this.noclip) {
        const lim = CELL * 1.5;
        this.pos.x = U.clamp(nx, -lim, level.W * CELL + lim);
        this.pos.z = U.clamp(nz, -lim, level.H * CELL + lim);
      } else {
        // 高差阻挡：目标点地面比脚底高出太多则视为墙
        const canGoX = this._passable(level, nx, this.pos.z);
        const canGoZ = this._passable(level, this.pos.x, nz);
        if (canGoX && !level.circleHitsWall(nx, this.pos.z, this.radius)) this.pos.x = nx;
        if (canGoZ && !level.circleHitsWall(this.pos.x, nz, this.radius)) this.pos.z = nz;
      }

      // 头部晃动 & 脚步声
      this._bobT += dt * (this.running ? 11 : 7.5);
      this._stepT -= dt;
      if (this._stepT <= 0) {
        Sound.step(this.running);
        this._stepT = this.running ? 0.32 : 0.52;
      }
    } else {
      this._bobT = U.lerp(this._bobT, Math.round(this._bobT / Math.PI) * Math.PI, dt * 6);
    }

    // 相机同步（含垂直位置）
    const bobY = Math.sin(this._bobT) * (this.moving ? 0.035 : 0.008);
    const bobX = Math.cos(this._bobT * 0.5) * (this.moving ? 0.02 : 0);
    this.camera.position.set(this.pos.x + bobX, this.feetY + EYE_H + bobY, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = Math.sin(this._bobT * 0.5) * 0.006;
  }

  /** 该目标点是否可以走过去（含高差/楼层判定） */
  _passable(level, x, z) {
    if (this.onGround) {
      const g = level.groundAt(x, z, this.feetY + STEP_UP_MAX);
      if (g <= HOLE_DEPTH / 2) return true;              // 破洞/井口：允许走出去然后坠落
      if (g > this.feetY + STEP_UP_MAX) return false;    // 台阶太高
      return true;
    }
    // 空中：不能水平撞进高于脚底的楼板区域
    const gAll = level.groundAt(x, z);
    if (this.vy <= 0 && gAll > this.feetY + 0.05 && this.feetY + 0.25 < gAll) return false;
    return true;
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 1.35 : 0;
    Sound.keypadClick();
    return this.flashlightOn;
  }
}
