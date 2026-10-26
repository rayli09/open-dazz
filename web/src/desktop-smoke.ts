// Only compiled for the dedicated native CI build; absent from release builds.
import { invoke } from "@tauri-apps/api/core";
const wait = async (check: () => boolean, timeout = 240000) => {
  const until = Date.now() + timeout;
  while (!check()) { if (Date.now() > until) throw new Error("native smoke timed out"); await new Promise(r => setTimeout(r, 150)); }
};
const button = (id: string) => document.querySelector<HTMLButtonElement>(id)!;
const ready = () => wait(() => !!button("#btn-export-simple") && !button("#btn-export-simple").disabled);
void (async () => {
  try {
    await ready(); button('[data-preset="acros"]').click(); await ready();
    button("#btn-export-simple").click();
    await wait(() => document.querySelector("#cap-state")!.textContent!.includes("ORIGINAL-SIZE PNG SAVED"));
    const response = await fetch("/samples/desktop-smoke.mp4");
    if (!response.ok) throw new Error(`smoke input HTTP ${response.status}`);
    const transfer = new DataTransfer(); transfer.items.add(new File([await response.blob()], "native.mp4", { type: "video/mp4" }));
    const input = document.querySelector<HTMLInputElement>("#file")!; input.files = transfer.files; input.dispatchEvent(new Event("change", { bubbles: true }));
    await ready(); button('[data-simple-media="video"]').click(); await ready(); button('[data-preset="nokia-n95"]').click(); await ready();
    button("#btn-export-simple").click();
    await wait(() => document.querySelector("#cap-state")!.textContent!.includes("SAVED AS MP4"));
    await invoke("finish_smoke", { success: true, detail: "WKWebView: bundled catalog/WASM, actual original PNG worker and filtered MP4/audio exports" });
  } catch (error) { await invoke("finish_smoke", { success: false, detail: String(error) }); }
})();
