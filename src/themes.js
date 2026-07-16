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
      "--bg": "#14102b",
      "--surface": "#231b47",
      "--surface-alt": "#2c2358",
      "--accent": "#a78bfa",
      "--accent2": "#f472b6",
      "--text": "#f5f3ff",
      "--text-muted": "#b8adf0",
      "--border": "rgba(167, 139, 250, 0.25)",
      "--accent2-soft": "rgba(244, 114, 182, 0.15)",
      "--accent2-softer": "rgba(244, 114, 182, 0.12)",
      "--accent2-soft-border": "rgba(244, 114, 182, 0.4)",
      "--accent-soft": "rgba(167, 139, 250, 0.15)",
      "--accent-softer": "rgba(167, 139, 250, 0.12)",
      "--accent-soft-border": "rgba(167, 139, 250, 0.4)",
    },
  },
  arcoiris: {
    label: "Arcoíris",
    emoji: "🌈",
    vars: {
      "--bg": "#170f26",
      "--surface": "#241a3d",
      "--surface-alt": "#2e2249",
      "--accent": "#fbbf24",
      "--accent2": "#fb7185",
      "--text": "#fdf4ff",
      "--text-muted": "#c9b8e8",
      "--border": "rgba(251, 191, 36, 0.25)",
      "--accent2-soft": "rgba(251, 113, 133, 0.15)",
      "--accent2-softer": "rgba(251, 113, 133, 0.12)",
      "--accent2-soft-border": "rgba(251, 113, 133, 0.4)",
      "--accent-soft": "rgba(251, 191, 36, 0.15)",
      "--accent-softer": "rgba(251, 191, 36, 0.12)",
      "--accent-soft-border": "rgba(251, 191, 36, 0.4)",
    },
  },
  oceano: {
    label: "Océano",
    emoji: "🌊",
    vars: {
      "--bg": "#071a2c",
      "--surface": "#0f2b45",
      "--surface-alt": "#143a5c",
      "--accent": "#2dd4bf",
      "--accent2": "#38bdf8",
      "--text": "#e6f6ff",
      "--text-muted": "#8db8d8",
      "--border": "rgba(45, 212, 191, 0.25)",
      "--accent2-soft": "rgba(56, 189, 248, 0.15)",
      "--accent2-softer": "rgba(56, 189, 248, 0.12)",
      "--accent2-soft-border": "rgba(56, 189, 248, 0.4)",
      "--accent-soft": "rgba(45, 212, 191, 0.15)",
      "--accent-softer": "rgba(45, 212, 191, 0.12)",
      "--accent-soft-border": "rgba(45, 212, 191, 0.4)",
    },
  },
  atardecer: {
    label: "Atardecer",
    emoji: "🌅",
    vars: {
      "--bg": "#23120f",
      "--surface": "#3a1d17",
      "--surface-alt": "#4a2620",
      "--accent": "#fb923c",
      "--accent2": "#f43f5e",
      "--text": "#fff1e6",
      "--text-muted": "#e0a98d",
      "--border": "rgba(251, 146, 60, 0.25)",
      "--accent2-soft": "rgba(244, 63, 94, 0.15)",
      "--accent2-softer": "rgba(244, 63, 94, 0.12)",
      "--accent2-soft-border": "rgba(244, 63, 94, 0.4)",
      "--accent-soft": "rgba(251, 146, 60, 0.15)",
      "--accent-softer": "rgba(251, 146, 60, 0.12)",
      "--accent-soft-border": "rgba(251, 146, 60, 0.4)",
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
