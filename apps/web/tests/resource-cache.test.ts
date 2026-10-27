import { test, expect } from "bun:test";
import { gzipSync } from "node:zlib";
import { ResourceCache, fetchText } from "../src/resource-cache";
import { checkPhotoSize, MAX_PHOTO_PIXELS } from "../src/photo-export-contract";
test("failed in-flight work is shared, evicted and recoverable without discarding successful data", async () => {
    const cache = new ResourceCache<string>();
    let calls = 0;
    const load = async () => { if (++calls === 1)
        throw new Error("503"); return "valid"; };
    const a = cache.get("cube", load), b = cache.get("cube", load);
    expect(a).toBe(b);
    await expect(a).rejects.toThrow("503");
    expect(await cache.get("cube", load)).toBe("valid");
    expect(await cache.get("cube", load)).toBe("valid");
    expect(calls).toBe(2);
});
test("an older rejected request cannot evict its newer replacement", async () => {
    const cache = new ResourceCache<string>();
    let fail!: (e: Error) => void;
    const old = cache.get("cube", () => new Promise((_, reject) => { fail = reject; }));
    await Promise.resolve();
    cache.delete("cube");
    const next = cache.get("cube", async () => "new");
    fail(new Error("old"));
    await expect(old).rejects.toThrow("old");
    expect(await next).toBe("new");
    expect(cache.get("cube", async () => "wrong")).toBe(next);
});
test("text ingress rejects HTTP failures rather than returning their error pages", async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = (async () => new Response("LUT_3D_SIZE 2", { status: 503 })) as typeof fetch;
        await expect(fetchText("/cube")).rejects.toThrow("HTTP 503");
    }
    finally {
        globalThis.fetch = original;
    }
});
test("original PNG size contract accepts 12MP and rejects zero, huge and long-edge inputs without rescaling", () => {
    expect(() => checkPhotoSize(4032, 3024)).not.toThrow();
    expect(() => checkPhotoSize(4096, 4096)).not.toThrow();
    for (const [w, h] of [[0, 10], [1.5, 4], [8193, 10], [5000, 4000], [MAX_PHOTO_PIXELS, MAX_PHOTO_PIXELS]])
        expect(() => checkPhotoSize(w, h)).toThrow();
});

test("gzip LUTs decode losslessly and reject corrupt streams", async () => {
    const original = globalThis.fetch;
    try {
        const text = "LUT_3D_SIZE 2\n0.1 0.2 0.3\n";
        globalThis.fetch = (async () => new Response(gzipSync(text))) as typeof fetch;
        expect(await fetchText("/library/a.cube.gz?version=1")).toBe(text);
        globalThis.fetch = (async () => new Response(text, { headers: { "content-encoding": "gzip" } })) as typeof fetch;
        expect(await fetchText("/library/a.cube.gz")).toBe(text);
        globalThis.fetch = (async () => new Response("not gzip")) as typeof fetch;
        await expect(fetchText("/library/a.cube.gz")).rejects.toThrow();
    } finally { globalThis.fetch = original; }
});
