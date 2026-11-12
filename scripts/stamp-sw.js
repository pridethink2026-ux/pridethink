/*
  Pone el número de versión al service worker después de `react-scripts
  build` (punto 93). Lo corre el script "build" de package.json, así que
  también corre en Vercel en cada push.

  La versión es un hash de build/asset-manifest.json: cambia cuando
  cambia cualquier archivo de la app, y con ella cambia
  build/service-worker.js, que es lo que avisa al teléfono de que hay
  una versión nueva.
*/

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const buildDir = path.join(__dirname, "..", "build");
const swPath = path.join(buildDir, "service-worker.js");
const PLACEHOLDER = "__PT_SW_VERSION__";

const manifest = fs.readFileSync(path.join(buildDir, "asset-manifest.json"));
const version = crypto.createHash("sha1").update(manifest).digest("hex").slice(0, 12);

const sw = fs.readFileSync(swPath, "utf8");
if (!sw.includes(PLACEHOLDER)) {
  console.error(`stamp-sw: no se encontró ${PLACEHOLDER} en build/service-worker.js`);
  process.exit(1);
}
fs.writeFileSync(swPath, sw.split(PLACEHOLDER).join(version));
console.log(`stamp-sw: service worker versión ${version}`);
