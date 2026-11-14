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

  Subir: npx firebase deploy --only functions (o npm run deploy:functions
  desde la raíz del proyecto).
*/

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
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
