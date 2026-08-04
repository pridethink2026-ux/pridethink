import React, { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import { doc, onSnapshot, deleteDoc, updateDoc, increment } from "firebase/firestore";
import Avatar from "./Avatar";
import { useLanguage } from "./LanguageContext";
import { getCategoryEmoji } from "./storeData";
import GiftFriendModal from "./GiftFriendModal";

/*
  ProductDetailScreen
  --------------------
  Sub-vista de StoreScreen.jsx (no un overlay de App.js — ver el
  docstring de StoreScreen.jsx). Muestra el detalle completo de un
  producto y suma una vista (products/{productId}.viewCount) una sola
  vez al entrar, con el carve-out de firestore.rules que permite a
  CUALQUIER autenticado tocar solo ese campo (no es el vendedor quien
  suma la vista).
*/

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "var(--bg)",
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "var(--font-body)",
    color: "var(--text)",
    boxSizing: "border-box",
  },
  column: { width: "100%", maxWidth: "560px" },
  backBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "8px 16px",
    color: "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "18px",
  },
  notice: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "30px 20px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
  },
  imagePlaceholder: {
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: "20px",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    marginBottom: "18px",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "22px",
    fontWeight: 700,
    margin: "0 0 8px",
  },
  price: {
    fontSize: "24px",
    fontWeight: 700,
    margin: "0 0 12px",
  },
  badgeRow: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" },
  badge: {
    fontSize: "12px",
    fontWeight: 700,
    padding: "5px 12px",
    borderRadius: "999px",
    background: "var(--surface-alt)",
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
  },
  conditionBadge: (isNew) => ({
    fontSize: "12px",
    fontWeight: 700,
    padding: "5px 12px",
    borderRadius: "999px",
    background: isNew ? "rgba(34,197,94,0.15)" : "rgba(255,151,66,0.18)",
    color: isNew ? "#22c55e" : "#ff9742",
  }),
  primeBadge: {
    fontSize: "12px",
    fontWeight: 700,
    padding: "5px 12px",
    borderRadius: "999px",
    background: "var(--accent-soft)",
    color: "var(--accent)",
  },
  designBadge: {
    fontSize: "12px",
    fontWeight: 700,
    padding: "5px 12px",
    borderRadius: "999px",
    background: "var(--accent2-soft)",
    color: "var(--accent2)",
  },
  description: {
    fontSize: "14px",
    lineHeight: 1.6,
    color: "var(--text)",
    margin: "0 0 20px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  sellerCard: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    marginBottom: "18px",
    cursor: "pointer",
  },
  sellerName: { fontSize: "14px", fontWeight: 700, margin: 0 },
  sellerLink: { fontSize: "12px", color: "var(--accent2)", margin: "2px 0 0" },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: "13px",
  },
  infoLabel: { color: "var(--text-muted)" },
  infoValue: { fontWeight: 600 },
  actionsCol: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" },
  giftBtn: {
    padding: "13px",
    borderRadius: "12px",
    border: "1px solid var(--accent2)",
    background: "var(--accent2-soft)",
    color: "var(--accent2)",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
  },
  buyBtn: {
    padding: "13px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text-muted)",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "not-allowed",
  },
  editBtn: {
    padding: "13px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
  },
  deleteBtn: {
    padding: "13px",
    borderRadius: "12px",
    border: "1px solid var(--accent2)",
    background: "transparent",
    color: "var(--accent2)",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
  },
};

function CameraIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export default function ProductDetailScreen({ productId, currentUid, myProfile, onBack, onOpenProfile, onEdit }) {
  const { t } = useLanguage();
  const [product, setProduct] = useState(undefined); // undefined: cargando | null: no existe
  const [giftOpen, setGiftOpen] = useState(false);
  const viewCounted = useRef(false);

  useEffect(() => {
    setProduct(undefined);
    viewCounted.current = false;
    const unsub = onSnapshot(doc(db, "products", productId), (snap) => {
      setProduct(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return unsub;
  }, [productId]);

  useEffect(() => {
    if (!product || viewCounted.current) return;
    viewCounted.current = true;
    updateDoc(doc(db, "products", productId), { viewCount: increment(1) }).catch(() => {});
  }, [product, productId]);

  if (product === undefined) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>{t("store.detail.backLink")}</button>
          <p style={styles.notice}>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (product === null) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>{t("store.detail.backLink")}</button>
          <p style={styles.notice}>{t("store.detail.notFound")}</p>
        </div>
      </div>
    );
  }

  const isMine = currentUid && product.sellerId === currentUid;

  const handleDelete = async () => {
    if (!window.confirm(t("store.detail.deleteConfirm"))) return;
    await deleteDoc(doc(db, "products", productId));
    onBack();
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <button style={styles.backBtn} onClick={onBack}>{t("store.detail.backLink")}</button>

        <div style={styles.imagePlaceholder}>
          <CameraIcon />
        </div>

        <h1 style={styles.title}>{product.title}</h1>
        <p style={styles.price}>${product.price}</p>

        <div style={styles.badgeRow}>
          <span style={styles.badge}>{getCategoryEmoji(product.category)} {product.category}</span>
          <span style={styles.conditionBadge(product.condition === "new")}>
            {product.condition === "new" ? t("store.conditionNew") : t("store.conditionUsed")}
          </span>
          {product.tier === "prime" && <span style={styles.primeBadge}>{t("store.primeBadge")}</span>}
          {product.isPersonalDesign && (
            <span style={styles.designBadge}>{t("store.detail.personalDesignBadge")}</span>
          )}
        </div>

        {product.description && <p style={styles.description}>{product.description}</p>}

        <div style={styles.sellerCard} onClick={() => onOpenProfile(product.sellerId)}>
          <Avatar uid={product.sellerId} name={product.sellerName} identity={product.sellerIdentity} size="md" />
          <div>
            <p style={styles.sellerName}>{product.sellerName}</p>
            <p style={styles.sellerLink}>{t("store.detail.viewProfile")}</p>
          </div>
        </div>

        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>{t("store.detail.quantityLabel")}</span>
          <span style={styles.infoValue}>{product.quantity}</span>
        </div>
        {product.manufacturer && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>{t("store.detail.manufacturerLabel")}</span>
            <span style={styles.infoValue}>{product.manufacturer}</span>
          </div>
        )}

        <div style={styles.actionsCol}>
          {isMine ? (
            <>
              <button style={styles.editBtn} onClick={() => onEdit(productId)}>
                {t("store.detail.editButton")}
              </button>
              <button style={styles.deleteBtn} onClick={handleDelete}>
                {t("store.detail.deleteButton")}
              </button>
            </>
          ) : (
            <>
              {currentUid && (
                <button style={styles.giftBtn} onClick={() => setGiftOpen(true)}>
                  {t("store.detail.giftButton")}
                </button>
              )}
              <button style={styles.buyBtn} disabled title={t("store.detail.buySoon")}>
                {t("store.detail.buyButton")} — {t("store.detail.buySoon")}
              </button>
            </>
          )}
        </div>
      </div>

      {giftOpen && (
        <GiftFriendModal
          product={product}
          currentUid={currentUid}
          myProfile={myProfile}
          onClose={() => setGiftOpen(false)}
        />
      )}
    </div>
  );
}
