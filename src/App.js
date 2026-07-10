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
    justifyContent: "center",
    alignItems: "center",
    gap: "8px",
    padding: "16px",
    background: THEME.bg,
    position: "relative",
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
    position: "absolute",
    right: "16px",
    top: "50%",
    transform: "translateY(-50%)",
  },
};

function App() {
  const [view, setView] = useState("perfil"); // "perfil" | "chat" | "feed"

  return (
    <div>
      <div style={navStyles.bar}>
        <button style={navStyles.button(view === "perfil")} onClick={() => setView("perfil")}>
          Perfil
        </button>
        <button style={navStyles.button(view === "feed")} onClick={() => setView("feed")}>
          Muro
        </button>
        <button style={navStyles.button(view === "chat")} onClick={() => setView("chat")}>
          Chat
        </button>
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
