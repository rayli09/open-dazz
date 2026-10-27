import { isTauri } from "@tauri-apps/api/core";
import { hasUnsavedEdits } from "./media-session";
import { mediaStore } from "./media-store";
import { uiStore } from "./state";
export async function setupDesktop(beforeClose: () => void) {
  if (!isTauri() || import.meta.env.MODE === "ios") return;
  const [{ getCurrentWindow }, { confirm }] = await Promise.all([import("@tauri-apps/api/window"), import("@tauri-apps/plugin-dialog")]);
  let closing = false;
  const unlisten = await getCurrentWindow().onCloseRequested(async event => {
    if (closing) return;
    if (!hasUnsavedEdits(mediaStore.getState(), uiStore.getState().mode)) { beforeClose(); return; }
    event.preventDefault();
    if (await confirm("There are unexported edits. Saved settings can be restored after reselecting the original files. Close OpenDazz?", { title: "Unexported edits", kind: "warning" })) {
      beforeClose(); closing = true; await getCurrentWindow().close();
    }
  });
  addEventListener("pagehide", unlisten, { once: true });
  import.meta.hot?.dispose(unlisten);
}
