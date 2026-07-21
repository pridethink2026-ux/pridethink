import React from "react";
import { ReactComponent as HeartIcon } from "./assets/stickers/heart.svg";
import { ReactComponent as RainbowIcon } from "./assets/stickers/rainbow.svg";
import { ReactComponent as StarIcon } from "./assets/stickers/star.svg";
import { ReactComponent as SparklesIcon } from "./assets/stickers/sparkles.svg";
import { ReactComponent as WaveHandIcon } from "./assets/stickers/wave-hand.svg";
import { ReactComponent as TransFlagIcon } from "./assets/stickers/trans-flag.svg";
import { ReactComponent as SunIcon } from "./assets/stickers/sun.svg";
import { ReactComponent as BalloonIcon } from "./assets/stickers/balloon.svg";
import { ReactComponent as MoonIcon } from "./assets/stickers/moon.svg";
import { ReactComponent as ThumbsUpIcon } from "./assets/stickers/thumbs-up.svg";
import { useLanguage } from "./LanguageContext";

/*
  Stickers
  --------
  Sistema de stickers del chat: imágenes PROPIAS empaquetadas en el
  proyecto (src/assets/stickers/*.svg, ilustraciones planas sin texto),
  no subidas por usuarios — por eso no hace falta Firebase Storage ni el
  plan Blaze, a diferencia de una foto de perfil real (ver "Pendientes"
  en CONTEXTO.md).

  Cada .svg se importa como componente de React (`import { ReactComponent
  as X } from "./archivo.svg"`, soportado por react-scripts/SVGR de forma
  nativa) en vez de como una URL de imagen (`<img src="...">"): así el SVG
  queda INLINE en el DOM de la página, y sus colores `var(--accent)`/
  `var(--accent2)` se pueden resolver contra el tema activo — un `<img>`
  apuntando a un archivo .svg externo NO puede hacer esto (el navegador
  renderiza ese SVG en un documento aparte, sin acceso a las variables CSS
  de la página). La mayoría de los stickers usan el degradado de acento
  del tema (así combinan con los 4 temas y el modo Rotativo); "rainbow" y
  "trans-flag" son la excepción a propósito, con colores fijos (los
  colores reales del arcoíris / de la bandera trans, no colores de tema —
  mismo criterio que ya usa `identityStyles.js` con las banderas pride).

  STICKERS: arreglo con el id (se guarda en el mensaje), el componente del
  ícono, y la clave de traducción de su nombre (para el title del botón en
  el selector). `StickerImage` resuelve un id a su ícono para pintarlo
  dentro de una burbuja de chat (Chat.jsx -> MessageBubble). `StickerPicker`
  es el panel con la grilla de 10 stickers que se abre desde el botón
  nuevo junto al de grabar audio.
*/

export const STICKERS = [
  { id: "heart", Icon: HeartIcon, labelKey: "stickers.heart" },
  { id: "rainbow", Icon: RainbowIcon, labelKey: "stickers.rainbow" },
  { id: "star", Icon: StarIcon, labelKey: "stickers.star" },
  { id: "sparkles", Icon: SparklesIcon, labelKey: "stickers.sparkles" },
  { id: "wave-hand", Icon: WaveHandIcon, labelKey: "stickers.waveHand" },
  { id: "trans-flag", Icon: TransFlagIcon, labelKey: "stickers.transFlag" },
  { id: "sun", Icon: SunIcon, labelKey: "stickers.sun" },
  { id: "balloon", Icon: BalloonIcon, labelKey: "stickers.balloon" },
  { id: "moon", Icon: MoonIcon, labelKey: "stickers.moon" },
  { id: "thumbs-up", Icon: ThumbsUpIcon, labelKey: "stickers.thumbsUp" },
];

const STICKERS_BY_ID = Object.fromEntries(STICKERS.map((s) => [s.id, s]));

// Pinta el sticker de un mensaje dado su id. Si el id no matchea a ningún
// sticker conocido (dato corrupto, o un sticker que se haya sacado del
// set en el futuro), no rompe nada: simplemente no muestra nada.
export function StickerImage({ stickerId, size = 96 }) {
  const sticker = STICKERS_BY_ID[stickerId];
  if (!sticker) return null;
  const Icon = sticker.Icon;
  return <Icon width={size} height={size} style={{ display: "block" }} />;
}

const styles = {
  panel: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    marginBottom: "8px",
    width: "236px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    padding: "10px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
    zIndex: 20,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "6px",
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px",
    borderRadius: "10px",
    border: "none",
    background: "var(--surface-alt)",
    cursor: "pointer",
  },
};

// Panel con la grilla de stickers disponibles. Se cuelga de un contenedor
// con position:"relative" (el botón que lo abre en Chat.jsx).
export function StickerPicker({ onSelect }) {
  const { t } = useLanguage();
  return (
    <div style={styles.panel}>
      <div style={styles.grid}>
        {STICKERS.map((s) => (
          <button
            key={s.id}
            type="button"
            style={styles.item}
            onClick={() => onSelect(s.id)}
            title={t(s.labelKey)}
          >
            <s.Icon width={28} height={28} />
          </button>
        ))}
      </div>
    </div>
  );
}
