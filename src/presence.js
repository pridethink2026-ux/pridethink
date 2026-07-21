import { useEffect } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { timeAgo } from "./utils";

/*
  presence.js
  -----------
  Lógica pura (sin JSX) de "en línea" / "última conexión", compartida por
  App.js (arranca/detiene el seguimiento), AuthProfile.jsx (marca offline
  al cerrar sesión explícitamente) y quien necesite mostrar el puntito
  verde o el texto "Últ. vez..." (Chat.jsx, UserProfile.jsx).

  Estructura en Firestore: dos campos nuevos en users/{uid}, ya cubiertos
  por la regla existente "allow create, update: if esDueno(uid);" (no
  restringe campos) — no hace falta tocar firestore.rules para esto.
    - isOnline: boolean
    - lastSeen: Timestamp (se actualiza cada vez que cambia isOnline, Y
      además cada minuto mientras la pestaña sigue abierta — ver
      HEARTBEAT_MS más abajo)

  CÓMO SE DECIDE "¿ESTÁ EN LÍNEA DE VERDAD?" (isEffectivelyOnline):
  Firestore NO tiene una forma nativa de detectar que alguien cerró la
  pestaña de golpe, perdió la conexión, o el navegador se cerró sin
  avisar (el evento "beforeunload" ayuda para un cierre normal, pero no
  es 100% confiable — los navegadores no garantizan que una escritura
  async termine a tiempo). Firebase SÍ tiene una función para esto
  (Realtime Database + onDisconnect), pero es OTRO producto de Firebase
  aparte de Firestore, con su propia configuración y reglas — se decidió
  no sumarlo solo para esto (el enunciado pedía la versión de Firestore
  "si es sencilla de implementar", y no lo es). En su lugar: un usuario
  se considera EFECTIVAMENTE en línea solo si "isOnline" es true Y
  "lastSeen" es reciente (menos de STALE_MS) — así, si alguien pierde la
  conexión sin que se dispare "beforeunload", su punto verde desaparece
  solo a los pocos minutos en vez de quedar "en línea" para siempre.

  HEARTBEAT: mientras la pestaña sigue abierta y autenticada, se vuelve a
  tocar "lastSeen" cada HEARTBEAT_MS (bastante más seguido que STALE_MS)
  para que una sesión genuinamente activa nunca se marque como "vieja".
*/

const HEARTBEAT_MS = 60 * 1000; // 1 minuto
export const STALE_MS = 2 * 60 * 1000; // 2 minutos

async function markOnline(uid) {
  if (!uid) return;
  try {
    await updateDoc(doc(db, "users", uid), { isOnline: true, lastSeen: serverTimestamp() });
  } catch (e) {
    // silencioso: no debe romper la app si por lo que sea falla la escritura
  }
}

// Exportada porque AuthProfile.jsx también la usa al cerrar sesión de
// forma explícita (ANTES de signOut(auth) — una vez que la sesión ya se
// cerró, la escritura ya no pasaría las reglas de Firestore, que exigen
// estar autenticado).
export async function markOffline(uid) {
  if (!uid) return;
  try {
    await updateDoc(doc(db, "users", uid), { isOnline: false, lastSeen: serverTimestamp() });
  } catch (e) {
    // silencioso (ver arriba) — importante sobre todo en beforeunload,
    // donde el navegador puede cortar la pestaña antes de que termine.
  }
}

// Hook de un solo lugar (montado una vez en App.js, la raíz de la app):
// marca "en línea" apenas hay sesión, mantiene "lastSeen" fresco con un
// latido periódico, y marca "offline" al mejor esfuerzo si se cierra la
// pestaña o se recarga.
export function useOnlinePresence(currentUid) {
  useEffect(() => {
    if (!currentUid) return;

    markOnline(currentUid);
    const heartbeat = setInterval(() => markOnline(currentUid), HEARTBEAT_MS);

    const handleBeforeUnload = () => {
      markOffline(currentUid);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [currentUid]);
}

// ¿Se le puede mostrar el punto verde a esta persona? Combina el flag
// guardado con la frescura de "lastSeen" (ver docstring de arriba).
export function isEffectivelyOnline(user) {
  if (!user?.isOnline || !user?.lastSeen?.toMillis) return false;
  return Date.now() - user.lastSeen.toMillis() < STALE_MS;
}

// Texto "Últ. vez hace X" reutilizando timeAgo() tal cual (formato
// relativo en español, mismo que ya usan los posts) — null si nunca se
// registró lastSeen (cuentas viejas, de antes de esta función).
export function formatLastSeen(user) {
  if (!user?.lastSeen) return null;
  return `Últ. vez ${timeAgo(user.lastSeen)}`;
}

// Respeta la privacidad: si el perfil es privado, el estado en línea solo
// se muestra al dueño (viéndose a sí mismo) o a alguien con seguimiento
// MUTUO (ambos se siguen) — mismo criterio que "contacto" en esta app, que
// no tiene un concepto de contactos separado del de seguir.
export function canSeeOnlineStatus(targetUser, targetUid, viewerUid, viewerFollowing) {
  if (!targetUser) return false;
  if (viewerUid === targetUid) return true;
  if (!targetUser.isPrivate) return true;
  const iFollowThem = (viewerFollowing || []).includes(targetUid);
  const theyFollowMe = (targetUser.following || []).includes(viewerUid);
  return iFollowThem && theyFollowMe;
}
