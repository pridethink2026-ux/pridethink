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
    labelKey: "theme.noche",
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
    gradientPrimary: "linear-gradient(135deg, #8d57ff, #ff4ba4)",
    glowColor: "rgba(155, 107, 255, 0.35)",
    glassBg: "rgba(42, 26, 92, 0.55)",
    borderGlow: "rgba(255, 95, 174, 0.4)",
  },
  arcoiris: {
    labelKey: "theme.arcoiris",
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
    gradientPrimary: "linear-gradient(135deg, #ffc328, #ff4865)",
    glowColor: "rgba(255, 201, 60, 0.35)",
    glassBg: "rgba(39, 24, 73, 0.55)",
    borderGlow: "rgba(255, 92, 118, 0.4)",
  },
  oceano: {
    labelKey: "theme.oceano",
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
    gradientPrimary: "linear-gradient(135deg, #03e7cb, #1fbcff)",
    glowColor: "rgba(19, 236, 209, 0.35)",
    glassBg: "rgba(11, 44, 76, 0.55)",
    borderGlow: "rgba(51, 194, 255, 0.4)",
  },
  atardecer: {
    labelKey: "theme.atardecer",
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
    gradientPrimary: "linear-gradient(135deg, #ff8c2e, #ff1f44)",
    glowColor: "rgba(255, 151, 66, 0.35)",
    glassBg: "rgba(67, 27, 20, 0.55)",
    borderGlow: "rgba(255, 51, 85, 0.4)",
  },
  // "--bg"/"--surface" se mantienen sólidos a propósito (no el degradado
  // tipo laca 0a0a0a→1c1c1c que se pidió originalmente): varios componentes
  // compartidos los usan como "color" de texto (color: var(--bg), p.ej. el
  // banner motivacional en App.js) o como "border: Npx solid var(--surface)"
  // (el punto verde de "en línea" en Avatar.jsx) — un degradado ahí es CSS
  // inválido y rompería esos elementos en TODOS los temas, no solo este. El
  // brillo nacarado sí se logra: "--accent"/"--accent2" alimentan el mismo
  // linear-gradient(135deg, var(--accent), var(--accent2)) que ya usan el
  // anillo del avatar (Avatar.jsx) y los botones/badges principales
  // (App.js), así que con blanco marfil → plata ese degradado compartido ya
  // sale con sheen de perla, sin tocar ningún componente.
  elegante: {
    labelKey: "theme.elegante",
    emoji: "🤵",
    vars: {
      "--bg": "#121212",
      "--surface": "#1c1c1c",
      "--surface-alt": "#242424",
      "--accent": "#f5f3ec",
      "--accent2": "#c9c6bc",
      "--text": "#f5f3ec",
      "--text-muted": "#a9a69c",
      "--border": "rgba(255, 255, 255, 0.15)",
      "--accent2-soft": "rgba(201, 198, 188, 0.15)",
      "--accent2-softer": "rgba(201, 198, 188, 0.12)",
      "--accent2-soft-border": "rgba(201, 198, 188, 0.4)",
      "--accent-soft": "rgba(245, 243, 236, 0.15)",
      "--accent-softer": "rgba(245, 243, 236, 0.12)",
      "--accent-soft-border": "rgba(245, 243, 236, 0.4)",
    },
    gradientPrimary: "linear-gradient(135deg, #f1ecdc, #c8c1a8)",
    glowColor: "rgba(245, 243, 236, 0.35)",
    glassBg: "rgba(28, 28, 28, 0.55)",
    borderGlow: "rgba(201, 198, 188, 0.4)",
  },
};

// Paleta fija de marca para la pantalla de entrada (AuthScreen.jsx, punto
// 68, commit 7): la entrada tiene su propio estilo, siempre el mismo, sin
// importar el tema que cada persona eligió dentro de la app. Mismas
// variables que un tema; AuthScreen las pone en su contenedor, así que
// solo valen ahí adentro y el resto de la app sigue con el tema elegido.
// Hoy los valores coinciden con "noche" (morado y rosa, los del logo),
// pero son una copia aparte a propósito: cambiar "noche" no cambia la
// entrada.
export const ENTRY_THEME_VARS = {
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
};

// Colores del texto que se escribe sobre la foto de un Momento (punto 66,
// MomentTextEditor.jsx). Fijos a propósito, no del tema: el texto queda
// "quemado" en la imagen con canvas (que no entiende var(--...)) y tiene
// que verse igual para quien lo mire, con cualquier tema. Blanco, negro y
// los colores de la bandera arcoíris y de la trans. "outline" es el
// contorno que lo hace legible sobre cualquier foto (oscuro para colores
// claros, claro para colores oscuros).
export const MOMENT_TEXT_COLORS = [
  { key: "white", value: "#ffffff", outline: "rgba(0,0,0,0.75)" },
  { key: "black", value: "#111111", outline: "rgba(255,255,255,0.8)" },
  { key: "red", value: "#e40303", outline: "rgba(255,255,255,0.8)" },
  { key: "orange", value: "#ff8c00", outline: "rgba(0,0,0,0.75)" },
  { key: "yellow", value: "#ffed00", outline: "rgba(0,0,0,0.75)" },
  { key: "green", value: "#008026", outline: "rgba(255,255,255,0.8)" },
  { key: "blue", value: "#004dff", outline: "rgba(255,255,255,0.8)" },
  { key: "violet", value: "#750787", outline: "rgba(255,255,255,0.8)" },
  { key: "pink", value: "#f5a9b8", outline: "rgba(0,0,0,0.75)" },
  { key: "lightBlue", value: "#5bcefa", outline: "rgba(0,0,0,0.75)" },
];

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

// Duración del fundido al cambiar de tema: la de las transiciones de
// .pt-theme-transition en index.css, con un poco de margen.
const THEME_TRANSITION_MS = 400;
let transitionTimer = null;

// Aplica un tema (o resuelve "rotativo" al tema del día) seteando las
// variables CSS en document.documentElement, disponibles para toda la app.
// Con `animate`, los colores cambian con un fundido: la clase
// .pt-theme-transition (index.css) activa las transiciones en todos los
// elementos solo mientras dura el cambio. Sin ella no hay transiciones
// globales, así que el primer pintado (initTheme) y el resto del uso de
// la app no animan nada de más.
export function applyTheme(key, { animate = false } = {}) {
  const resolvedKey = key === ROTATIVO_KEY ? getRotativeThemeKey() : key;
  const theme = THEMES[resolvedKey] || THEMES.noche;
  const root = document.documentElement;
  if (animate) {
    root.classList.add("pt-theme-transition");
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => root.classList.remove("pt-theme-transition"), THEME_TRANSITION_MS);
  }
  Object.entries(theme.vars).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
  Object.entries(FONT_VARS).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
}

// localStorage puede no estar disponible (ventana privada, datos del
// sitio bloqueados): en ese caso no se guarda y se usa "noche".
export function saveThemePreference(key) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // sin caché local: el tema vale solo para esta visita
  }
}

export function loadThemePreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "noche";
  } catch {
    return "noche";
  }
}

// Carga la preferencia guardada (o "noche" por defecto) y la aplica, sin
// fundido. La llama index.js antes del primer render (ver ThemeContext.jsx).
// Devuelve la clave cargada.
export function initTheme() {
  const pref = loadThemePreference();
  applyTheme(pref);
  return pref;
}
