import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useAllUsersContext } from "./AllUsersContext";
import { useBlocksContext } from "./BlocksContext";
import { isBlockedEitherWay } from "./Blocks";
import { getActiveEntries } from "./moments";

/*
  MomentsContext
  --------------
  Quién tiene momentos activos (punto 66), con UN solo listener para toda
  la app (montado en index.js), mismo patrón que AllUsersContext.jsx y
  BlocksContext.jsx.

  Escucha la colección momentIndex/{authorUid} entera — es una consulta
  sin where() y su regla no depende de resource (cualquier autenticado la
  lee), así que Firestore la acepta. Las políticas TTL borran los índices
  vencidos, así que solo trae autores con momentos de las últimas 24 h.
  Los momentos en sí (moments/{id}) NO se leen acá: MomentViewer.jsx los
  pide de a uno por id al abrirlos.

  Filtra con datos que el cliente ya tiene, igual que firestore.rules
  (puedeVerMomentosDe): autor no privado, al que sigo, sin bloqueo en
  ninguna dirección. Así la tira nunca muestra a alguien cuyos momentos
  después fallarían al abrir.

  `now` se actualiza cada minuto para que un momento que vence desaparezca
  solo, sin esperar a que la TTL borre el índice.
*/

const NOW_TICK_MS = 60 * 1000;

const MomentsContext = createContext({
  myIndex: null,
  myMoments: [],
  authors: [],
  getVisibleMoments: () => [],
});

export function MomentsProvider({ children }) {
  const [currentUid, setCurrentUid] = useState(null);
  const [indexes, setIndexes] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const allUsers = useAllUsersContext();
  const { blockedByMe, blockedMe } = useBlocksContext();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUid(user ? user.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setIndexes({});
      return;
    }
    const unsub = onSnapshot(
      collection(db, "momentIndex"),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data();
        });
        setIndexes(map);
      },
      () => setIndexes({})
    );
    return unsub;
  }, [currentUid]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const value = useMemo(() => {
    const usersMap = {};
    allUsers.forEach((u) => {
      usersMap[u.uid] = u;
    });
    const following = usersMap[currentUid]?.following || [];

    const canSee = (uid) => {
      if (uid === currentUid) return true;
      const author = usersMap[uid];
      if (!author || author.isPrivate) return false;
      if (!following.includes(uid)) return false;
      return !isBlockedEitherWay(blockedByMe, blockedMe, uid);
    };

    const getVisibleMoments = (uid) => (canSee(uid) ? getActiveEntries(indexes[uid], now) : []);

    // Autores ajenos con momentos activos, el más reciente primero.
    const authors = Object.keys(indexes)
      .filter((uid) => uid !== currentUid)
      .map((uid) => ({ uid, entries: getVisibleMoments(uid) }))
      .filter((a) => a.entries.length > 0)
      .sort((a, b) => b.entries[b.entries.length - 1].createdAt - a.entries[a.entries.length - 1].createdAt);

    return {
      myIndex: indexes[currentUid] || null,
      myMoments: currentUid ? getActiveEntries(indexes[currentUid], now) : [],
      authors,
      getVisibleMoments,
    };
  }, [indexes, now, allUsers, currentUid, blockedByMe, blockedMe]);

  return <MomentsContext.Provider value={value}>{children}</MomentsContext.Provider>;
}

export function useMoments() {
  return useContext(MomentsContext);
}
