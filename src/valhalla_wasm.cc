// A thin embind surface over valhalla::tyr::actor_t. Requests and responses
// are Valhalla's own JSON, exactly as the HTTP service takes and returns
// them. Graph tiles are read from the module's filesystem (mjolnir.tile_dir),
// which the JavaScript side fills before routing.
#include <emscripten/bind.h>

#include <boost/property_tree/ptree.hpp>
#include <memory>
#include <sstream>
#include <string>

#include "baldr/rapidjson_utils.h"
#include "exceptions.h"
#include "tyr/actor.h"

namespace {

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

std::string error_json(unsigned code, unsigned http_code, const std::string& message) {
  std::ostringstream os;
  os << "{\"error_code\":" << code << ",\"status_code\":" << http_code << ",\"error\":\""
     << escape(message) << "\"}";
  return os.str();
}

template <typename F> std::string guarded(F&& f) {
  if (!actor) {
    return error_json(0, 500, "valhalla-wasm: init() was not called");
  }
  try {
    return f();
  } catch (const valhalla::valhalla_exception_t& e) {
    return error_json(e.code, e.http_code, e.message);
  } catch (const std::exception& e) {
    return error_json(0, 500, e.what());
  }
}

} // namespace

// Configure the engine from a Valhalla config (the JSON valhalla.json holds).
std::string init(const std::string& config_json) {
  try {
    boost::property_tree::ptree config;
    std::istringstream stream(config_json);
    rapidjson::read_json(stream, config);
    actor = std::make_unique<valhalla::tyr::actor_t>(config, true);
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
  emscripten::function("route", &route);
  emscripten::function("traceRoute", &trace_route);
  emscripten::function("locate", &locate);
}
