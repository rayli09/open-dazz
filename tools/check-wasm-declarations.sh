#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# The generator must match the crate ABI, not whichever CLI happens to be global.
version=$(awk '/^name = "wasm-bindgen"$/ { found=1; next } found && /^version = / { gsub(/"/, "", $3); print $3; exit }' Cargo.lock)
if [[ "$(wasm-bindgen --version)" != "wasm-bindgen $version" ]]; then
  echo "Install matching generator: cargo install wasm-bindgen-cli --version $version --locked" >&2
  exit 1
fi
cargo build --locked --release -p opendazz-wasm --target wasm32-unknown-unknown
output=$(mktemp -d)
trap 'rm -rf "$output"' EXIT
wasm-bindgen target/wasm32-unknown-unknown/release/opendazz_wasm.wasm \
  --target bundler --typescript --out-dir "$output" --out-name opendazz_wasm
for declaration in opendazz_wasm.d.ts opendazz_wasm_bg.wasm.d.ts; do
  diff -u "web/src/pkg/$declaration" "$output/$declaration"
done
echo "Committed public and raw WASM declarations match Rust-generated bindings ($version)."
