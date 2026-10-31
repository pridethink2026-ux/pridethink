import React, { useState, useEffect, useRef, Suspense } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useUserProfile } from "./AllUsersContext";
import AuthProfile from "./AuthProfile";
import Feed from "./Feed";
import Notifications, { useNotifications, NotificationsScreen } from "./Notifications";
import MomentViewer from "./MomentViewer";
import HomeIcon from "./HomeNavIcon";
import { lazyWithReload, LoadErrorBoundary, ScreenLoading } from "./lazyLoad";
import { useIsMobile } from "./utils";
import { useOnlinePresence } from "./presence";
import { useLanguage } from "./LanguageContext";
import { THEMES, ROTATIVO_KEY } from "./themes";
import { useTheme } from "./ThemeContext";
import { playThemeSound } from "./themeSounds";
import PinkyHeartIcon from "./PinkyHeartIcon";

/*
  App
  ---
  Navegación principal. En escritorio: barra superior con pestañas
  (Perfil / Muro / Chat / Buscar) + botón de temas + campanita de
  notificaciones. En pantallas angostas (móvil): la barra superior se
  reduce a logo + botón de temas, y las pestañas + notificaciones se
  mueven a una barra de navegación fija inferior tipo app (Muro / Buscar /
  Chat / Notificaciones / Perfil), con puntito rojo si hay avisos sin leer.

  Los perfiles públicos (UserProfile), la pantalla de "Guardados"
  (SavedPosts), una publicación individual (PostView, a donde se navega
  al tocar la vista previa de un post compartido en el chat), un grupo
  específico (GroupView, a donde se navega desde la pestaña "Grupos" del
  muro) y un evento específico (EventView, a donde se navega desde la
  pestaña "Eventos" del muro) se abren todas como una vista superpuesta,
  con el mismo patrón: se guarda qué se está viendo en un estado aparte
  ("viewingProfileUid" / "viewingSaved" / "viewingPostId" /
  "viewingGroupId" / "viewingEventId") y se restaura la pestaña anterior
  al volver, sin perder en qué pestaña estabas. Las cinco son mutuamente
  excluyentes: abrir una cierra las otras cuatro.
*/

// Pantallas que bajan aparte, recién al abrirlas (punto 68, commit 8).
// Perfil y Muro quedan en el archivo de la app: son la primera pantalla
// (Perfil) y la que más se usa, y el perfil ya trae el muro (PostCard).
// MomentViewer también, porque lo usa la tira de Momentos del muro.
const Chat = lazyWithReload(() => import(/* webpackChunkName: "chat" */ "./Chat"));
const Search = lazyWithReload(() => import(/* webpackChunkName: "search" */ "./Search"));
const StoreScreen = lazyWithReload(() => import(/* webpackChunkName: "store" */ "./StoreScreen"));
const UserProfile = lazyWithReload(() => import(/* webpackChunkName: "user-profile" */ "./UserProfile"));
const SavedPosts = lazyWithReload(() => import(/* webpackChunkName: "saved" */ "./SavedPosts"));
const PostView = lazyWithReload(() => import(/* webpackChunkName: "post" */ "./PostView"));
const GroupView = lazyWithReload(() => import(/* webpackChunkName: "group" */ "./GroupView"));
const EventView = lazyWithReload(() => import(/* webpackChunkName: "event" */ "./EventView"));

// Las etiquetas de las pestañas dependen del idioma activo (LanguageContext),
// así que se arman con "t" en vez de ser un arreglo fijo a nivel de módulo.
function getDesktopTabs(t) {
  return [
    { key: "perfil", label: t("nav.profile") },
    { key: "feed", label: t("nav.wall") },
    { key: "chat", label: t("nav.chat") },
    { key: "buscar", label: t("nav.search") },
    { key: "tienda", label: t("nav.store") },
  ];
}

function getBottomTabs(t) {
  return [
    { key: "feed", label: t("nav.wall"), icon: "🏠" },
    { key: "buscar", label: t("nav.search"), icon: "🔍" },
    { key: "chat", label: t("nav.chat"), icon: "💬" },
    { key: "notificaciones", label: t("nav.alerts"), icon: "🔔" },
    { key: "tienda", label: t("nav.store"), icon: "🛍️" },
    { key: "perfil", label: t("nav.profile"), icon: "👤" },
  ];
}

// Ícono de la pestaña "Tienda": una bolsa de compras trazada (SVG, no
// emoji — a diferencia de "buscar"/"chat"/"notificaciones"/"perfil", que
// todavía usan el emoji fijo de getBottomTabs de arriba, este ícono nuevo
// se pidió explícitamente en SVG). currentColor hereda el color
// activo/inactivo que ya calcula el botón que lo contiene (mismo truco
// que MicIcon/StickerIcon en Chat.jsx), así que no necesita su propia
// prop "active".
function StoreIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8h12l1 12.5a2 2 0 0 1-2 1.5H7a2 2 0 0 1-2-1.5L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

const navStyles = {
  bar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    padding: "14px 20px",
    background: "var(--bar-bg)",
    borderBottom: "1px solid var(--border)",
  },
  buttonsGroup: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "8px",
    flex: "1 1 auto",
    order: 2,
  },
  button: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 20px",
    borderRadius: "999px",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--tab-active-bg)" : "var(--tab-bg)",
    boxShadow: active ? "var(--button-shine)" : "var(--chip-shine)",
    color: active ? "var(--tab-active-text)" : "var(--text-muted)",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  }),
  actionsSlot: {
    flexShrink: 0,
    order: 3,
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  logoSlot: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
    order: 1,
  },
  logoImg: {
    width: "30px",
    height: "30px",
    borderRadius: "8px",
  },
  logoText: {
    fontFamily: "var(--font-display)",
    fontSize: "17px",
    fontWeight: 700,
    whiteSpace: "nowrap",
    background: "var(--gradient-text)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  },
};

const themeStyles = {
  wrapper: { position: "relative" },
  themeBtn: {
    position: "relative",
    background: "var(--theme-btn-bg)",
    border: "1.5px solid var(--theme-btn-border)",
    boxShadow: "0 2px 6px rgba(var(--shadow-rgb), 0.25)",
    borderRadius: "999px",
    width: "40px",
    height: "40px",
    fontSize: "16px",
    cursor: "pointer",
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    position: "absolute",
    top: "48px",
    right: 0,
    width: "200px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "18px",
    padding: "8px",
    zIndex: 20,
    boxShadow: "0 10px 30px rgba(var(--shadow-rgb), 0.4)",
  },
  // Cada opción es un <button>: ancho completo, sin borde y con la
  // fuente de la app (los botones no la heredan solos).
  option: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    border: "none",
    fontFamily: "inherit",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: "10px",
    background: active ? "var(--accent2-soft)" : "transparent",
    color: active ? "var(--accent2)" : "var(--text)",
    fontSize: "13px",
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    marginBottom: "2px",
  }),
  animatedIcon: { display: "inline-block" },
  dropIcon: { display: "flex" },
};

const bannerStyles = {
  wrap: {
    padding: "0 20px",
    boxSizing: "border-box",
  },
  banner: {
    position: "relative",
    overflow: "hidden",
    display: "grid",
    gridTemplateColumns: "26px 1fr 26px",
    alignItems: "center",
    gap: "12px",
    maxWidth: "900px",
    margin: "16px auto 0",
    padding: "16px 18px",
    borderRadius: "18px",
    background: "var(--gradient-primary)",
    boxShadow: "0 8px 24px rgba(var(--shadow-rgb), 0.25), var(--button-shine)",
    boxSizing: "border-box",
  },
  // Overlay del shimmer: cubre toda la tarjeta (position absolute, no
  // participa del grid) por DEBAJO del texto/botón en el orden del DOM, así
  // el brillo pasa "detrás" del contenido sin taparlo. La animación en sí
  // (@keyframes pt-banner-shine) vive en index.css porque un keyframe no se
  // puede expresar como inline style.
  shine: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
  spacer: {
    width: "26px",
    height: "1px",
  },
  text: {
    position: "relative",
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: "15px",
    fontWeight: 700,
    color: "var(--on-primary)",
    lineHeight: 1.3,
    textAlign: "center",
  },
  closeBtn: {
    position: "relative",
    flexShrink: 0,
    width: "26px",
    height: "26px",
    borderRadius: "999px",
    border: "none",
    background: "rgba(0,0,0,0.15)",
    color: "var(--on-primary)",
    fontSize: "15px",
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};

const bottomNavStyles = {
  bar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    background: "var(--bottom-bar-bg)",
    borderTop: "1px solid var(--border)",
    boxShadow: "var(--bottom-bar-shine)",
    zIndex: 30,
  },
  btn: (active) => ({
    flex: 1,
    background: "none",
    border: "none",
    padding: "8px 0 10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    cursor: "pointer",
    color: active ? "var(--accent2)" : "var(--text-muted)",
  }),
  iconWrap: { position: "relative", fontSize: "19px", lineHeight: 1 },
  dot: {
    position: "absolute",
    top: "-3px",
    right: "-6px",
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    background: "var(--accent2)",
    border: "2px solid var(--surface)",
  },
  label: { fontSize: "10px", fontWeight: 600 },
};

// Ícono del botón que abre el selector de temas: gota de acuarela con
// degradado arcoíris (punta roja → violeta abajo) y brillo blanco curvo,
// sobre una mancha de pintura de la que salen chorros que se afinan en
// curva y terminan en una bolita, más unos puntitos sueltos — redibujo
// simplificado de referencia-boton-temas.jpeg (2026-10-31). Los chorros
// son pocos y gruesos a propósito: a 28px tienen que leerse como
// "salpicó pintura", no como ruido. El amarillo queda solo dentro de la
// gota porque sobre el botón blanco de Pinky se pierde. Colores fijos a
// propósito (misma excepción que las banderas pride/el ícono de
// Arcoíris): no se pueden derivar de las 2 variables --accent/--accent2
// del tema activo. El SVG es estático: el rebote y la explosión al abrir el
// menú los pone ThemeMenu (BURST_PIECES).
const PAINT_DROP_PATH =
  "M16 6.4C19.1 10.8 22.9 14.7 22.9 19.8A6.9 6.9 0 1 1 9.1 19.8C9.1 14.7 12.9 10.8 16 6.4z";

function PaintDropIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="paint-drop-rainbow" x1="13" y1="7.5" x2="20" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff3d57" />
          <stop offset="22%" stopColor="#ff8a2a" />
          <stop offset="42%" stopColor="#ffd23a" />
          <stop offset="62%" stopColor="#36c96e" />
          <stop offset="80%" stopColor="#2f8bff" />
          <stop offset="100%" stopColor="#8a4dff" />
        </linearGradient>
        <radialGradient id="paint-drop-wash" cx="13.5" cy="14" r="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff" stopOpacity=".3" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="paint-drop-splash" x1="7" y1="0" x2="25" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#36c96e" />
          <stop offset="30%" stopColor="#ff8a2a" />
          <stop offset="70%" stopColor="#2f8bff" />
          <stop offset="100%" stopColor="#8a4dff" />
        </linearGradient>
      </defs>
      {/* Mancha de pintura detrás de la gota, de donde nacen los chorros */}
      <path d="M7.4 18.6C8.6 15.2 12 14.6 16 15.4C20.2 14.6 23.6 15.4 24.6 18.4C25.6 21.6 23 24.6 19.6 25.4C17.2 26.2 14.4 26.2 12 25.4C8.8 24.4 6.4 21.6 7.4 18.6z" fill="url(#paint-drop-splash)" opacity=".92" />
      {/* Chorros: cálidos a la izquierda, fríos a la derecha, goteos abajo */}
      <path d="M17 12.4Q12.3 6.9 7.1 3.4L6.5 3.8Q10.6 8.2 13 15.6z" fill="#ff3d57" />
      <circle cx="6.8" cy="3.6" r="1.2" fill="#ff3d57" />
      <path d="M14.6 14.9Q9 12.4 4 11.1L3.6 11.7Q8 14.1 12.2 19.1z" fill="#ff8a2a" />
      <circle cx="3.8" cy="11.4" r="1" fill="#ff8a2a" />
      <path d="M13.3 18.6Q7.4 18.7 2.4 19.4L2.4 20.2Q7.1 20.7 12.7 23.4z" fill="#36c96e" />
      <circle cx="2.4" cy="19.8" r="1.15" fill="#36c96e" />
      <path d="M18.9 15.8Q22.1 8.6 26.7 4.7L26.1 4.1Q20.5 7.1 15.1 12.2z" fill="#8a4dff" />
      <circle cx="26.4" cy="4.4" r="1.2" fill="#8a4dff" />
      <path d="M19.3 20.3Q24.6 16.3 29.5 14.9L29.3 14.3Q24 14.4 17.9 15.7z" fill="#2f8bff" />
      <circle cx="29.4" cy="14.6" r="1.05" fill="#2f8bff" />
      <path d="M12.1 23.3Q10.4 26.5 9.2 29.2L9.6 29.6Q11.5 27.4 14.9 25.7z" fill="#2f8bff" />
      <circle cx="9.4" cy="29.4" r="0.95" fill="#2f8bff" />
      <path d="M17.7 25.5Q20.8 27.3 22.4 29.4L22.8 29Q21.8 26.4 20.3 23.5z" fill="#8a4dff" />
      <circle cx="22.6" cy="29.2" r="0.85" fill="#8a4dff" />
      {/* Puntitos sueltos */}
      <circle cx="21.6" cy="3.4" r="0.95" fill="#1fb5ad" />
      <circle cx="10.8" cy="2.6" r="0.8" fill="#b37dff" />
      <circle cx="27.6" cy="22.6" r="1.1" fill="#ff7a5c" />
      <circle cx="4.2" cy="25" r="0.85" fill="#1fb5ad" />
      {/* Gota + velo de acuarela + borde apenas marcado */}
      <path d={PAINT_DROP_PATH} fill="url(#paint-drop-rainbow)" />
      <path d={PAINT_DROP_PATH} fill="url(#paint-drop-wash)" />
      <path d={PAINT_DROP_PATH} fill="none" stroke="#c4123f" strokeOpacity=".35" strokeWidth=".6" />
      {/* Brillo blanco curvo sobre el borde superior izquierdo */}
      <path d="M14.5 10.2C13 12.3 11.8 14.6 11.6 17.4" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity=".92" />
      <circle cx="11.7" cy="20" r=".8" fill="#fff" opacity=".92" />
    </svg>
  );
}

// Explosión de pintura al abrir el menú de temas (2026-10-31, reemplaza a
// los 5 puntitos de 6px que casi no se notaban). Cada pieza sale disparada
// desde el centro del botón: "a" es el ángulo (0 = arriba, sentido
// horario), "d" la distancia en px, "w"/"h" el tamaño y "delay" un
// escalonado mínimo. "streak" son chorros alargados que se estiran en la
// dirección del disparo; "dot" son puntitos y manchas que se agrandan un
// poco. Todo se desvanece (ver @keyframes pt-paint-burst* en index.css).
// Ángulos y distancias irregulares a propósito (más masa hacia arriba y a
// los lados, como el abanico de la referencia): si son simétricos se lee
// como un sol o un fuego artificial, no como pintura.
// Mismos colores fijos que PaintDropIcon y la referencia (arcoíris +
// turquesa, lila y coral). El amarillo es un dorado más oscuro para que no
// se pierda sobre el rosa claro de Pinky.
const BURST_PIECES = [
  { kind: "streak", a: -30, d: 50, w: 5.5, h: 17, color: "#ff3d57", delay: 0 },
  { kind: "streak", a: -8, d: 42, w: 4, h: 11, color: "#f2b100", delay: 20 },
  { kind: "streak", a: 22, d: 52, w: 5.5, h: 17, color: "#8a4dff", delay: 0 },
  { kind: "streak", a: -70, d: 48, w: 5, h: 15, color: "#ff8a2a", delay: 10 },
  { kind: "streak", a: -104, d: 40, w: 4.5, h: 12, color: "#36c96e", delay: 30 },
  { kind: "streak", a: 76, d: 46, w: 5, h: 15, color: "#2f8bff", delay: 10 },
  { kind: "streak", a: 112, d: 38, w: 4, h: 11, color: "#b37dff", delay: 40 },
  { kind: "streak", a: -165, d: 32, w: 4, h: 10, color: "#2f8bff", delay: 50 },
  { kind: "dot", a: -50, d: 33, w: 12, h: 10, color: "#ff7a5c", delay: 0 },
  { kind: "dot", a: 48, d: 30, w: 11, h: 10, color: "#1fb5ad", delay: 10 },
  { kind: "dot", a: -132, d: 30, w: 9, h: 8, color: "#ff3d57", delay: 30 },
  { kind: "dot", a: 150, d: 30, w: 8, h: 7, color: "#8a4dff", delay: 40 },
  { kind: "dot", a: -18, d: 60, w: 6, h: 6, color: "#1fb5ad", delay: 20 },
  { kind: "dot", a: 8, d: 58, w: 4, h: 4, color: "#ff7a5c", delay: 30 },
  { kind: "dot", a: 40, d: 62, w: 5, h: 5, color: "#b37dff", delay: 20 },
  { kind: "dot", a: -88, d: 60, w: 5, h: 5, color: "#ff3d57", delay: 40 },
  { kind: "dot", a: 95, d: 58, w: 6, h: 6, color: "#ff8a2a", delay: 30 },
  { kind: "dot", a: -142, d: 52, w: 5, h: 5, color: "#ff8a2a", delay: 60 },
  { kind: "dot", a: 130, d: 54, w: 4, h: 4, color: "#36c96e", delay: 60 },
];
// La pieza más tardía termina en 60 + 760 ms; se desmonta un poco después.
const BURST_DURATION_MS = 880;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Clase de animación en reposo por cada ícono de tema dentro del menú
// (mientras el menú está abierto, no requiere hover) — ver los
// @keyframes correspondientes en index.css. Todas son MUY sutiles y en
// loop, usando filter/transform (no "color": los emojis a color ignoran
// esa propiedad, mismo aprendizaje que el fix del ícono de guardar en
// Feed.jsx). El brillo de Noche/Atardecer usa un color fijo propio de
// CADA tema (no el tema activo) — representan una opción concreta del
// menú, no el estado actual, misma excepción que PaintDropIcon.
const THEME_ICON_ANIM_CLASS = {
  noche: "pt-theme-icon-noche",
  arcoiris: "pt-theme-icon-arcoiris",
  oceano: "pt-theme-icon-oceano",
  atardecer: "pt-theme-icon-atardecer",
  elegante: "pt-theme-icon-elegante",
};

// Temas cuyo ícono es un SVG propio en vez del emoji (punto 73): 🩷 no
// existe en sistemas viejos. Pinky queda quieto en el menú (sin clase de
// animación): no se suman animaciones en bucle.
const THEME_SVG_ICONS = {
  pinky: PinkyHeartIcon,
};

function ThemeMenu() {
  const { t } = useLanguage();
  const { themeKey: selected, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  // { id, x, y } de la explosión en curso (centro del botón en la
  // ventana), o null. El id cambia en cada apertura para reiniciar las
  // animaciones aunque se toque de nuevo antes de que terminen.
  const [burst, setBurst] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!burst) return undefined;
    const timer = setTimeout(() => setBurst(null), BURST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [burst]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (key) => {
    setTheme(key);
    // Suena UNA sola vez al confirmar (nunca en hover ni en loop) — si key
    // es ROTATIVO_KEY, playThemeSound reconoce el tick neutro por su
    // propia clave ("rotativo"), sin importar qué tema resuelva ese día.
    playThemeSound(key);
    setOpen(false);
  };

  return (
    <div style={themeStyles.wrapper} ref={panelRef}>
      <button
        style={themeStyles.themeBtn}
        aria-label={t("nav.theme")}
        aria-expanded={open}
        onClick={(e) => {
          const willOpen = !open;
          setOpen(willOpen);
          // La explosión solo se dispara al ABRIR (no al cerrar ni al
          // seleccionar un tema), una vez por toque — mismo patrón que
          // "likePop" en PostCard (Feed.jsx): un estado corto que se apaga
          // solo, sin dejar nada animando de fondo. Con "reducir
          // movimiento" no se monta nada.
          if (willOpen && !prefersReducedMotion()) {
            const r = e.currentTarget.getBoundingClientRect();
            setBurst({ id: Date.now(), x: r.left + r.width / 2, y: r.top + r.height / 2 });
          }
        }}
      >
        {/* El key reinicia el rebote en cada apertura */}
        <span
          key={burst ? burst.id : "idle"}
          className={burst ? "pt-paint-drop-bounce" : undefined}
          style={themeStyles.dropIcon}
        >
          <PaintDropIcon />
        </span>
      </button>
      {/* Capa fija (no suma scroll horizontal aunque las piezas salgan de
          la pantalla), sin clics y por debajo del panel del menú. */}
      {burst && (
        <div
          key={burst.id}
          className="pt-paint-burst"
          style={{ left: burst.x, top: burst.y }}
          aria-hidden="true"
        >
          {BURST_PIECES.map((p, i) => (
            <span
              key={i}
              className={p.kind === "streak" ? "pt-paint-burst-streak" : "pt-paint-burst-dot"}
              style={{
                width: p.w,
                height: p.h,
                marginLeft: -p.w / 2,
                marginTop: -p.h / 2,
                background: p.color,
                "--a": `${p.a}deg`,
                "--d": `${-p.d}px`,
                animationDelay: `${p.delay}ms`,
              }}
            />
          ))}
        </div>
      )}
      {open && (
        <div style={themeStyles.panel}>
          {Object.entries(THEMES).map(([key, theme]) => {
            const SvgIcon = THEME_SVG_ICONS[key];
            return (
              <button
                type="button"
                key={key}
                style={themeStyles.option(selected === key)}
                aria-pressed={selected === key}
                onClick={() => handleSelect(key)}
              >
                <span
                  className={THEME_ICON_ANIM_CLASS[key]}
                  style={themeStyles.animatedIcon}
                  aria-hidden="true"
                >
                  {SvgIcon ? <SvgIcon /> : theme.emoji}
                </span>
                <span>{t(theme.labelKey)}</span>
              </button>
            );
          })}
          <button
            type="button"
            style={themeStyles.option(selected === ROTATIVO_KEY)}
            aria-pressed={selected === ROTATIVO_KEY}
            onClick={() => handleSelect(ROTATIVO_KEY)}
          >
            <span
              className="pt-theme-icon-rotativo"
              style={themeStyles.animatedIcon}
              aria-hidden="true"
            >
              🔄
            </span>{" "}
            {t("nav.themeRotating")}
          </button>
        </div>
      )}
    </div>
  );
}

function BottomNav({ active, unreadCount, onNavigate, myIdentity }) {
  const { t } = useLanguage();
  return (
    <nav style={bottomNavStyles.bar} aria-label={t("nav.main")}>
      {getBottomTabs(t).map((tab) => {
        const isActive = active === tab.key;
        const hasUnread = tab.key === "notificaciones" && unreadCount > 0;
        return (
          <button
            key={tab.key}
            style={bottomNavStyles.btn(isActive)}
            aria-current={isActive ? "page" : undefined}
            aria-label={hasUnread ? t("nav.alertsUnread", { n: unreadCount }) : undefined}
            onClick={() => onNavigate(tab.key)}
          >
            <span style={bottomNavStyles.iconWrap} aria-hidden="true">
              {tab.key === "feed" ? (
                <HomeIcon identityText={myIdentity} active={isActive} size={19} />
              ) : tab.key === "tienda" ? (
                <StoreIcon size={19} />
              ) : (
                tab.icon
              )}
              {hasUnread && <span style={bottomNavStyles.dot} />}
            </span>
            <span style={bottomNavStyles.label}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Banner motivacional, compartido por TODAS las pantallas principales
// (Muro, Perfil, Chat, Buscar, y las vistas superpuestas) — antes vivía
// solo dentro de Feed.jsx (2026-07-28), se subió acá para que el estado
// de "cerrado" sea uno solo para toda la app, no repetido por pantalla:
// cerrarlo en cualquier lado lo cierra en todos lados durante la misma
// sesión (bannerDismissed, estado de React de App(), sin localStorage a
// propósito — al recargar o volver a entrar más tarde, vuelve a aparecer).
function MotivationalBanner({ onClose, t }) {
  return (
    <div style={bannerStyles.wrap}>
      <div style={bannerStyles.banner}>
        <span className="pt-banner-shine" style={bannerStyles.shine} aria-hidden="true" />
        <span aria-hidden="true" style={bannerStyles.spacer} />
        <p style={bannerStyles.text}>{t("nav.motivationalBanner")}</p>
        <button
          type="button"
          style={bannerStyles.closeBtn}
          onClick={onClose}
          aria-label={t("nav.closeBanner")}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function App() {
  const isMobile = useIsMobile();
  const { t } = useLanguage();
  const [view, setView] = useState("perfil"); // "perfil" | "feed" | "chat" | "buscar" | "notificaciones"
  const [currentUid, setCurrentUid] = useState(null);
  const [viewingProfileUid, setViewingProfileUid] = useState(null);
  const [viewingSaved, setViewingSaved] = useState(false);
  const [viewingPostId, setViewingPostId] = useState(null);
  const [viewingGroupId, setViewingGroupId] = useState(null);
  const [viewingEventId, setViewingEventId] = useState(null);
  // Producto pendiente de abrir dentro de la Tienda al llegar desde un
  // regalo en el chat (GiftNotification.jsx -> onOpenProduct). La Tienda
  // no es un overlay de App.js (StoreScreen.jsx maneja su propia
  // navegación interna a ProductDetailScreen — ver su docstring), así
  // que cruzar de "chat" a "un producto puntual de la tienda" necesita
  // este puente: se cambia de pestaña Y se le pasa el id a StoreScreen,
  // que lo consume una vez (onConsumeStoreProduct) para no reabrir el
  // mismo producto si el usuario vuelve a la lista y sale de nuevo.
  const [storeProductId, setStoreProductId] = useState(null);
  // Mismo puente que storeProductId, para la pestaña Chat: uid de la
  // persona cuya conversación hay que abrir al llegar desde una
  // notificación de mensaje (Notifications.jsx -> onOpenChat). Chat.jsx lo
  // consume una vez (onConsumeInitialContactUid).
  const [chatContactUid, setChatContactUid] = useState(null);
  // Momento propio a abrir al tocar una notificación "momentLike" (punto
  // 66, commit 6). El visor se abre encima de cualquier pantalla, sin
  // cambiar de pestaña.
  const [momentToOpen, setMomentToOpen] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { unreadCount } = useNotifications(currentUid);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUid(u ? u.uid : null));
    return unsub;
  }, []);

  // Marca "en línea" mientras haya sesión (con latido periódico para que
  // "lastSeen" no quede viejo) y, al mejor esfuerzo, "offline" al cerrar
  // la pestaña — ver presence.js. El cierre de sesión EXPLÍCITO (botón
  // "Cerrar sesión") se marca aparte en AuthProfile.jsx, antes de
  // signOut(auth) (una vez cerrada la sesión, la escritura ya no pasaría
  // las reglas de Firestore).
  useOnlinePresence(currentUid);

  // En vivo, para que el icono de Inicio cambie al instante si el usuario
  // edita su identidad (AuthProfile.jsx). Sale de AllUsersContext, sin un
  // listener propio sobre users/{uid} (punto 70, commit 9c).
  const myIdentity = useUserProfile(currentUid)?.identity || "";

  // Las cinco vistas superpuestas (perfil público, guardados, post
  // individual, grupo, evento) son mutuamente excluyentes: abrir cualquiera
  // cierra las otras cuatro.
  const openProfile = (uid) => {
    setViewingProfileUid(uid);
    setViewingSaved(false);
    setViewingPostId(null);
    setViewingGroupId(null);
    setViewingEventId(null);
  };
  const closeProfile = () => setViewingProfileUid(null);

  const openSaved = () => {
    setViewingSaved(true);
    setViewingProfileUid(null);
    setViewingPostId(null);
    setViewingGroupId(null);
    setViewingEventId(null);
  };
  const closeSaved = () => setViewingSaved(false);

  const openPost = (postId) => {
    setViewingPostId(postId);
    setViewingProfileUid(null);
    setViewingSaved(false);
    setViewingGroupId(null);
    setViewingEventId(null);
  };
  const closePost = () => setViewingPostId(null);

  const openGroup = (groupId) => {
    setViewingGroupId(groupId);
    setViewingProfileUid(null);
    setViewingSaved(false);
    setViewingPostId(null);
    setViewingEventId(null);
  };
  const closeGroup = () => setViewingGroupId(null);

  const openEvent = (eventId) => {
    setViewingEventId(eventId);
    setViewingProfileUid(null);
    setViewingSaved(false);
    setViewingPostId(null);
    setViewingGroupId(null);
  };
  const closeEvent = () => setViewingEventId(null);

  const navigate = (key) => {
    setView(key);
    closeProfile();
    setViewingSaved(false);
    setViewingPostId(null);
    setViewingGroupId(null);
    setViewingEventId(null);
    setStoreProductId(null);
    setChatContactUid(null);
  };

  // Desde un mensaje de regalo en el chat (GiftNotification.jsx): cambia
  // a la pestaña Tienda y le pide a StoreScreen que abra ESE producto
  // directamente, sin pasar por su lista principal.
  const openStoreProduct = (productId) => {
    setView("tienda");
    closeProfile();
    setViewingSaved(false);
    setViewingPostId(null);
    setViewingGroupId(null);
    setViewingEventId(null);
    setStoreProductId(productId);
  };

  // Desde una notificación de mensaje: cambia a la pestaña Chat y le pide
  // que abra la conversación con esa persona (mismo patrón que
  // openStoreProduct de arriba).
  const openChat = (uid) => {
    setView("chat");
    closeProfile();
    setViewingSaved(false);
    setViewingPostId(null);
    setViewingGroupId(null);
    setViewingEventId(null);
    setChatContactUid(uid);
  };

  let content;
  if (viewingPostId) {
    content = <PostView postId={viewingPostId} onBack={closePost} onOpenProfile={openProfile} />;
  } else if (viewingGroupId) {
    content = <GroupView groupId={viewingGroupId} onBack={closeGroup} onOpenProfile={openProfile} />;
  } else if (viewingEventId) {
    content = <EventView eventId={viewingEventId} onBack={closeEvent} onOpenProfile={openProfile} />;
  } else if (viewingSaved) {
    content = <SavedPosts onBack={closeSaved} onOpenProfile={openProfile} />;
  } else if (viewingProfileUid) {
    content = (
      <UserProfile uid={viewingProfileUid} onBack={closeProfile} onOpenProfile={openProfile} />
    );
  } else if (view === "feed") {
    content = <Feed onOpenProfile={openProfile} onOpenGroup={openGroup} onOpenEvent={openEvent} />;
  } else if (view === "chat") {
    content = (
      <Chat
        onOpenProfile={openProfile}
        onOpenPost={openPost}
        onOpenProduct={openStoreProduct}
        initialContactUid={chatContactUid}
        onConsumeInitialContactUid={() => setChatContactUid(null)}
      />
    );
  } else if (view === "buscar") {
    content = <Search onOpenProfile={openProfile} />;
  } else if (view === "tienda") {
    content = (
      <StoreScreen
        onOpenProfile={openProfile}
        initialProductId={storeProductId}
        onConsumeInitialProductId={() => setStoreProductId(null)}
        onGoToSearch={() => navigate("buscar")}
      />
    );
  } else if (view === "notificaciones") {
    content = (
      <NotificationsScreen
        onOpenProfile={openProfile}
        onOpenPost={openPost}
        onOpenProduct={openStoreProduct}
        onOpenChat={openChat}
        onOpenMoment={setMomentToOpen}
      />
    );
  } else {
    content = <AuthProfile onOpenProfile={openProfile} onOpenSaved={openSaved} />;
  }

  // Para el resaltado de pestaña activa: ninguna pestaña se ve "activa"
  // mientras haya una vista superpuesta abierta (perfil público, guardados,
  // un post individual, un grupo o un evento).
  const anyOverlayOpen =
    !!viewingProfileUid || viewingSaved || !!viewingPostId || !!viewingGroupId || !!viewingEventId;

  return (
    <div style={{ paddingBottom: isMobile ? "62px" : 0 }}>
      <header style={navStyles.bar}>
        <div style={navStyles.logoSlot}>
          {/* alt vacío: el nombre ya está escrito al lado */}
          <img src="/logo-icon.webp" alt="" width="30" height="30" style={navStyles.logoImg} />
          <span style={navStyles.logoText}>Pridethink</span>
        </div>
        {!isMobile && (
          <nav style={navStyles.buttonsGroup} aria-label={t("nav.main")}>
            {getDesktopTabs(t).map((tab) => {
              const active = !anyOverlayOpen && view === tab.key;
              return (
                <button
                  key={tab.key}
                  className="pt-relief"
                  style={navStyles.button(active)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigate(tab.key)}
                >
                  {tab.key === "feed" && (
                    <HomeIcon identityText={myIdentity} active={active} onPill size={17} />
                  )}
                  {tab.key === "tienda" && <StoreIcon size={17} />}
                  {tab.label}
                </button>
              );
            })}
          </nav>
        )}
        <div style={navStyles.actionsSlot}>
          <ThemeMenu />
          {!isMobile && (
            <Notifications
              onOpenProfile={openProfile}
              onOpenPost={openPost}
              onOpenProduct={openStoreProduct}
              onOpenChat={openChat}
              onOpenMoment={setMomentToOpen}
            />
          )}
        </div>
      </header>

      {currentUid && !bannerDismissed && (
        <MotivationalBanner onClose={() => setBannerDismissed(true)} t={t} />
      )}

      <main
        key={
          viewingPostId
            ? `post-${viewingPostId}`
            : viewingGroupId
            ? `group-${viewingGroupId}`
            : viewingEventId
            ? `event-${viewingEventId}`
            : viewingSaved
            ? "saved"
            : viewingProfileUid
            ? `profile-${viewingProfileUid}`
            : view
        }
        className="pt-view-fade"
      >
        {/* Dentro de <main> con su key: al cambiar de pantalla se vuelven a
            montar, así un error en una no deja trabadas las demás. */}
        <LoadErrorBoundary>
          <Suspense fallback={<ScreenLoading />}>{content}</Suspense>
        </LoadErrorBoundary>
      </main>

      {currentUid && momentToOpen && (
        <MomentViewer
          key={momentToOpen}
          authorUids={[currentUid]}
          startMomentId={momentToOpen}
          onClose={() => setMomentToOpen(null)}
        />
      )}

      {isMobile && (
        <BottomNav
          active={anyOverlayOpen ? null : view}
          unreadCount={unreadCount}
          onNavigate={navigate}
          myIdentity={myIdentity}
        />
      )}
    </div>
  );
}

export default App;
