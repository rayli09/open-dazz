// The WebCodecs fast path for video developing, via Mediabunny —
// the same architecture ntsc-rs's own web version uses: stream
// samples out of a WebCodecs decoder, run each frame through the
// Rust engine, feed a WebCodecs encoder, mux to MP4, all with a
// 1–2 frame memory window instead of ffmpeg.wasm's file-based
// chunk round-trips. Audio (for non-camcorder looks) is copied
// packet-for-packet: bit-identical, zero re-encode.
//
// This path is only taken when the browser actually supports the
// exact configs needed (checked in probeWebCodecs); anything else
// — Firefox + HEVC, Chromium builds without H.264, exotic
// containers, non-AAC audio — falls back to the ffmpeg.wasm
// pipeline in video.ts. The CX405 always uses the ffmpeg path:
// its tin-can audio chain needs real audio processing.
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  canEncodeVideo,
} from "mediabunny";

export interface WcProbe {
  duration: number;
  /** Average source frame rate; export preserves source timestamps, including VFR. */
  fps: number | null;
  /** Processed width/height (display size capped at 854, even). */
  w: number;
  h: number;
  displayW: number;
  displayH: number;
  hasAudio: boolean;
  /** Audio can ride through untouched (AAC into MP4). */
  audioPassthrough: boolean;
}

export const WC_MAX_SECONDS = 120;
const MAX_WIDTH = 854;

export function webCodecsPresent(): boolean {
  return typeof window !== "undefined" && "VideoDecoder" in window && "VideoEncoder" in window;
}

/**
 * Try to read `file` the WebCodecs way. Returns the probe + a
 * poster blob, or null when this browser/file combination belongs
 * on the ffmpeg path. Throws only on unexpected errors — callers
 * treat any failure as "use ffmpeg".
 */
export async function probeWebCodecs(file: File, signal?: AbortSignal): Promise<{ probe: WcProbe; poster: Blob } | null> {
  signal?.throwIfAborted();
  if (!webCodecsPresent()) return null;
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const abort = () => input.dispose();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (!(await input.canRead())) return null;
    const vtrack = await input.getPrimaryVideoTrack();
    if (!vtrack) return null;
    if (!(await vtrack.canDecode())) return null;
    const duration = await input.computeDuration();
    const displayW = vtrack.displayWidth;
    const displayH = vtrack.displayHeight;
    if (!displayW || !displayH || !duration) return null;
    const scale = Math.min(1, MAX_WIDTH / displayW);
    const w = Math.max(2, Math.round(displayW * scale) & ~1);
    const h = Math.max(2, Math.round(displayH * scale) & ~1);
    if (!(await canEncodeVideo("avc", { width: w, height: h, quality: QUALITY_HIGH }))) return null;
    const stats = duration <= WC_MAX_SECONDS ? await vtrack.computePacketStats() : null;
    const fps = stats && Number.isFinite(stats.averagePacketRate) && stats.averagePacketRate > 0 ? stats.averagePacketRate : null;
    const atrack = await input.getPrimaryAudioTrack();
    const audioPassthrough = !atrack || atrack.codec === "aac";

    // Poster: the frame at ~0.5s (or the first frame), drawn at
    // processed size with rotation/flip applied by the sample.
    const sink = new VideoSampleSink(vtrack);
    const sample = (await sink.getSample(Math.min(0.5, duration / 2))) ?? (await sink.getSample(0));
    if (!sample) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    sample.drawWithFit(ctx, { fit: "fill" });
    sample.close();
    const poster = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    if (!poster) return null;
    return {
      probe: { duration, fps, w, h, displayW, displayH, hasAudio: !!atrack, audioPassthrough },
      poster,
    };
  } finally {
    signal?.removeEventListener("abort", abort);
    input.dispose();
  }
}

export interface WcDevelopOptions {
  probe: WcProbe;
  process: (rgba: Uint8Array, w: number, h: number, frame: number) => Uint8Array;
  onProgress: (fraction: number) => void;
  isCancelled: () => boolean;
}

/** Develop the whole clip on the WebCodecs path; returns MP4. */
export async function developWebCodecs(file: File, opts: WcDevelopOptions): Promise<Blob> {
  const { probe } = opts;
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  let audioPump: Promise<void> | null = null;
  try {
    const vtrack = await input.getPrimaryVideoTrack();
    if (!vtrack) throw new Error("no video track");
    const videoSource = new VideoSampleSource({
      codec: "avc",
      quality: QUALITY_HIGH,
      keyFrameInterval: 2,
    });
    output.addVideoTrack(videoSource);

    // Audio passthrough runs concurrently with the frame pump.
    let pumpAudio: (() => Promise<void>) | null = null;
    const atrack = await input.getPrimaryAudioTrack();
    if (atrack && probe.audioPassthrough) {
      const audioSource = new EncodedAudioPacketSource(atrack.codec as "aac");
      output.addAudioTrack(audioSource);
      pumpAudio = async () => {
        const sink = new EncodedPacketSink(atrack);
        const decoderConfig = await atrack.getDecoderConfig();
        let first = true;
        for await (const packet of sink.packets()) {
          if (opts.isCancelled()) throw new Error("cancelled");
          if (packet.timestamp > probe.duration + 0.1) break;
          if (first) {
            await audioSource.add(packet, decoderConfig ? { decoderConfig } : undefined);
            first = false;
          } else {
            await audioSource.add(packet);
          }
        }
      };
    }

    if (atrack && !probe.audioPassthrough) throw new Error("audio requires compatibility export");
    if (opts.isCancelled()) throw new Error("cancelled");
    await output.start();
    audioPump = pumpAudio?.() ?? null;
    // Attach a handler immediately while the frame pump runs.
    audioPump?.catch(() => {});
    const sink = new VideoSampleSink(vtrack);
    const canvas = document.createElement("canvas");
    canvas.width = probe.w;
    canvas.height = probe.h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    let frame = 0;
    for await (const sample of sink.samples()) {
      if (opts.isCancelled()) {
        sample.close();
        throw new Error("cancelled");
      }
      // drawWithFit applies rotation/flip/PAR and scales to the
      // canvas in one GPU-backed step.
      sample.drawWithFit(ctx, { fit: "fill" });
      const rgba = new Uint8Array(ctx.getImageData(0, 0, probe.w, probe.h).data);
      const out = opts.process(rgba, probe.w, probe.h, frame);
      const outSample = new VideoSample(out, {
        format: "RGBA",
        codedWidth: probe.w,
        codedHeight: probe.h,
        timestamp: sample.timestamp,
        duration: sample.duration,
      });
      await videoSource.add(outSample);
      outSample.close();
      sample.close();
      frame++;
      opts.onProgress(Math.min(1, sample.timestamp / Math.max(0.001, probe.duration)));
    }
    if (audioPump) await audioPump;
    if (opts.isCancelled()) throw new Error("cancelled");
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error("muxing produced no output");
    return new Blob([buffer], { type: "video/mp4" });
  } catch (e) {
    await output.cancel().catch(() => {});
    if (audioPump) await audioPump.catch(() => {});
    throw e;
  } finally {
    input.dispose();
  }
}
