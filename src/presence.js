import { useEffect, useState, useSyncExternalStore } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { timeAgo } from "./utils";

/*
  presence.js
  -----------
  Lógica pura (sin JSX) de "en línea" / "última conexión", compartida por
  App.js (arranca/detiene el seguimiento), AuthProfile.jsx (marca offline
  al cerrar sesión explícitamente) y quien necesite mostrar el puntito
  verde o el texto "Últ. vez..." (Chat.jsx, UserProfile.jsx).

  Estructura en Firestore: presence/{uid} (punto 70, commit 9g). Antes
  eran dos campos de users/{uid}, que cualquier autenticado lee y
  AllUsersContext descarga para todos (fuga A: el dato crudo llegaba a
  todos los clientes aunque canSeeOnlineStatus ocultara el punto), y cada
  latido volvía a disparar ese listener en todos los clientes. Ahora las
  reglas (puedeVerPresenciaDe en firestore.rules) solo dejan leerlo al
  dueño y a quien no tenga bloqueo y pueda ver el perfil (público, o
  privado con seguimiento mutuo). Mismos nombres de campo que antes, así
  isEffectivelyOnline/formatLastSeen no cambian:
    - isOnline: boolean
    - lastSeen: Timestamp del servidor (se actualiza cada vez que cambia
      isOnline, Y además cada HEARTBEAT_MS mientras la pestaña sigue
      abierta)
  Las reglas dependen del uid de la ruta, así que no se puede consultar la
  colección entera: usePresences abre un listener por uid, compartido
  entre todos los componentes que lo muestran (ver más abajo).

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

const HEARTBEAT_MS = 2 * 60 * 1000; // 2 minutos
export const STALE_MS = 5 * 60 * 1000; // 5 minutos

async function markOnline(uid) {
  if (!uid) return;
  try {
    await setDoc(doc(db, "presence", uid), { isOnline: true, lastSeen: serverTimestamp() });
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
    await setDoc(doc(db, "presence", uid), { isOnline: false, lastSeen: serverTimestamp() });
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

// Lectura compartida: un listener por uid aunque varios componentes muestren
// a la misma persona (fila de contacto, encabezado del chat, perfil). Se
// cierra cuando nadie lo usa; el cierre espera un turno para que un cambio
// de lista (por ejemplo, filtrar contactos) no cierre y reabra los mismos.
// Si las reglas lo rechazan (perfil privado sin seguimiento mutuo, bloqueo)
// queda en null: sin punto ni "Últ. vez".
const entries = new Map(); // uid -> { count, data, unsub }
const storeListeners = new Set();
let storeVersion = 0;

function notifyStore() {
  storeVersion += 1;
  storeListeners.forEach((fn) => fn());
}

function subscribeStore(fn) {
  storeListeners.add(fn);
  return () => storeListeners.delete(fn);
}

const getStoreVersion = () => storeVersion;

function retain(uid) {
  let entry = entries.get(uid);
  if (!entry) {
    entry = { count: 0, data: null, unsub: null };
    entries.set(uid, entry);
    const current = entry;
    current.unsub = onSnapshot(
      doc(db, "presence", uid),
      (snap) => {
        current.data = snap.exists() ? snap.data() : null;
        notifyStore();
      },
      () => {
        current.data = null;
        notifyStore();
      }
    );
  }
  entry.count += 1;
}

function release(uid) {
  const entry = entries.get(uid);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count > 0) return;
  setTimeout(() => {
    if (entries.get(uid) !== entry || entry.count > 0) return;
    entry.unsub();
    entries.delete(uid);
  }, 0);
}

// { uid: { isOnline, lastSeen } | null } de los uids pedidos. Además vuelve
// a renderizar cada minuto, para que el punto de alguien que perdió la
// conexión sin avisar se apague aunque no llegue ningún cambio.
export function usePresences(uids) {
  const key = Array.from(new Set(uids.filter(Boolean))).sort().join(",");
  const [, setTick] = useState(0);
  useSyncExternalStore(subscribeStore, getStoreVersion);

  useEffect(() => {
    if (!key) return;
    const list = key.split(",");
    list.forEach(retain);
    const tick = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => {
      clearInterval(tick);
      list.forEach(release);
    };
  }, [key]);

  const byUid = {};
  if (key) key.split(",").forEach((uid) => (byUid[uid] = entries.get(uid)?.data ?? null));
  return byUid;
}

// Presencia de una sola persona (null si no se pide, no llegó o no se puede ver).
export function usePresence(uid) {
  return usePresences(uid ? [uid] : [])[uid] ?? null;
}

// ¿Se le puede mostrar el punto verde a esta persona? Combina el flag
// guardado con la frescura de "lastSeen" (ver docstring de arriba). Recibe
// el documento de presence/{uid} (usePresence/usePresences).
export function isEffectivelyOnline(user) {
  if (!user?.isOnline || !user?.lastSeen?.toMillis) return false;
  return Date.now() - user.lastSeen.toMillis() < STALE_MS;
}

// Texto "Últ. vez hace X"/"Last seen X ago" reutilizando timeAgo() tal cual
// (mismo formato relativo, en el idioma activo, que ya usan los posts) —
// null si nunca se registró lastSeen (cuentas viejas, de antes de esta
// función). "t" es la función de useLanguage(), la pasa quien llama.
export function formatLastSeen(user, t) {
  if (!user?.lastSeen) return null;
  return t("common.lastSeenPrefix", { time: timeAgo(user.lastSeen, t) });
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
