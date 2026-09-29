// The conformance requests: seeded, so every run asks the same questions.
// Andorra (small, mountainous, with trails) is the test region.
// Usage: node test/requests.mjs > test/fixtures/data/requests.ndjson
const BOX = { west: 1.42, east: 1.78, south: 42.44, north: 42.65 };

let seed = 20260929;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const point = () => ({
  lat: +(BOX.south + rand() * (BOX.north - BOX.south)).toFixed(5),
  lon: +(BOX.west + rand() * (BOX.east - BOX.west)).toFixed(5),
});

const COSTINGS = [
  ["pedestrian", {}],
  ["pedestrian", { pedestrian: { max_hiking_difficulty: 6, use_hills: 0.8 } }],
  ["pedestrian", { pedestrian: { walking_speed: 3.5, use_roads: 0.1 } }],
  ["bicycle", { bicycle: { bicycle_type: "Mountain", use_hills: 0.5 } }],
  ["auto", {}],
];

const out = [];
for (let i = 0; i < 60; i++) {
  const [costing, costing_options] = COSTINGS[i % COSTINGS.length];
  const stops = 2 + (i % 4 === 3 ? 1 : 0);
  out.push({
    id: `route-${String(i).padStart(3, "0")}`,
    action: "route",
    request: {
      locations: Array.from({ length: stops }, point),
      costing,
      costing_options,
      directions_options: { units: "kilometers", language: "en-US" },
      ...(i % 6 === 0 ? { alternates: 2 } : {}),
    },
  });
}
for (let i = 0; i < 10; i++) {
  out.push({
    id: `locate-${String(i).padStart(3, "0")}`,
    action: "locate",
    request: { locations: [point()], costing: i % 2 ? "pedestrian" : "auto", verbose: true },
  });
}
// Errors: a stop far outside the graph, an unknown costing.
out.push({
  id: "error-000",
  action: "route",
  request: { locations: [point(), { lat: 38.0, lon: 5.0 }], costing: "pedestrian" },
});
out.push({
  id: "error-001",
  action: "route",
  request: { locations: [point(), point()], costing: "hovercraft" },
});
for (const r of out) console.log(JSON.stringify(r));
