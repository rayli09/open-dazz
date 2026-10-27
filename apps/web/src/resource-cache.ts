/** Shared in-flight work; rejection is never retained as a successful asset. */
export class ResourceCache<T> {
    private entries = new Map<string, Promise<T>>();
    get(key: string, load: () => Promise<T>): Promise<T> {
        const existing = this.entries.get(key);
        if (existing)
            return existing;
        const pending = Promise.resolve().then(load).catch(error => {
            if (this.entries.get(key) === pending)
                this.entries.delete(key);
            throw error;
        });
        this.entries.set(key, pending);
        return pending;
    }
    delete(key: string) { this.entries.delete(key); }
}
export async function fetchText(url: string): Promise<string> {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok)
        throw new Error(`HTTP ${response.status} while loading ${url}`);
    if (new URL(url, "http://localhost").pathname.endsWith(".gz")) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        // Fetch may already decode Content-Encoding; other servers return a gzip file.
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
            return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
        }
        const text = new TextDecoder().decode(bytes);
        if (!text.includes("LUT_3D_SIZE")) throw new Error(`Invalid LUT while loading ${url}`);
        return text;
    }
    return response.text();
}
