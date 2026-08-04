import React from "react";
import { useLanguage } from "./LanguageContext";

/*
  GiftNotification
  -----------------
  Tarjeta de "regalo" dentro de una burbuja de chat (Chat.jsx ->
  MessageBubble, cuando message.type === "gift" — ver GiftFriendModal.jsx,
  que es quien crea este tipo de mensaje). No vuelve a leer el producto en
  vivo (a diferencia de SharedPostPreview con los posts): el mensaje ya
  guarda una copia de "productTitle"/"productPrice" al momento de
  regalarlo, a propósito, para que el recibo del regalo no cambie si el
  vendedor edita el precio después.
*/

const styles = {
  card: (mine) => ({
    borderLeft: "3px solid var(--accent)",
    background: mine ? "var(--bg)" : "var(--surface)",
    borderRadius: "10px",
    padding: "10px 12px",
    cursor: "pointer",
    minWidth: "180px",
  }),
  label: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    margin: "0 0 6px",
    color: "var(--accent)",
  },
  productTitle: {
    fontSize: "13px",
    fontWeight: 700,
    margin: "0 0 2px",
    color: "var(--text)",
  },
  productPrice: {
    fontSize: "13px",
    fontWeight: 600,
    margin: "0 0 6px",
    color: "var(--text)",
  },
  personalMessage: {
    fontSize: "12px",
    fontStyle: "italic",
    color: "var(--text-muted)",
    margin: "0 0 8px",
  },
  viewLink: {
    fontSize: "12px",
    fontWeight: 700,
    color: "var(--accent2)",
    margin: 0,
  },
};

export default function GiftNotification({ message, mine, senderName, onOpenProduct }) {
  const { t } = useLanguage();
  return (
    <div style={styles.card(mine)} onClick={() => onOpenProduct(message.productId)}>
      <p style={styles.label}>
        {mine
          ? t("store.giftMsg.sentByMe", { product: message.productTitle })
          : t("store.giftMsg.received", { name: senderName || "", product: message.productTitle })}
      </p>
      <p style={styles.productTitle}>{message.productTitle}</p>
      <p style={styles.productPrice}>${message.productPrice}</p>
      {message.message && <p style={styles.personalMessage}>"{message.message}"</p>}
      <p style={styles.viewLink}>{t("store.giftMsg.viewProduct")}</p>
    </div>
  );
}
