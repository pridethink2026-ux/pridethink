/*
  storeData.js
  ------------
  Lógica pura (sin JSX) COMPARTIDA de la Tienda (Marketplace, Fase 1):
  las categorías fijas de producto (con su emoji) y los tiers de vendedor
  (comisión estándar/PridePlus). Mismo patrón que identityStyles.js/
  profileFields.js — un solo lugar para agregar una categoría o ajustar
  una comisión, usado tanto por StoreScreen.jsx (chips de filtro) como
  por CreateProductScreen.jsx (selector) y ProductDetailScreen.jsx
  (badge). Las claves ("Ropa y Moda", etc.) son también los VALORES que
  se guardan en products/{productId}.category — están duplicadas como
  lista en firestore.rules (categoriaDeProductoValida) porque las reglas
  no pueden importar este archivo. "labelKey" es la clave de
  translations.js con la etiqueta traducida — el "key" NO se traduce
  (es el valor persistido), mismo criterio que TIERS.value más abajo.
*/

export const CATEGORIES = [
  { key: "Ropa y Moda", emoji: "👕", labelKey: "store.categoryClothing" },
  { key: "Accesorios", emoji: "👜", labelKey: "store.categoryAccessories" },
  { key: "Arte y Diseño", emoji: "🎨", labelKey: "store.categoryArtDesign" },
  { key: "Joyería", emoji: "💍", labelKey: "store.categoryJewelry" },
  { key: "Belleza y Cuidado", emoji: "💄", labelKey: "store.categoryBeauty" },
  { key: "Hogar y Decoración", emoji: "🏡", labelKey: "store.categoryHome" },
  { key: "Tecnología", emoji: "💻", labelKey: "store.categoryTech" },
  { key: "Libros y Medios", emoji: "📚", labelKey: "store.categoryBooksMedia" },
  { key: "Artesanías", emoji: "🧶", labelKey: "store.categoryCrafts" },
  { key: "Otros", emoji: "✨", labelKey: "store.categoryOther" },
];

export function getCategoryEmoji(categoryKey) {
  return CATEGORIES.find((c) => c.key === categoryKey)?.emoji || "✨";
}

export function getCategoryLabelKey(categoryKey) {
  return CATEGORIES.find((c) => c.key === categoryKey)?.labelKey || null;
}

// "labelKey"/"descriptionKey" son claves de translations.js (el texto
// explicativo de cada tier se traduce, el "value" guardado en Firestore
// no — el valor sigue siendo "prime" por compatibilidad con productos
// existentes, aunque la marca visible ahora es "PridePlus").
export const TIERS = [
  {
    value: "standard",
    labelKey: "store.tierStandardLabel",
    descriptionKey: "store.tierStandardDescription",
  },
  {
    value: "prime",
    labelKey: "store.tierPridePlusLabel",
    descriptionKey: "store.tierPridePlusDescription",
  },
];
