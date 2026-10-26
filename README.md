<p align="center">
  <img src="web/public/logo.svg" width="72" height="72" alt="OpenDazz aperture logo" />
</p>
<h1 align="center">OpenDazz</h1>
<p align="center">A local-first film simulation workshop for photos and video.</p>
<p align="center">
  <a href="https://github.com/rayli09/open-dazz/actions/workflows/ci.yml"><img src="https://github.com/rayli09/open-dazz/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/code_license-MIT-blue.svg" alt="Code license: MIT" /></a>
  <a href="https://opendazz.vercel.app"><img src="https://img.shields.io/badge/try-OpenDazz-graphite?color=30363d" alt="Try OpenDazz" /></a>
</p>
<p align="center"><a href="https://opendazz.vercel.app"><strong>Open the app</strong></a></p>

## Run locally

Bun 1.4.3:

```sh
git clone https://github.com/rayli09/open-dazz.git
cd open-dazz
bun install --frozen-lockfile
bun run build
bun run preview
```

Open the URL printed by Vite. CLI help (stable Rust, from the repo root):
`cargo run --release -p opendazz-cli -- --help`.

Workspaces: [web frontend](web/), [Apple Silicon desktop](apps/desktop/), [CLI](apps/cli/) and [shared Rust crates](crates/). Cargo and Bun each use one root lockfile; the desktop bundles the same web/WASM engine.

## Docs

[Development & limits](web/README.md) · [CLI & looks](library/README.md) · [Recipes](recipes/README.md) · [Testing](docs/TESTING.md) · [macOS desktop & installer](docs/DESKTOP.md)

## License

Code: [MIT](LICENSE). [Recipes and LUTs](library/README.md) keep their own licenses, including non-commercial and share-alike terms. [Third-party notices](crates/ntsc-rs/LOCAL_CHANGES.md).
