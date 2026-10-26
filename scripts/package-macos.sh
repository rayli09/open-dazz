#!/bin/bash
set -euo pipefail
app=${1:?app bundle path required}
out=${2:?output directory required}
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
exe=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
[[ $(lipo "$app/Contents/MacOS/$exe" -archs) == arm64 ]] || { echo "Expected Apple Silicon-only app" >&2; exit 1; }
codesign --verify --deep --strict "$app"
[[ -z $(find "$app" -type l -print -quit) ]] || { echo 'Installer contract rejects app symlinks' >&2; exit 1; }
mkdir -p "$out"
out=$(cd "$out" && pwd)
ditto -c -k --sequesterRsrc --keepParent "$app" "$out/OpenDazz-${version}-arm64.zip"
cp scripts/install-macos.sh "$out/install-macos.sh"
(cd "$out" && shasum -a 256 "OpenDazz-${version}-arm64.zip" install-macos.sh > SHA256SUMS)
# Check the actual packaged ZIP against the installer's extraction contract.
source scripts/install-macos.sh
entries=$(mktemp)
trap 'rm -f -- "$entries"' EXIT
validate_archive "$out/OpenDazz-${version}-arm64.zip" "$entries" || { echo 'Packaged ZIP violates installer archive contract' >&2; exit 1; }
verify_checksum "$out/OpenDazz-${version}-arm64.zip" "$out/SHA256SUMS" "OpenDazz-${version}-arm64.zip" || { echo 'Packaged ZIP checksum mismatch' >&2; exit 1; }
