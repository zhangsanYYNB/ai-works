/* Ember & Echo: self-contained canvas artwork for Phaser 3. */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var BW = 1920;
  var BH = 720;
  var INK = '#23343a';
  var WEATHER = ['leaves', 'dust', 'snow', 'embers', 'rain', 'stars'];
  var THEMES = [
    { sky: ['#85c7c3', '#f5e6ac'], accent: '#ffb661', ground: '#526258', top: '#a2c36b', decor: '#35756b', far: '#a0bda1', mid: '#719b87', near: '#365f59', light: '#e2eead' },
    { sky: ['#83c7d2', '#f5dcb0'], accent: '#f4b95f', ground: '#91705b', top: '#ecd399', decor: '#708d72', far: '#d7c7a6', mid: '#b89e7b', near: '#82695b', light: '#fff0c3' },
    { sky: ['#709dc7', '#e0f4ef'], accent: '#9ff5ef', ground: '#65929f', top: '#f3fbf6', decor: '#7998b4', far: '#c4dfea', mid: '#89b8ca', near: '#4c829a', light: '#ffffff' },
    { sky: ['#422f45', '#cf7867'], accent: '#ffbe69', ground: '#504a50', top: '#d88c67', decor: '#79565e', far: '#b67770', mid: '#855b63', near: '#4e3f4a', light: '#ffd691' },
    { sky: ['#333e59', '#9fabb6'], accent: '#f3d47e', ground: '#59636b', top: '#a9bec0', decor: '#7a8998', far: '#8896a9', mid: '#606e86', near: '#394959', light: '#ffeac0' },
    { sky: ['#171e3f', '#5c698d'], accent: '#ffe3a0', ground: '#696c87', top: '#b8c9cf', decor: '#85a7b1', far: '#626d91', mid: '#4c5b7d', near: '#343d62', light: '#fff0c1' }
  ];

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function finite(n, fallback) { return typeof n === 'number' && isFinite(n) ? n : fallback; }
  function hash(text) {
    var value = 2166136261;
    text = String(text);
    for (var i = 0; i < text.length; i++) {
      value ^= text.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }
  function random(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function color(value, fallback) {
    if (typeof value === 'number' && isFinite(value)) {
      return '#' + (value & 0xffffff).toString(16).padStart(6, '0');
    }
    if (typeof value !== 'string') return fallback;
    var text = value.trim().replace(/^0x/i, '#');
    if (/^[0-9a-f]{6}$/i.test(text)) text = '#' + text;
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : fallback;
  }
  function mix(a, b, amount) {
    function rgb(s) {
      s = s.slice(1);
      if (s.length === 3) s = s.replace(/./g, function (v) { return v + v; });
      return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    }
    var aa = rgb(a), bb = rgb(b);
    return '#' + aa.map(function (v, i) {
      return Math.round(v + (bb[i] - v) * amount).toString(16).padStart(2, '0');
    }).join('');
  }
  function theme(world) {
    world = world || {};
    var index = WEATHER.indexOf(world.weather);
    if (index < 0) index = clamp(Math.floor(finite(Number(world.id), 0)), 0, 5);
    var base = THEMES[index];
    var result = { index: index, weather: WEATHER[index] };
    Object.keys(base).forEach(function (key) { result[key] = base[key]; });
    ['accent', 'ground', 'top', 'decor'].forEach(function (key) {
      result[key] = color(world[key], base[key]);
    });
    if (Array.isArray(world.sky)) {
      result.sky = [color(world.sky[0], base.sky[0]), color(world.sky[1], base.sky[1])];
    }
    result.mid = mix(base.mid, result.decor, 0.2);
    result.near = mix(base.near, result.decor, 0.2);
    return result;
  }

  function poly(c, points, fill, stroke, width) {
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 1; c.stroke(); }
  }
  function line(c, points, stroke, width) {
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
    c.strokeStyle = stroke;
    c.lineWidth = width || 1;
    c.stroke();
  }
  function ellipse(c, x, y, rx, ry, fill, stroke, width, rotation) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rotation || 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 1; c.stroke(); }
  }
  function rect(c, x, y, w, h, fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  function round(c, x, y, w, h, radius, fill, stroke, width) {
    var r = Math.min(radius, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 1; c.stroke(); }
  }
  function diamond(c, x, y, w, h, fill, stroke) {
    poly(c, [[x, y - h / 2], [x + w / 2, y], [x, y + h / 2], [x - w / 2, y]], fill, stroke, 1.4);
  }
  function star(c, x, y, r, fill) {
    poly(c, [[x, y - r], [x + r * 0.22, y - r * 0.22], [x + r, y], [x + r * 0.22, y + r * 0.22], [x, y + r], [x - r * 0.22, y + r * 0.22], [x - r, y], [x - r * 0.22, y - r * 0.22]], fill);
  }
  function rivet(c, x, y, r) {
    ellipse(c, x, y, r || 1.5, r || 1.5, '#d9d7b9', INK, 0.7);
  }
  function gear(c, x, y, radius, teeth, fill, stroke, rotation) {
    var points = [];
    for (var i = 0; i < teeth * 4; i++) {
      var a = i * TAU / (teeth * 4) + (rotation || 0);
      var r = radius * (i % 4 === 0 || i % 4 === 3 ? 0.8 : 1);
      points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    poly(c, points, fill, stroke, 1.5);
  }
  function make(scene, key, w, h, paint) {
    if (scene.textures.exists(key)) return key;
    var texture = scene.textures.createCanvas(key, w, h);
    var c = texture.getContext();
    c.clearRect(0, 0, w, h);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.save();
    paint(c, w, h);
    c.restore();
    texture.refresh();
    return key;
  }

  function explorer(c, player, pose) {
    var scarf = player === 1 ? '#ef765a' : '#52d2c2';
    var light = player === 1 ? '#ffca86' : '#c0fff0';
    var shade = player === 1 ? '#a8484a' : '#238e93';
    var suit = player === 1 ? '#506570' : '#596578';
    var run = typeof pose === 'number';
    var jump = pose === 'jump';
    var swing = run ? [1, 0.12, -1, -0.12][pose] : 0;
    var bob = run && pose % 2 === 1 ? 1 : 0;
    c.translate(0, bob);
    // The pose stays inside a common frame so physics bodies need not change.
    round(c, 7, 26, 13, 19, 4, '#7c7963', INK, 1.7);
    round(c, 7, 29, 8, 8, 2, '#c6b68b', INK, 1);
    line(c, [[10, 31], [10, 35]], '#e8d8ad', 1.5);
    poly(c, jump ? [[20, 28], [10, 22], [2, 17], [4, 27], [13, 33]] : [[20, 28], [9, 29 - swing * 3], [2, 25 - swing * 4], [4, 33 - swing * 2], [13, 36]], scarf, INK, 1.4);
    poly(c, [[15, 30], [7, 34], [4, 40 - swing * 3], [13, 37], [23, 33]], shade, INK, 1);
    var rear = jump ? [[20, 40], [13, 45], [13, 49]] : [[20, 40], [19 - swing * 8, 47], [18 - swing * 10, 51 - Math.abs(swing) * 2]];
    var front = jump ? [[29, 40], [35, 41], [38, 47]] : [[29, 40], [30 + swing * 7, 46], [30 + swing * 9, 51 - Math.abs(swing) * 2]];
    line(c, rear, INK, 8);
    line(c, rear, '#42505a', 5);
    var rb = rear[2];
    round(c, rb[0] - 4, rb[1] - 2, 11, 5, 2, '#33454e', INK, 1.2);
    line(c, front, INK, 8);
    line(c, front, '#8b9591', 5);
    var fb = front[2];
    round(c, fb[0] - 4, fb[1] - 2, 12, 5, 2, '#40535a', INK, 1.2);
    line(c, [[fb[0] - 2, fb[1] + 1], [fb[0] + 5, fb[1] + 1]], '#b9bca5', 1);
    round(c, 16, 28, 19, 17, 5, suit, INK, 1.8);
    poly(c, [[18, 31], [23, 32], [22, 42], [18, 42]], '#c4b58d');
    round(c, 25, 34, 7, 6, 1.5, '#b2b7aa', INK, 0.8);
    rivet(c, 28.5, 37, 1);
    var hand = jump ? [39, 28] : [36 + swing * 4, 39 - Math.abs(swing) * 4];
    line(c, [[30, 32], [35, 35 - (jump ? 6 : 0)], hand], INK, 7.5);
    line(c, [[30, 32], [35, 35 - (jump ? 6 : 0)], hand], suit, 4.8);
    ellipse(c, hand[0], hand[1], 3.7, 3.2, '#e4d1a4', INK, 1.2);
    round(c, 15, 26, 22, 7, 3, scarf, INK, 1.3);
    line(c, [[20, 28], [31, 28]], light, 1.5);
    ellipse(c, 26, 16, 17, 14.5, '#ede9d7', INK, 2);
    poly(c, [[12, 15], [14, 8], [21, 4], [32, 4], [37, 7], [22, 7]], '#fff9e8');
    poly(c, [[11, 17], [14, 25], [23, 29], [33, 27], [38, 24], [23, 26]], '#aaafa3');
    round(c, 19, 12, 23, 13, 6, '#253a42', '#81918d', 1.3);
    line(c, [[24, 13], [35, 13]], '#4c6970', 1.5);
    round(c, 25, jump ? 16 : 17, 3, jump ? 5 : 4, 1.3, light);
    round(c, 35, jump ? 15 : 16, 3, jump ? 5 : 4, 1.3, light);
    line(c, [[29, 23], [32, 23]], '#a2c5bc', 1);
    ellipse(c, 13, 18, 4.3, 5.2, '#c3c6b6', INK, 1.2);
    ellipse(c, 13, 18, 1.8, 2.1, shade);
    poly(c, [[25, 3], [30, 3], [31, 9], [26, 9]], scarf);
    line(c, [[17, 9], [20, 7]], '#ffffff', 1.6);
    if (player === 2) {
      line(c, [[12, 5], [9, 1.5]], INK, 1.5);
      ellipse(c, 8.5, 1.8, 1.6, 1.5, light);
    }
  }

  function walker(c) {
    [[10, 22, 3, 29, 3, 34], [16, 25, 11, 33, 8, 35], [30, 25, 35, 33, 38, 35], [36, 22, 43, 28, 43, 33]].forEach(function (p) {
      line(c, [[p[0], p[1]], [p[2], p[3]], [p[4], p[5]]], INK, 4.2);
      line(c, [[p[0], p[1]], [p[2], p[3]], [p[4], p[5]]], '#b5a177', 2);
    });
    ellipse(c, 23, 23, 18, 11, '#5b6259', INK, 1.8);
    ellipse(c, 22, 18, 17, 12, '#b29960', INK, 1.8);
    poly(c, [[8, 18], [12, 10], [21, 7], [21, 26], [11, 24]], '#d7bd77', INK, 1.1);
    poly(c, [[23, 7], [33, 10], [38, 18], [33, 25], [23, 27]], '#819c8d', INK, 1.1);
    line(c, [[13, 13], [18, 11]], '#ffebb1', 2);
    gear(c, 23, 19, 7, 8, '#6a6759', INK);
    ellipse(c, 23, 19, 3.3, 3.3, '#efaa63', INK, 1);
    round(c, 31, 19, 12, 9, 4, '#3e5557', INK, 1.3);
    ellipse(c, 39, 22, 2.2, 2.4, '#ff9377');
    line(c, [[36, 18], [40, 12], [43, 11]], INK, 1.4);
    ellipse(c, 43, 11, 1.4, 1.4, '#edb66c');
    rivet(c, 12, 21); rivet(c, 32, 14);
  }
  function flyer(c) {
    ellipse(c, 12, 9, 10, 3.2, '#d8ecdf', '#667f83', 1.2, -0.2);
    ellipse(c, 36, 9, 10, 3.2, '#d8ecdf', '#667f83', 1.2, 0.2);
    line(c, [[12, 9], [17, 21], [31, 21], [36, 9]], INK, 3);
    line(c, [[24, 8], [24, 3]], '#bdbe9f', 2);
    ellipse(c, 24, 3, 2, 2, '#f4c977', INK, 1);
    poly(c, [[8, 20], [15, 12], [32, 12], [41, 20], [35, 30], [14, 30]], '#9aa69a', INK, 1.8);
    poly(c, [[12, 19], [17, 14], [30, 14], [35, 19]], '#e2d9b5');
    round(c, 13, 20, 24, 9, 4, '#293f49', INK, 1.2);
    ellipse(c, 20, 24, 2.8, 2.8, '#ff8a73');
    ellipse(c, 31, 24, 2.8, 2.8, '#ff8a73');
    line(c, [[20, 31], [18, 35]], '#d8c485', 2.5);
    line(c, [[29, 31], [31, 35]], '#d8c485', 2.5);
    poly(c, [[22, 30], [27, 30], [24.5, 36]], '#7ee0d7');
    rivet(c, 9, 22); rivet(c, 39, 22);
  }
  function turret(c) {
    round(c, 4, 36, 36, 8, 2, '#697775', INK, 1.8);
    poly(c, [[10, 36], [13, 23], [30, 23], [34, 36]], '#87958b', INK, 1.5);
    gear(c, 21, 28, 9, 9, '#bbab79', INK);
    ellipse(c, 21, 28, 4, 4, '#465d62', INK, 1);
    round(c, 7, 10, 28, 18, 6, '#a7b6a5', INK, 1.7);
    poly(c, [[10, 15], [13, 11], [26, 11], [30, 15]], '#e0d9b8');
    round(c, 26, 15, 15, 9, 2, '#596b6b', INK, 1.6);
    rect(c, 37, 16, 3, 7, '#2c3e47');
    rect(c, 36, 17, 2, 5, '#ffb077');
    ellipse(c, 18, 19, 4.8, 4.8, '#374d54', INK, 1);
    ellipse(c, 18, 19, 2.6, 2.6, '#ff8d6e');
    line(c, [[15, 9], [15, 4], [24, 4]], INK, 1.5);
    ellipse(c, 25, 4, 2.2, 2.2, '#eebb70');
    rivet(c, 10, 40); rivet(c, 33, 40);
  }
  function boss(c) {
    var dark = '#3c5854', stone = '#87978a', pale = '#bdc5a2', moss = '#729952';
    line(c, [[48, 20], [38, 11], [31, 12], [27, 4]], '#535c49', 5);
    line(c, [[89, 20], [103, 9], [111, 12], [118, 5]], '#535c49', 5);
    line(c, [[102, 9], [101, 3]], '#535c49', 3);
    ellipse(c, 34, 9, 7, 3, '#91b365', null, 0, 0.5);
    ellipse(c, 111, 7, 7, 3, '#b1c879', null, 0, -0.5);
    [[39, 92, 26, 28], [78, 92, 26, 28]].forEach(function (p) {
      round(c, p[0], p[1], p[2], p[3], 6, dark, INK, 2.5);
      poly(c, [[p[0], 100], [p[0] + 21, 98], [p[0] + 24, 117], [p[0] - 4, 118]], stone, INK, 2);
      round(c, p[0] - 9, 113, 36, 13, 4, '#6f8178', INK, 2.5);
      line(c, [[p[0] - 3, 122], [p[0] + 18, 122]], pale, 2);
    });
    line(c, [[39, 52], [19, 70], [17, 89]], dark, 19);
    line(c, [[100, 52], [120, 70], [122, 89]], dark, 19);
    poly(c, [[8, 70], [26, 66], [34, 84], [28, 102], [6, 99], [3, 84]], stone, INK, 2.5);
    poly(c, [[111, 66], [132, 72], [137, 92], [130, 103], [110, 101], [106, 84]], stone, INK, 2.5);
    line(c, [[10, 83], [16, 84], [15, 95]], pale, 2);
    line(c, [[128, 83], [121, 84], [123, 96]], pale, 2);
    poly(c, [[38, 36], [96, 34], [112, 59], [98, 95], [77, 105], [47, 97], [28, 59]], stone, INK, 3);
    poly(c, [[38, 36], [63, 41], [54, 58], [29, 57]], pale, INK, 1.8);
    poly(c, [[83, 41], [98, 37], [111, 56], [88, 59]], '#a3b18e', INK, 1.8);
    poly(c, [[33, 64], [48, 75], [48, 93], [40, 83]], '#536e63');
    poly(c, [[96, 71], [106, 62], [97, 92], [81, 99]], '#536e63');
    gear(c, 70, 72, 24, 10, '#53685e', INK, 2);
    ellipse(c, 70, 72, 17, 19, '#283e43', '#c9bb80', 3);
    diamond(c, 70, 72, 22, 30, '#80f0cd', '#e0ffcf');
    poly(c, [[70, 57], [70, 87], [59, 72]], '#38bba9');
    diamond(c, 72, 68, 8, 12, '#eeffe2');
    poly(c, [[45, 17], [64, 10], [90, 15], [98, 31], [90, 49], [54, 49], [41, 35]], pale, INK, 2.5);
    poly(c, [[46, 19], [66, 15], [86, 18], [84, 24], [54, 26]], '#d0d1ae');
    poly(c, [[47, 29], [68, 30], [91, 26], [89, 40], [74, 44], [52, 40]], '#2e4848', INK, 1.5);
    line(c, [[53, 33], [62, 35]], '#c4ffaf', 3);
    line(c, [[77, 35], [86, 31]], '#c4ffaf', 3);
    line(c, [[70, 17], [66, 24], [72, 28]], '#7e9079', 1.8);
    line(c, [[85, 48], [82, 53], [87, 59]], INK, 1.5);
    line(c, [[44, 83], [39, 76], [42, 66]], INK, 1.5);
    [[39, 39, 15], [91, 39, 13], [16, 71, 10], [118, 73, 9], [47, 114, 9]].forEach(function (p) {
      ellipse(c, p[0], p[1], p[2], 4.5, moss);
      for (var i = -1; i <= 1; i++) line(c, [[p[0] + i * 6, p[1]], [p[0] + i * 6 + 3, p[1] - 7]], '#99b76c', 2);
    });
    c.beginPath(); c.moveTo(40, 38); c.bezierCurveTo(25, 48, 49, 60, 33, 72);
    c.strokeStyle = '#668d55'; c.lineWidth = 3; c.stroke();
    ellipse(c, 37, 55, 6, 2.5, '#a5c677', null, 0, -0.7);
  }

  function portal(c) {
    c.beginPath(); c.moveTo(14, 105); c.lineTo(14, 44); c.bezierCurveTo(14, 5, 68, 5, 68, 44); c.lineTo(68, 105); c.closePath();
    var glass = c.createLinearGradient(0, 18, 0, 105);
    glass.addColorStop(0, '#243a55'); glass.addColorStop(0.48, '#398c92'); glass.addColorStop(1, '#9df2c6');
    c.fillStyle = glass; c.fill();
    c.save(); c.clip();
    for (var i = 0; i < 6; i++) {
      c.beginPath(); c.moveTo(23 + i * 7, 107); c.bezierCurveTo(11 + i * 7, 77, 53 - i * 3, 53, 33 + i * 4, 24);
      c.strokeStyle = i % 2 ? '#93ddbd' : '#5cb9b1'; c.globalAlpha = 0.65; c.lineWidth = 1.5; c.stroke();
    }
    c.globalAlpha = 1;
    [[28, 48], [52, 64], [39, 32], [29, 82], [57, 92]].forEach(function (p) { star(c, p[0], p[1], 2.6, '#e9ffd9'); });
    c.restore();
    for (var side = 0; side < 2; side++) {
      var x = side ? 66 : 4;
      for (var j = 0; j < 4; j++) round(c, x, 45 + j * 14, 12, 15, 1.5, j % 2 ? '#839e96' : '#a3b3a1', INK, 1.5);
      line(c, [[x + 5, 51], [x + 5, 95]], '#d5d8af', 1);
    }
    for (var k = 0; k < 9; k++) {
      var a = Math.PI + k * Math.PI / 9;
      var b = a + Math.PI / 9 - 0.018;
      poly(c, [[41 + Math.cos(a) * 37, 44 + Math.sin(a) * 37], [41 + Math.cos(b) * 37, 44 + Math.sin(b) * 37], [41 + Math.cos(b) * 25, 44 + Math.sin(b) * 25], [41 + Math.cos(a) * 25, 44 + Math.sin(a) * 25]], k % 2 ? '#a4b6a4' : '#c3c8a6', INK, 1.3);
    }
    diamond(c, 41, 10, 12, 17, '#ffc481', INK);
    diamond(c, 41, 10, 5, 8, '#fff0bd');
    round(c, 1, 100, 80, 8, 2, '#94a69a', INK, 1.5);
    line(c, [[15, 102], [67, 102]], '#deebbf', 2);
    ellipse(c, 12, 48, 9, 3, '#70975e');
    ellipse(c, 69, 94, 9, 3, '#70975e');
  }

  function objects(scene) {
    make(scene, 'coin', 22, 22, function (c) {
      diamond(c, 11, 11, 18, 20, '#e6a343', '#775838');
      poly(c, [[11, 1], [11, 20], [3, 11]], '#ffd775');
      poly(c, [[11, 4], [16, 10], [11, 16], [7, 11]], '#ffe8a0', '#bc8439', 1);
      line(c, [[6, 9], [10, 4]], '#fff8ce', 1.6);
      star(c, 17, 5, 3.5, '#fff9df');
    });
    make(scene, 'relic', 32, 36, function (c) {
      poly(c, [[16, 1], [28, 10], [26, 25], [16, 34], [4, 24], [3, 11]], '#6fe1cd', INK, 1.6);
      poly(c, [[16, 1], [16, 34], [4, 24], [9, 12]], '#28a9a6');
      poly(c, [[16, 1], [28, 10], [20, 12]], '#d6ffe6');
      poly(c, [[20, 12], [26, 25], [16, 34]], '#b2f2ca');
      poly(c, [[9, 12], [16, 7], [23, 13], [16, 27]], '#ffbd77', '#526e64', 1);
      poly(c, [[16, 7], [16, 27], [9, 12]], '#f18361');
      line(c, [[5, 10], [10, 5]], '#eaffeb', 1.5);
      star(c, 26, 6, 3.8, '#fff7cf');
    });
    make(scene, 'heart', 24, 24, function (c) {
      c.beginPath(); c.moveTo(12, 21); c.bezierCurveTo(7, 17, 1, 12, 1, 7); c.bezierCurveTo(1, 0, 10, 0, 12, 6); c.bezierCurveTo(15, 0, 23, 1, 23, 7); c.bezierCurveTo(23, 13, 16, 18, 12, 21);
      c.fillStyle = '#ef786e'; c.fill(); c.strokeStyle = '#743f4c'; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.moveTo(3, 9); c.bezierCurveTo(2, 4, 8, 2, 9, 6); c.strokeStyle = '#ffd2b0'; c.lineWidth = 2.3; c.stroke();
      line(c, [[14, 17], [19, 12]], '#ce515b', 2);
    });
    make(scene, 'key', 30, 22, function (c) {
      ellipse(c, 9, 10, 7, 7, '#edc26b', '#68583c', 1.5);
      ellipse(c, 9, 10, 3, 3, null, '#806843', 2);
      poly(c, [[14, 8], [28, 8], [28, 16], [24, 16], [24, 13], [21, 13], [21, 16], [18, 16], [18, 12], [14, 12]], '#edc26b', '#68583c', 1.3);
      line(c, [[17, 9.5], [26, 9.5]], '#fff2b2', 1.2);
      line(c, [[5, 6], [8, 4]], '#fff2b2', 1.5);
    });
    make(scene, 'spike', 32, 26, function (c) {
      [[1, 24, 6, 7, 12, 24], [9, 24, 16, 2, 23, 24], [21, 24, 27, 8, 31, 24]].forEach(function (p) {
        poly(c, [[p[0], p[1]], [p[2], p[3]], [p[4], p[5]]], '#a5b7b8', INK, 1.3);
        poly(c, [[p[2], p[3]], [p[2], 23], [p[4], p[5]]], '#667c87');
        line(c, [[p[0] + 2, 21], [p[2], p[3] + 4]], '#edf4e5', 1);
      });
      round(c, 0, 22, 32, 4, 1, '#59696d', INK, 1);
    });
    make(scene, 'saw', 48, 48, function (c) {
      gear(c, 24, 24, 23, 12, '#b6c5c2', INK, 0.1);
      ellipse(c, 24, 24, 15.5, 15.5, '#71888b', '#e2e5cc', 1.5);
      for (var i = 0; i < 6; i++) {
        var a = i * TAU / 6;
        line(c, [[24 + Math.cos(a) * 8, 24 + Math.sin(a) * 8], [24 + Math.cos(a + 0.3) * 13, 24 + Math.sin(a + 0.3) * 13]], '#3e5961', 2.5);
      }
      ellipse(c, 24, 24, 6.5, 6.5, '#d7a565', INK, 1.5);
      ellipse(c, 24, 24, 2.5, 2.5, '#40535d');
      line(c, [[12, 17], [17, 12]], '#f5f4d9', 1.8);
    });
    make(scene, 'bolt', 20, 10, function (c) {
      poly(c, [[0, 5], [10, 1], [17, 2], [20, 5], [17, 8], [10, 9]], '#6ddedc');
      poly(c, [[4, 5], [13, 3], [18, 5], [13, 7]], '#f3fff0');
    });
    make(scene, 'enemybolt', 16, 16, function (c) {
      ellipse(c, 8, 8, 7, 7, '#e97266', '#773d50', 1);
      diamond(c, 8, 8, 9, 11, '#ffc192');
      ellipse(c, 7, 6, 2.2, 2.2, '#fff1d1');
    });
    make(scene, 'particle', 8, 8, function (c) { ellipse(c, 4, 4, 3.5, 3.5, '#ffffff'); });
    make(scene, 'spring', 48, 24, function (c) {
      round(c, 3, 18, 42, 5, 1.5, '#687f7b', INK, 1.3);
      line(c, [[12, 18], [34, 14], [13, 11], [34, 7]], INK, 4.5);
      line(c, [[12, 18], [34, 14], [13, 11], [34, 7]], '#d0dbc0', 2.3);
      round(c, 1, 1, 46, 7, 2, '#dc9865', INK, 1.6);
      line(c, [[6, 3], [41, 3]], '#ffe1a0', 1.5);
      poly(c, [[19, 6], [24, 2], [29, 6]], '#fff0c4');
      rivet(c, 8, 20, 1); rivet(c, 40, 20, 1);
    });
    make(scene, 'flag', 40, 80, function (c) {
      round(c, 4, 73, 18, 6, 2, '#87958a', INK, 1.4);
      line(c, [[12, 75], [12, 5]], INK, 4);
      line(c, [[12, 74], [12, 5]], '#d3cfaa', 2);
      ellipse(c, 12, 4, 3, 3, '#f3c982', INK, 1);
      poly(c, [[14, 10], [26, 8], [38, 13], [32, 23], [38, 33], [25, 29], [14, 31]], '#e9775d', INK, 1.5);
      poly(c, [[14, 11], [22, 10], [22, 28], [14, 30]], '#f49b70');
      diamond(c, 25, 19, 9, 12, '#fff0bd');
      line(c, [[16, 13], [20, 12]], '#ffdba0', 1.5);
    });
    make(scene, 'gate', 40, 128, function (c) {
      round(c, 1, 1, 38, 126, 3, '#607b79', INK, 2);
      rect(c, 7, 9, 26, 108, '#233e48');
      for (var i = 0; i < 3; i++) {
        round(c, 10 + i * 8, 10, 4, 109, 1, '#a2b3a4', '#425d60', 1);
        rect(c, 11 + i * 8, 12, 1, 105, '#e0dfb7');
      }
      round(c, 3, 30, 34, 8, 1, '#809a8b', INK, 1);
      round(c, 3, 91, 34, 8, 1, '#809a8b', INK, 1);
      diamond(c, 20, 64, 28, 32, '#d7b16e', INK);
      ellipse(c, 20, 61, 4, 4, '#354e52');
      poly(c, [[18, 63], [22, 63], [23, 71], [17, 71]], '#354e52');
      [[5, 5], [35, 5], [5, 123], [35, 123]].forEach(function (p) { rivet(c, p[0], p[1], 1.6); });
    });
    make(scene, 'exit', 82, 110, portal);
    make(scene, 'rock', 64, 64, function (c) {
      poly(c, [[3, 46], [10, 19], [25, 5], [47, 9], [60, 29], [59, 52], [41, 61], [16, 59]], '#89938b', INK, 2);
      poly(c, [[10, 19], [25, 5], [47, 9], [36, 24], [18, 33]], '#b9bda5');
      poly(c, [[36, 24], [47, 9], [60, 29], [59, 52], [43, 47]], '#73877f');
      poly(c, [[3, 46], [18, 33], [43, 47], [41, 61], [16, 59]], '#697b73');
      line(c, [[36, 24], [29, 37], [36, 42]], '#52685e', 1.8);
      line(c, [[11, 22], [23, 11]], '#d6d7ba', 1.5);
      ellipse(c, 22, 16, 13, 4, '#78985d');
      ellipse(c, 33, 13, 9, 3, '#98b46f');
      ellipse(c, 14, 49, 5, 2.5, '#a7b17d');
    });
    make(scene, 'leaf', 12, 7, function (c) {
      c.beginPath(); c.moveTo(1, 6); c.quadraticCurveTo(2, -1, 11, 1); c.quadraticCurveTo(10, 7, 1, 6);
      c.fillStyle = '#c4d77b'; c.fill();
      line(c, [[1, 6], [9, 2]], '#6b9861', 0.8);
    });
  }

  function terrain(c, index, height) {
    var t = THEMES[index], rng = random(1201 + index * 91 + height);
    var metal = index === 3 || index === 4;
    var base = c.createLinearGradient(0, 0, 0, height);
    base.addColorStop(0, mix(t.ground, t.top, 0.2)); base.addColorStop(1, mix(t.ground, INK, 0.22));
    rect(c, 0, 0, 96, height, base);
    // Full-width lips and offset mortar courses keep adjacent tiles continuous.
    for (var row = 0; row < Math.ceil(height / 24); row++) {
      var y = row * 24 + 16;
      line(c, [[0, y], [96, y]], mix(t.ground, INK, 0.28), 1);
      for (var col = -1; col < 3; col++) {
        var x = col * 48 + (row % 2) * 24;
        line(c, [[x, y], [x, Math.min(height, y + 24)]], mix(t.ground, INK, 0.3), 1);
        line(c, [[x + 3, y + 2], [x + 43, y + 2]], mix(t.ground, '#ffffff', 0.13), 1);
      }
    }
    for (var n = 0; n < (height > 32 ? 48 : 15); n++) {
      var px = 3 + rng() * 86, py = 12 + rng() * (height - 16);
      if (metal) {
        rect(c, Math.floor(px), Math.floor(py), 2 + rng() * 5, 1, mix(t.ground, t.top, 0.24));
      } else {
        poly(c, [[px, py], [px + 2 + rng() * 4, py - 1], [px + 4, py + 2], [px + 1, py + 3]], mix(t.ground, rng() > 0.5 ? t.top : INK, 0.2));
      }
    }
    if (index === 0) {
      var grass = [[0, 0], [96, 0], [96, 8]];
      for (var gx = 96; gx >= 0; gx -= 4) grass.push([gx, 7 + Math.sin(gx * Math.PI / 24) * 2 + (gx % 12 === 0 ? 4 : 0)]);
      poly(c, grass, '#6d944f');
      rect(c, 0, 0, 96, 4, t.top);
      for (var g = 4; g < 96; g += 12) {
        line(c, [[g, 5], [g + 2, 2], [g + 6, 4]], '#c6dc89', 1);
        line(c, [[g + 5, 12], [g + 7, 19], [g + 5, 24]], '#3c5849', 1);
      }
    } else if (index === 1) {
      poly(c, [[0, 0], [96, 0], [96, 7], [80, 10], [59, 7], [40, 10], [20, 8], [0, 7]], '#d8ba85');
      rect(c, 0, 0, 96, 3, t.top);
      for (var s = 7; s < 96; s += 17) rect(c, s, 5 + s % 3, 4, 1, '#f9e3ad');
      if (height > 32) {
        line(c, [[24, 47], [31, 43], [38, 47], [31, 53], [24, 47]], '#b69a6e', 1.5);
        line(c, [[67, 66], [67, 76], [74, 76]], '#b69a6e', 1.5);
      }
    } else if (index === 2) {
      poly(c, [[0, 0], [96, 0], [96, 7], [85, 7], [81, 17], [77, 7], [57, 8], [54, 12], [50, 7], [24, 8], [20, 15], [17, 8], [0, 7]], '#d7f0e9');
      rect(c, 0, 0, 96, 4, '#ffffff');
      for (var ice = 0; ice < 3; ice++) {
        var ix = 13 + ice * 34;
        poly(c, [[ix, 17], [ix + 13, 17], [ix + 4, Math.min(height, 43)]], '#90bfc6');
        line(c, [[ix + 2, 19], [ix + 4, Math.min(height - 1, 33)]], '#bce3e0', 1);
      }
    } else if (metal) {
      rect(c, 0, 0, 96, 9, index === 3 ? '#b28061' : '#9bada9');
      rect(c, 0, 0, 96, 2, t.top);
      rect(c, 0, 8, 96, 2, '#34474c');
      for (var m = 0; m < 96; m += 24) {
        if (index === 3) poly(c, [[m + 3, 3], [m + 10, 3], [m + 7, 7], [m, 7]], '#514d4e');
        rivet(c, m + 17, 5, 1.3);
      }
      for (var panel = 0; panel < 2; panel++) {
        round(c, panel * 48 + 7, 19, 34, Math.min(height - 22, 28), 2, '#3d5056', '#718781', 1);
        if (height > 32) {
          for (var vent = 0; vent < 4; vent++) rect(c, panel * 48 + 12, 24 + vent * 5, 24, 2, index === 3 ? '#a26b55' : '#617f85');
        }
      }
    } else {
      rect(c, 0, 0, 96, 6, '#b5c8c8');
      rect(c, 0, 0, 96, 2, '#e7edd4');
      line(c, [[0, 10], [96, 10]], '#cabd8d', 1);
      for (var r = 12; r < 96; r += 24) {
        diamond(c, r, height > 32 ? 28 : 21, 8, 10, null, '#bfc6b7');
        rect(c, r - 1, height > 32 ? 26 : 19, 2, 4, '#e2d598');
      }
    }
  }
  function platforms(scene) {
    THEMES.forEach(function (_, i) {
      make(scene, 'ground-' + i, 96, 96, function (c) { terrain(c, i, 96); });
      make(scene, 'stone-' + i, 96, 32, function (c) { terrain(c, i, 32); });
    });
    make(scene, 'crumble', 96, 24, function (c) {
      rect(c, 0, 1, 96, 23, '#927e69'); rect(c, 0, 0, 96, 4, '#d7c292');
      [[16, 0, 22, 8, 17, 13, 25, 24], [47, 0, 40, 10, 51, 14, 44, 24], [76, 0, 71, 7, 78, 17, 72, 24]].forEach(function (p) {
        line(c, [[p[0], p[1]], [p[2], p[3]], [p[4], p[5]], [p[6], p[7]]], '#4f534e', 2);
        line(c, [[p[2] + 2, p[3]], [p[4] + 2, p[5]], [p[6] + 2, p[7]]], '#bba480', 1);
      });
      line(c, [[0, 15], [17, 13]], '#55584e', 1.5);
      line(c, [[51, 14], [61, 11], [74, 13]], '#55584e', 1.5);
      rect(c, 30, 7, 4, 2, '#b6a17e'); rect(c, 84, 12, 5, 2, '#b6a17e');
      rect(c, 0, 22, 96, 2, '#665f52');
    });
    make(scene, 'ice', 96, 24, function (c) {
      var g = c.createLinearGradient(0, 0, 0, 24);
      g.addColorStop(0, '#e9fff5'); g.addColorStop(0.25, '#9de0df'); g.addColorStop(1, '#539cae');
      rect(c, 0, 0, 96, 24, g);
      [[0, 22, 18, 4, 34, 4, 15, 22], [43, 22, 62, 4, 68, 4, 51, 22], [74, 22, 92, 4, 96, 4, 82, 22]].forEach(function (p) {
        poly(c, [[p[0], p[1]], [p[2], p[3]], [p[4], p[5]], [p[6], p[7]]], '#b7f3e7');
      });
      rect(c, 0, 0, 96, 3, '#f4fff3'); rect(c, 0, 22, 96, 2, '#376f8b');
      line(c, [[34, 5], [42, 12], [39, 20]], '#72beca', 1);
      star(c, 77, 8, 3, '#faffef');
    });
    make(scene, 'moving', 96, 24, function (c) {
      round(c, 0, 1, 96, 22, 3, '#587677', INK, 1.6);
      rect(c, 1, 1, 94, 5, '#d9c38d'); rect(c, 4, 7, 88, 2, '#8cae9c');
      round(c, 12, 12, 72, 7, 2, '#304a53');
      for (var i = 0; i < 5; i++) poly(c, [[24 + i * 11, 13], [28 + i * 11, 15.5], [24 + i * 11, 18]], '#8de1c8');
      rivet(c, 6, 15, 2); rivet(c, 90, 15, 2);
    });
    make(scene, 'breakable', 48, 48, function (c) {
      round(c, 1, 1, 46, 46, 3, '#997953', INK, 2);
      for (var i = 0; i < 4; i++) {
        rect(c, 5 + i * 10, 4, 8, 40, i % 2 ? '#bb9763' : '#c7a56b');
        line(c, [[8 + i * 10, 8], [7 + i * 10, 34], [10 + i * 10, 40]], '#9a794e', 1);
      }
      poly(c, [[4, 6], [9, 3], [44, 40], [40, 45]], '#e0bc7d', '#796648', 1);
      poly(c, [[39, 3], [44, 7], [8, 45], [4, 40]], '#d7af70', '#796648', 1);
      [[6, 6], [42, 6], [6, 42], [42, 42]].forEach(function (p) { rivet(c, p[0], p[1], 1.7); });
      line(c, [[27, 13], [22, 21], [28, 27], [24, 33]], '#775f47', 1.5);
    });
  }

  function fern(c, x, y, size, fill) {
    for (var branch = -2; branch <= 2; branch++) {
      var tx = x + branch * size * 0.26;
      var ty = y - size * (1 - Math.abs(branch) * 0.17);
      line(c, [[x, y], [tx, ty]], fill, 1.4);
      for (var l = 1; l <= 5; l++) {
        var f = l / 6, px = x + (tx - x) * f, py = y + (ty - y) * f;
        var spread = size * 0.17 * (1 - f * 0.65);
        poly(c, [[px, py + 2], [px - spread, py - size * 0.08], [px - 1, py - 3]], fill);
        poly(c, [[px, py + 2], [px + spread, py - size * 0.09], [px + 1, py - 3]], fill);
      }
    }
  }
  function crystal(c, x, y, w, h, fill, highlight) {
    poly(c, [[x - w / 2, y - h * 0.65], [x, y - h], [x + w / 2, y - h * 0.68], [x + w * 0.35, y], [x - w * 0.35, y]], fill, mix(fill, INK, 0.35), 1);
    poly(c, [[x, y - h], [x + w / 2, y - h * 0.68], [x + w * 0.35, y], [x, y - 2]], highlight);
    line(c, [[x - w * 0.28, y - h * 0.65], [x - w * 0.2, y - h * 0.25]], mix(highlight, '#ffffff', 0.5), 1);
  }
  function decorationTextures(scene) {
    THEMES.forEach(function (t, index) {
      var prefix = 'ember-decor-' + index + '-';
      make(scene, prefix + 'plant', 56, 58, function (c) {
        if (index === 0) {
          fern(c, 26, 57, 43, '#4f8661'); fern(c, 39, 57, 26, '#87ad68');
        } else if (index === 1) {
          for (var i = -2; i <= 2; i++) {
            c.beginPath(); c.moveTo(27, 57); c.quadraticCurveTo(25 + i * 7, 29, 27 + i * 11, 18 + Math.abs(i) * 8);
            c.strokeStyle = i % 2 ? '#a4a174' : '#718e6c'; c.lineWidth = 2; c.stroke();
          }
          line(c, [[27, 55], [25, 12]], '#8e8760', 1.4);
          ellipse(c, 25, 16, 3, 8, '#d7bd7c', null, 0, -0.1);
        } else if (index === 2 || index === 5) {
          crystal(c, 19, 57, 14, 32, index === 2 ? '#76c5d1' : '#869bbc', '#cfefe9');
          crystal(c, 32, 57, 17, 48, index === 2 ? '#8ed3db' : '#b5b7ce', '#e3f7e9');
          crystal(c, 43, 57, 11, 24, '#80b9c5', '#c8e9d7');
        } else if (index === 3) {
          round(c, 8, 46, 40, 11, 2, '#6d6963', INK, 1.3);
          round(c, 17, 30, 10, 25, 2, '#9a8371', INK, 1.3);
          round(c, 30, 20, 9, 35, 2, '#7b7771', INK, 1.3);
          rect(c, 15, 28, 14, 5, '#c39570'); rect(c, 28, 18, 13, 5, '#b0a088');
          line(c, [[19, 40], [24, 40]], '#f6af71', 2);
          gear(c, 39, 48, 7, 8, '#b19a70', INK);
        } else {
          fern(c, 19, 57, 27, '#607d78');
          line(c, [[37, 55], [36, 15], [42, 9]], '#62767a', 2);
          ellipse(c, 36, 21, 5, 8, '#9eac95');
          ellipse(c, 36, 20, 2, 6, '#c7d1ad');
          line(c, [[36, 34], [45, 27]], '#819785', 1.6);
        }
      });
      make(scene, prefix + 'flower', 40, 38, function (c) {
        if (index === 3) {
          round(c, 5, 24, 30, 13, 2, '#5b6261', INK, 1);
          for (var v = 0; v < 4; v++) rect(c, 9 + v * 6, 27, 3, 7, '#e19a69');
          return;
        }
        for (var i = 0; i < 3; i++) {
          var x = 9 + i * 11, y = 17 - i % 2 * 10;
          line(c, [[x - 3, 37], [x, y]], index === 2 ? '#729fa7' : '#5a8e6a', 1.5);
          ellipse(c, x - 3, y + 13, 5, 2, index === 5 ? '#8fb2b2' : '#8aae75', null, 0, -0.5);
          for (var p = 0; p < 5; p++) ellipse(c, x + Math.cos(p * TAU / 5) * 3, y + Math.sin(p * TAU / 5) * 3, 2.7, 2.7, index === 0 ? (i % 2 ? '#f0b36f' : '#f8d69a') : t.light);
          ellipse(c, x, y, 1.7, 1.7, '#d69261');
        }
      });
      make(scene, prefix + 'rock', 44, 28, function (c) {
        poly(c, [[2, 26], [7, 12], [19, 5], [33, 9], [41, 20], [42, 27]], mix(t.ground, '#a9b4a4', 0.35), INK, 1);
        poly(c, [[7, 12], [19, 5], [33, 9], [22, 17]], mix(t.top, '#c0c4ac', 0.5));
        poly(c, [[22, 17], [33, 9], [41, 20], [42, 27], [28, 25]], mix(t.ground, INK, 0.15));
        if (index === 0) ellipse(c, 19, 11, 11, 3, '#8bad6b');
        if (index === 2) poly(c, [[6, 14], [19, 5], [33, 9], [36, 13], [24, 11], [19, 15], [12, 13]], '#edf8ee');
        if (index === 5) diamond(c, 20, 18, 5, 7, '#d1d7b4');
      });
      make(scene, prefix + 'lamp', 40, 96, function (c) {
        round(c, 9, 89, 21, 6, 2, '#77867a', INK, 1);
        line(c, [[19, 91], [19, 22], [25, 16]], INK, 4);
        line(c, [[19, 89], [19, 22], [25, 16]], '#a5ae93', 2);
        poly(c, [[20, 19], [35, 19], [33, 35], [23, 35]], '#f3d391', '#425d5b', 1.5);
        rect(c, 24, 21, 7, 10, index === 2 || index === 5 ? '#d3fff0' : '#fff2b3');
        poly(c, [[18, 19], [27, 10], [37, 19]], '#718b7c', INK, 1);
        line(c, [[27, 19], [27, 35]], '#788470', 1);
        round(c, 22, 34, 12, 3, 1, '#617c72', INK, 0.8);
        if (index === 0) fern(c, 12, 94, 20, '#608e5e');
        else line(c, [[14, 69], [23, 69]], '#d3bd87', 3);
      });
    });
  }

  function install(scene) {
    [1, 2].forEach(function (player) {
      make(scene, 'p' + player + '-idle', 48, 56, function (c) { explorer(c, player, 'idle'); });
      for (var i = 0; i < 4; i++) {
        (function (frame) {
          make(scene, 'p' + player + '-run' + frame, 48, 56, function (c) { explorer(c, player, frame); });
        }(i));
      }
      make(scene, 'p' + player + '-jump', 48, 56, function (c) { explorer(c, player, 'jump'); });
    });
    make(scene, 'walker', 46, 38, walker);
    make(scene, 'flyer', 48, 38, flyer);
    make(scene, 'turret', 44, 46, turret);
    make(scene, 'boss', 140, 130, boss);
    objects(scene);
    platforms(scene);
    decorationTextures(scene);
  }

  // Landscapes are periodic: hills share their edge heights and large forms wrap.
  function wrapped(c, x, paint) {
    [-BW, 0, BW].forEach(function (offset) {
      c.save(); c.translate(x + offset, 0); paint(c); c.restore();
    });
  }
  function hill(c, y, amplitude, fill, phase) {
    var points = [[0, BH]];
    for (var x = 0; x <= BW; x += 12) {
      points.push([x, y + Math.sin(x / BW * TAU * 2 + phase) * amplitude + Math.cos(x / BW * TAU * 5 + phase) * amplitude * 0.26]);
    }
    points.push([BW, BH]);
    poly(c, points, fill);
  }
  function cloud(c, x, y, w, fill) {
    c.beginPath(); c.moveTo(x - w / 2, y + 7);
    c.bezierCurveTo(x - w * 0.6, y - 8, x - w * 0.29, y - 15, x - w * 0.2, y - 10);
    c.bezierCurveTo(x - w * 0.16, y - 36, x + w * 0.1, y - 32, x + w * 0.18, y - 13);
    c.bezierCurveTo(x + w * 0.33, y - 22, x + w * 0.56, y - 5, x + w / 2, y + 7);
    c.closePath(); c.fillStyle = fill; c.fill();
  }
  function tree(c, x, y, size, t, detailed, seed) {
    var rng = random(seed), trunk = detailed ? t.near : t.mid;
    c.save(); c.translate(x, y); c.scale(size, size);
    poly(c, [[-31, 0], [-16, -97], [-19, -218], [-6, -319], [9, -321], [15, -196], [20, -74], [38, 0]], trunk);
    line(c, [[1, -189], [-61, -263], [-89, -287]], trunk, 18);
    line(c, [[4, -213], [72, -295], [105, -307]], trunk, 14);
    line(c, [[-11, -256], [-43, -332]], trunk, 11);
    if (detailed) {
      line(c, [[-8, -22], [-4, -114], [-9, -174]], mix(trunk, t.light, 0.18), 3);
      line(c, [[10, -66], [7, -133], [13, -170]], mix(trunk, INK, 0.3), 2);
      ellipse(c, 0, -146, 7, 15, null, mix(trunk, t.light, 0.17), 2);
      c.beginPath(); c.moveTo(-41, -269); c.bezierCurveTo(-22, -182, -55, -157, -31, -112);
      c.strokeStyle = '#739d74'; c.lineWidth = 2; c.stroke();
      for (var v = 0; v < 5; v++) ellipse(c, -34 - (v % 2) * 6, -242 + v * 23, 7, 3, '#83aa78', null, 0, -0.6);
    }
    var leaves = detailed ? ['#426f61', '#4c7f67', '#5d916d', '#73a475'] : [t.mid, mix(t.mid, t.far, 0.25)];
    for (var i = 0; i < 19; i++) {
      var a = i * 2.399, r = Math.sqrt(i / 19);
      var lx = Math.cos(a) * r * 131, ly = -310 + Math.sin(a) * r * 65;
      ellipse(c, lx, ly, 41 + rng() * 25, 26 + rng() * 13, leaves[i % leaves.length]);
      if (detailed && i % 3 === 0) {
        for (var j = 0; j < 4; j++) ellipse(c, lx - 16 + j * 10, ly - 15 + (j % 2) * 4, 8, 2.5, '#92b17a', null, 0, -0.25);
      }
    }
    c.restore();
  }
  function arch(c, x, y, w, h, fill, trim, broken) {
    var thickness = w * 0.19, radius = w / 2, inner = radius - thickness;
    c.beginPath();
    c.moveTo(x, y); c.lineTo(x, y - h + radius);
    c.arc(x + radius, y - h + radius, radius, Math.PI, TAU);
    c.lineTo(x + w, y); c.lineTo(x + w - thickness, y); c.lineTo(x + w - thickness, y - h + radius);
    c.arc(x + radius, y - h + radius, inner, 0, Math.PI, true);
    c.lineTo(x + thickness, y); c.closePath(); c.fillStyle = fill; c.fill();
    c.beginPath(); c.arc(x + radius, y - h + radius, radius - 3, Math.PI + 0.05, TAU - 0.05);
    c.strokeStyle = trim; c.lineWidth = 2; c.stroke();
    for (var i = 1; i < 7; i++) {
      var a = Math.PI + i * Math.PI / 7;
      line(c, [[x + radius + Math.cos(a) * inner, y - h + radius + Math.sin(a) * inner], [x + radius + Math.cos(a) * radius, y - h + radius + Math.sin(a) * radius]], trim, 1);
    }
    for (var yy = y - h + radius + 20; yy < y; yy += 28) {
      line(c, [[x, yy], [x + thickness, yy]], trim, 1);
      line(c, [[x + w - thickness, yy], [x + w, yy]], trim, 1);
    }
    if (broken) {
      poly(c, [[x + 4, y - h + radius + 10], [x + thickness, y - h + radius + 19], [x + 8, y - h + radius + 32]], trim);
      line(c, [[x + w - 9, y - 20], [x + w - 17, y - 43], [x + w - 12, y - 59]], trim, 2);
    }
  }
  function pinnacle(c, x, y, w, h, fill, light) {
    poly(c, [[x - w / 2, y], [x - w * 0.36, y - h * 0.54], [x + w * 0.08, y - h], [x + w * 0.34, y - h * 0.57], [x + w / 2, y]], fill);
    poly(c, [[x + w * 0.08, y - h], [x + w * 0.34, y - h * 0.57], [x + w / 2, y], [x + w * 0.04, y - h * 0.13]], light);
    poly(c, [[x + w * 0.08, y - h], [x - w * 0.36, y - h * 0.54], [x - w * 0.1, y - h * 0.62], [x + w * 0.02, y - h * 0.39]], mix(light, '#ffffff', 0.35));
    line(c, [[x + w * 0.12, y - h * 0.79], [x + w * 0.18, y - h * 0.31]], mix(light, '#ffffff', 0.35), 1.5);
  }
  function pine(c, x, y, size, fill, snow) {
    rect(c, x - size * 0.035, y - size * 0.85, size * 0.07, size * 0.85, fill);
    for (var i = 0; i < 4; i++) {
      var yy = y - size * (0.4 - i * 0.13), ww = size * (0.27 + i * 0.055);
      poly(c, [[x, yy - size * 0.6], [x + ww, yy], [x - ww, yy]], fill);
      if (snow) poly(c, [[x, yy - size * 0.6], [x + ww * 0.75, yy - size * 0.15], [x + ww * 0.23, yy - size * 0.24], [x, yy - size * 0.18], [x - ww * 0.7, yy - size * 0.15]], snow);
    }
  }
  function chimney(c, x, y, w, h, t, lit) {
    poly(c, [[x, y], [x + w * 0.14, y - h], [x + w * 0.85, y - h], [x + w, y]], t.near);
    rect(c, x + w * 0.1, y - h, w * 0.8, 10, mix(t.near, t.light, 0.23));
    for (var i = 1; i < 5; i++) {
      var yy = y - h + i * h / 5;
      rect(c, x + 2, yy, w - 4, 4, mix(t.near, t.mid, 0.5));
      if (lit && i > 2) round(c, x + w * 0.37, yy + 10, w * 0.25, 18, 3, '#e1a26d');
    }
  }
  function dome(c, x, y, w, h, t) {
    var r = w / 2;
    rect(c, x, y - h, w, h, t.near);
    c.beginPath(); c.arc(x + r, y - h, r, Math.PI, TAU); c.closePath(); c.fillStyle = t.mid; c.fill();
    c.beginPath(); c.ellipse(x + r, y - h, r * 0.43, r, 0, Math.PI, TAU);
    c.strokeStyle = mix(t.mid, t.light, 0.3); c.lineWidth = 3; c.stroke();
    rect(c, x - 7, y - h - 4, w + 14, 9, mix(t.mid, t.light, 0.3));
    for (var i = 0; i < 3; i++) {
      round(c, x + 14 + i * (w - 35) / 3, y - h + 20, 13, 28, 6, t.accent);
      rect(c, x + 19 + i * (w - 35) / 3, y - h + 20, 2, 28, t.near);
    }
    rect(c, x - 3, y - 13, w + 6, 7, mix(t.near, t.mid, 0.7));
  }

  function paintSky(c, t) {
    var g = c.createLinearGradient(0, 0, 0, BH);
    g.addColorStop(0, t.sky[0]); g.addColorStop(0.72, t.sky[1]); g.addColorStop(1, mix(t.sky[1], t.far, 0.35));
    rect(c, 0, 0, BW, BH, g);
    var rng = random(312 + t.index);
    if (t.index === 5) {
      for (var n = 0; n < 180; n++) {
        var sx = rng() * BW, sy = rng() * 440;
        c.globalAlpha = 0.35 + rng() * 0.65;
        if (n % 11 === 0) star(c, sx, sy, 2 + rng() * 2, '#fff1c8');
        else ellipse(c, sx, sy, 0.6 + rng(), 0.6 + rng(), '#dde7eb');
      }
      c.globalAlpha = 1;
      var nodes = [[130, 112], [194, 80], [234, 135], [301, 122], [347, 186]];
      line(c, nodes, '#707e9a', 1);
      nodes.forEach(function (p) { diamond(c, p[0], p[1], 4, 6, '#fff0bd'); });
      line(c, [[919, 66], [983, 113], [1073, 100], [1108, 159]], '#707e9a', 1);
      line(c, [[1380, 76], [1444, 100]], '#b8c3d0', 1);
      star(c, 1380, 76, 3, '#fff1cd');
    } else {
      for (var i = 0; i < 12; i++) {
        var x = i * BW / 12 + rng() * 60;
        var y = 95 + rng() * 170, w = 120 + rng() * 160;
        var fill = t.index === 4 ? mix(t.sky[0], '#a3afbe', 0.35) : mix(t.sky[1], '#ffffff', 0.45);
        c.globalAlpha = t.index === 3 ? 0.15 : 0.35;
        wrapped(c, x, function (cc) { cloud(cc, 0, y, w, fill); });
      }
      c.globalAlpha = 1;
    }
  }
  function paintCelestial(c, t) {
    if (t.index === 3) {
      ellipse(c, 96, 96, 49, 49, '#efac80');
      for (var b = 0; b < 4; b++) rect(c, 45, 79 + b * 12, 102, 3, '#cc8b79');
    } else if (t.index === 4 || t.index === 5) {
      ellipse(c, 96, 96, 47, 47, t.index === 5 ? '#f0e7b8' : '#d0d9ca');
      ellipse(c, 81, 80, 10, 7, '#d0d1b3');
      ellipse(c, 111, 116, 13, 10, '#d0d1b3');
      ellipse(c, 116, 77, 6, 6, '#d9d9b9');
      if (t.index === 4) cloud(c, 99, 124, 154, '#798897');
      else {
        c.beginPath(); c.ellipse(96, 96, 79, 19, -0.4, 0.05, Math.PI - 0.2);
        c.strokeStyle = '#bfc6b4'; c.lineWidth = 2; c.stroke();
        star(c, 153, 48, 4, '#fff0c9');
      }
    } else {
      ellipse(c, 96, 96, t.index === 2 ? 35 : 48, t.index === 2 ? 35 : 48, t.index === 2 ? '#f2fae9' : '#fff0b5');
      ellipse(c, 88, 88, t.index === 2 ? 29 : 39, t.index === 2 ? 29 : 39, t.index === 2 ? '#fcfff1' : '#fff6ce');
    }
  }
  function forest(c, t, layer) {
    if (layer === 0) {
      hill(c, 385, 39, t.far, 0.3);
      hill(c, 442, 32, mix(t.far, t.mid, 0.35), 2.7);
      for (var i = 0; i < 17; i++) wrapped(c, i * 119, function (cc) { tree(cc, 0, 465, 0.5, t, false, 71 + i); });
    } else if (layer === 1) {
      hill(c, 530, 29, t.mid, 0.9);
      for (var a = 0; a < 5; a++) arch(c, 590 + a * 103, 553, 104, 157, '#7d9681', '#a0ad8c', true);
      rect(c, 582, 389, 529, 13, '#a0ad8c');
      for (var m = 0; m < 12; m++) ellipse(c, 603 + m * 43, 390, 24, 5, '#749566');
      [70, 420, 1330, 1690].forEach(function (x, i) { wrapped(c, x, function (cc) { tree(cc, 0, 563, 1.06 + (i % 2) * 0.23, t, true, 103 + i); }); });
    } else {
      hill(c, 650, 23, t.near, 1.8);
      [145, 990, 1810].forEach(function (x, i) {
        wrapped(c, x, function (cc) {
          tree(cc, 0, 705, 1.55 + i * 0.07, { near: '#294c48', mid: t.mid, far: t.far, light: t.light }, true, 570 + i);
        });
      });
      for (var f = 0; f < 23; f++) {
        wrapped(c, f * BW / 23, function (cc) { fern(cc, 0, 683 + f % 3 * 9, 32 + f % 5 * 8, '#48715a'); });
      }
    }
  }
  function ruins(c, t, layer) {
    if (layer === 0) {
      hill(c, 420, 30, t.far, 0.3);
      for (var i = 0; i < 8; i++) {
        var x = i * 260;
        wrapped(c, x, function (cc) {
          poly(cc, [[-135, 479], [-72, 369], [-55, 311], [26, 311], [55, 368], [136, 479]], '#c4b394');
          poly(cc, [[-55, 311], [26, 311], [55, 368], [-73, 369]], '#d4c39f');
          line(cc, [[-54, 327], [27, 327]], '#e3d0a7', 2);
        });
      }
    } else if (layer === 1) {
      hill(c, 555, 34, '#b9a080', 0.4);
      for (var j = 0; j < 12; j++) {
        wrapped(c, j * BW / 12, function (cc) {
          arch(cc, 0, 570, 160, 242 + (j % 4 === 0 ? 35 : 0), '#a88e6f', '#ceba90', true);
          if (j % 4 !== 0) rect(cc, -2, 323, 164, 14, '#d0b991');
          rect(cc, 3, 304 + (j % 4 === 0 ? -30 : 0), 25, 20, '#b29b7b');
        });
      }
      [330, 960, 1500].forEach(function (x) {
        poly(c, [[x, 376], [x + 22, 380], [x + 22, 431], [x + 9, 424], [x, 434]], '#9e6459');
        diamond(c, x + 11, 398, 8, 12, '#d9b985');
      });
    } else {
      hill(c, 651, 27, t.near, 0.7);
      [130, 810, 1620].forEach(function (x, i) {
        var y = 660;
        poly(c, [[x, y], [x + 8, y - 192], [x + 15, y - 211], [x + 35, y - 201], [x + 50, y - 210], [x + 57, y]], '#7f7562');
        rect(c, x - 7, y - 181, 68, 13, '#a59574');
        rect(c, x - 9, y - 14, 77, 18, '#a59574');
        line(c, [[x + 17, y - 161], [x + 17, y - 32]], '#b2a17d', 3);
        line(c, [[x + 37, y - 153], [x + 37, y - 37]], '#625f53', 3);
        fern(c, x + 54, y + 4, 55 + i * 7, '#75806a');
      });
      for (var k = 0; k < 20; k++) {
        wrapped(c, k * BW / 20, function (cc) {
          poly(cc, [[0, 710], [10, 672], [40, 658], [64, 689], [69, 710]], '#8f8067');
        });
      }
    }
  }
  function glacier(c, t, layer) {
    if (layer === 0) {
      hill(c, 481, 23, '#c2ddde', 0.4);
      for (var i = 0; i < 12; i++) wrapped(c, i * BW / 12 + 40, function (cc) { pinnacle(cc, 0, 495, 240, 185 + i % 4 * 37, '#9cbfd1', '#d8eeec'); });
    } else if (layer === 1) {
      hill(c, 564, 29, '#91bfc9', 0.6);
      [130, 380, 810, 1230, 1530, 1810].forEach(function (x, i) {
        wrapped(c, x, function (cc) { pinnacle(cc, 0, 585, 170 + i % 3 * 30, 270 + i % 3 * 70, '#70a8bf', '#bce4e4'); });
      });
      arch(c, 920, 567, 146, 207, '#98c1cb', '#d6ede5');
      poly(c, [[909, 432], [996, 404], [1077, 430], [1069, 444], [992, 423], [922, 445]], '#e6f4e9');
      for (var p = 0; p < 14; p++) {
        wrapped(c, p * BW / 14 + 30, function (cc) { pine(cc, 0, 580, 77 + p % 3 * 18, '#6d9dac', '#cee9e5'); });
      }
    } else {
      hill(c, 667, 21, '#548b9d', 2.5);
      [60, 610, 1280, 1730].forEach(function (x, i) { wrapped(c, x, function (cc) { pine(cc, 0, 699, 195 + i % 2 * 34, '#477487', '#bddedb'); }); });
      for (var k = 0; k < 17; k++) {
        wrapped(c, k * BW / 17 + 31, function (cc) { crystal(cc, 0, 707, 20 + k % 3 * 8, 36 + k % 4 * 15, '#75afbe', '#bbdedb'); });
      }
    }
  }
  function industry(c, t, layer) {
    if (layer === 0) {
      hill(c, 451, 34, t.far, 1.2);
      for (var i = 0; i < 14; i++) {
        wrapped(c, i * BW / 14, function (cc) {
          rect(cc, 0, 367 + i % 3 * 24, 96, 190, '#9a6970');
          poly(cc, [[-6, 368 + i % 3 * 24], [35, 338 + i % 3 * 24], [102, 368 + i % 3 * 24]], '#9a6970');
          chimney(cc, 60, 401, 28, 130 + i % 4 * 20, { near: '#a36c71', mid: t.mid, light: t.light }, false);
          cloud(cc, 82, 213 - i % 3 * 17, 112, '#95666e');
        });
      }
    } else if (layer === 1) {
      hill(c, 596, 12, t.mid, 0.5);
      [110, 670, 1270, 1770].forEach(function (x, i) {
        wrapped(c, x, function (cc) {
          round(cc, -86, 388, 193, 205, 9, t.near);
          poly(cc, [[-103, 391], [-58, 337], [72, 337], [122, 391]], '#6a4a56');
          chimney(cc, -60, 357, 47, 175 + i % 2 * 47, t, true);
          chimney(cc, 44, 354, 31, 108, t, true);
          for (var j = 0; j < 3; j++) {
            round(cc, -61 + j * 55, 436, 36, 100, 16, '#c48064', '#352f40', 4);
            round(cc, -55 + j * 55, 452, 24, 72, 12, '#f5c27e');
            for (var b = 0; b < 4; b++) rect(cc, -63 + j * 55, 465 + b * 18, 40, 5, t.near);
          }
          rect(cc, -96, 403, 214, 9, '#a97863');
          for (var r = 0; r < 8; r++) ellipse(cc, -80 + r * 26, 407, 2, 2, '#d2ac7f');
        });
      });
      line(c, [[0, 537], [BW, 537]], '#564551', 16);
      line(c, [[0, 534], [BW, 534]], '#977566', 3);
    } else {
      hill(c, 671, 12, '#453d48', 0.8);
      for (var j = 0; j < 8; j++) {
        wrapped(c, j * BW / 8, function (cc) {
          rect(cc, 0, 550, 12, 170, '#443d49');
          line(cc, [[0, 560], [95, 647], [0, 647], [95, 560]], '#574550', 7);
          rect(cc, -8, 542, 117, 10, '#72565d');
        });
      }
      [410, 1120, 1700].forEach(function (x, i) {
        gear(c, x, 683, 78 + i * 8, 14, '#60515b', '#3c3645', i * 0.3);
        ellipse(c, x, 683, 45 + i * 5, 45 + i * 5, '#3d3845', '#9d7968', 3);
        line(c, [[x - 41, 683], [x + 41, 683]], '#756064', 9);
        line(c, [[x, 642], [x, 720]], '#756064', 9);
      });
    }
  }
  function observatory(c, t, layer) {
    if (layer === 0) {
      hill(c, 414, 54, t.far, 0.8);
      hill(c, 488, 48, mix(t.far, t.mid, 0.5), 2.1);
      for (var i = 0; i < 9; i++) {
        wrapped(c, 130 + i * BW / 9, function (cc) {
          line(cc, [[0, 469], [22, 259 + i % 3 * 23], [45, 469]], '#748699', 3);
          line(cc, [[7, 407], [35, 345], [12, 345], [40, 407]], '#748699', 2);
          ellipse(cc, 22, 260 + i % 3 * 23, 3, 3, '#ead8a1');
        });
      }
    } else if (layer === 1) {
      hill(c, 578, 27, t.mid, 0.4);
      [190, 840, 1510].forEach(function (x, i) {
        wrapped(c, x, function (cc) {
          dome(cc, -72, 563, 147, 132 + i % 2 * 25, t);
          dome(cc, 84, 578, 72, 98, t);
          rect(cc, -36, 284 - i % 2 * 25, 69, 69, t.near);
          cc.save(); cc.translate(-2, 292 - i % 2 * 25); cc.rotate(-0.42);
          round(cc, -14, -12, 95, 25, 3, '#80989d', '#344553', 2);
          rect(cc, 63, -16, 18, 33, '#acb9b1');
          rect(cc, 79, -12, 5, 25, '#d4d6b5'); cc.restore();
          line(cc, [[-95, 562], [-95, 324], [-78, 306]], '#415768', 3);
          ellipse(cc, -78, 306, 4, 4, '#f6d89e');
          for (var s = 0; s < 5; s++) rect(cc, -87 - s * 7, 563 + s * 7, 185 + s * 14, 7, s % 2 ? '#6f8490' : '#516878');
        });
      });
      c.beginPath(); c.moveTo(0, 448); c.bezierCurveTo(350, 525, 420, 526, 700, 439); c.bezierCurveTo(1100, 539, 1440, 514, 1710, 438); c.quadraticCurveTo(1820, 470, BW, 448);
      c.strokeStyle = '#46596d'; c.lineWidth = 2; c.stroke();
    } else {
      hill(c, 660, 26, t.near, 0.1);
      for (var p = 0; p < 24; p++) {
        wrapped(c, p * BW / 24, function (cc) {
          rect(cc, 0, 611, 4, 103, '#344957');
          diamond(cc, 2, 607, 9, 15, '#668488');
        });
      }
      line(c, [[0, 628], [BW, 628]], '#59717b', 3);
      line(c, [[0, 676], [BW, 676]], '#243d4c', 3);
      [75, 750, 1430].forEach(function (x) {
        rect(c, x, 398, 8, 292, '#304959');
        line(c, [[x - 19, 413], [x + 27, 413]], '#799092', 3);
        line(c, [[x + 4, 399], [x + 4, 371]], '#ced2ac', 2);
        ellipse(c, x + 4, 417, 16, 5, null, '#bdc1a2', 2);
        ellipse(c, x + 4, 448, 21, 6, null, '#718c8f', 2);
      });
    }
  }
  function celestial(c, t, layer) {
    if (layer === 0) {
      hill(c, 477, 32, t.far, 0.4);
      for (var i = 0; i < 9; i++) {
        wrapped(c, i * BW / 9 + 50, function (cc) {
          var y = 332 + i % 3 * 48;
          poly(cc, [[-69, y], [56, y], [31, y + 41], [9, y + 83], [-18, y + 40], [-45, y + 23]], '#697797');
          rect(cc, -69, y - 4, 125, 6, '#9dacba');
          if (i % 2 === 0) arch(cc, -27, y, 47, 95, '#8895ac', '#abb9bf', true);
        });
      }
    } else if (layer === 1) {
      hill(c, 590, 26, t.mid, 2.1);
      [270, 970, 1670].forEach(function (x, i) {
        wrapped(c, x, function (cc) {
          for (var j = 0; j < 4; j++) {
            var px = -128 + j * 81, h = j === 2 ? 102 : 219 + (j % 2) * 34;
            rect(cc, px, 571 - h, 30, h, '#8798aa');
            rect(cc, px - 8, 567 - h, 46, 10, '#bdc8c4');
            rect(cc, px - 7, 557, 44, 15, '#adbbb8');
            line(cc, [[px + 8, 578 - h], [px + 8, 550]], '#bacac5', 2);
            line(cc, [[px + 23, 578 - h], [px + 23, 550]], '#5d748d', 2);
          }
          arch(cc, -72, 572, 146, 280, '#7d8fa3', '#bbc5bb', true);
          poly(cc, [[-167, 575], [163, 575], [131, 594], [-129, 594]], '#a8b6b6');
          for (var step = 0; step < 3; step++) rect(cc, -156 - step * 13, 594 + step * 9, 312 + step * 26, 8, '#71849b');
          ellipse(cc, 0, 313, 42, 42, null, '#d7c893', 2);
          ellipse(cc, 0, 313, 29, 29, null, '#a9bab7', 1);
          diamond(cc, 0, 313, 16, 29, '#ecd8a0');
          for (var s = 0; s < 8; s++) {
            var a = s * TAU / 8 + i * 0.2;
            diamond(cc, Math.cos(a) * 42, 313 + Math.sin(a) * 42, 4, 7, '#f2e5b6');
          }
        });
      });
    } else {
      hill(c, 673, 28, t.near, 0.3);
      [50, 670, 1330, 1830].forEach(function (x, i) {
        wrapped(c, x, function (cc) {
          poly(cc, [[-39, 710], [-31, 525], [-7, 495], [28, 511], [40, 710]], '#4f6680');
          poly(cc, [[-31, 525], [-7, 495], [-3, 698], [-39, 710]], '#8199a7');
          line(cc, [[7, 536], [19, 552], [7, 565], [19, 578], [7, 592]], '#c4c49c', 2);
          crystal(cc, -47, 706, 24, 61 + i * 7, '#7e9dac', '#bed8d0');
        });
      });
      for (var f = 0; f < 19; f++) {
        wrapped(c, f * BW / 19, function (cc) { fern(cc, 0, 715, 36 + f % 3 * 12, '#688d95'); });
      }
    }
  }
  var LANDSCAPES = [forest, ruins, glacier, industry, observatory, celestial];

  function paintWeather(c, t) {
    var rng = random(872 + t.index), count = t.index === 4 ? 160 : 70;
    for (var i = 0; i < count; i++) {
      var x = rng() * BW, y = rng() * BH;
      c.globalAlpha = 0.2 + rng() * 0.4;
      if (t.weather === 'rain') line(c, [[x, y], [x - 6, y + 16]], '#d2e4de', 0.8);
      else if (t.weather === 'snow') ellipse(c, x, y, 1 + rng() * 1.8, 1 + rng() * 1.8, '#f6fff4');
      else if (t.weather === 'embers') {
        line(c, [[x, y], [x - 1, y + 4]], '#ffcc85', 1.3);
        ellipse(c, x, y, 1, 1, '#fff0b5');
      } else if (t.weather === 'leaves') {
        c.save(); c.translate(x, y); c.rotate(rng() * TAU);
        ellipse(c, 0, 0, 4, 1.6, i % 3 ? '#d4d791' : '#ecb881'); c.restore();
      } else if (t.weather === 'stars') star(c, x, y, 1 + rng() * 1.5, '#e7eccd');
      else ellipse(c, x, y, 1.2, 0.8, '#f7e2b3');
    }
    c.globalAlpha = 1;
  }

  function background(scene, world) {
    var t = theme(world);
    var signature = hash(JSON.stringify([t.index, t.sky, t.accent, t.ground, t.top, t.decor]));
    var prefix = 'ember-bg-' + t.index + '-' + signature + '-';
    make(scene, prefix + 'sky', BW, BH, function (c) { paintSky(c, t); });
    make(scene, prefix + 'sun', 192, 192, function (c) { paintCelestial(c, t); });
    for (var i = 0; i < 3; i++) {
      (function (layer) {
        make(scene, prefix + layer, BW, BH, function (c) { LANDSCAPES[t.index](c, t, layer); });
      }(i));
    }
    make(scene, prefix + 'weather', BW, BH, function (c) { paintWeather(c, t); });
    var objects = [], layers = [], dead = false;
    var width = 0, height = 0, scale = 1, left = 0, top = 0;
    var fall = [11, 3, 18, -23, 190, -2][t.index];
    var drift = t.weather === 'rain' ? -58 : t.weather === 'dust' ? 15 : 7;
    var sky = scene.add.image(0, 0, prefix + 'sky').setOrigin(0).setScrollFactor(0).setDepth(-100);
    var sun = scene.add.image(0, 0, prefix + 'sun').setScrollFactor(0).setDepth(-95);
    objects.push(sky, sun);
    [0.07, 0.19, 0.36].forEach(function (speed, layer) {
      var sprite = scene.add.tileSprite(0, 0, BW, BH, prefix + layer).setOrigin(0).setScrollFactor(0).setDepth([-90, -70, -45][layer]);
      layers.push({ sprite: sprite, speed: speed }); objects.push(sprite);
    });
    var weather = scene.add.tileSprite(0, 0, BW, BH, prefix + 'weather').setOrigin(0).setScrollFactor(0).setDepth(-25);
    objects.push(weather);
    function resize() {
      var camera = scene.cameras && scene.cameras.main;
      var zoom = camera ? finite(camera.zoom, 1) : 1;
      zoom = zoom > 0 ? zoom : 1;
      var cw = camera ? finite(camera.width, 960) : 960;
      var ch = camera ? finite(camera.height, 540) : 540;
      var w = Math.max(1, cw / zoom), h = Math.max(1, ch / zoom);
      var x = (cw - w) * (camera ? finite(camera.originX, 0.5) : 0.5);
      var y = (ch - h) * (camera ? finite(camera.originY, 0.5) : 0.5);
      if (w === width && h === height && x === left && y === top) return;
      width = w; height = h; left = x; top = y; scale = height / BH;
      sky.setPosition(left, top).setDisplaySize(width, height);
      sun.setPosition(left + width * (t.index === 5 ? 0.73 : 0.69), top + height * 0.23).setScale(scale);
      layers.forEach(function (layer) {
        layer.sprite.setPosition(left, top).setSize(width / scale, BH).setScale(scale);
      });
      weather.setPosition(left, top).setSize(width / scale, BH).setScale(scale);
    }
    function update(scrollX, time) {
      if (dead) return;
      resize();
      scrollX = finite(scrollX, 0); time = finite(time, 0) * 0.001;
      layers.forEach(function (layer) { layer.sprite.tilePositionX = (scrollX * layer.speed / scale) % BW; });
      weather.tilePositionX = (scrollX * 0.47 / scale - time * drift) % BW;
      weather.tilePositionY = (-time * fall) % BH;
      weather.setAlpha(t.weather === 'stars' ? 0.64 + Math.sin(time * 0.7) * 0.15 : 0.78);
    }
    function destroy() {
      if (dead) return;
      dead = true;
      if (scene.events) scene.events.off('shutdown', destroy);
      objects.forEach(function (object) { if (object.scene) object.destroy(); });
      objects.length = 0; layers.length = 0;
      // TextureManager owns cached canvases; a scene restart can reuse them.
    }
    if (scene.events) scene.events.once('shutdown', destroy);
    update(0, 0);
    return { update: update, destroy: destroy };
  }

  function decorate(scene, level, world) {
    var t = theme(world);
    var container = scene.add.container(0, 0).setDepth(-2);
    var platforms = level && Array.isArray(level.platforms) ? level.platforms : [];
    decorationTextures(scene);
    platforms.forEach(function (platform) {
      if (!platform || platform.type !== 'ground') return;
      var x = finite(platform.x, NaN), y = finite(platform.y, NaN);
      var width = finite(platform.w, finite(platform.width, 0));
      if (!isFinite(x) || !isFinite(y) || width < 48) return;
      var rng = random(hash([t.index, x, y, width].join(':')));
      var count = Math.min(20, Math.max(1, Math.floor(width / 125)));
      for (var i = 0; i < count; i++) {
        if (rng() < 0.2) continue;
        var px = x + 24 + (width - 48) * (i + 0.2 + rng() * 0.6) / count;
        var roll = rng();
        var kind = roll < 0.43 ? 'plant' : roll < 0.66 ? 'flower' : roll < 0.92 ? 'rock' : 'lamp';
        if (kind === 'lamp' && width < 190) kind = 'flower';
        var image = scene.add.image(px, y + 1, 'ember-decor-' + t.index + '-' + kind).setOrigin(0.5, 1);
        image.setScale(kind === 'lamp' ? 0.88 : 0.7 + rng() * 0.3);
        image.setFlipX(rng() > 0.5);
        container.add(image);
        if (kind === 'plant' && rng() > 0.65 && width > 96) {
          var flower = scene.add.image(clamp(px + 23, x + 18, x + width - 18), y + 1, 'ember-decor-' + t.index + '-flower').setOrigin(0.5, 1).setScale(0.66);
          container.add(flower);
        }
      }
    });
    return container;
  }

  root.EmberArt = { install: install, background: background, decorate: decorate };
}(window));
