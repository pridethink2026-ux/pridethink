import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { MAX_VIDEO_SECONDS } from "./videoCompress";
import { useVideoJob, startVideoJob, retryVideoJob, clearVideoJob } from "./videoJob";

/*
  VideoPicker — punto 101 (videos en el Muro).

  Botón "🎥 Video" del editor de posts del Muro. Al elegir un video (de la
  galería o grabándolo: el selector del teléfono ofrece las dos cosas) lo
  prepara en el teléfono (videoCompress.js) y después muestra la vista
  previa del video ya comprimido con su duración, su peso y su resolución.

  El trabajo NO vive aquí sino en videoJob.js: si la persona se va a otra
  sección de la app, la compresión sigue, y al volver este componente
  muestra en qué va. Al salir de la app se pausa ("En pausa…") y al volver
  sigue; si se interrumpió, "Reintentar" vuelve a empezar con el mismo
  archivo, sin elegirlo otra vez.

  La subida empieza al tocar "Publicar" (Feed.jsx → publishVideoPost), no
  al elegir el video, para no dejar archivos huérfanos si la persona se
  arrepiente. Mientras sube: "Publicando video… 45 %"; si falla:
  "Reintentar" (con el mismo video ya comprimido) o "Descartar".
*/

function formatDuration(seconds) {
  const s = Math.max(1, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function VideoPicker({ disabled = false }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const job = useVideoJob();
  const result = job.status === "ready" ? job.result : null;

  // Object URLs de la vista previa: se crean al tener el resultado y se
  // liberan al cambiar o al salir del Muro (el resultado sigue en
  // videoJob.js y se vuelven a crear al volver).
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    if (!result) {
      setUrls(null);
      return undefined;
    }
    const next = {
      video: URL.createObjectURL(result.blob),
      poster: URL.createObjectURL(result.posterBlob),
    };
    setUrls(next);
    return () => {
      URL.revokeObjectURL(next.video);
      URL.revokeObjectURL(next.poster);
    };
  }, [result]);

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) startVideoJob(file);
  };

  const errorText = () => {
    switch (job.code) {
      case "notVideo":
        return t("video.errorNotVideo");
      case "tooLong":
        return t("video.errorTooLong", {
          duration: formatDuration(job.duration),
          max: formatDuration(job.max || MAX_VIDEO_SECONDS),
        });
      case "unsupported":
        return t("video.errorUnsupported");
      case "audioFailed":
        return t("video.errorAudio");
      default:
        return t("video.errorInterrupted");
    }
  };

  const busy = job.status === "working" || job.status === "paused";
  const uploading = job.status === "uploading";
  const percent = busy || uploading ? Math.round((job.progress || 0) * 100) : 0;

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
    width: `${percent}%`,
    background: "var(--accent)",
    opacity: job.status === "paused" ? 0.5 : 1,
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
  const retryRowStyle = { display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" };

  return (
    <div>
      {(job.status === "idle" || (job.status === "error" && !job.canRetry)) && (
        <button
          type="button"
          style={addBtnStyle}
          disabled={disabled}
          onClick={() => inputRef.current && inputRef.current.click()}
        >
          <span aria-hidden="true">🎥</span> {t("video.add")}
        </button>
      )}

      {busy && (
        <div style={boxStyle} role="status">
          <div style={rowStyle}>
            <span>
              {job.status === "paused"
                ? t("video.paused", { percent })
                : t("video.preparing", { percent })}
            </span>
            <button type="button" style={linkBtnStyle} onClick={clearVideoJob}>
              {t("video.cancel")}
            </button>
          </div>
          <div style={barTrackStyle}>
            <div style={barFillStyle} />
          </div>
          <span style={mutedTextStyle}>
            {job.status === "paused" ? t("video.pausedHint") : t("video.preparingHint")}
          </span>
        </div>
      )}

      {uploading && (
        <div style={boxStyle} role="status">
          <div style={rowStyle}>
            <span>{t("video.uploading", { percent })}</span>
          </div>
          <div style={barTrackStyle}>
            <div style={barFillStyle} />
          </div>
          <span style={mutedTextStyle}>{t("video.uploadingHint")}</span>
        </div>
      )}

      {job.status === "uploadError" && (
        <div>
          <p style={errorStyle}>{t("video.errorUpload")}</p>
          <div style={retryRowStyle}>
            <button type="button" className="pt-relief" style={addBtnStyle} onClick={retryVideoJob}>
              ↻ {t("video.retry")}
            </button>
            <button type="button" style={linkBtnStyle} onClick={clearVideoJob}>
              {t("video.discard")}
            </button>
          </div>
        </div>
      )}

      {result && urls && (
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
            <button type="button" style={linkBtnStyle} onClick={clearVideoJob} disabled={disabled}>
              ✕ {t("video.remove")}
            </button>
          </div>
        </div>
      )}

      {job.status === "error" && (
        <div>
          <p style={errorStyle}>{errorText()}</p>
          {job.canRetry && (
            <div style={retryRowStyle}>
              <button type="button" className="pt-relief" style={addBtnStyle} onClick={retryVideoJob}>
                ↻ {t("video.retry")}
              </button>
              <button type="button" style={linkBtnStyle} onClick={clearVideoJob}>
                {t("video.remove")}
              </button>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleFile}
        style={{ display: "none" }}
      />
    </div>
  );
}
