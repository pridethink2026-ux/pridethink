import React, { useState } from "react";
import { ReactComponent as HappyHeartIcon } from "./assets/stickers/happy-heart.svg";
import { ReactComponent as SmilingRainbowIcon } from "./assets/stickers/smiling-rainbow.svg";
import { ReactComponent as WinkingStarIcon } from "./assets/stickers/winking-star.svg";
import { ReactComponent as WavingKittenIcon } from "./assets/stickers/waving-kitten.svg";
import { ReactComponent as HuggingBearIcon } from "./assets/stickers/hugging-bear.svg";
import { ReactComponent as SleepyCloudIcon } from "./assets/stickers/sleepy-cloud.svg";
import { ReactComponent as HappySunIcon } from "./assets/stickers/happy-sun.svg";
import { ReactComponent as ThumbsUpFaceIcon } from "./assets/stickers/thumbs-up-face.svg";
import { ReactComponent as HappyBalloonIcon } from "./assets/stickers/happy-balloon.svg";
import { ReactComponent as ProudHeartIcon } from "./assets/stickers/proud-heart.svg";
import { ReactComponent as TransFlagIcon } from "./assets/stickers/trans-flag.svg";
import { TextThanksIcon, TextHelloIcon, TextHahaIcon, TextGoodnightIcon } from "./TextStickers";
import { useLanguage } from "./LanguageContext";

/*
  Stickers y emojis del chat (punto 88)
  -------------------------------------
  STICKERS: 15 caricaturas originales del proyecto, no subidas por
  usuarios — no hace falta Firebase Storage. 11 son archivos
  (src/assets/stickers/*.svg) importados como componentes de React
  (SVGR) para que queden inline en el DOM; los 4 con texto ("gracias",
  "hola", "jaja", "buenas noches") se dibujan en TextStickers.jsx con el
  texto traducido al idioma de quien mira el chat. A diferencia del set anterior, usan colores
  FIJOS (son caricaturas con su propia paleta); para que se lean en los 4
  temas, la clase .pt-sticker (index.css) les dibuja un borde blanco y
  una sombra suave con filter: drop-shadow.

  Un mensaje de sticker en Firestore es { type: "sticker", stickerId }:
  solo el id. Por eso los mensajes viejos con ids del set anterior
  (heart, star, moon...) se resuelven con LEGACY_STICKER_IDS al sticker
  nuevo más parecido, y cualquier id desconocido muestra un ícono simple
  (FallbackStickerIcon) en vez de quedar vacío. "trans-flag" conserva el
  mismo id que antes, así que no necesita equivalencia.

  EMOJIS: emojis del sistema que se insertan en el cuadro de texto (se
  envían como texto normal: sin cambios en Firestore). Cada uno tiene una
  animación suave (clases .pt-emoji--* en index.css), que se apaga si el
  sistema tiene "reducir movimiento". AnimatedEmojiText pinta un texto de
  burbuja envolviendo esos emojis en un <span> animado, al tamaño normal
  del texto.

  StickerPicker: panel con dos pestañas ("Stickers" / "Emojis"). Se ancla
  al formulario del chat (position: relative en Chat.jsx), ocupa su ancho
  hasta un máximo y desplaza la grilla por dentro, para no cortarse.
*/

export const STICKERS = [
  { id: "happy-heart", Icon: HappyHeartIcon, labelKey: "stickers.happyHeart" },
  { id: "smiling-rainbow", Icon: SmilingRainbowIcon, labelKey: "stickers.smilingRainbow" },
  { id: "winking-star", Icon: WinkingStarIcon, labelKey: "stickers.winkingStar" },
  { id: "waving-kitten", Icon: WavingKittenIcon, labelKey: "stickers.wavingKitten" },
  { id: "hugging-bear", Icon: HuggingBearIcon, labelKey: "stickers.huggingBear" },
  { id: "sleepy-cloud", Icon: SleepyCloudIcon, labelKey: "stickers.sleepyCloud" },
  { id: "happy-sun", Icon: HappySunIcon, labelKey: "stickers.happySun" },
  { id: "thumbs-up-face", Icon: ThumbsUpFaceIcon, labelKey: "stickers.thumbsUpFace" },
  { id: "happy-balloon", Icon: HappyBalloonIcon, labelKey: "stickers.happyBalloon" },
  { id: "proud-heart", Icon: ProudHeartIcon, labelKey: "stickers.proudHeart" },
  { id: "trans-flag", Icon: TransFlagIcon, labelKey: "stickers.transFlag" },
  { id: "text-thanks", Icon: TextThanksIcon, labelKey: "stickers.textThanks" },
  { id: "text-hello", Icon: TextHelloIcon, labelKey: "stickers.textHello" },
  { id: "text-haha", Icon: TextHahaIcon, labelKey: "stickers.textHaha" },
  { id: "text-goodnight", Icon: TextGoodnightIcon, labelKey: "stickers.textGoodnight" },
];

// Ids del set anterior (eliminado) -> sticker nuevo más parecido.
const LEGACY_STICKER_IDS = {
  heart: "happy-heart",
  rainbow: "smiling-rainbow",
  star: "winking-star",
  sparkles: "winking-star",
  "wave-hand": "waving-kitten",
  sun: "happy-sun",
  balloon: "happy-balloon",
  moon: "sleepy-cloud",
  "thumbs-up": "thumbs-up-face",
};

const STICKERS_BY_ID = Object.fromEntries(STICKERS.map((s) => [s.id, s]));

// Ícono simple para un id que no corresponde a ningún sticker (dato
// corrupto o futuro). Usa los colores del tema.
function FallbackStickerIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }} aria-hidden="true">
      <path d="M5 3h10l6 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M15 3v4a2 2 0 0 0 2 2h4" />
      <circle cx="9" cy="11" r="0.8" fill="var(--text-muted)" />
      <circle cx="14" cy="11" r="0.8" fill="var(--text-muted)" />
      <path d="M8.5 15c1.8 1.6 4.2 1.6 6 0" />
    </svg>
  );
}

// Pinta el sticker de un mensaje dado su id (nuevo, viejo o desconocido).
export function StickerImage({ stickerId, size = 96 }) {
  const { t } = useLanguage();
  const sticker = STICKERS_BY_ID[stickerId] || STICKERS_BY_ID[LEGACY_STICKER_IDS[stickerId]];
  if (!sticker) return <FallbackStickerIcon size={size} />;
  const Icon = sticker.Icon;
  return (
    <Icon
      className="pt-sticker"
      width={size}
      height={size}
      style={{ display: "block" }}
      role="img"
      aria-label={t(sticker.labelKey)}
    />
  );
}

// Emojis del panel con su animación (sufijo de la clase .pt-emoji--*).
export const EMOJIS = [
  { emoji: "❤️", anim: "beat" },
  { emoji: "🧡", anim: "beat" },
  { emoji: "💛", anim: "beat" },
  { emoji: "💚", anim: "beat" },
  { emoji: "💙", anim: "beat" },
  { emoji: "💜", anim: "beat" },
  { emoji: "🥰", anim: "beat" },
  { emoji: "😍", anim: "beat" },
  { emoji: "😀", anim: "bounce" },
  { emoji: "😊", anim: "bounce" },
  { emoji: "😎", anim: "bounce" },
  { emoji: "👍", anim: "bounce" },
  { emoji: "🎉", anim: "bounce" },
  { emoji: "😂", anim: "shake" },
  { emoji: "🤣", anim: "shake" },
  { emoji: "👋", anim: "wave" },
  { emoji: "🤗", anim: "wave" },
  { emoji: "🏳️‍🌈", anim: "flag" },
  { emoji: "🏳️‍⚧️", anim: "flag" },
  { emoji: "🌈", anim: "flag" },
  { emoji: "✨", anim: "twinkle" },
  { emoji: "⭐", anim: "twinkle" },
  { emoji: "🔥", anim: "flame" },
  { emoji: "😴", anim: "breathe" },
];

const EMOJI_ANIM = Object.fromEntries(EMOJIS.map((e) => [e.emoji, e.anim]));

// Regex con los emojis animados, los más largos primero (🏳️‍🌈 antes que
// cualquier prefijo suyo).
const EMOJI_REGEX = new RegExp(
  "(" +
    EMOJIS.map((e) => e.emoji)
      .sort((a, b) => b.length - a.length)
      .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")",
  "gu"
);

function AnimatedEmoji({ emoji }) {
  return (
    <span className={`pt-emoji pt-emoji--${EMOJI_ANIM[emoji]}`}>{emoji}</span>
  );
}

// Texto de una burbuja con los emojis del panel animados. Si no hay
// ninguno, devuelve el texto tal cual.
export function AnimatedEmojiText({ text }) {
  if (!text) return null;
  const parts = String(text).split(EMOJI_REGEX);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    EMOJI_ANIM[part] ? <AnimatedEmoji key={i} emoji={part} /> : part
  );
}

const styles = {
  panel: {
    position: "absolute",
    bottom: "100%",
    left: "8px",
    right: "8px",
    maxWidth: "420px",
    // Cabe dentro de la caja del chat (80vh menos cabecera y fila de
    // escritura) y nunca más de 340px; la grilla se desplaza por dentro.
    maxHeight: "min(340px, calc(80vh - 170px))",
    marginBottom: "6px",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(var(--shadow-rgb), 0.4)",
    zIndex: 20,
    overflow: "hidden",
  },
  tabs: {
    display: "flex",
    gap: "4px",
    padding: "8px 8px 0",
    flexShrink: 0,
  },
  tab: (active) => ({
    flex: 1,
    padding: "8px 10px",
    borderRadius: "10px",
    border: "none",
    background: active ? "var(--accent2-soft)" : "transparent",
    color: active ? "var(--accent2)" : "var(--text-muted)",
    fontWeight: 700,
    fontSize: "13px",
    cursor: "pointer",
  }),
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "8px",
  },
  stickerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
    gap: "6px",
  },
  emojiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))",
    gap: "4px",
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px",
    minWidth: 0,
    aspectRatio: "1 / 1",
    borderRadius: "12px",
    border: "none",
    background: "var(--surface-alt)",
    cursor: "pointer",
  },
  emojiItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "42px",
    minWidth: 0,
    borderRadius: "10px",
    border: "none",
    background: "transparent",
    fontSize: "22px",
    lineHeight: 1,
    cursor: "pointer",
  },
};

// Panel con dos pestañas. onSelect(stickerId) envía un sticker;
// onPickEmoji(emoji) inserta el emoji en el cuadro de texto (el panel
// queda abierto para poder elegir varios).
export function StickerPicker({ onSelect, onPickEmoji }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("stickers");
  return (
    <div style={styles.panel} role="dialog" aria-label={t("chat.openStickers")}>
      <div style={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "stickers"}
          style={styles.tab(tab === "stickers")}
          onClick={() => setTab("stickers")}
        >
          {t("stickers.tabStickers")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "emojis"}
          style={styles.tab(tab === "emojis")}
          onClick={() => setTab("emojis")}
        >
          {t("stickers.tabEmojis")}
        </button>
      </div>
      <div style={styles.scroll}>
        {tab === "stickers" ? (
          <div style={styles.stickerGrid}>
            {STICKERS.map((s) => (
              <button
                key={s.id}
                type="button"
                style={styles.item}
                onClick={() => onSelect(s.id)}
                title={t(s.labelKey)}
                aria-label={t(s.labelKey)}
              >
                <s.Icon className="pt-sticker" width="100%" height="100%" style={{ display: "block", maxWidth: 56, maxHeight: 56 }} />
              </button>
            ))}
          </div>
        ) : (
          <div style={styles.emojiGrid}>
            {EMOJIS.map((e) => (
              <button
                key={e.emoji}
                type="button"
                style={styles.emojiItem}
                onClick={() => onPickEmoji(e.emoji)}
                aria-label={e.emoji}
              >
                <AnimatedEmoji emoji={e.emoji} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
