import { test, expect } from "bun:test";
import { createMediaStore, editSignature, itemIsDirty } from "../src/media-store";
import { setupMediaSession, SESSION_KEY, MAX_SESSION_BYTES, STALE_SESSION_AGE, hasUnsavedEdits } from "../src/media-session";
import { RecipeSchema } from "../src/schemas";
function fixture() {
    let id = 0, url = 0;
    const created: string[] = [], revoked: string[] = [];
    const store = createMediaStore({ id: () => `m${++id}`, createUrl: () => { const u = `blob:${++url}`; created.push(u); return u; }, revokeUrl: u => { revoked.push(u); } });
    return { store, created, revoked };
}
const file = (name = "a.jpg", modified = 1) => new File(["photo"], name, { type: "image/jpeg", lastModified: modified });
function storage(initial: string | null = null) { let value = initial; return { getItem: () => value, setItem: (_k: string, v: string) => { value = v; }, value: () => value }; }
const recipe = () => RecipeSchema.parse({ name: "Adjusted", strength: .53 });
test("versioned settings-only recovery matches original identity, keeps item IDs and never serializes binary URLs", () => {
    const a = fixture(), disk = storage();
    const session = setupMediaSession(a.store, disk);
    const ids = a.store.getState().addFiles([{ file: file("a.jpg") }, { file: file("b.jpg") }]).added;
    a.store.getState().updateEdit(ids[0], { lookId: "ricoh/community/test", recipe: recipe() });
    a.store.getState().select(ids[1]);
    session.destroy();
    const raw = disk.value()!;
    expect(raw).not.toContain('blob:');
    expect(raw).not.toContain('sourceUrl');
    expect(raw).not.toContain('thumbnail');
    expect(JSON.parse(raw).version).toBe(1);
    const b = fixture(), recovery = setupMediaSession(b.store, disk);
    expect(b.store.getState().items).toHaveLength(0);
    expect(b.store.getState().drafts).toHaveLength(2);
    const result = b.store.getState().addFiles([{ file: file("b.jpg") }, { file: file("a.jpg") }]);
    expect(result.added).toEqual([ids[1], ids[0]]);
    expect(b.store.getState().selectedId).toBe(ids[1]);
    expect(b.store.getState().items.find(i => i.id === ids[0])!.edit.recipe!.strength).toBe(.53);
    expect(b.store.getState().items.find(i => i.id === ids[0])!.edit.lookId).toBe("ricoh/community/test");
    expect(b.store.getState().drafts).toHaveLength(0);
    expect(b.store.getState().items.map(i => i.id)).toEqual(ids);
    recovery.destroy();
    a.store.getState().clear();
    b.store.getState().clear();
});
test("wrong metadata does not inherit another file's edits or collide with a pending restored ID", () => {
    const a = fixture(), disk = storage(), s = setupMediaSession(a.store, disk);
    const id = a.store.getState().addFiles([{ file: file() }]).added[0];
    a.store.getState().updateEdit(id, { lookId: "changed/look" });
    s.destroy();
    const b = fixture(), r = setupMediaSession(b.store, disk);
    const added = b.store.getState().addFiles([{ file: file("a.jpg", 2) }]).added[0];
    expect(added).not.toBe(id);
    expect(b.store.getState().drafts).toHaveLength(1);
    expect(b.store.getState().items[0].edit.lookId).not.toBe("changed/look");
    r.destroy();
    a.store.getState().clear();
    b.store.getState().clear();
});
test("undo recreates released URLs, restores edits/identity and clear releases only live URLs", () => {
    const { store, created, revoked } = fixture();
    const id = store.getState().addFiles([{ file: file() }]).added[0];
    store.getState().updateEdit(id, { lookId: "camera/test", recipe: recipe() });
    store.getState().remove(id);
    expect(revoked).toEqual([created[0]]);
    expect(store.getState().undoRemove()).toBe(true);
    expect(store.getState().items[0].id).toBe(id);
    expect(store.getState().items[0].edit.recipe!.strength).toBe(.53);
    expect(created[1]).not.toBe(created[0]);
    store.getState().clear();
    expect(revoked).toEqual(created);
    expect(store.getState().undoRemove()).toBe(false);
});
test("dirty/exported tracking is snapshot-specific and mode follows effective settings", () => {
    const { store } = fixture();
    const id = store.getState().addFiles([{ file: file() }]).added[0];
    expect(hasUnsavedEdits(store.getState(), "simple")).toBe(false);
    store.getState().updateEdit(id, { recipe: recipe() });
    store.getState().updateEdit(id, { lookId: "changed/look" });
    const item = store.getState().items[0];
    const snapshot = editSignature(item.edit, "pro", item.kind);
    store.getState().markExported(id, snapshot);
    expect(itemIsDirty(store.getState().items[0], "pro")).toBe(false);
    expect(itemIsDirty(store.getState().items[0], "simple")).toBe(true);
    store.getState().updateEdit(id, { recipe: { ...recipe(), strength: .8 } });
    expect(hasUnsavedEdits(store.getState(), "pro")).toBe(true);
    store.getState().markExported(id, snapshot);
    expect(hasUnsavedEdits(store.getState(), "pro")).toBe(true);
    store.getState().clear();
});
test("blocked/quota storage, oversized/corrupt/versioned and stale drafts are handled visibly without breaking editing", () => {
    for (const raw of ['{', JSON.stringify({ version: 99 }), 'x'.repeat(MAX_SESSION_BYTES + 1)]) {
        const { store } = fixture(), s = setupMediaSession(store, storage(raw));
        expect(store.getState().drafts).toHaveLength(0);
        expect(store.getState().sessionNotice).toContain("could not be read");
        s.destroy();
        store.getState().clear();
    }
    const a = fixture(), disk = storage(), s = setupMediaSession(a.store, disk, () => 10);
    a.store.getState().addFiles([{ file: file() }]);
    s.destroy();
    const b = fixture(), r = setupMediaSession(b.store, disk, () => STALE_SESSION_AGE + 11);
    expect(b.store.getState().drafts).toHaveLength(1);
    expect(b.store.getState().sessionNotice).toContain("old or unusual");
    r.destroy();
    const c = fixture();
    const q = setupMediaSession(c.store, { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } });
    const id = c.store.getState().addFiles([{ file: file() }]).added[0];
    q.flush();
    expect(c.store.getState().sessionNotice).toContain("could not be saved");
    c.store.getState().updateEdit(id, { lookId: "still/works" });
    expect(c.store.getState().items[0].edit.lookId).toBe("still/works");
    q.destroy();
    for (const f of [a, b, c])
        f.store.getState().clear();
});
test("multi-step reattachment preserves saved ordering and explicit reordering with pending originals", () => {
    const a = fixture(), disk = storage(), s = setupMediaSession(a.store, disk);
    const ids = a.store.getState().addFiles(['a.jpg', 'b.jpg', 'c.jpg'].map(name => ({ file: file(name) }))).added;
    a.store.getState().move(ids[2], -2);
    s.destroy();
    const b = fixture(), r = setupMediaSession(b.store, disk);
    b.store.getState().addFiles([{ file: file('a.jpg') }]);
    b.store.getState().addFiles([{ file: file('b.jpg') }]);
    b.store.getState().move(ids[1], -1);
    b.store.getState().addFiles([{ file: file('c.jpg') }]);
    expect(b.store.getState().items.map(i => i.id)).toEqual([ids[2], ids[1], ids[0]]);
    r.destroy();
    a.store.getState().clear();
    b.store.getState().clear();
});
test("untrusted recovery cannot inject URLs, duplicate identities or mismatch source kinds", () => {
    const a = fixture(), disk = storage(), s = setupMediaSession(a.store, disk);
    a.store.getState().addFiles([{ file: file() }]);
    s.destroy();
    const valid = JSON.parse(disk.value()!);
    for (const mutate of [(d: typeof valid) => d.drafts.push(d.drafts[0]), (d: typeof valid) => { d.drafts[0].source = { kind: 'sample', url: 'https://example.com/upload' }; }, (d: typeof valid) => { d.drafts[0].kind = 'video'; }]) {
        const data = structuredClone(valid);
        mutate(data);
        const b = fixture(), r = setupMediaSession(b.store, storage(JSON.stringify(data)));
        expect(b.store.getState().drafts).toHaveLength(0);
        expect(b.store.getState().sessionNotice).toContain('could not be read');
        r.destroy();
        b.store.getState().clear();
    }
    a.store.getState().clear();
});
test("unsupported saved versions remain untouched until the user explicitly resets recovery", () => {
    const original = JSON.stringify({ version: 99, drafts: [] });
    const disk = storage(original), { store } = fixture();
    const s = setupMediaSession(store, disk);
    expect(store.getState().recoveryBlocked).toBe(true);
    s.flush();
    expect(disk.value()).toBe(original);
    s.reset();
    expect(store.getState().recoveryBlocked).toBe(false);
    expect(JSON.parse(disk.value()!).version).toBe(1);
    s.destroy();
    store.getState().clear();
});
