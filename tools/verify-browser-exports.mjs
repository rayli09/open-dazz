// Run after a production build and preview. Requires Playwright installed separately.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs bun tools/verify-browser-exports.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = process.env.EXPORT_VERIFY_OUT || "/tmp/opendazz-browser-verification";
mkdirSync(out, { recursive: true });
const command = (name, args) => execFileSync(name, args, { maxBuffer: 100 * 1024 * 1024 });
const ff = (...args) => command("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
ff(
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=320x240:rate=12",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=48000",
  "-t",
  "3",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-ac",
  "2",
  `${out}/input-aac.mp4`,
);
ff("-i", `${out}/input-aac.mp4`, "-an", "-c:v", "copy", `${out}/input-silent.mp4`);
ff("-i", `${out}/input-aac.mp4`, "-c:v", "copy", "-c:a", "libopus", `${out}/input-opus.mkv`);
ff(
  "-i",
  `${out}/input-aac.mp4`,
  "-c:v",
  "copy",
  "-af",
  "atrim=duration=1",
  "-ac",
  "1",
  "-c:a",
  "aac",
  `${out}/input-short-audio.mp4`,
);
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_BIN || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("PAGEERROR", e.message);
});
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") console.log(m.type(), m.text());
});
let downloads = 0;
page.on("download", () => downloads++);
const state = () => page.locator("#cap-state").textContent();
async function ready() {
  await page.waitForFunction(() => !document.querySelector("#btn-export-simple").disabled, {
    timeout: 90000,
  });
}
async function photo() {
  await page.locator("#file").setInputFiles(`${root}/web/public/samples/sample-1.jpg`);
  await ready();
}
async function look(id) {
  await page.locator(`[data-preset="${id}"]`).click();
  await ready();
}
async function upload(name, preset = "ricoh-bw") {
  await page.locator("#file").setInputFiles(`${out}/input-${name}`);
  await page.waitForFunction(
    () => document.querySelector("#cap-file").textContent.includes("VIDEO"),
    { timeout: 90000 },
  );
  await ready();
  if (preset) await look(preset); // Each dock item now owns its look; choose it explicitly.
  console.log("upload", name, await page.locator("#cap-file").textContent());
}
async function save(name, selector = "#btn-export-simple", extra) {
  let promise = page.waitForEvent("download", { timeout: 120000 });
  await page.locator(selector).click();
  if (extra) await extra();
  const d = await promise;
  await d.saveAs(`${out}/${name}`);
  console.log("saved", name, await state());
  await ready();
}
try {
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
  await ready();
  await look("ricoh-bw");
  await save("bw-simple.png");
  await page.evaluate(() => {
    scrollTo(0, 0);
    document.querySelector("main").scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/desktop-simple.png` });
  await page.locator("#mode-pro").click();
  await ready();
  await save("bw-pro.png", "#btn-export");
  await page.evaluate(() => {
    scrollTo(0, 0);
    document.querySelector("main").scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/desktop-pro.png` });
  await page.locator("#mode-simple").click();
  await ready();
  await upload("aac.mp4");
  await save("bw-aac.mp4", undefined, async () => {
    await page.evaluate(() => {
      document.querySelector("#btn-export-simple").click();
      document.querySelector("#btn-export").click();
    });
  });
  assert.equal(downloads, 3, "duplicate clicks emitted extra downloads");
  await upload("silent.mp4");
  await save("bw-silent.mp4");
  await upload("opus.mkv");
  await save("bw-opus.mp4");
  // Begin with Ricoh B&W and change the preview immediately; export retains its snapshot.
  await upload("aac.mp4");
  await save("snapshot-bw.mp4", undefined, async () => {
    await page.locator('[data-preset="chrome"]').click();
  });
  // Explicit cancellation and input switch must suppress stale downloads.
  await upload("aac.mp4");
  const beforeCancel = downloads;
  await page.evaluate(() => {
    document.querySelector("#btn-export-simple").click();
    document.querySelector("#btn-video-simple").click();
  });
  await ready();
  assert.equal(downloads, beforeCancel);
  console.log("cancel", await state());
  await page.locator("#btn-export-simple").click();
  await page.locator("#file").setInputFiles(`${root}/web/public/samples/sample-2.jpg`);
  await ready();
  await page.waitForTimeout(600);
  assert.equal(downloads, beforeCancel);
  assert.match(await page.locator("#btn-export-simple").textContent(), /PNG/);
  console.log("switch input", await state());
  // Recover and export again after cancellation/input switch.
  await look("ricoh-negative");
  await upload("aac.mp4", "ricoh-negative");
  await save("recovered.mp4");
  await photo();
  await page.setViewportSize({ width: 390, height: 844 });
  await look("ricoh-bw");
  await page.evaluate(() => {
    scrollTo(0, 0);
    document.querySelector("main").scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/mobile-simple.png` });
  await save("mobile.png");
  await page.locator("#mode-pro").click();
  await ready();
  await save("mobile-pro.png", "#btn-export");
  await page.evaluate(() => {
    scrollTo(0, 0);
    document.querySelector("main").scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/ui-mobile-pro.png` });
  // Force compatibility without WebCodecs and verify short mono audio cannot trim video.
  await page.addInitScript(() => {
    delete window.VideoEncoder;
    delete window.VideoDecoder;
  });
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
  await ready();
  await page.locator("#mode-simple").click();
  await ready();
  await look("ricoh-bw");
  await upload("short-audio.mp4");
  assert.match(await page.locator("#cap-file").textContent(), /COMPAT/);
  await save("compat-short-audio.mp4");
  await page.locator('[data-simple-media="video"]').click();
  await ready();
  await save("cx405-mono.mp4");
  // Cancel while compatibility encoding is in flight, then recreate its worker.
  const beforeMidCancel = downloads;
  await page.locator("#btn-export-simple").click();
  await page.waitForFunction(() =>
    document.querySelector("#cap-state").textContent.includes("FRAME"),
  );
  await page.evaluate(() => document.querySelector("#btn-video-simple").click());
  await ready();
  assert.equal(downloads, beforeMidCancel);
  await save("cx405-recovered.mp4");
  await page.locator('[data-simple-media="photo"]').click();
  await ready();
  await photo();
  // Delay PNG encoding so a media switch overtakes its callback.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    window.restoreToBlob = () => {
      HTMLCanvasElement.prototype.toBlob = original;
    };
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      original.call(this, (blob) => setTimeout(() => callback(blob), 350), ...args);
    };
  });
  const beforePhotoSwitch = downloads;
  await page.locator("#btn-export-simple").click();
  await page.evaluate(() => document.querySelector("#btn-export-simple").click());
  await page.locator("#file").setInputFiles(`${root}/web/public/samples/sample-2.jpg`);
  await ready();
  await page.waitForTimeout(500);
  assert.equal(downloads, beforePhotoSwitch, "stale PNG downloaded");
  await page.evaluate(() => window.restoreToBlob());
  await page
    .locator("#file")
    .setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
  await page.waitForFunction(() =>
    document.querySelector("#cap-state").textContent.startsWith("ERROR"),
  );
  await photo();
  await save("photo-recovered.png");
  assert.deepEqual(errors, []);
  const decode = (name) => ff("-i", `${out}/${name}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-");
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const decoded = {};
  const results = {
    downloads,
    errors,
    videos: {},
    checks: [
      "Simple/Pro Ricoh photo",
      "AAC full MP4",
      "silent full MP4",
      "non-AAC fallback",
      "settings snapshot",
      "duplicate click",
      "cancel",
      "input switch",
      "recovery",
      "mobile Simple/Pro",
      "forced compatibility",
      "short audio",
      "CX405 mono",
      "mid-encode cancellation and worker recovery",
      "stale PNG suppression",
      "invalid input recovery",
    ],
  };
  for (const [name, audio] of [
    ["bw-aac.mp4", true],
    ["bw-silent.mp4", false],
    ["bw-opus.mp4", true],
    ["snapshot-bw.mp4", true],
    ["recovered.mp4", true],
    ["compat-short-audio.mp4", true],
    ["cx405-mono.mp4", true],
    ["cx405-recovered.mp4", true],
  ]) {
    const info = JSON.parse(
      command("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=codec_type,codec_name,duration,nb_read_frames,width,height",
        "-of",
        "json",
        `${out}/${name}`,
      ]),
    ).streams;
    const video = info.find((s) => s.codec_type === "video");
    assert.equal(+video.nb_read_frames, 36, name);
    assert.ok(Math.abs(+video.duration - 3) < 0.1, name);
    assert.equal(
      info.some((s) => s.codec_type === "audio"),
      audio,
      name,
    );
    const raw = decode(name);
    assert.equal(raw.length, 320 * 240 * 3 * 36, name);
    if (
      [
        "bw-aac.mp4",
        "bw-silent.mp4",
        "bw-opus.mp4",
        "snapshot-bw.mp4",
        "compat-short-audio.mp4",
      ].includes(name)
    ) {
      for (let i = 0; i < raw.length; i += 3)
        assert.ok(Math.abs(raw[i] - raw[i + 1]) <= 4, `${name}: unfiltered color pixel`);
    }
    assert.notDeepEqual(
      raw.subarray(0, 320 * 240 * 3),
      raw.subarray(-320 * 240 * 3),
      `${name}: frozen poster`,
    );
    decoded[name] = raw;
    results.videos[name] = { streams: info, decoded_rgb_sha256: hash(raw) };
  }
  assert.deepEqual(
    decoded["bw-aac.mp4"],
    decoded["snapshot-bw.mp4"],
    "settings changed during export",
  );
  const photos = ["bw-simple.png", "bw-pro.png", "mobile.png", "mobile-pro.png"].map(decode);
  photos.forEach((b) => assert.deepEqual(b, photos[0], "Simple/Pro/mobile photo parity"));
  const audio = (name) =>
    ff("-i", `${out}/${name}`, "-map", "0:a:0", "-c:a", "copy", "-f", "adts", "-");
  assert.deepEqual(audio("input-aac.mp4"), audio("bw-aac.mp4"), "AAC passthrough");
  results.photo_rgb_sha256 = hash(photos[0]);
  results.aac_passthrough = "byte-identical";
  writeFileSync(`${out}/browser-results.json`, JSON.stringify(results, null, 2) + "\n");
  console.log("PASS", downloads, "downloads");
} finally {
  await browser.close();
}
