import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "./LanguageContext";
import { buttonStyle } from "./ImageEditor";
import { MIN_TRIM_SECONDS, openVideoForTrim } from "./videoCompress";

/*
  VideoTrimmer — punto 102, parte 2 (editor de recorte, como Instagram).

  Se abre SIEMPRE al elegir un video (VideoPicker.jsx), antes de
  comprimirlo. Muestra:
  - la vista previa, que repite solo el tramo elegido (empieza en silencio;
    🔇/🔈 para oírlo; tocarla pausa o sigue);
  - una barra con cuadros del video y una ventana con dos agarraderas
    (inicio y final). Arrastrar una agarradera cambia ese borde; arrastrar
    la ventana la mueve entera sin cambiar la duración. También se puede
    con el teclado (flechas, medio segundo; Mayús: 5 s).
  Si el video dura más que el máximo, empieza con los primeros `maxSeconds`
  marcados y no deja pasar de ahí: se elige QUÉ parte usar.

  "Listo" devuelve { start, end } (segundos del original) y VideoPicker
  comprime solo ese tramo (videoCompress.js, opción trim). Nada se sube aquí.

  Si el navegador no puede reproducir el archivo (por ejemplo un .mov HEVC
  del iPhone en algunos Android), en lugar de la vista previa se ve el
  cuadro del inicio (o del borde que se está moviendo), sacado con
  Mediabunny; la compresión funciona igual.

  Colores fijos sobre el velo negro (blanco y negro translúcido), igual que
  ImageEditor.jsx: van encima de imágenes cualquiera.
*/

const THUMB_COUNT = 8;
const KEY_STEP = 0.5;
const KEY_STEP_BIG = 5;
const HANDLE_W = 16; // ancho visible de cada agarradera
const HANDLE_HIT = 36; // zona tocable de cada agarradera

function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.92)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
    padding: "16px",
    paddingTop: "max(16px, env(safe-area-inset-top))",
    paddingBottom: "max(16px, env(safe-area-inset-bottom))",
    zIndex: 60,
    boxSizing: "border-box",
  },
  title: {
    margin: 0,
    color: "#fff",
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 700,
  },
  previewBox: {
    position: "relative",
    flex: "1 1 auto",
    minHeight: 0,
    width: "100%",
    maxWidth: "480px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  media: {
    display: "block",
    maxWidth: "100%",
    maxHeight: "100%",
    borderRadius: "12px",
    background: "#000",
  },
  tap: {
    position: "absolute",
    inset: 0,
    border: "none",
    padding: 0,
    background: "transparent",
    cursor: "pointer",
  },
  bigPlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "rgba(0, 0, 0, 0.5)",
    color: "#fff",
    fontSize: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: "4px",
    boxSizing: "border-box",
    pointerEvents: "none",
  },
  soundBtn: {
    position: "absolute",
    right: "10px",
    bottom: "10px",
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "none",
    background: "rgba(0, 0, 0, 0.55)",
    color: "#fff",
    fontSize: "17px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
  controls: { width: "100%", maxWidth: "480px", flexShrink: 0 },
  bar: {
    position: "relative",
    height: "56px",
    borderRadius: "8px",
    overflow: "visible",
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    margin: `0 ${HANDLE_W}px`,
  },
  strip: {
    position: "absolute",
    inset: 0,
    display: "flex",
    borderRadius: "8px",
    overflow: "hidden",
    background: "#222",
  },
  thumb: { flex: "1 1 0", minWidth: 0, height: "100%", objectFit: "cover", display: "block" },
  thumbEmpty: { flex: "1 1 0", minWidth: 0, height: "100%", background: "#2a2a2a" },
  dim: { position: "absolute", top: 0, bottom: 0, background: "rgba(0,0,0,0.6)", pointerEvents: "none" },
  windowBox: {
    position: "absolute",
    top: "-3px",
    bottom: "-3px",
    boxSizing: "border-box",
    borderTop: "3px solid #fff",
    borderBottom: "3px solid #fff",
    cursor: "grab",
    touchAction: "none",
  },
  handle: (side) => ({
    position: "absolute",
    top: "-3px",
    bottom: "-3px",
    width: `${HANDLE_HIT}px`,
    // Por fuera de la ventana: la de inicio a su izquierda, la de final a
    // su derecha. Así no se tapan aunque el tramo sea muy corto.
    [side === "start" ? "right" : "left"]: "100%",
    display: "flex",
    justifyContent: side === "start" ? "flex-end" : "flex-start",
    cursor: "ew-resize",
    touchAction: "none",
    outline: "none",
  }),
  handleBar: (side, focused) => ({
    width: `${HANDLE_W}px`,
    height: "100%",
    background: "#fff",
    borderRadius: side === "start" ? "8px 0 0 8px" : "0 8px 8px 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: focused ? "0 0 0 2px var(--accent)" : "none",
    pointerEvents: "none",
  }),
  grip: { width: "3px", height: "18px", borderRadius: "2px", background: "rgba(0,0,0,0.45)" },
  playhead: {
    position: "absolute",
    top: "-6px",
    bottom: "-6px",
    width: "2px",
    marginLeft: "-1px",
    background: "#fff",
    boxShadow: "0 0 3px rgba(0,0,0,0.6)",
    pointerEvents: "none",
    left: 0,
  },
  info: {
    margin: "12px 0 0",
    color: "#fff",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
  hint: {
    margin: "4px 0 0",
    color: "rgba(255,255,255,0.7)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    lineHeight: 1.4,
    textAlign: "center",
  },
  row: { display: "flex", gap: "8px", justifyContent: "center", flexShrink: 0 },
  message: {
    color: "#fff",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    lineHeight: 1.5,
    textAlign: "center",
    maxWidth: "360px",
    margin: 0,
  },
};

/*
  file: el video elegido. maxSeconds: 90 el Muro, 77 Momentos.
  onConfirm({ start, end, frame }) / onCancel().
  withFrame (punto 102, parte 6): además devuelve `frame`, un JPEG (Blob)
  de un cuadro del principio del tramo, de fondo para escribir el texto
  del momento (MomentTextEditor). null si no se pudo sacar.
*/
export default function VideoTrimmer({ file, maxSeconds, withFrame = false, onConfirm, onCancel }) {
  const { t } = useLanguage();
  const [info, setInfo] = useState(null); // { duration }
  const [error, setError] = useState(null); // código de openVideoForTrim
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [thumbs, setThumbs] = useState(() => Array(THUMB_COUNT).fill(null));
  const [fileUrl, setFileUrl] = useState(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [frameUrl, setFrameUrl] = useState(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(true);
  const [focusedHandle, setFocusedHandle] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const videoRef = useRef(null);
  const barRef = useRef(null);
  const playheadRef = useRef(null);
  const openedRef = useRef(null); // lo que devuelve openVideoForTrim
  const rangeRef = useRef(range);
  const dragRef = useRef(null); // { mode, x0, start0, end0, wasPlaying }
  const userPausedRef = useRef(false);
  rangeRef.current = range;

  const duration = info ? info.duration : 0;

  // Abrir el archivo: duración, miniaturas, y URL para la vista previa.
  useEffect(() => {
    let alive = true;
    const created = [];
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    openVideoForTrim(file).then(
      (opened) => {
        if (!alive) {
          opened.dispose();
          return;
        }
        openedRef.current = opened;
        const end = Math.min(opened.duration, maxSeconds);
        setRange({ start: 0, end });
        setInfo({ duration: opened.duration });
        opened
          .thumbnails(THUMB_COUNT, (i, thumbUrl) => {
            if (!thumbUrl) return;
            if (!alive) {
              URL.revokeObjectURL(thumbUrl);
              return;
            }
            created.push(thumbUrl);
            setThumbs((prev) => {
              const next = prev.slice();
              next[i] = thumbUrl;
              return next;
            });
          })
          .catch(() => {});
      },
      (err) => {
        if (alive) setError((err && err.code) || "notVideo");
      }
    );
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
      created.forEach((u) => URL.revokeObjectURL(u));
      if (openedRef.current) {
        openedRef.current.dispose();
        openedRef.current = null;
      }
    };
  }, [file, maxSeconds]);

  // Cuadro grande cuando la vista previa no funciona: el del inicio (o del
  // borde que se está moviendo, al soltarlo).
  const frameRequest = useRef(0);
  const frameUrlRef = useRef(null);
  const showFrame = useCallback((seconds) => {
    const opened = openedRef.current;
    if (!opened) return;
    frameRequest.current += 1;
    const request = frameRequest.current;
    opened
      .frameAt(seconds)
      .then((url) => {
        if (!url) return;
        if (request !== frameRequest.current) {
          URL.revokeObjectURL(url);
          return;
        }
        if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
        frameUrlRef.current = url;
        setFrameUrl(url);
      })
      .catch(() => {});
  }, []);
  useEffect(
    () => () => {
      frameRequest.current += 1; // un cuadro que llegue tarde se descarta
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
      frameUrlRef.current = null;
    },
    []
  );
  // "Listo". Con withFrame, primero saca un cuadro del tramo (medio segundo
  // después del inicio: el primero suele ser negro) como JPEG.
  const confirm = async () => {
    if (confirming) return;
    const { start, end } = rangeRef.current;
    let frame = null;
    const opened = openedRef.current;
    if (withFrame && opened) {
      setConfirming(true);
      try {
        const url = await opened.frameAt(start + Math.min(0.5, (end - start) / 2));
        if (url) {
          frame = await fetch(url).then((r) => r.blob());
          URL.revokeObjectURL(url);
        }
      } catch {
        frame = null;
      }
    }
    onConfirm({ start, end, frame });
  };

  useEffect(() => {
    if (previewFailed && info) showFrame(rangeRef.current.start);
  }, [previewFailed, info, showFrame]);

  // Repetir solo el tramo y mover la línea de reproducción (sin re-render).
  useEffect(() => {
    if (!info) return undefined;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      const { start, end } = rangeRef.current;
      if (video && !previewFailed) {
        if (!dragRef.current && !video.paused && !video.seeking) {
          if (video.currentTime >= end - 0.03 || video.currentTime < start - 0.25) {
            video.currentTime = start;
          }
        }
        if (playheadRef.current && duration > 0) {
          playheadRef.current.style.left = `${(clamp(video.currentTime, 0, duration) / duration) * 100}%`;
          playheadRef.current.style.opacity = dragRef.current ? "0" : "1";
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [info, duration, previewFailed]);

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(() => setPaused(true));
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = rangeRef.current.start;
    if (!userPausedRef.current) play();
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || previewFailed) return;
    if (video.paused) {
      userPausedRef.current = false;
      const { start, end } = rangeRef.current;
      if (video.currentTime < start || video.currentTime >= end - 0.05) video.currentTime = start;
      play();
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (video.paused && !userPausedRef.current) play();
  };

  // Ver el cuadro de un borde mientras se mueve (como Instagram). Los
  // saltos se juntan: si el video todavía está buscando, va el último.
  const pendingSeek = useRef(null);
  const seekPreview = (seconds) => {
    const video = videoRef.current;
    if (!video || previewFailed) return;
    if (video.seeking) {
      pendingSeek.current = seconds;
      return;
    }
    video.currentTime = seconds;
  };
  const handleSeeked = () => {
    if (pendingSeek.current == null) return;
    const next = pendingSeek.current;
    pendingSeek.current = null;
    if (videoRef.current) videoRef.current.currentTime = next;
  };

  // Nuevo tramo según lo que se arrastra (o la tecla), respetando el
  // mínimo, el máximo y los límites del video.
  const computeRange = (mode, start0, end0, delta) => {
    if (mode === "start") {
      const start = clamp(start0 + delta, Math.max(0, end0 - maxSeconds), end0 - MIN_TRIM_SECONDS);
      return { start, end: end0 };
    }
    if (mode === "end") {
      const end = clamp(end0 + delta, start0 + MIN_TRIM_SECONDS, Math.min(duration, start0 + maxSeconds));
      return { start: start0, end };
    }
    const length = end0 - start0;
    const start = clamp(start0 + delta, 0, duration - length);
    return { start, end: start + length };
  };

  const onPointerDown = (mode) => (e) => {
    if (!info || !barRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    const video = videoRef.current;
    const wasPlaying = !!video && !video.paused;
    if (video) video.pause();
    dragRef.current = {
      mode,
      x0: e.clientX,
      width: barRef.current.getBoundingClientRect().width || 1,
      start0: rangeRef.current.start,
      end0: rangeRef.current.end,
      wasPlaying,
    };
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = ((e.clientX - drag.x0) / drag.width) * duration;
    const next = computeRange(drag.mode, drag.start0, drag.end0, delta);
    setRange(next);
    seekPreview(drag.mode === "end" ? next.end : next.start);
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const { start, end } = rangeRef.current;
    if (previewFailed) {
      showFrame(drag.mode === "end" ? end : start);
      return;
    }
    pendingSeek.current = null;
    seekPreview(start);
    if (!userPausedRef.current) play();
  };

  const onHandleKey = (mode) => (e) => {
    let step = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") step = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") step = 1;
    if (!step || !info) return;
    e.preventDefault();
    const { start, end } = rangeRef.current;
    const next = computeRange(mode, start, end, step * (e.shiftKey ? KEY_STEP_BIG : KEY_STEP));
    setRange(next);
    if (previewFailed) showFrame(mode === "end" ? next.end : next.start);
    else seekPreview(mode === "end" ? next.end : next.start);
  };

  // Escape cierra sin guardar (como ImageEditor).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const errorText = () => {
    if (error === "unsupported") return t("video.errorUnsupported");
    return t("video.errorNotVideo");
  };

  const length = range.end - range.start;
  const pct = (seconds) => (duration > 0 ? (seconds / duration) * 100 : 0);

  const content = (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={t("video.trimTitle")}>
      <h2 style={styles.title}>{t("video.trimTitle")}</h2>

      {error ? (
        <>
          <p style={styles.message}>{errorText()}</p>
          <div style={styles.row}>
            <button type="button" style={buttonStyle({})} onClick={onCancel}>
              {t("video.trimClose")}
            </button>
          </div>
        </>
      ) : !info ? (
        <p style={styles.message} role="status">
          {t("video.trimLoading")}
        </p>
      ) : (
        <>
          <div style={styles.previewBox}>
            {previewFailed ? (
              frameUrl && <img src={frameUrl} alt="" style={styles.media} />
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={fileUrl}
                  muted
                  playsInline
                  preload="auto"
                  style={styles.media}
                  onLoadedMetadata={handleLoadedMetadata}
                  onSeeked={handleSeeked}
                  onPlay={() => setPaused(false)}
                  onPause={() => setPaused(true)}
                  onError={() => setPreviewFailed(true)}
                />
                <button
                  type="button"
                  style={styles.tap}
                  onClick={togglePlay}
                  aria-label={paused ? t("video.play") : t("video.pause")}
                />
                {paused && (
                  <span style={styles.bigPlay} aria-hidden="true">
                    ▶
                  </span>
                )}
                <button
                  type="button"
                  style={styles.soundBtn}
                  onClick={toggleMute}
                  aria-label={muted ? t("video.soundOn") : t("video.soundOff")}
                  aria-pressed={!muted}
                >
                  {muted ? "🔇" : "🔈"}
                </button>
              </>
            )}
          </div>

          <div style={styles.controls}>
            {/* Mover y soltar se escuchan solo aquí: los eventos de la
                agarradera o la ventana (con setPointerCapture) suben hasta la
                barra. */}
            <div
              ref={barRef}
              style={styles.bar}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div style={styles.strip} aria-hidden="true">
                {thumbs.map((url, i) =>
                  url ? (
                    <img key={i} src={url} alt="" style={styles.thumb} draggable={false} />
                  ) : (
                    <div key={i} style={styles.thumbEmpty} />
                  )
                )}
              </div>
              <div style={{ ...styles.dim, left: 0, width: `${pct(range.start)}%` }} />
              <div style={{ ...styles.dim, left: `${pct(range.end)}%`, right: 0 }} />
              <div
                style={{ ...styles.windowBox, left: `${pct(range.start)}%`, width: `${pct(length)}%` }}
                onPointerDown={onPointerDown("move")}
              >
                {["start", "end"].map((side) => (
                  <div
                    key={side}
                    role="slider"
                    tabIndex={0}
                    aria-label={side === "start" ? t("video.trimStartLabel") : t("video.trimEndLabel")}
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(side === "start" ? range.start : range.end)}
                    aria-valuetext={formatTime(side === "start" ? range.start : range.end)}
                    style={styles.handle(side)}
                    onPointerDown={onPointerDown(side)}
                    onKeyDown={onHandleKey(side)}
                    onFocus={() => setFocusedHandle(side)}
                    onBlur={() => setFocusedHandle(null)}
                  >
                    <div style={styles.handleBar(side, focusedHandle === side)}>
                      <span style={styles.grip} />
                    </div>
                  </div>
                ))}
              </div>
              {!previewFailed && <div ref={playheadRef} style={styles.playhead} />}
            </div>

            <p style={styles.info}>
              {t("video.trimInfo", { start: formatTime(range.start), length: formatTime(length) })}
            </p>
            <p style={styles.hint}>
              {duration > maxSeconds + 0.5
                ? t("video.trimTooLongHint", { duration: formatTime(duration), max: formatTime(maxSeconds) })
                : t("video.trimHint", { max: formatTime(maxSeconds) })}
            </p>
            {previewFailed && <p style={styles.hint}>{t("video.trimNoPreview")}</p>}
          </div>

          <div style={styles.row}>
            <button type="button" style={buttonStyle({})} onClick={onCancel}>
              {t("video.cancel")}
            </button>
            <button
              type="button"
              style={buttonStyle({ primary: true, disabled: confirming })}
              disabled={confirming}
              onClick={confirm}
            >
              {confirming ? t("common.loading") : t("video.trimDone")}
            </button>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
