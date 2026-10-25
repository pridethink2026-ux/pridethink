import { Timestamp, collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";

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
  await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });

  try {
    const imageURL = await getDownloadURL(fileRef);
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
    await batch.commit();
  } catch (err) {
    // La foto ya subió pero el momento no se creó: se borra para no dejar
    // un archivo suelto (si esto también falla, la regla de ciclo de vida
    // del bucket la borra igual en 2 días).
    deleteObject(fileRef).catch(() => {});
    throw err;
  }
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
