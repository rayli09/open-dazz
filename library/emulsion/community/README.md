# Community pack — EmulsionPresets bakes

Looks baked from [peva3/EmulsionPresets](https://github.com/peva3/EmulsionPresets)
Lightroom presets (**MIT**) by `tools/bake_emulsion.py`: each XMP's point
operations were sampled into a `.cube` LUT (size 17) plus a recipe JSON
carrying its grain settings.

This is a **display-referred approximation** of Adobe Camera Raw PV2012
semantics — tone curves are baked exactly; the basic panel, HSL and color
grading are close approximations (ACR's versions are content-adaptive);
clarity/texture/dehaze/vignette/sharpening and absolute white balance
cannot be expressed in a LUT and were dropped (each recipe's `provenance`
lists exactly what was baked and what was dropped). The fuji brand's
community tier also holds the separate Fuji X Weekly recipe pack — see
its own README there.
