import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { buttonStyle, useViewport } from "./ImageEditor";
import { MOMENT_TEXT_COLORS } from "./themes";

/*
  MomentTextEditor
  ----------------
  Segundo paso al publicar un Momento (punto 66), después de ImageEditor
  (girar/recortar): escribir textos sobre la foto, elegir color y tamaño, y
  moverlos con el dedo o el mouse (Pointer Events + setPointerCapture,
  mismo patrón que ImageEditor.jsx).

  Al confirmar, el texto se "quema" en la imagen con <canvas> y devuelve
  por onConfirm(blob, caption) un JPEG nuevo (0.85, mismo criterio que
  ImageEditor) junto con el texto en plano ("caption", para el alt del
  visor y para los reportes). Sin textos, devuelve la misma foto tal cual,
  sin volver a comprimirla.

  Cada texto es { id, text, color, size, x, y }: "size" es la altura de la
  letra como fracción del ANCHO de la foto y x/y el centro del texto como
  fracción (0..1) — así la vista previa (a tamaño de pantalla) y el canvas
  final (a tamaño real) dibujan exactamente lo mismo. La vista previa es
  HTML (texto encima de la <img>) y usa la MISMA familia, peso y sombra
  que después usa el canvas.

  Props:
  - `blob` (obligatoria): la foto que devolvió ImageEditor.
  - `isPrivate` (booleano): muestra el aviso de perfil privado; si no es
    privado, avisa que podrás ver quién vio el momento (commit 5).
  - `onConfirm(blob, caption)`, `onCancel()`, `onError()` (obligatorias).

  Colores del texto: MOMENT_TEXT_COLORS de themes.js (fijos, ver allá por
  qué). Fondo negro y bordes blancos fijos, mismo criterio que
  ImageEditor.jsx; los botones usan las variables del tema.
*/

const MAX_TEXTS = 5;
const MAX_TEXT_LENGTH = 100;
const MIN_SIZE = 0.04;
const MAX_SIZE = 0.16;
const DEFAULT_SIZE = 0.08;
const JPEG_QUALITY = 0.85;
const FONT_WAIT_MS = 3000;
const CONTROLS_HEIGHT = 300; // alto aproximado de los controles, en px
// Misma familia que --font-display (themes.js), escrita a mano porque el
// canvas no entiende var(--...). Sora 700 ya se carga en public/index.html.
const TEXT_FONT_FAMILY = "Sora, 'Space Grotesk', sans-serif";
const TEXT_WEIGHT = 700;

// Sombra del texto (contorno) para que se lea sobre cualquier foto: una
// ancha y una ajustada, proporcionales al tamaño de la letra.
const WIDE_SHADOW = 0.18;
const TIGHT_SHADOW = 0.06;

function colorEntry(value) {
  return MOMENT_TEXT_COLORS.find((c) => c.value === value) || MOMENT_TEXT_COLORS[0];
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.92)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    // "safe": en una pantalla baja, si no entra todo, se puede bajar sin
    // que se corte la parte de arriba.
    justifyContent: "safe center",
    gap: "12px",
    padding: "16px",
    zIndex: 60,
    boxSizing: "border-box",
    overflowY: "auto",
  },
  stage: (w, h) => ({
    position: "relative",
    width: `${w}px`,
    height: `${h}px`,
    overflow: "hidden",
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    flexShrink: 0,
  }),
  image: { width: "100%", height: "100%", display: "block", pointerEvents: "none" },
  textItem: (item, displayWidth, selected) => {
    const fontPx = item.size * displayWidth;
    const outline = colorEntry(item.color).outline;
    return {
      position: "absolute",
      left: `${item.x * 100}%`,
      top: `${item.y * 100}%`,
      transform: "translate(-50%, -50%)",
      fontFamily: TEXT_FONT_FAMILY,
      fontWeight: TEXT_WEIGHT,
      fontSize: `${fontPx}px`,
      lineHeight: 1.15,
      color: item.color,
      textShadow: `0 0 ${fontPx * WIDE_SHADOW}px ${outline}, 0 0 ${fontPx * TIGHT_SHADOW}px ${outline}`,
      whiteSpace: "pre",
      cursor: "move",
      touchAction: "none",
      outline: selected ? "1px dashed rgba(255,255,255,0.9)" : "none",
      outlineOffset: "4px",
    };
  },
  panel: {
    width: "100%",
    maxWidth: "520px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  row: { display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", alignItems: "center" },
  input: {
    flex: 1,
    minWidth: "160px",
    padding: "9px 12px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    outline: "none",
  },
  swatch: (color, active, hovered) => ({
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: color,
    border: active ? "3px solid var(--accent)" : hovered ? "3px solid var(--accent-soft-border)" : "2px solid rgba(255,255,255,0.6)",
    boxSizing: "border-box",
    cursor: "pointer",
    padding: 0,
  }),
  sizeLabel: { color: "#fff", fontFamily: "var(--font-body)", fontSize: "13px" },
  slider: { flex: 1, minWidth: "140px", accentColor: "var(--accent)" },
  hint: { margin: 0, color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-body)", fontSize: "12px", textAlign: "center" },
  notice: {
    margin: 0,
    padding: "8px 12px",
    borderRadius: "10px",
    background: "var(--accent2-soft)",
    border: "1px solid var(--accent2-soft-border)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
    textAlign: "center",
  },
  loading: { color: "#fff", fontFamily: "var(--font-body)", fontSize: "14px" },
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function drawTexts(ctx, items, width) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  items.forEach((item) => {
    const fontPx = item.size * width;
    const x = item.x * width;
    const y = item.y * ctx.canvas.height;
    ctx.font = `${TEXT_WEIGHT} ${fontPx}px ${TEXT_FONT_FAMILY}`;
    ctx.fillStyle = item.color;
    ctx.shadowColor = colorEntry(item.color).outline;
    ctx.shadowBlur = fontPx * WIDE_SHADOW;
    ctx.fillText(item.text, x, y);
    ctx.shadowBlur = fontPx * TIGHT_SHADOW;
    ctx.fillText(item.text, x, y);
  });
  ctx.shadowBlur = 0;
}

export default function MomentTextEditor({ blob, isPrivate = false, onConfirm, onCancel, onError }) {
  const { t } = useLanguage();
  const vp = useViewport();
  const [image, setImage] = useState(null); // <img> ya cargada
  const [imageUrl, setImageUrl] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState(MOMENT_TEXT_COLORS[0].value);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(null);
  const dragRef = useRef(null);
  const nextIdRef = useRef(0);
  const inputRef = useRef(null);

  // Carga la foto; la URL local vive mientras el editor está abierto
  // (la usa la <img> de la vista previa) y se libera al cerrarlo.
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setImage(img);
      setImageUrl(url);
    };
    img.onerror = () => {
      if (!cancelled) onError();
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== "Escape") return;
      // Escape dentro del campo de texto solo sale del campo.
      if (e.target === inputRef.current) inputRef.current.blur();
      else onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const hoverProps = (id) => ({
    onMouseEnter: () => setHovered(id),
    onMouseLeave: () => setHovered((h) => (h === id ? null : h)),
  });

  const selected = items.find((i) => i.id === selectedId) || null;
  const currentColor = selected ? selected.color : color;
  const currentSize = selected ? selected.size : size;

  const updateSelected = (changes) =>
    setItems((list) => list.map((i) => (i.id === selectedId ? { ...i, ...changes } : i)));

  // Al soltar un texto (deseleccionar), si quedó vacío se descarta.
  const deselect = () => {
    setItems((list) => list.filter((i) => i.id !== selectedId || i.text.trim()));
    setSelectedId(null);
  };

  const addText = () => {
    const text = draft.trim();
    if (!text || items.length >= MAX_TEXTS) return;
    const id = nextIdRef.current++;
    setItems((list) => [...list, { id, text, color, size, x: 0.5, y: 0.5 }]);
    setSelectedId(id);
    setDraft("");
  };

  const removeSelected = () => {
    setItems((list) => list.filter((i) => i.id !== selectedId));
    setSelectedId(null);
  };

  const pickColor = (value) => {
    setColor(value);
    if (selected) updateSelected({ color: value });
  };

  const pickSize = (value) => {
    setSize(value);
    if (selected) updateSelected({ size: value });
  };

  // Tamaño de la vista previa: la foto entera en el espacio que dejan los
  // controles.
  const availW = Math.min(vp.w - 32, 520);
  const availH = Math.max(160, vp.h - CONTROLS_HEIGHT);
  const scale = image ? Math.min(availW / image.width, availH / image.height) : 1;
  const displayW = image ? Math.round(image.width * scale) : 0;
  const displayH = image ? Math.round(image.height * scale) : 0;

  const handleItemPointerDown = (e, item) => {
    e.stopPropagation();
    if (selectedId !== item.id) deselect();
    setSelectedId(item.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: item.id, startX: e.clientX, startY: e.clientY, origX: item.x, origY: item.y };
  };

  const handleItemPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || !displayW) return;
    const x = clamp(drag.origX + (e.clientX - drag.startX) / displayW, 0, 1);
    const y = clamp(drag.origY + (e.clientY - drag.startY) / displayH, 0, 1);
    setItems((list) => list.map((i) => (i.id === drag.id ? { ...i, x, y } : i)));
  };

  const handleItemPointerUp = () => {
    dragRef.current = null;
  };

  const handleConfirm = async () => {
    const finalItems = items.filter((i) => i.text.trim());
    const caption = finalItems.map((i) => i.text.trim()).join(" · ");
    if (finalItems.length === 0) {
      onConfirm(blob, "");
      return;
    }
    setBusy(true);
    try {
      // El canvas dibuja con la fuente que ya esté cargada: se espera a Sora
      // para no quemar el texto con la de reserva, pero como máximo
      // FONT_WAIT_MS (con red lenta podía dejar "Publicando…" esperando).
      await Promise.race([
        document.fonts.load(`${TEXT_WEIGHT} 40px Sora`).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("nocontext");
      ctx.drawImage(image, 0, 0);
      drawTexts(ctx, finalItems, canvas.width);
      canvas.toBlob(
        (out) => {
          setBusy(false);
          if (out) onConfirm(out, caption);
          else onError();
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    } catch {
      setBusy(false);
      onError();
    }
  };

  if (!image) {
    return (
      <div style={styles.overlay}>
        <span style={styles.loading}>{t("moments.loading")}</span>
      </div>
    );
  }

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={t("momentText.title")}>
      <div style={styles.stage(displayW, displayH)} onPointerDown={deselect}>
        <img src={imageUrl} alt="" style={styles.image} draggable={false} />
        {items.map((item) => (
          <div
            key={item.id}
            style={styles.textItem(item, displayW, item.id === selectedId)}
            onPointerDown={(e) => handleItemPointerDown(e, item)}
            onPointerMove={handleItemPointerMove}
            onPointerUp={handleItemPointerUp}
            onPointerCancel={handleItemPointerUp}
          >
            {item.text || " "}
          </div>
        ))}
      </div>

      <div style={styles.panel}>
        <p style={styles.hint}>
          {items.length > 0 ? t("momentText.dragHint") : t("momentText.optionalHint")}
        </p>

        <div style={styles.row}>
          <input
            ref={inputRef}
            style={styles.input}
            value={selected ? selected.text : draft}
            maxLength={MAX_TEXT_LENGTH}
            placeholder={t("momentText.placeholder")}
            aria-label={t("momentText.placeholder")}
            onChange={(e) => (selected ? updateSelected({ text: e.target.value }) : setDraft(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (selected) deselect();
                else addText();
              }
            }}
          />
          {selected ? (
            <>
              <button type="button" style={buttonStyle({ hovered: hovered === "done" })} onClick={deselect} {...hoverProps("done")}>
                {t("momentText.done")}
              </button>
              <button type="button" style={buttonStyle({ hovered: hovered === "remove" })} onClick={removeSelected} {...hoverProps("remove")}>
                {t("momentText.remove")}
              </button>
            </>
          ) : (
            <button
              type="button"
              style={buttonStyle({ hovered: hovered === "add", disabled: !draft.trim() || items.length >= MAX_TEXTS })}
              disabled={!draft.trim() || items.length >= MAX_TEXTS}
              onClick={addText}
              {...hoverProps("add")}
            >
              {t("momentText.add")}
            </button>
          )}
        </div>
        {!selected && items.length >= MAX_TEXTS && (
          <p style={styles.hint}>{t("momentText.maxTexts", { max: MAX_TEXTS })}</p>
        )}

        <div style={styles.row} role="radiogroup" aria-label={t("momentText.color")}>
          {MOMENT_TEXT_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={currentColor === c.value}
              aria-label={t(`momentText.color.${c.key}`)}
              title={t(`momentText.color.${c.key}`)}
              style={styles.swatch(c.value, currentColor === c.value, hovered === c.key)}
              onClick={() => pickColor(c.value)}
              {...hoverProps(c.key)}
            />
          ))}
        </div>

        <div style={styles.row}>
          <span style={styles.sizeLabel}>{t("momentText.size")}</span>
          <input
            type="range"
            style={styles.slider}
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={0.005}
            value={currentSize}
            aria-label={t("momentText.size")}
            onChange={(e) => pickSize(Number(e.target.value))}
          />
        </div>

        {isPrivate ? (
          <p style={styles.notice}>{t("moments.privateNotice")}</p>
        ) : (
          <p style={styles.hint}>{t("moments.viewersHint")}</p>
        )}

        <div style={styles.row}>
          <button
            type="button"
            style={buttonStyle({ hovered: hovered === "cancel", disabled: busy })}
            disabled={busy}
            onClick={onCancel}
            {...hoverProps("cancel")}
          >
            {t("editor.cancel")}
          </button>
          <button
            type="button"
            style={buttonStyle({ hovered: hovered === "publish", primary: true, disabled: busy })}
            disabled={busy}
            onClick={handleConfirm}
            {...hoverProps("publish")}
          >
            {/* Punto 79: después viene el paso de música (MomentMusicStep), que es el que publica. */}
            {busy ? t("common.loading") : t("momentText.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
