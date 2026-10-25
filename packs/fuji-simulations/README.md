# Pack: fuji-simulations (base LUTs)

The 11 Fujifilm film-simulation base looks as `.cube` 3D LUTs (sRGB, size 32),
plus one bare recipe per sim in `recipes/`.

**Source**: [abpy/FujifilmCameraProfiles](https://github.com/abpy/FujifilmCameraProfiles)
— the sims' DCP LookTables baked to .cube. DisplayP3 variants exist upstream
(not bundled here).

**License: CC BY-NC-SA 4.0** (upstream README). Attribution required,
**non-commercial use only**, share-alike. This pack is deliberately segregated
from MIT-licensed material — do not mix its files into permissively licensed
packs, and do not use it in a commercial product.

Sims covered: Provia/Standard, Velvia/Vivid, Astia/Soft, Classic Chrome,
Classic Neg, Nostalgic Neg, Pro Neg Hi, Pro Neg Std, Eterna/Cinema,
Eterna Bleach Bypass, Reala Ace.
**Not available here**: Acros, Monochrome, Sepia (B&W family — expected later
from Stuart Sowerby's HaldCLUT set via a Hald->cube converter).

Caveat (upstream): these LUTs assume a linear-contrast input; applied to an
already-contrasty JPEG the look runs stronger than the in-camera result.
