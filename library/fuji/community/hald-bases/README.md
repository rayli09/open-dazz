# Hald-derived base LUTs — Fujifilm B&W simulations (GPL-3.0)

Base LUTs for the nine black-and-white Fujifilm simulations that the
FujifilmCameraProfiles pack does not include: **Acros** (+Ye/+R/+G filter
variants), **Monochrome** (+Ye/+R/+G), and **Sepia**. Fuji X Weekly
community recipes whose base is one of these join here
(`baseLut: ../hald-bases/luts/<name>.cube`).

- Source: Stuart Sowerby's *Fujifilm X-Trans III* HaldCLUT set
  (http://sowerby.me), redistributed via
  https://github.com/cedeber/hald-clut — the author designed them to be
  applied to a neutral RAW render, which is exactly how this library is
  verified.
- License: **GPL-3.0** (see `LICENSE-GPL-3.0.txt` in this directory).
  These files are kept segregated for that reason; a community recipe
  that joins one of these bases carries the GPL terms for the base data
  at render time. The rest of the fuji community tier is Apache-2.0
  data and the official tier is CC BY-NC-SA — do not mix the folders.
- Conversion: `tools/convert_hald.py` resamples the level-12 Halds
  (144 steps/channel) to size-32 `.cube`. Its identity-Hald self-test
  lands at max error 0.00/255, and all eight B&W cubes measure as pure
  gray ramps (max R-G deviation <= 1/255); Sepia deviates by design
  (warm tone, 39/255).
