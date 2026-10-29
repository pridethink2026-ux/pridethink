import { useEffect, useState } from "react";

/*
  musicLibrary
  ------------
  Biblioteca de música de los Momentos (punto 79). La fuente de verdad es
  musicLibrary.json: la ficha de cada pista (id, título y compositor en
  es/en, intérprete, ánimo, duración, archivo en public/music/, página de
  Musopen, de dónde se descargó, licencia exacta, fecha de descarga,
  archivo original y desde qué segundo se cortó). La lee también
  scripts/cut-music.js, que genera los MP3.

  Solo grabaciones de dominio público (Public Domain Mark o CC0) del
  proyecto Musopen. Nadie sube música propia.

  La ficha se baja recién cuando hace falta (créditos, selector, un
  momento con música): import() dinámico, en su propio archivo, fuera del
  bundle principal. La promesa se guarda para pedirla una sola vez; si
  falla (sin red), el próximo intento la vuelve a pedir.
*/

let libraryPromise = null;

export function loadMusicLibrary() {
  if (!libraryPromise) {
    libraryPromise = import(/* webpackChunkName: "music-library" */ "./musicLibrary.json").then(
      (mod) => mod.default,
      (err) => {
        libraryPromise = null;
        throw err;
      }
    );
  }
  return libraryPromise;
}

// { library, error, retry }: library es null mientras carga. Con
// `enabled` en false no pide nada todavía.
export function useMusicLibrary(enabled = true) {
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setError(false);
    loadMusicLibrary().then(
      (lib) => {
        if (!cancelled) setLibrary(lib);
      },
      (err) => {
        console.error("No se pudo cargar la biblioteca de música:", err);
        if (!cancelled) setError(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, enabled]);

  return { library, error, retry: () => setAttempt((n) => n + 1) };
}

// Texto en el idioma activo de un campo { es, en } de la ficha.
export const localized = (field, language) => field?.[language] || field?.es || "";
