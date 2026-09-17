import React, { useEffect, useState } from "react";
import { useLanguage } from "./LanguageContext";

/*
  ImageViewer
  -----------
  Visor de imagen a pantalla completa (lightbox), punto 60. Overlay fijo
  con fondo oscuro semi-transparente sobre la imagen elegida; si el
  producto tiene más de una foto, permite navegar entre todas con flechas
  (circular: después de la última vuelve a la primera) además de con las
  flechas del teclado. Se cierra con el botón ✕, tocando fuera de la
  imagen, o con Escape.

  Genérico a propósito (no sabe nada de "producto"): recibe el array de
  URLs y el índice inicial, y solo avisa "cerrar" hacia arriba — quien lo
  usa (ProductDetailScreen.jsx, StoreScreen.jsx) decide de dónde salieron
  esas URLs. Si en el futuro se necesita un visor para otras imágenes de
  la app (fotos de perfil, por ejemplo), este componente ya sirve tal
  cual.

  Props:
  - `images` (array de strings, obligatoria): las URLs a mostrar.
  - `startIndex` (número, default 0): con cuál empezar.
  - `onClose()` (obligatoria).

  Fondo `rgba(0,0,0,0.85)` fijo (no de tema) a propósito: mismo criterio
  ya documentado en GiftFriendModal.jsx/SharePostModal.jsx para sus
  overlays — un fondo de "apagar la pantalla" tiene que verse igual sin
  importar el tema visual activo, y ninguna variable de themes.js
  representa ese concepto.
*/

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    zIndex: 60,
    boxSizing: "border-box",
  },
  image: {
    maxWidth: "90vw",
    maxHeight: "85vh",
    objectFit: "contain",
    borderRadius: "8px",
    display: "block",
    userSelect: "none",
  },
  closeBtn: {
    position: "absolute",
    top: "18px",
    right: "18px",
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.3)",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    fontSize: "20px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  navBtn: (side) => ({
    position: "absolute",
    top: "50%",
    [side]: "18px",
    transform: "translateY(-50%)",
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.3)",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    fontSize: "22px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  }),
  counter: {
    position: "absolute",
    bottom: "18px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "5px 14px",
    borderRadius: "999px",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
  },
};

export default function ImageViewer({ images, startIndex = 0, onClose }) {
  const { t } = useLanguage();
  const [index, setIndex] = useState(startIndex);
  const count = images.length;

  const goPrev = () => setIndex((i) => (i - 1 + count) % count);
  const goNext = () => setIndex((i) => (i + 1) % count);

  // Escape cierra, ← / → navegan — se agrega/quita el listener con el
  // componente (se monta/desmonta cada vez que se abre/cierra el visor).
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && count > 1) goPrev();
      else if (e.key === "ArrowRight" && count > 1) goNext();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  if (count === 0) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <img
        src={images[index]}
        alt=""
        style={styles.image}
        onClick={(e) => e.stopPropagation()}
      />

      <button
        style={styles.closeBtn}
        onClick={onClose}
        title={t("imageViewer.close")}
        aria-label={t("imageViewer.close")}
      >
        ✕
      </button>

      {count > 1 && (
        <>
          <button
            style={styles.navBtn("left")}
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            title={t("imageViewer.previous")}
            aria-label={t("imageViewer.previous")}
          >
            ‹
          </button>
          <button
            style={styles.navBtn("right")}
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            title={t("imageViewer.next")}
            aria-label={t("imageViewer.next")}
          >
            ›
          </button>
          <span style={styles.counter}>
            {t("imageViewer.counter", { current: index + 1, total: count })}
          </span>
        </>
      )}
    </div>
  );
}
