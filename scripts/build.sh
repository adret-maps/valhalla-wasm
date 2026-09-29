#!/bin/sh
# Build the engine (dist/valhalla.mjs + .wasm) in Docker. Needs upstream/
# (Valhalla, cloned at the pinned tag; see README).
set -e
cd "$(dirname "$0")/.."
sh scripts/fetch-upstream.sh
docker build -f docker/Dockerfile --target deps -t valhalla-wasm-deps .
# As the calling user, so build/ and dist/ stay theirs; Emscripten's cache
# cache is made writable for them in the image.
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/work -w /work valhalla-wasm-deps \
  sh -c 'sh scripts/configure.sh && cmake --build build -j"$(nproc)" && sh scripts/link.sh'
cp js/valhalla.d.mts dist/valhalla.d.mts
