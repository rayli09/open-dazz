# Verification round 3 - EmulsionPresets flagship bakes (2026-10-25)

Harness: tools/verify_round3.py. Applied via the real CLI (by fully-
qualified id) to the same two neutral RAW renders as rounds 1-2.

## AFXT2720
| look | mean_sat | crushed% | clipped% | channel_spread |
|---|---|---|---|---|
| neutral | 0.3829 | 0.53 | 0.0 | 43.55 |
| Kodak Portra 400 | 0.3427 | 0.15 | 2.67 | 53.07 |
| Kodak Ektar 100 | 0.4816 | 2.14 | 0.02 | 59.22 |
| CineStill 800T | 0.3565 | 0.0 | 0.0 | 62.43 |
| Ilford HP5 Plus | 0.0 | 2.51 | 0.0 | 0.0 |

## DSCF0733
| look | mean_sat | crushed% | clipped% | channel_spread |
|---|---|---|---|---|
| neutral | 0.4029 | 4.93 | 0.06 | 37.12 |
| Kodak Portra 400 | 0.3507 | 1.63 | 0.13 | 43.88 |
| Kodak Ektar 100 | 0.5307 | 14.67 | 0.0 | 52.15 |
| CineStill 800T | 0.2709 | 0.0 | 0.0 | 46.14 |
| Ilford HP5 Plus | 0.0 | 12.79 | 0.0 | 0.0 |

Verdicts (7/7 PASS): HP5 bakes to true monochrome (spread 0.0);
Ektar 100 saturates well above Portra 400 (0.482 vs 0.343 on AFXT2720);
Portra 400 lifts shadows vs neutral on the backlit frame (crush
1.63% vs 4.93%) as a portrait stock should; CineStill 800T applies
without highlight blowup. Sheets: sheet-round3-AFXT2720.jpg and
sheet-round3-DSCF0733.jpg in this folder.
