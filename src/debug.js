/*
  debug.js
  --------
  Modo diagnóstico: true solo si la URL trae ?debug=1 (por ejemplo
  http://localhost:3000/?debug=1). Se lee una vez al cargar la página.
  Sin ese parámetro todo lo que cuelga de DEBUG queda apagado y la app se
  comporta exactamente igual que siempre. Hoy lo usa el visor de Momentos
  (MomentDebugPanel.jsx) para diagnosticar fallas que solo pasan en iPhone.
*/

export const DEBUG = (() => {
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
})();
