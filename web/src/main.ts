// open-dazz Photo Workshop — a film-development bench in the browser.
// Engine: opendazz-core (Rust) compiled to WebAssembly. No uploads:
// every photograph is developed locally on this machine.
import { store, modeAtom, type Mode } from "./state";
import { icon, brandSigil, glyphSvg } from "./icons";
import { shelfArt } from "./shelf-art";
import { recipeForMedia } from "./recipe-for-media";
import { DEFAULT_PHOTO, presetForRecipe, presetsForMedia, selectionForMedia, selectionForMode, type PresetMedia, type ArtKey } from "./simple-presets";
import { artKeyForRecipe, cameraAsset, useArtworkFallback } from "./camera-art";

// The WASM engine loads lazily in the background so the shell, cabinet
// and photo paint immediately; develops queue until it lands.
import { getFFmpeg, probeVideo, posterFrame, developVideo, resetFFmpeg, VIDEO_MAX_SECONDS } from "./video.js";
import { probeWebCodecs, developWebCodecs, WC_MAX_SECONDS } from "./video-webcodecs.js";
import type { WcProbe } from "./video-webcodecs.js";
import type { VideoProbe } from "./video.js";

type Engine = typeof import("./pkg/opendazz_wasm.js");
let engine: Engine | null = null;
const engineP: Promise<Engine> = import("./pkg/opendazz_wasm.js");
engineP.catch((e) => showError(`engine failed to load (${(e as Error)?.message ?? e})`));
engineP.then((m) => {
  engine = m;
  progress(90);
  applyNow();
});

import "./style.css";

interface LookEntry {
  id: string; name: string; brand: string; tier: string;
  recipe: string; baseLut: string | null; hasLut: boolean;
  baseFilm: string | null; creator: string | null; license: string | null;
}
interface Catalog { brands: Record<string, { tiers: Record<string, LookEntry[]>; total: number }>; totalLooks: number }

const MAX_DIM = 1920;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

let catalog: Catalog;
let current: LookEntry | null = null;

// --- Video cameras: signal-chain simulations, not LUT looks. They
// live in a synthetic "camcorder" brand injected into the catalog
// at boot; applyNow routes them to their own engine stages. ---
const VIDEO_LOOKS: LookEntry[] = [
  { id: "camcorder/cx405", name: "Sony CX405", brand: "camcorder", tier: "video", recipe: "", baseLut: null, hasLut: false, baseFilm: "HDR-CX405", creator: "open-dazz", license: null },
  { id: "camcorder/vhs", name: "VHS-C", brand: "camcorder", tier: "video", recipe: "", baseLut: null, hasLut: false, baseFilm: "VHS tape", creator: "ntsc-rs", license: null },
];
const VIDEO_META: Record<string, { meta: string; note: string }> = {
  "camcorder/cx405": {
    meta: "camcorder · HDR-CX405 · open-dazz",
    note: "A consumer camcorder, simulated as a signal chain: soft luma, smeared chroma, hunting auto-exposure, milky night blacks, sensor noise. The look is the hardware — no develop sliders.",
  },
  "camcorder/vhs": {
    meta: "camcorder · VHS tape · ntsc-rs",
    note: "NTSC composite + VHS tape simulation: chroma bleed, head-switching, tracking noise, tape smear. The look is the hardware — no develop sliders.",
  },
};
let simpleMedia: PresetMedia = "photo";
const lastSimpleSelection: Record<PresetMedia, string> = {
  photo: DEFAULT_PHOTO.recipeId,
  video: selectionForMedia("video").recipeId,
};
let developFx = false;
let selectionVersion = 0;
let mediaVersion = 0;

// --- P0: hand-drawn camera body glyphs (squared, stroke style) ---
function glyphFor(l: LookEntry): string {
  const s = `${l.id} ${l.name}`.toLowerCase();
  let kind = "compact";
  if (l.brand === "camcorder") kind = "cine";
  else if (/video|cine|vision|movie/.test(s)) kind = "cine";
  else if (/instant|polaroid|sx-70|sx70/.test(s)) kind = "instant";
  else if (/half/.test(s)) kind = "halfframe";
  else if (l.brand === "fuji") kind = "rangefinder";
  else if (l.brand === "polaroid") kind = "instant";
  else if (l.brand === "cinestill" || l.brand === "orwo") kind = "cine";
  else if (["kodak", "ilford", "kentmere", "foma", "bergger", "adox", "rollei"].includes(l.brand)) kind = "slr";
  return glyphSvg(kind);
}
function updateCounter() {
  const el = document.querySelector("#film-counter");
  if (!el) return;
  const entries = presetsForMedia(simpleMedia);
  const i = entries.findIndex(p => p.recipeId === current?.id);
  el.textContent = `${simpleMedia === "photo" ? "PHOTO" : "VIDEO"} ${i < 0 ? "—" : i + 1} / ${entries.length}`;
}
function syncShelfUI() {
  document.querySelectorAll<HTMLButtonElement>("[data-simple-media]").forEach(button => {
    const active = button.dataset.simpleMedia === simpleMedia;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("is-active", active);
  });
  $("#simple-hint").textContent = simpleMedia === "photo"
    ? "Fuji first. Eleven looks for everyday photos."
    : "Camera effects. Preview a photo or develop a clip.";
  updateCounter();
}
function fitStage() {
  const wrap = document.querySelector<HTMLElement>("#stage-wrap");
  const pw = document.querySelector<HTMLElement>("#printwrap");
  if (!wrap || !pw || !imgW || !imgH) return;
  const r = wrap.getBoundingClientRect();
  const availW = Math.max(50, r.width - 32), availH = Math.max(50, r.height - 56);
  const scale = Math.min(availW / imgW, availH / imgH);
  pw.style.width = `${Math.floor(imgW * scale)}px`;
  pw.style.height = `${Math.floor(imgH * scale)}px`;
}
let activeBrand: string | null = null;
type TypeFilter = "all" | "official" | "bw" | "video" | "color";
let activeType: TypeFilter = "all";

function lookType(l: LookEntry): "bw" | "video" | "color" {
  if (l.brand === "camcorder") return "video";
  if (/cine|vision|movie|video/i.test(`${l.id} ${l.name}`)) return "video";
  const s = `${l.name} ${l.baseFilm ?? ""}`;
  if (
    /acros|monochrome|sepia|b&w|black|tri-?x|hp5|t-?max|delta|neopan|ortho|panatomic|plus-?x|verichrome|fomapan|pancro|bwxx|berlin kino|potsdam|retro|\bbw\b|\bchs\b/i.test(s) ||
    l.brand === "ilford" || l.brand === "kentmere"
  ) return "bw";
  return "color";
}
function lookMatches(l: LookEntry, f: string): boolean {
  if (activeBrand && l.brand !== activeBrand) return false;
  if (activeType === "official" && l.tier !== "official") return false;
  if (activeType !== "all" && activeType !== "official" && lookType(l) !== activeType) return false;
  return !f || l.name.toLowerCase().includes(f);
}
const thumbUrl = (id: string) => `/thumbs/${id.replaceAll("/", "__")}.webp`;
let recipe: Record<string, any> | null = null;
const cubeCache = new Map<string, Promise<string>>();
let origPixels: Uint8ClampedArray | null = null;
let imgW = 0, imgH = 0;
let split = 50;
let applyTimer: ReturnType<typeof setTimeout> | undefined;

function layout() {
  $("#app").innerHTML = `
  <div id="topbar" class="fixed top-0 left-0 h-[2px] bg-accent z-50 transition-all duration-500" style="width:12%"></div>
  <header class="shrink-0 border-b-2 border-ink">
    <div class="flex items-center justify-between px-4 py-3 md:px-6">
      <div class="flex items-center gap-3">
        <img src="/logo.svg" alt="" class="w-9 h-9" />
        <span class="font-display text-[20px] font-bold tracking-tight">OpenDazz</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="seg flex border border-ink font-mono text-[11px]" role="group" aria-label="Mode">
          <button id="mode-simple" aria-pressed="true" class="px-2.5 py-2 tracking-wide">SIMPLE</button>
          <button id="mode-pro" aria-pressed="false" class="px-2.5 py-2 tracking-wide border-l border-ink">PRO</button>
        </div>
        <a href="https://github.com/rayli09/open-dazz" target="_blank" rel="noreferrer"
           class="flex items-center gap-1 font-mono text-[11px] border border-rule px-2.5 py-2 hover:bg-paper2 transition-colors">GitHub ${icon("arrow-up-right", "w-3.5 h-3.5")}</a>
      </div>
    </div>
  </header>

  <main class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[292px_minmax(0,1fr)_300px] overflow-y-auto lg:overflow-hidden">
    <!-- THE CABINET -->
    <aside class="cabinet-aside order-2 lg:order-1 border-b lg:border-b-0 lg:border-r border-rule flex flex-col min-h-0">
      <div class="px-3 pt-3 pb-1">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-[18px] h-[18px] bg-ink text-paper font-mono text-[10px] flex items-center justify-center shrink-0">1</span>
          <span class="font-mono text-[10px] tracking-[0.18em] text-ink2">PICK A LOOK</span>
        </div>
        <div id="chips" class="mb-2"></div>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-ink2 pointer-events-none">${icon("search", "w-4 h-4 block")}</span>
          <input id="search" type="text" placeholder="Search looks…"
            class="w-full bg-mat border border-rule pl-9 pr-3 py-2 font-mono text-[16px] lg:text-[12px] placeholder:text-ink2/80 focus:outline-none focus:border-ink" />
        </div>
      </div>
      <div id="cabinet" class="cabinet-scroll overflow-y-auto px-3 pb-4 flex-1 min-h-0 max-h-[55vh] lg:max-h-none">
        ${Array.from({ length: 8 }, () => `<div class="mt-3"><div class="skel h-[92px] w-full"></div><div class="skel h-3 w-2/3 mt-2"></div></div>`).join("")}
      </div>
    </aside>

    <!-- THE SHELF RAIL (simple mode: left on desktop, under the photo on mobile) -->
    <aside class="shelf-rail order-2 lg:order-1 flex-col min-h-0 border-t lg:border-t-0 lg:border-r border-rule">
      <div class="tex-filmleader shrink-0 border-b border-rule" aria-hidden="true"></div>
      <div class="px-3 pt-3 pb-2 flex flex-col gap-2 shrink-0">
        <div class="flex items-center gap-2">
          <div class="seg simple-media-controls flex border border-rule" role="group" aria-label="Look collection">
            <button data-simple-media="photo" class="is-active" aria-pressed="true">PHOTOS</button>
            <button data-simple-media="video" aria-pressed="false">VIDEO</button>
          </div>
          <span id="film-counter" class="ml-auto font-mono text-[10px] bg-ink text-accentink px-1.5 py-0.5"></span>
        </div>
        <p id="simple-hint" class="simple-hint">Fuji first. Eleven looks for everyday photos.</p>
        <button id="simple-open-pro" class="simple-pro-link">All looks in Pro ${icon("arrow-up-right", "w-3 h-3")}</button>
      </div>
      <div id="strip" class="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto cabinet-scroll px-3 pb-3 lg:flex-1 lg:min-h-0"></div>
    </aside>

    <!-- THE BENCH -->
    <section class="order-1 lg:order-2 bench-grid relative flex flex-col min-h-0">
      <div class="flex flex-wrap items-center gap-2 px-4 pt-4">
        <button id="btn-load" class="flex items-center gap-2 font-mono text-[12px] bg-ink text-paper px-4 py-2.5 hover:bg-stamp transition-colors">${icon("upload", "w-[18px] h-[18px]")}Photo / Video</button>
        <button id="btn-s1" class="flex items-center gap-2 font-mono text-[12px] border border-rule bg-mat px-4 py-2.5 hover:bg-paper2 transition-colors">${icon("user", "w-[18px] h-[18px]")}Sample I</button>
        <button id="btn-s2" class="flex items-center gap-2 font-mono text-[12px] border border-rule bg-mat px-4 py-2.5 hover:bg-paper2 transition-colors">${icon("mountain", "w-[18px] h-[18px]")}Sample II</button>
        <span class="font-mono text-[10px] text-ink2 ml-auto" id="split-label"></span>
        <input id="file" type="file" accept="image/*,video/*,.heic,.heif,.avif,.tif,.tiff,.mov,.m4v" class="hidden" />
      </div>
      <div id="stage-wrap" class="flex-1 min-h-0 flex items-center justify-center p-4 md:p-6 overflow-hidden">
        <figure id="stage" class="relative bg-mat p-3 md:p-4 border border-ink/60 stage-shadow max-w-full select-none touch-none inline-flex flex-col">
          <div id="printwrap" class="relative overflow-hidden bg-paper2">
            <canvas id="after" class="absolute inset-0 w-full h-full block"></canvas>
            <div id="stage-load" class="absolute inset-0 bg-mat/80 flex flex-col items-center justify-center gap-3">
              <img src="/logo.svg" alt="" class="w-12 h-12 skel-pulse" />
              <div class="font-mono text-[10px] tracking-[0.2em] text-ink2">LOADING THE BENCH…</div>
            </div>
            <canvas id="before" class="block w-full h-auto absolute inset-0"></canvas>
            <span class="vf absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-ink pointer-events-none z-10"></span>
            <span class="vf absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-ink pointer-events-none z-10"></span>
            <span class="vf absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-ink pointer-events-none z-10"></span>
            <span class="vf absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-ink pointer-events-none z-10"></span>
            <div id="divider" class="absolute top-0 bottom-0 w-[2px] bg-ink pointer-events-none">
              <div class="absolute top-1/2 -translate-y-1/2 -left-[13px] w-[28px] h-[28px] rounded-full bg-mat border border-ink flex items-center justify-center">${icon("compare", "w-4 h-4")}</div>
            </div>
          </div>
          <figcaption class="w-full shrink-0 flex flex-wrap justify-between gap-2 pt-3 font-mono text-[10px] tracking-[0.16em] text-ink2">
            <span class="flex items-center gap-2"><span id="spin" class="hidden w-[13px] h-[13px] border-2 border-rule border-t-ink animate-spin shrink-0"></span><span id="cap-file">—</span></span><span id="cap-state"></span>
          </figcaption>
        </figure>
      </div>
      <div class="simple-only items-center justify-end gap-3 mx-4 mb-4 border border-rule bg-mat px-3 py-2.5">
        <button id="btn-video-simple" title="Develop the loaded video with the current look" style="display:none" class="bg-paper text-ink border border-ink px-3 py-2 hover:bg-paper2 transition-colors items-center gap-2 shrink-0">
          ${icon("video", "w-4 h-4")}
          <span data-vlabel class="font-mono text-[10px] tracking-[0.2em]">DEVELOP VIDEO</span>
        </button>
        <button id="btn-export-simple" title="Export the developed photo as a PNG" class="bg-ink text-paper px-3 py-2 hover:bg-stamp transition-colors flex items-center gap-2 shrink-0">
          ${icon("download", "w-4 h-4")}
          <span class="font-mono text-[10px] tracking-[0.2em]">EXPORT</span>
        </button>
      </div>
    </section>

    <!-- THE LEDGER -->
    <aside class="ledger order-3 border-t lg:border-t-0 lg:border-l border-rule px-4 py-4 lg:min-h-0 lg:overflow-y-auto">
      <div class="flex items-center gap-2 mb-2">
        <span class="w-[18px] h-[18px] bg-ink text-paper font-mono text-[10px] flex items-center justify-center shrink-0">3</span>
        ${icon("sliders", "w-4 h-4")}
        <span class="font-mono text-[10px] tracking-[0.18em] text-ink2">ADJUST &amp; EXPORT</span>
      </div>
      <h1 id="led-name" class="font-display text-[22px] leading-tight font-semibold">—</h1>
      <div id="led-meta" class="font-mono text-[10.5px] leading-relaxed tracking-[0.06em] text-ink2 mt-1"></div>
      <div id="led-note" class="text-[12px] leading-relaxed mt-2 text-ink2"></div>
      <div class="border-t border-rule mt-4 pt-3 space-y-3" id="sliders"></div>
      <div class="flex items-center gap-2 mt-3">
        <span class="font-mono text-[10px] tracking-[0.18em] text-ink2">GRAIN</span>
        <button data-gsize="small" class="gsize font-mono text-[11px] border border-ink px-2 py-1">SMALL</button>
        <button data-gsize="large" class="gsize font-mono text-[11px] border border-ink px-2 py-1">LARGE</button>
      </div>
      <button id="btn-export" class="mt-4 w-full bg-ink text-paper font-mono text-[12px] py-3 hover:bg-stamp transition-colors flex items-center justify-center gap-2">${icon("download", "w-4 h-4")}Export PNG</button>
    <button id="btn-video" style="display:none" class="mt-2 w-full bg-paper text-ink border border-ink font-mono text-[12px] py-3 hover:bg-paper2 transition-colors items-center justify-center gap-2">${icon("video", "w-4 h-4")}<span data-vlabel>Develop video (.mp4)</span></button>
    </aside>
  </main>

  <div class="border-t border-rule" aria-hidden="true"></div>
`;
}

function sliderRow(key: string, label: string, min: number, max: number, step: number, val: number, fmt: (v: number) => string) {
  return `<label class="block">
    <span class="flex justify-between font-mono text-[10px] tracking-[0.18em] text-ink2">
      <span>${label}</span><span id="val-${key}" class="text-ink">${fmt(val)}</span></span>
    <input type="range" id="sl-${key}" min="${min}" max="${max}" step="${step}" value="${val}" />
  </label>`;
}

function renderSliders() {
  if (!recipe) return;
  if (current?.brand === "camcorder") {
    $("#sliders").innerHTML = `<div class="font-mono text-[10.5px] leading-relaxed text-ink2 px-1 py-2">Signal-chain camera — the look is the hardware; there are no develop sliders.</div>`;
    return;
  }
  const R: Record<string, any> = recipe;
  const g = R.grain ?? { amount: 0, size: "small" };
  const wb = R.whiteBalance ?? { tempShift: 0, tintShift: 0 };
  $("#sliders").innerHTML = [
    sliderRow("strength", "STRENGTH", 0, 1.5, 0.01, R.strength ?? 1, (v) => `${Math.round(v * 100)}%`),
    sliderRow("grain", "GRAIN", 0, 0.9, 0.01, g.amount ?? 0, (v) => v.toFixed(2)),
    sliderRow("halation", "HALATION", 0, 1, 0.01, R.halation ?? 0, (v) => v.toFixed(2)),
    sliderRow("temp", "TEMP", -1, 1, 0.01, wb.tempShift ?? 0, (v) => (v >= 0 ? "+" : "") + v.toFixed(2)),
    sliderRow("tint", "TINT", -1, 1, 0.01, wb.tintShift ?? 0, (v) => (v >= 0 ? "+" : "") + v.toFixed(2)),
  ].join("");
  const on = (key: string, fn: (v: number) => void) => {
    $<HTMLInputElement>(`#sl-${key}`).addEventListener("input", (e) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      fn(v); scheduleApply();
    });
  };
  on("strength", (v) => { R.strength = v; $("#val-strength").textContent = `${Math.round(v * 100)}%`; });
  on("grain", (v) => { R.grain = { ...(R.grain ?? {}), amount: v, size: R.grain?.size ?? "small" }; $("#val-grain").textContent = v.toFixed(2); });
  on("halation", (v) => { R.halation = v; $("#val-halation").textContent = v.toFixed(2); });
  on("temp", (v) => { R.whiteBalance = { ...(R.whiteBalance ?? {}), tempShift: v }; $("#val-temp").textContent = (v >= 0 ? "+" : "") + v.toFixed(2); });
  on("tint", (v) => { R.whiteBalance = { ...(R.whiteBalance ?? {}), tintShift: v }; $("#val-tint").textContent = (v >= 0 ? "+" : "") + v.toFixed(2); });
  document.querySelectorAll<HTMLButtonElement>(".gsize").forEach((b) => {
    const active = (R.grain?.size ?? "small") === b.dataset.gsize;
    b.classList.toggle("bg-ink", active); b.classList.toggle("text-paper", active);
    b.onclick = () => { R.grain = { ...(R.grain ?? { amount: 0 }), size: b.dataset.gsize }; renderSliders(); scheduleApply(); };
  });
}

const TYPE_CHIPS: { key: TypeFilter; icon: string; label: string }[] = [
  { key: "all", icon: "layers", label: "All" },
  { key: "official", icon: "badge-check", label: "Official" },
  { key: "color", icon: "palette", label: "Color" },
  { key: "bw", icon: "contrast", label: "B&W" },
  { key: "video", icon: "video", label: "Video" },
];

function closeDDs() {
  document.querySelectorAll(".dd-panel").forEach((p) => p.classList.remove("open"));
  document.querySelectorAll(".dd").forEach((d) => d.classList.remove("open"));
}
function toggleDD(btn?: HTMLElement) {
  const dd = btn?.closest(".dd") as HTMLElement | null;
  const willOpen = !dd?.classList.contains("open");
  closeDDs();
  if (!willOpen || !dd) return;
  dd.classList.add("open");
  dd.querySelector(".dd-panel")?.classList.add("open");
}

function renderChips() {
  const host = $("#chips");
  if (host) buildChips(host);
}

function buildChips(host: HTMLElement) {
  const brands = Object.keys(catalog.brands).sort((a, b) => (a === "fuji" ? -1 : b === "fuji" ? 1 : a.localeCompare(b)));
  const brandName = (b: string) => (b === "emulsion" ? "Emulsion" : b);
  const type = TYPE_CHIPS.find((t) => t.key === activeType)!;
  const opt = (active: boolean, mark: string, label: string, attrs: string) =>
    `<button ${attrs} class="w-full flex items-center gap-2 px-2.5 py-2 text-[12.5px] text-left capitalize ${active ? "bg-accent text-accentink font-medium" : "hover:bg-paper2"}">
       ${mark}<span class="flex-1">${label}</span>
       ${active ? icon("check", "w-4 h-4 shrink-0") : ""}</button>`;
  host.innerHTML = `<div class="flex gap-2">
    <div class="dd relative flex-1" data-dd="brand">
      <button class="dd-btn w-full flex items-center gap-2 border border-rule bg-mat px-2.5 py-2 font-mono text-[12px] hover:border-ink transition-colors" data-dd-btn="brand">
        ${activeBrand ? brandSigil(activeBrand, "w-4 h-4 shrink-0") : icon("layers", "w-4 h-4 shrink-0")}
        <span class="flex-1 text-left capitalize">${activeBrand ? brandName(activeBrand) : "All brands"}</span>
        ${icon("chevron-down", "dd-chev w-4 h-4 shrink-0")}</button>
      <div class="dd-panel absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-mat border border-ink stage-shadow h-72 overflow-y-auto cabinet-scroll">
        ${opt(activeBrand === null, icon("layers", "w-4 h-4 shrink-0"), "All brands", 'data-brand=""')}
        ${brands.map((b) => opt(activeBrand === b, brandSigil(b, "w-4 h-4 shrink-0"), brandName(b), `data-brand="${b}"`)).join("")}
      </div>
    </div>
    <div class="dd relative flex-1" data-dd="type">
      <button class="dd-btn w-full flex items-center gap-2 border border-rule bg-mat px-2.5 py-2 font-mono text-[12px] hover:border-ink transition-colors" data-dd-btn="type">
        ${icon(type.icon, "w-4 h-4 shrink-0")}
        <span class="flex-1 text-left">${type.label}</span>
        ${icon("chevron-down", "dd-chev w-4 h-4 shrink-0")}</button>
      <div class="dd-panel absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-mat border border-ink stage-shadow h-72 overflow-y-auto cabinet-scroll">
        ${TYPE_CHIPS.map((t) => opt(activeType === t.key, icon(t.icon, "w-4 h-4 shrink-0"), t.label, `data-type="${t.key}"`)).join("")}
      </div>
    </div>
  </div>`;
  host.querySelectorAll<HTMLButtonElement>("[data-dd-btn]").forEach((b) =>
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); toggleDD(b); }));
  host.querySelectorAll<HTMLButtonElement>("[data-brand]").forEach((b) =>
    b.addEventListener("click", () => { activeBrand = b.dataset.brand || null; closeDDs(); renderChips(); renderCabinet(($("#search") as HTMLInputElement).value); }));
  host.querySelectorAll<HTMLButtonElement>("[data-type]").forEach((b) =>
    b.addEventListener("click", () => { activeType = b.dataset.type as TypeFilter; closeDDs(); renderChips(); renderCabinet(($("#search") as HTMLInputElement).value); }));
}

function renderCabinet(filter = "") {
  const host = $("#cabinet");
  const f = filter.trim().toLowerCase();
  const brands = Object.keys(catalog.brands).sort((a, b) => (a === "fuji" ? -1 : b === "fuji" ? 1 : a.localeCompare(b)));
  let html = "";
  for (const brand of brands) {
    if (activeBrand && brand !== activeBrand) continue;
    const data = catalog.brands[brand];
    let groups = "";
    for (const tier of ["official", "community", "video"]) {
      const looks = (data.tiers[tier] ?? []).filter((l) => lookMatches(l, f));
      if (!looks.length) continue;
      let cards = "";
      for (const look of looks) {
        const sel = current?.id === look.id;
        cards += `<button data-look="${look.id}" aria-pressed="${sel}" class="look-card active:scale-[0.98] text-left border ${sel ? "border-ink" : "border-rule"} bg-mat hover:border-ink transition-colors">
          <span class="relative block">
            ${renderArtwork(look.id, presetForRecipe(look.id)?.artKey)}
            ${look.tier === "official" ? `<span class="absolute top-1 left-1 bg-paper/90 p-[3px]">${icon("badge-check", "w-3.5 h-3.5 block")}</span>` : ""}
          </span>
          <span class="block px-2 py-1.5 ${sel ? "bg-accent text-accentink" : ""}">
            <span class="flex items-center gap-1.5">
              <span class="w-4 h-4 shrink-0 text-ink2">${glyphFor(look)}</span>
              <span class="text-[11.5px] leading-tight font-medium truncate">${look.name}</span>
            </span>
          </span>
        </button>`;
      }
      groups += `<div class="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.18em] text-ink2 px-1 pt-3 pb-1.5">
        ${icon(tier === "official" ? "badge-check" : tier === "video" ? "video" : "users", "w-3 h-3")}${tier === "official" ? "Official" : tier === "video" ? "Video" : "Community"}</div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">${cards}</div>`;
    }
    if (groups) html += `<div><div class="flex items-center gap-2 px-1 pt-3">
      ${brandSigil(brand, "w-4 h-4")}
      <span class="font-display font-semibold text-[14px] capitalize flex-1">${brand === "emulsion" ? "Emulsion" : brand}</span>
      </div>${groups}</div>`;
  }
  host.innerHTML = html || `<div class="px-3 py-6 text-center">${icon("search", "w-6 h-6 text-ink2 inline-block")}<div class="font-mono text-[11px] text-ink2 mt-2">No matches.</div></div>`;
  host.querySelectorAll<HTMLButtonElement>(".look-card").forEach((b) =>
    b.addEventListener("click", () => selectLook(b.dataset.look!)));
  bindArtworkFallback(host);
  renderStrip();
}

function renderArtwork(recipeId: string, artKey?: ArtKey): string {
  const asset = cameraAsset(artKey ?? artKeyForRecipe(recipeId));
  if (asset) return `<span class="camera-art"><img src="${asset.src}" srcset="${asset.srcset}" sizes="${asset.sizes}" data-fallback="${thumbUrl(recipeId)}" width="384" height="256" alt="" loading="lazy" decoding="async" /></span>`;
  return shelfArt(recipeId) ?? `<img src="${thumbUrl(recipeId)}" alt="" loading="lazy" class="w-full aspect-[3/2] object-cover block" />`;
}

function bindArtworkFallback(host: HTMLElement) {
  host.querySelectorAll<HTMLImageElement>("img[data-fallback]").forEach(image => {
    let recovered = false;
    const recover = () => {
      if (recovered) return;
      recovered = true;
      useArtworkFallback(image, image.dataset.fallback!);
    };
    image.addEventListener("error", recover, { once: true });
    // Cached failures may complete before the listener is attached.
    if (image.complete && image.naturalWidth === 0) recover();
  });
}

function renderStrip() {
  const host = $("#strip");
  if (!host) return;
  syncShelfUI();
  const items = presetsForMedia(simpleMedia).filter(preset => findLook(preset.recipeId));
  host.innerHTML = items.length ? items.map(preset => {
    const sel = current?.id === preset.recipeId;
    return `<button data-look="${preset.recipeId}" data-preset="${preset.id}" aria-pressed="${sel}" class="strip-card simple-preset-card shrink-0 text-left border ${sel ? "border-ink" : "border-rule"} bg-mat overflow-hidden active:scale-[0.97] transition-transform">
      ${renderArtwork(preset.recipeId, preset.artKey)}
      <span class="strip-copy ${sel ? "is-selected" : ""}">
        <span class="strip-title">${preset.label}</span>
        <span class="strip-description">${preset.description}</span>
      </span>
    </button>`;
  }).join("") : `<div class="font-mono text-[11px] text-ink2 py-3">No matches.</div>`;
  host.querySelectorAll<HTMLButtonElement>(".strip-card").forEach((b) =>
    b.addEventListener("click", () => {
      selectLook(b.dataset.look!);
    }));
  bindArtworkFallback(host);
}

function findLook(id: string): LookEntry | undefined {
  for (const b of Object.values(catalog.brands))
    for (const t of Object.values(b.tiers)) { const hit = t.find((l) => l.id === id); if (hit) return hit; }
  return undefined;
}

async function selectLook(id: string) {
  const entry = findLook(id); if (!entry) return;
  const focusedCard = document.activeElement as HTMLElement | null;
  const focusHost = focusedCard?.matches("[data-look]") ? focusedCard.closest("#strip, #cabinet")?.id : undefined;
  const version = ++selectionVersion;
  const preset = presetForRecipe(id);
  if (preset) {
    simpleMedia = preset.media;
    lastSimpleSelection[preset.media] = preset.recipeId;
  }
  developFx = true;
  current = entry;
  recipe = null;
  setBusy(true);
  updateCounter();
  renderCabinet($<HTMLInputElement>("#search").value);
  if (focusHost) document.querySelector<HTMLButtonElement>(`#${focusHost} [data-look="${id}"]`)?.focus({ preventScroll: true });
  if (store.get(modeAtom) === "simple") requestAnimationFrame(() => {
    if (version !== selectionVersion) return;
    document.querySelector<HTMLElement>(`#strip [data-look="${id}"]`)?.scrollIntoView({
      inline: "center", block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });
  if (entry.brand === "camcorder") {
    recipe = {}; // marker — video cameras run their own engine stage
    renderSliders();
    $("#led-name").textContent = entry.name;
    $("#led-meta").innerHTML = VIDEO_META[entry.id].meta;
    $("#led-note").textContent = VIDEO_META[entry.id].note;
    scheduleApply();
    return;
  }
  $("#cap-state").textContent = "LOADING…";
  const recipeUrl = "/" + entry.recipe;
  const rj: Record<string, any> = await (await fetch(recipeUrl)).json();
  if (version !== selectionVersion) return;
  recipe = rj;
  renderSliders();
  const prov = rj.provenance ?? {};
  $("#led-name").textContent = entry.name;
  const base = entry.baseFilm ?? prov.film;
  $("#led-meta").innerHTML = [
    `${entry.brand}${base ? ` · ${base}` : ""}${prov.creator ? ` · ${prov.creator}` : ""}`,
    `${rj.license ?? entry.license ?? ""}`,
  ].filter(Boolean).join("<br/>");
  $("#led-note").textContent = prov.description ?? rj.source ?? "";
  scheduleApply();
}

async function cubeFor(entry: LookEntry): Promise<string | undefined> {
  if (!entry.baseLut) return undefined;
  const url = new URL(entry.baseLut, location.origin + "/" + entry.recipe).pathname;
  if (!cubeCache.has(url)) cubeCache.set(url, fetch(url).then((r) => r.text()));
  return cubeCache.get(url);
}

function setSplit(pct: number) {
  split = Math.min(100, Math.max(0, pct));
  $("#before").style.clipPath = `inset(0 ${100 - split}% 0 0)`;
  ($("#divider") as HTMLElement).style.left = `calc(${split}% - 1px)`;
  $("#split-label").textContent = `${Math.round(split)} / ${Math.round(100 - split)}`;
}

let previewBusy = true;
function setBusy(b: boolean) {
  previewBusy = b;
  $("#spin")?.classList.toggle("hidden", !b);
  $("#cap-state").textContent = b ? "DEVELOPING…" : "READY";
  for (const id of ["#btn-export", "#btn-export-simple"]) {
    const ex = $<HTMLButtonElement>(id);
    ex.disabled = b || videoBusy;
    ex.classList.toggle("opacity-50", ex.disabled);
  }
}
function progress(p: number) {
  const bar = $("#topbar") as HTMLDivElement | null;
  if (!bar) return;
  bar.style.width = `${p}%`;
  if (p >= 100) setTimeout(() => bar.classList.add("opacity-0"), 300);
}
function hideStageLoad() { $("#stage-load")?.classList.add("hidden"); }

function scheduleApply() {
  setBusy(true);
  syncExportButtons();
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyNow, 90);
}

function finishDevelop() {
  setBusy(false);
  syncExportButtons();
  hideStageLoad();
  progress(100);
  fitStage();
  if (developFx) {
    developFx = false;
    if (store.get(modeAtom) === "simple") {
      const c = $<HTMLCanvasElement>("#after");
      c.classList.remove("developing");
      void c.offsetWidth;
      c.classList.add("developing");
      setTimeout(() => c.classList.remove("developing"), 750);
    }
  }
}

async function applyNow() {
  hideResultVideo();
  if (!origPixels || !current) return;
  if (!engine) { setBusy(true); return; } // engineP.then re-invokes applyNow
  if (current.brand === "camcorder") {
    // Video cameras: signal-chain stages run at <=1280px on the
    // long edge (both looks are destruction effects; the result is
    // drawn back up to bench size, like the hardware does).
    setBusy(true);
    const scale = Math.min(1, 1280 / Math.max(imgW, imgH));
    const vw = Math.max(2, Math.round(imgW * scale));
    const vh = Math.max(2, Math.round(imgH * scale));
    const tmp = document.createElement("canvas");
    tmp.width = vw; tmp.height = vh;
    const tctx = tmp.getContext("2d")!;
    tctx.drawImage($<HTMLCanvasElement>("#before"), 0, 0, vw, vh);
    const px = tctx.getImageData(0, 0, vw, vh).data;
    const out = current.id === "camcorder/cx405"
      ? engine.apply_camcorder(new Uint8Array(px), vw, vh)
      : engine.apply_vhs(new Uint8Array(px), vw, vh, "vhs", 0);
    const res = document.createElement("canvas");
    res.width = vw; res.height = vh;
    res.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(out), vw, vh), 0, 0);
    const ctx = $<HTMLCanvasElement>("#after").getContext("2d")!;
    ctx.drawImage(res, 0, 0, imgW, imgH);
    finishDevelop();
    return;
  }
  if (!recipe) return;
  setBusy(true);
  const version = selectionVersion;
  const mediaRequest = mediaVersion;
  const cube = await cubeFor(current);
  if (version !== selectionVersion || mediaRequest !== mediaVersion || !recipe) return;
  const input = new Uint8Array(origPixels);
  const effective = recipeForMedia(recipe, store.get(modeAtom) === "simple", !!currentVideo);
  const out = engine.apply(input, imgW, imgH, JSON.stringify(effective), cube);
  const ctx = $<HTMLCanvasElement>("#after").getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(out), imgW, imgH), 0, 0);
  finishDevelop();
}

// Format support for uploads. Browsers natively decode JPEG/PNG/
// WebP/AVIF/GIF/BMP, and Safari also decodes HEIC — but Chrome and
// Firefox cannot open iPhone HEIC/HEIF at all, which used to surface
// as a bare "async: ..." crash. Sniff the container from the magic
// bytes (iOS often hands over an empty MIME type), try native first,
// and fall back to a lazily loaded libheif WASM decoder (heic-to,
// code-split — only HEIC uploads ever download it).
function sniffFormat(head: Uint8Array): string {
  const at = (off: number, txt: string) => txt.split("").every((c, i) => head[off + i] === c.charCodeAt(0));
  if (head[0] === 0xff && head[1] === 0xd8) return "jpeg";
  if (head[0] === 0x89 && head[1] === 0x50) return "png";
  if (at(0, "GIF8")) return "gif";
  if (at(0, "RIFF") && at(8, "WEBP")) return "webp";
  if (at(0, "BM")) return "bmp";
  if ((head[0] === 0x49 && head[1] === 0x49) || (head[0] === 0x4d && head[1] === 0x4d)) return "tiff";
  if (at(4, "ftyp")) {
    const brand = String.fromCharCode(...head.slice(8, 12));
    if (brand === "avif" || brand === "avis") return "avif";
    return "heif";
  }
  return "unknown";
}

async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const fmt = sniffFormat(head);
  const native = async () => {
    // EXIF orientation matters for phone photos; a few browsers
    // throw on the options bag itself, so retry bare.
    try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); }
    catch { return await createImageBitmap(blob); }
  };
  if (fmt !== "heif") return native();
  try { return await native(); }
  catch { /* not Safari — decode via libheif below */ }
  $("#cap-state").textContent = "DECODING HEIC…";
  const { heicTo } = await import("heic-to");
  const jpg = await heicTo({ blob, type: "image/jpeg", quality: 0.92 });
  try { return await createImageBitmap(jpg, { imageOrientation: "from-image" }); }
  catch { return await createImageBitmap(jpg); }
}

async function loadPhoto(source: Blob | string, name: string, request?: number): Promise<boolean> {
  if (request === undefined) { cancelExportForInput(); request = ++mediaVersion; }
  setBusy(true);
  syncExportButtons();
  let bmp: ImageBitmap;
  try {
    bmp = await decodeImage(source instanceof Blob ? source : await (await fetch(source)).blob());
  } catch (e) {
    if (request !== mediaVersion) return false;
    setBusy(false);
    showError(`could not open ${name} — this browser cannot decode that format (try JPEG or PNG)`);
    console.error("[open-dazz] decode failed", e);
    return false;
  }
  if (request !== mediaVersion) { bmp.close(); return false; }
  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  imgW = Math.round(bmp.width * scale); imgH = Math.round(bmp.height * scale);
  const work = document.createElement("canvas"); work.width = imgW; work.height = imgH;
  const wctx = work.getContext("2d")!; wctx.drawImage(bmp, 0, 0, imgW, imgH);
  bmp.close();
  const data = wctx.getImageData(0, 0, imgW, imgH);
  origPixels = data.data;
  for (const id of ["#before", "#after"]) {
    const c = $<HTMLCanvasElement>(id); c.width = imgW; c.height = imgH;
  }
  $<HTMLCanvasElement>("#before").getContext("2d")!.putImageData(data, 0, 0);
  $("#cap-file").textContent = `${name.toUpperCase()} — ${imgW}×${imgH}`;
  setSplit(split);
  await applyNow();
  return request === mediaVersion;
}

// ---- Video uploads: the poster frame previews the look on the
// stage; DEVELOP VIDEO then runs the whole clip through the same
// engine stages in ffmpeg.wasm (see video.ts). ----
interface LoadedVideo {
  file: File;
  route: "webcodecs" | "ffmpeg";
  ffProbe: VideoProbe | null;
  wcProbe: WcProbe | null;
}
let currentVideo: LoadedVideo | null = null;
let videoBusy = false;
let videoCancel = false;
let exportMediaVersion = 0;
let photoExportBusy = false;
let resultUrl: string | null = null;

function isVideoFile(f: File): boolean {
  return f.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name);
}

function syncExportButtons() {
  for (const id of ["#btn-export", "#btn-export-simple"]) {
    const b = document.querySelector<HTMLButtonElement>(id);
    if (!b) continue;
    const label = videoBusy ? "Exporting MP4…" : currentVideo ? "Export MP4" : "Export PNG";
    b.innerHTML = `${icon("download", "w-4 h-4")}${label}`;
    b.title = currentVideo ? "Export the full filtered video as MP4" : "Export the filtered photo as PNG";
    b.disabled = videoBusy || previewBusy || photoExportBusy;
  }
}

function cancelExportForInput() {
  if (videoBusy) {
    videoCancel = true;
    resetFFmpeg();
  }
}

function setVideoButtons(on: boolean, label?: string) {
  syncExportButtons();
  for (const id of ["#btn-video-simple", "#btn-video"]) {
    const b = document.querySelector<HTMLButtonElement>(id);
    if (!b) continue;
    b.style.display = on && videoBusy ? "" : "none";
    const span = b.querySelector("[data-vlabel]");
    if (span && label) span.textContent = label;
    if (span && !label && id === "#btn-video-simple") span.textContent = "DEVELOP VIDEO";
    if (span && !label && id === "#btn-video") span.textContent = "Develop video (.mp4)";
  }
}

function hideResultVideo() {
  const v = document.querySelector<HTMLVideoElement>("#vid-result");
  if (v) {
    v.pause();
    v.removeAttribute("src");
    v.classList.add("hidden");
  }
  if (resultUrl) {
    URL.revokeObjectURL(resultUrl);
    resultUrl = null;
  }
}

async function loadMedia(f: File) {
  cancelExportForInput();
  hideResultVideo();
  if (isVideoFile(f)) {
    await loadVideoFile(f);
    return;
  }
  currentVideo = null;
  setVideoButtons(false);
  await loadPhoto(f, f.name);
}

async function loadVideoFile(f: File) {
  cancelExportForInput();
  const request = ++mediaVersion;
  currentVideo = null;
  setVideoButtons(false);
  try {
    setBusy(true);
    $("#cap-state").textContent = "READING VIDEO…";
    // Fast path first: Mediabunny/WebCodecs reads the file with no
    // downloads and hardware decode. Any gap (codec, encoder,
    // container) routes the clip to the ffmpeg compat engine.
    const wc = await probeWebCodecs(f).catch((e) => {
      console.warn("[open-dazz] webcodecs probe failed, using ffmpeg", e);
      return null;
    });
    if (request !== mediaVersion) return;
    if (wc) {
      if (wc.probe.duration > WC_MAX_SECONDS) {
        setBusy(false);
        showError(`clip is ${Math.round(wc.probe.duration)}s — developing caps at ${WC_MAX_SECONDS}s; trim it first`);
        return;
      }
      currentVideo = { file: f, route: "webcodecs", ffProbe: null, wcProbe: wc.probe };
      if (!await loadPhoto(wc.poster, f.name, request)) {
        if (request === mediaVersion) currentVideo = null;
        return;
      }
      finishVideoLoad(f, wc.probe.w, wc.probe.h, wc.probe.duration, "FAST PATH", request);
      return;
    }
    $("#cap-state").textContent = "LOADING VIDEO ENGINE…";
    const inst = await getFFmpeg();
    if (request !== mediaVersion) return;
    $("#cap-state").textContent = "READING VIDEO…";
    const probe = await probeVideo(inst, f);
    if (request !== mediaVersion) return;
    if (probe.duration > VIDEO_MAX_SECONDS) {
      setBusy(false);
      showError(`clip is ${Math.round(probe.duration)}s — in-browser developing caps at ${VIDEO_MAX_SECONDS}s; trim it first`);
      return;
    }
    const poster = await posterFrame(inst, probe);
    if (request !== mediaVersion) return;
    currentVideo = { file: f, route: "ffmpeg", ffProbe: probe, wcProbe: null };
    if (!await loadPhoto(poster, f.name, request)) {
      if (request === mediaVersion) currentVideo = null;
      return;
    }
    finishVideoLoad(f, probe.w, probe.h, probe.duration, "COMPAT", request);
  } catch (e) {
    if (request !== mediaVersion) return;
    setBusy(false);
    showError(`could not open video ${f.name}`);
    console.error("[open-dazz] video load failed", e);
  }
}

function finishVideoLoad(f: File, w: number, h: number, dur: number, routeLabel: string, request: number) {
  $("#cap-file").textContent = `${f.name.toUpperCase()} — VIDEO ${w}×${h} · ${dur.toFixed(1)}S · ${routeLabel}`;
  setVideoButtons(true);
  setBusy(false);
  // applyNow's async tail lands a beat after loadPhoto and would
  // overwrite the ready line with a bare READY; restate it once
  // things settle.
  setTimeout(() => {
    if (request === mediaVersion && currentVideo && !videoBusy) {
      $("#cap-state").textContent = "VIDEO READY — PICK A LOOK, THEN EXPORT MP4";
    }
  }, 160);
}

type FrameProcessor = ((px: Uint8Array, w: number, h: number, fr: number) => Uint8Array) & { dispose?: () => void };

async function makeFrameProcessor(): Promise<FrameProcessor> {
  const eng = engine;
  if (!eng || !current) throw new Error("engine or look not ready");
  if (current.brand === "camcorder") {
    if (current.id === "camcorder/cx405") {
      const sim = new eng.CamcorderSim(7n);
      const process: FrameProcessor = (px, w, h, fr) => sim.process(px, w, h, fr);
      process.dispose = () => sim.free();
      return process;
    }
    return (px, w, h, fr) => eng.apply_vhs(px, w, h, "vhs", fr);
  }
  if (!recipe) throw new Error("recipe not loaded yet");
  const entry = current;
  const effective = recipeForMedia(structuredClone(recipe), store.get(modeAtom) === "simple", true);
  const cube = await cubeFor(entry);
  const json = JSON.stringify(effective);
  return (px, w, h) => eng.apply(px, w, h, json, cube);
}

async function developViaFFmpeg(
  cv: LoadedVideo,
  process: (px: Uint8Array, w: number, h: number, fr: number) => Uint8Array,
  camcorderAudio: boolean,
): Promise<Blob> {
  const inst = await getFFmpeg();
  // Always restore this source: another upload may have used the shared FFmpeg FS.
  cv.ffProbe = await probeVideo(inst, cv.file);
  if (cv.ffProbe.duration > VIDEO_MAX_SECONDS) throw new Error(`compat export caps at ${VIDEO_MAX_SECONDS}s; trim the clip first`);
  return developVideo(inst, {
    probe: cv.ffProbe,
    camcorderAudio,
    process,
    onProgress: (done, total) => {
      if (videoCancel || exportMediaVersion !== mediaVersion) return;
      const pct = Math.round((done / total) * 100);
      $("#cap-state").textContent = `DEVELOPING VIDEO — ${pct}% · FRAME ${done}/${total}`;
      progress(Math.max(2, pct));
    },
    isCancelled: () => videoCancel || exportMediaVersion !== mediaVersion,
  });
}

async function developCurrentVideo() {
  if (videoBusy) {
    return;
  }
  if (!currentVideo) return;
  videoBusy = true;
  videoCancel = false;
  exportMediaVersion = mediaVersion;
  const request = mediaVersion;
  const lookName = current?.name ?? "video";
  const camcorderAudio = current?.id === "camcorder/cx405";
  hideResultVideo();
  setVideoButtons(true, "■ CANCEL");
  const cv = currentVideo;
  let process: FrameProcessor | undefined;
  try {
    process = await makeFrameProcessor();
    if (videoCancel || request !== mediaVersion) throw new Error("cancelled");
    let blob: Blob;
    // The CX405 always takes the ffmpeg route: its audio chain is
    // real signal processing, which the WebCodecs path (built on
    // audio passthrough) deliberately does not do.
    if (camcorderAudio || cv.route === "ffmpeg" || !cv.wcProbe || !cv.wcProbe.audioPassthrough) {
      blob = await developViaFFmpeg(cv, process, camcorderAudio);
    } else {
      try {
        blob = await developWebCodecs(cv.file, {
          probe: cv.wcProbe,
          process,
          onProgress: (frac) => {
            if (videoCancel || request !== mediaVersion) return;
            const pct = Math.round(frac * 100);
            $("#cap-state").textContent = `DEVELOPING VIDEO (FAST PATH) — ${pct}%`;
            progress(Math.max(2, pct));
          },
          isCancelled: () => videoCancel || exportMediaVersion !== mediaVersion,
        });
      } catch (e) {
        if (videoCancel || request !== mediaVersion || String((e as Error)?.message ?? e).includes("cancelled")) throw e;
        console.warn("[open-dazz] webcodecs develop failed, falling back to ffmpeg", e);
        $("#cap-state").textContent = "FAST PATH FAILED — SWITCHING TO COMPAT ENGINE…";
        blob = await developViaFFmpeg(cv, process, camcorderAudio);
      }
    }
    if (videoCancel || request !== mediaVersion) throw new Error("cancelled");
    resultUrl = URL.createObjectURL(blob);
    const v = document.querySelector<HTMLVideoElement>("#vid-result");
    if (v) {
      v.src = resultUrl;
      v.classList.remove("hidden");
      v.play().catch(() => {});
    }
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `opendazz-${lookName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp4`;
    a.click();
    $("#cap-state").textContent = "VIDEO DEVELOPED — SAVED AS MP4";
  } catch (e) {
    if (request !== mediaVersion) return;
    if (videoCancel || String((e as Error)?.message ?? e).includes("cancelled")) {
      resetFFmpeg();
      $("#cap-state").textContent = "VIDEO DEVELOP CANCELLED";
    } else {
      showError(`video export failed — ${(e as Error)?.message ?? e}`);
      console.error("[open-dazz] video develop failed", e);
    }
  } finally {
    process?.dispose?.();
    progress(100);
    videoBusy = false;
    setVideoButtons(!!currentVideo);
    syncExportButtons();
  }
}

async function fetchCatalog(): Promise<Catalog> {
  const attempt = async (url: string) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    try { return await (await fetch(url, { signal: ctl.signal })).json(); }
    finally { clearTimeout(t); }
  };
  try { return await attempt("/library/catalog.json"); }
  catch { return await attempt(`/library/catalog.json?retry=${Date.now()}`); }
}

function showError(msg: string) {
  const el = $("#cap-state");
  if (el) el.textContent = `ERROR — ${msg}`.slice(0, 140);
  const sl = $("#stage-load div");
  if (sl) sl.textContent = `SOMETHING BROKE — ${msg}`.slice(0, 140);
  console.error("[open-dazz]", msg);
}

// Export follows the loaded input; the video poster is preview only.
async function exportCurrentMedia() {
  if (videoBusy) return; // Repeated Export clicks never cancel or duplicate work.
  if (previewBusy || photoExportBusy) return;
  if (currentVideo) return developCurrentVideo();
  photoExportBusy = true;
  syncExportButtons();
  const request = mediaVersion;
  const selection = selectionVersion;
  const name = current?.name ?? "photo";
  const src = $<HTMLCanvasElement>("#after");
  try {
    const blob = await new Promise<Blob | null>(resolve => src.toBlob(resolve, "image/png"));
    if (!blob || request !== mediaVersion || selection !== selectionVersion) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `opendazz-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } finally {
    photoExportBusy = false;
    syncExportButtons();
  }
}

function cancelVideoExport() {
  if (!videoBusy) return developCurrentVideo();
  videoCancel = true;
  resetFFmpeg();
}

async function boot() {
  addEventListener("error", (e) => showError(String(e.message ?? e.error ?? "unknown error")));
  addEventListener("unhandledrejection", (e) => showError(`async: ${String(e.reason?.message ?? e.reason ?? "rejection")}`));
  layout();
  const pwrap = $("#printwrap");
  if (pwrap && !$("#vid-result")) {
    const v = document.createElement("video");
    v.id = "vid-result";
    v.className = "hidden absolute inset-0 w-full h-full object-contain bg-black";
    v.style.zIndex = "20";
    v.controls = true;
    v.loop = true;
    v.playsInline = true;
    pwrap.appendChild(v);
  }
  progress(45);
  catalog = await fetchCatalog();
  catalog.brands["camcorder"] = { tiers: { video: VIDEO_LOOKS }, total: VIDEO_LOOKS.length };
  updateCounter();
  try { renderChips(); } catch (e) { console.error("chips failed", e); }
  renderCabinet();
  $<HTMLInputElement>("#search").addEventListener("input", (e) => renderCabinet((e.target as HTMLInputElement).value));
  // Mode (simple/pro) — state lives in the Jotai store; DOM follows it.
  const applyMode = () => {
    const m = store.get(modeAtom);
    document.documentElement.dataset.mode = m;
    const next = selectionForMode(m, current?.id);
    if (current && next !== current.id) selectLook(next);
    else applyNow();
    try { localStorage.setItem("of-mode", m); } catch {}
    requestAnimationFrame(() => fitStage());
    const on = "bg-ink text-paper", off = "hover:bg-paper2";
    $<HTMLButtonElement>("#mode-simple").className = `px-2.5 py-2 tracking-wide ${m === "simple" ? on : off}`;
    $<HTMLButtonElement>("#mode-pro").className = `px-2.5 py-2 tracking-wide border-l border-ink ${m === "pro" ? on : off}`;
    $("#mode-simple").setAttribute("aria-pressed", String(m === "simple"));
    $("#mode-pro").setAttribute("aria-pressed", String(m === "pro"));
  };
  store.sub(modeAtom, applyMode);
  store.set(modeAtom, document.documentElement.dataset.mode === "pro" ? "pro" : "simple");
  $<HTMLButtonElement>("#mode-simple").addEventListener("click", () => store.set(modeAtom, "simple" as Mode));
  $<HTMLButtonElement>("#mode-pro").addEventListener("click", () => store.set(modeAtom, "pro" as Mode));
  addEventListener("pointerdown", (e) => { if (!(e.target as HTMLElement).closest(".dd")) closeDDs(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeDDs(); });
  $("#btn-load").addEventListener("click", () => $<HTMLInputElement>("#file").click());
  $<HTMLInputElement>("#file").addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) loadMedia(f);
  });
  $("#btn-video").addEventListener("click", cancelVideoExport);
  $("#btn-video-simple").addEventListener("click", cancelVideoExport);
  $("#btn-s1").addEventListener("click", () => { currentVideo = null; setVideoButtons(false); loadPhoto("/samples/sample-1.jpg", "Sample I — the portrait"); });
  $("#btn-s2").addEventListener("click", () => { currentVideo = null; setVideoButtons(false); loadPhoto("/samples/sample-2.jpg", "Sample II — the lake"); });
  $("#btn-export").addEventListener("click", exportCurrentMedia);
  document.querySelectorAll<HTMLButtonElement>("[data-simple-media]").forEach(button => button.addEventListener("click", () => {
    simpleMedia = button.dataset.simpleMedia as PresetMedia;
    const next = selectionForMedia(simpleMedia, lastSimpleSelection[simpleMedia]);
    if (next.recipeId !== current?.id) selectLook(next.recipeId);
    else renderStrip();
  }));
  $("#simple-open-pro").addEventListener("click", () => {
    activeBrand = null; activeType = "all";
    $<HTMLInputElement>("#search").value = "";
    renderChips(); renderCabinet();
    store.set(modeAtom, "pro");
  });
  addEventListener("resize", () => fitStage());
  $("#btn-export-simple").addEventListener("click", exportCurrentMedia);
  const wrap = $("#printwrap");
  const drag = (e: PointerEvent) => {
    const r = wrap.getBoundingClientRect();
    setSplit(((e.clientX - r.left) / r.width) * 100);
  };
  wrap.addEventListener("pointerdown", (e) => { drag(e); const mv = (ev: PointerEvent) => drag(ev);
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up); });
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) loadMedia(f); });
  setTimeout(() => {
    if (!$("#stage-load")?.classList.contains("hidden") && !origPixels)
      showError("boot timed out — the catalog or engine did not arrive; try reloading");
  }, 15000);
  await loadPhoto("/samples/sample-1.jpg", "Sample I — the portrait");
  await selectLook(DEFAULT_PHOTO.recipeId);
}

boot();
