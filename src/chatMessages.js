import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { getChatId } from "./utils";

/*
  chatMessages.js
  ---------------
  Punto 84 (Chat, commit 1): todo mensaje de chat se envía por acá, junto
  con el resumen de la conversación en chats/{chatId}, en un mismo batch
  (nunca quedan desincronizados). Lo usan Chat.jsx (texto, sticker, audio,
  imagen), GiftFriendModal.jsx (regalo), SharePostModal.jsx (post
  compartido) y moments.js (respuesta a un momento).

  chats/{chatId} →
    participants: [uidA, uidB]     el par del id (firestore.rules lo valida)
    lastMessageAt: Timestamp       hora del último mensaje (del servidor)
    lastSenderId: uid              quién lo envió
    lastType: "text" | "audio" | "image" | "sticker" | "gift"
              | "shared_post" | "moment_reply"
    lastText: string               hasta LAST_TEXT_MAX; solo texto y
                                   respuesta a un momento, vacío en el resto
    writers: { [uid]: true }       quién escribió alguna vez en el chat
    lastReadAt: { [uid]: Timestamp }  (commit 3, no leídos)

  La lista de conversaciones recientes (commit 3) lee solo estos
  documentos, sin abrir los mensajes. Las reglas no pueden comprobar que
  el resumen coincida con el mensaje: cada persona solo afecta su propia
  conversación.
*/

export const LAST_TEXT_MAX = 120;

// Id de un mensaje antes de crearlo (la imagen lo necesita para su ruta
// en Storage, ver Chat.jsx).
export function newMessageId(chatId) {
  return doc(collection(db, "chats", chatId, "messages")).id;
}

// "message": los campos propios del tipo ({ text } o { type: "audio", ... }),
// sin senderId ni createdAt, que se agregan acá. Devuelve el id del mensaje.
export async function sendChatMessage(myUid, otherUid, message, messageId) {
  const chatId = getChatId(myUid, otherUid);
  const messageRef = messageId
    ? doc(db, "chats", chatId, "messages", messageId)
    : doc(collection(db, "chats", chatId, "messages"));
  const type = message.type || "text";
  const hasText = type === "text" || type === "moment_reply";

  const batch = writeBatch(db);
  batch.set(messageRef, { ...message, senderId: myUid, createdAt: serverTimestamp() });
  batch.set(
    doc(db, "chats", chatId),
    {
      participants: [myUid, otherUid],
      lastMessageAt: serverTimestamp(),
      lastSenderId: myUid,
      lastType: type,
      lastText: hasText ? (message.text || "").slice(0, LAST_TEXT_MAX) : "",
      writers: { [myUid]: true },
    },
    { merge: true }
  );
  await batch.commit();
  return messageRef.id;
}
