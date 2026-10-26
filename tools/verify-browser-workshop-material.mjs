// Production main-page material rollout QA. No test hooks in shipped application.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.WORKSHOP_VERIFY_OUT || '/tmp/opendazz-workshop-material';
mkdirSync(out,{recursive:true});
execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x240:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',`${out}/clip.mp4`]);
const browser = await chromium.launch({executablePath:process.env.BROWSER_BIN || '/usr/bin/chromium',args:['--no-sandbox']});
const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page = await context.newPage(), errors=[], checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const ready = () => page.waitForFunction(()=>!!document.querySelector('#btn-export-simple') && !document.querySelector('#btn-export-simple').disabled,{timeout:90000});
const shot = async name => {await page.waitForTimeout(180);await page.screenshot({path:`${out}/${name}.png`});};
const top = () => page.evaluate(()=>document.querySelector('main').scrollTo(0,0));
const mode = async m => {await page.locator(`#mode-${m}`).click();await ready();await page.waitForTimeout(180);};
try {
 await page.goto(process.env.BASE_URL || 'http://127.0.0.1:4173');await ready();
 assert.equal(await page.locator('#btn-export-simple').evaluate(e=>e.classList.contains('camera-shutter')),true);
 assert.match(await page.locator('#editing-mode .mode-carriage').evaluate(e=>getComputedStyle(e).backgroundImage),/linear-gradient/);
 await shot('main-desktop-simple');await mode('pro');
 assert.equal(await page.locator('.strength-control .dial-grip').count(),1);
 await shot('main-desktop-pro');
 // Direct percent, bounded input, slider and linear drag all commit the same state.
 await page.locator('#num-strength').fill('63');await page.locator('#num-strength').press('Tab');
 assert.equal(await page.locator('#sl-strength').inputValue(),'0.63');assert.equal(await page.locator('#val-strength').textContent(),'63%');
 await page.locator('#sl-strength').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#num-strength').inputValue(),'64');
 await page.locator('#num-strength').fill('151');assert.equal(await page.locator('#num-strength').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#sl-strength').inputValue(),'0.64');await page.locator('#num-strength').press('Tab');assert.equal(await page.locator('#num-strength').inputValue(),'64');
 const grip=await page.locator('.dial-grip').boundingBox();await page.mouse.move(grip.x+40,grip.y+40);await page.mouse.down();await page.mouse.move(grip.x+64,grip.y+40);await page.mouse.up();assert.ok(Number(await page.locator('#num-strength').inputValue())>64);
 await page.locator('#num-temp').fill('-0.25');await page.locator('#num-temp').press('Tab');assert.equal(await page.locator('#sl-temp').inputValue(),'-0.25');
 const edited = await page.locator('#sl-strength').inputValue();
 await page.locator('#btn-s2').click();await ready();await page.locator('.dock-item').first().click();await ready();assert.equal(await page.locator('#sl-strength').inputValue(),edited);
 checks.push('main output contains shared controls; percent/numeric/keyboard/linear drag and per-item settings');
 // Header focus and accessible dropdown activation; actions remain visible on desktop.
 await page.keyboard.press('Tab');await page.locator('#mode-pro').focus();assert.equal(await page.locator('#mode-pro').evaluate(e=>e.matches(':focus-visible')),true);assert.equal(await page.locator('#mode-pro').evaluate(e=>getComputedStyle(e).outlineWidth),'2px');await shot('main-focus');
 await page.locator('[data-dd-btn="brand"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-dd="brand"] .dd-panel').evaluate(e=>e.classList.contains('open')),true);await page.keyboard.press('Escape');
 assert.equal(await page.locator('#btn-export').evaluate(e=>{const r=e.getBoundingClientRect();const dock=document.querySelector('#media-dock').getBoundingClientRect();return r.top>=80 && r.bottom<=dock.top;}),true);
 checks.push('keyboard focus, dropdown Enter/Escape and always-reachable desktop Export');
 await page.locator('#btn-export').hover();await shot('main-hover');await page.mouse.down();await shot('main-pressed');await page.mouse.move(10,90);await page.mouse.up();
 const dl=page.waitForEvent('download');await page.locator('#btn-export').click();await (await dl).saveAs(`${out}/main-photo.png`);await ready();
 // Removal/undo resources and material states without changing editing mechanics.
 await page.locator('#dock-remove').click();await shot('main-undo');await page.locator('#dock-undo').click();await ready();
 await page.reload();await ready();await shot('main-recovery');
 // Recoverable catalog/look error, then exact successful retry.
 await context.clearCookies();await page.evaluate(()=>localStorage.clear());await page.reload();await ready();let fail=true;
 await page.route('**/ricoh-superior-100-negative-film.cube',r=>fail?r.fulfill({status:503,body:'temporary unavailable'}):r.continue());
 await page.locator('[data-preset="ricoh-negative"]').click();await page.locator('#work-error').waitFor({state:'visible'});await shot('main-error-disabled');assert.equal(await page.locator('#btn-export-simple').isDisabled(),true);fail=false;await page.locator('#work-retry').click();await ready();
 checks.push('real PNG download, delete/undo, settings restore and actionable retry/disabled states');
 for (const width of [390,320]) {
  await page.setViewportSize({width,height:844});await mode('simple');await top();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await shot(`main-mobile-${width}`);
  assert.equal(await page.locator("#btn-export-simple").evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector("#media-dock").getBoundingClientRect().top),true);
  const dimensions=await page.locator('#editing-mode button,#btn-export-simple,#dock-add').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width).map(e=>({id:e.id,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
  for (const d of dimensions) assert.ok(d.h>=44 && d.w>=44,JSON.stringify(d));
  await mode('pro');await page.locator('.dial-grip').scrollIntoViewIfNeeded();assert.ok(await page.locator('.ledger-content').evaluate(e=>e.getBoundingClientRect().height)>500);await shot(`main-mobile-pro-${width}`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
 }
 await page.setViewportSize({width:1440,height:1000});await mode('simple');await top();
 while (await page.locator('.dock-item').count()) await page.locator('#dock-remove').click();
 await shot('main-empty');await page.locator('#dock-undo').click();await ready();
 await page.locator('#file').setInputFiles(`${out}/clip.mp4`);await ready();
 await page.locator('[data-simple-media="video"]').click();await page.locator('[data-preset="nokia-n95"]').click();await ready();await shot('main-video-desktop');
 await page.locator('media-play-button').click();await page.waitForTimeout(350);await page.locator('media-play-button').click();
 await page.setViewportSize({width:390,height:844});await top();await page.waitForTimeout(3100);await shot('main-video-mobile');
 await page.locator('#btn-export-simple').scrollIntoViewIfNeeded();await shot('main-video-mobile-export');
 checks.push('main empty/undo and filtered player material in desktop/mobile playback states');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#btn-export').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 checks.push('390/320px layouts, 44px key targets, direct touch/numeric alternatives and reduced motion');
 const touch = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const t = await touch.newPage();await t.goto(process.env.BASE_URL || 'http://127.0.0.1:4173');await t.waitForFunction(()=>!!document.querySelector('#mode-pro'));await t.locator('#mode-pro').tap();await t.locator('#num-strength').waitFor();await t.locator('#num-strength').tap();await t.locator('#num-strength').fill('72');await t.locator('#num-strength').press('Tab');assert.equal(await t.locator('#sl-strength').inputValue(),'0.72');await touch.close();
 checks.push('real touch context: mode switch and direct numeric editing');

 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({checks,pageErrors:errors},null,2));console.log('PASS',checks);
} finally {await browser.close();}
