#!/bin/sh
# Fetch the CC0 RAW test corpus (raw.pixls.us). Sequential on purpose.
set -e
mkdir -p tests/images/src
cd tests/images/src
[ -f AFXT2720.RAF ] || curl -sL -O https://raw.pixls.us/data/Fujifilm/X-T3/AFXT2720.RAF
[ -f DSCF0733.RAF ] || curl -sL -O https://raw.pixls.us/data/Fujifilm/X100V/DSCF0733.RAF
ls -la
