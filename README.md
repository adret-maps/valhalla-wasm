# valhalla-wasm

[Valhalla](https://github.com/valhalla/valhalla)'s routing library compiled
to WebAssembly: route, trace_route and locate in a browser or a Web Worker,
from Valhalla graph tiles, with the same JSON requests and responses as the
HTTP service.

Status: spike (local). Not published.

## Build

Needs Docker. Valhalla 3.9.0 is cloned into `upstream/`.

```sh
git clone --depth 1 --branch 3.9.0 --recurse-submodules --shallow-submodules \
  https://github.com/valhalla/valhalla.git upstream
docker build -f docker/Dockerfile --target deps -t valhalla-wasm-deps .
docker run --rm -v "$PWD":/work -w /work valhalla-wasm-deps \
  sh -c 'sh scripts/configure.sh && cmake --build build -j"$(nproc)"'
docker run --rm -v "$PWD":/work -w /work valhalla-wasm-deps sh scripts/link.sh
```

Output: `dist/valhalla.mjs` (ES module factory `createValhalla`) and
`dist/valhalla.wasm`.

Toolchain: Emscripten 6.0.10, protobuf 3.21.12 (lite, the last release
without abseil; a host `protoc` of the same version generates the sources),
zlib 1.3.1, Boost 1.83 headers. Valhalla is configured with the routing
libraries only: no tools, services, HTTP, LZ4, GeoTIFF, Python or tests.
C++ exceptions use native wasm exceptions (`-fwasm-exceptions`).

## API

```js
import createValhalla from "./dist/valhalla.mjs";
const v = await createValhalla();
v.FS.mkdirTree("/tiles/2/000/781");
v.FS.writeFile("/tiles/2/000/781/229.gph", bytes); // graph tiles, tile_dir layout
v.init(configJson); // a valhalla.json with mjolnir.tile_dir = "/tiles"; returns "" or an error
const json = v.route(JSON.stringify({ locations, costing: "pedestrian" }));
```

`route`, `traceRoute` and `locate` return Valhalla's JSON, or
`{"error_code", "status_code", "error"}` on failure.

Valhalla lists the tiles in `tile_dir` when `init` runs (tile set,
connectivity map). Call `init` again after adding tiles, or routes between
new tiles fail with error 170, "unconnected regions".

## Spike results (2026-09-29)

`spike/`: `compare.mjs` (Node, tiles mounted from disk) and `index.html` +
`run.mjs` (Chromium, tiles fetched over HTTP into the module's filesystem,
CPU throttling through CDP). Graph: Italy, built with Valhalla 3.9.0.

| Check | Result |
| --- | --- |
| Same result as the Valhalla 3.9.0 server | 8/8 in Node (pedestrian, bicycle, auto, 3-stop), 7/7 in Chromium: equal length, time and shape |
| Module size | 6.0 MB `.wasm`, 1.5 MB gzip; JS glue 105 KB |
| Load + init | 130 ms, 506 ms at 4x CPU throttle |
| Hiking leg, cold (tiles just added) | 3 to 101 ms; at 4x throttle 20 to 389 ms, plus 12 to 69 ms to re-init |
| Hiking leg, warm | 2 to 8 ms; at 4x throttle 8 to 40 ms |
| Graph tiles for one Aosta-area leg | 3 to 7 tiles, 1.5 to 16.7 MB (the level 0 and 1 tiles over Aosta are 4.8 and 8.7 MB) |
| Wasm memory | 190 MB reserved after the first Aosta route (tiles are held twice: the filesystem copy and the graph reader's) |

The 4x throttle stands in for a mid-range phone; a real Android device run
is still to do.
