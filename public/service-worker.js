/*
  Service worker de Pridethink (punto 93): lo que hace que la app se pueda
  instalar en el teléfono. Es simple a propósito:

  - Pantallas (navegación): primero internet, así siempre sale la última
    versión publicada. Cada respuesta buena se guarda como copia ("/"),
    que solo se usa si no hay conexión.
  - /static/: los archivos de la app llevan un hash en el nombre y nunca
    cambian, así que se sirven desde la copia guardada si ya está.
  - Todo lo demás (Firebase, fotos, otros sitios, /music/, manifest,
    íconos) no se toca: va directo a internet como siempre.

  - Notificaciones push del chat (punto 97): ver los listeners "push" y
    "notificationclick" al final. Este es el único service worker de la
    app: push.js le pasa su registro a Firebase al pedir el token, así que
    no existe un firebase-messaging-sw.js aparte.

  Actualizaciones: scripts/stamp-sw.js reemplaza __PT_SW_VERSION__ con un
  número distinto en cada `npm run build`. Al cambiar este archivo, el
  navegador instala el nuevo, que toma el control enseguida (skipWaiting
  + clients.claim) y borra las copias de la versión anterior. La recarga
  de la página la decide src/serviceWorkerRegistration.js.
*/

const VERSION = "__PT_SW_VERSION__";
const STATIC_CACHE = `pt-static-${VERSION}`;
const PAGE_CACHE = `pt-page-${VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Deja guardado lo mínimo para abrir sin conexión: la página y los
  // archivos principales de esta versión. Si falla (sin red), se instala
  // igual y se irán guardando con el uso.
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/asset-manifest.json", { cache: "no-store" });
        const { entrypoints = [] } = await res.json();
        const cache = await caches.open(STATIC_CACHE);
        await cache.addAll(entrypoints.map((path) => `/${path}`));
        const page = await caches.open(PAGE_CACHE);
        await page.add(new Request("/", { cache: "reload" }));
      } catch {
        // sin red: nada que guardar por ahora
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("pt-") && key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put("/", copy));
          }
          return res;
        } catch (err) {
          const cached = await caches.match("/", { cacheName: PAGE_CACHE });
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })()
    );
  }
});

// ---------------------------------------------------------------------------
// Punto 97: notificaciones push (Firebase Cloud Messaging)
//
// La Cloud Function manda solo datos (sin "notification"), con el texto ya
// armado y traducido: { title, body, chatId, senderUid, unread }. FCM los entrega
// como { data: {...}, from, fcmMessageId, ... }.
//
// Cada push SIEMPRE muestra una notificación, aunque los datos no se
// puedan leer (texto genérico): iPhone quita el permiso si llegan avisos
// que no se muestran. Por eso decidir "no avisar" (chat abierto, bloqueo)
// es trabajo de la función, nunca de este archivo.
// ---------------------------------------------------------------------------

function genericNotification() {
  const english = /^en\b/i.test(self.navigator.language || "");
  return {
    title: "Pridethink",
    body: english ? "You have a new message" : "Tienes un mensaje nuevo",
  };
}

function readPushData(event) {
  try {
    const json = event.data ? event.data.json() : null;
    const data = (json && (json.data || json)) || {};
    return typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

// Punto 98: número sobre el ícono (Badging API) con los mensajes sin leer
// de quien recibe. La función lo manda como texto en data.unread; si no
// viene, el número queda como está. Sin soporte (Android), no hace nada.
async function updateBadgeFromPush(data) {
  const unread = Number.parseInt(data.unread, 10);
  if (!Number.isFinite(unread) || unread < 0) return;
  try {
    const nav = self.navigator;
    if (unread > 0) {
      if (typeof nav.setAppBadge === "function") await nav.setAppBadge(unread);
    } else if (typeof nav.clearAppBadge === "function") {
      await nav.clearAppBadge();
    }
  } catch {
    // el número es solo una comodidad: la notificación sale igual
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const data = readPushData(event);
      await updateBadgeFromPush(data);
      const fallback = genericNotification();
      const title = typeof data.title === "string" && data.title ? data.title : fallback.title;
      const body = typeof data.body === "string" && data.body ? data.body : fallback.body;
      const senderUid = typeof data.senderUid === "string" ? data.senderUid : "";
      try {
        await self.registration.showNotification(title, {
          body,
          icon: "/logo192.png",
          // Varios mensajes del mismo chat se reemplazan en vez de
          // acumularse; renotify hace que cada uno vuelva a sonar.
          tag: typeof data.chatId === "string" && data.chatId ? `chat-${data.chatId}` : "pt-message",
          renotify: true,
          vibrate: [120, 60, 120],
          data: { senderUid },
        });
      } catch {
        // Opciones que este navegador no acepta: la versión mínima.
        await self.registration.showNotification(fallback.title, { body: fallback.body });
      }
    })()
  );
});

// Al tocarla: si la app ya está abierta, se trae al frente y se le pide que
// abra ese chat (App.js escucha el mensaje "pt-open-chat"); si no, se abre
// en /?chat=<uid>, que App.js lee al arrancar.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const senderUid = (event.notification.data && event.notification.data.senderUid) || "";
  const url = senderUid ? `/?chat=${encodeURIComponent(senderUid)}` : "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        if (senderUid) client.postMessage({ type: "pt-open-chat", uid: senderUid });
        try {
          await client.focus();
          return;
        } catch {
          // algunos navegadores no dejan enfocar: se abre una ventana
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
