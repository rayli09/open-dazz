# OpenDazz on Exact: adoption spike

Status: the Exact app shell stands up and is verified on the web host. The UI
is a deliberate placeholder (the redesign is a separate step), and no real
image processing happens yet. Nothing in `main`, `web/`, or `crates/` was
touched; this app lives entirely under `exact/` on the `exact-adoption`
branch.

Exact is pre-alpha: no packaged release, no API stability, no backwards
compatibility, no migration guide. The app builds from a checkout of
expo/exact referenced by path (`.exact/checkout`), so expect to re-pin and
adjust as the framework moves.

- Exact checkout: `~/workspace/exact-study` (not part of this repo)
- Exact HEAD used: `4b9fea0d65ea8de1cefba596cae13c9890e784f9`
  (2026-11-21, "Drag out of the app, stage 5: Android drags a `draggable` node")
- Scaffolded with: `bun scripts/exact.mjs new <this dir> --name OpenDazz --bundle-id app.opendazz --rust`

## What the app is

- `app.contract` — the whole UI in Contract: an "OpenDazz" header, a preview
  placeholder card, an Export button placeholder, and a scrollable recipe
  list. Selecting a recipe names it in the preview; Export answers with a
  note that it is a placeholder. Colors, fonts, and sizes are left unsaid so
  each platform supplies its own.
- `data/` — the Rust data crate (`opendazz-data`), which `app.json`'s
  `rust.data` names. Its `recipes` source answers the list.
- `app.test.contract` — three tests: the list loads with nothing selected,
  tapping a recipe names it in the preview, Export states it is a
  placeholder.
- `proof/` — the evidence below.

## Setup that was actually needed

One-time, from the Exact checkout (Bun and Cargo on PATH):

```sh
bun scripts/exact.mjs setup
```

That provisions everything the web host needs: the pinned Rust toolchains
(1.99.1 and nightly-2026-08-21 with the wasm32 target and rust-src),
wasm-bindgen 0.2.130, Binaryen (wasm-opt 132), `bun install` for the
checkout, Playwright's pinned Chromium, the offline Cargo crate cache, and
the attested Hermes bundles. It takes a few minutes and downloads a few
hundred MB. Per-app work after that is just the scaffold command above; the
first Contract compiler build and the first web build compile the toolchain
once (see Divergences for how long that took here).

## Verified on the web host

- `bun exact.mjs contract build app.contract --json --errors-only` → `[]`,
  exit 0.
- `bun exact.mjs test web` → **3 passed, 0 failed** (`proof/test-web.txt`).
- `bun exact.mjs verify` → **clean, 0 findings** (`proof/verify-web.txt`).
- Agent drive (`bun exact.mjs agent web …`):
  - `tree` shows 96 nodes: header, preview ("No recipe selected."), the
    Export control, and every recipe row with its testId
    (`proof/tree.txt`).
  - `screenshot proof/web.png` (420×900): the header, the preview
    placeholder, the filled Export button, and the recipe buttons rendered.
  - `tap select-cinestill/community/cinestill-800t` then `tree`: the
    preview reads "Preview: Cinestill 800T" (`proof/tree-after-tap.txt`),
    and `proof/web-selected.png` shows the list scrolled to that row.
- The recipe names on screen are the real catalog's, served by the Rust
  data crate — including the catalog's own inconsistent spelling
  ("CineStill 400D" vs "Cinestill 800T"), which is how we know the data
  flowed through unchanged.

## Verified on the Linux host

- `bun exact.mjs linux` built the native host: cargo reports
  `Finished host-dev profile in 26m 49s`, producing
  `target/host-dev/opendazz-linux` (54 MB) plus a `.desktop` file
  (`proof/linux-build.txt`). The time is this VM's CPU throttling, not
  the framework's fault; it is a one-time cold build.
- `bun exact.mjs test linux` → **3 passed, 0 failed** (`proof/test-linux.txt`).
- Agent drive: `tree` shows the same 96 nodes as web (`proof/tree-linux.txt`),
  and `proof/linux.png` shows the same screen rendered by the Linux host's
  own painter — same plan, same data, no browser involved.

## How the Rust core binds (per the docs, and how the stub uses it)

Exact's documented Rust path is a **data crate**, not an FFI bridge:
`app.json`'s `rust.data` names a crate and the `DataSource` type in it
(here `opendazz-data` / `opendazz_data::OpenDazz`). The crate implements
`exact_runner::DataSource`:

- `query(source, args)` answers synchronously; the build bakes those
  answers into the plan, so the first frame already has its data.
- `answer(ctx, source, args)` handles mutations and async work (storage,
  files, requests) and replies; `parse` validates stored/requested values.
- `build.rs` generates Rust types for the Contract `shape`s into
  `OUT_DIR/shapes.rs`, so the crate and the view agree on the data's shape.
  A reply carrying an extra or missing field fails the resource/mutation.
- On the web the crate compiles to Wasm; on native hosts it compiles into
  the app. Sources and mutations are matched by name between
  `app.contract` and the crate.

The stub uses exactly this seam: `data/src/lib.rs` implements `query` for
one source, `recipes`, returning a static list as positional
`Value::record(id, name)` values — the example recipe plus 25 entries from
`library/catalog.json` (706 looks in all). The real binding is the same
shape with real sources: read the full catalog and recipe files, render a
preview (the existing Rust core in `crates/` is the natural home for that
logic), and perform the export as a mutation. No bridge had to be invented.

## What does not work yet

- **iOS from this Linux VM: cannot build.** Setup's own check names the
  missing pieces: the Apple cross SDK (an Xcode 27.1 `.xip` installed via
  xtool), Swift 6.4.2, LLVM 23 Apple tools, and `rcodesign`. Setup did
  install the iOS Simulator Rust target and its Hermes bundle, but nothing
  compiles without the Swift SDK. Running a Simulator (`verify ios`,
  `agent ios`) requires macOS in any case. Exact also offers cloud builds
  via AppDrop; not tried.
- **macOS: not attempted** (needs a Mac; the contract and data crate are
  host-independent, so nothing in this app blocks it).
- **Android: not attempted.** The README says the host works (Material 3
  polish still in progress) but there is no packaging path yet — apps run
  via `adb` from a checkout — and this VM has no Android SDK.
- **The app itself** has no photo loading, no LUT application, and no real
  export — by design, for this spike.

## Divergences from the README

1. **Bun version.** The checkout pins Bun 1.4.2, but 1.4.4 is accepted:
   `setup --check` reports `ok Bun: 1.4.4 (SDK >=1.4.2)`. No side-by-side
   install was needed.
2. **First-build times.** The guide says the Contract compiler builds
   "about a minute on a cold checkout". On this VM (1.5 shared CPUs) it
   took ~16 minutes, the first web build ~10 minutes more, and the first
   Linux host build 26m 49s of cargo time. Warm builds are fast: `verify`
   completed clean in 51.7 s and agent drives take seconds. Budget for
   the cold builds accordingly.
3. **The target sweep fails on `noatime` filesystems.** Every build
   prints a "target sweep failed" stack trace to stderr
   (`scripts/sweep.mjs`: the sweep cannot tell used from unused build
   units without access times). It is cache housekeeping only — builds
   succeed — but it reads as a build failure and floods logs (the raw
   logs in `proof/` contain it repeatedly). Recorded as a feedback note
   in `.exact/diary/2026-11-21-notes.md` (kept local, not sent).
4. **`exact setup`'s game step errors** on a `--locked` lock-file
   complaint (`game/Cargo.lock`). Games only; a later `setup --check`
   reports the game SDK crates as cached, and nothing in this app is
   affected.
5. **A fresh clone of this branch cannot build until Exact is set up on
   that machine.** The scaffold's `.gitignore` excludes
   `rust-toolchain.toml`, `.cargo/config.toml`, and `.exact/` (the
   checkout link), so the clone carries the app's sources only: run
   `bun exact.mjs --help` once (it creates `.exact/checkout`) with an
   Exact checkout available, after the one-time `exact setup`.
6. **The first `tree` from a cold drive under-reports.** The very first
   agent drive reported 18 nodes (list rows not yet laid out) while the
   screenshot already showed the rows; a later drive reported all 96.
   Treat an early `tree` as a lower bound, not the app's content.

## Next steps (for the redesign phase)

- Point the `recipes` source at the full `library/catalog.json` and the
  recipe files instead of the static subset.
- Add a preview source that renders through the existing Rust core, and
  make Export a real mutation.
- Bring up the iOS build on a Mac (or via AppDrop) once the UI is worth
  carrying in a pocket.
