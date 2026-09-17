/* 云端一跃 — Three.js r128 / local dependency; no network assets at runtime. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  function fail(message) { $('loading').classList.remove('hidden'); $('load-text').textContent = message; $('load-retry').classList.remove('hidden'); }
  if (!window.THREE) { fail('3D 引擎未能加载，请刷新重试。'); return; }
  const T = THREE, TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => mix(a, b, Math.random());
  const vec = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: $('game'), antialias: true, alpha: false, powerPreference: 'high-performance' }); }
  catch (_) { fail('这台设备暂时无法开启 WebGL 3D，请换用支持硬件加速的浏览器。'); return; }
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0xd5e9e4);
  const scene = new T.Scene();
  scene.fog = new T.Fog(0xd5e9e4, 35, 85);
  const camera = new T.OrthographicCamera(-12,12,9,-9,.1,150);
  const cameraOffset = vec(12,16,22), camRight = vec(22,0,-12).normalize();
  const focus = vec(), goal = vec();
  scene.add(new T.HemisphereLight(0xf1fcff, 0x859e99, .95));
  const sun = new T.DirectionalLight(0xffefce, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera, { left:-14, right:14, top:14, bottom:-14, near:1, far:65 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .035;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(0x94dadd, .65); fill.position.set(-10,6,-10); scene.add(fill);

  const MAT = {};
  function material(color, metalness=0, roughness=.65) {
    const key = color + ':' + metalness + ':' + roughness;
    return MAT[key] || (MAT[key] = new T.MeshStandardMaterial({ color, metalness, roughness }));
  }
  const GEO = {};
  const sphere = (segments=16) => GEO['sphere'+segments] || (GEO['sphere'+segments] = new T.SphereGeometry(1,segments,Math.floor(segments*.7)));
  const cylinder = n => GEO['cyl'+n] || (GEO['cyl'+n] = new T.CylinderGeometry(1,1,1,n));
  const box = new T.BoxGeometry(1,1,1), gem = new T.OctahedronGeometry(1), dustGeo = new T.IcosahedronGeometry(1,0);
  function mesh(geo, mat, parent, x=0,y=0,z=0, sx=1,sy=sx,sz=sx) {
    const m = new T.Mesh(geo,mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function ball(parent, color,x,y,z,sx,sy=sx,sz=sx) { return mesh(sphere(),material(color),parent,x,y,z,sx,sy,sz); }
  function disc(parent,color,r,h,y,n=48) { return mesh(cylinder(n),material(color),parent,0,y,0,r,h,r); }
  const ringGeo = new T.TorusGeometry(1,.026,6,64);
  function ring(parent,color,r,y) {
    const m = mesh(ringGeo,material(color,.25,.35),parent,0,y,0,r,r,r); m.rotation.x = -Math.PI/2; return m;
  }
  const palettes = [
    {side:0x86b8ad,trim:0xcce8cf,top:0xf4edcf,accent:0x388f79,flower:0xffa98c},
    {side:0xd49b87,trim:0xf0c4a0,top:0xffeed2,accent:0xd37863,flower:0xffd668},
    {side:0x999fc5,trim:0xcccae9,top:0xf0e7f3,accent:0x8e87bc,flower:0xeeb6d1},
    {side:0x87b7c6,trim:0xb9e4df,top:0xe9f3df,accent:0x3b9eab,flower:0xffc787}
  ];
  const platforms = [], decorations = [], effects = [];
  const G = {state:'menu', score:0,best:0,combo:0,maxCombo:0,cur:0,power:0,jumps:0,time:0,landTime:9,fallTime:0,quality:true,shake:0,muted:false};
  const P = {pos:vec(), from:vec(), dir:vec(1,0,0), time:0,duration:.8,distance:0,fallVelocity:0,rotation:0};
  try { G.best = Math.max(0,parseInt(localStorage.getItem('jump_game_best'),10)||0); G.muted = localStorage.getItem('jump_game_muted') === '1'; } catch (_) {}

  // Synthesized chimes + a live pitch-rising charge tone, always released on cancellation.
  const sound = {
    ac:null, chargeNode:null,
    unlock() { try { if(!this.ac) this.ac = new (window.AudioContext||window.webkitAudioContext)(); if(this.ac.state==='suspended') this.ac.resume().catch(()=>{}); } catch (_) {} },
    note(freq=440,dur=.15,delay=0,type='sine',vol=.06,end=null) {
      if(G.muted || !this.ac) return;
      const a=this.ac,t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();
      o.type=type;o.frequency.setValueAtTime(freq,t);if(end) o.frequency.exponentialRampToValueAtTime(end,t+dur);
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
      o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+dur+.03);o.onended=()=>{o.disconnect();g.disconnect();};
    },
    startCharge() {
      this.stopCharge(); if(G.muted || !this.ac) return;
      const a=this.ac,o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=150;
      g.gain.setValueAtTime(0,a.currentTime);g.gain.linearRampToValueAtTime(.025,a.currentTime+.08);
      o.connect(g);g.connect(a.destination);o.start();this.chargeNode={o,g};
    },
    stopCharge() {
      if(!this.chargeNode) return;const {o,g}=this.chargeNode;this.chargeNode=null;
      try {g.gain.cancelScheduledValues(this.ac.currentTime);g.gain.setTargetAtTime(.0001,this.ac.currentTime,.02);o.stop(this.ac.currentTime+.12);o.onended=()=>{o.disconnect();g.disconnect();};}catch(_){}
    },
    chord(combo=0) {[523.25,659.25,783.99,1046.5].forEach((f,i)=>this.note(f*(1+Math.min(combo,6)*.035),.28,i*.065,'sine',.055));}
  };

  function flower(parent,x,z,color,scale=1) {
    const f=new T.Group();f.position.set(x,.05,z);f.scale.setScalar(scale);parent.add(f);
    mesh(cylinder(6),material(0x59997d),f,0,.19,0,.022,.38,.022);
    const leaf=ball(f,0x69ae8c,.09,.15,0,.14,.04,.065);leaf.rotation.z=.35;
    for(let i=0;i<5;i++){const a=i*TAU/5;ball(f,color,Math.cos(a)*.12,.4,Math.sin(a)*.12,.115,.07,.115);}
    ball(f,0xffd56e,0,.43,0,.07,.05,.07);
  }
  function platform(x,z,r,index,instant=false) {
    const group=new T.Group();group.position.set(x,0,z);scene.add(group);
    const pal=palettes[Math.floor(index/5)%palettes.length], n=index%3===1?6:index%3===2?8:48;
    // Layered ceramic / sandstone islands, chamfered by inset top and bottom tiers.
    disc(group,pal.side,r*.94,1.02,-.73,n);
    disc(group,pal.trim,r, .16,-.18,n);
    disc(group,pal.top,r*.97,.14,-.055,n);
    disc(group,pal.trim,r*.83,.14,-1.28,n);
    const bottom=mesh(gem,material(pal.side),group,0,-1.55,0,r*.70,.70,r*.70);bottom.rotation.y=Math.PI/4;
    // Brass rim and a painted center landing target.
    ring(group,0xd5b879,.39,.028);
    disc(group,pal.accent,.22,.015,.023,48);
    disc(group,0xffefb4,.065,.02,.035,24);
    for(let i=0;i<(index===0?8:5);i++) {
      const a=i*TAU/(index===0?8:5)+.3;
      const rivet=ball(group,0xf8e7b1,Math.sin(a)*r*.96,-.4,Math.cos(a)*r*.96,.045);rivet.castShadow=false;
    }
    // Garden details stay at the back rim, leaving the landing surface readable.
    flower(group,-r*.64,-r*.35,pal.flower,.85);
    flower(group,-r*.30,-r*.73,0xfff7df,.62);
    const stone=ball(group,pal.accent,-r*.64,-.015,-r*.48,.26,.1,.20);
    stone.rotation.y=.6;
    if(index%4===2) {
      const crystal=mesh(gem,material(0x9bdccf,.22,.25),group,r*.50,.29,-r*.57,.14,.40,.14);crystal.rotation.z=-.15;
      mesh(gem,material(0xd2f5db,.1,.25),group,r*.67,.15,-r*.40,.1,.25,.1);
    }
    // Dangling vines and pearl leaves below the rim.
    for(let j=0;j<2;j++) {
      const vx=(-.6+j*.95)*r,vz=.65*r;
      for(let k=0;k<4;k++) ball(group,k%2?0x75a98a:0x93c09a,vx+Math.sin(k)*.08,-.25-k*.22,vz,.12,.19,.065);
    }
    const p={group,x,z,r,n,index,born:instant?-99:G.time,bounce:9,pal};platforms.push(p);return p;
  }
  function spawnNext(instant=false) {
    const prev=platforms[platforms.length-1],index=prev.index+1;
    const r=rand(1.22,1.65)-Math.min(G.score/250,.18);
    const distance=rand(4.4,6.4)+Math.min(G.score/60,.8);
    // Both axes lead screen-right, but the path alternates in actual 3D space.
    let dx=1,dz=0;
    if(index>1 && Math.random()<.48) {dx=0;dz=-1;}
    return platform(prev.x+dx*distance,prev.z+dz*distance,r,index,instant);
  }
  function clearPlatforms() { for(const p of platforms) scene.remove(p.group);platforms.length=0; }

  // Astronaut: a soft ceramic suit, honey helmet, glass visor, backpack and little scarf.
  const playerRoot=new T.Group(), flipPivot=new T.Group(), model=new T.Group();
  scene.add(playerRoot);playerRoot.add(flipPivot);flipPivot.add(model);model.position.y=-.78;
  ball(model,0xfff2d2,0,.55,0,.34,.43,.29);
  ball(model,0xfbc76a,0,1.12,0,.48,.46,.42);
  const visor=ball(model,0x174b50,0,1.14,.325,.37,.25,.14);visor.material=material(0x174b50,.45,.19);
  const glass=ball(model,0x94dace,-.15,1.25,.444,.09,.035,.015);glass.rotation.z=.3;
  const eyes=[];
  const eyeMat=new T.MeshBasicMaterial({color:0xbdfff0});
  for(const s of [-1,1]) eyes.push(mesh(sphere(),eyeMat,model,s*.115,1.135,.462,.033,.059,.015));
  const boots=[],arms=[];
  for(const s of [-1,1]) {
    boots.push(ball(model,0x518e83,s*.20,.12,.07,.18,.13,.235));
    const arm=new T.Group();arm.position.set(s*.32,.73,0);model.add(arm);
    ball(arm,0xffedce,s*.065,-.12,0,.12,.22,.12);ball(arm,0x599b8e,s*.10,-.29,.01,.13);arms.push(arm);
  }
  mesh(box,material(0x77aaa1),model,0,.64,-.29,.43,.45,.21);
  for(const s of [-1,1]) mesh(cylinder(12),material(0xf4d897,.3),model,s*.19,.57,-.35,.07,.37,.07);
  const belt=disc(model,0x70b3a2,.31,.09,.37,32);
  ball(model,0xffb578,0,.72,.285,.1,.095,.025);
  mesh(cylinder(8),material(0xc5a36b,.4),model,.25,1.63,0,.022,.29,.022);
  const antenna=ball(model,0x96e4be,.25,1.81,0,.073);
  antenna.material=new T.MeshStandardMaterial({color:0xa7edc8,emissive:0x61c8a0,emissiveIntensity:.5,roughness:.35});
  const collar=ring(model,0xe78f70,.34,.89);collar.scale.z=.88;
  const scarf=new T.Group();scarf.position.set(-.25,.86,-.16);model.add(scarf);
  const tail=mesh(box,material(0xe78f70),scarf,-.16,-.04,-.15,.22,.055,.48);tail.rotation.y=.4;tail.rotation.x=-.25;

  // A soft contact shadow complements real-time directional shadows.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const sctx=shadowCanvas.getContext('2d'),gradient=sctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(31,68,57,.44)');gradient.addColorStop(.45,'rgba(31,68,57,.23)');gradient.addColorStop(1,'rgba(31,68,57,0)');
  sctx.fillStyle=gradient;sctx.fillRect(0,0,64,64);
  const shadowTex=new T.CanvasTexture(shadowCanvas);
  const shadow=new T.Mesh(new T.PlaneGeometry(1.7,1.7),new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const chargeHalo=ring(scene,0x60cbae,.72,.045);chargeHalo.visible=false;
  const targetHalo=ring(scene,0xefbc60,.53,.05);
  const beacon=new T.Group();scene.add(beacon);
  const beaconGem=mesh(gem,material(0xe6b967,.4,.22),beacon,0,0,0,.16,.25,.16);
  const beacRing=ring(beacon,0xf6daa2,.27,0);

  // Small reusable instanced particles: sparks, confetti, take-off dust and luminous trails.
  const CAP=240,slots=Array.from({length:CAP},()=>({life:0,max:1,pos:vec(),vel:vec(),size:.1,gravity:0}));
  const particleMaterial=new T.MeshBasicMaterial({color:0xffffff});
  const particleMesh=new T.InstancedMesh(dustGeo,particleMaterial,CAP);particleMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);particleMesh.frustumCulled=false;scene.add(particleMesh);
  const dummy=new T.Object3D();let particleCursor=0;
  function emit(pos,count,color,force=2,life=.7,gravity=4) {
    if(reduced) count=Math.ceil(count*.35);
    for(let i=0;i<count;i++) {
      const q=slots[particleCursor++%CAP],a=rand(0,TAU),speed=rand(.25,force);
      q.pos.copy(pos);q.pos.y+=.08;q.vel.set(Math.cos(a)*speed,rand(.4,force*1.4),Math.sin(a)*speed);
      q.life=q.max=rand(life*.5,life);q.size=rand(.035,.10);q.gravity=gravity;
      particleMesh.setColorAt((particleCursor-1)%CAP,new T.Color(color));
    }
    if(particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate=true;
  }
  function ripple(pos,color=0xffdd93,count=1) {
    for(let i=0;i<count;i++) {
      const mat=new T.MeshBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false});
      const m=new T.Mesh(ringGeo,mat);m.rotation.x=-Math.PI/2;m.position.copy(pos);m.position.y+=.045+i*.02;scene.add(m);
      effects.push({mesh:m,life:.65+i*.17,max:.65+i*.17,start:.2+i*.22});
    }
  }
  function clearFX() {
    for(const e of effects){scene.remove(e.mesh);e.mesh.material.dispose();}effects.length=0;
    for(const q of slots) q.life=0;
  }

  // Cloud sculptures + tiny floating gardens form a light, low-poly diorama background.
  const cloudMat=new T.MeshStandardMaterial({color:0xf9f7ec,roughness:1});
  for(let i=0;i<18;i++) {
    const group=new T.Group();scene.add(group);
    for(let j=0;j<5;j++) {
      const m=mesh(sphere(12),cloudMat,group,(j-2)*.75,rand(-.12,.3),rand(-.45,.45),rand(.9,1.35),rand(.42,.75),rand(.7,1.1));
      m.castShadow=m.receiveShadow=false;
    }
    const d={group,ox:rand(-32,32),oz:rand(-28,24),y:rand(-9,-4),phase:rand(0,TAU),speed:rand(.06,.18)};
    if(i<4) {d.ox=(i%2?1:-1)*(12+i*2);d.oz=-5-i*4;d.y=-2-i*.8;}
    group.scale.setScalar(rand(1,2.4));decorations.push(d);
  }
  for(let i=0;i<7;i++) {
    const group=new T.Group();scene.add(group);const r=rand(.8,1.5);
    const rock=mesh(gem,material(0xa6bbb2),group,0,-.8,0,r,1.1,r);rock.rotation.y=.3;
    disc(group,0xc5d7b2,r,.24,0,7);
    mesh(cylinder(8),material(0xbaaa85),group,0,.5,0,.075,1,.075);
    ball(group,i%2?0xf0c5a6:0x8fb9a1,0,1.2,0,.6,.8,.6);
    ball(group,i%2?0xf3d1b4:0xb5caa4,.35,1.07,.1,.42,.6,.42);
    decorations.push({group,ox:rand(-25,25),oz:rand(-26,-12),y:rand(-4,-1),phase:rand(0,TAU),speed:0});
  }
  const motesGeo=new T.BufferGeometry(),motePositions=new Float32Array(70*3);
  for(let i=0;i<70;i++) {motePositions[i*3]=rand(-22,22);motePositions[i*3+1]=rand(-3,8);motePositions[i*3+2]=rand(-22,22);}
  motesGeo.setAttribute('position',new T.BufferAttribute(motePositions,3));
  const motes=new T.Points(motesGeo,new T.PointsMaterial({color:0xfff4cc,size:.045,transparent:true,opacity:.75}));scene.add(motes);

  let width=innerWidth,height=innerHeight,viewHalf=9,activePointer=null,activeKey=null,lastFrame=0,toastUntil=0,trailTimer=0,chargeTimer=0;
  let contextLost=false;
  const CHARGE_TIME=1.25,D_MIN=.6,D_MAX=9.4,PERFECT_R=.28;
  function syncHUD() { $('score').textContent=G.score;$('best').textContent=G.best; }
  function toast(text,perfect=false) {
    $('toast').textContent=text;$('toast').classList.remove('hidden');$('toast').classList.toggle('perfect',perfect);
    $('toast').classList.remove('pop');void $('toast').offsetWidth;$('toast').classList.add('pop');toastUntil=G.time+1.5;
  }
  function soundUI() {$('sound').textContent=G.muted?'音效 · 关':'音效 · 开';$('sound').setAttribute('aria-pressed',String(!G.muted));}
  function updateChargeUI() {
    $('charge-fill').style.transform=`scaleX(${G.power})`;$('power').textContent=Math.round(G.power*100)+'%';
    $('charge-track').classList.toggle('charging',G.state==='charging');
    $('charge-status').textContent=G.state==='charging'?(G.power>=1?'已蓄满 · 松手起跳':'蓄力中 · 松手起跳'):G.state==='flying'?'飞行中':G.state==='falling'?'下次会更好':'长按屏幕 / 空格';
  }
  function aim() {
    const next=platforms[G.cur+1];if(next)P.dir.set(next.x-P.pos.x,0,next.z-P.pos.z).normalize();
  }
  function reset(menu=false) {
    cancelCharge();clearPlatforms();clearFX();
    Object.assign(G,{state:menu?'menu':'idle',score:0,combo:0,maxCombo:0,cur:0,power:0,jumps:0,landTime:9,shake:0,fallTime:0});
    P.pos.set(0,0,0);P.time=0;P.rotation=0;P.fallVelocity=0;
    platform(0,0,1.8,0,true);spawnNext(true);
    if(menu) {platform(9,-3,1.4,2,true);platform(9,-8.4,1.25,3,true);}
    aim();focus.copy(cameraGoal());syncHUD();updateChargeUI();$('toast').classList.add('hidden');
  }
  function start() {
    if(contextLost)return;sound.unlock();reset();$('overlay').classList.add('hidden');document.body.classList.remove('menu');
    $('hint').textContent='按住蓄力，松手跃向金色标记';sound.note(523,.15);sound.note(784,.25,.1);
  }
  function beginCharge() {
    if(G.state!=='idle'||contextLost||document.hidden)return;
    sound.unlock();G.state='charging';G.power=0;chargeTimer=0;sound.startCharge();
  }
  function cancelCharge() {sound.stopCharge();if(G.state==='charging'){G.state='idle';G.power=0;}activePointer=null;activeKey=null;}
  function jump(power) {
    if(G.state!=='idle'&&G.state!=='charging')return;
    power=clamp(Number(power)||0,0,1);sound.stopCharge();aim();
    P.from.copy(P.pos);P.time=0;P.duration=.68+power*.32;P.distance=mix(D_MIN,D_MAX,power);
    G.state='flying';G.power=0;G.jumps++;P.rotation=0;
    emit(P.pos,20,0xffe6b1,2,.5,5);ripple(P.pos,0xd7f5d8);
    sound.note(230+power*140,.2,0,'triangle',.05,700);updateChargeUI();
  }
  function release() {if(G.state==='charging')jump(G.power);activePointer=null;activeKey=null;}
  function contains(p,x,z,margin=0) {
    const dx=x-p.x,dz=z-p.z,r=p.r*.97+margin;
    if(p.n===48) return dx*dx+dz*dz<=r*r;
    // Exact half-plane test for the hexagonal/octagonal top (not its bounding circle).
    for(let i=0;i<p.n;i++) {
      const a=(i+.5)*TAU/p.n;
      if(dx*Math.sin(a)+dz*Math.cos(a)>r*Math.cos(Math.PI/p.n))return false;
    }
    return true;
  }
  function land() {
    let hit=-1;
    for(let i=G.cur;i<Math.min(G.cur+2,platforms.length);i++)if(contains(platforms[i],P.pos.x,P.pos.z,.04))hit=i;
    if(hit<0) {G.state='falling';G.fallTime=0;P.fallVelocity=-3;sound.note(240,.45,0,'triangle',.06,70);$('hint').textContent='差一点点，下次再试一次';return;}
    P.pos.y=0;P.rotation=0;G.landTime=0;G.state='idle';const p=platforms[hit];p.bounce=0;
    const perfect=Math.hypot(P.pos.x-p.x,P.pos.z-p.z)<=PERFECT_R;
    emit(P.pos,16,0xfff1d3,2.5,.65,5);ripple(P.pos,0xe8f7d6);G.shake=reduced?0:.07;
    if(hit===G.cur) {toast('蓄力再久一点');sound.note(220,.15);aim();return;}
    G.cur=hit;G.combo=perfect?G.combo+1:0;G.maxCombo=Math.max(G.maxCombo,G.combo);
    const gain=perfect?2+Math.min(G.combo-1,4):1;G.score+=gain;
    if(G.score>G.best) {G.best=G.score;try{localStorage.setItem('jump_game_best',String(G.best));}catch(_){}}
    if(perfect) {
      toast(G.combo>1?`完美 ×${G.combo}  +${gain}`:`正中圆心！ +${gain}`,true);
      emit(P.pos,70,0xf4c565,4,1.25,3.5);emit(P.pos,20,0x78cbb4,3,1.15,2.6);ripple(P.pos,0xffd26d,3);sound.chord(G.combo);
      G.shake=reduced?0:.13;
      if(!reduced){$('flash').classList.remove('burst');void $('flash').offsetWidth;$('flash').classList.add('burst');}
      if(navigator.vibrate) navigator.vibrate(18);
    } else {toast('稳稳落地  +1');sound.note(330,.12);sound.note(520,.18,.055);}
    $('score').classList.remove('bump');void $('score').offsetWidth;$('score').classList.add('bump');
    spawnNext();while(G.cur>3){scene.remove(platforms.shift().group);G.cur--;}
    aim();syncHUD();
    $('hint').textContent=G.combo>1?`连续命中 ${G.combo} 次 · 连击加分最高 +6`:'落在金色圆心，收获完美连击';
    if(p.index%5===0) toast(['云屿花园','蜜桃浮洲','暮紫梦境','薄荷晴空'][Math.floor(p.index/5)%4]+' · 新的风景');
  }
  function over() {
    G.state='over';sound.stopCharge();$('overlay').classList.remove('hidden');document.body.classList.add('menu');
    $('ov-title').textContent=G.score>0?'每一跃，都算数。':'再借一点风。';
    $('ov-desc').textContent='不必着急。找到蓄力的节奏，再向云端出发。';
    $('stats').classList.remove('hidden');$('final-score').textContent=G.score;$('final-best').textContent=G.best;
    $('ov-note').textContent=`本局跳跃 ${G.jumps} 次 · 最高完美连击 ${G.maxCombo} 次`;$('start').textContent='再来一局';
    updateChargeUI();
  }
  function cameraGoal() {
    const a=platforms[G.cur],b=platforms[G.cur+1]||a;
    goal.set((a.x+b.x)*.5,.25,(a.z+b.z)*.5);
    if(G.state==='menu') {
      if(width>760)goal.addScaledVector(camRight,-3.8);
      else goal.y=-1.9;
    }
    return goal;
  }
  function resize() {
    width=innerWidth;height=innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,G.quality?1.65:1));renderer.setSize(width,height,false);
    const aspect=width/height;viewHalf=Math.max(7.6,6.4/aspect);
    camera.left=-viewHalf*aspect;camera.right=viewHalf*aspect;camera.top=viewHalf;camera.bottom=-viewHalf;camera.updateProjectionMatrix();
  }
  function update(dt) {
    G.time+=dt;G.landTime+=dt;
    if(G.state==='charging') {
      G.power=Math.min(1,G.power+dt/CHARGE_TIME);chargeTimer+=dt;
      if(sound.chargeNode)sound.chargeNode.o.frequency.setTargetAtTime(150+G.power*530,sound.ac.currentTime,.04);
      if(chargeTimer>.075) {
        chargeTimer=0;const a=rand(0,TAU),pos=P.pos.clone().add(vec(Math.sin(a)*.6,.05,Math.cos(a)*.6));
        emit(pos,2,G.power>.85?0xf1bc61:0x8edcc2,.3,.38,-.4);
      }
    }
    if(G.state==='flying') {
      P.time+=dt;const t=Math.min(1,P.time/P.duration);
      P.pos.copy(P.from).addScaledVector(P.dir,P.distance*t);
      P.pos.y=4*(2.05+P.distance*.085)*t*(1-t);
      P.rotation=reduced?0:-TAU*(t*t*(3-2*t));
      trailTimer+=dt;if(trailTimer>.026){trailTimer=0;emit(P.pos.clone().add(vec(0,.6,0)),3,0xffdc93,.20,.43,-.15);}
      if(t>=1)land();
    } else if(G.state==='falling') {
      G.fallTime+=dt;P.fallVelocity-=18*dt;P.pos.y+=P.fallVelocity*dt;
      P.pos.addScaledVector(P.dir,dt*1.3);P.rotation-=dt*4;
      if(G.fallTime>1.1)over();
    }
    // Exponentially damped camera translation: no abrupt snaps at turns or landings.
    focus.lerp(cameraGoal(),1-Math.exp(-dt*(G.state==='menu'?2:3.4)));
    camera.position.copy(focus).add(cameraOffset);
    if(G.shake>.001){camera.position.add(vec(Math.sin(G.time*89)*G.shake,Math.cos(G.time*103)*G.shake,0));G.shake*=Math.exp(-dt*12);}
    camera.lookAt(focus);
    sun.position.copy(focus).add(vec(-9,19,10));sun.target.position.copy(focus);
    const squash=G.state==='charging'?G.power*.38:G.landTime<.6?Math.sin(G.landTime*25)*Math.exp(-G.landTime*8)*.26:0;
    const idle=(G.state==='idle'||G.state==='menu')?Math.sin(G.time*2.7)*.015:0;
    playerRoot.scale.set(1+squash*.40,1-squash+idle,1+squash*.40);
    playerRoot.position.copy(P.pos);playerRoot.position.y+=.78*(1-squash+idle);
    // Face the viewer, with a slight anticipation lean toward the next island.
    playerRoot.rotation.y=.40;flipPivot.rotation.z=P.rotation;
    flipPivot.rotation.x=G.state==='charging'?-.13*G.power:0;
    for(let i=0;i<arms.length;i++)arms[i].rotation.z=(i===0?1:-1)*(G.state==='flying'?.95: .1+G.power*.55+Math.sin(G.time*3)*.06);
    boots.forEach((b,i)=>{b.position.y=.12+(G.state==='flying'?Math.sin(P.time*12+i*Math.PI)*.08:0);});
    scarf.rotation.x=Math.sin(G.time*(G.state==='flying'?22:5))*.18+(G.state==='flying'?-.7:0);
    const blink=(G.time%4.7>4.54)||G.power>.65;eyes.forEach(e=>e.scale.y=blink?.013:.059);
    playerRoot.visible=G.state!=='over';
    shadow.position.set(P.pos.x,.032,P.pos.z);shadow.visible=P.pos.y>=0 && platforms.some(p=>contains(p,P.pos.x,P.pos.z));
    shadow.scale.setScalar(1+Math.max(0,P.pos.y)*.12);shadow.material.opacity=clamp(1-P.pos.y*.17,.15,1);
    chargeHalo.visible=G.state==='charging';chargeHalo.position.set(P.pos.x,.06,P.pos.z);
    chargeHalo.scale.setScalar(.60+G.power*.5+Math.sin(G.time*16)*.035);chargeHalo.rotation.z=G.time;
    const next=platforms[G.cur+1];
    if(next){targetHalo.position.set(next.x,.05,next.z);targetHalo.scale.setScalar(.50+Math.sin(G.time*2)*.055);beacon.position.set(next.x,1.30+Math.sin(G.time*2.3)*.13,next.z);}
    beaconGem.rotation.y=G.time;beacRing.rotation.z=G.time*.3;
    beacon.visible=G.state!=='over';targetHalo.visible=G.state!=='over';
    for(const p of platforms) {
      p.bounce+=dt;const age=G.time-p.born;
      const entrance=age<.65?Math.pow(1-age/.65,3)*3:0;
      // Keep the top collision plane fixed: compress the island beneath it, never move its surface.
      p.group.position.y=-entrance;
      p.group.scale.y=1+(p.bounce<.6?Math.sin(p.bounce*20)*Math.exp(-p.bounce*8)*.1:0);
    }
    for(const d of decorations){d.group.position.set(focus.x+d.ox+Math.sin(G.time*.05+d.phase)*.7,d.y+Math.sin(G.time*.3+d.phase)*.16,focus.z+d.oz);}
    motes.position.set(focus.x,Math.sin(G.time*.2)*.2,focus.z);motes.rotation.y=G.time*.008;
    for(let i=0;i<CAP;i++) {
      const q=slots[i];q.life-=dt;
      if(q.life>0){q.vel.y-=q.gravity*dt;q.pos.addScaledVector(q.vel,dt);dummy.position.copy(q.pos);dummy.rotation.set(q.life*2,q.life*3,0);dummy.scale.setScalar(q.size*Math.min(1,q.life/q.max*2));}
      else dummy.scale.setScalar(0);
      dummy.updateMatrix();particleMesh.setMatrixAt(i,dummy.matrix);
    }
    particleMesh.instanceMatrix.needsUpdate=true;
    for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;if(e.life<=0){scene.remove(e.mesh);e.mesh.material.dispose();effects.splice(i,1);continue;}const t=1-e.life/e.max;e.mesh.scale.setScalar(e.start+t*2.6);e.mesh.material.opacity=(1-t)*.7;}
    if(G.time>toastUntil)$('toast').classList.add('hidden');
    updateChargeUI();
  }

  const canvas=$('game');
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0 || activePointer!==null || activeKey!==null || G.state!=='idle')return;
    e.preventDefault();activePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);beginCharge();
  });
  canvas.addEventListener('pointerup',e=>{if(e.pointerId===activePointer){e.preventDefault();release();}});
  canvas.addEventListener('pointercancel',e=>{if(e.pointerId===activePointer)cancelCharge();});
  canvas.addEventListener('lostpointercapture',e=>{if(e.pointerId===activePointer)cancelCharge();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  const jumpKeys=['Space','Enter','ArrowUp','KeyW'];
  window.addEventListener('keydown',e=>{
    if(!jumpKeys.includes(e.code)||e.target.closest('button,a,input,select,summary'))return;
    e.preventDefault();if(e.repeat||activeKey!==null||activePointer!==null)return;
    if(G.state==='menu'||G.state==='over'){start();return;}
    if(G.state==='idle'){activeKey=e.code;beginCharge();}
  });
  window.addEventListener('keyup',e=>{if(e.code===activeKey){e.preventDefault();release();}});
  window.addEventListener('blur',cancelCharge);
  document.addEventListener('visibilitychange',()=>{cancelCharge();lastFrame=0;if(document.hidden&&sound.ac)sound.ac.suspend().catch(()=>{});});
  $('start').addEventListener('click',e=>{start();e.currentTarget.blur();});
  $('restart').addEventListener('click',e=>{start();e.currentTarget.blur();});
  $('sound').addEventListener('click',e=>{sound.unlock();G.muted=!G.muted;sound.stopCharge();soundUI();try{localStorage.setItem('jump_game_muted',String(+G.muted));}catch(_){}e.currentTarget.blur();});
  $('quality').addEventListener('click',e=>{
    G.quality=!G.quality;renderer.shadowMap.enabled=G.quality;scene.traverse(o=>{if(o.isMesh&&o.material)o.material.needsUpdate=true;});
    $('quality').textContent=G.quality?'画质 · 高清':'画质 · 流畅';$('quality').setAttribute('aria-pressed',String(G.quality));resize();e.currentTarget.blur();
  });
  $('help').addEventListener('click',()=>{$('help-panel').classList.toggle('hidden');$('help').setAttribute('aria-expanded',String(!$('help-panel').classList.contains('hidden')));});
  $('load-retry').addEventListener('click',()=>location.reload());
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelCharge();fail('3D 画面已暂停，请刷新重新开启。最高分已保存。');});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  window.addEventListener('resize',resize);
  if(window.visualViewport)visualViewport.addEventListener('resize',resize);
  function frame(ts) {
    requestAnimationFrame(frame);if(contextLost||document.hidden){lastFrame=0;return;}
    const dt=lastFrame?Math.min((ts-lastFrame)/1000,.05):0;lastFrame=ts;
    update(dt);renderer.render(scene,camera);
  }
  resize();reset(true);soundUI();$('loading').classList.add('hidden');requestAnimationFrame(frame);
  // Readable compatibility / deterministic smoke-test API; gameplay does not depend on it.
  window.JumpGame={G,P,D_MIN,D_MAX,PERFECT_R,CHARGE_TIME,start,charge:beginCharge,release,cancel:cancelCharge,jump,plats:()=>platforms,step(dt){update(clamp(dt,0,.05));renderer.render(scene,camera);},contains,renderer,scene,camera};
})();
