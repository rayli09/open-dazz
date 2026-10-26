# Graphite workshop rollout — visual QA

final result: passed

Source visual truth: `docs/verification/material-controls/material-desktop.png` (1440×1104) and `material-mobile.png`, the user-approved implemented material study. Implementation: production main route `/`, screenshots under `docs/verification/workshop-material/`; desktop 1440×1000 and mobile 390×844/320×844, CSS pixels and device scale factor 1. The mobile touch context also exercised actual `tap` input. The source route is a material reference; the editor retains its existing layout and content instead of adopting the study's promotional introduction or isolated-control arrangement.

## Comparison evidence

`comparison-full.png` puts source and final main Pro together, both at 50% for composition. `comparison-controls.png` compares native, unscaled CSS-pixel crops of the dial, mode carriage and shutter button. The source has taller page content and a landscape photo; the main editor has a portrait and persistent dock. Those content/layout differences are intentional. Both were opened and compared visually, alongside desktop Simple, mobile photo/Pro/video, export, retry/error, loading, empty, undo and recovery screenshots. This is not a claim of pixel-identical whole-page recreation.

## Findings and fixes

- [P1, resolved] Mobile Pro's flex ledger initially shrank into its footer, clipping the editing surface. Set the mobile ledger/content to non-shrinking natural page flow. Final `main-mobile-pro-390.png` was opened after the environment recovered; dial and numeric input are visible. Browser regression additionally checks the ledger content height at both mobile widths.
- [P2, resolved] Desktop Pro controls pushed Export beyond the visible panel. Split scrolling `ledger-content` from fixed `ledger-actions`. Final desktop Pro and automated button/dock bounds confirm Export remains reachable.
- [P2, resolved] Mobile photo Export partially met the dock at initial scroll. Adjust the photo bench height against viewport space; final mobile photo and button/dock bounds pass at 320/390px.
- [P2, resolved] Narrow mobile video previews clipped playback buttons. Reserve video bench height and wrap the native library control row; final player and output/export captures show all controls. Scrolling for video output information is intentional.
- [P2, resolved] Error/recovery banners resized available preview space without refitting the image. Observe the actual stage container size with a cleaned-up ResizeObserver. Final error screenshot keeps the whole preview and actionable retry visible.
- [P2, resolved] Initial decode had no measured image size for a readable loading well. Add a bounded loading minimum, hide its comparison handle and start Export disabled. Final loading screenshot shows status and disabled action.

## Required fidelity surfaces

- **Typography:** same Instrument Sans/system fallback stack as the reference, quiet uppercase control labels, readable supporting text and tabular numeric values. The executor blocked external font requests, so fallback rendering was inspected; exact loaded-font rendering is not claimed.
- **Spacing/layout:** restrained matte regions, reduced nested action-card treatment, shared narrow bevel/recess rhythm, fixed desktop action and natural mobile scrolling. Portrait/landscape previews preserve geometry. Primary targets are at least 44px; Pro controls are not hidden behind the dock.
- **Colors/tokens:** shared satin, recessed base, graphite panel, rule and accent tokens. The shared dial uses the reference's top-left lighting, ticks and fixed indicator. Most surfaces stay matte; focus and error states remain explicit. Original sample contrast checks pass (7.32–15.91:1 for its checked foreground pairs); this is not a claim that every pixel pair has been audited.
- **Image quality:** existing realistic camera artwork, transparency, aspect ratio and thumbnail pipeline preserved. No rasterized interactive controls, replacement product art or new 3D dependency. CSS/SVG physical controls follow the user's explicit implementation direction.
- **Copy/content:** existing film names, inspired-device limits, original-size photo contract and settings-only recovery disclosures remain. No study-only promotional text or developer implementation details were introduced into the editor flow. Strength is editable only where existing Pro behavior permits it; no unsupported exposure control was invented.

## Interaction/accessibility evidence

Main material suite passes six groups: keyboard/native slider, direct number and invalid bounds, optional horizontal dial dragging, per-item restoration, touch mode/numeric input, focus/hover/press/disabled, dropdown Enter/Escape, main PNG download, retry, delete/undo and reduced motion. Media/state/recovery suites additionally exercise playback, switching/removal/cancel/export snapshots and settings persistence. All final suites report zero uncaught page errors. No new processing algorithms, persistent binary storage or transient-resource ownership changes.

## Comparison history and remaining scope

Initial full-view/focused inspection found the issues above; fixes were followed by new production builds and recaptures. Final mobile Pro evidence was explicitly opened after the temporary executor outage. Earlier test completion was recovered from logs rather than assumed. The final main material suite and final media suite passed after the last layout changes.

No actionable P0/P1/P2 visual findings remain in the inspected states. Existing truncated dock filenames have full accessible labels/tooltips; further dense-library polish is P3. Safari, mobile OS keyboards, HDR/HEIC variants, long-video behavior, 200% text zoom and manual screen-reader certification remain outside this Chromium visual pass. Public Vercel rendering is not inferred from CI or deployment status.

Implementation checklist: shared controls extracted; main route integrated; desktop/mobile and interaction states inspected; meaningful existing media/export/recovery gates passed; screenshot evidence persisted outside deployment output; one batched main push and remote verification required for release handoff.
