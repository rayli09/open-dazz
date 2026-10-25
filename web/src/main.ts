// open-fuji Photo Workshop — a film-development bench in the browser.
// Engine: openfuji-core (Rust) compiled to WebAssembly. No uploads:
// every photograph is developed locally on this machine.
import { store, modeAtom, type Mode } from "./state";
import { icon, brandSigil, glyphSvg } from "./icons";

// The WASM engine loads lazily in the background so the shell, cabinet
// and photo paint immediately; develops queue until it lands.
type Engine = typeof import("./pkg/openfuji_wasm.js");
let engine: Engine | null = null;
const engineP: Promise<Engine> = import("./pkg/openfuji_wasm.js");
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

// --- P0: the camera shelf (curated cameras for simple mode) ---
const FEATURED: [string, string][] = [
  ["fuji/official/classic-chrome", "Chrome"],
  ["fuji/official/velvia", "Velvia"],
  ["fuji/official/classic-neg", "Classic Neg."],
  ["fuji/official/astia", "Astia"],
  ["fuji/official/provia", "Provia"],
  ["fuji/official/eterna", "Eterna"],
  ["fuji/community/fujifilm-acros", "Acros"],
  ["kodak/community/kodak-portra-400", "Portra 400"],
  ["kodak/community/kodak-ektar-100", "Ektar 100"],
  ["kodak/community/kodachrome-64", "Kodachrome"],
  ["kodak/community/kodak-gold-200", "Gold 200"],
  ["kodak/community/kodak-tri-minus-x-400", "Tri-X"],
  ["ilford/community/ilford-hp5-plus", "HP5"],
  ["cinestill/community/cinestill-800t", "800T"],
  ["polaroid/community/polaroid-sx-minus-70", "SX-70"],
  ["agfa/community/agfa-vista-200", "Vista"],
];
let shelfMode = true;
let developFx = false;
let flatIds: string[] = [];

// --- P0: hand-drawn camera body glyphs (squared, stroke style) ---
function glyphFor(l: LookEntry): string {
  const s = `${l.id} ${l.name}`.toLowerCase();
  let kind = "compact";
  if (/video|cine|vision|movie/.test(s)) kind = "cine";
  else if (/instant|polaroid|sx-70|sx70/.test(s)) kind = "instant";
  else if (/half/.test(s)) kind = "halfframe";
  else if (l.brand === "fuji") kind = "rangefinder";
  else if (l.brand === "polaroid") kind = "instant";
  else if (l.brand === "cinestill" || l.brand === "orwo") kind = "cine";
  else if (["kodak", "ilford", "kentmere", "foma", "bergger", "adox", "rollei"].includes(l.brand)) kind = "slr";
  return glyphSvg(kind);
}
function buildFlat() {
  flatIds = [];
  const brands = Object.keys(catalog.brands).sort((a, b) => (a === "fuji" ? -1 : b === "fuji" ? 1 : a.localeCompare(b)));
  for (const b of brands) for (const t of ["official", "community"]) for (const l of catalog.brands[b].tiers[t] ?? []) flatIds.push(l.id);
}
function updateCounter() {
  const el = document.querySelector("#film-counter");
  if (!el) return;
  const i = current ? flatIds.indexOf(current.id) : -1;
  el.textContent = i >= 0 ? `No. ${String(i + 1).padStart(3, "0")}` : "—";
}
function syncShelfUI() {
  const on = $<HTMLButtonElement>("#shelf-on"), all = $<HTMLButtonElement>("#shelf-all");
  if (!on || !all) return;
  on.className = `px-2 py-1 ${shelfMode ? "bg-ink text-paper" : "hover:bg-paper2"}`;
  all.className = `px-2 py-1 border-l border-ink ${!shelfMode ? "bg-ink text-paper" : "hover:bg-paper2"}`;
}
function fitStage() {
  const wrap = document.querySelector<HTMLElement>("#stage-wrap");
  const pw = document.querySelector<HTMLElement>("#printwrap");
  if (!wrap || !pw || !imgW || !imgH) return;
  const r = wrap.getBoundingClientRect();
  const availW = Math.max(50, r.width - 56), availH = Math.max(50, r.height - 104);
  const scale = Math.min(availW / imgW, availH / imgH);
  pw.style.width = `${Math.floor(imgW * scale)}px`;
  pw.style.height = `${Math.floor(imgH * scale)}px`;
}
let activeBrand: string | null = null;
type TypeFilter = "all" | "official" | "bw" | "video" | "color";
let activeType: TypeFilter = "all";

function lookType(l: LookEntry): "bw" | "video" | "color" {
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
        <img src="/logo.png" alt="" class="logo-light w-9 h-9 pixelated" /><img src="/logo-dark.png" alt="" class="logo-dark w-9 h-9 pixelated" />
        <span class="font-display text-[20px] font-semibold tracking-tight">open-fuji</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex border border-ink font-mono text-[11px]" role="group" aria-label="Mode">
          <button id="mode-simple" class="px-2.5 py-2 tracking-wide">SIMPLE</button>
          <button id="mode-pro" class="px-2.5 py-2 tracking-wide border-l border-ink">PRO</button>
        </div>
        <button id="btn-theme" title="Toggle dark mode" class="border border-rule p-2 hover:bg-paper2 transition-colors">
          <span class="block dark:hidden">${icon("moon", "w-4 h-4 block")}</span>
          <span class="hidden dark:block">${icon("sun", "w-4 h-4 block")}</span>
        </button>
        <a href="https://github.com/rayli09/open-fuji" target="_blank" rel="noreferrer"
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
      <div class="px-3 pt-3 pb-2 flex flex-col gap-2 shrink-0">
        <div class="flex items-center gap-2">
          <div class="flex border border-ink font-mono text-[10px]">
            <button id="shelf-on" class="px-2 py-1">SHELF</button>
            <button id="shelf-all" class="px-2 py-1 border-l border-ink">ALL FILMS</button>
          </div>
          <span id="film-counter" class="ml-auto font-mono text-[10px] bg-ink text-accent px-1.5 py-0.5"></span>
        </div>
        <div id="strip-chips"></div>
      </div>
      <div id="strip" class="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto cabinet-scroll px-3 pb-3 lg:flex-1 lg:min-h-0"></div>
    </aside>

    <!-- THE BENCH -->
    <section class="order-1 lg:order-2 bench-grid relative flex flex-col min-h-0">
      <div class="flex flex-wrap items-center gap-2 px-4 pt-4">
        <button id="btn-load" class="flex items-center gap-2 font-mono text-[12px] bg-ink text-paper px-4 py-2.5 hover:bg-stamp transition-colors">${icon("upload", "w-[18px] h-[18px]")}Photo</button>
        <button id="btn-s1" class="flex items-center gap-2 font-mono text-[12px] border border-rule bg-mat px-4 py-2.5 hover:bg-paper2 transition-colors">${icon("user", "w-[18px] h-[18px]")}Sample I</button>
        <button id="btn-s2" class="flex items-center gap-2 font-mono text-[12px] border border-rule bg-mat px-4 py-2.5 hover:bg-paper2 transition-colors">${icon("mountain", "w-[18px] h-[18px]")}Sample II</button>
        <span class="font-mono text-[10px] text-ink2 ml-auto" id="split-label"></span>
        <input id="file" type="file" accept="image/*" class="hidden" />
      </div>
      <div id="stage-wrap" class="flex-1 min-h-0 flex items-center justify-center p-4 md:p-6 overflow-hidden">
        <figure id="stage" class="relative bg-mat p-3 md:p-4 border border-ink/60 stage-shadow max-w-full select-none touch-none inline-flex flex-col">
          <div id="printwrap" class="relative overflow-hidden bg-paper2">
            <canvas id="after" class="absolute inset-0 w-full h-full block"></canvas>
            <div id="stage-load" class="absolute inset-0 bg-mat/80 flex flex-col items-center justify-center gap-3">
              <img src="/logo.png" alt="" class="logo-light w-12 h-12 pixelated skel-pulse" /><img src="/logo-dark.png" alt="" class="logo-dark w-12 h-12 pixelated skel-pulse" />
              <div class="font-mono text-[10px] tracking-[0.2em] text-ink2">LOADING THE BENCH…</div>
            </div>
            <canvas id="before" class="block w-full h-auto absolute inset-0"></canvas>
            <span class="vf absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-ink pointer-events-none z-10"></span>
            <span class="vf absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-ink pointer-events-none z-10"></span>
            <span class="vf absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-ink pointer-events-none z-10"></span>
            <span class="vf absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-ink pointer-events-none z-10"></span>
            <div id="divider" class="absolute top-0 bottom-0 w-[2px] bg-ink pointer-events-none">
              <div class="absolute top-1/2 -translate-y-1/2 -left-[13px] w-[28px] h-[28px] bg-mat border border-ink flex items-center justify-center">${icon("compare", "w-4 h-4")}</div>
            </div>
          </div>
          <figcaption class="w-full shrink-0 flex flex-wrap justify-between gap-2 pt-3 font-mono text-[10px] tracking-[0.16em] text-ink2">
            <span class="flex items-center gap-2"><span id="spin" class="hidden w-[13px] h-[13px] border-2 border-rule border-t-ink animate-spin shrink-0"></span><span id="cap-file">—</span></span><span id="cap-state"></span>
          </figcaption>
        </figure>
      </div>
      <div class="simple-only items-center gap-3 mx-4 mb-4 border border-rule bg-mat px-3 py-2.5">
        <span class="font-mono text-[10px] tracking-[0.18em] text-ink2 shrink-0">STRENGTH</span>
        <input id="s-strength-simple" type="range" min="0" max="1.5" step="0.01" value="1" class="slider flex-1" />
        <span id="v-strength-simple" class="font-mono text-[11px] w-10 text-right shrink-0">100%</span>
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
  on("strength", (v) => { R.strength = v; $("#val-strength").textContent = `${Math.round(v * 100)}%`; syncSimpleStrength(); });
  on("grain", (v) => { R.grain = { ...(R.grain ?? {}), amount: v, size: R.grain?.size ?? "small" }; $("#val-grain").textContent = v.toFixed(2); });
  on("halation", (v) => { R.halation = v; $("#val-halation").textContent = v.toFixed(2); });
  on("temp", (v) => { R.whiteBalance = { ...(R.whiteBalance ?? {}), tempShift: v }; $("#val-temp").textContent = (v >= 0 ? "+" : "") + v.toFixed(2); });
  on("tint", (v) => { R.whiteBalance = { ...(R.whiteBalance ?? {}), tintShift: v }; $("#val-tint").textContent = (v >= 0 ? "+" : "") + v.toFixed(2); });
  document.querySelectorAll<HTMLButtonElement>(".gsize").forEach((b) => {
    const active = (R.grain?.size ?? "small") === b.dataset.gsize;
    b.classList.toggle("bg-ink", active); b.classList.toggle("text-paper", active);
    b.onclick = () => { R.grain = { ...(R.grain ?? { amount: 0 }), size: b.dataset.gsize }; renderSliders(); scheduleApply(); };
  });
  syncSimpleStrength();
}

function syncSimpleStrength() {
  const inp = document.querySelector<HTMLInputElement>("#s-strength-simple");
  if (!inp) return;
  const v = (recipe as any)?.strength ?? 1;
  inp.value = String(v);
  const lbl = document.querySelector("#v-strength-simple");
  if (lbl) lbl.textContent = `${Math.round(v * 100)}%`;
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
  for (const host of [$("#chips"), $("#strip-chips")]) {
    if (host) buildChips(host);
  }
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
      <div class="dd-panel absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-mat border border-ink stage-shadow max-h-72 overflow-y-auto cabinet-scroll">
        ${opt(activeBrand === null, icon("layers", "w-4 h-4 shrink-0"), "All brands", 'data-brand=""')}
        ${brands.map((b) => opt(activeBrand === b, brandSigil(b, "w-4 h-4 shrink-0"), brandName(b), `data-brand="${b}"`)).join("")}
      </div>
    </div>
    <div class="dd relative flex-1" data-dd="type">
      <button class="dd-btn w-full flex items-center gap-2 border border-rule bg-mat px-2.5 py-2 font-mono text-[12px] hover:border-ink transition-colors" data-dd-btn="type">
        ${icon(type.icon, "w-4 h-4 shrink-0")}
        <span class="flex-1 text-left">${type.label}</span>
        ${icon("chevron-down", "dd-chev w-4 h-4 shrink-0")}</button>
      <div class="dd-panel absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-mat border border-ink stage-shadow">
        ${TYPE_CHIPS.map((t) => opt(activeType === t.key, icon(t.icon, "w-4 h-4 shrink-0"), t.label, `data-type="${t.key}"`)).join("")}
      </div>
    </div>
  </div>`;
  host.querySelectorAll<HTMLButtonElement>("[data-dd-btn]").forEach((b) =>
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); toggleDD(b); }));
  host.querySelectorAll<HTMLButtonElement>("[data-brand]").forEach((b) =>
    b.addEventListener("click", () => { activeBrand = b.dataset.brand || null; shelfMode = false; closeDDs(); renderChips(); renderCabinet(($("#search") as HTMLInputElement).value); }));
  host.querySelectorAll<HTMLButtonElement>("[data-type]").forEach((b) =>
    b.addEventListener("click", () => { activeType = b.dataset.type as TypeFilter; shelfMode = false; closeDDs(); renderChips(); renderCabinet(($("#search") as HTMLInputElement).value); }));
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
    for (const tier of ["official", "community"]) {
      const looks = (data.tiers[tier] ?? []).filter((l) => lookMatches(l, f));
      if (!looks.length) continue;
      let cards = "";
      for (const look of looks) {
        const sel = current?.id === look.id;
        cards += `<button data-look="${look.id}" class="look-card active:scale-[0.98] text-left border ${sel ? "border-ink" : "border-rule"} bg-mat hover:border-ink transition-colors">
          <span class="relative block">
            <img loading="lazy" src="${thumbUrl(look.id)}" alt="" class="w-full aspect-[3/2] object-cover block" />
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
        ${icon(tier === "official" ? "badge-check" : "users", "w-3 h-3")}${tier === "official" ? "Official" : "Community"}</div>
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
  renderStrip();
}

function renderStrip() {
  const host = $("#strip");
  if (!host) return;
  syncShelfUI();
  const items: { look: LookEntry; label: string }[] = [];
  if (shelfMode) {
    for (const [id, short] of FEATURED) { const l = findLook(id); if (l) items.push({ look: l, label: short }); }
  } else {
    const f = $<HTMLInputElement>("#search").value.trim().toLowerCase();
    const brands = Object.keys(catalog.brands).sort((a, b) => (a === "fuji" ? -1 : b === "fuji" ? 1 : a.localeCompare(b)));
    for (const brand of brands) {
      if (activeBrand && brand !== activeBrand) continue;
      for (const tier of ["official", "community"]) {
        for (const l of (catalog.brands[brand].tiers[tier] ?? []).filter((x) => lookMatches(x, f))) items.push({ look: l, label: l.name });
      }
    }
  }
  host.innerHTML = items.length ? items.map(({ look: l, label }) => {
    const sel = current?.id === l.id;
    return `<button data-look="${l.id}" class="strip-card shrink-0 w-[92px] lg:w-full text-left border ${sel ? "border-ink" : "border-rule"} bg-mat overflow-hidden active:scale-[0.97] transition-transform">
      <img src="/thumbs/${l.id.replaceAll("/", "__")}.webp" alt="" loading="lazy" class="w-full h-[62px] lg:h-[76px] object-cover block" />
      <span class="flex items-center gap-1 px-1.5 py-1 ${sel ? "bg-accent text-accentink font-semibold" : ""}">
        <span class="w-3.5 h-3.5 shrink-0 ${sel ? "" : "text-ink2"}">${glyphFor(l)}</span>
        <span class="font-mono text-[9px] leading-tight truncate">${label}</span>
      </span>
    </button>`;
  }).join("") : `<div class="font-mono text-[11px] text-ink2 py-3">No matches.</div>`;
  host.querySelectorAll<HTMLButtonElement>(".strip-card").forEach((b) =>
    b.addEventListener("click", () => {
      selectLook(b.dataset.look!);
      b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }));
}

function findLook(id: string): LookEntry | undefined {
  for (const b of Object.values(catalog.brands))
    for (const t of Object.values(b.tiers)) { const hit = t.find((l) => l.id === id); if (hit) return hit; }
  return undefined;
}

async function selectLook(id: string) {
  const entry = findLook(id); if (!entry) return;
  developFx = true;
  current = entry;
  updateCounter();
  renderCabinet($<HTMLInputElement>("#search").value);
  $("#cap-state").textContent = "LOADING…";
  const recipeUrl = "/" + entry.recipe;
  const rj: Record<string, any> = await (await fetch(recipeUrl)).json();
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

function setBusy(b: boolean) {
  $("#spin")?.classList.toggle("hidden", !b);
  $("#cap-state").textContent = b ? "DEVELOPING…" : "READY";
  const ex = $<HTMLButtonElement>("#btn-export");
  ex.disabled = b;
  ex.classList.toggle("opacity-50", b);
}
function progress(p: number) {
  const bar = $("#topbar") as HTMLDivElement | null;
  if (!bar) return;
  bar.style.width = `${p}%`;
  if (p >= 100) setTimeout(() => bar.classList.add("opacity-0"), 300);
}
function hideStageLoad() { $("#stage-load")?.classList.add("hidden"); }

function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyNow, 90);
}

async function applyNow() {
  if (!origPixels || !recipe || !current) return;
  if (!engine) { setBusy(true); return; } // engineP.then re-invokes applyNow
  setBusy(true);
  const cube = await cubeFor(current);
  const input = new Uint8Array(origPixels);
  const out = engine.apply(input, imgW, imgH, JSON.stringify(recipe), cube);
  const ctx = $<HTMLCanvasElement>("#after").getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(out), imgW, imgH), 0, 0);
  setBusy(false);
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

async function loadPhoto(source: Blob | string, name: string) {
  const bmp = await createImageBitmap(source instanceof Blob ? source : await (await fetch(source)).blob());
  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  imgW = Math.round(bmp.width * scale); imgH = Math.round(bmp.height * scale);
  const work = document.createElement("canvas"); work.width = imgW; work.height = imgH;
  const wctx = work.getContext("2d")!; wctx.drawImage(bmp, 0, 0, imgW, imgH);
  const data = wctx.getImageData(0, 0, imgW, imgH);
  origPixels = data.data;
  for (const id of ["#before", "#after"]) {
    const c = $<HTMLCanvasElement>(id); c.width = imgW; c.height = imgH;
  }
  $<HTMLCanvasElement>("#before").getContext("2d")!.putImageData(data, 0, 0);
  $("#cap-file").textContent = `${name.toUpperCase()} — ${imgW}×${imgH}`;
  setSplit(split);
  applyNow();
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
  console.error("[open-fuji]", msg);
}

// Export is deliberately plain: the developed pixels, nothing added.
function exportPNG() {
  const src = $<HTMLCanvasElement>("#after");
  src.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `openfuji-${(current?.name ?? "photo").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click(); URL.revokeObjectURL(a.href);
  }, "image/png");
}

async function boot() {
  addEventListener("error", (e) => showError(String(e.message ?? e.error ?? "unknown error")));
  addEventListener("unhandledrejection", (e) => showError(`async: ${String(e.reason?.message ?? e.reason ?? "rejection")}`));
  layout();
  progress(45);
  catalog = await fetchCatalog();
  buildFlat();
  updateCounter();
  try { renderChips(); } catch (e) { console.error("chips failed", e); }
  renderCabinet();
  $<HTMLInputElement>("#search").addEventListener("input", (e) => renderCabinet((e.target as HTMLInputElement).value));
  // Mode (simple/pro) — state lives in the Jotai store; DOM follows it.
  const applyMode = () => {
    const m = store.get(modeAtom);
    document.documentElement.dataset.mode = m;
    try { localStorage.setItem("of-mode", m); } catch {}
    requestAnimationFrame(() => fitStage());
    const on = "bg-ink text-paper", off = "hover:bg-paper2";
    $<HTMLButtonElement>("#mode-simple").className = `px-2.5 py-2 tracking-wide ${m === "simple" ? on : off}`;
    $<HTMLButtonElement>("#mode-pro").className = `px-2.5 py-2 tracking-wide border-l border-ink ${m === "pro" ? on : off}`;
  };
  store.sub(modeAtom, applyMode);
  store.set(modeAtom, document.documentElement.dataset.mode === "pro" ? "pro" : "simple");
  $<HTMLButtonElement>("#mode-simple").addEventListener("click", () => store.set(modeAtom, "simple" as Mode));
  $<HTMLButtonElement>("#mode-pro").addEventListener("click", () => store.set(modeAtom, "pro" as Mode));
  document.querySelector<HTMLInputElement>("#s-strength-simple")?.addEventListener("input", (e) => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    if (recipe) (recipe as any).strength = v;
    $("#v-strength-simple").textContent = `${Math.round(v * 100)}%`;
    const pro = document.querySelector<HTMLInputElement>("#sl-strength");
    if (pro) { pro.value = String(v); $("#val-strength").textContent = `${Math.round(v * 100)}%`; }
    scheduleApply();
  });
  addEventListener("pointerdown", (e) => { if (!(e.target as HTMLElement).closest(".dd")) closeDDs(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeDDs(); });
  $("#btn-theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    if (dark) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("of-theme", dark ? "dark" : "light"); } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#171310" : "#f2ecdc");
  });
  $("#btn-load").addEventListener("click", () => $<HTMLInputElement>("#file").click());
  $<HTMLInputElement>("#file").addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) loadPhoto(f, f.name);
  });
  $("#btn-s1").addEventListener("click", () => loadPhoto("/samples/sample-1.jpg", "Sample I — the portrait"));
  $("#btn-s2").addEventListener("click", () => loadPhoto("/samples/sample-2.jpg", "Sample II — the lake"));
  $("#btn-export").addEventListener("click", exportPNG);
  document.querySelector("#shelf-on")?.addEventListener("click", () => {
    shelfMode = true; activeBrand = null; activeType = "all";
    renderChips(); renderCabinet($<HTMLInputElement>("#search").value);
  });
  document.querySelector("#shelf-all")?.addEventListener("click", () => {
    shelfMode = false;
    renderCabinet($<HTMLInputElement>("#search").value);
  });
  addEventListener("resize", () => fitStage());
  $("#btn-export-simple").addEventListener("click", exportPNG);
  const wrap = $("#printwrap");
  const drag = (e: PointerEvent) => {
    const r = wrap.getBoundingClientRect();
    setSplit(((e.clientX - r.left) / r.width) * 100);
  };
  wrap.addEventListener("pointerdown", (e) => { drag(e); const mv = (ev: PointerEvent) => drag(ev);
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up); });
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) loadPhoto(f, f.name); });
  setTimeout(() => {
    if (!$("#stage-load")?.classList.contains("hidden") && !origPixels)
      showError("boot timed out — the catalog or engine did not arrive; try reloading");
  }, 15000);
  await loadPhoto("/samples/sample-1.jpg", "Sample I — the portrait");
  await selectLook("fuji/official/classic-chrome");
}

boot();
