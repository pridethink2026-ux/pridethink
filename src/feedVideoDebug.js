import { DEBUG } from "./debug";

/*
  feedVideoDebug.js — medición de la pausa al arrancar los videos del Muro.

  SOLO con ?debug=1 en la URL (debug.js); sin eso videoDebug() no hace
  nada y no se crea ningún elemento. Pensado para el iPhone sin Mac (sin
  inspector web): un recuadro fijo abajo a la izquierda con los últimos
  videos, cada uno con los milisegundos desde que pasó a ser candidato
  (llegó al % visible) hasta cada paso:

    candidato  llegó al % visible (empieza la espera)
    carga      se puso el archivo en el reproductor
               (precarga = antes de terminar la espera; vuelve Ns = sigue
               desde el segundo N)
    meta       el navegador ya sabe duración y tamaño (loadedmetadata)
    datos      ya tiene el primer cuadro (loadeddata)
    listo      cree que ya puede arrancar (canplay)
    play       empezó a moverse (playing)
               En datos, listo y play, "(1.2s)" = segundos de video ya
               bajados por delante de donde va.
    espera     se quedó sin datos a mitad de camino (waiting)
    bloqueado  el navegador no dejó arrancar solo

  Colores fijos (negro translúcido y blanco), como los botones sobre el
  video: va encima de cualquier cosa y tiene que leerse siempre.
*/

const MAX_ROWS = 6;
const MAX_MARKS = 12;
const rows = []; // { id, t0, marks: [[label, ms]] }
let box = null;
let header = "";

function shortId(id) {
  const postId = String(id).split("#")[0];
  return postId.slice(-5);
}

function render() {
  if (typeof document === "undefined" || !document.body) return;
  if (!box) {
    box = document.createElement("div");
    box.setAttribute("aria-hidden", "true");
    Object.assign(box.style, {
      position: "fixed",
      left: "8px",
      bottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
      maxWidth: "calc(100vw - 16px)",
      zIndex: "99999",
      background: "rgba(0, 0, 0, 0.78)",
      color: "#fff",
      font: "11px/1.35 ui-monospace, Menlo, monospace",
      padding: "6px 8px",
      borderRadius: "8px",
      pointerEvents: "none",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    });
    document.body.appendChild(box);
  }
  const lines = rows.map(
    (row) => `${shortId(row.id)} · ${row.marks.map(([label, ms]) => `${label} +${ms}`).join(" · ")}`
  );
  box.textContent = [header, ...lines].join("\n");
}

export function videoDebugHeader(text) {
  if (!DEBUG) return;
  header = text;
  render();
}

// step === "candidato" abre una fila nueva para ese video; los demás pasos
// se suman a la última fila de ese video.
export function videoDebug(id, step) {
  if (!DEBUG || !id) return;
  const now = Math.round(performance.now());
  let row = null;
  if (step !== "candidato") {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].id === id) {
        row = rows[i];
        break;
      }
    }
  }
  if (!row) {
    row = { id, t0: now, marks: [] };
    rows.push(row);
    if (rows.length > MAX_ROWS) rows.shift();
  }
  if (row.marks.length < MAX_MARKS) row.marks.push([step, now - row.t0]);
  render();
}
