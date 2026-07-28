import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";

/*
  Blocks.js
  ---------
  Lógica pura de bloqueo entre usuarios, en su propia colección
  "blocks/{blockerUid}_{blockedUid}" — reemplaza al viejo campo
  users/{uid}.blockedUsers (auditoría de seguridad, 2026-07-28).

  Por qué: users/{uid} es legible por CUALQUIER autenticado (lo necesitan
  el chat, las menciones, la búsqueda, etc.), así que un arreglo
  "blockedUsers" ahí adentro dejaba a cualquiera leer a quién bloqueaste
  con un simple getDoc — contradecía el diseño de "no revelar quién
  bloqueó a quién" (ver CONTEXTO.md, punto 22). Con un documento propio
  por bloqueo (mismo patrón de id compuesto que ya usa chats/{chatId} en
  Chat.jsx: dos uids separados por "_"), las reglas de Firestore
  (firestore.rules) solo dejan leer un bloqueo puntual a las DOS personas
  involucradas en ESE bloqueo — nadie más puede enumerar bloqueos ajenos.

  useMyBlocks(currentUid) reemplaza a "myProfile.blockedUsers" (a quién
  bloqueaste) Y a "otroUsuario.blockedUsers.includes(miUid)" (si esa
  persona te bloqueó a vos) en TODOS los lugares de la app que filtraban
  contenido por bloqueo — con dos consultas en vivo, acotadas a las
  relaciones donde vos sos una de las dos partes.
*/

export function getBlockId(blockerUid, blockedUid) {
  return `${blockerUid}_${blockedUid}`;
}

export function blockUser(blockerUid, blockedUid) {
  return setDoc(doc(db, "blocks", getBlockId(blockerUid, blockedUid)), {
    blockerUid,
    blockedUid,
    createdAt: serverTimestamp(),
  });
}

export function unblockUser(blockerUid, blockedUid) {
  return deleteDoc(doc(db, "blocks", getBlockId(blockerUid, blockedUid)));
}

// { blockedByMe: [uid...], blockedMe: [uid...] } — ambas en tiempo real.
export function useMyBlocks(currentUid) {
  const [blockedByMe, setBlockedByMe] = useState([]);
  const [blockedMe, setBlockedMe] = useState([]);

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

  return { blockedByMe, blockedMe };
}

// Bloqueo en CUALQUIER dirección entre vos y otroUid — mismo criterio que
// ya usaba toda la app con blockedUsers, ahora contra las dos listas de
// useMyBlocks en vez de arreglos leídos de documentos ajenos.
export function isBlockedEitherWay(blockedByMe, blockedMe, otroUid) {
  return blockedByMe.includes(otroUid) || blockedMe.includes(otroUid);
}
