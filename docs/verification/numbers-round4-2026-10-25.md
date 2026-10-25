# Verification round 4 - Hald-derived B&W bases (2026-10-25)

Harness: tools/verify_round4.py. The nine B&W Fujifilm bases (Acros x4,
Monochrome x4, Sepia) were converted from Stuart Sowerby's X-Trans III
HaldCLUT set (GPL-3.0, library/fuji/community/hald-bases/) by
tools/convert_hald.py and joined to the 56 formerly params-only Fuji
community recipes: the importer now reports 204/204 joined, 0 params-only.

Converter self-test: the bundled identity Hald converts at max error
0.00/255 (ordering + resample exact); all eight B&W cubes are pure gray
ramps (max R-G deviation <= 1/255), Sepia deviates 39/255 by design.

## AFXT2720
| base | channel_spread | mean R-B | crushed% |
|---|---|---|---|
| ACROS | 0.0 | -0.0 | 0.0 |
| MONOCHROME +R | 0.0 | 0.0 | 0.0 |
| SEPIA | 43.66 | 43.66 | 0.0 |

## DSCF0733
| base | channel_spread | mean R-B | crushed% |
|---|---|---|---|
| ACROS | 0.0 | 0.0 | 0.0 |
| MONOCHROME +R | 0.01 | 0.01 | 0.0 |
| SEPIA | 34.7 | 34.7 | 0.0 |

Verdicts (6/6 PASS): Acros- and Monochrome-based recipes render true
monochrome through the full engine path; Sepia renders warm-toned
gray. Sheets: sheet-round4-AFXT2720.jpg, sheet-round4-DSCF0733.jpg.

## Still open: ground-truth deltaE
Checked 2026-10-25: raw.pixls.us is RAW-only (the Fujifilm folders
hold .RAF files, no same-frame camera JPEGs), so a neutral-render ->
LUT vs SOOC-JPEG deltaE still has no corpus. One RAF+JPEG same-frame
pair with a known film simulation (e.g. a DPReview gallery original
or a future Fuji shot of the maintainer's) unblocks it; the harness
side is an afternoon, the corpus is the blocker.
