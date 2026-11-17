import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { compressVideo, MAX_VIDEO_SECONDS } from "./videoCompress";

/*
  VideoPicker — punto 101 (videos en el Muro), parte 2.

  Botón "🎥 Video" del editor de posts del Muro. Al elegir un video (de la
  galería o grabándolo: el selector del teléfono ofrece las dos cosas) lo
  prepara en el teléfono con videoCompress.js, mostrando el avance, y
  después muestra la vista previa del video ya comprimido con su duración y
  su peso. Todavía no sube nada: la subida se hace al tocar "Publicar" (parte
  3), para no dejar archivos huérfanos si la persona se arrepiente.

  Mientras dure la prueba, solo aparece en los teléfonos donde se activó
  desde https://pridethink.vercel.app/pruebas/video-ios.html
  (videoBetaEnabled). Se quita al terminar el punto 101.

  Props:
  - onChange(value): null (sin video), { status: "working" } mientras se
    prepara, o { status: "ready", blob, posterBlob, duration, width,
    height, audioDropped } cuando está listo.
  - disabled: por ejemplo mientras se publica.

  Para empezar de cero después de publicar, quien lo usa le cambia la key.
*/

const BETA_KEY = "pt-video-beta";

export function videoBetaEnabled() {
  try {
    return window.localStorage.getItem(BETA_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function formatDuration(seconds) {
  const s = Math.max(1, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function VideoPicker({ onChange, disabled = false }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const jobRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [phase, setPhase] = useState("idle"); // idle | working | ready
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [urls, setUrls] = useState(null); // { video, poster } (object URLs)

  // Libera las object URLs cuando cambian o al desmontarse.
  useEffect(() => {
    return () => {
      if (urls) {
        URL.revokeObjectURL(urls.video);
        URL.revokeObjectURL(urls.poster);
      }
    };
  }, [urls]);

  // Si el componente se desmonta a la mitad, se cancela la compresión.
  useEffect(() => {
    return () => {
      if (jobRef.current) jobRef.current.cancel();
    };
  }, []);

  const errorText = (err) => {
    switch (err && err.code) {
      case "notVideo":
        return t("video.errorNotVideo");
      case "tooLong":
        return t("video.errorTooLong", {
          duration: formatDuration(err.duration),
          max: formatDuration(MAX_VIDEO_SECONDS),
        });
      case "unsupported":
        return t("video.errorUnsupported");
      default:
        return t("video.errorFailed");
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setError("");
    setResult(null);
    setUrls(null);
    setProgress(0);
    setPhase("working");
    onChangeRef.current({ status: "working" });

    const job = compressVideo(file, setProgress);
    jobRef.current = job;
    try {
      const res = await job.promise;
      if (jobRef.current !== job) return;
      jobRef.current = null;
      setResult(res);
      setUrls({ video: URL.createObjectURL(res.blob), poster: URL.createObjectURL(res.posterBlob) });
      setPhase("ready");
      onChangeRef.current({ status: "ready", ...res });
    } catch (err) {
      if (jobRef.current !== job) return;
      jobRef.current = null;
      setPhase("idle");
      onChangeRef.current(null);
      if (err.code !== "canceled") setError(errorText(err));
    }
  };

  const handleRemove = () => {
    if (jobRef.current) {
      jobRef.current.cancel();
      jobRef.current = null;
    }
    setResult(null);
    setUrls(null);
    setProgress(0);
    setError("");
    setPhase("idle");
    onChangeRef.current(null);
  };

  const addBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    borderRadius: "12px",
    border: "1px dashed var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text-muted)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? "var(--disabled-opacity)" : 1,
  };
  const boxStyle = {
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    borderRadius: "12px",
    padding: "10px 12px",
  };
  const barTrackStyle = {
    height: "6px",
    borderRadius: "3px",
    background: "var(--border)",
    overflow: "hidden",
    margin: "8px 0",
  };
  const barFillStyle = {
    height: "100%",
    width: `${Math.round(progress * 100)}%`,
    background: "var(--accent)",
    transition: "width 0.2s linear",
  };
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: "13px",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
  };
  const linkBtnStyle = {
    border: "none",
    background: "none",
    color: "var(--accent2)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    cursor: "pointer",
    padding: "4px",
  };
  const previewStyle = {
    display: "block",
    width: "100%",
    maxHeight: "360px",
    borderRadius: "10px",
    background: "var(--bg)",
    marginBottom: "8px",
  };
  const mutedTextStyle = {
    fontSize: "12px",
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
  };
  const errorStyle = {
    margin: "8px 0 0",
    padding: "8px 12px",
    borderRadius: "10px",
    background: "var(--accent2-soft)",
    border: "1px solid var(--accent2-soft-border)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    lineHeight: 1.4,
  };

  return (
    <div>
      {phase === "idle" && (
        <button
          type="button"
          style={addBtnStyle}
          disabled={disabled}
          onClick={() => inputRef.current && inputRef.current.click()}
        >
          <span aria-hidden="true">🎥</span> {t("video.add")}
        </button>
      )}

      {phase === "working" && (
        <div style={boxStyle} role="status">
          <div style={rowStyle}>
            <span>{t("video.preparing", { percent: Math.round(progress * 100) })}</span>
            <button type="button" style={linkBtnStyle} onClick={handleRemove}>
              {t("video.cancel")}
            </button>
          </div>
          <div style={barTrackStyle}>
            <div style={barFillStyle} />
          </div>
          <span style={mutedTextStyle}>{t("video.preparingHint")}</span>
        </div>
      )}

      {phase === "ready" && result && urls && (
        <div style={boxStyle}>
          <video
            src={urls.video}
            poster={urls.poster}
            controls
            playsInline
            preload="metadata"
            style={previewStyle}
          />
          <div style={rowStyle}>
            <span style={mutedTextStyle}>
              {t("video.readyInfo", {
                duration: formatDuration(result.duration),
                size: (result.blob.size / 1048576).toFixed(1),
                resolution: `${result.width}×${result.height}`,
              })}
            </span>
            <button type="button" style={linkBtnStyle} onClick={handleRemove} disabled={disabled}>
              ✕ {t("video.remove")}
            </button>
          </div>
          {result.audioDropped && <p style={errorStyle}>{t("video.audioDropped")}</p>}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      {error && <p style={errorStyle}>{error}</p>}
    </div>
  );
}
