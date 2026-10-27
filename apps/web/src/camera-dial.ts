// Visual dial is optional pointer input over the same native slider. The slider
// remains the single value boundary, with keyboard and direct numeric alternatives.
export function dialMarkup() {
  const ticks = Array.from({ length: 51 }, (_, i) => {
    const a = (i * 5 - 125) * Math.PI / 180, r = i % 10 === 0 ? 66 : 71;
    return `<line x1="${80 + Math.sin(a) * r}" y1="${80 - Math.cos(a) * r}" x2="${80 + Math.sin(a) * 76}" y2="${80 - Math.cos(a) * 76}" class="${i % 10 === 0 ? "major" : "minor"}"/>`;
  }).join("");
  return `<div class="dial-stage"><svg viewBox="0 0 160 160" aria-hidden="true">${ticks}</svg><span class="fixed-index" aria-hidden="true"></span><div class="dial-grip" aria-hidden="true"><span class="dial-face"><span class="dial-witness"></span><span class="dial-center"></span></span></div><span class="dial-min" aria-hidden="true">0</span><span class="dial-max" aria-hidden="true">150</span></div>`;
}
export function bindCameraDial(host: HTMLElement, range: HTMLInputElement) {
  const grip = host.querySelector<HTMLElement>(".dial-grip")!;
  const sync = () => {
    const ratio = (range.valueAsNumber - Number(range.min)) / (Number(range.max) - Number(range.min));
    grip.style.setProperty("--dial-angle", `${-125 + ratio * 250}deg`);
    range.setAttribute("aria-valuetext", `${Math.round(range.valueAsNumber * 100)} percent`);
  };
  let drag: { id: number; x: number; value: number } | null = null;
  grip.addEventListener("pointerdown", e => {
    if (e.button !== 0 || range.disabled) return;
    drag = { id: e.pointerId, x: e.clientX, value: range.valueAsNumber };
    grip.setPointerCapture(e.pointerId); range.focus({ preventScroll: true });
  });
  grip.addEventListener("pointermove", e => {
    if (drag?.id !== e.pointerId || range.disabled) return;
    range.value = String(drag.value + (e.clientX - drag.x) * .0075);
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) grip.addEventListener(event, () => { drag = null; });
  range.addEventListener("input", sync); sync();
}
