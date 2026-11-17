import React from "react";
import { useLanguage } from "./LanguageContext";
import { useVideoJob } from "./videoJob";

/*
  VideoJobPill — punto 101 (videos en el Muro).

  Aviso flotante que se ve FUERA del editor del Muro (Chat, Perfil, etc.)
  mientras hay un video del próximo post en preparación o listo: así la
  persona sabe que sigue avanzando aunque esté en otra sección. Tocarlo
  vuelve al Muro, donde está el editor. Lo pone App.js; el estado viene de
  videoJob.js.

  Props:
  - visible: App.js lo apaga cuando el editor del Muro ya está a la vista.
  - isMobile: para quedar por encima de la barra inferior.
  - onOpen(): volver al Muro.
*/

const BOTTOM_NAV_HEIGHT = 57; // igual que App.js
const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";

export default function VideoJobPill({ visible, isMobile, onOpen }) {
  const { t } = useLanguage();
  const job = useVideoJob();
  if (!visible || job.status === "idle") return null;

  const percent = Math.round((job.progress || 0) * 100);
  let label;
  if (job.status === "working") label = t("video.pillPreparing", { percent });
  else if (job.status === "paused") label = t("video.pillPaused", { percent });
  else if (job.status === "ready") label = t("video.pillReady");
  else label = t("video.pillError");

  const style = {
    position: "fixed",
    right: "16px",
    bottom: isMobile ? `calc(${BOTTOM_NAV_HEIGHT + 12}px + ${SAFE_BOTTOM})` : "24px",
    maxWidth: "calc(100vw - 32px)",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-sheen)",
    boxShadow: "0 8px 24px rgba(var(--shadow-rgb), 0.35), var(--shine)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontVariantNumeric: "tabular-nums",
    cursor: "pointer",
    zIndex: 55,
  };

  return (
    <button type="button" style={style} onClick={onOpen} role="status">
      <span aria-hidden="true">🎥</span>
      {label}
    </button>
  );
}
