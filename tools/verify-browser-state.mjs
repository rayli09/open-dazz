// Run against production preview; use the same external Playwright setup as
// verify-browser-exports.mjs. No test hooks are added to the shipped client.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.STATE_VERIFY_OUT || "/tmp/opendazz-state-verification";
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_BIN || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("dialog", dialog => dialog.accept());
page.on("pageerror", (error) => errors.push(error.message));
const ready = () =>
  page.waitForFunction(() => !!document.querySelector("#btn-export-simple") && !document.querySelector("#btn-export-simple").disabled, {
    timeout: 30000,
  });
const mode = () => page.locator("html").getAttribute("data-mode");
try {
  await page.goto(base);
  await ready();
  await page.locator("#mode-pro").click();
  await ready();
  assert.equal(await mode(), "pro");
  assert.equal(await page.evaluate(() => localStorage.getItem("of-mode")), "pro");
  await page.reload();
  await ready();
  assert.equal(await mode(), "pro");
  // A same-mode click should not repaint the developed canvas.
  await page.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.putImageData;
    window.afterPaints = 0;
    CanvasRenderingContext2D.prototype.putImageData = function (...args) {
      if (this.canvas.id === "after") window.afterPaints++;
      return original.apply(this, args);
    };
  });
  await page.locator("#mode-pro").click();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.afterPaints), 0);
  // A Pro-only look recovers to a real curated recipe in Simple.
  await page.locator("#search").fill("Eterna");
  await page.locator("#cabinet [data-look]").first().click();
  await ready();
  await page.locator("#mode-simple").click();
  await ready();
  assert.equal(await page.locator('[data-preset="chrome"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-preset="ricoh-bw"]').click();
  await ready();
  await page.locator("#mode-pro").click();
  await ready();
  assert.match(await page.locator("#led-name").textContent(), /Ricoh High-Contrast/);
  await page.locator("#mode-simple").click();
  await ready();
  assert.equal(await page.locator('[data-preset="ricoh-bw"]').getAttribute("aria-pressed"), "true");
  // Both collections remember their selection across mode changes.
  await page.locator('[data-simple-media="video"]').click();
  await ready();
  await page.locator('[data-preset="vhs"]').click();
  await ready();
  await page.locator('[data-simple-media="photo"]').click();
  await ready();
  assert.equal(await page.locator('[data-preset="ricoh-bw"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-simple-media="video"]').click();
  await ready();
  assert.equal(await page.locator('[data-preset="vhs"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-simple-media="photo"]').click();
  await ready();
  // Malformed recipe data stays out of controls/WASM and can be retried.
  const badRecipe = "**/library/fuji/community/recipes/005-docu-classic-chrome-john-peltier.json";
  await page.route(badRecipe, (route) =>
    route.fulfill({ json: { name: "bad", grain: { amount: "heavy" } } }),
  );
  await page.locator('[data-preset="chrome"]').click();
  await page.waitForFunction(() =>
    !document.querySelector("#work-error").hidden && document.querySelector("#work-error-message").textContent.includes("Could not load this look"),
  );
  assert.equal(await page.locator("#btn-export-simple").isDisabled(), true);
  await page.unroute(badRecipe);
  await page.locator("#work-retry").click();
  await ready();
  // Invalid persisted values default; denied storage remains usable.
  await page.evaluate(() => localStorage.setItem("of-mode", '{"mode":"pro"}'));
  await page.reload();
  await ready();
  assert.equal(await mode(), "simple");
  const blocked = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blocked.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("storage blocked");
      },
    }),
  );
  const mobile = await blocked.newPage();
  mobile.on("pageerror", (error) => errors.push(error.message));
  await mobile.goto(base);
  await mobile.waitForFunction(() => !!document.querySelector("#btn-export-simple") && !document.querySelector("#btn-export-simple").disabled);
  await mobile.locator("#mode-pro").click();
  assert.equal(await mobile.locator("html").getAttribute("data-mode"), "pro");
  await mobile.reload();
  await mobile.waitForFunction(() => !!document.querySelector("#btn-export-simple") && !document.querySelector("#btn-export-simple").disabled);
  assert.equal(await mobile.locator("html").getAttribute("data-mode"), "simple");
  await mobile.screenshot({ path: `${out}/mobile.png` });
  await blocked.close();
  assert.deepEqual(errors, []);
  const results = {
    checks: [
      "legacy mode persistence and reload",
      "same-mode selector suppresses repaint",
      "Pro-only selection fallback",
      "Ricoh selection across modes",
      "remembered photo/video collection selection",
      "invalid recipe rejection and recovery",
      "invalid persisted mode",
      "blocked storage on mobile",
    ],
    errors,
  };
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2) + "\n");
  console.log("PASS", results.checks);
} finally {
  await browser.close();
}
