/*
  appBadge.js
  -----------
  Punto 98: número sobre el ícono de la app instalada (Badging API) con los
  mensajes sin leer, el mismo número del globito del botón Chat (punto 92).

  - iPhone (iOS 16.4+, app instalada, con permiso de notificaciones): se ve
    el número.
  - Android: Chrome no tiene esta API; el sistema pone su propio punto en
    el ícono mientras haya notificaciones sin abrir.
  - PC (Chrome/Edge con la app instalada): barra de tareas o Dock.

  Si el navegador no la soporta o la rechaza, no pasa nada. Con la app
  cerrada, el número lo pone public/service-worker.js al llegar un push.
*/

export function setAppBadge(count) {
  try {
    const nav = window.navigator;
    if (count > 0) {
      if (typeof nav.setAppBadge === "function") nav.setAppBadge(count).catch(() => {});
    } else if (typeof nav.clearAppBadge === "function") {
      nav.clearAppBadge().catch(() => {});
    }
  } catch {
    // API ausente o bloqueada: el número es solo una comodidad
  }
}
