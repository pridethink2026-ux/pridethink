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

  const response = await getMessaging().sendEach(
    targets.map(({ token }) => ({
      token,
      data: { title, body, chatId, senderUid },
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
