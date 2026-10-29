import { useEffect, useRef, useState } from "react";
import { DEBUG } from "./debug";
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
  - Un solo <audio> para todo el visor, con preload "auto" para la pista
    del momento actual (empieza a bajarla apenas se abre el momento, sin
    esperar a que corra el tiempo). Reutilizarlo es lo que deja que en
    iPhone, una vez que sonó con un toque, siga sonando solo al pasar al
    siguiente momento.
  - `running` es "el temporizador del momento corre" (foto cargada, sin
    pausa, sin diálogos ni campo de responder): con true suena desde
    startSec + lo transcurrido (elapsedRef, en ms, el mismo del visor);
    con false se pausa. Al cambiar de momento o cerrar, se detiene.
  - Sincronización: el temporizador del visor manda. Cada DRIFT_CHECK_MS
    se mira el desfase y solo se corrige (salto de currentTime) si pasa de
    DRIFT_SEC, con al menos DRIFT_COOLDOWN_MS entre correcciones y nunca
    mientras el audio está cargando (waiting, seeking o readyState < 3).
    En iPhone, con MP3 y red móvil, cada salto vacía el búfer y se oye un
    corte; corregir desfases chicos seguido dejaba la música entrecortada.
  - Fundido de FADE_SEC al empezar y al terminar el tramo, con `volume`
    (iOS lo ignora: en iPhone arranca y corta en seco).
  - `muted` silencia sin cortar (sigue sincronizado). Silenciado, el
    navegador siempre deja reproducir; con sonido puede bloquearlo hasta
    que la persona toque: needsTap queda en true y tapToPlay() (llamada
    dentro del toque) lo arranca.
  - Precarga el audio del siguiente momento si tiene música.

  Devuelve { track, needsTap, tapToPlay, debug }: track es la ficha de la
  pista del momento actual (null si no tiene música o la pista ya no
  existe). `debug` lo lee solo MomentDebugPanel.jsx (?debug=1): el
  <audio>, startSec, el umbral, si está cargando y contadores
  (correcciones de sincronización, play() pedidos y, solo en modo
  diagnóstico, eventos waiting/stalled).
*/

const MOMENT_SEC = MOMENT_DURATION_MS / 1000;
const FADE_SEC = 0.4;
const DRIFT_SEC = 1;
const DRIFT_CHECK_MS = 500;
const DRIFT_COOLDOWN_MS = 3000;

export function useMomentMusic({ momentId, music, nextMusic, running, elapsedRef, muted }) {
  const [library, setLibrary] = useState(null);
  const [needsTap, setNeedsTap] = useState(false);
  const audioRef = useRef(null);
  const preloadRef = useRef(null);
  const statsRef = useRef({ corrections: 0, plays: 0, waiting: 0, stalled: 0 });
  const bufferingRef = useRef(false); // entre "waiting" y "playing"
  const lastSeekRef = useRef(0); // performance.now() del último salto de currentTime
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
      audioRef.current.preload = "auto";
      audioRef.current.addEventListener("waiting", () => (bufferingRef.current = true));
      audioRef.current.addEventListener("playing", () => (bufferingRef.current = false));
      if (DEBUG) {
        ["waiting", "stalled"].forEach((type) =>
          audioRef.current.addEventListener(type, () => statsRef.current[type]++)
        );
      }
    }
    const url = new URL(file, window.location.origin).href;
    if (audioRef.current.src !== url) {
      bufferingRef.current = false;
      audioRef.current.src = url;
    }
  }, [momentId, file]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted, file]);

  // Salta a donde va el momento y reproduce. También la usa el botón
  // "Toca para escuchar" (tiene que correr dentro del toque).
  const play = () => {
    const audio = audioRef.current;
    if (!audio || !file) return;
    lastSeekRef.current = performance.now();
    if (audio.readyState >= 1) audio.currentTime = expected();
    else audio.addEventListener("loadedmetadata", () => (audio.currentTime = expected()), { once: true });
    audio.muted = muted;
    statsRef.current.plays++;
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
      if (now - lastCheck > DRIFT_CHECK_MS) {
        lastCheck = now;
        const loading = bufferingRef.current || audio.seeking || audio.readyState < 3;
        if (
          !audio.paused &&
          !loading &&
          now - lastSeekRef.current > DRIFT_COOLDOWN_MS &&
          Math.abs(audio.currentTime - expected()) > DRIFT_SEC
        ) {
          statsRef.current.corrections++;
          lastSeekRef.current = now;
          audio.currentTime = expected();
        }
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

  return { track, needsTap, tapToPlay: play, debug: { audioRef, statsRef, bufferingRef, startSec, file, driftSec: DRIFT_SEC } };
}
