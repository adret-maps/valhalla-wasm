# valhalla-wasm

[Valhalla](https://github.com/valhalla/valhalla)'s routing engine compiled to
WebAssembly. `route`, `trace_route` and `locate` run in the browser, in a Web
Worker or in Node, on Valhalla graph tiles you provide, with the same JSON
requests and responses as Valhalla's HTTP service. Built for offline routing
in mobile web apps.

- Valhalla **3.9.0**, unmodified. Every answer is checked against native
  Valhalla on the same graph (see [Tests](#tests)).
- 6.0 MB of WebAssembly, **1.5 MB gzipped**; 38 KB of JavaScript.
- Tiles come from your code, one tile at a time as the search needs them:
  from memory, IndexedDB, a download, anywhere.

Status: pre-release (`3.9.0-alpha`). MIT, like Valhalla.

## Use

```sh
npm install @adret-maps/valhalla-wasm
```

```js
import { loadValhalla, MemoryTileSource, tilesInBounds } from "@adret-maps/valhalla-wasm";

// Graph tiles, by their path in a Valhalla tile directory ("2/000/781/229.gph").
const tiles = new MemoryTileSource();
for (const { path } of tilesInBounds({ west: 7.2, south: 45.6, east: 7.5, north: 45.8 })) {
  const res = await fetch(`https://example.org/valhalla_tiles/${path}`);
  if (res.ok) tiles.set(path, new Uint8Array(await res.arrayBuffer()));
}

const valhalla = await loadValhalla({ tiles });
const response = valhalla.route({
  locations: [{ lat: 45.7372, lon: 7.3206 }, { lat: 45.764, lon: 7.389 }],
  costing: "pedestrian",
});
console.log(response.trip.summary); // { length: 10.213, time: 10779, ... }
```

Run it in a **Web Worker**: a route search is synchronous and blocks the
thread it runs on (a few ms to a few hundred ms for a hiking leg on a phone).

```js
// router.worker.js
import { loadValhalla, MemoryTileSource } from "@adret-maps/valhalla-wasm";

const tiles = new MemoryTileSource();
const ready = loadValhalla({ tiles });

self.onmessage = async ({ data }) => {
  const valhalla = await ready;
  if (data.tiles) {
    for (const [path, bytes] of Object.entries(data.tiles)) tiles.set(path, bytes);
    valhalla.reset(); // see "Tiles" below
  }
  try {
    self.postMessage({ id: data.id, response: valhalla.route(data.request) });
  } catch (error) {
    self.postMessage({ id: data.id, error: { code: error.code, message: error.message } });
  }
};
```

With a bundler, make sure `valhalla.wasm` is emitted next to the module, or
pass its URL: `loadValhalla({ tiles, wasmUrl })`. The file is exported as
`@adret-maps/valhalla-wasm/valhalla.wasm`, so e.g. Vite's `?url` import works.

## API

### `loadValhalla({ tiles, config?, wasmUrl? }): Promise<Valhalla>`

- `tiles`: a `TileSource`, any object with `get(path): Uint8Array | undefined`.
  It is called synchronously while a request runs; return `undefined` for a
  tile you do not have.
- `config`: overrides merged into Valhalla's default config (the one
  `valhalla_build_config` writes, shipped as
  `@adret-maps/valhalla-wasm/default-config.json`): costing defaults,
  `service_limits`, `mjolnir.max_cache_size` (128 MB by default; decoded
  tiles kept in the engine), `logging` (silent by default). The search's
  memory reservations (`thor.max_reserved_labels_count_*`) default to a
  tenth of the server's, released after each request: WebAssembly memory
  never shrinks, so a server-sized reservation would hold about 130 MB
  more after the first route. Tile locations
  are set by the engine and ignored. Set `mjolnir.tile_url_gz: true` if
  your source returns gzipped tiles.
- `wasmUrl`: where `valhalla.wasm` is, when it is not next to the module.

### `Valhalla`

- `route(request)`, `traceRoute(request)`, `locate(request)`: the request as
  an object or a JSON string; the response parsed, exactly as the HTTP API
  returns it. On an error Valhalla answers with (no path, no road near a
  stop, a limit exceeded) they throw a `ValhallaError` with Valhalla's
  `code`, the HTTP `status` and `statusText` the service would send, and
  its message.
- `reset()`: forget the engine's cached tiles and the tiles the source did
  not have.
- `memoryBytes`: WebAssembly memory reserved by the engine.

### Tiles

- `tilePath(level, id)`: `"2/000/781/229.gph"`.
- `tileId(level, lat, lon)`: the tile holding a point.
- `tilesInBounds(bounds, levels = [0, 1, 2])`: every tile over a bounding
  box, as `{ level, id, path }`.
- `MemoryTileSource`: a `Map` of tiles with `set`, `setTile(level, id, bytes)`,
  `has`, `delete`, `size`, `bytes`.

Level 0 holds highways in 4° tiles, level 1 arterial roads in 1° tiles,
level 2 local roads, tracks and paths in 0.25° tiles. A route needs the
tiles its search visits at every level, not only those at its ends: give
the engine every tile over the area (or corridor) you route in. A hiking
corridor in the Alps is a few tiles, 2 to 25 MB.

The engine asks for a tile the first time a search reaches it and keeps it
decoded (up to `mjolnir.max_cache_size`). A tile the source did not have is
not asked for again: after adding tiles, call `reset()`.

Tiles must come from the Valhalla version this package builds (3.9.0); the
graph format can change between versions.

## How it works

The routing libraries (loki, thor, sif, odin, meili, baldr, midgard, tyr)
compiled with Emscripten, without tools, services, HTTP client, LZ4 or
GeoTIFF. The graph reader runs in its `tile_url` mode, with a tile getter
that asks JavaScript for the tile and copies the bytes into the engine;
nothing goes through a filesystem. The connectivity map is off (it lists
every tile up front), so a request between places with no path between
them fails in the search instead. C++ exceptions use native WebAssembly
exceptions.

## Build

Needs Docker and Node 22+.

```sh
npm run build:engine   # dist/valhalla.mjs + dist/valhalla.wasm, in Docker
npm install
npm run build          # lib/ (the TypeScript API)
```

`scripts/build.sh` clones Valhalla at the version in `VALHALLA_VERSION`,
builds the toolchain image (`docker/Dockerfile`: Emscripten 6.0.10,
protobuf 3.21.12 lite, zlib 1.3.1, Boost 1.83 headers), then configures,
compiles and links. A full build takes about 10 minutes on 12 cores.

## Tests

```sh
sh scripts/test-data.sh   # needs Docker
npm test
```

`test-data.sh` downloads Andorra from Geofabrik, builds its graph with the
native Valhalla image of the same version, and has native Valhalla answer a
fixed set of requests: `test/requests.mjs` (routes on foot with hiking
options, by bike and by car, with several stops and alternates; locate;
errors) and `test/trace-requests.mjs` (map matching of the routes found).
The tests ask the WebAssembly engine the same questions, and every answer
must be identical, JSON for JSON. `test/api.test.mjs` covers tile paths,
`reset()`, errors and config.

## Measurements (2026-09-29)

Italy's graph (Valhalla 3.9.0), Chromium, tiles from memory:

| | Result |
| --- | --- |
| Load and init | 130 ms; 0.5 s at 4x CPU throttle |
| Hiking leg, first request (tiles not decoded yet) | 3 to 101 ms; 20 to 389 ms at 4x throttle |
| Hiking leg, again | 2 to 8 ms; 8 to 40 ms at 4x throttle |
| Tiles for one Aosta-area leg | 3 to 7 tiles, 1.5 to 16.7 MB |
| WebAssembly memory | 32 MB at start, 55 MB after these routes |

The 4x throttle stands in for a mid-range phone. `spike/` holds the
scripts.

## Licence

MIT. Valhalla is MIT-licensed; see its
[licence](https://github.com/valhalla/valhalla/blob/master/COPYING) for the
libraries it bundles. OpenStreetMap data in the test fixtures is
© OpenStreetMap contributors, ODbL.
