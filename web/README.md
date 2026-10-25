# open-fuji web app

Vite + TypeScript shell. Free hosting target: GitHub Pages or Cloudflare Pages (static, no server).

## Run

```sh
npm install
npm run dev
```

## M2: wiring the WASM core

The Rust core (`../crates/openfuji-core`) is kept WASM-clean (CI builds it for
`wasm32-unknown-unknown` on every push). M2 builds it with wasm-pack
(`--target web`), drops the generated package into `src/pkg/`, and calls it
from `main.ts` with the image's RGBA bytes + a recipe JSON + a .cube LUT —
same code path as the CLI, no JS reimplementation.

## Deployment

Live at **https://openfuji.vercel.app** (Vercel project `openfuji`,
prj_OAhQJA6QwT4z2Kweb5gYkrYOp79r, personal account ray-li09). Deployed
2026-10-25 as a static file deployment of `dist/` (no Git integration yet —
redeploy by rebuilding and pushing the files again, or connect the GitHub
repo in Vercel for push-to-deploy).
CI/CD: the GitHub repo is connected to this Vercel project (root directory
`web`, framework preset Vite, Node 24.x) — pushes to `main` deploy to
production automatically; other branches get preview deployments.
