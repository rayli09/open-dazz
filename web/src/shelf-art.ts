// Shelf art — a curated asset per featured camera, drawn as flat
// product illustration (the Dazz lesson: a camera is represented by
// a polished image of the camera, not a filtered thumbnail).
//
// Polish system (one consistent studio for every card):
// - Key light from the top-left, rim from the right: every renderer
//   lays a top-edge highlight, a bottom occlusion shade, and a
//   right rim line over its shapes, in that order.
// - Depth: the stage is a wall + floor with a horizon glow, a
//   two-tier cast shadow (wide soft + tight contact), and an edge
//   vignette — the subject sits IN a space, not on a sticker.
// - Materials are textures, not flat fills: feTurbulence grain
//   (matte plastic / leatherette / paper) and anisotropic brushed
//   metal overlays, clipped to each part. Lens glass gets layered
//   radial glass + crescent highlights; openings get inner shadow.
// Parametric: backdrop + one of four renderers (body / box /
// canister / handycam) in the film's own packaging colors.

export interface ArtSpec {
  kind: "body" | "box" | "canister" | "handycam";
  backdrop: [string, string];
  glow: string;
  base: string;      // body metal or package face
  top: string;       // plate / flap / cap
  band: string;      // label band
  accent: string;
  label?: string;    // package text (box / canister)
  sub?: string;
  dark?: boolean;    // dark body variant
  rainbow?: boolean; // instant camera stripe
  cassette?: boolean; // handycam cassette window with reels
}

export const SHELF_ART: Record<string, ArtSpec> = {
  "fuji/official/classic-chrome": { kind: "body", backdrop: ["#5b6b7a", "#2c343c"], glow: "#b8c4cc", base: "#c9c9c9", top: "#dedede", band: "#3a3f45", accent: "#b8c4cc" },
  "fuji/official/velvia": { kind: "body", dark: true, backdrop: ["#3f7a3a", "#14401f"], glow: "#ffd94a", base: "#2b2b2b", top: "#3a3a3a", band: "#101010", accent: "#ffd94a" },
  "fuji/official/classic-neg": { kind: "body", backdrop: ["#7a5c3e", "#3a2a1c"], glow: "#e0b98a", base: "#c9c9c9", top: "#dedede", band: "#4a3826", accent: "#e0b98a" },
  "fuji/official/astia": { kind: "body", backdrop: ["#c9a189", "#6e4a38"], glow: "#ffd9b0", base: "#c9c9c9", top: "#dedede", band: "#5a4030", accent: "#ffd9b0" },
  "fuji/official/provia": { kind: "body", dark: true, backdrop: ["#4a6a8a", "#1e2f42"], glow: "#9fc2e8", base: "#2b2b2b", top: "#3a3a3a", band: "#101010", accent: "#9fc2e8" },
  "fuji/official/eterna": { kind: "body", dark: true, backdrop: ["#3d5a5a", "#1c2422"], glow: "#d9905f", base: "#2b2b2b", top: "#3a3a3a", band: "#101010", accent: "#d9905f" },
  "fuji/community/fujifilm-acros": { kind: "body", dark: true, backdrop: ["#5a5a5a", "#171717"], glow: "#ffffff", base: "#2b2b2b", top: "#3a3a3a", band: "#101010", accent: "#ffffff" },
  "kodak/community/kodak-portra-400": { kind: "box", backdrop: ["#7fa8a0", "#2e4a44"], glow: "#efe6d0", base: "#efe6d0", top: "#e0d2ae", band: "#3d7a78", accent: "#3d7a78", label: "PORTRA", sub: "400" },
  "kodak/community/kodak-ektar-100": { kind: "box", backdrop: ["#8a3038", "#33161c"], glow: "#e86a5a", base: "#c1272d", top: "#a01e24", band: "#1d4e89", accent: "#ffffff", label: "EKTAR", sub: "100" },
  "kodak/community/kodachrome-64": { kind: "box", backdrop: ["#a03a2e", "#401612"], glow: "#ffc72c", base: "#d22630", top: "#b01c26", band: "#ffc72c", accent: "#ffffff", label: "Kodachrome", sub: "64" },
  "kodak/community/kodak-gold-200": { kind: "box", backdrop: ["#8a6a34", "#3a2a12"], glow: "#ffd97a", base: "#d9a441", top: "#c08f33", band: "#b3312a", accent: "#ffffff", label: "GOLD", sub: "200" },
  "kodak/community/kodak-tri-minus-x-400": { kind: "canister", backdrop: ["#4a4a42", "#17170f"], glow: "#f2c230", base: "#1c1c1c", top: "#cfcfcf", band: "#f2c230", accent: "#f2c230", label: "TRI-X", sub: "400 TX" },
  "ilford/community/ilford-hp5-plus": { kind: "box", backdrop: ["#5f7263", "#22301f"], glow: "#e8e8e6", base: "#e8e8e6", top: "#d5d5d2", band: "#232323", accent: "#2e7d4f", label: "HP5", sub: "PLUS 400" },
  "cinestill/community/cinestill-800t": { kind: "canister", backdrop: ["#1a2440", "#05070f"], glow: "#ff7a1a", base: "#1c2f5a", top: "#cfcfcf", band: "#0d1830", accent: "#ff7a1a", label: "800T", sub: "CineStill" },
  "polaroid/community/polaroid-sx-minus-70": { kind: "body", backdrop: ["#7a7f8a", "#33363c"], glow: "#f2f2f2", base: "#e9e6df", top: "#f4f1ea", band: "#d8d4c9", accent: "#e84a3a", rainbow: true },
  "agfa/community/agfa-vista-200": { kind: "box", backdrop: ["#5a6a8a", "#232c3e"], glow: "#e86a5a", base: "#d22630", top: "#b01c26", band: "#1d4e89", accent: "#ffffff", label: "VISTA", sub: "200" },
  "camcorder/cx405": { kind: "handycam", dark: true, backdrop: ["#46525e", "#1b2129"], glow: "#9fc2e8", base: "#23262b", top: "#34373d", band: "#14161a", accent: "#e5484d", label: "CX405", sub: "HANDYCAM" },
  "camcorder/vhs": { kind: "handycam", dark: true, cassette: true, backdrop: ["#4a3436", "#1c1113"], glow: "#ffb37a", base: "#1b1b1e", top: "#2a2a2e", band: "#101012", accent: "#ff7a1a", label: "VHS-C", sub: "COMPACT" },
};

let uid = 0;

function stage(a: ArtSpec, inner: string): string {
  const i = ++uid;
  return `<svg viewBox="0 0 320 200" class="block w-full h-auto" aria-hidden="true">
  <defs>
    <linearGradient id="bg${i}" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${a.backdrop[0]}"/><stop offset="0.72" stop-color="${a.backdrop[1]}"/><stop offset="1" stop-color="${a.backdrop[1]}"/>
    </linearGradient>
    <radialGradient id="gl${i}">
      <stop offset="0" stop-color="${a.glow}" stop-opacity="0.55"/><stop offset="1" stop-color="${a.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mt${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${a.top}"/><stop offset="0.55" stop-color="${a.base}"/><stop offset="1" stop-color="${a.base}"/>
    </linearGradient>
    <radialGradient id="ls${i}" cx="0.35" cy="0.35" r="0.95">
      <stop offset="0" stop-color="#b9ccd8"/><stop offset="0.45" stop-color="#33465a"/><stop offset="1" stop-color="#0a0f14"/>
    </radialGradient>
    <pattern id="lt${i}" width="4" height="4" patternUnits="userSpaceOnUse">
      <circle cx="1.3" cy="1.3" r="0.85" fill="rgba(0,0,0,0.22)"/>
      <circle cx="3.3" cy="3.3" r="0.85" fill="rgba(255,255,255,0.05)"/>
    </pattern>
    <linearGradient id="pl${i}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${a.base}"/><stop offset="0.5" stop-color="${a.top}"/><stop offset="1" stop-color="${a.base}"/>
    </linearGradient>
    <linearGradient id="shd${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.30"/>
    </linearGradient>
    <linearGradient id="shn${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.02"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="win${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.42"/><stop offset="0.35" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="vig${i}" cx="0.5" cy="0.44" r="0.85">
      <stop offset="0.62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.20"/>
    </radialGradient>
    <radialGradient id="dial${i}" cx="0.35" cy="0.3" r="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/>
    </radialGradient>
    <filter id="soft${i}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.5"/></filter>
    <filter id="soft2${i}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="grk${i}" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0.9 0.9 0 -0.55"/>
    </filter>
    <filter id="grw${i}" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0.9 0.9 0 -0.55"/>
    </filter>
    <filter id="brs${i}" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.004 0.55" numOctaves="2" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0.9 0.9 0 -0.55"/>
    </filter>
  </defs>
  <rect width="320" height="200" fill="url(#bg${i})"/>
  <circle cx="160" cy="88" r="102" fill="url(#gl${i})"/>
  <rect x="0" y="158" width="320" height="42" fill="#000" opacity="0.16"/>
  <rect x="0" y="156" width="320" height="3" fill="${a.glow}" opacity="0.10" filter="url(#soft${i})"/>
  <ellipse cx="160" cy="173" rx="104" ry="10" fill="#000" opacity="0.42" filter="url(#soft2${i})"/>
  <ellipse cx="160" cy="171" rx="72" ry="6" fill="#000" opacity="0.45" filter="url(#soft${i})"/>
  ${inner.replaceAll("{i}", String(i))}
  <rect width="320" height="200" filter="url(#grk${i})" opacity="0.05"/>
  <rect width="320" height="200" fill="url(#vig${i})"/>
</svg>`;
}

// Lighting overlays for a clipped part: bottom occlusion + diagonal
// sheen. The caller supplies the clip id (defined in its own group).
const shade = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#shd{i})"/>`;
const sheen = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#shn{i})"/>`;

function body(a: ArtSpec): string {
  const inkLine = a.dark || a.base === "#e9e6df" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.25)";
  const engrave = a.dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";
  let ticks = "";
  for (let k = 0; k < 12; k++) {
    const t = (k * 30 * Math.PI) / 180;
    const x1 = 232 + 12.5 * Math.cos(t), y1 = 60 + 12.5 * Math.sin(t);
    const x2 = 232 + 15 * Math.cos(t), y2 = 60 + 15 * Math.sin(t);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${engrave}" stroke-width="0.8"/>`;
  }
  const aps = ["1.4", "2", "2.8", "4", "5.6", "8", "11", "16"];
  let apText = "";
  aps.forEach((v, k) => {
    const t = ((-150 + k * 43) * Math.PI) / 180;
    const x = 160 + 30.5 * Math.cos(t), y = 118 + 30.5 * Math.sin(t);
    apText += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-size="4.6" font-weight="600" fill="#c9ced4" transform="rotate(${-150 + k * 43 + 90} ${x.toFixed(1)} ${y.toFixed(1)})">${v}</text>`;
  });
  let knurl = "";
  for (let k = 0; k < 40; k++) {
    const t = (k * 9 * Math.PI) / 180;
    const x = 160 + 25.8 * Math.cos(t), y = 118 + 25.8 * Math.sin(t);
    knurl += `<rect x="${(x - 1).toFixed(1)}" y="${(y - 2.4).toFixed(1)}" width="2" height="4.8" rx="0.8" fill="#33373d" transform="rotate(${k * 9 + 90} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  const stripe = a.rainbow
    ? `<g>${["#e84a3a", "#f28c28", "#e3c53a", "#2fbf71", "#1fa8c9", "#2438d8"].map((c, k) => `<rect x="${112 + k * 13}" y="88" width="13" height="66" fill="${c}"/>`).join("")}</g>`
    : "";
  return stage(a, `
  <rect x="54" y="62" width="212" height="98" rx="10" fill="url(#mt{i})"/>
  <rect x="54" y="88" width="212" height="72" rx="10" fill="url(#lt{i})"/>
  <rect x="54" y="62" width="212" height="24" rx="10" fill="url(#pl{i})"/>
  <rect x="54" y="76" width="212" height="10" fill="url(#pl{i})"/>
  <clipPath id="bd{i}"><rect x="54" y="62" width="212" height="98" rx="10"/></clipPath>
  <g clip-path="url(#bd{i})">
    <rect x="54" y="62" width="212" height="24" filter="url(#brs{i})" opacity="0.30"/>
    <rect x="54" y="88" width="212" height="72" filter="url(#grk{i})" opacity="0.34"/>
    <rect x="54" y="88" width="212" height="72" filter="url(#grw{i})" opacity="0.16"/>
    ${shade(54, 116, 212, 44)}
    ${sheen(54, 62, 212, 98)}
    <rect x="54" y="86" width="212" height="5" fill="#000" opacity="0.20" filter="url(#soft{i})"/>
    <line x1="58" y1="63.2" x2="262" y2="63.2" stroke="rgba(255,255,255,0.38)" stroke-width="1"/>
    <line x1="264.8" y1="68" x2="264.8" y2="152" stroke="rgba(255,255,255,0.15)" stroke-width="1.2"/>
  </g>
  <line x1="58" y1="86.5" x2="262" y2="86.5" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
  <text x="66" y="78" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-style="italic" font-weight="600" font-size="8.5" letter-spacing="0.4" fill="${engrave}">open fuji</text>
  <path d="M252 58 l13 -5 -1.5 7 -11 3 z" fill="${a.top}" stroke="${inkLine}" stroke-width="0.7"/>
  <ellipse cx="232" cy="72" rx="13" ry="4" fill="#000" opacity="0.28" filter="url(#soft{i})"/>
  ${ticks}
  <circle cx="232" cy="60" r="10.5" fill="url(#pl{i})" stroke="${inkLine}"/>
  <circle cx="232" cy="60" r="10.5" fill="url(#dial{i})"/>
  <circle cx="232" cy="60" r="4" fill="none" stroke="${engrave}" stroke-width="0.8"/>
  <text x="232" y="44" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-size="4.8" font-weight="600" fill="${engrave}">125</text>
  <rect x="150" y="57" width="20" height="4.5" rx="1" fill="#14161a"/>
  <rect x="150" y="57" width="20" height="1.6" fill="rgba(255,255,255,0.28)"/>
  <circle cx="90" cy="59" r="6.5" fill="url(#pl{i})" stroke="${inkLine}"/>
  <circle cx="90" cy="59" r="6.5" fill="url(#dial{i})"/>
  <circle cx="90" cy="59" r="3.6" fill="${a.band}"/>
  <rect x="196" y="66" width="15" height="8" rx="1.5" fill="#10151a"/>
  <text x="203.5" y="72.5" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-size="5" font-weight="700" fill="#e8b13a">24</text>
  <rect x="62" y="70" width="42" height="15" rx="3.5" fill="url(#ls{i})" stroke="rgba(255,255,255,0.22)" stroke-width="0.7"/>
  <rect x="68" y="74" width="30" height="8" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.6"/>
  <path d="M64 84 L84 71 L90 71 L70 84 Z" fill="rgba(255,255,255,0.14)"/>
  <rect x="196" y="70" width="19" height="15" rx="3" fill="url(#ls{i})" stroke="rgba(255,255,255,0.22)" stroke-width="0.7"/>
  <circle cx="226" cy="77" r="3" fill="#d43a2a"/>
  <circle cx="226" cy="77" r="5.5" fill="#d43a2a" opacity="0.25"/>
  ${stripe}
  <ellipse cx="160" cy="124" rx="42" ry="40" fill="#000" opacity="0.40" filter="url(#soft{i})"/>
  <circle cx="160" cy="118" r="38.5" fill="#101216"/>
  <circle cx="160" cy="118" r="38.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="0.8"/>
  ${[0, 90, 180, 270].map((deg) => { const t = (deg * Math.PI) / 180; const x = 160 + 36 * Math.cos(t), y = 118 + 36 * Math.sin(t); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" fill="#3c4046"/>`; }).join("")}
  <circle cx="160" cy="118" r="33" fill="#1b1e23"/>
  <circle cx="160" cy="118" r="33" fill="url(#dial{i})"/>
  ${apText}
  <circle cx="160" cy="79.5" r="1.9" fill="${a.accent}"/>
  ${knurl}
  <circle cx="160" cy="118" r="23.5" fill="#0c0e11"/>
  <circle cx="160" cy="118" r="19.5" fill="url(#ls{i})"/>
  <ellipse cx="149" cy="107" rx="9.5" ry="6" fill="#7a4fd0" opacity="0.20" transform="rotate(-24 149 107)"/>
  <ellipse cx="171" cy="129" rx="7.5" ry="4.6" fill="#3fd08a" opacity="0.15" transform="rotate(-24 171 129)"/>
  <path d="M146 100 A21 21 0 0 1 168 102" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2.2" stroke-linecap="round" filter="url(#soft{i})"/>
  <circle cx="152" cy="109.5" r="4.4" fill="rgba(255,255,255,0.85)"/>
  <circle cx="160" cy="118" r="2.6" fill="#05070a"/>
  <path d="M118 138 l7 -3 1.8 5 -7 3 z" fill="${a.top}" stroke="${inkLine}" stroke-width="0.6"/>
  <rect x="238" y="98" width="3" height="34" rx="1.5" fill="rgba(0,0,0,0.28)"/>
  <rect x="244" y="98" width="3" height="34" rx="1.5" fill="rgba(0,0,0,0.28)"/>
  <circle cx="66" cy="150" r="2.2" fill="none" stroke="${engrave}" stroke-width="0.8"/>
  <line x1="64.6" y1="151.4" x2="67.4" y2="148.6" stroke="${engrave}" stroke-width="0.8"/>
  <circle cx="254" cy="150" r="2.2" fill="none" stroke="${engrave}" stroke-width="0.8"/>
  <line x1="252.6" y1="148.6" x2="255.4" y2="151.4" stroke="${engrave}" stroke-width="0.8"/>
  <text x="66" y="156" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-size="5.2" font-weight="600" letter-spacing="0.6" fill="${engrave}">OPEN FUJI</text>
  <rect x="222" y="147" width="30" height="4.6" rx="2.3" fill="${a.accent}" opacity="0.9"/>`);
}

function box(a: ArtSpec): string {
  const textOn = a.base === "#e8e8e6" || a.base === "#efe6d0" ? "#1d1d1b" : "#ffffff";
  const titleCol = a.band === "#ffc72c" ? "#1d1d1b" : textOn;
  return stage(a, `
  <polygon points="96,52 112,32 234,32 218,52" fill="${a.top}"/>
  <polygon points="96,52 112,32 234,32 218,52" fill="url(#shn{i})"/>
  <polygon points="218,52 234,32 234,150 218,170" fill="${a.base}"/>
  <polygon points="218,52 234,32 234,150 218,170" fill="#000" opacity="0.26"/>
  <polygon points="218,52 234,32 234,150 218,170" fill="url(#shd{i})" opacity="0.5"/>
  <rect x="96" y="52" width="122" height="118" rx="4" fill="${a.base}"/>
  <rect x="96" y="52" width="122" height="17" fill="${a.top}"/>
  <rect x="96" y="96" width="122" height="30" fill="${a.band}"/>
  <clipPath id="bx{i}"><rect x="96" y="52" width="122" height="118" rx="4"/></clipPath>
  <g clip-path="url(#bx{i})">
    <rect x="96" y="52" width="122" height="118" filter="url(#grk{i})" opacity="0.20"/>
    <rect x="96" y="96" width="122" height="30" filter="url(#grw{i})" opacity="0.10"/>
    ${shade(96, 128, 122, 42)}
    ${sheen(96, 52, 122, 118)}
    <line x1="97" y1="53.2" x2="217" y2="53.2" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
  </g>
  <line x1="96" y1="69" x2="218" y2="69" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>
  <line x1="218" y1="52" x2="218" y2="170" stroke="rgba(0,0,0,0.30)" stroke-width="1"/>
  <text x="157.6" y="88.6" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="16.5" fill="rgba(0,0,0,0.20)">${a.label ?? ""}</text>
  <text x="157" y="88" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="16.5" fill="${titleCol}">${a.label ?? ""}</text>
  <text x="157" y="117" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="#ffffff">${a.sub ?? ""}</text>
  <circle cx="119" cy="146" r="9" fill="none" stroke="${a.accent}" stroke-width="2.5"/>
  <rect x="137" y="139" width="58" height="5" fill="${a.accent}" opacity="0.85"/>
  <rect x="137" y="150" width="42" height="5" fill="${a.accent}" opacity="0.55"/>`);
}

function canister(a: ArtSpec): string {
  const labelCol = a.band === "#f2c230" ? "#161616" : "#ffffff";
  return stage(a, `
  <ellipse cx="160" cy="50" rx="43" ry="9" fill="${a.top}"/>
  <ellipse cx="160" cy="50" rx="43" ry="9" fill="url(#dial{i})"/>
  <ellipse cx="160" cy="50" rx="30" ry="6" fill="none" stroke="rgba(0,0,0,0.20)" stroke-width="1"/>
  <rect x="117" y="50" width="86" height="112" fill="${a.base}"/>
  <clipPath id="cn{i}"><path d="M117 50 h86 v103 a43 9 0 0 1 -86 0 Z"/></clipPath>
  <g clip-path="url(#cn{i})">
    <rect x="117" y="50" width="86" height="112" fill="url(#pl{i})" opacity="0.55"/>
    <rect x="117" y="50" width="86" height="112" filter="url(#brs{i})" opacity="0.22"/>
    <rect x="117" y="50" width="20" height="112" fill="#000" opacity="0.20"/>
    <rect x="183" y="50" width="20" height="112" fill="#000" opacity="0.24"/>
    <rect x="133" y="50" width="7" height="112" fill="#fff" opacity="0.13"/>
    ${shade(117, 122, 86, 40)}
  </g>
  <rect x="117" y="82" width="86" height="46" fill="${a.band}"/>
  <rect x="117" y="82" width="86" height="46" fill="url(#lt{i})" opacity="0.45"/>
  <rect x="117" y="82" width="86" height="3" fill="#000" opacity="0.16"/>
  <rect x="117" y="125" width="86" height="3" fill="#000" opacity="0.16"/>
  <text x="160.6" y="104.6" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="16" fill="rgba(0,0,0,0.22)">${a.label ?? ""}</text>
  <text x="160" y="104" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="16" fill="${labelCol}">${a.label ?? ""}</text>
  <text x="160" y="120" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="600" font-size="9.5" fill="${labelCol}" opacity="0.85">${a.sub ?? ""}</text>
  <ellipse cx="160" cy="162" rx="43" ry="9" fill="${a.top}"/>
  <ellipse cx="160" cy="162" rx="43" ry="9" fill="url(#shd{i})"/>
  <circle cx="160" cy="146" r="6" fill="none" stroke="${a.accent}" stroke-width="2.5"/>`);
}

function handycam(a: ArtSpec): string {
  const engrave = "rgba(255,255,255,0.62)";
  const faint = "rgba(255,255,255,0.28)";
  const cassette = a.cassette ? `
  <rect x="118" y="88" width="86" height="36" rx="4" fill="rgba(0,0,0,0.42)" stroke="${faint}" stroke-width="1"/>
  <rect x="118" y="88" width="86" height="36" rx="4" fill="url(#win{i})"/>
  <circle cx="140" cy="106" r="9.5" fill="none" stroke="${engrave}" stroke-width="1.6"/>
  <circle cx="182" cy="106" r="9.5" fill="none" stroke="${engrave}" stroke-width="1.6"/>
  <circle cx="140" cy="106" r="9.5" fill="url(#dial{i})"/>
  <circle cx="182" cy="106" r="9.5" fill="url(#dial{i})"/>
  <path d="M140 99v14M133 106h14M182 99v14M175 106h14" stroke="${engrave}" stroke-width="1.3"/>
  <rect x="149" y="103.5" width="24" height="4.5" fill="rgba(0,0,0,0.55)"/>` : `
  <text x="128" y="112" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="15" letter-spacing="1" fill="${engrave}">${a.label ?? ""}</text>
  <text x="128" y="126" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="600" font-size="6.4" letter-spacing="2.2" fill="${faint}">${a.sub ?? ""}</text>`;
  return stage(a, `
  <g transform="rotate(9 240 105)">
    <rect x="240" y="84" width="54" height="42" rx="4" fill="${a.top}"/>
    <rect x="247" y="89.5" width="40" height="31" rx="2" fill="#0d1219"/>
    <rect x="247" y="89.5" width="40" height="31" fill="url(#shn{i})"/>
    <rect x="247" y="89.5" width="40" height="31" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="1.4"/>
  </g>
  <rect x="196" y="63" width="46" height="17" rx="6" fill="${a.top}"/>
  <rect x="196" y="63" width="46" height="17" rx="6" fill="url(#dial{i})"/>
  <rect x="228" y="67" width="10" height="9" rx="2" fill="#0d1219"/>
  <circle cx="98" cy="69" r="9.5" fill="${a.top}"/>
  <circle cx="98" cy="69" r="9.5" fill="url(#dial{i})"/>
  <circle cx="98" cy="69" r="4" fill="${a.band}"/>
  <rect x="58" y="76" width="198" height="66" rx="13" fill="url(#mt{i})"/>
  <clipPath id="hc{i}"><rect x="58" y="76" width="198" height="66" rx="13"/></clipPath>
  <g clip-path="url(#hc{i})">
    <rect x="58" y="76" width="198" height="66" filter="url(#grk{i})" opacity="0.30"/>
    <rect x="58" y="76" width="198" height="66" filter="url(#grw{i})" opacity="0.13"/>
    ${shade(58, 104, 198, 38)}
    ${sheen(58, 76, 198, 66)}
    <line x1="62" y1="77.2" x2="252" y2="77.2" stroke="rgba(255,255,255,0.30)" stroke-width="1"/>
    <line x1="254.8" y1="82" x2="254.8" y2="136" stroke="rgba(255,255,255,0.13)" stroke-width="1.2"/>
  </g>
  <ellipse cx="44" cy="112" rx="22" ry="26" fill="#000" opacity="0.35" filter="url(#soft{i})"/>
  <rect x="30" y="86" width="38" height="46" rx="7" fill="${a.band}"/>
  <rect x="30" y="86" width="38" height="46" rx="7" fill="url(#lt{i})" opacity="0.4"/>
  <rect x="30" y="86" width="38" height="46" rx="7" fill="url(#shd{i})" opacity="0.55"/>
  <ellipse cx="29" cy="109" rx="9.5" ry="21" fill="url(#ls{i})"/>
  <ellipse cx="29" cy="109" rx="4.6" ry="11" fill="#0a1420"/>
  <path d="M23 92 A19 19 0 0 1 33 95" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="24" cy="100" r="2.4" fill="rgba(170,205,240,0.85)"/>
  ${cassette}
  <circle cx="246" cy="90" r="7" fill="${a.accent}" opacity="0.30"/>
  <circle cx="246" cy="90" r="3.1" fill="${a.accent}"/>
  <text x="238" y="103" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="600" font-size="5.4" letter-spacing="1" fill="${a.accent}">REC</text>
  <path d="M88 132h44M88 136.5h30" stroke="${faint}" stroke-width="1.6"/>
  <path d="M216 88v46M221.5 88v46M227 88v46" stroke="rgba(0,0,0,0.3)" stroke-width="2"/>
  <path d="M216 88v46M221.5 88v46" stroke="rgba(255,255,255,0.07)" stroke-width="0.8"/>`);
}

export function shelfArt(id: string): string | null {
  const a = SHELF_ART[id];
  if (!a) return null;
  return a.kind === "body" ? body(a) : a.kind === "box" ? box(a) : a.kind === "handycam" ? handycam(a) : canister(a);
}
