/*
  push.js
  -------
  Punto 97: notificaciones push de mensajes de chat (Firebase Cloud
  Messaging), del lado de la app.

  users/{uid}/devices/{deviceId} →
    token          token de FCM de este navegador o app instalada
    platform       "android" | "ios" | "desktop"
    createdAt      cuándo se activaron en este dispositivo
    lastSeenAt     última vez que la app confirmó el token (máximo una vez
                   por día, ver usePushRefresh); la función borra los que
                   llevan más de 60 días sin confirmarse
    viewingChatId  chat abierto y visible en este dispositivo (commit 2),
    viewingUntil   hasta cuándo vale (ver useViewingChatBeacon): con eso la
                   función no avisa de un chat que ya estás viendo

  deviceId es un id al azar guardado en localStorage, uno por navegador:
  si el token cambia, se pisa el mismo documento.

  "Mostrar el texto del mensaje" no es de cada dispositivo sino de la
  persona: users/{uid}/private/data.pushShowText (por defecto true).

  El service worker es el de siempre (public/service-worker.js): getToken
  recibe su registro, así no se crea un firebase-messaging-sw.js aparte.
  firebase/messaging se carga recién al usarlo (no pesa en el arranque).
*/

import { useEffect, useState } from "react";
import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { app, db } from "./firebase";
import { isIOS } from "./utils";

// Clave pública de "Certificados de push web" (Firebase Console → Cloud
// Messaging). Es pública a propósito: la privada nunca sale de Firebase.
const VAPID_KEY =
  "BJdE5YKv0HbehzRXPewirWo_tU-EpF6-s0Joolz9R6PJDlCdFAin9dK5vHMUMe5KzeJGOgW5Ywqb-sM02a1ntW0";

const DEVICE_KEY = "pt-push-device";
// Guarda el uid con el que se activaron en este dispositivo: si entra otra
// cuenta, para ella cuentan como apagadas.
const ON_KEY = "pt-push-on";
const REFRESHED_KEY = "pt-push-refreshed";
const BANNER_KEY = "pt-push-banner-hidden";
const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;
const LOGOUT_TIMEOUT_MS = 4000;

function storeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeSet(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // sin almacenamiento: se pierde solo la comodidad
  }
}

let memoryDeviceId = null;
function getDeviceId() {
  let id = storeGet(DEVICE_KEY);
  if (id) return id;
  id = memoryDeviceId || `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  memoryDeviceId = id;
  storeSet(DEVICE_KEY, id);
  return id;
}

function deviceRef(uid) {
  return doc(db, "users", uid, "devices", getDeviceId());
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true
  );
}

function getPlatform() {
  if (isIOS()) return "ios";
  if (/Android/i.test(navigator.userAgent || "")) return "android";
  return "desktop";
}

// "supported" | "ios-install" (iPhone en Safari, falta instalar la app) |
// "ios-update" (instalada, pero iOS anterior a 16.4) | "unsupported"
export function getPushSupport() {
  const hasApi = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!hasApi) return isIOS() ? "ios-update" : "unsupported";
  return "supported";
}

function getPermission() {
  return "Notification" in window ? Notification.permission : "denied";
}

export function isPushEnabledHere(uid) {
  return !!uid && storeGet(ON_KEY) === uid && getPermission() === "granted";
}

// Avisa a los componentes montados (Chat y Perfil) que algo cambió.
const listeners = new Set();
function emitChange() {
  listeners.forEach((fn) => fn());
}

async function loadMessaging() {
  const { getMessaging, getToken, deleteToken, isSupported } = await import(
    /* webpackChunkName: "messaging" */ "firebase/messaging"
  );
  if (!(await isSupported())) throw new Error("unsupported");
  return { messaging: getMessaging(app), getToken, deleteToken };
}

// El service worker solo existe en la versión publicada (no con npm start).
async function getServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("unsupported");
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error("no-sw");
  return navigator.serviceWorker.ready;
}

async function fetchToken() {
  const [{ messaging, getToken }, serviceWorkerRegistration] = await Promise.all([
    loadMessaging(),
    getServiceWorker(),
  ]);
  return getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration });
}

// Pide el permiso y guarda el token. Devuelve el permiso final.
export async function enablePush(uid) {
  // Nada asíncrono antes del pedido: Safari solo lo muestra si viene
  // directo de un toque.
  const permission = await Notification.requestPermission();
  emitChange();
  if (permission !== "granted") return permission;
  const token = await fetchToken();
  await setDoc(deviceRef(uid), {
    token,
    platform: getPlatform(),
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    viewingChatId: null,
    viewingUntil: null,
  });
  storeSet(ON_KEY, uid);
  storeSet(REFRESHED_KEY, String(Date.now()));
  emitChange();
  return permission;
}

// Apaga las notificaciones en este dispositivo (borra el token en FCM y su
// documento). El permiso del navegador queda como está.
export async function disablePush(uid) {
  storeSet(ON_KEY, null);
  storeSet(REFRESHED_KEY, null);
  emitChange();
  try {
    const { messaging, deleteToken } = await loadMessaging();
    await deleteToken(messaging);
  } catch {
    // si no se pudo, FCM lo da por vencido solo y la función lo limpia
  }
  if (uid) await deleteDoc(deviceRef(uid)).catch(() => {});
}

// Al cerrar sesión (antes de signOut): que otra persona que entre en este
// teléfono no reciba tus avisos. Con tope de tiempo, para no trabar la
// salida sin conexión.
export async function disablePushOnLogout(uid) {
  if (!uid || storeGet(ON_KEY) !== uid) return;
  await Promise.race([
    disablePush(uid),
    new Promise((resolve) => setTimeout(resolve, LOGOUT_TIMEOUT_MS)),
  ]);
}

// Una vez por día (al abrir la app): confirma el token, por si cambió o
// la función borró el documento. Si quitaste el permiso desde los
// ajustes, se borra el documento.
export function usePushRefresh(uid) {
  useEffect(() => {
    if (!uid || storeGet(ON_KEY) !== uid) return;
    if (getPermission() !== "granted") {
      disablePush(uid);
      return;
    }
    const last = Number(storeGet(REFRESHED_KEY)) || 0;
    if (Date.now() - last < REFRESH_EVERY_MS) return;
    let cancelled = false;
    fetchToken()
      .then((token) => {
        if (cancelled) return null;
        storeSet(REFRESHED_KEY, String(Date.now()));
        return setDoc(
          deviceRef(uid),
          { token, platform: getPlatform(), lastSeenAt: serverTimestamp() },
          { merge: true }
        );
      })
      .catch((err) => console.error("push: no se pudo renovar el token", err?.code || err?.message));
    return () => {
      cancelled = true;
    };
  }, [uid]);
}

// Commit 2: mientras un chat está abierto y la app visible, este
// dispositivo avisa que lo está viendo (viewingChatId + viewingUntil), y la
// función no le manda notificaciones de ESE chat. Se renueva cada 45 s y
// vale 90 s: si el teléfono cierra la app de golpe (sin llegar a borrarlo),
// en menos de un minuto y medio vuelven los avisos. Solo si las
// notificaciones están activas en este dispositivo.
const VIEWING_MS = 90 * 1000;
const VIEWING_RENEW_MS = 45 * 1000;

export function useViewingChatBeacon(uid, chatId) {
  useEffect(() => {
    if (!uid || !chatId || !isPushEnabledHere(uid)) return undefined;
    const ref = deviceRef(uid);
    const write = () =>
      updateDoc(ref, {
        viewingChatId: chatId,
        viewingUntil: Timestamp.fromMillis(Date.now() + VIEWING_MS),
      }).catch(() => {});
    write();
    const timer = setInterval(write, VIEWING_RENEW_MS);
    return () => {
      clearInterval(timer);
      updateDoc(ref, { viewingChatId: null, viewingUntil: null }).catch(() => {});
    };
  }, [uid, chatId]);
}

// Estado para el interruptor del Perfil y el aviso del Chat.
export function usePushStatus(uid) {
  const read = () => ({
    support: getPushSupport(),
    permission: getPermission(),
    enabled: isPushEnabledHere(uid),
    bannerHidden: storeGet(BANNER_KEY) === "1",
  });
  const [state, setState] = useState(read);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // null | "no-sw" | "failed"

  useEffect(() => {
    const update = () => setState(read());
    update();
    listeners.add(update);
    // El permiso puede cambiar desde los ajustes con la app en segundo plano.
    document.addEventListener("visibilitychange", update);
    return () => {
      listeners.delete(update);
      document.removeEventListener("visibilitychange", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const enable = async () => {
    if (!uid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await enablePush(uid);
    } catch (err) {
      console.error("push: no se pudo activar", err?.code || err?.message);
      setError(err?.message === "no-sw" ? "no-sw" : "failed");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!uid || busy) return;
    setBusy(true);
    setError(null);
    await disablePush(uid);
    setBusy(false);
  };

  const hideBanner = () => {
    storeSet(BANNER_KEY, "1");
    emitChange();
  };

  return { ...state, busy, error, enable, disable, hideBanner };
}
