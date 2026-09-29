import createValhalla from "/dist/valhalla.mjs";

let m;
let config;
const have = new Set();

async function load(path) {
  if (have.has(path)) return 0;
  const res = await fetch(`/tiles/${path}`);
  if (!res.ok) { have.add(path); return 0; }
  const buf = new Uint8Array(await res.arrayBuffer());
  const dir = `/tiles/${path.split("/").slice(0, -1).join("/")}`;
  m.FS.mkdirTree(dir);
  m.FS.writeFile(`/tiles/${path}`, buf);
  have.add(path);
  return buf.length;
}

export async function handle(data, post) {
  if (data.type === "init") {
    const t = performance.now();
    m = await createValhalla();
    config = await (await fetch("/spike/config.json")).text();
    const err = m.init(config);
    post({ type: "ready", ms: performance.now() - t, err });
    return;
  }
  const t0 = performance.now();
  let bytes = 0;
  for (let i = 0; i < data.tiles.length; i += 6) {
    const sizes = await Promise.all(data.tiles.slice(i, i + 6).map(load));
    bytes += sizes.reduce((a, b) => a + b, 0);
  }
  // Valhalla lists the tiles of tile_dir when the actor is made (tile set,
  // connectivity map): after adding tiles, make it again.
  const tr = performance.now();
  if (bytes > 0) m.init(config);
  const reinitMs = performance.now() - tr;
  const t1 = performance.now();
  const out = m.route(data.request);
  const t2 = performance.now();
  const again = m.route(data.request);
  const t3 = performance.now();
  post({ type: "routed", out, again: again === out, fetchMs: tr - t0, reinitMs, bytes,
    routeMs: t2 - t1, warmMs: t3 - t2, heapMB: m.HEAP8.length / 2 ** 20 });
}
