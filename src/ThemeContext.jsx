import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  applyTheme,
  clearThemePreference,
  DEFAULT_THEME_KEY,
  isThemeKey,
  loadThemePreference,
  saveThemePreference,
} from "./themes";

/*
  ThemeContext
  ------------
  Tema visual activo, disponible en toda la app con
  useTheme() -> { themeKey, setTheme }. `themeKey` es la clave elegida
  ("noche", "oceano"… o "rotativo"), no el tema resuelto del día.

  Primer pintado (punto 68): index.js llama a initTheme() (themes.js)
  ANTES de root.render, así la primera pantalla ya sale con los colores y
  las fuentes del tema. Antes se aplicaba en un useEffect de ThemeMenu
  (App.js), después del primer pintado: todo cambiaba de color y de
  fuente de golpe (CLS y decenas de transiciones al cargar).

  Tema por cuenta (punto 69): el que manda es el campo "theme" de
  users/{uid}/private/data, escuchado en tiempo real (mismo patrón que
  LanguageContext.jsx), así un cambio en otra pestaña o dispositivo llega
  solo. localStorage es solo la caché para el primer pintado:
    - con sesión, se pisa con el valor de la cuenta cada vez que llega;
    - una cuenta sin "theme" guardado usa "noche" y no escribe nada hasta
      que la persona elija uno (no hereda el tema de otra cuenta del mismo
      navegador). Solo se decide con la respuesta del servidor: un "no
      tiene tema" que sale de la caché de Firestore (sin red) se ignora;
    - sin sesión (al cerrarla, o si se vence), se borra y se vuelve a
      "noche", así la próxima cuenta no ve el tema de la anterior ni en la
      pantalla de carga. La entrada usa su paleta fija igual
      (ENTRY_THEME_VARS).

  setTheme(key) lo aplica al instante con el fundido de tema (la clase
  .pt-theme-transition en <html>, solo mientras dura el cambio), lo guarda
  en la caché y lo escribe en private/data con merge:true. Si la escritura
  falla, el tema vale igual en este dispositivo.
*/

const ThemeContext = createContext({
  themeKey: DEFAULT_THEME_KEY,
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState(loadThemePreference);
  const [uid, setUid] = useState(null);
  // El tema que se ve ahora, para compararlo desde los listeners.
  const shownRef = useRef(themeKey);

  const show = useCallback((key, animate) => {
    if (key === shownRef.current) return;
    shownRef.current = key;
    setThemeKey(key);
    applyTheme(key, { animate });
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user ? user.uid : null);
      if (!user) {
        clearThemePreference();
        show(DEFAULT_THEME_KEY, false);
      }
    });
  }, [show]);

  useEffect(() => {
    if (!uid) return;
    // El primer valor de cada cuenta se aplica sin fundido (es la carga);
    // los siguientes (otra pestaña u otro dispositivo), con fundido.
    let first = true;
    return onSnapshot(
      doc(db, "users", uid, "private", "data"),
      (snap) => {
        const saved = snap.data()?.theme;
        let key;
        if (isThemeKey(saved)) key = saved;
        else if (!snap.metadata.fromCache) key = DEFAULT_THEME_KEY;
        else return;
        saveThemePreference(key);
        show(key, !first);
        first = false;
      },
      (err) => {
        console.error("ThemeContext: no se pudo leer el tema", err.code, err);
      }
    );
  }, [uid, show]);

  const setTheme = useCallback(
    (key) => {
      if (!isThemeKey(key)) return;
      show(key, true);
      saveThemePreference(key);
      if (uid) {
        setDoc(doc(db, "users", uid, "private", "data"), { theme: key }, { merge: true }).catch((err) => {
          console.error("ThemeContext: no se pudo guardar el tema", err.code, err);
        });
      }
    },
    [uid, show]
  );

  return <ThemeContext.Provider value={{ themeKey, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
