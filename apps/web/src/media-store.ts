import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { z } from "zod";
import { RecipeSchema } from "./schemas";
import { recipeForMedia } from "./recipe-for-media";
import type { MediaDraft } from "./media-session";
import { DEFAULT_PHOTO } from "./simple-presets";

export const MAX_MEDIA = 24;
export const MEDIA_FILE_TYPES = [
  "image/*",
  "video/*",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".mp4",
  ".m4v",
  ".mov",
  ".webm",
  ".mkv",
] as const;
export const MAX_FILE_BYTES = 512 * 1024 * 1024;
const photoExtension = /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif|tiff?)$/i;
const videoExtension = /\.(mp4|m4v|mov|webm|mkv)$/i;
export const FileMetadataSchema = z
  .object({
    name: z.string().min(1),
    type: z.string(),
    size: z.number().int().positive().max(MAX_FILE_BYTES),
    lastModified: z.number().finite().nonnegative(),
  })
  .refine(
    (f) =>
      f.type.startsWith("image/") ||
      f.type.startsWith("video/") ||
      photoExtension.test(f.name) ||
      videoExtension.test(f.name),
    { message: "Choose a supported photo or video." },
  );
export const PlaybackSchema = z.object({
  currentTime: z.number().nonnegative().default(0),
  duration: z.number().nonnegative().default(0),
  volume: z.number().min(0).max(1).default(1),
  muted: z.boolean().default(false),
  playing: z.boolean().default(false),
  view: z.enum(["filtered", "original"]).default("filtered"),
});
export type Playback = z.infer<typeof PlaybackSchema>;
export const MediaEditSchema = z.object({
  lookId: z.string().min(1).max(256), recipe: RecipeSchema.nullable(),
  collection: z.enum(["photo", "video"]),
  photoLookId: z.string().min(1).max(256), videoLookId: z.string().min(1).max(256),
});
export type MediaEdit = z.infer<typeof MediaEditSchema>;
export const editSignature = (edit: MediaEdit, mode: "simple" | "pro", kind: "photo" | "video") =>
  JSON.stringify([edit.lookId, edit.recipe ? recipeForMedia(edit.recipe, mode === "simple", kind === "video") : null]);
export const itemIsDirty = (item: Pick<MediaItem, "edit" | "kind" | "edited" | "exportedSignature">, mode: "simple" | "pro") =>
  item.edited && editSignature(item.edit, mode, item.kind) !== item.exportedSignature;
export interface MediaItem {
  id: string;
  fingerprint: string;
  importId: string | null;
  name: string;
  kind: "photo" | "video";
  source: File | string;
  sourceUrl: string;
  thumbnail: string | null;
  status: "queued" | "loading" | "ready" | "error";
  error: string | null;
  edited: boolean;
  exportedSignature: string | null;
  edit: MediaEdit;
  playback: Playback;
}
export interface MediaState {
  drafts: MediaDraft[];
  restoreSelectedId: string | null;
  recoveryOrder: string[];
  sessionNotice: string;
  recoveryBlocked: boolean;
  undo: { item: MediaItem; index: number; expiresAt: number } | null;
  undoRemove: () => boolean;
  restoreDrafts: (drafts: MediaDraft[], selectedId: string | null) => void;
  discardDrafts: () => void;
  markExported: (id: string, signature: string) => void;
  items: MediaItem[];
  selectedId: string | null;
  addFiles: (files: { file: File; importId?: string }[]) => {
    added: string[];
    duplicates: string[];
    errors: string[];
  };
  addSample: (url: string, name: string) => string;
  select: (id: string) => void;
  remove: (id: string) => void;
  move: (id: string, offset: number) => void;
  updateEdit: (id: string, patch: Partial<MediaEdit>) => void;
  updatePlayback: (id: string, patch: Partial<Playback>) => void;
  updateStatus: (
    id: string,
    patch: Partial<Pick<MediaItem, "status" | "error" | "thumbnail">>,
  ) => void;
  clear: () => void;
}
export const fileFingerprint = (file: Pick<File, "name" | "size" | "lastModified" | "type">) =>
  JSON.stringify([file.name, file.size, file.lastModified, file.type]);
export const mediaKind = (file: Pick<File, "name" | "type">): MediaItem["kind"] =>
  file.type.startsWith("video/") || videoExtension.test(file.name) ? "video" : "photo";
const initialEdit = (): MediaEdit => ({
  lookId: DEFAULT_PHOTO.recipeId,
  recipe: null,
  collection: "photo",
  photoLookId: DEFAULT_PHOTO.recipeId,
  videoLookId: "camcorder/cx405",
});
export function orderMediaItems<T extends { id: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a,b) => (rank.get(a.id) ?? MAX_MEDIA) - (rank.get(b.id) ?? MAX_MEDIA));
}
interface Resources {
  createUrl: (file: File) => string;
  revokeUrl: (url: string) => void;
  id: () => string;
}
export function createMediaStore(
  resources: Resources = {
    createUrl: (file) => URL.createObjectURL(file),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    id: () => crypto.randomUUID(),
  },
) {
  return createStore<MediaState>()(
    subscribeWithSelector((set, get) => {
      let undoTimer: ReturnType<typeof setTimeout> | undefined;
      const update = (id: string, change: (item: MediaItem) => MediaItem) => {
        if (!get().items.some((item) => item.id === id)) return; // Async work cannot resurrect removed media.
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? change(item) : item)),
        }));
      };
      const release = (item: MediaItem) => {
        if (item.source instanceof File) resources.revokeUrl(item.sourceUrl);
      };
      return {
        items: [], drafts: [], restoreSelectedId: null, recoveryOrder: [], sessionNotice: "", recoveryBlocked: false, undo: null,
        selectedId: null,
        restoreDrafts: (drafts, selectedId) => set({ drafts, restoreSelectedId: selectedId, recoveryOrder: drafts.map(d => d.id) }),
        discardDrafts: () => set({ drafts: [], restoreSelectedId: null, recoveryOrder: get().items.map(i => i.id) }),
        markExported: (id, signature) => update(id, item => ({ ...item, exportedSignature: signature })),
        undoRemove: () => {
          const saved = get().undo;
          if (!saved || Date.now() > saved.expiresAt || get().items.length + get().drafts.length >= MAX_MEDIA) return false;
          clearTimeout(undoTimer);
          const old = saved.item;
          const sourceUrl = old.source instanceof File ? resources.createUrl(old.source) : old.source;
          const item: MediaItem = { ...old, sourceUrl, importId: null, status: "queued", error: null,
            thumbnail: old.thumbnail?.startsWith("data:image/") ? old.thumbnail : old.kind === "photo" ? sourceUrl : null,
            playback: { ...old.playback, playing: false } };
          const items = [...get().items];
          items.splice(Math.min(saved.index, items.length), 0, item);
          set({ items, selectedId: item.id, undo: null });
          return true;
        },
        addFiles: (files) => {
          const items = [...get().items];
          const drafts = [...get().drafts];
          const added: string[] = [],
            duplicates: string[] = [],
            errors: string[] = [];
          for (const { file, importId } of files) {
            const parsed = FileMetadataSchema.safeParse({
              name: file.name,
              type: file.type,
              size: file.size,
              lastModified: file.lastModified,
            });
            if (!parsed.success) {
              errors.push(
                `${file.name}: ${file.size > MAX_FILE_BYTES ? "maximum file size is 512 MB" : "choose a non-empty photo or video"}`,
              );
              continue;
            }
            const fingerprint = fileFingerprint(file);
            const existing = items.find((item) => item.fingerprint === fingerprint);
            if (existing) {
              duplicates.push(existing.id);
              continue;
            }
            const draftIndex = drafts.findIndex(d => d.fingerprint === fingerprint);
            const draft = drafts[draftIndex];
            if (!draft && items.length + drafts.length >= MAX_MEDIA) {
              errors.push(`Keep up to ${MAX_MEDIA} items in the dock.`);
              continue;
            }
            let id = draft?.id ?? resources.id();
            for (let attempt = 0; (items.some(i => i.id === id) || drafts.some(d => d.id === id && d.fingerprint !== fingerprint)) && attempt < 10; attempt++) id = resources.id();
            if (items.some(i => i.id === id) || drafts.some(d => d.id === id && d.fingerprint !== fingerprint)) { errors.push("Could not allocate a unique media identity. Try again."); continue; }
            const sourceUrl = resources.createUrl(file);
            if (draftIndex >= 0) drafts.splice(draftIndex, 1);
            items.push({
              id,
              fingerprint,
              importId: importId ?? null,
              name: file.name,
              kind: mediaKind(file),
              source: file,
              sourceUrl,
              thumbnail: mediaKind(file) === "photo" ? sourceUrl : null,
              status: "queued",
              error: null,
              edited: draft?.edited ?? false, exportedSignature: draft?.exportedSignature ?? null,
              edit: draft ? structuredClone(draft.edit) : initialEdit(),
              playback: draft ? { ...draft.playback, playing: false } : PlaybackSchema.parse({}),
            });
            added.push(id);
          }
          if (added.length)
            set({
              items: orderMediaItems(items, get().recoveryOrder).map((item) =>
                item.playback.playing
                  ? { ...item, playback: { ...item.playback, playing: false } }
                  : item,
              ),
              drafts,
              selectedId: added.includes(get().restoreSelectedId ?? "") ? get().restoreSelectedId : added[0],
            });
          else if (duplicates.length) get().select(duplicates[0]);
          return { added, duplicates, errors };
        },
        addSample: (url, name) => {
          const existing = get().items.find((item) => item.fingerprint === `sample:${url}`);
          if (existing) {
            get().select(existing.id);
            return existing.id;
          }
          const draft = get().drafts.find(d => d.fingerprint === `sample:${url}`);
          if (!draft && get().items.length + get().drafts.length >= MAX_MEDIA)
            throw new Error(`Keep up to ${MAX_MEDIA} items in the dock.`);
          const id = draft?.id ?? resources.id();
          set((state) => ({
            items: orderMediaItems([
              ...state.items.map((item) =>
                item.playback.playing
                  ? { ...item, playback: { ...item.playback, playing: false } }
                  : item,
              ),
              {
                id,
                fingerprint: `sample:${url}`,
                importId: null,
                name,
                kind: "photo",
                source: url,
                sourceUrl: url,
                thumbnail: url,
                status: "queued",
                error: null,
                edited: draft?.edited ?? false, exportedSignature: draft?.exportedSignature ?? null,
                edit: draft ? structuredClone(draft.edit) : initialEdit(),
                playback: draft ? { ...draft.playback, playing: false } : PlaybackSchema.parse({}),
              },
            ], state.recoveryOrder),
            selectedId: id,
            drafts: state.drafts.filter(d => d.id !== draft?.id),
          }));
          return id;
        },
        select: (id) => {
          if (get().selectedId === id || !get().items.some((item) => item.id === id)) return;
          set((state) => ({
            selectedId: id,
            items: state.items.map((item) =>
              item.playback.playing
                ? { ...item, playback: { ...item.playback, playing: false } }
                : item,
            ),
          }));
        },
        remove: (id) => {
          const state = get();
          const index = state.items.findIndex((item) => item.id === id);
          if (index < 0) return;
          const removed = state.items[index],
            items = state.items.filter((item) => item.id !== id);
          set({
            items,
            undo: { item: removed, index, expiresAt: Date.now() + 30_000 },
            selectedId:
              state.selectedId === id
                ? (items[Math.min(index, items.length - 1)]?.id ?? null)
                : state.selectedId,
          });
          release(removed);
          clearTimeout(undoTimer);
          undoTimer = setTimeout(() => set({ undo: null }), 30_000);
          const timer: unknown = undoTimer;
          if (typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function") timer.unref();
        },
        move: (id, offset) => {
          const items = [...get().items],
            index = items.findIndex((item) => item.id === id);
          if (index < 0) return;
          const next = Math.min(items.length - 1, Math.max(0, index + offset));
          if (next === index) return;
          items.splice(next, 0, items.splice(index, 1)[0]);
          const live = items.map(i => i.id);
          const order = get().recoveryOrder.filter(id => live.includes(id) || get().drafts.some(d => d.id === id));
          let indexInLive = 0;
          const recoveryOrder = order.map(id => live.includes(id) ? live[indexInLive++] : id);
          recoveryOrder.push(...live.slice(indexInLive));
          set({ items, recoveryOrder });
        },
        updateEdit: (id, patch) =>
          update(id, (item) => ({ ...item,
            edited: item.edited || (!!patch.lookId && patch.lookId !== item.edit.lookId) ||
              (!!item.edit.recipe && !!patch.recipe && JSON.stringify(item.edit.recipe) !== JSON.stringify(patch.recipe)),
            edit: { ...item.edit, ...structuredClone(patch) } })),
        updatePlayback: (id, patch) =>
          update(id, (item) => ({ ...item, playback: { ...item.playback, ...patch } })),
        updateStatus: (id, patch) => update(id, (item) => ({ ...item, ...patch })),
        clear: () => {
          const items = get().items;
          clearTimeout(undoTimer);
          set({ items: [], selectedId: null, undo: null, drafts: [], restoreSelectedId: null, recoveryOrder: [] });
          items.forEach(release);
        },
      };
    }),
  );
}
export const mediaStore = createMediaStore();
export const selectedMedia = (state: MediaState) =>
  state.items.find((item) => item.id === state.selectedId);
