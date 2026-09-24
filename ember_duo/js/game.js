(() => {
  'use strict';
  const UI = window.EmberUI;
  const Input = window.EmberInput;
  const Audio = window.EmberAudio;
  const Store = window.EmberStore;
  const clamp = Phaser.Math.Clamp;
  const lerp = Phaser.Math.Linear;
  const TAU = Math.PI * 2;
  const color = value => Phaser.Display.Color.HexStringToColor(value).color;
  let current = null;

  class Adventure extends Phaser.Scene {
    constructor() { super('Adventure'); }
    init(options = {}) {
      this.levelIndex = options.index || 0;
      this.mode = options.mode || UI.mode;
      this.previewMode = !options.play;
      this.options = { ...Store.data.settings, ...options.settings };
    }
    create() {
      current = this;
      this.level = EmberLevels.build(this.levelIndex);
      this.worldTheme = EmberLevels.worlds[this.level.world];
      this.clock = 0; this.elapsed = 0; this.coins = 0; this.relics = 0; this.deaths = 0;
      this.running = !this.previewMode; this.finished = false;
      this.checkpoint = { x: 100, y: 560, index: 0 };
      this.keys = new Set(); this.players = []; this.moving = []; this.crumbling = [];
      this.hazards = []; this.enemies = []; this.gates = []; this.flags = [];
      this.boss = null; this.exitWaiting = false; this.lockedGates = this.level.gates.length;
      this.lastHUD = -1000; this.lastRecall = -10000; this.combo = 0; this.comboUntil = 0;
      this.cameraZoom = 1;
      this.physics.world.setBounds(0, -200, this.level.width, this.level.height + 500);
      EmberArt.install(this);
      this.backdrop = EmberArt.background(this, this.worldTheme);
      this.solids = this.physics.add.staticGroup();
      this.pickups = this.physics.add.staticGroup();
      this.enemyBodies = this.physics.add.group({ allowGravity: true });
      this.playerBodies = this.physics.add.group({ allowGravity: true });
      this.shots = this.physics.add.group({ allowGravity: false });
      this.enemyShots = this.physics.add.group({ allowGravity: false });
      this.springs = this.physics.add.staticGroup();
      this.gateBodies = this.physics.add.staticGroup();
      this.makeTerrain();
      EmberArt.decorate(this, this.level, this.worldTheme);
      this.makeObjects();
      this.makeEnemies();
      this.makePlayers();
      this.makeBoss();
      this.setupCollisions();
      this.effectsLayer = this.add.graphics().setDepth(11);
      this.telegraphs = this.add.graphics().setDepth(0);
      this.weather = this.add.graphics().setScrollFactor(0).setDepth(20);
      this.cameras.main.setBounds(0, 0, this.level.width, this.level.height);
      this.cameras.main.setScroll(0, 80);
      UI.level(this.level);
      UI.update(this);
      UI.ready(this.previewMode);
      if (this.previewMode) { this.physics.pause(); Input.enabled = false; Audio.music(this.level.world, false); }
      else {
        this.cameras.main.fadeIn(400, 12, 35, 29);
        Audio.music(this.level.world, true);
        UI.toast(`${this.level.world + 1}-${this.level.stage + 1}  ${this.level.name}`);
      }
      this.events.once('shutdown', () => {
        this.backdrop?.destroy?.(); Audio.music(this.level.world, false);
        if (current === this) current = null;
      });
    }
    makeTerrain() {
      this.level.platforms.forEach(def => {
        const texture = ['ground', 'stone', 'oneway'].includes(def.type)
          ? (def.type === 'ground' ? 'ground-' : 'stone-') + this.level.world : def.type;
        const platform = this.add.tileSprite(def.x, def.y, def.w, def.h, texture).setOrigin(0).setDepth(1);
        this.physics.add.existing(platform, true);
        this.solids.add(platform);
        platform.def = def; platform.dx = 0; platform.dy = 0;
        if (def.type === 'oneway' || def.type === 'moving' || def.type === 'crumble') platform.oneWay = true;
        if (def.type === 'moving') this.moving.push(platform);
        if (def.type === 'crumble') { platform.crumbleAt = 0; platform.restoreAt = 0; this.crumbling.push(platform); }
        if (def.type === 'breakable') platform.hits = 2;
      });
      this.level.gates.forEach(def => {
        const gate = this.add.tileSprite(def.x, def.y, def.w, def.h, 'gate').setOrigin(0).setDepth(4);
        this.physics.add.existing(gate, true); this.gateBodies.add(gate);
        gate.keyId = def.id; this.gates.push(gate);
        this.add.image(def.x + def.w / 2, def.y + def.h - 100, 'key').setScale(0.75).setAlpha(0.6).setDepth(5);
      });
    }
    makeObjects() {
      this.level.pickups.forEach((def, index) => {
        const item = this.physics.add.staticImage(def.x, def.y, def.type).setDepth(4);
        item.kind = def.type; item.keyId = def.id; item.baseY = def.y; item.phase = index * 1.73;
        if (def.type === 'coin') item.body.setCircle(11);
        else item.body.setSize(def.type === 'relic' ? 30 : 26, 32);
        this.pickups.add(item);
      });
      this.level.checkpoints.forEach((def, index) => {
        const flag = this.add.image(def.x, def.y, 'flag').setOrigin(0.5, 1).setDepth(2);
        flag.def = def; flag.index = index; flag.lit = index === 0;
        flag.setTint(index === 0 ? 0x8dffcf : 0x829b91);
        this.flags.push(flag);
      });
      this.level.springs.forEach(def => {
        const spring = this.physics.add.staticImage(def.x, def.y, 'spring').setOrigin(0.5, 1).setDepth(3);
        spring.refreshBody(); spring.body.setSize(42, 16).setOffset(3, 8);
        this.springs.add(spring);
      });
      this.level.hazards.forEach(def => {
        let sprite;
        if (def.type === 'spike') sprite = this.add.tileSprite(def.x, def.y, def.w, def.h, 'spike').setOrigin(0);
        else if (def.type === 'saw') sprite = this.add.image(def.x + def.w / 2, def.y + def.h / 2, 'saw').setDisplaySize(def.w, def.h);
        else {
          sprite = this.add.rectangle(def.x + def.w / 2, def.y + def.h / 2, def.w, def.h, 0xff796d, 0.85);
          this.add.rectangle(def.x + def.w / 2, def.y, def.w + 14, 9, 0x37564e).setDepth(5);
          this.add.rectangle(def.x + def.w / 2, def.y + def.h, def.w + 14, 9, 0x37564e).setDepth(5);
        }
        sprite.setDepth(3);
        this.physics.add.existing(sprite, true);
        if (def.type === 'saw') sprite.body.setCircle(def.w * 0.4, def.w * 0.1, def.h * 0.1);
        else if (def.type === 'spike') sprite.body.setSize(Math.max(8, def.w - 8), Math.max(8, def.h - 6)).setOffset(4, 6);
        sprite.def = def; this.hazards.push(sprite);
      });
      this.exit = this.add.image(this.level.exit.x, this.level.exit.y, 'exit').setOrigin(0.5, 1).setDepth(2);
      this.exitHalo = this.add.graphics().setDepth(0);
    }
    makePlayers() {
      for (let i = 0; i < this.mode; i++) {
        const player = this.physics.add.sprite(this.level.spawn.x + i * 40, this.level.spawn.y, `p${i + 1}-idle`).setOrigin(0.5, 1).setDepth(8);
        this.playerBodies.add(player);
        player.body.setSize(26, 42).setOffset(11, 14);
        player.body.setMaxVelocity(760, 1100);
        player.body.setCollideWorldBounds(false);
        player.index = i; player.face = 1;
        player.maxHP = this.options.assist ? 5 : 3; player.hp = player.maxHP;
        player.dead = false; player.respawnAt = 0; player.invulnerable = 0; player.hurtUntil = 0;
        player.jumps = 0; player.coyote = 0; player.jumpBuffer = 0; player.dashUntil = 0;
        player.dashReady = 0; player.shotReady = 0; player.springReady = 0;
        player.support = null; player.safeSpot = { x: 100 + i * 40, y: 560 }; player.safeAt = 0;
        player.trailAt = 0; player.lastGrounded = false; player.lastJumpHeld = false;
        player.tag = this.add.text(player.x, player.y - 66, `P${i + 1}`, { fontFamily: 'Arial', fontSize: '10px', fontStyle: 'bold', color: i === 0 ? '#ffe1c0' : '#b1ffed', stroke: '#183d32', strokeThickness: 3 }).setOrigin(0.5).setDepth(9);
        this.players.push(player);
      }
    }
    makeEnemies() {
      this.level.enemies.forEach(def => this.spawnEnemy(def));
    }
    spawnEnemy(def) {
      const enemy = this.physics.add.sprite(def.x, def.y, def.type).setOrigin(0.5, 1).setDepth(6);
      this.enemyBodies.add(enemy);
      enemy.kind = def.type; enemy.def = { ...def }; enemy.face = -1; enemy.dead = false;
      enemy.hp = def.type === 'turret' ? 3 : def.type === 'flyer' ? 1 : 2;
      enemy.invulnerable = 0; enemy.shotReady = this.clock + 1000 + def.x % 900;
      enemy.phase = def.x % 10;
      enemy.body.setSize(def.type === 'turret' ? 32 : 32, 28).setOffset(def.type === 'flyer' ? 8 : 7, def.type === 'turret' ? 18 : 10);
      enemy.body.setAllowGravity(def.type === 'walker');
      enemy.body.setImmovable(def.type === 'turret');
      if (def.type === 'walker') enemy.setVelocityX(-55 - this.level.world * 8);
      this.enemies.push(enemy);
      return enemy;
    }
    makeBoss() {
      if (!this.level.boss) return;
      const def = this.level.boss;
      const boss = this.physics.add.sprite(def.x + 64, def.y + 96, 'boss').setOrigin(0.5, 1).setDepth(6);
      boss.body.setAllowGravity(false).setImmovable(true).setSize(102, 108).setOffset(19, 22);
      boss.hp = Math.round(def.hp * (this.mode === 2 ? 1.5 : 1)); boss.maxHP = boss.hp;
      boss.dead = false; boss.engaged = false; boss.vulnerable = false;
      boss.phase = 'idle'; boss.phaseEnd = 0; boss.attackCount = 0; boss.nextShot = 0; boss.invulnerable = 0;
      boss.min = def.min + 64; boss.max = def.max + 64;
      boss.homeY = def.y + 96; boss.face = -1; boss.targets = [];
      boss.setTint([0xcbe9b1, 0xedc79c, 0xadeaff, 0xffae83, 0xb4dfdf, 0xe6cfff][this.level.world]);
      this.boss = boss;
    }
    setupCollisions() {
      this.physics.add.collider(this.playerBodies, this.solids, (player, platform) => {
        if (player.dead) return;
        if (player.body.touching.down && Math.abs(player.body.bottom - platform.body.top) < 12) {
          player.support = platform;
          if (platform.def.type === 'crumble' && !platform.crumbleAt && !platform.restoreAt) platform.crumbleAt = this.clock + 620;
        }
      }, (player, platform) => {
        if (player.dead || !platform.active || !platform.body.enable) return false;
        if (!platform.oneWay) return true;
        const oldBottom = player.body.prev.y + player.body.height;
        return player.body.velocity.y >= -20 && oldBottom <= platform.body.top + 14 + Math.abs(platform.dy || 0);
      });
      this.physics.add.collider(this.playerBodies, this.gateBodies);
      this.physics.add.collider(this.enemyBodies, this.solids, null, (enemy, platform) => {
        if (enemy.kind !== 'walker') return false;
        return !platform.oneWay || (enemy.body.velocity.y >= 0 && enemy.body.prev.y + enemy.body.height <= platform.body.top + 12);
      });
      this.physics.add.collider(this.enemyBodies, this.gateBodies);
      this.physics.add.overlap(this.playerBodies, this.pickups, (player, item) => this.collect(player, item));
      this.physics.add.overlap(this.playerBodies, this.enemyBodies, (player, enemy) => this.contactEnemy(player, enemy));
      this.physics.add.overlap(this.playerBodies, this.springs, (player, spring) => {
        if (player.dead || this.clock < player.springReady || player.body.velocity.y < 0 || player.body.bottom > spring.y + 12) return;
        player.springReady = this.clock + 250; player.setVelocityY(-850); player.jumps = 1;
        player.coyote = 0; player.jumpBuffer = 0;
        this.burst(spring.x, spring.y - 10, 0xffd985, 12); Audio.play('spring');
        this.tweens.add({ targets: spring, scaleY: 0.5, duration: 75, yoyo: true });
      });
      this.hazards.forEach(hazard => this.physics.add.overlap(this.playerBodies, hazard, (first, second) => {
        if (!hazard.body.enable) return;
        const player = first === hazard ? second : first;
        if (!player?.body?.setAllowGravity) return;
        this.hurt(player, hazard.x + hazard.displayWidth / 2);
      }));
      this.physics.add.overlap(this.shots, this.enemyBodies, (shot, enemy) => {
        if (!shot.active || enemy.dead) return;
        this.hitEnemy(enemy, 1, shot.owner); this.destroyShot(shot);
      });
      this.physics.add.overlap(this.enemyShots, this.playerBodies, (shot, player) => {
        if (!shot.active || player.dead) return;
        if (player.dashUntil > this.clock) { this.destroyShot(shot); return; }
        if (this.hurt(player, shot.x)) this.destroyShot(shot);
      });
      this.physics.add.collider(this.shots, this.solids, (shot, platform) => {
        if (platform.def.type === 'breakable') {
          platform.hits--;
          this.burst(shot.x, shot.y, 0xffda9b, 6);
          if (platform.hits <= 0) { this.burst(platform.x + platform.width / 2, platform.y, 0xffda9b, 15); platform.destroy(); }
        }
        this.destroyShot(shot);
      });
      this.physics.add.collider(this.shots, this.gateBodies, shot => this.destroyShot(shot));
      this.physics.add.collider(this.enemyShots, this.solids, shot => this.destroyShot(shot), (shot, platform) => !platform.oneWay);
      if (this.boss) {
        this.physics.add.overlap(this.shots, this.boss, (first, second) => {
          const shot = first === this.boss ? second : first;
          if (!shot?.active || this.boss.dead) return;
          this.hitBoss(1, shot.owner); this.destroyShot(shot);
        });
        this.physics.add.overlap(this.playerBodies, this.boss, (first, second) => {
          const boss = this.boss;
          const player = first === boss ? second : first;
          if (!player?.body || player.dead || boss.dead) return;
          const fromAbove = player.body.velocity.y > 80 && player.body.prev.y + player.body.height <= boss.body.top + 28;
          if (fromAbove) {
            player.setVelocityY(-520); player.jumps = 1;
            if (boss.vulnerable) this.hitBoss(2, player.index);
            this.burst(player.x, player.y, 0xffdf9b, 9);
          } else if (player.dashUntil > this.clock) { if (boss.vulnerable) this.hitBoss(1, player.index); }
          else this.hurt(player, boss.x);
        });
      }
    }
    update(time, delta) {
      this.backdrop?.update(this.cameras.main.scrollX, time);
      if (!this.running || this.finished) return;
      const dt = Math.min(delta, 50) / 1000;
      this.clock += dt * 1000; this.elapsed += dt;
      this.updatePlatforms();
      this.updateHazards();
      this.players.forEach(player => this.updatePlayer(player, dt));
      this.updateEnemies(dt);
      this.updateBoss(dt);
      this.updateShots();
      this.updateObjects();
      this.updateCamera(dt);
      this.drawEffects(time);
      if (this.clock - this.lastHUD > 90) { this.lastHUD = this.clock; UI.update(this); }
    }
    updatePlatforms() {
      for (const platform of this.moving) {
        const def = platform.def;
        const value = Math.sin(this.clock / def.period * TAU + def.phase) * def.range;
        const nx = def.x + (def.axis === 'x' ? value : 0);
        const ny = def.y + (def.axis === 'y' ? value : 0);
        platform.dx = nx - platform.x; platform.dy = ny - platform.y;
        platform.setPosition(nx, ny); platform.body.updateFromGameObject();
      }
      for (const platform of this.crumbling) {
        if (platform.crumbleAt && this.clock >= platform.crumbleAt) {
          platform.body.enable = false; platform.setVisible(false);
          platform.restoreAt = this.clock + 2800; platform.crumbleAt = 0;
          this.burst(platform.x + platform.width / 2, platform.y + 8, color(this.worldTheme.top), 10);
        } else if (platform.crumbleAt) platform.setAlpha(0.45 + Math.sin(this.clock / 45) * 0.3);
        if (platform.restoreAt && this.clock >= platform.restoreAt) {
          const occupied = this.players.some(p => !p.dead && p.body.right > platform.x && p.body.left < platform.x + platform.width && p.body.bottom > platform.y && p.body.top < platform.y + platform.height);
          if (!occupied) { platform.body.enable = true; platform.setVisible(true).setAlpha(1); platform.restoreAt = 0; }
        }
      }
    }
    updateHazards() {
      this.hazards.forEach(hazard => {
        const def = hazard.def;
        if (def.type === 'saw') {
          const movement = Math.sin(this.clock / def.period * TAU + def.phase) * def.range;
          hazard.x = def.x + def.w / 2 + (def.axis === 'x' ? movement : 0);
          hazard.y = def.y + def.h / 2 + (def.axis === 'y' ? movement : 0);
          hazard.rotation += 0.11;
          hazard.body.updateFromGameObject();
          hazard.body.setCircle(def.w * 0.4, def.w * 0.1, def.h * 0.1);
        } else if (def.type === 'laser') {
          const phase = (this.clock / def.period + def.phase / TAU) % 1;
          const active = phase > 0.44 && phase < 0.83;
          hazard.body.enable = active;
          hazard.setAlpha(active ? 0.72 + Math.sin(this.clock / 22) * 0.22 : phase > 0.31 ? 0.25 : 0.07);
        }
      });
    }
    updatePlayer(player, dt) {
      if (player.dead) {
        player.tag.setVisible(false);
        if (this.clock >= player.respawnAt) this.respawn(player);
        return;
      }
      const input = Input.sample(player.index);
      const grounded = player.body.blocked.down || player.body.touching.down;
      const support = player.support;
      if (support?.active && support.body.enable && grounded && support.def.type === 'moving') {
        player.x += support.dx; player.y += support.dy;
        player.body.position.x += support.dx; player.body.position.y += support.dy;
      }
      if (grounded && player.body.velocity.y >= 0) {
        player.coyote = this.clock + 110; player.jumps = 0;
        if (!player.lastGrounded && this.clock > 200) this.burst(player.x, player.y - 1, 0xe5edc2, 5, 60);
        if (support?.active && ['ground', 'stone', 'ice'].includes(support.def.type)
          && support.width > 65 && player.x > support.x + 22 && player.x < support.x + support.width - 22
          && !this.hazards.some(h => h.body.enable && Math.abs(h.x - player.x) < 85 && Math.abs(h.y - player.y) < 85)) {
          player.safeSpot = { x: player.x, y: player.y }; player.safeAt = this.clock;
        }
      }
      if (input.jumpPressed) player.jumpBuffer = this.clock + 135;
      if (player.jumpBuffer > this.clock) {
        const first = grounded || player.coyote > this.clock;
        if (first || player.jumps < 2) {
          player.setVelocityY(first ? -540 : -500);
          player.jumps = first ? 1 : 2; player.coyote = 0; player.jumpBuffer = 0;
          player.dashUntil = 0; player.body.setAllowGravity(true);
          this.burst(player.x, player.y, player.index === 0 ? 0xffc098 : 0x94ffe0, first ? 7 : 14, 130);
          Audio.play(first ? 'jump' : 'double');
        }
      }
      if (!input.jump && player.lastJumpHeld && player.body.velocity.y < -230 && this.clock > player.springReady - 130) player.setVelocityY(player.body.velocity.y * 0.55);
      player.lastJumpHeld = input.jump;
      const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (direction) player.face = direction;
      if (input.dashPressed && this.clock >= player.dashReady) {
        player.dashUntil = this.clock + 175; player.dashReady = this.clock + 950;
        player.dashFace = player.face; player.setVelocity(player.face * 620, 0);
        player.body.setAllowGravity(false); Audio.play('dash');
      }
      if (player.dashUntil > this.clock) {
        player.setVelocity(player.dashFace * 620, 0);
        if (this.clock > player.trailAt) {
          player.trailAt = this.clock + 25;
          this.afterimage(player);
        }
      } else {
        player.body.setAllowGravity(true);
        const onIce = support?.def.type === 'ice';
        const target = direction * 260;
        const accel = onIce && grounded ? (direction ? 650 : 200) : grounded ? 2400 : 1750;
        if (this.clock >= player.hurtUntil) {
          const change = clamp(target - player.body.velocity.x, -accel * dt, accel * dt);
          player.setVelocityX(player.body.velocity.x + change);
        }
        if (this.level.world === 4 && !grounded) player.body.velocity.x += Math.sin(this.clock / 1900) * 52 * dt;
      }
      if (input.attack && this.clock >= player.shotReady) this.shoot(player);
      player.x = clamp(player.x, 16, this.level.width - 16);
      if (player.x <= 16 && player.body.velocity.x < 0) player.setVelocityX(0);
      if (player.y > this.level.height + 50) { this.killPlayer(player); return; }
      player.setFlipX(player.face < 0);
      const prefix = `p${player.index + 1}-`;
      const texture = !grounded ? 'jump' : Math.abs(player.body.velocity.x) > 20 ? 'run' + (Math.floor(this.clock / 90) % 4) : 'idle';
      if (player.texture.key !== prefix + texture) player.setTexture(prefix + texture);
      player.setAlpha(this.clock < player.invulnerable && Math.floor(this.clock / 90) % 2 ? 0.4 : 1);
      player.tag.setVisible(true).setPosition(player.x, player.y - 64);
      player.lastGrounded = grounded; player.support = null;
    }
    shoot(player) {
      player.shotReady = this.clock + 240;
      const shot = this.shots.create(player.x + player.face * 21, player.y - 28, 'bolt').setDepth(7);
      shot.owner = player.index; shot.expires = this.clock + 720;
      shot.setTint(player.index === 0 ? 0xffc195 : 0x7dffe1).setFlipX(player.face < 0);
      shot.body.setSize(17, 9).setAllowGravity(false); shot.setVelocityX(player.face * 630);
      Audio.play('shot');
      this.burst(shot.x, shot.y, player.index === 0 ? 0xffae80 : 0x94ffe0, 3, 70);
    }
    updateShots() {
      [this.shots, this.enemyShots].forEach(group => group.getChildren().slice().forEach(shot => {
        if (shot.expires < this.clock || shot.x < -50 || shot.x > this.level.width + 50 || shot.y > this.level.height + 80 || shot.y < -200) shot.destroy();
      }));
    }
    destroyShot(shot) {
      if (!shot.active) return;
      this.burst(shot.x, shot.y, shot.owner === undefined ? 0xff9f91 : 0xc8ffdb, 4, 75);
      shot.destroy();
    }
    enemyShot(x, y, vx, vy, gravity = false, size = 1) {
      const shot = this.enemyShots.create(x, y, 'enemybolt').setScale(size).setDepth(7);
      shot.body.setCircle(6, 2, 2).setAllowGravity(gravity);
      if (gravity) shot.body.setGravityY(-750);
      shot.setVelocity(vx, vy); shot.expires = this.clock + 5000;
      return shot;
    }
    nearestPlayer(x, y) {
      let nearest = null, best = Infinity;
      this.players.forEach(player => {
        if (player.dead) return;
        const distance = Math.abs(player.x - x) + Math.abs(player.y - y) * 0.5;
        if (distance < best) { nearest = player; best = distance; }
      });
      return nearest;
    }
    updateEnemies(dt) {
      for (const enemy of this.enemies) {
        if (!enemy.active || enemy.dead) continue;
        if (enemy.y > this.level.height + 80) { enemy.dead = true; enemy.destroy(); continue; }
        if (Math.abs(enemy.x - this.cameras.main.midPoint.x) > 1000) continue;
        const speed = 55 + this.level.world * 8;
        if (enemy.kind === 'walker') {
          if (enemy.x <= enemy.def.min || enemy.body.blocked.left) enemy.face = 1;
          if (enemy.x >= enemy.def.max || enemy.body.blocked.right) enemy.face = -1;
          enemy.setVelocityX(speed * enemy.face);
        } else if (enemy.kind === 'flyer') {
          const middle = (enemy.def.min + enemy.def.max) / 2;
          enemy.setVelocityX((middle + Math.sin(this.clock / 950 + enemy.phase) * ((enemy.def.max - enemy.def.min) / 2) - enemy.x) * 4);
          enemy.setVelocityY((enemy.def.y - 40 + Math.sin(this.clock / 460 + enemy.phase) * 25 - enemy.y) * 4);
          enemy.face = enemy.body.velocity.x > 0 ? 1 : -1;
        } else {
          const target = this.nearestPlayer(enemy.x, enemy.y);
          if (target && Math.abs(target.x - enemy.x) < 610) {
            enemy.face = target.x < enemy.x ? -1 : 1;
            if (this.clock > enemy.shotReady) {
              enemy.shotReady = this.clock + Math.max(1300, 2300 - this.level.world * 110);
              const angle = Math.atan2(target.y - 24 - (enemy.y - 25), target.x - enemy.x);
              this.enemyShot(enemy.x + enemy.face * 23, enemy.y - 25, Math.cos(angle) * 205, Math.sin(angle) * 205);
              this.burst(enemy.x, enemy.y - 25, 0xffaf88, 4, 60);
            }
          }
        }
        enemy.setFlipX(enemy.face > 0);
        enemy.setAlpha(enemy.invulnerable > this.clock ? 0.5 : 1);
      }
    }
    contactEnemy(player, enemy) {
      if (player.dead || enemy.dead) return;
      const fromAbove = player.body.velocity.y > 70 && player.body.prev.y + player.body.height <= enemy.body.top + 20;
      if (player.dashUntil > this.clock) this.hitEnemy(enemy, 3, player.index);
      else if (fromAbove) {
        this.hitEnemy(enemy, 3, player.index); player.setVelocityY(-440); player.jumps = 1;
        player.coyote = 0; Audio.play('double');
      } else this.hurt(player, enemy.x);
    }
    hitEnemy(enemy, amount, owner) {
      if (enemy.dead || this.clock < enemy.invulnerable) return;
      enemy.hp -= amount; enemy.invulnerable = this.clock + 160;
      this.burst(enemy.x, enemy.y - 18, 0xffce88, 9); Audio.play('hit');
      if (enemy.hp <= 0) {
        enemy.dead = true; enemy.body.enable = false;
        this.combo = this.clock < this.comboUntil ? this.combo + 1 : 1; this.comboUntil = this.clock + 2300;
        const reward = 2 + Math.min(4, this.combo - 1); this.coins += reward;
        this.floatText(enemy.x, enemy.y - 40, this.combo > 1 ? `连击 ${this.combo}  +${reward}` : `+${reward}`, '#ffe199');
        this.burst(enemy.x, enemy.y - 20, 0xffc392, 16, 190);
        this.tweens.add({ targets: enemy, angle: enemy.face * 100, y: enemy.y - 30, alpha: 0, duration: 220, onComplete: () => enemy.destroy() });
      }
    }
    collect(player, item) {
      if (player.dead || !item.active || item.collected) return;
      if (item.kind === 'heart' && player.hp >= player.maxHP) return;
      item.collected = true;
      if (item.kind === 'coin') { this.coins++; Audio.play('coin'); }
      else if (item.kind === 'relic') { this.relics++; Audio.play('relic'); this.floatText(item.x, item.y - 25, `星核 ${this.relics}/3`, '#b7ffe1'); }
      else if (item.kind === 'heart') { player.hp = Math.min(player.maxHP, player.hp + 1); Audio.play('checkpoint'); }
      else if (item.kind === 'key') {
        this.keys.add(item.keyId); Audio.play('key'); UI.toast('星锁已开启');
        this.gates.forEach(gate => {
          if (gate.active && gate.keyId === item.keyId) {
            gate.body.enable = false; this.lockedGates--;
            this.burst(gate.x, gate.y + gate.height - 70, 0xffd791, 24, 220);
            this.tweens.add({ targets: gate, alpha: 0, y: gate.y - 70, duration: 500, onComplete: () => gate.destroy() });
          }
        });
      }
      this.burst(item.x, item.y, item.kind === 'coin' || item.kind === 'key' ? 0xffdf88 : 0x99ffd5, item.kind === 'relic' ? 20 : 5);
      item.destroy();
    }
    hurt(player, sourceX, force = false) {
      if (player.dead || (!force && (this.clock < player.invulnerable || this.clock < player.dashUntil))) return false;
      player.hp--; player.invulnerable = this.clock + 1500; player.hurtUntil = this.clock + 220;
      player.dashUntil = 0; player.body.setAllowGravity(true);
      player.setVelocity(player.x < sourceX ? -220 : 220, -270);
      this.burst(player.x, player.y - 25, player.index === 0 ? 0xffa087 : 0x8fffe0, 12, 200);
      if (this.options.effects) this.cameras.main.shake(110, 0.004);
      Audio.play('hurt');
      if (player.hp <= 0) this.killPlayer(player);
      return true;
    }
    killPlayer(player) {
      if (player.dead) return;
      player.dead = true; player.hp = 0; this.deaths++; player.respawnAt = this.clock + 1100;
      player.body.enable = false; player.setVisible(false); player.tag.setVisible(false);
      this.burst(player.x, Math.min(player.y - 25, 670), player.index === 0 ? 0xffb493 : 0x9affdf, 22, 230);
      Audio.play('death');
    }
    respawn(player) {
      let position = { x: this.checkpoint.x + player.index * 34, y: this.checkpoint.y };
      const partner = this.players.find(p => p !== player && !p.dead && p.lastGrounded && p.safeAt > this.clock - 1000 && p.safeSpot.x >= this.checkpoint.x);
      if (partner) position = { ...partner.safeSpot };
      player.dead = false; player.hp = player.maxHP; player.setVisible(true).setAlpha(1);
      player.body.enable = true; player.body.reset(position.x, position.y - 4);
      player.setVelocity(0, 0); player.body.setAllowGravity(true);
      player.invulnerable = this.clock + 2000; player.hurtUntil = 0; player.dashUntil = 0;
      player.jumps = 0; player.jumpBuffer = 0; player.support = null;
      player.safeSpot = position; player.safeAt = this.clock;
      this.burst(player.x, player.y - 20, 0xa0ffce, 20);
      if (this.players.every(p => p.dead || Math.abs(p.x - this.checkpoint.x) < 120)) this.resetNearbyEnemies();
    }
    resetNearbyEnemies() {
      this.enemies.forEach(enemy => {
        if (!enemy.active || enemy.dead || Math.abs(enemy.x - this.checkpoint.x) > 1000) return;
        enemy.body.reset(enemy.def.x, enemy.def.y); enemy.setVelocity(0, 0);
        enemy.shotReady = this.clock + 1800;
      });
      this.enemyShots.clear(true, true);
    }
    recall() {
      if (!this.running || this.players.length < 2 || this.clock - this.lastRecall < 2500) return;
      const living = this.players.filter(p => !p.dead);
      if (!living.length) return;
      const leader = living.reduce((best, p) => p.x > best.x ? p : best);
      if (!leader.lastGrounded || this.clock - leader.safeAt > 600 || Math.abs(leader.x - leader.safeSpot.x) > 60) { UI.toast('在稳固地面等待同伴'); return; }
      this.lastRecall = this.clock;
      this.players.forEach(player => {
        if (player === leader || player.dead) return;
        this.burst(player.x, player.y - 24, 0x9affdf, 14);
        player.body.reset(leader.safeSpot.x, leader.safeSpot.y - 6);
        player.setVelocity(0, 0); player.dashUntil = 0; player.body.setAllowGravity(true);
        player.invulnerable = this.clock + 1100; player.jumps = 0; player.support = null;
        this.burst(player.x, player.y - 24, 0x9affdf, 14);
      });
      UI.toast('同伴已会合');
    }
    updateObjects() {
      this.pickups.getChildren().forEach(item => {
        // Only the artwork bobs; the fixed collection body remains predictable.
        item.y = item.baseY + Math.sin(this.clock / 350 + item.phase) * (item.kind === 'coin' ? 3 : 5);
      });
      this.flags.forEach(flag => {
        if (flag.index <= this.checkpoint.index) return;
        const touching = this.players.find(p => !p.dead && Math.abs(p.x - flag.x) < 38 && Math.abs(p.y - flag.y) < 56);
        if (!touching) return;
        this.checkpoint = { ...flag.def, index: flag.index };
        flag.lit = true; flag.setTint(0x9bffd0);
        this.players.forEach(player => { if (!player.dead) player.hp = player.maxHP; });
        this.burst(flag.x, flag.y - 65, 0xa2ffcc, 22, 160);
        UI.checkpoint(flag.index); Audio.play('checkpoint');
      });
      const exitOpen = (!this.boss || this.boss.dead) && this.lockedGates === 0;
      this.exit.setAlpha(exitOpen ? 1 : 0.45);
      const alive = this.players.filter(player => !player.dead);
      const arrived = alive.filter(player => Math.abs(player.x - this.exit.x) < 70 && Math.abs(player.y - this.exit.y) < 80);
      this.exitWaiting = exitOpen && arrived.length > 0 && arrived.length < this.mode;
      if (exitOpen && arrived.length === this.mode) this.finish();
    }
    updateBoss(dt) {
      const boss = this.boss;
      if (!boss || boss.dead) return;
      const target = this.nearestPlayer(boss.x, boss.y);
      if (!target) { boss.setVelocityX(0); return; }
      if (!boss.engaged) {
        if (target.x < boss.min - 250) return;
        boss.engaged = true; boss.phase = 'idle'; boss.phaseEnd = this.clock + 1200;
        UI.toast(this.level.boss.name); Audio.play('hit');
      }
      boss.face = target.x < boss.x ? -1 : 1;
      boss.setFlipX(boss.face > 0);
      if (this.clock >= boss.phaseEnd) {
        if (boss.phase === 'idle') {
          boss.phase = 'windup'; boss.phaseEnd = this.clock + 1000;
          boss.vulnerable = false; boss.setVelocityX(0);
          boss.attackType = (boss.attackCount + this.level.world) % 3;
          boss.chargeFace = boss.face;
          boss.targets = this.players.filter(p => !p.dead).map(p => clamp(p.x, boss.min - 300, boss.max + 300));
        } else if (boss.phase === 'windup') {
          boss.phase = 'attack'; boss.phaseEnd = this.clock + (boss.attackType === 1 ? 1300 : 1550);
          boss.nextShot = this.clock;
          if (boss.attackType === 2) {
            boss.targets.forEach(x => { for (let j = -1; j <= 1; j++) this.enemyShot(x + j * 76, 140 - Math.abs(j) * 25, 0, 265, false, 1.1); });
          }
        } else if (boss.phase === 'attack') {
          boss.phase = 'rest'; boss.phaseEnd = this.clock + 2100; boss.vulnerable = true; boss.setVelocityX(0);
          this.burst(boss.x, boss.y - 65, 0xafffd1, 16);
        } else {
          boss.phase = 'idle'; boss.phaseEnd = this.clock + 650; boss.vulnerable = false; boss.attackCount++;
        }
      }
      if (boss.phase === 'attack') {
        if (boss.attackType === 1) {
          boss.setVelocityX(boss.chargeFace * (205 + this.level.world * 9));
          if (boss.x < boss.min || boss.x > boss.max) {
            boss.x = clamp(boss.x, boss.min, boss.max); boss.chargeFace *= -1;
            this.burst(boss.x, boss.y - 5, 0xffd198, 16);
            if (this.options.effects) this.cameras.main.shake(90, 0.003);
          }
        } else if (boss.attackType === 0 && this.clock >= boss.nextShot) {
          boss.nextShot = this.clock + Math.max(330, 480 - this.level.world * 20);
          const angle = Math.atan2(target.y - 24 - (boss.y - 56), target.x - boss.x);
          const speed = 205 + this.level.world * 10;
          this.enemyShot(boss.x + boss.face * 62, boss.y - 56, Math.cos(angle) * speed, Math.sin(angle) * speed);
          if (this.level.world >= 2) this.enemyShot(boss.x + boss.face * 62, boss.y - 56, Math.cos(angle + 0.22) * speed, Math.sin(angle + 0.22) * speed);
          if (this.level.world >= 4) this.enemyShot(boss.x + boss.face * 62, boss.y - 56, Math.cos(angle - 0.22) * speed, Math.sin(angle - 0.22) * speed);
        }
      }
      if (boss.phase !== 'attack' || boss.attackType !== 1) boss.setVelocityX(0);
      boss.setAlpha(boss.invulnerable > this.clock ? 0.65 : 1);
      boss.y = boss.homeY + (boss.phase === 'windup' ? Math.sin(this.clock / 40) * 2 : 0);
    }
    hitBoss(damage, owner) {
      const boss = this.boss;
      if (!boss || boss.dead || boss.invulnerable > this.clock) return;
      if (!boss.vulnerable) { this.burst(boss.x, boss.y - 60, 0xd7e5df, 4); return; }
      boss.invulnerable = this.clock + 180; boss.hp -= damage;
      this.burst(boss.x, boss.y - 65, 0xffdda0, 16, 180); Audio.play('hit');
      if (boss.hp <= 0) {
        boss.dead = true; boss.body.enable = false; boss.setVelocity(0, 0);
        this.enemyShots.clear(true, true); this.coins += 30 + this.level.world * 10;
        this.players.forEach(p => { if (!p.dead) p.hp = p.maxHP; });
        this.burst(boss.x, boss.y - 65, color(this.worldTheme.accent), 55, 330);
        this.floatText(boss.x, boss.y - 120, '星火归来', '#ffe0a5');
        this.tweens.add({ targets: boss, alpha: 0, y: boss.y - 45, duration: 700, onComplete: () => boss.setVisible(false) });
        Audio.play('relic'); UI.toast('守卫已平息 · 星门开启');
        if (this.options.effects) this.cameras.main.shake(300, 0.008);
      }
    }
    updateCamera(dt) {
      const alive = this.players.filter(p => !p.dead);
      const camera = this.cameras.main;
      if (!alive.length) return;
      const left = Math.min(...alive.map(p => p.x));
      const right = Math.max(...alive.map(p => p.x));
      const top = Math.min(...alive.map(p => p.y));
      const bottom = Math.max(...alive.map(p => p.y));
      const span = right - left;
      const targetZoom = this.mode === 2 ? clamp(760 / Math.max(760, span + 120), 0.76, 1) : 1;
      this.cameraZoom = lerp(this.cameraZoom, targetZoom, Math.min(1, dt * 3));
      camera.setZoom(this.cameraZoom);
      const look = alive.reduce((sum, p) => sum + p.face * Math.min(Math.abs(p.body.velocity.x) * 0.16, 48), 0) / alive.length;
      const targetX = (left + right) / 2 + look;
      const targetY = (top + bottom) / 2 - 74;
      const centerX = camera.scrollX + 480;
      const centerY = camera.scrollY + 270;
      camera.centerOn(lerp(centerX, targetX, Math.min(1, dt * 5.5)), lerp(centerY, targetY, Math.min(1, dt * 4)));
      // A grounded leader provides a safe catch-up point; never pull a player into a pit.
      if (alive.length === 2 && span > 900 && this.clock - this.lastRecall > 2500) {
        const leader = alive[0].x > alive[1].x ? alive[0] : alive[1];
        if (leader.lastGrounded && this.clock - leader.safeAt < 250) this.recall();
      }
    }
    drawEffects(time) {
      const fx = this.effectsLayer; fx.clear();
      this.telegraphs.clear(); this.exitHalo.clear();
      const accent = color(this.worldTheme.accent);
      const open = !this.boss || this.boss.dead;
      if (open) {
        const pulse = 0.55 + Math.sin(this.clock / 400) * 0.2;
        this.exitHalo.lineStyle(2, accent, pulse);
        this.exitHalo.strokeEllipse(this.exit.x, this.exit.y - 50, 72 + Math.sin(this.clock / 550) * 6, 108);
        for (let i = 0; i < 6; i++) {
          const angle = this.clock / 1400 + i * TAU / 6;
          fx.fillStyle(accent, 0.85); fx.fillCircle(this.exit.x + Math.cos(angle) * 35, this.exit.y - 52 + Math.sin(angle) * 48, 2);
        }
      }
      for (const flag of this.flags) {
        if (!flag.lit) continue;
        fx.fillStyle(0xc4ffb5, 0.6 + Math.sin(this.clock / 300 + flag.x) * 0.25);
        fx.fillCircle(flag.x, flag.y - 69, 3);
      }
      this.players.forEach(player => {
        if (player.dead) return;
        if (this.clock < player.dashUntil) {
          fx.lineStyle(2, player.index ? 0x8affdf : 0xffb490, 0.8);
          fx.lineBetween(player.x - player.face * 12, player.y - 18, player.x - player.face * 65, player.y - 18);
        }
      });
      if (this.boss && !this.boss.dead && this.boss.engaged) {
        const boss = this.boss;
        if (boss.vulnerable) {
          fx.lineStyle(2, 0xa6ffda, 0.85); fx.strokeCircle(boss.x, boss.y - 68, 19 + Math.sin(this.clock / 100) * 3);
          fx.fillStyle(0xc7ffe9, 0.9); fx.fillCircle(boss.x, boss.y - 68, 7);
        } else {
          fx.lineStyle(2, 0xffd1a4, 0.35); fx.strokeEllipse(boss.x, boss.y - 62, 143, 145);
        }
        if (boss.phase === 'windup') {
          const alpha = 0.2 + Math.sin(this.clock / 80) * 0.09;
          this.telegraphs.fillStyle(0xff7e73, alpha);
          if (boss.attackType === 2) boss.targets.forEach(x => this.telegraphs.fillRect(x - 100, 130, 200, 430));
          else if (boss.attackType === 1) this.telegraphs.fillRect(boss.min - 60, 534, boss.max - boss.min + 120, 26);
          else { this.telegraphs.lineStyle(2, 0xff9c79, 0.4); this.telegraphs.strokeCircle(boss.x, boss.y - 60, 88); }
        }
      }
      this.weather.clear();
      if (!this.options.effects) return;
      const weather = this.worldTheme.weather;
      const count = weather === 'rain' ? 42 : 23;
      for (let i = 0; i < count; i++) {
        const speed = weather === 'rain' ? 0.28 : weather === 'snow' ? 0.024 : 0.012;
        const x = ((i * 137.37 + time * (weather === 'rain' ? -0.07 : 0.014) - this.cameras.main.scrollX * 0.14) % 1050 + 1050) % 1050 - 45;
        const y = ((i * 91.23 + time * speed) % 590) - 25;
        if (weather === 'rain') { this.weather.lineStyle(1, 0xc5e7e4, 0.22); this.weather.lineBetween(x, y, x - 5, y + 15); }
        else { this.weather.fillStyle(weather === 'snow' ? 0xffffff : weather === 'embers' ? 0xffb26f : accent, 0.23 + (i % 3) * 0.12); this.weather.fillCircle(x + Math.sin(time / 1700 + i) * 13, weather === 'embers' ? 540 - y : y, weather === 'snow' ? 2 : 1.5); }
      }
    }
    afterimage(player) {
      if (!this.options.effects) return;
      const echo = this.add.image(player.x, player.y, player.texture.key).setOrigin(0.5, 1).setFlipX(player.flipX).setTint(player.index ? 0x82ffdc : 0xffbe9a).setAlpha(0.4).setDepth(7);
      this.tweens.add({ targets: echo, alpha: 0, duration: 210, onComplete: () => echo.destroy() });
    }
    burst(x, y, tint, count = 10, speed = 130) {
      if (!this.options.effects) return;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * TAU;
        const distance = speed * (0.15 + Math.random() * 0.35);
        const particle = this.add.image(x, y, 'particle').setTint(tint).setScale(0.25 + Math.random() * 0.45).setDepth(12);
        this.tweens.add({ targets: particle, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance + 15, alpha: 0, scale: 0.05, duration: 240 + Math.random() * 220, onComplete: () => particle.destroy() });
      }
    }
    floatText(x, y, text, fill) {
      const label = this.add.text(x, y, text, { fontFamily: 'Arial, Microsoft YaHei', fontSize: '13px', fontStyle: 'bold', color: fill, stroke: '#183e33', strokeThickness: 4 }).setOrigin(0.5).setDepth(15);
      this.tweens.add({ targets: label, y: y - 44, alpha: 0, delay: 170, duration: 850, onComplete: () => label.destroy() });
    }
    finish() {
      if (this.finished) return;
      this.finished = true; this.running = false; Input.enabled = false;
      this.physics.pause(); Audio.music(this.level.world, false); Audio.play('win');
      this.players.forEach(player => { player.setVelocity(0, 0); this.burst(player.x, player.y - 30, 0xffdc90, 30, 250); });
      const result = { index: this.levelIndex, world: this.level.world, stage: this.level.stage, name: this.level.name, time: this.elapsed, par: this.level.par, coins: this.coins, relics: this.relics, deaths: this.deaths };
      result.earned = Store.complete(this.levelIndex, result);
      UI.update(this);
      this.time.delayedCall(650, () => UI.result(result));
    }
    pauseRun() {
      this.running = false; Input.enabled = false; this.physics.pause(); this.tweens.pauseAll();
      Audio.music(this.level.world, false);
    }
    resumeRun() {
      if (this.previewMode || this.finished) return;
      this.running = true; this.physics.resume(); this.tweens.resumeAll();
      Input.enabled = true; Audio.music(this.level.world, true);
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 960,
    height: 540,
    backgroundColor: '#173c32',
    transparent: false,
    antialias: true,
    roundPixels: true,
    powerPreference: 'default',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { y: 1500 }, debug: false, fps: 60, fixedStep: true } },
    input: { activePointers: 8, keyboard: false, mouse: false, touch: false },
    audio: { noAudio: true },
    render: { antialias: true, pixelArt: false, maxTextures: 8 },
    fps: { target: 60, forceSetTimeOut: false },
    scene: [Adventure]
  });
  window.EmberGame = {
    start(index, mode, settings) {
      if (current) current.scene.restart({ index, mode, settings, play: true });
      else game.scene.start('Adventure', { index, mode, settings, play: true });
    },
    preview() {
      Input.clear();
      if (current) current.scene.restart({ index: 0, mode: UI.mode, play: false });
    },
    pause() { current?.pauseRun(); },
    resume() { current?.resumeRun(); },
    canResume() { return !!current && !current.previewMode && !current.finished; },
    recall() { current?.recall(); },
    info() { return current?.level; },
    applySettings(settings) {
      if (!current) return;
      current.options.effects = settings.effects;
      current.options.assist = settings.assist;
      current.players.forEach(player => {
        const oldMax = player.maxHP; player.maxHP = settings.assist ? 5 : 3;
        if (!player.dead) player.hp = clamp(player.hp + Math.max(0, player.maxHP - oldMax), 1, player.maxHP);
      });
      UI.update(current);
    }
  };
})();
