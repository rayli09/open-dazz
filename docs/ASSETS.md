# LUT assets

`library/` remains the source of truth for the CLI, tests, licenses and desktop app.
The web production build generates `library/lut-manifest.json`, keyed by the
original library paths with SHA-256 hashes of the compressed LUT bytes. It omits
`.cube.gz` files from the web output; the browser loads immutable objects from
`https://dazz-assets.openpromo.app/<sha256>.cube.gz` as needed. The catalog,
recipes and notices remain in each deployment. Development and desktop builds
keep all LUTs local; desktop does not need the public bucket.

Before a Vercel production build, `apps/web/scripts/publish-luts.mjs` checks and
uploads missing objects and an immutable manifest marker to the `opendazz-luts` R2 bucket. Every web production build verifies that marker before omitting the local LUTs. It uses the production
Vercel environment's bucket-scoped `DAZZ_R2_ACCESS_KEY` and `DAZZ_R2_API_TOKEN`;
never commit or expose either credential. Missing credentials or upload errors
fail the build instead of publishing a release with missing LUTs. Content-addressed
objects must not be overwritten or removed while any deployed web release can
reference them. The custom domain permits public reads; the bucket contains only
public LUT assets. Cloudflare caches `.cube.gz` objects on that hostname.

A production build outside Vercel does not upload assets; publish its LUTs before
serving it. `bun run dev` and `bun run --cwd apps/web build:desktop` need no R2
credentials. When changing the asset host or authorization, verify actual web LUT
loading, failure/retry, and the offline desktop build before deploying.
