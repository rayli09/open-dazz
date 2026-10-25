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
    <pattern id="lt${i}" width="5" height="5" patternUnits="userSpaceOnUse">
      <circle cx="1.6" cy="1.6" r="1.1" fill="rgba(0,0,0,0.20)"/>
    </pattern>
  </defs>
  <rect width="320" height="200" fill="url(#bg${i})"/>
  <circle cx="160" cy="90" r="98" fill="url(#gl${i})"/>
  <ellipse cx="160" cy="170" rx="98" ry="9" fill="#000" opacity="0.38"/>
  ${inner.replaceAll("{i}", String(i))}
</svg>`;
}

function body(a: ArtSpec): string {
  const inkLine = a.dark || a.base === "#e9e6df" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.25)";
  const stripe = a.rainbow
    ? `<g>${["#e84a3a", "#f28c28", "#e3c53a", "#2fbf71", "#1fa8c9", "#2438d8"].map((c, k) => `<rect x="${118 + k * 14}" y="86" width="14" height="72" fill="${c}"/>`).join("")}</g>`
    : "";
  return stage(a, `
  <rect x="58" y="64" width="204" height="94" rx="10" fill="url(#mt{i})"/>
  <rect x="58" y="88" width="204" height="70" rx="10" fill="url(#lt{i})"/>
  <rect x="58" y="64" width="204" height="22" rx="10" fill="${a.top}"/>
  <rect x="58" y="76" width="204" height="10" fill="${a.top}"/>
  <circle cx="84" cy="62" r="9" fill="${a.top}" stroke="${inkLine}"/>
  <circle cx="236" cy="62" r="9" fill="${a.top}" stroke="${inkLine}"/>
  <circle cx="212" cy="60" r="4.5" fill="${a.accent}"/>
  <rect x="196" y="70" width="36" height="13" rx="3" fill="#10151a"/>
  <rect x="200" y="73" width="12" height="3" fill="rgba(255,255,255,0.35)"/>
  <rect x="70" y="70" width="17" height="13" rx="3" fill="#10151a"/>
  ${stripe}
  <circle cx="160" cy="116" r="35" fill="#14161a"/>
  <circle cx="160" cy="116" r="28" fill="none" stroke="#c8c8c8" stroke-width="2.5" opacity="0.85"/>
  <circle cx="160" cy="116" r="21" fill="url(#ls{i})"/>
  <circle cx="152" cy="108" r="5.5" fill="rgba(255,255,255,0.75)"/>
  <circle cx="160" cy="116" r="2.6" fill="#06090c"/>
  <rect x="66" y="146" width="30" height="5" rx="2.5" fill="${a.accent}" opacity="0.9"/>`);
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
