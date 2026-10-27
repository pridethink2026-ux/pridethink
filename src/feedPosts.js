import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";

/*
  feedPosts
  ---------
  Lectura paginada del Muro (punto 70, commit 9e). Antes Feed.jsx escuchaba
  TODOS los posts públicos sin límite: abrir el Muro costaba una lectura por
  post existente. Ahora:

  - Páginas fijas de PAGE_SIZE posts públicos con createdAt <= el momento
    en que abriste el Muro (openedAt), más recientes primero. Cada página
    es su propio onSnapshot (reacciones, ediciones y borrados siguen en
    vivo) y su cursor (el último documento) se fija con el primer snapshot
    DEL SERVIDOR — uno del caché podría venir incompleto y dejar huecos.
  - Un listener de "posts nuevos" (createdAt > openedAt) para lo que se
    publica mientras estás en el Muro, incluido lo tuyo.
  - Tus posts con authorIsPrivate == true (no aparecen en las consultas
    públicas): dos igualdades sin orderBy, no necesita índice compuesto.
    Mientras queden páginas por cargar, solo se muestran los que caen en el
    rango ya cargado, para no mezclar posts viejos fuera de orden.

  Las consultas públicas usan el índice compuesto posts (authorIsPrivate
  ascendente, createdAt descendente), creado a mano en la consola.

  useExplorePool: los últimos EXPLORE_POOL_SIZE posts públicos, escuchados
  solo mientras la pestaña Explorar está abierta.
*/

export const PAGE_SIZE = 20;
const EXPLORE_POOL_SIZE = 100;

const toPost = (d) => ({ id: d.id, ...d.data() });
// Un post recién publicado tiene createdAt pendiente (null): va arriba.
const millisOf = (p) => p.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;

export function useFeedPosts(uid) {
  const [head, setHead] = useState([]);
  const [pages, setPages] = useState([]);
  const [myPrivate, setMyPrivate] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sessionRef = useRef(null);

  useEffect(() => {
    setHead([]);
    setPages([]);
    setMyPrivate([]);
    setHasMore(false);
    setLoadingMore(false);
    if (!uid) {
      sessionRef.current = null;
      setLoading(false);
      return;
    }
    setLoading(true);
    const openedAt = Timestamp.now();
    const session = { openedAt, cursors: [], unsubs: [] };
    sessionRef.current = session;
    const posts = collection(db, "posts");

    session.unsubs.push(
      onSnapshot(
        query(
          posts,
          where("authorIsPrivate", "==", false),
          where("createdAt", ">", openedAt),
          orderBy("createdAt", "desc")
        ),
        (snap) => setHead(snap.docs.map(toPost)),
        (err) => console.error("Muro: posts nuevos", err)
      )
    );

    session.unsubs.push(
      onSnapshot(
        query(posts, where("authorId", "==", uid), where("authorIsPrivate", "==", true)),
        (snap) => setMyPrivate(snap.docs.map(toPost)),
        (err) => console.error("Muro: mis posts privados", err)
      )
    );

    session.openPage = (index, after) => {
      const constraints = [
        where("authorIsPrivate", "==", false),
        where("createdAt", "<=", openedAt),
        orderBy("createdAt", "desc"),
      ];
      if (after) constraints.push(startAfter(after));
      constraints.push(limit(PAGE_SIZE));
      session.cursors[index] = undefined;
      session.unsubs.push(
        onSnapshot(
          query(posts, ...constraints),
          (snap) => {
            setPages((prev) => {
              const next = prev.slice();
              next[index] = snap.docs.map(toPost);
              return next;
            });
            if (index === 0) setLoading(false);
            if (session.cursors[index] === undefined && !snap.metadata.fromCache) {
              const full = snap.docs.length === PAGE_SIZE;
              session.cursors[index] = full ? snap.docs[snap.docs.length - 1] : null;
              setHasMore(full);
              setLoadingMore(false);
            }
          },
          (err) => {
            console.error("Muro: página", index, err);
            if (session.cursors[index] === undefined) session.cursors[index] = null;
            setHasMore(false);
            setLoadingMore(false);
            setLoading(false);
          }
        )
      );
    };

    session.openPage(0, null);
    return () => {
      session.unsubs.forEach((u) => u());
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [uid]);

  const loadMore = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const { cursors } = session;
    const last = cursors[cursors.length - 1];
    // Solo si la última página ya tiene su cursor fijo y venía llena.
    if (!last) return;
    setLoadingMore(true);
    session.openPage(cursors.length, last);
  }, []);

  const posts = useMemo(() => {
    const paged = pages.flat();
    // Con páginas pendientes, tus posts privados solo dentro del rango cargado.
    const oldest = hasMore && paged.length > 0 ? millisOf(paged[paged.length - 1]) : -Infinity;
    const merged = new Map();
    myPrivate.forEach((p) => {
      if (millisOf(p) >= oldest) merged.set(p.id, p);
    });
    paged.forEach((p) => merged.set(p.id, p));
    head.forEach((p) => merged.set(p.id, p));
    return Array.from(merged.values()).sort((a, b) => millisOf(b) - millisOf(a));
  }, [head, pages, myPrivate, hasMore]);

  return { posts, loading, hasMore, loadingMore, loadMore, pageCount: pages.length };
}

export function useExplorePool(uid, active) {
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setPool([]);
      return;
    }
    if (!active) return;
    const q = query(
      collection(db, "posts"),
      where("authorIsPrivate", "==", false),
      orderBy("createdAt", "desc"),
      limit(EXPLORE_POOL_SIZE)
    );
    return onSnapshot(
      q,
      (snap) => {
        setPool(snap.docs.map(toPost));
        setLoading(false);
      },
      (err) => {
        console.error("Explorar", err);
        setLoading(false);
      }
    );
  }, [uid, active]);

  return { pool, loading };
}
