import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { translations, translate, DEFAULT_LANGUAGE } from "./translations";

/*
  LanguageContext
  ---------------
  Idioma de la interfaz (ES/EN), disponible en toda la app con
  useLanguage() -> { language, setLanguage, t }.

  De dónde sale el idioma:
  - Sin sesión iniciada (pantallas de login/registro): de localStorage, o
    si nunca se guardó nada, del idioma del navegador (detectBrowserLanguage).
  - Con sesión iniciada: del campo "language" de tu documento en Firestore
    (users/{uid}), escuchado en tiempo real con onSnapshot — si lo cambias
    desde otra pestaña o dispositivo, esta también se actualiza sola.

  setLanguage(lang) actualiza el estado (repinta la UI al instante, sin
  recargar), guarda la preferencia en localStorage (para la próxima vez que
  no haya sesión) y, si hay sesión, también escribe el campo "language" en
  Firestore con merge:true.
*/

const LANGUAGE_STORAGE_KEY = "pridethink-language";

function detectBrowserLanguage() {
  const nav =
    (typeof navigator !== "undefined" &&
      (navigator.language || (navigator.languages && navigator.languages[0]))) ||
    "";
  return nav.toLowerCase().startsWith("en") ? "en" : DEFAULT_LANGUAGE;
}

function isSupportedLanguage(lang) {
  return Object.prototype.hasOwnProperty.call(translations, lang);
}

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(saved) ? saved : detectBrowserLanguage();
  });
  const [uid, setUid] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setUid(user ? user.uid : null));
    return unsub;
  }, []);

  // Con sesión iniciada, el campo "language" de Firestore manda (en tiempo
  // real). También se refleja en localStorage para que, si cierras sesión,
  // las pantallas de login/registro recuerden el último idioma usado.
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      const lang = snap.data()?.language;
      if (isSupportedLanguage(lang)) {
        setLanguageState(lang);
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      }
    });
    return unsub;
  }, [uid]);

  const setLanguage = useCallback(
    async (lang) => {
      if (!isSupportedLanguage(lang)) return;
      setLanguageState(lang);
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      if (uid) {
        await setDoc(doc(db, "users", uid), { language: lang }, { merge: true });
      }
    },
    [uid]
  );

  const t = useCallback((key, vars) => translate(language, key, vars), [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
