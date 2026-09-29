// Map-matching requests made from routes the native engine found: their
// shapes, thinned, matched back. Usage: node test/trace-requests.mjs <data dir>
import { readFileSync } from "node:fs";
const dir = process.argv[2];
const lines = readFileSync(`${dir}/requests.ndjson`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
let n = 0;
for (const r of lines) {
  if (r.action !== "route" || n >= 12) continue;
  const expected = JSON.parse(readFileSync(`${dir}/expected/${r.id}.json`, "utf8"));
  const shape = expected.trip?.legs?.[0]?.shape;
  if (!shape) continue;
  console.log(
    JSON.stringify({
      id: `trace-${String(n).padStart(3, "0")}`,
      action: "trace_route",
      request: { encoded_polyline: shape, costing: r.request.costing, shape_match: "map_snap" },
    }),
  );
  n++;
}
