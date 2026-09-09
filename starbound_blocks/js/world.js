(function () {
  'use strict';
  const S = StarBlocks, T = THREE;
  const FACES = [
    { n: [1,0,0], v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], light: .79 },
    { n: [-1,0,0], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], light: .66 },
    { n: [0,1,0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], light: 1 },
    { n: [0,-1,0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], light: .46 },
    { n: [0,0,1], v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], light: .88 },
    { n: [0,0,-1], v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], light: .7 }
  ];
  const key = S.key = (x,y,z) => `${x},${y},${z}`;
  const box = new T.BoxGeometry(1,1,1);
  S.World = class {
    constructor(game, id) {
      this.game = game; this.id = id; this.cfg = S.PLANETS[id]; this.blocks = new Map(); this.chunks = new Map(); this.materials = [];
      this.group = new T.Group(); this.decor = new T.Group(); this.group.add(this.decor); game.scene.add(this.group);
      this.creatures = []; this.drones = []; this.beacons = []; this.foliage = [];
      this.shipPosition = new T.Vector3(3,5,9); this.ruinPosition = new T.Vector3(-15,5,-15);
      this.generate(); this.createAtlas(); this.rebuildAll(); this.createScenery(); this.batchScenery();
    }
    raw(x,y,z,id) { this.blocks.set(key(x,y,z), id); }
    get(x,y,z) { return this.blocks.get(key(x,y,z)) || 0; }
    height(x,z) {
      x = Math.floor(x); z = Math.floor(z);
      for (let y = 31; y >= -4; y--) if (this.get(x,y,z)) return y + 1;
      return -3;
    }
    surface(x,z) {
      const seed = this.cfg.seed;
      let h = Math.floor(3.6 + Math.sin((x+seed)*.13)*1.8 + Math.cos((z-seed)*.12)*1.7 + Math.sin((x+z)*.22)*.8);
      if (z < -18) h += Math.floor((-z-18) * .4 + Math.sin(x*.21)*2);
      if ((x+10)**2+(z-5)**2 < 36) h = 0;
      if (Math.hypot(x-3,z-10) < 9) h = 4;
      if (Math.hypot(x+15,z+15) < 6) h = 4;
      return Math.max(0,h);
    }
    generate() {
      const rand = S.random(this.cfg.seed), cfg = this.cfg;
      for (let x = -S.SIZE; x < S.SIZE; x++) for (let z = -S.SIZE; z < S.SIZE; z++) {
        const h = this.surface(x,z);
        for (let y = -4; y <= h; y++) {
          let b = y === -4 ? 13 : y === h ? cfg.ground : cfg.stone;
          if (y > -4 && y < h && rand() < .09) b = rand() < .6 ? 5 : (this.id === 2 || this.id === 3) && rand() < .45 ? 10 : this.id > 0 && rand() < .4 ? 9 : 6;
          this.raw(x,y,z,b);
        }
      }
      for (let i = 0; i < 82; i++) {
        const x = Math.floor(rand()*54)-27, z = Math.floor(rand()*54)-27;
        if (Math.hypot(x-3,z-10) < 10 || Math.hypot(x+15,z+15) < 7 || this.surface(x,z) < 2) continue;
        const h = this.surface(x,z)+1, tall = 3+Math.floor(rand()*3);
        if (this.id === 2 && i % 3) continue;
        for (let y = h; y < h+tall; y++) this.raw(x,y,z,this.id === 1 ? 7 : 3);
        const mushroom = cfg.leaf === 14;
        for (let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) for(let dy=0;dy<(mushroom?2:3);dy++) {
          if (Math.abs(dx)+Math.abs(dz)+dy > (mushroom?4:4) || rand()<.07) continue;
          this.raw(x+dx,h+tall+dy,z+dz,cfg.leaf);
        }
      }
      const clusters = [[7,12,5],[8,7,6],[-2,12,3],[0,3,5],[12,-2,6],[-11,-7,5],[15,-12,this.id>0?9:6],[-20,5,this.id>1?10:5],[18,17,this.id>1?10:6],[-19,-19,this.id>0?9:6]];
      for (const [x,z,type] of clusters) {
        const h = this.height(x,z);
        for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) {
          const base = this.height(x+dx,z+dz);
          for(let dy=0;dy<(dx===0&&dz===0?3:1);dy++) this.raw(x+dx,base+dy,z+dz,type);
        }
      }
      for(const [k,id] of Object.entries(this.game.state.edits[this.id])) { if (id) this.blocks.set(k,id); else this.blocks.delete(k); }
    }
    createAtlas() {
      const canvas = document.createElement('canvas'); canvas.width=128;canvas.height=128;
      const ctx=canvas.getContext('2d'), rand=S.random(912);
      for (const [id,b] of Object.entries(S.BLOCKS)) {
        const i=Number(id)-1, ox=i%4*32, oy=Math.floor(i/4)*32;
        ctx.fillStyle=this.id===3&&Number(id)===1?'#739c91':b.color;ctx.fillRect(ox,oy,32,32);
        for(let n=0;n<85;n++){ctx.fillStyle=rand()<.5?'rgba(255,255,255,.09)':'rgba(0,0,0,.1)';ctx.fillRect(ox+Math.floor(rand()*16)*2,oy+Math.floor(rand()*16)*2,2+Math.floor(rand()*3)*2,2);}
        if ([5,6,9,10].includes(Number(id))) {
          ctx.fillStyle={5:'#f0b894',6:'#ceffef',9:'#fff2b4',10:'#ffdbef'}[id];
          for(let n=0;n<8;n++)ctx.fillRect(ox+3+Math.floor(rand()*24),oy+3+Math.floor(rand()*24),3,3);
        }
        if(Number(id)===11){ctx.strokeStyle='#536f67';ctx.strokeRect(ox+1,oy+1,30,30);ctx.fillStyle='#e5e8c9';ctx.fillRect(ox+4,oy+4,3,3);ctx.fillRect(ox+25,oy+25,3,3);}
        if(Number(id)===12){ctx.fillStyle='#f3ffb9';ctx.fillRect(ox+4,oy+4,24,24);ctx.fillStyle='#aac773';ctx.fillRect(ox+13,oy+5,5,22);}
      }
      this.atlas=new T.CanvasTexture(canvas);this.atlas.magFilter=T.NearestFilter;this.atlas.minFilter=T.NearestFilter;
      this.atlas.encoding=T.sRGBEncoding;
      this.terrainMaterial=new T.MeshLambertMaterial({map:this.atlas,vertexColors:true});
    }
    rebuildAll(){for(let x=-3;x<3;x++)for(let z=-3;z<3;z++)this.rebuild(x,z);}
    rebuild(cx,cz){
      const k=`${cx},${cz}`,old=this.chunks.get(k);
      if(old){this.group.remove(old);old.geometry.dispose();}
      const positions=[],normals=[],uvs=[],colors=[],indices=[];
      for(let x=cx*10;x<cx*10+10;x++)for(let z=cz*10;z<cz*10+10;z++)for(let y=-4;y<32;y++){
        const b=this.get(x,y,z);if(!b)continue;
        const tx=(b-1)%4,ty=Math.floor((b-1)/4),shade=.93+S.hash(x,z,y+23)*.07;
        for(const face of FACES){const n=face.n;if(this.get(x+n[0],y+n[1],z+n[2]))continue;
          const offset=positions.length/3,uv=[[0,0],[1,0],[1,1],[0,1]],light=S.BLOCKS[b].glow?1:face.light*shade;
          face.v.forEach((v,i)=>{positions.push(x+v[0],y+v[1],z+v[2]);normals.push(...n);uvs.push((tx+(uv[i][0]*.96+.02))/4,1-(ty+((1-uv[i][1])*.96+.02))/4);colors.push(light,light,light);});
          indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
        }
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeBoundingSphere();
      const mesh=new T.Mesh(geo,this.terrainMaterial);this.group.add(mesh);this.chunks.set(k,mesh);
    }
    set(x,y,z,id){
      if(Math.abs(x)>=S.SIZE-1||Math.abs(z)>=S.SIZE-1||y<=-4||y>=32)return false;
      const k=key(x,y,z);if(id)this.blocks.set(k,id);else this.blocks.delete(k);
      this.game.state.edits[this.id][k]=id;
      const targets=new Set([`${Math.floor(x/10)},${Math.floor(z/10)}`]);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])targets.add(`${Math.floor((x+dx)/10)},${Math.floor((z+dz)/10)}`);
      for(const t of targets){const [a,b]=t.split(',').map(Number);if(a>=-3&&a<3&&b>=-3&&b<3)this.rebuild(a,b);}
      this.game.physicsKey='';return true;
    }
    material(color,emissive=false){const m=new T.MeshLambertMaterial({color,emissive:emissive?color:0,emissiveIntensity:emissive?.6:0});this.materials.push(m);return m;}
    cube(parent,x,y,z,sx,sy,sz,mat){const m=new T.Mesh(box,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
    createScenery(){
      const cfg=this.cfg,rand=S.random(cfg.seed+911);
      this.game.scene.background=new T.Color(cfg.sky);this.game.scene.fog=new T.Fog(cfg.fog,36,105);
      this.game.sun.color.set(this.id===2?'#ffe3c4':'#fff4d8');
      const water=new T.Mesh(new T.PlaneGeometry(360,360),new T.MeshPhongMaterial({color:cfg.water,transparent:true,opacity:.72,shininess:70}));water.rotation.x=-Math.PI/2;water.position.y=1.2;this.decor.add(water);this.water=water;
      const coast=this.material(this.id===2?'#675755':'#779e90');
      for(let i=0;i<24;i++){const a=i/24*Math.PI*2;this.cube(this.decor,Math.sin(a)*83,rand()*8-2,Math.cos(a)*83,10+rand()*16,12+rand()*14,12+rand()*10,coast);}
      const planetGeo=new T.SphereGeometry(18,48,32),planetMat=new T.MeshBasicMaterial({map:this.planetTexture(),fog:false});
      this.skyPlanet=new T.Mesh(planetGeo,planetMat);this.skyPlanet.position.set(-55,54,-89);this.skyPlanet.rotation.z=.35;this.decor.add(this.skyPlanet);
      const ring=new T.Mesh(new T.RingGeometry(23,31,96),new T.MeshBasicMaterial({color:'#d7d9c1',side:T.DoubleSide,transparent:true,opacity:.5,fog:false}));ring.rotation.x=1.23;this.skyPlanet.add(ring);
      const moon=new T.Mesh(new T.SphereGeometry(6,24,16),new T.MeshBasicMaterial({color:'#edf0d8',fog:false}));moon.position.set(63,45,-120);this.decor.add(moon);
      const cloudMat=new T.MeshBasicMaterial({color:this.id===2?'#ead4c1':'#f1f2e1',transparent:true,opacity:.55,depthWrite:false});this.materials.push(cloudMat);
      this.clouds=new T.Group();this.decor.add(this.clouds);
      for(let i=0;i<22;i++)this.cube(this.clouds,rand()*190-95,27+rand()*9,rand()*180-110,10+rand()*20,.6+rand()*1.3,3+rand()*7,cloudMat);
      const starPos=[];for(let i=0;i<380;i++){const a=rand()*Math.PI*2,e=.1+rand()*1.3;starPos.push(Math.cos(a)*145*Math.cos(e),Math.sin(e)*145,Math.sin(a)*145*Math.cos(e));}
      const starGeo=new T.BufferGeometry();starGeo.setAttribute('position',new T.Float32BufferAttribute(starPos,3));this.stars=new T.Points(starGeo,new T.PointsMaterial({color:'#ffffff',size:.32,transparent:true,opacity:.42,fog:false}));this.decor.add(this.stars);
      this.makeShip();this.makeRuin();
      for(let i=0;i<9;i++)this.makeCreature(i,rand);
      if(this.id>0)for(let i=0;i<(this.id===2?3:2);i++)this.makeDrone(i);
      const grassMat=this.material(this.id===3?'#d4abbe':this.id===2?'#c2aa86':'#bad491'),flowerMat=this.material(this.id===0?'#efcea5':cfg.accent,true);
      for(let i=0;i<240;i++){
        const x=Math.floor(rand()*56)-28,z=Math.floor(rand()*56)-28,h=this.height(x,z);
        if(h>10||h<2||Math.hypot(x-3,z-9)<4||Math.hypot(x+15,z+15)<5)continue;
        const stem=this.cube(this.decor,x+.5,h+.17,z+.5,.09,.34,.09,grassMat);
        if(i%4===0)this.cube(this.decor,x+.5,h+.4,z+.5,.27,.18,.27,flowerMat);
        if(i<30)this.foliage.push(stem);
      }
    }
    batchScenery(){
      const animated=new Set([...this.foliage,...this.creatures.flatMap(c=>c.legs)]);
      const batch=group=>{
        for(const child of [...group.children])if(child.isGroup)batch(child);
        const materials=new Map();
        for(const child of [...group.children])if(child.isMesh&&child.geometry===box&&!animated.has(child)){
          if(!materials.has(child.material))materials.set(child.material,[]);
          materials.get(child.material).push(child);
        }
        for(const [material,meshes] of materials){
          if(meshes.length<2)continue;
          const instances=new T.InstancedMesh(box,material,meshes.length);
          meshes.forEach((mesh,i)=>{mesh.updateMatrix();instances.setMatrixAt(i,mesh.matrix);group.remove(mesh);});
          instances.instanceMatrix.needsUpdate=true;instances.frustumCulled=false;group.add(instances);
        }
      };
      batch(this.decor);
    }
    planetTexture(){
      const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d'),r=S.random(42+this.id);
      ctx.fillStyle=['#5a8c8d','#a5bdc5','#b79178','#9393a6'][this.id];ctx.fillRect(0,0,256,128);
      for(let i=0;i<45;i++){ctx.fillStyle=i%3===0?'#cee0ca55':'#48686866';ctx.fillRect(r()*256,r()*128,20+r()*100,3+r()*9);}
      const tx=new T.CanvasTexture(c);tx.magFilter=T.NearestFilter;return tx;
    }
    makeShip(){
      const ship=this.ship=new T.Group();ship.position.copy(this.shipPosition);this.decor.add(ship);
      const ivory=this.material('#dde1cf'),teal=this.material('#416c6a'),dark=this.material('#2a4045'),orange=this.material('#e8b070'),glass=this.material('#8de2db',true);
      this.cube(ship,0,1.05,0,1.65,.75,3.6,ivory);this.cube(ship,0,1.65,-.4,1.2,.55,1.8,teal);this.cube(ship,0,1.85,-.85,1.02,.36,1.1,glass);
      this.cube(ship,0,1.15,-2.15,1.08,.5,1.0,ivory);this.cube(ship,0,1.0,-2.8,.65,.25,.45,orange);
      for(const side of [-1,1]){
        this.cube(ship,side*1.75,.9,.4,2.3,.23,2.0,ivory);this.cube(ship,side*2.75,.95,.75,.4,.4,2.45,teal);
        this.cube(ship,side*2.75,1,2.05,.3,.25,.2,glass);this.cube(ship,side*.75,.3,1.1,.16,.7,.16,dark);this.cube(ship,side*.75,.05,1.1,.5,.12,.65,dark);
        this.cube(ship,side*.58,1.1,1.93,.55,.5,.45,dark);this.cube(ship,side*.58,1.1,2.18,.35,.3,.08,glass);
      }
      this.cube(ship,0,1.95,1.4,.18,1.15,.7,orange);this.cube(ship,0,.3,-1.3,.16,.7,.16,dark);
      const pad=this.material('#8c9e91');this.cube(this.decor,3,5.015,9,8,.03,8,pad);
      const stripe=this.material('#d6e7b2',true);for(const s of [-1,1])this.cube(this.decor,3+s*3.7,5.05,9,.1,.03,7,stripe);
      this.beacons.push({position:new T.Vector3(3,8.8,9),label:'逐星者号',icon:'rocket',type:'ship'});
    }
    makeRuin(){
      const group=this.ruin=new T.Group();group.position.copy(this.ruinPosition);this.decor.add(group);
      const rock=this.material('#b1b7a4'),dark=this.material('#637a76'),glow=this.material(this.cfg.accent,true);
      for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)this.cube(group,x,0,z,1,.16,1,(x+z)%2?dark:rock);
      for(const side of [-1,1]){for(let y=0;y<6;y++)this.cube(group,side*2.5,y+.5,0,y===0?1.6:1,1,y===0?1.6:1,rock);this.cube(group,side*1.95,2.7,-.03,.09,3,.8,glow);}
      this.cube(group,0,6,0,6,1,1.3,rock);this.cube(group,0,6.05,.7,2,.4,.1,glow);
      this.core=new T.Mesh(new T.OctahedronGeometry(.65,0),glow);this.core.position.set(0,2.4,0);group.add(this.core);
      if(this.id===3){const field=new T.Mesh(new T.PlaneGeometry(3.85,5.3),new T.MeshBasicMaterial({color:'#a4ddde',transparent:true,opacity:.24,side:T.DoubleSide}));field.position.y=3;group.add(field);this.gateField=field;}
      for(const [x,z] of [[-4,4],[5,2],[-4,-5]]){this.cube(group,x,.6,z,.9,1.2,.9,dark);this.cube(group,x,1.3,z,.6,.25,.6,glow);}
      this.beacons.push({position:new T.Vector3(-15,12,-15),label:this.id===3?'远星之门':'古代遗迹',icon:this.id===3?'orbit':'diamond',type:'ruin'});
      this.updateArtifact();
    }
    updateArtifact(){if(this.core)this.core.visible=this.id===3||!this.game.state.artifacts.includes(this.id);}
    makeCreature(i,rand){
      const type=i%3,group=new T.Group(),x=i===0?-2:i===1?9:rand()*44-22,z=i===0?4:i===1?0:rand()*42-24;
      const colors=[['#c5cb8c','#e3b497','#bddbd0'],['#dce7e7','#abbccf','#90e0de'],['#b69b88','#eac294','#e5ac9d'],['#d0c3d1','#b9d4c5','#d5adca']][this.id];
      const mat=this.material(colors[type]),feet=this.material('#536965'),eyes=this.material('#182d32'),belly=this.material('#eee9cb');
      this.cube(group,0,.66,0,type===2?.6:.85,type===2?.6:.55,type===0?1.3:.7,mat);
      this.cube(group,0,.96,-.53,.57,.5,.5,mat);for(const s of [-1,1]){this.cube(group,s*.29,1.04,-.72,.08,.1,.08,eyes);this.cube(group,s*.19,1.31,-.42,.1,.35,.12,belly);}
      const legs=[];if(type!==2)for(const x of [-.28,.28])for(const z of [-.4,.4])legs.push(this.cube(group,x,.24,z,.15,.4,.17,feet));
      if(type===2)for(const s of [-1,1])this.cube(group,s*.7,.7,0,.6,.1,.6,belly);
      this.decor.add(group);group.position.set(x,this.height(x,z),z);
      const c={group,type,index:i,home:new T.Vector3(x,0,z),phase:rand()*6.28,legs,name:this.cfg.fauna[type]};this.creatures.push(c);
    }
    makeDrone(i){
      const group=new T.Group(),mat=this.material('#6a777a'),glow=this.material('#f4a48a',true);
      this.cube(group,0,0,0,.7,.5,.7,mat);this.cube(group,0,0,.36,.35,.16,.04,glow);
      for(const s of [-1,1]){this.cube(group,s*.6,0,0,.6,.1,.24,mat);this.cube(group,s*.88,.05,0,.5,.06,.5,glow);}
      const x=-10+i*6,z=-10-i*3;group.position.set(x,this.height(x,z)+3,z);this.decor.add(group);this.drones.push({group,hp:3,home:new T.Vector3(x,0,z),phase:i*2,cooldown:2});
    }
    update(dt,time){
      this.skyPlanet.rotation.y+=dt*.004;this.clouds.position.x=Math.sin(time*.013)*7;
      this.core.rotation.y+=dt*.65;this.core.position.y=2.4+Math.sin(time*1.6)*.2;
      if(this.gateField)this.gateField.material.opacity=.2+Math.sin(time*2)*.06;
      for(const c of this.creatures){
        const t=time*.19+c.phase,x=c.home.x+Math.cos(t)*2.3,z=c.home.z+Math.sin(t*.83)*2.3,h=this.height(x,z);
        c.group.position.set(x,h+(c.type===2?1.4+Math.sin(time*2+c.phase)*.3:Math.max(0,Math.sin(time*3+c.phase))*.12),z);c.group.rotation.y=-t;
        c.legs.forEach((l,i)=>l.rotation.x=Math.sin(time*5+c.phase+i*Math.PI)*.25);
      }
      for(const f of this.foliage)f.rotation.z=Math.sin(time*1.5+f.position.x)*.08;
      const p=this.game.body.position;
      for(const d of this.drones){if(d.hp<=0){d.group.visible=false;continue;}
        const distance=Math.hypot(p.x-d.group.position.x,p.z-d.group.position.z),ang=time*.2+d.phase;
        const tx=distance<13?p.x+Math.cos(ang)*5:d.home.x+Math.sin(ang)*3,tz=distance<13?p.z+Math.sin(ang)*5:d.home.z+Math.cos(ang)*3;
        d.group.position.x+=(tx-d.group.position.x)*dt*.6;d.group.position.z+=(tz-d.group.position.z)*dt*.6;
        d.group.position.y+=(Math.max(this.height(d.group.position.x,d.group.position.z)+2.3,p.y+1)-d.group.position.y)*dt;
        d.group.lookAt(p.x,p.y+1,p.z);d.cooldown-=dt;
        if(distance<10&&d.cooldown<=0&&!this.game.nearShip()&&this.game.lineOfSight(d.group.position,this.game.camera.position)){d.cooldown=3;this.game.damage(8);this.game.beam(d.group.position,this.game.camera.position,'#f1a48b');}
      }
    }
    dispose(){
      this.game.scene.remove(this.group);
      const geos=new Set(),mats=new Set(),maps=new Set();
      this.group.traverse(o=>{if(o.geometry&&o.geometry!==box)geos.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){mats.add(m);if(m.map)maps.add(m.map);}}});
      for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const m of this.materials)m.dispose();for(const t of maps)t.dispose();
    }
  };
})();
