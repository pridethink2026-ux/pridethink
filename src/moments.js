import { Timestamp, addDoc, collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "./firebase";
import { getChatId } from "./Chat";

/*
  moments.js
  ----------
  Lógica pura de los Momentos (punto 66), mismo criterio que Blocks.js:
  sin interfaz, solo leer/escribir Firestore y Storage.

  Datos (ver firestore.rules y storage.rules para las reglas):
  - moments/{momentId} → { authorId, imageURL, storagePath, caption,
    createdAt, expireAt }. "caption" es el texto escrito sobre la foto en
    texto plano (accesibilidad y reportes), lo arma MomentTextEditor.jsx;
    vacío si no se escribió nada.
  - momentIndex/{authorUid} → { ids, times: { [id]: { createdAt,
    expireAt } } en milisegundos, expireAt }. Es lo que escucha
    MomentsContext.jsx para saber quién tiene momentos activos sin hacer
    consultas.
  - moments/{momentId}/momentViewers/{viewerUid} → { viewedAt, expireAt,
    liked?, likedAt?, firstLikedAt? }: quién vio cada momento (commit 5) y
    quién le dio la estrella (commit 6). Lo lee el autor, y cada persona
    su propio documento.
  - Storage: momentImages/{uid}/{momentId}.jpg.

  "expireAt" lo calcula el cliente (Date.now() + 24 h): firestore.rules
  exige que caiga dentro de las próximas 24 h según la hora del servidor
  (con 5 minutos de margen), así que un reloj muy adelantado hace fallar
  la publicación en vez de alargar el momento.
*/

export const MOMENT_TTL_MS = 24 * 60 * 60 * 1000;
export const MOMENT_DURATION_MS = 17 * 1000;
export const MAX_ACTIVE_MOMENTS = 30;
const MAX_CAPTION_LENGTH = 600; // mismo tope que firestore.rules
export const MAX_REPLY_LENGTH = 1000; // mismo tope que firestore.rules (respuestaAMomentoValida)

// Entradas del índice que siguen activas a la hora `now`, de la más vieja
// a la más nueva: [{ id, createdAt, expireAt }].
export function getActiveEntries(index, now) {
  if (!index) return [];
  const times = index.times || {};
  return (index.ids || [])
    .map((id) => ({ id, ...(times[id] || {}) }))
    .filter((e) => typeof e.expireAt === "number" && e.expireAt > now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export class MomentLimitError extends Error {}

// Tiempos límite al publicar (punto 68). Sin ellos, con datos móviles
// inestables "Publicando…" podía quedar trabado: Storage reintenta una
// subida hasta 10 minutos, y un commit de Firestore sin red no falla,
// espera a que vuelva la conexión.
const UPLOAD_STALL_MS = 30 * 1000; // la subida no avanza en este tiempo
const STEP_TIMEOUT_MS = 30 * 1000; // pedir la URL o guardar el momento

// `stage` es "upload" (la foto no se subió: se puede reintentar ya) o
// "save" (la foto subió pero el guardado no confirmó a tiempo: puede
// terminar solo cuando vuelva la conexión, así que la foto NO se borra).
export class MomentTimeoutError extends Error {
  constructor(stage) {
    super(`moment ${stage} timeout`);
    this.stage = stage;
  }
}

// Sube la foto y cancela si pasa UPLOAD_STALL_MS sin avanzar (no un
// tiempo total: en una red lenta pero viva la subida sigue).
function uploadWithStallTimeout(fileRef, blob) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, blob, { contentType: "image/jpeg" });
    let timer;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        task.cancel();
        reject(new MomentTimeoutError("upload"));
      }, UPLOAD_STALL_MS);
    };
    arm();
    task.on(
      "state_changed",
      arm,
      (err) => {
        clearTimeout(timer);
        reject(err); // si ya se rechazó por tiempo, esto no cambia nada
      },
      () => {
        clearTimeout(timer);
        resolve();
      }
    );
  });
}

// Espera `promise` como máximo `ms`; si no llega, rechaza con
// MomentTimeoutError(stage). La operación original sigue su curso.
function withTimeout(promise, ms, stage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new MomentTimeoutError(stage)), ms);
  });
  promise.catch(() => {}); // si falla después del tiempo límite, ya se avisó
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Me registra como "vio este momento" (commit 5) en
// moments/{momentId}/momentViewers/{miUid}, que solo lee el autor.
// firestore.rules solo acepta la primera vez (repetirlo sería un update,
// que no está permitido) y solo si hoy puedo ver el momento, así que un
// rechazo es normal y se ignora. `expireAt` es el del momento (Timestamp),
// para que la TTL de "momentViewers" lo borre junto con él.
export function registerView(uid, momentId, expireAt) {
  return setDoc(doc(db, "moments", momentId, "momentViewers", uid), {
    viewedAt: serverTimestamp(),
    expireAt,
  }).catch(() => {});
}

// Pone o quita mi estrella en un momento ajeno (commit 6), en el mismo
// documento de momentViewers. `myView` es ese documento tal como lo tiene
// el visor (null si todavía no existe). Devuelve true si fue mi PRIMERA
// estrella en ese momento (firstLikedAt), la única que notifica al autor.
export async function setMomentLike(uid, moment, liked, myView) {
  const viewRef = doc(db, "moments", moment.id, "momentViewers", uid);
  if (!myView) {
    if (!liked) return false;
    try {
      await setDoc(viewRef, {
        viewedAt: serverTimestamp(),
        expireAt: moment.expireAt,
        liked: true,
        likedAt: serverTimestamp(),
        firstLikedAt: serverTimestamp(),
      });
      return true;
    } catch {
      // registerView pudo llegar antes que esto: el documento ya existe
      // (sin estrella), así que se sigue como una actualización.
    }
  }
  const first = liked && !myView?.firstLikedAt;
  const data = liked ? { liked: true, likedAt: serverTimestamp() } : { liked: false };
  if (first) data.firstLikedAt = serverTimestamp();
  await updateDoc(viewRef, data);
  return first;
}

// Sube la foto (Blob JPEG que devuelve MomentTextEditor, con el texto ya
// quemado) y publica el momento con su texto en plano (`caption`).
// `myIndex` es mi propio momentIndex tal como lo tiene MomentsContext:
// se reescribe entero, sin las entradas vencidas.
export async function publishMoment(uid, blob, myIndex, caption = "") {
  const now = Date.now();
  const active = getActiveEntries(myIndex, now);
  if (active.length >= MAX_ACTIVE_MOMENTS) throw new MomentLimitError();

  const momentRef = doc(collection(db, "moments"));
  const storagePath = `momentImages/${uid}/${momentRef.id}.jpg`;
  const fileRef = ref(storage, storagePath);
  await uploadWithStallTimeout(fileRef, blob);

  try {
    const imageURL = await withTimeout(getDownloadURL(fileRef), STEP_TIMEOUT_MS, "upload");
    const expireAt = now + MOMENT_TTL_MS;
    const entries = [...active, { id: momentRef.id, createdAt: now, expireAt }];
    const times = {};
    entries.forEach((e) => {
      times[e.id] = { createdAt: e.createdAt, expireAt: e.expireAt };
    });

    // Mismo batch a propósito: firestore.rules solo deja crear el momento
    // si el índice, al terminar el batch, ya incluye su id.
    const batch = writeBatch(db);
    batch.set(momentRef, {
      authorId: uid,
      imageURL,
      storagePath,
      caption: caption.slice(0, MAX_CAPTION_LENGTH),
      createdAt: serverTimestamp(),
      expireAt: Timestamp.fromMillis(expireAt),
    });
    batch.set(doc(db, "momentIndex", uid), {
      ids: entries.map((e) => e.id),
      times,
      expireAt: Timestamp.fromMillis(expireAt),
    });
    await withTimeout(batch.commit(), STEP_TIMEOUT_MS, "save");
  } catch (err) {
    // La foto ya subió pero el momento no se creó: se borra para no dejar
    // un archivo suelto (si esto también falla, la regla de ciclo de vida
    // del bucket la borra igual en 2 días). Salvo si el guardado solo
    // tardó: Firestore lo sigue intentando y puede terminar después, y
    // entonces el momento necesita su foto.
    if (!(err instanceof MomentTimeoutError && err.stage === "save")) {
      deleteObject(fileRef).catch(() => {});
    }
    throw err;
  }
}

// Responde un momento ajeno por chat (commit 7): mensaje tipo
// "moment_reply" en la conversación con el autor (mismo chatId y mismo
// esqueleto que SharePostModal.jsx). Guarda una copia de la miniatura y
// del vencimiento: Chat.jsx deja de mostrar la foto cuando el momento
// vence, sin volver a leerlo. firestore.rules (respuestaAMomentoValida)
// comprueba que la copia coincida y que el momento se pueda ver hoy.
export async function sendMomentReply(uid, moment, text) {
  const chatId = getChatId(uid, moment.authorId);
  await setDoc(doc(db, "chats", chatId), { participants: [uid, moment.authorId] }, { merge: true });
  await addDoc(collection(db, "chats", chatId, "messages"), {
    senderId: uid,
    type: "moment_reply",
    text: text.slice(0, MAX_REPLY_LENGTH),
    momentId: moment.id,
    momentImageURL: moment.imageURL,
    momentExpireAt: moment.expireAt,
    createdAt: serverTimestamp(),
  });
}

// Borra uno de mis momentos antes de las 24 h (commit 4): el documento y
// su entrada del índice en el mismo batch (el índice se borra entero si
// era el último), y después la foto. Si borrar la foto falla, la regla de
// ciclo de vida del bucket la borra igual en 2 días.
export async function deleteMoment(uid, moment, myIndex) {
  const remaining = getActiveEntries(myIndex, Date.now()).filter((e) => e.id !== moment.id);
  const batch = writeBatch(db);
  batch.delete(doc(db, "moments", moment.id));
  const indexRef = doc(db, "momentIndex", uid);
  if (remaining.length === 0) {
    batch.delete(indexRef);
  } else {
    const times = {};
    remaining.forEach((e) => {
      times[e.id] = { createdAt: e.createdAt, expireAt: e.expireAt };
    });
    batch.set(indexRef, {
      ids: remaining.map((e) => e.id),
      times,
      // El índice vive lo que viva su momento más nuevo que queda.
      expireAt: Timestamp.fromMillis(Math.max(...remaining.map((e) => e.expireAt))),
    });
  }
  await batch.commit();
  deleteObject(ref(storage, moment.storagePath)).catch(() => {});
}
