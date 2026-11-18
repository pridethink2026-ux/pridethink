import { useSyncExternalStore } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { notify } from "./utils";
import { compressVideo } from "./videoCompress";
// Subir y borrar los archivos del video: SIEMPRE por videoStorage.js (ahí
// está todo lo que depende de dónde se guardan los videos).
import { videoPaths, uploadVideoFiles, deleteVideoFiles } from "./videoStorage";

/*
  videoJob.js — punto 101 (videos en el Muro).

  El video del próximo post vive AQUÍ, a nivel de módulo, y no dentro del
  Muro: así la compresión Y la subida siguen aunque la persona cambie de
  sección dentro de la app (Muro → Chat → Muro). El avance se ve en el
  globito del botón del Muro (VideoJobBadge.jsx) y, en el Muro, en el
  editor (VideoPicker.jsx).

  Lo que se puede y lo que no (iPhone y Android):
  - Seguir usando la app mientras se prepara o se sube: SÍ (este módulo).
  - Pantalla encendida mientras tanto: SÍ, con Wake Lock (iOS 16.4+,
    Chrome en Android). El navegador lo suelta solo al salir de la app; se
    vuelve a pedir al volver.
  - Seguir en segundo plano (otra app, pantalla bloqueada): NO, la web no
    puede. Al salir se PAUSA (compresión y subida); al volver sigue desde
    donde iba. Si el sistema cortó algo mientras tanto, queda "Reintentar".
  - "Reintentar" sin elegir el video otra vez: SÍ, mientras la página siga
    abierta (el archivo y el video comprimido quedan en memoria). Si el
    sistema recargó la página entera, se perdieron.

  PUBLICAR (parte 3, publishVideoPost): sube video.mp4 y poster.jpg a
  postVideos/{uid}/{postId}/ (subida reanudable) y DESPUÉS crea el post con
  video.status = "pending" y solo las rutas de los archivos, sin links.
  storage.rules solo deja leer esa carpeta a su dueño y solo deja escribir
  mientras el post no exista; firestore.rules solo deja crear el post en
  "pending". La Cloud Function approvePostVideo lo revisa, lo pasa a
  "approved" y recién ahí escribe los links: hasta entonces nadie más
  puede ver el video. Mientras no esté aprobado, PostCard (Feed.jsx) solo
  se lo muestra al autor ("Procesando…").

  Estado (useVideoJob):
  - { status: "idle", publishedPostId? }   publishedPostId: el post que se
    acaba de publicar (Feed.jsx limpia el editor cuando coincide)
  - { status: "working" | "paused", progress }   compresión, progress 0..1
  - { status: "ready", result }                  ver videoCompress.js
  - { status: "error", code, duration, max, canRetry } falló la compresión
    (en "tooLong": duration = segundos del tramo pedido, max = el máximo)
  - { status: "uploading", result, progress }    subiendo y publicando
  - { status: "uploadError", result }            falló la subida o el post
*/

let state = { status: "idle" };
let file = null; // el archivo elegido, para "Reintentar" la compresión
// Tramo y máximo (punto 102: { start, end, maxSeconds }), para "Reintentar".
let compressOptions = {};
let job = null; // la compresión en curso
let result = null; // el video ya comprimido
let publishPayload = null; // datos del post, para "Reintentar" la subida
let publishRun = 0; // para ignorar una subida que se canceló
let createdPostId = null; // el último post que sí llegó a crearse
let currentUpload = null; // la subida en curso (uploadVideoFiles)
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
  return state.status === "working" || state.status === "paused" || state.status === "uploading";
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
    /* sin permiso o sin soporte: todo sigue igual */
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
    const hidden = isHidden();
    if (job) {
      if (hidden) {
        job.pause();
        if (state.status === "working") setState({ ...state, status: "paused" });
      } else {
        job.resume();
        if (state.status === "paused") setState({ ...state, status: "working" });
      }
    }
    if (currentUpload) {
      if (hidden) currentUpload.pause();
      else currentUpload.resume();
    }
    if (!hidden && isBusy()) acquireWakeLock();
  });
}

// ---------------------------------------------------------------------
// Compresión
// ---------------------------------------------------------------------

function runCompression() {
  let lastPercent = -1;
  const thisJob = compressVideo(file, (progress) => {
    if (job !== thisJob || (state.status !== "working" && state.status !== "paused")) return;
    // Un aviso por cada 1 % basta (Mediabunny avisa muchas veces por segundo).
    const percent = Math.floor(progress * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    setState({ ...state, progress });
  }, compressOptions);
  job = thisJob;

  if (isHidden()) {
    thisJob.pause();
    setState({ status: "paused", progress: 0 });
  } else {
    setState({ status: "working", progress: 0 });
  }
  acquireWakeLock();

  thisJob.promise.then(
    (res) => {
      if (job !== thisJob) return;
      job = null;
      result = res;
      releaseWakeLock();
      setState({ status: "ready", result: res });
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
      setState({
        status: "error",
        code: err.code,
        duration: err.duration || 0,
        max: err.max || 0,
        canRetry,
      });
    }
  );
}

// options (punto 102, opcional): { start, end, maxSeconds }, ver
// videoCompress.js. Sin options, el video entero con el máximo del Muro.
export function startVideoJob(pickedFile, options = {}) {
  clearVideoJob();
  file = pickedFile;
  compressOptions = { ...options };
  runCompression();
}

export function retryVideoJob() {
  if (state.status === "uploadError") {
    runPublish();
    return;
  }
  if (file && !job) runCompression();
}

// ---------------------------------------------------------------------
// Publicar (parte 3)
// ---------------------------------------------------------------------

/*
  payload: {
    uid, postId,
    fields: { authorName, authorIdentity, text, hashtags, mentionedUids,
              authorIsPrivate, authorIsWallPrivate },
    notifyFrom: { fromName, fromIdentity },
  }
  Solo con el video listo (status "ready").
*/
export function publishVideoPost(payload) {
  if (state.status !== "ready" || !result) return;
  publishPayload = payload;
  runPublish();
}

async function runPublish() {
  if (!publishPayload || !result) return;
  publishRun += 1;
  const run = publishRun;
  const res = result;
  const { uid, postId, fields, notifyFrom } = publishPayload;
  const paths = videoPaths(uid, postId);
  const stillCurrent = () => run === publishRun && state.status === "uploading";

  setState({ status: "uploading", result: res, progress: 0 });
  acquireWakeLock();

  try {
    let lastPercent = -1;
    const upload = uploadVideoFiles({
      paths,
      blob: res.blob,
      posterBlob: res.posterBlob,
      startPaused: isHidden(),
      onProgress: (progress) => {
        if (!stillCurrent()) return;
        const percent = Math.floor(progress * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        setState({ ...state, progress });
      },
    });
    currentUpload = upload;
    try {
      await upload.promise;
    } finally {
      if (currentUpload === upload) currentUpload = null;
    }
    if (run !== publishRun) return;

    // El post nace en "pending" y SIN links: los escribe la Cloud Function
    // al aprobarlo (ver el comentario de arriba).
    await setDoc(doc(db, "posts", postId), {
      authorId: uid,
      authorName: fields.authorName,
      authorIdentity: fields.authorIdentity,
      text: fields.text,
      imageUrls: [],
      hashtags: fields.hashtags,
      mentionedUids: fields.mentionedUids,
      createdAt: serverTimestamp(),
      reactions: {},
      authorIsPrivate: fields.authorIsPrivate,
      authorIsWallPrivate: fields.authorIsWallPrivate,
      video: {
        status: "pending",
        path: paths.video,
        posterPath: paths.poster,
        duration: Math.round(res.duration * 10) / 10,
        width: res.width,
        height: res.height,
        size: res.blob.size,
      },
    });
    createdPostId = postId;
    if (run !== publishRun) return;

    // Las menciones no deben hacer fallar la publicación (el post ya existe).
    await Promise.all(
      fields.mentionedUids.map((targetUid) =>
        notify(targetUid, {
          type: "mention",
          fromUid: uid,
          fromName: notifyFrom.fromName,
          fromIdentity: notifyFrom.fromIdentity,
          postId,
        }).catch(() => {})
      )
    );

    file = null;
    result = null;
    publishPayload = null;
    releaseWakeLock();
    setState({ status: "idle", publishedPostId: postId });
  } catch (err) {
    if (run !== publishRun) return;
    // eslint-disable-next-line no-console
    console.warn("publishVideoPost:", err);
    releaseWakeLock();
    setState({ status: "uploadError", result: res });
  }
}

// Borra los archivos de una subida que no llegó a ser post (al descartar
// después de un error). Si el post sí se creó, storage.rules igual deja al
// dueño borrar; pero aquí solo se llama cuando no se creó.
function deleteUploadedFiles(payload) {
  deleteVideoFiles(videoPaths(payload.uid, payload.postId));
}

export function clearVideoJob() {
  if (job) {
    const current = job;
    job = null;
    current.cancel();
  }
  if (currentUpload) {
    currentUpload.cancel();
    currentUpload = null;
  }
  publishRun += 1; // cualquier subida en curso queda descartada
  // Nunca se borran los archivos de un post que ya se creó.
  if (publishPayload && publishPayload.postId !== createdPostId) {
    deleteUploadedFiles(publishPayload);
  }
  publishPayload = null;
  file = null;
  result = null;
  releaseWakeLock();
  setState({ status: "idle" });
}
