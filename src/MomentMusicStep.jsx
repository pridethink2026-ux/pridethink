import React, { useEffect, useMemo, useRef, useState } from "react";
import { buttonStyle, useViewport } from "./ImageEditor";
import { useLanguage } from "./LanguageContext";
import { MOMENT_DURATION_MS, MUSIC_MAX_START_SEC } from "./moments";
import { localized, useMusicLibrary } from "./musicLibrary";
import { isSoundMuted } from "./sound";

/*
  MomentMusicStep
  ---------------
  Tercer paso al publicar un Momento (punto 79, commit B), después de
  MomentTextEditor: música de fondo opcional y el botón "Publicar". Se
  carga en su propio archivo (lazy, MomentsStrip.jsx), y la ficha de pistas
  (musicLibrary.json) recién al tocar "Agregar música".

  Tres vistas en el mismo overlay:
  - "main": la foto, la pista elegida (o "🎵 Agregar música"), Cancelar y
    Publicar.
  - "list": las pistas agrupadas por ánimo; ▶ escucha el fragmento y
    tocar la fila la elige.
  - "trim": el tramo de MOMENT_DURATION_MS (17 s) dentro del fragmento de
    60: barra de 0 a MUSIC_MAX_START_SEC (43) en segundos enteros; al
    soltarla suena ese tramo. "Usar este tramo" vuelve a "main".

  Una sola pista suena a la vez (un solo <audio>, preload none). Respeta
  "Silenciar sonidos" del perfil: con los sonidos silenciados no suena y
  lo avisa (se puede elegir igual). Al publicar, cancelar o cerrar, se
  detiene.

  La música NUNCA se mezcla en la foto: onPublish recibe { trackId,
  startSec } (o null) y el momento guarda solo eso.

  Props: `blob` (la foto ya con el texto), `publishing`, `onPublish(music)`,
  `onCancel()`. Fondo negro fijo como los otros pasos (ImageEditor,
  MomentTextEditor); botones y tarjetas con las variables del tema.
*/

const SEGMENT_SEC = MOMENT_DURATION_MS / 1000;
const CONTROLS_HEIGHT = 260; // alto aproximado de los controles en "main", en px

const formatTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.92)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "safe center",
    gap: "12px",
    padding: "16px",
    zIndex: 60,
    boxSizing: "border-box",
    overflowY: "auto",
  },
  image: (w, h) => ({ width: `${w}px`, height: `${h}px`, objectFit: "contain", display: "block", flexShrink: 0 }),
  panel: { width: "100%", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "10px" },
  row: { display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", alignItems: "center" },
  heading: { margin: 0, color: "#fff", fontFamily: "var(--font-display)", fontSize: "17px", fontWeight: 700, textAlign: "center" },
  hint: { margin: 0, color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-body)", fontSize: "12px", textAlign: "center" },
  notice: {
    margin: 0,
    padding: "8px 12px",
    borderRadius: "10px",
    background: "var(--accent2-soft)",
    border: "1px solid var(--accent2-soft-border)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    textAlign: "center",
  },
  chosen: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px",
    borderRadius: "14px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
  },
  chosenText: { flex: 1, minWidth: 0 },
  trackTitle: { margin: 0, fontSize: "14px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  trackMeta: { margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted)" },
  list: {
    width: "100%",
    maxWidth: "520px",
    maxHeight: "60vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  moodTitle: {
    margin: "10px 0 2px",
    color: "rgba(255,255,255,0.75)",
    fontFamily: "var(--font-display)",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  trackRow: (hover) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    borderRadius: "14px",
    background: hover ? "var(--surface-alt)" : "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    boxSizing: "border-box",
  }),
  playBtn: (playing, hover) => ({
    flexShrink: 0,
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: playing ? "var(--gradient-primary)" : hover ? "var(--accent-soft)" : "var(--surface-alt)",
    color: playing ? "var(--on-primary)" : "var(--text)",
    fontSize: "13px",
    cursor: "pointer",
  }),
  slider: { width: "100%", accentColor: "var(--accent)" },
  rangeLabel: { margin: 0, color: "#fff", fontFamily: "var(--font-body)", fontSize: "14px", textAlign: "center" },
  link: { background: "none", border: "none", padding: 0, color: "var(--accent)", fontWeight: 600, cursor: "pointer" },
};

function TrackRow({ track, language, playing, onPlay, onPick, t }) {
  const [hover, setHover] = useState(null);
  const title = localized(track.title, language);
  return (
    <div
      role="button"
      tabIndex={0}
      style={styles.trackRow(hover === "row")}
      onClick={() => onPick(track)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(track);
        }
      }}
      onMouseEnter={() => setHover("row")}
      onMouseLeave={() => setHover(null)}
      aria-label={t("momentMusic.pick", { title })}
    >
      <button
        type="button"
        style={styles.playBtn(playing, hover === "play")}
        onClick={(e) => {
          e.stopPropagation();
          onPlay(track);
        }}
        onMouseEnter={() => setHover("play")}
        onMouseLeave={() => setHover("row")}
        aria-label={playing ? t("musicCredits.stop") : t("musicCredits.listen", { title })}
        aria-pressed={playing}
      >
        {playing ? "■" : "▶"}
      </button>
      <div style={{ minWidth: 0 }}>
        <p style={styles.trackTitle}>{title}</p>
        <p style={styles.trackMeta}>{localized(track.composer, language)}</p>
      </div>
    </div>
  );
}

export default function MomentMusicStep({ blob, publishing = false, onPublish, onCancel }) {
  const { t, language } = useLanguage();
  const viewport = useViewport();
  const [view, setView] = useState("main"); // "main" | "list" | "trim"
  const [wantLibrary, setWantLibrary] = useState(false);
  const [music, setMusic] = useState(null); // { track, startSec } elegida
  const [draft, setDraft] = useState(null); // { track, startSec } en "trim"
  const [playing, setPlaying] = useState(null); // "track:{id}" | "segment"
  const [mutedNotice, setMutedNotice] = useState(false);
  const [hovered, setHovered] = useState(null);
  const audioRef = useRef(null);
  const endAtRef = useRef(null); // segundo en que se corta la vista previa

  const imageUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl]);

  const hoverProps = (key) => ({
    onMouseEnter: () => setHovered(key),
    onMouseLeave: () => setHovered(null),
  });

  const stop = () => {
    if (audioRef.current) audioRef.current.pause();
    endAtRef.current = null;
    setPlaying(null);
  };

  // Al cerrar el paso (publicar o cancelar), que no siga sonando.
  useEffect(
    () => () => {
      if (audioRef.current) audioRef.current.pause();
    },
    []
  );

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== "Escape" || publishing) return;
      if (view === "main") onCancel();
      else {
        stop();
        setView(view === "trim" ? "list" : "main");
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  });

  const getAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "none";
      audio.addEventListener("timeupdate", () => {
        if (endAtRef.current != null && audio.currentTime >= endAtRef.current) {
          audio.pause();
          endAtRef.current = null;
          setPlaying(null);
        }
      });
      audio.addEventListener("ended", () => {
        endAtRef.current = null;
        setPlaying(null);
      });
      audioRef.current = audio;
    }
    return audioRef.current;
  };

  // Hay que llamarla dentro del toque (iOS solo deja reproducir así). El
  // salto a `from` se aplica cuando el audio ya sabe su duración.
  const play = (track, from, seconds, key) => {
    stop();
    if (isSoundMuted()) {
      setMutedNotice(true);
      return;
    }
    setMutedNotice(false);
    const audio = getAudio();
    const url = new URL(track.file, window.location.origin).href;
    if (audio.src !== url) audio.src = url;
    if (audio.readyState >= 1) audio.currentTime = from;
    else audio.addEventListener("loadedmetadata", () => (audio.currentTime = from), { once: true });
    endAtRef.current = seconds ? from + seconds : null;
    setPlaying(key);
    audio.play().catch((err) => {
      console.error("No se pudo reproducir la vista previa:", err);
      endAtRef.current = null;
      setPlaying(null);
    });
  };

  const toggleTrack = (track) => {
    const key = `track:${track.id}`;
    if (playing === key) stop();
    else play(track, 0, null, key);
  };

  const openList = () => {
    setWantLibrary(true);
    setView("list");
  };

  const pickTrack = (track) => {
    const startSec = music && music.track.id === track.id ? music.startSec : 0;
    setDraft({ track, startSec });
    stop();
    setView("trim");
  };

  const playSegment = () => {
    if (draft) play(draft.track, draft.startSec, SEGMENT_SEC, "segment");
  };

  // La ficha se pide recién al abrir la lista o cambiar la pista.
  const { library, error, retry } = useMusicLibrary(wantLibrary);

  const maxImageH = Math.max(160, viewport.h - CONTROLS_HEIGHT - 32);
  const maxImageW = Math.min(viewport.w - 32, 520);

  if (view === "list") {
    return (
      <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={t("momentMusic.pickTitle")}>
        <p style={styles.heading}>{t("momentMusic.pickTitle")}</p>
        {mutedNotice && <p style={styles.notice}>{t("momentMusic.mutedNotice")}</p>}
        {error && (
          <p style={styles.hint}>
            {t("musicCredits.loadError")}{" "}
            <button type="button" style={styles.link} onClick={retry}>
              {t("musicCredits.retry")}
            </button>
          </p>
        )}
        {!library && !error && <p style={styles.hint}>{t("common.loading")}</p>}
        {library && (
          <div style={styles.list}>
            {library.moods.map((mood) => {
              const tracks = library.tracks.filter((tr) => tr.mood === mood);
              if (tracks.length === 0) return null;
              return (
                <React.Fragment key={mood}>
                  <p style={styles.moodTitle}>{t(`music.mood.${mood}`)}</p>
                  {tracks.map((track) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      language={language}
                      playing={playing === `track:${track.id}`}
                      onPlay={toggleTrack}
                      onPick={pickTrack}
                      t={t}
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        )}
        <div style={styles.row}>
          <button
            type="button"
            style={buttonStyle({ hovered: hovered === "back" })}
            onClick={() => {
              stop();
              setView("main");
            }}
            {...hoverProps("back")}
          >
            {t("momentMusic.back")}
          </button>
        </div>
      </div>
    );
  }

  if (view === "trim" && draft) {
    const title = localized(draft.track.title, language);
    return (
      <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={t("momentMusic.trimTitle")}>
        <div style={styles.panel}>
          <p style={styles.heading}>{t("momentMusic.trimTitle")}</p>
          <div style={styles.chosen}>
            <div style={styles.chosenText}>
              <p style={styles.trackTitle}>{title}</p>
              <p style={styles.trackMeta}>{localized(draft.track.composer, language)}</p>
            </div>
          </div>
          <p style={styles.rangeLabel}>
            {t("momentMusic.range", {
              from: formatTime(draft.startSec),
              to: formatTime(draft.startSec + SEGMENT_SEC),
            })}
          </p>
          <input
            type="range"
            style={styles.slider}
            min={0}
            max={MUSIC_MAX_START_SEC}
            step={1}
            value={draft.startSec}
            aria-label={t("momentMusic.startLabel")}
            aria-valuetext={t("momentMusic.range", {
              from: formatTime(draft.startSec),
              to: formatTime(draft.startSec + SEGMENT_SEC),
            })}
            onChange={(e) => {
              if (playing) stop();
              setDraft({ ...draft, startSec: Number(e.target.value) });
            }}
            onPointerUp={playSegment}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") playSegment();
            }}
          />
          <p style={styles.hint}>{t("momentMusic.trimHint")}</p>
          {mutedNotice && <p style={styles.notice}>{t("momentMusic.mutedNotice")}</p>}
          <div style={styles.row}>
            <button
              type="button"
              style={buttonStyle({ hovered: hovered === "listen", active: playing === "segment" })}
              onClick={() => (playing === "segment" ? stop() : playSegment())}
              {...hoverProps("listen")}
            >
              {playing === "segment" ? t("musicCredits.stop") : t("momentMusic.listen")}
            </button>
          </div>
          <div style={styles.row}>
            <button
              type="button"
              style={buttonStyle({ hovered: hovered === "other" })}
              onClick={() => {
                stop();
                setView("list");
              }}
              {...hoverProps("other")}
            >
              {t("momentMusic.otherTrack")}
            </button>
            <button
              type="button"
              style={buttonStyle({ hovered: hovered === "use", primary: true })}
              onClick={() => {
                stop();
                setMusic(draft);
                setView("main");
              }}
              {...hoverProps("use")}
            >
              {t("momentMusic.useSegment")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={t("momentMusic.title")}>
      <img src={imageUrl} alt="" style={styles.image(maxImageW, maxImageH)} />
      <div style={styles.panel}>
        {music ? (
          <div style={styles.chosen}>
            <span aria-hidden="true">♪</span>
            <div style={styles.chosenText}>
              <p style={styles.trackTitle}>
                {localized(music.track.title, language)} · {localized(music.track.composer, language)}
              </p>
              <p style={styles.trackMeta}>
                {t("momentMusic.range", {
                  from: formatTime(music.startSec),
                  to: formatTime(music.startSec + SEGMENT_SEC),
                })}
              </p>
            </div>
          </div>
        ) : (
          <p style={styles.hint}>{t("momentMusic.optionalHint")}</p>
        )}
        <div style={styles.row}>
          {music ? (
            <>
              <button
                type="button"
                style={buttonStyle({ hovered: hovered === "change", disabled: publishing })}
                disabled={publishing}
                onClick={() => {
                  setDraft(music);
                  setWantLibrary(true);
                  setView("trim");
                }}
                {...hoverProps("change")}
              >
                {t("momentMusic.change")}
              </button>
              <button
                type="button"
                style={buttonStyle({ hovered: hovered === "remove", disabled: publishing })}
                disabled={publishing}
                onClick={() => setMusic(null)}
                {...hoverProps("remove")}
              >
                {t("momentMusic.remove")}
              </button>
            </>
          ) : (
            <button
              type="button"
              style={buttonStyle({ hovered: hovered === "add", disabled: publishing })}
              disabled={publishing}
              onClick={openList}
              {...hoverProps("add")}
            >
              {t("momentMusic.add")}
            </button>
          )}
        </div>
        <div style={styles.row}>
          <button
            type="button"
            style={buttonStyle({ hovered: hovered === "cancel", disabled: publishing })}
            disabled={publishing}
            onClick={onCancel}
            {...hoverProps("cancel")}
          >
            {t("editor.cancel")}
          </button>
          <button
            type="button"
            style={buttonStyle({ hovered: hovered === "publish", primary: true, disabled: publishing })}
            disabled={publishing}
            onClick={() => {
              stop();
              onPublish(music ? { trackId: music.track.id, startSec: music.startSec } : null);
            }}
            {...hoverProps("publish")}
          >
            {publishing ? t("moments.publishing") : t("momentText.publish")}
          </button>
        </div>
      </div>
    </div>
  );
}

