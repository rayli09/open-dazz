/** Toggle between original and edited pixels without changing the photo or export. */
export function setupPhotoCompare(wrap: HTMLElement, original: HTMLElement, button: HTMLButtonElement) {
  let showingOriginal = false;
  const render = () => {
    original.hidden = !showingOriginal;
    button.setAttribute("aria-pressed", String(showingOriginal));
    button.textContent = showingOriginal ? "Show edited" : "Show original";
    button.setAttribute("aria-label", showingOriginal ? "Showing original. Tap to show edited photo" : "Showing edited photo. Tap to show original");
  };
  const toggle = () => { showingOriginal = !showingOriginal; render(); };
  const onClick = (event: MouseEvent) => { if ((event.target as Element).closest("button") !== button) toggle(); };
  const onButton = (event: MouseEvent) => { event.stopPropagation(); toggle(); };
  wrap.addEventListener("click", onClick);
  button.addEventListener("click", onButton);
  render();
  return { reset: () => { showingOriginal = false; render(); }, destroy: () => { wrap.removeEventListener("click", onClick); button.removeEventListener("click", onButton); } };
}
