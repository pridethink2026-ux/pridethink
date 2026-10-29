import React, { useEffect, useState } from "react";

/*
  MomentDebugPanel
  ----------------
  Panel de diagnóstico del visor de Momentos. MomentViewer.jsx lo monta
  SOLO con ?debug=1 en la URL (debug.js); sin eso no existe.

  Se redibuja solo cada REFRESH_MS (además de cuando el visor cambia de
  estado), así que sigue mostrando datos aunque el visor esté congelado.
  No recibe toques (pointer-events: none): tocar encima es tocar la foto.

  Muestra:
  - Foto: imgLoaded (lo que espera el temporizador), img.complete y
    naturalWidth (lo que el navegador dice de verdad) y cuántas veces la
    rescató la comprobación al montar o la red de seguridad, y cuántas se
    saltó por no cargar.
  - Cada motivo de pausa y el tiempo transcurrido.
  - Audio: readyState, networkState, currentTime, tiempo esperado,
    desfase (rojo pasado el umbral de corrección), cuántas correcciones de
    sincronización (saltos de currentTime), play() pedidos, eventos
    waiting/stalled y si está cargando.
  - Los últimos eventos (toques, carga, temporizador, foco, visibilidad).
*/

const REFRESH_MS = 250;

const READY_STATES = ["0 NOTHING", "1 METADATA", "2 CURRENT", "3 FUTURE", "4 ENOUGH"];
const NETWORK_STATES = ["0 EMPTY", "1 IDLE", "2 LOADING", "3 NO_SOURCE"];

const styles = {
  panel: {
    position: "absolute",
    top: "130px",
    left: "6px",
    right: "6px",
    zIndex: 5,
    padding: "6px 8px",
    borderRadius: "8px",
    background: "rgba(0,0,0,0.78)",
    color: "#0f0",
    font: "11px/1.35 ui-monospace, Menlo, monospace",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    pointerEvents: "none",
    maxHeight: "60%",
    overflow: "hidden",
  },
  bad: { color: "#ff6b6b", fontWeight: 700 },
};

const yes = (v) => (v ? "SÍ" : "no");
const sec = (v) => (typeof v === "number" && isFinite(v) ? v.toFixed(2) : "—");

export default function MomentDebugPanel({ viewer, music, log }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    const onVisibility = () => log(`visibility:${document.visibilityState}`);
    const onBlur = () => log("window blur");
    const onFocus = () => log("window focus");
    const onTouchCancel = () => log("touchcancel (document)");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("touchcancel", onTouchCancel, true);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("touchcancel", onTouchCancel, true);
    };
  }, [log]);

  const img = viewer.imgRef.current;
  const elapsedSec = viewer.elapsedRef.current / 1000;
  const frozen = !!img && img.complete && img.naturalWidth > 0 && !viewer.imgLoaded;

  const audio = music.audioRef.current;
  const stats = music.statsRef.current;
  const expectedSec = music.hasMusic ? music.startSec + elapsedSec : null;
  const drift = audio && expectedSec !== null ? audio.currentTime - expectedSec : null;
  let bufferedEnd = null;
  if (audio && audio.buffered.length) bufferedEnd = audio.buffered.end(audio.buffered.length - 1);

  const reasons = [
    ["presionado (paused)", viewer.paused],
    ["hold activo (heldRef)", viewer.held],
    ["menú reportar", viewer.reportOpen],
    ["confirmar borrar", viewer.confirmDelete],
    ["lista quién vio", viewer.viewersOpen],
    ["aviso quién vio", viewer.noticeOpen],
    ["campo responder (foco)", viewer.replyFocused],
    ["enviando respuesta", viewer.replySending],
  ];

  const vv = window.visualViewport;

  return (
    <div style={styles.panel} aria-hidden="true">
      <div>
        {"FOTO  imgLoaded="}
        <span style={viewer.imgLoaded ? undefined : styles.bad}>{yes(viewer.imgLoaded)}</span>
        {`  rescate al montar=${viewer.rescuedAtMount}  rescate 1,5 s=`}
        <span style={viewer.rescuedLater ? styles.bad : undefined}>{viewer.rescuedLater}</span>
        {"  saltos 10 s="}
        <span style={viewer.gaveUp ? styles.bad : undefined}>{viewer.gaveUp}</span>
      </div>
      <div>
        {`      complete=${img ? yes(img.complete) : "—"}  naturalWidth=${img ? img.naturalWidth : "—"}`}
        {frozen && <span style={styles.bad}>{"  ⚠ CARGADA PERO imgLoaded=no"}</span>}
      </div>
      <div>{`TIEMPO ${sec(elapsedSec)} s / ${viewer.durationSec} s  temporizador corre=${yes(viewer.timerRunning)}`}</div>
      <div>
        {"PAUSA "}
        {reasons.map(([label, on]) => (
          <span key={label} style={on ? styles.bad : undefined}>
            {`${label}=${yes(on)}  `}
          </span>
        ))}
      </div>
      <div>{`      aviso visto (localStorage)=${viewer.noticeSeen}`}</div>
      <div>
        {`VISTA innerHeight=${window.innerHeight}  visualViewport=${vv ? `${Math.round(vv.height)} (top ${Math.round(vv.offsetTop)})` : "—"}`}
      </div>
      {music.hasMusic ? (
        <>
          <div>{`AUDIO ${music.file || "—"}  running=${yes(music.running)}  muted=${audio ? yes(audio.muted) : "—"}  needsTap=${yes(music.needsTap)}`}</div>
          <div>
            {`      readyState=${audio ? READY_STATES[audio.readyState] : "—"}  network=${audio ? NETWORK_STATES[audio.networkState] : "—"}`}
          </div>
          <div>
            {`      paused=${audio ? yes(audio.paused) : "—"}  seeking=${audio ? yes(audio.seeking) : "—"}  buffer hasta=${sec(bufferedEnd)}`}
          </div>
          <div>
            {`      currentTime=${audio ? sec(audio.currentTime) : "—"}  esperado=${sec(expectedSec)}  desfase=`}
            <span style={drift !== null && Math.abs(drift) > music.driftSec ? styles.bad : undefined}>{sec(drift)}</span>
          </div>
          <div>
            {"      correcciones="}
            <span style={stats.corrections ? styles.bad : undefined}>{stats.corrections}</span>
            {`  play()=${stats.plays}  waiting=${stats.waiting}  stalled=${stats.stalled}  cargando=${yes(music.bufferingRef.current)}`}
          </div>
        </>
      ) : (
        <div>AUDIO (este momento no tiene música)</div>
      )}
      <div>{"EVENTOS"}</div>
      {viewer.events
        .slice()
        .reverse()
        .map((e, i) => (
          <div key={i}>{`  ${e}`}</div>
        ))}
    </div>
  );
}
