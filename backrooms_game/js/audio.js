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
  step(running) {
    // 随机音高与音量，避免重复感
    const base = running ? 880 : 620;
    const f = base * (0.88 + Math.random() * 0.26);
    this._burst(f, 0.09, (running ? 0.16 : 0.09) * (0.85 + Math.random() * 0.3));
  },

  /* ---- 跳跃 / 落地 ---- */
  jump() {
    if (!this.ctx) return;
    this._burst(500, 0.06, 0.06);
    this._tone(300, 0.08, 0.03, 'sine', 80);
  },
  land() {
    if (!this.ctx) return;
    this._burst(300, 0.12, 0.14);
    this._tone(90, 0.16, 0.06, 'sine', 40);
  },

  /* ---- 实体呼吸声（距离衰减，随层级持续存在） ---- */
  _breathNodes: null,
  startBreath() {
    if (!this.ctx || this._breathNodes) return;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.7;
    // 呼吸节律 LFO（吸气/呼气）
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.55;
    const lg = ctx.createGain(); lg.gain.value = 0;   // 深度随音量同步设置
    lfo.connect(lg);
    const vol = ctx.createGain(); vol.gain.value = 0;
    lg.connect(vol.gain);          // 增益 = 基准 ± 深度 → 呼吸脉动
    src.connect(lp); lp.connect(vol); vol.connect(this.master);
    src.start(); lfo.start();
    this._breathNodes = { stop() { try { src.stop(); lfo.stop(); } catch (e) {} }, vol, lg };
  },
  setBreathVolume(v) {
    if (!this._breathNodes) return;
    v = U.clamp(v, 0, 0.5);
    const t = this.ctx.currentTime;
    this._breathNodes.vol.gain.setTargetAtTime(v * 0.6, t, 0.15);
    this._breathNodes.lg.gain.setTargetAtTime(v * 0.4, t, 0.15);
  },
  stopBreath() {
    if (this._breathNodes) { this._breathNodes.stop(); this._breathNodes = null; }
  },

  /* ---- 嘶吼（发现玩家瞬间） ---- */
  growl() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.55);
    const o2 = ctx.createOscillator(); o2.type = 'square';
    o2.frequency.setValueAtTime(95, t);
    o2.frequency.exponentialRampToValueAtTime(48, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); o2.connect(g); g.connect(this.master);
    o.start(t); o2.start(t); o.stop(t + 0.65); o2.stop(t + 0.65);
  },
  pickup() { this._tone(880, 0.12, 0.2, 'triangle'); setTimeout(() => this._tone(1320, 0.18, 0.18, 'triangle'), 90); },
  throwWhoosh() {
    if (!this.ctx) return; const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this._noiseBuf(0.25);
    const f = c.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(400, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(2200, c.currentTime + 0.2);
    const g = c.createGain(); g.gain.setValueAtTime(0.18, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.24);
    n.connect(f); f.connect(g); g.connect(this.master); n.start();
  },
  glassBreak() {
    if (!this.ctx) return; const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this._noiseBuf(0.35);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    const g = c.createGain(); g.gain.setValueAtTime(0.5, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.32);
    n.connect(f); f.connect(g); g.connect(this.master); n.start();
    for (let i = 0; i < 4; i++) setTimeout(() => this._tone(2400 + Math.random() * 2400, 0.06, 0.1, 'triangle'), i * 40);
  },
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
    // 层级音量/音色分组：0 黄色房间最响；11 白色虚空几乎无声
    const humVol = level === 11 ? 0.006 : (level === 5 ? 0.004 : (level >= 1 ? 0.02 : 0.05));
    g.gain.value = humVol;
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

    // v2.2 层级特色环境音
    let extraStop = null;
    if (level === 22) {
      // 白色风暴：呼啸的风（带通噪声扫频）
      const wn = ctx.createBufferSource(); wn.buffer = this._noiseBuf(3); wn.loop = true;
      const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 1.4;
      const wg = ctx.createGain(); wg.gain.value = 0.16;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
      const lg = ctx.createGain(); lg.gain.value = 320;
      lfo.connect(lg); lg.connect(wf.frequency);
      wn.connect(wf); wf.connect(wg); wg.connect(this.master);
      wn.start(); lfo.start();
      extraStop = () => { try { wn.stop(); lfo.stop(); } catch (e) {} };
    } else if (level === 21) {
      // 数据中心：高频电流嗡鸣
      const eo = ctx.createOscillator(); eo.type = 'sawtooth'; eo.frequency.value = 360;
      const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 800;
      const eg = ctx.createGain(); eg.gain.value = 0.012;
      eo.connect(ef); ef.connect(eg); eg.connect(this.master); eo.start();
      extraStop = () => { try { eo.stop(); } catch (e) {} };
    } else if (level === 20) {
      // 温室：虫鸣脉动
      const bo = ctx.createOscillator(); bo.type = 'sine'; bo.frequency.value = 4200;
      const bg = ctx.createGain(); bg.gain.value = 0;
      const bl = ctx.createOscillator(); bl.frequency.value = 2.7;
      const blg = ctx.createGain(); blg.gain.value = 0.008;
      bl.connect(blg); blg.connect(bg.gain);
      bo.connect(bg); bg.connect(this.master); bo.start(); bl.start();
      extraStop = () => { try { bo.stop(); bl.stop(); } catch (e) {} };
    }
    // 水滴声（地下/潮湿层）
    let dripTimer = null;
    if ([1, 5, 6, 7, 9, 12].includes(level)) {
      dripTimer = setInterval(() => {
        if (Math.random() < (level === 6 ? 0.75 : (level === 12 ? 0.65 : 0.5))) this._tone(this.ctx ? 1400 + Math.random() * 800 : 1500, 0.15, 0.05, 'sine', 500);
      }, level === 6 ? 3000 : (level === 12 ? 3600 : 4000));
    }
    // 警笛（深红警报）
    let siren = null;
    if (level === 10) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 640;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.45;
      const lg = ctx.createGain(); lg.gain.value = 190;
      lfo.connect(lg); lg.connect(o.frequency);
      const sg = ctx.createGain(); sg.gain.value = 0.04;
      o.connect(sg); sg.connect(g);
      o.start(); lfo.start();
      siren = { o, lfo };
    }
    this._humNodes = { stop() { try { o1.stop(); o2.stop(); n.stop(); } catch (e) {} if (extraStop) extraStop(); if (dripTimer) clearInterval(dripTimer); if (siren) { try { siren.o.stop(); siren.lfo.stop(); } catch (e) {} } g.disconnect(); } };
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
