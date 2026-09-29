// The WASM engine against native Valhalla on the same graph: every answer
// must be identical, JSON for JSON. Data: scripts/test-data.sh.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { loadValhalla, ValhallaError } from "../lib/index.js";

const DATA = new URL("./fixtures/data/", import.meta.url).pathname;
const lines = (f) =>
  existsSync(DATA + f) ? readFileSync(DATA + f, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
const cases = [...lines("requests.ndjson"), ...lines("trace-requests.ndjson")];

const tiles = {
  get(path) {
    const f = `${DATA}tiles/${path}`;
    return existsSync(f) ? readFileSync(f) : undefined;
  },
};

test("conformance data present", () => {
  assert.ok(cases.length > 0, "run scripts/test-data.sh first");
});

const engine = cases.length ? await loadValhalla({ tiles }) : null;
const call = { route: "route", locate: "locate", trace_route: "traceRoute" };

for (const c of cases) {
  test(`${c.id} (${c.action}, ${c.request.costing}) matches native Valhalla`, () => {
    const expected = JSON.parse(readFileSync(`${DATA}expected/${c.id}.json`, "utf8"));
    let actual;
    try {
      actual = engine[call[c.action]](c.request);
    } catch (e) {
      if (!(e instanceof ValhallaError)) throw e;
      actual = { error_code: e.code, error: e.message, status_code: e.status, status: e.statusText };
    }
    assert.deepEqual(actual, expected);
  });
}
