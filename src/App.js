import React, { useState } from "react";
import AuthProfile from "./AuthProfile";
import Chat from "./Chat";
import Feed from "./Feed";
import Notifications from "./Notifications";

const THEME = {
  bg: "#14102b",
  surface: "#231b47",
  accent2: "#f472b6",
  text: "#f5f3ff",
  textMuted: "#b8adf0",
  border: "rgba(167, 139, 250, 0.25)",
};

const navStyles = {
  bar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    background: THEME.bg,
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
    border: `1px solid ${active ? THEME.accent2 : THEME.border}`,
    background: active ? "rgba(244, 114, 182, 0.15)" : "transparent",
    color: active ? THEME.accent2 : THEME.textMuted,
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  }),
  bellSlot: {
    flexShrink: 0,
    order: 3,
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
    color: THEME.text,
    whiteSpace: "nowrap",
  },
};

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
        <div style={navStyles.bellSlot}>
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
