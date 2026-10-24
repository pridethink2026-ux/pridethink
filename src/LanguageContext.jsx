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
  - Con sesión iniciada: del campo "language" de tu documento privado en
    Firestore (users/{uid}/private/data, hallazgo H1), escuchado en tiempo real con onSnapshot — si lo cambias
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
  //
  // Hallazgo H1: "language" vive en users/{uid}/private/data. Mientras dure
  // la migración, si ahí todavía no está, se usa el valor viejo del
  // documento público (se escuchan los dos; lo privado manda).
  useEffect(() => {
    if (!uid) return;
    let privateLang;
    let publicLang;
    const apply = () => {
      const lang = privateLang ?? publicLang;
      if (isSupportedLanguage(lang)) {
        setLanguageState(lang);
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      }
    };
    const unsubPrivate = onSnapshot(doc(db, "users", uid, "private", "data"), (snap) => {
      privateLang = snap.data()?.language;
      apply();
    });
    const unsubPublic = onSnapshot(doc(db, "users", uid), (snap) => {
      publicLang = snap.data()?.language;
      apply();
    });
    return () => {
      unsubPrivate();
      unsubPublic();
    };
  }, [uid]);

  const setLanguage = useCallback(
    async (lang) => {
      if (!isSupportedLanguage(lang)) return;
      setLanguageState(lang);
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      if (uid) {
        await setDoc(doc(db, "users", uid, "private", "data"), { language: lang }, { merge: true });
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
