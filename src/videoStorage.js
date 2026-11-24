/*
  videoStorage.js — dónde se guardan los VIDEOS (y sus miniaturas), lado app.

  TODO lo que la app hace con los archivos de video pasa por aquí: subir,
  obtener el link para verlo y borrar. Ningún otro archivo de la app usa
  firebase/storage para videos. Las FOTOS no pasan por aquí (siguen en
  Firebase Storage con su propio código).

  Por qué: más adelante los videos se van a mover a otro almacenamiento
  (Oracle Cloud). Para eso basta con cambiar este archivo y su pareja del
  servidor, functions/videoStorage.js (la Cloud Function que aprueba el
  video, escribe los links y limpia). Además habría que revisar:
  - storage.rules (bloque postVideos/), que es propio de Firebase;
  - firestore.rules (videoDePostValido), que exige que `path` y
    `posterPath` tengan la forma de videoPaths().

  Hoy: Firebase Storage, en postVideos/{uid}/{postId}/ (posts) y
  momentVideos/{uid}/{momentId}/ (momentos, punto 102), con video.mp4 y
  poster.jpg. Firebase y Storage se cargan aparte (import()), igual que
  antes en videoJob.js, para no sumar peso a la app de quien no sube videos.
*/

// Rutas de los archivos de un video. Se guardan en el documento
// (video.path, video.posterPath) y las revisan firestore.rules y la Cloud
// Function: si se cambia la forma, hay que cambiarla en los tres lados.
export function videoPaths(uid, postId) {
  const base = `postVideos/${uid}/${postId}`;
  return { video: `${base}/video.mp4`, poster: `${base}/poster.jpg` };
}

// Video de un momento (punto 102): momentVideos/{uid}/{momentId}/. Misma
// forma que en firestore.rules (momentoConVideoValido) y en el servidor.
export function momentVideoPaths(uid, momentId) {
  const base = `momentVideos/${uid}/${momentId}`;
  return { video: `${base}/video.mp4`, poster: `${base}/poster.jpg` };
}

// Caché del navegador para el video y la miniatura: un año. Cada archivo
// tiene su propia ruta (por post/momento) y nunca se reescribe, así que no
// hay versión vieja que pueda quedar. "private": solo el navegador de quien
// lo ve, no cachés intermedias (así un video borrado no queda guardado
// fuera del teléfono). Vale para lo que se suba desde ahora; lo ya subido
// sigue sin caché.
const VIDEO_CACHE_CONTROL = "private, max-age=31536000, immutable";

async function loadStorage() {
  const [sdk, { storage }] = await Promise.all([import("firebase/storage"), import("./firebaseStorage")]);
  return { sdk, storage };
}

/*
  Sube el video y su miniatura (subida reanudable).

    const upload = uploadVideoFiles({ paths, blob, posterBlob, onProgress });
    await upload.promise;          // termina cuando están los dos archivos
    upload.pause(); upload.resume();  // al salir y volver a la app
    upload.cancel();

  onProgress(0..1) cuenta los bytes de los dos archivos juntos.
  startPaused: empieza en pausa (por ejemplo, si la app está en segundo
  plano); se sigue con resume().
*/
export function uploadVideoFiles({ paths, blob, posterBlob, onProgress, startPaused = false }) {
  const tasks = new Set();
  let paused = startPaused;
  let canceled = false;

  const promise = (async () => {
    const { sdk, storage } = await loadStorage();
    if (canceled) throw new Error("canceled");
    const total = blob.size + posterBlob.size;
    const loaded = { video: 0, poster: 0 };
    const report = () => {
      if (onProgress) onProgress(Math.min(1, (loaded.video + loaded.poster) / total));
    };
    const one = (key, path, data, contentType) =>
      new Promise((resolve, reject) => {
        const task = sdk.uploadBytesResumable(sdk.ref(storage, path), data, {
          contentType,
          cacheControl: VIDEO_CACHE_CONTROL,
        });
        tasks.add(task);
        if (paused) task.pause();
        task.on(
          "state_changed",
          (snap) => {
            loaded[key] = snap.bytesTransferred;
            report();
          },
          (err) => {
            tasks.delete(task);
            reject(err);
          },
          () => {
            tasks.delete(task);
            loaded[key] = data.size;
            report();
            resolve();
          }
        );
      });
    await Promise.all([
      one("poster", paths.poster, posterBlob, "image/jpeg"),
      one("video", paths.video, blob, "video/mp4"),
    ]);
  })();

  return {
    promise,
    pause: () => {
      paused = true;
      tasks.forEach((task) => task.pause());
    },
    resume: () => {
      paused = false;
      tasks.forEach((task) => task.resume());
    },
    cancel: () => {
      canceled = true;
      tasks.forEach((task) => task.cancel());
      tasks.clear();
    },
  };
}

// Borra el video y su miniatura (al mejor esfuerzo: si no existen, nada).
// Solo lo usa la app al descartar una subida que no llegó a ser post; el
// borrado de un post publicado lo hace el servidor (functions/videoStorage.js).
export async function deleteVideoFiles(paths) {
  try {
    const { sdk, storage } = await loadStorage();
    await Promise.all([
      sdk.deleteObject(sdk.ref(storage, paths.video)).catch(() => {}),
      sdk.deleteObject(sdk.ref(storage, paths.poster)).catch(() => {}),
    ]);
  } catch (e) {
    /* al mejor esfuerzo */
  }
}

// Links para VER un video aprobado: { url, posterUrl } o null si todavía no
// hay. Hoy son los links que escribe la Cloud Function al aprobarlo
// (video.url, video.posterUrl). Si el nuevo almacenamiento usa links que
// vencen, aquí es donde se pedirían.
export function videoPlaybackUrls(video) {
  if (!video || !video.url) return null;
  return { url: video.url, posterUrl: video.posterUrl || null };
}
