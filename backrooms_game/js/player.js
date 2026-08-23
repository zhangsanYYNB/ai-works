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

    /* ---- 垂直物理 ---- */
    if (this.noclip) {
      // 穿墙模式：悬浮飞行，不受重力
      this.vy = 0;
      const gHere = level ? level.groundAt(this.pos.x, this.pos.z) : 0;
      this.feetY = Math.max(this.feetY, (gHere > HOLE_DEPTH / 2 ? gHere : 0));
      this.onGround = false;
    } else if (level) {
      if (this.onGround) {
        const g = level.groundAt(this.pos.x, this.pos.z);
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
        const g = level.groundAt(this.pos.x, this.pos.z);
        if (this.vy <= 0 && g > HOLE_DEPTH / 2 && this.feetY <= g) {
          this.feetY = g;
          this.vy = 0;
          this.onGround = true;
          Sound.land && Sound.land();
        }
      }
    }
    this.wantJump = false;
    if (this.boostT > 0) this.boostT -= dt;

    // 世界空间移动
    if (this.moving && !paused) {
      const speed = (this.running ? this.speedRun : this.speedWalk) * mag * (this.boostT > 0 ? 1.22 : 1);
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

  /** 该目标点是否可以走过去（含高差判定） */
  _passable(level, x, z) {
    const g = level.groundAt(x, z);
    if (g <= HOLE_DEPTH / 2) return true;              // 破洞：允许走出去然后坠落
    if (this.onGround && g > this.feetY + STEP_UP_MAX) return false;  // 台阶太高
    if (!this.onGround && this.vy <= 0 && g > this.feetY + 0.05 && this.feetY + 0.25 < g) return false; // 空中撞台侧壁
    return true;
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 1.35 : 0;
    Sound.keypadClick();
    return this.flashlightOn;
  }
}
