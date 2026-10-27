import { ResourceCache } from "./resource-cache";

const ASSET_ORIGIN = "https://dazz-assets.openpromo.app";
const manifestCache = new ResourceCache<Record<string, string>>();

/** The desktop app and dev server load the bundled library; web releases use immutable objects. */
export async function lutAssetUrl(localPath: string): Promise<string> {
    if (!import.meta.env.PROD || import.meta.env.MODE === "desktop") return localPath;
    const manifest = await manifestCache.get("manifest", async () => {
        const response = await fetch("/library/lut-manifest.json");
        if (!response.ok) throw new Error(`Unable to load LUT manifest (HTTP ${response.status})`);
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid LUT manifest");
        return data as Record<string, string>;
    });
    return resolveRemoteLut(localPath, manifest);
}

export function resolveRemoteLut(localPath: string, manifest: Record<string, string>): string {
    const key = decodeURIComponent(localPath).replace(/^\/+/, "");
    const hash = manifest[key];
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Missing LUT asset: ${key}`);
    return `${ASSET_ORIGIN}/${hash}.cube.gz`;
}
