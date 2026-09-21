(() => {
  'use strict';
  const SAVE_KEY = 'ember-echo-adventure-v1';
  const defaults = () => ({ version: 1, records: {}, last: 0, mode: 1, settings: { sound: false, volume: 0.35, music: true, touch: 'auto', assist: false, effects: !matchMedia('(prefers-reduced-motion: reduce)').matches } });
  let data = defaults();
  let writable = true;
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (raw && raw.version === 1) {
      data.last = Number.isInteger(raw.last) ? Math.max(0, Math.min(47, raw.last)) : 0;
      data.mode = raw.mode === 2 ? 2 : 1;
      for (const [key, value] of Object.entries(raw.records || {})) {
        if (!/^\d+$/.test(key) || +key > 47 || !value || !Array.isArray(value.medals)) continue;
        data.records[key] = {
          medals: [0, 1, 2].map(i => value.medals[i] === true),
          best: Number.isFinite(value.best) && value.best > 0 ? value.best : 99999,
          coins: Math.max(0, Math.min(9999, Number(value.coins) || 0)),
          clears: Math.max(1, Math.min(99999, Number(value.clears) || 1))
        };
      }
      const settings = raw.settings || {};
      for (const key of ['sound', 'music', 'assist', 'effects']) if (typeof settings[key] === 'boolean') data.settings[key] = settings[key];
      if (['auto', 'on', 'off'].includes(settings.touch)) data.settings.touch = settings.touch;
      if (Number.isFinite(settings.volume)) data.settings.volume = Math.max(0, Math.min(1, settings.volume));
    }
  } catch (_) { writable = false; }
  const Store = window.EmberStore = {
    get data() { return data; },
    get writable() { return writable; },
    save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); writable = true; }
      catch (_) { writable = false; }
      return writable;
    },
    unlocked(index) { return index === 0 || !!data.records[index - 1]?.medals[0]; },
    next() {
      for (let i = 0; i < 48; i++) if (!data.records[i]?.medals[0]) return i;
      return 47;
    },
    totals() {
      const values = Object.values(data.records);
      return { clears: values.filter(r => r.medals[0]).length, stars: values.reduce((n, r) => n + r.medals.filter(Boolean).length, 0) };
    },
    complete(index, result) {
      const old = data.records[index];
      const medals = [true, result.relics === 3, result.deaths === 0 && result.time <= result.par];
      const record = !old || result.time < old.best;
      data.records[index] = {
        medals: medals.map((value, i) => value || !!old?.medals[i]),
        best: Math.min(old?.best ?? Infinity, result.time),
        coins: Math.max(old?.coins || 0, result.coins),
        clears: (old?.clears || 0) + 1
      };
      data.last = Math.min(47, index + 1);
      this.save();
      return { medals, record, best: data.records[index].best };
    },
    reset() { const settings = data.settings; data = defaults(); data.settings = settings; this.save(); }
  };

  const bindings = [
    { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW', 'Space'], attack: ['KeyJ'], dash: ['KeyK', 'ShiftLeft'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp', 'Numpad0'], attack: ['Slash', 'Numpad1'], dash: ['Period', 'Numpad2', 'ShiftRight'] }
  ];
  const actions = ['left', 'right', 'jump', 'attack', 'dash'];
  const sources = [new Map(), new Map()];
  const pressed = [new Set(), new Set()];
  const pointers = new Map();
  let enabled = false;
  function held(player, action) {
    for (const value of sources[player].values()) if (value === action) return true;
    return false;
  }
  function put(player, source, action) {
    const before = held(player, action);
    sources[player].set(source, action);
    if (!before) pressed[player].add(action);
  }
  function remove(player, source) { sources[player].delete(source); }
  function paintButtons() {
    document.querySelectorAll('.touch-key').forEach(button => button.classList.toggle('pressed', held(+button.dataset.player, button.dataset.action)));
  }
  const Input = window.EmberInput = {
    players: 1,
    set enabled(value) { enabled = value; this.clear(); },
    get enabled() { return enabled; },
    clear() { sources.forEach(source => source.clear()); pressed.forEach(set => set.clear()); pointers.clear(); paintButtons(); },
    sample(player) {
      const result = {};
      for (const action of actions) { result[action] = held(player, action); result[action + 'Pressed'] = pressed[player].has(action); }
      pressed[player].clear();
      return result;
    },
    bindTouch(container) {
      const release = e => {
        const state = pointers.get(e.pointerId);
        if (!state) return;
        remove(state.player, 'pointer:' + e.pointerId);
        pointers.delete(e.pointerId);
        paintButtons();
      };
      container.addEventListener('pointerdown', e => {
        if (!enabled) return;
        const button = e.target.closest('[data-action]');
        if (!button || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        const player = +button.dataset.player;
        pointers.set(e.pointerId, { player, action: button.dataset.action });
        put(player, 'pointer:' + e.pointerId, button.dataset.action);
        button.setPointerCapture(e.pointerId);
        paintButtons();
      });
      container.addEventListener('pointermove', e => {
        const state = pointers.get(e.pointerId);
        if (!state || e.pointerType === 'mouse') return;
        const button = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-action]');
        const action = button && +button.dataset.player === state.player ? button.dataset.action : null;
        if (action === state.action) return;
        remove(state.player, 'pointer:' + e.pointerId);
        if (action) put(state.player, 'pointer:' + e.pointerId, action);
        state.action = action;
        paintButtons();
      });
      container.addEventListener('pointerup', release);
      container.addEventListener('pointercancel', release);
      container.addEventListener('lostpointercapture', release);
      container.addEventListener('contextmenu', e => e.preventDefault());
    }
  };
  const keyLookup = new Map();
  bindings.forEach((map, player) => Object.entries(map).forEach(([action, codes]) => codes.forEach(code => keyLookup.set(code, { player, action }))));
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const key = keyLookup.get(e.code);
    if (enabled && key) {
      e.preventDefault();
      if (!e.repeat) put(Input.players === 1 ? 0 : key.player, 'key:' + e.code, key.action);
    }
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); window.EmberUI?.togglePause(); }
    if (enabled && e.code === 'KeyR') window.EmberGame?.recall();
  }, { passive: false });
  addEventListener('keyup', e => {
    const key = keyLookup.get(e.code);
    if (key) {
      remove(0, 'key:' + e.code);
      remove(1, 'key:' + e.code);
    }
  });
  addEventListener('blur', () => { Input.clear(); window.EmberUI?.pause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { Input.clear(); window.EmberUI?.pause(); }
  });

  let context, master, musicTimer, musicStep = 0, activeWorld = 0, playing = false;
  function tone(frequency, duration, gain = 0.12, type = 'sine', slide = 0, delay = 0) {
    if (!context || context.state !== 'running' || !Store.data.settings.sound || !master) return;
    const t = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, t);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), t + duration);
    envelope.gain.setValueAtTime(0, t);
    envelope.gain.linearRampToValueAtTime(gain, t + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, t + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(t);
    oscillator.stop(t + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  const Audio = window.EmberAudio = {
    unlock() {
      if (!Store.data.settings.sound) return;
      try {
        if (!context) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;
          context = new AudioContext(); master = context.createGain(); master.connect(context.destination);
        }
        master.gain.value = Store.data.settings.volume;
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch (_) { /* Audio is optional, including on restricted file URLs. */ }
    },
    apply() {
      this.unlock();
      if (master && context) master.gain.setTargetAtTime(Store.data.settings.sound ? Store.data.settings.volume : 0, context.currentTime, 0.03);
    },
    music(world, active) {
      activeWorld = world; playing = active;
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      if (!active) return;
      musicTimer = setInterval(() => {
        if (!playing || !Store.data.settings.music || !Store.data.settings.sound) return;
        const scale = [0, 3, 5, 7, 10, 12, 10, 7, 5, 3, 7, 5, 3, 0, -2, 3];
        const step = musicStep++ % 32;
        const base = [196, 174.61, 220, 146.83, 164.81, 246.94][activeWorld] || 196;
        if (step % 2 === 0) tone(base * Math.pow(2, scale[(step / 2 + activeWorld * 2) % 16] / 12), 0.36, 0.04, 'triangle');
        if (step % 8 === 0) tone(base / 2 * (step >= 16 ? 0.75 : 1), 0.65, 0.055, 'sine');
        if (step % 4 === 2) tone(base * 2, 0.09, 0.016, 'sine');
      }, 170 + activeWorld * 7);
    },
    play(name) {
      const sounds = {
        jump: () => tone(300, 0.13, 0.1, 'triangle', 220),
        double: () => { tone(440, 0.12, 0.1, 'triangle', 330); tone(660, 0.16, 0.07, 'sine', 220, 0.04); },
        dash: () => tone(160, 0.14, 0.13, 'sawtooth', 530),
        shot: () => tone(660, 0.1, 0.06, 'triangle', -400),
        hit: () => tone(130, 0.16, 0.14, 'square', -90),
        coin: () => { tone(1047, 0.08, 0.055); tone(1568, 0.1, 0.045, 'sine', 0, 0.055); },
        relic: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 0.085, 'triangle', 0, i * 0.07)),
        checkpoint: () => [392, 523, 659].forEach((f, i) => tone(f, 0.25, 0.08, 'sine', 0, i * 0.09)),
        hurt: () => tone(210, 0.23, 0.15, 'sawtooth', -130),
        death: () => [330, 260, 196].forEach((f, i) => tone(f, 0.22, 0.09, 'triangle', -45, i * 0.12)),
        win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.45, 0.1, 'triangle', 0, i * 0.12)),
        spring: () => tone(180, 0.25, 0.12, 'triangle', 700),
        key: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.2, 0.08, 'sine', 0, i * 0.06))
      };
      sounds[name]?.();
    }
  };
  addEventListener('pointerdown', () => Audio.unlock(), { passive: true });
  addEventListener('keydown', () => Audio.unlock(), { passive: true });
})();
