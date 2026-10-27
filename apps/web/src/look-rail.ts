export interface LookRailItem { id: string; label: string; imageUrl?: string }

/** Render the same selectable look rail in any host that has room for it. */
export function renderLookRail(host: HTMLElement, items: LookRailItem[], selectedId: string | undefined, select: (id: string) => void) {
  const scroll = host.scrollLeft;
  const focused = document.activeElement instanceof HTMLElement && host.contains(document.activeElement)
    ? document.activeElement.dataset.look : undefined;
  host.replaceChildren();
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-look-card";
    button.dataset.look = item.id;
    button.setAttribute("aria-pressed", String(item.id === selectedId));
    if (item.imageUrl) {
      const image = document.createElement("img");
      image.src = item.imageUrl; image.alt = ""; image.loading = "lazy";
      button.append(image);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "mobile-look-art"; fallback.setAttribute("aria-hidden", "true");
      fallback.textContent = "VIDEO"; button.append(fallback);
    }
    const label = document.createElement("span"); label.textContent = item.label;
    button.append(label);
    button.addEventListener("click", () => select(item.id));
    host.append(button);
  }
  host.scrollLeft = scroll;
  if (focused) [...host.querySelectorAll<HTMLButtonElement>("[data-look]")].find(button => button.dataset.look === focused)?.focus({ preventScroll: true });
}
