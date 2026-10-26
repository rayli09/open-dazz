# macOS desktop

OpenDazz uses Tauri 2 and the bundled Vite/WASM frontend; no hosted web page, upload service or separate filter engine is involved. The target is Apple Silicon (arm64), macOS 14+. Intel Macs are unsupported and the installer rejects them before any filesystem changes. A Rosetta terminal on Apple Silicon is recognized by the hardware capability. CI requires a native arm64 runner for both packaging and WKWebView runtime checks.

From `web/`, with stable Rust, Xcode Command Line Tools and Bun 1.4.3:

```sh
bun install --frozen-lockfile
bun run desktop:dev
# For Apple Silicon packaging:
rustup target add aarch64-apple-darwin
bun run desktop:build -- --target aarch64-apple-darwin --bundles app
```

`src-tauri/` is an isolated Cargo workspace with its own lockfile, so the existing Rust/WASM CLI gates do not need Linux GTK/WebKit dependencies. Desktop builds use `dist-desktop/`, remove external font links and bundle the LUTs, thumbnails, samples, FFmpeg runtime and WASM locally. The app uses system font fallbacks offline. Bundled LUT packs retain individual licenses, including non-commercial/share-alike terms; see [library licensing](../library/README.md). Code/vendor notices are bundled under `Contents/Resources/licenses/`.

Imports retain the HTML picker/Uppy flow. Desktop exports use a native save dialog and write only its chosen path; cancelling or switching inputs before write prevents stale saves. Rendering, settings snapshots and media limits remain shared with the web app. No broad filesystem, HTTP or shell plugin permissions are granted. Close/Quit preserves the unsaved-edit confirmation; settings recovery still requires reselecting original files. Desktop storage is separate from the website's browser storage. No automatic updater is installed.

## Install a published release

**A signed/notarized release must exist first.** The command below is the versioned release contract, not a promise that `desktop-v0.1.0` has already been published:

```sh
(set -o pipefail; curl --fail --location --proto '=https' --tlsv1.2 \
  https://raw.githubusercontent.com/rayli09/open-dazz/desktop-v0.1.0/scripts/install-macos.sh \
  | bash -s -- --version 0.1.0)
```

The installer downloads only that repository's fixed release, verifies SHA-256, archive paths, bundle ID/version, Developer ID signature and Gatekeeper assessment, then installs into `~/Applications` as your user. It attaches normal quarantine and never disables Gatekeeper or strips security attributes. An unsigned development artifact is deliberately rejected. Download/verification failure leaves an existing app untouched. Close OpenDazz before updating; explicitly add `--replace` to keep a timestamped backup and install the new app. Existing app settings and original media are never deleted. A concurrent installer lock fails closed; inspect any stale lock rather than deleting unknown files blindly.

## CI and release maintenance

`macOS desktop` builds an ad-hoc development Apple Silicon app, checks the Mach-O architecture is arm64 only, packages a checksum-bearing ZIP and retains it as a short-lived Actions artifact. A separate smoke-feature build actually opens the local WKWebView, runs bundled catalog/WASM and exports a monochrome original-size PNG plus a complete filtered MP4/audio; CI decodes the results. The smoke build uses fixed temporary output paths instead of automating the native save dialog. Production builds exclude these test IPC commands and frontend hooks. Native picker/drop, save-dialog UX, full real-device codec/HEIC/HDR coverage and real-device diversity still need manual acceptance.

`Signed macOS release` is manual, main-only and publishes an immutable `desktop-v<version>` tag with arm64 ZIP, `SHA256SUMS` and installer only after signing, notarization/stapling, Gatekeeper and version checks. It requires approved existing GitHub secrets: `APPLE_CERTIFICATE` (base64 Developer ID Application p12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID`. Do not create/provision these without owner approval or print their values. Keep Cargo/config versions in sync and change the install command for a new version. Existing releases are never overwritten.

An authorized owner must confirm the signing configuration and run a successful signed release before distributing the curl command. Development CI artifacts do not meet the installer’s signature/notarization requirements.

References: [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/), [capabilities](https://v2.tauri.app/security/capabilities/), [GitHub pipeline](https://v2.tauri.app/distribute/pipelines/github/). Run `bash tools/test-macos-installer.sh` for installer safety checks and `bun test` from `web/` for save-adapter cancellation/error cases. Other shared gates remain in [Testing](TESTING.md); outputs stay in ignored build directories or temporary CI artifacts.
