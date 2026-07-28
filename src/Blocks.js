import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useBlocksContext } from "./BlocksContext";

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

  useMyBlocks() reemplaza a "myProfile.blockedUsers" (a quién bloqueaste)
  Y a "otroUsuario.blockedUsers.includes(miUid)" (si esa persona te
  bloqueó a vos) en TODOS los lugares de la app que filtraban contenido
  por bloqueo. Los dos listeners en vivo (a quién bloqueaste, quién te
  bloqueó) ya NO se abren acá: viven una sola vez en BlocksContext.jsx
  (montado en index.js) para no duplicarlos en cada componente que llama
  a este hook — ver BlocksContext.jsx para el detalle. La firma se
  mantiene igual (acepta e ignora un currentUid, por compatibilidad con
  los ~9 call sites existentes) para no tener que tocar ningún otro
  archivo.
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

// { blockedByMe: [uid...], blockedMe: [uid...] } — ambas en tiempo real,
// leídas del listener único de BlocksContext (ver el comentario de arriba).
export function useMyBlocks() {
  return useBlocksContext();
}

// Bloqueo en CUALQUIER dirección entre vos y otroUid — mismo criterio que
// ya usaba toda la app con blockedUsers, ahora contra las dos listas de
// useMyBlocks en vez de arreglos leídos de documentos ajenos.
export function isBlockedEitherWay(blockedByMe, blockedMe, otroUid) {
  return blockedByMe.includes(otroUid) || blockedMe.includes(otroUid);
}
