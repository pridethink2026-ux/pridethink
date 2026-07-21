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
import Avatar from "./Avatar";
import { timeAgo } from "./utils";

/*
  Notifications
  -------------
  Campanita con contador de notificaciones no leídas (likes, comentarios,
  mensajes nuevos, seguidores nuevos). Al abrir el panel se muestran las
  más recientes; al abrirlo se marcan todas como leídas.

  Estructura en Firestore:
  - "notifications/{uid}/items/{itemId}"
      -> { type: 'like' | 'comment' | 'message' | 'follow', fromUid, fromName, fromIdentity, createdAt, read }

  Este archivo exporta tres cosas:
  - useNotifications(uid): hook con la lógica de datos (items, contador de
    no leídas, marcar todo como leído). Lo usan tanto el default export
    como App.js (para el puntito rojo de la barra inferior en móvil) y
    NotificationsScreen.
  - Notifications (default): la campanita + panel desplegable, para la
    barra superior en escritorio.
  - NotificationsScreen: la misma lista pero como pantalla completa, para
    la barra de navegación inferior en móvil.
*/

const LABELS = {
  like: (n) => `${n.fromName} le dio like a tu publicación`,
  comment: (n) => `${n.fromName} comentó tu publicación`,
  message: (n) => `${n.fromName} te envió un mensaje`,
  follow: (n) => `${n.fromName} empezó a seguirte`,
};

const styles = {
  wrapper: { position: "relative" },
  bellBtn: {
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
  badge: {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    background: "var(--accent2)",
    color: "var(--bg)",
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
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "18px",
    padding: "8px",
    zIndex: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
  item: (unread) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: unread ? "var(--surface-alt)" : "transparent",
    fontSize: "13px",
    marginBottom: "4px",
    cursor: "pointer",
  }),
  itemText: { margin: 0, color: "var(--text)" },
  itemTime: { margin: "2px 0 0", color: "var(--text-muted)", fontSize: "11px" },
  empty: {
    padding: "20px 12px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "13px",
  },
  screenWrapper: {
    minHeight: "100vh",
    background: "var(--bg)",
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "var(--font-body)",
    color: "var(--text)",
    boxSizing: "border-box",
  },
  screenColumn: { width: "100%", maxWidth: "560px" },
  screenTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "22px",
    fontWeight: 700,
    margin: "0 0 18px",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    display: "inline-block",
  },
  screenItem: (unread) => ({
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px",
    borderRadius: "16px",
    background: unread ? "var(--surface-alt)" : "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
    fontSize: "14px",
    marginBottom: "10px",
    cursor: "pointer",
  }),
};

// Lógica de datos compartida: notificaciones en tiempo real, contador de
// no leídas, y marcar todo como leído.
export function useNotifications(uid) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }
    const q = query(
      collection(db, "notifications", uid, "items"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  const unreadCount = items.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (!uid || unreadCount === 0) return;
    const batch = writeBatch(db);
    items
      .filter((n) => !n.read)
      .forEach((n) => {
        batch.update(doc(db, "notifications", uid, "items", n.id), { read: true });
      });
    await batch.commit();
  };

  return { items, unreadCount, markAllRead };
}

function NotificationItem({ n, onOpenProfile, dropdown }) {
  return (
    <div
      style={dropdown ? styles.item(!n.read) : styles.screenItem(!n.read)}
      onClick={() => n.fromUid && onOpenProfile?.(n.fromUid)}
    >
      <Avatar uid={n.fromUid} name={n.fromName} identity={n.fromIdentity} size="sm" />
      <div>
        <p style={styles.itemText}>{LABELS[n.type] ? LABELS[n.type](n) : "Notificación"}</p>
        <p style={styles.itemTime}>{timeAgo(n.createdAt)}</p>
      </div>
    </div>
  );
}

export default function Notifications({ onOpenProfile }) {
  const [currentUid, setCurrentUid] = useState(null);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const { items, unreadCount, markAllRead } = useNotifications(currentUid);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user ? user.uid : null);
    });
    return unsub;
  }, []);

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

  const handleToggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) await markAllRead();
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
            <NotificationItem key={n.id} n={n} onOpenProfile={onOpenProfile} dropdown />
          ))}
        </div>
      )}
    </div>
  );
}

// Misma lista, como pantalla completa para la barra de navegación inferior en móvil.
export function NotificationsScreen({ onOpenProfile }) {
  const [currentUid, setCurrentUid] = useState(null);
  const { items, unreadCount, markAllRead } = useNotifications(currentUid);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user ? user.uid : null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (unreadCount > 0) markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUid, unreadCount > 0]);

  if (!currentUid) {
    return (
      <div style={styles.screenWrapper}>
        <div style={styles.screenColumn}>
          <p style={styles.empty}>Inicia sesión primero para ver tus notificaciones.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.screenWrapper}>
      <div style={styles.screenColumn}>
        <h1 style={styles.screenTitle}>Notificaciones</h1>
        {items.length === 0 && <p style={styles.empty}>Todavía no tienes notificaciones.</p>}
        {items.map((n) => (
          <NotificationItem key={n.id} n={n} onOpenProfile={onOpenProfile} dropdown={false} />
        ))}
      </div>
    </div>
  );
}
