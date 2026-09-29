// Types of the Emscripten module factory (dist/valhalla.mjs).
declare const createModule: (options?: {
  locateFile?: (file: string, prefix: string) => string;
}) => Promise<{
  tileSource: { get(path: string): Uint8Array | undefined };
  HEAP8: Int8Array;
  init(config: string): string;
  reset(): string;
  route(request: string): string;
  traceRoute(request: string): string;
  locate(request: string): string;
}>;
export default createModule;
