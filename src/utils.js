import { useEffect, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/*
  utils.js
  --------
  Helpers compartidos entre pantallas: detección de pantalla angosta,
  creación de notificaciones (mismo patrón para likes, comentarios,
  mensajes y seguidores nuevos), tiempo relativo en español, y hashtags.
*/

export function useIsMobile(breakpoint = 700) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

// Crea una notificación para otra persona (nunca para ti mismo). Mismo
// patrón para likes, comentarios, mensajes nuevos, seguidores nuevos y
// menciones. "postId" es opcional (solo lo usan las menciones, para poder
// llevar directo al post/comentario donde ocurrió — ver Notifications.jsx).
export async function notify(targetUid, { type, fromUid, fromName, fromIdentity, postId }) {
  if (!targetUid || targetUid === fromUid) return;
  const data = {
    type,
    fromUid,
    fromName,
    fromIdentity,
    createdAt: serverTimestamp(),
    read: false,
  };
  if (postId) data.postId = postId;
  await addDoc(collection(db, "notifications", targetUid, "items"), data);
}

// Tiempo relativo en español: "hace 5 min", "hace 2 h", "ayer", o fecha si es más viejo.
export function timeAgo(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5) return "ahora";
  if (diffSec < 60) return `hace ${diffSec} s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ayer";
  if (diffD < 7) return `hace ${diffD} días`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

// Une texto normal y hashtags en una sola pieza: cada elemento del arreglo
// resultante es o un pedazo de texto plano, o un hashtag completo (con "#").
const HASHTAG_RE = /(#[\p{L}0-9_]+)/gu;

export function splitTextWithHashtags(text) {
  return (text || "").split(HASHTAG_RE);
}

// Extrae los hashtags de un texto en minúsculas y sin duplicados, para
// guardarlos en el post (posts/{id}.hashtags).
export function extractHashtags(text) {
  const matches = (text || "").match(HASHTAG_RE) || [];
  return Array.from(new Set(matches.map((h) => h.slice(1).toLowerCase())));
}
