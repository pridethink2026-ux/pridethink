import React, { useState, useEffect, useRef } from "react";
import AuthProfile from "./AuthProfile";
import Chat from "./Chat";
import Feed from "./Feed";
import Notifications from "./Notifications";
import {
  THEMES,
  ROTATIVO_KEY,
  applyTheme,
  saveThemePreference,
  initTheme,
} from "./themes";

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

function App() {
  const [view, setView] = useState("perfil"); // "perfil" | "chat" | "feed"

  return (
    <div>
      <div style={navStyles.bar}>
        <div style={navStyles.logoSlot}>
          <img src="/logo-icon.png" alt="Pridethink" style={navStyles.logoImg} />
          <span style={navStyles.logoText}>Pridethink</span>
        </div>
        <div style={navStyles.buttonsGroup}>
          <button style={navStyles.button(view === "perfil")} onClick={() => setView("perfil")}>
            Perfil
          </button>
          <button style={navStyles.button(view === "feed")} onClick={() => setView("feed")}>
            Muro
          </button>
          <button style={navStyles.button(view === "chat")} onClick={() => setView("chat")}>
            Chat
          </button>
        </div>
        <div style={navStyles.actionsSlot}>
          <ThemeMenu />
          <Notifications />
        </div>
      </div>

      {view === "perfil" && <AuthProfile />}
      {view === "feed" && <Feed />}
      {view === "chat" && <Chat />}
    </div>
  );
}

export default App;
