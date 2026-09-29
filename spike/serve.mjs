// Static server for the spike: the module, the spike page, graph tiles from
// disk, and /server/* proxied to the Valhalla service.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const TILES = process.argv[2];
const SERVER = process.env.VALHALLA ?? "http://localhost:8003";
const TYPES = { ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json" };
createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/server/")) {
      const body = await new Promise((r) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => r(b)); });
      const s = await fetch(SERVER + url.pathname.slice(7), { method: "POST", body });
      res.writeHead(s.status, { "content-type": "application/json" });
      return res.end(await s.text());
    }
    const file = url.pathname.startsWith("/tiles/")
      ? join(TILES, url.pathname.slice(7).replace(/\.\./g, ""))
      : join(ROOT, url.pathname === "/" ? "spike/index.html" : url.pathname.replace(/\.\./g, ""));
    const data = await readFile(file);
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(8765, () => console.log("http://localhost:8765"));
