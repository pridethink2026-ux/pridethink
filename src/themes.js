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
  // Contraste de botones (punto 83). Opacidad de un botón desactivado
  // (cargando, sin texto, etc.): la más baja con la que todos los
  // desactivados de la app siguen en 4,5:1 o más; cada tema la sube si la
  // necesita. Antes era 0,6 fijo (0,5 en "Enviar" de los Momentos), que no
  // se leía en "Quitar" ni en "Agregar foto" en ningún tema.
  "--disabled-opacity": "0.7",
  // Botón activo o con hover en los editores de foto y texto de los
  // Momentos, que van sobre un velo negro: el acento suave translúcido
  // sirve con texto claro, pero no con el texto oscuro de un tema claro.
  "--veil-active-bg": "var(--accent-soft)",
  // Aviso del editor de texto de los Momentos, sobre ese mismo velo.
  "--veil-notice-bg": "var(--accent2-soft)",
  // Texto de error del visor de Momentos (negro y panel oscuro fijos).
  "--veil-error-text": "var(--accent2)",
  // Etiquetas de condición de la Tienda (Nuevo / Usado): verde y naranja
  // fijos, como siempre; un tema claro los oscurece.
  "--badge-new-bg": "rgba(34, 197, 94, 0.15)",
  "--badge-new-text": "#22c55e",
  "--badge-used-bg": "rgba(255, 151, 66, 0.18)",
  "--badge-used-text": "#ff9742",
  // Punto 85 (Ángel). Borde de la pestaña activa (arriba en App.js y en el
  // Muro, Feed.jsx): el acento, como siempre.
  "--tab-active-border": "var(--accent2)",
  // Profundidad del título "Pridethink" (filter; con background-clip:
  // text, text-shadow se dibujaría encima del degradado).
  "--logo-depth": "none",
  // Relieve de los títulos de sección (los de --gradient-text): ninguno
  // salvo en Ángel mejorado.
  "--title-depth": "none",
  // Aro de Momentos sin ver (Avatar.jsx): el destello fijo y el que pulsa,
  // los de siempre; más una capa de fondo detrás del aro (imagen y halo),
  // vacía salvo en Ángel (arcoíris, que un box-shadow no puede dibujar).
  "--moment-unseen-shadow":
    "0 0 0 2px var(--surface), 0 0 0 4px var(--accent2), 0 0 10px 4px var(--accent2-soft-border)",
  "--moment-glow-shadow":
    "0 0 0 2px var(--surface), 0 0 0 4px var(--accent), 0 0 14px 6px var(--accent-soft-border)",
  "--moment-ring-image": "none",
  "--moment-ring-halo": "none",
  // Barra inferior (App.js): color de la pestaña activa y marca debajo
  // (ninguna salvo en Ángel).
  "--nav-active-color": "var(--accent2)",
  "--nav-active-mark": "none",
  // Fondo del ✕ de la lista "quién vio" con hover (MomentViewersSheet).
  "--close-hover-bg": "var(--border)",
  // Anillo de los controles sin borde (ver ANGEL_VARS): ninguno salvo en
  // Ángel.
  "--control-ring": "0 0 0 0 transparent",
  // Lluvia de estrellas (punto 86, StarRain.jsx): los dos acentos del tema
  // y un dorado. La mezcla se ve tanto sobre el negro fijo del visor de
  // Momentos (donde un acento oscuro se pierde, el dorado no) como sobre
  // el fondo claro de un tema claro (al revés).
  "--star-rain-1": "var(--accent)",
  "--star-rain-2": "var(--accent2)",
  "--star-rain-3": "#ffd23f",
};

// Ángel (punto 85): perla pulida con relieve (neumorfismo con volumen) y
// el arcoíris solo en los puntos clave. ANGEL_RAINBOW es el brillante
// (líneas, aro: decoración); ANGEL_RAINBOW_DARK, el de los títulos, oscuro
// para que cada letra pase 4,5 (6,8 o más) sobre la barra y las tarjetas.
const ANGEL_RAINBOW = "#ff3d57, #ff8a2a, #ffd23a, #36c96e, #2f8bff, #8a4dff";
const ANGEL_RAINBOW_DARK = "#a00d27, #933c00, #6f5000, #156530, #1942ad, #561a98";
// Fondo perla, un poco más oscuro que las tarjetas casi blancas para que
// resalten.
const ANGEL_BG = "#e5e2ec";
// Borde de los controles (4,2:1 o más sobre el fondo y las tarjetas): con
// blanco sobre blanco es lo que hace reconocible a un control (pestañas,
// botones secundarios, campos y, como anillo en --button-shine, los
// principales).
const ANGEL_EDGE = "#6c6684";
// Color de las sombras, un violeta hondo, en "r, g, b".
const ANGEL_SHADOW = "50, 40, 90";
// Índigo profundo para el texto (en vez del casi negro) y el secundario
// en la misma familia.
const ANGEL_INK = "#140a36";
const ANGEL_INK_MUTED = "#3d3364";

// Cielo de cristales, con la misma técnica que las estrellas de Noche
// Violeta: dos mosaicos de tamaños distintos (173 y 251 px) que se repiten,
// así no se nota el patrón. Cada mosaico es UN SVG en línea (data:,
// estático) con unas pocas gemas; cada gema se dibuja una sola vez como
// <symbol> (talla alargada y brillante redondo, con su destello) y se
// reusa con <use>, para que el SVG pese poco.
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
// Destello: núcleo blanco brillante con cuatro rayos largos (con un filo
// lila fino, si no el blanco se pierde sobre el perla) y dos cortos en
// diagonal, sobre un halo. "g" es el halo blanco lila; "h", el
// tornasol (rosa, amarillo y celeste) que llevan algunas gemas.
const sparkleAt = (x, y, r, halo) =>
  `<circle cx="${x}" cy="${y}" r="${r * 1.7}" fill="url(#${halo})"/>` +
  `<path d="M${x} ${y - r}L${x + r * 0.18} ${y - r * 0.18}L${x + r} ${y}L${x + r * 0.18} ${y + r * 0.18}L${x} ${y + r}L${x - r * 0.18} ${y + r * 0.18}L${x - r} ${y}L${x - r * 0.18} ${y - r * 0.18}Z" fill="#fff" stroke="#8f80d0" stroke-opacity=".75" stroke-width=".6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
  `<path d="M${x - r * 0.5} ${y - r * 0.5}L${x + r * 0.5} ${y + r * 0.5}M${x + r * 0.5} ${y - r * 0.5}L${x - r * 0.5} ${y + r * 0.5}" stroke="#fff" stroke-width="${r * 0.14}" stroke-linecap="round"/>` +
  `<circle cx="${x}" cy="${y}" r="${r * 0.22}" fill="#fff"/>`;
// Contorno índigo lila (#6a5ca8, 4,4:1 o más contra el fondo perla y sus
// brillos), de 1 px a cualquier tamaño (non-scaling-stroke). Facetas con
// luz y sombra marcadas: mesa casi blanca, cara izquierda clara, cara
// derecha en sombra lila, para que se vean talladas.
const GEM_OUTLINE = 'fill="none" stroke="#6a5ca8" stroke-width="1" stroke-linejoin="round" vector-effect="non-scaling-stroke"';
const gemLong = (halo) =>
  '<path d="M12 6L22 15L12 38L2 15Z" fill="url(#a)"/>' +
  '<path d="M12 6L22 15L12 18L2 15Z" fill="#fff" fill-opacity=".92"/>' +
  '<path d="M12 18L2 15L12 38Z" fill="#fff" fill-opacity=".45"/>' +
  '<path d="M12 18L22 15L12 38Z" fill="#5a4aa8" fill-opacity=".45"/>' +
  '<path d="M12 6L12 18M2 15L12 18L22 15" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width=".8"/>' +
  `<path d="M12 6L22 15L12 38L2 15Z" ${GEM_OUTLINE}/>` +
  sparkleAt(22, 7, 6.5, halo);
const gemRound = (halo) =>
  '<path d="M8 12L13 6H23L28 12L18 32Z" fill="url(#a)"/>' +
  '<path d="M13 6H23L20 12H16Z" fill="#fff" fill-opacity=".95"/>' +
  '<path d="M8 12L13 6L16 12Z" fill="#fff" fill-opacity=".6"/>' +
  '<path d="M23 6L28 12H20Z" fill="#5a4aa8" fill-opacity=".3"/>' +
  '<path d="M8 12H18L18 32Z" fill="#fff" fill-opacity=".4"/>' +
  '<path d="M18 12H28L18 32Z" fill="#5a4aa8" fill-opacity=".45"/>' +
  '<path d="M13 6L16 12L18 32L20 12L23 6M8 12H28" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width=".6"/>' +
  `<path d="M8 12L13 6H23L28 12L18 32Z" ${GEM_OUTLINE}/>` +
  sparkleAt(27, 6, 5.5, halo);
const ANGEL_GEM_DEFS =
  '<linearGradient id="a" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#ffd6e7"/><stop offset=".35" stop-color="#fff3c4"/>' +
  '<stop offset=".65" stop-color="#cdeeff"/><stop offset="1" stop-color="#dccbff"/></linearGradient>' +
  '<radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#e6d6ff" stop-opacity="0"/></radialGradient>' +
  '<radialGradient id="h"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#ffe0f0" stop-opacity=".9"/><stop offset=".6" stop-color="#d8f3ff" stop-opacity=".6"/><stop offset="1" stop-color="#fff4c2" stop-opacity="0"/></radialGradient>' +
  // Sombra de apoyo de las medianas: una elipse que se desvanece (sin
  // filtros de desenfoque, que cuestan más al pintar).
  '<radialGradient id="s"><stop offset="0" stop-color="#3c2f78" stop-opacity=".28"/><stop offset="1" stop-color="#3c2f78" stop-opacity="0"/></radialGradient>' +
  `<symbol id="L" viewBox="0 0 30 40">${gemLong("g")}</symbol>` +
  `<symbol id="R" viewBox="0 0 36 34">${gemRound("g")}</symbol>` +
  `<symbol id="LI" viewBox="0 0 30 40">${gemLong("h")}</symbol>` +
  `<symbol id="RI" viewBox="0 0 36 34">${gemRound("h")}</symbol>`;
// [forma, x, y, ancho] dentro del mosaico (nunca cortadas por el borde).
// Forma "L"/"R" con destello blanco, "LI"/"RI" con destello tornasol.
// Las medianas (15 px o más) llevan su sombra de apoyo debajo.
const gemTile = (size, gems) =>
  `${svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<defs>${ANGEL_GEM_DEFS}</defs>` +
      gems
        .map(([k, x, y, w]) => {
          const h = Math.round(w * (k[0] === "L" ? 40 / 30 : 34 / 36));
          // Punta de abajo de la gema: ~95% del alto de su viewBox.
          const shadow =
            w >= 15
              ? `<ellipse cx="${x + w * (k[0] === "L" ? 0.4 : 0.5)}" cy="${y + h * 0.95}" rx="${w * 0.42}" ry="${w * 0.13}" fill="url(#s)"/>`
              : "";
          return `${shadow}<use href="#${k}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
        })
        .join("") +
      "</svg>"
  )} 0 0 / ${size}px ${size}px`;
// La mayoría chicas (7 a 10 px) y algunas medianas (15 a 18 px); misma
// cantidad y posiciones que antes, 4 con destello tornasol.
const ANGEL_GEM_SKY = [
  gemTile(173, [
    ["L", 14, 18, 9],
    ["RI", 98, 6, 8],
    ["L", 136, 70, 15],
    ["R", 46, 94, 7],
    ["LI", 92, 140, 8],
  ]),
  gemTile(251, [
    ["RI", 22, 176, 17],
    ["L", 188, 24, 10],
    ["R", 118, 58, 7],
    ["L", 64, 104, 18],
    ["R", 200, 196, 9],
    ["LI", 166, 126, 7],
  ]),
].join(", ");

const ANGEL_VARS = {
  "--bg": ANGEL_BG,
  "--surface": "#fafafc",
  "--surface-alt": "#e2dfe9",
  "--accent": "#5a37c4",
  "--accent2": "#8a2a8f",
  "--text": ANGEL_INK,
  "--text-muted": ANGEL_INK_MUTED,
  "--border": ANGEL_EDGE,
  "--accent2-soft": "rgba(138, 42, 143, 0.1)",
  "--accent2-softer": "rgba(138, 42, 143, 0.07)",
  // 0,7: los bordes suaves también delimitan controles (chips, °C/°F)
  // y tienen que llegar a 3:1.
  "--accent2-soft-border": "rgba(138, 42, 143, 0.7)",
  "--accent-soft": "rgba(90, 55, 196, 0.1)",
  "--accent-softer": "rgba(90, 55, 196, 0.07)",
  "--accent-soft-border": "rgba(90, 55, 196, 0.7)",
  "--shadow-rgb": ANGEL_SHADOW,
  // Títulos con el arcoíris oscuro y en relieve (luz blanca arriba, sombra
  // corta y nítida abajo); el logo, con más profundidad.
  "--gradient-text": `linear-gradient(90deg, ${ANGEL_RAINBOW_DARK})`,
  "--title-depth": `drop-shadow(0 1px 0 #ffffff) drop-shadow(0 2px 1px rgba(${ANGEL_SHADOW}, 0.45))`,
  "--logo-depth": `drop-shadow(0 1px 0 #ffffff) drop-shadow(0 2px 1px rgba(${ANGEL_SHADOW}, 0.45)) drop-shadow(0 4px 6px rgba(${ANGEL_SHADOW}, 0.22))`,
  // Tarjetas: reflejo especular en el borde superior (franja blanca y una
  // mancha de luz arriba a la izquierda), halo blanco en el borde y una
  // sombra inferior nítida y honda. Los campos, hundidos.
  "--surface-sheen":
    "linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0px, rgba(255, 255, 255, 0) 26px), radial-gradient(70% 40% at 12% 0%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0) 70%), radial-gradient(120% 60% at 100% 0%, rgba(214, 196, 255, 0.16), rgba(214, 196, 255, 0) 60%), linear-gradient(165deg, #ffffff, #f8f7fb 55%, #f2f0f6)",
  "--shine": `0 0 0 1px rgba(255, 255, 255, 0.9), 0 0 12px rgba(255, 255, 255, 0.7), -5px -5px 12px rgba(255, 255, 255, 0.85), 0 2px 3px rgba(${ANGEL_SHADOW}, 0.2), 8px 12px 24px rgba(${ANGEL_SHADOW}, 0.26), inset 0 1px 0 #ffffff, inset 0 2px 5px rgba(255, 255, 255, 0.9), inset 0 -2px 6px rgba(${ANGEL_SHADOW}, 0.06)`,
  "--field-shine": `inset 3px 3px 6px rgba(${ANGEL_SHADOW}, 0.2), inset -3px -3px 6px rgba(255, 255, 255, 0.95)`,
  // Pestañas inactivas y botones secundarios: domo (luz arriba, sombra
  // abajo por dentro) y sombra inferior nítida.
  "--tab-bg":
    "radial-gradient(120% 70% at 50% 0%, #ffffff, rgba(255, 255, 255, 0) 65%), linear-gradient(180deg, #ffffff 0%, #f5f3f8 60%, #e9e6ef 100%)",
  "--chip-shine": `-3px -3px 7px rgba(255, 255, 255, 0.9), 0 1px 1px rgba(${ANGEL_SHADOW}, 0.28), 3px 5px 10px rgba(${ANGEL_SHADOW}, 0.28), inset 0 2px 2px #ffffff, inset 0 -3px 6px rgba(${ANGEL_SHADOW}, 0.1)`,
  // Pestaña activa: el mismo domo con una línea arcoíris arriba y otra
  // abajo (el borde redondeado las curva en las puntas). Sin borde propio:
  // el anillo lo pone --button-shine.
  "--tab-active-bg": `linear-gradient(90deg, ${ANGEL_RAINBOW}) 0 0 / 100% 2.5px no-repeat, linear-gradient(90deg, ${ANGEL_RAINBOW}) 0 100% / 100% 2.5px no-repeat, radial-gradient(120% 70% at 50% 0%, #ffffff, rgba(255, 255, 255, 0) 65%), linear-gradient(180deg, #ffffff 0%, #f6f4f9 55%, #ebe8f1 100%)`,
  "--tab-active-border": "transparent",
  "--tab-active-text": ANGEL_INK,
  // Publicar, Enviar, banner: domo de perla tornasol (reflejo grande
  // arriba, sombreado abajo), sombra inferior nítida, el anillo de 3:1 y
  // el halo lila. Se hunden al presionar (sombra interior) y llevan el
  // destello lila claro.
  "--gradient-primary":
    "radial-gradient(75% 48% at 50% 0%, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0) 100%), linear-gradient(180deg, rgba(120, 100, 170, 0) 55%, rgba(120, 100, 170, 0.12) 100%), linear-gradient(115deg, #ffd6e0 0%, #ffe6c7 20%, #fff4c2 38%, #d4f5dc 56%, #d1e4ff 76%, #e6d6ff 100%)",
  "--on-primary": ANGEL_INK,
  "--button-shine": `0 0 0 1px ${ANGEL_EDGE}, inset 0 2px 2px #ffffff, inset 0 -4px 8px rgba(${ANGEL_SHADOW}, 0.14), -4px -4px 10px rgba(255, 255, 255, 0.9), 0 2px 2px rgba(${ANGEL_SHADOW}, 0.3), 4px 7px 14px rgba(${ANGEL_SHADOW}, 0.3), 0 0 18px rgba(170, 130, 255, 0.4)`,
  "--button-shine-pressed": `0 0 0 1px ${ANGEL_EDGE}, inset 4px 4px 8px rgba(${ANGEL_SHADOW}, 0.32), inset -3px -3px 6px rgba(255, 255, 255, 0.9)`,
  "--sweep-color": "rgba(232, 220, 255, 0.8)",
  // Anillo de 3:1 para los controles sin borde propio (opción elegida del
  // menú de temas, ✕ del banner, ▶ del audio propio, acciones del producto
  // con hover): blanco sobre blanco no se distinguirían.
  "--control-ring": `0 0 0 1px ${ANGEL_EDGE}`,
  "--bar-bg": "#fbfafc",
  "--theme-btn-bg": "#ffffff",
  "--bottom-bar-bg": "#ffffff",
  "--bottom-bar-shine": `0 -4px 14px rgba(${ANGEL_SHADOW}, 0.14), inset 0 1px 0 #ffffff`,
  "--nav-active-color": ANGEL_INK,
  "--nav-active-mark": `linear-gradient(90deg, ${ANGEL_RAINBOW})`,
  "--unread-edge": "#6a22b8",
  // Fondo perla: el cielo de cristales sobre un brillo nacarado suave.
  "--page-bg": "transparent",
  "--page-glare": [
    ANGEL_GEM_SKY,
    "radial-gradient(70% 40% at 10% 0%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 70%)",
    "radial-gradient(50% 30% at 100% 30%, rgba(214, 196, 255, 0.3), rgba(214, 196, 255, 0) 70%)",
    "radial-gradient(50% 30% at 0% 80%, rgba(255, 214, 230, 0.32), rgba(255, 214, 230, 0) 70%)",
    ANGEL_BG,
  ].join(", "),
  // Aro arcoíris de Momentos.
  "--moment-unseen-shadow": "0 0 0 2px var(--surface)",
  "--moment-ring-image": `conic-gradient(from 0deg, ${ANGEL_RAINBOW}, #ff3d57)`,
  "--moment-ring-halo": "0 0 12px 2px rgba(138, 77, 255, 0.35)",
  "--moment-glow-shadow": "0 0 0 2px var(--surface), 0 0 16px 6px rgba(138, 77, 255, 0.3)",
  "--close-hover-bg": "#d6d2df",
  // Lo mismo que Pinky (punto 83) para un tema claro.
  "--disabled-opacity": "0.85",
  "--veil-active-bg": "#f8f7fa",
  "--veil-notice-bg": "#f8f7fa",
  "--veil-error-text": "#c9b6ff",
  "--badge-new-bg": "rgba(20, 107, 52, 0.14)",
  "--badge-new-text": "#0f5a2b",
  "--badge-used-bg": "rgba(138, 61, 0, 0.14)",
  "--badge-used-text": "#7a3500",
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
  // Punto 83: "Publicar" del editor y "Enviar" de los Momentos (lila
  // claro con texto oscuro) piden un poco más.
  "--disabled-opacity": "0.75",
};

// Atardecer (punto 75), "Brasas": fondo casi negro con un resplandor de
// brasa que sube desde abajo (--page-glare), tarjetas de barro con el
// brillo interior abajo (la luz viene del fuego, no del cielo), botones y
// pestaña activa naranja brasa en relieve (se hunden y llevan el destello
// cálido, como el Clásico) y barra inferior con un filo encendido arriba.
const ATARDECER_VARS = {
  "--bg": "#140b08",
  "--surface": "#2a1610",
  "--surface-alt": "#3a1f16",
  "--accent": "#ff9a4d",
  "--accent2": "#ff6b5e",
  "--text": "#fff0e8",
  "--text-muted": "#e6b49c",
  "--border": "rgba(255, 154, 77, 0.26)",
  "--accent2-soft": "rgba(255, 107, 94, 0.15)",
  "--accent2-softer": "rgba(255, 107, 94, 0.12)",
  "--accent2-soft-border": "rgba(255, 107, 94, 0.4)",
  "--accent-soft": "rgba(255, 154, 77, 0.15)",
  "--accent-softer": "rgba(255, 154, 77, 0.12)",
  "--accent-soft-border": "rgba(255, 154, 77, 0.4)",
  "--gradient-primary":
    "radial-gradient(70% 30% at 50% 8%, rgba(255, 230, 190, 0.6), rgba(255, 230, 190, 0) 100%), linear-gradient(180deg, #ffb066 0%, #ff7a3d 55%, #e8552e 100%)",
  "--gradient-text": "linear-gradient(135deg, #ffb066, #ff6b5e)",
  "--surface-sheen":
    "radial-gradient(140% 60% at 50% 100%, rgba(255, 110, 40, 0.1), rgba(255, 110, 40, 0) 70%), #2a1610",
  "--shine":
    "inset 0 1px 0 rgba(255, 190, 140, 0.16), inset 0 -8px 16px rgba(255, 100, 40, 0.1), inset 0 0 0 1px rgba(255, 154, 77, 0.1), 0 6px 16px rgba(0, 0, 0, 0.6), 0 2px 10px rgba(255, 90, 30, 0.08)",
  "--field-shine":
    "inset 0 2px 6px rgba(0, 0, 0, 0.7), inset 0 -1px 0 rgba(255, 130, 60, 0.2), 0 1px 0 rgba(255, 190, 140, 0.06)",
  "--chip-shine":
    "inset 0 1px 0 rgba(255, 190, 140, 0.25), inset 0 -3px 6px rgba(255, 100, 40, 0.15), 0 4px 10px rgba(0, 0, 0, 0.6)",
  "--button-shine":
    "inset 0 1px 1px rgba(255, 240, 210, 0.8), inset 0 -3px 6px rgba(140, 30, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.6), 0 6px 18px rgba(255, 100, 40, 0.35)",
  "--button-shine-pressed":
    "inset 0 1px 1px rgba(255, 240, 210, 0.55), inset 0 -2px 5px rgba(140, 30, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.6)",
  "--sweep-color": "rgba(255, 225, 180, 0.5)",
  "--tab-bg":
    "radial-gradient(120% 100% at 50% 100%, rgba(255, 110, 40, 0.12), rgba(255, 110, 40, 0) 60%), #22120d",
  "--tab-active-bg":
    "radial-gradient(70% 30% at 50% 8%, rgba(255, 230, 190, 0.6), rgba(255, 230, 190, 0) 100%), linear-gradient(180deg, #ffb066 0%, #ff7a3d 55%, #e8552e 100%)",
  "--tab-active-text": "#140b08",
  "--bar-bg": "linear-gradient(180deg, #1c0f0b, #140b08)",
  "--bottom-bar-bg":
    "radial-gradient(120% 160% at 50% 0%, rgba(255, 110, 40, 0.14), rgba(255, 110, 40, 0) 55%), linear-gradient(180deg, #24130d, #0f0806)",
  "--bottom-bar-shine": "inset 0 1px 0 rgba(255, 130, 60, 0.55), 0 -8px 18px rgba(0, 0, 0, 0.7)",
  "--unread-edge": "#ff6b5e",
  "--page-bg": "transparent",
  "--page-glare":
    "radial-gradient(120% 40% at 50% 105%, rgba(255, 100, 30, 0.24), rgba(255, 100, 30, 0) 70%), radial-gradient(50% 20% at 50% 102%, rgba(255, 170, 80, 0.16), rgba(255, 170, 80, 0) 70%), radial-gradient(60% 30% at 0% 0%, rgba(255, 150, 90, 0.05), rgba(255, 150, 90, 0) 70%), #140b08",
  "--shadow-rgb": "0, 0, 0",
};

// Océano (punto 76), "Marea": azul más vivo con ondas de oleaje suaves en
// la parte de abajo del fondo (--page-glare), tarjetas, chip del clima y
// barra inferior con una línea de espuma arriba, botones y pestaña activa
// de espuma blanca a turquesa en relieve (se hunden y llevan el destello,
// como el Clásico).
const OCEANO_VARS = {
  "--bg": "#062033",
  "--surface": "#0c3350",
  "--surface-alt": "#124266",
  "--accent": "#4ff0d8",
  "--accent2": "#7fd4ff",
  "--text": "#eaf8ff",
  "--text-muted": "#a9d0e6",
  "--border": "rgba(79, 240, 216, 0.28)",
  "--accent2-soft": "rgba(127, 212, 255, 0.15)",
  "--accent2-softer": "rgba(127, 212, 255, 0.12)",
  "--accent2-soft-border": "rgba(127, 212, 255, 0.4)",
  "--accent-soft": "rgba(79, 240, 216, 0.15)",
  "--accent-softer": "rgba(79, 240, 216, 0.12)",
  "--accent-soft-border": "rgba(79, 240, 216, 0.4)",
  "--gradient-primary":
    "radial-gradient(70% 30% at 50% 8%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0) 100%), linear-gradient(180deg, #e6fffb 0%, #7ff5e3 40%, #36c9e0 100%)",
  "--gradient-text": "linear-gradient(135deg, #7ff5e3, #7fd4ff)",
  "--surface-sheen":
    "linear-gradient(180deg, rgba(234, 248, 255, 0.08), rgba(234, 248, 255, 0) 35%), #0c3350",
  "--shine":
    "inset 0 1.5px 0 rgba(234, 248, 255, 0.45), inset 0 3px 6px rgba(234, 248, 255, 0.06), inset 0 -10px 18px rgba(2, 12, 24, 0.35), 0 6px 14px rgba(2, 10, 20, 0.5)",
  "--field-shine":
    "inset 0 2px 6px rgba(2, 10, 20, 0.6), inset 0 -1px 0 rgba(234, 248, 255, 0.18), 0 1px 0 rgba(234, 248, 255, 0.1)",
  "--chip-shine":
    "inset 0 1.5px 0 rgba(234, 248, 255, 0.5), inset 0 -3px 6px rgba(2, 12, 24, 0.4), 0 4px 10px rgba(2, 10, 20, 0.5)",
  "--button-shine":
    "inset 0 1px 1px #ffffff, inset 0 -3px 6px rgba(0, 90, 110, 0.3), 0 3px 6px rgba(2, 10, 20, 0.5), 0 8px 18px rgba(79, 240, 216, 0.25)",
  "--button-shine-pressed":
    "inset 0 1px 1px rgba(255, 255, 255, 0.7), inset 0 -2px 5px rgba(0, 90, 110, 0.4), 0 1px 3px rgba(2, 10, 20, 0.5)",
  "--sweep-color": "rgba(255, 255, 255, 0.6)",
  "--tab-bg":
    "linear-gradient(180deg, rgba(234, 248, 255, 0.08), rgba(234, 248, 255, 0) 50%), #0a2c46",
  "--tab-active-bg":
    "radial-gradient(70% 30% at 50% 8%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0) 100%), linear-gradient(180deg, #e6fffb 0%, #7ff5e3 40%, #36c9e0 100%)",
  "--tab-active-text": "#062033",
  "--bar-bg": "linear-gradient(180deg, #0a2c46, #062033)",
  "--bottom-bar-bg":
    "radial-gradient(140% 120% at 50% 0%, rgba(79, 240, 216, 0.12), rgba(79, 240, 216, 0) 55%), linear-gradient(180deg, #0c3350, #041726)",
  "--bottom-bar-shine": "inset 0 1.5px 0 rgba(234, 248, 255, 0.55), 0 -8px 18px rgba(2, 10, 20, 0.6)",
  "--unread-edge": "#7fd4ff",
  "--page-bg": "transparent",
  "--page-glare":
    "radial-gradient(140% 22% at 50% 102%, rgba(79, 240, 216, 0.13), rgba(79, 240, 216, 0) 70%), radial-gradient(120% 18% at 25% 92%, rgba(127, 212, 255, 0.1), rgba(127, 212, 255, 0) 70%), radial-gradient(130% 16% at 80% 83%, rgba(127, 212, 255, 0.07), rgba(127, 212, 255, 0) 70%), radial-gradient(120% 14% at 40% 74%, rgba(127, 212, 255, 0.04), rgba(127, 212, 255, 0) 70%), linear-gradient(180deg, #0a2a42 0%, #062033 100%)",
  "--shadow-rgb": "2, 10, 20",
  // Punto 83: "Agregar foto" desactivado pide más sobre el azul, y el
  // verde de "Nuevo" quedaba en 4,4 sobre las tarjetas.
  "--disabled-opacity": "0.8",
  "--badge-new-text": "#2fd46b",
};

// Arcoíris (punto 77), "Neón": fondo oscuro con resplandores de neón en
// las esquinas (magenta, celeste, amarillo y verde, en --page-glare),
// tarjetas con halo rosa neón, campos con halo celeste, botones y pestaña
// activa amarillo sol con brillo, en relieve (se hunden y llevan el
// destello, como el Clásico).
const ARCOIRIS_VARS = {
  "--bg": "#0e0820",
  "--surface": "#1d1238",
  "--surface-alt": "#281a4a",
  "--accent": "#ffd23f",
  "--accent2": "#ff5fa2",
  "--text": "#fff6ff",
  "--text-muted": "#d0bdf0",
  "--border": "rgba(255, 95, 162, 0.3)",
  "--accent2-soft": "rgba(255, 95, 162, 0.15)",
  "--accent2-softer": "rgba(255, 95, 162, 0.12)",
  "--accent2-soft-border": "rgba(255, 95, 162, 0.4)",
  "--accent-soft": "rgba(255, 210, 63, 0.15)",
  "--accent-softer": "rgba(255, 210, 63, 0.12)",
  "--accent-soft-border": "rgba(255, 210, 63, 0.4)",
  "--gradient-primary":
    "radial-gradient(70% 30% at 50% 8%, rgba(255, 255, 240, 0.75), rgba(255, 255, 240, 0) 100%), linear-gradient(180deg, #fff09a 0%, #ffd23f 50%, #ffa62b 100%)",
  "--gradient-text": "linear-gradient(135deg, #ffd23f, #ff5fa2, #5fd4ff)",
  "--surface-sheen":
    "radial-gradient(140% 55% at 50% 0%, rgba(255, 95, 162, 0.08), rgba(255, 95, 162, 0) 70%), #1d1238",
  "--shine":
    "inset 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 0 0 1px rgba(255, 95, 162, 0.2), 0 0 18px rgba(255, 95, 162, 0.12), 0 6px 14px rgba(4, 2, 12, 0.6)",
  "--field-shine":
    "inset 0 2px 6px rgba(4, 2, 12, 0.7), inset 0 0 0 1px rgba(95, 212, 255, 0.16), 0 0 10px rgba(95, 212, 255, 0.06)",
  "--chip-shine":
    "inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 0 0 1px rgba(255, 210, 63, 0.3), 0 0 12px rgba(255, 210, 63, 0.15), 0 4px 10px rgba(4, 2, 12, 0.6)",
  "--button-shine":
    "inset 0 1px 1px rgba(255, 255, 255, 0.9), inset 0 -3px 6px rgba(150, 70, 0, 0.3), 0 3px 6px rgba(4, 2, 12, 0.6), 0 0 18px rgba(255, 210, 63, 0.35)",
  "--button-shine-pressed":
    "inset 0 1px 1px rgba(255, 255, 255, 0.6), inset 0 -2px 5px rgba(150, 70, 0, 0.4), 0 1px 3px rgba(4, 2, 12, 0.6)",
  "--sweep-color": "rgba(255, 255, 240, 0.6)",
  "--tab-bg": "linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0) 60%), #170e2e",
  "--tab-active-bg":
    "radial-gradient(70% 30% at 50% 8%, rgba(255, 255, 240, 0.75), rgba(255, 255, 240, 0) 100%), linear-gradient(180deg, #fff09a 0%, #ffd23f 50%, #ffa62b 100%)",
  "--tab-active-text": "#0e0820",
  "--bar-bg": "linear-gradient(180deg, #160d2d, #0e0820)",
  "--bottom-bar-bg":
    "radial-gradient(120% 160% at 50% 0%, rgba(255, 95, 162, 0.1), rgba(255, 95, 162, 0) 55%), linear-gradient(180deg, #1d1238, #0a0618)",
  "--bottom-bar-shine": "inset 0 1px 0 rgba(255, 95, 162, 0.55), 0 -8px 18px rgba(4, 2, 12, 0.7)",
  "--unread-edge": "#ff5fa2",
  "--page-bg": "transparent",
  "--page-glare":
    "radial-gradient(45% 30% at 0% 10%, rgba(255, 95, 162, 0.16), rgba(255, 95, 162, 0) 70%), radial-gradient(45% 30% at 100% 40%, rgba(95, 212, 255, 0.13), rgba(95, 212, 255, 0) 70%), radial-gradient(50% 30% at 15% 95%, rgba(255, 210, 63, 0.1), rgba(255, 210, 63, 0) 70%), radial-gradient(40% 25% at 95% 100%, rgba(140, 255, 120, 0.08), rgba(140, 255, 120, 0) 70%), #0e0820",
  "--shadow-rgb": "4, 2, 12",
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
  // Punto 83: contraste sobre fondos claros. Desactivado casi opaco (la
  // opacidad mezcla el texto ciruela con el rosa de atrás); en los editores
  // de Momentos (velo negro) el botón activo es perla, como los
  // principales; Nuevo / Usado en verde y naranja oscuros.
  "--disabled-opacity": "0.85",
  "--veil-active-bg": "#fff3f7",
  "--veil-notice-bg": "#fff3f7",
  "--veil-error-text": "#ff7fae",
  "--badge-new-bg": "rgba(20, 107, 52, 0.14)",
  "--badge-new-text": "#0f5a2b",
  "--badge-used-bg": "rgba(138, 61, 0, 0.14)",
  "--badge-used-text": "#7a3500",
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
    vars: ARCOIRIS_VARS,
    // Activa .pt-relief (index.css) en los botones amarillo sol.
    relief: true,
  },
  oceano: {
    labelKey: "theme.oceano",
    emoji: "🌊",
    vars: OCEANO_VARS,
    // Activa .pt-relief (index.css) en los botones de espuma.
    relief: true,
  },
  atardecer: {
    labelKey: "theme.atardecer",
    emoji: "🌅",
    vars: ATARDECER_VARS,
    // Activa .pt-relief (index.css) en los botones naranja brasa.
    relief: true,
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
  // Ángel (punto 85): clave "angel" (sin tilde), en firestore.rules. Ícono
  // propio (AngelWingsIcon.jsx) y, solo en este tema, íconos de línea en la
  // barra inferior (lineIcons, App.js).
  angel: {
    labelKey: "theme.angel",
    vars: ANGEL_VARS,
    relief: true,
    lineIcons: true,
    metaColor: "#fbfafc",
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

// Generador pseudoaleatorio fijo (mulberry32): misma semilla, misma serie.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Orden de los temas en el bloque número "block" (una mezcla fija por
// bloque, Fisher-Yates con la semilla del bloque).
function rotativeBlockOrder(keys, block) {
  const order = keys.slice();
  const rand = seededRandom(Math.imul(block, 2654435761) ^ 0x9e3779b9);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Tema del día del Rotativo (punto 85). Los días se cuentan desde
// 1970-01-01 por fecha del calendario local (sin saltos por el horario de
// verano) y se agrupan en bloques de tantos días como temas: cada bloque
// usa todos los temas una vez, en un orden mezclado distinto. Antes era
// día del año % cantidad de temas, que con 7 temas dejaba cada tema
// siempre en el mismo día de la semana. Si un bloque empieza con el tema
// con el que terminó el anterior, se cambian sus dos primeros, así nunca
// se repite el mismo tema dos días seguidos.
export function getRotativeThemeKey(date = new Date()) {
  const keys = getThemeKeys();
  const n = keys.length;
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const block = Math.floor(day / n);
  const order = rotativeBlockOrder(keys, block);
  if (n > 1 && order[0] === rotativeBlockOrder(keys, block - 1)[n - 1]) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order[day - block * n];
}

// Clave del tema que se ve: la elegida, o la del día si es "rotativo".
export function resolveThemeKey(key) {
  const resolved = key === ROTATIVO_KEY ? getRotativeThemeKey() : key;
  return THEMES[resolved] ? resolved : DEFAULT_THEME_KEY;
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
  const theme = THEMES[resolveThemeKey(key)];
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
