import React, { useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";
import { useLanguage } from "./LanguageContext";

/*
  ImageUploader
  -------------
  Componente genérico de "subir una imagen a Cloud Storage" — mismo patrón
  que `ProfilePhotoUploader.jsx` (input oculto, validar antes de subir,
  redimensionar en el navegador con <canvas>, spinner, errores traducidos),
  pero SIN acoplar la subida a ningún documento de Firestore en particular:
  quien lo usa pasa la ruta exacta del bucket (`storagePath`) y recibe la
  URL final por callback (`onUploadComplete`) — es este componente el que
  decide dónde guardar esa URL. Hoy lo usa `CreateProductScreen.jsx` para
  la imagen de un producto (punto 59), pero no tiene nada de Tienda
  adentro: cualquier pantalla futura que necesite subir UNA imagen a UNA
  ruta fija puede reusarlo tal cual.

  DIFERENCIA CLAVE con ProfilePhotoUploader (por qué no se reusó tal
  cual): el avatar SIEMPRE se ve dentro de un círculo, así que recortarlo
  al cuadrado desde el centro es literalmente lo que se termina mostrando.
  Una foto de producto no tiene esa restricción — se ve completa en una
  tarjeta o en el detalle — así que acá se REDIMENSIONA MANTENIENDO EL
  ASPECT RATIO dentro de una caja `maxSize x maxSize`, sin recortar nada.

  Props:
  - `storagePath` (string, obligatoria): ruta completa dentro del bucket,
    ej. "productImages/{uid}/{productId}/main.jpg". Se recalcula en cada
    subida/borrado (no se cachea), así que si cambia entre renders (por
    ejemplo, se pasa un productId distinto) el próximo archivo elegido va
    a la ruta nueva.
  - `onUploadComplete(downloadURL)` (obligatoria): se llama con la URL de
    descarga tras subir, o con "" tras quitar la imagen — mismo criterio
    que `photoURL: ""` en ProfilePhotoUploader, "sin imagen" es un string
    vacío, nunca null/undefined, para que quede bien como valor de
    Firestore.
  - `maxSize` (número, default 1024): lado máximo de la caja donde entra
    la imagen redimensionada (ancho Y alto, lo que sea más grande se
    achica hasta ese tope, el otro lado se ajusta proporcional).
  - `currentImageURL` (string, opcional): imagen ya guardada — se muestra
    como preview antes de elegir un archivo nuevo (ej. al editar un
    producto que ya tenía imagen).

  Igual que ProfilePhotoUploader: si el archivo no es una imagen válida o
  pesa demasiado, se avisa ANTES de tocar la red. "Quitar imagen" borra el
  archivo del bucket (si falla porque ya no estaba, se ignora a propósito)
  y llama a onUploadComplete("").

  Estilos inline y colores del tema activo. El spinner reusa la misma
  clase ".pt-spin" que ya vive en index.css (agregada para
  ProfilePhotoUploader) — ningún CSS nuevo hace falta acá.
*/

const JPEG_QUALITY = 0.85;

// Tope del archivo ORIGINAL que se acepta procesar (el resultado subido
// siempre pesa muchísimo menos). Mismo criterio que ProfilePhotoUploader.
const MAX_INPUT_MB = 10;

const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Redimensiona la imagen para que entre en una caja maxSize x maxSize
// MANTENIENDO el aspect ratio (sin recortar) y devuelve un Blob JPEG. Si
// la imagen ya es más chica que maxSize en los dos lados, no la agranda
// (evita subir una imagen borrosa más grande que el original).
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

export default function ImageUploader({
  storagePath,
  onUploadComplete,
  maxSize = 1024,
  currentImageURL,
}) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState(null); // null | "change" | "remove"

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    // El input se limpia SIEMPRE: si no, elegir el mismo archivo dos veces
    // seguidas (por ejemplo tras un error) no dispara "change" de nuevo.
    e.target.value = "";
    if (!file || !storagePath) return;

    setError("");

    if (!TYPES.includes(file.type)) {
      setError(t("image.errorType"));
      return;
    }
    if (file.size > MAX_INPUT_MB * 1024 * 1024) {
      setError(t("image.errorTooLarge", { max: MAX_INPUT_MB }));
      return;
    }

    setBusy(true);
    try {
      const blob = await resizeKeepingAspect(file, maxSize);
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(fileRef);
      onUploadComplete(url);
    } catch (err) {
      // "decode"/"noblob"/"empty"/"nocontext" vienen de
      // resizeKeepingAspect (archivo corrupto o formato que el navegador
      // no puede abrir); cualquier otra cosa es un fallo de red o de
      // permisos de Storage.
      const localFailure = ["decode", "noblob", "empty", "nocontext"].includes(err?.message);
      setError(localFailure ? t("image.errorRead") : t("image.errorUpload"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!storagePath || busy) return;
    setError("");
    setBusy(true);
    try {
      // Si el archivo ya no existe en el bucket, no es un problema: lo que
      // importa es avisar "sin imagen" hacia arriba. Por eso el borrado va
      // en su propio try, separado del callback.
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (ignored) {
        /* el archivo ya no estaba */
      }
      onUploadComplete("");
    } catch (err) {
      setError(t("image.errorRemove"));
    } finally {
      setBusy(false);
    }
  };

  const previewStyle = {
    width: "100%",
    maxHeight: "260px",
    objectFit: "contain",
    borderRadius: "14px",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    display: "block",
    marginBottom: "10px",
  };

  const baseBtn = {
    padding: "8px 14px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    transition: "background 0.15s ease, border-color 0.15s ease",
  };

  const changeBtnStyle = {
    ...baseBtn,
    background: hovered === "change" && !busy ? "var(--accent-soft)" : "var(--surface-alt)",
    borderColor: hovered === "change" && !busy ? "var(--accent-soft-border)" : "var(--border)",
  };

  const removeBtnStyle = {
    ...baseBtn,
    color: "var(--text-muted)",
    background: hovered === "remove" && !busy ? "var(--accent2-soft)" : "transparent",
    borderColor: hovered === "remove" && !busy ? "var(--accent2-soft-border)" : "var(--border)",
  };

  const spinnerStyle = {
    width: "13px",
    height: "13px",
    borderRadius: "50%",
    border: "2px solid var(--border)",
    borderTopColor: "var(--accent)",
    boxSizing: "border-box",
    flexShrink: 0,
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
      {currentImageURL && <img src={currentImageURL} alt="" style={previewStyle} />}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <button
          type="button"
          style={changeBtnStyle}
          disabled={busy}
          onClick={() => inputRef.current && inputRef.current.click()}
          onMouseEnter={() => setHovered("change")}
          onMouseLeave={() => setHovered(null)}
        >
          {busy && <span className="pt-spin" style={spinnerStyle} />}
          {busy ? t("image.uploading") : currentImageURL ? t("image.change") : t("image.add")}
        </button>

        {currentImageURL && !busy && (
          <button
            type="button"
            style={removeBtnStyle}
            onClick={handleRemove}
            onMouseEnter={() => setHovered("remove")}
            onMouseLeave={() => setHovered(null)}
          >
            {t("image.remove")}
          </button>
        )}
      </div>

      {error && <p style={errorStyle}>{error}</p>}
    </div>
  );
}
