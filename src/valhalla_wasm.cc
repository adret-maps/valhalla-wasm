// A thin embind surface over valhalla::tyr::actor_t. Requests and responses
// are Valhalla's own JSON, exactly as the HTTP service takes and returns
// them.
//
// Graph tiles come from JavaScript: the graph reader runs in its tile_url
// mode with a tile getter that asks the module's `tileSource` for a tile
// path ("2/000/781/229.gph") and copies the bytes it returns. Nothing goes
// through the filesystem.
#include <emscripten.h>
#include <emscripten/bind.h>

#include <boost/property_tree/ptree.hpp>
#include <cstring>
#include <memory>
#include <sstream>
#include <string>
#include <unordered_map>

#include "baldr/graphreader.h"
#include "baldr/graphtileheader.h"
#include "baldr/rapidjson_utils.h"
#include "baldr/tilegetter.h"
#include "exceptions.h"
#include "midgard/logging.h"
#include "tyr/actor.h"

// Size of the tile at `path` in Module.tileSource, or -1 when it has none.
// The bytes wait in Module.__pendingTile for js_tile_copy.
EM_JS(int, js_tile_size, (const char* path), {
  const source = Module["tileSource"];
  if (!source) return -1;
  const bytes = source.get(UTF8ToString(path));
  if (!bytes) return -1;
  Module["__pendingTile"] = bytes;
  return bytes.length;
});

// Copy the tile js_tile_size just found into `dst`.
EM_JS(void, js_tile_copy, (char* dst), {
  HEAPU8.set(Module["__pendingTile"], dst);
  Module["__pendingTile"] = undefined;
});

namespace {

using valhalla::baldr::tile_getter_t;

// Tiles of different graph builds must not meet in one search: edge ids
// change between builds, so a route across them would be wrong, not failed.
// The first tile read fixes the build; a tile of another build fails the
// request with 446 (Valhalla's "tile set has changed"). Build id 0 marks
// tiles from before build ids existed, which are not checked.
class js_tile_getter_t : public tile_getter_t {
public:
  explicit js_tile_getter_t(bool gzipped) : gzipped_(gzipped) {
  }

  GET_response_t get(const std::string& url, const uint64_t, const uint64_t) override {
    GET_response_t response;
    // make_single_point_url put the tile path where "{tilePath}" was.
    const std::string path = !url.empty() && url[0] == '/' ? url.substr(1) : url;
    const int size = js_tile_size(path.c_str());
    if (size < 0) {
      response.http_code_ = 404;
      return response;
    }
    response.bytes_.resize(static_cast<size_t>(size));
    js_tile_copy(response.bytes_.data());
    if (!gzipped_ && response.bytes_.size() >= sizeof(valhalla::baldr::GraphTileHeader)) {
      valhalla::baldr::GraphTileHeader header;
      std::memcpy(&header, response.bytes_.data(), sizeof(header));
      const uint16_t build = header.build_id();
      if (build != 0) {
        if (build_id_ == 0) {
          build_id_ = build;
        } else if (build != build_id_) {
          throw valhalla::valhalla_exception_t(446);
        }
      }
    }
    response.status_ = status_code_t::SUCCESS;
    response.http_code_ = 200;
    return response;
  }

  HEAD_response_t head(const std::string&, header_mask_t) override {
    return {};
  }

  bool gzipped() const override {
    return gzipped_;
  }

private:
  bool gzipped_;
  uint16_t build_id_ = 0;
};

boost::property_tree::ptree config;
std::unique_ptr<valhalla::baldr::GraphReader> reader;
std::unique_ptr<valhalla::tyr::actor_t> actor;

std::string escape(const std::string& s) {
  std::string out;
  for (char c : s) {
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (static_cast<unsigned char>(c) < 0x20) {
      out += ' ';
    } else {
      out += c;
    }
  }
  return out;
}

// The error body the HTTP service sends.
std::string error_json(unsigned code,
                       unsigned http_code,
                       const std::string& message,
                       const std::string& http_message) {
  std::ostringstream os;
  os << "{\"error_code\":" << code << ",\"error\":\"" << escape(message)
     << "\",\"status_code\":" << http_code << ",\"status\":\"" << escape(http_message)
     << "\"}";
  return os.str();
}

template <typename F> std::string guarded(F&& f) {
  if (!actor) {
    return error_json(0, 500, "valhalla-wasm: init() was not called", "Internal Server Error");
  }
  try {
    return f();
  } catch (const valhalla::valhalla_exception_t& e) {
    return error_json(e.code, e.http_code, e.message, e.http_message);
  } catch (const std::exception& e) {
    return error_json(0, 500, e.what(), "Internal Server Error");
  }
}

// A fresh graph reader and actor on the current config. The reader keeps
// the tiles it found missing for its lifetime, so a changed tile source
// needs a new one.
void make_actor() {
  auto& mjolnir = config.get_child("mjolnir");
  const bool gzipped = mjolnir.get<bool>("tile_url_gz", false);
  actor.reset();
  reader = std::make_unique<valhalla::baldr::GraphReader>(
      mjolnir, std::make_unique<js_tile_getter_t>(gzipped));
  actor = std::make_unique<valhalla::tyr::actor_t>(config, *reader, true);
}

} // namespace

// Configure the engine from a Valhalla config (the JSON valhalla.json
// holds). Where tiles come from is fixed here: the JS tile source.
std::string init(const std::string& config_json) {
  try {
    boost::property_tree::ptree parsed;
    std::istringstream stream(config_json);
    rapidjson::read_json(stream, parsed);
    auto& mjolnir = parsed.get_child("mjolnir");
    mjolnir.put("tile_url", std::string("/") + valhalla::baldr::GraphTile::kTilePathPattern);
    mjolnir.put("tile_dir", "");
    mjolnir.put("tile_extract", "");
    mjolnir.put("traffic_extract", "");
    // The connectivity map lists every tile when the engine starts; here
    // tiles arrive on demand, so the check is off (a pair with no path
    // between them fails the route search instead).
    parsed.put("loki.use_connectivity", false);
    // Logging as the config's "logging" section says; silent without one.
    // Valhalla logs every tile it looks for on disk first, which here is
    // noise, so the default is none.
    std::unordered_map<std::string, std::string> logging{{"type", ""}};
    if (auto section = parsed.get_child_optional("logging")) {
      for (const auto& kv : *section) {
        logging[kv.first] = kv.second.get_value<std::string>();
      }
    }
    valhalla::midgard::logging::Configure(logging);
    config = parsed;
    make_actor();
    return "";
  } catch (const std::exception& e) {
    return e.what();
  }
}

// Forget cached tiles and the tiles found missing: call after the tile
// source gained or changed tiles.
std::string reset() {
  try {
    if (actor) {
      make_actor();
    }
    return "";
  } catch (const std::exception& e) {
    return e.what();
  }
}

std::string route(const std::string& request) {
  return guarded([&] { return actor->route(request); });
}

std::string trace_route(const std::string& request) {
  return guarded([&] { return actor->trace_route(request); });
}

std::string locate(const std::string& request) {
  return guarded([&] { return actor->locate(request); });
}

EMSCRIPTEN_BINDINGS(valhalla) {
  emscripten::function("init", &init);
  emscripten::function("reset", &reset);
  emscripten::function("route", &route);
  emscripten::function("traceRoute", &trace_route);
  emscripten::function("locate", &locate);
}
