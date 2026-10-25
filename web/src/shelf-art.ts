// Shelf art — a curated asset per featured camera, drawn as flat
// product illustration (the Dazz lesson: a camera is represented by
// a polished image of the camera, not a filtered thumbnail).
// Parametric: backdrop + one of three renderers (body / box /
// canister) in the film's own packaging colors.

export interface ArtSpec {
  kind: "body" | "box" | "canister";
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
};

let uid = 0;

function stage(a: ArtSpec, inner: string): string {
  const i = ++uid;
  return `<svg viewBox="0 0 320 200" class="block w-full h-auto" aria-hidden="true">
  <defs>
    <linearGradient id="bg${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a.backdrop[0]}"/><stop offset="1" stop-color="${a.backdrop[1]}"/>
    </linearGradient>
    <radialGradient id="gl${i}">
      <stop offset="0" stop-color="${a.glow}" stop-opacity="0.5"/><stop offset="1" stop-color="${a.glow}" stop-opacity="0"/>
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
    <filter id="soft${i}" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3.5"/>
    </filter>
  </defs>
  <rect width="320" height="200" fill="url(#bg${i})"/>
  <circle cx="160" cy="90" r="98" fill="url(#gl${i})"/>
  <ellipse cx="160" cy="170" rx="98" ry="9" fill="#000" opacity="0.38" filter="url(#soft{i})"/>
  ${inner.replaceAll("{i}", String(i))}
</svg>`;
}

function body(a: ArtSpec): string {
  const inkLine = a.dark || a.base === "#e9e6df" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.25)";
  const engrave = a.dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";
  // shutter-dial ticks
  let ticks = "";
  for (let k = 0; k < 12; k++) {
    const t = (k * 30 * Math.PI) / 180;
    const x1 = 232 + 12.5 * Math.cos(t), y1 = 60 + 12.5 * Math.sin(t);
    const x2 = 232 + 15 * Math.cos(t), y2 = 60 + 15 * Math.sin(t);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${engrave}" stroke-width="0.8"/>`;
  }
  // aperture engravings around the lens ring
  const aps = ["1.4", "2", "2.8", "4", "5.6", "8", "11", "16"];
  let apText = "";
  aps.forEach((v, k) => {
    const t = ((-150 + k * 43) * Math.PI) / 180;
    const x = 160 + 30.5 * Math.cos(t), y = 118 + 30.5 * Math.sin(t);
    apText += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-size="4.6" font-weight="600" fill="#c9ced4" transform="rotate(${-150 + k * 43 + 90} ${x.toFixed(1)} ${y.toFixed(1)})">${v}</text>`;
  });
  // knurled focus ring
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
  <line x1="58" y1="86.5" x2="262" y2="86.5" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
  <text x="66" y="78" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-style="italic" font-weight="600" font-size="8.5" letter-spacing="0.4" fill="${engrave}">open fuji</text>
  <path d="M252 58 l13 -5 -1.5 7 -11 3 z" fill="${a.top}" stroke="${inkLine}" stroke-width="0.7"/>
  ${ticks}
  <circle cx="232" cy="60" r="10.5" fill="url(#pl{i})" stroke="${inkLine}"/>
  <circle cx="232" cy="60" r="4" fill="none" stroke="${engrave}" stroke-width="0.8"/>
  <text x="232" y="44" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-size="4.8" font-weight="600" fill="${engrave}">125</text>
  <rect x="150" y="57" width="20" height="4.5" rx="1" fill="#14161a"/>
  <rect x="150" y="57" width="20" height="1.6" fill="rgba(255,255,255,0.28)"/>
  <circle cx="90" cy="59" r="6.5" fill="url(#pl{i})" stroke="${inkLine}"/>
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
  <circle cx="160" cy="118" r="38.5" fill="#101216"/>
  <circle cx="160" cy="118" r="38.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="0.8"/>
  ${[0, 90, 180, 270].map((deg) => { const t = (deg * Math.PI) / 180; const x = 160 + 36 * Math.cos(t), y = 118 + 36 * Math.sin(t); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" fill="#3c4046"/>`; }).join("")}
  <circle cx="160" cy="118" r="33" fill="#1b1e23"/>
  ${apText}
  <circle cx="160" cy="79.5" r="1.9" fill="${a.accent}"/>
  ${knurl}
  <circle cx="160" cy="118" r="23.5" fill="#0c0e11"/>
  <circle cx="160" cy="118" r="19.5" fill="url(#ls{i})"/>
  <ellipse cx="149" cy="107" rx="9.5" ry="6" fill="#7a4fd0" opacity="0.20" transform="rotate(-24 149 107)"/>
  <ellipse cx="171" cy="129" rx="7.5" ry="4.6" fill="#3fd08a" opacity="0.15" transform="rotate(-24 171 129)"/>
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
  return stage(a, `
  <path d="M105 44 L226 44 L240 58 L240 168 L105 168 Z" fill="${a.top}"/>
  <rect x="105" y="44" width="121" height="124" rx="5" fill="${a.base}"/>
  <rect x="105" y="44" width="121" height="17" fill="${a.top}"/>
  <rect x="105" y="88" width="121" height="30" fill="${a.band}"/>
  <rect x="105" y="88" width="121" height="30" fill="url(#lt{i})" opacity="0.5"/>
  <text x="165.5" y="80" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="16.5" fill="${a.band === "#ffc72c" ? "#1d1d1b" : textOn}">${a.label ?? ""}</text>
  <text x="165.5" y="109" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="#ffffff">${a.sub ?? ""}</text>
  <circle cx="128" cy="140" r="9" fill="none" stroke="${a.accent}" stroke-width="2.5"/>
  <rect x="146" y="133" width="58" height="5" fill="${a.accent}" opacity="0.85"/>
  <rect x="146" y="144" width="42" height="5" fill="${a.accent}" opacity="0.55"/>`);
}

function canister(a: ArtSpec): string {
  const labelCol = a.band === "#f2c230" ? "#161616" : "#ffffff";
  return stage(a, `
  <ellipse cx="160" cy="50" rx="43" ry="9" fill="${a.top}"/>
  <rect x="117" y="50" width="86" height="112" fill="${a.base}"/>
  <rect x="117" y="50" width="86" height="112" fill="url(#lt{i})" opacity="0.6"/>
  <ellipse cx="160" cy="162" rx="43" ry="9" fill="${a.top}"/>
  <rect x="117" y="82" width="86" height="46" fill="${a.band}"/>
  <text x="160" y="104" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="700" font-size="16" fill="${labelCol}">${a.label ?? ""}</text>
  <text x="160" y="120" text-anchor="middle" font-family="Instrument Sans, Helvetica, Arial, sans-serif" font-weight="600" font-size="9.5" fill="${labelCol}" opacity="0.85">${a.sub ?? ""}</text>
  <rect x="117" y="50" width="13" height="112" fill="rgba(255,255,255,0.13)"/>
  <circle cx="160" cy="146" r="6" fill="none" stroke="${a.accent}" stroke-width="2.5"/>`);
}

export function shelfArt(id: string): string | null {
  const a = SHELF_ART[id];
  if (!a) return null;
  return a.kind === "body" ? body(a) : a.kind === "box" ? box(a) : canister(a);
}
