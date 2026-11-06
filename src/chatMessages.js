import { useEffect, useRef } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
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

const SUMMARY_TYPES = ["text", "audio", "image", "sticker", "gift", "shared_post", "moment_reply"];

// Commit 2 (punto 84): completa el resumen de TUS conversaciones de antes
// del commit 1, para que aparezcan en la lista de recientes (commit 3),
// que ordena por lastMessageAt (una conversación sin ese campo no sale en
// la consulta).
//   - Sin lastMessageAt: se lee su último mensaje y se copia al resumen
//     (hora, remitente, tipo y texto corto). Sin mensajes, se deja igual.
//   - Sin writers[yo]: se busca si alguna vez escribiste ahí (1 mensaje
//     tuyo alcanza) y se marca. Solo tu propia entrada: las reglas no dejan
//     marcar la de la otra persona, que se marca cuando ella inicia sesión
//     (o cuando vuelve a escribir).
// Solo lee los chats que todavía lo necesitan: una vez migrados, cada
// sesión cuesta una consulta y nada más (salvo los chats donde nunca
// escribiste, que se vuelven a revisar con 1 lectura cada uno).
export async function repairMyChats(myUid) {
  const snap = await getDocs(query(collection(db, "chats"), where("participants", "array-contains", myUid)));
  for (const chatDoc of snap.docs) {
    const data = chatDoc.data();
    const update = {};
    const messagesRef = collection(chatDoc.ref, "messages");

    if (!data.lastMessageAt) {
      const last = await getDocs(query(messagesRef, orderBy("createdAt", "desc"), limit(1)));
      const msg = last.docs[0]?.data();
      const type = msg ? msg.type || "text" : null;
      if (msg && msg.createdAt && SUMMARY_TYPES.includes(type) && data.participants?.includes(msg.senderId)) {
        const hasText = type === "text" || type === "moment_reply";
        update.lastMessageAt = msg.createdAt;
        update.lastSenderId = msg.senderId;
        update.lastType = type;
        update.lastText = hasText ? (msg.text || "").slice(0, LAST_TEXT_MAX) : "";
        if (msg.senderId === myUid) update.writers = { [myUid]: true };
      }
    }

    if (!data.writers?.[myUid] && !update.writers) {
      const mine = await getDocs(query(messagesRef, where("senderId", "==", myUid), limit(1)));
      if (!mine.empty) update.writers = { [myUid]: true };
    }

    if (Object.keys(update).length > 0) {
      await setDoc(chatDoc.ref, update, { merge: true });
    }
  }
}

// Una vez por sesión, al iniciar (App.js, mismo patrón que
// useFollowsMigration). Si falla, se reintenta en el próximo inicio.
export function useChatsMigration(myUid) {
  const doneFor = useRef(null);
  useEffect(() => {
    if (!myUid || doneFor.current === myUid) return;
    doneFor.current = myUid;
    repairMyChats(myUid).catch((err) => console.error("chats: no se pudo completar el resumen", err.code));
  }, [myUid]);
}
