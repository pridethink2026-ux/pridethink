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

// Variables de "efecto" (punto 71): brillo de botones, títulos, tarjetas,
// barra superior, pestaña activa y notificaciones sin leer. Un tema que no
// las define usa estos valores, que reproducen exactamente cómo se veía
// antes (el degradado de --accent a --accent2, la tarjeta de un color). Se
// aplican siempre junto con las del tema (applyTheme): si no, al salir de
// un tema que sí las define quedarían puestas las suyas.
const EFFECT_DEFAULTS = {
  "--gradient-primary": "linear-gradient(135deg, var(--accent), var(--accent2))",
  "--gradient-text": "linear-gradient(135deg, var(--accent), var(--accent2))",
  "--surface-sheen": "var(--surface)",
  "--shine": "0 0 0 0 transparent",
  "--bar-bg": "var(--bg)",
  "--unread-edge": "transparent",
  "--tab-active-bg": "var(--accent2-soft)",
  "--tab-active-text": "var(--accent2)",
  // Relieve de campos, pestañas, chip del clima,
  // botones principales y barra inferior, y el fondo con reflejos fijos
  // (body::before en index.css; las pantallas dejan ver el fondo con
  // --page-bg transparente).
  "--field-shine": "0 0 0 0 transparent",
  "--chip-shine": "0 0 0 0 transparent",
  "--button-shine": "0 0 0 0 transparent",
  "--bottom-bar-bg": "var(--surface)",
  "--bottom-bar-shine": "0 0 0 0 transparent",
  "--page-bg": "var(--bg)",
  "--page-glare": "none",
  "--button-shine-pressed": "0 0 0 0 transparent",
  "--tab-bg": "transparent",
  // Color del destello que cruza los botones .pt-relief (index.css).
  "--sweep-color": "rgba(255, 255, 255, 0.55)",
  // Texto sobre los botones con --gradient-primary (punto 73). Por defecto
  // el color del fondo, como siempre; un tema con botones claros sobre
  // fondo claro (Pinky pastel) lo cambia.
  "--on-primary": "var(--bg)",
  // Color de las sombras de los componentes, en "r, g, b" para usarlo
  // como rgba(var(--shadow-rgb), alfa). Negro por defecto; los temas
  // claros las tiñen para que no se vean grises.
  "--shadow-rgb": "0, 0, 0",
  // Botón del menú de temas (barra superior, App.js): fondo y borde
  // propios para que se distinga de la barra en todos los temas.
  "--theme-btn-bg": "var(--surface)",
  "--theme-btn-border": "var(--text-muted)",
};

// Estrellas del fondo de Noche Violeta: puntos de degradado en dos mosaicos
// de tamaños distintos (173 y 251 px) para que no se note la repetición.
const star = (x, y, size, alpha, tile) =>
  `radial-gradient(${size}px ${size}px at ${x}px ${y}px, rgba(255, 255, 255, ${alpha}), rgba(255, 255, 255, 0)) 0 0 / ${tile}px ${tile}px`;
const NOCHE_STARS = [
  star(23, 41, 1.2, 0.85, 173),
  star(97, 12, 1, 0.6, 173),
  star(141, 88, 1.4, 0.75, 173),
  star(58, 131, 1, 0.55, 173),
  star(119, 156, 1.2, 0.7, 173),
  star(37, 203, 1.6, 0.8, 251),
  star(181, 47, 1.1, 0.6, 251),
  star(219, 171, 1.3, 0.7, 251),
  star(102, 238, 1, 0.5, 251),
  star(160, 112, 0.9, 0.55, 251),
].join(", ");

// Noche Violeta (punto 72), "Noche estrellada": cielo con estrellas fijas y
// resplandor de luna (--page-glare), tarjetas de terciopelo (luz satinada
// arriba, profundidad hacia adentro), botones lila satinado en relieve (se
// hunden y llevan el destello lila claro, como el Clásico).
const NOCHE_VARS = {
  "--bg": "#0d0a24",
  "--surface": "#1f1748",
  "--surface-alt": "#2a1f5e",
  "--accent": "#b296ff",
  "--accent2": "#ff8ac4",
  "--text": "#f6f3ff",
  "--text-muted": "#c2b7ef",
  "--border": "rgba(178, 150, 255, 0.26)",
  "--accent2-soft": "rgba(255, 138, 196, 0.15)",
  "--accent2-softer": "rgba(255, 138, 196, 0.12)",
  "--accent2-soft-border": "rgba(255, 138, 196, 0.4)",
  "--accent-soft": "rgba(178, 150, 255, 0.15)",
  "--accent-softer": "rgba(178, 150, 255, 0.12)",
  "--accent-soft-border": "rgba(178, 150, 255, 0.4)",
  "--gradient-primary":
    "radial-gradient(70% 30% at 50% 8%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0) 100%), linear-gradient(180deg, #d9c9ff 0%, #b296ff 55%, #9a7cf0 100%)",
  "--gradient-text": "linear-gradient(135deg, #c4adff, #ff8ac4)",
  "--surface-sheen":
    "radial-gradient(140% 55% at 50% 0%, rgba(214, 196, 255, 0.1), rgba(214, 196, 255, 0) 70%), #1f1748",
  "--shine":
    "inset 0 1px 0 rgba(214, 196, 255, 0.22), inset 0 -10px 18px rgba(6, 4, 20, 0.45), inset 0 0 0 1px rgba(178, 150, 255, 0.12), 0 6px 14px rgba(4, 2, 16, 0.6)",
  "--field-shine":
    "inset 0 2px 6px rgba(4, 2, 16, 0.7), inset 0 -1px 0 rgba(214, 196, 255, 0.14), 0 1px 0 rgba(214, 196, 255, 0.08)",
  "--chip-shine":
    "inset 0 1px 0 rgba(214, 196, 255, 0.4), inset 0 -3px 6px rgba(6, 4, 20, 0.5), 0 4px 10px rgba(4, 2, 16, 0.6)",
  "--button-shine":
    "inset 0 1px 1px rgba(255, 255, 255, 0.85), inset 0 -3px 6px rgba(60, 30, 130, 0.35), 0 3px 6px rgba(4, 2, 16, 0.6), 0 8px 16px rgba(120, 90, 230, 0.25)",
  "--button-shine-pressed":
    "inset 0 1px 1px rgba(255, 255, 255, 0.6), inset 0 -2px 5px rgba(60, 30, 130, 0.45), 0 1px 3px rgba(4, 2, 16, 0.6)",
  "--sweep-color": "rgba(255, 255, 255, 0.5)",
  "--tab-bg":
    "radial-gradient(120% 100% at 50% 0%, rgba(214, 196, 255, 0.1), rgba(214, 196, 255, 0) 60%), #1a1340",
  "--tab-active-bg":
    "radial-gradient(70% 30% at 50% 8%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0) 100%), linear-gradient(180deg, #d9c9ff 0%, #b296ff 55%, #9a7cf0 100%)",
  "--tab-active-text": "#0d0a24",
  "--bar-bg": "linear-gradient(180deg, #151036, #0d0a24)",
  "--bottom-bar-bg":
    "radial-gradient(120% 160% at 50% 0%, rgba(214, 196, 255, 0.1), rgba(214, 196, 255, 0) 55%), linear-gradient(180deg, #1b1442, #0b0820)",
  "--bottom-bar-shine": "inset 0 1px 0 rgba(214, 196, 255, 0.4), 0 -8px 18px rgba(4, 2, 16, 0.7)",
  "--unread-edge": "#ff8ac4",
  "--page-bg": "transparent",
  "--page-glare": `${NOCHE_STARS}, radial-gradient(30% 22% at 88% 6%, rgba(214, 196, 255, 0.16), rgba(214, 196, 255, 0) 70%), #0d0a24`,
};

// Clásico (clave "elegante", punto 71): negro laca, como vidrio de piano.
// Tarjetas, campos, pestañas, chip del clima y barra inferior con bisel
// curvo de cristal (luz arriba e izquierda, sombra abajo, con varias
// box-shadow; sin backdrop-filter, por el bug conocido de Chromium);
// botones en blanco perla con efecto domo que flotan; fondo con reflejos
// difusos en diagonal (--page-glare). Los botones blancos llevan .pt-relief (index.css): se hunden
// al presionar y un destello los cruza una vez al pasar el mouse o tocar.
const CLASICO_VARS = {
  "--bg": "#030303",
  "--surface": "#0c0c0c",
  "--surface-alt": "#1a1a1a",
  "--accent": "#ffffff",
  "--accent2": "#ebe8e1",
  "--text": "#ffffff",
  "--text-muted": "#b5b5b5",
  "--border": "rgba(255, 255, 255, 0.3)",
  "--accent2-soft": "rgba(235, 232, 225, 0.16)",
  "--accent2-softer": "rgba(235, 232, 225, 0.12)",
  "--accent2-soft-border": "rgba(235, 232, 225, 0.55)",
  "--accent-soft": "rgba(255, 255, 255, 0.16)",
  "--accent-softer": "rgba(255, 255, 255, 0.12)",
  "--accent-soft-border": "rgba(255, 255, 255, 0.55)",
  // Domo de perla: reflejo especular fino arriba (la elipse chica) sobre
  // una luz redondeada que se oscurece hacia abajo.
  "--gradient-primary":
    "radial-gradient(60% 22% at 50% 10%, rgba(255, 255, 255, 1), rgba(255, 255, 255, 0) 100%), radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #f1eee7 38%, #d9d4c9 70%, #b9b3a6 100%)",
  "--gradient-text": "linear-gradient(180deg, #ffffff 0%, #ffffff 50%, #d6d3cc 100%)",
  "--surface-sheen":
    "radial-gradient(140% 50% at 50% 0%, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0) 70%), #0a0a0a",
  // Bisel curvo: línea especular fina en el borde superior, luz que baja
  // desde arriba e izquierda, sombra abajo y derecha, y sombra externa.
  "--shine":
    "inset 0 1px 0 rgba(255, 255, 255, 0.75), inset 0 6px 10px rgba(255, 255, 255, 0.07), inset 3px 0 5px rgba(255, 255, 255, 0.1), inset 0 -6px 10px rgba(0, 0, 0, 0.9), inset -3px 0 5px rgba(0, 0, 0, 0.6), inset 0 0 0 4px rgba(255, 255, 255, 0.03), 0 1px 0 rgba(255, 255, 255, 0.12), 0 14px 30px rgba(0, 0, 0, 0.8)",
  "--field-shine":
    "inset 0 3px 6px rgba(0, 0, 0, 0.9), inset 0 -1px 0 rgba(255, 255, 255, 0.18), 0 1px 0 rgba(255, 255, 255, 0.22), 0 -1px 0 rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(255, 255, 255, 0.06)",
  "--chip-shine":
    "inset 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 4px 6px rgba(255, 255, 255, 0.12), inset 2px 0 3px rgba(255, 255, 255, 0.12), inset 0 -4px 6px rgba(0, 0, 0, 0.9), inset -2px 0 3px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.12), 0 6px 14px rgba(0, 0, 0, 0.8)",
  "--button-shine":
    "inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 -4px 8px rgba(90, 80, 65, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.5), 0 1px 0 rgba(255, 255, 255, 0.15), 0 4px 6px rgba(0, 0, 0, 0.7), 0 12px 24px rgba(0, 0, 0, 0.75)",
  "--button-shine-pressed":
    "inset 0 1px 1px rgba(255, 255, 255, 0.8), inset 0 -2px 6px rgba(90, 80, 65, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.4), 0 2px 3px rgba(0, 0, 0, 0.7)",
  "--tab-bg":
    "radial-gradient(120% 100% at 50% 0%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 60%), #0a0a0a",
  "--tab-active-bg":
    "radial-gradient(60% 22% at 50% 10%, rgba(255, 255, 255, 1), rgba(255, 255, 255, 0) 100%), radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #f1eee7 38%, #d9d4c9 70%, #b9b3a6 100%)",
  "--tab-active-text": "#050505",
  "--bar-bg": "linear-gradient(180deg, #121212, #030303)",
  "--bottom-bar-bg":
    "radial-gradient(120% 160% at 50% 0%, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 55%), linear-gradient(180deg, #181818, #050505)",
  "--bottom-bar-shine":
    "inset 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 6px 10px rgba(255, 255, 255, 0.06), 0 -10px 24px rgba(0, 0, 0, 0.85)",
  "--unread-edge": "rgba(255, 255, 255, 0.75)",
  "--page-bg": "transparent",
  "--page-glare":
    "linear-gradient(115deg, rgba(255, 255, 255, 0) 18%, rgba(255, 255, 255, 0.05) 26%, rgba(255, 255, 255, 0) 34%), linear-gradient(115deg, rgba(255, 255, 255, 0) 55%, rgba(255, 255, 255, 0.07) 66%, rgba(255, 255, 255, 0.02) 72%, rgba(255, 255, 255, 0) 80%), radial-gradient(ellipse at 85% 30%, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0) 45%), #030303",
};

// Pinky (punto 73), rosa pastel: el primer tema claro. Texto ciruela,
// tarjetas con bisel brillante (luz blanca arriba, borde blanco, sombra
// rosada), campos hundidos, botones blancos perla en relieve con texto
// rosa oscuro (--on-primary), destello rosa y reflejos suaves en el
// fondo. Sombras teñidas (--shadow-rgb).
const PINKY_VARS = {
  "--bg": "#ffdbe5",
  "--surface": "#ffc4d4",
  "--surface-alt": "#ffb3c7",
  "--accent": "#8e1a4b",
  "--accent2": "#7a1640",
  "--text": "#3d0b22",
  "--text-muted": "#6e2346",
  "--border": "rgba(142, 26, 75, 0.25)",
  "--accent2-soft": "rgba(122, 22, 64, 0.12)",
  "--accent2-softer": "rgba(122, 22, 64, 0.08)",
  "--accent2-soft-border": "rgba(122, 22, 64, 0.35)",
  "--accent-soft": "rgba(142, 26, 75, 0.12)",
  "--accent-softer": "rgba(142, 26, 75, 0.08)",
  "--accent-soft-border": "rgba(142, 26, 75, 0.35)",
  "--gradient-primary":
    "radial-gradient(60% 22% at 50% 10%, #ffffff, rgba(255, 255, 255, 0) 100%), radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #fff3f7 45%, #ffdbe6 100%)",
  "--gradient-text": "linear-gradient(135deg, #7a1640, #9c1d52)",
  "--on-primary": "#a8124f",
  "--surface-sheen": "linear-gradient(180deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0) 40%), #ffc4d4",
  "--shine":
    "inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 0 0 1.5px rgba(255, 255, 255, 0.7), inset 0 -4px 8px rgba(176, 36, 94, 0.18), 0 6px 14px rgba(176, 36, 94, 0.22)",
  "--field-shine": "inset 0 2px 5px rgba(142, 26, 75, 0.22), inset 0 0 0 1.5px rgba(255, 255, 255, 0.85)",
  "--chip-shine":
    "inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 0 0 1.5px rgba(255, 255, 255, 0.7), 0 3px 8px rgba(176, 36, 94, 0.2)",
  "--button-shine":
    "inset 0 1px 1px #ffffff, inset 0 -3px 6px rgba(176, 36, 94, 0.18), 0 0 0 1px rgba(176, 36, 94, 0.15), 0 4px 10px rgba(176, 36, 94, 0.3)",
  "--button-shine-pressed":
    "inset 0 1px 1px rgba(255, 255, 255, 0.8), inset 0 -2px 5px rgba(176, 36, 94, 0.25), 0 1px 3px rgba(176, 36, 94, 0.3)",
  "--sweep-color": "rgba(255, 111, 170, 0.35)",
  "--tab-bg": "linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.15))",
  "--tab-active-bg":
    "radial-gradient(60% 22% at 50% 10%, #ffffff, rgba(255, 255, 255, 0) 100%), radial-gradient(130% 100% at 50% 0%, #ffffff 0%, #fff3f7 45%, #ffdbe6 100%)",
  "--tab-active-text": "#a8124f",
  "--bar-bg": "linear-gradient(180deg, #ffd0dc, #ffc4d4)",
  // Botón de temas blanco: sobre la barra rosa el fondo de tarjeta casi
  // no se distinguía.
  "--theme-btn-bg": "#ffffff",
  "--bottom-bar-bg": "linear-gradient(180deg, #ffc4d4, #ffb3c7)",
  "--bottom-bar-shine": "inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 -4px 12px rgba(176, 36, 94, 0.15)",
  "--unread-edge": "#d6246e",
  "--page-bg": "transparent",
  "--page-glare":
    "radial-gradient(70% 40% at 15% 0%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 70%), radial-gradient(60% 40% at 90% 90%, rgba(255, 150, 190, 0.35), rgba(255, 150, 190, 0) 70%), #ffdbe5",
  "--shadow-rgb": "120, 20, 60",
};

export const THEMES = {
  noche: {
    labelKey: "theme.noche",
    emoji: "🌙",
    vars: NOCHE_VARS,
    // Activa .pt-relief (index.css) en los botones principales.
    relief: true,
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
  },
  // Clásico (se muestra "Clásico"/"Classic"; la clave sigue siendo
  // "elegante" en las reglas y en las cuentas). "--bg"/"--surface" son
  // sólidos a propósito: varios componentes los usan como color de texto
  // o de borde, donde un degradado es CSS inválido. El brillo va en las
  // variables de efecto (--surface-sheen, --gradient-primary, etc.).
  // ♛ (U+265B) no tiene versión emoji: se dibuja como letra, con el color
  // del texto, igual en todos los sistemas.
  elegante: {
    labelKey: "theme.elegante",
    emoji: "♛",
    vars: CLASICO_VARS,
    // Activa .pt-relief (index.css) en los botones blancos.
    relief: true,
  },
  // Pinky (punto 73): sin emoji, su ícono es PinkyHeartIcon.jsx (App.js,
  // THEME_SVG_ICONS). Clave nueva: tiene que estar en firestore.rules.
  pinky: {
    labelKey: "theme.pinky",
    vars: PINKY_VARS,
    relief: true,
    metaColor: "#ffd0dc",
  },
};

// Paleta fija de marca para la pantalla de entrada (AuthScreen.jsx, punto
// 68, commit 7): la entrada tiene su propio estilo, siempre el mismo, sin
// importar el tema que cada persona eligió dentro de la app. Mismas
// variables que un tema; AuthScreen las pone en su contenedor, así que
// solo valen ahí adentro y el resto de la app sigue con el tema elegido.
// Son los colores que tenía "noche" antes del punto 72 (morado y rosa, los
// del logo): una copia aparte a propósito, así que cambiar "noche" no
// cambia la entrada.
// Las variables de efecto van con sus valores por defecto: así la entrada
// no hereda el brillo del tema que quedó puesto en :root.
export const ENTRY_THEME_VARS = {
  ...EFFECT_DEFAULTS,
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
// Tema de una cuenta que todavía no eligió ninguno.
export const DEFAULT_THEME_KEY = "noche";
const STORAGE_KEY = "pridethink-theme";

export function getThemeKeys() {
  return Object.keys(THEMES);
}

// Claves que se pueden elegir: los temas y "rotativo". Misma lista que
// acepta firestore.rules para private/data.theme: un tema nuevo necesita
// publicar las reglas antes, o no se podrá guardar en la cuenta.
export function isThemeKey(key) {
  return key === ROTATIVO_KEY || Object.prototype.hasOwnProperty.call(THEMES, key);
}

// Elige un tema distinto cada día del año, en un ciclo fijo entre todos los
// temas de THEMES (hoy 6, con Pinky).
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
// El theme-color de public/index.html.
const DEFAULT_META_COLOR = "#000000";
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
  // Solo con data-relief en <html> actúan :active y el destello de
  // .pt-relief (index.css): solo los temas con relief: true lo llevan.
  root.toggleAttribute("data-relief", !!theme.relief);
  Object.entries({ ...EFFECT_DEFAULTS, ...theme.vars }).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
  Object.entries(FONT_VARS).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
  // Barra del navegador en el celular (<meta name="theme-color">, punto
  // 73): negra como siempre, salvo un tema que declare metaColor.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.metaColor || DEFAULT_META_COLOR);
}

// localStorage es solo una caché del tema de la cuenta con sesión, para el
// primer pintado (el que manda es private/data.theme, ver
// ThemeContext.jsx); al cerrar sesión se borra. Puede no estar disponible
// (ventana privada, datos del sitio bloqueados): en ese caso no se guarda
// y el primer pintado sale con "noche".
export function saveThemePreference(key) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // sin caché local: el primer pintado sale con "noche"
  }
}

export function clearThemePreference() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // sin caché local: no había nada que borrar
  }
}

export function loadThemePreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isThemeKey(saved) ? saved : DEFAULT_THEME_KEY;
  } catch {
    return DEFAULT_THEME_KEY;
  }
}

// Carga la caché (o "noche" por defecto) y la aplica, sin fundido. La
// llama index.js antes del primer render (ver ThemeContext.jsx).
// Devuelve la clave cargada.
export function initTheme() {
  const pref = loadThemePreference();
  applyTheme(pref);
  return pref;
}
