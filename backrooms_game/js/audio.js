/* ============ 程序化音效（WebAudio，无外部资源） ============ */
'use strict';

const Sound = {
  ctx: null,
  master: null,
  enabled: true,
  _humNodes: null,
  _heartTimer: 0,
  _chaseGain: null,
  _chaseOsc: null,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.8 : 0;
  },

  /** 简单噪声缓冲 */
  _noiseBuf(dur) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  /** 播放一段噪声脉冲（脚步/开门等基础） */
  _burst(freq, dur, vol, type) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf(dur);
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  },

  /** 单音 */
  _tone(freq, dur, vol, type, slideTo) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  /* ---- 具体音效 ---- */
  step(running) { this._burst(running ? 900 : 650, 0.09, running ? 0.16 : 0.09); },
  pickup() { this._tone(880, 0.12, 0.2, 'triangle'); setTimeout(() => this._tone(1320, 0.18, 0.18, 'triangle'), 90); },
  noteOpen() { this._burst(3200, 0.25, 0.1, 'highpass'); },
  doorOpen() { this._burst(300, 0.7, 0.3); this._tone(90, 0.6, 0.15, 'sawtooth', 60); },
  doorLocked() { this._tone(220, 0.12, 0.25, 'square'); setTimeout(() => this._tone(180, 0.15, 0.25, 'square'), 130); },
  keypadClick() { this._tone(1200, 0.05, 0.12, 'square'); },
  keypadOk() { this._tone(660, 0.1, 0.2, 'square'); setTimeout(() => this._tone(990, 0.2, 0.2, 'square'), 110); },
  keypadErr() { this._tone(200, 0.3, 0.25, 'sawtooth', 120); },
  fuseOn() { this._tone(120, 0.5, 0.3, 'sawtooth', 240); this._burst(2000, 0.4, 0.12, 'highpass'); },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.35, 0.2, 'triangle'), i * 140));
  },
  death() {
    this._tone(300, 1.2, 0.4, 'sawtooth', 40);
    this._burst(500, 1.0, 0.4);
  },
  jumpscare() {
    this._burst(3000, 0.5, 0.5, 'highpass');
    this._tone(600, 0.6, 0.5, 'sawtooth', 80);
  },

  /** 环境电流嗡嗡声（荧光灯） */
  startAmbient(level) {
    if (!this.ctx) return;
    this.stopAmbient();
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = level >= 1 ? 0.015 : 0.05;
    // 120Hz 电流声
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 120;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 240;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    // 空调白噪声
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuf(2); n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 220;
    const ng = ctx.createGain(); ng.gain.value = 0.5;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    n.connect(nf); nf.connect(ng); ng.connect(g);
    g.connect(this.master);
    o1.start(); o2.start(); n.start();
    // 水滴声（地下层）
    let dripTimer = null;
    if (level === 1) {
      dripTimer = setInterval(() => {
        if (Math.random() < 0.5) this._tone(this.ctx ? 1400 + Math.random() * 800 : 1500, 0.15, 0.05, 'sine', 500);
      }, 4000);
    }
    this._humNodes = { stop() { try { o1.stop(); o2.stop(); n.stop(); } catch (e) {} if (dripTimer) clearInterval(dripTimer); g.disconnect(); } };
  },
  stopAmbient() {
    if (this._humNodes) { this._humNodes.stop(); this._humNodes = null; }
  },

  /** 心跳（实体接近时调用，dt 累计） */
  heartbeat(dt, intensity) {
    if (!this.ctx || !this.enabled || intensity <= 0) return;
    this._heartTimer -= dt * (0.8 + intensity * 1.6);
    if (this._heartTimer <= 0) {
      this._heartTimer = 1;
      this._tone(55, 0.14, 0.35 * intensity, 'sine');
      setTimeout(() => this._tone(50, 0.12, 0.28 * intensity, 'sine'), 180);
    }
  },

  /** 追逐警报低鸣（开启/关闭） */
  setChase(on) {
    if (!this.ctx) return;
    if (on && !this._chaseOsc) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
      const lg = ctx.createGain(); lg.gain.value = 10;
      lfo.connect(lg); lg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1.2);
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this._chaseOsc = { o, lfo, g };
    } else if (!on && this._chaseOsc) {
      const c = this._chaseOsc; this._chaseOsc = null;
      try {
        c.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8);
        setTimeout(() => { try { c.o.stop(); c.lfo.stop(); c.g.disconnect(); } catch (e) {} }, 1000);
      } catch (e) {}
    }
  },
};
