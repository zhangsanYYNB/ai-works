(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const icon = (name, className = '') => `<i data-lucide="${name}"${className ? ` class="${className}"` : ''}></i>`;
  const Store = window.EmberStore;
  const Input = window.EmberInput;
  const Audio = window.EmberAudio;
  const formatTime = seconds => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  let toastTimer;
  let returnPage = 'menu';
  let mapWorld = Math.floor(Store.next() / 8);
  let latestResult = null;
  let healthCache = ['', ''];
  let lastFocus = null;
  const UI = window.EmberUI = {
    state: 'loading',
    mode: Store.data.mode,
    formatTime,
    icons() { window.lucide?.createIcons(); },
    ready(preview) {
      $('loading').hidden = true;
      if (preview) this.menu();
      else {
        this.state = 'playing';
        $('overlay').hidden = true;
        Input.enabled = true;
        $('pause-button').innerHTML = icon('pause');
        $('pause-button').setAttribute('aria-label', '暂停');
        this.touch();
        this.icons();
      }
      this.progress();
    },
    open(content, wide = false) {
      if ($('overlay').hidden) lastFocus = document.activeElement;
      Input.enabled = false;
      $('overlay').hidden = false;
      $('dialog').className = 'dialog' + (wide ? ' map-dialog' : '');
      $('dialog').innerHTML = content;
      $('dialog').scrollTop = 0;
      this.icons();
      requestAnimationFrame(() => {
        if ($('overlay').hidden) return;
        ($('dialog').querySelector('.primary:not([disabled])') || $('dialog').querySelector('button:not([disabled])'))?.focus({ preventScroll: true });
      });
    },
    on(id, fn) { $(id)?.addEventListener('click', fn); },
    header(title, eyebrow = '', close = true) {
      return `<div class="dialog-head"><div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h2 id="dialog-title">${title}</h2></div>${close ? `<button class="icon-button" id="dialog-close" aria-label="返回" title="返回">${icon('x')}</button>` : ''}</div>`;
    },
    menu() {
      window.EmberGame?.pause();
      this.state = 'menu';
      const totals = Store.totals();
      const next = Store.unlocked(Store.data.last) ? Store.data.last : Store.next();
      const level = EmberLevels.levels[next];
      this.open(`<div class="dialog-head"><div><p class="eyebrow">A LITTLE LIGHT. A LONG WAY.</p><h1 id="dialog-title">星火双行</h1><span class="edition">EMBER & ECHO</span></div>${icon('sparkles', 'title-mark')}</div>
        <div class="journey"><span><b>${totals.clears}</b>/ 48 旅程</span><span><b>${totals.stars}</b>/ 144 星章</span><span class="badge">6 个世界</span></div>
        <p class="section-label">冒险队伍</p><div class="mode-picker" role="group" aria-label="玩家人数"><button id="solo-mode" aria-pressed="${this.mode === 1}">${icon('user-round')}单人冒险</button><button id="duo-mode" aria-pressed="${this.mode === 2}">${icon('users-round')}双人同行</button></div>
        <button class="primary" id="start-button">${icon('play')}${totals.clears ? '继续旅程' : '出发'}<span>${level.world + 1}-${level.stage + 1}</span></button>
        <div class="button-row"><button class="secondary" id="select-level">${icon('map')}冒险地图</button><button class="secondary" id="menu-settings">${icon('sliders-horizontal')}设置</button></div>
        <div class="dialog-footer"><a class="text-button" href="../index.html">${icon('arrow-left')}项目主页</a><span class="badge">${Store.writable ? '本地存档' : '临时旅程'}</span></div>`);
      this.on('solo-mode', () => this.setMode(1));
      this.on('duo-mode', () => this.setMode(2));
      this.on('start-button', () => this.start(next));
      this.on('select-level', () => this.map('menu'));
      this.on('menu-settings', () => this.settings('menu'));
    },
    setMode(mode) {
      this.mode = mode; Store.data.mode = mode; Store.save();
      $('solo-mode')?.setAttribute('aria-pressed', String(mode === 1));
      $('duo-mode')?.setAttribute('aria-pressed', String(mode === 2));
      this.touch();
    },
    start(index) {
      if (!Store.unlocked(index)) return;
      Audio.unlock();
      Store.data.last = index; Store.data.mode = this.mode; Store.save();
      healthCache = ['', ''];
      latestResult = null;
      this.state = 'playing';
      $('overlay').hidden = true;
      $('boss-hud').hidden = true;
      $('checkpoint-label').textContent = '星火营地';
      $('mode-label').textContent = this.mode === 2 ? '双人同行' : '单人冒险';
      $('p2-hud').hidden = this.mode !== 2;
      $('recall-button').hidden = this.mode !== 2;
      this.touch();
      window.EmberGame.start(index, this.mode, { ...Store.data.settings });
      document.activeElement?.blur();
    },
    pause() {
      if (this.state !== 'playing') return;
      window.EmberGame?.pause();
      this.pauseMenu();
    },
    pauseMenu() {
      this.state = 'paused';
      const info = window.EmberGame?.info();
      this.open(`${this.header('在此歇一会', info ? `${info.world + 1}-${info.stage + 1} / ${info.name}` : '旅途中', false)}
        <button class="primary" id="resume-button">${icon('play')}继续冒险</button>
        <div class="button-row"><button class="secondary" id="retry-button">${icon('rotate-ccw')}重新出发</button><button class="secondary" id="pause-map">${icon('map')}地图</button></div>
        <div class="button-row"><button class="secondary" id="pause-settings">${icon('sliders-horizontal')}设置</button><button class="secondary" id="pause-menu">${icon('home')}营地</button></div>`);
      this.on('resume-button', () => this.resume());
      this.on('retry-button', () => this.start(info.index));
      this.on('pause-map', () => this.map('paused'));
      this.on('pause-settings', () => this.settings('paused'));
      this.on('pause-menu', () => this.menu());
    },
    resume() {
      if (!window.EmberGame?.canResume()) return this.menu();
      this.state = 'playing'; $('overlay').hidden = true;
      Input.enabled = true; window.EmberGame.resume();
      document.activeElement?.blur();
    },
    togglePause() {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'map' || this.state === 'settings') this.back(returnPage);
    },
    back(page) {
      if (page === 'paused') this.pauseMenu();
      else if (page === 'result' && latestResult) this.result(latestResult);
      else this.menu();
    },
    map(from = 'menu') {
      if (this.state === 'playing') { window.EmberGame.pause(); from = 'paused'; }
      returnPage = from; this.state = 'map';
      const worlds = EmberLevels.worlds;
      const world = worlds[mapWorld];
      this.open(`${this.header('冒险地图', `${Store.totals().stars} / 144 星章`)}
        <div class="chapter-tabs" role="tablist" aria-label="世界">${worlds.map((w, i) => `<button role="tab" id="world-${i}" aria-selected="${i === mapWorld}" style="--accent:${w.accent}"><b>0${i + 1}</b><span>${w.name}</span></button>`).join('')}</div>
        <div class="chapter-name"><h3>${world.name}</h3><span>${world.subtitle}</span></div>
        <div class="level-grid" style="--accent:${world.accent}">${EmberLevels.levels.slice(mapWorld * 8, mapWorld * 8 + 8).map(level => {
          const rec = Store.data.records[level.index];
          const locked = !Store.unlocked(level.index);
          return `<button class="level-tile${level.index === Store.next() ? ' next' : ''}" data-level="${level.index}" ${locked ? 'disabled' : ''} title="${rec ? '最佳 ' + formatTime(rec.best) : '目标 ' + formatTime(level.par)}"><span class="number">${level.world + 1}-${level.stage + 1}</span>${locked ? icon('lock-keyhole', 'lock') : level.boss ? icon('crown', 'lock') : ''}<span class="level-name">${level.name}</span><span class="tile-stars">${[0, 1, 2].map(i => icon('star', rec?.medals[i] ? '' : 'unearned')).join('')}</span></button>`;
        }).join('')}</div>
        <div class="dialog-footer"><span class="text-button">${icon('flag')}${Store.totals().clears} / 48 已抵达</span><button class="text-button" id="map-back">${icon('arrow-left')}返回</button></div>`, true);
      worlds.forEach((w, i) => this.on('world-' + i, () => { mapWorld = i; this.map(from); }));
      $('dialog').querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => this.start(+button.dataset.level)));
      this.on('map-back', () => this.back(from));
      this.on('dialog-close', () => this.back(from));
    },
    settings(from) {
      returnPage = from; this.state = 'settings';
      const s = Store.data.settings;
      this.open(`${this.header('旅途设置', 'PREFERENCES')}
        <div class="settings-list">
          <label class="setting"><span>声音</span><input id="setting-sound" type="checkbox" ${s.sound ? 'checked' : ''}></label>
          <label class="setting"><span>音乐</span><input id="setting-music" type="checkbox" ${s.music ? 'checked' : ''}></label>
          <label class="setting"><span>音量</span><input id="setting-volume" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}"></label>
          <label class="setting"><span>触屏控制</span><select id="setting-touch"><option value="auto" ${s.touch === 'auto' ? 'selected' : ''}>自动</option><option value="on" ${s.touch === 'on' ? 'selected' : ''}>显示</option><option value="off" ${s.touch === 'off' ? 'selected' : ''}>隐藏</option></select></label>
          <label class="setting"><span>粒子与震屏</span><input id="setting-effects" type="checkbox" ${s.effects ? 'checked' : ''}></label>
          <label class="setting"><span>生命加护</span><input id="setting-assist" type="checkbox" ${s.assist ? 'checked' : ''}></label>
        </div>${!Store.writable ? '<p class="save-notice">浏览器存储不可用，当前进度仅保留在本次打开期间。</p>' : ''}
        <div class="dialog-footer"><button class="text-button" id="reset-progress">${icon('trash-2')}重置旅程</button><button class="text-button" id="settings-back">${icon('check')}完成</button></div>`);
      ['sound', 'music', 'effects', 'assist'].forEach(key => $('setting-' + key).addEventListener('change', e => {
        Store.data.settings[key] = e.target.checked; Store.save(); Audio.apply(); this.soundIcon();
        window.EmberGame?.applySettings(Store.data.settings);
      }));
      $('setting-volume').addEventListener('input', e => { Store.data.settings.volume = +e.target.value / 100; Store.save(); Audio.apply(); });
      $('setting-touch').addEventListener('change', e => { Store.data.settings.touch = e.target.value; Store.save(); this.touch(); });
      this.on('settings-back', () => this.back(from));
      this.on('dialog-close', () => this.back(from));
      this.on('reset-progress', () => this.confirmReset(from));
    },
    confirmReset(from) {
      this.open(`${this.header('重置全部旅程？', '本地记录将被清除', false)}<div class="button-row"><button class="secondary" id="cancel-reset">取消</button><button class="danger-button" id="confirm-reset">${icon('trash-2')}确认重置</button></div>`);
      this.on('cancel-reset', () => this.settings(from));
      this.on('confirm-reset', () => { Store.reset(); latestResult = null; mapWorld = 0; this.progress(); window.EmberGame.preview(); });
    },
    result(result) {
      latestResult = result; this.state = 'result';
      const finale = result.index === 47;
      const earned = result.earned;
      this.open(`${this.header(finale ? '星火，终将重逢' : '下一站，还有光', `${result.world + 1}-${result.stage + 1} / ${result.name}`, false)}
        <div class="result-emblem">${earned.medals.map(value => icon('star', value ? '' : 'unearned')).join('')}</div>
        <div class="result-stats"><div><strong>${formatTime(result.time)}</strong><span>本关用时</span></div><div><strong>${result.relics}/3</strong><span>星核</span></div><div><strong>${result.coins}</strong><span>星屑</span></div></div>
        <div class="medal-list"><span class="earned">${icon('check')}抵达星门</span><span class="${earned.medals[1] ? 'earned' : ''}">${icon(earned.medals[1] ? 'check' : 'minus')}集齐 3 枚星核</span><span class="${earned.medals[2] ? 'earned' : ''}">${icon(earned.medals[2] ? 'check' : 'minus')}${formatTime(result.par)} 内零倒下 · 本次 ${result.deaths} 次</span></div>
        <button class="primary" id="next-level">${icon(finale ? 'map' : 'arrow-right')}${finale ? '重返冒险地图' : '前往 ' + (Math.floor((result.index + 1) / 8) + 1) + '-' + ((result.index + 1) % 8 + 1)}</button>
        <div class="button-row"><button class="secondary" id="result-retry">${icon('rotate-ccw')}再来一次</button><button class="secondary" id="result-map">${icon('map')}地图</button></div>
        ${earned.record ? '<div class="record">个人最佳用时</div>' : `<div class="goal-time">最佳 ${formatTime(earned.best)}</div>`}`);
      this.on('next-level', () => { if (finale) { mapWorld = 5; this.map('result'); } else this.start(result.index + 1); });
      this.on('result-retry', () => this.start(result.index));
      this.on('result-map', () => { mapWorld = result.world; this.map('result'); });
      this.progress();
    },
    update(scene) {
      $('coin-count').textContent = scene.coins;
      $('relic-count').textContent = scene.relics + '/3';
      $('run-time').textContent = formatTime(scene.elapsed);
      scene.players.forEach((player, i) => {
        const key = player.hp + ':' + player.maxHP + ':' + player.dead;
        if (healthCache[i] !== key) {
          healthCache[i] = key;
          $('health-' + i).innerHTML = Array.from({ length: player.maxHP }, (_, n) => icon('heart', n < player.hp && !player.dead ? '' : 'empty')).join('');
          this.icons();
        }
        $('dash-' + i).style.width = Math.min(100, Math.max(0, (1 - (player.dashReady - scene.clock) / 950) * 100)) + '%';
      });
      $('boss-hud').hidden = !scene.boss || scene.boss.dead || !scene.boss.engaged;
      if (scene.boss && !scene.boss.dead) {
        $('boss-name').textContent = scene.level.boss.name;
        $('boss-health').style.width = Math.max(0, scene.boss.hp / scene.boss.maxHP * 100) + '%';
        $('boss-state').textContent = scene.boss.vulnerable ? '核心暴露' : scene.boss.phase === 'windup' ? '蓄能' : '装甲护盾';
      }
      let objective = scene.boss && !scene.boss.dead ? '唤醒守卫，夺回星火' : scene.lockedGates > 0 ? '寻找钥匙' : '抵达星门';
      if (scene.exitWaiting) objective = '等待同伴抵达';
      $('objective').hidden = false;
      $('objective-text').textContent = objective;
    },
    level(level) {
      const world = EmberLevels.worlds[level.world];
      $('world-label').textContent = `0${level.world + 1} / ${world.name}`;
      $('level-label').textContent = `${level.world + 1}-${level.stage + 1}  ${level.name}`;
      document.documentElement.style.setProperty('--accent', world.accent);
      $('coin-count').textContent = '0'; $('relic-count').textContent = '0/3'; $('run-time').textContent = '00:00';
    },
    checkpoint(number) { $('checkpoint-label').textContent = `星火营地 ${number}`; this.toast('星火已点亮'); },
    toast(text) {
      clearTimeout(toastTimer); $('toast').textContent = text; $('toast').classList.add('visible');
      toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2200);
    },
    progress() { $('progress-label').textContent = `冒险地图 · ${Store.totals().clears}/48`; },
    soundIcon() {
      const sound = Store.data.settings.sound;
      $('sound-button').innerHTML = icon(sound ? 'volume-2' : 'volume-x');
      $('sound-button').setAttribute('aria-pressed', String(sound)); this.icons();
    },
    touch() {
      const settings = Store.data.settings;
      const visible = settings.touch === 'on' || (settings.touch === 'auto' && (navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches));
      $('touch-controls').hidden = !visible;
      $('touch-button').setAttribute('aria-pressed', String(visible));
      Input.players = this.mode;
      const container = $('touch-controls');
      if (+container.dataset.mode === this.mode) return;
      Input.clear(); container.dataset.mode = this.mode;
      container.classList.toggle('duo-touch', this.mode === 2);
      const keys = [
        { action: 'left', icon: 'chevron-left', title: ['向左 (A)', '向左 (左方向键)'] },
        { action: 'right', icon: 'chevron-right', title: ['向右 (D)', '向右 (右方向键)'] },
        { action: 'dash', icon: 'wind', title: ['冲刺 (K / 左 Shift)', '冲刺 (. / 数字键 2)'] },
        { action: 'attack', icon: 'crosshair', title: ['星火弹 (J)', '星火弹 (/ / 数字键 1)'] },
        { action: 'jump', icon: 'arrow-up', title: ['跳跃 / 二段跳 (W / 空格)', '跳跃 / 二段跳 (上方向键 / 数字键 0)'] }
      ];
      const button = (key, player) => `<button class="touch-key ${key.action}" data-action="${key.action}" data-player="${player}" title="P${player + 1} ${key.title[player]}" aria-label="P${player + 1} ${key.title[player]}">${icon(key.icon)}</button>`;
      container.innerHTML = Array.from({ length: this.mode }, (_, player) => `<div class="touch-lane" data-player="${player}"><span class="touch-player-tag">P${player + 1}</span><div class="touch-move">${keys.slice(0, 2).map(key => button(key, player)).join('')}</div><div class="touch-actions">${keys.slice(2).map(key => button(key, player)).join('')}</div></div>`).join('');
      this.icons();
    }
  };
  Input.bindTouch($('touch-controls'));
  UI.on('pause-button', () => UI.togglePause());
  UI.on('sound-button', () => { Store.data.settings.sound = !Store.data.settings.sound; Store.save(); Audio.apply(); UI.soundIcon(); });
  UI.on('touch-button', () => { Store.data.settings.touch = $('touch-controls').hidden ? 'on' : 'off'; Store.save(); UI.touch(); });
  UI.on('fullscreen-button', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) { UI.toast('此浏览器不支持全屏'); }
  });
  UI.on('map-button', () => {
    if (UI.state === 'loading') return;
    UI.map(UI.state === 'playing' ? 'paused' : UI.state === 'result' ? 'result' : 'menu');
  });
  UI.on('recall-button', () => window.EmberGame?.recall());
  $('dialog').addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const elements = Array.from($('dialog').querySelectorAll('button:not([disabled]), a, input, select'));
    if (!elements.length) return;
    const first = elements[0], last = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  addEventListener('error', e => {
    if (UI.state !== 'loading') return;
    $('loading').textContent = '游戏资源未能载入，请刷新页面。';
    console.error('Ember & Echo:', e.message);
  });
  UI.icons(); UI.touch(); UI.soundIcon();
})();
