import { useEffect, useRef, useState } from "react";
import { MOMENT_DURATION_MS } from "./moments";
import { loadMusicLibrary } from "./musicLibrary";

/*
  useMomentMusic
  --------------
  Música de fondo en el visor de Momentos (punto 79, commit C). El momento
  guarda solo music: { trackId, startSec }; la foto no tiene sonido, así
  que acá se reproduce la pista de public/music/ sincronizada con los 17 s
  del momento (MOMENT_DURATION_MS).

  - La ficha (musicLibrary.json) se pide recién cuando el momento actual o
    el siguiente tienen música.
  - Un solo <audio> para todo el visor (preload "none": no baja nada hasta
    que un momento con música empieza a correr). Reutilizarlo es lo que
    deja que en iPhone, una vez que sonó con un toque, siga sonando solo al
    pasar al siguiente momento.
  - `running` es "el temporizador del momento corre" (foto cargada, sin
    pausa, sin diálogos ni campo de responder): con true suena desde
    startSec + lo transcurrido (elapsedRef, en ms, el mismo del visor);
    con false se pausa. Cada medio segundo se corrige si se desfasó más de
    DRIFT_SEC. Al cambiar de momento o cerrar, se detiene.
  - Fundido de FADE_SEC al empezar y al terminar el tramo, con `volume`
    (iOS lo ignora: en iPhone arranca y corta en seco).
  - `muted` silencia sin cortar (sigue sincronizado). Silenciado, el
    navegador siempre deja reproducir; con sonido puede bloquearlo hasta
    que la persona toque: needsTap queda en true y tapToPlay() (llamada
    dentro del toque) lo arranca.
  - Precarga el audio del siguiente momento si tiene música.

  Devuelve { track, needsTap, tapToPlay }: track es la ficha de la pista
  del momento actual (null si no tiene música o la pista ya no existe).
*/

const MOMENT_SEC = MOMENT_DURATION_MS / 1000;
const FADE_SEC = 0.4;
const DRIFT_SEC = 0.3;
const DRIFT_CHECK_MS = 500;

export function useMomentMusic({ momentId, music, nextMusic, running, elapsedRef, muted }) {
  const [library, setLibrary] = useState(null);
  const [needsTap, setNeedsTap] = useState(false);
  const audioRef = useRef(null);
  const preloadRef = useRef(null);
  const wantsLibrary = !!(music || nextMusic);

  useEffect(() => {
    if (!wantsLibrary || library) return;
    let cancelled = false;
    loadMusicLibrary().then(
      (lib) => {
        if (!cancelled) setLibrary(lib);
      },
      (err) => console.error("Momentos: no se pudo cargar la música", err)
    );
    return () => {
      cancelled = true;
    };
  }, [wantsLibrary, library]);

  const findTrack = (m) => (m && library ? library.tracks.find((tr) => tr.id === m.trackId) || null : null);
  const track = findTrack(music);
  const nextTrack = findTrack(nextMusic);
  const file = track ? track.file : null;
  const startSec = music ? music.startSec : 0;

  const expected = () => startSec + elapsedRef.current / 1000;

  // Al cerrar el visor.
  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
    },
    []
  );

  // Cada momento: se detiene lo anterior y se prepara su pista (sin bajarla).
  useEffect(() => {
    setNeedsTap(false);
    if (audioRef.current) audioRef.current.pause();
    if (!file) return;
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "none";
    }
    const url = new URL(file, window.location.origin).href;
    if (audioRef.current.src !== url) audioRef.current.src = url;
  }, [momentId, file]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted, file]);

  // Salta a donde va el momento y reproduce. También la usa el botón
  // "Toca para escuchar" (tiene que correr dentro del toque).
  const play = () => {
    const audio = audioRef.current;
    if (!audio || !file) return;
    if (audio.readyState >= 1) audio.currentTime = expected();
    else audio.addEventListener("loadedmetadata", () => (audio.currentTime = expected()), { once: true });
    audio.muted = muted;
    audio.play().then(
      () => setNeedsTap(false),
      (err) => {
        if (err && err.name === "NotAllowedError") setNeedsTap(true);
        else if (err && err.name !== "AbortError") console.error("Momentos: no se pudo reproducir la música", err);
      }
    );
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !file) return;
    if (!running) {
      audio.pause();
      return;
    }
    play();
    let frame;
    let lastCheck = 0;
    const tick = (now) => {
      const elapsed = elapsedRef.current / 1000;
      const edge = Math.min(elapsed, MOMENT_SEC - elapsed);
      audio.volume = Math.max(0, Math.min(1, edge / FADE_SEC));
      if (now - lastCheck > DRIFT_CHECK_MS && !audio.paused && !audio.seeking && audio.readyState >= 1) {
        lastCheck = now;
        if (Math.abs(audio.currentTime - expected()) > DRIFT_SEC) audio.currentTime = expected();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      audio.pause();
    };
    // play/expected leen siempre el estado actual; solo importa cuándo cambia esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, momentId, file]);

  // Precarga la pista del siguiente momento (si es otra).
  useEffect(() => {
    const nextFile = nextTrack ? nextTrack.file : null;
    if (!nextFile || nextFile === file) return;
    const pre = new Audio();
    pre.preload = "auto";
    pre.src = nextFile;
    preloadRef.current = pre;
  }, [nextTrack, file]);

  return { track, needsTap, tapToPlay: play };
}
