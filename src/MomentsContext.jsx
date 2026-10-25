import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useAllUsersContext } from "./AllUsersContext";
import { useBlocksContext } from "./BlocksContext";
import { isBlockedEitherWay } from "./Blocks";
import { getActiveEntries } from "./moments";

/*
  MomentsContext
  --------------
  Quién tiene momentos activos y cuáles ya viste (punto 66), con listeners
  únicos para toda la app (montado en index.js), mismo patrón que
  AllUsersContext.jsx y BlocksContext.jsx.

  1) momentIndex/{authorUid}, la colección entera — es una consulta sin
     where() y su regla no depende de resource (cualquier autenticado la
     lee), así que Firestore la acepta. Las políticas TTL borran los
     índices vencidos, así que solo trae autores con momentos de las
     últimas 24 h. Los momentos en sí (moments/{id}) NO se leen acá:
     MomentViewer.jsx los pide de a uno por id al abrirlos.
  2) momentViews/{miUid} → { seen: { authorUid: ms } }: hasta qué momento
     viste de cada autor (el createdAt del índice del más nuevo que
     viste). Como los momentos se miran en orden, alcanza con ese número
     por autor. MomentViewer marca cada momento con markSeen() (se ve al
     instante, el destello se apaga sin esperar a Firestore) y guarda con
     flushSeen() al cambiar de autor o cerrar — no una escritura por foto.
     Se reescribe entero quitando lo de más de SEEN_KEEP_MS.

  Filtra con datos que el cliente ya tiene, igual que firestore.rules
  (puedeVerMomentosDe): autor no privado, al que sigo, sin bloqueo en
  ninguna dirección. Así la tira y el destello nunca muestran a alguien
  cuyos momentos después fallarían al abrir.

  `now` se actualiza cada minuto para que un momento que vence desaparezca
  solo, sin esperar a que la TTL borre el índice.
*/

const NOW_TICK_MS = 60 * 1000;
const SEEN_KEEP_MS = 48 * 60 * 60 * 1000;

const MomentsContext = createContext({
  currentUid: null,
  myIndex: null,
  myMoments: [],
  authors: [],
  getVisibleMoments: () => [],
  getMomentState: () => null,
  getFirstUnseenIndex: () => 0,
  hasSeen: () => false,
  markSeen: () => {},
  flushSeen: () => {},
});

// Por autor, el mayor de los dos valores (lo marcado en este dispositivo
// puede ir por delante de lo que llegó de Firestore, y al revés).
function mergeSeen(a, b) {
  const out = { ...a };
  Object.keys(b).forEach((uid) => {
    if (!(out[uid] >= b[uid])) out[uid] = b[uid];
  });
  return out;
}

export function MomentsProvider({ children }) {
  const [currentUid, setCurrentUid] = useState(null);
  const [indexes, setIndexes] = useState({});
  const [seen, setSeen] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const seenRef = useRef({});
  const dirtyRef = useRef(false);
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
    seenRef.current = {};
    dirtyRef.current = false;
    setSeen({});
    if (!currentUid) return;
    const unsub = onSnapshot(
      doc(db, "momentViews", currentUid),
      (snap) => {
        const remote = snap.exists() ? snap.data().seen || {} : {};
        seenRef.current = mergeSeen(seenRef.current, remote);
        setSeen(seenRef.current);
      },
      () => {}
    );
    return unsub;
  }, [currentUid]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const markSeen = useCallback((authorUid, createdAt) => {
    if (seenRef.current[authorUid] >= createdAt) return;
    seenRef.current = { ...seenRef.current, [authorUid]: createdAt };
    dirtyRef.current = true;
    setSeen(seenRef.current);
  }, []);

  const flushSeen = useCallback(() => {
    if (!currentUid || !dirtyRef.current) return;
    dirtyRef.current = false;
    const cutoff = Date.now() - SEEN_KEEP_MS;
    const pruned = {};
    Object.keys(seenRef.current).forEach((uid) => {
      if (seenRef.current[uid] > cutoff) pruned[uid] = seenRef.current[uid];
    });
    setDoc(doc(db, "momentViews", currentUid), { seen: pruned }).catch(() => {
      dirtyRef.current = true;
    });
  }, [currentUid]);

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

    // null = sin momentos visibles; "unseen" = hay alguno sin ver
    // (destello); "seen" = los viste todos. Los tuyos nunca destellan.
    const getMomentState = (uid) => {
      const entries = getVisibleMoments(uid);
      if (entries.length === 0) return null;
      if (uid === currentUid) return "seen";
      return (seen[uid] || 0) >= entries[entries.length - 1].createdAt ? "seen" : "unseen";
    };

    // Con qué momento de `entries` empezar: el primero sin ver, o el
    // primero de todos si ya los viste.
    const getFirstUnseenIndex = (uid, entries) => {
      const i = entries.findIndex((e) => e.createdAt > (seen[uid] || 0));
      return i === -1 ? 0 : i;
    };

    // Si ya viste ese momento (por la marca de vistos). MomentViewer lo usa
    // para no volver a registrarte en momentViewers (commit 5).
    const hasSeen = (uid, createdAt) => (seen[uid] || 0) >= createdAt;

    // Autores ajenos con momentos activos: primero los que tienen algo sin
    // ver, y dentro de cada grupo el más reciente primero.
    const authors = Object.keys(indexes)
      .filter((uid) => uid !== currentUid)
      .map((uid) => ({ uid, entries: getVisibleMoments(uid), state: getMomentState(uid) }))
      .filter((a) => a.entries.length > 0)
      .sort((a, b) => {
        if (a.state !== b.state) return a.state === "unseen" ? -1 : 1;
        return b.entries[b.entries.length - 1].createdAt - a.entries[a.entries.length - 1].createdAt;
      });

    return {
      currentUid,
      myIndex: indexes[currentUid] || null,
      myMoments: currentUid ? getActiveEntries(indexes[currentUid], now) : [],
      authors,
      getVisibleMoments,
      getMomentState,
      getFirstUnseenIndex,
      hasSeen,
      markSeen,
      flushSeen,
    };
  }, [indexes, seen, now, allUsers, currentUid, blockedByMe, blockedMe, markSeen, flushSeen]);

  return <MomentsContext.Provider value={value}>{children}</MomentsContext.Provider>;
}

export function useMoments() {
  return useContext(MomentsContext);
}
