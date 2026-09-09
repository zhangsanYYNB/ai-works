(function () {
  'use strict';
  const S=StarBlocks,$=id=>document.getElementById(id),icon=name=>`<i data-lucide="${name}"></i>`;
  const blockIcon=id=>`<span class="block-icon" style="background-color:${S.RESOURCES[id].color}"></span>`;
  S.UI=class {
    constructor(game){
      this.game=game;this.panel=null;this.selectedPlanet=game.state.planet;this.thumbnails=S.PLANETS.map((p,i)=>this.planetImage(i));this.notices=[];this.lastNotice='';this.noticeTime=0;
      document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>this.open(button.dataset.panel)));
      $('close-panel').addEventListener('click',()=>this.close());$('modal').addEventListener('click',e=>{if(e.target===$('modal'))this.close();});
      $('scan-button').addEventListener('click',()=>game.scan());$('interact-button').addEventListener('click',()=>game.interact());
      $('panel-content').addEventListener('click',e=>this.panelClick(e));
      $('panel-content').addEventListener('input',e=>{
        const id=e.target.dataset.setting;if(!id)return;
        if(id==='sound')game.state.settings.sound=e.target.checked;
        if(id==='sensitivity')game.state.settings.sensitivity=Number(e.target.value);
        if(id==='quality'){game.state.settings.quality=e.target.checked?1:.65;game.resize();}
        if(id==='touch')this.setTouch(e.target.checked,true);
        game.save();
      });
      $('panel-content').addEventListener('change',e=>{if(e.target.id==='import-file'&&e.target.files[0])this.importSave(e.target.files[0]);});
      document.addEventListener('keydown',e=>{
        if(!this.panel||e.code!=='Tab')return;e.preventDefault();e.stopImmediatePropagation();
        const buttons=[...$('modal').querySelectorAll('button:not(:disabled),a,input')].filter(el=>el.offsetParent!==null),index=buttons.indexOf(document.activeElement),next=(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();
      },true);
      this.touchDetected=navigator.maxTouchPoints>0||matchMedia('(any-pointer: coarse)').matches;
      this.setTouch(game.state.settings.touch ?? this.touchDetected,false);this.updatePlanet();this.updateHotbar();this.update();lucide.createIcons();
    }
    setTouch(enabled,persist){document.body.classList.toggle('touch-enabled',enabled);document.body.classList.toggle('touch-disabled',!enabled);this.touchEnabled=enabled;if(persist)this.game.state.settings.touch=enabled;}
    notice(text,warn=false,detail=''){
      const now=performance.now();if(text===this.lastNotice&&now-this.noticeTime<800)return;this.lastNotice=text;this.noticeTime=now;
      while($('notices').children.length>=3)$('notices').firstElementChild.remove();
      const el=document.createElement('div');el.className=`notice${warn?' warn':''}`;el.textContent=text;if(detail){const small=document.createElement('small');small.textContent=detail;el.appendChild(small);}$('notices').appendChild(el);setTimeout(()=>el.remove(),detail?6500:2800);
    }
    updatePlanet(){
      const p=this.game.world.cfg;$('planet-name').textContent=p.name;$('planet-number').textContent=`0${this.game.state.planet+1} / 04`;$('biome').textContent=p.biome;$('temperature').textContent=`${p.temp}°C`;
      $('waypoints').innerHTML=this.game.world.beacons.map((b,i)=>`<div class="waypoint ${b.type}" id="waypoint-${i}">${icon(b.icon)}<span>${b.label}</span><small></small></div>`).join('');lucide.createIcons();
    }
    updateHotbar(){
      const g=this.game;$('hotbar').innerHTML=S.HOTBAR.map((id,i)=>`<button class="slot ${g.selected===i?'active':''}" data-slot="${i}" aria-label="${id==='tool'?'多功能采集器':S.RESOURCES[id].name}" aria-pressed="${g.selected===i}" data-tip="${id==='tool'?'采集器 · 长按采矿 / 攻击':S.RESOURCES[id].name+' · 放置方块'}"><span class="key">${i+1}</span>${id==='tool'?icon('pickaxe'):blockIcon(id)}${id==='tool'?'':`<span class="count">${g.state.inventory[id]}</span>`}</button>`).join('');
      $('hotbar').querySelectorAll('[data-slot]').forEach(b=>b.addEventListener('click',()=>g.select(Number(b.dataset.slot))));
      $('tool-label').textContent=g.selected===0?`多功能采集器${g.state.upgrades.laser?' · MK '+(g.state.upgrades.laser+1):''}`:S.RESOURCES[S.HOTBAR[g.selected]].name;
      $('touch-mine').innerHTML=icon(g.selected===0?'pickaxe':'plus');$('touch-mine').setAttribute('aria-label',g.selected===0?'采矿或攻击':'放置方块');lucide.createIcons();
    }
    quest(){
      const s=this.game.state;
      if(!s.upgrades.engine){const needed=[['iron',8],['crystal',4],['carbon',6]],fraction=needed.reduce((n,[id,q])=>n+Math.min(1,s.inventory[id]/q),0)/3;return {step:'01',title:'修复跃迁引擎',detail:needed.map(([id,q])=>`${S.RESOURCES[id].name} ${s.inventory[id]}/${q}`).join(' · '),progress:fraction};}
      if(s.artifacts.length<3)return {step:'02',title:'寻找远古回响',detail:`遗迹碎片 ${s.artifacts.length} / 3 · 每颗星球一段往事`,progress:s.artifacts.length/3};
      if(!s.upgrades.core)return {step:'03',title:'制造星门核心',detail:`星核矿 ${s.inventory.star}/5 · 金 ${s.inventory.gold}/6 · 晶体 ${s.inventory.crystal}/8`,progress:(Math.min(1,s.inventory.star/5)+Math.min(1,s.inventory.gold/6)+Math.min(1,s.inventory.crystal/8))/3};
      if(!s.completed)return {step:'04',title:'穿越远星之门',detail:'弥光星 · 星门信号已唤醒',progress:.85};
      return {step:'∞',title:'星海，未完待续',detail:`已建造 ${s.built} 个方块 · 发现 ${s.discoveries.length} / 24`,progress:1};
    }
    update(){
      const g=this.game,s=g.state;
      for(const [id,n] of [['health',s.health],['oxygen',s.oxygen],['energy',g.energy]]){$(id).textContent=Math.ceil(Math.max(0,n));$(id+'-bar').style.width=`${Math.max(0,n)}%`;}
      $('credits').innerHTML=`${s.credits} <small>研究点</small>`;$('discovery-count').textContent=`发现 ${s.discoveries.length} / 24`;
      const q=this.quest();$('quest-step').textContent=q.step;$('quest-title').textContent=q.title;$('quest-detail').textContent=q.detail;$('quest-progress').style.width=`${q.progress*100}%`;
      const deg=((Math.round(-g.yaw*180/Math.PI)%360)+360)%360,directions=['N','NE','E','SE','S','SW','W','NW'];$('heading').textContent=`${directions[Math.round(deg/45)%8]} · ${String(deg).padStart(3,'0')}°`;
      const p=g.body.position;$('coordinates').textContent=`${p.x>=0?'+':''}${Math.round(p.x)} / ${p.z>=0?'+':''}${Math.round(p.z)} · 海拔 ${Math.max(0,Math.round(p.y))}m`;
      $('weather').textContent=g.storm?'离子风暴':s.planet===1?'轻雪':s.planet===2?'热风':'微风';$('weather').style.color=g.storm?'#ffd196':'';
      const target=g.target;$('target-name').textContent=target?target.type==='drone'?'游荡哨兵':g.protected(target.x,target.y,target.z)?'着陆区 / 遗迹基座':S.BLOCKS[target.id]?.name||'':'';
      const mining=g.mining&&target?.type==='block'&&g.selected===0;$('mining-track').style.opacity=mining?'1':'0';$('mining-track').firstElementChild.style.width=mining?`${Math.min(100,g.mineProgress/S.BLOCKS[target.id].hardness*100)}%`:'0';
      const context=g.context();$('interaction').style.display=context&&!g.paused?'block':'none';if(context)$('interact-button').lastElementChild.textContent=context.label;
      $('scan-cooldown').textContent=g.scanTimer>0?Math.ceil(g.scanTimer):'';$('scan-button').disabled=g.scanTimer>0;$('touch-scan').disabled=g.scanTimer>0;$('damage-flash').style.opacity=g.damageTimer>0?'.7':'0';
    }
    updateWaypoints(){
      const g=this.game,w=innerWidth,h=innerHeight;
      g.world.beacons.forEach((b,i)=>{
        const el=$('waypoint-'+i);if(!el)return;const distance=g.camera.position.distanceTo(b.position),v=b.position.clone().project(g.camera);
        if(v.z>1||v.z<-1||distance<7||g.paused){el.style.display='none';return;}
        el.style.display='flex';el.style.left=`${Math.max(48,Math.min(w-48,(v.x*.5+.5)*w))}px`;el.style.top=`${Math.max(h<500?155:210,Math.min(h-160,(-v.y*.5+.5)*h))}px`;el.querySelector('small').textContent=`${Math.round(distance)} m`;
      });
    }
    open(panel){
      if(this.game.travelling)return;
      if(!this.panel)this.focusReturn=document.activeElement;
      this.panel=panel;this.game.paused=true;this.game.resetInput();document.exitPointerLock?.();$('hud').inert=true;$('modal').classList.remove('hidden');this.selectedPlanet=this.game.state.planet;this.renderPanel();$('close-panel').focus();
    }
    close(resume=true){this.panel=null;$('modal').classList.add('hidden');$('hud').inert=false;this.game.paused=!resume;this.game.resetInput();if(this.focusReturn?.isConnected)this.focusReturn.focus({preventScroll:true});}
    renderPanel(){
      const titles={inventory:'背包与制造',map:'星际航图',journal:'探索记录',pause:'探险已暂停',ending:'来自远星的回响'};
      $('panel-title').textContent=titles[this.panel]||'';$('panel-tabs').classList.toggle('hidden',['pause','ending'].includes(this.panel));document.querySelectorAll('#panel-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.panel===this.panel));
      if(this.panel==='inventory')this.renderInventory();if(this.panel==='map')this.renderMap();if(this.panel==='journal')this.renderJournal();if(this.panel==='pause')this.renderPause();if(this.panel==='ending')this.renderEnding();lucide.createIcons();
    }
    renderInventory(){
      const g=this.game,s=g.state;
      $('panel-content').innerHTML=`<div class="inventory-layout"><section><h3 class="section-heading">随身物资 <span>储量不限</span></h3><div class="resources">${Object.entries(S.RESOURCES).map(([id,r])=>`<div class="resource">${blockIcon(id)}<span>${r.name}</span><strong>${s.inventory[id]}</strong></div>`).join('')}</div><div class="consumables"><button data-consume="oxygen" ${s.oxygen>=100||s.inventory.oxygen<1?'disabled':''}>${icon('wind')}补充氧气</button><button data-consume="medkit" ${s.health>=100||s.inventory.medkit<1?'disabled':''}>${icon('heart-pulse')}恢复护盾</button></div><h3 class="section-heading supply-heading">轨道补给 <span>${s.credits} 研究点</span></h3><div class="recipe"><div class="recipe-info"><h3>应急补给包</h3><p>跃迁燃料 × 1 · 氧气罐 × 2</p><span class="costs">80 研究点</span></div><button data-action="supply" ${s.credits<80?'disabled':''}>兑换</button></div></section><section><h3 class="section-heading">便携制造终端 <span>TECHNOLOGY</span></h3>${S.RECIPES.map(r=>{const done=r.upgrade&&s.upgrades[r.upgrade]>=r.max;return `<div class="recipe">${icon(r.icon)}<div class="recipe-info"><h3>${r.name}${r.upgrade&&r.max>1?` · ${s.upgrades[r.upgrade]}/${r.max}`:''}</h3><p>${r.desc}</p><div class="costs">${Object.entries(r.cost).map(([id,n])=>`<span class="${s.inventory[id]>=n?'enough':'missing'}">${S.RESOURCES[id].name} ${s.inventory[id]}/${n}</span>`).join('')}</div></div><button data-craft="${r.id}" ${!S.canCraft(s,r)?'disabled':''}>${done?'已安装':'制造'}</button></div>`;}).join('')}</section></div>`;
    }
    renderMap(){
      const g=this.game,s=g.state,p=S.PLANETS[this.selectedPlanet],current=this.selectedPlanet===s.planet;
      const reason=current?'当前所在星球':!s.upgrades.engine?'跃迁引擎尚未修复':!g.nearShip()?'飞船等待登舰':s.inventory.fuel<1?'跃迁燃料不足':'';
      $('panel-content').innerHTML=`<div class="map-summary"><span>回响星系 <strong>ECHOS-07</strong></span><span>跃迁燃料 <strong>${s.inventory.fuel}</strong> · 已抵达 ${s.visited.length}/4</span></div><div class="star-map">${S.PLANETS.map((planet,i)=>`<button class="planet-choice ${this.selectedPlanet===i?'selected':''}" data-planet="${i}" aria-label="${planet.name}" aria-pressed="${this.selectedPlanet===i}"><img src="${this.thumbnails[i]}" alt="${planet.name}地貌"><strong>${planet.name}</strong><small>${i===s.planet?'当前位置':s.visited.includes(i)?'已发现':'未探索'} · ${planet.biome}</small></button>`).join('')}</div><div class="planet-details"><div><h3>${p.name} <small class="planet-code">${p.code}</small></h3><p>${p.desc}</p><p>温度 ${p.temp}°C · 重力 ${(p.gravity/17).toFixed(2)}G · ${p.danger>.5?'高危环境':p.danger?'环境风险低':'宜居环境'}</p></div><div><button class="primary" data-action="travel" ${reason?'disabled':''}>${icon('rocket')}${current?'已着陆':'启动跃迁'}</button><div class="flight-status">${reason||'消耗 1 份跃迁燃料'}</div></div></div>`;
    }
    renderJournal(){
      const s=this.game.state;
      $('panel-content').innerHTML=`<div class="journal-stats"><div><strong>${s.discoveries.length}<small>/24</small></strong><span>生态与矿物发现</span></div><div><strong>${s.artifacts.length}<small>/3</small></strong><span>遗迹碎片</span></div><div><strong>${s.credits}</strong><span>研究点</span></div></div><div class="discovery-list">${s.artifacts.map(id=>`<div class="discovery">${icon('diamond')}<div><h3>${S.PLANETS[id].artifact}</h3><p>${S.PLANETS[id].name} · 古代文明 / 信号已解码</p></div></div>`).join('')}${s.discoveries.map(id=>{const [planet,type,n]=id.split('-'),p=S.PLANETS[planet];if(!p)return '';const name=type==='fauna'?p.fauna[n]:S.BLOCKS[[5,6,Number(planet)>1?10:3][n]]?.name;return `<div class="discovery">${icon(type==='fauna'?'fingerprint':'gem')}<div><h3>${name||'未知样本'}</h3><p>${p.name} · ${type==='fauna'?'生命样本':'矿物样本'} / +40 研究点</p></div></div>`;}).join('')}</div>${s.discoveries.length+s.artifacts.length===0?'<p class="empty-state">生态数据库为空 · 等待扫描信号</p>':''}`;
    }
    renderPause(){
      const s=this.game.state;
      $('panel-content').innerHTML=`<div class="pause-layout"><label class="setting">环境与交互音效<input type="checkbox" data-setting="sound" ${s.settings.sound?'checked':''}></label><label class="setting">视角灵敏度<input type="range" data-setting="sensitivity" min="0.3" max="2" value="${s.settings.sensitivity}" step="0.1"></label><label class="setting">高精度渲染<input type="checkbox" data-setting="quality" ${s.settings.quality===1?'checked':''}></label><label class="setting">触屏控制<input type="checkbox" data-setting="touch" ${this.touchEnabled?'checked':''}></label><div class="pause-actions"><button data-action="resume">${icon('play')}继续探险</button><button data-action="save">${icon('save')}保存</button><button data-action="export">${icon('download')}导出存档</button><button data-action="import">${icon('upload')}导入存档</button><a href="../index.html">${icon('house')}项目主页</a><button class="danger" data-action="reset">${icon('rotate-ccw')}重新开始</button><input class="hidden" type="file" accept="application/json,.json" id="import-file"></div><p class="save-note">${S.PLANETS[s.planet].name} · 探险时长 ${Math.floor(s.playTime/60)} 分钟 · 已采集 ${s.mined} 个方块</p><div id="reset-confirm" class="hidden"><p class="save-note">当前探险将被替换。未导出的进度无法恢复。</p><div class="pause-actions"><button class="danger" data-action="confirm-reset">确认开始新探险</button><button data-action="cancel-reset">取消</button></div></div></div>`;
    }
    renderEnding(){const s=this.game.state;$('panel-content').innerHTML=`<div class="ending">${icon('orbit')}<div class="eyebrow ending-eyebrow">EXPEDITION COMPLETE</div><h3>你不是星海中唯一的回响。</h3><p>三枚碎片点亮了沉默的星门。<br>来自未知星系的第一条讯息，终于抵达。</p><div class="journal-stats ending-stats"><div><strong>${s.visited.length}</strong><span>到访星球</span></div><div><strong>${s.discoveries.length}</strong><span>独特发现</span></div><div><strong>${s.built}</strong><span>建造方块</span></div></div><button class="primary" data-action="resume">${icon('compass')}继续自由探索</button></div>`;}
    panelClick(e){
      const b=e.target.closest('button');if(!b||b.disabled)return;
      const g=this.game,s=g.state;
      if(b.dataset.craft){const y=$('panel-content').scrollTop;g.craft(b.dataset.craft);$('panel-content').scrollTop=y;return;}
      if(b.dataset.consume){g.consume(b.dataset.consume);return;}
      if(b.dataset.planet!==undefined){this.selectedPlanet=Number(b.dataset.planet);this.renderMap();lucide.createIcons();return;}
      switch(b.dataset.action){
        case 'resume':this.close();break;
        case 'travel':g.travel(this.selectedPlanet);break;
        case 'supply':if(s.credits>=80){s.credits-=80;s.inventory.fuel++;s.inventory.oxygen+=2;this.renderPanel();g.save();this.notice('轨道补给已送达');}break;
        case 'save':if(g.saveBlocked)this.notice('旧存档读取失败，请先导出或开始新探险',true);else if(g.save())this.notice('探险进度已保存');break;
        case 'export':this.exportSave();break;
        case 'import':$('import-file').click();break;
        case 'reset':$('reset-confirm').classList.remove('hidden');break;
        case 'cancel-reset':$('reset-confirm').classList.add('hidden');break;
        case 'confirm-reset':g.state=S.freshState();g.saveBlocked=false;g.loadPlanet(0);g.time=0;g.lastSave=0;g.scanTimer=0;g.select(0);g.save();this.close();this.notice('新探险已开始');break;
      }
    }
    exportSave(){
      const g=this.game;g.save();const data=new Blob([JSON.stringify(g.state,null,2)],{type:'application/json'}),url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download='starblocks-expedition.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.notice('存档已导出');
    }
    async importSave(file){
      if(file.size>6*1024*1024){this.notice('存档文件过大',true);return;}
      try{const state=S.parseSave(await file.text());this.game.state=state;this.game.saveBlocked=false;this.game.loadPlanet(state.planet,true);this.game.select(0);this.game.scanTimer=0;this.game.resetInput();this.setTouch(state.settings.touch ?? this.touchDetected,false);this.game.resize();this.game.save();this.renderPanel();this.notice('探险存档已恢复');}catch(_){this.notice('无法导入：存档格式无效，当前进度未改变',true);}
    }
    saved(){$('save-state').textContent='进度已保存';clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>$('save-state').textContent='探索中',2600);}
    planetImage(id){
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;const ctx=canvas.getContext('2d'),image=ctx.createImageData(160,160),base=new THREE.Color(['#77b59a','#b7d9dd','#c99682','#aaaccc'][id]),seed=S.PLANETS[id].seed;
      for(let y=0;y<160;y++)for(let x=0;x<160;x++){
        const dx=(x-80)/64,dy=(y-80)/64,r=dx*dx+dy*dy;if(r>1)continue;
        const z=Math.sqrt(1-r),shade=Math.max(.22,(z*.7-dx*.4-dy*.5)),land=Math.sin(dx*13+id)*Math.cos(dy*12)+Math.sin(dy*20+dx*8),noise=S.hash(Math.floor(x/3),Math.floor(y/3),seed),factor=(land>.25?.78:1.08)*shade+(noise-.5)*.1,i=(y*160+x)*4;
        image.data[i]=Math.min(255,base.r*255*factor);image.data[i+1]=Math.min(255,base.g*255*factor);image.data[i+2]=Math.min(255,base.b*255*factor);image.data[i+3]=255;
      }ctx.putImageData(image,0,0);return canvas.toDataURL('image/png');
    }
    warp(id){
      $('travel-name').textContent=S.PLANETS[id].name;$('travel-screen').classList.remove('hidden');$('travel-phase').textContent='正在折叠时空';
      const canvas=$('warp-canvas');canvas.width=innerWidth;canvas.height=innerHeight;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,r=S.random(15),stars=Array.from({length:140},()=>({x:(r()-.5)*w,y:(r()-.5)*h,z:r()*1+.05})),start=performance.now(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      return new Promise(resolve=>{const draw=now=>{const elapsed=now-start,t=Math.min(1,elapsed/2400);ctx.fillStyle='#071317';ctx.fillRect(0,0,w,h);if(!reduced){ctx.strokeStyle='#b9dfd5';ctx.lineWidth=1.3;for(const star of stars){const z=(star.z-t*2%1+1)%1+.04,x=star.x/z+w/2,y=star.y/z+h/2,old=z+.045+t*.09;ctx.globalAlpha=Math.min(1,.6/z);ctx.beginPath();ctx.moveTo(star.x/old+w/2,star.y/old+h/2);ctx.lineTo(x,y);ctx.stroke();}ctx.globalAlpha=1;}if(elapsed>1650)$('travel-phase').textContent='大气层接入 · 准备着陆';if(elapsed<2400)requestAnimationFrame(draw);else resolve();};requestAnimationFrame(draw);});
    }
    finishWarp(){$('travel-screen').classList.add('hidden');}
  };
  function boot(){
    try{if(!window.THREE||!window.CANNON||!window.lucide)throw Error('本地依赖未加载');const game=new S.Game();window.game=game;const ui=new S.UI(game);game.start(ui);}
    catch(error){console.error(error);$('loading').innerHTML='<div class="fatal"><h1>无法启动图形引擎</h1><p>请使用支持 WebGL 的浏览器，并开启硬件加速。游戏文件夹需要保持完整。</p><a href="../index.html">返回项目主页</a></div>';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
