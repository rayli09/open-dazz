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
    return response.text();
}
