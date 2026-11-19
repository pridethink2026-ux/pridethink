/*
  videoStorage.js — dónde se guardan los VIDEOS (y sus miniaturas), lado
  servidor (Cloud Functions).

  TODO lo que las funciones hacen con los archivos de video pasa por aquí:
  revisar que existan, sacar los links para verlos, borrar, y listar las
  carpetas para la limpieza diaria. index.js no toca los archivos de video
  directamente. Las FOTOS (postImages/) no pasan por aquí.

  Por qué: más adelante los videos se van a mover a otro almacenamiento
  (Oracle Cloud). Para eso basta con cambiar este archivo y su pareja de la
  app, src/videoStorage.js (subir, links, borrar). Además habría que
  revisar storage.rules (bloque postVideos/, propio de Firebase) y
  firestore.rules (videoDePostValido, que exige la forma de videoPaths()).

  Hoy: Firebase Storage, en postVideos/{autor}/{postId}/ (posts) y
  momentVideos/{autor}/{momentId}/ (momentos, punto 102), con video.mp4 y
  poster.jpg. Usa firebase-admin (no pasa por storage.rules).
*/

const { getStorage, getDownloadURL } = require("firebase-admin/storage");

const VIDEO_ROOT = "postVideos/";
const MOMENT_VIDEO_ROOT = "momentVideos/"; // punto 102

// Rutas de los archivos de un video. Tienen que coincidir con
// src/videoStorage.js (videoPaths / momentVideoPaths) y con firestore.rules.
function videoPaths(authorId, postId) {
  const base = `${VIDEO_ROOT}${authorId}/${postId}`;
  return { video: `${base}/video.mp4`, poster: `${base}/poster.jpg` };
}

// Video de un momento (punto 102). Al borrarse o vencer el momento, lo
// borra cleanupDeletedMomentFiles (parte 7); además, la regla de ciclo de
// vida del bucket (prefijo momentVideos/, 2 días) borra todo lo que quede.
function momentVideoPaths(authorId, momentId) {
  const base = `${MOMENT_VIDEO_ROOT}${authorId}/${momentId}`;
  return { video: `${base}/video.mp4`, poster: `${base}/poster.jpg` };
}

// Tipo y peso de los dos archivos: { video: { contentType, size },
// poster: { contentType, size } }. Si falta alguno, lanza un error.
async function getVideoFilesInfo(paths) {
  const bucket = getStorage().bucket();
  const [[videoMeta], [posterMeta]] = await Promise.all([
    bucket.file(paths.video).getMetadata(),
    bucket.file(paths.poster).getMetadata(),
  ]);
  return {
    video: { contentType: videoMeta.contentType, size: Number(videoMeta.size) },
    poster: { contentType: posterMeta.contentType, size: Number(posterMeta.size) },
  };
}

// Links para ver el video y su miniatura: { url, posterUrl }. Hoy son links
// con token de Firebase (no vencen); se guardan en el documento al aprobar.
async function getVideoPlaybackUrls(paths) {
  const bucket = getStorage().bucket();
  const [url, posterUrl] = await Promise.all([
    getDownloadURL(bucket.file(paths.video)),
    getDownloadURL(bucket.file(paths.poster)),
  ]);
  return { url, posterUrl };
}

// Borra el video y la miniatura (si no existen, no pasa nada).
async function deleteVideoFiles(paths) {
  const bucket = getStorage().bucket();
  await Promise.all([
    bucket.file(paths.video).delete({ ignoreNotFound: true }),
    bucket.file(paths.poster).delete({ ignoreNotFound: true }),
  ]);
}

// Borra TODO lo que haya en la carpeta del video de un post.
async function deletePostVideoFolder(authorId, postId) {
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `${VIDEO_ROOT}${authorId}/${postId}/`, force: true });
}

// Borra TODO lo que haya en la carpeta del video de un momento (punto 102,
// parte 7: al borrarlo o al vencer).
async function deleteMomentVideoFolder(authorId, momentId) {
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `${MOMENT_VIDEO_ROOT}${authorId}/${momentId}/`, force: true });
}

// Carpetas de video de los posts, para la limpieza diaria
// (cleanupOrphanPostFiles): [{ key, authorId, id, newest (ms), count,
// bytes, remove() }] (id: el del post).
function listPostVideoFolders() {
  return listVideoFolders(VIDEO_ROOT);
}

// Lo mismo para los momentos (punto 102, parte 7; id: el del momento).
function listMomentVideoFolders() {
  return listVideoFolders(MOMENT_VIDEO_ROOT);
}

async function listVideoFolders(root) {
  const [files] = await getStorage().bucket().getFiles({ prefix: root });
  const now = Date.now();
  const folders = new Map();
  for (const file of files) {
    const parts = file.name.split("/"); // [raíz, autor, id, nombre]
    if (parts.length < 4 || !parts[1] || !parts[2]) continue;
    const key = `${parts[0]}/${parts[1]}/${parts[2]}/`;
    const updated = Date.parse(file.metadata.updated || file.metadata.timeCreated) || now;
    let folder = folders.get(key);
    if (!folder) {
      const list = [];
      folder = {
        key,
        authorId: parts[1],
        id: parts[2],
        newest: 0,
        count: 0,
        bytes: 0,
        remove: () => Promise.all(list.map((f) => f.delete({ ignoreNotFound: true }))),
        _files: list,
      };
      folders.set(key, folder);
    }
    folder._files.push(file);
    folder.count += 1;
    folder.bytes += Number(file.metadata.size || 0);
    folder.newest = Math.max(folder.newest, updated);
  }
  return [...folders.values()];
}

module.exports = {
  videoPaths,
  momentVideoPaths,
  getVideoFilesInfo,
  getVideoPlaybackUrls,
  deleteVideoFiles,
  deletePostVideoFolder,
  deleteMomentVideoFolder,
  listPostVideoFolders,
  listMomentVideoFolders,
};
