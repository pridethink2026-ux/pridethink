import React, { useEffect, useRef } from "react";
import { useLanguage } from "./LanguageContext";
import {
  useFeedVideo,
  useAutoplayVideos,
  registerSlot,
  togglePlay,
  toggleSound,
  enterFullscreen,
} from "./feedVideo";

/*
  PostVideo — punto 101 (videos en el Muro).

  El video de un post (post.video, ver videoJob.js):
  - "approved": estilo Instagram, con UN reproductor compartido
    (feedVideo.js) que se pone en este marco cuando el post está a la
    vista: arranca solo en silencio, bocina abajo a la derecha (activa o
    silencia TODOS los videos), contador de lo que falta arriba a la
    derecha, tocar el video pausa o sigue, pantalla completa abajo a la
    izquierda.
  - "pending" / "rejected": un aviso. PostCard (Feed.jsx) solo deja llegar
    aquí al autor; a los demás no les muestra el post.

  MARCO: como en Instagram, como máximo 4:5 de alto. Un video vertical
  (9:16) se recorta arriba y abajo, centrado y sin deformar; uno
  horizontal se ve completo. La miniatura usa el MISMO marco, así el Muro
  no salta al empezar a reproducir. En pantalla completa se ve entero.

  Los botones sobre el video usan negro translúcido y blanco fijos (no del
  tema), igual que la "✕" de MultiImageUploader: van encima de una imagen
  cualquiera y tienen que leerse siempre.
*/

const MIN_RATIO = 4 / 5; // ancho / alto: lo más alto que se muestra en el Muro

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function frameRatio(video) {
  const width = video.width || 720;
  const height = video.height || 1280;
  return Math.max(width / height, MIN_RATIO);
}

const chipBase = {
  position: "absolute",
  background: "rgba(0, 0, 0, 0.55)",
  color: "#fff",
  border: "none",
  zIndex: 2,
};

let instanceCounter = 0;

function ApprovedVideo({ postId, video }) {
  const { t } = useLanguage();
  const frameRef = useRef(null);
  const mountRef = useRef(null);
  // Un id por instancia (no solo por post): si el mismo post apareciera
  // dos veces en pantalla, cada marco es un lugar distinto.
  const slotIdRef = useRef(null);
  if (!slotIdRef.current) {
    instanceCounter += 1;
    slotIdRef.current = `${postId}#${instanceCounter}`;
  }
  const slotId = slotIdRef.current;
  const player = useFeedVideo(slotId);
  const autoplay = useAutoplayVideos();
  const isActive = player.activeId === slotId;

  useEffect(() => {
    if (!frameRef.current || !mountRef.current) return undefined;
    return registerSlot(slotId, {
      observeEl: frameRef.current,
      mount: mountRef.current,
      url: video.url,
      duration: video.duration || 0,
    });
  }, [slotId, video.url, video.duration]);

  const remaining = isActive ? player.remaining : Math.ceil(video.duration || 0);
  const soundOn = isActive ? !player.muted : player.soundOn;
  // ▶ grande: en pausa por la persona, bloqueado por el navegador, o con
  // la reproducción automática apagada (Perfil) mientras no esté sonando.
  const showBigPlay = isActive
    ? player.paused && (player.userPaused || player.blocked || !autoplay)
    : !autoplay;
  const playLabel = isActive && !player.paused ? t("video.pause") : t("video.play");

  const frameStyle = {
    position: "relative",
    width: "100%",
    aspectRatio: String(frameRatio(video)),
    marginTop: "10px",
    borderRadius: "12px",
    overflow: "hidden",
    background: "var(--bg)",
  };
  const fillStyle = { position: "absolute", inset: 0, width: "100%", height: "100%" };
  const posterStyle = { ...fillStyle, objectFit: "cover", objectPosition: "center", display: "block" };
  const tapStyle = {
    ...fillStyle,
    zIndex: 1,
    border: "none",
    padding: 0,
    margin: 0,
    background: "transparent",
    cursor: "pointer",
  };
  const timeStyle = {
    ...chipBase,
    top: "10px",
    right: "10px",
    padding: "3px 9px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    pointerEvents: "none",
  };
  const roundBtn = {
    ...chipBase,
    bottom: "10px",
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    padding: 0,
    fontSize: "17px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
  const bigPlayStyle = {
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
    zIndex: 2,
  };

  return (
    <div ref={frameRef} style={frameStyle}>
      {video.posterUrl && <img src={video.posterUrl} alt="" loading="lazy" style={posterStyle} />}
      {/* Aquí feedVideo.js pone el <video> compartido; React no lo toca. */}
      <div ref={mountRef} style={fillStyle} />
      <button
        type="button"
        style={tapStyle}
        onClick={() => togglePlay(slotId)}
        aria-label={playLabel}
      />
      {showBigPlay && (
        <span style={bigPlayStyle} aria-hidden="true">
          ▶
        </span>
      )}
      <span style={timeStyle}>{formatTime(remaining)}</span>
      <button
        type="button"
        style={{ ...roundBtn, left: "10px", fontSize: "16px" }}
        onClick={() => enterFullscreen(slotId)}
        aria-label={t("video.fullscreen")}
        title={t("video.fullscreen")}
      >
        ⛶
      </button>
      <button
        type="button"
        style={{ ...roundBtn, right: "10px" }}
        onClick={() => toggleSound(slotId)}
        aria-label={soundOn ? t("video.soundOff") : t("video.soundOn")}
        aria-pressed={soundOn}
        title={soundOn ? t("video.soundOff") : t("video.soundOn")}
      >
        {soundOn ? "🔈" : "🔇"}
      </button>
    </div>
  );
}

export default function PostVideo({ postId, video }) {
  const { t } = useLanguage();

  if (video.status === "approved" && video.url) {
    return <ApprovedVideo postId={postId} video={video} />;
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
