import React, { createContext, useCallback, useContext, useState } from "react";
import { applyTheme, loadThemePreference, saveThemePreference } from "./themes";

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

  setTheme(key) lo aplica con el fundido de tema (la clase
  .pt-theme-transition en <html>, solo mientras dura el cambio) y lo
  guarda en localStorage.

  Pensado para la próxima tarea, guardar el tema por cuenta: con sesión,
  este provider escuchará el campo "theme" de users/{uid}/private/data
  (mismo patrón que LanguageContext.jsx) y setTheme también lo escribirá
  ahí. localStorage quedará solo como caché para el primer pintado, y
  ningún componente tendrá que cambiar: todos pasan por useTheme().
*/

const ThemeContext = createContext({
  themeKey: "noche",
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState(loadThemePreference);

  const setTheme = useCallback((key) => {
    setThemeKey(key);
    saveThemePreference(key);
    applyTheme(key, { animate: true });
  }, []);

  return <ThemeContext.Provider value={{ themeKey, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
