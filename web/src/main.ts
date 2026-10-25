// open-fuji Photo Workshop — a film-development bench in the browser.
// Engine: openfuji-core (Rust) compiled to WebAssembly. No uploads:
// every photograph is developed locally on this machine.
import { apply as wasmApply, engine_version } from "./pkg/openfuji_wasm.js";
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
let recipe: Record<string, any> | null = null;
const cubeCache = new Map<string, Promise<string>>();
let origPixels: Uint8ClampedArray | null = null;
let imgW = 0, imgH = 0;
let split = 50;
let applyTimer: ReturnType<typeof setTimeout> | undefined;

function layout() {
  $("#app").innerHTML = `
  <header class="border-b border-rule">
    <div class="flex flex-wrap items-end justify-between gap-3 px-4 py-3 md:px-6">
      <div>
        <div class="font-display text-[26px] leading-none font-semibold tracking-tight">OPEN—FUJI</div>
        <div class="font-mono text-[10px] tracking-[0.22em] text-ink2 mt-1">PHOTO WORKSHOP · FILM SIMULATION BENCH · EST. 2026</div>
      </div>
      <div class="flex items-center gap-3">
        <div class="font-mono text-[10px] tracking-[0.18em] text-ink2 text-right leading-relaxed">
          <span id="hdr-count">— LOOKS</span> · ENGINE v<span id="hdr-ver">–</span> (RUST → WASM)<br/>NO UPLOAD — DEVELOPED ON YOUR BENCH
        </div>
        <a href="https://github.com/rayli09/open-fuji" target="_blank" rel="noreferrer"
           class="font-mono text-[11px] tracking-[0.14em] border border-ink px-3 py-2 hover:bg-ink hover:text-paper transition-colors">GITHUB ↗</a>
      </div>
    </div>
  </header>

  <main class="grid grid-cols-1 lg:grid-cols-[292px_minmax(0,1fr)_300px]">
    <!-- THE CABINET -->
    <aside class="border-b lg:border-b-0 lg:border-r border-rule flex flex-col min-h-0">
      <div class="px-4 pt-4 pb-2">
        <div class="font-mono text-[10px] tracking-[0.22em] text-ink2">THE CABINET — 档案柜</div>
        <input id="search" type="text" placeholder="SEARCH THE CABINET…"
          class="mt-2 w-full bg-mat border border-ink px-3 py-2 font-mono text-[12px] placeholder:text-ink2/70 focus:outline-none focus:ring-2 focus:ring-ink" />
      </div>
      <div id="cabinet" class="cabinet-scroll overflow-y-auto px-2 pb-4 lg:max-h-[calc(100vh-210px)] max-h-72"></div>
    </aside>

    <!-- THE BENCH -->
    <section class="bench-grid relative flex flex-col min-h-[60vh]">
      <div class="flex flex-wrap items-center gap-2 px-4 pt-4">
        <button id="btn-load" class="font-mono text-[11px] tracking-[0.14em] bg-ink text-paper px-3 py-2 hover:bg-stamp transition-colors">LOAD A PHOTOGRAPH</button>
        <button id="btn-s1" class="font-mono text-[11px] tracking-[0.14em] border border-ink px-3 py-2 hover:bg-ink hover:text-paper transition-colors">SAMPLE I</button>
        <button id="btn-s2" class="font-mono text-[11px] tracking-[0.14em] border border-ink px-3 py-2 hover:bg-ink hover:text-paper transition-colors">SAMPLE II</button>
        <span class="font-mono text-[10px] tracking-[0.18em] text-ink2 ml-auto" id="split-label">BEFORE | AFTER — DRAG THE PRINT</span>
        <input id="file" type="file" accept="image/*" class="hidden" />
      </div>
      <div class="flex-1 flex items-start justify-center p-4 md:p-8">
        <figure id="stage" class="relative bg-mat p-3 md:p-4 border border-rule max-w-full select-none touch-none">
          <div id="printwrap" class="relative overflow-hidden bg-paper2">
            <canvas id="after" class="block w-full h-auto"></canvas>
            <canvas id="before" class="block w-full h-auto absolute inset-0"></canvas>
            <div id="divider" class="absolute top-0 bottom-0 w-[2px] bg-ink pointer-events-none">
              <div class="absolute top-1/2 -translate-y-1/2 -left-[13px] w-[28px] h-[28px] bg-paper border-2 border-ink font-mono text-[10px] flex items-center justify-center">◂▸</div>
            </div>
          </div>
          <figcaption class="flex flex-wrap justify-between gap-2 pt-3 font-mono text-[10px] tracking-[0.16em] text-ink2">
            <span id="cap-file">—</span><span id="cap-state">READY</span><span id="cap-look">—</span>
          </figcaption>
        </figure>
      </div>
      <p class="px-4 pb-4 font-mono text-[10px] tracking-[0.14em] text-ink2">TIP — DRAG &amp; DROP A PHOTO ANYWHERE ON THE BENCH. JPEG/PNG, DEVELOPED AT UP TO ${MAX_DIM}px HERE; FULL-RES LIVES IN THE CLI.</p>
    </section>

    <!-- THE LEDGER -->
    <aside class="border-t lg:border-t-0 lg:border-l border-rule px-4 py-4">
      <div class="font-mono text-[10px] tracking-[0.22em] text-ink2">THE LEDGER — 冲洗记录</div>
      <h1 id="led-name" class="font-display text-[24px] leading-tight font-bold mt-2">—</h1>
      <div id="led-meta" class="font-mono text-[10.5px] leading-relaxed tracking-[0.06em] text-ink2 mt-1"></div>
      <div id="led-note" class="text-[12px] leading-relaxed mt-2 text-ink2"></div>
      <div class="border-t border-rule mt-4 pt-3 space-y-3" id="sliders"></div>
      <div class="flex items-center gap-2 mt-3">
        <span class="font-mono text-[10px] tracking-[0.18em] text-ink2">GRAIN SIZE</span>
        <button data-gsize="small" class="gsize font-mono text-[11px] border border-ink px-2 py-1">SMALL</button>
        <button data-gsize="large" class="gsize font-mono text-[11px] border border-ink px-2 py-1">LARGE</button>
      </div>
      <button id="btn-export" class="mt-5 w-full bg-ink text-paper font-mono text-[12px] tracking-[0.2em] py-3 hover:bg-stamp transition-colors">EXPORT THE PRINT ↓ PNG</button>
      <div class="mt-4 font-mono text-[9.5px] leading-relaxed tracking-[0.08em] text-ink2">
        EVERY LOOK CARRIES ITS PROVENANCE — SOURCE, LICENSE, AND WHAT ITS
        CONVERSION COULD NOT CAPTURE. READ THE FINE PRINT IN THE REPO.
      </div>
    </aside>
  </main>

  <div class="border-t border-rule" aria-hidden="true"></div>
  <footer class="flex flex-wrap justify-between gap-2 px-4 md:px-6 py-3 font-mono text-[9.5px] tracking-[0.18em] text-ink2">
    <span>OPEN-FUJI — AN OPEN FILM-SIMULATION WORKSHOP</span>
    <span>FUJI = FUJIFILM TRADEMARK OF FUJIFILM CORP. NOT AFFILIATED. OTHER MARKS BELONG TO THEIR OWNERS.</span>
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
    sliderRow("strength", "STRENGTH 强度", 0, 1.5, 0.01, R.strength ?? 1, (v) => `${Math.round(v * 100)}%`),
    sliderRow("grain", "GRAIN 颗粒", 0, 0.9, 0.01, g.amount ?? 0, (v) => v.toFixed(2)),
    sliderRow("halation", "HALATION 光晕", 0, 1, 0.01, R.halation ?? 0, (v) => v.toFixed(2)),
    sliderRow("temp", "TEMP 色温", -1, 1, 0.01, wb.tempShift ?? 0, (v) => (v >= 0 ? "+" : "") + v.toFixed(2)),
    sliderRow("tint", "TINT 色调", -1, 1, 0.01, wb.tintShift ?? 0, (v) => (v >= 0 ? "+" : "") + v.toFixed(2)),
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

function renderCabinet(filter = "") {
  const host = $("#cabinet");
  const f = filter.trim().toLowerCase();
  const brands = Object.keys(catalog.brands).sort((a, b) => (a === "fuji" ? -1 : b === "fuji" ? 1 : a.localeCompare(b)));
  let html = "";
  for (const brand of brands) {
    const data = catalog.brands[brand];
    let n = 0; let rows = "";
    for (const tier of ["official", "community"]) {
      const looks = (data.tiers[tier] ?? []).filter((l) => !f || l.name.toLowerCase().includes(f));
      if (!looks.length) continue;
      rows += `<div class="font-mono text-[9.5px] tracking-[0.22em] text-ink2 px-2 pt-3 pb-1">${tier.toUpperCase()} — ${looks.length}</div>`;
      for (const look of looks) {
        n += 1;
        const sel = current?.id === look.id;
        rows += `<button data-look="${look.id}" class="look-row w-full flex items-baseline gap-2 px-2 py-[5px] text-left ${sel ? "bg-accent text-ink font-medium" : "hover:bg-paper2"}">
          <span class="font-mono text-[9.5px] ${sel ? "text-ink/60" : "text-ink2"} w-7 shrink-0">№${String(n).padStart(3, "0")}</span>
          <span class="text-[12.5px] leading-tight flex-1">${look.name}</span>
          <span class="font-mono text-[8.5px] tracking-[0.1em] ${sel ? "text-ink/60" : "text-ink2"}">${look.hasLut ? "LUT" : "PARAMS"}</span>
        </button>`;
      }
    }
    if (rows) html += `<div class="mt-1"><div class="flex items-baseline justify-between px-2 pt-2">
      <span class="font-display font-bold text-[15px] capitalize">${brand === "emulsion" ? "Emulsion — house styles" : brand}</span>
      <span class="font-mono text-[9.5px] text-ink2">${data.total} LOOKS</span></div>${rows}</div>`;
  }
  host.innerHTML = html || `<div class="px-3 py-4 font-mono text-[11px] text-ink2">NOTHING IN THE CABINET MATCHES.</div>`;
  host.querySelectorAll<HTMLButtonElement>(".look-row").forEach((b) =>
    b.addEventListener("click", () => selectLook(b.dataset.look!)));
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
  $("#cap-state").textContent = "FETCHING THE RECIPE…";
  const recipeUrl = "/" + entry.recipe;
  const rj: Record<string, any> = await (await fetch(recipeUrl)).json();
  recipe = rj;
  renderSliders();
  const prov = rj.provenance ?? {};
  $("#led-name").textContent = entry.name;
  $("#led-meta").innerHTML = [
    `${entry.brand.toUpperCase()} / ${entry.tier.toUpperCase()}`,
    entry.baseFilm ? `BASE FILM — ${entry.baseFilm}` : prov.film ? `BASE FILM — ${prov.film}` : "",
    prov.creator ? `RECIPE BY — ${prov.creator}` : prov.category ? `CLASS — ${prov.category}` : "",
    `LICENSE — ${rj.license ?? entry.license ?? "SEE REPO"}`,
  ].filter(Boolean).join("<br/>");
  $("#led-note").textContent = prov.description ?? rj.source ?? "";
  $("#cap-look").textContent = entry.id.toUpperCase();
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
  $("#split-label").textContent = `BEFORE ${Math.round(split)}% | AFTER ${Math.round(100 - split)}%`;
}

function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyNow, 90);
}

async function applyNow() {
  if (!origPixels || !recipe || !current) return;
  $("#cap-state").textContent = "DEVELOPING…";
  const cube = await cubeFor(current);
  const input = new Uint8Array(origPixels);
  const out = wasmApply(input, imgW, imgH, JSON.stringify(recipe), cube);
  const ctx = $<HTMLCanvasElement>("#after").getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(out), imgW, imgH), 0, 0);
  $("#cap-state").textContent = "READY — DEVELOPED LOCALLY";
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

async function boot() {
  layout();
  $("#hdr-ver").textContent = engine_version();
  catalog = await (await fetch("/library/catalog.json")).json();
  $("#hdr-count").textContent = `${catalog.totalLooks} LOOKS`;
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
  await loadPhoto("/samples/sample-1.jpg", "Sample I — the parcel");
  await selectLook("fuji/official/classic-chrome");
}

boot();
