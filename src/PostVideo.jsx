import React from "react";
import { useLanguage } from "./LanguageContext";

/*
  PostVideo — punto 101 (videos en el Muro), parte 3.

  El video de un post (post.video, ver videoJob.js):
  - "approved": el video con su miniatura y los controles del navegador.
    Solo se descarga al tocar ▶ (preload="none"). La parte 4 lo cambia por
    el reproductor estilo Instagram (un solo reproductor para todo el Muro,
    en silencio al aparecer, bocina, contador).
  - "pending" / "rejected": un aviso. PostCard (Feed.jsx) solo deja llegar
    aquí al autor; a los demás no les muestra el post.
*/

export default function PostVideo({ video }) {
  const { t } = useLanguage();

  const width = video.width || 720;
  const height = video.height || 1280;
  const frameStyle = {
    display: "block",
    width: "100%",
    aspectRatio: `${width} / ${height}`,
    maxHeight: "75vh",
    marginTop: "10px",
    borderRadius: "12px",
    background: "var(--bg)",
    objectFit: "contain",
  };

  if (video.status === "approved" && video.url) {
    return (
      <video
        src={video.url}
        poster={video.posterUrl || undefined}
        controls
        playsInline
        preload="none"
        style={frameStyle}
      />
    );
  }

  const noticeStyle = {
    marginTop: "10px",
    padding: "14px",
    borderRadius: "12px",
    border: "1px dashed var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text-muted)",
    fontSize: "13px",
    textAlign: "center",
  };
  return (
    <div style={noticeStyle} role="status">
      🎥 {video.status === "rejected" ? t("video.rejected") : t("video.processing")}
    </div>
  );
}
