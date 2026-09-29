// The graph tiles a leg needs: every tile of levels 0-2 over the bounding box
// of its stops, grown by a margin (the pack's corridor, simplified).
const LEVELS = [
  { level: 0, size: 4, digits: 6 },
  { level: 1, size: 1, digits: 6 },
  { level: 2, size: 0.25, digits: 9 },
];
export function tilePaths(locations, marginDeg = 0.05) {
  const lats = locations.map((l) => l[0]), lons = locations.map((l) => l[1]);
  const s = Math.min(...lats) - marginDeg, n = Math.max(...lats) + marginDeg;
  const w = Math.min(...lons) - marginDeg, e = Math.max(...lons) + marginDeg;
  const out = [];
  for (const { level, size, digits } of LEVELS) {
    const cols = Math.round(360 / size);
    for (let r = Math.floor((s + 90) / size); r <= Math.floor((n + 90) / size); r++) {
      for (let c = Math.floor((w + 180) / size); c <= Math.floor((e + 180) / size); c++) {
        const id = String(r * cols + c).padStart(digits, "0").match(/\d{3}/g);
        const file = id.pop();
        out.push(`${level}/${id.join("/")}/${file}.gph`);
      }
    }
  }
  return out;
}
