# Color test cases & guardrails

The official Fujifilm simulations are pinned by numeric character
tests so their colors cannot drift silently. The failure this
guards against already happened once: the upstream cubes are
authored for linear-contrast input, we applied them raw to
display JPEGs, and the whole family ran ~+0.2 chroma hot
(Provia — Fuji's neutral standard — at 1.26 median chroma gain)
until the Oct 2026 re-base (see `tools/fix_official_fuji.py`).

## How to run

```
cargo test -p openfuji-core --test guardrails
```

Six tests: `chroma_bands`, `neutral_axis_ramp_and_slope`,
`black_and_white_points`, `skin_tones`, `family_ordering`,
`sampler_follows_cube_spec_order`. They run in CI with the
workspace test suite. Negative control (Oct 2026): restoring the
original upstream Provia cube makes `chroma_bands` fail at
exactly 1.260 vs band [0.97, 1.11]; the re-based cube passes.

## Probe set (synthetic, generated in the test code)

- **Hue chart** — 12 hues × saturations {0.3, 0.55, 0.8, 1.0} ×
  values {0.35, 0.55, 0.75, 0.95}. Statistic: median CIELAB
  chroma gain (output ÷ input C*) over patches with input
  chroma > 15.
- **Gray ramp** — 25 steps, 0.02…0.98. Statistics: max neutral
  drift (Lab a*/b* magnitude, limit 6.0 for every sim), R-channel
  slope between steps 3 and 21, luma monotonicity (0.002/step
  tolerance — deep-shadow channel wiggles in the source DCP
  tables are ~0.0003 and are not defects).
- **Skin set** — five sRGB tones: (0.78, 0.57, 0.44),
  (0.65, 0.44, 0.33), (0.45, 0.30, 0.22), (0.88, 0.68, 0.55),
  (0.35, 0.23, 0.17). Statistics: max hue-angle shift, median
  chroma gain.
- **Black/white points** — black is pinned per sim: most sims
  sit at 0, but Bleach Bypass (0.137), Classic Neg (0.109) and
  Nostalgic Neg (0.133) have lifted blacks *by design* in the
  source tables; the bands keep the lift. White must stay within
  [0.985, 1.0] per channel.

## Measured character (Oct 2026, post-re-base; bands in the test)

| Sim | Chroma gain | Ramp slope | Skin hue shift | Skin gain |
|---|---|---|---|---|
| Provia | 1.04 | 1.18 | 11.0° | 1.15 |
| Velvia | 1.22 | 1.32 | 18.9° | 1.53 |
| Astia | 1.07 | 1.18 | 6.9° | 1.14 |
| Classic Chrome | 0.87 | 1.29 | 14.2° | 0.89 |
| Classic Neg | 0.65 | 1.19 | 22.2° | 0.90 |
| Pro Neg Hi | 0.99 | 1.31 | 13.0° | 1.01 |
| Pro Neg Std | 0.85 | 1.17 | 17.9° | 0.95 |
| Eterna | 0.81 | 1.10 | 9.3° | 1.06 |
| Nostalgic Neg | 0.95 | 1.11 | 15.9° | 1.60 |
| Reala Ace | 0.92 | 1.23 | 10.0° | 1.08 |
| Bleach Bypass | 0.43 | 1.12 | 20.3° | 0.62 |

Family invariants asserted on top of the per-sim bands:
Velvia > Provia > Classic Chrome > Bleach Bypass in chroma gain;
Eterna's ramp slope < Provia's (Eterna stays the flattest sim).

## ΔE golden regression (v2)

`crates/openfuji-core/tests/guardrails_deltae.rs` adds a second,
independent layer on top of the character bands:

- **Golden outputs** — all 222 probe outputs × 11 sims are stored
  in `tests/fixtures/golden_official.csv` (blessed from the
  calibrated cubes). The regression test recomputes them and
  asserts **mean ΔE00 ≤ 1.0, max ≤ 2.0** per sim (darktable's
  integration-test convention, tightened), so any future LUT
  edit — even one that stays inside the character bands — shows
  up as a number, not an opinion.
- **ΔE conformance** — the ΔE00 implementation (the `palette`
  crate, MIT/Apache-2.0) is itself tested against the 34
  reference pairs of Sharma, Wu & Dalal (2005), transcribed from
  the colour-science fixtures (BSD-3) and verified against
  colour 0.4.7 to <1e-4.
- Negative control: the pre-re-base Provia cube fails the golden
  regression at **mean ΔE00 10.6, max 20.0** — a measure of how
  far off the original shipped colors were. Re-blessing after an
  intentional change: `cargo test -p openfuji-core --test
  guardrails_deltae bless_goldens -- --ignored`, in the same
  commit as the band review.

## Rules

- A failing band means the LUT's character changed. Re-measure,
  understand why, and update this table and the bands together
  in one commit. Never widen a band just to make a test pass.
- New official-tier LUTs (any brand) get a spec row and measured
  values before they ship.
- Bands are set from measurements with headroom (~±0.08), not
  from taste: they catch domain errors and wrong-file swaps
  (which shift values by ~0.2), not small authoring differences.
