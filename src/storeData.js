/*
  storeData.js
  ------------
  Lógica pura (sin JSX) COMPARTIDA de la Tienda (Marketplace, Fase 1):
  las categorías fijas de producto (con su emoji) y los tiers de vendedor
  (comisión estándar/prime). Mismo patrón que identityStyles.js/
  profileFields.js — un solo lugar para agregar una categoría o ajustar
  una comisión, usado tanto por StoreScreen.jsx (chips de filtro) como
  por CreateProductScreen.jsx (selector) y ProductDetailScreen.jsx
  (badge). Las claves ("Ropa y Moda", etc.) son también los VALORES que
  se guardan en products/{productId}.category — están duplicadas como
  lista en firestore.rules (categoriaDeProductoValida) porque las reglas
  no pueden importar este archivo.
*/

export const CATEGORIES = [
  { key: "Ropa y Moda", emoji: "👕" },
  { key: "Accesorios", emoji: "👜" },
  { key: "Arte y Diseño", emoji: "🎨" },
  { key: "Joyería", emoji: "💍" },
  { key: "Belleza y Cuidado", emoji: "💄" },
  { key: "Hogar y Decoración", emoji: "🏡" },
  { key: "Tecnología", emoji: "💻" },
  { key: "Libros y Medios", emoji: "📚" },
  { key: "Artesanías", emoji: "🧶" },
  { key: "Otros", emoji: "✨" },
];

export function getCategoryEmoji(categoryKey) {
  return CATEGORIES.find((c) => c.key === categoryKey)?.emoji || "✨";
}

// "commissionKey"/"descriptionKey" son claves de translations.js (el
// texto explicativo de cada tier se traduce, el "value" guardado en
// Firestore no).
export const TIERS = [
  {
    value: "standard",
    labelKey: "store.tierStandardLabel",
    descriptionKey: "store.tierStandardDescription",
  },
  {
    value: "prime",
    labelKey: "store.tierPrimeLabel",
    descriptionKey: "store.tierPrimeDescription",
  },
];
