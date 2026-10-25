// open-fuji Photo Workshop — a film-development bench in the browser.
// Engine: openfuji-core (Rust) compiled to WebAssembly. No uploads:
// every photograph is developed locally on this machine.
import { createIcons } from "lucide";

// The WASM engine loads lazily in the background so the shell, cabinet
// and photo paint immediately; develops queue until it lands.
type Engine = typeof import("./pkg/openfuji_wasm.js");
let engine: Engine | null = null;
const engineP: Promise<Engine> = import("./pkg/openfuji_wasm.js");
engineP.catch((e) => showError(`engine failed to load (${(e as Error)?.message ?? e})`));
engineP.then((m) => {
  engine = m;
  if (catalog) $("#hdr-count").textContent = `${catalog.totalLooks} looks · v${m.engine_version()}`;
  progress(90);
  applyNow();
});

const BRAND_ICONS: Record<string, string> = {
  fuji: "mountain-snow", kodak: "film", ilford: "contrast", cinestill: "clapperboard",
  agfa: "aperture", lomography: "camera", rollei: "circle-dot", foma: "layers",
  adox: "flask-conical", polaroid: "image", bergger: "moon", kentmere: "landmark",
  orwo: "globe", ricoh: "focus", emulsion: "sparkles",
};
function lookIcon(l: LookEntry): string {
  if (l.tier === "official") return "badge-check";
  if (/video/i.test(l.name)) return "video";
  if (/acros|monochrome|sepia/i.test(l.baseFilm ?? "") || /\b(b&w|bw|monochrome)\b/i.test(l.name) || l.brand === "ilford") return "contrast";
  return "swatch-book";
}
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
let activeBrand: string | null = null;
type TypeFilter = "all" | "official" | "bw" | "video" | "color";
let activeType: TypeFilter = "all";

function lookType(l: LookEntry): "bw" | "video" | "color" {
  if (/video/i.test(l.name)) return "video";
  if (/acros|monochrome|sepia/i.test(l.baseFilm ?? "") || /\b(b&w|bw|monochrome)\b/i.test(l.name) || l.brand === "ilford") return "bw";
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
  <header class="border-b border-rule">
    <div class="flex items-center justify-between px-4 py-3 md:px-6">
      <div class="flex items-center gap-3">
        <img src="/logo.png" alt="" class="w-9 h-9 pixelated" />
        <span class="font-display text-[20px] font-semibold tracking-tight">open-fuji</span>
        <span class="font-mono text-[10px] text-ink2" id="hdr-count"></span>
      </div>
      <a href="https://github.com/rayli09/open-fuji" target="_blank" rel="noreferrer"
         class="flex items-center gap-1 font-mono text-[11px] border border-rule px-2.5 py-1.5 hover:bg-paper2 transition-colors">GitHub <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i></a>
    </div>
  </header>

  <main class="grid grid-cols-1 lg:grid-cols-[292px_minmax(0,1fr)_300px]">
    <!-- THE CABINET -->
    <aside class="order-2 lg:order-1 border-b lg:border-b-0 lg:border-r border-rule flex flex-col min-h-0">
      <div class="px-3 pt-3 pb-1">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-[18px] h-[18px] bg-ink text-paper font-mono text-[10px] flex items-center justify-center shrink-0">1</span>
          <i data-lucide="sparkles" class="w-4 h-4"></i>
          <span class="font-mono text-[10px] tracking-[0.18em] text-ink2">PICK A LOOK</span>
        </div>
        <div id="chips" class="mb-2"></div>
        <div class="relative">
          <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink2 pointer-events-none"></i>
          <input id="search" type="text" placeholder="Search looks…"
            class="w-full bg-mat border border-rule pl-9 pr-3 py-2 font-mono text-[12px] placeholder:text-ink2/80 focus:outline-none focus:border-ink" />
        </div>
      </div>
      <div id="cabinet" class="cabinet-scroll overflow-y-auto px-3 pb-4 lg:max-h-[calc(100vh-210px)] max-h-[55vh]">
        ${Array.from({ length: 8 }, () => `<div class="mt-3"><div class="skel h-[92px] w-full"></div><div class="skel h-3 w-2/3 mt-2"></div></div>`).join("")}
      </div>
    </aside>

    <!-- THE BENCH -->
    <section class="order-1 lg:order-2 bench-grid relative flex flex-col lg:min-h-[60vh]">
      <div class="flex flex-wrap items-center gap-2 px-4 pt-4">
        <button id="btn-load" class="flex items-center gap-2 font-mono text-[12px] bg-ink text-paper px-4 py-2.5 hover:bg-stamp transition-colors"><i data-lucide="upload" class="w-[18px] h-[18px]"></i>Photo</button>
        <button id="btn-s1" class="flex items-center gap-2 font-mono text-[12px] border border-rule bg-mat px-4 py-2.5 hover:bg-paper2 transition-colors"><i data-lucide="package" class="w-[18px] h-[18px]"></i>Sample I</button>
        <button id="btn-s2" class="flex items-center gap-2 font-mono text-[12px] border border-rule bg-mat px-4 py-2.5 hover:bg-paper2 transition-colors"><i data-lucide="mountain" class="w-[18px] h-[18px]"></i>Sample II</button>
        <span class="font-mono text-[10px] text-ink2 ml-auto" id="split-label"></span>
        <input id="file" type="file" accept="image/*" class="hidden" />
      </div>
      <div class="flex-1 flex items-start justify-center p-4 md:p-8">
        <figure id="stage" class="relative bg-mat p-3 md:p-4 border border-rule max-w-full select-none touch-none">
          <div id="printwrap" class="relative overflow-hidden bg-paper2">
            <canvas id="after" class="block w-full h-auto max-h-[62vh] lg:max-h-none object-contain"></canvas>
            <div id="stage-load" class="absolute inset-0 bg-mat/80 flex flex-col items-center justify-center gap-3">
              <img src="/logo.png" alt="" class="w-12 h-12 pixelated skel-pulse" />
              <div class="font-mono text-[10px] tracking-[0.2em] text-ink2">LOADING THE BENCH…</div>
            </div>
            <canvas id="before" class="block w-full h-auto absolute inset-0"></canvas>
            <div id="divider" class="absolute top-0 bottom-0 w-[2px] bg-ink pointer-events-none">
              <div class="absolute top-1/2 -translate-y-1/2 -left-[13px] w-[28px] h-[28px] bg-mat border border-ink flex items-center justify-center"><i data-lucide="chevrons-left-right" class="w-4 h-4"></i></div>
            </div>
          </div>
          <figcaption class="flex flex-wrap justify-between gap-2 pt-3 font-mono text-[10px] tracking-[0.16em] text-ink2">
            <span class="flex items-center gap-2"><span id="spin" class="hidden w-[13px] h-[13px] border-2 border-rule border-t-ink animate-spin shrink-0"></span><span id="cap-file">—</span></span><span id="cap-state"></span>
          </figcaption>
        </figure>
      </div>
    </section>

    <!-- THE LEDGER -->
    <aside class="order-3 border-t lg:border-t-0 lg:border-l border-rule px-4 py-4">
      <div class="flex items-center gap-2 mb-2">
        <span class="w-[18px] h-[18px] bg-ink text-paper font-mono text-[10px] flex items-center justify-center shrink-0">3</span>
        <i data-lucide="sliders-horizontal" class="w-4 h-4"></i>
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
      <button id="btn-export" class="mt-5 w-full bg-ink text-paper font-mono text-[12px] py-3 hover:bg-stamp transition-colors flex items-center justify-center gap-2"><i data-lucide="download" class="w-4 h-4"></i>Export PNG</button>
    </aside>
  </main>

  <div class="border-t border-rule" aria-hidden="true"></div>
  <footer class="px-4 md:px-6 py-3 font-mono text-[9.5px] tracking-[0.14em] text-ink2">
    open-fuji — open film simulations · not affiliated with Fujifilm Corp. · <span id="build-stamp"></span>
  </footer>`;
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

function renderChips() {
  const host = $("#chips");
  const brands = Object.keys(catalog.brands).sort((a, b) => (a === "fuji" ? -1 : b === "fuji" ? 1 : a.localeCompare(b)));
  const chip = (active: boolean) =>
    active ? "bg-accent border-ink font-medium" : "bg-mat border-rule hover:bg-paper2";
  let html = `<div class="flex gap-1.5 mb-1.5 overflow-x-auto lg:flex-wrap no-scrollbar -mx-1 px-1">
    <button data-brand="" class="flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[11px] ${chip(activeBrand === null)}"><i data-lucide="layers" class="w-3.5 h-3.5"></i>All</button>`;
  for (const b of brands) {
    html += `<button data-brand="${b}" class="flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[11px] capitalize ${chip(activeBrand === b)}"><i data-lucide="${BRAND_ICONS[b] ?? "swatch-book"}" class="w-3.5 h-3.5"></i>${b === "emulsion" ? "Emulsion" : b}</button>`;
  }
  html += `</div><div class="flex gap-1.5 overflow-x-auto lg:flex-wrap no-scrollbar -mx-1 px-1">`;
  for (const t of TYPE_CHIPS) {
    html += `<button data-type="${t.key}" class="flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[11px] ${chip(activeType === t.key)}"><i data-lucide="${t.icon}" class="w-3.5 h-3.5"></i>${t.label}</button>`;
  }
  html += `</div>`;
  host.innerHTML = html;
  host.querySelectorAll<HTMLButtonElement>("[data-brand]").forEach((b) =>
    b.addEventListener("click", () => { activeBrand = b.dataset.brand || null; renderChips(); renderCabinet(($("#search") as HTMLInputElement).value); }));
  host.querySelectorAll<HTMLButtonElement>("[data-type]").forEach((b) =>
    b.addEventListener("click", () => { activeType = b.dataset.type as TypeFilter; renderChips(); renderCabinet(($("#search") as HTMLInputElement).value); }));
  createIcons();
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
        cards += `<button data-look="${look.id}" class="look-card text-left border ${sel ? "border-ink" : "border-rule"} bg-mat hover:border-ink transition-colors">
          <span class="relative block">
            <img loading="lazy" src="${thumbUrl(look.id)}" alt="" class="w-full aspect-[3/2] object-cover block" />
            ${look.tier === "official" ? '<span class="absolute top-1 left-1 bg-paper/90 p-[3px]"><i data-lucide="badge-check" class="w-3.5 h-3.5 block"></i></span>' : ""}
          </span>
          <span class="block px-2 py-1.5 ${sel ? "bg-accent" : ""}">
            <span class="flex items-center gap-1.5">
              <i data-lucide="${lookIcon(look)}" class="w-3.5 h-3.5 shrink-0 text-ink2"></i>
              <span class="text-[11.5px] leading-tight font-medium truncate">${look.name}</span>
            </span>
          </span>
        </button>`;
      }
      groups += `<div class="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.18em] text-ink2 px-1 pt-3 pb-1.5">
        <i data-lucide="${tier === "official" ? "badge-check" : "users"}" class="w-3 h-3"></i>${tier === "official" ? "Official" : "Community"} · ${looks.length}</div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">${cards}</div>`;
    }
    if (groups) html += `<div><div class="flex items-center gap-2 px-1 pt-3">
      <i data-lucide="${BRAND_ICONS[brand] ?? "swatch-book"}" class="w-4 h-4"></i>
      <span class="font-display font-semibold text-[14px] capitalize flex-1">${brand === "emulsion" ? "Emulsion" : brand}</span>
      <span class="font-mono text-[9.5px] text-ink2">${data.total}</span></div>${groups}</div>`;
  }
  host.innerHTML = html || `<div class="px-3 py-6 text-center"><i data-lucide="search" class="w-6 h-6 text-ink2 inline-block"></i><div class="font-mono text-[11px] text-ink2 mt-2">No matches.</div></div>`;
  host.querySelectorAll<HTMLButtonElement>(".look-card").forEach((b) =>
    b.addEventListener("click", () => selectLook(b.dataset.look!)));
  createIcons();
}

function findLook(id: string): LookEntry | undefined {
  for (const b of Object.values(catalog.brands))
    for (const t of Object.values(b.tiers)) { const hit = t.find((l) => l.id === id); if (hit) return hit; }
  return undefined;
}

async function selectLook(id: string) {
  const entry = findLook(id); if (!entry) return;
  current = entry;
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

async function boot() {
  layout();
  createIcons();
  addEventListener("error", (e) => showError(String(e.message ?? e.error ?? "unknown error")));
  addEventListener("unhandledrejection", (e) => showError(`async: ${String(e.reason?.message ?? e.reason ?? "rejection")}`));
  const bs = $("#build-stamp"); if (bs) bs.textContent = `build ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z`;
  progress(45);
  catalog = await fetchCatalog();
  $("#hdr-count").textContent = `${catalog.totalLooks} looks`;
  try { renderChips(); } catch (e) { console.error("chips failed", e); }
  renderCabinet();
  $<HTMLInputElement>("#search").addEventListener("input", (e) => renderCabinet((e.target as HTMLInputElement).value));
  $("#btn-load").addEventListener("click", () => $<HTMLInputElement>("#file").click());
  $<HTMLInputElement>("#file").addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) loadPhoto(f, f.name);
  });
  $("#btn-s1").addEventListener("click", () => loadPhoto("/samples/sample-1.jpg", "Sample I — the parcel"));
  $("#btn-s2").addEventListener("click", () => loadPhoto("/samples/sample-2.jpg", "Sample II — the coast road"));
  $("#btn-export").addEventListener("click", () => {
    $<HTMLCanvasElement>("#after").toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `openfuji-${(current?.name ?? "print").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click(); URL.revokeObjectURL(a.href);
    }, "image/png");
  });
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
  await loadPhoto("/samples/sample-1.jpg", "Sample I — the parcel");
  await selectLook("fuji/official/classic-chrome");
}

boot();
