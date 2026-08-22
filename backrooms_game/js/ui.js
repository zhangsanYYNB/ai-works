/* ============ UI：菜单 / HUD / 小地图 / 弹窗 ============ */
'use strict';

const UI = {
  els: {},

  init() {
    const $ = id => document.getElementById(id);
    this.els = {
      hud: $('hud'), objectiveText: $('objective-text'), levelTag: $('level-tag'),
      minimap: $('minimap'), inventory: $('inventory'), staminaFill: $('stamina-fill'),
      staminaBar: $('stamina-bar'),
      interactPrompt: $('interact-prompt'), toast: $('toast'), pauseBtn: $('pause-btn'),
      menu: $('menu-screen'), help: $('help-screen'), note: $('note-screen'),
      keypad: $('keypad-screen'), pause: $('pause-screen'), death: $('death-screen'),
      win: $('win-screen'), loading: $('loading-screen'), rotateHint: $('rotate-hint'),
      touch: $('touch-controls'),
      noteTitle: $('note-title'), noteBody: $('note-body'),
      fade: $('fade-layer'), damage: $('damage-flash'),
      winTitle: $('win-title'), winText: $('win-text'), winStats: $('win-stats'),
      deathText: $('death-text'),
    };

    /* 主菜单按钮 */
    $('btn-start').addEventListener('click', () => { window.GAME.startFromMenu(); });
    $('btn-help').addEventListener('click', () => { this.show('help'); });
    $('btn-help-close').addEventListener('click', () => { this.hide('help'); });

    /* 纸条 */
    $('btn-note-close').addEventListener('click', () => { this.hide('note'); window.GAME.onNoteClosed(); });

    /* 密码锁 */
    this._buildKeypad($('keypad-grid'));
    $('btn-keypad-cancel').addEventListener('click', () => { this.closeKeypad(false); });

    /* 暂停 */
    this.els.pauseBtn.addEventListener('click', () => { window.GAME.pause(); });
    $('btn-resume').addEventListener('click', () => { window.GAME.resume(); });
    $('btn-restart-level').addEventListener('click', () => { window.GAME.restartLevel(); });
    $('btn-quit-menu').addEventListener('click', () => { window.GAME.quitToMenu(); });

    /* 死亡 */
    $('btn-retry').addEventListener('click', () => { window.GAME.restartLevel(); });
    $('btn-death-menu').addEventListener('click', () => { window.GAME.quitToMenu(); });

    /* 胜利 */
    $('btn-next-level').addEventListener('click', () => { window.GAME.nextLevel(); });
    $('btn-win-menu').addEventListener('click', () => { window.GAME.quitToMenu(); });

    /* 设置 */
    const sens = $('set-sensitivity');
    sens.value = Store.get('sensitivity', 1.0);
    sens.addEventListener('input', () => {
      Store.set('sensitivity', parseFloat(sens.value));
      if (window.GAME) window.GAME.player.sensitivity = parseFloat(sens.value);
    });
    const snd = $('set-sound');
    snd.checked = Store.get('sound', true);
    snd.addEventListener('change', () => {
      Store.set('sound', snd.checked);
      Sound.setEnabled(snd.checked);
    });
    const invy = $('set-inverty');
    invy.checked = Store.get('inverty', false);
    invy.addEventListener('change', () => {
      Store.set('inverty', invy.checked);
      if (window.GAME) window.GAME.player.invertY = invy.checked;
    });
    const ch = $('set-crosshair');
    ch.checked = Store.get('crosshair', true);
    ch.addEventListener('change', () => {
      Store.set('crosshair', ch.checked);
      this.applyCrosshair();
    });

    /* 难度选择 */
    document.querySelectorAll('.diff-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.diff === this.getDifficulty());
      b.addEventListener('click', () => {
        Store.set('difficulty', b.dataset.diff);
        document.querySelectorAll('.diff-btn').forEach(x => x.classList.toggle('active', x === b));
        Sound.keypadClick();
      });
    });

    /* 横屏提示 */
    $('btn-rotate-skip').addEventListener('click', () => {
      this.els.rotateHint.classList.add('hidden');
      Store.set('rotateSkip', true);
    });
    if (Store.get('rotateSkip', false)) this.els.rotateHint.classList.add('hidden');

    /* Esc 暂停（桌面） */
    document.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        const G = window.GAME;
        if (!G) return;
        if (G.state === 'playing') G.pause();
        else if (G.state === 'paused') G.resume();
      }
    });

    this._buildLevelSelect();
  },

  show(key) { this.els[key].classList.remove('hidden'); },
  hide(key) { this.els[key].classList.add('hidden'); },
  showOnly(key) {
    ['menu', 'help', 'note', 'keypad', 'pause', 'death', 'win', 'loading'].forEach(k => this.els[k].classList.add('hidden'));
    if (key) this.els[key].classList.remove('hidden');
  },

  /* ---- 主菜单关卡选择 ---- */
  _buildLevelSelect() {
    const box = document.getElementById('level-select');
    box.innerHTML = '';
    const unlocked = Store.get('unlocked', 0);
    LEVEL_CFGS.forEach(cfg => {
      const b = document.createElement('button');
      b.className = 'level-btn' + (cfg.id <= unlocked ? '' : ' locked');
      b.textContent = cfg.id <= unlocked ? (cfg.id + 1) : '🔒';
      b.title = cfg.name;
      b.addEventListener('click', () => window.GAME.startLevel(cfg.id));
      box.appendChild(b);
    });
  },
  refreshLevelSelect() { this._buildLevelSelect(); },

  /* ---- 难度 / 纪录 ---- */
  getDifficulty() { return Store.get('difficulty', 'normal'); },
  applyCrosshair() {
    const el = document.getElementById('crosshair');
    el.style.display = (Store.get('crosshair', true) && !IS_TOUCH) ? '' : 'none';
  },
  refreshMenuStats() {
    const escapes = Store.get('escapes', 0);
    const bests = Store.get('bestTimes', {});
    let txt = escapes > 0 ? `🏆 已成功逃脱 ${escapes} 次` : '';
    if (Object.keys(bests).length) {
      const parts = Object.entries(bests).sort(([a], [b]) => a - b).map(([lv, t]) => `L${+lv + 1} ${t.toFixed(1)}s`);
      txt += (txt ? ' · ' : '') + '最快：' + parts.join(' / ');
    }
    document.getElementById('menu-stats').innerHTML = txt ? txt + '<br>' : '';
  },

  /* ---- HUD ---- */
  setHUDVisible(v) {
    this.els.hud.classList.toggle('hidden', !v);
    this.els.touch.classList.toggle('hidden', !v || !IS_TOUCH);
  },
  setLevelTag(t) { this.els.levelTag.textContent = t; },
  setObjective(html) { this.els.objectiveText.innerHTML = html; },
  setStamina(v, running) {
    this.els.staminaFill.style.width = v + '%';
    this.els.staminaFill.style.background = running ? '#d86a3a' : '#c9b458';
    this.els.staminaBar.style.opacity = v >= 99.5 ? 0.25 : 0.9;
  },
  prompt(text) {
    if (text) { this.els.interactPrompt.innerHTML = text; this.els.interactPrompt.classList.remove('hidden'); }
    else this.els.interactPrompt.classList.add('hidden');
  },
  showToast(html, dur) {
    const el = this.els.toast;
    el.innerHTML = html;
    el.classList.remove('hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.add('hidden'), dur || 2600);
  },
  setInventory(items) {
    // items: [{icon,label,count,used}]
    this.els.inventory.innerHTML = items.map(it =>
      `<div class="inv-item${it.used ? ' used' : ''}"><span class="ic">${it.icon}</span>${it.label}${it.count > 1 ? ' ×' + it.count : ''}</div>`
    ).join('');
  },

  /* ---- 小地图 ---- */
  drawMinimap(level, player, visited, entity) {
    const cv = this.els.minimap;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,10,6,0.6)';
    ctx.fillRect(0, 0, W, H);
    const scale = Math.min(W / level.W, H / level.H);
    const ox = (W - level.W * scale) / 2, oy = (H - level.H * scale) / 2;
    // 已探索格子
    ctx.fillStyle = 'rgba(201,180,88,0.28)';
    for (const key of visited) {
      const [x, y] = [key % level.W, Math.floor(key / level.W)];
      if (level.grid[y] && level.grid[y][x] === 0)
        ctx.fillRect(ox + x * scale, oy + y * scale, scale + 0.5, scale + 0.5);
    }
    // 出口
    if (this._exitSeen) {
      const ex = ox + (level.exit.x / CELL) * scale, ez = oy + (level.exit.z / CELL) * scale;
      ctx.fillStyle = level.exit.unlocked ? '#7fe85a' : '#e8b13a';
      ctx.beginPath(); ctx.arc(ex, ez, 4, 0, 7); ctx.fill();
    }
    // 实体（仅追逐时显示红点，增加紧张感）
    if (entity && entity.state === 'chase') {
      const nx = ox + (entity.pos.x / CELL) * scale, nz = oy + (entity.pos.y / CELL) * scale;
      ctx.fillStyle = '#ff4030';
      ctx.beginPath(); ctx.arc(nx, nz, 3.5, 0, 7); ctx.fill();
    }
    // 玩家箭头
    const px = ox + (player.pos.x / CELL) * scale, pz = oy + (player.pos.z / CELL) * scale;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.2, 4.5); ctx.lineTo(0, 2.2); ctx.lineTo(-4.2, 4.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  markExitSeen() { this._exitSeen = true; },
  resetMinimapState() { this._exitSeen = false; },

  /* ---- 纸条 ---- */
  showNote(title, body) {
    this.els.noteTitle.textContent = title;
    this.els.noteBody.textContent = body;
    this.show('note');
    Sound.noteOpen();
  },

  /* ---- 密码锁 ---- */
  _buildKeypad(grid) {
    const keys = ['1','2','3','4','5','6','7','8','9','C','0','✓'];
    this._codeInput = '';
    keys.forEach(k => {
      const b = document.createElement('button');
      b.textContent = k;
      b.addEventListener('click', () => this._keyPressed(k));
      grid.appendChild(b);
    });
  },
  openKeypad(onResult) {
    this._onKeypadResult = onResult;
    this._codeInput = '';
    this._updateKeypadDisplay();
    this.show('keypad');
  },
  closeKeypad(result) {
    this.hide('keypad');
    if (this._onKeypadResult) { const cb = this._onKeypadResult; this._onKeypadResult = null; cb(result); }
  },
  _updateKeypadDisplay() {
    document.getElementById('keypad-display').textContent =
      (this._codeInput.padEnd(4, '·'));
  },
  _keyPressed(k) {
    Sound.keypadClick();
    if (k === 'C') { this._codeInput = ''; this._updateKeypadDisplay(); return; }
    if (k === '✓') {
      const ok = this._codeInput.length === 4 && window.GAME.checkCode(this._codeInput);
      if (ok) { Sound.keypadOk(); this.closeKeypad(true); }
      else { Sound.keypadErr(); this._codeInput = ''; this._updateKeypadDisplay(); }
      return;
    }
    if (this._codeInput.length < 4) { this._codeInput += k; this._updateKeypadDisplay(); }
  },

  /* ---- 过场 ---- */
  fadeOut(cb) {
    this.els.fade.style.opacity = 1;
    setTimeout(() => cb && cb(), 650);
  },
  fadeIn() { setTimeout(() => { this.els.fade.style.opacity = 0; }, 120); },
  damageFlash() {
    this.els.damage.style.opacity = 1;
    setTimeout(() => { this.els.damage.style.opacity = 0; }, 250);
  },
  setLoading(p) {
    document.getElementById('loading-fill').style.width = Math.round(p * 100) + '%';
  },
};
