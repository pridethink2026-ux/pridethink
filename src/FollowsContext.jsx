import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";

/*
  FollowsContext
  --------------
  Fuga B (punto 82, commit 2): seguidores y seguidos salen de
  follows/{followerUid}_{followedUid} (ver follows.js), no de
  users/{uid}.following.

  FollowsProvider abre UNA vez para toda la app (LoggedInApp.jsx) los dos
  listeners de tu propia relación, mismo patrón que BlocksContext.jsx:
    - following: uids que seguís (follower == vos);
    - followers: uids que te siguen (followed == vos), privados incluidos
      — las reglas te dejan leer toda fila que te nombra.
  Con eso alcanza para el botón Seguir, Momentos, la pestaña Siguiendo,
  Explorar, regalos entre mutuos y el punto de en línea.

  useFollowUids(uid, mode) da la lista de cualquier perfil: el tuyo sale de
  acá; el de otra persona, de una consulta con followerIsPrivate == false
  (lo único que las reglas dejan leer de terceros). Así, de un perfil
  ajeno nunca aparecen sus seguidores privados, y de un perfil privado no
  se puede pedir a quién sigue (UserProfile.jsx ni lo intenta: pasa uid
  null). Dos llamadas con la misma consulta (contador y modal) comparten
  el listener dentro del SDK, sin lecturas extra.
*/

const FollowsContext = createContext({ following: [], followers: [], ready: false });

export function FollowsProvider({ children }) {
  const [currentUid, setCurrentUid] = useState(null);
  const [following, setFollowing] = useState(null);
  const [followers, setFollowers] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUid(user ? user.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    setFollowing(null);
    if (!currentUid) return;
    const q = query(collection(db, "follows"), where("follower", "==", currentUid));
    return onSnapshot(
      q,
      (snap) => setFollowing(snap.docs.map((d) => d.data().followed)),
      (err) => {
        console.error("FollowsContext: no se pudo escuchar a quién sigues", err.code);
        setFollowing([]);
      }
    );
  }, [currentUid]);

  useEffect(() => {
    setFollowers(null);
    if (!currentUid) return;
    const q = query(collection(db, "follows"), where("followed", "==", currentUid));
    return onSnapshot(
      q,
      (snap) => setFollowers(snap.docs.map((d) => d.data().follower)),
      (err) => {
        console.error("FollowsContext: no se pudo escuchar quién te sigue", err.code);
        setFollowers([]);
      }
    );
  }, [currentUid]);

  const value = {
    currentUid,
    following: following || [],
    followers: followers || [],
    ready: following !== null && followers !== null,
  };
  return <FollowsContext.Provider value={value}>{children}</FollowsContext.Provider>;
}

export function useMyFollows() {
  return useContext(FollowsContext);
}

// mode: "followers" | "following". uid null → lista vacía (perfil privado
// ajeno, o todavía sin perfil). Devuelve { uids, ready }.
export function useFollowUids(uid, mode) {
  const mine = useContext(FollowsContext);
  const isMine = !!uid && uid === mine.currentUid;
  const [state, setState] = useState({ key: null, uids: [] });
  const key = uid && !isMine ? `${mode}:${uid}` : null;

  useEffect(() => {
    if (!key) return;
    const [byField, outField] = mode === "followers" ? ["followed", "follower"] : ["follower", "followed"];
    const q = query(
      collection(db, "follows"),
      where(byField, "==", uid),
      where("followerIsPrivate", "==", false)
    );
    return onSnapshot(
      q,
      (snap) => setState({ key, uids: snap.docs.map((d) => d.data()[outField]) }),
      (err) => {
        console.error("FollowsContext: no se pudo leer la lista", err.code);
        setState({ key, uids: [] });
      }
    );
  }, [key, uid, mode]);

  if (!uid) return { uids: [], ready: true };
  if (isMine) return { uids: mode === "followers" ? mine.followers : mine.following, ready: mine.ready };
  return state.key === key ? { uids: state.uids, ready: true } : { uids: [], ready: false };
}
