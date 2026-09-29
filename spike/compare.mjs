// Route the same legs in the WASM build (tiles mounted from disk) and on the
// running Valhalla server, and compare. Usage: node compare.mjs <tiles dir>
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import createValhalla from "../dist/valhalla.mjs";

const TILES = process.argv[2];
const SERVER = process.env.VALHALLA ?? "http://localhost:8003";
const config = readFileSync(new URL("./config.json", import.meta.url), "utf8");
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));

const t0 = performance.now();
const m = await createValhalla();
m.FS.mkdir("/tiles");
m.FS.mount(m.NODEFS, { root: TILES }, "/tiles");
const err = m.init(config);
if (err) throw new Error(err);
console.log(`load + init ${(performance.now() - t0).toFixed(0)} ms`);

const request = (c) => ({
  locations: c.locations.map(([lat, lon]) => ({ lat, lon })),
  costing: c.costing,
  directions_type: "none",
  shape_match: undefined,
});

let ok = 0;
for (const c of cases) {
  const body = JSON.stringify(request(c));
  const a = performance.now();
  const w = JSON.parse(m.route(body));
  const ms = performance.now() - a;
  const again = performance.now();
  m.route(body);
  const warm = performance.now() - again;
  const s = await (await fetch(`${SERVER}/route`, { method: "POST", body })).json();
  const ws = w.trip?.summary, ss = s.trip?.summary;
  const same =
    ws && ss &&
    Math.abs(ws.length - ss.length) < 1e-3 &&
    Math.abs(ws.time - ss.time) < 1 &&
    w.trip.legs.map((l) => l.shape).join() === s.trip.legs.map((l) => l.shape).join();
  if (same) ok++;
  console.log(
    `${same ? "SAME" : "DIFF"}  ${c.name}: wasm ${ws ? `${ws.length.toFixed(3)} km ${ws.time.toFixed(0)} s` : JSON.stringify(w)}` +
      ` | server ${ss ? `${ss.length.toFixed(3)} km ${ss.time.toFixed(0)} s` : JSON.stringify(s)}` +
      ` | ${ms.toFixed(0)} ms cold, ${warm.toFixed(0)} ms warm`,
  );
}
console.log(`${ok}/${cases.length} identical`);
console.log(`heap ${(m.HEAP8.length / 2 ** 20).toFixed(0)} MB`);
