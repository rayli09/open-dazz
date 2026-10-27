// Production layout and player regression. Generated fixtures/captures stay in /tmp.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out=process.env.LAYOUT_VERIFY_OUT || '/tmp/opendazz-layout-verification';
mkdirSync(out,{recursive:true});
for (const [name,size] of [['landscape','640x360'],['portrait','240x426']]) execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',`testsrc2=size=${size}:rate=12`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',`${out}/${name}.mp4`]);
const browser=await chromium.launch({executablePath:process.env.BROWSER_BIN || '/usr/bin/chromium',args:['--no-sandbox']});
const results=[], errors=[];
const cases=[[1440,900,'simple','portrait'],[1440,900,'pro','landscape'],[1366,768,'pro','landscape'],[1280,720,'simple','portrait'],[1280,720,'simple','landscape-video'],[1024,640,'pro','portrait-video'],[390,844,'simple','portrait'],[390,844,'simple','landscape-video'],[360,740,'pro','portrait-video'],[844,390,'simple','landscape-video']];
try {
 for(const [width,height,mode,media] of cases) {
  const context=await browser.newContext({viewport:{width,height},acceptDownloads:true}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const ready=()=>page.waitForFunction(()=>!!document.querySelector('#btn-export-simple')&&!document.querySelector('#btn-export-simple').disabled,{timeout:90000});
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:4173');await ready();
  if(mode==='pro'){await page.locator('#mode-pro').click();await ready();}
  if(media==='landscape') {await page.locator('.sample-menu summary').click();await page.locator('#btn-s2').click();await ready();assert.equal(await page.locator('.sample-menu').evaluate(e=>e.open),false);}
  if(media.endsWith('video')) {
   await page.locator('#file').setInputFiles(`${out}/${media.startsWith('portrait')?'portrait':'landscape'}.mp4`);await ready();
   // A paused first frame must already contain actual filtered pixels.
   await page.waitForFunction(()=>{const c=document.querySelector('#video-filter'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.some((v,i)=>i%4===3&&v>0);},{timeout:30000});
   assert.equal(await page.locator('#source-video').evaluate(v=>v.paused),true);
   await page.locator('media-play-button').click();await page.waitForFunction(()=>document.querySelector('#source-video').currentTime>.15);await page.locator('media-play-button').click();
   await page.locator('media-time-slider').click({position:{x:60,y:20}});await page.waitForTimeout(150);
   const video=await page.locator('#source-video').evaluate(v=>({w:v.videoWidth,h:v.videoHeight}));
   assert.equal(video.w>video.h,media.startsWith('landscape'));
   if(height<500) {
    await page.locator('#player-expand').click();await page.waitForFunction(()=>!!document.fullscreenElement);
    const full=await page.locator('.player-picture').boundingBox();assert.ok(full.height>=240,'short landscape windows can expand actual video');
    await page.screenshot({path:`${out}/${width}x${height}-expanded-video.png`});
    await page.locator('media-fullscreen-button').click();await page.waitForFunction(()=>!document.fullscreenElement);
    await page.locator('#stage-wrap').evaluate(e=>e.scrollTo(0,0));
   }
  }
  await page.waitForFunction(()=>!document.querySelector('#media-dock').classList.contains('dock-notice-active'));
  const exp=page.locator(mode==='simple'?'#btn-export-simple':'#btn-export');
  const exportBox=await exp.boundingBox(),dock=await page.locator('#media-dock').boundingBox();
  assert.ok(exportBox.y>=0 && exportBox.y+exportBox.height<=height, `${width}×${height}: export must remain in the window`);
  if (width > 600) {
   assert.ok(dock && exportBox.y+exportBox.height<=dock.y+1, 'export stays above the dock');
   assert.ok(dock.y+dock.height<=height, 'dock remains in the window');
  } else {
   assert.equal(dock, null, 'mobile media dock starts closed');
   await page.locator('#mobile-media-toggle').click();
   assert.equal(await page.locator('#media-dock').isVisible(), true);
   await page.locator('#dock-close').click();
   assert.equal(await page.locator('#media-dock').isVisible(), false);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
  const photo=await page.locator('#printwrap').boundingBox(),stage=await page.locator('#stage-wrap').boundingBox();
  if(width===1280&&media==='portrait') assert.ok(photo.height>=350,'short laptop still provides a useful portrait preview');
  if(width===390&&media==='portrait') assert.ok(photo.height>=340,'mobile portrait leaves useful space for the look rail');
  const name=`${width}x${height}-${mode}-${media}`;
  await page.screenshot({path:`${out}/${name}.png`});
  results.push({name,stage,photo,video:await page.locator('.player-picture').boundingBox(),dock,export:exportBox});
  if(width>=1024) {
   const before=stage.width;await page.locator('#toggle-looks').click();
   assert.ok((await page.locator('#stage-wrap').boundingBox()).width>before,'collapsing looks expands the stage');
   if(mode==='pro') await page.locator('#toggle-adjustments').click();
   assert.equal(await exp.isVisible(),true,'export remains available with both panels collapsed');
   await page.screenshot({path:`${out}/${name}-focus.png`});await page.locator('#toggle-looks').click();
  } else if (mode === 'simple' && width <= 600) {
   const rail = page.locator('#mobile-look-strip');
   assert.equal(await rail.isVisible(), true);
   assert.ok(await rail.evaluate(e => e.scrollWidth > e.clientWidth), 'look rail scrolls horizontally');
   assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'phone page does not scroll vertically');
   const card = rail.locator('button').nth(1);
   await card.click(); await ready();
   assert.equal(await card.getAttribute('aria-pressed'), 'true');
   await page.locator('#mobile-looks [data-simple-media="video"]').click();
   assert.equal(await page.locator('#mobile-looks [data-simple-media="video"]').getAttribute('aria-pressed'), 'true');
   assert.ok(await rail.locator('button').count() > 0, 'video looks remain reachable');
   await page.locator('#mobile-looks [data-simple-media="photo"]').click(); await ready();
   if (!media.endsWith('video')) {
    const compare = page.locator('#photo-compare');
    assert.equal(await compare.getAttribute('aria-pressed'), 'false');
    await compare.click(); assert.equal(await compare.getAttribute('aria-pressed'), 'true');
    await compare.click(); assert.equal(await compare.getAttribute('aria-pressed'), 'false');
   }
  } else {
   assert.equal(await page.locator('#look-shelf').isVisible(),false);
   await page.locator('#toggle-looks').click();
   const rail=mode==='simple'?'#look-shelf':'#look-cabinet';assert.equal(await page.locator(rail).isVisible(),true);
   if(mode==='pro') {
    await page.locator('[data-dd-btn="brand"]').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#toggle-looks').getAttribute('aria-expanded'),'true','Escape closes the nested dropdown before its drawer');
   }
   await page.keyboard.press('Escape');assert.equal(await page.locator('#toggle-looks').evaluate(e=>e===document.activeElement),true);
   if(mode==='pro') {
    await page.locator('#toggle-adjustments').click();await page.locator('#num-strength').fill('63');await page.locator('#num-strength').press('Tab');await ready();
    if(height>=500) assert.ok((await page.locator('#adjustments-panel').boundingBox()).y+(await page.locator('#adjustments-panel').boundingBox()).height<=(await exp.boundingBox()).y,'drawer leaves export accessible');
    await page.screenshot({path:`${out}/${name}-adjustments.png`});
    await page.keyboard.press('Escape');await page.locator('#toggle-adjustments').click();assert.equal(await page.locator('#num-strength').inputValue(),'63');
    await page.locator('[data-close-panel="adjustments"]').click();assert.equal(await exp.isVisible(),true);
   } else {
    await page.locator('#toggle-looks').click();await page.locator('[data-preset="ricoh-bw"]').click();await ready();
    assert.equal(await page.locator('#toggle-looks').getAttribute('aria-expanded'),'false','selecting a look restores the mobile canvas');
   }
  }
  await context.close();
  console.log('checked',name);
 }
 assert.deepEqual(errors,[]);
 writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log('PASS',results.map(r=>r.name));
} finally {await browser.close();}
