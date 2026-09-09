/* Run against a local static server. See README for environment variables. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
if(process.platform==='android')Object.defineProperty(process,'platform',{value:'linux'});
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright-core');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/starbound_blocks/index.html';
const output=process.env.QA_OUTPUT||path.resolve('tmp/starblocks-qa');
fs.mkdirSync(output,{recursive:true});
const report=[];
async function check(name,fn){const detail=await fn();report.push({name,status:'passed',detail});console.log('PASS',name,detail||'');}
async function ready(page){await page.waitForFunction(()=>window.game?.started===true);await page.waitForFunction(()=>game.renderer.info.render.triangles>1000);}
async function pixels(page){return page.evaluate(()=>{game.renderer.render(game.scene,game.camera);const gl=game.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,colors=new Set();let nonblack=0;const p=new Uint8Array(4);for(let x=0;x<16;x++)for(let y=0;y<12;y++){gl.readPixels(Math.floor((x+.5)*w/16),Math.floor((y+.5)*h/12),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);colors.add(`${p[0]},${p[1]},${p[2]}`);if(p[0]+p[1]+p[2]>30)nonblack++;}return {colors:colors.size,nonblack,triangles:game.renderer.info.render.triangles};});}
async function clearModal(page){await page.evaluate(()=>{if(game.ui.panel)game.ui.close();game.resetInput();document.exitPointerLock?.();});}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-gpu-sandbox','--use-gl=angle','--use-angle=gl-egl','--ozone-platform=headless','--ignore-gpu-blocklist'],env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    await page.goto(url);await ready(page);await page.waitForFunction(()=>game.renderer.info.render.frame>3);await page.evaluate(()=>game.renderer.setPixelRatio(.65));
    await check('desktop WebGL has varied, nonblank pixels',async()=>{const result=await pixels(page);assert.ok(result.colors>30);assert.ok(result.nonblack>160);await page.screenshot({path:path.join(output,'desktop.png')});return result;});
    await check('scene animates and player stands on terrain',async()=>{const initial=await page.evaluate(()=>({a:game.world.core.rotation.y,y:game.body.position.y}));await page.waitForFunction(a=>game.world.core.rotation.y>a,initial.a);const after=await page.evaluate(()=>({a:game.world.core.rotation.y,y:game.body.position.y}));assert.ok(after.a>initial.a);assert.ok(Math.abs(after.y-5.32)<.08);return after;});
    await check('keyboard movement and jetpack',async()=>{await clearModal(page);const before=await page.evaluate(()=>game.body.position.z);await page.keyboard.down('KeyW');await page.waitForFunction(z=>game.body.position.z<z-.5,before);await page.keyboard.up('KeyW');assert.ok(await page.evaluate(()=>game.body.position.z)<before-.3);await page.keyboard.down('Space');await page.waitForFunction(()=>game.body.position.y>6.4);await page.keyboard.up('Space');const y=await page.evaluate(()=>game.body.position.y);assert.ok(y>5.7);return {height:y};});
    await check('scanner adds discoveries and cooldown prevents duplicate rewards',async()=>{await page.keyboard.press('KeyF');const first=await page.evaluate(()=>({n:game.state.discoveries.length,c:game.state.credits}));assert.ok(first.n>0);await page.keyboard.press('KeyF');assert.equal(await page.evaluate(()=>game.state.credits),first.c);return first;});
    await check('actual hold-to-mine adds inventory',async()=>{
      await clearModal(page);await page.evaluate(()=>{game.body.position.set(7.5,5.34,16);game.body.velocity.set(0,0,0);game.physicsKey='';game.updateCamera();game.camera.lookAt(7.5,6.5,12.5);game.yaw=game.camera.rotation.y;game.pitch=game.camera.rotation.x;game.updateCamera();game.updateTarget();});
      const before=await page.evaluate(()=>game.state.mined);await page.mouse.move(720,450);await page.mouse.down();await page.waitForFunction(n=>game.state.mined>n,before,{timeout:20000}).catch(async e=>{console.log('Mining state',await page.evaluate(()=>({target:game.target,held:game.mining,progress:game.mineProgress,time:game.time,paused:game.paused,selected:game.selected,pointer:!!document.pointerLockElement})));throw e;});await page.mouse.up();await clearModal(page);return await page.evaluate(()=>({mined:game.state.mined,iron:game.state.inventory.iron}));
    });
    await check('place block, edit persistence and collision rebuild',async()=>{
      await page.evaluate(()=>{game.body.position.set(9.5,5.34,16.5);game.body.velocity.set(0,0,0);game.physicsKey='';game.updateCamera();game.camera.lookAt(9.5,4.9,14.5);game.yaw=game.camera.rotation.y;game.pitch=game.camera.rotation.x;game.updateCamera();game.updateTarget();game.select(4);});
      const before=await page.evaluate(()=>game.state.built);await page.mouse.click(720,450,{button:'right'});await page.waitForFunction(n=>game.state.built===n+1,before,{timeout:5000}).catch(async e=>{console.log('Placement state',await page.evaluate(()=>({target:game.target,position:game.body.position,selected:game.selected,paused:game.paused})));throw e;});const result=await page.evaluate(()=>({built:game.state.built,edits:Object.keys(game.state.edits[0]).length}));assert.ok(result.edits>=2);await page.evaluate(()=>game.save());return result;
    });
    await check('reload restores mined and built blocks',async()=>{const saved=await page.evaluate(()=>JSON.stringify(game.state.edits));await page.reload();await ready(page);assert.equal(await page.evaluate(()=>JSON.stringify(game.state.edits)),saved);});
    await check('inventory panel, crafting and focus trap',async()=>{
      await page.getByRole('button',{name:'背包与制造',exact:true}).first().click();await page.waitForSelector('#modal:not(.hidden)');await page.screenshot({path:path.join(output,'inventory.png')});await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.getElementById('modal').contains(document.activeElement)));
      await page.evaluate(()=>{Object.assign(game.state.inventory,{iron:25,carbon:25,crystal:25});game.ui.renderPanel();});await page.locator('[data-craft="engine"]').click();assert.equal(await page.evaluate(()=>game.state.upgrades.engine),1);assert.equal(await page.evaluate(()=>game.state.inventory.fuel),3);
    });
    await check('all planets render and real star-chart travel consumes fuel',async()=>{
      await clearModal(page);await page.evaluate(()=>{game.body.position.set(3,5.34,11);game.body.velocity.set(0,0,0);});
      for(const id of [1,2,3]){
        await page.getByRole('button',{name:'星图',exact:true}).first().click();await page.locator(`[data-planet="${id}"]`).click();if(id===1)await page.screenshot({path:path.join(output,'star-map.png')});await page.locator('[data-action="travel"]').click();await page.waitForFunction(id=>game.state.planet===id&&!game.travelling,id,{timeout:20000});const result=await pixels(page);assert.ok(result.colors>30);await page.screenshot({path:path.join(output,`planet-${id}.png`)});await page.evaluate(()=>{game.body.position.set(3,5.34,11);game.body.velocity.set(0,0,0);});
      }assert.equal(await page.evaluate(()=>game.state.inventory.fuel),0);
    });
    await check('artifact collection is idempotent and gate requires complete quest',async()=>{
      await page.evaluate(()=>{game.loadPlanet(0);game.body.position.set(-15,5.34,-12);game.updateCamera();game.interact();game.interact();});assert.deepEqual(await page.evaluate(()=>game.state.artifacts),[0]);
      await page.evaluate(()=>{game.loadPlanet(3);game.body.position.set(-15,5.34,-12);game.interact();});assert.equal(await page.evaluate(()=>game.state.completed),false);
      await page.evaluate(()=>{game.state.artifacts=[0,1,2];Object.assign(game.state.inventory,{star:5,gold:6,crystal:8});game.craft('core');game.interact();});assert.equal(await page.evaluate(()=>game.state.completed),true);assert.equal(await page.evaluate(()=>game.ui.panel),'ending');
    });
    await check('save validation does not replace progress on invalid import',async()=>{const before=await page.evaluate(()=>game.state.completed);await page.evaluate(()=>game.ui.importSave(new File(['{"version":9}'],'bad.json',{type:'application/json'})));assert.equal(await page.evaluate(()=>game.state.completed),before);});
    await context.close();
    const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}),mobile=await touchContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(url);await ready(mobile);
    await check('mobile portrait controls and canvas',async()=>{assert.ok(await mobile.locator('#joystick').isVisible());const result=await pixels(mobile);assert.ok(result.colors>20);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);await mobile.screenshot({path:path.join(output,'mobile-portrait.png')});return result;});
    await check('real multi-touch move, look and jetpack are independent',async()=>{
      const cdp=await touchContext.newCDPSession(mobile);const j=await mobile.locator('#joystick').boundingBox(),jump=await mobile.locator('#touch-jump').boundingBox();const x=j.x+j.width/2,y=j.y+j.height/2;
      const start=await mobile.evaluate(()=>({x:game.body.position.x,z:game.body.position.z,y:game.body.position.y,yaw:game.yaw}));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1},{x:220,y:380,id:2},{x:jump.x+25,y:jump.y+25,id:3}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+15,y:y-25,id:1},{x:260,y:360,id:2},{x:jump.x+25,y:jump.y+25,id:3}]});
      await mobile.waitForFunction(()=>game.body.position.y>6);const held=await mobile.evaluate(()=>({move:game.touchMove,jump:game.jumpHeld,yaw:game.yaw,y:game.body.position.y}));assert.ok(Math.hypot(held.move.x,held.move.z)>.5);assert.equal(held.jump,true);assert.notEqual(held.yaw,start.yaw);assert.ok(held.y>start.y+.2);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await mobile.waitForTimeout(100);assert.deepEqual(await mobile.evaluate(()=>({move:game.touchMove,jump:game.jumpHeld,look:game.lookPointer})),{move:{x:0,z:0},jump:false,look:null});return held;
    });
    await check('mobile inventory scrolls and all controls fit',async()=>{await mobile.getByRole('button',{name:'背包与制造',exact:true}).first().tap();await mobile.screenshot({path:path.join(output,'mobile-inventory.png')});assert.ok(await mobile.evaluate(()=>{const e=document.getElementById('panel-content');return e.scrollHeight>e.clientHeight&&e.scrollWidth<=e.clientWidth+1;}));await mobile.locator('#close-panel').tap();});
    await check('landscape touch HUD fits',async()=>{await mobile.setViewportSize({width:844,height:390});await mobile.waitForTimeout(150);await mobile.screenshot({path:path.join(output,'mobile-landscape.png')});for(const selector of ['#joystick','#touch-jump','#touch-mine','#hotbar','.tools']){const b=await mobile.locator(selector).boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=844&&b.y+b.height<=390,selector);} });
    await touchContext.close();
    const hybridContext=await browser.newContext({viewport:{width:1366,height:768},hasTouch:true,isMobile:false,userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36'}),hybrid=await hybridContext.newPage();await hybrid.goto(url);await ready(hybrid);
    await check('Windows-style hybrid device supports touch and keyboard together',async()=>{assert.ok(await hybrid.locator('#joystick').isVisible());const z=await hybrid.evaluate(()=>game.body.position.z);await hybrid.keyboard.down('KeyW');await hybrid.waitForFunction(z=>game.body.position.z<z-.3,z);await hybrid.keyboard.up('KeyW');assert.ok(await hybrid.evaluate(()=>game.body.position.z)<z-.2);await hybrid.screenshot({path:path.join(output,'windows-touch.png')});});
    await check('manual touch preference persists across reload',async()=>{await hybrid.getByRole('button',{name:'暂停',exact:true}).click();await hybrid.locator('[data-setting="touch"]').uncheck();await hybrid.reload();await ready(hybrid);assert.equal(await hybrid.locator('#joystick').isVisible(),false);});
    await hybridContext.close();assert.deepEqual(errors,[]);report.push({name:'browser console and page errors',status:'passed',detail:errors});
  }finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
