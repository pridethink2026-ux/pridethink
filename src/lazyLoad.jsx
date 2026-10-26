import React, { lazy } from "react";
import { useLanguage } from "./LanguageContext";

/*
  lazyLoad
  --------
  Carga diferida de pantallas (punto 68, commit 8): cada pantalla cargada
  con lazyWithReload queda en su propio archivo de JavaScript y se baja
  recién cuando se abre.

  ChunkLoadError: cada despliegue en Vercel cambia los nombres de esos
  archivos (llevan un hash) y los viejos dejan de existir. Quien tenía la
  app abierta desde antes pide un archivo que ya no está y la carga falla.
  En ese caso se recarga la página UNA vez (con el index.html nuevo, que
  apunta a los archivos nuevos). La marca en sessionStorage evita recargar
  en bucle si el error sigue (por ejemplo, sin red): la segunda vez el
  error sigue de largo hasta LoadErrorBoundary, que ofrece "Recargar". La
  marca se borra con la primera carga que sale bien, así el próximo
  despliegue vuelve a tener su recarga. Sin sessionStorage (ventana
  privada, datos bloqueados) no se recarga sola: no habría cómo cortar un
  bucle.
*/

const RELOAD_FLAG = "pt-chunk-reload";

function isChunkLoadError(err) {
  return (
    err?.name === "ChunkLoadError" ||
    /Loading (CSS )?chunk [\w-]+ failed/i.test(err?.message || "")
  );
}

export function lazyWithReload(factory) {
  return lazy(() =>
    factory().then(
      (mod) => {
        try {
          sessionStorage.removeItem(RELOAD_FLAG);
        } catch {
          // sin sessionStorage: nada que borrar
        }
        return mod;
      },
      (err) => {
        if (isChunkLoadError(err)) {
          let alreadyReloaded = true;
          try {
            alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1";
            if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, "1");
          } catch {
            // sin sessionStorage: no se recarga sola (ver arriba)
          }
          if (!alreadyReloaded) {
            window.location.reload();
            // Nunca se resuelve: la página se está recargando.
            return new Promise(() => {});
          }
        }
        throw err;
      }
    )
  );
}

// Atrapa lo que falle al cargar o dibujar lo que tiene adentro (un archivo
// que no bajó, o un error de la pantalla) y muestra un aviso con
// "Recargar" en vez de dejar la página en blanco.
export class LoadErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err) {
    console.error("LoadErrorBoundary:", err);
  }

  render() {
    return this.state.failed ? <LoadErrorMessage /> : this.props.children;
  }
}

function LoadErrorMessage() {
  const { t } = useLanguage();
  return (
    <div role="alert" style={styles.box}>
      <p style={styles.text}>{t("common.loadFailed")}</p>
      <button type="button" style={styles.button} onClick={() => window.location.reload()}>
        {t("common.reload")}
      </button>
    </div>
  );
}

// Lo que se ve mientras baja una pantalla: un texto discreto, sin mover el
// resto (la barra y las pestañas quedan donde están).
export function ScreenLoading() {
  const { t } = useLanguage();
  return (
    <p style={styles.loading} aria-busy="true">
      {t("common.loading")}
    </p>
  );
}

const styles = {
  box: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    padding: "48px 24px",
    fontFamily: "var(--font-body)",
    color: "var(--text)",
    textAlign: "center",
  },
  text: {
    margin: 0,
    fontSize: "15px",
    color: "var(--text-muted)",
  },
  button: {
    padding: "11px 24px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontFamily: "inherit",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
  },
  loading: {
    margin: 0,
    padding: "48px 24px",
    textAlign: "center",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    color: "var(--text-muted)",
  },
};
