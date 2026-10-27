import { mediaStore } from "./media-store";
import { uiStore } from "./state";
import { hasUnsavedEdits } from "./media-session";
export function setupSessionUI(host: HTMLElement, browse: () => void, reset: () => void) {
    host.innerHTML = `<p id="session-notice" role="status"></p><button id="recovery-reset" hidden type="button" class="underline px-3 py-2">Reset unreadable saved recovery</button><div id="session-recovery"><strong>Restore saved edits</strong><p id="recovery-names"></p><p>Only settings are kept locally (up to 24 items / 256KB). Reselect the same originals (matching name, size, modified time and type); files are not stored or uploaded.</p><button id="recovery-pick" type="button" class="border border-rule px-3 py-2 mt-2">Reselect originals</button> <button id="recovery-discard" type="button" class="underline px-3 py-2">Discard saved settings</button></div>`;
    const render = () => {
        const state = mediaStore.getState();
        host.hidden = !state.drafts.length && !state.sessionNotice;
        const notice = host.querySelector<HTMLElement>("#session-notice")!;
        notice.textContent = state.sessionNotice;
        notice.hidden = !state.sessionNotice;
        (host.querySelector("#recovery-reset") as HTMLButtonElement).hidden = !state.recoveryBlocked;
        const recovery = host.querySelector<HTMLElement>("#session-recovery")!;
        recovery.hidden = !state.drafts.length;
        host.querySelector("#recovery-names")!.textContent = state.drafts.map(d => d.name).join(" · ");
    };
    (host.querySelector("#recovery-pick") as HTMLButtonElement).onclick = browse;
    (host.querySelector("#recovery-discard") as HTMLButtonElement).onclick = () => {
        if (confirm("Discard the saved settings waiting for original files? This does not remove files or the items currently open."))
            mediaStore.getState().discardDrafts();
    };
    (host.querySelector("#recovery-reset") as HTMLButtonElement).onclick = () => {
        if (confirm("Discard unreadable saved settings and save this session instead? Original files and open items are unaffected."))
            reset();
    };
    const stop = mediaStore.subscribe((state, prev) => {
        if (state.drafts !== prev.drafts || state.sessionNotice !== prev.sessionNotice || state.recoveryBlocked !== prev.recoveryBlocked)
            render();
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
        if (!hasUnsavedEdits(mediaStore.getState(), uiStore.getState().mode))
            return;
        event.preventDefault();
        event.returnValue = "";
    };
    addEventListener("beforeunload", beforeUnload);
    render();
    return () => { stop(); removeEventListener("beforeunload", beforeUnload); host.replaceChildren(); };
}
