// Custom desktop protocols can have an opaque ("null") location.origin.
// Resolve from the document URL, then retain the existing local-path fetch policy.
export function relativeAssetPath(relative: string, baseFile: string, documentUrl = location.href): string {
  return new URL(relative, new URL(`/${baseFile.replace(/^\/+/, "")}`, documentUrl)).pathname;
}
