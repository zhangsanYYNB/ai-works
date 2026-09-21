(function () {
  'use strict';

  // Classic-script data only; no imports, assets, timers, or random generation.
  // index, world, world.id, and stage are zero-based; par is seconds.
  // Coordinates are top-left, including boss. Exceptions: enemies use center x,
  // feet y; pickups use center x/y; checkpoints, springs, and exit use center x,
  // surface y. Enemy patrol min/max are center-x bounds; boss bounds are left-x.
  // Motion range is amplitude in pixels, period is milliseconds, phase is radians.
  // Each build returns fresh geometry. No switch or route requires two players.

  const worlds = [
    {
      id: 0, name: '苔光森林', subtitle: '循着微光，穿过苏醒的林海',
      sky: ['#143b43', '#83bfa9'], accent: '#b3ed78',
      ground: '#304e40', top: '#89bd65', decor: '#d0e7b0', weather: 'leaves'
    },
    {
      id: 1, name: '回声遗迹', subtitle: '古老石阶仍在回应脚步',
      sky: ['#41394b', '#be8f89'], accent: '#f4cf78',
      ground: '#514d59', top: '#b3a79b', decor: '#e5bd94', weather: 'dust'
    },
    {
      id: 2, name: '霜镜雪原', subtitle: '越过冰河，守住掌心的温度',
      sky: ['#214960', '#b5dfe5'], accent: '#92eff1',
      ground: '#526d8c', top: '#e8f8fb', decor: '#c0d4ee', weather: 'snow'
    },
    {
      id: 3, name: '赤焰熔炉', subtitle: '让星火穿过钢铁与熔光',
      sky: ['#422c3b', '#bb6457'], accent: '#ffc467',
      ground: '#48434b', top: '#d58d66', decor: '#f2a96f', weather: 'embers'
    },
    {
      id: 4, name: '风暴群岛', subtitle: '在雷鸣的间隙寻找落脚处',
      sky: ['#293e50', '#839da9'], accent: '#e7e97d',
      ground: '#3d575c', top: '#8ac5bd', decor: '#b8cbd2', weather: 'rain'
    },
    {
      id: 5, name: '星穹圣域', subtitle: '并肩抵达群星的回响之处',
      sky: ['#25243e', '#786d99'], accent: '#ffd78c',
      ground: '#514c68', top: '#c2b7e2', decor: '#f2d8c0', weather: 'stars'
    }
  ];

  function route(name, par, chunks, relics) {
    return { name: name, par: par, chunks: chunks, relics: relics };
  }

  // Explicit authored orders, with three chosen chunk sockets per ordinary level.
  // Boss routes use both approach sockets and one arena socket instead.
  const routes = [
    [
      route('初见星火', 65, ['trail', 'steps', 'bridge'], [0, 1, 2]),
      route('树梢来信', 95, ['trail', 'steps', 'bridge', 'trail', 'spring'], [1, 3, 4]),
      route('林间铜钥', 110, ['steps', 'bridge', 'vault', 'trail', 'terraces'], [0, 2, 4]),
      route('断桥花径', 115, ['bridge', 'ruins', 'steps', 'crumble', 'spring'], [1, 3, 4]),
      route('荆棘轻舞', 130, ['steps', 'spikes', 'bridge', 'lift', 'trail', 'terraces'], [1, 3, 5]),
      route('旧树钟摆', 140, ['spring', 'crumble', 'vault', 'steps', 'saws', 'bridge'], [0, 2, 4]),
      route('林冠长路', 150, ['ruins', 'bridge', 'spikes', 'lift', 'crumble', 'terraces'], [0, 3, 5]),
      route('荆冠之约', 120, ['steps', 'bridge'], [0, 1])
    ],
    [
      route('石门回声', 105, ['steps', 'ruins', 'bridge', 'terraces', 'breakaway'], [0, 1, 4]),
      route('悬梯书廊', 115, ['ruins', 'lift', 'steps', 'breakaway', 'bridge'], [0, 1, 3]),
      route('失落铜印', 125, ['bridge', 'vault', 'ruins', 'crumble', 'terraces'], [1, 2, 4]),
      route('碎石低语', 130, ['terraces', 'breakaway', 'lift', 'spikes', 'ruins'], [0, 2, 4]),
      route('回廊摆刃', 145, ['ruins', 'vault', 'saws', 'bridge', 'lift', 'breakaway'], [1, 2, 5]),
      route('封存之光', 150, ['crumble', 'terraces', 'laser', 'ruins', 'vault', 'bridge'], [0, 2, 4]),
      route('高塔余音', 160, ['lift', 'breakaway', 'vault', 'saws', 'terraces', 'ruins'], [0, 2, 5]),
      route('巨像苏醒', 130, ['ruins', 'crumble'], [0, 1])
    ],
    [
      route('第一片雪', 110, ['trail', 'ice', 'steps', 'bridge', 'spring'], [0, 1, 4]),
      route('冰河足迹', 120, ['ice', 'bridge', 'lift', 'ice', 'terraces'], [0, 2, 4]),
      route('雪藏星钥', 130, ['steps', 'ice', 'vault', 'spring', 'ruins'], [1, 2, 4]),
      route('薄冰回廊', 135, ['crumble', 'ice', 'terraces', 'lift', 'bridge'], [0, 2, 3]),
      route('霜刃回旋', 150, ['ice', 'saws', 'bridge', 'spring', 'crumble', 'terraces'], [1, 3, 5]),
      route('极夜灯塔', 160, ['ruins', 'laser', 'ice', 'vault', 'lift', 'breakaway'], [0, 3, 4]),
      route('雪线之上', 165, ['spring', 'ice', 'crumble', 'saws', 'vault', 'terraces'], [0, 2, 4]),
      route('霜晶王座', 140, ['ice', 'spring'], [0, 1])
    ],
    [
      route('炉前余温', 120, ['trail', 'breakaway', 'spikes', 'lift', 'bridge'], [1, 2, 3]),
      route('铸星流水线', 125, ['lift', 'laser', 'breakaway', 'steps', 'saws'], [0, 1, 4]),
      route('赤铜通行证', 135, ['spikes', 'vault', 'lift', 'breakaway', 'ruins'], [1, 2, 4]),
      route('熔光栈道', 140, ['bridge', 'crumble', 'laser', 'spring', 'breakaway'], [0, 2, 3]),
      route('齿轮协奏', 155, ['saws', 'lift', 'breakaway', 'vault', 'spikes', 'terraces'], [0, 3, 5]),
      route('深炉之心', 165, ['laser', 'ruins', 'spikes', 'crumble', 'vault', 'lift'], [1, 3, 4]),
      route('终班铸火', 175, ['breakaway', 'saws', 'vault', 'laser', 'spring', 'terraces'], [0, 2, 5]),
      route('熔心机甲', 150, ['breakaway', 'spikes'], [0, 1])
    ],
    [
      route('风起浮岛', 125, ['bridge', 'spring', 'lift', 'terraces', 'steps'], [0, 1, 3]),
      route('雨幕阶梯', 130, ['terraces', 'bridge', 'crumble', 'lift', 'ruins'], [0, 2, 4]),
      route('雷纹密钥', 140, ['lift', 'vault', 'bridge', 'laser', 'spring'], [0, 1, 4]),
      route('逐电而行', 145, ['spring', 'laser', 'terraces', 'saws', 'bridge'], [0, 1, 3]),
      route('风暴眼外', 165, ['crumble', 'lift', 'vault', 'bridge', 'saws', 'ruins'], [1, 2, 5]),
      route('云海断弦', 170, ['bridge', 'spring', 'laser', 'crumble', 'terraces', 'vault'], [0, 3, 5]),
      route('雷霆天路', 180, ['lift', 'saws', 'ruins', 'vault', 'laser', 'terraces'], [0, 2, 4]),
      route('雷鸣之巅', 160, ['lift', 'bridge'], [0, 1])
    ],
    [
      route('群星门廊', 130, ['terraces', 'ruins', 'spring', 'bridge', 'lift'], [0, 1, 4]),
      route('月影浮阶', 140, ['ice', 'terraces', 'lift', 'crumble', 'laser'], [0, 2, 4]),
      route('天穹星钥', 150, ['ruins', 'vault', 'laser', 'spring', 'terraces'], [0, 1, 4]),
      route('碎星织路', 155, ['breakaway', 'bridge', 'saws', 'ruins', 'crumble'], [0, 2, 3]),
      route('星环回响', 175, ['laser', 'lift', 'vault', 'ice', 'saws', 'terraces'], [0, 2, 5]),
      route('长夜尽头', 180, ['spring', 'crumble', 'ruins', 'vault', 'breakaway', 'laser'], [0, 2, 4]),
      route('双行至此', 190, ['terraces', 'vault', 'saws', 'lift', 'laser', 'ruins'], [1, 3, 5]),
      route('星火永续', 180, ['laser', 'steps'], [0, 1])
    ]
  ];

  const levels = [];
  routes.forEach(function (worldRoutes, world) {
    worldRoutes.forEach(function (layout, stage) {
      levels.push({
        index: levels.length,
        world: world,
        stage: stage,
        name: layout.name,
        par: layout.par,
        boss: stage === 7
      });
    });
  });

  const FLOOR = 560;
  const HEIGHT = 720;
  const START = 340;
  const FINISH = 340;
  const ARENA = 1800;
  const bossNames = ['荆冠守卫', '遗迹巨像', '霜晶领主', '熔心机甲', '雷鸣巨灵', '星蚀双生'];

  function platform(data, x, y, w, h, type, motion) {
    const settings = motion || {};
    data.platforms.push({
      x: x, y: y, w: w, h: h, type: type || 'stone',
      axis: settings.axis || 'x',
      range: settings.range || 0,
      period: settings.period || 3200,
      phase: settings.phase || 0
    });
  }

  function floor(data, x, width, type) {
    if (width > 0) platform(data, x, FLOOR, width, HEIGHT - FLOOR, type || 'ground');
  }

  function pickup(data, x, y, type, id) {
    const item = { x: x, y: y, type: type };
    if (type === 'key') item.id = id;
    data.pickups.push(item);
  }

  function hazard(data, x, y, w, h, type, motion) {
    const settings = motion || {};
    data.hazards.push({
      x: x, y: y, w: w, h: h, type: type,
      axis: settings.axis || 'x',
      range: settings.range || 0,
      period: settings.period || 2600,
      phase: settings.phase || 0
    });
  }

  // Coin trails describe jumps between actual landing surfaces, not random scatter.
  function arc(data, x1, y1, x2, y2, rise, count) {
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      pickup(data, Math.round(x1 + (x2 - x1) * t),
        Math.round(y1 + (y2 - y1) * t - Math.sin(Math.PI * t) * rise), 'coin');
    }
  }

  function checkpoint(data, x, healing) {
    data.checkpoints.push({ x: x, y: FLOOR });
    if (healing) pickup(data, x, FLOOR - 32, 'heart');
  }

  // Each motif starts/ends on stable floor, reserves its last 120px for recovery,
  // and supplies one optional relic socket. Rises are at most 150px; ordinary
  // gaps are at most 120px. Elevator landings remain reachable through the cycle.
  function context(data, meta, x, ordinal) {
    const difficulty = meta.world + Math.floor((meta.stage + 1) / 2);
    return {
      difficulty: difficulty,
      floor: function (left, width, type) { floor(data, x + left, width, type); },
      ledge: function (left, y, width, type, motion, height) {
        platform(data, x + left, y, width, height || 20, type || 'stone', motion);
      },
      arc: function (x1, y1, x2, y2, rise, count) {
        arc(data, x + x1, y1, x + x2, y2, rise, count || 5);
      },
      enemy: function (type, center, feet, min, max, threshold) {
        if (difficulty >= threshold) {
          data.enemies.push({ x: x + center, y: feet, type: type, min: x + min, max: x + max });
        }
      },
      hazard: function (left, y, width, height, type, motion) {
        hazard(data, x + left, y, width, height, type, motion);
      },
      spring: function (center, surface) { data.springs.push({ x: x + center, y: surface }); },
      vault: function () {
        const id = 'key-' + (meta.index + 1) + '-' + ordinal;
        pickup(data, x + 365, 338, 'key', id);
        data.gates.push({ x: x + 610, y: -160, w: 28, h: 720, id: id });
      },
      socket: function (center, y) { return { x: x + center, y: y }; },
      period: 3600 - meta.world * 120
    };
  }

  // Fourteen fixed motifs. Difficulty changes enemy presence, not jump distances.
  const chunks = {
    trail: {
      width: 620,
      place: function (c) {
        c.floor(0, 620);
        c.ledge(185, 490, 115);
        c.ledge(345, 415, 120, 'oneway');
        c.arc(95, 528, 240, 458, 30);
        c.arc(250, 458, 400, 383, 25);
        c.arc(445, 383, 525, 528, 20, 4);
        c.enemy('walker', 235, 490, 207, 275, 1);
        return c.socket(405, 383);
      }
    },
    steps: {
      width: 620,
      place: function (c) {
        c.floor(0, 180);
        c.ledge(250, 490, 110, 'stone', null, 230);
        c.floor(430, 190);
        c.ledge(380, 390, 100, 'oneway');
        c.arc(140, 528, 295, 458, 28);
        c.arc(325, 458, 470, 528, 35);
        c.arc(320, 458, 430, 358, 16, 4);
        c.enemy('walker', 305, 490, 272, 338, 2);
        return c.socket(430, 358);
      }
    },
    bridge: {
      width: 680,
      place: function (c) {
        c.floor(0, 170);
        c.ledge(230, 535, 90);
        c.ledge(375, 510, 90);
        c.floor(510, 170);
        c.ledge(300, 410, 110, 'oneway');
        c.arc(135, 528, 275, 503, 40);
        c.arc(285, 503, 420, 478, 38);
        c.arc(440, 478, 550, 528, 30, 4);
        c.enemy('flyer', 275, 535, 250, 300, 2);
        return c.socket(355, 378);
      }
    },
    ruins: {
      width: 720,
      place: function (c) {
        c.floor(0, 720);
        c.ledge(170, 470, 110);
        c.ledge(330, 365, 120);
        c.ledge(475, 265, 100, 'oneway');
        c.arc(120, 528, 225, 438, 20);
        c.arc(240, 438, 390, 333, 18);
        c.arc(405, 333, 525, 233, 16, 4);
        c.enemy('walker', 230, 470, 192, 258, 2);
        c.enemy('turret', 380, 365, 380, 380, 5);
        return c.socket(525, 233);
      }
    },
    lift: {
      width: 740,
      place: function (c) {
        c.floor(0, 210);
        c.ledge(260, 470, 120, 'moving', { axis: 'y', range: 60, period: c.period, phase: 0 });
        c.ledge(420, 530, 80);
        c.floor(530, 210);
        c.ledge(435, 365, 120, 'oneway');
        c.arc(165, 528, 315, 448, 20);
        c.arc(350, 468, 460, 498, 28, 4);
        c.arc(345, 408, 490, 333, 22, 4);
        return c.socket(490, 333);
      }
    },
    spring: {
      width: 700,
      place: function (c) {
        c.floor(0, 190);
        c.floor(310, 160);
        c.floor(580, 120);
        c.spring(145, FLOOR);
        c.ledge(265, 420, 115);
        c.ledge(420, 300, 110, 'oneway');
        c.arc(160, 498, 320, 388, 20);
        c.arc(345, 388, 475, 268, 15, 4);
        c.arc(435, 528, 615, 528, 78);
        c.enemy('walker', 385, FLOOR, 343, 433, 4);
        return c.socket(475, 268);
      }
    },
    spikes: {
      width: 660,
      place: function (c) {
        c.floor(0, 660);
        c.hazard(245, 542, 80, 18, 'spike');
        c.hazard(405, 542, 70, 18, 'spike');
        c.ledge(190, 450, 150, 'oneway');
        c.ledge(360, 365, 115, 'oneway');
        c.arc(170, 528, 365, 528, 92, 6);
        c.arc(360, 528, 515, 528, 80);
        c.arc(285, 418, 415, 333, 18, 4);
        return c.socket(415, 333);
      }
    },
    crumble: {
      width: 720,
      place: function (c) {
        c.floor(0, 180);
        c.ledge(235, 535, 110, 'crumble');
        c.ledge(410, 515, 100, 'crumble');
        c.floor(550, 170);
        // A lower stable catch keeps collapsed slabs from stranding a respawn.
        c.ledge(245, 605, 200, 'oneway');
        c.ledge(290, 455, 120, 'oneway');
        c.arc(140, 528, 285, 503, 35);
        c.arc(320, 503, 455, 483, 35);
        c.arc(480, 483, 590, 528, 30, 4);
        return c.socket(345, 423);
      }
    },
    ice: {
      width: 700,
      place: function (c) {
        c.floor(0, 160);
        c.floor(160, 380, 'ice');
        c.floor(540, 160);
        c.ledge(205, 455, 125, 'oneway');
        c.ledge(395, 360, 115, 'oneway');
        if (c.difficulty >= 3) {
          c.hazard(270, 542, 60, 18, 'spike');
          c.hazard(425, 542, 55, 18, 'spike');
        }
        c.arc(155, 528, 265, 423, 18);
        c.arc(295, 423, 450, 328, 20);
        c.arc(465, 328, 565, 528, 16, 4);
        c.enemy('flyer', 260, 455, 227, 308, 4);
        return c.socket(450, 328);
      }
    },
    saws: {
      width: 720,
      place: function (c) {
        c.floor(0, 720);
        c.ledge(190, 440, 150, 'oneway');
        c.ledge(390, 340, 120, 'oneway');
        c.ledge(535, 455, 95);
        c.hazard(290, 494, 36, 36, 'saw', { axis: 'y', range: 46, period: 3000, phase: 0 });
        c.hazard(470, 470, 32, 32, 'saw', { axis: 'x', range: 32, period: 2600, phase: Math.PI });
        c.arc(145, 528, 265, 408, 16);
        c.arc(300, 408, 445, 308, 20);
        c.arc(480, 308, 575, 423, 18, 4);
        return c.socket(450, 308);
      }
    },
    vault: {
      width: 800,
      place: function (c) {
        c.floor(0, 800);
        c.ledge(185, 465, 110);
        c.ledge(330, 370, 140, 'oneway');
        c.ledge(475, 465, 95);
        // The key is reachable before the gate; no checkpoint lies between them.
        // Its top is out of double-jump reach even from the elevated key ledge.
        c.vault();
        c.arc(140, 528, 240, 433, 18);
        c.arc(260, 433, 370, 338, 16);
        c.arc(445, 338, 525, 433, 18, 4);
        c.arc(540, 433, 685, 528, 20);
        return c.socket(435, 338);
      }
    },
    breakaway: {
      width: 720,
      place: function (c) {
        c.floor(0, 720);
        c.hazard(290, 542, 115, 18, 'spike');
        c.ledge(160, 465, 100);
        c.ledge(310, 455, 130, 'breakable');
        c.ledge(350, 350, 120, 'oneway');
        c.ledge(505, 465, 95);
        c.arc(120, 528, 210, 433, 18);
        c.arc(235, 433, 365, 423, 35);
        c.arc(415, 423, 545, 433, 35);
        c.enemy('turret', 205, 465, 205, 205, 5);
        return c.socket(410, 318);
      }
    },
    laser: {
      width: 760,
      place: function (c) {
        c.floor(0, 760);
        c.ledge(200, 445, 110);
        c.ledge(330, 340, 115, 'oneway');
        c.ledge(490, 440, 120);
        // The beam can always be crossed above; progress never depends on timing.
        c.hazard(350, 420, 18, 140, 'laser', { period: 2800, phase: 0 });
        c.arc(150, 528, 255, 413, 15);
        c.arc(275, 413, 385, 308, 15);
        c.arc(420, 308, 540, 408, 20);
        c.enemy('turret', 545, 440, 545, 545, 6);
        return c.socket(385, 308);
      }
    },
    terraces: {
      width: 740,
      place: function (c) {
        c.floor(0, 740);
        c.ledge(155, 465, 110);
        c.ledge(295, 370, 115, 'oneway');
        c.ledge(455, 455, 125);
        c.ledge(400, 270, 110, 'oneway');
        c.arc(110, 528, 210, 433, 20);
        c.arc(240, 433, 355, 338, 18);
        c.arc(390, 338, 515, 423, 20);
        c.arc(370, 338, 455, 238, 12, 4);
        c.enemy('walker', 510, 455, 480, 555, 3);
        return c.socket(455, 238);
      }
    }
  };

  function addArena(data, meta) {
    floor(data, ARENA, 1000);
    platform(data, ARENA + 100, 430, 170, 22, 'oneway');
    platform(data, ARENA + 680, 430, 170, 22, 'oneway');
    checkpoint(data, ARENA - 40, true);
    arc(data, ARENA + 55, 528, ARENA + 185, 398, 12, 5);
    arc(data, ARENA + 585, 528, ARENA + 765, 398, 12, 6);
    pickup(data, ARENA + 765, 398, 'relic');
    pickup(data, ARENA + 135, 528, 'heart');
    data.boss = {
      x: ARENA + 465,
      y: 464,
      min: ARENA + 300,
      max: ARENA + 610,
      hp: 10 + meta.world * 3,
      name: bossNames[meta.world]
    };
  }

  function build(index) {
    if (index === undefined) index = 0;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= levels.length) {
      throw new RangeError('EmberLevels.build index must be an integer from 0 to 47');
    }

    const meta = levels[index];
    const layout = routes[meta.world][meta.stage];
    // Metadata's boss flag is deliberately replaced by null or the boss object.
    const data = {
      index: meta.index,
      world: meta.world,
      stage: meta.stage,
      name: meta.name,
      par: meta.par,
      width: 0,
      height: HEIGHT,
      spawn: { x: 100, y: 470 },
      exit: { x: 0, y: FLOOR },
      platforms: [],
      enemies: [],
      pickups: [],
      hazards: [],
      checkpoints: [],
      springs: [],
      gates: [],
      boss: null
    };

    floor(data, 0, START);
    checkpoint(data, 100, false);
    arc(data, 175, 528, 290, 528, 0, 4);
    let x = START;
    layout.chunks.forEach(function (name, ordinal) {
      const chunk = chunks[name];
      const socket = chunk.place(context(data, meta, x, ordinal));
      if (layout.relics.indexOf(ordinal) !== -1) {
        pickup(data, socket.x, socket.y, 'relic');
      }
      x += chunk.width;
      // Checkpoints are 620..800px apart, on the stable end pad beyond all threats.
      // A vault checkpoint is after its gate, never after the key but before gate.
      if (!meta.boss || ordinal < layout.chunks.length - 1) {
        checkpoint(data, x - 60, ordinal % 2 === 1);
      }
    });

    if (meta.boss) {
      floor(data, x, ARENA - x);
      addArena(data, meta);
      data.width = ARENA + 1000;
    } else {
      floor(data, x, FINISH);
      arc(data, x + 55, 528, x + 170, 528, 0, 4);
      data.width = x + FINISH;
    }
    data.exit.x = data.width - 120;

    // Keep coins from visually concealing relics, keys, or checkpoint hearts.
    const landmarks = data.pickups.filter(function (item) { return item.type !== 'coin'; });
    data.pickups = data.pickups.filter(function (item) {
      return item.type !== 'coin' || !landmarks.some(function (landmark) {
        const dx = item.x - landmark.x;
        const dy = item.y - landmark.y;
        return dx * dx + dy * dy < 34 * 34;
      });
    });
    return data;
  }

  window.EmberLevels = { worlds: worlds, levels: levels, build: build };
}());
