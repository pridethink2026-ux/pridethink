import React, { useEffect, useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";
import { useLanguage } from "./LanguageContext";
import ImageEditor from "./ImageEditor";

/*
  MultiImageUploader
  -------------------
  Fila horizontal de hasta `maxImages` fotos (genérico — punto 60, hecho
  genérico de verdad en el punto 61): cada foto ya subida se ve como una
  miniatura con una "✕" para quitarla, y mientras queden lugares libres
  aparece un cuadro "+" al final para agregar otra. Introducido como
  `ProductPhotosUploader.jsx` para `CreateProductScreen.jsx` (hasta 5
  fotos de un producto); renombrado en el punto 61 al reusarse también en
  `Feed.jsx` (hasta 4 fotos de un post) — el componente en sí no tenía
  nada específico de la Tienda, solo el nombre. `ImageUploader.jsx` (una
  sola imagen, una ruta fija) sigue intacto y sin usar acá a propósito:
  sigue siendo el primitivo genérico para el caso de UNA sola imagen.

  EDITOR ANTES DE SUBIR (punto 65): elegir fotos (el selector acepta
  VARIAS a la vez, `multiple`) no sube nada todavía — cada foto pasa por
  `ImageEditor.jsx` (girar de a 90°, recorte Libre/Cuadrado), en el orden
  en que se eligieron. "Usar foto" sube el Blob que devuelve el editor (ya
  reducido a `maxSize` de lado, manteniendo el recorte elegido, JPEG 0.85
  — reemplaza a la función de redimensionado que este archivo tenía
  copiada); "Cancelar"/Escape salta SOLO esa foto y sigue con la próxima.
  El máximo (`maxImages`) se respeta igual que antes: si se eligen más
  fotos que lugares libres, se toman las primeras que entran y se avisa
  (`image.tooMany`). La validación de tipo/peso sigue siendo la misma, por
  archivo. Mientras haya fotos en la cola, el "+" queda deshabilitado.

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
  editar un producto ya existente (o, desde el punto 61, mientras se
  compone un post nuevo), el contador arranca en la cantidad de fotos que
  ya tenía (se sincroniza con `Math.max` cada vez que cambia la cantidad
  de fotos, así que un borrado nunca lo hace retroceder).

  Al quitar una foto se intenta borrar el archivo real del bucket
  (`deleteObject`, construido directo desde la URL de descarga — el SDK
  de Storage acepta una URL https además de una ruta/gs://) — si falla
  (por ejemplo porque ya no estaba) se ignora a propósito, mismo criterio
  que `ImageUploader.jsx`/`ProfilePhotoUploader.jsx`.

  Props:
  - `basePath` (string): carpeta del bucket, ej.
    "productImages/{uid}/{productId}" o "postImages/{uid}/{postId}" (SIN
    barra final).
  - `images` (array de strings): fotos ya subidas, controlado por quien
    usa este componente.
  - `onChange(newArray)`: se llama con el array actualizado al agregar o
    quitar una foto.
  - `maxImages` (número, default 5): `CreateProductScreen.jsx` pasa 5,
    `Feed.jsx` pasa 4.
  - `maxSize` (número, default 1024): igual que en ImageUploader.jsx.
*/

const MAX_INPUT_MB = 10;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function MultiImageUploader({
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

  // Punto 65: fotos elegidas que esperan pasar por ImageEditor, en el
  // orden en que se eligieron. Se edita de a una (queue[0]); "Usar foto"
  // la sube y recién al terminar pasa a la siguiente, "Cancelar" la salta.
  // Cada entrada lleva un id para que el editor se vuelva a montar limpio
  // con cada foto (key).
  const [queue, setQueue] = useState([]); // [{ id, file }]
  const queueIdRef = useRef(0);
  const nextInQueue = () => setQueue((q) => q.slice(1));

  const handleFile = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length === 0 || !basePath) return;

    setError("");

    // Mismas validaciones de siempre, por archivo: los inválidos se saltan
    // (mostrando el error del último) y el resto sigue.
    const valid = [];
    picked.forEach((file) => {
      if (!TYPES.includes(file.type)) {
        setError(t("image.errorType"));
      } else if (file.size > MAX_INPUT_MB * 1024 * 1024) {
        setError(t("image.errorTooLarge", { max: MAX_INPUT_MB }));
      } else {
        valid.push(file);
      }
    });

    // Respeta el máximo: solo entran las que caben en los lugares libres
    // (descontando las que ya esperan en la cola).
    const free = maxImages - images.length - queue.length;
    if (free <= 0) return;
    if (valid.length > free) {
      setError(t("image.tooMany", { count: free, max: maxImages }));
    }
    const accepted = valid.slice(0, free).map((file) => {
      queueIdRef.current += 1;
      return { id: queueIdRef.current, file };
    });
    if (accepted.length > 0) setQueue((q) => [...q, ...accepted]);
  };

  // "Usar foto" en ImageEditor: el Blob ya viene girado, recortado,
  // reducido a maxSize y en JPEG 0.85.
  const handleEdited = async (blob) => {
    if (images.length >= maxImages) {
      nextInQueue();
      return;
    }
    const slot = nextSlotRef.current;
    nextSlotRef.current = slot + 1;

    setBusy(true);
    try {
      const fileRef = ref(storage, `${basePath}/img_${slot}.jpg`);
      await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(fileRef);
      onChange([...images, url]);
    } catch (err) {
      setError(t("image.errorUpload"));
    } finally {
      setBusy(false);
      nextInQueue();
    }
  };

  // La foto no se pudo abrir ("decode"/"empty"/"nocontext"/"noblob"): se
  // salta, igual que con Cancelar, y sigue con la siguiente.
  const handleEditorError = () => {
    setError(t("image.errorRead"));
    nextInQueue();
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
            disabled={busy || queue.length > 0}
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
          multiple
          onChange={handleFile}
          style={{ display: "none" }}
        />
      </div>

      <p style={hintStyle}>{t("image.countHint", { count: images.length, max: maxImages })}</p>

      {error && <p style={errorStyle}>{error}</p>}

      {queue.length > 0 && !busy && (
        <ImageEditor
          key={queue[0].id}
          file={queue[0].file}
          maxSize={maxSize}
          onConfirm={handleEdited}
          onCancel={nextInQueue}
          onError={handleEditorError}
        />
      )}
    </div>
  );
}
