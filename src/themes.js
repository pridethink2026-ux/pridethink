/*
  themes.js
  ---------
  Sistema de temas visuales de Pridethink. Cada tema define un set de
  variables CSS (colores) que se aplican en :root (document.documentElement).
  El resto de la app (App.js, AuthProfile.jsx, Chat.jsx, Feed.jsx,
  Notifications.jsx) usa var(--nombre) en vez de valores hex fijos, así que
  cambiar de tema repinta toda la app al instante sin recargar.
*/

// Tipografía de marca: se aplica siempre, sin importar el tema de colores
// activo. "display" es para títulos de sección y el logo (con personalidad),
// "body" es para texto normal (legible). Ver public/index.html para los
// <link> de Google Fonts que cargan estas familias.
const FONT_VARS = {
  "--font-display": "'Sora', 'Space Grotesk', -apple-system, sans-serif",
  "--font-body":
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export const THEMES = {
  noche: {
    label: "Noche Violeta",
    emoji: "🌙",
    vars: {
      "--bg": "#150b33",
      "--surface": "#2a1a5c",
      "--surface-alt": "#35216e",
      "--accent": "#9b6bff",
      "--accent2": "#ff5fae",
      "--text": "#f5f3ff",
      "--text-muted": "#b8adf0",
      "--border": "rgba(155, 107, 255, 0.25)",
      "--accent2-soft": "rgba(255, 95, 174, 0.15)",
      "--accent2-softer": "rgba(255, 95, 174, 0.12)",
      "--accent2-soft-border": "rgba(255, 95, 174, 0.4)",
      "--accent-soft": "rgba(155, 107, 255, 0.15)",
      "--accent-softer": "rgba(155, 107, 255, 0.12)",
      "--accent-soft-border": "rgba(155, 107, 255, 0.4)",
    },
  },
  arcoiris: {
    label: "Arcoíris",
    emoji: "🌈",
    vars: {
      "--bg": "#150c28",
      "--surface": "#271849",
      "--surface-alt": "#322259",
      "--accent": "#ffc93c",
      "--accent2": "#ff5c76",
      "--text": "#fdf4ff",
      "--text-muted": "#c9b8e8",
      "--border": "rgba(255, 201, 60, 0.25)",
      "--accent2-soft": "rgba(255, 92, 118, 0.15)",
      "--accent2-softer": "rgba(255, 92, 118, 0.12)",
      "--accent2-soft-border": "rgba(255, 92, 118, 0.4)",
      "--accent-soft": "rgba(255, 201, 60, 0.15)",
      "--accent-softer": "rgba(255, 201, 60, 0.12)",
      "--accent-soft-border": "rgba(255, 201, 60, 0.4)",
    },
  },
  oceano: {
    label: "Océano",
    emoji: "🌊",
    vars: {
      "--bg": "#051829",
      "--surface": "#0b2c4c",
      "--surface-alt": "#114069",
      "--accent": "#13ecd1",
      "--accent2": "#33c2ff",
      "--text": "#e6f6ff",
      "--text-muted": "#8db8d8",
      "--border": "rgba(19, 236, 209, 0.25)",
      "--accent2-soft": "rgba(51, 194, 255, 0.15)",
      "--accent2-softer": "rgba(51, 194, 255, 0.12)",
      "--accent2-soft-border": "rgba(51, 194, 255, 0.4)",
      "--accent-soft": "rgba(19, 236, 209, 0.15)",
      "--accent-softer": "rgba(19, 236, 209, 0.12)",
      "--accent-soft-border": "rgba(19, 236, 209, 0.4)",
    },
  },
  atardecer: {
    label: "Atardecer",
    emoji: "🌅",
    vars: {
      "--bg": "#240e0a",
      "--surface": "#431b14",
      "--surface-alt": "#58261d",
      "--accent": "#ff9742",
      "--accent2": "#ff3355",
      "--text": "#fff1e6",
      "--text-muted": "#e0a98d",
      "--border": "rgba(255, 151, 66, 0.25)",
      "--accent2-soft": "rgba(255, 51, 85, 0.15)",
      "--accent2-softer": "rgba(255, 51, 85, 0.12)",
      "--accent2-soft-border": "rgba(255, 51, 85, 0.4)",
      "--accent-soft": "rgba(255, 151, 66, 0.15)",
      "--accent-softer": "rgba(255, 151, 66, 0.12)",
      "--accent-soft-border": "rgba(255, 151, 66, 0.4)",
    },
  },
};

export const ROTATIVO_KEY = "rotativo";
const STORAGE_KEY = "pridethink-theme";

export function getThemeKeys() {
  return Object.keys(THEMES);
}

// Elige un tema distinto cada día del año, en un ciclo fijo entre los 4 temas.
export function getRotativeThemeKey() {
  const keys = getThemeKeys();
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  return keys[dayOfYear % keys.length];
}

// Aplica un tema (o resuelve "rotativo" al tema del día) seteando las
// variables CSS en document.documentElement, disponibles para toda la app.
export function applyTheme(key) {
  const resolvedKey = key === ROTATIVO_KEY ? getRotativeThemeKey() : key;
  const theme = THEMES[resolvedKey] || THEMES.noche;
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
  Object.entries(FONT_VARS).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
}

export function saveThemePreference(key) {
  localStorage.setItem(STORAGE_KEY, key);
}

export function loadThemePreference() {
  return localStorage.getItem(STORAGE_KEY) || "noche";
}

// Carga la preferencia guardada (o "noche" por defecto) y la aplica.
// Devuelve la clave cargada para que la UI sepa qué mostrar como seleccionado.
export function initTheme() {
  const pref = loadThemePreference();
  applyTheme(pref);
  return pref;
}
