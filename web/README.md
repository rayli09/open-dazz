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
