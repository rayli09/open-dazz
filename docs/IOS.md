# iOS photo prototype

The iOS target reuses the shared web editor and Rust/WASM photo engine. It is a
photo-only prototype: select an image, choose a look and strength, then export
through the iOS share sheet. The app bundles the LUT library and does not need
network access for filters. Video is not supported by this target.

On macOS with Xcode, CocoaPods and XcodeGen installed, set up the iOS Rust
targets and generate the ignored Xcode project:

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
bun install --frozen-lockfile
cd apps/desktop
bun --bun tauri ios init --ci --skip-targets-install
bun --bun tauri ios build --target aarch64-sim --debug --no-sign --ci
```

The generated project under `src-tauri/gen/` is not source-controlled; rerun
`ios init` after a fresh checkout. The simulator app is generated at
`src-tauri/gen/apple/build/arm64-sim/OpenDazz.app`. `bun run ios:dev` starts the
iOS development flow; device installation requires Xcode signing/provisioning.

The export renders the original-size PNG, then asks the user to tap Share and
choose Save Image or another share destination. The share sheet only confirms a
share action, not which destination actually saved the file. Verify the Photos
picker, HEIC input, share sheet, safe areas and memory with an actual iPhone;
simulator launch and browser emulation are not proof of those device behaviors.
