import { lutAssetUrl } from "./lut-assets";
import { relativeAssetPath } from "./asset-url";
import "./material-sample.css";
import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { RecipeSchema, fetchJson, type Recipe } from "./schemas";
import { fetchText } from "./resource-cache";
import { renderOriginalPhoto } from "./photo-export";
import { icon } from "./icons";

type Mode = "simple" | "pro";
interface SampleState { strength: number; mode: Mode; disabled: boolean; exporting: boolean; ready: boolean }
// An isolated ephemeral store: no workshop imports, persistence or mode writes.
const store = createStore<SampleState>()(subscribeWithSelector((): SampleState => ({
  strength: 100, mode: "pro", disabled: false, exporting: false, ready: false,
})));
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const ticks = Array.from({ length: 51 }, (_, i) => {
  const a = (i * 5 - 125) * Math.PI / 180, r = i % 10 === 0 ? 66 : 71;
  return `<line x1="${80 + Math.sin(a) * r}" y1="${80 - Math.cos(a) * r}" x2="${80 + Math.sin(a) * 76}" y2="${80 - Math.cos(a) * 76}" class="${i % 10 === 0 ? "major" : "minor"}"/>`;
}).join("");
$("#material-app").innerHTML = `
<header class="study-header"><a class="brand" href="/" aria-label="OpenDazz workshop"><img src="/logo.svg" width="34" height="34" alt=""/><span>OpenDazz</span></a><span class="study-tag">CONTROL MATERIAL STUDY</span><a class="back-link" href="/">Back to workshop ${icon("arrow-up-right", "back-arrow")}</a></header>
<main><div class="intro"><div><span class="eyebrow">GRAPHITE / 01</span><h1>Quiet surfaces. Precise controls.</h1></div><p>A working material sample. Your workshop and saved edits stay untouched.</p></div>
<div class="workspace"><aside class="look-context" aria-label="Existing camera artwork"><span class="eyebrow">THE LOOK</span><div class="camera-card"><img src="/cameras/fuji-silver-384.webp" width="384" height="256" alt="Silver rangefinder camera illustration"/><div><strong>Chrome</strong><span>Muted color · crisp contrast</span></div></div><p>The current camera artwork, alongside a quieter control surface.</p><span class="material-caption">MATTE GRAPHITE<br/>SATIN ALUMINUM<br/>SOFT TOP-LEFT LIGHT</span></aside>
<section class="bench" aria-label="Filtered sample photo"><div class="bench-heading"><span>Sample II — the landscape</span><span class="live-label">LIVE SAMPLE</span></div><div class="preview-well"><canvas id="sample-preview" width="600" height="399" aria-label="Chrome filtered landscape preview"></canvas><p id="sample-loading" role="status">Loading the local sample…</p></div><div class="bench-caption"><span id="preview-caption">Chrome · 100% strength</span><span>Preview quality</span></div><p class="sample-note">Use the dial, slider or numeric field. Export saves this sample at its original 1920 × 1276 dimensions.</p><button id="sample-retry" class="quiet-button" hidden type="button">Try loading the sample again</button></section>
<section class="console" aria-labelledby="console-title"><div class="console-header"><div><span class="eyebrow">FINISH STUDY</span><h2 id="console-title">Camera console</h2></div><span class="screw" aria-hidden="true"></span></div>
<fieldset id="sample-controls" class="console-controls"><legend class="sr-only">Sample editing controls</legend><fieldset class="mode-field"><legend>EDITING MODE</legend><div id="sample-mode" class="mechanical-mode"><input id="sample-simple" type="radio" name="sample-mode" value="simple"/><label for="sample-simple">Simple</label><input id="sample-pro" type="radio" name="sample-mode" value="pro" checked/><label for="sample-pro">Pro</label><span class="mode-carriage" aria-hidden="true"></span></div></fieldset>
<div class="dial-section"><div class="control-label"><label for="sample-strength">STRENGTH</label><span>0 — 150%</span></div><div class="dial-stage"><svg viewBox="0 0 160 160" aria-hidden="true">${ticks}</svg><span class="fixed-index" aria-hidden="true"></span><div id="sample-dial" class="dial-grip" aria-hidden="true"><span class="dial-face"><span class="dial-witness"></span><span class="dial-center"></span></span></div><span class="dial-min" aria-hidden="true">0</span><span class="dial-max" aria-hidden="true">150</span></div>
<input id="sample-strength" type="range" min="0" max="150" step="1" value="100" aria-label="Strength" aria-describedby="dial-help"/><div class="numeric-row"><label for="sample-strength-number">Strength</label><div class="numeric-recess"><input id="sample-strength-number" type="number" min="0" max="150" step="1" value="100" inputmode="numeric" aria-label="Strength percent"/><span aria-hidden="true">%</span></div></div><p id="dial-help">Drag left or right. Use arrow keys or type a value.</p></div>
<div class="export-section"><div class="export-spec"><span>PNG</span><span>1920 × 1276</span></div><div class="shutter-base"><button id="sample-export" type="button"><span class="shutter-face">${icon("download", "export-glyph")}<span id="sample-export-label">Export PNG</span><span class="shutter-dimple" aria-hidden="true"></span></span></button></div></div></fieldset>
<button id="sample-cancel" class="quiet-button" type="button" hidden>Cancel export</button><p id="sample-status" role="status" aria-live="polite">Preparing sample…</p><div class="state-preview"><label><input id="sample-disabled" type="checkbox"/> Show disabled state</label><span id="sample-mode-value">Pro mode</span></div><p class="mode-note">The switch is local to this study. Strength stays adjustable in either sample mode.</p></section></div><footer><span>Material preview — isolated from the editor</span><span>CSS / SVG controls · no sound</span></footer></main>`;

type Engine = typeof import("./pkg/opendazz_wasm.js");
let engine: Engine | null = null, recipe: Recipe | null = null, cube: string | undefined;
let source: Blob | null = null, pixels: Uint8Array | null = null;
let previewWidth = 600, previewHeight = 399, scheduled: number | null = null, loadVersion = 0;
let exportController: AbortController | null = null;
const range = $<HTMLInputElement>("#sample-strength"), numeric = $<HTMLInputElement>("#sample-strength-number"), status = $("#sample-status");
const clamp = (v: number) => Math.min(150, Math.max(0, Math.round(v)));
function setStrength(value: number) {
  if (Number.isFinite(value) && !store.getState().disabled) store.setState({ strength: clamp(value) });
}
function paintPreview(): boolean {
  scheduled = null;
  if (!engine || !recipe || !pixels) return false;
  const strength = store.getState().strength;
  try {
    const out = engine.apply(pixels, previewWidth, previewHeight, JSON.stringify({ ...recipe, strength: strength / 100 }), cube);
    $<HTMLCanvasElement>("#sample-preview").getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(out), previewWidth, previewHeight), 0, 0);
    $("#preview-caption").textContent = `Chrome · ${strength}% strength`;
    return true;
  } catch (error) {
    status.textContent = "The sample could not render. Try loading it again.";
    $("#sample-retry").hidden = false;
    store.setState({ ready: false });
    console.warn("[opendazz material study] preview", error);
    return false;
  }
}
function render(state: SampleState) {
  range.value = String(state.strength); range.setAttribute("aria-valuetext", `${state.strength} percent`);
  if (document.activeElement !== numeric || numeric.validity.valid) numeric.value = String(state.strength);
  $("#sample-dial").style.setProperty("--dial-angle", `${-125 + state.strength / 150 * 250}deg`);
  range.style.setProperty("--range-fill", `${state.strength / 150 * 100}%`);
  for (const mode of ["simple", "pro"] as const) $<HTMLInputElement>(`#sample-${mode}`).checked = state.mode === mode;
  $("#sample-mode").dataset.mode = state.mode;
  $("#sample-mode-value").textContent = `${state.mode === "simple" ? "Simple" : "Pro"} mode`;
  $<HTMLFieldSetElement>("#sample-controls").disabled = state.disabled || !state.ready;
  $<HTMLButtonElement>("#sample-export").disabled = state.disabled || !state.ready || state.exporting;
  $("#sample-export-label").textContent = state.exporting ? "Exporting…" : "Export PNG";
  $("#sample-cancel").hidden = !state.exporting;
  $(".console").classList.toggle("controls-disabled", state.disabled);
}
store.subscribe(render);
store.subscribe(s => s.strength, () => { if (scheduled === null) scheduled = requestAnimationFrame(paintPreview); });
render(store.getState());
range.addEventListener("input", () => setStrength(range.valueAsNumber));
numeric.addEventListener("input", () => {
  numeric.setAttribute("aria-invalid", String(!numeric.validity.valid));
  if (numeric.validity.valid) setStrength(numeric.valueAsNumber);
});
numeric.addEventListener("change", () => {
  setStrength(Number.isFinite(numeric.valueAsNumber) ? numeric.valueAsNumber : store.getState().strength);
  numeric.value = String(store.getState().strength); numeric.setAttribute("aria-invalid", "false");
});
for (const mode of ["simple", "pro"] as const) $<HTMLInputElement>(`#sample-${mode}`).addEventListener("change", e => {
  if ((e.target as HTMLInputElement).checked) store.setState({ mode });
});
$<HTMLInputElement>("#sample-disabled").addEventListener("change", e => store.setState({ disabled: (e.target as HTMLInputElement).checked }));
// Optional linear dial dragging. Native slider + direct numeric input remain
// full keyboard/touch alternatives; no circular gesture is necessary.
let drag: { id: number; x: number; value: number } | null = null;
const dial = $("#sample-dial");
dial.addEventListener("pointerdown", e => {
  if (store.getState().disabled || !store.getState().ready || e.button !== 0) return;
  drag = { id: e.pointerId, x: e.clientX, value: store.getState().strength };
  dial.setPointerCapture(e.pointerId); range.focus({ preventScroll: true });
});
dial.addEventListener("pointermove", e => { if (drag?.id === e.pointerId) setStrength(drag.value + (e.clientX - drag.x) * .75); });
for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) dial.addEventListener(event, () => { drag = null; });

async function loadSample() {
  const version = ++loadVersion;
  store.setState({ ready: false }); $("#sample-loading").hidden = false; $("#sample-retry").hidden = true;
  $("#sample-loading").textContent = "Loading the local sample…"; status.textContent = "Preparing sample…";
  try {
    const path = "/library/fuji/community/recipes/005-docu-classic-chrome-john-peltier.json";
    const [loadedEngine, loadedRecipe, response] = await Promise.all([
      import("./pkg/opendazz_wasm.js"), fetchJson(path, RecipeSchema), fetch("/samples/sample-2.jpg"),
    ]);
    if (!response.ok) throw new Error(`Sample photo HTTP ${response.status}`);
    const loadedCube = loadedRecipe.baseLut ? await fetchText(await lutAssetUrl(relativeAssetPath(loadedRecipe.baseLut, path))) : undefined;
    const blob = await response.blob(), bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    if (version !== loadVersion) { bitmap.close(); return; }
    previewWidth = Math.min(600, bitmap.width); previewHeight = Math.round(bitmap.height * previewWidth / bitmap.width);
    const canvas = $<HTMLCanvasElement>("#sample-preview"); canvas.width = previewWidth; canvas.height = previewHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, previewWidth, previewHeight); bitmap.close();
    pixels = new Uint8Array(ctx.getImageData(0, 0, previewWidth, previewHeight).data);
    engine = loadedEngine; recipe = loadedRecipe; cube = loadedCube; source = blob;
    if (!paintPreview()) { $("#sample-loading").textContent = "Preview unavailable"; return; }
    $("#sample-loading").hidden = true; store.setState({ ready: true });
    status.textContent = "Ready. Changes stay on this page.";
  } catch (error) {
    if (version !== loadVersion) return;
    $("#sample-loading").textContent = "Sample unavailable"; $("#sample-retry").hidden = false;
    status.textContent = "Check your connection and try loading the sample again.";
    console.warn("[opendazz material study] load", error);
  }
}
async function exportSample() {
  const state = store.getState();
  if (!state.ready || state.disabled || state.exporting || !source || !recipe) return;
  const strength = state.strength, snapshot = { ...structuredClone(recipe), strength: strength / 100 };
  const controller = new AbortController(); exportController = controller;
  store.setState({ exporting: true }); status.textContent = `Exporting the ${strength}% sample…`;
  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    if (controller.signal.aborted) { bitmap.close(); return; }
    const blob = await renderOriginalPhoto(bitmap, { kind: "recipe", recipe: snapshot, cube }, controller.signal);
    if (controller.signal.aborted) return;
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "opendazz-material-study.png";
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    status.textContent = `1920 × 1276 PNG exported at ${strength}% strength.`;
  } catch (error) {
    if (controller.signal.aborted) return;
    status.textContent = "Export could not finish. Check your connection and try again.";
    console.warn("[opendazz material study] export", error);
  } finally {
    if (exportController === controller) { exportController = null; store.setState({ exporting: false }); }
  }
}
$("#sample-export").addEventListener("click", exportSample);
$("#sample-cancel").addEventListener("click", () => {
  exportController?.abort(); exportController = null; store.setState({ exporting: false }); status.textContent = "Export cancelled. Ready when you are.";
});
$("#sample-retry").addEventListener("click", loadSample);
addEventListener("pagehide", () => { ++loadVersion; exportController?.abort(); if (scheduled !== null) cancelAnimationFrame(scheduled); scheduled = null; });
void loadSample();
