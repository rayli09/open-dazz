import { createStore } from "zustand/vanilla";
import { uiStore } from "./state";

type Panel = "looks" | "adjustments";
interface WorkspaceLayout {
  wide: boolean;
  desktopLooks: boolean;
  desktopAdjustments: boolean;
  drawer: Panel | null;
  toggle: (panel: Panel) => void;
  close: (panel: Panel) => void;
  resize: (wide: boolean) => void;
}
// Layout is transient UI state; media edits and persisted mode stay in their stores.
export const createWorkspaceLayout = (wide: boolean) => createStore<WorkspaceLayout>((set) => ({
  wide, desktopLooks: true, desktopAdjustments: true, drawer: null,
  toggle: panel => set(state => state.wide
    ? panel === "looks" ? { desktopLooks: !state.desktopLooks } : { desktopAdjustments: !state.desktopAdjustments }
    : { drawer: state.drawer === panel ? null : panel }),
  close: panel => set(state => state.wide
    ? panel === "looks" ? { desktopLooks: false } : { desktopAdjustments: false }
    : { drawer: state.drawer === panel ? null : state.drawer }),
  resize: wide => set({ wide, drawer: null }),
}));
export function setupWorkspaceLayout() {
  const query = matchMedia("(min-width: 1024px)"), store = createWorkspaceLayout(query.matches);
  const controller = new AbortController(), options = { signal: controller.signal };
  const triggers = { looks: document.querySelector<HTMLButtonElement>("#toggle-looks")!, adjustments: document.querySelector<HTMLButtonElement>("#toggle-adjustments")! };
  const panels = { looks: [document.querySelector<HTMLElement>("#look-cabinet")!, document.querySelector<HTMLElement>("#look-shelf")!], adjustments: [document.querySelector<HTMLElement>("#adjustments-panel")!] };
  const footer = document.querySelector<HTMLElement>(".bench-footer")!, toolbar = document.querySelector<HTMLElement>(".import-toolbar")!;
  const positionPanels = () => {
    document.documentElement.style.setProperty("--workspace-panel-top", `${toolbar.getBoundingClientRect().bottom + 4}px`);
    document.documentElement.style.setProperty("--workspace-footer-clearance", `${Math.max(0, innerHeight - footer.getBoundingClientRect().top + 8)}px`);
  };
  const resizeObserver = new ResizeObserver(positionPanels);
  resizeObserver.observe(footer); resizeObserver.observe(toolbar);
  addEventListener("resize", positionPanels, options);
  const render = () => {
    const state = store.getState(), mode = uiStore.getState().mode;
    const open = { looks: state.wide ? state.desktopLooks : state.drawer === "looks", adjustments: mode === "pro" && (state.wide ? state.desktopAdjustments : state.drawer === "adjustments") };
    document.documentElement.dataset.looksOpen = String(open.looks);
    document.documentElement.dataset.adjustmentsOpen = String(open.adjustments);
    for (const panel of ["looks", "adjustments"] as const) {
      triggers[panel].setAttribute("aria-expanded", String(open[panel]));
      for (const element of panels[panel]) {
        element.inert = !open[panel];
        if (!open[panel] && element.contains(document.activeElement)) triggers[panel].focus({ preventScroll: true });
      }
    }
  };
  const close = (panel: Panel) => { store.getState().close(panel); triggers[panel].focus({ preventScroll: true }); };
  for (const panel of ["looks", "adjustments"] as const) {
    triggers[panel].addEventListener("click", () => {
      store.getState().toggle(panel);
      if (!store.getState().wide && triggers[panel].getAttribute("aria-expanded") === "true") {
        const visible = panels[panel].find(element => element.getClientRects().length);
        visible?.focus({ preventScroll: true });
      }
    }, options);
  }
  document.querySelectorAll<HTMLElement>("[data-close-panel]").forEach(button => button.addEventListener("click", () => close(button.dataset.closePanel === "looks" ? "looks" : "adjustments"), options));
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const samples = document.querySelector<HTMLDetailsElement>(".sample-menu");
    if (samples?.open) { samples.open = false; samples.querySelector<HTMLElement>("summary")?.focus(); return; }
    if (document.querySelector(".dd.open")) return;
    const state = store.getState();
    if (!state.wide && state.drawer) close(state.drawer);
  }, options);
  for (const element of panels.looks) element.addEventListener("click", event => {
    if (!store.getState().wide && (event.target as Element).closest("[data-look],[data-preset]")) close("looks");
  }, options);
  const resize = () => store.getState().resize(query.matches);
  query.addEventListener("change", resize);
  const unsubscribe = store.subscribe(render), unsubscribeMode = uiStore.subscribe(state => state.mode, mode => {
    if (mode === "simple" && !store.getState().wide) store.getState().close("adjustments");
    render();
  });
  render();
  positionPanels();
  return () => { controller.abort(); resizeObserver.disconnect(); unsubscribe(); unsubscribeMode(); query.removeEventListener("change", resize); };
}
