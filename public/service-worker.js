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
