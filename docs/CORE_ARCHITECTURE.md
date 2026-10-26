# opendazz-core architecture

The core is organized by domain. Each module owns one concern;
shared helpers live in exactly one place. The public surface is
the flat re-exports in `lib.rs` (plus `prelude`); internal paths
may move, the re-exports may not.

```
crates/opendazz-core/src/
  lib.rs          module map + stable re-exports + prelude
  math.rs         lerp, clamp01, screen blend, Rec.709 luminance,
                  hash2d (the frozen grain hash)
  color.rs        sRGB <-> linear, XYZ, CIELAB (D65)
  image.rs        u8 <-> f32 pixel conversions (truncate-after-
                  clamp semantics are contractual)
  lut.rs          .cube parsing, trilinear sampling
  recipe.rs       recipe schema v0
  pipeline/       the still-image stage chain, in order:
    mod.rs          apply_recipe orchestrator
    white_balance.rs
    tone.rs
    halation.rs
    grain.rs
  video/
    mod.rs
    vhs.rs        NTSC/VHS simulation over vendored ntsc-rs
                  (presets + full settings JSON surface)
```

Rules that keep it scalable:

- **One implementation per concept.** Luminance, the sRGB
  transfer curve, and the grain hash each exist once. If two
  stages need it, it goes in `math`/`color`/`image` — never
  copy-pasted into a stage.
- **Stages are pure and independently testable.** Per-pixel
  stages take `&mut [f32; 3]`; whole-image stages take buffers.
  The orchestrator is the only place that knows the order.
- **Output bytes are contractual.** Refactors must keep renders
  byte-identical (the Oct 2026 domain refactor was gated on
  md5-identical stills + video frames before/after). Conversion
  semantics that look like quirks (f32->u8 truncation, the
  grain hash constants) are deliberate; changing them is a
  behavior change, not a cleanup.
- **Core does no file IO** and stays wasm32-clean: platform
  differences (e.g. ntsc-rs rayon) are target-gated in Cargo,
  never `cfg!` scattered through domain code.
- **Color correctness has its own layer**: the calibration
  guardrails in `tests/` (see COLOR_TEST_CASES.md) pin what the
  LUTs must measure; `color.rs` is the production color math
  they will converge on.
