import { readFileSync, existsSync } from "node:fs";
import { loadValhalla } from "../lib/index.js";
const TILES = "/home/mathi/projects/hiking-trail-platform/valhalla/valhalla_tiles";
const variants = {
  default: {},
  cache32: { mjolnir: { max_cache_size: 33554432 } },
  labels: { thor: { max_reserved_labels_count_astar: 200000, max_reserved_labels_count_bidir_astar: 100000, max_reserved_labels_count_dijkstras: 200000, max_reserved_labels_count_bidir_dijkstras: 100000, clear_reserved_memory: true } },
};
const req = { locations: [{ lat: 45.7372, lon: 7.3206 }, { lat: 45.764, lon: 7.389 }], costing: "pedestrian" };
for (const [name, config] of Object.entries(variants)) {
  let bytes = 0;
  const tiles = { get(p) { const f = `${TILES}/${p}`; if (!existsSync(f)) return; const b = readFileSync(f); bytes += b.length; return b; } };
  const v = await loadValhalla({ tiles, config });
  const before = v.memoryBytes;
  const r = v.route(req);
  console.log(name, `init ${(before / 2 ** 20).toFixed(0)} MB, after ${(v.memoryBytes / 2 ** 20).toFixed(0)} MB, tiles read ${(bytes / 2 ** 20).toFixed(1)} MB, ${r.trip.summary.length} km`);
}
