# Testing and maintenance

Run commands from the repository root unless noted. Use stable Rust with `clippy` and the `wasm32-unknown-unknown` target, and Bun 1.4.3. CI runs the same core/web gates; browser checks need separate local tools.

## Core and web gates

```sh
cargo test --workspace
cargo clippy --workspace -- -D warnings
cargo build -p opendazz-core --target wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
tools/check-wasm-declarations.sh
cd web
bun install --frozen-lockfile
bun test
bun run build
bun run preview
```

The bindgen CLI must match the dependency in `Cargo.lock`. The declaration check rebuilds Rust bindings and compares both committed `.d.ts` files; the web build checks strict app types and generated-ABI contracts. After engine changes, regenerate the complete JS/WASM/declaration package as described in [web development](../web/README.md). Keep `web/src/pkg/` committed so frontend builds do not require Rust.

Native tests include [LUT/color guardrails](COLOR_TEST_CASES.md), ΔE/golden conformance, Fuji photo behavior, frozen legacy video bytes, phone frame determinism and CX405 reference pixels. Keep `crates/opendazz-core/tests/fixtures/`: RGB frames and CSVs are required test inputs, not generated delivery evidence. Do not weaken thresholds or refresh goldens merely to make a test pass.

## Browser regressions

Keep the production preview running (default `http://127.0.0.1:4173`); run harnesses in a second terminal at the repository root, with Chromium and FFmpeg/ffprobe installed. Keep browser tooling outside the app's production dependencies. One reproducible scratch installation, using the version verified with these harnesses:

```sh
mkdir -p tools/verify-out/browser-runner
bun add --cwd tools/verify-out/browser-runner --exact playwright@1.64.1
export PLAYWRIGHT_MODULE="$PWD/tools/verify-out/browser-runner/node_modules/playwright/index.mjs"
export BROWSER_BIN=/usr/bin/chromium
for suite in state media recovery exports phones materials workshop-material; do
  bun "tools/verify-browser-$suite.mjs" || exit 1
done
```

| Suite | Regression coverage |
|---|---|
| `state` | Simple/Pro persistence, selection/routing, invalid input and blocked storage |
| `media` | Picker/drop, duplicates, independent settings/playback, seek/fullscreen/audio, cancellation/removal and object URL cleanup |
| `recovery` | Original-dimension PNGs, snapshot/duplicate protection, HTTP/offline/invalid retry, refresh/reselect, quota, unsaved warning and undo |
| `exports` | Actual PNG/MP4 decoding, frame count/duration, filtered pixels, AAC/silent/Opus/compatibility audio, cancel/input changes |
| `phones` | N95/4S moving outputs, preview stage consistency, aspect ratio, timing/audio, seeded frames and Ricoh PNG routing |
| `materials` | Isolated `/materials.html` control interactions, PNGs and state isolation |
| `workshop-material` | Main `/` dial/numeric/keyboard/touch, per-item edits, 320/390px layouts and error/recovery/undo states |

Harnesses generate their own fixtures and write captures/downloads/JSON under `/tmp/opendazz-*` by default. `BASE_URL` configures the editor suites; the study uses `MATERIAL_BASE_URL`. Output overrides are `STATE_VERIFY_OUT`, `MEDIA_VERIFY_OUT`, `RECOVERY_VERIFY_OUT`, `EXPORT_VERIFY_OUT`, `PHONE_VERIFY_OUT`, `MATERIAL_VERIFY_OUT`, `WORKSHOP_VERIFY_OUT`. Point them at `/tmp` or ignored `tools/verify-out/`. Do not commit generated reports, screenshots or exported media. Browser checks are bounded regressions, not broad Safari/HDR/HEIC/long-video certification.

## Library and pixel tools

- `python3 tools/qa_library.py` checks catalog identity, recipe/LUT structure and thumbnails without changing the library. `--render` additionally needs a built CLI and Pillow; it renders into a temporary directory.
- `tools/fetch_test_images.sh` and `tools/render_test_images.py` prepare the optional CC0 RAW corpus described in [tests/images](../tests/images/README.md). RAW/render directories are ignored. Rendering needs rawpy, NumPy and Pillow.
- With that corpus and `cargo build --release -p opendazz-cli`, run `tools/verify_filters.py`, `tools/verify_emulsion.py` or `tools/verify_fuji_bw.py` using NumPy/Pillow. They retain the numeric assertions and write only to ignored `tools/verify-out/` subdirectories. No old metrics cache is required.
- `tools/verify_fuji_photo.py --help` describes paired native comparisons against an explicit baseline ref/binary. `--check-wasm` also checks native/WASM pixels and alpha using `check_wasm_photo.mjs`. Output defaults to ignored `tools/verify-out/fuji-photo-v1/`.
- `bun tools/check_ci_wasm_video.mjs web/src/pkg tools/verify-out/wasm-video` probes odd/even frame sizes and alpha through the actual binding. Outputs are scratch RGBA files for comparison.
- `tools/gen_cx_ref.py` records the CX405 golden-generation procedure against the separate `camcorder-pipeline` v1.2 reference checkout; its external local paths must be configured before deliberately regenerating fixtures. Normal tests consume committed goldens and do not run this generator.

Library import/bake/catalog/thumbnail tools intentionally modify production packs or derived assets; they are maintainer operations, not routine test setup. Preserve per-pack licenses/provenance, camera originals and their [source manifest](../design/camera-assets/manifest.json). Current recipes expect display-sRGB LUT ingress; recipe photo profiles must not change legacy video rendering. [Architecture](CORE_ARCHITECTURE.md) and [video routes](VIDEO_ARCHITECTURE.md) describe the boundaries.
