// Dedicated material study only. External Playwright, Chromium and ffmpeg required.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.MATERIAL_VERIFY_OUT || "/tmp/opendazz-material-verification";
mkdirSync(out, { recursive: true });
const base = process.env.MATERIAL_BASE_URL || "http://127.0.0.1:4173/materials.html";
const browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
await context.addInitScript(() => { localStorage.setItem("of-mode", "simple"); localStorage.setItem("opendazz-edit-session-v1", "material-storage-sentinel"); });
const page = await context.newPage();
const checks = [], errors = [], downloads = [];
page.on("pageerror", error => errors.push(error.message));
page.on("download", download => downloads.push(download));
const ready = () => page.waitForFunction(() => !!document.querySelector("#sample-export") && !document.querySelector("#sample-export").disabled, { timeout: 60000 });
const strength = async value => { await page.locator("#sample-strength-number").fill(String(value)); await page.locator("#sample-strength-number").press("Tab"); await page.waitForFunction(v => document.querySelector("#preview-caption").textContent.includes(`${v}% strength`), value); };
const pixels = () => page.locator("#sample-preview").evaluate(async canvas => {
  const bytes = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
});
const shot = async name => { await page.screenshot({ path: `${out}/material-${name}.png`, fullPage: true }); };
const holdWorker = async () => {
  let release, entered;
  const gate = new Promise(resolve => release = resolve), seen = new Promise(resolve => entered = resolve);
  const route = async request => { entered(); await gate; await request.continue().catch(() => {}); };
  await page.route("**/photo-export-worker-*.js", route);
  return { seen, release: async () => { release(); await page.unroute("**/photo-export-worker-*.js", route); } };
};
const command = (bin, args) => execFileSync(bin, args, { maxBuffer: 100 * 1024 * 1024 });
const rgb = name => command("ffmpeg", ["-v", "error", "-i", `${out}/${name}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const dimensions = name => JSON.parse(command("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", `${out}/${name}`])).streams[0];
function contrast(a,b) {
  const luminance = hex => { const values = hex.replace("#", "").match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v / 12.92 : ((v+.055)/1.055)**2.4); return values[0]*.2126+values[1]*.7152+values[2]*.0722; };
  const l = [luminance(a), luminance(b)].sort((x,y)=>y-x); return (l[0]+.05)/(l[1]+.05);
}
try {
  await page.goto(base); await ready();
  assert.match(await page.title(), /Control Material Study/);
  assert.equal(await page.getByRole("slider", { name: "Strength", exact: true }).count(), 1);
  assert.equal(await page.getByRole("spinbutton", { name: "Strength percent" }).count(), 1);
  assert.equal(await page.getByRole("radio", { name: "Pro", exact: true }).isChecked(), true);
  assert.equal(await page.locator("#sample-export img, #sample-dial img, #sample-mode img").count(), 0);
  const consoleBox = await page.locator(".console").boundingBox(); assert.equal(consoleBox.width, 320);
  for (const selector of [".mechanical-mode label", "#sample-strength", "#sample-strength-number", "#sample-export"]) {
    const target = await page.locator(selector).first().boundingBox(); assert.ok(target.height >= 44, `${selector} touch target is too short`);
  }
  await page.mouse.move(0,0); await shot("desktop");
  checks.push("isolated 320px console, semantic native controls, 44px targets and CSS/SVG interactive surfaces");
  const initialPixels = await pixels();
  await strength(73); const adjustedPixels = await pixels(); assert.notEqual(initialPixels, adjustedPixels);
  await page.locator("#sample-strength").focus(); await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#sample-strength-number").inputValue(), "74");
  const dialBox = await page.locator("#sample-dial").boundingBox();
  await page.mouse.move(dialBox.x+dialBox.width/2, dialBox.y+dialBox.height/2); await page.mouse.down(); await page.mouse.move(dialBox.x+dialBox.width/2+20, dialBox.y+dialBox.height/2); await page.mouse.up();
  assert.equal(await page.locator("#sample-strength").inputValue(), "89");
  await page.locator("#sample-strength-number").fill("200"); assert.equal(await page.locator("#sample-strength-number").getAttribute("aria-invalid"), "true");
  await page.locator("#sample-strength-number").press("Tab"); assert.equal(await page.locator("#sample-strength-number").inputValue(), "150");
  await page.locator('label[for="sample-simple"]').click(); assert.equal(await page.locator("#sample-simple").isChecked(), true);
  await page.locator("#sample-simple").focus(); await page.keyboard.press("ArrowRight"); assert.equal(await page.locator("#sample-pro").isChecked(), true);
  assert.match(await page.locator(".mode-note").textContent(), /local to this study/);
  checks.push("numeric input, native arrows, optional linear dial drag, bounds and local radio-mode state update a real filtered preview");
  await strength(100); await page.locator("h1").click();
  const button = page.locator("#sample-export"), before = await button.boundingBox();
  const neutralFace = await page.locator(".shutter-face").evaluate(el=>getComputedStyle(el).backgroundImage);
  await button.hover(); const hoverFace = await page.locator(".shutter-face").evaluate(el=>getComputedStyle(el).backgroundImage); assert.notEqual(neutralFace,hoverFace); await shot("hover");
  await page.mouse.down(); await page.waitForTimeout(120); const pressed = await button.boundingBox(); assert.ok(Math.abs(pressed.y-before.y-1)<.1); await shot("pressed"); await page.mouse.move(50,100); await page.mouse.up(); assert.equal(downloads.length,0);
  await page.locator("#sample-strength-number").focus(); await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(()=>document.activeElement.id),"sample-export");
  const focus = await button.evaluate(el=>({width:getComputedStyle(el).outlineWidth,style:getComputedStyle(el).outlineStyle,duration:getComputedStyle(el).transitionDuration}));
  assert.equal(focus.width,"2px"); assert.equal(focus.style,"solid"); assert.ok(focus.duration.split(",").every(v=>parseFloat(v)>=.08&&parseFloat(v)<=.12)); await shot("focus");
  await page.locator("#sample-disabled").check();
  for (const selector of ["#sample-strength","#sample-strength-number","#sample-pro","#sample-export"]) assert.equal(await page.locator(selector).isDisabled(),true);
  await shot("disabled"); await page.locator("#sample-disabled").uncheck(); await ready();
  checks.push("hover, 1px/100ms press, keyboard focus ring and actual disabled states");
  await page.emulateMedia({reducedMotion:"reduce"}); assert.equal(await button.evaluate(el=>getComputedStyle(el).transitionDuration),"0s"); assert.equal(await page.locator(".mode-carriage").evaluate(el=>getComputedStyle(el).transitionDuration),"0s"); await page.emulateMedia({reducedMotion:"no-preference"});
  const ratios={labels:contrast("#c2c9cc","#292e31"),numeric:contrast("#eef1ef","#111719"),metalText:contrast("#172128","#aab7c1"),notes:contrast("#b4bfc5","#292e31")}; for(const value of Object.values(ratios))assert.ok(value>=4.5);
  checks.push("reduced-motion removes transitions; key label/numeric/metal text contrast exceeds 4.5:1");
  await strength(0); let pending=page.waitForEvent("download",{timeout:120000}); await button.click(); await(await pending).saveAs(`${out}/material-strength-0.png`); await ready();
  await strength(100); pending=page.waitForEvent("download",{timeout:120000}); await button.click(); await(await pending).saveAs(`${out}/material-strength-100.png`); await ready();
  const gate=await holdWorker(); pending=page.waitForEvent("download",{timeout:120000}); await button.click(); await gate.seen; assert.equal(await button.isDisabled(),true); await strength(150); await page.evaluate(()=>document.querySelector("#sample-export").click()); await gate.release(); await(await pending).saveAs(`${out}/material-strength-100-snapshot.png`); await ready();
  assert.equal(downloads.length,3); assert.match(await page.locator("#sample-status").textContent(),/100% strength/);
  const exported=["material-strength-0.png","material-strength-100.png","material-strength-100-snapshot.png"].map(name=>({name,dimensions:dimensions(name),sha256:hash(readFileSync(`${out}/${name}`))}));
  for(const file of exported){assert.equal(file.dimensions.codec_name,"png");assert.equal(file.dimensions.width,1920);assert.equal(file.dimensions.height,1276);}
  const first=rgb(exported[0].name),second=rgb(exported[1].name);let difference=0;for(let i=0;i<first.length;i++)difference+=Math.abs(first[i]-second[i]);difference/=first.length;assert.ok(difference>.5);
  assert.deepEqual(second,rgb(exported[2].name),"held export must keep 100% pixels after the preview changes to 150%");
  const cancelGate=await holdWorker();await button.click();await cancelGate.seen;await page.locator("#sample-cancel").click();await ready();await cancelGate.release();await page.waitForTimeout(200);assert.equal(downloads.length,3);assert.equal(page.workers().length,0);
  checks.push("three decoded original-size PNGs prove Strength differences and exact held-snapshot pixel equality; export snapshot, duplicate protection, cancellation and worker cleanup");
  assert.deepEqual(await page.evaluate(()=>({mode:localStorage.getItem("of-mode"),session:localStorage.getItem("opendazz-edit-session-v1")})),{mode:"simple",session:"material-storage-sentinel"});
  checks.push("sample mode/control/export interactions leave existing workshop mode and session storage unchanged");
  const failure=await browser.newContext();let bad=true;await failure.route("**/classic*chrome_sRGB.cube",route=>bad?route.fulfill({status:200,body:"LUT_3D_SIZE 2\n0 0 0"}):route.continue());const broken=await failure.newPage();broken.on("pageerror",error=>errors.push(error.message));await broken.goto(base);await broken.locator("#sample-retry").waitFor({state:"visible"});assert.equal(await broken.locator("#sample-export").isDisabled(),true);assert.doesNotMatch(await broken.locator("#sample-status").textContent(),/^Ready/);bad=false;await broken.locator("#sample-retry").click();await broken.waitForFunction(()=>!document.querySelector("#sample-export").disabled);await failure.close();
  checks.push("invalid LUT/render failure stays disabled and recovers through explicit retry");
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const mobile=await mobileContext.newPage();mobile.on("pageerror",e=>errors.push(e.message));await mobile.goto(base);await mobile.waitForFunction(()=>!document.querySelector("#sample-export").disabled);const mobileRange=await mobile.locator("#sample-strength").boundingBox();await mobile.touchscreen.tap(mobileRange.x+mobileRange.width*.8,mobileRange.y+mobileRange.height/2);assert.ok(+(await mobile.locator("#sample-strength").inputValue())>100);await mobile.locator("#sample-strength-number").fill("100");await mobile.locator("#sample-strength-number").press("Tab");await mobile.waitForFunction(()=>document.querySelector("#preview-caption").textContent.includes("100%"));await mobile.evaluate(()=>{document.activeElement.blur();scrollTo(0,0);});assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok((await mobile.locator(".console").boundingBox()).y<(await mobile.locator(".bench").boundingBox()).y);await mobile.screenshot({path:`${out}/material-mobile.png`,fullPage:true});await mobile.setViewportSize({width:320,height:740});assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobileContext.close();
  checks.push("390px touch interaction and 320px layout remain usable without horizontal overflow; console leads on mobile");
  assert.deepEqual(errors,[]);
  writeFileSync(`${out}/results.json`,JSON.stringify({checks,consoleWidth:consoleBox.width,downloads:downloads.length,exports:exported,meanRgbDifference:difference,contrastRatios:ratios,errors},null,2));
  console.log(JSON.stringify({checks,downloads:downloads.length,meanRgbDifference:difference,contrastRatios:ratios,errors},null,2));
}finally{await browser.close();}
