import React, { useEffect, useMemo, useState, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import Avatar from "./Avatar";
import { useAllUsersContext } from "./AllUsersContext";
import { timeAgo } from "./utils";
import { useLanguage } from "./LanguageContext";

/*
  Notifications
  -------------
  Campanita con contador de notificaciones no leídas (likes, comentarios,
  seguidores nuevos). Los mensajes del chat se avisan en el botón Chat
  (punto 92, useChatUnread en chatMessages.js). Al abrir el panel se muestran las
  más recientes; al abrirlo se marcan todas como leídas, salvo las
  estrellas de Momentos, que se marcan al tocarlas (punto 86, abajo).

  Estructura en Firestore:
  - "notifications/{uid}/items/{itemId}"
      -> { type: 'like' | 'comment' | 'message' | 'follow' | 'mention' | 'newProduct' | 'momentLike', fromUid, fromName, fromIdentity, createdAt, read, postId?, productId?, productTitle?, momentId? }
      -> "postId" solo lo trae "mention" (ver utils.notify y Mentions.jsx):
         al tocar esa notificación se navega directo al post en vez de al
         perfil de quien la generó.
      -> "productId"/"productTitle" solo los trae "newProduct" (punto 60,
         ver CreateProductScreen.jsx/MyStoreScreen.jsx: se crea para cada
         seguidor del vendedor cuando un producto pasa de borrador a
         publicado) — al tocar esa notificación se navega directo al
         producto, mismo criterio que "mention" con el post.
      -> "momentId" solo lo trae "momentLike" (punto 66, commit 6: la
         primera estrella que alguien le da a uno de tus momentos) — al
         tocarla se abre ese momento (App.js -> MomentViewer con
         startMomentId), o el aviso de que ya no está disponible si venció.
      -> "message" ya no se crea (punto 92). Las que quedan no se muestran
         y vencen solas con su "expireAt".

  Este archivo exporta tres cosas:
  - useNotifications(uid): hook con la lógica de datos (items, contador de
    no leídas, marcar todo como leído). Lo usan tanto el default export
    como App.js (para el puntito rojo de la barra inferior en móvil) y
    NotificationsScreen.
  - Notifications (default): la campanita + panel desplegable, para la
    barra superior en escritorio.
  - NotificationsScreen: la misma lista pero como pantalla completa, para
    la barra de navegación inferior en móvil.

  Lluvia de estrellas (punto 86): las "momentLike" NO se marcan como
  leídas al abrir la lista (markAllRead las deja afuera), sino al tocarlas.
  Si al tocarla estaba sin leer, se marca (markRead, solo "read": lo que
  permite firestore.rules) y el momento se abre con la lluvia
  (onOpenMoment(momentId, { starRain: true }) → MomentViewer
  starRainOnOpen). Así cae una sola vez por notificación, en cualquier
  dispositivo. Mientras no la toques sigue resaltada y en el contador.
  `celebratedIds` cubre el caso en que guardar el "leída" falle (sin
  conexión): no se repite en la misma sesión.
*/

const celebratedIds = new Set();

// Cada función recibe la notificación y "t" (de useLanguage) para armar el
// texto traducido con el nombre de quien la generó (fromName NO se
// traduce: es contenido del usuario, solo el texto alrededor).
const LABELS = {
  like: (n, t) => t("notifications.like", { name: n.fromName }),
  comment: (n, t) => t("notifications.comment", { name: n.fromName }),
  follow: (n, t) => t("notifications.follow", { name: n.fromName }),
  mention: (n, t) => t("notifications.mention", { name: n.fromName }),
  // Punto 60: se crea para cada seguidor del vendedor cuando uno de sus
  // productos pasa de borrador a publicado — ver CreateProductScreen.jsx/
  // MyStoreScreen.jsx. "productTitle" es una copia del momento en que se
  // publicó (no se vuelve a leer el producto en vivo), mismo criterio que
  // "productTitle" en giftShares/{giftId}.
  newProduct: (n, t) => t("notifications.newProduct", { name: n.fromName, title: n.productTitle }),
  momentLike: (n, t) => t("notifications.momentLike", { name: n.fromName }),
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
    background: "var(--surface-sheen)",
    border: "1px solid var(--border)",
    borderRadius: "18px",
    padding: "8px",
    zIndex: 20,
    boxShadow: "0 10px 30px rgba(var(--shadow-rgb), 0.4), var(--shine)",
  },
  item: (unread) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: unread ? "var(--surface-alt)" : "transparent",
    boxShadow: unread ? "inset 3px 0 0 var(--unread-edge)" : undefined,
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
    background: "var(--page-bg)",
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
    background: "var(--gradient-text)",
    filter: "var(--title-depth)",
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
    background: unread ? "var(--surface-alt)" : "var(--surface-sheen)",
    border: "1px solid var(--border)",
    boxShadow: unread
      ? "0 4px 14px rgba(var(--shadow-rgb), 0.15), inset 3px 0 0 var(--unread-edge)"
      : "0 4px 14px rgba(var(--shadow-rgb), 0.15), var(--shine)",
    fontSize: "14px",
    marginBottom: "10px",
    cursor: "pointer",
  }),
};

// Cuántas se muestran, y cuántas se traen para que las "message" viejas
// (punto 92, se ocultan) no dejen la lista sin las demás. Cuando venzan
// todas, FETCHED puede volver a ser igual que SHOWN.
const NOTIFICATIONS_SHOWN = 30;
const NOTIFICATIONS_FETCHED = 100;

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
      limit(NOTIFICATIONS_FETCHED)
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((n) => n.type !== "message")
          .slice(0, NOTIFICATIONS_SHOWN)
      );
    });
    return unsub;
  }, [uid]);

  const unreadCount = items.filter((n) => !n.read).length;

  // Las estrellas ("momentLike") quedan afuera: se marcan al tocarlas
  // (markRead), que es cuando cae su lluvia de estrellas (punto 86).
  const markAllRead = async () => {
    if (!uid) return;
    const toMark = items.filter((n) => !n.read && n.type !== "momentLike");
    if (toMark.length === 0) return;
    const batch = writeBatch(db);
    toMark.forEach((n) => {
      batch.update(doc(db, "notifications", uid, "items", n.id), { read: true });
    });
    await batch.commit();
  };

  return { items, unreadCount, markAllRead };
}

// Marca UNA notificación como leída (punto 86: la estrella, al tocarla).
function markRead(n) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  updateDoc(doc(db, "notifications", uid, "items", n.id), { read: true }).catch(() => {});
}

/*
  Foto de perfil de quien generó cada notificación (punto 58). La
  notificación guarda fromName/fromIdentity como copia del momento en que
  se creó, pero la foto se busca en vivo por uid en el listener único de
  AllUsersContext — mismo criterio que el badge de verificado en
  Feed.jsx. El mapa se arma UNA vez por lista (no una vez por
  notificación) para no recorrer todos los usuarios en cada fila.
*/
function usePhotoByUid() {
  const allUsers = useAllUsersContext();
  return useMemo(() => {
    const map = {};
    allUsers.forEach((u) => {
      if (u.photoURL) map[u.uid] = u.photoURL;
    });
    return map;
  }, [allUsers]);
}

function NotificationItem({ n, photoURL, onOpenProfile, onOpenPost, onOpenProduct, onOpenMoment, dropdown }) {
  const { t } = useLanguage();
  const handleClick = () => {
    if (n.type === "mention" && n.postId && onOpenPost) {
      onOpenPost(n.postId);
      return;
    }
    // Punto 60: mismo criterio que "mention" -> onOpenPost, pero al
    // producto en vez de al perfil de quien la generó.
    if (n.type === "newProduct" && n.productId && onOpenProduct) {
      onOpenProduct(n.productId);
      return;
    }
    if (n.type === "momentLike" && n.momentId && onOpenMoment) {
      // Punto 86: la primera vez que la tocás (sin leer), lluvia de
      // estrellas dentro del momento; después ya no.
      const starRain = !n.read && !celebratedIds.has(n.id);
      if (!n.read) {
        celebratedIds.add(n.id);
        markRead(n);
      }
      onOpenMoment(n.momentId, { starRain });
      return;
    }
    if (n.fromUid) onOpenProfile?.(n.fromUid);
  };
  return (
    <div
      style={dropdown ? styles.item(!n.read) : styles.screenItem(!n.read)}
      onClick={handleClick}
    >
      <Avatar uid={n.fromUid} name={n.fromName} identity={n.fromIdentity} photoURL={photoURL} size="sm" />
      <div>
        <p style={styles.itemText}>
          {LABELS[n.type] ? LABELS[n.type](n, t) : t("notifications.generic")}
        </p>
        <p style={styles.itemTime}>{timeAgo(n.createdAt, t)}</p>
      </div>
    </div>
  );
}

export default function Notifications({ onOpenProfile, onOpenPost, onOpenProduct, onOpenMoment }) {
  const photoByUid = usePhotoByUid();
  const { t } = useLanguage();
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
      <button
        style={styles.bellBtn}
        aria-label={
          unreadCount > 0
            ? t("nav.alertsUnread", { n: unreadCount })
            : t("notifications.title")
        }
        aria-expanded={open}
        onClick={handleToggle}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span style={styles.badge} aria-hidden="true">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={styles.panel}>
          {items.length === 0 && <p style={styles.empty}>{t("notifications.empty")}</p>}
          {items.map((n) => (
            <NotificationItem
              key={n.id}
              n={n}
              photoURL={photoByUid[n.fromUid]}
              onOpenProfile={onOpenProfile}
              onOpenPost={onOpenPost}
              onOpenProduct={onOpenProduct}
              onOpenMoment={onOpenMoment}
              dropdown
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Misma lista, como pantalla completa para la barra de navegación inferior en móvil.
export function NotificationsScreen({ onOpenProfile, onOpenPost, onOpenProduct, onOpenMoment }) {
  const photoByUid = usePhotoByUid();
  const { t } = useLanguage();
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
          <p style={styles.empty}>{t("notifications.loginNotice")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.screenWrapper}>
      <div style={styles.screenColumn}>
        <h1 style={styles.screenTitle}>{t("notifications.title")}</h1>
        {items.length === 0 && <p style={styles.empty}>{t("notifications.empty")}</p>}
        {items.map((n) => (
          <NotificationItem
            key={n.id}
            n={n}
            photoURL={photoByUid[n.fromUid]}
            onOpenProfile={onOpenProfile}
            onOpenPost={onOpenPost}
            onOpenProduct={onOpenProduct}
            onOpenMoment={onOpenMoment}
            dropdown={false}
          />
        ))}
      </div>
    </div>
  );
}
