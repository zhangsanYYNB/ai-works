(function () {
  'use strict';
  const S=StarBlocks,T=THREE,C=CANNON;
  S.Game=class {
    constructor(){
      this.state=S.freshState();this.loadWarning='';
      try{const raw=localStorage.getItem(S.SAVE_KEY);if(raw)this.state=S.parseSave(raw);}catch(e){this.loadWarning='存档未能读取，已建立临时探险。旧存档不会自动覆盖。';this.saveBlocked=true;}
      this.keys=new Set();this.touchMove={x:0,z:0};this.jumpHeld=false;this.mining=false;this.lookPointer=null;this.lookType=null;this.touchIds={};this.energy=100;this.selected=0;this.yaw=0;this.pitch=-.08;this.time=0;this.paused=false;this.travelling=false;this.started=false;this.scanTimer=0;this.target=null;this.mineProgress=0;this.mineKey='';this.particles=[];this.beams=[];this.lastSave=0;this.physicsKey='';this.rayTimer=0;this.mineCooldown=0;this.damageTimer=0;this.uiTimer=0;this.focusReturn=null;
      this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(68,innerWidth/innerHeight,.06,240);this.camera.rotation.order='YXZ';this.scene.add(this.camera);
      this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.outputEncoding=T.sRGBEncoding;this.renderer.setClearColor('#a3d5cc');
      document.getElementById('game').appendChild(this.renderer.domElement);this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('aria-label','星球探索视图');
      this.scene.add(new T.HemisphereLight('#e5f1e8','#526b68',.92));this.sun=new T.DirectionalLight('#fff4d8',.82);this.sun.position.set(-28,55,20);this.scene.add(this.sun);
      this.physics=new C.World();this.physics.gravity.set(0,-17,0);this.physics.broadphase=new C.SAPBroadphase(this.physics);this.physics.solver.iterations=8;
      const playerMat=new C.Material('player'),groundMat=this.groundMat=new C.Material('ground');this.physics.addContactMaterial(new C.ContactMaterial(playerMat,groundMat,{friction:0,restitution:0}));
      this.body=new C.Body({mass:5,material:playerMat,fixedRotation:true,linearDamping:.04});this.body.addShape(new C.Sphere(.32),new C.Vec3(0,0,0));this.body.addShape(new C.Sphere(.32),new C.Vec3(0,.87,0));this.body.updateMassProperties();this.body.allowSleep=false;this.physics.addBody(this.body);this.colliders=[];this.blockShape=new C.Box(new C.Vec3(.5,.5,.5));
      this.ray=new T.Raycaster();this.ray.far=7;this.direction=new T.Vector3();
      this.outline=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.006,1.006,1.006)),new T.LineBasicMaterial({color:'#f1ffd0',transparent:true,opacity:.8}));this.scene.add(this.outline);this.outline.visible=false;
      this.makeTool();this.loadPlanet(this.state.planet,true);this.bindInput();this.resize();window.addEventListener('resize',()=>this.resize());
      document.addEventListener('visibilitychange',()=>{if(document.hidden){this.resetInput();this.save();this.paused=true;}else if(this.ui&&!this.travelling)this.ui.open('pause');});
      window.addEventListener('blur',()=>{this.resetInput();if(this.ui&&!this.travelling)this.ui.open('pause');});
      window.addEventListener('pagehide',()=>this.save());this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.paused=true;document.getElementById('loading-text').textContent='图形上下文已暂停，请重新加载以恢复存档。';document.getElementById('loading').classList.remove('hidden');this.save();});
      this.last=performance.now();this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
    }
    start(ui){this.ui=ui;this.started=true;document.getElementById('loading').classList.add('hidden');if(this.loadWarning)this.ui.notice(this.loadWarning,true);else this.ui.notice(this.state.playTime>1?'远星信号已恢复':'着陆成功 · 青岚星',false,this.state.playTime>1?'探险进度已恢复':'逐星者号的引擎离线，附近检测到铁矿与晶体。');}
    resize(){this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6)*this.state.settings.quality);this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
    makeTool(){
      this.tool=new T.Group();this.tool.position.set(.39,-.32,-.62);this.camera.add(this.tool);
      const body=new T.MeshLambertMaterial({color:'#d4ddd0'}),dark=new T.MeshLambertMaterial({color:'#304947'}),glow=new T.MeshBasicMaterial({color:'#beefb2'});
      const cube=(x,y,z,sx,sy,sz,m)=>{const b=new T.Mesh(new T.BoxGeometry(sx,sy,sz),m);b.position.set(x,y,z);this.tool.add(b);};
      cube(0,0,0,.18,.18,.46,body);cube(0,.11,-.02,.12,.06,.29,dark);cube(0,-.13,.09,.1,.22,.12,dark);cube(0,0,-.27,.13,.12,.1,dark);cube(0,.012,-.326,.08,.065,.015,glow);cube(.095,0,.05,.012,.08,.13,glow);
    }
    loadPlanet(id,restore=false){
      if(this.world)this.world.dispose();
      for(const b of this.colliders)this.physics.removeBody(b);this.colliders=[];this.physicsKey='';
      this.state.planet=id;if(!this.state.visited.includes(id))this.state.visited.push(id);
      this.world=new S.World(this,id);this.physics.gravity.set(0,-this.world.cfg.gravity,0);
      const saved=restore?this.state.position:null;this.body.position.set(saved?saved.x:3,saved?saved.y:5.34,saved?saved.z:16);
      this.yaw=saved?saved.yaw:.06;this.pitch=saved?Math.max(-1.45,Math.min(1.45,saved.pitch)):-.07;this.body.velocity.set(0,0,0);this.body.angularVelocity.set(0,0,0);this.energy=100;this.target=null;this.outline.visible=false;
      if(this.overlapsBody()){this.body.position.y=this.world.height(this.body.position.x,this.body.position.z)+.34;}
      this.syncPhysics();this.updateCamera();if(this.ui){this.ui.updatePlanet();this.ui.update();}
    }
    overlapsBody(){const p=this.body.position;for(let x=Math.floor(p.x-.3);x<=Math.floor(p.x+.3);x++)for(let z=Math.floor(p.z-.3);z<=Math.floor(p.z+.3);z++)for(let y=Math.floor(p.y-.29);y<=Math.floor(p.y+1.17);y++)if(this.world.get(x,y,z))return true;return false;}
    syncPhysics(){
      const p=this.body.position,cx=Math.floor(p.x),cy=Math.floor(p.y),cz=Math.floor(p.z),k=`${cx},${cy},${cz}`;if(k===this.physicsKey)return;this.physicsKey=k;
      for(const body of this.colliders)this.physics.removeBody(body);this.colliders=[];
      for(let x=cx-3;x<=cx+3;x++)for(let z=cz-3;z<=cz+3;z++)for(let y=Math.max(-4,cy-4);y<=Math.min(31,cy+4);y++){
        if(!this.world.get(x,y,z))continue;
        if(this.world.get(x+1,y,z)&&this.world.get(x-1,y,z)&&this.world.get(x,y+1,z)&&this.world.get(x,y-1,z)&&this.world.get(x,y,z+1)&&this.world.get(x,y,z-1))continue;
        const body=new C.Body({mass:0,material:this.groundMat});body.addShape(this.blockShape);body.position.set(x+.5,y+.5,z+.5);this.physics.addBody(body);this.colliders.push(body);
      }
    }
    grounded(){const p=this.body.position;for(const [dx,dz] of [[0,0],[.22,0],[-.22,0],[0,.22],[0,-.22]])if(this.world.get(Math.floor(p.x+dx),Math.floor(p.y-.39),Math.floor(p.z+dz)))return this.body.velocity.y<1;return false;}
    updateCamera(){const p=this.body.position;this.camera.position.set(p.x,p.y+1.25,p.z);this.camera.rotation.set(this.pitch,this.yaw,0);this.camera.updateMatrixWorld();}
    bindInput(){
      const canvas=this.renderer.domElement;
      document.addEventListener('keydown',e=>{
        if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
        if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
        if(e.repeat)return;
        if(e.code==='Escape'){if(this.travelling)return;if(this.ui.panel)this.ui.close();else this.ui.open('pause');return;}
        if(this.travelling)return;
        if(e.code==='Tab'){this.ui.panel?this.ui.close():this.ui.open('inventory');return;}
        if(e.code==='KeyM'){this.ui.open('map');return;}
        if(e.code==='KeyJ'){this.ui.open('journal');return;}
        if(this.paused)return;
        this.keys.add(e.code);
        if(e.code==='Space')this.jumpHeld=true;
        if(e.code==='KeyF')this.scan();if(e.code==='KeyE')this.interact();if(e.code==='KeyR')this.consume('oxygen');if(e.code==='KeyH')this.consume('medkit');
        if(/^Digit[1-6]$/.test(e.code))this.select(Number(e.code.slice(-1))-1);
      });
      document.addEventListener('keyup',e=>{this.keys.delete(e.code);if(e.code==='Space')this.jumpHeld=false;});
      canvas.addEventListener('contextmenu',e=>e.preventDefault());
      canvas.addEventListener('pointerdown',e=>{
        if(this.paused||this.travelling)return;e.preventDefault();canvas.focus({preventScroll:true});this.sound('click');
        if(e.pointerType==='touch'||e.pointerType==='pen'){
          if(this.state.settings.touch!==false)this.ui.setTouch(true,false);
          if(this.lookPointer!==null)return;
          this.lookPointer=e.pointerId;this.lookType='touch';this.lookLast={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);return;
        }
        if(e.button===2){this.place();return;}
        if(e.button!==0)return;
        this.mining=true;
        if(document.pointerLockElement!==canvas){
          this.lookPointer=e.pointerId;this.lookType='mouse';this.lookLast={x:e.clientX,y:e.clientY};
          try{const promise=canvas.requestPointerLock?.();if(promise?.catch)promise.catch(()=>{});}catch(_){}
        }
      });
      canvas.addEventListener('pointermove',e=>{
        if(this.paused||this.travelling)return;
        if(document.pointerLockElement===canvas&&e.pointerType==='mouse'){this.look(e.movementX,e.movementY);return;}
        if(e.pointerId!==this.lookPointer)return;
        const dx=e.clientX-this.lookLast.x,dy=e.clientY-this.lookLast.y;this.lookLast={x:e.clientX,y:e.clientY};this.look(dx,dy,e.pointerType==='touch'?1.35:1);
      });
      const release=e=>{if(e.pointerId===this.lookPointer){this.lookPointer=null;this.lookType=null;}if(e.pointerType==='mouse')this.mining=false;};
      canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',e=>{if(document.pointerLockElement!==canvas)release(e);});
      document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')this.mining=false;});
      document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){this.mining=false;this.lookPointer=null;}});
      canvas.addEventListener('wheel',e=>{if(this.paused)return;e.preventDefault();this.select((this.selected+(e.deltaY>0?1:5))%6);},{passive:false});
      this.bindTouch();
    }
    bindTouch(){
      const stick=document.getElementById('joystick'),knob=document.getElementById('stick');let stickId=null;
      const move=e=>{const rect=stick.getBoundingClientRect(),dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2,len=Math.hypot(dx,dy),scale=len>32?32/len:1;this.touchMove={x:dx*scale/32,z:dy*scale/32};knob.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;};
      stick.addEventListener('pointerdown',e=>{if(stickId!==null||this.paused)return;e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);move(e);});
      stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)move(e);});
      const reset=e=>{if(e.pointerId!==stickId)return;stickId=null;this.touchMove={x:0,z:0};knob.style.transform='';};
      for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,reset);
      const hold=(id,prop)=>{const el=document.getElementById(id);let pointer=null;el.addEventListener('pointerdown',e=>{if(this.paused||pointer!==null)return;e.preventDefault();pointer=e.pointerId;el.setPointerCapture(e.pointerId);this[prop]=true;this.sound('click');});for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,e=>{if(e.pointerId===pointer){pointer=null;this[prop]=false;}});};
      hold('touch-jump','jumpHeld');hold('touch-mine','mining');
      document.getElementById('touch-scan').addEventListener('click',()=>this.scan());
    }
    look(dx,dy,multiplier=1){const speed=.0025*this.state.settings.sensitivity*multiplier;this.yaw-=dx*speed;this.pitch=Math.max(-1.48,Math.min(1.48,this.pitch-dy*speed));}
    resetInput(){this.keys.clear();this.jumpHeld=false;this.mining=false;this.touchMove={x:0,z:0};this.lookPointer=null;this.lookType=null;this.mineProgress=0;this.jumpTime=0;document.getElementById('stick').style.transform='';}
    select(index){this.selected=index;this.mineProgress=0;this.mineKey='';this.tool.visible=index===0;if(this.ui)this.ui.updateHotbar();}
    nearShip(){return this.body.position.distanceTo(new C.Vec3(3,5.34,9))<7;}
    protected(x,y,z){return y<=5&&(Math.hypot(x-3,z-9)<4.2||Math.hypot(x+15,z+15)<4.2);}
    updateTarget(){
      this.camera.getWorldDirection(this.direction);this.ray.set(this.camera.position,this.direction);this.ray.far=7;
      const hits=this.ray.intersectObjects([...this.world.chunks.values()],false);let target=null;
      if(hits.length){const hit=hits[0],n=hit.face.normal,p=hit.point.clone().addScaledVector(n,-.002),x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);target={x,y,z,normal:n.clone(),point:hit.point,distance:hit.distance,id:this.world.get(x,y,z),type:'block'};}
      for(const drone of this.world.drones){if(drone.hp<=0)continue;const hits=this.ray.intersectObject(drone.group,true);if(hits[0]&&(!target||hits[0].distance<target.distance))target={type:'drone',drone,point:hits[0].point,distance:hits[0].distance};}
      this.target=target;this.outline.visible=!!target&&target.type==='block';if(this.outline.visible)this.outline.position.set(target.x+.5,target.y+.5,target.z+.5);
    }
    lineOfSight(from,to){const ray=new T.Raycaster(from,to.clone().sub(from).normalize(),0,from.distanceTo(to)-.2);return ray.intersectObjects([...this.world.chunks.values()],false).length===0;}
    mine(dt){
      if(this.mineCooldown>0)return;
      if(this.selected!==0){this.place();this.mineCooldown=.35;return;}
      const t=this.target;if(!t){this.mineProgress=0;return;}
      if(t.type==='drone'){
        this.mineCooldown=.24;this.mineProgress=0;t.drone.hp-=1+this.state.upgrades.laser*.6;this.beam(this.tool.getWorldPosition(new T.Vector3()),t.point,'#daffad');this.sound('mine');this.burst(t.point,'#ffc398',7);
        if(t.drone.hp<=0){this.state.inventory.iron+=3;this.state.credits+=30;this.ui.notice('哨兵已解除 · 铁 +3 · 研究点 +30');this.target=null;}
        return;
      }
      const block=S.BLOCKS[t.id];if(!block||!Number.isFinite(block.hardness)||this.protected(t.x,t.y,t.z)){this.mineProgress=0;return;}
      const k=S.key(t.x,t.y,t.z);if(k!==this.mineKey){this.mineKey=k;this.mineProgress=0;}
      this.mineProgress+=dt*(1+this.state.upgrades.laser*.7);
      this.tool.rotation.x=Math.sin(this.time*45)*.035;
      if(this.time-(this.lastMineFx||0)>.12){this.lastMineFx=this.time;this.burst(t.point,block.color,2);this.beam(this.tool.getWorldPosition(new T.Vector3()),t.point,'#d5f3b6');this.sound('mine');}
      if(this.mineProgress>=block.hardness){
        if(this.world.set(t.x,t.y,t.z,0)){this.state.inventory[block.drop]++;this.state.mined++;this.burst(t.point,block.color,9);this.ui.notice(`${S.RESOURCES[block.drop].name} +1`);this.ui.updateHotbar();}
        this.mineProgress=0;this.mineKey='';this.target=null;this.mineCooldown=.1;this.updateTarget();
      }
    }
    place(){
      if(this.paused||this.travelling)return false;
      const t=this.target,id=S.HOTBAR[this.selected===0?4:this.selected],resource=S.RESOURCES[id];
      if(!t||t.type!=='block'||!resource?.block)return false;
      if(this.state.inventory[id]<=0){this.ui.notice(`${resource.name}不足`,true);this.mineCooldown=.6;return false;}
      const x=t.x+t.normal.x,y=t.y+t.normal.y,z=t.z+t.normal.z,p=this.body.position;
      if(this.world.get(x,y,z)||x<p.x+.34&&x+1>p.x-.34&&z<p.z+.34&&z+1>p.z-.34&&y<p.y+1.21&&y+1>p.y-.32)return false;
      if((Math.hypot(x-3,z-9)<3.5&&y<8)||(Math.hypot(x+15,z+15)<3.5&&y<12)){this.ui.notice('着陆区与遗迹通道需要保持畅通',true);this.mineCooldown=.6;return false;}
      if(this.world.set(x,y,z,resource.block)){this.state.inventory[id]--;this.state.built++;this.sound('place');this.burst(new T.Vector3(x+.5,y+.5,z+.5),resource.color,5);this.updateTarget();this.ui.updateHotbar();return true;}return false;
    }
    scan(){
      if(this.paused||this.travelling||this.scanTimer>0)return;
      this.scanTimer=7;this.sound('scan');const wave=document.getElementById('scan-wave');wave.classList.remove('scanning');void wave.offsetWidth;wave.classList.add('scanning');
      let count=0;const p=this.camera.position,discover=(id,name)=>{if(this.state.discoveries.includes(id))return;this.state.discoveries.push(id);this.state.credits+=40;count++;this.ui.notice(`发现：${name}`,false,'研究点 +40');};
      for(const c of this.world.creatures)if(c.group.position.distanceTo(p)<23)discover(`${this.state.planet}-fauna-${c.type}`,c.name);
      for(const [id,type] of [[5,0],[6,1],[this.state.planet>1?10:3,2]]){
        let found=false;
        for(let x=Math.floor(p.x)-12;x<=p.x+12&&!found;x++)for(let z=Math.floor(p.z)-12;z<=p.z+12&&!found;z++){const y=this.world.height(x,z)-1;if(this.world.get(x,y,z)===id)found=true;}
        if(found)discover(`${this.state.planet}-mineral-${type}`,S.BLOCKS[id].name);
      }
      if(!count)this.ui.notice('扫描完成 · 未发现新的生态样本');
      this.state.inventory.carbon+=1;this.ui.updateHotbar();this.save();
    }
    context(){
      const p=this.body.position,ruin=this.world.ruinPosition;
      if(Math.hypot(p.x-ruin.x,p.z-ruin.z)<4.8&&Math.abs(p.y-ruin.y)<5){
        if(this.state.planet===3)return {type:'gate',label:this.state.completed?'再次穿越星门':'激活远星之门'};
        if(!this.state.artifacts.includes(this.state.planet))return {type:'artifact',label:`读取${this.world.cfg.artifact}`};
        return {type:'ruin',label:'遗迹充能'};
      }
      if(this.nearShip())return {type:'ship',label:this.state.upgrades.engine?'登舰 · 星际航行':'飞船终端 · 修复引擎'};
      return null;
    }
    interact(){
      if(this.paused||this.travelling)return;
      const c=this.context();if(!c)return;
      if(c.type==='ship'){this.ui.open(this.state.upgrades.engine?'map':'inventory');return;}
      if(c.type==='artifact'){this.state.artifacts.push(this.state.planet);this.state.credits+=150;this.state.inventory.crystal+=4;this.state.oxygen=100;this.world.updateArtifact();this.burst(this.world.ruinPosition.clone().add(new T.Vector3(0,2,0)),this.world.cfg.accent,30);this.sound('discover');this.ui.notice(`已取得${this.world.cfg.artifact}`,false,'遗迹碎片 +1 · 晶体 +4 · 研究点 +150');this.save();return;}
      if(c.type==='ruin'){this.state.oxygen=100;this.state.health=100;this.ui.notice('遗迹充能完成 · 护盾与氧气已恢复');return;}
      if(c.type==='gate'){
        if(this.state.artifacts.length<3||!this.state.upgrades.core){this.ui.notice('星门尚未就绪',true,`遗迹碎片 ${this.state.artifacts.length}/3 · 跃迁核心 ${this.state.upgrades.core}/1`);return;}
        this.state.completed=true;this.state.health=100;this.state.oxygen=100;this.sound('discover');this.save();this.ui.open('ending');
      }
    }
    craft(id){if(S.craft(this.state,id)){this.sound('discover');this.ui.notice(`${S.RECIPES.find(r=>r.id===id).name} · 完成`);this.ui.renderPanel();this.ui.updateHotbar();this.save();return true;}return false;}
    consume(id){
      if(this.travelling)return false;
      const property=id==='oxygen'?'oxygen':'health',amount=id==='oxygen'?70:60;
      if(this.state.inventory[id]<1){this.ui.notice(`${S.RESOURCES[id].name}不足`,true);return false;}
      if(this.state[property]>=100){this.ui.notice(property==='oxygen'?'氧气已充足':'护盾完好');return false;}
      this.state.inventory[id]--;this.state[property]=Math.min(100,this.state[property]+amount);this.sound('place');this.ui.notice(`${S.RESOURCES[id].name}已使用`);if(this.ui.panel)this.ui.renderPanel();this.ui.update();return true;
    }
    async travel(id){
      if(this.travelling||id===this.state.planet||!S.PLANETS[id]||!this.state.upgrades.engine||this.state.inventory.fuel<1||!this.nearShip())return false;
      this.state.inventory.fuel--;this.travelling=true;this.ui.close(false);this.resetInput();document.exitPointerLock?.();this.sound('warp');
      await this.ui.warp(id);this.loadPlanet(id);this.state.oxygen=100;this.state.health=Math.min(100,this.state.health+30);this.state.position=null;this.travelling=false;this.paused=false;this.ui.finishWarp();this.ui.notice(`已登陆 · ${this.world.cfg.name}`,false,this.world.cfg.danger?'环境防护已启动，注意氧气余量。':'生物信号丰富。');this.save();return true;
    }
    damage(amount){
      if(this.paused||this.travelling)return;
      this.state.health-=amount*(this.state.upgrades.suit?.4:1);this.damageTimer=.3;this.sound('hurt');if(this.state.health<=0)this.respawn();
    }
    respawn(){
      this.state.health=100;this.state.oxygen=100;this.energy=100;this.state.credits=Math.max(0,this.state.credits-50);this.body.position.set(3,5.34,16);this.body.velocity.set(0,0,0);this.physicsKey='';this.resetInput();this.ui.notice('紧急救援 · 已返回飞船',true,'研究点 -50，物品与建筑已保留。');this.save();
    }
    beam(from,to,color){const g=new T.BufferGeometry().setFromPoints([from.clone(),to.clone()]),m=new T.LineBasicMaterial({color,transparent:true,opacity:.85}),line=new T.Line(g,m);this.scene.add(line);this.beams.push({line,life:.09});}
    burst(position,color,n){
      if(this.particles.length>160)return;
      const geometry=this.particleGeo||(this.particleGeo=new T.BoxGeometry(.1,.1,.1));
      for(let i=0;i<n;i++){const mat=new T.MeshLambertMaterial({color}),mesh=new T.Mesh(geometry,mat);mesh.position.copy(position);this.scene.add(mesh);this.particles.push({mesh,life:.35+Math.random()*.5,v:new T.Vector3((Math.random()-.5)*3,Math.random()*3,(Math.random()-.5)*3)});}
    }
    sound(type){
      if(!this.state.settings.sound)return;
      try{
        if(!this.audio){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;this.audio=new Audio();}
        if(this.audio.state==='suspended'){this.audio.resume().catch(()=>{});if(type==='mine')return;}
        const ctx=this.audio,o=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime;
        const sounds={click:[320,400,.04,.025],mine:[150,75,.07,.025],place:[230,410,.09,.04],scan:[180,1300,.65,.055],discover:[520,1040,.5,.065],warp:[70,820,1.5,.07],hurt:[100,40,.2,.055]};const [a,b,d,v]=sounds[type]||sounds.click;
        o.type=type==='mine'||type==='hurt'?'triangle':'sine';o.frequency.setValueAtTime(a,t);o.frequency.exponentialRampToValueAtTime(b,t+d);gain.gain.setValueAtTime(v,t);gain.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(gain);gain.connect(ctx.destination);o.start(t);o.stop(t+d);o.onended=()=>{o.disconnect();gain.disconnect();};
      }catch(_){}
    }
    save(){
      if(this.saveBlocked||this.travelling)return false;
      const p=this.body.position;this.state.position={x:p.x,y:p.y,z:p.z,yaw:this.yaw,pitch:this.pitch};
      try{localStorage.setItem(S.SAVE_KEY,JSON.stringify(this.state));if(this.ui)this.ui.saved();return true;}catch(_){this.ui?.notice('本地存储已满或不可用，请导出存档',true);return false;}
    }
    frame(now){
      requestAnimationFrame(this.frame);const dt=Math.max(0,Math.min((now-this.last)/1000,.045));this.last=now;
      if(!this.started)return;
      if(!this.paused&&!this.travelling){
        this.time+=dt;this.state.playTime+=dt;this.mineCooldown=Math.max(0,this.mineCooldown-dt);this.scanTimer=Math.max(0,this.scanTimer-dt);this.damageTimer=Math.max(0,this.damageTimer-dt);
        const p=this.body.position;let x=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0)+this.touchMove.x,z=(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0)-(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)+this.touchMove.z;
        const len=Math.hypot(x,z);if(len>1){x/=len;z/=len;}
        const speed=this.keys.has('ShiftLeft')?6.8:4.5,dx=(x*Math.cos(this.yaw)+z*Math.sin(this.yaw))*speed,dz=(-x*Math.sin(this.yaw)+z*Math.cos(this.yaw))*speed;
        this.body.velocity.x+=(dx-this.body.velocity.x)*Math.min(1,dt*15);this.body.velocity.z+=(dz-this.body.velocity.z)*Math.min(1,dt*15);
        if(this.jumpHeld){
          this.jumpTime=(this.jumpTime||0)+dt;
          if(this.grounded()&&this.jumpTime<.15)this.body.velocity.y=7;
          else if(this.jumpTime>.16&&this.energy>0){this.body.velocity.y=Math.min(this.state.upgrades.jet?7:5.5,this.body.velocity.y+dt*(this.world.cfg.gravity+18));this.energy=Math.max(0,this.energy-dt*(this.state.upgrades.jet?12:19));}
        }else{this.jumpTime=0;this.energy=Math.min(100,this.energy+dt*(this.grounded()?28:8));}
        if(p.y>48)this.body.velocity.y=Math.min(this.body.velocity.y,-2);
        this.syncPhysics();this.physics.step(1/60,dt,4);
        p.x=Math.max(-28.5,Math.min(28.5,p.x));p.z=Math.max(-28.5,Math.min(28.5,p.z));
        if(p.y < -7)this.respawn();
        this.updateCamera();this.rayTimer-=dt;if(this.rayTimer<=0){this.rayTimer=.08;this.updateTarget();}
        if(this.mining)this.mine(dt);else{this.mineProgress=0;this.tool.rotation.x*=.8;}
        this.tool.position.y=-.32+Math.sin(this.time*8)*Math.min(len,.7)*.014;this.tool.rotation.z=Math.sin(this.time*3)*.013;
        this.world.update(dt,this.time);
        const storm=this.world.cfg.danger>0&&this.time%150>115;this.storm=storm;
        if(this.nearShip()){this.state.oxygen=Math.min(100,this.state.oxygen+dt*16);this.state.health=Math.min(100,this.state.health+dt*3);}
        else{const loss=(.14+this.world.cfg.danger*.36)*(storm?2:1)*(this.state.upgrades.suit?.4:1);this.state.oxygen=Math.max(0,this.state.oxygen-dt*loss);if(this.state.oxygen<=0)this.damage(dt*6);}
        if(this.state.oxygen<20&&this.time-(this.lastOxygenWarn||-30)>25){this.lastOxygenWarn=this.time;this.ui.notice('氧气偏低 · 生命维持预警',true);}
        for(let i=this.particles.length-1;i>=0;i--){const a=this.particles[i];a.life-=dt;a.v.y-=dt*5;a.mesh.position.addScaledVector(a.v,dt);a.mesh.rotation.x+=dt*3;a.mesh.scale.setScalar(Math.min(1,a.life*3));if(a.life<=0){this.scene.remove(a.mesh);a.mesh.material.dispose();this.particles.splice(i,1);}}
        for(let i=this.beams.length-1;i>=0;i--){const b=this.beams[i];b.life-=dt;if(b.life<=0){this.scene.remove(b.line);b.line.geometry.dispose();b.line.material.dispose();this.beams.splice(i,1);}}
        if(this.time-this.lastSave>15){this.lastSave=this.time;this.save();}
      }
      this.uiTimer-=dt;if(this.uiTimer<=0){this.uiTimer=.12;this.ui.update();}
      this.ui.updateWaypoints();this.renderer.render(this.scene,this.camera);
    }
  };
})();
