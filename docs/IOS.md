# iOS photo app

The iOS target reuses the shared web editor and Rust/WASM photo engine. It is a
photo-focused app: select an image, scroll the look rail, adjust strength,
tap the photo to compare original and edited, and save directly to Photos. The app bundles the LUT library and does not need
network access for filters. Video is not supported by this target. iOS starts a
fresh editing session; it does not restore edits after the app closes.

On macOS with Xcode, CocoaPods and XcodeGen installed, set up the iOS Rust
targets and generate the ignored Xcode project:

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
bun install --frozen-lockfile
cd apps/desktop
bun --bun tauri ios init --ci --skip-targets-install
bun run ios:prepare
bun --bun tauri ios build --target aarch64-sim --debug --no-sign --ci
```

The generated project under `src-tauri/gen/` is not source-controlled; rerun
`ios init` and `ios:prepare` after a fresh checkout. The prepare step copies the
version-controlled iOS icons and applies the launch background to generated files. The simulator app is generated at
`src-tauri/gen/apple/build/arm64-sim/OpenDazz.app`. `bun run ios:dev` starts the
iOS development flow; device installation requires Xcode signing/provisioning.

The export renders the original-size PNG and requests add-only Photos access to
save it. Verify the Photos picker, HEIC input, permission denial and recovery,
safe areas and memory with an actual iPhone; simulator launch and browser emulation are not proof of those device behaviors.

## Ownership boundaries

`apps/web` owns the shared editor and responsive layouts. The look rail and photo
comparison are shared modules used by the web and native builds. `platform.ts` defines
the host capabilities consumed by the UI; `save-media.ts` chooses the browser,
macOS or iOS save adapter. `apps/desktop/src-tauri` is the shared Tauri host for
macOS and iOS (the directory name predates the mobile target). The Rust/WASM
engine lives in `crates/opendazz-core` and `crates/opendazz-wasm`. Only the iOS
Photos API integration belongs in `crates/tauri-plugin-photos`; it requests
add-only access and reports permission or save errors back to the editor.
`crates/tauri-plugin-ios-ui` handles native WebView safe-area behavior; CSS owns
the insets and responsive layout.

CI builds an unsigned iOS simulator app to catch Rust, Swift, capability and
asset integration regressions. For the phone-size editor regression, build with
`bun run --cwd apps/web build:ios`, serve `apps/web/dist-ios` on port 4175, and
run `bun tools/verify-browser-ios.mjs` with the external Playwright setup from
[Testing](TESTING.md). Neither replaces testing on an iPhone.

## Distribution

The simulator and development-device builds are for testing. An App Store or
TestFlight release still requires the owner's Apple distribution credentials,
provisioning, App Store Connect setup, privacy disclosures and real-device
validation. The current iOS experience supports photos; video remains available
on web and macOS.
