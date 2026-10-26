import { z } from "zod";
import type { StoreApi } from "zustand/vanilla";
import { FileMetadataSchema, MediaEditSchema, PlaybackSchema, fileFingerprint, mediaKind, orderMediaItems, itemIsDirty, MAX_MEDIA, type MediaState, type MediaItem } from "./media-store";
export const SESSION_KEY = "opendazz-edit-session-v1";
export const MAX_SESSION_BYTES = 256 * 1024;
export const STALE_SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const SampleUrl = z.enum(["/samples/sample-1.jpg", "/samples/sample-2.jpg"]);
const DraftSchema = z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    fingerprint: z.string().max(2048), name: z.string().min(1).max(512), kind: z.enum(["photo", "video"]),
    source: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("file"), metadata: FileMetadataSchema }),
        z.object({ kind: z.literal("sample"), url: SampleUrl }),
    ]),
    edit: MediaEditSchema, playback: PlaybackSchema,
    edited: z.boolean(), exportedSignature: z.string().max(64 * 1024).nullable(),
}).refine(d => d.fingerprint === (d.source.kind === "file" ? fileFingerprint(d.source.metadata) : `sample:${d.source.url}`), "Source identity does not match metadata").refine(d => d.source.kind === "file" ? d.kind === mediaKind(d.source.metadata) && d.name === d.source.metadata.name : d.kind === "photo", "Source kind or name does not match metadata");
export type MediaDraft = z.infer<typeof DraftSchema>;
const SessionSchema = z.object({
    version: z.literal(1), updatedAt: z.number().finite().nonnegative(),
    selectedId: z.string().nullable(), drafts: z.array(DraftSchema).max(MAX_MEDIA),
}).refine(d => new Set(d.drafts.map(i => i.id)).size === d.drafts.length && new Set(d.drafts.map(i => i.fingerprint)).size === d.drafts.length, "Duplicate recovery identity");
export interface SessionStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}
export function browserSessionStorage(): SessionStorage | null {
    try {
        return window.localStorage;
    }
    catch {
        return null;
    }
}
export function draftForItem(item: MediaItem): MediaDraft {
    return {
        id: item.id, fingerprint: item.fingerprint, name: item.name, kind: item.kind,
        source: item.source instanceof File ? { kind: "file", metadata: { name: item.source.name, type: item.source.type, size: item.source.size, lastModified: item.source.lastModified } }
            : { kind: "sample", url: SampleUrl.parse(item.source) },
        edit: structuredClone(item.edit), playback: { ...item.playback, playing: false },
        edited: item.edited, exportedSignature: item.exportedSignature,
    };
}
export const hasUnsavedEdits = (state: MediaState, mode: "simple" | "pro") => state.items.some(i => itemIsDirty(i, mode)) || state.drafts.some(i => itemIsDirty(i, mode)) ||
    !!(state.undo && state.undo.expiresAt > Date.now() && itemIsDirty(state.undo.item, mode));
export function setupMediaSession(store: StoreApi<MediaState>, storage: SessionStorage | null, now = Date.now) {
    const notice = (sessionNotice: string) => { if (store.getState().sessionNotice !== sessionNotice)
        store.setState({ sessionNotice }); };
    if (!storage) {
        notice("Local settings storage is unavailable. Keep this tab open; export still works.");
        return { flush: () => { }, destroy: () => { }, reset: () => { } };
    }
    let hydrationNotice = "";
    let readBlocked = false;
    try {
        const raw = storage.getItem(SESSION_KEY);
        if (raw) {
            if (raw.length > MAX_SESSION_BYTES || new TextEncoder().encode(raw).length > MAX_SESSION_BYTES)
                throw new Error("Saved settings exceed the recovery limit");
            const parsed = SessionSchema.safeParse(JSON.parse(raw));
            if (!parsed.success)
                throw new Error("Saved settings are invalid or use an unsupported version");
            if (now() - parsed.data.updatedAt > STALE_SESSION_AGE || parsed.data.updatedAt > now() + 5 * 60000)
                notice(hydrationNotice = "These saved settings have an old or unusual timestamp. Reselect the matching originals to restore them; no file bytes were saved.");
            store.getState().restoreDrafts(parsed.data.drafts, parsed.data.selectedId);
        }
    }
    catch {
        readBlocked = true;
        store.setState({ recoveryBlocked: true });
        notice(hydrationNotice = "Saved settings could not be read. They were kept unchanged; reset saved recovery to enable saving this session. Original files are unaffected.");
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const flush = () => {
        clearTimeout(timer);
        timer = undefined;
        if (stopped || readBlocked)
            return;
        try {
            const state = store.getState();
            const drafts = orderMediaItems([...state.items.map(draftForItem), ...state.drafts], state.recoveryOrder);
            const data = SessionSchema.parse({ version: 1, updatedAt: now(), selectedId: state.selectedId ?? state.restoreSelectedId, drafts });
            const json = JSON.stringify(data);
            if (new TextEncoder().encode(json).length > MAX_SESSION_BYTES)
                throw new Error("Settings quota exceeded");
            storage.setItem(SESSION_KEY, json);
            notice(hydrationNotice);
        }
        catch {
            notice("Settings could not be saved locally (storage blocked, full or invalid). Keep this tab open; exporting still works.");
        }
    };
    const stop = store.subscribe((state, prev) => {
        if (state.items === prev.items && state.drafts === prev.drafts && state.selectedId === prev.selectedId)
            return;
        // Bounded write cadence, including during continuous playback. No binary data.
        if (!timer)
            timer = setTimeout(flush, 1000);
    });
    const reset = () => {
        // This is an explicit user action; unsupported/corrupt data is never
        // overwritten merely because the default demo opened in an older app.
        readBlocked = false;
        hydrationNotice = "";
        store.setState({ recoveryBlocked: false });
        flush();
    };
    return { flush, reset, destroy: () => { flush(); stopped = true; clearTimeout(timer); stop(); } };
}
