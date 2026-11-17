import { useSyncExternalStore } from "react";
import { compressVideo } from "./videoCompress";

/*
  videoJob.js — punto 101 (videos en el Muro).

  El video del próximo post vive AQUÍ, a nivel de módulo, y no dentro del
  Muro: así la compresión sigue aunque la persona cambie de sección dentro
  de la app (Muro → Chat → Muro). Al volver, el editor del Muro muestra en
  qué va. En la parte 3 la subida usará este mismo lugar, por el mismo
  motivo.

  Lo que se puede y lo que no (iPhone y Android):
  - Seguir usando la app mientras se prepara: SÍ (este módulo).
  - Pantalla encendida mientras se prepara: SÍ, con Wake Lock (iOS 16.4+,
    Chrome en Android). El navegador lo suelta solo al salir de la app; se
    vuelve a pedir al volver.
  - Seguir en segundo plano (otra app, pantalla bloqueada): NO, la web no
    puede. Al salir se PAUSA; al volver sigue desde donde iba. Si el
    sistema cerró el codificador mientras tanto, falla y queda "Reintentar".
  - "Reintentar" sin elegir el video otra vez: SÍ, mientras la página siga
    abierta (se guarda el archivo elegido en memoria). Si el sistema
    recargó la página entera, el archivo se perdió y hay que elegirlo de
    nuevo.

  Estado (useVideoJob):
  - { status: "idle" }
  - { status: "working" | "paused", progress }   progress 0..1
  - { status: "ready", result }                  ver videoCompress.js
  - { status: "error", code, duration, canRetry }
*/

let state = { status: "idle" };
let file = null; // el archivo elegido, para "Reintentar"
let job = null; // la compresión en curso
let wakeLock = null;
const listeners = new Set();

function setState(next) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function getVideoJobState() {
  return state;
}

export function useVideoJob() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function isBusy() {
  return state.status === "working" || state.status === "paused";
}

function isHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

async function acquireWakeLock() {
  if (wakeLock || isHidden() || typeof navigator === "undefined" || !navigator.wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (!isBusy() || wakeLock) {
      lock.release().catch(() => {});
      return;
    }
    wakeLock = lock;
    lock.addEventListener("release", () => {
      if (wakeLock === lock) wakeLock = null;
    });
  } catch (e) {
    /* sin permiso o sin soporte: la compresión sigue igual */
  }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  const lock = wakeLock;
  wakeLock = null;
  lock.release().catch(() => {});
}

// Salir de la app pausa; volver reanuda y vuelve a pedir la pantalla
// encendida (el navegador la suelta al salir).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!job) return;
    if (isHidden()) {
      job.pause();
      if (state.status === "working") setState({ ...state, status: "paused" });
    } else {
      job.resume();
      if (state.status === "paused") setState({ ...state, status: "working" });
      acquireWakeLock();
    }
  });
}

function run() {
  let lastPercent = -1;
  const thisJob = compressVideo(file, (progress) => {
    if (job !== thisJob || !isBusy()) return;
    // Un aviso por cada 1 % basta (Mediabunny avisa muchas veces por segundo).
    const percent = Math.floor(progress * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    setState({ ...state, progress });
  });
  job = thisJob;

  if (isHidden()) {
    thisJob.pause();
    setState({ status: "paused", progress: 0 });
  } else {
    setState({ status: "working", progress: 0 });
  }
  acquireWakeLock();

  thisJob.promise.then(
    (result) => {
      if (job !== thisJob) return;
      job = null;
      releaseWakeLock();
      setState({ status: "ready", result });
    },
    (err) => {
      if (job !== thisJob) return;
      job = null;
      releaseWakeLock();
      if (err.code === "canceled") {
        setState({ status: "idle" });
        return;
      }
      // Reintentar solo sirve si falló a la mitad (interrupción, memoria);
      // un video demasiado largo o que el teléfono no puede leer va a
      // fallar igual.
      const canRetry = err.code === "failed";
      if (!canRetry) file = null;
      setState({ status: "error", code: err.code, duration: err.duration || 0, canRetry });
    }
  );
}

export function startVideoJob(pickedFile) {
  clearVideoJob();
  file = pickedFile;
  run();
}

export function retryVideoJob() {
  if (file && !job) run();
}

export function clearVideoJob() {
  if (job) {
    const current = job;
    job = null;
    current.cancel();
  }
  file = null;
  releaseWakeLock();
  setState({ status: "idle" });
}
