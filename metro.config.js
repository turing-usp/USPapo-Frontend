// Expo default Metro config with one addition: resolve .wasm as an asset.
// expo-sqlite@57.x's web worker imports wa-sqlite.wasm and hands it to
// Emscripten's `locateFile` (a URL string fetched at runtime), so the import
// must resolve to a bundled asset, not a source module. Remove the addition
// once the project moves to an expo-sqlite version that serves the wasm via
// its dev plugin (58.x+).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  assetExts: [...(config.resolver.assetExts ?? []), "wasm"],
};

module.exports = config;
