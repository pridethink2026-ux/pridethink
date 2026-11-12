/*
  Registro del service worker (public/service-worker.js, punto 93).

  Solo en la versión publicada (npm run build): con `npm start` no se
  registra, para no ver copias viejas mientras se prueba.

  Actualizaciones que llegan solas:
  - Abrir la app desde cero siempre trae la última versión (el service
    worker pide la página a internet primero).
  - Con la app ya abierta, se busca versión nueva cada vez que vuelve a
    primer plano y cada hora. Si la hay, el service worker nuevo toma el
    control ("controllerchange") y la página se recarga recién cuando
    pasa a segundo plano, para no cortar a nadie a mitad de algo.
*/

const CHECK_EVERY_MS = 60 * 60 * 1000;

export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    // La primera instalación también dispara controllerchange (clients.claim):
    // esa no es una actualización y no recarga.
    let hadController = !!navigator.serviceWorker.controller;
    let reloadPending = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (document.visibilityState === "hidden") window.location.reload();
      else reloadPending = true;
    });

    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL}/service-worker.js`)
      .then((registration) => {
        const check = () => registration.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        setInterval(check, CHECK_EVERY_MS);
      })
      .catch(() => {
        // Sin service worker la app funciona igual, solo no es instalable.
      });

    document.addEventListener("visibilitychange", () => {
      if (reloadPending && document.visibilityState === "hidden") window.location.reload();
    });
  });
}
