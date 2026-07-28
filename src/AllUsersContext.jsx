import { createContext, useContext, useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

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
*/

const AllUsersContext = createContext([]);

export function AllUsersProvider({ children }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  return <AllUsersContext.Provider value={users}>{children}</AllUsersContext.Provider>;
}

export function useAllUsersContext() {
  return useContext(AllUsersContext);
}
