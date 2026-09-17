import React, { useEffect, useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";
import { useLanguage } from "./LanguageContext";

/*
  ProductPhotosUploader
  ----------------------
  Fila horizontal de hasta `maxImages` fotos de un producto (punto 60):
  cada foto ya subida se ve como una miniatura con una "✕" para quitarla,
  y mientras queden lugares libres aparece un cuadro "+" al final para
  agregar otra. Reemplaza a `ImageUploader.jsx` (una sola imagen) en
  `CreateProductScreen.jsx` — se deja `ImageUploader.jsx` intacto y sin
  usar acá a propósito: sigue siendo el primitivo genérico de "una imagen,
  una ruta fija" para el resto de la app (así lo documenta su propio
  archivo), y este componente es específico de la fila de fotos de un
  producto, con su propia numeración de archivos y su propio layout.

  DUPLICACIÓN INTENCIONAL: la validación de tipo/peso y el redimensionado
  con <canvas> son casi idénticos a los de `ImageUploader.jsx` (mismo
  criterio: máximo `maxSize` de lado, manteniendo el aspect ratio, JPEG
  0.85) — se copian acá en vez de importarse porque `ImageUploader.jsx`
  sube UNA imagen con UNA ruta fija ya resuelta por quien lo usa, y este
  componente necesita decidir la ruta de CADA foto por su cuenta (ver
  "numeración de archivos" abajo) — mismo espíritu que `CameraIcon`/
  `BookmarkIcon`, duplicados a propósito entre archivos de la Tienda en
  vez de compartidos, según ya documentan esos componentes.

  NUMERACIÓN DE ARCHIVOS Y POR QUÉ NO ES SIMPLEMENTE "images.length":
  cada foto se sube a "{basePath}/img_{N}.jpg". Si se numerara por la
  POSICIÓN en el array, borrar una foto del medio y agregar una nueva
  haría que la nueva pisara el ARCHIVO de una foto que sigue ahí (ej.:
  fotos en las posiciones 0,1,2 — se borra la 1 → quedan en las
  posiciones 0,1 pero siguen siendo los archivos "img_0.jpg"/"img_2.jpg"
  — si la próxima foto se subiera como "img_{length}.jpg" = "img_1.jpg",
  no chocaría con nada, PERO si en cambio se hubiera borrado la ÚLTIMA en
  vez de la del medio, sí: "img_2.jpg" quedaría libre pero "length" ya
  apunta a un número que NO es el máximo usado). Para evitar esto, un
  contador (`nextSlotRef`) SOLO avanza, nunca se reutiliza dentro de la
  sesión de edición — así puede haber huecos en la numeración
  ("img_0.jpg", "img_2.jpg", sin "img_1.jpg") pero nunca una colisión. Al
  editar un producto ya existente, el contador arranca en la cantidad de
  fotos que ya tenía (se sincroniza con `Math.max` cada vez que cambia la
  cantidad de fotos, así que un borrado nunca lo hace retroceder).

  Al quitar una foto se intenta borrar el archivo real del bucket
  (`deleteObject`, construido directo desde la URL de descarga — el SDK
  de Storage acepta una URL https además de una ruta/gs://) — si falla
  (por ejemplo porque ya no estaba) se ignora a propósito, mismo criterio
  que `ImageUploader.jsx`/`ProfilePhotoUploader.jsx`.

  Props:
  - `basePath` (string): carpeta del bucket, ej.
    "productImages/{uid}/{productId}" (SIN barra final).
  - `images` (array de strings): fotos ya subidas, controlado por quien
    usa este componente.
  - `onChange(newArray)`: se llama con el array actualizado al agregar o
    quitar una foto.
  - `maxImages` (número, default 5).
  - `maxSize` (número, default 1024): igual que en ImageUploader.jsx.
*/

const JPEG_QUALITY = 0.85;
const MAX_INPUT_MB = 10;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

function resizeKeepingAspect(file, maxSize) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (!img.width || !img.height) {
        reject(new Error("empty"));
        return;
      }
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const targetW = Math.round(img.width * scale);
      const targetH = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("nocontext"));
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("noblob"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("decode"));
    };

    img.src = objectUrl;
  });
}

export default function ProductPhotosUploader({
  basePath,
  images,
  onChange,
  maxImages = 5,
  maxSize = 1024,
}) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Ver el docstring de arriba ("NUMERACIÓN DE ARCHIVOS"). Arranca en la
  // cantidad de fotos ya cargadas (0 para un producto nuevo); si más
  // tarde "images" trae más (carga asíncrona de un producto existente en
  // CreateProductScreen.jsx), el efecto lo sube — nunca baja, aunque se
  // borren fotos después.
  const nextSlotRef = useRef(images.length);
  useEffect(() => {
    nextSlotRef.current = Math.max(nextSlotRef.current, images.length);
  }, [images.length]);

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !basePath || images.length >= maxImages) return;

    setError("");

    if (!TYPES.includes(file.type)) {
      setError(t("image.errorType"));
      return;
    }
    if (file.size > MAX_INPUT_MB * 1024 * 1024) {
      setError(t("image.errorTooLarge", { max: MAX_INPUT_MB }));
      return;
    }

    const slot = nextSlotRef.current;
    nextSlotRef.current = slot + 1;

    setBusy(true);
    try {
      const blob = await resizeKeepingAspect(file, maxSize);
      const fileRef = ref(storage, `${basePath}/img_${slot}.jpg`);
      await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(fileRef);
      onChange([...images, url]);
    } catch (err) {
      const localFailure = ["decode", "noblob", "empty", "nocontext"].includes(err?.message);
      setError(localFailure ? t("image.errorRead") : t("image.errorUpload"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (index) => {
    if (busy) return;
    setError("");
    const url = images[index];
    try {
      await deleteObject(ref(storage, url));
    } catch (ignored) {
      /* el archivo ya no estaba, o la URL no se pudo resolver a una ruta */
    }
    onChange(images.filter((_, i) => i !== index));
  };

  const rowStyle = { display: "flex", flexWrap: "wrap", gap: "10px" };
  const slotBase = {
    width: "84px",
    height: "84px",
    borderRadius: "12px",
    position: "relative",
    flexShrink: 0,
    overflow: "hidden",
  };
  const thumbStyle = {
    ...slotBase,
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
  };
  const thumbImgStyle = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };
  const removeBtnStyle = {
    position: "absolute",
    top: "3px",
    right: "3px",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: "12px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
  const addTileStyle = {
    ...slotBase,
    border: "1px dashed var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text-muted)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
  };
  const spinnerStyle = {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    border: "2px solid var(--border)",
    borderTopColor: "var(--accent)",
    boxSizing: "border-box",
  };
  const hintStyle = {
    fontSize: "11px",
    color: "var(--text-muted)",
    margin: "8px 0 0",
  };
  const errorStyle = {
    margin: "8px 0 0",
    padding: "8px 12px",
    borderRadius: "10px",
    background: "var(--accent2-soft)",
    border: "1px solid var(--accent2-soft-border)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    lineHeight: 1.4,
  };

  return (
    <div>
      <div style={rowStyle}>
        {images.map((url, i) => (
          <div key={url + i} style={thumbStyle}>
            <img src={url} alt="" style={thumbImgStyle} />
            <button
              type="button"
              style={removeBtnStyle}
              onClick={() => handleRemove(i)}
              title={t("image.remove")}
              aria-label={t("image.remove")}
            >
              ✕
            </button>
          </div>
        ))}

        {images.length < maxImages && (
          <button
            type="button"
            style={addTileStyle}
            disabled={busy}
            onClick={() => inputRef.current && inputRef.current.click()}
            title={t("image.add")}
            aria-label={t("image.add")}
          >
            {busy ? (
              <span className="pt-spin" style={spinnerStyle} />
            ) : (
              <span style={{ fontSize: "24px", lineHeight: 1 }}>+</span>
            )}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />
      </div>

      <p style={hintStyle}>{t("store.create.imageHint", { count: images.length, max: maxImages })}</p>

      {error && <p style={errorStyle}>{error}</p>}
    </div>
  );
}
