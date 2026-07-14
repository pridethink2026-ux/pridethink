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

  DISEÑO RESPONSIVO:
  En pantallas angostas (celular) se muestra una sola columna a la vez
  (lista de contactos O conversación activa, con botón "← Volver").
  En pantallas anchas (escritorio) se muestran lado a lado, como antes.
  Esto evita que el ancho fijo de la lista de contactos aplaste la
  conversación en celulares, que era lo que causaba el texto partido
  en una palabra por línea.
*/

const MOBILE_BREAKPOINT = 700;

function getChatId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "var(--bg)",
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "var(--text)",
    boxSizing: "border-box",
  },
  shell: {
    width: "100%",
    maxWidth: "760px",
    height: "80vh",
    background: "var(--surface)",
    borderRadius: "20px",
    border: "1px solid var(--border)",
    display: "flex",
    overflow: "hidden",
  },
  contactsCol: (isMobile) => ({
    width: isMobile ? "100%" : "240px",
    borderRight: isMobile ? "none" : "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  }),
  contactsHeader: {
    padding: "18px 16px 12px",
    fontSize: "12px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--accent2)",
    fontWeight: 600,
    borderBottom: "1px solid var(--border)",
  },
  searchBox: {
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "7px 12px",
    fontSize: "12px",
    color: "var(--text)",
    outline: "none",
  },
  contactsList: {
    flex: 1,
    overflowY: "auto",
  },
  contactItem: (active) => ({
    padding: "12px 16px",
    cursor: "pointer",
    background: active ? "var(--surface-alt)" : "transparent",
    borderLeft: active ? "3px solid var(--accent2)" : "3px solid transparent",
  }),
  contactName: { fontSize: "14px", fontWeight: 600, margin: 0 },
  contactIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" },
  chatCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  chatHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    fontSize: "15px",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "18px",
    cursor: "pointer",
    padding: 0,
    lineHeight: 1,
  },
  chatHeaderText: { flex: 1, minWidth: 0 },
  blockBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
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
    maxWidth: "75%",
    padding: "10px 14px",
    borderRadius: "14px",
    fontSize: "14px",
    lineHeight: 1.4,
    wordBreak: "break-word",
    background: mine
      ? "linear-gradient(135deg, var(--accent), var(--accent2))"
      : "var(--surface-alt)",
    color: mine ? "var(--bg)" : "var(--text)",
  }),
  inputRow: {
    display: "flex",
    gap: "10px",
    padding: "14px 16px",
    borderTop: "1px solid var(--border)",
  },
  input: {
    flex: 1,
    minWidth: 0,
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
  },
  sendBtn: {
    padding: "10px 18px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "24px",
    textAlign: "center",
  },
};

export default function Chat() {
  const isMobile = useIsMobile();
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
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
  const visibleContacts = allUsers.filter((c) => {
    if (c.isPrivate) return false;
    if (myBlocked.includes(c.uid)) return false;
    if ((c.blockedUsers || []).includes(currentUid)) return false;
    return true;
  });

  const searchLower = search.trim().toLowerCase();
  const contacts = searchLower
    ? visibleContacts.filter(
        (c) =>
          (c.displayName || "").toLowerCase().includes(searchLower) ||
          (c.identity || "").toLowerCase().includes(searchLower)
      )
    : visibleContacts;

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

    // Notifica al destinatario que le llegó un mensaje nuevo
    await addDoc(collection(db, "notifications", activeContact.uid, "items"), {
      type: "message",
      fromUid: currentUid,
      fromName: myProfile?.displayName || "Alguien",
      fromIdentity: myProfile?.identity || "",
      createdAt: serverTimestamp(),
      read: false,
    });

    setText("");
  };

  if (!currentUid) {
    return (
      <div style={styles.wrapper}>
        <div style={{ ...styles.shell, alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--text-muted)", padding: "0 24px", textAlign: "center" }}>
            Inicia sesión primero para usar el chat.
          </p>
        </div>
      </div>
    );
  }

  // En móvil: si hay conversación activa, solo se muestra el chat.
  // Si no hay conversación activa, solo se muestra la lista de contactos.
  const showContactsList = !isMobile || !activeContact;
  const showChatPane = !isMobile || !!activeContact;

  return (
    <div style={styles.wrapper}>
      <div style={styles.shell}>
        {showContactsList && (
          <div style={styles.contactsCol(isMobile)}>
            <p style={styles.contactsHeader}>Personas</p>
            <div style={styles.searchBox}>
              <input
                style={styles.searchInput}
                type="text"
                placeholder="Buscar por nombre o identidad..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={styles.contactsList}>
              {contacts.length === 0 && (
                <p style={{ padding: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
                  {search ? "Nadie coincide con tu búsqueda." : "Todavía no hay más personas registradas."}
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
        )}

        {showChatPane && (
          <div style={styles.chatCol}>
            {activeContact ? (
              <>
                <div style={styles.chatHeader}>
                  {isMobile && (
                    <button style={styles.backBtn} onClick={() => setActiveContact(null)}>
                      ←
                    </button>
                  )}
                  <span style={styles.chatHeaderText}>
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
        )}
      </div>
    </div>
  );
}
