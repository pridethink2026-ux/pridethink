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

// "Volver al inicio" sin una app que lo resuelva (la protección de Root):
// borra la marca de recarga y abre la app de cero en "/", que siempre
// empieza en el Muro (App.js). Así nunca se queda atrapada en el error.
export function goHomeHard() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // sin sessionStorage: nada que borrar
  }
  window.location.replace("/");
}

/*
  Atrapa lo que falle al cargar o dibujar lo que tiene adentro (un archivo
  que no bajó, o un error de la pantalla) y muestra un aviso con
  "Recargar" y "Volver al inicio" en vez de dejar la página en blanco.

  Props opcionales:
  - onHome(): qué hace "Volver al inicio" (App.js: ir al Muro sin
    recargar). Sin onHome, recarga la app de cero en el Muro (goHomeHard).
  - onError(err): en vez del aviso no dibuja nada y avisa a quien la usa
    (App.js la usa en el visor de Momentos: lo cierra y muestra un aviso).
*/
export class LoadErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error: error || new Error("unknown") };
  }

  componentDidCatch(err) {
    console.error("LoadErrorBoundary:", err);
    this.props.onError?.(err);
  }

  goHome = () => {
    if (this.props.onHome) {
      this.setState({ error: null });
      this.props.onHome();
    } else {
      goHomeHard();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.onError) return null;
    return <LoadErrorMessage error={this.state.error} onHome={this.goHome} />;
  }
}

function LoadErrorMessage({ error, onHome }) {
  const { t } = useLanguage();
  const detail = String(error?.message || error || "").slice(0, 200);
  return (
    <div role="alert" style={styles.box}>
      <p style={styles.text}>{t("common.loadFailed")}</p>
      <div style={styles.row}>
        <button type="button" className="pt-relief" style={styles.button} onClick={onHome}>
          {t("common.goHome")}
        </button>
        <button type="button" style={styles.secondary} onClick={() => window.location.reload()}>
          {t("common.reload")}
        </button>
      </div>
      {/* El detalle técnico, chico: sirve para saber qué falló. */}
      {detail && <p style={styles.detail}>{detail}</p>}
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
    background: "var(--gradient-primary)",
    boxShadow: "var(--button-shine)",
    color: "var(--on-primary)",
    fontFamily: "inherit",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "10px",
  },
  secondary: {
    padding: "11px 24px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
  },
  detail: {
    margin: 0,
    maxWidth: "100%",
    fontSize: "11px",
    color: "var(--text-muted)",
    opacity: 0.7,
    overflowWrap: "anywhere",
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
