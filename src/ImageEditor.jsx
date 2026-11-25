import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { DEFAULT_LOOK, isLookSupported, isNeutralLook, renderLook } from "./photoFilters";
import LookControls, { LookTabs, buildFilterThumbs, thumbSource } from "./LookControls";

/*
  ImageEditor
  -----------
  Editor de foto ANTES de subirla (punto 65): girar de a 90° y recortar.
  Modal a pantalla completa, mismo fondo fijo que ImageViewer.jsx. Todo
  con <canvas> y Pointer Events (mouse, dedo y lápiz con el mismo código),
  sin librerías.

  No sube nada: devuelve por onConfirm(blob) la imagen FINAL ya girada,
  recortada, reducida a `maxSize` de lado como máximo y exportada a JPEG
  0.85 — quien lo usa sigue subiendo ese Blob igual que antes. Por eso
  reemplaza a las funciones de redimensionado que cada uploader tenía
  copiadas. Con el recorte inicial (sin tocar nada), el resultado es el
  mismo que antes: cuadrado centrado en modo cuadrado, foto completa en
  modo libre.

  Props:
  - `file` (File, obligatoria): la imagen elegida en el <input type="file">.
  - `squareOnly` (booleano, default false): recorte siempre cuadrado, sin
    el selector Libre/Cuadrado (foto de perfil).
  - `circleGuide` (booleano, default false): dibuja un círculo dentro del
    recorte para mostrar lo que se ve en Avatar.jsx (foto de perfil).
  - `maxSize` (número, default 1024): lado máximo del resultado.
  - `withFilters` (booleano, default false, punto 105): agrega las pestañas
    Recortar · Filtros · Ajustes (LookControls.jsx, photoFilters.js). Solo
    en el Muro y Momentos; la foto de perfil, el chat y la Tienda no. Si el
    teléfono no tiene WebGL, el editor queda como antes (sin pestañas).
    En Filtros y Ajustes se ve SOLO el recorte elegido, con el filtro en
    vivo (sobre una copia del tamaño de la pantalla); en Recortar, la foto
    sin filtro. Al usar la foto, el filtro se aplica al resultado final ya
    recortado y reducido. Si en ese momento WebGL falla, sale sin filtro.
  - `onConfirm(blob)`, `onCancel()` (obligatorias).
  - `onError(code)` (obligatoria): la imagen no se pudo abrir o exportar
    ("decode" | "empty" | "nocontext" | "noblob" — los mismos códigos que
    ya usaban los uploaders para mostrar su mensaje de "no se pudo abrir").

  ORIENTACIÓN EXIF (fotos de celular): no se lee el EXIF a mano. Los
  navegadores modernos (Chrome/Edge 81+, Safari 13.1+, Firefox 77+) ya
  aplican la orientación al decodificar un <img>, y drawImage() de ese
  <img> dibuja la foto derecha — leerlo a mano la giraría DOS veces. El
  giro manual se aplica encima de esa orientación ya corregida.

  COPIA DE TRABAJO: al abrir, la foto se reduce a WORKING_MAX de lado (una
  foto de 12 MP es demasiado pesada para girar/recortar en vivo en un
  teléfono). Como el resultado nunca supera 1024, la calidad final no
  cambia.

  FONDO BLANCO: cada canvas se pinta de blanco antes de dibujar, para que
  un PNG con transparencia no quede negro al pasar a JPEG.

  La URL local del archivo (URL.createObjectURL) se libera apenas la
  imagen carga o falla, y también si el editor se cierra antes de eso.

  Colores fijos a propósito (mismo criterio que ImageViewer.jsx): el fondo
  de "apagar la pantalla", el oscurecido fuera del recorte y el borde/
  esquinas blancas tienen que contrastar sobre CUALQUIER foto, sin
  importar el tema activo. Los botones sí usan las variables del tema.
*/

const WORKING_MAX = 2048;
const JPEG_QUALITY = 0.85;
const HANDLE_HIT = 32; // área táctil de cada esquina, en px de pantalla
const MIN_CROP_PX = 40; // tamaño mínimo del recorte, en px de pantalla

function whiteCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

// Gira la copia de trabajo `quarterTurns` cuartos de vuelta en sentido
// horario (0..3).
function rotateCanvas(source, quarterTurns) {
  const swap = quarterTurns % 2 === 1;
  const w = swap ? source.height : source.width;
  const h = swap ? source.width : source.height;
  const out = whiteCanvas(w, h);
  if (!out) return null;
  const { canvas, ctx } = out;
  if (quarterTurns === 1) ctx.translate(w, 0);
  else if (quarterTurns === 2) ctx.translate(w, h);
  else if (quarterTurns === 3) ctx.translate(0, h);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function initialCrop(w, h, square) {
  if (!square) return { x: 0, y: 0, w, h };
  const side = Math.min(w, h);
  return { x: (w - side) / 2, y: (h - side) / 2, w: side, h: side };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Exportada: la reusa MomentTextEditor.jsx (punto 66).
export function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const onResize = () => setVp(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return vp;
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.85)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
    padding: "16px",
    zIndex: 60,
    boxSizing: "border-box",
  },
  title: {
    margin: 0,
    color: "#fff",
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 700,
  },
  stage: (w, h) => ({
    position: "relative",
    width: `${w}px`,
    height: `${h}px`,
    touchAction: "none",
    userSelect: "none",
    flexShrink: 0,
  }),
  clip: { position: "absolute", inset: 0, overflow: "hidden" },
  handlesLayer: { position: "absolute", pointerEvents: "none" },
  canvas: (w, h) => ({ width: `${w}px`, height: `${h}px`, display: "block" }),
  cropBox: {
    position: "absolute",
    boxSizing: "border-box",
    border: "2px solid #fff",
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
    cursor: "move",
    touchAction: "none",
  },
  circleGuide: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: "1px dashed rgba(255,255,255,0.85)",
    pointerEvents: "none",
  },
  handleHit: (corner) => ({
    position: "absolute",
    width: `${HANDLE_HIT}px`,
    height: `${HANDLE_HIT}px`,
    top: corner[0] === "n" ? `-${HANDLE_HIT / 2}px` : "auto",
    bottom: corner[0] === "s" ? `-${HANDLE_HIT / 2}px` : "auto",
    left: corner[1] === "w" ? `-${HANDLE_HIT / 2}px` : "auto",
    right: corner[1] === "e" ? `-${HANDLE_HIT / 2}px` : "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
    touchAction: "none",
    pointerEvents: "auto",
  }),
  handleDot: {
    width: "14px",
    height: "14px",
    borderRadius: "3px",
    background: "#fff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
    pointerEvents: "none",
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "center",
  },
  loading: { color: "#fff", fontFamily: "var(--font-body)", fontSize: "14px" },
  // Con filtros (punto 105): misma altura que el panel de LookControls,
  // para que los botones de abajo no salten al cambiar de pestaña.
  cropPanel: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "center",
    alignContent: "center",
    height: "112px",
    flexShrink: 0,
  },
};

// Exportada: la reusa MomentTextEditor.jsx (punto 66), para que los dos
// pasos del editor de Momentos tengan los mismos botones.
export function buttonStyle({ hovered, primary, active, disabled }) {
  const base = {
    padding: "9px 16px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? "var(--disabled-opacity)" : 1, // punto 83
    transition: "background 0.15s ease, border-color 0.15s ease",
  };
  if (primary) {
    return {
      ...base,
      border: "1px solid transparent",
      background: "var(--accent)",
      color: "var(--bg)", // mismo criterio que los botones de acento de StoreScreen.jsx

      filter: hovered && !disabled ? "brightness(1.1)" : "none",
    };
  }
  if (active || (hovered && !disabled)) {
    // --veil-active-bg (punto 83): en Pinky, perla en vez de acento suave,
    // que sobre el velo negro dejaba el texto oscuro sin contraste.
    return { ...base, background: "var(--veil-active-bg)", borderColor: "var(--accent-soft-border)" };
  }
  return base;
}

export default function ImageEditor({
  file,
  squareOnly = false,
  circleGuide = false,
  maxSize = 1024,
  withFilters = false,
  onConfirm,
  onCancel,
  onError,
}) {
  const { t } = useLanguage();
  const vp = useViewport();
  // Punto 105: filtros solo si se pidieron Y el teléfono puede dibujarlos.
  const filtersOn = useMemo(() => withFilters && isLookSupported(), [withFilters]);
  const [tab, setTab] = useState("crop"); // "crop" | "filters" | "adjust"
  const [look, setLook] = useState(DEFAULT_LOOK);
  const previewRef = useRef(null);
  const [working, setWorking] = useState(null); // canvas de la copia de trabajo
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [square, setSquare] = useState(squareOnly);
  const [crop, setCrop] = useState(null); // en px de la imagen GIRADA
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(null);
  const displayRef = useRef(null);
  const dragRef = useRef(null);

  // Carga el archivo y arma la copia de trabajo (ver docstring).
  useEffect(() => {
    let cancelled = false;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (cancelled) return;
      if (!img.width || !img.height) {
        onError("empty");
        return;
      }
      const scale = Math.min(1, WORKING_MAX / Math.max(img.width, img.height));
      const out = whiteCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
      if (!out) {
        onError("nocontext");
        return;
      }
      out.ctx.drawImage(img, 0, 0, out.canvas.width, out.canvas.height);
      setWorking(out.canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (!cancelled) onError("decode");
    };
    img.src = objectUrl;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const rotated = useMemo(
    () => (working ? rotateCanvas(working, quarterTurns) : null),
    [working, quarterTurns]
  );

  // Girar o cambiar Libre/Cuadrado reinicia el recorte.
  useEffect(() => {
    if (rotated) setCrop(initialCrop(rotated.width, rotated.height, square));
  }, [rotated, square]);

  // Escape cancela.
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escala de pantalla: la foto girada entra en el espacio disponible
  // (dejando lugar arriba para el título y abajo para los botones).
  // Con filtros, además las pestañas y el panel de controles (punto 105).
  const availW = Math.min(vp.w - 32, 720);
  const availH = Math.max(180, vp.h - (filtersOn ? 380 : 230));
  const scale = rotated ? Math.min(availW / rotated.width, availH / rotated.height, 1) : 1;
  const dispW = rotated ? Math.round(rotated.width * scale) : 0;
  const dispH = rotated ? Math.round(rotated.height * scale) : 0;

  // Pinta la foto girada en el canvas visible (también al volver a la
  // pestaña Recortar, que vuelve a crear el canvas).
  useEffect(() => {
    const target = displayRef.current;
    if (!target || !rotated) return;
    target.width = rotated.width;
    target.height = rotated.height;
    const ctx = target.getContext("2d");
    if (ctx) ctx.drawImage(rotated, 0, 0);
  }, [rotated, tab]);

  // Filtros y Ajustes (punto 105): se ve solo el recorte, en una copia del
  // tamaño de la pantalla (barato de redibujar con cada movimiento).
  const showLook = filtersOn && tab !== "crop";
  const pScale = rotated && crop ? Math.min(availW / crop.w, availH / crop.h, 1) : 1;
  const previewW = crop ? Math.max(1, Math.round(crop.w * pScale)) : 0;
  const previewH = crop ? Math.max(1, Math.round(crop.h * pScale)) : 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const croppedPreview = useMemo(() => {
    if (!showLook || !rotated || !crop) return null;
    const res = Math.min(1, (Math.max(previewW, previewH) * dpr) / Math.max(crop.w, crop.h));
    const out = whiteCanvas(Math.max(1, Math.round(crop.w * res)), Math.max(1, Math.round(crop.h * res)));
    if (!out) return null;
    out.ctx.drawImage(rotated, crop.x, crop.y, crop.w, crop.h, 0, 0, out.canvas.width, out.canvas.height);
    return out.canvas;
  }, [showLook, rotated, crop, previewW, previewH, dpr]);

  // Miniaturas de la tira: el centro del recorte con cada filtro.
  const thumbs = useMemo(() => {
    if (!croppedPreview) return null;
    const base = thumbSource(croppedPreview, croppedPreview.width, croppedPreview.height);
    return base ? buildFilterThumbs(base) : null;
  }, [croppedPreview]);

  // Vista previa en vivo: a lo sumo un dibujo por cuadro de pantalla.
  useEffect(() => {
    if (!showLook || !croppedPreview) return undefined;
    const frame = requestAnimationFrame(() => {
      const target = previewRef.current;
      if (!target) return;
      if (target.width !== croppedPreview.width) target.width = croppedPreview.width;
      if (target.height !== croppedPreview.height) target.height = croppedPreview.height;
      const ctx = target.getContext("2d");
      if (!ctx) return;
      const filtered = renderLook(croppedPreview, look);
      ctx.drawImage(filtered || croppedPreview, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [showLook, croppedPreview, look, tab]);

  const startDrag = (e, kind) => {
    if (!crop || busy) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { kind, startX: e.clientX, startY: e.clientY, startCrop: crop };
  };

  const onDrag = (e) => {
    const drag = dragRef.current;
    if (!drag || !rotated) return;
    const W = rotated.width;
    const H = rotated.height;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const c = drag.startCrop;

    if (drag.kind === "move") {
      setCrop({ ...c, x: clamp(c.x + dx, 0, W - c.w), y: clamp(c.y + dy, 0, H - c.h) });
      return;
    }

    // Esquina: el vértice opuesto queda fijo (ancla) y el que se arrastra
    // sigue al puntero, dentro de la imagen y sin bajar del tamaño mínimo.
    const corner = drag.kind;
    const minSide = Math.min(MIN_CROP_PX / scale, W, H);
    const ax = corner[1] === "w" ? c.x + c.w : c.x;
    const ay = corner[0] === "n" ? c.y + c.h : c.y;
    const dirX = corner[1] === "w" ? -1 : 1;
    const dirY = corner[0] === "n" ? -1 : 1;
    const px = (corner[1] === "w" ? c.x : c.x + c.w) + dx;
    const py = (corner[0] === "n" ? c.y : c.y + c.h) + dy;
    const roomX = dirX > 0 ? W - ax : ax;
    const roomY = dirY > 0 ? H - ay : ay;
    let w = clamp((px - ax) * dirX, minSide, roomX);
    let h = clamp((py - ay) * dirY, minSide, roomY);
    if (square) {
      const side = clamp(Math.max(w, h), minSide, Math.min(roomX, roomY));
      w = side;
      h = side;
    }
    setCrop({
      x: dirX > 0 ? ax : ax - w,
      y: dirY > 0 ? ay : ay - h,
      w,
      h,
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleConfirm = () => {
    if (!rotated || !crop || busy) return;
    setBusy(true);
    const sx = Math.round(crop.x);
    const sy = Math.round(crop.y);
    const sw = Math.max(1, Math.round(crop.w));
    const sh = Math.max(1, Math.round(crop.h));
    const outScale = Math.min(1, maxSize / Math.max(sw, sh));
    const out = whiteCanvas(Math.max(1, Math.round(sw * outScale)), Math.max(1, Math.round(sh * outScale)));
    if (!out) {
      setBusy(false);
      onError("nocontext");
      return;
    }
    out.ctx.drawImage(rotated, sx, sy, sw, sh, 0, 0, out.canvas.width, out.canvas.height);
    // Punto 105: el filtro va sobre el resultado final. Si WebGL falla
    // justo ahora, la foto sale sin filtro (nunca se pierde la foto).
    if (filtersOn && !isNeutralLook(look)) {
      const filtered = renderLook(out.canvas, look);
      if (filtered) out.ctx.drawImage(filtered, 0, 0);
      // eslint-disable-next-line no-console
      else console.warn("ImageEditor: no se pudo aplicar el filtro");
    }
    out.canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) onConfirm(blob);
        else onError("noblob");
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  };

  const cropRectStyle = crop
    ? {
        left: `${crop.x * scale}px`,
        top: `${crop.y * scale}px`,
        width: `${crop.w * scale}px`,
        height: `${crop.h * scale}px`,
      }
    : null;

  const hoverProps = (key) => ({
    onMouseEnter: () => setHovered(key),
    onMouseLeave: () => setHovered(null),
  });

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={t("editor.title")}>
      <p style={styles.title}>{t("editor.title")}</p>

      {filtersOn && rotated && (
        <LookTabs
          tabs={[
            { id: "crop", label: t("filters.tabCrop") },
            { id: "filters", label: t("filters.tabFilters") },
            { id: "adjust", label: t("filters.tabAdjust") },
          ]}
          active={tab}
          onChange={(next) => !busy && setTab(next)}
        />
      )}

      {!rotated ? (
        <p style={styles.loading}>{t("editor.loading")}</p>
      ) : showLook ? (
        <canvas ref={previewRef} style={styles.canvas(previewW, previewH)} />
      ) : (
        <div
          style={styles.stage(dispW, dispH)}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* La capa recortada (overflow hidden) solo lleva la foto y el
              oscurecido de afuera; las esquinas van en otra capa encima,
              sin recortar, para que se vean enteras aunque el recorte
              toque el borde de la foto. */}
          <div style={styles.clip}>
            <canvas ref={displayRef} style={styles.canvas(dispW, dispH)} />
            {crop && (
              <div
                style={{ ...styles.cropBox, ...cropRectStyle }}
                onPointerDown={(e) => startDrag(e, "move")}
              >
                {circleGuide && <div style={styles.circleGuide} />}
              </div>
            )}
          </div>
          {crop && (
            <div style={{ ...styles.handlesLayer, ...cropRectStyle }}>
              {["nw", "ne", "sw", "se"].map((corner) => (
                <div
                  key={corner}
                  style={styles.handleHit(corner)}
                  onPointerDown={(e) => startDrag(e, corner)}
                >
                  <div style={styles.handleDot} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showLook ? (
        <LookControls mode={tab} look={look} onChange={setLook} thumbs={thumbs} />
      ) : (
        <div style={filtersOn ? styles.cropPanel : styles.row}>
          <button
            type="button"
            style={buttonStyle({ hovered: hovered === "left", disabled: busy || !rotated })}
            disabled={busy || !rotated}
            onClick={() => setQuarterTurns((q) => (q + 3) % 4)}
            title={t("editor.rotateLeft")}
            aria-label={t("editor.rotateLeft")}
            {...hoverProps("left")}
          >
            ⟲
          </button>
          <button
            type="button"
            style={buttonStyle({ hovered: hovered === "right", disabled: busy || !rotated })}
            disabled={busy || !rotated}
            onClick={() => setQuarterTurns((q) => (q + 1) % 4)}
            title={t("editor.rotateRight")}
            aria-label={t("editor.rotateRight")}
            {...hoverProps("right")}
          >
            ⟳
          </button>
          {!squareOnly && (
            <>
              <button
                type="button"
                style={buttonStyle({ hovered: hovered === "free", active: !square, disabled: busy })}
                disabled={busy}
                aria-pressed={!square}
                onClick={() => setSquare(false)}
                {...hoverProps("free")}
              >
                {t("editor.cropFree")}
              </button>
              <button
                type="button"
                style={buttonStyle({ hovered: hovered === "square", active: square, disabled: busy })}
                disabled={busy}
                aria-pressed={square}
                onClick={() => setSquare(true)}
                {...hoverProps("square")}
              >
                {t("editor.cropSquare")}
              </button>
            </>
          )}
        </div>
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
          style={buttonStyle({ hovered: hovered === "use", primary: true, disabled: busy || !rotated })}
          disabled={busy || !rotated}
          onClick={handleConfirm}
          {...hoverProps("use")}
        >
          {t("editor.use")}
        </button>
      </div>
    </div>
  );
}
