import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import AuthProfile from "./AuthProfile";
import Chat from "./Chat";
import Feed from "./Feed";
import Search from "./Search";
import UserProfile from "./UserProfile";
import SavedPosts from "./SavedPosts";
import PostView from "./PostView";
import GroupView from "./GroupView";
import EventView from "./EventView";
import Notifications, { useNotifications, NotificationsScreen } from "./Notifications";
import StoreScreen from "./StoreScreen";
import HomeIcon from "./HomeNavIcon";
import { useIsMobile } from "./utils";
import { useOnlinePresence } from "./presence";
import { useLanguage } from "./LanguageContext";
import {
  THEMES,
  ROTATIVO_KEY,
  applyTheme,
  saveThemePreference,
  initTheme,
} from "./themes";
import { playThemeSound } from "./themeSounds";

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
    background: "var(--bg)",
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
    background: active ? "var(--accent2-soft)" : "transparent",
    color: active ? "var(--accent2)" : "var(--text-muted)",
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
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
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
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    width: "38px",
    height: "38px",
    fontSize: "16px",
    cursor: "pointer",
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    position: "absolute",
    top: "46px",
    right: 0,
    width: "200px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "18px",
    padding: "8px",
    zIndex: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
  option: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
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
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
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
    color: "var(--bg)",
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
    color: "var(--bg)",
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
    background: "var(--surface)",
    borderTop: "1px solid var(--border)",
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

// Ícono del botón que abre el selector de temas: una gota de pintura con 3
// franjas diagonales de colores fijos (rosa/amarillo/celeste). Reemplaza al
// emoji 🎨 (2026-07-29). A propósito son solo 3 franjas grandes, no 6 como
// el ícono descartado del tema "Arcoíris" (que a 16px se leía como "sol o
// flor" en vez de arcoíris) — acá no hace falta leerse como un arcoíris
// real, solo como una gota de pintura multicolor, así que menos franjas más
// grandes se ven más claras a este tamaño. Colores fijos a propósito (misma
// excepción que las banderas pride/el ícono de Arcoíris): no se pueden
// derivar de las 2 variables --accent/--accent2 del tema activo.
function PaintDropIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <defs>
        <linearGradient id="paint-drop-gradient" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff4d9e" />
          <stop offset="33%" stopColor="#ff4d9e" />
          <stop offset="33%" stopColor="#ffd93c" />
          <stop offset="66%" stopColor="#ffd93c" />
          <stop offset="66%" stopColor="#3ca7ff" />
          <stop offset="100%" stopColor="#3ca7ff" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5c3.2 4.2 6.2 7.8 6.2 10.8A6.2 6.2 0 1 1 5.8 13.3C5.8 10.3 8.8 6.7 12 2.5z"
        fill="url(#paint-drop-gradient)"
      />
    </svg>
  );
}

// Puntitos del efecto "splash" al abrir el menú de temas: cada uno explota
// en una dirección distinta (--tx/--ty, ver @keyframes pt-paint-splash en
// index.css) — mismos colores fijos que PaintDropIcon, por el mismo motivo.
const SPLASH_DOTS = [
  { tx: "-16px", ty: "-14px", color: "#ff4d9e" },
  { tx: "16px", ty: "-14px", color: "#ffd93c" },
  { tx: "-18px", ty: "10px", color: "#3ca7ff" },
  { tx: "18px", ty: "10px", color: "#3ddc84" },
  { tx: "0px", ty: "-20px", color: "#a25bff" },
];
const SPLASH_DURATION_MS = 450;

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

function ThemeMenu() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("noche");
  const [splashing, setSplashing] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    setSelected(initTheme());
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (key) => {
    setSelected(key);
    saveThemePreference(key);
    applyTheme(key);
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
        onClick={() => {
          setOpen((v) => {
            const willOpen = !v;
            // El splash solo se dispara al ABRIR (no al cerrar ni al
            // seleccionar un tema) — mismo patrón que "likePop" en
            // PostCard (Feed.jsx): un estado corto que se apaga solo con
            // setTimeout, sin dejar nada animando de fondo.
            if (willOpen) {
              setSplashing(true);
              setTimeout(() => setSplashing(false), SPLASH_DURATION_MS);
            }
            return willOpen;
          });
        }}
      >
        <PaintDropIcon />
        {splashing &&
          SPLASH_DOTS.map((d, i) => (
            <span
              key={i}
              className="pt-paint-splash-dot"
              style={{ background: d.color, "--tx": d.tx, "--ty": d.ty }}
            />
          ))}
      </button>
      {open && (
        <div style={themeStyles.panel}>
          {Object.entries(THEMES).map(([key, theme]) => (
            <div
              key={key}
              style={themeStyles.option(selected === key)}
              onClick={() => handleSelect(key)}
            >
              <span className={THEME_ICON_ANIM_CLASS[key]} style={themeStyles.animatedIcon}>
                {theme.emoji}
              </span>
              <span>{theme.label}</span>
            </div>
          ))}
          <div
            style={themeStyles.option(selected === ROTATIVO_KEY)}
            onClick={() => handleSelect(ROTATIVO_KEY)}
          >
            <span className="pt-theme-icon-rotativo" style={themeStyles.animatedIcon}>
              🔄
            </span>{" "}
            {t("nav.themeRotating")}
          </div>
        </div>
      )}
    </div>
  );
}

function BottomNav({ active, unreadCount, onNavigate, myIdentity }) {
  const { t } = useLanguage();
  return (
    <div style={bottomNavStyles.bar}>
      {getBottomTabs(t).map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            style={bottomNavStyles.btn(isActive)}
            onClick={() => onNavigate(tab.key)}
          >
            <span style={bottomNavStyles.iconWrap}>
              {tab.key === "feed" ? (
                <HomeIcon identityText={myIdentity} active={isActive} size={19} />
              ) : tab.key === "tienda" ? (
                <StoreIcon size={19} />
              ) : (
                tab.icon
              )}
              {tab.key === "notificaciones" && unreadCount > 0 && (
                <span style={bottomNavStyles.dot} />
              )}
            </span>
            <span style={bottomNavStyles.label}>{tab.label}</span>
          </button>
        );
      })}
    </div>
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
  const [myIdentity, setMyIdentity] = useState("");
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

  // Se escucha en tiempo real para que el icono de Inicio cambie al
  // instante si el usuario edita su identidad (AuthProfile.jsx).
  useEffect(() => {
    if (!currentUid) {
      setMyIdentity("");
      return;
    }
    const unsub = onSnapshot(doc(db, "users", currentUid), (snap) => {
      setMyIdentity(snap.exists() ? snap.data().identity || "" : "");
    });
    return unsub;
  }, [currentUid]);

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
    content = <Chat onOpenProfile={openProfile} onOpenPost={openPost} onOpenProduct={openStoreProduct} />;
  } else if (view === "buscar") {
    content = <Search onOpenProfile={openProfile} />;
  } else if (view === "tienda") {
    content = (
      <StoreScreen
        onOpenProfile={openProfile}
        initialProductId={storeProductId}
        onConsumeInitialProductId={() => setStoreProductId(null)}
      />
    );
  } else if (view === "notificaciones") {
    content = <NotificationsScreen onOpenProfile={openProfile} onOpenPost={openPost} />;
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
      <div style={navStyles.bar}>
        <div style={navStyles.logoSlot}>
          <img src="/logo-icon.png" alt="Pridethink" style={navStyles.logoImg} />
          <span style={navStyles.logoText}>Pridethink</span>
        </div>
        {!isMobile && (
          <div style={navStyles.buttonsGroup}>
            {getDesktopTabs(t).map((tab) => {
              const active = !anyOverlayOpen && view === tab.key;
              return (
                <button
                  key={tab.key}
                  style={navStyles.button(active)}
                  onClick={() => navigate(tab.key)}
                >
                  {tab.key === "feed" && (
                    <HomeIcon identityText={myIdentity} active={active} size={17} />
                  )}
                  {tab.key === "tienda" && <StoreIcon size={17} />}
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
        <div style={navStyles.actionsSlot}>
          <ThemeMenu />
          {!isMobile && <Notifications onOpenProfile={openProfile} onOpenPost={openPost} />}
        </div>
      </div>

      {currentUid && !bannerDismissed && (
        <MotivationalBanner onClose={() => setBannerDismissed(true)} t={t} />
      )}

      <div
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
        {content}
      </div>

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
