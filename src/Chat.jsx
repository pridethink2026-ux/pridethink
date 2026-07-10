import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

/*
  Chat
  ----
  Módulo de chat en tiempo real entre usuarios registrados.

  Estructura en Firestore:
  - "users/{uid}"                        -> perfil (ya existente, de AuthProfile.jsx)
  - "chats/{chatId}/messages/{msgId}"    -> mensajes de una conversación
      chatId = los dos UID ordenados alfabéticamente y unidos con "_"
      (así dos personas siempre llegan al mismo chatId, sin duplicados)

  Todo es en tiempo real: usa onSnapshot, no hace falta recargar la página
  para ver mensajes nuevos ni contactos nuevos.
*/

const THEME = {
  bg: "#14102b",
  surface: "#231b47",
  surfaceAlt: "#2c2358",
  accent: "#a78bfa",
  accent2: "#f472b6",
  text: "#f5f3ff",
  textMuted: "#b8adf0",
  border: "rgba(167, 139, 250, 0.25)",
};

function getChatId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: THEME.bg,
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: THEME.text,
    boxSizing: "border-box",
  },
  shell: {
    width: "100%",
    maxWidth: "760px",
    height: "80vh",
    background: THEME.surface,
    borderRadius: "20px",
    border: `1px solid ${THEME.border}`,
    display: "flex",
    overflow: "hidden",
  },
  contactsCol: {
    width: "240px",
    borderRight: `1px solid ${THEME.border}`,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  contactsHeader: {
    padding: "18px 16px 12px",
    fontSize: "12px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: THEME.accent2,
    fontWeight: 600,
    borderBottom: `1px solid ${THEME.border}`,
  },
  contactsList: {
    flex: 1,
    overflowY: "auto",
  },
  contactItem: (active) => ({
    padding: "12px 16px",
    cursor: "pointer",
    background: active ? THEME.surfaceAlt : "transparent",
    borderLeft: active ? `3px solid ${THEME.accent2}` : "3px solid transparent",
  }),
  contactName: { fontSize: "14px", fontWeight: 600, margin: 0 },
  contactIdentity: { fontSize: "12px", color: THEME.textMuted, margin: "2px 0 0" },
  chatCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  chatHeader: {
    padding: "16px 20px",
    borderBottom: `1px solid ${THEME.border}`,
    fontSize: "15px",
    fontWeight: 600,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockBtn: {
    background: "none",
    border: `1px solid ${THEME.border}`,
    borderRadius: "999px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 600,
    color: THEME.textMuted,
    cursor: "pointer",
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  bubbleRow: (mine) => ({
    display: "flex",
    justifyContent: mine ? "flex-end" : "flex-start",
  }),
  bubble: (mine) => ({
    maxWidth: "70%",
    padding: "10px 14px",
    borderRadius: "14px",
    fontSize: "14px",
    lineHeight: 1.4,
    background: mine
      ? `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`
      : THEME.surfaceAlt,
    color: mine ? "#14102b" : THEME.text,
  }),
  inputRow: {
    display: "flex",
    gap: "10px",
    padding: "14px 16px",
    borderTop: `1px solid ${THEME.border}`,
  },
  input: {
    flex: 1,
    background: THEME.surfaceAlt,
    border: `1px solid ${THEME.border}`,
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    color: THEME.text,
    outline: "none",
  },
  sendBtn: {
    padding: "10px 18px",
    borderRadius: "10px",
    border: "none",
    background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`,
    color: "#14102b",
    fontWeight: 600,
    cursor: "pointer",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: THEME.textMuted,
    fontSize: "14px",
    padding: "24px",
    textAlign: "center",
  },
};

export default function Chat() {
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const messagesEndRef = useRef(null);

  // Escucha si hay sesión activa (viene del mismo login de AuthProfile)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user ? user.uid : null);
    });
    return unsub;
  }, []);

  // Escucha tu propio perfil en tiempo real (necesario para saber a quién bloqueaste)
  useEffect(() => {
    if (!currentUid) return;
    const unsub = onSnapshot(doc(db, "users", currentUid), (snap) => {
      if (snap.exists()) setMyProfile(snap.data());
    });
    return unsub;
  }, [currentUid]);

  // Lista de todos los usuarios registrados en tiempo real (se filtra abajo)
  useEffect(() => {
    if (!currentUid) return;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        if (d.id !== currentUid) {
          list.push({ uid: d.id, ...d.data() });
        }
      });
      setAllUsers(list);
    });
    return unsub;
  }, [currentUid]);

  // Contactos visibles: sin perfiles privados, sin bloqueos en ninguna dirección
  const myBlocked = myProfile?.blockedUsers || [];
  const contacts = allUsers.filter((c) => {
    if (c.isPrivate) return false;
    if (myBlocked.includes(c.uid)) return false;
    if ((c.blockedUsers || []).includes(currentUid)) return false;
    return true;
  });

  const isBlocked = activeContact ? myBlocked.includes(activeContact.uid) : false;

  const handleToggleBlock = async () => {
    if (!activeContact || !currentUid) return;
    await updateDoc(doc(db, "users", currentUid), {
      blockedUsers: isBlocked
        ? arrayRemove(activeContact.uid)
        : arrayUnion(activeContact.uid),
    });
    if (!isBlocked) setActiveContact(null); // al bloquear, sale de la conversación
  };

  // Mensajes en tiempo real de la conversación activa
  useEffect(() => {
    if (!currentUid || !activeContact) {
      setMessages([]);
      return;
    }
    const chatId = getChatId(currentUid, activeContact.uid);
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [currentUid, activeContact]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeContact || !currentUid) return;

    const chatId = getChatId(currentUid, activeContact.uid);

    // Aseguramos que el documento "padre" del chat exista (útil a futuro
    // para listar conversaciones recientes, no estrictamente necesario ahora)
    await setDoc(
      doc(db, "chats", chatId),
      { participants: [currentUid, activeContact.uid] },
      { merge: true }
    );

    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: currentUid,
      text: text.trim(),
      createdAt: serverTimestamp(),
    });

    setText("");
  };

  if (!currentUid) {
    return (
      <div style={styles.wrapper}>
        <div style={{ ...styles.shell, alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: THEME.textMuted, padding: "0 24px", textAlign: "center" }}>
            Inicia sesión primero para usar el chat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.shell}>
        <div style={styles.contactsCol}>
          <p style={styles.contactsHeader}>Personas</p>
          <div style={styles.contactsList}>
            {contacts.length === 0 && (
              <p style={{ padding: "16px", fontSize: "13px", color: THEME.textMuted }}>
                Todavía no hay más personas registradas.
              </p>
            )}
            {contacts.map((c) => (
              <div
                key={c.uid}
                style={styles.contactItem(activeContact?.uid === c.uid)}
                onClick={() => setActiveContact(c)}
              >
                <p style={styles.contactName}>{c.displayName || "Sin nombre"}</p>
                <p style={styles.contactIdentity}>{c.identity}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.chatCol}>
          {activeContact ? (
            <>
              <div style={styles.chatHeader}>
                <span>
                  {activeContact.displayName} · {activeContact.identity}
                </span>
                <button style={styles.blockBtn} onClick={handleToggleBlock}>
                  {isBlocked ? "Desbloquear" : "Bloquear"}
                </button>
              </div>
              <div style={styles.messagesArea}>
                {messages.map((m) => (
                  <div key={m.id} style={styles.bubbleRow(m.senderId === currentUid)}>
                    <div style={styles.bubble(m.senderId === currentUid)}>{m.text}</div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form style={styles.inputRow} onSubmit={handleSend}>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="Escribe un mensaje..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" style={styles.sendBtn}>
                  Enviar
                </button>
              </form>
            </>
          ) : (
            <div style={styles.emptyState}>
              Elige a alguien de la lista para empezar a chatear.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
