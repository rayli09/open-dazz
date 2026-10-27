// This app uses the DOM directly; Zustand's vanilla API avoids React entirely.
import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { ModeSchema, type Mode } from "./schemas";
export type { Mode } from "./schemas";
interface UiState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}
export const selectMode = (state: UiState) => state.mode;
export const createUiStore = (mode: Mode = "simple") =>
  createStore<UiState>()(
    subscribeWithSelector((set) => ({ mode, setMode: (next) => set({ mode: next }) })),
  );
type ModeStorage = Pick<Storage, "getItem" | "setItem">;
export function browserModeStorage(): ModeStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
export function readMode(storage?: ModeStorage): Mode {
  try {
    const parsed = ModeSchema.safeParse(storage?.getItem("of-mode"));
    return parsed.success ? parsed.data : "simple";
  } catch {
    return "simple";
  }
}
// Preserve the established plain-string preference and return subscription cleanup.
export function persistMode(store: ReturnType<typeof createUiStore>, storage?: ModeStorage) {
  return store.subscribe(
    selectMode,
    (mode) => {
      try {
        storage?.setItem("of-mode", mode);
      } catch {
        /* storage can be unavailable */
      }
    },
    { fireImmediately: true },
  );
}
export const uiStore = createUiStore(readMode(browserModeStorage()));
