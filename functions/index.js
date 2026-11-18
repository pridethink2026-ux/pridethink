/*
  Cloud Functions de Pridethink.

  Punto 97 — notifyChatMessage: con cada mensaje nuevo de chat
  (chats/{chatId}/messages/{messageId}) manda una notificación push a los
  dispositivos de quien lo recibe (users/{uid}/devices, ver src/push.js).

  No manda nada si:
  - hay un bloqueo en cualquier dirección (blocks/{a}_{b});
  - ese dispositivo está viendo ese chat (viewingChatId + viewingUntil).

  El texto va ya armado y traducido al idioma de quien recibe
  (private/data.language). Con private/data.pushShowText == false dice
  solo "Pridethink" / "Tienes un mensaje nuevo", sin nombre ni texto.
  Se manda solo como datos: public/service-worker.js arma la notificación
  (y siempre muestra una, aunque falten datos).

  Limpieza de tokens: se borran los dispositivos cuyo token FCM rechaza
  como vencido o inválido, y los que llevan más de 60 días sin que la app
  los confirme (lastSeenAt).

  Usa firebase-admin, que no pasa por firestore.rules. Nunca escribe el
  contenido de un mensaje en los registros.

  Punto 98: cada aviso lleva también data.unread, el total de mensajes sin
  leer de quien recibe (el mismo número del globito del Chat), para el
  número sobre el ícono de la app. Ver countUnreadMessages.

  Punto 101 — approvePostVideo: con cada post nuevo que trae video
  (video.status == "pending"), revisa los archivos y lo aprueba: escribe
  los links (video.url, video.posterUrl) y pasa a "approved". Hasta
  entonces nadie más que el autor puede ver el video (ver storage.rules,
  postVideos/). El lugar para un filtro automático (por ejemplo Google
  Video Intelligence) es moderateVideo().

  Punto 102 — approveMomentVideo: lo mismo para un momento con video
  (moments/{momentId}); al aprobar escribe además imageURL = la miniatura.
  Las dos usan reviewVideoDoc().

  Punto 101, parte 6 — limpieza de Storage:
  - cleanupDeletedPostFiles: al borrar un post, borra su carpeta de video
    (postVideos/{autor}/{postId}/) y la de fotos (postImages/{autor}/{postId}/).
  - cleanupOrphanPostFiles: una vez al día, busca carpetas de esas dos rutas
    cuyo post no existe y que llevan más de 2 días sin cambios (subidas
    abandonadas, fotos de borradores que nunca se publicaron, y fotos de
    posts borrados antes de esta función). Con ORPHAN_CLEANUP_DRY_RUN = true
    solo REGISTRA lo que borraría; se cambia a false después de revisar los
    registros.

  Subir: npx firebase deploy --only functions (o npm run deploy:functions
  desde la raíz del proyecto).
*/

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
// Archivos de VIDEO: siempre por videoStorage.js (ahí está todo lo que
// depende de dónde se guardan los videos). Las fotos siguen aquí.
const videoStorage = require("./videoStorage");
const { getMessaging } = require("firebase-admin/messaging");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");

initializeApp();

// Misma región que la base de Firestore (us-central1).
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const STALE_MS = 60 * 24 * 60 * 60 * 1000;
const PREVIEW_MAX = 100;
const NAME_MAX = 60;
// Si el teléfono está apagado, FCM guarda el aviso hasta 1 día.
const TTL_SECONDS = 24 * 60 * 60;

const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const TEXTS = {
  es: {
    generic: "Tienes un mensaje nuevo",
    someone: "Alguien",
    momentReply: "Respondió a tu momento: ",
    momentReplyEmpty: "Respondió a tu momento",
    sticker: "Te envió un sticker",
    image: "Te envió una foto",
    audio: "Te envió un audio",
    gift: "Te envió un regalo 🎁",
    shared_post: "Te compartió una publicación",
  },
  en: {
    generic: "You have a new message",
    someone: "Someone",
    momentReply: "Replied to your moment: ",
    momentReplyEmpty: "Replied to your moment",
    sticker: "Sent you a sticker",
    image: "Sent you a photo",
    audio: "Sent you a voice message",
    gift: "Sent you a gift 🎁",
    shared_post: "Shared a post with you",
  },
};

// Corta por caracteres reales (no parte un emoji a la mitad).
function truncate(text, max) {
  const chars = Array.from(String(text || "").trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : chars.join("");
}

function describeMessage(message, texts) {
  const type = message.type || "text";
  if (type === "text") return truncate(message.text, PREVIEW_MAX) || texts.generic;
  if (type === "moment_reply") {
    const reply = truncate(message.text, PREVIEW_MAX - texts.momentReply.length);
    return reply ? `${texts.momentReply}${reply}` : texts.momentReplyEmpty;
  }
  return texts[type] || texts.generic;
}

function millis(timestamp) {
  return timestamp && typeof timestamp.toMillis === "function" ? timestamp.toMillis() : null;
}

// ---------------------------------------------------------------------
// Punto 98: total de mensajes sin leer de quien recibe, para el número
// sobre el ícono de la app (service worker → setAppBadge). Es la misma
// cuenta que el globito del botón Chat: useChatUnread, isChatInMyList,
// isChatUnread, canChatWithUser y unreadCutoff en src/chatMessages.js. Si
// cambia allá, hay que cambiarla acá.
// ---------------------------------------------------------------------

// Mismo tope por conversación que UNREAD_MESSAGES_MAX en chatMessages.js.
const UNREAD_MESSAGES_MAX = 100;

async function countUnreadMessages(db, uid) {
  const chatsSnap = await db.collection("chats").where("participants", "array-contains", uid).get();

  const unreadChats = [];
  chatsSnap.forEach((chatDoc) => {
    const chat = chatDoc.data();
    const last = millis(chat.lastMessageAt) || 0;
    const hidden = millis(chat.hiddenAt && chat.hiddenAt[uid]) || 0;
    const read = millis(chat.lastReadAt && chat.lastReadAt[uid]) || 0;
    // En tu lista (isChatInMyList) y sin leer (isChatUnread).
    if (!(last > 0 && last > hidden)) return;
    if (!chat.lastSenderId || chat.lastSenderId === uid || !(last > read)) return;
    const otherUid = (chat.participants || []).find((p) => p !== uid);
    if (!otherUid) return;
    // Corte: lo posterior a tu lectura y a cuando la eliminaste (unreadCutoff).
    const cutoff = hidden > read ? chat.hiddenAt[uid] : (chat.lastReadAt && chat.lastReadAt[uid]) || null;
    unreadChats.push({ ref: chatDoc.ref, otherUid, writers: chat.writers || {}, cutoff });
  });
  if (unreadChats.length === 0) return 0;

  // canChatWithUser: sin bloqueo en ninguna dirección; si el perfil es
  // privado, solo si ya te escribió o se siguen mutuamente.
  const allowed = await Promise.all(
    unreadChats.map(async ({ otherUid, writers }) => {
      const [userSnap, blockedByMe, blockedMe] = await Promise.all([
        db.doc(`users/${otherUid}`).get(),
        db.doc(`blocks/${uid}_${otherUid}`).get(),
        db.doc(`blocks/${otherUid}_${uid}`).get(),
      ]);
      if (!userSnap.exists || blockedByMe.exists || blockedMe.exists) return false;
      if (!userSnap.data().isPrivate) return true;
      if (writers[otherUid] === true) return true;
      const [iFollow, followsMe] = await Promise.all([
        db.doc(`follows/${uid}_${otherUid}`).get(),
        db.doc(`follows/${otherUid}_${uid}`).get(),
      ]);
      return iFollow.exists && followsMe.exists;
    })
  );

  // Mensajes de la otra persona después del corte. select() trae solo el
  // remitente (no baja las notas de voz enteras).
  const counts = await Promise.all(
    unreadChats
      .filter((_, i) => allowed[i])
      .map(async ({ ref, cutoff }) => {
        let q = ref.collection("messages");
        if (cutoff) q = q.where("createdAt", ">", cutoff);
        const snap = await q.orderBy("createdAt", "desc").limit(UNREAD_MESSAGES_MAX).select("senderId").get();
        // Igual que el globito: una conversación sin leer vale al menos 1.
        return snap.docs.filter((m) => m.get("senderId") !== uid).length || 1;
      })
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

exports.notifyChatMessage = onDocumentCreated("chats/{chatId}/messages/{messageId}", async (event) => {
  const message = event.data && event.data.data();
  if (!message) return;
  const { chatId } = event.params;
  const senderUid = message.senderId;
  const participants = chatId.split("_");
  if (!senderUid || participants.length !== 2 || !participants.includes(senderUid)) return;
  const recipientUid = participants.find((uid) => uid !== senderUid);
  if (!recipientUid) return;

  const db = getFirestore();
  const devicesSnap = await db.collection("users").doc(recipientUid).collection("devices").get();
  if (devicesSnap.empty) return;

  const now = Date.now();
  const targets = [];
  const stale = [];
  devicesSnap.forEach((deviceDoc) => {
    const device = deviceDoc.data();
    const lastSeen = millis(device.lastSeenAt) ?? millis(device.createdAt) ?? now;
    if (!device.token || now - lastSeen > STALE_MS) {
      stale.push(deviceDoc.ref);
      return;
    }
    const viewingUntil = millis(device.viewingUntil);
    if (device.viewingChatId === chatId && viewingUntil && viewingUntil > now) return;
    targets.push({ ref: deviceDoc.ref, token: device.token });
  });

  const cleanup = () => Promise.all(stale.map((ref) => ref.delete().catch(() => {})));
  if (targets.length === 0) {
    await cleanup();
    return;
  }

  const [blockedBySender, blockedByRecipient, senderSnap, privateSnap] = await Promise.all([
    db.doc(`blocks/${senderUid}_${recipientUid}`).get(),
    db.doc(`blocks/${recipientUid}_${senderUid}`).get(),
    db.doc(`users/${senderUid}`).get(),
    db.doc(`users/${recipientUid}/private/data`).get(),
  ]);
  if (blockedBySender.exists || blockedByRecipient.exists) {
    await cleanup();
    return;
  }

  const prefs = privateSnap.exists ? privateSnap.data() : {};
  const texts = prefs.language === "en" ? TEXTS.en : TEXTS.es;
  const showText = prefs.pushShowText !== false;
  const senderName = senderSnap.exists ? senderSnap.data().displayName : "";
  const title = showText ? truncate(senderName, NAME_MAX) || texts.someone : "Pridethink";
  const body = showText ? describeMessage(message, texts) : texts.generic;

  // Punto 98: si la cuenta falla, el aviso sale igual, sin número.
  let unread = null;
  try {
    unread = await countUnreadMessages(db, recipientUid);
  } catch (err) {
    logger.warn("push: no se pudieron contar los no leídos", { code: err && err.code });
  }
  const data = { title, body, chatId, senderUid };
  if (unread !== null) data.unread = String(unread);

  const response = await getMessaging().sendEach(
    targets.map(({ token }) => ({
      token,
      data,
      webpush: { headers: { Urgency: "high", TTL: String(TTL_SECONDS) } },
    }))
  );

  response.responses.forEach((result, i) => {
    if (result.success) return;
    const code = result.error && result.error.code;
    if (DEAD_TOKEN_CODES.has(code)) stale.push(targets[i].ref);
    else logger.warn("push: envío fallido", { code });
  });
  await cleanup();
  logger.info("push: enviado", {
    sent: response.successCount,
    failed: response.failureCount,
    removed: stale.length,
  });
});

// ---------------------------------------------------------------------------
// Punto 101 — approvePostVideo
// ---------------------------------------------------------------------------
//
// El cliente (src/videoJob.js) sube postVideos/{uid}/{postId}/video.mp4 y
// poster.jpg y DESPUÉS crea el post con video.status = "pending" y solo las
// rutas (firestore.rules no le deja poner links ni otro estado). Aquí:
// 1. se comprueba que las rutas sean las de ese autor y ese post, y que los
//    archivos existan con el tipo y el peso esperados;
// 2. moderateVideo() decide (hoy siempre "approved");
// 3. aprobado: se escriben los links con token (getDownloadURL) y el estado;
//    rechazado: se borran los archivos y queda "rejected" con el motivo.
// Si el post se borró mientras tanto, no se hace nada.

const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // igual que storage.rules
const MAX_POSTER_BYTES = 1024 * 1024;

// Lugar preparado para un filtro automático. Por ejemplo, con Google Video
// Intelligence (explicit content detection) sobre gs://{bucket}/{ruta}: si
// detecta contenido explícito, devolver { decision: "rejected", reason }.
// Hoy aprueba todo lo que pasó las comprobaciones de abajo.
// (kind: "post" o "moment"; doc: los datos del documento; paths: las rutas
// de videoStorage.)
async function moderateVideo(/* { kind, doc, paths } */) {
  return { decision: "approved" };
}

// Revisa y aprueba (o rechaza) el video de un documento recién creado.
// Lo usan approvePostVideo y approveMomentVideo (punto 102): mismo flujo.
// - kind: "post" | "moment" (para los registros y moderateVideo)
// - paths: dónde tienen que estar los archivos (videoStorage)
// - extraOnApprove(urls): campos de más que se escriben al aprobar
async function reviewVideoDoc({ snap, kind, id, paths, extraOnApprove }) {
  const data = snap.data();
  const video = data && data.video;
  if (!video || video.status !== "pending") return;

  const reject = async (reason) => {
    logger.warn("video: rechazado", { kind, id, reason });
    await videoStorage
      .deleteVideoFiles(paths)
      .catch((err) => logger.warn("video: no se pudieron borrar los archivos", { kind, id, err: String(err) }));
    await snap.ref
      .update({
        "video.status": "rejected",
        "video.reason": reason,
        "video.moderatedAt": FieldValue.serverTimestamp(),
      })
      .catch(() => {}); // el documento pudo haberse borrado
  };

  if (video.path !== paths.video || video.posterPath !== paths.poster) {
    await reject("bad_path");
    return;
  }

  let info;
  try {
    info = await videoStorage.getVideoFilesInfo(paths);
  } catch (err) {
    await reject("missing_file");
    return;
  }
  if (
    info.video.contentType !== "video/mp4" ||
    info.video.size > MAX_VIDEO_BYTES ||
    info.poster.contentType !== "image/jpeg" ||
    info.poster.size > MAX_POSTER_BYTES
  ) {
    await reject("bad_file");
    return;
  }

  const { decision, reason } = await moderateVideo({ kind, doc: data, paths });
  if (decision !== "approved") {
    await reject(reason || "moderation");
    return;
  }

  const urls = await videoStorage.getVideoPlaybackUrls(paths);
  try {
    await snap.ref.update({
      "video.status": "approved",
      "video.url": urls.url,
      "video.posterUrl": urls.posterUrl,
      "video.moderatedAt": FieldValue.serverTimestamp(),
      ...(extraOnApprove ? extraOnApprove(urls) : {}),
    });
    logger.info("video: aprobado", { kind, id, bytes: info.video.size });
  } catch (err) {
    // Se borró mientras tanto: no hay nada que aprobar.
    logger.info("video: el documento ya no existe", { kind, id });
  }
}

exports.approvePostVideo = onDocumentCreated("posts/{postId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const postId = event.params.postId;
  await reviewVideoDoc({
    snap,
    kind: "post",
    id: postId,
    paths: videoStorage.videoPaths(snap.get("authorId"), postId),
  });
});

// Punto 102 — approveMomentVideo: lo mismo para un momento con video
// (moments/{momentId}, creado por src/videoJob.js en "pending"). Al
// aprobarlo escribe además imageURL = la miniatura, así la tira, las
// respuestas por chat y los reportes (que usan imageURL) funcionan igual
// que con una foto.
exports.approveMomentVideo = onDocumentCreated("moments/{momentId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const momentId = event.params.momentId;
  await reviewVideoDoc({
    snap,
    kind: "moment",
    id: momentId,
    paths: videoStorage.momentVideoPaths(snap.get("authorId"), momentId),
    extraOnApprove: (urls) => ({ imageURL: urls.posterUrl }),
  });
});

// ---------------------------------------------------------------------------
// Punto 101, parte 6 — limpieza de Storage de los posts
// ---------------------------------------------------------------------------

// Carpeta de Storage de las FOTOS de un post: postImages/{autor}/{postId}/.
// La del video la maneja videoStorage.js. productImages/ y chatImages/ no
// se tocan.
const POST_IMAGES_ROOT = "postImages/";

// Carpetas de fotos de posts, con la misma forma que
// videoStorage.listPostVideoFolders(): [{ key, authorId, postId, newest,
// count, bytes, remove() }].
async function listPostImageFolders() {
  const [files] = await getStorage().bucket().getFiles({ prefix: POST_IMAGES_ROOT });
  const now = Date.now();
  const folders = new Map();
  for (const file of files) {
    const parts = file.name.split("/"); // [raíz, autor, postId, nombre]
    if (parts.length < 4 || !parts[1] || !parts[2]) continue;
    const key = `${parts[0]}/${parts[1]}/${parts[2]}/`;
    const updated = Date.parse(file.metadata.updated || file.metadata.timeCreated) || now;
    let folder = folders.get(key);
    if (!folder) {
      const list = [];
      folder = {
        key,
        authorId: parts[1],
        postId: parts[2],
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

// Al borrar un post (desde la app, la consola o cualquier otro lado), se
// borran su video, su miniatura y sus fotos. Sin esto quedaban en Storage
// para siempre (y un video pesa ~15-24 MB).
exports.cleanupDeletedPostFiles = onDocumentDeleted("posts/{postId}", async (event) => {
  const post = event.data && event.data.data();
  const authorId = post && post.authorId;
  if (!authorId) return;
  const postId = event.params.postId;
  await Promise.all([
    videoStorage
      .deletePostVideoFolder(authorId, postId)
      .catch((err) => logger.warn("limpieza: no se pudo borrar", { what: "video", postId, err: String(err) })),
    getStorage()
      .bucket()
      .deleteFiles({ prefix: `${POST_IMAGES_ROOT}${authorId}/${postId}/`, force: true })
      .catch((err) => logger.warn("limpieza: no se pudo borrar", { what: "fotos", postId, err: String(err) })),
  ]);
  logger.info("limpieza: archivos del post borrados", { postId, video: !!post.video });
});

// Una vez al día: carpetas sin post. ORPHAN_CLEANUP_DRY_RUN = true solo
// registra ("limpieza (prueba): se borraría") sin borrar nada. Después de
// revisar en Functions → Registros que solo aparezcan carpetas que de verdad
// sobran, se cambia a false y se vuelve a subir la función.
const ORPHAN_CLEANUP_DRY_RUN = true;
const ORPHAN_MIN_AGE_MS = 2 * 24 * 60 * 60 * 1000; // 2 días sin cambios
const ORPHAN_MAX_FOLDERS = 200; // tope por pasada

exports.cleanupOrphanPostFiles = onSchedule(
  { schedule: "every 24 hours" },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    // Videos (videoStorage.js) y fotos, con la misma forma:
    // { key, authorId, postId, newest (ms), count, bytes, remove() }.
    const folders = [...(await videoStorage.listPostVideoFolders()), ...(await listPostImageFolders())];

    let checked = 0;
    let orphans = 0;
    let bytes = 0;
    for (const folder of folders) {
      if (checked >= ORPHAN_MAX_FOLDERS) break;
      if (now - folder.newest < ORPHAN_MIN_AGE_MS) continue; // puede ser un borrador en curso
      checked += 1;
      const postSnap = await db.doc(`posts/${folder.postId}`).get();
      // Si el post existe y es de ese autor, la carpeta es suya: no se toca.
      if (postSnap.exists && postSnap.get("authorId") === folder.authorId) continue;
      orphans += 1;
      bytes += folder.bytes;
      if (ORPHAN_CLEANUP_DRY_RUN) {
        logger.info("limpieza (prueba): se borraría", { folder: folder.key, files: folder.count, bytes: folder.bytes });
      } else {
        await folder.remove().catch((err) =>
          logger.warn("limpieza: no se pudo borrar", { folder: folder.key, err: String(err) })
        );
        logger.info("limpieza: carpeta sin post borrada", {
          folder: folder.key,
          files: folder.count,
          bytes: folder.bytes,
        });
      }
    }
    logger.info("limpieza: resumen", {
      dryRun: ORPHAN_CLEANUP_DRY_RUN,
      folders: folders.length,
      checked,
      orphans,
      megabytes: Math.round((bytes / 1048576) * 10) / 10,
    });
  }
);
