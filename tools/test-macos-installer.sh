#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
source "$root/scripts/install-macos.sh"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
for version in 0.1.0 12.34.56; do valid_version "$version"; done
for version in latest ../0.1.0 '0.1.0;exit' v0.1.0 1.2; do
  if valid_version "$version"; then echo 'Invalid version accepted' >&2; exit 1; fi
done
python3 - "$work" <<'PY'
import sys,zipfile
from pathlib import Path
root=Path(sys.argv[1])
for name,entry in [('valid','OpenDazz.app/Contents/Info.plist'),('traversal','OpenDazz.app/Contents/../../outside'),('absolute','/OpenDazz.app/Contents/outside'),('other','Other.app/Contents/Info.plist')]:
 with zipfile.ZipFile(root/(name+'.zip'),'w') as z:z.writestr(entry,'fixture')
with zipfile.ZipFile(root/'metadata.zip','w') as z:
 z.writestr('OpenDazz.app/Contents/Info.plist','fixture');z.writestr('__MACOSX/OpenDazz.app/Contents/._Info.plist','metadata')
with zipfile.ZipFile(root/'symlink.zip','w') as z:
 i=zipfile.ZipInfo('OpenDazz.app/Contents/link');i.create_system=3;i.external_attr=(0o120777<<16);z.writestr(i,'/outside')
PY
validate_archive "$work/valid.zip" "$work/entries"
validate_archive "$work/metadata.zip" "$work/entries"
(cd "$work" && shasum -a 256 valid.zip > SHA256SUMS)
verify_checksum "$work/valid.zip" "$work/SHA256SUMS" valid.zip
if verify_checksum "$work/valid.zip" "$work/SHA256SUMS" missing.zip; then exit 1; fi
cat "$work/SHA256SUMS" "$work/SHA256SUMS" > "$work/duplicate"
if verify_checksum "$work/valid.zip" "$work/duplicate" valid.zip; then exit 1; fi
cp "$work/valid.zip" "$work/changed.zip"; printf 'changed' >> "$work/changed.zip"
if verify_checksum "$work/changed.zip" "$work/SHA256SUMS" valid.zip; then exit 1; fi
for invalid in traversal absolute other symlink; do
  if validate_archive "$work/$invalid.zip" "$work/entries"; then echo "Unsafe archive accepted: $invalid" >&2; exit 1; fi
done
mkdir -p "$work/apps/OpenDazz.app"
printf 'existing app data' > "$work/apps/OpenDazz.app/sentinel"
if bash "$root/scripts/install-macos.sh" --version latest --directory "$work/apps" > "$work/refused" 2>&1; then exit 1; fi
test "$(cat "$work/apps/OpenDazz.app/sentinel")" = 'existing app data'
if bash "$root/scripts/install-macos.sh" --version 0.1.0 --directory "$work/apps" > "$work/refused" 2>&1; then exit 1; fi
test "$(cat "$work/apps/OpenDazz.app/sentinel")" = 'existing app data'
if cat "$root/scripts/install-macos.sh" | bash -s -- --version latest > "$work/stdin" 2>&1; then exit 1; fi
grep -q 'Supply an exact version' "$work/stdin"
echo 'Installer: version allowlist, archive traversal/identity/symlink rejection, refusal preserves existing data — PASS'
# Simulate an Intel Mac only in a temporary script copy; production has no bypass.
mkdir "$work/stubs"
for item in 'uname Darwin' 'id 1000' 'sw_vers 14.0' 'sysctl 0'; do
  set -- $item
  printf '#!/bin/sh\nprintf "%%s\\n" "%s"\n' "$2" > "$work/stubs/$1"
  chmod +x "$work/stubs/$1"
done
python3 - "$root/scripts/install-macos.sh" "$work" <<'PY'
import sys
from pathlib import Path
root=Path(sys.argv[2])
text=Path(sys.argv[1]).read_text().replace('PATH=/usr/bin:/bin:/usr/sbin:/sbin','PATH="'+str(root/'stubs')+':/usr/bin:/bin:/usr/sbin:/sbin"',1)
(root/'intel-installer.sh').write_text(text)
PY
if bash "$work/intel-installer.sh" --version 0.1.0 --directory "$work/must-not-exist" > "$work/intel-refused" 2>&1; then exit 1; fi
grep -q 'Intel Macs are unsupported' "$work/intel-refused"
test ! -e "$work/must-not-exist"
echo 'Intel rejection occurs before installation-directory creation — PASS'
