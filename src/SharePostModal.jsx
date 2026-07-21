import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, addDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import Avatar from "./Avatar";
import { notify } from "./utils";
import { useLanguage } from "./LanguageContext";
import { getChatId } from "./Chat";

/*
  SharePostModal
  --------------
  Selector de contactos para "Compartir por chat" un post (`Feed.jsx` ->
  `PostCard`). Mismo criterio de "contactos visibles" que ya usa
  `Chat.jsx` (sin perfiles privados, sin bloqueos en ninguna dirección) —
  se recalcula acá en vez de importarlo porque `Chat.jsx` no lo expone
  como función aparte, mismo patrón que ya repiten Search.jsx,
  FollowListModal.jsx, etc. para ese mismo filtro.

  Al elegir un contacto, crea un mensaje { senderId, type: "shared_post",
  sharedPostId, createdAt } en chats/{chatId}/messages (mismo chatId que
  arma Chat.jsx, importado de ahí con getChatId) y notifica como un
  mensaje normal. NO copia el contenido del post en el mensaje — la vista
  previa se resuelve en vivo del lado de Chat.jsx (ver SharedPostPreview).
*/

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 50,
    boxSizing: "border-box",
  },
  panel: {
    width: "100%",
    maxWidth: "400px",
    maxHeight: "80vh",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "22px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 700,
    margin: 0,
  },
  closeBtn: {
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    width: "30px",
    height: "30px",
    color: "var(--text-muted)",
    fontSize: "14px",
    cursor: "pointer",
    flexShrink: 0,
  },
  searchBox: {
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "13px",
    color: "var(--text)",
    outline: "none",
  },
  list: {
    overflowY: "auto",
    padding: "10px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 10px",
    borderRadius: "14px",
    cursor: "pointer",
  },
  rowName: { fontSize: "14px", fontWeight: 600, margin: 0 },
  rowIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: "1px 0 0" },
  sentBadge: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--accent)",
    flexShrink: 0,
  },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "13px",
    padding: "30px 20px",
  },
};

export default function SharePostModal({ post, currentUid, myProfile, onClose }) {
  const { t } = useLanguage();
  const [allUsers, setAllUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [sentTo, setSentTo] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        if (d.id !== currentUid) list.push({ uid: d.id, ...d.data() });
      });
      setAllUsers(list);
    });
    return unsub;
  }, [currentUid]);

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

  const handleShare = async (contact) => {
    const chatId = getChatId(currentUid, contact.uid);
    await setDoc(
      doc(db, "chats", chatId),
      { participants: [currentUid, contact.uid] },
      { merge: true }
    );
    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: currentUid,
      type: "shared_post",
      sharedPostId: post.id,
      createdAt: serverTimestamp(),
    });
    await notify(contact.uid, {
      type: "message",
      fromUid: currentUid,
      fromName: myProfile?.displayName || "Alguien",
      fromIdentity: myProfile?.identity || "",
    });
    setSentTo(contact.uid);
    setTimeout(onClose, 900);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{t("chat.shareModalTitle")}</h2>
          <button style={styles.closeBtn} onClick={onClose} title={t("report.close")}>
            ✕
          </button>
        </div>
        <div style={styles.searchBox}>
          <input
            style={styles.searchInput}
            type="text"
            placeholder={t("chat.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={styles.list}>
          {contacts.length === 0 && (
            <p style={styles.empty}>
              {search ? t("chat.noSearchResults") : t("chat.noContacts")}
            </p>
          )}
          {contacts.map((c) => (
            <div key={c.uid} style={styles.row} onClick={() => handleShare(c)}>
              <Avatar uid={c.uid} name={c.displayName || c.identity} identity={c.identity} size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={styles.rowName}>{c.displayName || t("chat.defaultName")}</p>
                <p style={styles.rowIdentity}>{c.identity}</p>
              </div>
              {sentTo === c.uid && <span style={styles.sentBadge}>✓ {t("chat.shareSent")}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
