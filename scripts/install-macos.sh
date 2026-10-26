#!/bin/bash
# Version-pinned, per-user install. Never changes Gatekeeper or removes app data.
set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
fail() { printf 'OpenDazz: %s\n' "$*" >&2; exit 1; }
valid_version() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }
validate_archive() {
  local entry
  unzip -Z -1 "$1" > "$2"
  while IFS= read -r entry; do
    [[ "$entry" =~ ^[A-Za-z0-9._/-]+$ ]] || return 1
    case "$entry" in OpenDazz.app/Contents/*|OpenDazz.app/|OpenDazz.app|__MACOSX/|__MACOSX/._OpenDazz.app|__MACOSX/OpenDazz.app/*) ;; *) return 1 ;; esac
    case "/$entry/" in *'/../'*|*'/./'*|*'//'*) return 1 ;; esac
  done < "$2"
  # This bundle has no embedded frameworks/symlinks; refuse link extraction.
  unzip -Z -l "$1" | awk 'substr($0,1,1)=="l" { bad=1 } END { exit bad ? 1 : 0 }'
}
verify_checksum() {
  local expected actual
  expected=$(awk -v name="$3" '$2==name && length($1)==64 && $1 !~ /[^0-9a-f]/ {print $1; count++} END {if(count!=1)exit 1}' "$2") || return 1
  actual=$(shasum -a 256 "$1") || return 1
  [[ "${actual%% *}" == "$expected" ]]
}
main() {
  local version='' replace=0 install_dir="${HOME:?}/Applications" work='' stage='' backup='' lock='' dest archive
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version) [[ $# -ge 2 ]] || fail '--version needs a value'; version=$2; shift 2 ;;
      --replace) replace=1; shift ;;
      --directory) [[ $# -ge 2 ]] || fail '--directory needs a value'; install_dir=$2; shift 2 ;;
      *) fail 'Usage: install-macos.sh --version X.Y.Z [--replace] [--directory ABSOLUTE_PATH]' ;;
    esac
  done
  valid_version "$version" || fail 'Supply an exact version X.Y.Z; latest, URLs and shell fragments are not accepted.'
  [[ $(uname -s) == Darwin ]] || fail 'macOS only.'
  [[ $(id -u) -ne 0 ]] || fail 'Run as your normal user, without sudo.'
  [[ $(sw_vers -productVersion | cut -d. -f1) -ge 14 ]] || fail 'macOS 14 or later is required.'
  case $(uname -m) in arm64|x86_64) ;; *) fail 'Unsupported CPU architecture.' ;; esac
  [[ "$install_dir" == /* && ! -L "$install_dir" ]] || fail 'Choose an absolute, non-symlink installation directory.'
  mkdir -p "$install_dir"
  [[ -O "$install_dir" && -w "$install_dir" ]] || fail 'Installation directory must be owned and writable by you.'
  dest="$install_dir/OpenDazz.app"
  lock="$install_dir/.opendazz-install.lock"
  mkdir "$lock" 2>/dev/null || fail "Another installer or a stale lock exists: $lock"
  trap '[[ -n "$backup" && ! -e "$dest" ]] && mv "$backup" "$dest"; [[ -z "$work" ]] || rm -rf -- "$work"; [[ -z "$stage" ]] || rm -rf -- "$stage"; [[ -z "$lock" ]] || rmdir "$lock"' EXIT
  [[ ! -L "$dest" ]] || fail 'Refusing to replace an app symlink.'
  if [[ -e "$dest" ]]; then
    [[ "$replace" == 1 && -d "$dest" && -O "$dest" ]] || fail 'App already exists. Close it, then use --replace to retain a backup and update.'
  fi
  if pgrep -f '/OpenDazz[.]app/Contents/MacOS/' >/dev/null; then fail 'Close every running OpenDazz instance before installing.'; fi
  work=$(mktemp -d "${TMPDIR:-/tmp}/opendazz-download.XXXXXX")
  stage=$(mktemp -d "$install_dir/.opendazz-stage.XXXXXX")
  # Only our mktemp directories are removed; existing app/data are never deleted.
  archive="OpenDazz-${version}-universal.zip"
  local base="https://github.com/rayli09/open-dazz/releases/download/desktop-v${version}"
  curl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 20 --max-time 600 --max-filesize 1073741824 "$base/$archive" -o "$work/$archive"
  curl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 20 --max-time 60 "$base/SHA256SUMS" -o "$work/SHA256SUMS"
  verify_checksum "$work/$archive" "$work/SHA256SUMS" "$archive" || fail 'Missing, ambiguous or mismatched release checksum; app was not modified.'
  validate_archive "$work/$archive" "$work/entries" || fail 'Unsafe archive entries or symlinks.'
  ditto -x -k "$work/$archive" "$stage"
  local app="$stage/OpenDazz.app" plist="$stage/OpenDazz.app/Contents/Info.plist"
  [[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist") == com.rayli09.opendazz ]] || fail 'Wrong application identity.'
  [[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist") == "$version" ]] || fail 'Wrong application version.'
  local executable
  executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")
  [[ "$executable" =~ ^[A-Za-z0-9_-]+$ ]] || fail 'Unsafe executable name.'
  lipo "$app/Contents/MacOS/$executable" -verify_arch arm64 x86_64
  codesign --verify --deep --strict --verbose=2 "$app"
  local signature
  signature=$(codesign -dv --verbose=4 "$app" 2>&1)
  grep -q '^Authority=Developer ID Application:' <<< "$signature" || fail 'A Developer ID Application signature is required.'
  spctl --assess --type execute --verbose=2 "$app" || fail 'Gatekeeper rejected this build; use a signed and notarized release.'
  # curl itself does not attach quarantine; retain normal first-launch security.
  xattr -w com.apple.quarantine "0083;$(printf '%x' "$(date +%s)");OpenDazz;" "$app"
  if [[ -e "$dest" ]]; then
    backup="$install_dir/OpenDazz.backup-$(date -u +%Y%m%dT%H%M%SZ)-$$.app"
    [[ ! -e "$backup" ]] || fail 'Backup destination already exists.'
    mv "$dest" "$backup"
  fi
  [[ ! -e "$dest" ]] || fail "Destination changed during installation; backup was retained."
  mv "$app" "$dest"
  rm -rf -- "$work" "$stage"
  rmdir "$lock"
  trap - EXIT
  printf 'Installed %s at %s. Open it normally in Finder.\n' "$version" "$dest"
  [[ -z "$backup" ]] || printf 'Previous app preserved at %s. Your settings and original files were untouched.\n' "$backup"
}
if [[ -z ${BASH_SOURCE[0]:-} || ${BASH_SOURCE[0]:-} == "$0" ]]; then main "$@"; fi
