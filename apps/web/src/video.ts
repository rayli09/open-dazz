// In-browser video developing, via ffmpeg.wasm (single-thread
// core, self-hosted under /ffmpeg/ by scripts/sync-ffmpeg.mjs).
//
// The shape mirrors the CLI's video command on purpose: source
// fps (capped at 30), frames scaled to VIDEO_MAX_WIDTH, encoded
// libx264/yuv420p with faststart; audio is copied to AAC — except
// the CX405, which runs the same tin-can filter chain the CLI
// uses (band-limit → stereo narrow → AGC pump → hiss), so a clip
// developed here and one developed by the CLI sound alike.
//
// Memory stays bounded by working in 24-frame chunks of rawvideo
// inside ffmpeg's virtual FS: extract a chunk → develop each
// frame through the Rust engine → encode the chunk → delete the
// raw buffers. Only the small per-chunk MP4s persist until the
// final concat.
import type { FFmpeg } from "@ffmpeg/ffmpeg";

export interface VideoProbe {
  duration: number; // seconds
  fps: number; // effective processing fps (source fps capped at 30)
  w: number; // processed width  (<= VIDEO_MAX_WIDTH, even)
  h: number; // processed height (even)
  sourceW: number;
  sourceH: number;
  hasAudio: boolean;
}

export const VIDEO_MAX_SECONDS = 45;
export const VIDEO_MAX_WIDTH = 854;
const FPS_CAP = 30;
const CHUNK_FRAMES = 24;

let ff: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let workerGeneration = 0;

export function ffmpegLoaded(): boolean {
  return ff !== null;
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ff) return ff;
  if (!loading) {
    const generation = workerGeneration;
    loading = (async () => {
      // Loaded from our own origin, outside the Vite bundle (see
      // scripts/sync-ffmpeg.mjs for why). Only the type comes from
      // the npm package.
      // @ts-ignore -- self-hosted runtime module (public/ffmpeg), not bundled
      const mod = (await import(/* @vite-ignore */ "/ffmpeg/classes.js")) as {
        FFmpeg: new () => FFmpeg;
      };
      const inst = new mod.FFmpeg();
      const response = await fetch("/ffmpeg/ffmpeg-core.wasm.gz");
      if (!response.ok) throw new Error(`Unable to load video engine: HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const wasm = bytes[0] === 0x1f && bytes[1] === 0x8b
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
        : bytes;
      const wasmURL = URL.createObjectURL(new Blob([wasm], { type: "application/wasm" }));
      try {
        await (inst.load as (cfg: Record<string, string>) => Promise<boolean>)({
          coreURL: "/ffmpeg/ffmpeg-core.js",
          wasmURL,
          classWorkerURL: "/ffmpeg/worker.js",
        });
      } finally {
        URL.revokeObjectURL(wasmURL);
      }
      if (generation !== workerGeneration) { inst.terminate(); throw new Error("cancelled"); }
      ff = inst;
      return inst;
    })().catch(error => {
      if (generation === workerGeneration) loading = null;
      throw error;
    });
  }
  return loading;
}

/** Hard stop: kills the worker; the next getFFmpeg() rebuilds it. */
export function resetFFmpeg() {
  workerGeneration++;
  try {
    ff?.terminate();
  } catch {
    /* already gone */
  }
  ff = null;
  loading = null;
}

async function execWithLogs(inst: FFmpeg, args: string[]): Promise<string> {
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
  };
  inst.on("log", onLog);
  try {
    await inst.exec(args);
  } finally {
    inst.off("log", onLog);
  }
  return logs.join("\n");
}

/** Upload `file` into the ffmpeg FS and read its stream info. */
export async function probeVideo(inst: FFmpeg, file: File): Promise<VideoProbe> {
  await inst.writeFile("input", new Uint8Array(await file.arrayBuffer()));
  const text = await execWithLogs(inst, ["-i", "input"]);
  const durM = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(text);
  if (!durM) throw new Error("could not read this video file");
  const duration = +durM[1] * 3600 + +durM[2] * 60 + parseFloat(durM[3]);
  const vLine = text.split("\n").find((l) => l.includes("Video:")) ?? "";
  const dimM = /(\d{2,5})x(\d{2,5})/.exec(vLine);
  const fpsM = /([\d.]+)\s*fps/.exec(vLine);
  if (!dimM) throw new Error("no video stream found in this file");
  const sourceW = +dimM[1];
  const sourceH = +dimM[2];
  const srcFps = fpsM ? parseFloat(fpsM[1]) : 30;
  const fps = Math.min(srcFps, FPS_CAP);
  const scale = Math.min(1, VIDEO_MAX_WIDTH / sourceW);
  const w = Math.max(2, Math.round(sourceW * scale) & ~1);
  const h = Math.max(2, Math.round(sourceH * scale) & ~1);
  return {
    duration,
    fps,
    w,
    h,
    sourceW,
    sourceH,
    hasAudio: /Stream #\d+:\d+.*Audio:/.test(text),
  };
}

/** Extract one frame (for the stage preview) at processed size. */
export async function posterFrame(inst: FFmpeg, probe: VideoProbe): Promise<Blob> {
  const at = Math.min(0.5, Math.max(0, probe.duration / 2)).toFixed(2);
  const code = await inst.exec([
    "-y", "-ss", at, "-i", "input", "-frames:v", "1",
    "-vf", `scale=${probe.w}:${probe.h}`, "-q:v", "4", "poster.jpg",
  ]);
  if (code !== 0) throw new Error("could not extract a preview frame");
  const data = (await inst.readFile("poster.jpg")) as Uint8Array;
  await inst.deleteFile("poster.jpg").catch(() => {});
  return new Blob([data as BlobPart], { type: "image/jpeg" });
}

export interface DevelopOptions {
  probe: VideoProbe;
  camcorderAudio: boolean;
  process: (rgba: Uint8Array, w: number, h: number, frame: number) => Uint8Array;
  onProgress: (done: number, total: number) => void;
  isCancelled: () => boolean;
}

/** Develop the whole clip frame by frame; returns an MP4 blob. */
export async function developVideo(inst: FFmpeg, opts: DevelopOptions): Promise<Blob> {
  const { probe } = opts;
  const { w, h, fps } = probe;
  const frameBytes = w * h * 3;
  const total = Math.max(1, Math.round(probe.duration * fps));
  const chunks: string[] = [];
  let frameNo = 0;

  for (let start = 0; start < total; start += CHUNK_FRAMES) {
    if (opts.isCancelled()) throw new Error("cancelled");
    const n = Math.min(CHUNK_FRAMES, total - start);
    const code = await inst.exec([
      "-y", "-ss", (start / fps).toFixed(3), "-i", "input",
      "-t", (n / fps).toFixed(3),
      "-vf", `fps=${fps},scale=${w}:${h}`,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "chunk.raw",
    ]);
    if (code !== 0) throw new Error("frame extraction failed");
    const raw = (await inst.readFile("chunk.raw")) as Uint8Array;
    await inst.deleteFile("chunk.raw").catch(() => {});
    const frames = Math.floor(raw.length / frameBytes);
    const out = new Uint8Array(frames * frameBytes);
    for (let i = 0; i < frames; i++) {
      if (opts.isCancelled()) throw new Error("cancelled");
      const rgb = raw.subarray(i * frameBytes, (i + 1) * frameBytes);
      const rgba = new Uint8Array(w * h * 4);
      for (let s = 0, d = 0; d < rgba.length; s += 3, d += 4) {
        rgba[d] = rgb[s];
        rgba[d + 1] = rgb[s + 1];
        rgba[d + 2] = rgb[s + 2];
        rgba[d + 3] = 255;
      }
      const done = opts.process(rgba, w, h, frameNo);
      const dst = out.subarray(i * frameBytes, (i + 1) * frameBytes);
      for (let s = 0, d = 0; d < dst.length; s += 4, d += 3) {
        dst[d] = done[s];
        dst[d + 1] = done[s + 1];
        dst[d + 2] = done[s + 2];
      }
      frameNo++;
      if (frameNo % 12 === 0 || frameNo === total) opts.onProgress(Math.min(frameNo, total), total);
    }
    if (frames === 0) break;
    await inst.writeFile("out.raw", out);
    const enc = await inst.exec([
      "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${w}x${h}`,
      "-r", String(fps), "-i", "out.raw",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
      "-pix_fmt", "yuv420p", "-an", `chunk${chunks.length}.mp4`,
    ]);
    await inst.deleteFile("out.raw").catch(() => {});
    if (enc !== 0) throw new Error("chunk encode failed");
    chunks.push(`chunk${chunks.length}.mp4`);
  }
  if (chunks.length === 0) throw new Error("no frames could be read from this video");

  await inst.writeFile("list.txt", chunks.map((c) => `file '${c}'`).join("\n"));
  const args: string[] = ["-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-i", "input", "-map", "0:v:0"];
  if (probe.hasAudio) {
    if (opts.camcorderAudio) {
      const dur = Math.ceil(probe.duration) + 1;
      const fc =
        `[1:a]aformat=channel_layouts=stereo,highpass=f=95,lowpass=f=12500,` +
        `pan=stereo|c0=0.82*c0+0.18*c1|c1=0.82*c1+0.18*c0,` +
        `dynaudnorm=f=250:g=12:p=0.9,acompressor=threshold=0.5:ratio=3:attack=20:release=250,` +
        `volume=1.1[a1];` +
        `anoisesrc=color=white:amplitude=0.0045:d=${dur}[hiss];` +
        `[a1][hiss]amix=inputs=2:duration=first:weights='1 0.5'[aout]`;
      args.push("-filter_complex", fc, "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "48000");
    } else {
      args.push("-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k");
    }
  }
  // A short audio track must not truncate the developed video.
  args.push("-t", String(frameNo / fps), "-movflags", "+faststart", "out.mp4");
  if (opts.isCancelled()) throw new Error("cancelled");
  const fin = await inst.exec(args);
  if (fin !== 0) throw new Error("final assembly failed");
  const data = (await inst.readFile("out.mp4")) as Uint8Array;
  for (const c of chunks) await inst.deleteFile(c).catch(() => {});
  await inst.deleteFile("list.txt").catch(() => {});
  await inst.deleteFile("out.mp4").catch(() => {});
  return new Blob([data as BlobPart], { type: "video/mp4" });
}
