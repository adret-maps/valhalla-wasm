#!/bin/sh
# Clone Valhalla at the version this package builds (VALHALLA_VERSION).
set -e
cd "$(dirname "$0")/.."
V=$(cat VALHALLA_VERSION)
if [ -d upstream ]; then
  [ "$(git -C upstream describe --tags)" = "$V" ] && exit 0
  echo "upstream/ is not at $V; remove it first" >&2
  exit 1
fi
git clone --depth 1 --branch "$V" --recurse-submodules --shallow-submodules \
  https://github.com/valhalla/valhalla.git upstream
