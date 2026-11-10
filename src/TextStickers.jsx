import React from "react";
import { useLanguage } from "./LanguageContext";

/*
  Stickers con texto (punto 88)
  -----------------------------
  "Gracias", "Hola", "Jaja", "Buenas noches", "Te quiero", "Lo siento",
  "Felicidades" y "Ánimo" no son archivos .svg fijos: se dibujan aquí como
  SVG en React para que el texto salga en el idioma de quien MIRA el chat,
  con las mismas claves de translations.js que usa el título del botón
  (stickers.textThanks, etc.). El mensaje en Firestore sigue guardando
  solo el id ("text-thanks"...), así que cada persona ve el sticker en su
  idioma y funciona con cualquier idioma que se agregue a translations.js
  (si falta la clave, translate() cae al español).

  El texto se acomoda solo: si es largo y tiene espacios se parte en dos
  líneas (cerca del medio), el tamaño de letra baja según la cantidad de
  letras y, si aun así no entra, textLength lo comprime al ancho de la
  etiqueta — nunca se sale del sticker.

  Las decoraciones que se mueven llevan clases .pt-sk-* (index.css). Un
  elemento animado nunca lleva atributo transform propio (la animación
  CSS lo pisaría): se envuelve en un <g> con la clase.
*/

const FONT = "'Trebuchet MS','Arial Rounded MT Bold',sans-serif";
const INK = "#4a2b3f";
const CHAR_WIDTH = 0.56; // ancho aproximado de una letra, en "em"

const smallHeart = "M0 8 C-12 0 -12 -10 -5 -10 C-2 -10 0 -7 0 -7 C0 -7 2 -10 5 -10 C12 -10 12 0 0 8 Z";
const sparkle = (x, y, r) =>
  `M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z`;

// Diseño de cada sticker. refTop es la parte de arriba de la etiqueta con
// la que se dibujaron las decoraciones: si la etiqueta cambia de alto
// (una o dos líneas), las decoraciones se mueven lo mismo.
const VARIANTS = {
  thanks: {
    x: 8, w: 104, cy: 62, refTop: 38, rotate: 0,
    fill: "#ffe3ef", stroke: "#ff5c8a", text: "#e6407a",
    deco: (
      <>
        <g className="pt-sk-beat">
          <path d="M100 42 C88 34 88 22 95 22 C98 22 100 25 100 25 C100 25 102 22 105 22 C112 22 112 34 100 42 Z" fill="#ff5c8a" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
        </g>
        <path className="pt-sk-twinkle" d="M18 34 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill="#ffd23f" stroke="#e89a00" strokeWidth="1.2" strokeLinejoin="round" />
      </>
    ),
  },
  hello: {
    x: 8, w: 94, cy: 64, refTop: 40, rotate: 0,
    fill: "#e3f4ff", stroke: "#3aa0ff", text: "#1f7fe0",
    deco: (
      <>
        <g className="pt-sk-wave">
          <g transform="rotate(18 100 36)">
            <rect x="89" y="26" width="22" height="24" rx="10" fill="#ffcc99" stroke={INK} strokeWidth="2.5" />
            <rect x="90" y="12" width="5.5" height="18" rx="2.75" fill="#ffcc99" stroke={INK} strokeWidth="2.2" />
            <rect x="96" y="9" width="5.5" height="20" rx="2.75" fill="#ffcc99" stroke={INK} strokeWidth="2.2" />
            <rect x="102" y="11" width="5.5" height="19" rx="2.75" fill="#ffcc99" stroke={INK} strokeWidth="2.2" />
            <rect x="78" y="31" width="14" height="6" rx="3" fill="#ffcc99" stroke={INK} strokeWidth="2.2" transform="rotate(-30 85 34)" />
            <rect x="90" y="27" width="20" height="10" fill="#ffcc99" />
          </g>
        </g>
        <path d="M112 16 l5 -4 M114 28 l6 0" stroke="#3aa0ff" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
  },
  haha: {
    x: 14, w: 92, cy: 62, refTop: 38, rotate: -7,
    fill: "#fff4cc", stroke: "#ffb800", text: "#e08a00",
    deco: (
      <>
        <path d="M8 46 q-6 9 0 12 q6 -3 0 -12 Z" fill="#6cc4ff" stroke="#2a8fd6" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M112 64 q-6 9 0 12 q6 -3 0 -12 Z" fill="#6cc4ff" stroke="#2a8fd6" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M20 30 l-5 -6 M30 26 l-1 -8 M98 96 l5 6 M88 100 l1 8" stroke="#ffb800" strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
  },
  goodnight: {
    x: 8, w: 100, cy: 69, refTop: 34, rotate: 0,
    fill: "#2d2a6e", stroke: "#8f8cff", text: "#fff",
    deco: (
      <>
        <g className="pt-sk-sway">
          <g transform="translate(97 2) scale(0.72) translate(-98 -10)">
            <path d="M98 10 A22 22 0 1 0 116 44 A17 17 0 1 1 98 10 Z" fill="#ffd23f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M93 30 q3 3 6 0" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
            <ellipse cx="92" cy="36" rx="3" ry="2" fill="#ff9fb0" />
          </g>
        </g>
        <path className="pt-sk-twinkle" d="M22 20 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 Z M44 14 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" fill="#ffd23f" />
      </>
    ),
  },
  loveYou: {
    x: 8, w: 100, cy: 64, refTop: 40, rotate: -4,
    fill: "#ffe0e6", stroke: "#ff4d6d", text: "#e0284f",
    deco: (
      <>
        <g className="pt-sk-beat">
          <g transform="translate(100 30) scale(1.5)">
            <path d={smallHeart} fill="#ff3d6e" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          </g>
        </g>
        <g className="pt-sk-twinkle">
          <g transform="translate(16 96) scale(0.8)">
            <path d={smallHeart} fill="#ff8fb1" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
          </g>
        </g>
      </>
    ),
  },
  sorry: {
    x: 8, w: 100, cy: 64, refTop: 40, rotate: 0,
    fill: "#ece6ff", stroke: "#9b8cff", text: "#6a55d8",
    deco: (
      <>
        <g transform="translate(100 30) scale(1.45)">
          <path d={smallHeart} fill="#ff8fb1" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="-7" y="-4.5" width="14" height="5" rx="2" fill="#ffe0b8" stroke={INK} strokeWidth="1.1" transform="rotate(-35)" />
        </g>
        <g className="pt-sk-tear">
          <path d="M16 92 q-5 8 0 10 q5 -2 0 -10 Z" fill="#6cc4ff" stroke="#2a8fd6" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      </>
    ),
  },
  congrats: {
    x: 6, w: 108, cy: 64, refTop: 40, rotate: 0,
    fill: "#fff0d6", stroke: "#ff9f1c", text: "#e07a00",
    deco: (
      <>
        <g className="pt-sk-twinkle">
          <path d={sparkle(16, 28, 10)} fill="#ffd23f" stroke="#e89a00" strokeWidth="1.5" strokeLinejoin="round" />
          <path d={sparkle(104, 98, 8)} fill="#ffd23f" stroke="#e89a00" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
        <g className="pt-sk-twinkle-alt">
          <path d={sparkle(100, 26, 7)} fill="#ff8fb1" stroke="#e0407a" strokeWidth="1.3" strokeLinejoin="round" />
          <rect x="34" y="22" width="7" height="4" rx="1.5" fill="#3aa0ff" transform="rotate(-25 37 24)" />
          <rect x="74" y="20" width="7" height="4" rx="1.5" fill="#4cc76a" transform="rotate(30 77 22)" />
          <circle cx="56" cy="16" r="2.6" fill="#9b5de5" />
          <circle cx="22" cy="100" r="2.6" fill="#ff5c8a" />
        </g>
      </>
    ),
  },
  cheerUp: {
    x: 8, w: 104, cy: 64, refTop: 40, rotate: -3,
    fill: "#e0f8e8", stroke: "#2fbf71", text: "#1f9a58",
    deco: (
      <>
        <g className="pt-sk-twinkle">
          <path d={sparkle(102, 26, 10)} fill="#ffd23f" stroke="#e89a00" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
        <g className="pt-sk-twinkle-alt">
          <path d={sparkle(18, 30, 6)} fill="#ffd23f" stroke="#e89a00" strokeWidth="1.3" strokeLinejoin="round" />
          <path d={sparkle(20, 98, 7)} fill="#2fbf71" stroke="#1f9a58" strokeWidth="1.3" strokeLinejoin="round" />
        </g>
      </>
    ),
  },
};

// Parte un texto largo con espacios en dos líneas, en el espacio más
// cercano al medio. Un texto corto, o sin espacios, queda en una línea.
function splitLines(text) {
  const clean = String(text).trim();
  if ([...clean].length <= 8 || !clean.includes(" ")) return [clean];
  const middle = clean.length / 2;
  let best = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === " " && (best === -1 || Math.abs(i - middle) < Math.abs(best - middle))) {
      best = i;
    }
  }
  return [clean.slice(0, best).trim(), clean.slice(best + 1).trim()];
}

function TextSticker({ variant, labelKey, width, height, className, style, "aria-hidden": ariaHidden }) {
  const { t } = useLanguage();
  const v = VARIANTS[variant];
  const label = t(labelKey);
  const lines = splitLines(label);
  const twoLines = lines.length === 2;

  const boxH = twoLines ? 70 : 48;
  const top = v.cy - boxH / 2;
  const avail = v.w - 20;
  const longest = Math.max(...lines.map((l) => [...l].length), 1);
  const baseSize = twoLines ? 22 : 30;
  // Con un mínimo legible; lo que no entre a ese tamaño se comprime.
  const minSize = twoLines || longest > 8 ? 18 : 23;
  const fontSize = Math.max(minSize, Math.min(baseSize, avail / (longest * CHAR_WIDTH)));
  const lineGap = fontSize + 3;
  const firstBaseline = v.cy - ((lines.length - 1) * lineGap) / 2 + fontSize * 0.35;
  const cx = v.x + v.w / 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={width}
      height={height}
      className={className}
      style={style}
      role={ariaHidden ? undefined : "img"}
      aria-label={ariaHidden ? undefined : label}
      aria-hidden={ariaHidden || undefined}
    >
      <g transform={v.rotate ? `rotate(${v.rotate} 60 ${v.cy})` : undefined}>
        <rect x={v.x} y={top} width={v.w} height={boxH} rx={twoLines ? 22 : 24} fill={v.fill} stroke={v.stroke} strokeWidth="3.5" />
        <g fontFamily={FONT} fontWeight="800" fontSize={fontSize} fill={v.text} textAnchor="middle">
          {lines.map((line, i) => {
            const estimated = [...line].length * fontSize * CHAR_WIDTH;
            const squeeze = estimated > avail;
            return (
              <text
                key={i}
                x={cx}
                y={firstBaseline + i * lineGap}
                textLength={squeeze ? avail : undefined}
                lengthAdjust={squeeze ? "spacingAndGlyphs" : undefined}
              >
                {line}
              </text>
            );
          })}
        </g>
      </g>
      <g transform={top !== v.refTop ? `translate(0 ${top - v.refTop})` : undefined}>{v.deco}</g>
    </svg>
  );
}

function makeTextSticker(variant, labelKey) {
  const Component = (props) => <TextSticker variant={variant} labelKey={labelKey} {...props} />;
  Component.displayName = `TextSticker(${variant})`;
  return Component;
}

export const TextThanksIcon = makeTextSticker("thanks", "stickers.textThanks");
export const TextHelloIcon = makeTextSticker("hello", "stickers.textHello");
export const TextHahaIcon = makeTextSticker("haha", "stickers.textHaha");
export const TextGoodnightIcon = makeTextSticker("goodnight", "stickers.textGoodnight");
export const TextLoveYouIcon = makeTextSticker("loveYou", "stickers.textLoveYou");
export const TextSorryIcon = makeTextSticker("sorry", "stickers.textSorry");
export const TextCongratsIcon = makeTextSticker("congrats", "stickers.textCongrats");
export const TextCheerUpIcon = makeTextSticker("cheerUp", "stickers.textCheerUp");
