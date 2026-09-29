# Draft: question to the Valhalla maintainers

For a GitHub discussion (or issue) on valhalla/valhalla. Not sent.

---

**Title:** A WebAssembly build of the routing libraries: in-tree target or separate project?

Hi, and thanks for Valhalla.

We build a hiking app (Adret, Italian Alps) that routes with Valhalla on the
server, and we need the same routing offline on phones. We compiled Valhalla
3.9.0's routing libraries to WebAssembly with Emscripten, and would like to
know how you would prefer this to live before we publish it.

What it is today:

- loki, thor, sif, odin, meili, baldr, midgard, tyr, built with
  `ENABLE_TOOLS/DATA_TOOLS/SERVICES/HTTP/LZ4/GEOTIFF=OFF` and
  `ENABLE_STATIC_LIBRARY_MODULES=ON`. No source changes to Valhalla.
- Dependencies: protobuf 3.21 lite (host `protoc` for codegen), zlib, Boost
  headers; native wasm exceptions.
- A small embind wrapper over `tyr::actor_t` (`route`, `trace_route`,
  `locate`, JSON in and out), and a `GraphReader` in `tile_url` mode with a
  custom `tile_getter_t` that asks JavaScript for tiles synchronously. The
  connectivity map is off, since tiles arrive on demand.
- 6.0 MB wasm, 1.5 MB gzipped. A hiking leg routes in tens of milliseconds
  in a browser (a few hundred with a 4x CPU throttle).
- Conformance tests: native Valhalla builds Andorra and answers 84 requests
  (routes on foot/bike/car, multi-stop, alternates, locate, map matching,
  errors); the wasm build's answers are compared JSON for JSON, all equal.

Two things we had to work around, which might interest you either way:

1. `GraphReader::GetTileSet()` walks `tile_dir` when loki starts, for the
   connectivity map. With tiles added later, the map says "unconnected
   regions" (170). We use `tile_url` mode and `loki.use_connectivity=false`.
2. The `thor.max_reserved_labels_count_*` defaults reserve around 130 MB on
   the first route; WebAssembly memory never shrinks, so we default them to
   a tenth with `clear_reserved_memory=true`.

The question: would you take an Emscripten target in-tree (a CMake preset
plus the wrapper and a CI job), or would you rather it stay a separate
project? We plan to publish it as `@adret-maps/valhalla-wasm` (MIT), with a
release per Valhalla version, and are happy to maintain it there, in-tree,
or both. If in-tree is welcome, we'd open a PR shaped however suits you.

Code: (link once public)
