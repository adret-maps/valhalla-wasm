/**
 * Valhalla's tile hierarchy: which graph tiles cover a place, and where each
 * one sits in a tile directory. Level 0 holds highways (4° tiles), level 1
 * arterial roads (1°), level 2 local roads and paths (0.25°).
 */

export interface TileLevel {
  level: number;
  /** Tile edge in degrees. */
  size: number;
  /** Digits of the zero-padded id in the tile path. */
  digits: number;
}

export const TILE_LEVELS: readonly TileLevel[] = [
  { level: 0, size: 4, digits: 6 },
  { level: 1, size: 1, digits: 6 },
  { level: 2, size: 0.25, digits: 9 },
];

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

function levelOf(level: number): TileLevel {
  const l = TILE_LEVELS[level];
  if (!l) throw new RangeError(`no tile level ${level}`);
  return l;
}

/** The path of a tile in a Valhalla tile directory: its zero-padded id cut
 *  in groups of three ("2/000/781/229.gph"). */
export function tilePath(level: number, id: number): string {
  const { digits } = levelOf(level);
  const groups = String(id).padStart(digits, "0").match(/\d{3}/g) ?? [];
  const file = groups.pop();
  return [String(level), ...groups, `${file}.gph`].join("/");
}

const rowCol = (lat: number, lon: number, size: number) => ({
  row: Math.floor((Math.min(Math.max(lat, -90), 89.999999) + 90) / size),
  col: Math.floor((((((lon + 180) % 360) + 360) % 360)) / size),
});

/** The id of the tile holding a point at a level. */
export function tileId(level: number, lat: number, lon: number): number {
  const { size } = levelOf(level);
  const { row, col } = rowCol(lat, lon, size);
  return row * Math.round(360 / size) + col;
}

/**
 * Every tile intersecting a bounding box, at each of the given levels (all
 * three by default), as `{ level, id, path }`.
 */
export function tilesInBounds(
  bounds: Bounds,
  levels: readonly number[] = [0, 1, 2],
): { level: number; id: number; path: string }[] {
  const out: { level: number; id: number; path: string }[] = [];
  for (const level of levels) {
    const { size } = levelOf(level);
    const cols = Math.round(360 / size);
    const a = rowCol(bounds.south, bounds.west, size);
    const b = rowCol(bounds.north, bounds.east, size);
    // Across the antimeridian the east column is below the west one.
    const span = (b.col - a.col + cols) % cols;
    for (let row = a.row; row <= b.row; row++) {
      for (let k = 0; k <= span; k++) {
        const id = row * cols + ((a.col + k) % cols);
        out.push({ level, id, path: tilePath(level, id) });
      }
    }
  }
  return out;
}
