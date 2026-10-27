import { uiStore } from "./state";
import { mediaStore, selectedMedia, itemIsDirty, type MediaItem } from "./media-store";
const equalDockItems = (a: MediaItem[], b: MediaItem[]) =>
  a.length === b.length &&
  a.every(
    (item, i) =>
      item.id === b[i].id &&
      item.thumbnail === b[i].thumbnail &&
      item.status === b[i].status &&
      item.error === b[i].error && item.edited === b[i].edited && item.exportedSignature === b[i].exportedSignature && item.edit === b[i].edit,
  );
export function setupMediaDock(host: HTMLElement, browse: () => void) {
  host.innerHTML = `<div class="dock-heading"><div><span class="dock-title">YOUR MEDIA</span><span id="media-count"></span></div><p id="media-notice" role="status" aria-live="polite">Drop photos and clips anywhere. Everything stays on your device.</p><button id="dock-add" type="button">+ Add media</button></div><button id="dock-close" type="button" aria-label="Close photos">×</button><div class="dock-body"><div id="media-items" role="toolbar" aria-label="Media dock. Arrow keys select; Alt plus arrows reorder; Delete removes."></div><div class="dock-tools"><button id="dock-left" aria-label="Move selected media left" title="Move left (Alt + ←)">←</button><button id="dock-right" aria-label="Move selected media right" title="Move right (Alt + →)">→</button><button id="dock-undo" type="button" title="Undo last removal (30 seconds)" hidden>Undo</button><button id="dock-remove" aria-label="Remove selected media" title="Remove selected media (Delete)">×</button></div></div>`;
  const rail = host.querySelector<HTMLElement>("#media-items")!;
  const toggle = document.querySelector<HTMLButtonElement>("#mobile-media-toggle")!;
  const narrow = matchMedia("(max-width: 600px)");
  let open = false;
  const syncVisibility = () => {
    const visible = !narrow.matches || open;
    host.inert = !visible;
    host.setAttribute("aria-hidden", String(!visible));
    document.documentElement.dataset.mediaOpen = String(open && narrow.matches);
    toggle.setAttribute("aria-expanded", String(open && narrow.matches));
  };
  const onToggle = () => { open = !open; syncVisibility(); };
  const onResize = () => { open = false; syncVisibility(); };
  toggle.addEventListener("click", onToggle);
  const close = () => { open = false; syncVisibility(); toggle.focus({ preventScroll: true }); };
  const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && open && narrow.matches) { event.preventDefault(); close(); } };
  host.querySelector<HTMLButtonElement>("#dock-close")!.addEventListener("click", close);
  document.addEventListener("keydown", onEscape);
  narrow.addEventListener("change", onResize);
  syncVisibility();
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const announce = (message: string) => {
    host.querySelector("#media-notice")!.textContent = message;
    const mobileNotice = document.querySelector<HTMLElement>("#mobile-media-notice")!;
    mobileNotice.textContent = message;
    mobileNotice.hidden = !narrow.matches || /^Added \d+ items?\.$/.test(message);
    host.classList.add("dock-notice-active");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { host.classList.remove("dock-notice-active"); mobileNotice.hidden = true; }, 3000);
  };
  const render = () => {
    const state = mediaStore.getState();
    const focusedId =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.mediaId
        : undefined;
    const scroll = rail.scrollLeft;
    rail.replaceChildren();
    host.querySelector("#media-count")!.textContent =
      `${state.items.length} ${state.items.length === 1 ? "item" : "items"}`;
    document.querySelector("#mobile-media-count")!.textContent = String(state.items.length);
    if (!state.items.length) {
      const empty = document.createElement("button");
      empty.className = "dock-empty";
      empty.textContent = "+ Drop files or add media";
      empty.onclick = browse;
      rail.append(empty);
    }
    for (const item of state.items) {
      const button = document.createElement("button");
      button.className = "dock-item";
      button.dataset.mediaId = item.id;
      button.tabIndex = item.id === state.selectedId ? 0 : -1;
      button.setAttribute("aria-pressed", String(item.id === state.selectedId));
      button.setAttribute(
        "aria-label",
        `${item.name}, ${item.kind}${item.status === "error" ? ", could not open" : ""}`,
      );
      button.title = `${item.name} · ${item.kind}`;
      const dirty = itemIsDirty(item, uiStore.getState().mode);
      if (dirty) button.setAttribute("aria-label", `${item.name}, ${item.kind}, unexported edits`);
      const thumb = document.createElement("span");
      thumb.className = "dock-thumbnail";
      if (item.thumbnail) {
        const image = document.createElement("img");
        image.src = item.thumbnail;
        image.alt = "";
        image.draggable = false;
        thumb.append(image);
      } else thumb.textContent = item.kind === "video" ? "▶" : "▧";
      const type = document.createElement("span");
      type.className = "dock-type";
      type.textContent =
        item.status === "loading"
          ? "OPENING…"
          : item.status === "error"
            ? "ERROR"
            : item.kind === "video"
              ? "VIDEO"
              : "PHOTO";
      thumb.append(type);
      const name = document.createElement("span");
      name.className = "dock-name";
      name.textContent = item.name + (dirty ? " • Edited" : item.exportedSignature ? " ✓ Exported" : "");
      button.append(thumb, name);
      rail.append(button);
    }
    (host.querySelector("#dock-undo") as HTMLButtonElement).hidden = !state.undo;
    const index = state.items.findIndex((item) => item.id === state.selectedId);
    (host.querySelector("#dock-left") as HTMLButtonElement).disabled = index <= 0;
    (host.querySelector("#dock-right") as HTMLButtonElement).disabled =
      index < 0 || index === state.items.length - 1;
    (host.querySelector("#dock-remove") as HTMLButtonElement).disabled = index < 0;
    rail.scrollLeft = scroll;
    if (focusedId)
      rail
        .querySelector<HTMLButtonElement>(`[data-media-id="${focusedId}"]`)
        ?.focus({ preventScroll: true });
  };
  const focusSelected = () => {
    const id = mediaStore.getState().selectedId;
    const button = rail.querySelector<HTMLButtonElement>(`[data-media-id="${id}"]`);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const click = (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-media-id]");
    if (button?.dataset.mediaId) {
      mediaStore.getState().select(button.dataset.mediaId);
      if (narrow.matches) { open = false; syncVisibility(); toggle.focus({ preventScroll: true }); }
      if (matchMedia("(max-width: 1023px)").matches)
        document.querySelector("main")?.scrollTo({ top: 0 });
    }
  };
  const keydown = (event: KeyboardEvent) => {
    const state = mediaStore.getState(),
      index = state.items.findIndex((item) => item.id === state.selectedId);
    if (index < 0) return;
    if (["ArrowLeft", "ArrowRight", "Home", "End", "Delete", "Backspace"].includes(event.key))
      event.preventDefault();
    else return;
    if (event.key === "Delete" || event.key === "Backspace") state.remove(state.selectedId!);
    else if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      state.move(state.selectedId!, event.key === "ArrowLeft" ? -1 : 1);
      announce("Media reordered.");
    } else {
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? state.items.length - 1
            : Math.max(
                0,
                Math.min(state.items.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)),
              );
      state.select(state.items[next].id);
    }
    focusSelected();
  };
  rail.addEventListener("click", click);
  rail.addEventListener("keydown", keydown);
  host.querySelector("#dock-add")!.addEventListener("click", browse);
  (host.querySelector("#dock-left") as HTMLButtonElement).onclick = () => {
    const item = selectedMedia(mediaStore.getState());
    if (item) mediaStore.getState().move(item.id, -1);
    focusSelected();
    announce("Media moved left.");
  };
  (host.querySelector("#dock-right") as HTMLButtonElement).onclick = () => {
    const item = selectedMedia(mediaStore.getState());
    if (item) mediaStore.getState().move(item.id, 1);
    focusSelected();
    announce("Media moved right.");
  };
  (host.querySelector("#dock-remove") as HTMLButtonElement).onclick = () => {
    const item = selectedMedia(mediaStore.getState());
    if (item) {
      mediaStore.getState().remove(item.id);
      announce(`Removed ${item.name}.`);
    }
  };
  (host.querySelector("#dock-undo") as HTMLButtonElement).onclick = () => {
    announce(mediaStore.getState().undoRemove() ? "Removal undone. Edits restored." : "Undo expired or the dock is full. Remove another item first.");
    focusSelected();
  };
  const stopUndo = mediaStore.subscribe(s => s.undo, render);
  const stopMode = uiStore.subscribe(s => s.mode, render);
  const stopItems = mediaStore.subscribe((s) => s.items, render, {
    equalityFn: equalDockItems,
    fireImmediately: true,
  });
  const stopSelection = mediaStore.subscribe(
    (s) => s.selectedId,
    () => {
      render();
      rail
        .querySelector(`[data-media-id="${mediaStore.getState().selectedId}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
  );
  return {
    announce,
    destroy: () => {
      clearTimeout(noticeTimer);
      stopItems(); stopUndo(); stopMode();
      stopSelection();
      toggle.removeEventListener("click", onToggle);
      document.removeEventListener("keydown", onEscape);
      narrow.removeEventListener("change", onResize);
      delete document.documentElement.dataset.mediaOpen;
      rail.removeEventListener("click", click);
      rail.removeEventListener("keydown", keydown);
      host.replaceChildren();
    },
  };
}
