import { useSyncExternalStore } from "react";

/*
  feedVideo.js — punto 101 (videos en el Muro), parte 4.

  UN SOLO reproductor (<video>) para toda la app, que salta de post en
  post. Por qué (probado en iPhone el 2026-11-16, ver CONTEXTO.md, punto
  101, parte 1): en Safari el permiso para sonar es de
  cada elemento <video>; si cada post tuviera el suyo, el siguiente video
  no podría sonar solo aunque la persona ya hubiera activado el sonido.
  Reusando el mismo elemento, una vez que la persona toca la bocina, los
  siguientes suenan solos. Además, así solo se descarga el video que se
  está viendo (los demás muestran su miniatura).

  Cada video aprobado (PostVideo.jsx) registra su "hueco" con
  registerSlot(). El post que esté al menos 60 % visible durante medio
  segundo se queda con el reproductor: arranca solo (en silencio, salvo
  que la persona ya haya activado el sonido) y se pausa al salir de la
  pantalla. Tocar el video lo pausa o lo sigue; la bocina activa o silencia
  TODOS los videos mientras la pestaña esté abierta (al recargar vuelve a
  silencio: ningún navegador deja sonar sin un toque nuevo).

  Si el navegador no deja arrancar solo (por ejemplo el Ahorro de batería
  del iPhone), queda "blocked": la miniatura con ▶, y arranca al tocarla.
  Si no deja arrancar CON sonido, arranca en silencio y la bocina vuelve a
  🔇.

  Estado por video (useFeedVideo(id)): si ese video tiene el reproductor,
  { activeId, remaining, paused, userPaused, blocked, muted, soundOn };
  si no, solo { activeId: null, soundOn }.
*/

const VISIBLE_RATIO = 0.6;
const ACTIVATE_DELAY_MS = 500;

const slots = new Map(); // id -> { mount, url, duration }
const ratios = new Map(); // id -> fracción visible
let el = null;
let activeId = null;
let soundOn = false;
let userPaused = false;
let blocked = false;
let candidateTimer = null;
let candidateId = null;
let observer = null;
// Dónde iba cada video que se soltó al salir de la pantalla (release()).
const resumeAt = new Map(); // id -> segundos

const IDLE_MUTED = { activeId: null, soundOn: false };
const IDLE_SOUND = { activeId: null, soundOn: true };
let state = { activeId: null };
const listeners = new Set();

// ---------------------------------------------------------------------
// Estado para React
// ---------------------------------------------------------------------

function remainingSeconds() {
  if (!el || !activeId) return 0;
  const slot = slots.get(activeId);
  const duration = isFinite(el.duration) && el.duration > 0 ? el.duration : slot ? slot.duration : 0;
  return Math.max(0, Math.ceil(duration - (el.currentTime || 0)));
}

function emit() {
  const next = {
    activeId,
    remaining: remainingSeconds(),
    paused: el ? el.paused : true,
    userPaused,
    blocked,
    muted: el ? el.muted : true,
    soundOn,
  };
  const same =
    next.activeId === state.activeId &&
    next.remaining === state.remaining &&
    next.paused === state.paused &&
    next.userPaused === state.userPaused &&
    next.blocked === state.blocked &&
    next.muted === state.muted &&
    next.soundOn === state.soundOn;
  if (same) return;
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFeedVideo(id) {
  return useSyncExternalStore(subscribe, () => {
    if (state.activeId === id) return state;
    return soundOn ? IDLE_SOUND : IDLE_MUTED;
  });
}

// ---------------------------------------------------------------------
// El elemento <video> (uno solo)
// ---------------------------------------------------------------------

function isFullscreen() {
  return !!el && (document.fullscreenElement === el || el.webkitDisplayingFullscreen === true);
}

// En pantalla completa el video se ve ENTERO (contain) y con los
// controles del navegador; en el Muro, recortado al marco (cover) y sin
// controles.
function applyFullscreenLook() {
  if (!el) return;
  const full = isFullscreen();
  el.style.objectFit = full ? "contain" : "cover";
  el.controls = full;
}

function ensureElement() {
  if (el) return el;
  el = document.createElement("video");
  el.playsInline = true;
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  el.muted = true;
  el.loop = true;
  el.preload = "auto";
  el.disablePictureInPicture = true;
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center",
    display: "block",
    opacity: "0", // hasta que haya imagen: así no se ve un cuadro negro
  });

  el.addEventListener("loadeddata", () => {
    el.style.opacity = "1";
  });
  el.addEventListener("playing", () => {
    el.style.opacity = "1";
    blocked = false;
    emit();
  });
  ["timeupdate", "pause", "play", "loadedmetadata", "durationchange"].forEach((type) =>
    el.addEventListener(type, emit)
  );
  // Si se cambia el sonido desde los controles de pantalla completa, la
  // bocina lo refleja (y vale para los siguientes videos).
  el.addEventListener("volumechange", () => {
    if (isFullscreen()) soundOn = !el.muted;
    emit();
  });
  document.addEventListener("fullscreenchange", applyFullscreenLook);
  el.addEventListener("webkitbeginfullscreen", applyFullscreenLook);
  el.addEventListener("webkitendfullscreen", () => {
    applyFullscreenLook();
    // Al salir de la pantalla completa del iPhone el video queda en pausa:
    // si la persona no lo pausó, sigue.
    if (activeId && !userPaused) tryPlay();
  });
  return el;
}

function tryPlay() {
  if (!el || !activeId || suspended) return;
  el.muted = !soundOn;
  const attempt = el.play();
  if (!attempt || !attempt.catch) return;
  attempt.catch(() => {
    if (!el.muted) {
      // No dejó arrancar CON sonido sin un toque: en silencio.
      soundOn = false;
      el.muted = true;
      el.play().catch(() => {
        blocked = true;
        emit();
      });
    } else {
      blocked = true; // por ejemplo, Ahorro de batería
    }
    emit();
  });
}

function stopElement() {
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load(); // corta la descarga
  el.style.opacity = "0";
  if (el.parentNode) el.parentNode.removeChild(el);
}

function activate(id) {
  const slot = slots.get(id);
  if (!slot) return;
  ensureElement();
  if (activeId !== id) {
    el.pause();
    activeId = id;
    userPaused = false;
    blocked = false;
    el.style.opacity = "0";
    slot.mount.appendChild(el);
    // Si se soltó al salir de la pantalla, sigue desde donde iba.
    const start = resumeAt.get(id) || 0;
    resumeAt.delete(id);
    if (start > 0) {
      el.addEventListener(
        "loadedmetadata",
        () => {
          if (activeId === id) el.currentTime = start;
        },
        { once: true }
      );
    }
    el.src = slot.url;
  }
  tryPlay();
  emit();
}

// ---------------------------------------------------------------------
// Qué video está a la vista
// ---------------------------------------------------------------------

function mostVisible() {
  let best = null;
  let bestRatio = VISIBLE_RATIO;
  ratios.forEach((ratio, id) => {
    if (ratio >= bestRatio) {
      best = id;
      bestRatio = ratio;
    }
  });
  return best;
}

// El activo salió del todo de la pantalla: se saca el <video> del marco y
// se suelta el archivo (queda la miniatura). Libera memoria y deja la
// página sin video cuando no se ve; en el iPhone, tenerlo pegado (aunque
// en pausa) dejaba en blanco el post de abajo. Se recuerda dónde iba y al
// volver sigue desde ahí (activate). Es el mismo elemento, así que el
// permiso de sonar de Safari se mantiene.
function release() {
  if (!el || !activeId || isFullscreen()) return;
  resumeAt.set(activeId, el.currentTime || 0);
  stopElement();
  activeId = null;
  userPaused = false;
  blocked = false;
  emit();
}

// Punto 102, parte 5: mientras el visor de Momentos está abierto (encima
// del Muro), el Muro no reproduce nada: se pausa el video activo y nada
// arranca solo. Al cerrarlo, todo sigue como estaba.
let suspended = false;

export function setFeedVideoSuspended(value) {
  suspended = !!value;
  clearTimeout(candidateTimer);
  candidateTimer = null;
  candidateId = null;
  if (suspended) {
    if (el && !el.paused) el.pause();
  } else {
    decide();
  }
}

function decide() {
  if (suspended) return;
  const target = mostVisible();
  const activeRatio = activeId ? ratios.get(activeId) || 0 : 1;
  if (activeRatio === 0) {
    release();
  } else if (activeRatio < VISIBLE_RATIO && el && !el.paused) {
    // Casi fuera de la pantalla: pausa (queda en su lugar, en pausa).
    el.pause();
  }
  if (!target) {
    clearTimeout(candidateTimer);
    candidateTimer = null;
    candidateId = null;
    return;
  }
  if (target === activeId) {
    clearTimeout(candidateTimer);
    candidateTimer = null;
    candidateId = null;
    if (el && el.paused && !userPaused && !blocked && autoplayEnabled()) tryPlay();
    return;
  }
  if (!autoplayEnabled()) return;
  if (candidateId === target) return;
  clearTimeout(candidateTimer);
  candidateId = target;
  candidateTimer = setTimeout(() => {
    candidateTimer = null;
    candidateId = null;
    if (mostVisible() === target) activate(target);
  }, ACTIVATE_DELAY_MS);
}

function ensureObserver() {
  if (observer || typeof IntersectionObserver === "undefined") return;
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = entry.target.dataset.feedVideoId;
        if (id) ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
      });
      decide();
    },
    { threshold: [0, 0.25, VISIBLE_RATIO, 0.8, 1] }
  );
}

// Al salir de la app el navegador pausa; al volver, sigue si correspondía.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && activeId && !userPaused && el && el.paused) {
      if ((ratios.get(activeId) || 0) >= VISIBLE_RATIO) tryPlay();
    }
  });
}

// ---------------------------------------------------------------------
// Reproducción automática (parte 5: interruptor en Perfil)
// ---------------------------------------------------------------------
// Activada por defecto. Se guarda EN ESTE DISPOSITIVO (localStorage), no en
// la cuenta: ahorrar datos depende del teléfono (datos móviles) y no de la
// persona, y así no hace falta tocar las reglas. Apagada: nada arranca ni
// se descarga solo; cada video muestra su miniatura con ▶ y arranca al
// tocarlo.

const AUTOPLAY_KEY = "pt-video-autoplay";
let autoplay = true;
try {
  autoplay = window.localStorage.getItem(AUTOPLAY_KEY) !== "0";
} catch (e) {
  autoplay = true;
}
const autoplayListeners = new Set();

export function autoplayEnabled() {
  return autoplay;
}

export function setAutoplayEnabled(value) {
  autoplay = !!value;
  try {
    if (autoplay) window.localStorage.removeItem(AUTOPLAY_KEY);
    else window.localStorage.setItem(AUTOPLAY_KEY, "0");
  } catch (e) {
    /* sin almacenamiento: vale solo mientras la pestaña esté abierta */
  }
  // Al apagarla, el video que arrancó solo se pausa; al prenderla, el que
  // está a la vista arranca.
  if (!autoplay) {
    clearTimeout(candidateTimer);
    candidateTimer = null;
    candidateId = null;
    if (el && !el.paused) el.pause();
  } else {
    decide();
  }
  autoplayListeners.forEach((listener) => listener());
}

export function useAutoplayVideos() {
  return useSyncExternalStore(
    (listener) => {
      autoplayListeners.add(listener);
      return () => autoplayListeners.delete(listener);
    },
    () => autoplay
  );
}

// ---------------------------------------------------------------------
// API para PostVideo.jsx
// ---------------------------------------------------------------------

// observeEl: el marco del post (lo que se mide); mount: donde se pone el
// <video> (un div vacío que React no toca).
export function registerSlot(id, { observeEl, mount, url, duration }) {
  ensureObserver();
  slots.set(id, { mount, url, duration });
  observeEl.dataset.feedVideoId = id;
  if (observer) observer.observe(observeEl);
  return () => {
    if (observer) observer.unobserve(observeEl);
    slots.delete(id);
    ratios.delete(id);
    resumeAt.delete(id);
    if (candidateId === id) {
      clearTimeout(candidateTimer);
      candidateTimer = null;
      candidateId = null;
    }
    if (activeId === id) {
      stopElement();
      activeId = null;
      userPaused = false;
      blocked = false;
      emit();
    }
  };
}

// Tocar el video: si no es el activo, lo activa; si lo es, pausa o sigue.
export function togglePlay(id) {
  if (activeId !== id) {
    activate(id);
    return;
  }
  if (el.paused) {
    userPaused = false;
    blocked = false;
    tryPlay();
  } else {
    userPaused = true;
    el.pause();
  }
  emit();
}

// La bocina: activa o silencia TODOS los videos (se recuerda en la pestaña).
// Se llama desde un toque, así que Safari habilita este reproductor para
// sonar también en los siguientes videos.
export function toggleSound(id) {
  soundOn = !soundOn;
  if (activeId !== id) {
    activate(id);
    return;
  }
  el.muted = !soundOn;
  if (el.paused && !userPaused) tryPlay();
  emit();
}

// Pantalla completa: el video entero, sin recorte, con los controles del
// navegador. En iPhone es el reproductor nativo (webkitEnterFullscreen).
export function enterFullscreen(id) {
  if (activeId !== id) activate(id);
  if (!el) return;
  try {
    if (document.fullscreenEnabled && el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitEnterFullscreen) {
      el.webkitEnterFullscreen();
    }
  } catch (e) {
    /* todavía sin datos: el segundo toque ya funciona */
  }
}
