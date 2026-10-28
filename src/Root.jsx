import React, { useState, useEffect, Suspense } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import AuthScreen from "./AuthScreen";
import { useLanguage } from "./LanguageContext";
import { lazyWithReload, LoadErrorBoundary } from "./lazyLoad";

// La app con sesión baja aparte (punto 68, commit 8): la pantalla de
// entrada no la necesita.
const LoggedInApp = lazyWithReload(() => import(/* webpackChunkName: "app" */ "./LoggedInApp"));

/*
  Root
  ----
  Decide qué se muestra (punto 68, commit 7):
    - sin saber todavía si hay sesión -> pantalla de carga (solo el logo);
    - sin sesión, o con sesión pero sin perfil (users/{uid} no existe:
      registro a medias) -> la pantalla de entrada (AuthScreen.jsx) sola,
      sin la barra, las pestañas ni las conexiones de la app;
    - con sesión y perfil -> la app con sus proveedores (usuarios,
      bloqueos, momentos, sonidos), que solo tienen sentido con sesión
      (LoggedInApp.jsx, cargada diferida; mientras baja, la misma
      pantalla de carga).
  Tema e idioma quedan por fuera (index.js): la entrada también los usa.

  Si a los LOADING_TIMEOUT_MS todavía no se sabe (sin red no llega la
  respuesta del servidor sobre el perfil), la pantalla de carga muestra
  "No pudimos conectar" + Reintentar, que vuelve a abrir la lectura. Si la
  respuesta llega sola mientras tanto, se sigue normalmente.

  La pantalla de carga usa el tema guardado (no la paleta de la entrada):
  la ve sobre todo quien ya tiene sesión, justo antes de su app.
*/

const LOADING_TIMEOUT_MS = 10000;

export default function Root() {
  // undefined = todavía no se sabe; null = sin sesión.
  const [authUser, setAuthUser] = useState(undefined);
  // undefined = todavía no se sabe; true/false = users/{uid} existe o no.
  const [hasProfile, setHasProfile] = useState(undefined);
  // Si en esta visita ya se mostró la pantalla de entrada, mientras se
  // averigua el perfil después de entrar o de crear la cuenta se la sigue
  // mostrando (si se cambiara por la de carga, se desmontaría y el
  // registro perdería los datos de los pasos anteriores).
  const [sawLoggedOut, setSawLoggedOut] = useState(false);
  // Cada Reintentar lo incrementa: vuelve a abrir la lectura del perfil y
  // a contar el tiempo límite.
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      if (!u) setSawLoggedOut(true);
    });
  }, []);

  const uid = authUser?.uid;

  useEffect(() => {
    setHasProfile(undefined);
    if (!uid) return;
    // includeMetadataChanges: un "no existe" que sale de la caché local
    // (sin red) no alcanza para mandar a alguien al paso de identidad —
    // se espera la respuesta del servidor, que llega aunque no cambien los
    // datos.
    return onSnapshot(
      doc(db, "users", uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.exists() && snap.metadata.fromCache) return;
        setHasProfile(snap.exists());
      },
      (err) => {
        // Queda en la pantalla de carga: no se asume "sin perfil", eso
        // llevaría a alguien con perfil al paso de identidad.
        console.error("Root: no se pudo leer el perfil", err.code, err);
      }
    );
  }, [uid, attempt]);

  // Con sesión, la app empieza a bajar ya, en paralelo con la lectura del
  // perfil (si falla, el error se maneja cuando LoggedInApp la pide).
  useEffect(() => {
    if (uid) import(/* webpackChunkName: "app" */ "./LoggedInApp").catch(() => {});
  }, [uid]);

  const checkingProfile = !!uid && hasProfile === undefined;
  const showLoading = authUser === undefined || (checkingProfile && !sawLoggedOut);

  useEffect(() => {
    setTimedOut(false);
    if (!showLoading) return;
    const timer = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [showLoading, attempt]);

  if (showLoading) {
    return <LoadingScreen timedOut={timedOut} onRetry={() => setAttempt((n) => n + 1)} />;
  }

  if (!uid || !hasProfile) {
    return <AuthScreen needsIdentity={!!uid && hasProfile === false} />;
  }

  return (
    <LoadErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <LoggedInApp />
      </Suspense>
    </LoadErrorBoundary>
  );
}

function LoadingScreen({ timedOut, onRetry }) {
  const { t } = useLanguage();
  return (
    <div style={loadingStyles.page} aria-busy={!timedOut}>
      <img src="/logo-icon.webp" alt="Pridethink" width="72" height="72" style={loadingStyles.logo} />
      {timedOut && (
        <div role="alert" style={loadingStyles.failBox}>
          <p style={loadingStyles.failText}>{t("common.connectFailed")}</p>
          <button type="button" className="pt-relief" style={loadingStyles.retryBtn} onClick={onRetry}>
            {t("common.retry")}
          </button>
        </div>
      )}
    </div>
  );
}

const loadingStyles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    padding: "24px",
    boxSizing: "border-box",
    background: "var(--bg)",
    fontFamily: "var(--font-body)",
    color: "var(--text)",
  },
  logo: {
    width: "72px",
    height: "72px",
    borderRadius: "18px",
  },
  failBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  failText: {
    margin: 0,
    fontSize: "15px",
    color: "var(--text-muted)",
  },
  retryBtn: {
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
};
