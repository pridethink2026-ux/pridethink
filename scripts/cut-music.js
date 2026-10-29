// scripts/cut-music.js
//
// Corta los fragmentos de música de los Momentos (punto 79) a partir de
// las grabaciones originales de Musopen.
//
// Fuente de verdad: src/musicLibrary.json (la ficha de cada pista). Para
// cada pista lee el archivo original ("original", relativo a la carpeta de
// originales), elige desde qué segundo cortar ("cutStart") y escribe
// public/music/{id}.mp3:
//   - 60 segundos, MP3 96 kbps, 44,1 kHz, estéreo (se reproduce en iPhone).
//   - Volumen parejo entre pistas: loudnorm de dos pasadas, lineal (no
//     comprime la dinámica), a -18 LUFS con pico real de -1,5 dB.
//   - Fundido de 1,5 s al inicio y al final.
//   - Sin metadatos del original.
//
// "cutStart": si la ficha lo trae en null, el script lo sugiere y lo
// guarda en la ficha: mide el nivel RMS segundo a segundo y elige la
// ventana de 60 s con más energía, sin los primeros y últimos 3 s. Para
// cambiarlo a oído, escribí otro número en la ficha y volvé a correrlo.
//
// Requisitos: ffmpeg y ffprobe en el PATH (no son dependencias de la app).
// Uso, desde la carpeta del proyecto:
//   node scripts/cut-music.js                 -> todas las pistas
//   node scripts/cut-music.js <id> [<id>...]  -> solo esas
// La carpeta de originales es C:\Users\HP\Documents\Pridethink-musica, o
// la que diga la variable de entorno MUSIC_ORIGINALS.

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIBRARY = path.join(ROOT, "src", "musicLibrary.json");
const OUT_DIR = path.join(ROOT, "public", "music");
const ORIGINALS = process.env.MUSIC_ORIGINALS || "C:\\Users\\HP\\Documents\\Pridethink-musica";

const CLIP_SEC = 60;
const FADE_SEC = 1.5;
const EDGE_SEC = 3;
const LOUDNORM = "I=-18:TP=-1.5:LRA=11";

// ffmpeg escribe los análisis en stderr: se devuelven stdout y stderr juntos.
function ffmpeg(args) {
  const res = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`ffmpeg falló: ${res.stderr || res.error}`);
  return `${res.stdout}\n${res.stderr}`;
}

function duration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  return parseFloat(out);
}

// Nivel RMS (dB) de cada segundo: se baja a 8 kHz y astats mide bloques de
// 8000 muestras.
function rmsPerSecond(file) {
  const out = ffmpeg([
    "-i", file,
    "-af", "aresample=8000,asetnsamples=n=8000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
    "-f", "null", "-",
  ]);
  return [...out.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : parseFloat(m[1])));
}

function suggestStart(file, total) {
  const energy = rmsPerSecond(file).map((db) => Math.pow(10, db / 10));
  const last = Math.floor(total - CLIP_SEC - EDGE_SEC);
  if (last <= EDGE_SEC) return Math.max(0, Math.floor((total - CLIP_SEC) / 2));
  let best = EDGE_SEC;
  let bestSum = -1;
  for (let s = EDGE_SEC; s <= last; s++) {
    let sum = 0;
    for (let i = s; i < s + CLIP_SEC && i < energy.length; i++) sum += energy[i];
    if (sum > bestSum) {
      bestSum = sum;
      best = s;
    }
  }
  return best;
}

function cut(track, file, start) {
  const input = ["-ss", String(start), "-t", String(CLIP_SEC), "-i", file];
  const measured = ffmpeg([...input, "-af", `loudnorm=${LOUDNORM}:print_format=json`, "-f", "null", "-"]);
  const json = JSON.parse(measured.slice(measured.lastIndexOf("{"), measured.lastIndexOf("}") + 1));
  const loudnorm =
    `loudnorm=${LOUDNORM}:linear=true` +
    `:measured_I=${json.input_i}:measured_TP=${json.input_tp}` +
    `:measured_LRA=${json.input_lra}:measured_thresh=${json.input_thresh}:offset=${json.target_offset}`;
  const fades = `afade=t=in:st=0:d=${FADE_SEC},afade=t=out:st=${CLIP_SEC - FADE_SEC}:d=${FADE_SEC}`;
  // "file" de la ficha (ej. /music/{id}.mp3). public/music/ se sirve con
  // caché de un año: si se recorta una pista ya publicada, cambiarle el
  // nombre al archivo (ej. {id}-v2.mp3), nunca el id.
  const out = path.join(ROOT, "public", track.file);
  ffmpeg([
    "-y", ...input,
    "-vn", // sin la portada que traen algunos originales
    "-af", `${loudnorm},${fades}`,
    "-ar", "44100", "-ac", "2",
    "-c:a", "libmp3lame", "-b:a", "96k",
    "-map_metadata", "-1", "-id3v2_version", "0", "-write_xing", "1",
    out,
  ]);
  return out;
}

function main() {
  const library = JSON.parse(fs.readFileSync(LIBRARY, "utf8"));
  const only = process.argv.slice(2);
  const tracks = only.length ? library.tracks.filter((t) => only.includes(t.id)) : library.tracks;
  if (only.length && tracks.length !== only.length) throw new Error("Hay ids que no están en la ficha.");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const track of tracks) {
    const file = path.join(ORIGINALS, track.original);
    if (!fs.existsSync(file)) throw new Error(`No está el original de ${track.id}: ${file}`);
    const total = duration(file);
    if (track.cutStart == null) track.cutStart = suggestStart(file, total);
    if (track.cutStart < 0 || track.cutStart + CLIP_SEC > total) {
      throw new Error(`${track.id}: cutStart ${track.cutStart} no entra en ${total.toFixed(1)} s`);
    }
    const out = cut(track, file, track.cutStart);
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`${track.id}: desde ${track.cutStart} s (de ${total.toFixed(0)} s) -> ${kb} KB`);
  }

  fs.writeFileSync(LIBRARY, `${JSON.stringify(library, null, 2)}\n`);
  const all = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".mp3"));
  const bytes = all.reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.log(`Total: ${all.length} archivos, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}

main();
