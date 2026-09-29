#!/bin/sh
# Copy the built package into another repo as a flat folder, for projects
# that vendor it instead of installing from npm. Usage: scripts/vendor.sh <dir>
set -e
cd "$(dirname "$0")/.."
DEST=$1
[ -n "$DEST" ] || { echo "usage: $0 <dir>" >&2; exit 1; }
mkdir -p "$DEST"
for f in index.js index.d.ts tiles.js tiles.d.ts default-config.json; do cp "lib/$f" "$DEST/"; done
cp dist/valhalla.mjs dist/valhalla.d.mts dist/valhalla.wasm LICENSE "$DEST/"
# lib/ reaches the engine in ../dist/; here it sits next to it.
sed -i 's#"\.\./dist/valhalla\.mjs"#"./valhalla.mjs"#' "$DEST/index.js" "$DEST/index.d.ts"
cat > "$DEST/VENDORED.md" <<MD
# valhalla-wasm (vendored)

Built from valhalla-wasm $(git describe --always --dirty) (package
$(node -p 'require("./package.json").version'), Valhalla $(cat VALHALLA_VERSION)).
Do not edit: rebuild there and run \`scripts/vendor.sh\` again. To be
replaced by the npm package \`@adret-maps/valhalla-wasm\` once published.
MD
echo "vendored into $DEST"
