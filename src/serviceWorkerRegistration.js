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

/*
  Qué versión está corriendo (punto 102, para diagnosticar; se ve al final
  de Perfil). Devuelve { page, worker }:
  - page: el código que de verdad está en pantalla = el hash del archivo
    principal (main.XXXXXXXX.js), que se puede comparar con el publicado
    (asset-manifest.json). null con `npm start`.
  - worker: la versión del service worker (scripts/stamp-sw.js). Si es más
    nueva que la página, la actualización ya bajó y se aplica al salir de
    la app. null si no hay service worker o no contesta en 2 s.
*/
export async function getAppVersion() {
  const script = document.querySelector('script[src*="/static/js/main."]');
  const match = script && script.getAttribute("src").match(/main\.([0-9a-f]+)\.js/);
  const page = match ? match[1] : null;

  let worker = null;
  const controller = "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
  if (controller) {
    worker = await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 2000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve((event.data && event.data.version) || null);
      };
      try {
        controller.postMessage({ type: "PT_GET_VERSION" }, [channel.port2]);
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }
  return { page, worker };
}

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
