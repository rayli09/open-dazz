# OpenDazz web

Live app: **https://opendazz.vercel.app**. Vite, TypeScript and Tailwind serve a static frontend; the shared Rust engine runs in WebAssembly. Media processing stays on the device.

## Run locally

Use Bun 1.4.3, matching CI. From `web/`:

```sh
bun install --frozen-lockfile
bun test
bun run build
bun run preview
```

Open the URL printed by Vite. `prebuild` synchronizes the repository's library and FFmpeg browser runtime into `public/`. The committed `src/pkg/` package lets the web app build without installing Rust tooling.

`bun run dev` also synchronizes those assets, then starts Vite. The current dev-server path has a known import-analysis issue with `/ffmpeg/classes.js`; use the production build and preview for the working photo/video workflow. This does not affect the production build.

After changing Rust engine code, rebuild the WASM package from the **repository root** with `wasm-pack` installed:

```sh
wasm-pack build crates/opendazz-wasm --target bundler \
  --out-dir ../../web/src/pkg
```

Both `.d.ts` files in `src/pkg/` come from wasm-bindgen; the client imports their typed JS entry. CI rebuilds bindings with the CLI version matching `Cargo.lock` and rejects declaration drift (`tools/check-wasm-declarations.sh` from the root). `bun run typecheck` checks strict client types and generated-binding contracts.

## Product and implementation

- **Simple:** eleven curated Fuji-first photo recipes; separate CX405 and VHS effects. Recipe identity, artwork, labels and media grouping live in `src/simple-presets.ts`.
- **Pro:** full catalogue, search/brand/type filters, recipe provenance and adjustment sliders.
- **Preview/export:** compare original and processed pixels; Export saves the selected photo as PNG or the complete filtered clip as MP4 with audio when supported. Both modes preserve photo profiles; video uses the legacy processing override.
- **Media dock:** import multiple files with the picker or Uppy drag/drop. Each item keeps its own look, sliders, comparison and playback position in a Zustand session store. Arrow keys select, Alt+arrows reorder and Delete removes; touch controls provide the same actions.
- **Player:** Video.js HTML components provide accessible play/pause, seeking, time, mute/volume and filtered fullscreen. The live WASM preview uses up to a 480px long edge at about 12 fps and source audio; original comparison is explicitly labelled. Export remains a separate complete-clip render, including CX405 audio processing.
- **Assets:** `scripts/sync-library.mjs` copies `../library` before dev/build. Recipes and LUTs are fetched when needed. Original generated camera artwork and responsive derivatives are documented in `../design/camera-assets/manifest.json`.
- **Style:** Graphite Darkroom, Instrument Sans, shared graphite surfaces and restrained silver controls. Desktop uses a two-column camera shelf; mobile keeps a substantial preview and reachable export controls before the shelf.

## Browser limits

The session dock holds up to **24 items**, **512 MB per file**. Files, object URLs and edits stay in memory and are released on removal/page exit; only Simple/Pro mode persists across reloads.

Photos are scaled to a maximum long edge of **1920px**. Format decoding depends on the browser; HEIC/HEIF conversion loads on demand. JPEG and PNG are useful fallbacks for unsupported images.

Video takes the WebCodecs route when supported (up to **120 seconds**) and otherwise uses the FFmpeg compatibility route (up to **45 seconds**). Both scale processing to at most **854px wide**. CX405 development always uses FFmpeg for its audio chain. Codec, container, memory and hardware support vary; trim longer clips first. CLI video processing requires a local FFmpeg installation.

## Validation and hosting

[UI/export verification](../docs/verification/simple-shelf/README.md) records actual desktop/mobile screenshots, historical nine-look sample renders, mode parity and a decoded short MP4. [Design QA](../design-qa.md) documents the selected visual target and accepted differences. These are bounded regression checks, not claims of exact camera matching.

Production frontend root: `web`; build command: `bun run build`. Existing hosting settings and Git integration are managed separately. Documentation changes do not rename hosting projects or modify infrastructure. See the root [license and credits](../README.md#license) before reusing bundled looks.
