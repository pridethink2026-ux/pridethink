import React, { useState, useEffect, useRef } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import AuthProfile from "./AuthProfile";
import Chat from "./Chat";
import Feed from "./Feed";
import Search from "./Search";
import UserProfile from "./UserProfile";
import Notifications, { useNotifications, NotificationsScreen } from "./Notifications";
import { useIsMobile } from "./utils";
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

  Los perfiles públicos (UserProfile) se abren como una vista superpuesta:
  se guarda el uid que se está viendo en "viewingProfileUid" y se restaura
  la pestaña anterior al volver, sin perder en qué pestaña estabas.
*/

const DESKTOP_TABS = [
  { key: "perfil", label: "Perfil" },
  { key: "feed", label: "Muro" },
  { key: "chat", label: "Chat" },
  { key: "buscar", label: "Buscar" },
];

const BOTTOM_TABS = [
  { key: "feed", label: "Muro", icon: "🏠" },
  { key: "buscar", label: "Buscar", icon: "🔍" },
  { key: "chat", label: "Chat", icon: "💬" },
  { key: "notificaciones", label: "Avisos", icon: "🔔" },
  { key: "perfil", label: "Perfil", icon: "👤" },
];

const navStyles = {
  bar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    background: "var(--bg)",
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
    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
    fontSize: "15px",
    fontWeight: 600,
    color: "var(--text)",
    whiteSpace: "nowrap",
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
    borderRadius: "14px",
    padding: "8px",
    zIndex: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
  option: (active) => ({
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

function ThemeMenu() {
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
              {theme.emoji} {theme.label}
            </div>
          ))}
          <div
            style={themeStyles.option(selected === ROTATIVO_KEY)}
            onClick={() => handleSelect(ROTATIVO_KEY)}
          >
            🔄 Rotativo
          </div>
        </div>
      )}
    </div>
  );
}

function BottomNav({ active, unreadCount, onNavigate }) {
  return (
    <div style={bottomNavStyles.bar}>
      {BOTTOM_TABS.map((tab) => (
        <button
          key={tab.key}
          style={bottomNavStyles.btn(active === tab.key)}
          onClick={() => onNavigate(tab.key)}
        >
          <span style={bottomNavStyles.iconWrap}>
            {tab.icon}
            {tab.key === "notificaciones" && unreadCount > 0 && (
              <span style={bottomNavStyles.dot} />
            )}
          </span>
          <span style={bottomNavStyles.label}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function App() {
  const isMobile = useIsMobile();
  const [view, setView] = useState("perfil"); // "perfil" | "feed" | "chat" | "buscar" | "notificaciones"
  const [currentUid, setCurrentUid] = useState(null);
  const [viewingProfileUid, setViewingProfileUid] = useState(null);
  const { unreadCount } = useNotifications(currentUid);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUid(u ? u.uid : null));
    return unsub;
  }, []);

  const openProfile = (uid) => setViewingProfileUid(uid);
  const closeProfile = () => setViewingProfileUid(null);

  const navigate = (key) => {
    setView(key);
    closeProfile();
  };

  let content;
  if (viewingProfileUid) {
    content = (
      <UserProfile uid={viewingProfileUid} onBack={closeProfile} onOpenProfile={openProfile} />
    );
  } else if (view === "feed") {
    content = <Feed onOpenProfile={openProfile} />;
  } else if (view === "chat") {
    content = <Chat onOpenProfile={openProfile} />;
  } else if (view === "buscar") {
    content = <Search onOpenProfile={openProfile} />;
  } else if (view === "notificaciones") {
    content = <NotificationsScreen onOpenProfile={openProfile} />;
  } else {
    content = <AuthProfile />;
  }

  return (
    <div style={{ paddingBottom: isMobile ? "62px" : 0 }}>
      <div style={navStyles.bar}>
        <div style={navStyles.logoSlot}>
          <img src="/logo-icon.png" alt="Pridethink" style={navStyles.logoImg} />
          <span style={navStyles.logoText}>Pridethink</span>
        </div>
        {!isMobile && (
          <div style={navStyles.buttonsGroup}>
            {DESKTOP_TABS.map((tab) => (
              <button
                key={tab.key}
                style={navStyles.button(!viewingProfileUid && view === tab.key)}
                onClick={() => navigate(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div style={navStyles.actionsSlot}>
          <ThemeMenu />
          {!isMobile && <Notifications onOpenProfile={openProfile} />}
        </div>
      </div>

      <div key={viewingProfileUid ? `profile-${viewingProfileUid}` : view} className="pt-view-fade">
        {content}
      </div>

      {isMobile && (
        <BottomNav
          active={viewingProfileUid ? null : view}
          unreadCount={unreadCount}
          onNavigate={navigate}
        />
      )}
    </div>
  );
}

export default App;
