# Video architecture (decided Oct 25, 2026)

Browser video developing is a **dispatcher over two I/O shells**
around one shared per-frame engine (the Rust core via the WASM
bindings: recipe LUT pipeline, VHS, CamcorderSim). The comparison
behind this decision (ffmpeg.wasm vs WebCodecs vs MediaRecorder
vs ffmpeg core-mt vs server transcode) was made Oct 25, 2026; the
decisive precedent is that **ntsc-rs's own web version**
(`ntsc-rs/ntsc-rs-web`) uses this exact shape — Mediabunny/
WebCodecs for media I/O, the Rust core in Wasm for the effect,
encoded audio packets passed through untouched, and the only
FFmpeg code in it a minimal libavcodec Wasm used solely as an
AAC *encoder*.

## Fast path — `web/src/video-webcodecs.ts` (Mediabunny)

Taken when a probe proves all of: the file is readable, the
video track's decoder config is supported, and an H.264 encoder
config at the processed size is supported. Streams decoder
samples → canvas (rotation/flip/PAR/scale applied by the sample)
→ engine → hardware encoder → MP4 mux, 1–2 frame memory
window. AAC audio is copied packet-for-packet (bit-identical).
Caps: width 854, duration **120s**, zero downloads.

## Compat path — `web/src/video.ts` (ffmpeg.wasm, self-hosted)

Everything the fast path can't prove: Firefox + HEVC, Chromium
builds without H.264, exotic containers. Chunked rawvideo
round-trips through MEMFS; audio re-encoded to AAC. Duration
cap **45s**. Also the automatic fallback when a fast-path
develop fails mid-flight.

## The CX405 exception

The camcorder look **always** develops on the compat path: its
tin-can audio chain is real signal processing, and the fast path
is deliberately built on audio passthrough. (Re-encoding
processed audio on WebCodecs is the hole ntsc-rs-web patches
with a bespoke libavcodec Wasm — not worth it here.)

## Rejected

- **MediaRecorder/captureStream**: realtime-only, silently
  drops frames under load, freezes in background tabs, output
  container is a browser lottery.
- **ffmpeg core-mt**: ~2× on the ffmpeg stages only (it can't
  accelerate our per-frame filter) and needs cross-origin
  isolation, which endangers third-party resources on the page.
- **Server transcode**: per-export COGS + infra for a
  local-first app whose pitch is that media never leaves the
  device.
