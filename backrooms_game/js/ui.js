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
      cheat: $('cheat-screen'),
      touch: $('touch-controls'),
      noteTitle: $('note-title'), noteBody: $('note-body'),
      fade: $('fade-layer'), damage: $('damage-flash'),
      winTitle: $('win-title'), winText: $('win-text'), winStats: $('win-stats'),
      deathText: $('death-text'),
    };

    /* 主菜单按钮 */
    this.bindTap($('btn-start'), () => { window.GAME.startFromMenu(); });
    this.bindTap($('btn-help'), () => this.show('help'));
    this.bindTap($('btn-help-close'), () => { this.hide('help'); });

    /* 纸条 */
    this.bindTap($('btn-note-close'), () => { this.hide('note'); window.GAME.onNoteClosed(); });

    /* 密码锁 */
    this._buildKeypad($('keypad-grid'));
    this.bindTap($('btn-keypad-cancel'), () => { this.closeKeypad(false); });

    /* 暂停 */
    this.els.pauseBtn.addEventListener('click', () => { window.GAME.pause(); });
    this.bindTap($('btn-resume'), () => { window.GAME.resume(); });
    this.bindTap($('btn-restart-level'), () => { window.GAME.restartLevel(); });
    this.bindTap($('btn-quit-menu'), () => { window.GAME.quitToMenu(); });

    /* 死亡 */
    this.bindTap($('btn-retry'), () => { window.GAME.restartLevel(); });
    this.bindTap($('btn-death-menu'), () => { window.GAME.quitToMenu(); });

    /* 胜利 */
    this.bindTap($('btn-next-level'), () => { if (window.GAME.nextLevel) window.GAME.nextLevel(); });
    this.bindTap($('btn-win-menu'), () => { window.GAME.quitToMenu(); });

    /* 作弊面板 */
    this.bindTap($('btn-cheat-close'), () => { this.hide('cheat'); });
    this.bindTap($('ch-god'), () => { window.GAME.doCheat('god'); this.refreshCheatPanel(); });
    this.bindTap($('ch-noclip'), () => { window.GAME.doCheat('noclip'); this.refreshCheatPanel(); });
    this.bindTap($('ch-kfa'), () => window.GAME.doCheat('kfa'));
    this.bindTap($('ch-skip'), () => {
      this.hide('cheat');
      if (window.GAME.state === 'paused') this.hide('pause');
      window.GAME.doCheat('skip');
    });
    this.bindTap($('ch-unlock'), () => { window.GAME.doCheat('unlockall'); this.refreshCheatPanel(); });
    this.bindTap($('ch-reset'), () => { window.GAME.doCheat('reset'); this.refreshCheatPanel(); });
    // 主菜单标题连点 5 次 = 打开后门（彩蛋入口，手机慢点也能触发）
    let taps = 0, tapT = 0;
    document.querySelector('.game-title').addEventListener('click', () => {
      const now = Date.now();
      taps = (now - tapT < 1100) ? taps + 1 : 1;
      tapT = now;
      if (taps >= 5) { taps = 0; this.openCheatPanel(); }
    });

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

    this._buildCodex();
  },

  show(key) { this.els[key].classList.remove('hidden'); },
  hide(key) { this.els[key].classList.add('hidden'); },

  /* 触屏保险绑定：touchend + click 双通道（touchend preventDefault 抑制合成点击防重复） */
  bindTap(el, fn) {
    if (!el) return;
    let lastT = 0;
    const h = e => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastT < 350) return;   // 双通道去重
      lastT = now;
      fn(e);
    };
    el.addEventListener('touchend', h, { passive: false });
    el.addEventListener('click', h);
  },
  showOnly(key) {
    ['menu', 'help', 'note', 'keypad', 'pause', 'death', 'win', 'loading', 'cheat'].forEach(k => this.els[k].classList.add('hidden'));
    if (key) this.els[key].classList.remove('hidden');
  },

  /* ---- 作弊面板 ---- */
  openCheatPanel() {
    this.els.cheat = this.els.cheat || document.getElementById('cheat-screen');
    if (window.GAME && window.GAME.state === 'playing') window.GAME.pause();
    this.refreshCheatPanel();
    this.show('cheat');
    Sound.keypadClick();
  },
  refreshCheatPanel() {
    const G = window.GAME;
    if (!G) return;
    document.getElementById('ch-god').classList.toggle('on', G.cheats.god);
    document.getElementById('ch-noclip').classList.toggle('on', G.cheats.noclip);
  },

  /* ---- 主菜单：层级图鉴（仅已发现的层级可传送） ---- */
  _buildCodex() {
    const box = document.getElementById('codex-grid');
    if (!box) return;
    box.innerHTML = '';
    const disc = Game.ensureDiscovered();
    const KIND_ICON = { door: '🚪', elevator: '🛗', pipe: '🕳️', glitch: '⚡', hole: '⬇️', lightdoor: '✨' };
    LEVEL_CFGS.forEach(cfg => {
      const b = document.createElement('button');
      if (disc[cfg.id]) {
        const kinds = (cfg.exits || []).map(e => KIND_ICON[e.kind] || '?').join('');
        b.className = 'codex-btn';
        b.innerHTML = `<span class="cx-name">${cfg.short}</span><span class="cx-sub">${cfg.entity ? '⚠ ' + cfg.entity.name : '🕊 安全区'}</span><span class="cx-ic">${kinds}</span>`;
        b.addEventListener('click', () => {
          Sound.keypadClick();
          window.GAME.startLevel(cfg.id);
        });
      } else {
        b.className = 'codex-btn locked';
        b.innerHTML = `<span class="cx-name">？？？</span><span class="cx-sub">尚未发现</span><span class="cx-ic">🔒</span>`;
      }
      box.appendChild(b);
    });
  },
  refreshCodex() { this._buildCodex(); },

  /* ---- 难度 / 纪录 ---- */
  getDifficulty() { return Store.get('difficulty', 'normal'); },
  applyCrosshair() {
    const el = document.getElementById('crosshair');
    el.style.display = (Store.get('crosshair', true) && !IS_TOUCH) ? '' : 'none';
  },
  refreshMenuStats() {
    const escapes = Store.get('escapes', 0);
    const discN = (typeof Game !== 'undefined') ? Game.discoveredCount() : 1;
    const notes = Store.get('notesTotal', 0);
    let txt = `🗺 层级发现 <b>${discN} / ${LEVEL_CFGS.length}</b>`;
    if (escapes > 0) txt += ` · 🏆 逃脱 ${escapes} 次`;
    if (notes > 0) txt += ` · 📄 纸条 ${notes} 张`;
    document.getElementById('menu-stats').innerHTML = txt + '<br>';
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
  /** v2.2 穿越后的大字层级横幅 */
  showLevelBanner(cfg, isNew) {
    let el = document.getElementById('level-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'level-banner';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="lb-name">${cfg.name}</div><div class="lb-sub">${isNew ? '✨ 首次发现' : ''}</div>`;
    el.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => el.classList.remove('show'), 2600);
  },

  /** 藏身柜遮罩：暗角+缝隙视野 */
  setHidden(v) {
    let el = document.getElementById('hide-overlay');
    if (v) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'hide-overlay';
        el.innerHTML = '<div class="ho-vignette"></div><div class="ho-slit"></div>';
        document.body.appendChild(el);
      }
      el.style.display = '';
    } else if (el) el.style.display = 'none';
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
    // 传送装置（走近后标记，按类型着色）
    const DEV_COLOR = { door: '#e8b13a', elevator: '#7fb8ff', pipe: '#b09a6a', glitch: '#b08aff', hole: '#8a744a', lightdoor: '#fff7d0' };
    for (let i = 0; i < level.exits.length; i++) {
      const dev = level.exits[i];
      if (U.dist2(player.pos.x, player.pos.z, dev.x, dev.z) < 26 * 26) this._seenDevs.add(i);
      if (!this._seenDevs.has(i)) continue;
      const ex = ox + (dev.x / CELL) * scale, ez = oy + (dev.z / CELL) * scale;
      ctx.fillStyle = DEV_COLOR[dev.kind] || '#e8b13a';
      ctx.beginPath(); ctx.arc(ex, ez, 4, 0, 7); ctx.fill();
      if (dev.kind === 'lightdoor') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
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

  markExitSeen() {},
  resetMinimapState() { this._seenDevs = new Set(); },

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
