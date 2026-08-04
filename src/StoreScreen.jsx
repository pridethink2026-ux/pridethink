import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import Avatar from "./Avatar";
import { useLanguage } from "./LanguageContext";
import { useIsMobile } from "./utils";
import { CATEGORIES } from "./storeData";
import ProductDetailScreen from "./ProductDetailScreen";
import CreateProductScreen from "./CreateProductScreen";
import MyStoreScreen from "./MyStoreScreen";

/*
  StoreScreen
  -----------
  Pantalla principal de la Tienda (Marketplace, Fase 1) — pestaña "tienda"
  de App.js, mismo nivel que Feed/Chat/Search. También hace de "mini
  router" interno de toda la Tienda: en vez de sumar tres estados de
  overlay más a App.js (uno por ProductDetailScreen/CreateProductScreen/
  MyStoreScreen), esos tres viven como sub-vistas manejadas ACÁ con
  estado local ("subView"), mismo espíritu que GroupView/PostView son
  overlays de App.js pero un nivel más abajo. Solo "onOpenProfile" viaja
  hasta acá desde App.js (para el enlace al perfil del vendedor en
  ProductDetailScreen), porque ESE overlay sí es a nivel de toda la app.

  currentUid/myProfile se escuchan UNA vez acá (no en cada subpantalla)
  y se pasan como prop hacia abajo — evita repetir el mismo listener de
  auth/perfil en cuatro componentes distintos.

  Los productos publicados se escuchan con onSnapshot filtrando SOLO por
  "isPublished" (sin orderBy, para no necesitar un índice compuesto en
  Firestore — mismo motivo/patrón que ya usa GroupView.jsx con
  "authorIsPrivate"), y se ordenan/filtran (búsqueda, categoría,
  oficial/comunidad) del lado del cliente.
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
    position: "relative",
  },
  column: { width: "100%", maxWidth: "720px" },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "16px",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "24px",
    fontWeight: 700,
    margin: 0,
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  },
  myStoreBtn: {
    padding: "8px 16px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "12px 18px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
    marginBottom: "16px",
  },
  categoryRow: {
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "6px",
    marginBottom: "22px",
  },
  categoryChip: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    borderRadius: "999px",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--accent2-soft)" : "var(--surface)",
    color: active ? "var(--accent2)" : "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    userSelect: "none",
  }),
  section: { marginBottom: "30px" },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "14px",
  },
  sectionTitle: {
    fontSize: "13px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 700,
    fontFamily: "var(--font-display)",
    color: "var(--text-muted)",
    margin: 0,
  },
  officialCheck: {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    background: "var(--accent)",
    color: "var(--bg)",
    fontSize: "10px",
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: "14px",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "18px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
    overflow: "hidden",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
  },
  cardImagePlaceholder: {
    width: "100%",
    aspectRatio: "1 / 1",
    background: "var(--surface-alt)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
  },
  cardBody: { padding: "10px 12px 12px" },
  cardTitle: {
    fontSize: "13px",
    fontWeight: 600,
    margin: "0 0 6px",
    color: "var(--text)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    lineHeight: 1.3,
    minHeight: "2.6em",
  },
  cardPrice: {
    fontSize: "15px",
    fontWeight: 700,
    margin: "0 0 8px",
    color: "var(--text)",
  },
  badgeRow: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" },
  conditionBadge: (isNew) => ({
    fontSize: "10px",
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: "999px",
    background: isNew ? "rgba(34,197,94,0.15)" : "rgba(255,151,66,0.18)",
    color: isNew ? "#22c55e" : "#ff9742",
  }),
  pridePlusBadge: {
    fontSize: "10px",
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: "999px",
    background: "var(--accent-soft)",
    color: "var(--accent)",
  },
  sellerRow: { display: "flex", alignItems: "center", gap: "6px" },
  sellerName: {
    fontSize: "11px",
    color: "var(--text-muted)",
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "13px",
    padding: "20px 0",
  },
  fab: (isMobile) => ({
    position: "fixed",
    right: "24px",
    bottom: isMobile ? "78px" : "28px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "26px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
    zIndex: 20,
  }),
};

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ProductCard({ product, onOpen }) {
  const { t } = useLanguage();
  return (
    <div style={styles.card} onClick={() => onOpen(product.id)}>
      <div style={styles.cardImagePlaceholder}>
        <CameraIcon />
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardTitle}>{product.title}</p>
        <p style={styles.cardPrice}>${product.price}</p>
        <div style={styles.badgeRow}>
          <span style={styles.conditionBadge(product.condition === "new")}>
            {product.condition === "new" ? t("store.conditionNew") : t("store.conditionUsed")}
          </span>
          {product.tier === "prime" && <span style={styles.pridePlusBadge}>{t("store.pridePlusBadge")}</span>}
        </div>
        <div style={styles.sellerRow}>
          <Avatar uid={product.sellerId} name={product.sellerName} identity={product.sellerIdentity} size="sm" />
          <p style={styles.sellerName}>{product.sellerName}</p>
        </div>
      </div>
    </div>
  );
}

export default function StoreScreen({ onOpenProfile, initialProductId, onConsumeInitialProductId, onGoToSearch }) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(null);
  const [subView, setSubView] = useState({ type: "list" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUid(u ? u.uid : null));
    return unsub;
  }, []);

  // Llegada desde un regalo en el chat (ver App.js -> openStoreProduct):
  // abre ESE producto directo, sin pasar por la lista, y avisa al padre
  // para "consumir" el pedido (si no, volver a esta pantalla más tarde
  // reabriría el mismo producto sin que nadie lo haya tocado de nuevo).
  useEffect(() => {
    if (!initialProductId) return;
    setSubView({ type: "detail", productId: initialProductId });
    onConsumeInitialProductId && onConsumeInitialProductId();
  }, [initialProductId, onConsumeInitialProductId]);

  useEffect(() => {
    if (!currentUid) {
      setMyProfile(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", currentUid), (snap) => {
      setMyProfile(snap.exists() ? snap.data() : null);
    });
    return unsub;
  }, [currentUid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.isPublished);
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setProducts(list);
    });
    return unsub;
  }, []);

  const searchLower = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (searchLower && !(p.title || "").toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [products, category, searchLower]);

  const officialProducts = filtered.filter((p) => p.isOfficialBrand);
  const communityProducts = filtered.filter((p) => !p.isOfficialBrand);

  const openProduct = (productId) => setSubView({ type: "detail", productId });
  const openCreate = () => setSubView({ type: "create" });
  const openEdit = (productId) => setSubView({ type: "edit", productId });
  const openMyStore = () => setSubView({ type: "mystore" });
  const backToList = () => setSubView({ type: "list" });

  if (subView.type === "detail") {
    return (
      <ProductDetailScreen
        productId={subView.productId}
        currentUid={currentUid}
        myProfile={myProfile}
        onBack={backToList}
        onOpenProfile={onOpenProfile}
        onEdit={openEdit}
        onGoToSearch={onGoToSearch}
      />
    );
  }
  if (subView.type === "create" || subView.type === "edit") {
    return (
      <CreateProductScreen
        productId={subView.type === "edit" ? subView.productId : null}
        currentUid={currentUid}
        myProfile={myProfile}
        onDone={backToList}
        onCancel={backToList}
      />
    );
  }
  if (subView.type === "mystore") {
    return (
      <MyStoreScreen
        currentUid={currentUid}
        onBack={backToList}
        onOpenProduct={openProduct}
        onEditProduct={openEdit}
      />
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>{t("store.title")}</h1>
          <button style={styles.myStoreBtn} onClick={openMyStore}>
            {t("store.myStoreButton")}
          </button>
        </div>

        <input
          style={styles.searchInput}
          type="text"
          placeholder={t("store.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div style={styles.categoryRow}>
          <span style={styles.categoryChip(category === null)} onClick={() => setCategory(null)}>
            {t("store.categoryAll")}
          </span>
          {CATEGORIES.map((c) => (
            <span
              key={c.key}
              style={styles.categoryChip(category === c.key)}
              onClick={() => setCategory(category === c.key ? null : c.key)}
            >
              {c.emoji} {t(c.labelKey)}
            </span>
          ))}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.officialCheck} title={t("store.officialBadge")}>✓</span>
            <h2 style={styles.sectionTitle}>{t("store.officialBrandsSection")}</h2>
          </div>
          {officialProducts.length === 0 ? (
            <p style={styles.empty}>{t("store.emptySection")}</p>
          ) : (
            <div style={styles.grid}>
              {officialProducts.map((p) => (
                <ProductCard key={p.id} product={p} onOpen={openProduct} />
              ))}
            </div>
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>{t("store.communitySection")}</h2>
          </div>
          {communityProducts.length === 0 ? (
            <p style={styles.empty}>{t("store.emptySection")}</p>
          ) : (
            <div style={styles.grid}>
              {communityProducts.map((p) => (
                <ProductCard key={p.id} product={p} onOpen={openProduct} />
              ))}
            </div>
          )}
        </div>
      </div>

      {currentUid && (
        <button style={styles.fab(isMobile)} onClick={openCreate} title={t("store.createFabTitle")}>
          <PlusIcon />
        </button>
      )}
    </div>
  );
}
