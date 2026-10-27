// Exercise the iOS-mode editor at phone sizes. The native Photos bridge is
// tested on a device; this checks layout, selection and comparison only.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const photo = fileURLToPath(new URL("../apps/web/public/samples/sample-1.jpg", import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || "/usr/bin/chromium", args: ["--no-sandbox"] });
const base = process.env.BASE_URL || "http://127.0.0.1:4175";
try {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
    await page.addInitScript(() => localStorage.setItem("opendazz-edit-session-v1", "older saved edits"));
    await page.goto(base);
    await page.locator("#empty-add").waitFor({ state: "visible" });
    assert.equal(await page.locator("#session-panel").isVisible(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem("opendazz-edit-session-v1")), "older saved edits");
    assert.equal(await page.locator("#mobile-looks").isVisible(), false);
    assert.equal(await page.locator("#btn-export-simple").isVisible(), false);
    await page.locator("#file").setInputFiles(photo);
    await page.waitForFunction(() => !document.querySelector("#btn-export-simple").disabled, { timeout: 60000 });
    const rail = page.locator("#mobile-look-strip");
    assert.ok(await rail.evaluate(element => element.scrollWidth > element.clientWidth));
    await rail.locator("button").nth(1).click();
    await page.waitForFunction(() => !document.querySelector("#btn-export-simple").disabled, { timeout: 60000 });
    assert.equal(await rail.locator("button").nth(1).getAttribute("aria-pressed"), "true");
    const compare = page.locator("#photo-compare");
    await compare.click(); assert.equal(await compare.getAttribute("aria-pressed"), "true");
    await compare.click(); assert.equal(await compare.getAttribute("aria-pressed"), "false");
    assert.match(await page.locator("#btn-export-simple").textContent(), /Save to Photos/);
    assert.equal(await page.locator("#media-dock").isVisible(), false);
    await page.locator("#mobile-media-toggle").click();
    assert.equal(await page.locator("#media-dock").isVisible(), true);
    await page.locator("#dock-close").click();
    assert.equal(await page.locator("#media-dock").isVisible(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
    const bounds = await page.locator("#btn-export-simple").boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= height);
    console.log(`PASS ${width}x${height}`);
    await page.close();
  }
} finally { await browser.close(); }
