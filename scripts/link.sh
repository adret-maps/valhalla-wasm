#!/bin/sh
# Link the wrapper and the Valhalla libraries into an ES module + .wasm.
set -e
U=/work/upstream; B=/work/build
mkdir -p /work/dist
L="$B/src/libvalhalla.a $B/src/tyr/libvalhalla-tyr.a $B/src/thor/libvalhalla-thor.a \
   $B/src/odin/libvalhalla-odin.a $B/src/loki/libvalhalla-loki.a $B/src/meili/libvalhalla-meili.a \
   $B/src/sif/libvalhalla-sif.a $B/src/skadi/libvalhalla-skadi.a $B/src/baldr/libvalhalla-baldr.a \
   $B/src/midgard/libvalhalla-midgard.a $B/src/valhalla/proto/libvalhalla-proto.a"
em++ -O3 -std=c++20 -fwasm-exceptions \
  -I$U/valhalla -I$U -I$B/src/valhalla -I$B/src -I$B/valhalla -I$B \
  -I$U/third_party/rapidjson/include -I$U/third_party/date/include \
  -I$U/third_party/unordered_dense/include -I/opt/wasm/include \
  /work/src/valhalla_wasm.cc \
  -Wl,--start-group $L -Wl,--end-group \
  /opt/wasm/lib/libprotobuf-lite.a /opt/wasm/lib/libz.a \
  -lembind \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createValhalla \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=32MB -sMAXIMUM_MEMORY=2GB \
  -sEXPORTED_RUNTIME_METHODS=HEAP8 -sFILESYSTEM=0 \
  -o /work/dist/valhalla.mjs
ls -la /work/dist
