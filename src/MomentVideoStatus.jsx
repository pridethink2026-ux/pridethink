import React from "react";
import { useLanguage } from "./LanguageContext";
import { MAX_MOMENT_VIDEO_SECONDS } from "./videoCompress";
import { videoErrorText } from "./VideoPicker";
import { useVideoJob, clearVideoJob, retryVideoJob, VIDEO_DEST_MOMENT } from "./videoJob";
import { MAX_ACTIVE_MOMENTS } from "./moments";

/*
  MomentVideoStatus — punto 102, parte 4.

  Debajo de la tira de Momentos (MomentsStrip.jsx), el avance del momento
  con video que se está preparando o publicando (videoJob.js, destino
  VIDEO_DEST_MOMENT):
  - "Preparando tu momento… 46 %" (o "En pausa…") con "Cancelar";
  - "Publicando tu momento… 30 %";
  - si falla: el aviso, y "Reintentar" / "Quitar" (o "Descartar").
  El momento se publica SOLO apenas termina de prepararse (publishWhenReady),
  así que no hay botón "Publicar". Cuando ya se publicó, MomentsStrip
  muestra el aviso de siempre.

  Mismos colores y forma que los avisos de VideoPicker.jsx.
*/

const styles = {
  box: {
    marginTop: "8px",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    borderRadius: "12px",
    padding: "10px 12px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: "13px",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
  },
  track: {
    height: "6px",
    borderRadius: "3px",
    background: "var(--border)",
    overflow: "hidden",
    margin: "8px 0",
  },
  fill: (percent, paused) => ({
    height: "100%",
    width: `${percent}%`,
    background: "var(--accent)",
    opacity: paused ? 0.5 : 1,
    transition: "width 0.2s linear",
  }),
  muted: { fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-body)" },
  error: {
    margin: "8px 0 0",
    padding: "8px 12px",
    borderRadius: "10px",
    background: "var(--accent2-soft)",
    border: "1px solid var(--accent2-soft-border)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    lineHeight: 1.4,
  },
  actions: { display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" },
  retryBtn: {
    padding: "8px 14px",
    borderRadius: "12px",
    border: "1px dashed var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text-muted)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    cursor: "pointer",
  },
  linkBtn: {
    border: "none",
    background: "none",
    color: "var(--accent2)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    cursor: "pointer",
    padding: "4px",
  },
};

export default function MomentVideoStatus() {
  const { t } = useLanguage();
  const job = useVideoJob(VIDEO_DEST_MOMENT);
  const clear = () => clearVideoJob(VIDEO_DEST_MOMENT);
  const retry = () => retryVideoJob(VIDEO_DEST_MOMENT);

  const preparing = job.status === "working" || job.status === "paused" || job.status === "ready";
  const uploading = job.status === "uploading";
  if (preparing || uploading) {
    const percent = job.status === "ready" ? 100 : Math.round((job.progress || 0) * 100);
    let text;
    let hint;
    if (uploading) {
      text = t("moments.videoUploading", { percent });
      hint = t("video.uploadingHint");
    } else if (job.status === "paused") {
      text = t("video.paused", { percent });
      hint = t("video.pausedHint");
    } else {
      text = t("moments.videoPreparing", { percent });
      hint = t("video.preparingHint");
    }
    return (
      <div style={styles.box} role="status">
        <div style={styles.row}>
          <span>{text}</span>
          {!uploading && (
            <button type="button" style={styles.linkBtn} onClick={clear}>
              {t("video.cancel")}
            </button>
          )}
        </div>
        <div style={styles.track}>
          <div style={styles.fill(percent, job.status === "paused")} />
        </div>
        <span style={styles.muted}>{hint}</span>
      </div>
    );
  }

  if (job.status === "error") {
    return (
      <div>
        <p style={styles.error}>{videoErrorText(t, job, MAX_MOMENT_VIDEO_SECONDS)}</p>
        <div style={styles.actions}>
          {job.canRetry && (
            <button type="button" className="pt-relief" style={styles.retryBtn} onClick={retry}>
              ↻ {t("video.retry")}
            </button>
          )}
          <button type="button" style={styles.linkBtn} onClick={clear}>
            {t("video.remove")}
          </button>
        </div>
      </div>
    );
  }

  if (job.status === "uploadError") {
    const limit = job.reason === "limit";
    return (
      <div>
        <p style={styles.error}>
          {limit ? t("moments.limitReached", { max: MAX_ACTIVE_MOMENTS }) : t("moments.videoErrorUpload")}
        </p>
        <div style={styles.actions}>
          {!limit && (
            <button type="button" className="pt-relief" style={styles.retryBtn} onClick={retry}>
              ↻ {t("video.retry")}
            </button>
          )}
          <button type="button" style={styles.linkBtn} onClick={clear}>
            {t("video.discard")}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
