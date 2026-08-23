/* ============ 程序化纹理（Canvas 生成，无外部图片） ============ */
'use strict';

const Tex = {
  _cache: {},

  /** 生成一张 canvas */
  _canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  },

  /** 添加噪点 */
  _noise(ctx, w, h, alpha, dark) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * alpha * 255;
      if (dark) {
        d[i] *= (1 - Math.max(0, -n / 255)); d[i + 1] *= (1 - Math.max(0, -n / 255)); d[i + 2] *= (1 - Math.max(0, -n / 255));
      } else {
        d[i] = U.clamp(d[i] + n, 0, 255);
        d[i + 1] = U.clamp(d[i + 1] + n, 0, 255);
        d[i + 2] = U.clamp(d[i + 2] + n, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  /** 随机污渍斑块 */
  _stains(ctx, w, h, count, color, rng) {
    for (let i = 0; i < count; i++) {
      const x = rng.next() * w, y = rng.next() * h;
      const r = 8 + rng.next() * (w / 6);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  },

  toTexture(canvas, repeatX, repeatY) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeatX || repeatY) t.repeat.set(repeatX || 1, repeatY || 1);
    t.anisotropy = 4;
    return t;
  },

  /* ---------- Level 0：黄墙纸 ---------- */
  wallpaper() {
    if (this._cache.wp) return this._cache.wp;
    const W = 512, H = 512;
    const c = this._canvas(W, H), ctx = c.getContext('2d');
    // 底色
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#b3a04a'); bg.addColorStop(0.75, '#a8933f'); bg.addColorStop(1, '#8f7c33');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // 竖条纹墙纸图案
    for (let x = 0; x < W; x += 32) {
      ctx.fillStyle = 'rgba(120,100,30,0.28)';
      ctx.fillRect(x, 0, 14, H);
      ctx.fillStyle = 'rgba(230,215,140,0.13)';
      ctx.fillRect(x + 20, 0, 5, H);
    }
    // 菱形花纹
    ctx.strokeStyle = 'rgba(90,75,22,0.22)';
    ctx.lineWidth = 1.4;
    for (let y = 24; y < H; y += 48) {
      for (let x = ((y / 48) % 2 === 0 ? 16 : 32); x < W; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y - 10); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 9, y);
        ctx.closePath(); ctx.stroke();
      }
    }
    const rng = new RNG(1234);
    this._stains(ctx, W, H, 9, 'rgba(70,58,15,0.20)', rng);
    // 底部积灰（烘焙 AO）
    const gr = ctx.createLinearGradient(0, H * 0.72, 0, H);
    gr.addColorStop(0, 'rgba(40,32,8,0)'); gr.addColorStop(1, 'rgba(35,28,6,0.55)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    this._noise(ctx, W, H, 0.09);
    this._cache.wp = c;
    return c;
  },

  /* ---------- Level 0：潮湿地毯 ---------- */
  carpet() {
    if (this._cache.cp) return this._cache.cp;
    const S = 512;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#96802e'; ctx.fillRect(0, 0, S, S);
    // 地毯纤维
    for (let i = 0; i < 26000; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const v = Math.random();
      ctx.fillStyle = v < 0.5 ? 'rgba(70,58,12,0.25)' : 'rgba(200,180,90,0.18)';
      ctx.fillRect(x, y, 2, 1);
    }
    const rng = new RNG(777);
    this._stains(ctx, S, S, 12, 'rgba(45,36,8,0.30)', rng);
    this._noise(ctx, S, S, 0.08);
    this._cache.cp = c;
    return c;
  },

  /* ---------- 天花板吸音板 ---------- */
  ceiling() {
    if (this._cache.ce) return this._cache.ce;
    const S = 256;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#cfc7ad'; ctx.fillRect(0, 0, S, S);
    // 小孔
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = `rgba(90,85,60,${0.15 + Math.random() * 0.25})`;
      ctx.beginPath();
      ctx.arc(Math.random() * S, Math.random() * S, Math.random() * 1.6, 0, 7);
      ctx.fill();
    }
    // 板缝
    ctx.strokeStyle = '#6d684f'; ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, S - 3, S - 3);
    ctx.strokeStyle = 'rgba(109,104,79,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
    this._noise(ctx, S, S, 0.05);
    this._cache.ce = c;
    return c;
  },

  /* ---------- Level 1：混凝土墙 ---------- */
  concreteWall() {
    if (this._cache.cw) return this._cache.cw;
    const S = 512;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#5c5c58'; ctx.fillRect(0, 0, S, S);
    // 大块明暗
    const rng = new RNG(42);
    this._stains(ctx, S, S, 16, 'rgba(30,30,28,0.22)', rng);
    this._stains(ctx, S, S, 10, 'rgba(130,130,124,0.16)', rng);
    // 模板孔（混凝土浇筑孔）
    ctx.fillStyle = 'rgba(40,40,38,0.5)';
    for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 4; gx++) {
      const x = 64 + gx * 128, y = 128 + gy * 256;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(90,90,86,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.stroke();
    }
    // 裂缝
    ctx.strokeStyle = 'rgba(25,25,24,0.65)'; ctx.lineWidth = 1.6;
    for (let k = 0; k < 5; k++) {
      let x = rng.range(0, S), y = 0;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (y < S) { x += rng.range(-26, 26); y += rng.range(18, 55); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // 底部水渍
    const gr = ctx.createLinearGradient(0, S * 0.62, 0, S);
    gr.addColorStop(0, 'rgba(20,24,18,0)'); gr.addColorStop(1, 'rgba(18,26,16,0.6)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, S, S);
    this._noise(ctx, S, S, 0.1);
    this._cache.cw = c;
    return c;
  },

  /* ---------- Level 1：湿地面（深色反光感） ---------- */
  wetFloor() {
    if (this._cache.wf) return this._cache.wf;
    const S = 512;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#33352f'; ctx.fillRect(0, 0, S, S);
    const rng = new RNG(99);
    this._stains(ctx, S, S, 14, 'rgba(10,12,8,0.4)', rng);
    this._stains(ctx, S, S, 6, 'rgba(90,95,80,0.14)', rng);
    // 分格线
    ctx.strokeStyle = 'rgba(12,14,10,0.7)'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, S, S);
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
    // 局部积水高光
    for (let i = 0; i < 7; i++) {
      const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(18, 60);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(160,175,170,0.16)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, rng.next() * 3, 0, 7); ctx.fill();
    }
    this._noise(ctx, S, S, 0.07);
    this._cache.wf = c;
    return c;
  },

  /* ---------- Level 1：车库天花板 ---------- */
  garageCeil() {
    if (this._cache.gc) return this._cache.gc;
    const S = 256;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#23241f'; ctx.fillRect(0, 0, S, S);
    const rng = new RNG(31);
    this._stains(ctx, S, S, 10, 'rgba(8,8,6,0.5)', rng);
    // 管线
    ctx.strokeStyle = '#151613'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(0, S * 0.3); ctx.bezierCurveTo(S * .3, S * .34, S * .6, S * .27, S, S * .31); ctx.stroke();
    ctx.strokeStyle = '#2e2f29'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, S * 0.72); ctx.lineTo(S, S * 0.7); ctx.stroke();
    this._noise(ctx, S, S, 0.08);
    this._cache.gc = c;
    return c;
  },

  /* ---------- Level 2：办公室墙面 ---------- */
  officeWall() {
    if (this._cache.ow) return this._cache.ow;
    const S = 512;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#8b8570'; ctx.fillRect(0, 0, S, S);
    const rng = new RNG(555);
    this._stains(ctx, S, S, 10, 'rgba(50,46,32,0.25)', rng);
    // 墙裙
    ctx.fillStyle = '#57503c'; ctx.fillRect(0, S * 0.78, S, S * 0.22);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, S * 0.78 - 5, S, 5);
    // 剥落的油漆
    for (let i = 0; i < 26; i++) {
      const x = rng.range(0, S), y = rng.range(0, S * 0.75), r = rng.range(4, 20);
      ctx.fillStyle = `rgba(${rng.int(40, 70)},${rng.int(38, 62)},${rng.int(28, 44)},${rng.range(0.25, 0.5)})`;
      ctx.beginPath();
      let a0 = rng.next() * 7;
      ctx.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
      for (let k = 1; k <= 7; k++) {
        const a = a0 + (k / 7) * Math.PI * 2, rr = r * rng.range(0.4, 1);
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
    const gr = ctx.createLinearGradient(0, S * 0.7, 0, S);
    gr.addColorStop(0, 'rgba(20,18,10,0)'); gr.addColorStop(1, 'rgba(20,18,10,0.5)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, S, S);
    this._noise(ctx, S, S, 0.08);
    this._cache.ow = c;
    return c;
  },

  /* ---------- Level 2：办公地砖 ---------- */
  officeFloor() {
    if (this._cache.of) return this._cache.of;
    const S = 256;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#6e6a58'; ctx.fillRect(0, 0, S, S);
    // 棋盘格磨损地砖
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#767163' : '#63604f';
      ctx.fillRect(x * 128, y * 128, 128, 128);
    }
    const rng = new RNG(88);
    this._stains(ctx, S, S, 8, 'rgba(20,20,12,0.3)', rng);
    ctx.strokeStyle = 'rgba(30,30,22,0.6)'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, S, S);
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
    this._noise(ctx, S, S, 0.07);
    this._cache.of = c;
    return c;
  },

  /* ---------- 道具纹理 ---------- */
  rust() {
    if (this._cache.ru) return this._cache.ru;
    const S = 128;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#6e452a'; ctx.fillRect(0, 0, S, S);
    const rng = new RNG(21);
    this._stains(ctx, S, S, 10, 'rgba(150,80,30,0.4)', rng);
    this._stains(ctx, S, S, 8, 'rgba(40,20,10,0.45)', rng);
    // 锈流痕
    for (let i = 0; i < 14; i++) {
      const x = rng.range(0, S);
      ctx.fillStyle = `rgba(${rng.int(90,150)},${rng.int(45,75)},20,0.35)`;
      ctx.fillRect(x, rng.range(0, S / 2), rng.range(2, 5), rng.range(20, 80));
    }
    this._noise(ctx, S, S, 0.12);
    this._cache.ru = c;
    return c;
  },

  wood() {
    if (this._cache.wd) return this._cache.wd;
    const S = 128;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#8a6a3e'; ctx.fillRect(0, 0, S, S);
    const rng = new RNG(66);
    // 木纹
    for (let y = 0; y < S; y += 3) {
      ctx.strokeStyle = `rgba(${rng.int(60,90)},${rng.int(42,60)},${rng.int(20,32)},${rng.range(0.25,0.5)})`;
      ctx.lineWidth = rng.range(0.5, 1.6);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(S * .3, y + rng.range(-3, 3), S * .7, y + rng.range(-3, 3), S, y);
      ctx.stroke();
    }
    // 板条缝 + 边框
    ctx.strokeStyle = 'rgba(35,22,8,0.8)'; ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, S - 4, S - 4);
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
    this._noise(ctx, S, S, 0.08);
    this._cache.wd = c;
    return c;
  },

  metal() {
    if (this._cache.mt) return this._cache.mt;
    const S = 128;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#8d949a'; ctx.fillRect(0, 0, S, S);
    const rng = new RNG(77);
    this._stains(ctx, S, S, 6, 'rgba(60,66,70,0.35)', rng);
    // 划痕
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = 'rgba(210,215,220,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x = rng.range(0, S), y = rng.range(0, S);
      ctx.moveTo(x, y); ctx.lineTo(x + rng.range(-30, 30), y + rng.range(-8, 8));
      ctx.stroke();
    }
    // 抽屉缝
    ctx.strokeStyle = 'rgba(40,44,48,0.9)'; ctx.lineWidth = 3;
    for (let y = S / 3; y < S; y += S / 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
    this._noise(ctx, S, S, 0.07);
    this._cache.mt = c;
    return c;
  },

  /* ---------- 门 ---------- */
  door(metal) {
    const key = metal ? 'dm' : 'dd';
    if (this._cache[key]) return this._cache[key];
    const W = 256, H = 256;
    const c = this._canvas(W, H), ctx = c.getContext('2d');
    if (metal) {
      ctx.fillStyle = '#4a4e4a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#3c403c'; ctx.fillRect(10, 10, W - 20, H - 20);
      ctx.strokeStyle = '#2a2d2a'; ctx.lineWidth = 4;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      // 警示条
      ctx.save();
      ctx.translate(W / 2, H * 0.82);
      for (let i = -6; i < 7; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#b7a23c' : '#1c1c18';
        ctx.beginPath();
        ctx.moveTo(i * 22, 0); ctx.lineTo(i * 22 + 22, 0);
        ctx.lineTo(i * 22 + 10, 16); ctx.lineTo(i * 22 - 12, 16);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#5e4a26'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#6d5730'; ctx.fillRect(14, 14, W - 28, H - 28);
      // 木纹凹槽
      ctx.strokeStyle = 'rgba(40,30,10,0.55)'; ctx.lineWidth = 3;
      ctx.strokeRect(34, 26, W - 68, 84);
      ctx.strokeRect(34, 132, W - 68, 96);
      ctx.fillStyle = 'rgba(210,190,120,0.85)';
      ctx.beginPath(); ctx.arc(W - 44, H / 2, 7, 0, 7); ctx.fill();
    }
    const rng = new RNG(13);
    this._stains(ctx, W, H, 6, 'rgba(10,8,4,0.3)', rng);
    this._noise(ctx, W, H, 0.06);
    this._cache[key] = c;
    return c;
  },

  /** 纸条贴图（散落在地的白纸） */
  paperNote() {
    if (this._cache.pn) return this._cache.pn;
    const c = this._canvas(128, 128), ctx = c.getContext('2d');
    ctx.fillStyle = '#ddd3ac';
    ctx.beginPath();
    ctx.moveTo(14, 20); ctx.lineTo(112, 10); ctx.lineTo(118, 108); ctx.lineTo(20, 118);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,20,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(70,60,30,0.8)'; ctx.lineWidth = 2;
    for (let y = 40; y <= 92; y += 13) {
      ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(30 + 40 + Math.random() * 30, y); ctx.stroke();
    }
    this._cache.pn = c;
    return c;
  },
};

/* ==================== v2 探索版新增纹理 ==================== */
Object.assign(Tex, {
  /* 恐怖酒店：暗红条纹墙纸 */
  hotelWall() {
    if (this._cache.hw) return this._cache.hw;
    const W = 512, H = 512;
    const c = this._canvas(W, H), ctx = c.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#5e3428'); bg.addColorStop(1, '#47241b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 48) {
      ctx.fillStyle = 'rgba(20,8,4,0.35)'; ctx.fillRect(x, 0, 18, H);
      ctx.fillStyle = 'rgba(190,120,80,0.10)'; ctx.fillRect(x + 26, 0, 6, H);
    }
    // 大马士革花纹（简化菱形花）
    ctx.strokeStyle = 'rgba(160,90,55,0.28)'; ctx.lineWidth = 1.6;
    for (let y = 40; y < H; y += 96) for (let x = ((y / 96) % 2 ? 24 : 72); x < W; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, y - 26); ctx.quadraticCurveTo(x + 20, y, x, y + 26);
      ctx.quadraticCurveTo(x - 20, y, x, y - 26); ctx.stroke();
    }
    const rng = new RNG(2024);
    this._stains(ctx, W, H, 10, 'rgba(15,6,3,0.30)', rng);
    const gr = ctx.createLinearGradient(0, H * 0.75, 0, H);
    gr.addColorStop(0, 'rgba(12,5,2,0)'); gr.addColorStop(1, 'rgba(12,5,2,0.55)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    this._noise(ctx, W, H, 0.08);
    this._cache.hw = c; return c;
  },

  /* 酒店：旧红地毯 */
  redCarpet() {
    if (this._cache.rc) return this._cache.rc;
    const S = 512;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#571e1a'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 22000; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(25,8,6,0.3)' : 'rgba(150,60,45,0.2)';
      ctx.fillRect(x, y, 2, 1);
    }
    // 金色边框花纹
    ctx.strokeStyle = 'rgba(180,140,60,0.4)'; ctx.lineWidth = 5;
    ctx.strokeRect(14, 14, S - 28, S - 28);
    ctx.strokeStyle = 'rgba(180,140,60,0.22)'; ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, S - 60, S - 60);
    const rng = new RNG(4321);
    this._stains(ctx, S, S, 14, 'rgba(10,3,2,0.35)', rng);
    this._noise(ctx, S, S, 0.09);
    this._cache.rc = c; return c;
  },

  /* 病房：白瓷砖墙 */
  tileWall() {
    if (this._cache.tw) return this._cache.tw;
    const S = 512;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#b8bdb4'; ctx.fillRect(0, 0, S, S);
    const T = 128;
    for (let y = 0; y < S; y += T) for (let x = 0; x < S; x += T) {
      const v = 178 + Math.floor(Math.random() * 22);
      ctx.fillStyle = `rgb(${v},${v + 4},${v - 2})`;
      ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
    }
    const rng = new RNG(808);
    this._stains(ctx, S, S, 9, 'rgba(70,90,60,0.18)', rng);
    this._stains(ctx, S, S, 6, 'rgba(60,30,20,0.14)', rng);
    // 裂砖
    ctx.strokeStyle = 'rgba(40,44,38,0.5)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      let x = rng.range(0, S), y = rng.range(0, S);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += rng.range(-40, 40); y += rng.range(-40, 40); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    this._noise(ctx, S, S, 0.06);
    this._cache.tw = c; return c;
  },

  /* 病房：绿白地砖 */
  tileFloor() {
    if (this._cache.tf) return this._cache.tf;
    const S = 256;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#9aa894' : '#c8ccc0';
      ctx.fillRect(x * 128, y * 128, 128, 128);
    }
    const rng = new RNG(909);
    this._stains(ctx, S, S, 10, 'rgba(50,60,42,0.3)', rng);
    this._stains(ctx, S, S, 4, 'rgba(90,30,20,0.16)', rng);
    ctx.strokeStyle = 'rgba(60,66,56,0.65)'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, S, S);
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
    this._noise(ctx, S, S, 0.07);
    this._cache.tf = c; return c;
  },

  /* 管道长廊：铆钉金属墙 */
  pipeWall() {
    if (this._cache.pw) return this._cache.pw;
    const S = 512;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#3a4038'; ctx.fillRect(0, 0, S, S);
    const rng = new RNG(5150);
    this._stains(ctx, S, S, 14, 'rgba(90,60,25,0.35)', rng);
    this._stains(ctx, S, S, 10, 'rgba(8,10,8,0.45)', rng);
    // 横向面板缝 + 铆钉
    for (let y = 0; y < S; y += 128) {
      ctx.strokeStyle = 'rgba(15,18,14,0.9)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
      ctx.fillStyle = 'rgba(120,130,120,0.5)';
      for (let x = 16; x < S; x += 64) { ctx.beginPath(); ctx.arc(x, y + 14, 4, 0, 7); ctx.fill(); }
    }
    // 竖管
    ctx.fillStyle = '#2c332c'; ctx.fillRect(S * 0.3, 0, 34, S);
    ctx.fillStyle = 'rgba(140,150,140,0.18)'; ctx.fillRect(S * 0.3 + 4, 0, 6, S);
    this._noise(ctx, S, S, 0.1);
    this._cache.pw = c; return c;
  },

  /* 矿洞：泥土岩壁 */
  dirtWall() {
    if (this._cache.dw) return this._cache.dw;
    const S = 512;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#4a3a28'; ctx.fillRect(0, 0, S, S);
    const rng = new RNG(1717);
    for (let i = 0; i < 900; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = rng.range(4, 26);
      ctx.fillStyle = `rgba(${rng.int(40, 95)},${rng.int(30, 70)},${rng.int(16, 40)},${rng.range(0.2, 0.5)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    this._stains(ctx, S, S, 8, 'rgba(15,10,5,0.4)', rng);
    // 岩石裂纹
    ctx.strokeStyle = 'rgba(20,14,8,0.6)'; ctx.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      let x = rng.range(0, S), y = rng.range(0, S);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += rng.range(-50, 50); y += rng.range(-35, 35); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    this._noise(ctx, S, S, 0.12);
    this._cache.dw = c; return c;
  },

  /* 矿洞：碎石地面 */
  rockFloor() {
    if (this._cache.rf) return this._cache.rf;
    const S = 512;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#3d332a'; ctx.fillRect(0, 0, S, S);
    const rng = new RNG(2727);
    for (let i = 0; i < 700; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = rng.range(2, 14);
      ctx.fillStyle = `rgba(${rng.int(70, 130)},${rng.int(60, 105)},${rng.int(45, 80)},${rng.range(0.3, 0.7)})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * rng.range(0.5, 1), rng.next() * 3, 0, 7); ctx.fill();
    }
    this._stains(ctx, S, S, 10, 'rgba(10,8,5,0.4)', rng);
    this._noise(ctx, S, S, 0.11);
    this._cache.rf = c; return c;
  },

  /* 白色虚空 */
  whiteVoid(key) {
    const ck = 'wv' + (key || '');
    if (this._cache[ck]) return this._cache[ck];
    const S = 256;
    const c = this._canvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#ecece6'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(200,200,192,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      const x = Math.random() * S, y = Math.random() * S;
      ctx.moveTo(x, y); ctx.lineTo(x + 30, y + Math.random() * 6);
      ctx.stroke();
    }
    this._noise(ctx, S, S, 0.03);
    this._cache[ck] = c; return c;
  },
});
