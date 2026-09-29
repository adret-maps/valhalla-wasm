# Valhalla routing library compiled to WebAssembly.
# Stage 1: the toolchain and the dependencies, pinned.
FROM emscripten/emsdk:6.0.10 AS deps

ARG PROTOBUF_VERSION=21.12
ARG ZLIB_VERSION=1.3.1
ARG BOOST_VERSION=1.83.0

RUN apt-get update && apt-get install -y --no-install-recommends \
      pkg-config ninja-build ca-certificates curl g++ \
    && rm -rf /var/lib/apt/lists/*

ENV PREFIX=/opt/wasm
ENV PKG_CONFIG_PATH=/opt/wasm/lib/pkgconfig
WORKDIR /src

# protobuf 3.21 (the last release without abseil): protoc for the host,
# libprotobuf-lite for wasm. Same version on both sides.
RUN curl -fsSL https://github.com/protocolbuffers/protobuf/archive/refs/tags/v${PROTOBUF_VERSION}.tar.gz | tar xz \
 && cmake -S protobuf-${PROTOBUF_VERSION} -B pb-host -G Ninja \
      -DCMAKE_BUILD_TYPE=Release -Dprotobuf_BUILD_TESTS=OFF \
      -DCMAKE_INSTALL_PREFIX=/opt/host \
 && cmake --build pb-host --target protoc -j"$(nproc)" \
 && install -D pb-host/protoc /opt/host/bin/protoc \
 && emcmake cmake -S protobuf-${PROTOBUF_VERSION} -B pb-wasm -G Ninja \
      -DCMAKE_BUILD_TYPE=Release -Dprotobuf_BUILD_TESTS=OFF \
      -Dprotobuf_BUILD_PROTOC_BINARIES=OFF -Dprotobuf_BUILD_SHARED_LIBS=OFF \
      -Dprotobuf_WITH_ZLIB=OFF -DCMAKE_INSTALL_PREFIX=${PREFIX} \
      -DCMAKE_CXX_FLAGS="-fwasm-exceptions" \
 && cmake --build pb-wasm -j"$(nproc)" \
 && cmake --install pb-wasm \
 && printf '%s\n' \
      'if(NOT TARGET protobuf::protoc)' \
      '  add_executable(protobuf::protoc IMPORTED)' \
      '  set_target_properties(protobuf::protoc PROPERTIES IMPORTED_LOCATION /opt/host/bin/protoc)' \
      'endif()' >> ${PREFIX}/lib/cmake/protobuf/protobuf-config.cmake \
 && rm -rf pb-host pb-wasm

# zlib with a pkg-config file (Valhalla finds it through pkg-config).
RUN curl -fsSL https://github.com/madler/zlib/releases/download/v${ZLIB_VERSION}/zlib-${ZLIB_VERSION}.tar.gz | tar xz \
 && emcmake cmake -S zlib-${ZLIB_VERSION} -B zlib-wasm -G Ninja \
      -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=${PREFIX} -DZLIB_BUILD_EXAMPLES=OFF \
 && cmake --build zlib-wasm -j"$(nproc)" && cmake --install zlib-wasm \
 && rm -rf zlib-wasm

# Boost: headers only.
RUN B=$(echo ${BOOST_VERSION} | tr . _) \
 && curl -fsSL https://archives.boost.io/release/${BOOST_VERSION}/source/boost_${B}.tar.gz | tar xz \
 && mkdir -p ${PREFIX}/include && mv boost_${B}/boost ${PREFIX}/include/ \
 && rm -rf boost_${B}

# Builds run as the calling user (so build/ and dist/ stay theirs): let any
# user use and extend Emscripten's cache, filled above.
RUN chmod -R a+rwX /emsdk/upstream/emscripten/cache
