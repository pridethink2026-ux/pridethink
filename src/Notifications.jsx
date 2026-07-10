import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
} from "firebase/firestore";

/*
  Notifications
  -------------
  Campanita con contador de notificaciones no leídas (likes, comentarios,
  mensajes nuevos). Al abrir el panel se muestran las más recientes; al
  cerrarlo se marcan todas como leídas.

  Estructura en Firestore:
  - "notifications/{uid}/items/{itemId}"
      -> { type: 'like' | 'comment' | 'message', fromName, fromIdentity, createdAt, read }
*/

const THEME = {
  surface: "#231b47",
  surfaceAlt: "#2c2358",
  accent2: "#f472b6",
  text: "#f5f3ff",
  textMuted: "#b8adf0",
  border: "rgba(167, 139, 250, 0.25)",
};

const LABELS = {
  like: (n) => `${n.fromName} le dio like a tu publicación`,
  comment: (n) => `${n.fromName} comentó tu publicación`,
  message: (n) => `${n.fromName} te envió un mensaje`,
};

const styles = {
  wrapper: { position: "relative" },
  bellBtn: {
    position: "relative",
    background: "none",
    border: `1px solid ${THEME.border}`,
    borderRadius: "999px",
    width: "38px",
    height: "38px",
    fontSize: "16px",
    cursor: "pointer",
    color: THEME.text,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    background: THEME.accent2,
    color: "#14102b",
    fontSize: "10px",
    fontWeight: 700,
    borderRadius: "999px",
    minWidth: "16px",
    height: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 3px",
  },
  panel: {
    position: "absolute",
    top: "46px",
    right: 0,
    width: "300px",
    maxHeight: "360px",
    overflowY: "auto",
    background: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: "14px",
    padding: "8px",
    zIndex: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
  item: (unread) => ({
    padding: "10px 12px",
    borderRadius: "10px",
    background: unread ? THEME.surfaceAlt : "transparent",
    fontSize: "13px",
    marginBottom: "4px",
  }),
  itemText: { margin: 0, color: THEME.text },
  itemIdentity: { margin: "2px 0 0", color: THEME.textMuted, fontSize: "11px" },
  empty: {
    padding: "20px 12px",
    textAlign: "center",
    color: THEME.textMuted,
    fontSize: "13px",
  },
};

export default function Notifications() {
  const [currentUid, setCurrentUid] = useState(null);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user ? user.uid : null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUid) return;
    const q = query(
      collection(db, "notifications", currentUid, "items"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [currentUid]);

  // Cierra el panel al hacer clic afuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = items.filter((n) => !n.read).length;

  const handleToggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unreadCount > 0 && currentUid) {
      const batch = writeBatch(db);
      items
        .filter((n) => !n.read)
        .forEach((n) => {
          batch.update(doc(db, "notifications", currentUid, "items", n.id), { read: true });
        });
      await batch.commit();
    }
  };

  if (!currentUid) return null;

  return (
    <div style={styles.wrapper} ref={panelRef}>
      <button style={styles.bellBtn} onClick={handleToggle}>
        🔔
        {unreadCount > 0 && <span style={styles.badge}>{unreadCount}</span>}
      </button>

      {open && (
        <div style={styles.panel}>
          {items.length === 0 && <p style={styles.empty}>Todavía no tienes notificaciones.</p>}
          {items.map((n) => (
            <div key={n.id} style={styles.item(!n.read)}>
              <p style={styles.itemText}>{LABELS[n.type] ? LABELS[n.type](n) : "Notificación"}</p>
              {n.fromIdentity && <p style={styles.itemIdentity}>{n.fromIdentity}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
