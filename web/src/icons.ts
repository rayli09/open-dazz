// open-dazz asset library — every user-facing icon is drawn here.
// System: 24 grid, 1.6 stroke, squared terminals, currentColor.
// No third-party icon fonts in the chrome (see design/README.md).

function svg(inner: string, cls: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" class="${cls}" aria-hidden="true">${inner}</svg>`;
}

const CONTROLS: Record<string, string> = {
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  replay: '<path d="M5 8a8 8 0 1 1-1 7M5 3v6h6"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  "exit-fullscreen": '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8L20.5 20.5"/>',
  "chevron-down": '<path d="M5 9.5l7 7 7-7"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  download: '<path d="M12 4v11.2M6.6 10.4L12 15.8l5.4-5.4"/><path d="M4 15v5h16v-5"/>',
  upload: '<path d="M12 16V4.8M6.6 10L12 4.6 17.4 10"/><path d="M4 15v5h16v-5"/>',
  print: '<path d="M7 8.5V3.8h10v4.7"/><rect x="4" y="8.5" width="16" height="8"/><path d="M7 13.8h10v6.4H7z"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1-3.8 3.6-5.6 7-5.6s6 1.8 7 5.6"/>',
  mountain: '<path d="M3 19L9.5 7l3.4 5L15.4 9 21 19z"/><path d="M7.7 9.9l1.8 2.3 1.8-2.1"/>',
  sliders: '<path d="M3.5 7h8.2M17.5 7h3"/><circle cx="14.6" cy="7" r="1.9"/><path d="M3.5 12h2.8M12.1 12h8.4"/><circle cx="9.2" cy="12" r="1.9"/><path d="M3.5 17h10.4M19.7 17h.8"/><circle cx="16.8" cy="17" r="1.9"/>',
  "arrow-up-right": '<path d="M6 18L18 6"/><path d="M9 6h9v9"/>',
  compare: '<path d="M9.5 7.5L5 12l4.5 4.5"/><path d="M14.5 7.5L19 12l-4.5 4.5"/>',
  layers: '<path d="M12 3.5l9 4.8-9 4.8-9-4.8z"/><path d="M3.6 13.4L12 17.9l8.4-4.5"/><path d="M3.6 17.4L12 21.9l8.4-4.5" opacity="0.45"/>',
  palette: '<circle cx="12" cy="12" r="8.6"/><circle cx="9" cy="9.8" r="1.15" fill="currentColor" stroke="none"/><circle cx="14.8" cy="8.8" r="1.15" fill="currentColor" stroke="none"/><circle cx="9.4" cy="14.8" r="1.15" fill="currentColor" stroke="none"/>',
  contrast: '<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z" fill="currentColor" stroke="none"/>',
  video: '<rect x="3" y="7" width="12.5" height="10.5"/><path d="M15.5 11l5.5-2.9v8.3L15.5 14"/>',
  "badge-check": '<circle cx="12" cy="10" r="6.4"/><path d="M9.2 10.1l2 2 3.6-3.9"/><path d="M8.8 15.4L7.2 20.8l4.8-2.6 4.8 2.6-1.6-5.4"/>',
  users: '<circle cx="9" cy="9" r="3.3"/><path d="M3.2 19.2c.7-3.3 2.9-5.1 5.8-5.1s5.1 1.8 5.8 5.1"/><circle cx="17" cy="10" r="2.6"/><path d="M16.2 14.4c2 .3 3.5 1.8 4 4.3"/>',
  "swatch-book": '<rect x="5" y="3" width="14" height="18"/><path d="M9 3v18"/><circle cx="15.2" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="15.2" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15.2" cy="16" r="1" fill="currentColor" stroke="none"/>',
};
export function icon(name: string, cls = "w-4 h-4"): string {
  return svg(CONTROLS[name] ?? CONTROLS["swatch-book"], cls);
}

// Brand sigils — one drawn mark per brand, same system.
const SIGILS: Record<string, string> = {
  fuji: '<path d="M2.5 18.5L9 7l3.2 4.6L14 8.6l7.5 9.9z"/><path d="M7.7 9.9l1.3 1.7 1.3-1.6"/>',
  kodak: '<rect x="4" y="3.5" width="16" height="17"/><path d="M4 7h16"/><path d="M9.5 10.5V17"/><path d="M14.8 10.5L10.2 13.9l4.9 3.1"/>',
  ilford: '<rect x="4" y="4" width="16" height="16"/><path d="M12 4h8v16h-8z" fill="currentColor" stroke="none"/>',
  cinestill: '<rect x="3" y="6" width="18" height="12"/><circle cx="6.2" cy="8.8" r="0.95" fill="currentColor" stroke="none"/><circle cx="10" cy="8.8" r="0.95" fill="currentColor" stroke="none"/><circle cx="13.8" cy="8.8" r="0.95" fill="currentColor" stroke="none"/><circle cx="17.6" cy="8.8" r="0.95" fill="currentColor" stroke="none"/><circle cx="12" cy="13.6" r="2.5"/>',
  agfa: '<path d="M12 3.5l7.5 8.5L12 20.5 4.5 12z"/>',
  lomography: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>',
  rollei: '<rect x="4.5" y="4.5" width="15" height="15.5"/><circle cx="12" cy="9.6" r="2.2"/><circle cx="12" cy="15.6" r="2.2"/>',
  foma: '<path d="M4 20V7h13v13z"/><path d="M7 7V4h13v13h-3"/>',
  adox: '<path d="M10 3.5h4"/><path d="M11 3.5V9L6.7 19a1.5 1.5 0 0 0 1.4 2.1h7.8A1.5 1.5 0 0 0 17.3 19L13 9V3.5"/><path d="M8.2 14.5h7.6"/>',
  polaroid: '<rect x="5" y="3.5" width="14" height="17"/><rect x="8.2" y="6.5" width="7.6" height="7.6"/><path d="M5 17.2h14"/>',
  bergger: '<path d="M19.5 15A7.6 7.6 0 1 1 9 4.5a6.1 6.1 0 0 0 10.5 10.5z"/>',
  kentmere: '<path d="M5 20.5V9.2h2.8V7h3.1v2.2h2.2V7h3.1v2.2H19V20.5"/><path d="M10.4 20.5v-4.2a1.6 1.6 0 0 1 3.2 0v4.2"/>',
  orwo: '<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4c-4.8 4.9-4.8 12.3 0 17.2"/><path d="M12 3.4c4.8 4.9 4.8 12.3 0 17.2"/><path d="M3.6 12h16.8"/>',
  ricoh: '<path d="M9 4H4v5"/><path d="M15 4h5v5"/><path d="M20 15v5h-5"/><path d="M9 20H4v-5"/>',
  emulsion: '<path d="M12 3.5c3.4 4.3 5.9 7.6 5.9 10.6a5.9 5.9 0 0 1-11.8 0C6.1 11.1 8.6 7.8 12 3.5z"/><path d="M9.3 14.2a2.9 2.9 0 0 0 2 3.4"/>',
  camcorder: '<rect x="2.5" y="9" width="13" height="8.5" rx="1.6"/><path d="M15.5 11l6-2.4v9.3l-6-2.4"/><circle cx="6.8" cy="13.2" r="1.7"/><path d="M9.5 9V6.8h6V9"/>',
};
export function brandSigil(brand: string, cls = "w-4 h-4"): string {
  return svg(SIGILS[brand] ?? CONTROLS["swatch-book"], cls);
}

// Camera body glyphs (moved from main.ts in P2 — one asset module).
const GLYPHS: Record<string, string> = {
  rangefinder: '<rect x="2" y="7" width="20" height="11"/><path d="M4.5 7V5.2h5V7"/><circle cx="10.5" cy="12.5" r="3.1"/><rect x="16.8" y="9.2" width="3.4" height="2.3"/><circle cx="18.6" cy="15.4" r="0.9" fill="currentColor" stroke="none"/>',
  slr: '<path d="M9.2 9L11 5.4h2L14.8 9"/><rect x="2" y="9" width="20" height="9.5"/><circle cx="12" cy="13.8" r="3.3"/><circle cx="5.2" cy="12" r="0.9" fill="currentColor" stroke="none"/>',
  compact: '<rect x="3" y="8" width="18" height="11"/><circle cx="12" cy="13.5" r="2.9"/><rect x="16.8" y="10" width="2.7" height="1.8"/><rect x="4.8" y="10" width="3" height="1.8"/>',
  instant: '<rect x="5" y="2.5" width="14" height="17"/><circle cx="12" cy="8.6" r="2.6"/><rect x="14.8" y="5" width="2.4" height="1.8"/><path d="M8 13.4h8"/><rect x="8.6" y="15" width="6.8" height="3"/>',
  cine: '<rect x="2" y="9.5" width="13.5" height="8.5"/><circle cx="6.4" cy="5.2" r="2.3"/><circle cx="12.4" cy="5.2" r="2.3"/><path d="M15.5 11.8l5.5-2.1v8.1l-5.5-2.1"/>',
  halfframe: '<rect x="2.5" y="8" width="19" height="11"/><circle cx="9" cy="13.5" r="2.3"/><circle cx="15.5" cy="13.5" r="2.3"/><rect x="4.6" y="10" width="2.6" height="1.7"/>',
};
export function glyphSvg(kind: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" class="w-full h-full" aria-hidden="true">${GLYPHS[kind] ?? GLYPHS.compact}</svg>`;
}
