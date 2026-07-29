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
  ];
}

function getBottomTabs(t) {
  return [
    { key: "feed", label: t("nav.wall"), icon: "🏠" },
    { key: "buscar", label: t("nav.search"), icon: "🔍" },
    { key: "chat", label: t("nav.chat"), icon: "💬" },
    { key: "notificaciones", label: t("nav.alerts"), icon: "🔔" },
    { key: "perfil", label: t("nav.profile"), icon: "👤" },
  ];
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

// Ícono del tema "Arcoíris" en el selector: una gota de pintura
// salpicando, en vez del emoji 🌈. Rediseñado (2026-07-28) con colores de
// arcoíris DE VERDAD (rojo/naranja/amarillo/verde/azul/violeta) en vez de
// solo los 2 acentos del tema — necesarios para que se lea como "arcoíris"
// de un vistazo, y por eso mismo TIENEN que ser fijos: los 6 tonos no se
// pueden derivar de las 2 variables --accent/--accent2 que define el
// sistema de temas, así que esto no puede adaptarse al tema activo aunque
// quisiera (misma excepción que las banderas pride de identityStyles.js).
//
// Diseño: una gota dividida en 6 franjas de color (en vez de 6 puntitos
// sueltos) + solo 3 salpicaduras grandes afuera. Se probó primero una
// versión con 6 círculos chicos alrededor de la gota (ver el commit
// anterior) y se descartó a propósito siguiendo la propia advertencia del
// pedido ("si las salpicaduras se ven como manchas indistinguibles,
// simplificá: menos salpicaduras, más grandes") — 6 puntos de ~1.5px de
// radio corren más riesgo de verse como ruido a 16px que unas pocas
// franjas más grandes dentro de una sola forma contigua (los bordes entre
// franjas quedan nítidos sin importar el anti-aliasing, a diferencia de
// puntos sueltos que se pueden fundir con el fondo). No se pudo confirmar
// con una captura real: la extensión de automatización del navegador
// falló también sobre una página de prueba estática en esta sesión (no
// solo en el sitio en producción), así que el diseño se basa en este
// razonamiento en vez de una verificación visual — revisarlo a ojo en la
// app si hay dudas.
function ArcoirisIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <defs>
        <clipPath id="arcoiris-drop-clip">
          <path d="M12 2.5c3.2 4.2 6.2 7.8 6.2 10.8A6.2 6.2 0 1 1 5.8 13.3C5.8 10.3 8.8 6.7 12 2.5z" />
        </clipPath>
      </defs>
      <g clipPath="url(#arcoiris-drop-clip)">
        <rect x="4" y="2" width="16" height="3.6" fill="#ff4d5e" />
        <rect x="4" y="5.6" width="16" height="3.6" fill="#ff9a3c" />
        <rect x="4" y="9.2" width="16" height="3.6" fill="#ffd93c" />
        <rect x="4" y="12.8" width="16" height="3.6" fill="#3ddc84" />
        <rect x="4" y="16.4" width="16" height="3.6" fill="#3ca7ff" />
        <rect x="4" y="20" width="16" height="3" fill="#a25bff" />
      </g>
      <circle cx="4" cy="6" r="2" fill="#ffd93c" />
      <circle cx="20.5" cy="8" r="1.7" fill="#3ca7ff" />
      <circle cx="19" cy="19" r="1.8" fill="#ff4d5e" />
    </svg>
  );
}

function ThemeMenu() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("noche");
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
    setOpen(false);
  };

  return (
    <div style={themeStyles.wrapper} ref={panelRef}>
      <button style={themeStyles.themeBtn} onClick={() => setOpen((v) => !v)}>
        🎨
      </button>
      {open && (
        <div style={themeStyles.panel}>
          {Object.entries(THEMES).map(([key, theme]) => (
            <div
              key={key}
              style={themeStyles.option(selected === key)}
              onClick={() => handleSelect(key)}
            >
              {key === "arcoiris" ? <ArcoirisIcon /> : <span>{theme.emoji}</span>}
              <span>{theme.label}</span>
            </div>
          ))}
          <div
            style={themeStyles.option(selected === ROTATIVO_KEY)}
            onClick={() => handleSelect(ROTATIVO_KEY)}
          >
            🔄 {t("nav.themeRotating")}
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
    content = <Chat onOpenProfile={openProfile} onOpenPost={openPost} />;
  } else if (view === "buscar") {
    content = <Search onOpenProfile={openProfile} />;
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
