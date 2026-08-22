/* ============ 工具函数 ============ */
'use strict';

/** 可播种随机数生成器 (mulberry32) */
function RNG(seed) {
  this.s = seed >>> 0;
}
RNG.prototype.next = function () {
  let t = (this.s += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
RNG.prototype.range = function (a, b) { return a + this.next() * (b - a); };
RNG.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };

const U = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  /** 角度插值（处理环绕） */
  lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  },
  dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; },
};

/** 格式化时间 mm:ss */
function fmtTime(sec) {
  sec = Math.floor(sec);
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

/** localStorage 安全读写 */
const Store = {
  get(key, def) {
    try { const v = localStorage.getItem('br_' + key); return v === null ? def : JSON.parse(v); }
    catch (e) { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('br_' + key, JSON.stringify(val)); } catch (e) {}
  },
};

/** 是否触屏设备 */
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
