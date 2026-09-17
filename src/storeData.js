import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { notify } from "./utils";

/*
  storeData.js
  ------------
  Lógica de la Tienda (Marketplace, Fase 1) COMPARTIDA entre pantallas:
  las categorías fijas de producto (con su emoji), los tiers de vendedor
  (comisión estándar/PridePlus), la retrocompatibilidad de imágenes de
  producto, y la notificación a seguidores al publicar (punto 60). Mismo
  patrón que identityStyles.js/profileFields.js — un solo lugar para
  agregar una categoría o ajustar una comisión, usado tanto por
  StoreScreen.jsx (chips de filtro) como por CreateProductScreen.jsx
  (selector) y ProductDetailScreen.jsx (badge). Las claves ("Ropa y
  Moda", etc.) son también los VALORES que se guardan en
  products/{productId}.category — están duplicadas como lista en
  firestore.rules (categoriaDeProductoValida) porque las reglas no
  pueden importar este archivo. "labelKey" es la clave de
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

// Fotos de un producto (punto 60), con retrocompatibilidad centralizada
// en un solo lugar: productos nuevos guardan "imageUrls" (array, hasta 5,
// ver ProductPhotosUploader.jsx), productos de ANTES de este punto solo
// tienen "imageUrl" (string singular). Devuelve siempre un array — vacío
// si el producto no tiene ninguna foto. Lo usan StoreScreen.jsx,
// ProductDetailScreen.jsx y MyStoreScreen.jsx en vez de leer
// "product.imageUrl"/"product.imageUrls" cada uno por su cuenta.
export function getProductImages(product) {
  if (!product) return [];
  if (Array.isArray(product.imageUrls) && product.imageUrls.length > 0) {
    return product.imageUrls;
  }
  return product.imageUrl ? [product.imageUrl] : [];
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

// Notifica a todos los seguidores del vendedor cuando uno de sus
// productos pasa de borrador a publicado (punto 60). Centralizado acá
// porque esto pasa desde DOS lugares distintos — CreateProductScreen.jsx
// (crear directo como publicado, o editar un borrador y publicarlo) y
// MyStoreScreen.jsx (botón "Publicar" de un borrador ya existente) — y
// así ninguno de los dos repite la consulta ni el bucle.
//
// "Seguidor de X" = cualquier usuario cuyo "following" contenga el uid
// de X (mismo criterio que ya usa UserProfile.jsx para contar
// seguidores) — no existe una colección "follows" aparte, "following"
// vive en el propio users/{uid}. Una notificación por seguidor, con
// Promise.all (mismo patrón que ya usa Feed.jsx para notificar a varias
// personas mencionadas a la vez).
export async function notifyFollowersOfNewProduct({
  sellerId,
  sellerName,
  sellerIdentity,
  productId,
  productTitle,
}) {
  const snap = await getDocs(
    query(collection(db, "users"), where("following", "array-contains", sellerId))
  );
  await Promise.all(
    snap.docs.map((d) =>
      notify(d.id, {
        type: "newProduct",
        fromUid: sellerId,
        fromName: sellerName || "Alguien",
        fromIdentity: sellerIdentity || "",
        productId,
        productTitle,
      })
    )
  );
}
