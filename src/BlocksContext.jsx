import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";

/*
  BlocksContext
  -------------
  Antes, useMyBlocks (Blocks.js) abría sus propios dos onSnapshot en vivo
  cada vez que se llamaba — y se llama por separado en 9 componentes
  distintos (Chat, Search, UserProfile, PostView, SharePostModal,
  FollowListModal, GroupView, AuthProfile, y dos veces en Feed), así que
  terminaba habiendo hasta 18 listeners simultáneos leyendo exactamente
  los mismos dos datos (a quién bloqueaste, quién te bloqueó a vos).

  BlocksProvider abre esos dos listeners UNA sola vez, a nivel de toda la
  app (montado en index.js junto a LanguageProvider), y useMyBlocks pasó a
  leer de este contexto en vez de abrir los suyos — mismo patrón que ya
  usa LanguageContext.jsx para el idioma.
*/

const BlocksContext = createContext({ blockedByMe: [], blockedMe: [] });

export function BlocksProvider({ children }) {
  const [currentUid, setCurrentUid] = useState(null);
  const [blockedByMe, setBlockedByMe] = useState([]);
  const [blockedMe, setBlockedMe] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUid(user ? user.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setBlockedByMe([]);
      return;
    }
    const q = query(collection(db, "blocks"), where("blockerUid", "==", currentUid));
    const unsub = onSnapshot(q, (snap) => {
      setBlockedByMe(snap.docs.map((d) => d.data().blockedUid));
    });
    return unsub;
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid) {
      setBlockedMe([]);
      return;
    }
    const q = query(collection(db, "blocks"), where("blockedUid", "==", currentUid));
    const unsub = onSnapshot(q, (snap) => {
      setBlockedMe(snap.docs.map((d) => d.data().blockerUid));
    });
    return unsub;
  }, [currentUid]);

  return (
    <BlocksContext.Provider value={{ blockedByMe, blockedMe }}>{children}</BlocksContext.Provider>
  );
}

export function useBlocksContext() {
  return useContext(BlocksContext);
}
