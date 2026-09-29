import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import {
  loadValhalla,
  MemoryTileSource,
  tileId,
  tilePath,
  tilesInBounds,
  ValhallaError,
} from "../lib/index.js";

const DATA = new URL("./fixtures/data/", import.meta.url).pathname;
const TILES = `${DATA}tiles`;
const ANDORRA = { west: 1.40, east: 1.79, south: 42.42, north: 42.66 };
const hasData = existsSync(TILES);

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

test("tile paths follow Valhalla's layout", () => {
  assert.equal(tilePath(2, 781229), "2/000/781/229.gph");
  assert.equal(tilePath(1, 48787), "1/048/787.gph");
  assert.equal(tilePath(0, 3016), "0/003/016.gph");
  assert.equal(tileId(2, 45.7372, 7.3206), 781229);
  assert.equal(tileId(0, 45.7372, 7.3206), 3016);
});

test("tilesInBounds wraps across the antimeridian", () => {
  const ids = tilesInBounds({ west: 179.9, east: -179.9, south: 0, north: 0.1 }, [2]).map((t) => t.id);
  assert.equal(ids.length, 2);
  assert.ok(ids.every((id) => id >= 0));
});

test("tilesInBounds covers every tile of the region", { skip: !hasData }, () => {
  const wanted = new Set(tilesInBounds(ANDORRA).map((t) => t.path));
  for (const file of walk(TILES).filter((f) => f.endsWith(".gph"))) {
    const path = relative(TILES, file);
    if (path.startsWith("3/")) continue; // transit
    assert.ok(wanted.has(path), `${path} not covered`);
  }
});

test("tiles added later are used after reset()", { skip: !hasData }, async () => {
  const tiles = new MemoryTileSource();
  const v = await loadValhalla({ tiles });
  const request = {
    locations: [{ lat: 42.5078, lon: 1.5211 }, { lat: 42.5436, lon: 1.5731 }],
    costing: "pedestrian",
  };
  assert.throws(() => v.route(request), ValhallaError);
  for (const file of walk(TILES).filter((f) => f.endsWith(".gph"))) {
    tiles.set(relative(TILES, file), readFileSync(file));
  }
  // The reader remembers the tiles it found missing until reset.
  assert.throws(() => v.route(request), ValhallaError);
  v.reset();
  assert.ok(v.route(request).trip.summary.length > 0);
  assert.ok(tiles.size > 0 && tiles.bytes > 0);
});

test("errors carry Valhalla's code and HTTP status", { skip: !hasData }, async () => {
  const v = await loadValhalla({ tiles: { get: () => undefined } });
  try {
    v.route({ locations: [{ lat: 42.5, lon: 1.5 }, { lat: 42.6, lon: 1.6 }], costing: "hovercraft" });
    assert.fail("expected an error");
  } catch (e) {
    assert.ok(e instanceof ValhallaError);
    assert.equal(e.code, 125);
    assert.equal(e.status, 400);
  }
});

test("config overrides are merged into the defaults", { skip: !hasData }, async () => {
  const tiles = { get: (p) => (existsSync(`${TILES}/${p}`) ? readFileSync(`${TILES}/${p}`) : undefined) };
  const v = await loadValhalla({ tiles, config: { service_limits: { pedestrian: { max_distance: 1000 } } } });
  assert.throws(
    () => v.route({ locations: [{ lat: 42.5078, lon: 1.5211 }, { lat: 42.5436, lon: 1.5731 }], costing: "pedestrian" }),
    (e) => e instanceof ValhallaError && e.code === 154,
  );
});
