import { useEffect, useState, useSyncExternalStore } from "react";
import { collection, getCountFromServer } from "firebase/firestore";
import { db } from "./firebase";

/*
  commentCounts.js
  ----------------
  Punto 70, commit 9b: número de comentarios de cada post sin un listener
  por post. Antes, cada PostCard (Feed.jsx) escuchaba SIEMPRE todos sus
  comentarios, aunque estuvieran cerrados, solo para mostrar el número —
  un listener por post y una lectura por comentario (o una, si no tenía
  ninguno) — y Explorar volvía a pedir hasta 60 conteos cada vez que
  cambiaba el orden.

  Ahora el número sale de getCountFromServer (1 lectura por post, sin
  listener), guardado en una caché de módulo compartida por toda la app:
  cada post se pide una sola vez, salvo que el dato tenga más de
  MAX_AGE_MS al volver a mostrarlo. Mientras los comentarios de un post
  están abiertos, PostCard los escucha en vivo y actualiza la caché con
  setCommentCount, así el número queda exacto al cerrarlos. Con los
  comentarios cerrados, uno nuevo de otra persona no cambia el número
  hasta que se vuelva a pedir.
*/

const MAX_AGE_MS = 5 * 60 * 1000;

const counts = new Map(); // postId -> { count, at }
const inflight = new Map(); // postId -> Promise<number | null>
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCommentCount(postId, count) {
  const prev = counts.get(postId);
  counts.set(postId, { count, at: Date.now() });
  if (prev?.count !== count) listeners.forEach((l) => l());
}

// Promesa con el número (o null si no se pudo pedir, p.ej. sin red: se
// vuelve a intentar la próxima vez que se pida).
function ensureCommentCount(postId) {
  const cached = counts.get(postId);
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return Promise.resolve(cached.count);
  if (inflight.has(postId)) return inflight.get(postId);
  const promise = getCountFromServer(collection(db, "posts", postId, "comments"))
    .then((snap) => {
      const count = snap.data().count;
      setCommentCount(postId, count);
      return count;
    })
    .catch((err) => {
      console.error("commentCounts: no se pudo contar los comentarios", err.code);
      return cached ? cached.count : null;
    })
    .finally(() => inflight.delete(postId));
  inflight.set(postId, promise);
  return promise;
}

// Número de comentarios de un post, o null mientras no se sabe.
export function useCommentCount(postId) {
  useEffect(() => {
    ensureCommentCount(postId);
  }, [postId]);
  return useSyncExternalStore(subscribe, () => counts.get(postId)?.count ?? null);
}

// Para ordenar Explorar: { postId: número } de todos los ids, entregado de
// una sola vez cuando llegan todos (así la lista no salta de orden con
// cada respuesta). Los que ya están en la caché no se vuelven a pedir.
export function useCommentCounts(postIds) {
  const [result, setResult] = useState({});
  const key = (postIds || []).join(",");

  useEffect(() => {
    let cancelled = false;
    if (!postIds || postIds.length === 0) {
      setResult({});
      return;
    }
    Promise.all(postIds.map((id) => ensureCommentCount(id).then((count) => [id, count || 0]))).then(
      (pairs) => {
        if (!cancelled) setResult(Object.fromEntries(pairs));
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result;
}
