import { useSyncExternalStore } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { notify } from "./utils";
import { compressVideo } from "./videoCompress";
// Subir y borrar los archivos del video: SIEMPRE por videoStorage.js (ahí
// está todo lo que depende de dónde se guardan los videos).
import { videoPaths, momentVideoPaths, uploadVideoFiles, deleteVideoFiles } from "./videoStorage";
import { createVideoMoment, MomentLimitError } from "./moments";

/*
  videoJob.js — puntos 101 y 102 (videos en el Muro y en Momentos).

  Hay UN trabajo de video por DESTINO (punto 102, parte 3):
  - VIDEO_DEST_FEED ("feed"): el video del próximo post del Muro.
  - VIDEO_DEST_MOMENT ("moment"): el video del próximo momento (se
    conecta en la parte 4).
  Cada uno tiene su archivo, su compresión, su subida y su estado, así uno
  no pisa al otro: se puede estar preparando un video para el Muro y otro
  para Momentos a la vez.

  Cada trabajo vive AQUÍ, a nivel de módulo, y no dentro de la pantalla
  que lo usa: así la compresión Y la subida siguen aunque la persona cambie
  de sección dentro de la app (Muro → Chat → Muro). El avance del Muro se
  ve en el globito de su botón (VideoJobBadge.jsx) y en el editor
  (VideoPicker.jsx).

  Lo que se puede y lo que no (iPhone y Android):
  - Seguir usando la app mientras se prepara o se sube: SÍ (este módulo).
  - Pantalla encendida mientras tanto: SÍ, con Wake Lock (iOS 16.4+,
    Chrome en Android). Uno solo para todos los trabajos: se pide si alguno
    está trabajando y se suelta cuando ninguno lo está. El navegador lo
    suelta solo al salir de la app; se vuelve a pedir al volver.
  - Seguir en segundo plano (otra app, pantalla bloqueada): NO, la web no
    puede. Al salir se PAUSA todo (compresión y subida); al volver sigue
    desde donde iba. Si el sistema cortó algo mientras tanto, queda
    "Reintentar".
  - "Reintentar" sin elegir el video otra vez: SÍ, mientras la página siga
    abierta (el archivo y el video comprimido quedan en memoria). Si el
    sistema recargó la página entera, se perdieron.

  PUBLICAR (publishVideo): sube el video y la miniatura (videoStorage.js) y
  DESPUÉS crea el documento con video.status = "pending" y solo las rutas
  de los archivos, sin links. Qué documento se crea depende del destino
  (PUBLISHERS abajo). Para el Muro: posts/{postId}; storage.rules solo deja
  leer la carpeta a su dueño y solo deja escribir mientras el post no
  exista; firestore.rules solo deja crear el post en "pending". La Cloud
  Function approvePostVideo lo revisa, lo pasa a "approved" y recién ahí
  escribe los links: hasta entonces nadie más puede ver el video. Mientras
  no esté aprobado, PostCard (Feed.jsx) solo se lo muestra al autor.

  Estado (useVideoJob(dest)):
  - { status: "idle", publishedId? }   publishedId: el documento que se
    acaba de publicar (Feed.jsx limpia el editor cuando coincide)
  - { status: "working" | "paused", progress }   compresión, progress 0..1
  - { status: "ready", result }                  ver videoCompress.js
  - { status: "error", code, duration, max, canRetry } falló la compresión
    (en "tooLong": duration = segundos del tramo pedido, max = el máximo)
  - { status: "uploading", result, progress }    subiendo y publicando
  - { status: "uploadError", result, reason }    falló la subida o el documento
    (reason: un motivo conocido, por ejemplo "limit" en Momentos, o null)

  PUBLICAR SOLO (punto 102): startVideoJob(dest, file, options,
  { publishWhenReady: payload }) publica apenas termina la compresión, sin
  esperar un toque. Lo usa Momentos (el momento se publica al terminar de
  prepararse, aunque la persona se haya ido a otra sección).
*/

export const VIDEO_DEST_FEED = "feed";
export const VIDEO_DEST_MOMENT = "moment";

// ---------------------------------------------------------------------
// Qué se publica en cada destino
// ---------------------------------------------------------------------
//
// Cada destino dice:
// - id(payload): el id del documento (y de la carpeta del video);
// - paths(payload): dónde van los archivos (videoStorage.js);
// - create(payload, res, paths): crea el documento en "pending". Lo que
//   pase después de crearlo (afterCreate: avisos) no debe hacer fallar la
//   publicación.
// - errorReason(err) (opcional): un motivo conocido para el aviso de error
//   (queda en el estado "uploadError" como `reason`).

const PUBLISHERS = {
  /*
    Muro. payload: {
      uid, postId,
      fields: { authorName, authorIdentity, text, hashtags, mentionedUids,
                authorIsPrivate, authorIsWallPrivate },
      notifyFrom: { fromName, fromIdentity },
    }
  */
  [VIDEO_DEST_FEED]: {
    id: (payload) => payload.postId,
    paths: (payload) => videoPaths(payload.uid, payload.postId),
    create: async (payload, res, paths) => {
      const { uid, postId, fields } = payload;
      // El post nace en "pending" y SIN links: los escribe la Cloud
      // Function al aprobarlo (ver el comentario de arriba).
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
    },
    afterCreate: async (payload) => {
      const { uid, postId, fields, notifyFrom } = payload;
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
    },
  },
  /*
    Momentos (punto 102, parte 4). payload: { uid, momentId, caption }.
    Crea moments/{momentId} en "pending" junto con el índice del autor
    (moments.js, createVideoMoment). Sin avisos después.
  */
  [VIDEO_DEST_MOMENT]: {
    id: (payload) => payload.momentId,
    paths: (payload) => momentVideoPaths(payload.uid, payload.momentId),
    create: (payload, res, paths) => createVideoMoment(payload.uid, payload.momentId, payload.caption, res, paths),
    // Con 30 momentos activos no se puede: lo dice el aviso del error.
    errorReason: (err) => (err instanceof MomentLimitError ? "limit" : null),
  },
};

// ---------------------------------------------------------------------
// Pantalla encendida y salir de la app (compartido por todos)
// ---------------------------------------------------------------------

const jobs = {}; // destino -> trabajo (createJob)
let wakeLock = null;

function isHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function anyBusy() {
  return Object.values(jobs).some((j) => j.isBusy());
}

async function acquireWakeLock() {
  if (wakeLock || isHidden() || typeof navigator === "undefined" || !navigator.wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (!anyBusy() || wakeLock) {
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

// Pide la pantalla encendida si algún trabajo está ocupado; la suelta si
// ninguno lo está.
function syncWakeLock() {
  if (anyBusy()) {
    acquireWakeLock();
  } else if (wakeLock) {
    const lock = wakeLock;
    wakeLock = null;
    lock.release().catch(() => {});
  }
}

// Salir de la app pausa todo; volver reanuda y vuelve a pedir la pantalla
// encendida (el navegador la suelta al salir).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const hidden = isHidden();
    Object.values(jobs).forEach((j) => j.setHidden(hidden));
    if (!hidden) syncWakeLock();
  });
}

// ---------------------------------------------------------------------
// Un trabajo (uno por destino)
// ---------------------------------------------------------------------

function createJob(dest) {
  let state = { status: "idle" };
  let file = null; // el archivo elegido, para "Reintentar" la compresión
  // Tramo y máximo (punto 102: { start, end, maxSeconds }), para "Reintentar".
  let compressOptions = {};
  let job = null; // la compresión en curso
  let result = null; // el video ya comprimido
  let publishPayload = null; // datos del documento, para "Reintentar" la subida
  let publishRun = 0; // para ignorar una subida que se canceló
  let createdId = null; // el último documento que sí llegó a crearse
  let currentUpload = null; // la subida en curso (uploadVideoFiles)
  let autoPublish = null; // payload para publicar apenas esté listo (publishWhenReady)
  const listeners = new Set();

  const setState = (next) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const isBusy = () =>
    state.status === "working" || state.status === "paused" || state.status === "uploading";

  // --- Compresión ---

  const runCompression = () => {
    let lastPercent = -1;
    const thisJob = compressVideo(
      file,
      (progress) => {
        if (job !== thisJob || (state.status !== "working" && state.status !== "paused")) return;
        // Un aviso por cada 1 % basta (Mediabunny avisa muchas veces por segundo).
        const percent = Math.floor(progress * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        setState({ ...state, progress });
      },
      compressOptions
    );
    job = thisJob;

    if (isHidden()) {
      thisJob.pause();
      setState({ status: "paused", progress: 0 });
    } else {
      setState({ status: "working", progress: 0 });
    }
    syncWakeLock();

    thisJob.promise.then(
      (res) => {
        if (job !== thisJob) return;
        job = null;
        result = res;
        setState({ status: "ready", result: res });
        if (autoPublish && PUBLISHERS[dest]) {
          // Publicar solo (Momentos): sin esperar un toque.
          publishPayload = autoPublish;
          runPublish();
          return;
        }
        syncWakeLock();
      },
      (err) => {
        if (job !== thisJob) return;
        job = null;
        if (err.code === "canceled") {
          setState({ status: "idle" });
          syncWakeLock();
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
        syncWakeLock();
      }
    );
  };

  // --- Publicar ---

  const runPublish = async () => {
    const publisher = PUBLISHERS[dest];
    if (!publishPayload || !result || !publisher) return;
    publishRun += 1;
    const run = publishRun;
    const res = result;
    const payload = publishPayload;
    const id = publisher.id(payload);
    const paths = publisher.paths(payload);
    const stillCurrent = () => run === publishRun && state.status === "uploading";

    setState({ status: "uploading", result: res, progress: 0 });
    syncWakeLock();

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

      await publisher.create(payload, res, paths);
      createdId = id;
      if (run !== publishRun) return;

      // Lo de después (avisos) no debe hacer fallar la publicación: el
      // documento ya existe.
      if (publisher.afterCreate) await publisher.afterCreate(payload).catch(() => {});

      file = null;
      result = null;
      publishPayload = null;
      setState({ status: "idle", publishedId: id });
      syncWakeLock();
    } catch (err) {
      if (run !== publishRun) return;
      // eslint-disable-next-line no-console
      console.warn(`publishVideo (${dest}):`, err);
      const reason = (publisher.errorReason && publisher.errorReason(err)) || null;
      setState({ status: "uploadError", result: res, reason });
      syncWakeLock();
    }
  };

  const clear = () => {
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
    // Borra los archivos de una subida que no llegó a ser documento (al
    // descartar después de un error). Nunca los de uno que sí se creó.
    const publisher = PUBLISHERS[dest];
    if (publishPayload && publisher && publisher.id(publishPayload) !== createdId) {
      deleteVideoFiles(publisher.paths(publishPayload));
    }
    publishPayload = null;
    autoPublish = null;
    file = null;
    result = null;
    setState({ status: "idle" });
    syncWakeLock();
  };

  return {
    isBusy,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Salir de la app (hidden) pausa; volver reanuda.
    setHidden: (hidden) => {
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
    },
    start: (pickedFile, options, extra) => {
      clear();
      file = pickedFile;
      compressOptions = { ...options };
      autoPublish = (extra && extra.publishWhenReady) || null;
      runCompression();
    },
    retry: () => {
      if (state.status === "uploadError") {
        runPublish();
        return;
      }
      if (file && !job) runCompression();
    },
    publish: (payload) => {
      if (state.status !== "ready" || !result) return;
      if (!PUBLISHERS[dest]) {
        // eslint-disable-next-line no-console
        console.warn(`publishVideo: el destino "${dest}" todavía no publica`);
        return;
      }
      publishPayload = payload;
      runPublish();
    },
    clear,
  };
}

jobs[VIDEO_DEST_FEED] = createJob(VIDEO_DEST_FEED);
jobs[VIDEO_DEST_MOMENT] = createJob(VIDEO_DEST_MOMENT);

function jobFor(dest) {
  const j = jobs[dest];
  if (!j) throw new Error(`videoJob: destino desconocido "${dest}"`);
  return j;
}

// ---------------------------------------------------------------------
// API (siempre con el destino)
// ---------------------------------------------------------------------

export function useVideoJob(dest) {
  const j = jobFor(dest);
  return useSyncExternalStore(j.subscribe, j.getState);
}

export function getVideoJobState(dest) {
  return jobFor(dest).getState();
}

// options (punto 102, opcional): { start, end, maxSeconds }, ver
// videoCompress.js. Sin options, el video entero con el máximo del Muro.
// extra (opcional): { publishWhenReady: payload } para publicar apenas
// termine la compresión (Momentos).
export function startVideoJob(dest, pickedFile, options = {}, extra = null) {
  jobFor(dest).start(pickedFile, options, extra);
}

export function retryVideoJob(dest) {
  jobFor(dest).retry();
}

// Solo con el video listo (status "ready"). payload: ver PUBLISHERS.
export function publishVideo(dest, payload) {
  jobFor(dest).publish(payload);
}

export function clearVideoJob(dest) {
  jobFor(dest).clear();
}
