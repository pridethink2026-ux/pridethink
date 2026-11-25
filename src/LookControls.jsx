import React, { useState } from "react";
import { useLanguage } from "./LanguageContext";
import { buttonStyle } from "./ImageEditor";
import { ADJUSTMENT_IDS, FILTER_IDS, applyLook } from "./photoFilters";

/*
  LookControls — punto 105, parte 2: los controles de filtros y ajustes.
  Los usa ImageEditor.jsx (y en la parte 4, VideoTrimmer.jsx). Solo
  cambian el `look` (ver photoFilters.js); quien los usa dibuja la vista
  previa y aplica el look al final.

  - <LookTabs tabs active onChange />: las pestañas de arriba
    (Recortar · Filtros · Ajustes).
  - <LookControls mode="filters" | "adjust" look onChange thumbs />:
    · "filters": tira de miniaturas (una por filtro). Tocar el filtro ya
      elegido muestra la barrita de intensidad (0-100 %), como Instagram.
      Elegir otro filtro vuelve la intensidad a 100 %.
    · "adjust": brillo, contraste, saturación y calidez; se elige uno y
      se mueve su barrita (-100..100). Cerca de 0 se pega al 0, para poder
      volver al centro con el dedo. Además "Belleza" (punto 106), de 0
      (apagada) a 100. Si los 5 botones no entran, la fila se desliza.
  - buildFilterThumbs(canvas): las miniaturas (dataURL por filtro) a
    partir de un canvas chico de la foto o del cuadro del video.

  Colores fijos (blanco sobre el velo negro) igual que ImageEditor y
  VideoTrimmer: van encima de una imagen cualquiera. Los botones usan
  buttonStyle (variables del tema).
*/

// Botones de la pestaña Ajustes: los 4 de color y "Belleza" (punto 106).
const ADJUST_TOOLS = [...ADJUSTMENT_IDS, "beauty"];

const THUMB_PX = 64;
const SNAP_TO_ZERO = 4;

export function buildFilterThumbs(source) {
  const thumbs = {};
  FILTER_IDS.forEach((id) => {
    const canvas = applyLook(source, { filter: id });
    thumbs[id] = canvas ? canvas.toDataURL("image/jpeg", 0.8) : null;
  });
  return thumbs;
}

// Un canvas chico y cuadrado (centro de la imagen) para las miniaturas.
export function thumbSource(source, width, height) {
  const side = Math.min(width, height);
  if (!side) return null;
  const px = THUMB_PX * 2; // nítido en pantallas de alta densidad
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, px, px);
  return canvas;
}

const styles = {
  tabs: { display: "flex", gap: "22px", justifyContent: "center", flexShrink: 0 },
  tab: (active) => ({
    border: "none",
    background: "transparent",
    padding: "6px 2px",
    color: active ? "#fff" : "rgba(255,255,255,0.6)",
    borderBottom: active ? "2px solid #fff" : "2px solid transparent",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    fontWeight: active ? 700 : 600,
    cursor: "pointer",
  }),
  panel: {
    width: "100%",
    maxWidth: "480px",
    height: "112px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "8px",
    flexShrink: 0,
    boxSizing: "border-box",
  },
  strip: {
    display: "flex",
    gap: "10px",
    overflowX: "auto",
    padding: "2px 4px 4px",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
  },
  thumbBtn: {
    flex: "0 0 auto",
    border: "none",
    background: "transparent",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    cursor: "pointer",
  },
  thumbImg: (selected) => ({
    width: `${THUMB_PX}px`,
    height: `${THUMB_PX}px`,
    borderRadius: "8px",
    objectFit: "cover",
    display: "block",
    boxSizing: "border-box",
    border: selected ? "2px solid #fff" : "2px solid transparent",
    background: "#2a2a2a",
  }),
  thumbLabel: (selected) => ({
    color: selected ? "#fff" : "rgba(255,255,255,0.75)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    fontWeight: selected ? 700 : 500,
    whiteSpace: "nowrap",
  }),
  hint: {
    margin: 0,
    color: "rgba(255,255,255,0.65)",
    fontFamily: "var(--font-body)",
    fontSize: "11px",
    textAlign: "center",
  },
  sliderRow: { display: "flex", alignItems: "center", gap: "10px", padding: "0 4px" },
  sliderLabel: {
    color: "#fff",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontWeight: 600,
    minWidth: "76px",
  },
  slider: { flex: "1 1 auto", minWidth: 0, accentColor: "var(--accent)", height: "28px" },
  value: {
    color: "#fff",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontVariantNumeric: "tabular-nums",
    minWidth: "36px",
    textAlign: "right",
  },
  chips: { display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" },
  chipScroll: {
    display: "flex",
    gap: "5px",
    overflowX: "auto",
    padding: "2px 4px",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
  },
};

export function LookTabs({ tabs, active, onChange }) {
  return (
    <div style={styles.tabs} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          style={styles.tab(active === tab.id)}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, onChange }) {
  const handle = (e) => {
    let v = Number(e.target.value);
    if (min < 0 && Math.abs(v) <= SNAP_TO_ZERO) v = 0;
    onChange(v);
  };
  return (
    <div style={styles.sliderRow}>
      <span style={styles.sliderLabel}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={handle}
        aria-label={label}
        style={styles.slider}
      />
      <span style={styles.value}>{min < 0 && value > 0 ? `+${value}` : value}</span>
    </div>
  );
}

export default function LookControls({ mode, look, onChange, thumbs }) {
  const { t } = useLanguage();
  const [intensityOpen, setIntensityOpen] = useState(false);
  const [adjustment, setAdjustment] = useState(ADJUSTMENT_IDS[0]);
  const [hovered, setHovered] = useState(null);

  const hoverProps = (key) => ({
    onMouseEnter: () => setHovered(key),
    onMouseLeave: () => setHovered(null),
  });

  if (mode === "filters") {
    if (intensityOpen && look.filter !== "original") {
      return (
        <div style={styles.panel}>
          <Slider
            label={`${t(`filters.${look.filter}`)} · ${t("filters.intensity")}`}
            value={look.intensity}
            min={0}
            max={100}
            onChange={(v) => onChange({ ...look, intensity: v })}
          />
          <div style={styles.chips}>
            <button
              type="button"
              style={buttonStyle({ hovered: hovered === "done" })}
              onClick={() => setIntensityOpen(false)}
              {...hoverProps("done")}
            >
              {t("filters.done")}
            </button>
          </div>
        </div>
      );
    }
    const pick = (id) => {
      if (id === look.filter) {
        if (id !== "original") setIntensityOpen(true);
        return;
      }
      onChange({ ...look, filter: id, intensity: 100 });
    };
    return (
      <div style={styles.panel}>
        <div style={styles.strip}>
          {FILTER_IDS.map((id) => {
            const selected = look.filter === id;
            return (
              <button
                key={id}
                type="button"
                style={styles.thumbBtn}
                aria-pressed={selected}
                onClick={() => pick(id)}
              >
                {thumbs && thumbs[id] ? (
                  <img src={thumbs[id]} alt="" style={styles.thumbImg(selected)} draggable={false} />
                ) : (
                  <span style={styles.thumbImg(selected)} />
                )}
                <span style={styles.thumbLabel(selected)}>{t(`filters.${id}`)}</span>
              </button>
            );
          })}
        </div>
        {look.filter !== "original" && <p style={styles.hint}>{t("filters.intensityHint")}</p>}
      </div>
    );
  }

  // mode === "adjust"
  const anyChanged = ADJUST_TOOLS.some((id) => (look[id] || 0) !== 0);
  const isBeauty = adjustment === "beauty";
  return (
    <div style={styles.panel}>
      <div style={styles.chipScroll}>
        {ADJUST_TOOLS.map((id, i) => (
          <button
            key={id}
            type="button"
            // Más chicos que los botones de siempre, para que entren en una
            // fila; si no entran (teléfono angosto), la fila se desliza. Los
            // márgenes "auto" de la primera y la última la centran cuando
            // sí entra.
            style={{
              ...buttonStyle({ hovered: hovered === id, active: adjustment === id }),
              padding: "6px 8px",
              fontSize: "12px",
              flex: "0 0 auto",
              whiteSpace: "nowrap",
              marginLeft: i === 0 ? "auto" : 0,
              marginRight: i === ADJUST_TOOLS.length - 1 ? "auto" : 0,
            }}
            aria-pressed={adjustment === id}
            onClick={() => setAdjustment(id)}
            {...hoverProps(id)}
          >
            {t(`filters.${id}`)}
            {(look[id] || 0) !== 0 ? " •" : ""}
          </button>
        ))}
      </div>
      <Slider
        label={t(`filters.${adjustment}`)}
        value={look[adjustment] || 0}
        // Belleza va de 0 (apagada) a 100; los demás, de -100 a 100.
        min={isBeauty ? 0 : -100}
        max={100}
        onChange={(v) => onChange({ ...look, [adjustment]: v })}
      />
      {anyChanged && (
        <div style={styles.chips}>
          <button
            type="button"
            style={{ ...buttonStyle({ hovered: hovered === "reset" }), padding: "5px 12px", fontSize: "12px" }}
            onClick={() => {
              const next = { ...look };
              ADJUST_TOOLS.forEach((id) => {
                next[id] = 0;
              });
              onChange(next);
            }}
            {...hoverProps("reset")}
          >
            {t("filters.reset")}
          </button>
        </div>
      )}
    </div>
  );
}
