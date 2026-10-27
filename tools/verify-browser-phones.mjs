// Production preview + separately installed Playwright/Chromium + ffmpeg required.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadWasm } from "./load-wasm.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const out = process.env.PHONE_VERIFY_OUT || "/tmp/opendazz-phone-verification";
mkdirSync(out, { recursive: true });
const cmd = (bin, args) => execFileSync(bin, args, { maxBuffer: 100 * 1024 * 1024 });
const ff = (...args) => cmd("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
ff("-f", "lavfi", "-i", "testsrc2=size=854x480:rate=12", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", `${out}/wide.mp4`);
ff("-f", "lavfi", "-i", "testsrc2=size=240x320:rate=12", "-t", "1.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", `${out}/portrait.mp4`);
ff("-i", `${out}/wide.mp4`, "-c:v", "copy", "-c:a", "libopus", `${out}/opus.mkv`);
// Explicitly tagged fixtures avoid FFmpeg's BT.601 vs browser BT.709 fallback
// disagreement on untagged source YUV. References must use the same color matrix.
ff("-loop", "1", "-i", `${root}/apps/web/public/samples/sample-1.jpg`, "-vf", "scale=384:576,crop=360:480:x=12:y=48+20*sin(t)", "-r", "12", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", `${out}/scene.mp4`);
const engine = await loadWasm(`${root}/apps/web/src/pkg`);
const hash = a => createHash("sha256").update(a).digest("hex");
const browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [], checks = [], downloads = [];
page.on("pageerror", e => errors.push(e.message));
page.on("download", d => downloads.push(d));
const ready = () => page.waitForFunction(() => !document.querySelector("#btn-export-simple").disabled, { timeout: 90000 });
const select = async (id) => { if (!await page.locator(`[data-preset="${id}"]`).count()) {
    await page.locator('[data-simple-media="video"]').click();
    await ready();
} await page.locator(`[data-preset="${id}"]`).click(); await ready(); };
const pick = async (id) => { await page.locator(`[data-media-id="${id}"]`).click(); await ready(); };
const selected = () => page.locator('.dock-item[aria-pressed="true"]').getAttribute('data-media-id');
const save = async (name, extra) => { const pending = page.waitForEvent('download', { timeout: 120000 }); await page.locator('#btn-export-simple').click(); await extra?.(); await (await pending).saveAs(`${out}/${name}`); await ready(); console.log('saved', name); };
const capture = async (name) => { await page.evaluate(() => { scrollTo(0, 0); document.querySelector('main').scrollTo(0, 0); }); await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${name}.png` }); };
async function live(preset) {
    await page.waitForFunction(() => document.querySelector('#player-badge').textContent.includes('Filtered video'));
    await page.evaluate(() => { const v = document.querySelector('#source-video'); v.pause(); v.currentTime = 0; });
    await page.waitForTimeout(250);
    const data = await page.evaluate(() => { const v = document.querySelector('#source-video'), c = document.querySelector('#video-filter'), w = c.width, h = c.height, tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; const ctx = tmp.getContext('2d'); ctx.drawImage(v, 0, 0, w, h); return { input: Array.from(ctx.getImageData(0, 0, w, h).data), actual: Array.from(c.getContext('2d').getImageData(0, 0, w, h).data), w, h, frame: Math.round(v.currentTime * 30) }; });
    const expected = engine.apply_phone(new Uint8Array(data.input), data.w, data.h, preset, data.frame);
    assert.deepEqual([...expected], data.actual, 'live preview must use the new WASM phone pipeline');
    assert.notEqual(hash(expected), hash(new Uint8Array(data.input)));
    return { preset, w: data.w, h: data.h, frame: data.frame, sha256: hash(expected) };
}
try {
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:4173');
    await ready();
    await page.locator('#file').setInputFiles(`${out}/wide.mp4`);
    await ready();
    const wide = await selected();
    await page.locator('[data-simple-media="video"]').click();
    await ready();
    await select('nokia-n95');
    assert.match(await page.locator('#phone-output-note').textContent(), /854px/);
    const previews = [await live('nokia-n95')];
    await capture('desktop-n95');
    for (const key of ['nokia-n95', 'iphone-4s']) {
        const art = page.locator(`[data-preset="${key}"] img`);
        assert.equal(await art.evaluate(i => i.complete && i.naturalWidth > 0), true);
    }
    await save('n95.mp4', async () => { await page.evaluate(() => document.querySelector('#btn-export-simple').click()); });
    assert.equal(downloads.length, 1);
    await select('iphone-4s');
    previews.push(await live('iphone-4s'));
    await capture('desktop-4s');
    await save('4s.mp4');
    await page.locator('#mode-pro').click();
    await ready();
    assert.match(await page.locator('#led-name').textContent(), /iPhone 4S/);
    await capture('desktop-pro');
    await page.locator('#mode-simple').click();
    await ready();
    await page.locator('#file').setInputFiles(`${out}/portrait.mp4`);
    await ready();
    const portrait = await selected();
    await select('nokia-n95');
    await save('portrait-n95.mp4');
    await pick(wide);
    assert.equal(await page.locator('[data-preset="iphone-4s"]').getAttribute('aria-pressed'), 'true');
    await pick(portrait);
    assert.equal(await page.locator('[data-preset="nokia-n95"]').getAttribute('aria-pressed'), 'true');
    checks.push('per-item phone look restoration, Pro/Simple parity and portrait aspect');
    await pick(wide);
    await select('nokia-n95');
    await save('snapshot-n95.mp4', async () => { await select('iphone-4s'); });
    checks.push('phone export retains the starting preset snapshot and repeated clicks emit one download');
    await page.locator('#source-video').evaluate(v => v.play());
    await page.waitForTimeout(350);
    assert.ok(await page.locator('#source-video').evaluate(v => v.currentTime) > 0);
    await pick(portrait);
    await pick(wide);
    assert.equal(await page.locator('#source-video').evaluate(v => v.paused), true);
    await page.locator('#source-video').evaluate(v => { v.pause(); v.currentTime = 1; });
    await page.waitForTimeout(250);
    assert.ok(await page.locator('#video-filter').evaluate(c => c.width) > 0);
    await page.locator('#source-video').evaluate(v => { v.currentTime = v.duration - 0.1; return v.play(); });
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#source-video').evaluate(v => v.ended), true);
    checks.push('play, seek, end and switching playback');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('mobile-4s');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Cancel before processing can finish, then recover. No stale download may appear.
    const before = downloads.length;
    await page.locator('#btn-export-simple').click();
    await page.locator('#btn-video-simple').click();
    await ready();
    await page.waitForTimeout(200);
    assert.equal(downloads.length, before);
    await save('recovered-4s.mp4');
    await page.locator('#btn-export-simple').click();
    await pick(portrait);
    await page.waitForTimeout(250);
    assert.equal(downloads.length, before + 1);
    checks.push('cancel/recover and input switch suppress stale phone downloads');
    await page.locator('#file').setInputFiles(`${out}/opus.mkv`);
    await ready();
    await page.locator('[data-simple-media="video"]').click();
    await ready();
    await select('iphone-4s');
    await save('4s-opus.mp4');
    checks.push('phone processing also uses the existing FFmpeg audio compatibility route');
    await page.locator('#file').setInputFiles(`${out}/scene.mp4`);
    await ready();
    await select('nokia-n95');
    await save('scene-n95.mp4');
    await select('iphone-4s');
    await save('scene-4s.mp4');
    await capture('natural-scene-4s');
    checks.push('both phone looks render a moving natural portrait fixture, not only test bars');
    await page.locator('#file').setInputFiles(`${root}/apps/web/public/samples/sample-1.jpg`);
    await ready();
    await page.locator('[data-simple-media="photo"]').click();
    await ready();
    await select('ricoh-negative');
    await save('ricoh-photo.png');
    assert.equal(await page.locator('#phone-output-note').isVisible(), false);
    checks.push('existing Ricoh PNG photo export remains input-aware');
    const streams = {};
    const audio = file => ff('-i', `${out}/${file}`, '-map', '0:a:0', '-f', 's16le', '-acodec', 'pcm_s16le', '-');
    const inputAudio = audio('wide.mp4');
    for (const [name, width, height, frames, duration, hasAudio] of [['n95.mp4', 854, 480, 24, 2, true], ['4s.mp4', 854, 480, 24, 2, true], ['snapshot-n95.mp4', 854, 480, 24, 2, true], ['recovered-4s.mp4', 854, 480, 24, 2, true], ['portrait-n95.mp4', 240, 320, 18, 1.5, false], ['4s-opus.mp4', 854, 480, 24, 2, true], ['scene-n95.mp4', 360, 480, 24, 2, false], ['scene-4s.mp4', 360, 480, 24, 2, false]]) {
        const info = JSON.parse(cmd('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', `${out}/${name}`]));
        streams[name] = info.streams.map(s => ({ codec: s.codec_name, type: s.codec_type, w: s.width, h: s.height, frames: s.nb_read_frames, duration: s.duration }));
        const v = info.streams.find(s => s.codec_type === 'video');
        assert.equal(v.width, width);
        assert.equal(v.height, height);
        assert.equal(+v.nb_read_frames, frames);
        assert.ok(Math.abs(+v.duration - duration) < 0.02);
        assert.equal(info.streams.some(s => s.codec_type === 'audio'), hasAudio);
        ff('-i', `${out}/${name}`, '-f', 'null', '-');
        if (hasAudio && !name.includes('opus'))
            assert.equal(hash(audio(name)), hash(inputAudio), 'AAC decoded audio must pass through unchanged');
        if (name.includes('opus')) {
            const pcm = audio(name);
            assert.ok(pcm.length > 48000 * 2);
            assert.ok(pcm.some(x => x !== 0));
        }
    }
    // Compare decoded first frame to the same source frame through the committed WASM.
    const rgba = file => ff('-i', `${out}/${file}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-');
    const src = rgba('wide.mp4');
    const differences = {};
    for (const [name, preset] of [['n95.mp4', 'nokia-n95'], ['4s.mp4', 'iphone-4s']]) {
        const expected = engine.apply_phone(src, 854, 480, preset, 0), actual = rgba(name);
        let error = 0, changed = 0;
        for (let i = 0; i < actual.length; i++)
            if (i % 4 !== 3) {
                error += Math.abs(expected[i] - actual[i]);
                changed += Math.abs(src[i] - actual[i]);
            }
        differences[name] = { meanErrorFromWasm: error / (854 * 480 * 3), meanChangeFromInput: changed / (854 * 480 * 3) };
        assert.ok(differences[name].meanErrorFromWasm < 8);
        assert.ok(differences[name].meanChangeFromInput > 1);
        ff('-i', `${out}/${name}`, '-vf', 'select=eq(n\\,0)+eq(n\\,12)+eq(n\\,23)', '-vsync', '0', `${out}/${preset}-frame-%02d.png`);
    }
    for (const file of ['scene.mp4', 'scene-n95.mp4', 'scene-4s.mp4'])
        ff('-i', `${out}/${file}`, '-vf', 'select=eq(n\\,0)+eq(n\\,12)+eq(n\\,23)', '-vsync', '0', `${out}/${file}-frame-%02d.png`);
    assert.equal(hash(rgba('n95.mp4')), hash(rgba('snapshot-n95.mp4')), 'snapshot changed after preview preset selection');
    assert.notEqual(hash(rgba('n95.mp4')), hash(rgba('4s.mp4')));
    checks.push('downloaded MP4 decode, dimensions, duration, frame count, filtered pixels, distinct devices and audio handling');
    assert.deepEqual(errors, []);
    writeFileSync(`${out}/results.json`, JSON.stringify({ checks, downloads: downloads.length, previews, differences, streams, errors }, null, 2));
    console.log(JSON.stringify({ checks, downloads: downloads.length, differences, errors }, null, 2));
}
finally {
    await browser.close();
}
