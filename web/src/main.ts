import { saveMedia } from "./save-media";
import { setupDesktop } from "./desktop";
import { setupMediaSession, browserSessionStorage } from "./media-session";
import { setupSessionUI } from "./session-ui";
import { ResourceCache, fetchText } from "./resource-cache";
import { checkPhotoSize, renderOriginalPhoto, type PhotoSnapshot } from "./photo-export";
import { PHONE_LOOKS, PHONE_META, PHONE_OUTPUT_NOTE, phonePresetForLook } from "./video-phones";
// open-dazz Photo Workshop — a film-development bench in the browser.
// Engine: opendazz-core (Rust) compiled to WebAssembly. No uploads:
// every photograph is developed locally on this machine.
import { mediaStore, selectedMedia, editSignature, MEDIA_FILE_TYPES } from "./media-store";
import { setupMediaDock } from "./media-dock";
import { setupMediaThumbnails } from "./media-thumbnails";
import { setupMediaImport } from "./media-import";
import { FilteredVideoPlayer, type FrameProcessor } from "./video-player";
import { uiStore, selectMode, persistMode, browserModeStorage } from "./state";
import { CatalogSchema, RecipeSchema, fetchJson, type Catalog, type LookEntry, type Recipe } from "./schemas";
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
import "./workshop-material.css";
import { dialMarkup, bindCameraDial } from "./camera-dial";

const MAX_DIM = 1920;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

let catalog: Catalog;
let current: LookEntry | null = null;

// --- Video cameras: signal-chain simulations, not LUT looks. They
// live in a synthetic "camcorder" brand injected into the catalog
// at boot; applyNow routes them to their own engine stages. ---
const VIDEO_LOOKS: LookEntry[] = [
  ...PHONE_LOOKS,
  { id: "camcorder/cx405", name: "Sony CX405", brand: "camcorder", tier: "video", recipe: "", baseLut: null, hasLut: false, baseFilm: "HDR-CX405", creator: "open-dazz", license: null },
  { id: "camcorder/vhs", name: "VHS-C", brand: "camcorder", tier: "video", recipe: "", baseLut: null, hasLut: false, baseFilm: "VHS tape", creator: "ntsc-rs", license: null },
];
const VIDEO_META: Record<string, { meta: string; note: string }> = {
  ...PHONE_META,
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
let lastSimpleSelection: Record<PresetMedia, string> = {
  photo: DEFAULT_PHOTO.recipeId,
  video: selectionForMedia("video").recipeId,
};
let developFx = false;
let selectionVersion = 0;
let mediaVersion = 0;
// These are only the active renderer's caches. Session identity, edits and
// playback belong to the Zustand media store; binary frame buffers do not persist.
let activeMediaId: string | null = null;
let previewPlayer: FilteredVideoPlayer | null = null;
let playerMediaId: string | null = null;
let playerVersion = 0;
let mediaDecodeController: AbortController | null = null;
let compatDecodeRequest: number | null = null;

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
  if (currentVideo && playerMediaId === activeMediaId) {
    const r = wrap.getBoundingClientRect();
    previewPlayer?.fit(r.width - 32, r.height - 32, imgW / imgH);
    return;
  }
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
let recipe: Recipe | null = null;
const cubeCache = new ResourceCache<string>();
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
        <div id="editing-mode" class="mechanical-mode" role="group" aria-label="Mode">
          <button id="mode-simple" aria-pressed="true" class="px-2.5 py-2 tracking-wide">SIMPLE</button>
          <button id="mode-pro" aria-pressed="false" class="px-2.5 py-2 tracking-wide border-l border-ink">PRO</button><span class="mode-carriage" aria-hidden="true"></span>
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
      <div class="import-toolbar flex flex-wrap items-center gap-2 px-4 pt-4">
        <button id="btn-load" class="flex items-center gap-2 font-mono text-[12px] bg-ink text-paper px-4 py-2.5 hover:bg-stamp transition-colors">${icon("upload", "w-[18px] h-[18px]")}Photo / Video</button>
        <button id="btn-s1" class="flex items-center gap-2 font-mono text-[12px] border border-rule bg-mat px-4 py-2.5 hover:bg-paper2 transition-colors">${icon("user", "w-[18px] h-[18px]")}Sample I</button>
        <button id="btn-s2" class="flex items-center gap-2 font-mono text-[12px] border border-rule bg-mat px-4 py-2.5 hover:bg-paper2 transition-colors">${icon("mountain", "w-[18px] h-[18px]")}Sample II</button>
        <span class="font-mono text-[10px] text-ink2 ml-auto" id="split-label"></span>
        <input id="file" type="file" multiple accept="${MEDIA_FILE_TYPES.join(",")}" class="hidden" />
      </div>
      <section id="session-panel" hidden class="mx-4 mt-3 p-3 border border-rule rounded-lg bg-mat text-[12px] leading-relaxed max-h-40 overflow-y-auto" aria-label="Saved editing settings"></section>
      <div id="stage-wrap" class="flex-1 min-h-0 flex items-center justify-center p-4 md:p-6 overflow-hidden">
        <div id="media-empty" hidden><h2 id="empty-title">Your next frame starts here</h2><p id="empty-message">Add photos or short clips, then pick a look. Each item keeps its own edits.</p><button id="empty-add">Add media</button><button id="retry-media" hidden>Try again</button></div>
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
          <div id="video-workspace" hidden></div>
          <figcaption class="w-full shrink-0 flex flex-wrap justify-between gap-2 pt-3 font-mono text-[10px] tracking-[0.16em] text-ink2">
            <span class="flex items-center gap-2"><span id="spin" class="hidden w-[13px] h-[13px] border-2 border-rule border-t-ink animate-spin shrink-0"></span><span id="cap-file">—</span></span><span id="cap-state"></span>
          </figcaption>
        </figure>
      </div>
      <div id="work-error" hidden class="mx-4 mb-3 p-3 border border-rule bg-mat text-[12px]" role="alert"><span id="work-error-message"></span> <button id="work-retry" type="button" class="underline px-3 py-2">Try again</button></div>
      <div class="quality-bar mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink2"><span id="export-spec"></span><button id="cancel-photo" hidden type="button" class="border border-rule px-3 py-2">Cancel photo export</button></div>
      <p id="phone-output-note" hidden class="mx-4 mb-3 text-[11px] leading-relaxed text-ink2"></p>
      <div class="simple-only items-center justify-end gap-3 mx-4 mb-4 border border-rule bg-mat px-3 py-2.5">
        <button id="btn-video-simple" title="Develop the loaded video with the current look" style="display:none" class="bg-paper text-ink border border-ink px-3 py-2 hover:bg-paper2 transition-colors items-center gap-2 shrink-0">
          ${icon("video", "w-4 h-4")}
          <span data-vlabel class="font-mono text-[10px] tracking-[0.2em]">DEVELOP VIDEO</span>
        </button>
        <button id="btn-export-simple" disabled title="Export the developed photo as a PNG" class="camera-shutter flex items-center justify-center gap-2 shrink-0">
          ${icon("download", "w-4 h-4")}
          <span class="font-mono text-[10px] tracking-[0.2em]">EXPORT</span>
        </button>
      </div>
    </section>

    <!-- THE LEDGER -->
    <aside class="ledger order-3 border-t lg:border-t-0 lg:border-l border-rule px-4 py-4 lg:min-h-0 lg:overflow-y-auto"><div class="ledger-content cabinet-scroll">
      <div class="flex items-center gap-2 mb-2">
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
      </div><div class="ledger-actions"><button id="btn-export" disabled class="camera-shutter mt-4 w-full flex items-center justify-center gap-2">${icon("download", "w-4 h-4")}Export PNG</button>
    <button id="btn-video" style="display:none" class="mt-2 w-full bg-paper text-ink border border-ink font-mono text-[12px] py-3 hover:bg-paper2 transition-colors items-center justify-center gap-2">${icon("video", "w-4 h-4")}<span data-vlabel>Develop video (.mp4)</span></button></div>
    </aside>
  </main>

  <section id="media-dock" aria-label="Your media"></section>
`;
}

function sliderRow(key: string, label: string, min: number, max: number, step: number, val: number, fmt: (v: number) => string) {
  const strength = key === "strength";
  return `<div class="edit-control ${strength ? "strength-control" : ""}">
    <div class="edit-control-heading"><label for="sl-${key}">${label}</label><output id="val-${key}" for="sl-${key}">${fmt(val)}</output></div>
    ${strength ? dialMarkup() : ""}
    <div class="edit-control-inputs"><input type="range" id="sl-${key}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${label}" />
    <input class="edit-numeric" type="number" id="num-${key}" aria-label="${label}${strength ? " percent" : " value"}" min="${strength ? 0 : min}" max="${strength ? 150 : max}" step="${strength ? 1 : step}" value="${strength ? Math.round(val * 100) : val}" inputmode="decimal" /></div>
    ${strength ? '<p class="dial-help">Drag left or right, use arrow keys, or type a percentage.</p>' : ""}
  </div>`;
}

function renderSliders() {
  if (current?.brand === "camcorder") {
    $("#sliders").innerHTML = `<div class="font-mono text-[10.5px] leading-relaxed text-ink2 px-1 py-2">Signal-chain simulation — fixed processing; there are no develop sliders.</div>`;
    return;
  }
  if (!recipe) return;
  const R = recipe;
  const mediaId = activeMediaId;
  const commit = () => { if (mediaId && mediaId === activeMediaId) mediaStore.getState().updateEdit(mediaId, { recipe: R }); };
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
    const range = $<HTMLInputElement>(`#sl-${key}`), numeric = $<HTMLInputElement>(`#num-${key}`);
    const scale = key === "strength" ? 100 : 1;
    range.addEventListener("input", () => {
      // Ignore detached controls from a previous item/recipe, including a drag
      // interrupted by switching media. State and export snapshots stay per item.
      if (mediaId !== activeMediaId || recipe !== R) return;
      const v = range.valueAsNumber;
      numeric.value = String(Math.round(v * scale * 100) / 100);
      numeric.setAttribute("aria-invalid", "false");
      fn(v); commit(); scheduleApply();
    });
    numeric.addEventListener("input", () => {
      const valid = numeric.validity.valid && Number.isFinite(numeric.valueAsNumber);
      numeric.setAttribute("aria-invalid", String(!valid));
      if (!valid) return;
      range.value = String(numeric.valueAsNumber / scale);
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
    numeric.addEventListener("change", () => {
      numeric.value = String(Math.round(range.valueAsNumber * scale * 100) / 100);
      numeric.setAttribute("aria-invalid", "false");
    });
    if (key === "strength") bindCameraDial($(".strength-control"), range);
  };
  on("strength", (v) => { R.strength = v; $("#val-strength").textContent = `${Math.round(v * 100)}%`; });
  on("grain", (v) => { R.grain = { ...(R.grain ?? {}), amount: v, size: R.grain?.size ?? "small" }; $("#val-grain").textContent = v.toFixed(2); });
  on("halation", (v) => { R.halation = v; $("#val-halation").textContent = v.toFixed(2); });
  on("temp", (v) => { R.whiteBalance = { ...(R.whiteBalance ?? {}), tempShift: v }; $("#val-temp").textContent = (v >= 0 ? "+" : "") + v.toFixed(2); });
  on("tint", (v) => { R.whiteBalance = { ...(R.whiteBalance ?? {}), tintShift: v }; $("#val-tint").textContent = (v >= 0 ? "+" : "") + v.toFixed(2); });
  document.querySelectorAll<HTMLButtonElement>(".gsize").forEach((b) => {
    const active = (R.grain?.size ?? "small") === b.dataset.gsize;
    b.classList.toggle("bg-ink", active); b.classList.toggle("text-paper", active);
    b.onclick = () => { R.grain = { ...(R.grain ?? { amount: 0 }), size: b.dataset.gsize === "large" ? "large" : "small" }; commit(); renderSliders(); scheduleApply(); };
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
    b.addEventListener("click", () => toggleDD(b)));
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

async function selectLook(id: string, restoredRecipe?: Recipe | null) {
  const entry = findLook(id); if (!entry) return;
  const focusedCard = document.activeElement as HTMLElement | null;
  const focusHost = focusedCard?.matches("[data-look]") ? focusedCard.closest("#strip, #cabinet")?.id : undefined;
  const version = ++selectionVersion;
  const mediaId = activeMediaId;
  const preset = presetForRecipe(id);
  if (preset) {
    simpleMedia = preset.media;
    lastSimpleSelection[preset.media] = preset.recipeId;
  }
  developFx = true;
  clearWorkFailure();
  current = entry;
  const phoneNote = $("#phone-output-note");
  phoneNote.hidden = !phonePresetForLook(id);
  phoneNote.textContent = phonePresetForLook(id) ? PHONE_OUTPUT_NOTE : "";
  recipe = null;
  if (mediaId) mediaStore.getState().updateEdit(mediaId, { lookId: id, recipe: null, collection: simpleMedia, photoLookId: lastSimpleSelection.photo, videoLookId: lastSimpleSelection.video });
  setBusy(true);
  updateCounter();
  renderCabinet($<HTMLInputElement>("#search").value);
  if (focusHost) document.querySelector<HTMLButtonElement>(`#${focusHost} [data-look="${id}"]`)?.focus({ preventScroll: true });
  if (uiStore.getState().mode === "simple" && matchMedia("(min-width: 1024px)").matches) requestAnimationFrame(() => {
    if (version !== selectionVersion) return;
    document.querySelector<HTMLElement>(`#strip [data-look="${id}"]`)?.scrollIntoView({
      inline: "center", block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });
  if (entry.brand === "camcorder") {
    recipe = null; // Video cameras run their own engine stage.
    renderSliders();
    $("#led-name").textContent = entry.name;
    $("#led-meta").innerHTML = VIDEO_META[entry.id].meta;
    $("#led-note").textContent = VIDEO_META[entry.id].note;
    scheduleApply();
    return;
  }
  $("#cap-state").textContent = "LOADING…";
  const recipeUrl = "/" + entry.recipe;
  let rj: Recipe;
  try { rj = restoredRecipe ? structuredClone(restoredRecipe) : await fetchJson(recipeUrl, RecipeSchema); }
  catch (error) {
    if (version === selectionVersion && mediaId === activeMediaId) showWorkFailure("Could not load this look. Check your connection and try again; your edits are kept.", retryCurrentLook, error);
    return;
  }
  if (version !== selectionVersion) return;
  recipe = rj;
  if (mediaId) mediaStore.getState().updateEdit(mediaId, { recipe: rj });
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
  return cubeCache.get(url, async () => {
    const text = await fetchText(url);
    if (!/^\s*LUT_3D_SIZE\s+\d+/m.test(text)) throw new Error("The downloaded LUT is invalid. Try again when the connection is available.");
    const eng = await engineP;
    eng.apply(new Uint8Array([0, 0, 0, 255]), 1, 1, '{"name":"Validate LUT"}', text);
    return text;
  });
}

function setSplit(pct: number) {
  split = Math.min(100, Math.max(0, pct));
  $("#before").style.clipPath = `inset(0 ${100 - split}% 0 0)`;
  ($("#divider") as HTMLElement).style.left = `calc(${split}% - 1px)`;
  $("#split-label").textContent = `${Math.round(split)} / ${Math.round(100 - split)}`;
  if (activeMediaId) mediaStore.getState().updateEdit(activeMediaId, { split });
}

let previewBusy = true;
function setBusy(b: boolean) {
  previewBusy = b;
  $("#spin")?.classList.toggle("hidden", !b);
  $("#cap-state").textContent = b ? "DEVELOPING…" : "READY";
  syncExportButtons();
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
  if (currentVideo && playerMediaId === activeMediaId) void refreshVideoPreview();
  if (developFx) {
    developFx = false;
    if (uiStore.getState().mode === "simple") {
      const c = $<HTMLCanvasElement>("#after");
      c.classList.remove("developing");
      void c.offsetWidth;
      c.classList.add("developing");
      setTimeout(() => c.classList.remove("developing"), 750);
    }
  }
}

async function applyNow() {
  const media = mediaVersion, selection = selectionVersion;
  try { await applyDevelop(); }
  catch (error) {
    if (media === mediaVersion && selection === selectionVersion)
      showWorkFailure("Could not load or develop this look. Check your connection and try again; your edits are kept.", retryCurrentLook, error);
  }
}
async function applyDevelop() {
  hideResultVideo();
  if (!origPixels || !current) return;
  if (!engine) { setBusy(true); return; } // engineP.then re-invokes applyNow
  if (current.brand === "camcorder") {
    // Video cameras: signal-chain stages run at <=1280px on the
    // long edge; phone presets may reduce detail further internally.
    // Draw back up to bench size without changing framing.
    setBusy(true);
    const scale = Math.min(1, 1280 / Math.max(imgW, imgH));
    const vw = Math.max(2, Math.round(imgW * scale));
    const vh = Math.max(2, Math.round(imgH * scale));
    const tmp = document.createElement("canvas");
    tmp.width = vw; tmp.height = vh;
    const tctx = tmp.getContext("2d")!;
    tctx.drawImage($<HTMLCanvasElement>("#before"), 0, 0, vw, vh);
    const px = tctx.getImageData(0, 0, vw, vh).data;
    const phone = phonePresetForLook(current.id);
    const out = phone ? engine.apply_phone(new Uint8Array(px), vw, vh, phone, 0)
      : current.id === "camcorder/cx405"
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
  const storedRecipe = selectedMedia(mediaStore.getState())?.edit.recipe;
  if (!storedRecipe) return;
  const effective = recipeForMedia(storedRecipe, uiStore.getState().mode === "simple", !!currentVideo);
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
    bmp = await decodeImage(source instanceof Blob ? source : await fetchSourceBlob(source));
  } catch (e) {
    if (request !== mediaVersion) return false;
    setBusy(false);
    markMediaError(`Could not open ${name}. Try JPEG or PNG.`);
    showError(`could not open ${name} — this browser cannot decode that format (try JPEG or PNG)`);
    console.error("[open-dazz] decode failed", e);
    return false;
  }
  if (request !== mediaVersion) { bmp.close(); return false; }
  if (!currentVideo) photoSize = { width: bmp.width, height: bmp.height };
  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  imgW = Math.round(bmp.width * scale); imgH = Math.round(bmp.height * scale);
  const work = document.createElement("canvas"); work.width = imgW; work.height = imgH;
  const wctx = work.getContext("2d")!; wctx.drawImage(bmp, 0, 0, imgW, imgH);
  bmp.close();
  const data = wctx.getImageData(0, 0, imgW, imgH);
  origPixels = data.data;
  if (activeMediaId) {
    const thumb = document.createElement("canvas"); const thumbScale = Math.min(1, 160 / Math.max(imgW, imgH)); thumb.width = Math.max(1, Math.round(imgW * thumbScale)); thumb.height = Math.max(1, Math.round(imgH * thumbScale));
    thumb.getContext("2d")!.drawImage(work, 0, 0, thumb.width, thumb.height);
    mediaStore.getState().updateStatus(activeMediaId, { thumbnail: thumb.toDataURL("image/jpeg", 0.7) });
  }
  for (const id of ["#before", "#after"]) {
    const c = $<HTMLCanvasElement>(id); c.width = imgW; c.height = imgH;
  }
  $<HTMLCanvasElement>("#before").getContext("2d")!.putImageData(data, 0, 0);
  $("#cap-file").textContent = `${name.toUpperCase()} — PREVIEW ${imgW}×${imgH}`;
  setSplit(split);
  await applyNow();
  if (request === mediaVersion && activeMediaId && !currentVideo) {
    mediaStore.getState().updateStatus(activeMediaId, { status: "ready", error: null }); syncExportButtons();
  }
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
let photoSize: { width: number; height: number } | null = null;
let photoExportController: AbortController | null = null;


function syncExportButtons() {
  updateExportSpec();
  for (const id of ["#btn-export", "#btn-export-simple"]) {
    const b = document.querySelector<HTMLButtonElement>(id);
    if (!b) continue;
    const item = selectedMedia(mediaStore.getState());
    const video = item?.kind === "video";
    const label = photoExportBusy ? "Exporting PNG…" : videoBusy ? "Exporting MP4…" : video ? "Export MP4" : "Export PNG";
    b.innerHTML = `${icon("download", "w-4 h-4")}${label}`;
    b.title = video ? "Export the full filtered video as MP4" : "Export the filtered photo as PNG";
    b.disabled = !!workFailure || videoBusy || previewBusy || photoExportBusy || item?.status !== "ready" || (!recipe && current?.brand !== "camcorder");
  }
}

function updateExportSpec() {
  const spec = document.querySelector("#export-spec");
  if (!spec) return;
  const cv = currentVideo, probe = cv?.wcProbe ?? cv?.ffProbe;
  if (cv && probe) {
    const compat = cv.route === "ffmpeg" || current?.id === "camcorder/cx405" || !cv.wcProbe?.audioPassthrough;
    const fps = probe.fps ? (compat ? Math.min(30, probe.fps) : probe.fps).toFixed(2).replace(/\.?0+$/, "") + " fps" : "source timing";
    spec.textContent = `MP4 · ${probe.w}×${probe.h} · ${fps}${compat ? "" : " average; source timestamps kept"} · 854px width limit · ${compat ? 45 : 120}s limit${compat ? "" : "; compatibility fallback: up to 30fps / 45s"}`;
  } else spec.textContent = photoSize ? `PNG · original ${photoSize.width}×${photoSize.height} · 16.7 MP / 8192px export limit · preview up to 1920px` : "";
  const cancel = document.querySelector<HTMLButtonElement>("#cancel-photo");
  if (cancel) cancel.hidden = !photoExportBusy;
}
function cancelPhotoExport() {
  photoExportController?.abort(); photoExportController = null; photoExportBusy = false; syncExportButtons();
}
function cancelExportForInput() {
  cancelPhotoExport();
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
}

function markMediaError(message: string) {
  hideStageLoad();
  if (activeMediaId) mediaStore.getState().updateStatus(activeMediaId, { status: "error", error: message });
  $("#stage").hidden = true; $("#media-empty").hidden = false;
  $("#empty-title").textContent = "This item could not be opened";
  $("#empty-message").textContent = message;
  $("#retry-media").hidden = false; syncExportButtons();
}

function cancelMediaDecode() {
  mediaDecodeController?.abort(); mediaDecodeController = null;
  if (compatDecodeRequest !== null) { resetFFmpeg(); compatDecodeRequest = null; }
}

async function activateMedia(id: string | null) {
  if (matchMedia("(max-width: 1023px)").matches) $("main").scrollTo({ top: 0 });
  const previous = mediaStore.getState().items.find(item => item.id === activeMediaId);
  if (previous?.status === "loading") mediaStore.getState().updateStatus(previous.id, { status: "queued" });
  cancelMediaDecode(); cancelExportForInput(); hideResultVideo();
  const request = ++mediaVersion;
  mediaDecodeController = new AbortController(); ++selectionVersion; ++playerVersion;
  clearTimeout(applyTimer);
  previewPlayer?.detach(); playerMediaId = null; activeMediaId = id;
  currentVideo = null; photoSize = null; clearWorkFailure(); current = null; recipe = null; origPixels = null; imgW = imgH = 0;
  setVideoButtons(false);
  for (const selector of ["#before", "#after"]) { const canvas = $<HTMLCanvasElement>(selector); canvas.width = canvas.height = 1; }
  $("#video-workspace").hidden = true; $("#printwrap").hidden = false;
  const item = mediaStore.getState().items.find(item => item.id === id);
  if (!item) {
    setBusy(false); hideStageLoad(); $("#stage").hidden = true; $("#media-empty").hidden = false;
    $("#empty-title").textContent = "Your next frame starts here";
    $("#empty-message").textContent = "Add photos or short clips, then pick a look. Each item keeps its own edits.";
    $("#retry-media").hidden = true; $("#sliders").replaceChildren(); $("#led-name").textContent = "Choose a look";
    return;
  }
  $("#stage").hidden = false; $("#media-empty").hidden = true;
  $("#stage-load").classList.remove("hidden"); $("#stage-load div").textContent = "OPENING MEDIA…";
  $("#cap-file").textContent = item.name; setBusy(true);
  mediaStore.getState().updateStatus(item.id, { status: "loading", error: null });
  split = item.edit.split; simpleMedia = item.edit.collection;
  lastSimpleSelection = { photo: item.edit.photoLookId, video: item.edit.videoLookId };
  try {
    if (!findLook(item.edit.lookId)) {
      markMediaError("The saved look is no longer available. Try again to open this item with Chrome; its unavailable look settings will be reset.");
      return;
    }
    await selectLook(item.edit.lookId, item.edit.recipe);
    if (request !== mediaVersion) return;
    if (item.kind === "video" && item.source instanceof File) await loadVideoFile(item.source, request, mediaDecodeController?.signal);
    else await loadPhoto(item.source, item.name, request);
  } catch (error) {
    if (request !== mediaVersion) return;
    markMediaError(error instanceof Error ? error.message : String(error));
  }
}

async function refreshVideoPreview() {
  if (!currentVideo || !previewPlayer || playerMediaId !== activeMediaId) return;
  const version = ++playerVersion, request = mediaVersion, selection = selectionVersion;
  previewPlayer.preparing();
  try {
    const processor = await makeFrameProcessor();
    if (version !== playerVersion || request !== mediaVersion || selection !== selectionVersion) { processor.dispose?.(); return; }
    previewPlayer.setProcessor(processor);
  } catch (error) { if (request === mediaVersion && selection === selectionVersion) showWorkFailure("Could not prepare this look. Check your connection and try again; your edits are kept.", retryCurrentLook, error); }
}

async function loadVideoFile(f: File, request = ++mediaVersion, signal?: AbortSignal) {
  cancelExportForInput();
  currentVideo = null;
  setVideoButtons(false);
  try {
    setBusy(true);
    $("#cap-state").textContent = "READING VIDEO…";
    // Fast path first: Mediabunny/WebCodecs reads the file with no
    // downloads and hardware decode. Any gap (codec, encoder,
    // container) routes the clip to the ffmpeg compat engine.
    const wc = await probeWebCodecs(f, signal).catch((e) => {
      if (signal?.aborted) return null;
      console.warn("[open-dazz] webcodecs probe failed, using ffmpeg", e);
      return null;
    });
    if (request !== mediaVersion || signal?.aborted) return;
    if (wc) {
      if (wc.probe.duration > WC_MAX_SECONDS) {
        setBusy(false);
        markMediaError(`Trim this clip to ${WC_MAX_SECONDS} seconds or less for browser export.`);
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
    compatDecodeRequest = request;
    const inst = await getFFmpeg();
    if (request !== mediaVersion) return;
    $("#cap-state").textContent = "READING VIDEO…";
    const probe = await probeVideo(inst, f);
    if (request !== mediaVersion) return;
    if (probe.duration > VIDEO_MAX_SECONDS) {
      setBusy(false);
      markMediaError(`Trim this clip to ${VIDEO_MAX_SECONDS} seconds or less for compatibility export.`);
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
    markMediaError(`Could not open video ${f.name}. Try an MP4 or WebM clip.`);
    showError(`could not open video ${f.name}`);
    console.error("[open-dazz] video load failed", e);
  } finally {
    if (compatDecodeRequest === request) compatDecodeRequest = null;
  }
}

function finishVideoLoad(f: File, w: number, h: number, dur: number, routeLabel: string, request: number) {
  if (request !== mediaVersion) return;
  const item = selectedMedia(mediaStore.getState());
  if (item && item.id === activeMediaId) {
    mediaStore.getState().updateStatus(item.id, { status: "ready", error: null });
    previewPlayer?.load(item); playerMediaId = item.id;
    $("#printwrap").hidden = true; $("#video-workspace").hidden = false;
    void refreshVideoPreview(); fitStage();
  }
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

async function makeFrameProcessor(): Promise<FrameProcessor> {
  const eng = engine;
  const item = selectedMedia(mediaStore.getState());
  const entry = item ? findLook(item.edit.lookId) : undefined;
  if (!eng || !entry || !item) throw new Error("engine or look not ready");
  if (entry.brand === "camcorder") {
    const phone = phonePresetForLook(entry.id);
    if (phone) return (px, w, h, fr) => eng.apply_phone(px, w, h, phone, fr);
    if (entry.id === "camcorder/cx405") {
      const sim = new eng.CamcorderSim(7n);
      const process: FrameProcessor = (px, w, h, fr) => sim.process(px, w, h, fr);
      process.dispose = () => sim.free();
      return process;
    }
    return (px, w, h, fr) => eng.apply_vhs(px, w, h, "vhs", fr);
  }
  if (!item.edit.recipe) throw new Error("recipe not loaded yet");
  const effective = recipeForMedia(structuredClone(item.edit.recipe), uiStore.getState().mode === "simple", true);
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
  previewPlayer?.video.pause();
  videoCancel = false;
  exportMediaVersion = mediaVersion;
  const request = mediaVersion;
  const entry = findLook(selectedMedia(mediaStore.getState())?.edit.lookId ?? "");
  const lookName = entry?.name ?? "video";
  const exportedItem = selectedMedia(mediaStore.getState());
  const exportedSignature = exportedItem ? editSignature(exportedItem.edit, uiStore.getState().mode, "video") : null;
  const camcorderAudio = entry?.id === "camcorder/cx405";
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
    const saved = await saveMedia(blob, `opendazz-${lookName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp4`, () => !videoCancel && request === mediaVersion);
    if (request !== mediaVersion) return;
    if (!saved) { $("#cap-state").textContent = "VIDEO SAVE CANCELLED"; return; }
    if (exportedItem && exportedSignature) mediaStore.getState().markExported(exportedItem.id, exportedSignature);
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
    try { return await fetchJson(url, CatalogSchema, { signal: ctl.signal }); }
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

let workFailure: string | null = null;
let retryWork: (() => Promise<void>) | null = null;
let retryBusy = false;
function clearWorkFailure() {
  workFailure = null; retryWork = null;
  const banner = document.querySelector<HTMLElement>("#work-error");
  if (banner) banner.hidden = true;
}
function showWorkFailure(message: string, retry: () => Promise<void>, error?: unknown) {
  setBusy(false);
  workFailure = message; retryWork = retry;
  $("#work-error-message").textContent = message;
  $("#work-error").hidden = false;
  $("#cap-state").textContent = "ACTION NEEDED — TRY AGAIN";
  hideStageLoad(); syncExportButtons();
  if (error) console.warn("[opendazz] recoverable work failure", error);
}
async function retryCurrentLook() {
  const item = selectedMedia(mediaStore.getState());
  if (!item) return;
  const id = item.id, lookId = item.edit.lookId;
  const savedRecipe = item.edit.recipe ? structuredClone(item.edit.recipe) : null;
  await selectLook(lookId, savedRecipe);
  if (id !== activeMediaId || current?.id !== lookId) return;
  clearTimeout(applyTimer); await applyNow();
}
async function fetchSourceBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not read the image: HTTP ${response.status}`);
  return response.blob();
}
// Preview is bounded, export re-decodes the selected original in a disposable
// worker. Snapshot settings at click time; switching input cancels the worker.
async function exportCurrentMedia() {
  if (videoBusy || previewBusy || photoExportBusy) return;
  if (currentVideo) return developCurrentVideo();
  const item = selectedMedia(mediaStore.getState()), entry = current;
  if (!item || !entry || !engine) return;
  const request = mediaVersion;
  const exportedSignature = editSignature(item.edit, uiStore.getState().mode, "photo");
  const savedRecipe = item.edit.recipe ? structuredClone(item.edit.recipe) : null;
  const simple = uiStore.getState().mode === "simple";
  const phone = phonePresetForLook(entry.id);
  const controller = new AbortController();
  photoExportController = controller; photoExportBusy = true; syncExportButtons();
  try {
    const snapshot: PhotoSnapshot = phone ? { kind: "phone", preset: phone }
      : entry.id === "camcorder/cx405" ? { kind: "cx405" }
      : entry.id === "camcorder/vhs" ? { kind: "vhs" }
      : { kind: "recipe", recipe: recipeForMedia(savedRecipe!, simple, false), cube: await cubeFor(entry) };
    if (controller.signal.aborted || request !== mediaVersion) return;
    const source = item.source instanceof Blob ? item.source : await fetchSourceBlob(item.source, controller.signal);
    const bitmap = await decodeImage(source);
    if (controller.signal.aborted || request !== mediaVersion) { bitmap.close(); return; }
    try { checkPhotoSize(bitmap.width, bitmap.height); }
    catch (error) { bitmap.close(); throw error; }
    const blob = await renderOriginalPhoto(bitmap, snapshot, controller.signal);
    if (controller.signal.aborted || request !== mediaVersion) return;
    const saved = await saveMedia(blob, `opendazz-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`, () => !controller.signal.aborted && request === mediaVersion);
    if (controller.signal.aborted || request !== mediaVersion) return;
    if (!saved) { $("#cap-state").textContent = "PHOTO SAVE CANCELLED"; return; }
    mediaStore.getState().markExported(item.id, exportedSignature);
    $("#cap-state").textContent = "ORIGINAL-SIZE PNG SAVED";
  } catch (error) {
    if (controller.signal.aborted || request !== mediaVersion) return;
    const detail = error instanceof Error ? error.message : "";
    showWorkFailure(detail.startsWith("Original-size export supports") ? detail : "Could not export the original-size photo. Check your connection and try again, or use a smaller copy in a current browser.", exportCurrentMedia, error);
  } finally {
    if (photoExportController === controller) { photoExportController = null; photoExportBusy = false; syncExportButtons(); }
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
  $("#cancel-photo").addEventListener("click", () => { cancelPhotoExport(); $("#cap-state").textContent = "PHOTO EXPORT CANCELLED"; });
  $("#work-retry").addEventListener("click", async () => {
    if (!retryWork || retryBusy) return;
    const retry = retryWork; retryBusy = true;
    $<HTMLButtonElement>("#work-retry").disabled = true;
    clearWorkFailure();
    try { await retry(); }
    catch (error) { showWorkFailure("This action could not finish. Check your connection and try again.", retry, error); }
    finally { retryBusy = false; $<HTMLButtonElement>("#work-retry").disabled = false; }
  });
  previewPlayer = new FilteredVideoPlayer($("#video-workspace"), () => { void refreshVideoPreview(); });
  progress(45);
  while (true) {
    try { catalog = await fetchCatalog(); clearWorkFailure(); break; }
    catch (error) {
      await new Promise<void>(resolve => showWorkFailure("Could not load the filter catalog. Check your connection, then try again.", async () => { clearWorkFailure(); resolve(); }, error));
    }
  }
  catalog.brands["camcorder"] = { tiers: { video: VIDEO_LOOKS }, total: VIDEO_LOOKS.length };
  updateCounter();
  try { renderChips(); } catch (e) { console.error("chips failed", e); }
  renderCabinet();
  $<HTMLInputElement>("#search").addEventListener("input", (e) => renderCabinet((e.target as HTMLInputElement).value));
  // Subscribe only to mode; unrelated store changes do not redevelop pixels.
  const applyMode = (m: ReturnType<typeof selectMode>) => {
    document.documentElement.dataset.mode = m;
    $("#editing-mode").dataset.mode = m;
    const next = selectionForMode(m, current?.id);
    if (current && next !== current.id) selectLook(next);
    else applyNow();
    requestAnimationFrame(() => fitStage());
    const on = "bg-ink text-paper", off = "hover:bg-paper2";
    $<HTMLButtonElement>("#mode-simple").className = `px-2.5 py-2 tracking-wide ${m === "simple" ? on : off}`;
    $<HTMLButtonElement>("#mode-pro").className = `px-2.5 py-2 tracking-wide border-l border-ink ${m === "pro" ? on : off}`;
    $("#mode-simple").setAttribute("aria-pressed", String(m === "simple"));
    $("#mode-pro").setAttribute("aria-pressed", String(m === "pro"));
  };
  const unsubscribeMode = uiStore.subscribe(selectMode, applyMode, { fireImmediately: true });
  const unsubscribePersistence = persistMode(uiStore, browserModeStorage());
  const stageResize = new ResizeObserver(() => fitStage());
  stageResize.observe($("#stage-wrap"));
  const cleanupMode = () => {
    stageResize.disconnect();
    unsubscribeMode(); unsubscribePersistence();
    removeEventListener("pagehide", onPageHide);
  };
  const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) cleanupMode(); };
  import.meta.hot?.dispose(cleanupMode);
  addEventListener("pagehide", onPageHide);
  $<HTMLButtonElement>("#mode-simple").addEventListener("click", () => uiStore.getState().setMode("simple"));
  $<HTMLButtonElement>("#mode-pro").addEventListener("click", () => uiStore.getState().setMode("pro"));
  addEventListener("pointerdown", (e) => { if (!(e.target as HTMLElement).closest(".dd")) closeDDs(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeDDs(); });
  $("#btn-load").addEventListener("click", () => $<HTMLInputElement>("#file").click());
  const dock = setupMediaDock($("#media-dock"), () => $<HTMLInputElement>("#file").click());
  const cleanupThumbnails = setupMediaThumbnails();
  const cleanupImport = setupMediaImport($<HTMLInputElement>("#file"), document.body, dock.announce);
  const cleanupSelection = mediaStore.subscribe(state => state.selectedId, id => { void activateMedia(id); });
  $("#empty-add").addEventListener("click", () => $<HTMLInputElement>("#file").click());
  $("#retry-media").addEventListener("click", () => {
    const item = selectedMedia(mediaStore.getState());
    if (item && !findLook(item.edit.lookId)) mediaStore.getState().updateEdit(item.id, { lookId: DEFAULT_PHOTO.recipeId, recipe: null, collection: "photo", photoLookId: DEFAULT_PHOTO.recipeId });
    void activateMedia(mediaStore.getState().selectedId);
  });
  const session = setupMediaSession(mediaStore, browserSessionStorage());
  void setupDesktop(session.flush).catch(error => showError(`Desktop setup failed: ${error}`));
  const cleanupSessionUI = setupSessionUI($("#session-panel"), () => $<HTMLInputElement>("#file").click(), session.reset);
  const cleanupMedia = () => { session.destroy(); cleanupSessionUI(); cancelMediaDecode(); cancelExportForInput(); ++mediaVersion; ++selectionVersion; ++playerVersion; clearTimeout(applyTimer); origPixels = null; current = null; recipe = null; currentVideo = null; cleanupSelection(); cleanupImport(); cleanupThumbnails(); dock.destroy(); previewPlayer?.destroy(); hideResultVideo(); mediaStore.getState().clear(); removeEventListener("pagehide", onMediaPageHide); };
  const onMediaPageHide = (event: PageTransitionEvent) => { if (!event.persisted) cleanupMedia(); else { session.flush(); cancelExportForInput(); previewPlayer?.video.pause(); } };
  import.meta.hot?.dispose(cleanupMedia);
  addEventListener("pagehide", onMediaPageHide);
  $("#btn-video").addEventListener("click", cancelVideoExport);
  $("#btn-video-simple").addEventListener("click", cancelVideoExport);
  const addSample = (url: string, name: string) => { try { mediaStore.getState().addSample(url, name); } catch (error) { dock.announce(error instanceof Error ? error.message : String(error)); } };
  $("#btn-s1").addEventListener("click", () => { addSample("/samples/sample-1.jpg", "Sample I — the portrait"); });
  $("#btn-s2").addEventListener("click", () => { addSample("/samples/sample-2.jpg", "Sample II — the lake"); });
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
    uiStore.getState().setMode("pro");
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

  const savedDrafts = [...mediaStore.getState().drafts];
  for (const draft of savedDrafts) if (draft.source.kind === "sample") mediaStore.getState().addSample(draft.source.url, draft.name);
  const preferred = mediaStore.getState().restoreSelectedId;
  if (preferred && mediaStore.getState().items.some(item => item.id === preferred)) mediaStore.getState().select(preferred);
  if (savedDrafts.length) {
    if (!mediaStore.getState().selectedId) void activateMedia(null);
    return;
  }
  const initialMediaId = mediaStore.getState().addSample("/samples/sample-1.jpg", "Sample I — the portrait");
  setTimeout(() => {
    const item = selectedMedia(mediaStore.getState());
    if (item?.id === initialMediaId && item.status === "loading" && !origPixels)
      showError("boot timed out — the catalog or engine did not arrive; try reloading");
  }, 15000);
}

boot();

if (import.meta.env.VITE_DESKTOP_SMOKE === "1") void import("./desktop-smoke");
