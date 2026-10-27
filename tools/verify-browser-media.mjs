// Requires scratch Playwright + Chromium and ffmpeg/ffprobe, as documented in
// docs/TESTING.md. Run against a production build/preview.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const out = process.env.MEDIA_VERIFY_OUT || "/tmp/opendazz-media-verification";
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
  `${out}/clip.mp4`,
);
ff(
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=480x320:rate=24",
  "-t",
  "8",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  `${out}/long.mp4`,
);
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_BIN || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
await context.addInitScript(() => {
  const create = URL.createObjectURL.bind(URL),
    revoke = URL.revokeObjectURL.bind(URL);
  window.mediaCreated = [];
  window.mediaRevoked = [];
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    window.mediaCreated.push({ url, file: blob instanceof File });
    return url;
  };
  URL.revokeObjectURL = (url) => {
    window.mediaRevoked.push(url);
    revoke(url);
  };
});
const page = await context.newPage();
const errors = [],
  checks = [],
  downloads = [];
page.on("pageerror", (error) => {
  errors.push(error.message);
  console.log("PAGEERROR", error.message);
});
page.on("download", (download) => downloads.push(download));
page.on("console", (message) => {
  if (message.type() === "error") console.log("console", message.text());
});
const ready = () =>
  page.waitForFunction(
    () =>
      !!document.querySelector("#btn-export-simple") &&
      !document.querySelector("#btn-export-simple").disabled,
    { timeout: 60000 },
  );
const selectedId = () =>
  page.locator('.dock-item[aria-pressed="true"]').getAttribute("data-media-id");
const pick = async (id) => {
  await page.locator(`[data-media-id="${id}"]`).click();
  await ready();
};
const look = async (id) => {
  await page.locator(`[data-preset="${id}"]`).click();
  await ready();
};
const save = async (name, selector = "#btn-export-simple") => {
  const pending = page.waitForEvent("download", { timeout: 120000 });
  await page.locator(selector).click();
  const download = await pending;
  await download.saveAs(`${out}/${name}`);
  await ready();
  console.log("saved", name);
};
const decode = (name) => ff("-i", `${out}/${name}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
  await ready();
  await page
    .locator("#file")
    .setInputFiles([
      `${root}/apps/web/public/samples/sample-1.jpg`,
      `${root}/apps/web/public/samples/sample-2.jpg`,
      `${out}/clip.mp4`,
    ]);
  await page.waitForFunction(() => document.querySelectorAll(".dock-item").length === 4);
  await ready();
  const ids = await page
    .locator(".dock-item")
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.mediaId));
  const a = ids[1],
    b = ids[2],
    v = ids[3];
  assert.equal(await selectedId(), a);
  await look("ricoh-bw");
  await page.locator("#mode-pro").click();
  await ready();
  await page.locator("#sl-strength").evaluate((input) => {
    input.value = "0.45";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await ready();
  await save("photo-before.png", "#btn-export");
  await pick(b);
  assert.equal(await page.locator("#sl-strength").inputValue(), "1");
  assert.match(await page.locator("#led-name").textContent(), /Docu Classic Chrome/);
  await page.locator("#mode-simple").click();
  await ready();
  await look("ricoh-negative");
  await pick(a);
  await page.locator("#mode-pro").click();
  await ready();
  assert.equal(await page.locator("#sl-strength").inputValue(), "0.45");
  assert.match(await page.locator("#led-name").textContent(), /Ricoh High-Contrast/);
  await save("photo-restored.png", "#btn-export");
  assert.deepEqual(decode("photo-before.png"), decode("photo-restored.png"));
  checks.push(
    "multi-file picker and independent filter/slider snapshots; restored PNG pixels identical",
  );
  await page.screenshot({ path: `${out}/desktop-photo.png` });
  await pick(v);
  assert.match(await page.locator("#led-name").textContent(), /Docu Classic Chrome/);
  await page.locator("#mode-simple").click();
  await ready();
  await look("ricoh-bw");
  await page.waitForFunction(() =>
    document.querySelector("#player-badge").textContent.includes("Filtered video"),
  );
  const pixels = await page.locator("#video-filter").evaluate((canvas) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let chroma = 0,
      total = 0;
    for (let i = 0; i < data.length; i += 4) {
      chroma = Math.max(chroma, Math.abs(data[i] - data[i + 1]));
      total += data[i];
    }
    return { chroma, total, width: canvas.width, height: canvas.height };
  });
  assert.ok(pixels.total > 0);
  assert.ok(pixels.chroma <= 2);
  assert.equal(pixels.width, 320);
  await page.evaluate(() => {
    window.badgeMutations = 0;
    new MutationObserver(() => window.badgeMutations++).observe(
      document.querySelector("#player-badge"),
      { childList: true, subtree: true, characterData: true },
    );
  });
  await page.locator("media-play-button").click();
  await page.waitForFunction(() => document.querySelector("#source-video").currentTime > 0.5);
  const changed = await page.locator("#video-filter").evaluate((canvas) => {
    const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i];
    return sum;
  });
  assert.notEqual(changed, pixels.total);
  await page.locator("media-play-button").click();
  assert.equal(await page.locator("#source-video").evaluate((video) => video.paused), true);
  assert.equal(
    await page.evaluate(() => window.badgeMutations),
    0,
    "live frames must not repeatedly announce the same status",
  );
  await page.locator("media-play-button").focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.querySelector("#source-video").paused);
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector("#source-video").paused);
  await page.locator("media-fullscreen-button").click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.equal(
    await page.evaluate(() =>
      document.fullscreenElement.contains(document.querySelector("#video-filter")),
    ),
    true,
  );
  await page.locator("media-fullscreen-button").click();
  await page.waitForFunction(() => !document.fullscreenElement);
  checks.push(
    "player keyboard Space, filtered fullscreen and non-repeating accessible status announcements",
  );
  const timeline = page.locator("media-time-slider"),
    box = await timeline.boundingBox();
  await timeline.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForFunction(
    () => Math.abs(document.querySelector("#source-video").currentTime - 1.5) < 0.3,
  );
  const volume = page.locator("media-volume-slider"),
    volumeBox = await volume.boundingBox();
  await volume.click({ position: { x: volumeBox.width * 0.3, y: volumeBox.height / 2 } });
  await page.locator("media-mute-button").click();
  assert.equal(await page.locator("#source-video").evaluate((video) => video.muted), true);
  await page.locator("#player-compare").click();
  assert.match(await page.locator("#player-badge").textContent(), /Original video/);
  assert.equal(await page.locator("#video-filter").isHidden(), true);
  await pick(a);
  await pick(v);
  await page.waitForFunction(() => document.querySelector("#source-video").readyState >= 2);
  const restored = await page.locator("#source-video").evaluate((video) => ({
    time: video.currentTime,
    volume: video.volume,
    muted: video.muted,
    paused: video.paused,
  }));
  assert.ok(Math.abs(restored.time - 1.5) < 0.3);
  assert.ok(restored.volume < 0.7);
  assert.equal(restored.muted, true);
  assert.equal(restored.paused, true);
  assert.match(await page.locator("#player-badge").textContent(), /Original video/);
  await page.locator("#player-compare").click();
  await page.waitForFunction(() =>
    document.querySelector("#player-badge").textContent.includes("Filtered video"),
  );
  checks.push(
    "live moving filtered pixels; library play/pause, seeking, volume, mute and honest original comparison; playback restored per item",
  );
  await page.locator("#source-video").evaluate((video) => {
    video.currentTime = video.duration - 0.15;
  });
  await page.locator("media-play-button").click();
  await page.waitForFunction(() => document.querySelector("#source-video").ended);
  assert.notEqual(await page.locator("media-play-button").getAttribute("data-ended"), null);
  await page.locator("media-play-button").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#source-video").paused &&
      document.querySelector("#source-video").currentTime < 1,
  );
  await page.locator("media-play-button").click();
  await page.locator("#source-video").evaluate((video) => {
    window.loadStarts = 0;
    video.addEventListener("loadstart", () => window.loadStarts++);
  });
  await page.locator(`[data-media-id="${v}"]`).click();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.loadStarts), 0);
  checks.push("end/replay and repeated selections do not reload active media");
  await save("filtered.mp4");
  const streams = JSON.parse(
    command("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,codec_name,duration,nb_read_frames,width,height",
      "-of",
      "json",
      `${out}/filtered.mp4`,
    ]),
  ).streams;
  const video = streams.find((stream) => stream.codec_type === "video");
  assert.equal(+video.nb_read_frames, 36);
  assert.equal(+video.duration, 3);
  assert.equal(
    streams.some((stream) => stream.codec_type === "audio"),
    true,
  );
  const decoded = decode("filtered.mp4");
  for (let i = 0; i < decoded.length; i += 3) assert.ok(Math.abs(decoded[i] - decoded[i + 1]) <= 4);
  const audio = (name) =>
    ff("-i", `${out}/${name}`, "-map", "0:a:0", "-c:a", "copy", "-f", "adts", "-");
  assert.deepEqual(audio("clip.mp4"), audio("filtered.mp4"));
  checks.push(
    "real selected filtered MP4: 3 seconds, 36 moving monochrome frames and byte-identical AAC",
  );
  await page.locator("#dock-left").click();
  assert.equal(await selectedId(), v);
  assert.equal(
    (
      await page
        .locator(".dock-item")
        .evaluateAll((buttons) => buttons.map((button) => button.dataset.mediaId))
    )[2],
    v,
  );
  await page.locator(`[data-media-id="${v}"]`).focus();
  await page.keyboard.press("ArrowLeft");
  await ready();
  assert.equal(await selectedId(), a);
  await page.keyboard.press("Alt+ArrowRight");
  assert.equal(await selectedId(), a);
  await page.keyboard.press("End");
  await ready();
  assert.equal(await selectedId(), b);
  checks.push(
    "touch-sized reorder controls and dock keyboard selection/reorder preserve identities",
  );
  // Real DataTransfer import: one duplicate, one unsupported and two distinct files.
  const imageBase64 = readFileSync(`${root}/apps/web/public/samples/sample-2.jpg`).toString("base64"),
    videoBase64 = readFileSync(`${out}/clip.mp4`).toString("base64");
  const transfer = await page.evaluateHandle(
    ({ image, video }) => {
      const data = new DataTransfer(),
        bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      data.items.add(
        new File([bytes(image)], "dropped.jpg", { type: "image/jpeg", lastModified: 123 }),
      );
      data.items.add(
        new File([bytes(image)], "dropped.jpg", { type: "image/jpeg", lastModified: 123 }),
      );
      data.items.add(
        new File(["notes"], "unsupported.txt", { type: "text/plain", lastModified: 123 }),
      );
      data.items.add(
        new File([bytes(video)], "dropped.mp4", { type: "video/mp4", lastModified: 123 }),
      );
      return data;
    },
    { image: imageBase64, video: videoBase64 },
  );
  await page.dispatchEvent("body", "dragover", { dataTransfer: transfer });
  assert.equal(
    await page.locator("body").evaluate((body) => body.classList.contains("uppy-is-drag-over")),
    true,
  );
  await page.dispatchEvent("body", "drop", { dataTransfer: transfer });
  await page.waitForFunction(() => document.querySelectorAll(".dock-item").length === 6);
  await ready();
  assert.equal(await page.locator('.dock-item[title^="dropped.jpg"]').count(), 1);
  assert.equal(await page.locator('.dock-item[title^="unsupported.txt"]').count(), 0);
  assert.equal(
    await page.locator("body").evaluate((body) => body.classList.contains("uppy-is-drag-over")),
    false,
  );
  checks.push("Uppy multi-file drop, drag affordance, duplicates and unsupported-file rejection");
  await pick(v);
  await page.waitForTimeout(3200);
  await page.evaluate(() => document.querySelector("main").scrollTo(0, 0));
  await page.screenshot({ path: `${out}/desktop-simple.png` });
  await page.locator("#mode-pro").click();
  await ready();
  await page.screenshot({ path: `${out}/desktop-pro.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#mode-simple").click();
  await ready();
  await page.evaluate(() => document.querySelector("main").scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/mobile-video.png` });
  assert.equal(await page.locator("#dock-remove").isVisible(), true);
  assert.equal(await page.locator("#btn-export-simple").isVisible(), true);
  await pick(b);
  await page.waitForTimeout(200);
  assert.ok(
    await page.locator("main").evaluate((main) => main.scrollTop < 5),
    "dock selection should return to the mobile preview",
  );
  await page.screenshot({ path: `${out}/mobile-photo.png` });
  checks.push(
    "mobile dock selection returns to its photo preview without scrolling to the preset shelf",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Remove while the image decoder is delayed, then ignore its late completion.
  await page.evaluate(() => {
    const original = createImageBitmap;
    window.restoreBitmap = () => {
      window.createImageBitmap = original;
    };
    window.createImageBitmap = async (...args) => {
      const bitmap = await original(...args);
      if (args[0] instanceof File && args[0].name === "delayed.jpg")
        await new Promise((resolve) => setTimeout(resolve, 600));
      return bitmap;
    };
  });
  await page.locator("#file").setInputFiles({
    name: "delayed.jpg",
    mimeType: "image/jpeg",
    buffer: readFileSync(`${root}/apps/web/public/samples/sample-1.jpg`),
  });
  await page.waitForFunction(() => document.querySelectorAll(".dock-item").length === 7);
  const delayed = await selectedId();
  await page.locator("#dock-remove").click();
  await ready();
  await page.waitForTimeout(800);
  assert.equal(await page.locator(`[data-media-id="${delayed}"]`).count(), 0);
  assert.equal(await page.locator(".dock-item").count(), 6);
  await page.evaluate(() => window.restoreBitmap());
  checks.push(
    "removal during image decoding cannot resurrect an item or replace the active preview",
  );
  // Hold actual Mediabunny Blob reads while switching/removing a video.
  await page.evaluate(() => {
    const original = Blob.prototype.stream;
    window.probeReadStarted = false;
    window.restoreStream = () => {
      Blob.prototype.stream = original;
    };
    Blob.prototype.stream = function (...args) {
      return original.apply(this, args).pipeThrough(
        new TransformStream({
          async transform(chunk, controller) {
            window.probeReadStarted = true;
            await new Promise((resolve) => setTimeout(resolve, 450));
            try {
              controller.enqueue(chunk);
            } catch {
              /* The selected video read may have been canceled. */
            }
          },
        }),
      );
    };
  });
  await page.locator("#file").setInputFiles({
    name: "delayed-video.mp4",
    mimeType: "application/octet-stream",
    buffer: readFileSync(`${out}/clip.mp4`),
  });
  await page.waitForFunction(() => window.probeReadStarted);
  const delayedVideo = await selectedId();
  await pick(a);
  await page.waitForTimeout(600);
  assert.equal(await selectedId(), a);
  assert.equal(
    await page.locator(`[data-media-id="${delayedVideo}"] .dock-type`).textContent(),
    "VIDEO",
  );
  assert.match(await page.locator("#cap-file").textContent(), /SAMPLE-1.JPG/);
  await page.evaluate((id) => {
    document.querySelector(`[data-media-id="${id}"]`).click();
    document.querySelector("#dock-remove").click();
  }, delayedVideo);
  await ready();
  await page.waitForTimeout(600);
  assert.equal(await page.locator(`[data-media-id="${delayedVideo}"]`).count(), 0);
  await page.evaluate(() => window.restoreStream());
  checks.push(
    "video with missing MIME imports by extension; switching/removal during actual video reads cannot leak late results",
  );
  await pick(v);
  await page.locator("media-play-button").click();
  await page.waitForFunction(() => document.querySelector("#source-video").currentTime > 0.1);
  const removedUrl = await page.locator("#source-video").getAttribute("src");
  await page.locator("#dock-remove").click();
  await ready();
  assert.equal(await page.locator(`[data-media-id="${v}"]`).count(), 0);
  assert.ok(await page.evaluate((url) => window.mediaRevoked.includes(url), removedUrl));
  checks.push("removal during playback stops its media and releases its source URL");
  await page.locator("#file").setInputFiles(`${out}/long.mp4`);
  await ready();
  await look("ricoh-bw");
  const exporting = await selectedId(),
    before = downloads.length;
  await page.locator("#btn-export-simple").click();
  await page.waitForFunction(() =>
    document.querySelector("#cap-state").textContent.includes("DEVELOPING VIDEO"),
  );
  await page.locator("#dock-remove").click();
  await ready();
  await page.waitForTimeout(500);
  assert.equal(downloads.length, before);
  assert.equal(await page.locator(`[data-media-id="${exporting}"]`).count(), 0);
  checks.push("removal during full video export cancels work and prevents stale download");
  // A retry or switch after cancellation remains functional.
  await pick(a);
  await save("photo-after-cancel.png");
  await page.evaluate(() => {
    while (document.querySelectorAll(".dock-item").length)
      document.querySelector("#dock-remove").click();
  });
  await page.waitForTimeout(800);
  assert.equal(await page.locator("#media-empty").isVisible(), true);
  assert.equal(await page.locator("#btn-export-simple").isDisabled(), true);
  const resources = await page.evaluate(() => ({
    created: window.mediaCreated.filter((item) => item.file),
    revoked: window.mediaRevoked,
  }));
  for (const item of resources.created)
    assert.equal(
      resources.revoked.filter((url) => url === item.url).length,
      1,
      `URL not released once: ${item.url}`,
    );
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("opendazz-edit-session-v1") || "null"));
  assert.ok(persisted && persisted.version === 1);
  assert.equal(JSON.stringify(persisted).includes("blob:"), false);
  assert.equal(JSON.stringify(persisted).includes("sourceUrl"), false);
  checks.push(
    "empty state, cancellation recovery and exactly-once source URL cleanup; only validated settings/metadata persist",
  );
  // A cold compatibility-engine load is canceled, then recreated cleanly.
  const compatContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  await compatContext.addInitScript(() => {
    delete window.VideoDecoder;
    delete window.VideoEncoder;
  });
  let releaseRuntime;
  let runtimeSeen;
  const runtimeGate = new Promise((resolve) => {
    releaseRuntime = resolve;
  });
  const sawRuntime = new Promise((resolve) => {
    runtimeSeen = resolve;
  });
  await compatContext.route("**/ffmpeg/classes.js", async (route) => {
    runtimeSeen();
    await runtimeGate;
    await route.continue();
  });
  const compat = await compatContext.newPage();
  compat.on("pageerror", (error) => errors.push(error.message));
  compat.on("download", (download) => downloads.push(download));
  await compat.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
  await compat.waitForFunction(
    () =>
      !!document.querySelector("#btn-export-simple") &&
      !document.querySelector("#btn-export-simple").disabled,
  );
  await compat.locator("#file").setInputFiles(`${out}/clip.mp4`);
  await Promise.race([
    sawRuntime,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("compatibility runtime was not requested")), 10000),
    ),
  ]);
  await compat.locator(".dock-item").first().click();
  await compat.waitForFunction(() => !document.querySelector("#btn-export-simple").disabled);
  assert.match(await compat.locator("#cap-file").textContent(), /SAMPLE I/);
  releaseRuntime();
  await compat.locator(".dock-item").last().click();
  await compat.waitForFunction(
    () =>
      document.querySelector("#cap-file").textContent.includes("COMPAT") &&
      !document.querySelector("#btn-export-simple").disabled,
    { timeout: 90000 },
  );
  await compat.locator('[data-preset="ricoh-bw"]').click();
  await compat.waitForFunction(() => !document.querySelector("#btn-export-simple").disabled);
  const compatDownload = compat.waitForEvent("download", { timeout: 120000 });
  await compat.locator("#btn-export-simple").click();
  await (await compatDownload).saveAs(`${out}/compat-recovered.mp4`);
  const compatStreams = JSON.parse(
    command("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,nb_read_frames,duration",
      "-of",
      "json",
      `${out}/compat-recovered.mp4`,
    ]),
  ).streams;
  assert.equal(+compatStreams.find((stream) => stream.codec_type === "video").nb_read_frames, 36);
  assert.equal(
    compatStreams.some((stream) => stream.codec_type === "audio"),
    true,
  );
  checks.push(
    "switching during a cold FFmpeg engine load cancels it; reselect and full filtered MP4 export recover",
  );
  await compatContext.close();
  assert.deepEqual(errors, []);
  const results = {
    checks,
    errors,
    downloads: downloads.length,
    photoRestoredHash: hash(decode("photo-restored.png")),
    videoDecodedHash: hash(decoded),
    streams,
    sourceUrlsCreated: resources.created.length,
    sourceUrlsReleased: resources.created.length,
  };
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2) + "\n");
  console.log("PASS", checks);
} finally {
  await browser.close();
}
