import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { ReactComponent as KissFaceIcon } from "./assets/stickers/kiss-face.svg";
import { ReactComponent as HuggingHeartsIcon } from "./assets/stickers/hugging-hearts.svg";
import { ReactComponent as LaughingTearsIcon } from "./assets/stickers/laughing-tears.svg";
import { ReactComponent as InLoveIcon } from "./assets/stickers/in-love.svg";
import { ReactComponent as SadDropIcon } from "./assets/stickers/sad-drop.svg";
import { ReactComponent as GrumpyTomatoIcon } from "./assets/stickers/grumpy-tomato.svg";
import { ReactComponent as SurprisedChickIcon } from "./assets/stickers/surprised-chick.svg";
import { ReactComponent as SleepyBunnyIcon } from "./assets/stickers/sleepy-bunny.svg";
import { ReactComponent as PartyFaceIcon } from "./assets/stickers/party-face.svg";
import { ReactComponent as BirthdayCakeIcon } from "./assets/stickers/birthday-cake.svg";
import { ReactComponent as CoffeeCupIcon } from "./assets/stickers/coffee-cup.svg";
import {
  TextThanksIcon,
  TextHelloIcon,
  TextHahaIcon,
  TextGoodnightIcon,
  TextLoveYouIcon,
  TextSorryIcon,
  TextCongratsIcon,
  TextCheerUpIcon,
} from "./TextStickers";
import { useLanguage } from "./LanguageContext";

/*
  Stickers y emojis del chat (punto 88)
  -------------------------------------
  STICKERS: 30 caricaturas originales del proyecto, no subidas por
  usuarios — no hace falta Firebase Storage. 22 son archivos
  (src/assets/stickers/*.svg) importados como componentes de React
  (SVGR) para que queden inline en el DOM; los 8 con texto se dibujan en
  TextStickers.jsx con el texto traducido al idioma de quien mira el chat.
  Usan colores FIJOS; la clase .pt-sticker (index.css) les dibuja borde
  blanco y sombra suave para que se lean en los 4 temas.

  Animación: los 30 se mueven suave, igual en el panel y en las burbujas.
  `anim` (opcional) mueve el sticker entero (.pt-sticker--beat, --sway,
  --bounce, --float, --squeeze, --shake, --tremble, --hop, --breathe); y
  varios además animan una parte por dentro con clases .pt-sk-* puestas
  en el propio SVG (el ojo que guiña, la patita, las "z", el vapor, la
  llama...). Los que no tienen `anim` se mueven solo por esas partes.
  Con "reducir movimiento" no se mueve nada (index.css).

  Un mensaje de sticker en Firestore es { type: "sticker", stickerId }:
  solo el id. Los ids del set anterior (heart, star, moon...) se
  resuelven con LEGACY_STICKER_IDS al sticker nuevo más parecido, y un id
  desconocido muestra un ícono simple (FallbackStickerIcon).

  EMOJIS: emojis del sistema agrupados en EMOJI_CATEGORIES, que se
  insertan en el cuadro de texto (se envían como texto normal: sin
  cambios en Firestore). Cada uno tiene una animación suave
  (.pt-emoji--*). AnimatedEmojiText los anima también dentro de las
  burbujas, al tamaño normal del texto.

  StickerPicker: panel con dos pestañas ("Stickers" / "Emojis"). Se ancla
  a la fila de escritura del chat (position: relative en Chat.jsx), ocupa
  su ancho hasta un máximo y desplaza el contenido por dentro, para no
  cortarse. La pestaña Emojis tiene una fila de botones para saltar a cada
  categoría y un título traducido en cada sección.
*/

export const STICKERS = [
  { id: "happy-heart", Icon: HappyHeartIcon, labelKey: "stickers.happyHeart", anim: "beat" },
  { id: "kiss-face", Icon: KissFaceIcon, labelKey: "stickers.kissFace" },
  { id: "hugging-hearts", Icon: HuggingHeartsIcon, labelKey: "stickers.huggingHearts", anim: "squeeze" },
  { id: "in-love", Icon: InLoveIcon, labelKey: "stickers.inLove", anim: "sway" },
  { id: "laughing-tears", Icon: LaughingTearsIcon, labelKey: "stickers.laughingTears", anim: "shake" },
  { id: "winking-star", Icon: WinkingStarIcon, labelKey: "stickers.winkingStar", anim: "sway" },
  { id: "sad-drop", Icon: SadDropIcon, labelKey: "stickers.sadDrop", anim: "breathe" },
  { id: "grumpy-tomato", Icon: GrumpyTomatoIcon, labelKey: "stickers.grumpyTomato", anim: "tremble" },
  { id: "surprised-chick", Icon: SurprisedChickIcon, labelKey: "stickers.surprisedChick", anim: "hop" },
  { id: "waving-kitten", Icon: WavingKittenIcon, labelKey: "stickers.wavingKitten" },
  { id: "hugging-bear", Icon: HuggingBearIcon, labelKey: "stickers.huggingBear", anim: "squeeze" },
  { id: "sleepy-cloud", Icon: SleepyCloudIcon, labelKey: "stickers.sleepyCloud", anim: "breathe" },
  { id: "sleepy-bunny", Icon: SleepyBunnyIcon, labelKey: "stickers.sleepyBunny", anim: "breathe" },
  { id: "happy-sun", Icon: HappySunIcon, labelKey: "stickers.happySun" },
  { id: "smiling-rainbow", Icon: SmilingRainbowIcon, labelKey: "stickers.smilingRainbow", anim: "sway" },
  { id: "thumbs-up-face", Icon: ThumbsUpFaceIcon, labelKey: "stickers.thumbsUpFace", anim: "bounce" },
  { id: "party-face", Icon: PartyFaceIcon, labelKey: "stickers.partyFace", anim: "bounce" },
  { id: "birthday-cake", Icon: BirthdayCakeIcon, labelKey: "stickers.birthdayCake" },
  { id: "happy-balloon", Icon: HappyBalloonIcon, labelKey: "stickers.happyBalloon", anim: "float" },
  { id: "coffee-cup", Icon: CoffeeCupIcon, labelKey: "stickers.coffeeCup" },
  { id: "proud-heart", Icon: ProudHeartIcon, labelKey: "stickers.proudHeart", anim: "beat" },
  { id: "trans-flag", Icon: TransFlagIcon, labelKey: "stickers.transFlag" },
  { id: "text-hello", Icon: TextHelloIcon, labelKey: "stickers.textHello" },
  { id: "text-thanks", Icon: TextThanksIcon, labelKey: "stickers.textThanks" },
  { id: "text-haha", Icon: TextHahaIcon, labelKey: "stickers.textHaha", anim: "shake" },
  { id: "text-love-you", Icon: TextLoveYouIcon, labelKey: "stickers.textLoveYou" },
  { id: "text-sorry", Icon: TextSorryIcon, labelKey: "stickers.textSorry", anim: "sway" },
  { id: "text-congrats", Icon: TextCongratsIcon, labelKey: "stickers.textCongrats" },
  { id: "text-cheer-up", Icon: TextCheerUpIcon, labelKey: "stickers.textCheerUp", anim: "bounce" },
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

const stickerClass = (s) => (s.anim ? `pt-sticker pt-sticker--${s.anim}` : "pt-sticker");

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
      className={stickerClass(sticker)}
      width={size}
      height={size}
      style={{ display: "block" }}
      role="img"
      aria-label={t(sticker.labelKey)}
    />
  );
}

// Emojis del panel por categoría, con su animación (sufijo de la clase
// .pt-emoji--*). `icon` es el emoji del botón para saltar a la categoría.
// 🩷 y 🫶 quedan fuera a propósito: son nuevos y en equipos viejos se ven
// como un cuadrito (mismo motivo que PinkyHeartIcon.jsx).
const e = (emoji, anim) => ({ emoji, anim });
export const EMOJI_CATEGORIES = [
  {
    id: "faces",
    labelKey: "stickers.emojiFaces",
    icon: "😀",
    items: [
      e("😀", "bounce"), e("😃", "bounce"), e("😄", "bounce"), e("😁", "bounce"),
      e("😆", "shake"), e("😅", "bounce"), e("😂", "shake"), e("🤣", "shake"),
      e("😊", "bounce"), e("😇", "breathe"), e("🙂", "bounce"), e("😉", "bounce"),
      e("😌", "breathe"), e("😋", "bounce"), e("😜", "shake"), e("😎", "bounce"),
      e("🤩", "twinkle"), e("🤔", "wave"), e("🤭", "shake"), e("😮", "tremble"),
      e("😱", "tremble"), e("😴", "breathe"), e("🥺", "breathe"), e("😢", "tear"),
      e("😭", "tear"), e("😡", "shake"),
    ],
  },
  {
    id: "love",
    labelKey: "stickers.emojiLove",
    icon: "❤️",
    items: [
      e("😍", "beat"), e("🥰", "beat"), e("😘", "beat"), e("😗", "bounce"),
      e("😙", "bounce"), e("😚", "beat"), e("💋", "beat"), e("❤️", "beat"),
      e("🧡", "beat"), e("💛", "beat"), e("💚", "beat"), e("💙", "beat"),
      e("💜", "beat"), e("🤍", "beat"), e("💖", "beat"), e("💕", "beat"),
      e("💞", "beat"), e("💌", "bounce"),
    ],
  },
  {
    id: "gestures",
    labelKey: "stickers.emojiGestures",
    icon: "👋",
    items: [
      e("👋", "wave"), e("👍", "bounce"), e("👏", "beat"), e("🙌", "bounce"),
      e("🙏", "breathe"), e("💪", "beat"), e("🤗", "wave"), e("✌️", "wave"),
      e("🤞", "shake"), e("👌", "bounce"), e("🤝", "shake"),
    ],
  },
  {
    id: "celebration",
    labelKey: "stickers.emojiCelebration",
    icon: "🎉",
    items: [
      e("🎉", "bounce"), e("🎊", "bounce"), e("🥳", "bounce"), e("🎂", "bounce"),
      e("🎁", "shake"), e("🎈", "bounce"), e("✨", "twinkle"), e("⭐", "twinkle"),
      e("🌟", "twinkle"), e("🔥", "flame"), e("💯", "beat"), e("🏆", "bounce"),
    ],
  },
  {
    id: "pride",
    labelKey: "stickers.emojiPride",
    icon: "🏳️‍🌈",
    items: [
      e("🏳️‍🌈", "flag"), e("🏳️‍⚧️", "flag"), e("🌈", "flag"), e("🦄", "bounce"),
      e("🌸", "wave"), e("🌻", "wave"), e("☀️", "twinkle"), e("🌙", "breathe"),
      e("☕", "breathe"),
    ],
  },
];

export const EMOJIS = EMOJI_CATEGORIES.flatMap((c) => c.items);

const EMOJI_ANIM = Object.fromEntries(EMOJIS.map((x) => [x.emoji, x.anim]));

// Regex con los emojis animados, los más largos primero (🏳️‍🌈 antes que
// cualquier prefijo suyo).
const EMOJI_REGEX = new RegExp(
  "(" +
    EMOJIS.map((x) => x.emoji)
      .sort((a, b) => b.length - a.length)
      .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")",
  "gu"
);

function AnimatedEmoji({ emoji }) {
  return <span className={`pt-emoji pt-emoji--${EMOJI_ANIM[emoji]}`}>{emoji}</span>;
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
    // escritura) y nunca más de 360px; el contenido se desplaza por dentro.
    maxHeight: "min(360px, calc(80vh - 170px))",
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
  categoryBar: {
    display: "flex",
    gap: "2px",
    padding: "6px 8px 0",
    flexShrink: 0,
    overflowX: "auto",
  },
  categoryBtn: (active) => ({
    flex: "1 0 34px",
    height: "32px",
    borderRadius: "8px",
    border: "none",
    borderBottom: `2px solid ${active ? "var(--accent2)" : "transparent"}`,
    background: active ? "var(--accent2-soft)" : "transparent",
    fontSize: "18px",
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
  }),
  scroll: {
    position: "relative",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    padding: "8px",
  },
  stickerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
    gap: "6px",
  },
  sectionTitle: {
    margin: "4px 4px 6px",
    fontSize: "12px",
    fontWeight: 700,
    color: "var(--text-muted)",
  },
  emojiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))",
    gap: "2px",
    marginBottom: "8px",
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
    height: "40px",
    minWidth: 0,
    borderRadius: "10px",
    border: "none",
    background: "transparent",
    fontSize: "22px",
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
  },
};

export const DEFAULT_PICKER_TAB = "stickers";
export const DEFAULT_EMOJI_CATEGORY = EMOJI_CATEGORIES[0].id;

// Pestaña de emojis: botones de categoría arriba y secciones con título.
// Al tocar una categoría, la lista se desplaza hasta su sección (sin
// animación de scroll con "reducir movimiento"). La categoría activa la
// guarda quien usa el panel (Chat.jsx), así que al volver a abrirlo se
// desplaza directo a la última categoría usada.
function EmojiTab({ onPickEmoji, activeCategory, onCategoryChange }) {
  const { t } = useLanguage();
  const scrollRef = useRef(null);
  const sectionRefs = useRef({});
  // Mientras el desplazamiento lo hace el código (botón de categoría o
  // apertura del panel) se ignoran los eventos de scroll: si no, al pasar
  // por las otras secciones, o al topar con el final de la lista antes de
  // que la última sección llegue arriba, se marcaría otra categoría.
  const programmaticScroll = useRef(false);
  const programmaticTimer = useRef(null);

  const markProgrammatic = () => {
    programmaticScroll.current = true;
    clearTimeout(programmaticTimer.current);
    programmaticTimer.current = setTimeout(() => {
      programmaticScroll.current = false;
    }, 250);
  };

  useEffect(() => () => clearTimeout(programmaticTimer.current), []);

  const scrollToCategory = (id, smooth) => {
    const box = scrollRef.current;
    const section = sectionRefs.current[id];
    if (!box || !section) return;
    markProgrammatic();
    box.scrollTo({ top: section.offsetTop - 8, behavior: smooth ? "smooth" : "auto" });
  };

  // Al abrir el panel, se muestra la última categoría usada, sin animación.
  useLayoutEffect(() => {
    if (activeCategory !== EMOJI_CATEGORIES[0].id) scrollToCategory(activeCategory, false);
    // Solo al montar: después la mueve el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpTo = (id) => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToCategory(id, !reduce);
    onCategoryChange(id);
  };

  // Marca como activa la categoría que está arriba al desplazarse a mano
  // (al llegar al final de la lista, la última).
  const handleScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    if (programmaticScroll.current) {
      markProgrammatic();
      return;
    }
    let current = EMOJI_CATEGORIES[0].id;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) {
      current = EMOJI_CATEGORIES[EMOJI_CATEGORIES.length - 1].id;
    } else {
      for (const c of EMOJI_CATEGORIES) {
        const section = sectionRefs.current[c.id];
        if (section && section.offsetTop - 16 <= box.scrollTop) current = c.id;
      }
    }
    if (current !== activeCategory) onCategoryChange(current);
  };

  return (
    <>
      <div style={styles.categoryBar}>
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            style={styles.categoryBtn(activeCategory === c.id)}
            onClick={() => jumpTo(c.id)}
            title={t(c.labelKey)}
            aria-label={t(c.labelKey)}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div style={styles.scroll} ref={scrollRef} onScroll={handleScroll}>
        {EMOJI_CATEGORIES.map((c) => (
          <section key={c.id} ref={(el) => (sectionRefs.current[c.id] = el)}>
            <h4 style={styles.sectionTitle}>{t(c.labelKey)}</h4>
            <div style={styles.emojiGrid}>
              {c.items.map((x) => (
                <button
                  key={x.emoji}
                  type="button"
                  style={styles.emojiItem}
                  onClick={() => onPickEmoji(x.emoji)}
                  aria-label={x.emoji}
                >
                  <AnimatedEmoji emoji={x.emoji} />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

// Panel con dos pestañas. onSelect(stickerId) envía un sticker;
// onPickEmoji(emoji) inserta el emoji en el cuadro de texto (el panel
// queda abierto para poder elegir varios).
// La pestaña y la categoría de emojis pueden venir de afuera (tab /
// onTabChange, emojiCategory / onEmojiCategoryChange) para que sobrevivan
// a cerrar y volver a abrir el panel; Chat.jsx las guarda en memoria por
// chat. Sin esos props, el panel las maneja solo y empieza en Stickers.
export function StickerPicker({
  onSelect,
  onPickEmoji,
  tab: tabProp,
  onTabChange,
  emojiCategory: categoryProp,
  onEmojiCategoryChange,
}) {
  const { t } = useLanguage();
  const [ownTab, setOwnTab] = useState(DEFAULT_PICKER_TAB);
  const [ownCategory, setOwnCategory] = useState(DEFAULT_EMOJI_CATEGORY);
  const tab = tabProp || ownTab;
  const setTab = onTabChange || setOwnTab;
  const emojiCategory = categoryProp || ownCategory;
  const setEmojiCategory = onEmojiCategoryChange || setOwnCategory;
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
      {tab === "stickers" ? (
        <div style={styles.scroll}>
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
                <s.Icon
                  className={stickerClass(s)}
                  width="100%"
                  height="100%"
                  style={{ display: "block", maxWidth: 56, maxHeight: 56 }}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <EmojiTab
          onPickEmoji={onPickEmoji}
          activeCategory={emojiCategory}
          onCategoryChange={setEmojiCategory}
        />
      )}
    </div>
  );
}
