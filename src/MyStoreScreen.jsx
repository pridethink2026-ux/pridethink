import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useLanguage } from "./LanguageContext";

/*
  MyStoreScreen
  -------------
  Sub-vista de StoreScreen.jsx: dashboard del vendedor (Publicados /
  Borradores / Catálogos). Escucha SOLO products/{*} donde
  sellerId == currentUid (sin orderBy, para no necesitar un índice
  compuesto — mismo motivo que StoreScreen.jsx) y separa publicados de
  borradores en el cliente con "isPublished".
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
  column: { width: "100%", maxWidth: "640px" },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "18px",
  },
  backBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "8px 16px",
    color: "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "20px",
    fontWeight: 700,
    margin: 0,
  },
  tabsRow: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "18px" },
  tabBtn: (active) => ({
    padding: "7px 16px",
    borderRadius: "999px",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--accent2-soft)" : "transparent",
    color: active ? "var(--accent2)" : "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  }),
  productCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
    padding: "14px 16px",
    marginBottom: "10px",
  },
  productTitle: { fontSize: "14px", fontWeight: 700, margin: "0 0 4px" },
  productPrice: { fontSize: "13px", fontWeight: 600, margin: "0 0 6px" },
  metaRow: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px" },
  metaText: { fontSize: "11px", color: "var(--text-muted)", margin: 0 },
  actionsRow: { display: "flex", gap: "8px", flexWrap: "wrap" },
  smallBtn: {
    padding: "7px 14px",
    borderRadius: "10px",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  smallBtnAccent: {
    padding: "7px 14px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  smallBtnDanger: {
    padding: "7px 14px",
    borderRadius: "10px",
    border: "1px solid var(--accent2)",
    background: "transparent",
    color: "var(--accent2)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "30px 0",
  },
  catalogRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "14px 16px",
    borderRadius: "16px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
    marginBottom: "10px",
    cursor: "pointer",
  },
  catalogName: { fontSize: "14px", fontWeight: 700, margin: 0 },
  catalogDescription: { fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" },
  catalogCount: { fontSize: "12px", color: "var(--text-muted)", flexShrink: 0 },
  createCatalogBtn: {
    padding: "10px 18px",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "14px",
  },
  createForm: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    padding: "16px",
    marginBottom: "16px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
    marginBottom: "10px",
    fontFamily: "inherit",
  },
  formActions: { display: "flex", gap: "8px" },
};

function ProductRow({ product, t, onOpenProduct, onEditProduct, onDelete, onTogglePublish }) {
  return (
    <div style={styles.productCard}>
      <p style={styles.productTitle} onClick={() => onOpenProduct(product.id)}>{product.title}</p>
      <p style={styles.productPrice}>${product.price}</p>
      <div style={styles.metaRow}>
        <p style={styles.metaText}>{t("store.mine.quantityLabel", { count: product.quantity ?? 0 })}</p>
        <p style={styles.metaText}>{t("store.mine.viewsLabel", { count: product.viewCount || 0 })}</p>
        <p style={styles.metaText}>{t("store.mine.giftsLabel", { count: product.giftCount || 0 })}</p>
      </div>
      <div style={styles.actionsRow}>
        <button style={styles.smallBtn} onClick={() => onEditProduct(product.id)}>
          {t("store.mine.editButton")}
        </button>
        <button style={styles.smallBtnAccent} onClick={() => onTogglePublish(product)}>
          {product.isPublished ? t("store.mine.unpublishButton") : t("store.mine.publishButton")}
        </button>
        <button style={styles.smallBtnDanger} onClick={() => onDelete(product)}>
          {t("store.mine.deleteButton")}
        </button>
      </div>
    </div>
  );
}

function CreateCatalogForm({ currentUid, onCreated, onCancel, t }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim() || !currentUid) return;
    setCreating(true);
    try {
      await addDoc(collection(db, "catalogs"), {
        name: name.trim(),
        description: description.trim(),
        sellerId: currentUid,
        productCount: 0,
        createdAt: serverTimestamp(),
      });
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  return (
    <form style={styles.createForm} onSubmit={handleCreate}>
      <input
        style={styles.input}
        type="text"
        placeholder={t("store.mine.catalogNamePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <textarea
        style={{ ...styles.input, resize: "none", minHeight: "60px" }}
        placeholder={t("store.mine.catalogDescriptionPlaceholder")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div style={styles.formActions}>
        <button type="submit" style={styles.smallBtnAccent} disabled={creating || !name.trim()}>
          {t("store.mine.catalogSave")}
        </button>
        <button type="button" style={styles.smallBtn} onClick={onCancel}>
          {t("store.mine.catalogCancel")}
        </button>
      </div>
    </form>
  );
}

export default function MyStoreScreen({ currentUid, onBack, onOpenProduct, onEditProduct }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("published");
  const [products, setProducts] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [creatingCatalog, setCreatingCatalog] = useState(false);
  const [viewingCatalogId, setViewingCatalogId] = useState(null);

  useEffect(() => {
    if (!currentUid) return;
    const q = query(collection(db, "products"), where("sellerId", "==", currentUid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setProducts(list);
    });
    return unsub;
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid) return;
    const q = query(collection(db, "catalogs"), where("sellerId", "==", currentUid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setCatalogs(list);
    });
    return unsub;
  }, [currentUid]);

  const handleDelete = async (product) => {
    if (!window.confirm(t("store.mine.deleteConfirm"))) return;
    await deleteDoc(doc(db, "products", product.id));
    if (product.catalogId) {
      await updateDoc(doc(db, "catalogs", product.catalogId), { productCount: increment(-1) });
    }
  };

  const handleTogglePublish = async (product) => {
    await updateDoc(doc(db, "products", product.id), {
      isPublished: !product.isPublished,
      updatedAt: serverTimestamp(),
    });
  };

  const published = products.filter((p) => p.isPublished);
  const drafts = products.filter((p) => !p.isPublished);
  const viewingCatalog = catalogs.find((c) => c.id === viewingCatalogId);
  const catalogProducts = products.filter((p) => p.catalogId === viewingCatalogId);

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <div style={styles.headerRow}>
          <button style={styles.backBtn} onClick={onBack}>{t("store.mine.backLink")}</button>
          <h1 style={styles.title}>{t("store.mine.title")}</h1>
          <span />
        </div>

        <div style={styles.tabsRow}>
          <button style={styles.tabBtn(tab === "published")} onClick={() => setTab("published")}>
            {t("store.mine.tabPublished")}
          </button>
          <button style={styles.tabBtn(tab === "drafts")} onClick={() => setTab("drafts")}>
            {t("store.mine.tabDrafts")}
          </button>
          <button style={styles.tabBtn(tab === "catalogs")} onClick={() => setTab("catalogs")}>
            {t("store.mine.tabCatalogs")}
          </button>
        </div>

        {tab === "published" && (
          published.length === 0 ? (
            <p style={styles.empty}>{t("store.mine.emptyPublished")}</p>
          ) : (
            published.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                t={t}
                onOpenProduct={onOpenProduct}
                onEditProduct={onEditProduct}
                onDelete={handleDelete}
                onTogglePublish={handleTogglePublish}
              />
            ))
          )
        )}

        {tab === "drafts" && (
          drafts.length === 0 ? (
            <p style={styles.empty}>{t("store.mine.emptyDrafts")}</p>
          ) : (
            drafts.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                t={t}
                onOpenProduct={onOpenProduct}
                onEditProduct={onEditProduct}
                onDelete={handleDelete}
                onTogglePublish={handleTogglePublish}
              />
            ))
          )
        )}

        {tab === "catalogs" && (
          viewingCatalogId ? (
            <>
              <button style={styles.backBtn} onClick={() => setViewingCatalogId(null)}>
                {t("store.mine.viewingCatalogBack")}
              </button>
              <p style={styles.catalogName}>{viewingCatalog?.name}</p>
              {catalogProducts.length === 0 ? (
                <p style={styles.empty}>{t("store.mine.emptyPublished")}</p>
              ) : (
                catalogProducts.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    t={t}
                    onOpenProduct={onOpenProduct}
                    onEditProduct={onEditProduct}
                    onDelete={handleDelete}
                    onTogglePublish={handleTogglePublish}
                  />
                ))
              )}
            </>
          ) : (
            <>
              <button style={styles.createCatalogBtn} onClick={() => setCreatingCatalog((v) => !v)}>
                {creatingCatalog ? t("store.mine.catalogCancel") : t("store.mine.createCatalogButton")}
              </button>
              {creatingCatalog && (
                <CreateCatalogForm
                  currentUid={currentUid}
                  t={t}
                  onCreated={() => setCreatingCatalog(false)}
                  onCancel={() => setCreatingCatalog(false)}
                />
              )}
              {catalogs.length === 0 ? (
                <p style={styles.empty}>{t("store.mine.emptyCatalogs")}</p>
              ) : (
                catalogs.map((c) => (
                  <div key={c.id} style={styles.catalogRow} onClick={() => setViewingCatalogId(c.id)}>
                    <div style={{ minWidth: 0 }}>
                      <p style={styles.catalogName}>{c.name}</p>
                      {c.description && <p style={styles.catalogDescription}>{c.description}</p>}
                    </div>
                    <span style={styles.catalogCount}>
                      {t("store.mine.catalogProductCount", { count: c.productCount || 0 })}
                    </span>
                  </div>
                ))
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
