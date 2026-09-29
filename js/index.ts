/**
 * Valhalla's routing engine in WebAssembly.
 *
 * Requests and responses are Valhalla's own JSON, as its HTTP service takes
 * and returns them (https://valhalla.github.io/valhalla/api/). Graph tiles
 * come from a {@link TileSource} you provide: the engine asks for a tile by
 * its path when it needs it, synchronously, so the source has to hold its
 * tiles in memory (or read them synchronously). Run the engine in a Web
 * Worker: a route search blocks the thread it runs on.
 */
import defaultConfig from "./default-config.json" with { type: "json" };
import { tilePath } from "./tiles.js";

export { tilePath, tileId, tilesInBounds, TILE_LEVELS } from "./tiles.js";
export type { Bounds, TileLevel } from "./tiles.js";

/** Where the engine reads graph tiles. `path` is the tile's path in a
 *  Valhalla tile directory ("2/000/781/229.gph"). */
export interface TileSource {
  get(path: string): Uint8Array | undefined;
}

/** A {@link TileSource} holding tiles in memory. */
export class MemoryTileSource implements TileSource {
  readonly #tiles = new Map<string, Uint8Array>();

  get(path: string): Uint8Array | undefined {
    return this.#tiles.get(path);
  }

  /** Add or replace a tile by path. */
  set(path: string, bytes: Uint8Array): this {
    this.#tiles.set(path, bytes);
    return this;
  }

  /** Add or replace a tile by level and id. */
  setTile(level: number, id: number, bytes: Uint8Array): this {
    return this.set(tilePath(level, id), bytes);
  }

  has(path: string): boolean {
    return this.#tiles.has(path);
  }

  delete(path: string): boolean {
    return this.#tiles.delete(path);
  }

  /** Drop every tile. */
  clear(): void {
    this.#tiles.clear();
  }

  /** The paths of the tiles held. */
  keys(): IterableIterator<string> {
    return this.#tiles.keys();
  }

  /** Number of tiles held. */
  get size(): number {
    return this.#tiles.size;
  }

  /** Total bytes held. */
  get bytes(): number {
    let n = 0;
    for (const t of this.#tiles.values()) n += t.byteLength;
    return n;
  }
}

/** An error Valhalla answered with, as its HTTP service would. */
export class ValhallaError extends Error {
  /** Valhalla's error code (e.g. 171 "No suitable edges near location"). */
  readonly code: number;
  /** The HTTP status the service would have sent. */
  readonly status: number;
  /** Its text ("Bad Request"). */
  readonly statusText: string;

  constructor(code: number, status: number, message: string, statusText = "") {
    super(message);
    this.name = "ValhallaError";
    this.code = code;
    this.status = status;
    this.statusText = statusText;
  }
}

/** A request object or its JSON. */
export type Request = Record<string, unknown> | string;
// biome-ignore lint/suspicious/noExplicitAny: Valhalla's response shapes are documented upstream, not typed here.
export type Response = any;

export interface Valhalla {
  /** The /route action. */
  route(request: Request): Response;
  /** The /trace_route action (map matching). */
  traceRoute(request: Request): Response;
  /** The /locate action. */
  locate(request: Request): Response;
  /**
   * Forget cached tiles and the tiles the source did not have. Call after
   * the source gained or changed tiles: a tile found missing is not asked
   * for again until then.
   */
  reset(): void;
  /** Bytes of WebAssembly memory reserved by the engine. */
  readonly memoryBytes: number;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type Config = typeof defaultConfig;

export interface LoadOptions {
  /** Where the engine reads graph tiles. */
  tiles: TileSource;
  /** Overrides merged into Valhalla's default config (costing defaults,
   *  service limits, `mjolnir.max_cache_size`...). Tile locations are set
   *  by the engine and ignored here. */
  config?: DeepPartial<Config> & Record<string, unknown>;
  /** URL of `valhalla.wasm` when bundlers or CDNs move it away from
   *  `valhalla.mjs`. */
  wasmUrl?: string | URL;
}

interface EngineModule {
  tileSource: TileSource;
  HEAP8: Int8Array;
  init(config: string): string;
  reset(): string;
  route(request: string): string;
  traceRoute(request: string): string;
  locate(request: string): string;
}

function merge(base: unknown, over: unknown): unknown {
  if (
    over === null ||
    typeof over !== "object" ||
    Array.isArray(over) ||
    base === null ||
    typeof base !== "object" ||
    Array.isArray(base)
  ) {
    return over === undefined ? base : over;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    out[k] = merge(out[k], v);
  }
  return out;
}

function parse(json: string): Response {
  const out = JSON.parse(json);
  if (out && typeof out === "object" && "error_code" in out && "error" in out && !("trip" in out)) {
    throw new ValhallaError(out.error_code, out.status_code ?? 400, out.error, out.status ?? "");
  }
  return out;
}

const text = (request: Request) => (typeof request === "string" ? request : JSON.stringify(request));

/** Load the engine and configure it. */
export async function loadValhalla(options: LoadOptions): Promise<Valhalla> {
  const { default: createModule } = await import("../dist/valhalla.mjs");
  const wasmUrl = options.wasmUrl?.toString();
  const m: EngineModule = await createModule(
    wasmUrl ? { locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl : file) } : {},
  );
  m.tileSource = options.tiles;
  const err = m.init(JSON.stringify(merge(defaultConfig, options.config ?? {})));
  if (err) throw new Error(`valhalla-wasm: ${err}`);
  return {
    route: (r) => parse(m.route(text(r))),
    traceRoute: (r) => parse(m.traceRoute(text(r))),
    locate: (r) => parse(m.locate(text(r))),
    reset() {
      const e = m.reset();
      if (e) throw new Error(`valhalla-wasm: ${e}`);
    },
    get memoryBytes() {
      return m.HEAP8.byteLength;
    },
  };
}
