#!/bin/sh
# Conformance data: Andorra's graph built by native Valhalla (the version
# this package compiles), and the native engine's answers to the requests
# in test/requests.mjs and test/trace-requests.mjs.
set -e
cd "$(dirname "$0")/.."
VALHALLA_IMAGE=${VALHALLA_IMAGE:-ghcr.io/valhalla/valhalla-scripted:3.9.0}
PBF_URL=${PBF_URL:-https://download.geofabrik.de/europe/andorra-latest.osm.pbf}
D=test/fixtures/data
mkdir -p "$D/expected"
[ -f "$D/region.osm.pbf" ] || curl -fsSL "$PBF_URL" -o "$D/region.osm.pbf"

run() {
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD/$D":/data --entrypoint sh "$VALHALLA_IMAGE" -c "$1"
}

if [ ! -d "$D/tiles/2" ]; then
  run 'valhalla_build_config --mjolnir-tile-dir /data/tiles --mjolnir-tile-extract "" \
         --mjolnir-traffic-extract "" --mjolnir-admin "" --mjolnir-timezone "" \
         --additional-data-elevation "" > /data/valhalla.json \
       && valhalla_build_tiles -c /data/valhalla.json /data/region.osm.pbf'
fi

answer() {
  # One native answer per request line: <id> <action> <request json>.
  run 'while IFS= read -r line; do
         id=$(printf "%s" "$line" | sed -n "s/.*\"id\":\"\([^\"]*\)\".*/\1/p")
         action=$(printf "%s" "$line" | sed -n "s/.*\"action\":\"\([^\"]*\)\".*/\1/p")
         req=$(printf "%s" "$line" | sed "s/.*\"request\"://; s/}$//")
         valhalla_service /data/valhalla.json "$action" "$req" > "/data/expected/$id.json" 2>/dev/null || true
       done < /data/'"$1"
}

node test/requests.mjs > "$D/requests.ndjson"
answer requests.ndjson
node test/trace-requests.mjs "$D" > "$D/trace-requests.ndjson"
answer trace-requests.ndjson
echo "expected answers: $(ls "$D/expected" | wc -l)"
