import React from "react";
import { useLanguage } from "./LanguageContext";
import { useVideoJob } from "./videoJob";

/*
  VideoJobBadge — punto 101 (videos en el Muro).

  Globito en el botón del Muro de la barra de navegación (abajo en el
  teléfono, arriba en la PC) mientras hay un video del próximo post en
  preparación o listo: "46%" mientras se comprime (más tenue en pausa), "✓"
  cuando está listo y "!" si necesita atención. Reemplaza al aviso flotante
  de la parte 2b, que tapaba contenido (el botón de borrar de un chat, el
  último mensaje de una conversación): la barra ya ocupa su lugar, así que
  aquí no tapa nada. Tocar el Muro lleva al editor (App.js, handleNavClick).

  Props: style (posición, la misma que el globito del Chat).
*/

export default function VideoJobBadge({ style }) {
  const { t } = useLanguage();
  const job = useVideoJob();
  if (job.status === "idle") return null;

  const percent = Math.round((job.progress || 0) * 100);
  let text;
  let label;
  if (job.status === "working") {
    text = `${percent}%`;
    label = t("video.pillPreparing", { percent });
  } else if (job.status === "paused") {
    text = `${percent}%`;
    label = t("video.pillPaused", { percent });
  } else if (job.status === "ready") {
    text = "✓";
    label = t("video.pillReady");
  } else {
    text = "!";
    label = t("video.pillError");
  }

  const badgeStyle = {
    position: "absolute",
    boxSizing: "border-box",
    background: job.status === "error" ? "var(--accent2)" : "var(--accent)",
    color: "var(--bg)",
    fontSize: "10px",
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    borderRadius: "999px",
    minWidth: "16px",
    height: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    opacity: job.status === "paused" ? 0.6 : 1,
    ...style,
  };

  return (
    <span style={badgeStyle} role="status" aria-label={label} title={label}>
      {text}
    </span>
  );
}
