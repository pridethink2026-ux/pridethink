import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { isSoundMuted } from "./sound";
import { localized, useMusicLibrary } from "./musicLibrary";

/*
  MusicCredits
  ------------
  Pantalla "Créditos de música" (punto 79), desde tu perfil
  (AuthProfile.jsx -> ProfileView -> "Créditos de música"). Se carga en su
  propio archivo (lazy) junto con la ficha de pistas (musicLibrary.json).

  Lista cada pista agrupada por ánimo: título, compositor, intérprete,
  licencia exacta (con enlace al texto de la licencia), su página en
  Musopen y de dónde se descargó. Arriba, el correo para reclamos.

  ▶ escucha el fragmento de 60 s (una sola pista a la vez). Respeta
  "Silenciar sonidos" del perfil: con los sonidos silenciados no suena y
  lo avisa.
*/

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "var(--page-bg)",
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "var(--font-body)",
    color: "var(--text)",
    boxSizing: "border-box",
  },
  column: { width: "100%", maxWidth: "560px" },
  backBtn: (hover) => ({
    background: hover ? "var(--surface-alt)" : "none",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "8px 16px",
    color: "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "18px",
  }),
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "22px",
    fontWeight: 700,
    margin: "0 0 12px",
    background: "var(--gradient-text)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    display: "inline-block",
  },
  intro: { fontSize: "14px", lineHeight: 1.5, color: "var(--text-muted)", margin: "0 0 10px" },
  link: { color: "var(--accent)", fontWeight: 600, wordBreak: "break-word" },
  sectionTitle: {
    fontSize: "13px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 700,
    fontFamily: "var(--font-display)",
    color: "var(--text-muted)",
    margin: "24px 0 10px",
  },
  card: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
    padding: "14px",
    borderRadius: "16px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(var(--shadow-rgb), 0.15)",
    marginBottom: "10px",
  },
  playBtn: (playing, hover) => ({
    flexShrink: 0,
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: playing ? "var(--gradient-primary)" : hover ? "var(--surface-alt)" : "var(--surface)",
    color: playing ? "var(--on-primary)" : "var(--text)",
    fontSize: "14px",
    cursor: "pointer",
  }),
  trackTitle: { fontSize: "14px", fontWeight: 700, margin: "0 0 2px" },
  trackMeta: { fontSize: "12px", color: "var(--text-muted)", margin: "0 0 2px", lineHeight: 1.45 },
  notice: {
    fontSize: "13px",
    color: "var(--text-muted)",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "10px 12px",
    margin: "10px 0",
  },
};

function TrackRow({ track, language, playing, onToggle, t }) {
  const [hover, setHover] = useState(false);
  const title = localized(track.title, language);
  return (
    <div style={styles.card}>
      <button
        type="button"
        style={styles.playBtn(playing, hover)}
        onClick={() => onToggle(track)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={playing ? t("musicCredits.stop") : t("musicCredits.listen", { title })}
        aria-pressed={playing}
      >
        {playing ? "■" : "▶"}
      </button>
      <div style={{ minWidth: 0 }}>
        <p style={styles.trackTitle}>{title}</p>
        <p style={styles.trackMeta}>
          {localized(track.composer, language)} · {track.performer}
        </p>
        <p style={styles.trackMeta}>
          {t("musicCredits.license")}{" "}
          <a href={track.licenseUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
            {track.license}
          </a>
        </p>
        <p style={styles.trackMeta}>
          <a href={track.musopenUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
            {t("musicCredits.musopenPage")}
          </a>
          {" · "}
          <a href={track.downloadUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
            {t("musicCredits.source")}
          </a>
          {" · "}
          {t("musicCredits.downloaded", { date: track.downloaded })}
        </p>
      </div>
    </div>
  );
}

export default function MusicCredits({ onBack }) {
  const { t, language } = useLanguage();
  const { library, error, retry } = useMusicLibrary();
  const [playingId, setPlayingId] = useState(null);
  const [mutedNotice, setMutedNotice] = useState(false);
  const [backHover, setBackHover] = useState(false);
  const audioRef = useRef(null);

  // Al salir de la pantalla, que no siga sonando.
  useEffect(
    () => () => {
      if (audioRef.current) audioRef.current.pause();
    },
    []
  );

  const toggle = (track) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "none";
      audioRef.current.addEventListener("ended", () => setPlayingId(null));
    }
    const audio = audioRef.current;
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    if (isSoundMuted()) {
      audio.pause();
      setPlayingId(null);
      setMutedNotice(true);
      return;
    }
    setMutedNotice(false);
    audio.src = track.file;
    audio.play().then(
      () => setPlayingId(track.id),
      (err) => {
        console.error("No se pudo reproducir la pista:", err);
        setPlayingId(null);
      }
    );
    setPlayingId(track.id);
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <button
          type="button"
          style={styles.backBtn(backHover)}
          onClick={onBack}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
        >
          {t("saved.backLink")}
        </button>
        <h1 style={styles.title}>{t("musicCredits.title")}</h1>
        <p style={styles.intro}>{t("musicCredits.intro")}</p>
        <p style={styles.intro}>
          {t("musicCredits.contact")}{" "}
          <a href={`mailto:${library?.contact || "pridethink2026@gmail.com"}`} style={styles.link}>
            {library?.contact || "pridethink2026@gmail.com"}
          </a>
        </p>

        {mutedNotice && <p style={styles.notice}>{t("musicCredits.mutedNotice")}</p>}

        {error && (
          <p style={styles.notice}>
            {t("musicCredits.loadError")}{" "}
            <button type="button" onClick={retry} style={{ ...styles.link, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {t("musicCredits.retry")}
            </button>
          </p>
        )}
        {!library && !error && <p style={styles.intro}>{t("common.loading")}</p>}

        {library &&
          library.moods.map((mood) => {
            const tracks = library.tracks.filter((tr) => tr.mood === mood);
            if (tracks.length === 0) return null;
            return (
              <section key={mood}>
                <h2 style={styles.sectionTitle}>{t(`music.mood.${mood}`)}</h2>
                {tracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    language={language}
                    playing={playingId === track.id}
                    onToggle={toggle}
                    t={t}
                  />
                ))}
              </section>
            );
          })}
      </div>
    </div>
  );
}
