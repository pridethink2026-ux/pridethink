import React, { useMemo, useState } from "react";
import { db } from "./firebase";
import { addDoc, collection, doc, increment, serverTimestamp, updateDoc } from "firebase/firestore";
import Avatar from "./Avatar";
import { sendChatMessage } from "./chatMessages";
import { useLanguage } from "./LanguageContext";
import { useMyBlocks, isBlockedEitherWay } from "./Blocks";
import { useAllUsers } from "./Mentions";
import { useMyFollows } from "./FollowsContext";

/*
  GiftFriendModal
  ----------------
  Modal "Regalar a un amigo" (ProductDetailScreen.jsx). Mismo esqueleto
  que SharePostModal.jsx (lista de contactos visibles con el mismo
  criterio de "quién es visible" que ya usa Chat.jsx, tocar un contacto
  confirma la acción): al tocar un contacto, crea el registro en
  giftShares/{giftId} Y un mensaje { type: "gift" } en
  chats/{chatId}/messages (con sendChatMessage de chatMessages.js, que
  además actualiza el resumen del chat — punto 84), suma 1 a products/{productId}.giftCount (carve-out de
  firestore.rules que permite a cualquier autenticado tocar SOLO ese
  campo) y notifica como un mensaje normal — Chat.jsx (MessageBubble)
  reconoce message.type === "gift" y renderiza GiftNotification en vez
  de una burbuja de texto.
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
    maxHeight: "82vh",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "22px",
    boxShadow: "0 20px 50px rgba(var(--shadow-rgb), 0.45)",
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
  productPreview: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 20px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  productTitle: { fontSize: "13px", fontWeight: 700, margin: 0 },
  productPrice: { fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" },
  messageBox: {
    padding: "12px 20px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  messageInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "13px",
    color: "var(--text)",
    outline: "none",
    resize: "none",
    minHeight: "56px",
    fontFamily: "inherit",
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
  findPeopleBtn: {
    marginTop: "14px",
    padding: "9px 20px",
    borderRadius: "999px",
    border: "none",
    background: "var(--gradient-primary)",
    boxShadow: "var(--button-shine)",
    color: "var(--on-primary)",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },
};

export default function GiftFriendModal({ product, currentUid, myProfile, onClose, onGoToSearch }) {
  const { t } = useLanguage();
  const allUsersRaw = useAllUsers();
  const allUsers = useMemo(
    () => allUsersRaw.filter((u) => u.uid !== currentUid),
    [allUsersRaw, currentUid]
  );
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [sentTo, setSentTo] = useState(null);

  const { blockedByMe, blockedMe } = useMyBlocks(currentUid);
  // Contactos para regalar = follow MUTUO (yo sigo a esa persona Y esa
  // persona me sigue a mí). Sale de los dos listeners de FollowsContext.jsx
  // (fuga B, punto 82: a quién sigo y quién me sigue, de follows/), que ya
  // están abiertos para toda la app — sin ninguna consulta nueva.
  const { following: myFollowing, followers: myFollowers } = useMyFollows();
  const visibleContacts = allUsers.filter((c) => {
    if (!myFollowing.includes(c.uid)) return false;
    if (!myFollowers.includes(c.uid)) return false;
    if (isBlockedEitherWay(blockedByMe, blockedMe, c.uid)) return false;
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

  const handleGift = async (contact) => {
    const trimmedMessage = message.trim();
    const giftRef = await addDoc(collection(db, "giftShares"), {
      productId: product.id,
      productTitle: product.title,
      productPrice: product.price,
      senderId: currentUid,
      senderName: myProfile?.displayName || "",
      recipientId: contact.uid,
      recipientName: contact.displayName || "",
      message: trimmedMessage,
      status: "sent",
      createdAt: serverTimestamp(),
    });
    // Mensaje y resumen del chat juntos (chatMessages.js, punto 84).
    await sendChatMessage(currentUid, contact.uid, {
      type: "gift",
      giftId: giftRef.id,
      productId: product.id,
      productTitle: product.title,
      productPrice: product.price,
      message: trimmedMessage,
    });
    await updateDoc(doc(db, "products", product.id), { giftCount: increment(1) });
    setSentTo(contact.uid);
    setTimeout(onClose, 900);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{t("store.gift.title")}</h2>
          <button style={styles.closeBtn} onClick={onClose} title={t("report.close")}>
            ✕
          </button>
        </div>
        <div style={styles.productPreview}>
          <div style={{ minWidth: 0 }}>
            <p style={styles.productTitle}>{product.title}</p>
            <p style={styles.productPrice}>${product.price}</p>
          </div>
        </div>
        <div style={styles.messageBox}>
          <textarea
            style={styles.messageInput}
            placeholder={t("store.gift.messagePlaceholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div style={styles.searchBox}>
          <input
            style={styles.searchInput}
            type="text"
            placeholder={t("store.gift.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={styles.list}>
          {contacts.length === 0 && (
            <div style={styles.empty}>
              <p style={{ margin: 0 }}>
                {search ? t("store.gift.noSearchResults") : t("store.gift.noContacts")}
              </p>
              {!search && onGoToSearch && (
                <button
                  className="pt-relief"
                  style={styles.findPeopleBtn}
                  onClick={() => {
                    onClose();
                    onGoToSearch();
                  }}
                >
                  {t("store.gift.findPeopleButton")}
                </button>
              )}
            </div>
          )}
          {contacts.map((c) => (
            <div key={c.uid} style={styles.row} onClick={() => handleGift(c)}>
              <Avatar uid={c.uid} name={c.displayName || c.identity} identity={c.identity} photoURL={c.photoURL} size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={styles.rowName}>{c.displayName || t("store.gift.defaultName")}</p>
                <p style={styles.rowIdentity}>{c.identity}</p>
              </div>
              {sentTo === c.uid && <span style={styles.sentBadge}>✓ {t("store.gift.sent")}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
