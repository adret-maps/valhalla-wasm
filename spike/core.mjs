import { loadValhalla, MemoryTileSource } from "/lib/index.js";

let v;
const tiles = new MemoryTileSource();
const missing = new Set();

async function load(path) {
  if (tiles.has(path) || missing.has(path)) return 0;
  const res = await fetch(`/tiles/${path}`);
  if (!res.ok) { missing.add(path); return 0; }
  const buf = new Uint8Array(await res.arrayBuffer());
  tiles.set(path, buf);
  return buf.length;
}

export async function handle(data, post) {
  if (data.type === "init") {
    const t = performance.now();
    v = await loadValhalla({ tiles, config: { mjolnir: { max_cache_size: 67108864 } } });
    post({ type: "ready", ms: performance.now() - t, err: "" });
    return;
  }
  const t0 = performance.now();
  let bytes = 0;
  for (let i = 0; i < data.tiles.length; i += 6) {
    const sizes = await Promise.all(data.tiles.slice(i, i + 6).map(load));
    bytes += sizes.reduce((a, b) => a + b, 0);
  }
  const tr = performance.now();
  if (bytes > 0) v.reset();
  const reinitMs = performance.now() - tr;
  const t1 = performance.now();
  let out;
  try { out = JSON.stringify(v.route(data.request)); } catch (e) { out = JSON.stringify({ error: e.message }); }
  const t2 = performance.now();
  try { v.route(data.request); } catch {}
  const t3 = performance.now();
  post({ type: "routed", out, fetchMs: tr - t0, reinitMs, bytes, routeMs: t2 - t1, warmMs: t3 - t2,
    heapMB: v.memoryBytes / 2 ** 20 });
}
