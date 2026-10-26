# Graphite Darkroom acceptance

final result: passed

## Visual evidence

Source: `design/reference/graphite-darkroom.png`, Library `libfile_57538a55f7588191bc08df33d5746a93`, selected option 2. Source is 1487×1058 pixels. Implementation: local production preview, `http://127.0.0.1:4174/`.

`docs/verification/simple-shelf/desktop-pro.jpg` is 1487×1058 CSS/pixels, Pro, Sample I, Docu Classic Chrome, split 50%. `reference-comparison.jpg` combines both full views at equal scale; `reference-details.jpg` combines same-scale card and adjustment crops. Both combined images were opened and inspected. No browser chrome/device frame or density mismatch. The compact report image downsamples both sides equally; original captures remain available.

Additional browser captures: `desktop-photos.jpg` and `desktop-video.jpg` (1280×720), `desktop-hasselblad.jpg` (1487×1058), `mobile-photos.jpg` and `mobile-shelf.jpg` (390×844). Mobile at 360×740 was also exercised. Screenshots contain only the app and repository sample photographs, no personal files or account information.

## Findings and comparison history

- P1 fixed: two-column grid initially compressed rows and clipped card labels. `grid-auto-rows: max-content` restores complete names/descriptions. Final desktop and mobile shelf captures show the correction.
- P2 fixed: oversized frame padding reduced the photograph. `fitStage` now gives the image more room. At 390×844 the portrait is 257×385 and Export is visible at y574–620. At 360×740 Export remains visible at y510–556. Neither viewport overflows horizontally.
- P2 fixed: card rerenders discarded keyboard focus. Focus now returns to the corresponding card; Enter selection of Gold retains focus and pressed state.
- P2 fixed: Pro names truncated. Labels now wrap within the card; final Pro screenshot verifies actual catalogue names.
- No remaining actionable P0/P1/P2 findings within the selected design and retained product scope.

## Required fidelity surfaces

- **Typography:** Instrument Sans retained with system fallbacks. Pro heading 25px, Simple names 14px, descriptions 11px, values 12px; wrapping and hierarchy verified in actual captures. Mockup labels are shorter than real catalogue names; actual names and legal provenance are retained instead of copying mockup text.
- **Layout:** graphite header, compact two-column camera shelf, dominant photograph, right adjustment column. Pro retains working search and the full catalogue; Simple uses the nine approved meaningful recipes. Mobile becomes a vertical workflow with substantial preview and immediately reachable Export, then a two-column shelf. Source mockup has no mobile specification.
- **Tokens:** shared graphite surfaces, quiet borders/radii, silver active controls, muted amber selection/focus. Competing stripe/checker decorations, theatrical hardware framing and fake glass overlays removed. Image assets carry material texture. The source's stronger material gradients are restrained rather than recreated as competing CSS decoration.
- **Images:** all six original generated assets preserved unchanged; responsive WebP alpha derivatives use contain sizing. Dark/light composites and actual Fuji, compact, instant, camcorder and Hasselblad cards inspected. No stretching or clipping observed; slight edge fringe remains a P3 limitation. Asset alpha peaks at 254, so this is not a claim of a perfect opaque cutout. Approved original camera artwork supersedes the mockup's approximate camera drawings.
- **Content:** actual recipes, controls and provenance retained. No claimed popularity ranking, Dazz equivalence, CCD substitution or invented Leica recipe. Existing catalogue has Hasselblad but no Leica brand; Leica artwork is prepared and mapped for future entries.

## Interaction and regression evidence

Verified browser keyboard selection/focus, collection memory (Gold→Video→Gold), Pro selection and Simple fallback (Hasselblad→Chrome), rapid sample replacement, photo/video inputs, both export controls, invalid-image error recovery and Simple/Pro PNG pixel equality. A 0.5s synthetic Sample II clip developed through CX405's FFmpeg path into a downloaded, decodable H.264 MP4: 320×212, five frames, 14,738 bytes. WebCodecs photo-look processing also reached completion; poster exports in both modes were equal. Production console contained only the intentionally induced invalid-image errors.

Tests: 106 native passed, 1 ignored; five web tests passed; production TypeScript/Vite build passed; three existing native/WASM parity cases all mean/max difference 0. No recipe, LUT, core or WASM source changed. Strict Clippy still fails on 12 unchanged vendor `ntsc-rs` diagnostics; checks were not weakened.

## Follow-up polish and limits

P3: the artwork's edge fringe can be refined later, and additional brand-specific art can replace remaining existing SVG/photographic fallbacks. The source image supplies art direction, not new filter science: these checks establish working integration and regression stability, not camera-ground-truth or competitor matching. No new rendering library or manual deployment.
