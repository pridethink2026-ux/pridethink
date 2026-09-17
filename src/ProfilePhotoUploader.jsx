import React, { useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { db, storage } from "./firebase";
import { useLanguage } from "./LanguageContext";

/*
  ProfilePhotoUploader
  --------------------
  Botón "Cambiar foto" (+ "Quitar foto" si ya hay una) para la foto de
  perfil. Lo usa `AuthProfile.jsx` (tu propio perfil) — nadie puede cambiar
  la foto de otra persona, ni en la interfaz ni en `storage.rules`.

  Flujo completo de una subida:
  1. Un <input type="file" accept="image/*"> OCULTO: el botón visible lo
     dispara con .click(), así el botón puede tener el mismo estilo que el
     resto de la app (los controles nativos de archivo no se pueden
     estilar de forma consistente entre navegadores).
  2. Se valida tipo y peso ANTES de tocar la red.
  3. Se redimensiona en el navegador con <canvas> a 512x512 como máximo,
     recortando al cuadrado desde el CENTRO (la foto siempre se muestra
     dentro de un círculo en `Avatar.jsx`, así que un recorte cuadrado
     centrado es lo que efectivamente se ve). Se exporta a JPEG, que para
     fotos pesa mucho menos que PNG. Esto baja una foto de cámara de
     varios MB a unas decenas de KB: menos espera para quien sube, menos
     datos para quien mira, y menos consumo del bucket.
  4. Se sube SIEMPRE a la misma ruta `profilePhotos/{uid}/avatar.jpg`, así
     que una foto nueva pisa a la anterior y cada persona nunca ocupa más
     de un archivo en el bucket (nada que limpiar después).
  5. La URL de descarga se guarda en `users/{uid}.photoURL`. Como toda la
     app ya lee ese documento en vivo (AllUsersContext, y los onSnapshot
     de cada pantalla), la foto aparece sola en el muro, el chat, la
     búsqueda y las notificaciones sin ningún refresco manual.

  "Quitar foto" borra el archivo del bucket Y vacía el campo. Si el archivo
  ya no estaba (por ejemplo lo borró Rorby a mano desde la consola), el
  error de borrado se ignora a propósito: lo que de verdad importa para la
  interfaz es que `photoURL` quede vacío.

  Estilos inline y colores del tema activo (var(--...)), como el resto de
  la app. El único class="" es "pt-spin", el spinner: un @keyframes no se
  puede escribir inline, así que vive en index.css igual que el resto de
  las animaciones del proyecto (pt-shimmer, pt-mic-pulse, etc.).
*/

// Lado máximo de la imagen guardada. 512 es de sobra: el avatar más grande
// de la app (`Avatar.jsx`, size "lg") mide 72px, así que incluso en una
// pantalla con densidad 3x sobra resolución.
const MAX_SIDE = 512;
const JPEG_QUALITY = 0.85;

// Tope del archivo ORIGINAL que se acepta procesar (el resultado subido
// siempre pesa muchísimo menos). Evita que alguien intente cargar en
// memoria un archivo enorme antes de que el canvas lo reduzca.
const MAX_INPUT_MB = 10;

const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Recorta la imagen al cuadrado desde el centro y la reduce a MAX_SIDE,
// devolviendo un Blob JPEG. Rechaza si el archivo no se puede decodificar.
function resizeToSquareJpeg(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const side = Math.min(img.width, img.height);
      if (!side) {
        reject(new Error("empty"));
        return;
      }
      const target = Math.min(side, MAX_SIDE);
      const canvas = document.createElement("canvas");
      canvas.width = target;
      canvas.height = target;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("nocontext"));
        return;
      }
      // Origen: el cuadrado centrado más grande que entra en la foto.
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        target,
        target
      );
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

export default function ProfilePhotoUploader({ uid, photoURL }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState(null); // null | "change" | "remove"

  const photoRef = () => ref(storage, `profilePhotos/${uid}/avatar.jpg`);

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    // El input se limpia SIEMPRE: si no, elegir el mismo archivo dos veces
    // seguidas (por ejemplo tras un error) no dispara "change" de nuevo.
    e.target.value = "";
    if (!file || !uid) return;

    setError("");

    if (!TYPES.includes(file.type)) {
      setError(t("photo.errorType"));
      return;
    }
    if (file.size > MAX_INPUT_MB * 1024 * 1024) {
      setError(t("photo.errorTooLarge", { max: MAX_INPUT_MB }));
      return;
    }

    setBusy(true);
    try {
      const blob = await resizeToSquareJpeg(file);
      await uploadBytes(photoRef(), blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(photoRef());
      await updateDoc(doc(db, "users", uid), { photoURL: url });
    } catch (err) {
      // "decode"/"noblob"/"empty"/"nocontext" vienen de resizeToSquareJpeg
      // (archivo corrupto o formato que el navegador no puede abrir);
      // cualquier otra cosa es un fallo de red, de permisos de Storage o
      // de Firestore.
      const localFailure = ["decode", "noblob", "empty", "nocontext"].includes(err?.message);
      setError(localFailure ? t("photo.errorRead") : t("photo.errorUpload"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!uid || busy) return;
    setError("");
    setBusy(true);
    try {
      // Si el archivo ya no existe en el bucket, no es un problema: lo que
      // importa es dejar el campo vacío. Por eso el borrado va en su
      // propio try, separado del updateDoc de abajo.
      try {
        await deleteObject(photoRef());
      } catch (ignored) {
        /* el archivo ya no estaba */
      }
      await updateDoc(doc(db, "users", uid), { photoURL: "" });
    } catch (err) {
      setError(t("photo.errorRemove"));
    } finally {
      setBusy(false);
    }
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
          {busy ? t("photo.uploading") : photoURL ? t("photo.change") : t("photo.add")}
        </button>

        {photoURL && !busy && (
          <button
            type="button"
            style={removeBtnStyle}
            onClick={handleRemove}
            onMouseEnter={() => setHovered("remove")}
            onMouseLeave={() => setHovered(null)}
          >
            {t("photo.remove")}
          </button>
        )}
      </div>

      {error && <p style={errorStyle}>{error}</p>}
    </div>
  );
}
