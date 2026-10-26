import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "./firebase";

/*
  SavedPostsContext
  -----------------
  Punto 70, commit 9a: antes, cada PostCard (Feed.jsx) abría su propio
  onSnapshot sobre savedPosts/{miUid}/items/{postId} para saber si estaba
  guardado — un listener y una lectura por cada post en pantalla (un
  documento que no existe también se cobra), y SavedPosts.jsx abría otro
  más sobre la subcolección entera.

  SavedPostsProvider abre UN solo listener sobre savedPosts/{miUid}/items
  (más reciente primero, por savedAt) para toda la app (montado en
  LoggedInApp.jsx), mismo patrón que BlocksContext.jsx. Cuesta una
  lectura por post guardado al entrar y después solo los cambios.
  useSavedPosts() -> { savedIds, isSaved, ready }:
    - savedIds: ids guardados, más reciente primero (SavedPosts.jsx);
    - isSaved(postId): si ese post está guardado (PostCard);
    - ready: ya llegó la primera respuesta.
*/

const SavedPostsContext = createContext({ savedIds: [], isSaved: () => false, ready: false });

export function SavedPostsProvider({ children }) {
  const [currentUid, setCurrentUid] = useState(null);
  const [savedIds, setSavedIds] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUid(user ? user.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    setSavedIds([]);
    setReady(false);
    if (!currentUid) return;
    const q = query(collection(db, "savedPosts", currentUid, "items"), orderBy("savedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSavedIds(snap.docs.map((d) => d.id));
        setReady(true);
      },
      (err) => {
        console.error("SavedPostsContext: no se pudo escuchar los guardados", err.code);
      }
    );
    return unsub;
  }, [currentUid]);

  const value = useMemo(() => {
    const set = new Set(savedIds);
    return { savedIds, isSaved: (postId) => set.has(postId), ready };
  }, [savedIds, ready]);

  return <SavedPostsContext.Provider value={value}>{children}</SavedPostsContext.Provider>;
}

export function useSavedPosts() {
  return useContext(SavedPostsContext);
}
