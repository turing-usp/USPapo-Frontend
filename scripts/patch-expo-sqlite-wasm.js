// Restore the wa-sqlite.wasm binary missing from the published
// expo-sqlite@57.0.3 tarball (npm packaging bug; fixed upstream in 58.x).
// Without it, `expo export --platform web` fails to resolve the wasm import
// in expo-sqlite/web/worker.ts. Remove this script (and the postinstall)
// once the project moves to an expo-sqlite version that ships the wasm.
const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "patches", "expo-sqlite", "wa-sqlite.wasm");
const targetDir = path.join(__dirname, "..", "node_modules", "expo-sqlite", "web", "wa-sqlite");
const target = path.join(targetDir, "wa-sqlite.wasm");

if (!fs.existsSync(source)) {
  console.error("patch-expo-sqlite-wasm: committed wasm not found at", source);
  process.exit(1);
}
if (!fs.existsSync(targetDir)) {
  console.warn("patch-expo-sqlite-wasm: node_modules/expo-sqlite not installed; skipping");
  process.exit(0);
}
if (fs.existsSync(target)) {
  console.warn("patch-expo-sqlite-wasm: wasm already present; leaving it untouched");
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.warn(`patch-expo-sqlite-wasm: restored ${target}`);
