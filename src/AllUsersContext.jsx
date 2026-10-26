import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

/*
  AllUsersContext
  ---------------
  Auditoría de rendimiento (2026-07-28): useAllUsers (Mentions.jsx) abría
  su propio onSnapshot sobre TODA la colección "users" cada vez que se
  llamaba — y se llama, directa o indirectamente, desde Chat.jsx,
  Feed.jsx (una vez por CADA PostCard renderizado, más el composer
  principal), Search.jsx, SharePostModal.jsx y GroupView.jsx. Con varias
  publicaciones en el muro a la vez, esto llegaba a docenas de listeners
  simultáneos leyendo exactamente los mismos datos — y como el latido de
  presencia (presence.js) reescribe el documento de cada usuario conectado
  cada 60 segundos, cada uno de esos listeners duplicados se volvía a
  disparar en cada latido, generando picos de CPU periódicos (mismo
  problema, mismo diagnóstico, que ya se resolvió para "blocks" con
  BlocksContext.jsx — ver ese archivo).

  AllUsersProvider abre ese único listener una sola vez para toda la app
  (montado en index.js); useAllUsers (Mentions.jsx) ahora solo lee de acá.

  Ojo: este listener descarga el documento users/{uid} COMPLETO de todos
  los usuarios a cada cliente. Por eso ningún dato sensible puede vivir
  ahí: los datos personales y ajustes privados están en
  users/{uid}/private/data (hallazgo H1, 2026-10-24), que solo lee el
  dueño y que este listener no toca.

  Solo con sesión iniciada (2026-10-26, punto 68): firestore.rules exige
  sesión para leer "users", así que un listener abierto sin sesión fallaba
  con permission-denied y moría — y como antes se abría UNA vez al cargar
  la página, después de iniciar sesión la lista quedaba vacía hasta
  recargar (el chat abría "sin contactos"). Ahora se abre al iniciar
  sesión, se cierra y se vacía al cerrarla, mismo patrón que
  BlocksContext.jsx.

  Perfiles sin listeners propios (punto 70, commit 9c): como esta lista ya
  trae el documento de cada usuario en vivo, los demás listeners sobre
  users/{uid} y la consulta de seguidores (where following
  array-contains) leían otra vez lo mismo — y cada latido de presencia
  los volvía a disparar (una lectura por minuto por perfil conectado).
  Ahora salen de acá:
    - useUserProfile(uid): el perfil de uid (el tuyo u otro), null si
      todavía no llegó o no existe;
    - useFollowerUids(uid): uids de quienes siguen a uid, los mismos que
      devolvía esa consulta;
    - useAllUsersReady(): ya llegó la primera respuesta (o falló), para
      distinguir "cargando" de "no existe".
*/

const AllUsersContext = createContext([]);
const AllUsersReadyContext = createContext(false);

export function AllUsersProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [ready, setReady] = useState(false);
  const [currentUid, setCurrentUid] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUid(user ? user.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    setReady(false);
    if (!currentUid) {
      setUsers([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => {
        setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        setReady(true);
      },
      (err) => {
        console.error("AllUsersContext: no se pudo escuchar users", err.code);
        setUsers([]);
        setReady(true);
      }
    );
    return unsub;
  }, [currentUid]);

  return (
    <AllUsersContext.Provider value={users}>
      <AllUsersReadyContext.Provider value={ready}>{children}</AllUsersReadyContext.Provider>
    </AllUsersContext.Provider>
  );
}

export function useAllUsersContext() {
  return useContext(AllUsersContext);
}

export function useAllUsersReady() {
  return useContext(AllUsersReadyContext);
}

export function useUserProfile(uid) {
  const users = useContext(AllUsersContext);
  return useMemo(() => (uid && users.find((u) => u.uid === uid)) || null, [users, uid]);
}

export function useFollowerUids(uid) {
  const users = useContext(AllUsersContext);
  return useMemo(
    () => (uid ? users.filter((u) => (u.following || []).includes(uid)).map((u) => u.uid) : []),
    [users, uid]
  );
}
