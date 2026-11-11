import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { getChatId } from "./utils";
import { useAllUsersContext } from "./AllUsersContext";
import { useMyBlocks, isBlockedEitherWay } from "./Blocks";
import { useMyFollows } from "./FollowsContext";

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
    lastReadAt: { [uid]: Timestamp }  hasta cuándo leyó cada uno (commit 3:
                                   punto de no leído, ver isChatUnread)
    hiddenAt: { [uid]: Timestamp } cuándo la eliminó cada uno de su lista
                                   (punto 90, ver deleteChatForMe)

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

    // Punto 90: termina una limpieza que quedó a medias (se cerró la
    // pestaña o se cortó la conexión). Cuesta 1 lectura por cada chat que
    // eliminaron los dos.
    if (purgeCutoff(data)) {
      await purgeUnseenMessages(chatDoc.id, data).catch((err) =>
        console.error("chats: no se pudo completar la limpieza", err.code)
      );
    }
  }
}

// ---------------------------------------------------------------------
// Commit 3 (punto 84): lista de conversaciones recientes y no leídos.
// ---------------------------------------------------------------------

// Cuántas conversaciones trae la lista de una vez ("Cargar más" suma
// otra tanda).
export const RECENT_CHATS_PAGE = 30;

// Hora de un campo Timestamp en milisegundos (0 si falta).
const millis = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);

// ¿Sale en mi lista? Tiene que tener al menos un mensaje (las abiertas sin
// escribir nunca llegan a tener lastMessageAt) y, si la eliminé, un mensaje
// posterior a ese momento.
function isChatInMyList(chat, myUid) {
  const last = millis(chat.lastMessageAt);
  return last > 0 && last > millis(chat.hiddenAt?.[myUid]);
}

// Tus conversaciones con mensajes, la más reciente primero, en vivo. Punto
// 90: la consulta es solo participants array-contains vos y el orden se
// hace acá, porque con orderBy dependía de un índice compuesto creado a
// mano en la consola (si faltaba, la lista entera daba error) y porque las
// conversaciones eliminadas no podrían ocupar lugar en un limit() del
// servidor. Costo: 1 lectura por cada conversación tuya al abrir el Chat.
//   → { chats: [{ id, participants, lastMessageAt, ... }], loading, hasMore, error }
export function useRecentChats(myUid, max) {
  const [state, setState] = useState({ uid: null, chats: [], error: null });

  useEffect(() => {
    if (!myUid) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", myUid));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          uid: myUid,
          // "estimate": un mensaje recién enviado (hora del servidor todavía
          // pendiente) ya sale con la hora local en vez de null.
          chats: snap.docs
            .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))
            .filter((chat) => isChatInMyList(chat, myUid))
            .sort((a, b) => millis(b.lastMessageAt) - millis(a.lastMessageAt)),
          error: null,
        }),
      (err) => {
        console.error("chats: no se pudo cargar la lista de conversaciones", err.code);
        setState({ uid: myUid, chats: [], error: err.code || "error" });
      }
    );
  }, [myUid]);

  const ready = state.uid === myUid;
  const allChats = ready ? state.chats : [];
  return {
    chats: allChats.slice(0, max),
    loading: !ready,
    hasMore: allChats.length > max,
    error: ready ? state.error : null,
  };
}

// ---------------------------------------------------------------------
// Punto 90: eliminar una conversación de tu lista.
// ---------------------------------------------------------------------

// De a cuántos mensajes se borra: cada borrado hace una lectura en las
// reglas, y un batch admite hasta 20.
const PURGE_BATCH = 15;

// Quita la conversación solo de tu lista: guarda la hora en hiddenAt[vos].
// La otra persona no nota nada. Si vuelven a escribirte reaparece, y vos
// solo ves lo posterior a esta hora. Si la otra persona también la había
// eliminado, se limpia lo que ya nadie puede ver (en segundo plano: si
// falla, se reintenta al iniciar sesión, ver repairMyChats).
export async function deleteChatForMe(myUid, chatId) {
  const chatRef = doc(db, "chats", chatId);
  await updateDoc(chatRef, { [`hiddenAt.${myUid}`]: serverTimestamp() });
  getDoc(chatRef)
    .then((snap) => (snap.exists() && purgeCutoff(snap.data()) ? purgeUnseenMessages(chatId, snap.data()) : null))
    .catch((err) => console.error("chats: no se pudo completar la limpieza", err.code));
}

// Hasta qué hora nadie puede ver los mensajes: la más vieja de las dos
// eliminaciones. null si alguno de los dos todavía no la eliminó.
function purgeCutoff(chat) {
  const [a, b] = chat.participants || [];
  const hiddenA = chat.hiddenAt?.[a];
  const hiddenB = chat.hiddenAt?.[b];
  if (!hiddenA || !hiddenB) return null;
  return millis(hiddenA) <= millis(hiddenB) ? hiddenA : hiddenB;
}

// Borra para siempre los mensajes que ya nadie puede ver (hasta
// purgeCutoff), con sus fotos. Un mensaje enviado después de que uno de
// los dos eliminó la conversación sigue visible para esa persona y no se
// toca. Las reglas exigen lo mismo (ocultoParaLosDos). Si no quedó ningún
// mensaje posterior, también vacía la vista previa guardada en el resumen.
async function purgeUnseenMessages(chatId, chat) {
  const cutoff = purgeCutoff(chat);
  if (!cutoff) return;
  const chatRef = doc(db, "chats", chatId);
  const pageQuery = query(
    collection(chatRef, "messages"),
    where("createdAt", "<=", cutoff),
    limit(PURGE_BATCH)
  );

  for (let page = await getDocs(pageQuery); !page.empty; page = await getDocs(pageQuery)) {
    await deleteMessagePhotos(chatId, page.docs);
    const batch = writeBatch(db);
    page.docs.forEach((message) => batch.delete(message.ref));
    await batch.commit();
  }

  if (chat.lastText && millis(chat.lastMessageAt) <= millis(cutoff)) {
    await updateDoc(chatRef, { lastText: "" });
  }
}

// Las fotos se borran antes que el mensaje: su ruta sale del id del
// mensaje, y si esto falla el mensaje sigue ahí para reintentar. Storage se
// importa acá adentro para no sumarlo a la pantalla de entrada (punto 68).
async function deleteMessagePhotos(chatId, messages) {
  const photos = messages.filter((message) => message.data().type === "image");
  if (photos.length === 0) return;
  const [{ deleteObject, ref }, { storage }] = await Promise.all([
    import("firebase/storage"),
    import("./firebaseStorage"),
  ]);
  await Promise.all(
    photos.map((message) =>
      deleteObject(ref(storage, `chatImages/${chatId}/${message.id}/img.jpg`)).catch((err) => {
        if (err.code !== "storage/object-not-found") throw err;
      })
    )
  );
}

// El resumen de UNA conversación, en vivo: null si todavía no existe (o no
// se pudo leer), undefined mientras carga. Lo usa la conversación abierta
// para marcarla leída aunque no esté entre las que trajo la lista, y para
// saber si el otro ya te escribió (writers, commit 4).
export function useChatSummary(chatId) {
  const [state, setState] = useState({ chatId: null, data: null });
  useEffect(() => {
    if (!chatId) return;
    return onSnapshot(
      doc(db, "chats", chatId),
      (snap) => setState({ chatId, data: snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null }),
      (err) => {
        console.error("chats: no se pudo leer el resumen", err.code);
        setState({ chatId, data: null });
      }
    );
  }, [chatId]);
  if (!chatId) return null;
  return state.chatId === chatId ? state.data : undefined;
}

// No leída = el último mensaje es de la otra persona y llegó después de la
// última vez que la abriste (o nunca la abriste).
export function isChatUnread(chat, myUid) {
  if (!chat || !chat.lastSenderId || chat.lastSenderId === myUid) return false;
  const last = millis(chat.lastMessageAt);
  return last > 0 && last > millis(chat.lastReadAt?.[myUid]);
}

// Marca la conversación leída hasta ahora (hora del servidor; las reglas
// solo dejan tocar tu propia entrada). Solo sobre un chat que ya existe:
// updateDoc falla si no, en vez de crearlo.
export function markChatRead(myUid, chatId) {
  return updateDoc(doc(db, "chats", chatId), { [`lastReadAt.${myUid}`]: serverTimestamp() });
}

// ¿Se puede chatear con esta persona? Decide quién sale en la lista del
// Chat y, por lo tanto, qué conversaciones cuentan para el globito (si una
// oculta contara, el número no se podría borrar nunca).
export function canChatWithUser(user, myUid, writers, { blockedByMe, blockedMe, following, followers }) {
  if (!user || user.uid === myUid) return false;
  if (isBlockedEitherWay(blockedByMe, blockedMe, user.uid)) return false;
  if (!user.isPrivate) return true;
  if (writers?.[user.uid] === true) return true;
  return following.includes(user.uid) && followers.includes(user.uid);
}

// ---------------------------------------------------------------------
// Punto 92: globito de mensajes sin leer y destello del botón Chat.
// ---------------------------------------------------------------------

// Hasta cuántos mensajes se cuentan por conversación: alcanza para "99+" y
// acota las lecturas de una conversación con muchos mensajes sin abrir.
const UNREAD_MESSAGES_MAX = 100;

// Desde cuándo cuenta un mensaje como no leído: lo posterior a tu última
// lectura y a la última vez que eliminaste la conversación.
function unreadCutoff(chat, myUid) {
  const read = chat.lastReadAt?.[myUid];
  const hidden = chat.hiddenAt?.[myUid];
  return (millis(hidden) > millis(read) ? hidden : read) || null;
}

// { [chatId]: mensajes sin leer }, en vivo. Un listener por conversación no
// leída, que se abre al quedar sin leer y se cierra al leerla. La consulta
// no filtra por remitente porque eso exigiría un índice compuesto (ver el
// punto 90): tus propios mensajes se descartan acá.
function useUnreadMessageCounts(myUid, unreadChats) {
  const [counts, setCounts] = useState({});
  const listenersRef = useRef(new Map());
  const signature = unreadChats
    .map((chat) => chat.id + ":" + millis(unreadCutoff(chat, myUid)))
    .sort()
    .join(",");

  useEffect(() => {
    const listeners = listenersRef.current;
    const wanted = new Map(unreadChats.map((chat) => [chat.id, chat]));

    listeners.forEach((listener, chatId) => {
      const chat = wanted.get(chatId);
      if (chat && listener.cutoff === millis(unreadCutoff(chat, myUid))) return;
      listener.stop();
      listeners.delete(chatId);
      setCounts(({ [chatId]: _closed, ...rest }) => rest);
    });

    wanted.forEach((chat, chatId) => {
      if (listeners.has(chatId)) return;
      const cutoff = unreadCutoff(chat, myUid);
      const q = query(
        collection(db, "chats", chatId, "messages"),
        ...(cutoff ? [where("createdAt", ">", cutoff)] : []),
        orderBy("createdAt", "desc"),
        limit(UNREAD_MESSAGES_MAX)
      );
      const stop = onSnapshot(
        q,
        (snap) => {
          const n = snap.docs.filter((message) => message.data().senderId !== myUid).length;
          setCounts((current) => ({ ...current, [chatId]: n }));
        },
        (err) => console.error("chats: no se pudieron contar los no leídos", err.code)
      );
      listeners.set(chatId, { cutoff: millis(cutoff), stop });
    });
    // "signature" resume unreadChats: cada mensaje nuevo cambia el arreglo,
    // pero el listener de esa conversación ya lo recibe solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, myUid]);

  useEffect(() => {
    const listeners = listenersRef.current;
    return () => {
      listeners.forEach((listener) => listener.stop());
      listeners.clear();
      setCounts({});
    };
  }, [myUid]);

  return counts;
}

// El navegador recuerda hasta qué mensaje ya viste el aviso, para que
// recargar la página no vuelva a encender el destello. Si localStorage
// falla (modo privado), se recuerda solo durante la sesión.
const chatAlertKey = (uid) => "pt-chat-alert-seen-" + uid;

function readChatAlertSeen(uid) {
  try {
    return Number(localStorage.getItem(chatAlertKey(uid))) || 0;
  } catch {
    return 0;
  }
}

function saveChatAlertSeen(uid, at) {
  try {
    localStorage.setItem(chatAlertKey(uid), String(at));
  } catch {
    // Sin localStorage: queda en memoria (useChatUnread).
  }
}

// Para el botón Chat (App.js). unreadCount: mensajes sin leer de las
// conversaciones que se ven en la lista. showEnergy: hay un mensaje sin
// leer que llegó después de la última vez que estuviste en la sección Chat.
export function useChatUnread(myUid, inChatSection) {
  const { chats } = useRecentChats(myUid, Infinity);
  const allUsers = useAllUsersContext();
  const { blockedByMe, blockedMe } = useMyBlocks();
  const { following, followers } = useMyFollows();
  const usersByUid = useMemo(() => {
    const map = {};
    allUsers.forEach((u) => (map[u.uid] = u));
    return map;
  }, [allUsers]);

  const unreadChats = chats.filter((chat) => {
    if (!isChatUnread(chat, myUid)) return false;
    const otherUid = (chat.participants || []).find((uid) => uid !== myUid);
    return canChatWithUser(usersByUid[otherUid], myUid, chat.writers, { blockedByMe, blockedMe, following, followers });
  });

  // Mientras llega el conteo, una conversación no leída vale 1.
  const counts = useUnreadMessageCounts(myUid, unreadChats);
  const unreadCount = unreadChats.reduce((sum, chat) => sum + (counts[chat.id] || 1), 0);

  const latestUnread = unreadChats.reduce((latest, chat) => Math.max(latest, millis(chat.lastMessageAt)), 0);
  const storedSeen = useMemo(() => (myUid ? readChatAlertSeen(myUid) : 0), [myUid]);
  const [marked, setMarked] = useState({ uid: null, at: 0 });
  const seenUpTo = Math.max(storedSeen, marked.uid === myUid ? marked.at : 0);

  useEffect(() => {
    if (!myUid || !inChatSection || latestUnread <= seenUpTo) return;
    setMarked({ uid: myUid, at: latestUnread });
    saveChatAlertSeen(myUid, latestUnread);
  }, [myUid, inChatSection, latestUnread, seenUpTo]);

  return { unreadCount, showEnergy: !inChatSection && latestUnread > seenUpTo };
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
