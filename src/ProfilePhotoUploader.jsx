import React, { useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { storage } from "./firebaseStorage";
import { useLanguage } from "./LanguageContext";
import ImageEditor from "./ImageEditor";

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
  3. Se abre `ImageEditor.jsx` (punto 65): la persona puede girar la foto
     de a 90° y mover/achicar el recorte, siempre CUADRADO (`squareOnly`),
     con una guía circular de lo que se ve en `Avatar.jsx`. Sin tocar nada,
     el recorte es el cuadrado centrado más grande — lo mismo que hacía
     este archivo antes del editor. El editor devuelve el resultado ya
     reducido a 512x512 como máximo y en JPEG 0.85, que para fotos pesa
     mucho menos que PNG: una foto de cámara de varios MB queda en unas
     decenas de KB. "Cancelar" (o Escape) no sube nada.
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

// Tope del archivo ORIGINAL que se acepta procesar (el resultado subido
// siempre pesa muchísimo menos). Evita que alguien intente cargar en
// memoria un archivo enorme antes de que el canvas lo reduzca.
const MAX_INPUT_MB = 10;

const TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfilePhotoUploader({ uid, photoURL }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState(null); // null | "change" | "remove"
  const [editingFile, setEditingFile] = useState(null); // File abierto en ImageEditor

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

    // Punto 65: antes de subir, se abre el editor (girar/recortar).
    setEditingFile(file);
  };

  // "Usar foto" en ImageEditor: el Blob ya viene girado, recortado al
  // cuadrado, reducido a MAX_SIDE y en JPEG 0.85.
  const handleEdited = async (blob) => {
    setEditingFile(null);
    setBusy(true);
    try {
      await uploadBytes(photoRef(), blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(photoRef());
      await updateDoc(doc(db, "users", uid), { photoURL: url });
    } catch (err) {
      // Fallo de red, de permisos de Storage o de Firestore (los errores
      // de "no se pudo abrir la imagen" llegan por handleEditorError).
      setError(t("photo.errorUpload"));
    } finally {
      setBusy(false);
    }
  };

  // "decode"/"noblob"/"empty"/"nocontext" de ImageEditor: archivo corrupto
  // o formato que el navegador no puede abrir.
  const handleEditorError = () => {
    setEditingFile(null);
    setError(t("photo.errorRead"));
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

      {editingFile && (
        <ImageEditor
          file={editingFile}
          squareOnly
          circleGuide
          maxSize={MAX_SIDE}
          onConfirm={handleEdited}
          onCancel={() => setEditingFile(null)}
          onError={handleEditorError}
        />
      )}
    </div>
  );
}
