import React, { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useLanguage } from "./LanguageContext";
import { CATEGORIES, TIERS, getProductImages, notifyFollowersOfNewProduct } from "./storeData";
import MultiImageUploader from "./MultiImageUploader";

/*
  CreateProductScreen
  --------------------
  Sub-vista de StoreScreen.jsx (crear o editar un producto, según si
  "productId" viene o no). Al guardar, si se eligió/creó un catálogo,
  mantiene "catalogs/{catalogId}.productCount" en sincronía a mano
  (Firestore no tiene triggers del lado del cliente): suma 1 al catálogo
  nuevo y resta 1 al catálogo anterior si cambió (mismo espíritu que
  syncPostsPrivacyField en AuthProfile.jsx — mantener un campo
  denormalizado al día cuando cambia lo que lo origina).

  IMAGEN DEL PRODUCTO: las fotos se suben a
  "productImages/{uid}/{productId}/img_N.jpg" en Cloud Storage, pero al
  CREAR un producto todavía no existe ningún "productId" — recién lo
  asigna Firestore cuando el documento se escribe. Se resuelve generando
  el id del lado del cliente con "doc(collection(db,'products')).id"
  ANTES de mostrar el formulario (no escribe nada en Firestore, solo
  reserva un id) y usando ESE mismo id tanto para la ruta de Storage como
  para el documento final (setDoc en vez de addDoc). Al editar, se usa
  directamente el "productId" real que ya existía. (Introducido en el
  punto 59 con una sola foto; el punto 60 lo extiende a hasta 5 —
  ver MultiImageUploader.jsx — renombrado en el punto 61 al generalizarse.)

  NOTIFICAR SEGUIDORES AL PUBLICAR (punto 60): cuando "isPublished" pasa
  de false a true (crear directo como publicado, o editar un borrador y
  publicarlo) se avisa a cada seguidor del vendedor
  (notifyFollowersOfNewProduct en storeData.js) — NO cuando ya estaba
  publicado y solo se edita algo (evita spamear a los seguidores por cada
  cambio menor). "originalIsPublishedRef" guarda el estado ANTES de este
  guardado para poder detectar esa transición. El mismo aviso también
  puede dispararse desde MyStoreScreen.jsx (botón "Publicar" de un
  borrador), que llama a la misma función compartida.
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
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "22px",
    fontWeight: 700,
    margin: "0 0 20px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    color: "var(--text-muted)",
    margin: "0 0 6px",
    fontWeight: 500,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "15px",
    color: "var(--text)",
    marginBottom: "18px",
    outline: "none",
    fontFamily: "inherit",
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "15px",
    color: "var(--text)",
    marginBottom: "18px",
    outline: "none",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "15px",
    color: "var(--text)",
    marginBottom: "18px",
    outline: "none",
    resize: "none",
    minHeight: "90px",
    fontFamily: "inherit",
  },
  row2: { display: "flex", gap: "12px" },
  col: { flex: 1, minWidth: 0 },
  toggleRow: { display: "flex", gap: "8px", marginBottom: "18px" },
  toggleBtn: (active) => ({
    flex: 1,
    padding: "10px",
    borderRadius: "12px",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--accent2-soft)" : "var(--surface-alt)",
    color: active ? "var(--accent2)" : "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  }),
  switchRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "18px",
  },
  switchText: { fontSize: "13px" },
  switchHint: { fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 0" },
  switch: (on) => ({
    width: "44px",
    height: "24px",
    borderRadius: "999px",
    background: on ? "var(--accent2)" : "var(--surface-alt)",
    border: `1px solid ${on ? "var(--accent2)" : "var(--border)"}`,
    position: "relative",
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.15s",
  }),
  switchDot: (on) => ({
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "#fff",
    position: "absolute",
    top: "2px",
    left: on ? "23px" : "2px",
    transition: "left 0.15s",
  }),
  newCatalogBox: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "14px",
    padding: "14px",
    marginTop: "-8px",
    marginBottom: "18px",
  },
  tierRow: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" },
  tierOption: (active) => ({
    padding: "14px",
    borderRadius: "14px",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--accent2-soft)" : "var(--surface-alt)",
    cursor: "pointer",
  }),
  tierLabel: (active) => ({
    fontSize: "14px",
    fontWeight: 700,
    margin: 0,
    color: active ? "var(--accent2)" : "var(--text)",
  }),
  tierDescription: { fontSize: "12px", color: "var(--text-muted)", margin: "4px 0 0" },
  imageUploaderWrap: { marginBottom: "18px" },
  error: {
    background: "var(--accent2-softer)",
    border: "1px solid var(--accent2-soft-border)",
    color: "var(--accent2)",
    fontSize: "13px",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "16px",
  },
  actionsRow: { display: "flex", gap: "10px", flexWrap: "wrap" },
  draftBtn: {
    flex: 1,
    padding: "13px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  publishBtn: {
    flex: 1,
    padding: "13px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
  },
};

const NEW_CATALOG_VALUE = "__new__";

export default function CreateProductScreen({ productId, currentUid, myProfile, onDone, onCancel }) {
  const { t } = useLanguage();
  const isEdit = !!productId;
  const [loading, setLoading] = useState(isEdit);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState("new");
  const [manufacturer, setManufacturer] = useState("");
  const [isPersonalDesign, setIsPersonalDesign] = useState(false);
  const [catalogs, setCatalogs] = useState([]);
  const [catalogChoice, setCatalogChoice] = useState("");
  const [newCatalogName, setNewCatalogName] = useState("");
  const [newCatalogDescription, setNewCatalogDescription] = useState("");
  const [tier, setTier] = useState("standard");
  const [imageUrls, setImageUrls] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const originalCatalogIdRef = useRef(null);
  // Estado de "isPublished" ANTES de este guardado — false para un
  // producto nuevo. Sirve para detectar la transición borrador -> publicado
  // y notificar a los seguidores solo esa vez (punto 60, ver docstring).
  const originalIsPublishedRef = useRef(false);

  // Id real del producto (modo editar) o id generado del lado del cliente
  // para uno nuevo (modo crear) — ver el docstring de arriba. "useState"
  // en vez de "useMemo" a propósito: se calcula UNA sola vez al montar el
  // componente y nunca más, aunque "productId" cambiara (no debería, cada
  // producto abre su propia instancia de esta pantalla con una "key"
  // implícita al desmontar/montar desde StoreScreen.jsx).
  const [effectiveProductId] = useState(
    () => productId || doc(collection(db, "products")).id
  );

  useEffect(() => {
    if (!currentUid) return;
    (async () => {
      const snap = await getDocs(query(collection(db, "catalogs"), where("sellerId", "==", currentUid)));
      setCatalogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, [currentUid]);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const snap = await getDoc(doc(db, "products", productId));
      if (snap.exists()) {
        const p = snap.data();
        setTitle(p.title || "");
        setDescription(p.description || "");
        setCategory(p.category || "");
        setPrice(String(p.price ?? ""));
        setQuantity(String(p.quantity ?? "1"));
        setCondition(p.condition || "new");
        setManufacturer(p.manufacturer || "");
        setIsPersonalDesign(!!p.isPersonalDesign);
        setCatalogChoice(p.catalogId || "");
        originalCatalogIdRef.current = p.catalogId || null;
        setTier(p.tier || "standard");
        // getProductImages: retrocompatible con productos de antes del
        // punto 60 que solo tenían "imageUrl" (string singular) — ver
        // storeData.js.
        setImageUrls(getProductImages(p));
        originalIsPublishedRef.current = !!p.isPublished;
      }
      setLoading(false);
    })();
  }, [isEdit, productId]);

  const handleSave = async (isPublished) => {
    setError("");
    if (!title.trim() || !price || !category) {
      setError(t("store.create.validationError"));
      return;
    }
    if (catalogChoice === NEW_CATALOG_VALUE && !newCatalogName.trim()) {
      setError(t("store.create.validationError"));
      return;
    }
    setSaving(true);
    try {
      let finalCatalogId = catalogChoice === NEW_CATALOG_VALUE ? null : catalogChoice || null;

      if (catalogChoice === NEW_CATALOG_VALUE) {
        const catalogRef = await addDoc(collection(db, "catalogs"), {
          name: newCatalogName.trim(),
          description: newCatalogDescription.trim(),
          sellerId: currentUid,
          sellerName: myProfile?.displayName || "",
          productCount: 0,
          createdAt: serverTimestamp(),
        });
        finalCatalogId = catalogRef.id;
      }

      const data = {
        title: title.trim(),
        description: description.trim(),
        category,
        quantity: parseInt(quantity, 10) || 0,
        condition,
        manufacturer: manufacturer.trim(),
        isPersonalDesign,
        price: parseFloat(price) || 0,
        currency: "USD",
        sellerId: currentUid,
        sellerName: myProfile?.displayName || "",
        sellerIdentity: myProfile?.identity || "",
        catalogId: finalCatalogId,
        isPublished,
        tier,
        // "imageUrl" (portada, retrocompatible con quien todavía lo lea)
        // + "imageUrls" (array completo, hasta 5 — punto 60). Si no se
        // subió ninguna foto, ambos quedan vacíos — permitido, mismo
        // criterio de siempre.
        imageUrl: imageUrls[0] || "",
        imageUrls,
        updatedAt: serverTimestamp(),
      };

      if (isEdit) {
        await updateDoc(doc(db, "products", productId), data);
      } else {
        data.isOfficialBrand = false;
        data.giftCount = 0;
        data.viewCount = 0;
        data.createdAt = serverTimestamp();
        // setDoc (no addDoc) con el id generado al montar el componente:
        // MultiImageUploader ya pudo haber subido fotos a
        // "productImages/{uid}/{effectiveProductId}/img_N.jpg" ANTES de
        // este guardado, así que el documento tiene que nacer con ese
        // mismo id — ver el docstring de arriba.
        await setDoc(doc(db, "products", effectiveProductId), data);
      }

      // Notificar a los seguidores SOLO en la transición borrador ->
      // publicado (punto 60, ver docstring) — nunca al editar algo que
      // ya estaba publicado.
      if (isPublished && !originalIsPublishedRef.current) {
        notifyFollowersOfNewProduct({
          sellerId: currentUid,
          sellerName: myProfile?.displayName,
          sellerIdentity: myProfile?.identity,
          productId: effectiveProductId,
          productTitle: title.trim(),
        }).catch(() => {});
      }

      const originalCatalogId = originalCatalogIdRef.current;
      if (originalCatalogId !== finalCatalogId) {
        if (originalCatalogId) {
          await updateDoc(doc(db, "catalogs", originalCatalogId), { productCount: increment(-1) });
        }
        if (finalCatalogId) {
          await updateDoc(doc(db, "catalogs", finalCatalogId), { productCount: increment(1) });
        }
      }

      onDone();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <p>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <button style={styles.backBtn} onClick={onCancel}>{t("store.create.backLink")}</button>
        <h1 style={styles.title}>{isEdit ? t("store.create.titleEdit") : t("store.create.titleNew")}</h1>

        {error && <p style={styles.error}>{error}</p>}

        <label style={styles.label}>{t("store.create.titleLabel")}</label>
        <input
          style={styles.input}
          type="text"
          placeholder={t("store.create.titlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label style={styles.label}>{t("store.create.descriptionLabel")}</label>
        <textarea
          style={styles.textarea}
          placeholder={t("store.create.descriptionPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label style={styles.label}>{t("store.create.categoryLabel")}</label>
        <select style={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t("store.create.categoryPlaceholder")}</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.emoji} {t(c.labelKey)}
            </option>
          ))}
        </select>

        <div style={styles.row2}>
          <div style={styles.col}>
            <label style={styles.label}>{t("store.create.priceLabel")}</label>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="0.01"
              placeholder="$ 0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div style={styles.col}>
            <label style={styles.label}>{t("store.create.quantityLabel")}</label>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
        </div>

        <label style={styles.label}>{t("store.create.conditionLabel")}</label>
        <div style={styles.toggleRow}>
          <button type="button" style={styles.toggleBtn(condition === "new")} onClick={() => setCondition("new")}>
            {t("store.create.conditionNewOption")}
          </button>
          <button type="button" style={styles.toggleBtn(condition === "used")} onClick={() => setCondition("used")}>
            {t("store.create.conditionUsedOption")}
          </button>
        </div>

        <label style={styles.label}>{t("store.create.manufacturerLabel")}</label>
        <input
          style={styles.input}
          type="text"
          placeholder={t("store.create.manufacturerPlaceholder")}
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
        />

        <div style={styles.switchRow}>
          <div>
            <p style={styles.switchText}>{t("store.create.personalDesignLabel")}</p>
            <p style={styles.switchHint}>{t("store.create.personalDesignHint")}</p>
          </div>
          <div
            style={styles.switch(isPersonalDesign)}
            onClick={() => setIsPersonalDesign((v) => !v)}
          >
            <div style={styles.switchDot(isPersonalDesign)} />
          </div>
        </div>

        <label style={styles.label}>{t("store.create.catalogLabel")}</label>
        <select style={styles.select} value={catalogChoice} onChange={(e) => setCatalogChoice(e.target.value)}>
          <option value="">{t("store.create.catalogNone")}</option>
          {catalogs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value={NEW_CATALOG_VALUE}>{t("store.create.catalogNew")}</option>
        </select>

        {catalogChoice === NEW_CATALOG_VALUE && (
          <div style={styles.newCatalogBox}>
            <label style={styles.label}>{t("store.create.newCatalogNameLabel")}</label>
            <input
              style={styles.input}
              type="text"
              placeholder={t("store.create.newCatalogNamePlaceholder")}
              value={newCatalogName}
              onChange={(e) => setNewCatalogName(e.target.value)}
            />
            <label style={styles.label}>{t("store.create.newCatalogDescriptionLabel")}</label>
            <textarea
              style={{ ...styles.textarea, marginBottom: 0 }}
              placeholder={t("store.create.newCatalogDescriptionPlaceholder")}
              value={newCatalogDescription}
              onChange={(e) => setNewCatalogDescription(e.target.value)}
            />
          </div>
        )}

        <label style={styles.label}>{t("store.create.tierLabel")}</label>
        <div style={styles.tierRow}>
          {TIERS.map((tierOption) => {
            const active = tier === tierOption.value;
            return (
              <div key={tierOption.value} style={styles.tierOption(active)} onClick={() => setTier(tierOption.value)}>
                <p style={styles.tierLabel(active)}>{t(tierOption.labelKey)}</p>
                <p style={styles.tierDescription}>{t(tierOption.descriptionKey)}</p>
              </div>
            );
          })}
        </div>

        <label style={styles.label}>{t("store.create.imageLabel")}</label>
        <div style={styles.imageUploaderWrap}>
          <MultiImageUploader
            basePath={`productImages/${currentUid}/${effectiveProductId}`}
            images={imageUrls}
            onChange={setImageUrls}
            maxImages={5}
            maxSize={1024}
          />
        </div>

        <div style={styles.actionsRow}>
          <button type="button" style={styles.draftBtn} disabled={saving} onClick={() => handleSave(false)}>
            {saving ? t("store.create.saving") : t("store.create.saveDraftButton")}
          </button>
          <button type="button" style={styles.publishBtn} disabled={saving} onClick={() => handleSave(true)}>
            {saving
              ? t("store.create.saving")
              : isEdit
              ? t("store.create.saveChangesButton")
              : t("store.create.publishButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
