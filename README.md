<p align="center">
  <img src="web/public/logo.svg" width="72" height="72" alt="OpenDazz aperture logo" />
</p>
<h1 align="center">OpenDazz</h1>
<p align="center">A local-first film simulation workshop for photos and video.</p>
<p align="center">
  <a href="https://github.com/rayli09/open-dazz/actions/workflows/ci.yml"><img src="https://github.com/rayli09/open-dazz/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/code_license-MIT-blue.svg" alt="Code license: MIT" /></a>
  <a href="https://opendazz.vercel.app"><img src="https://img.shields.io/badge/try-OpenDazz-graphite?color=30363d" alt="Try OpenDazz" /></a>
</p>
<p align="center"><a href="https://opendazz.vercel.app"><strong>Open the app</strong></a> · <a href="web/README.md">Development</a> · <a href="library/README.md">Look library</a></p>

![OpenDazz photo workshop with curated camera looks and a before/after preview](docs/verification/simple-shelf/desktop-photos.jpg)

Pick a look, compare the result, and export. Your media is processed on your device; the app downloads its engine and look assets, without uploading your photos or clips for processing.

## Features

- **Simple:** nine curated Fuji-first photo looks, plus a separate CX405/VHS video-effects collection.
- **Pro:** the full multi-brand catalogue with strength, grain, halation and white-balance controls.
- **Photo and video:** draggable before/after preview, PNG photo export and MP4 video development. HEIC conversion is available in the browser.
- **One engine:** Rust powers both the `opendazz` CLI and browser WebAssembly, with portable JSON recipes and `.cube` LUTs.

Browser photos export at up to 1920px on the long edge. Video support depends on browser codecs and device resources: clips are limited to 120 seconds on the WebCodecs path or 45 seconds on the FFmpeg compatibility path, at up to 854px wide. CX405 development uses FFmpeg. See [web development and limits](web/README.md).

## Quick start

### Web

Use Node.js 24, matching CI. The repository includes the browser WASM package.

```sh
git clone https://github.com/rayli09/open-dazz.git
cd open-dazz/web
npm ci
npm run build
npm run preview
```

Open the local URL printed by Vite. [Development notes](web/README.md) cover the dev server and rebuilding WASM.

### CLI

From the repository root, with stable Rust installed:

```sh
cargo run --release -p opendazz-cli -- list
cargo run --release -p opendazz-cli -- apply \
  web/public/samples/sample-1.jpg /tmp/opendazz-chrome.png \
  --look fuji/community/005-docu-classic-chrome-john-peltier
```

Run `cargo run --release -p opendazz-cli -- --help` for commands and `video --help` for the FFmpeg-based video workflow. The installed binary is named **`opendazz`**.

## Project guide

- [Engine](crates/opendazz-core) · [CLI](crates/opendazz-cli) · [WASM bindings](crates/opendazz-wasm) · [Web app](web)
- [Recipe format](recipes/README.md) · [Library layout and provenance](library/README.md) · [LUT packs](luts/README.md)
- [Current UI and export verification](docs/verification/simple-shelf/README.md) · [Fuji photo processing validation](docs/verification/fuji-photo-v1-2026-10-26.md)

CI runs web tests/build, Rust tests, strict Clippy and a WASM build gate. The badge above reports its actual status. Visual comparisons and regression tests are not proof of exact camera or third-party app fidelity.

## License and credits

OpenDazz code is [MIT licensed](LICENSE). **Bundled recipes and LUTs retain their own licenses**; a recipe's metadata alone does not override its base LUT's terms. In particular, [Fuji official LUTs](library/fuji/official/README.md) are **CC BY-NC-SA 4.0**, and [some monochrome bases](library/fuji/community/hald-bases/README.md) are **GPL-3.0**. Check the relevant pack before reuse or redistribution.

Credits include [open-fuji-recipes](https://github.com/matthieurobin/open-fuji-recipes), [EmulsionPresets](https://github.com/peva3/EmulsionPresets), and the sources credited in each [library pack](library/README.md). VHS/NTSC processing uses [ntsc-rs](https://github.com/valadaptive/ntsc-rs), preserved with its [MIT](crates/ntsc-rs/LICENSE-MIT), [ISC](crates/ntsc-rs/LICENSE-ISC) and [Apache-2.0](crates/ntsc-rs/LICENSE-APACHE-2.0) license texts. Camera artwork and provenance are recorded in the [asset manifest](design/camera-assets/manifest.json).

Independent project; not affiliated with Dazz, Fujifilm or other camera manufacturers.
