/*
  identityStyles.js
  ------------------
  Deteccion de "paleta pride" a partir del texto libre de identidad de un
  usuario (`users/{uid}.identity`). Vive en su propio archivo porque la
  comparten dos componentes: HomeNavIcon.jsx (icono de Inicio de la nav) y
  Avatar.jsx (anillo alrededor del avatar circular) -- ambos necesitan la
  misma deteccion de palabras clave, solo cambia como dibujan el resultado
  (un SVG con stops uno, un anillo con linear-gradient el otro).

  getIdentityColors(identityText) devuelve un arreglo de colores hex (2 a 5
  tonos, pensados para un degradado) de la bandera pride detectada, o null
  si no se detecto ninguna -- en ese caso quien llama debe usar el color de
  acento del tema activo en su lugar (var(--accent) / var(--accent2) de
  themes.js), nunca un color fijo.

  Para agregar una bandera nueva solo hay que sumar una entrada a
  COLOR_RULES; el resto del archivo no cambia.
*/

// Quita acentos (por ejemplo "a" con tilde -> "a") y pasa a minusculas para
// que la deteccion de palabras clave no dependa de como el usuario haya
// escrito su identidad. Se separan primero las letras de sus marcas de
// acento (normalize("NFD")) y luego se descartan los codigos de esas
// marcas (U+0300 a U+036F, el bloque Unicode "combining diacritical
// marks") comparando puntos de codigo, sin usar un caracter con tilde
// escrito directamente en este archivo.
const COMBINING_MARKS_START = 0x0300;
const COMBINING_MARKS_END = 0x036f;

function stripDiacritics(text) {
  let result = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < COMBINING_MARKS_START || code > COMBINING_MARKS_END) {
      result += ch;
    }
  }
  return result;
}

export function normalizeIdentityText(text) {
  return stripDiacritics((text || "").toString().normalize("NFD"))
    .toLowerCase()
    .trim();
}

// Orden de evaluacion: se usa la primera regla cuyo patron encuentre una
// coincidencia. \b (limite de palabra) evita falsos positivos como que
// "bi" dispare dentro de "binario".
const COLOR_RULES = [
  {
    name: "trans",
    pattern: /\btrans/,
    colors: ["#5BCEFA", "#F5A9B8", "#FFFFFF"],
  },
  {
    name: "nonbinary",
    // "\bno binari" cubre "no binario/a/e" (concordancia de genero) sin
    // repetir la regla tres veces.
    pattern: /\bno binari|\bnb\b|\benby\b/,
    colors: ["#FCF434", "#FFFFFF", "#9C59D1", "#2C2C2C"],
  },
  {
    name: "bi",
    pattern: /\bbi\b|\bbisexual\b/,
    colors: ["#D60270", "#9B4F96", "#0038A8"],
  },
  {
    name: "pan",
    pattern: /\bpan\b|\bpansexual\b/,
    colors: ["#FF218C", "#FFD800", "#21B1FF"],
  },
  {
    name: "lesbian",
    pattern: /\blesbian|\blesbiana/,
    colors: ["#D62900", "#FF9B55", "#FFFFFF", "#D462A6", "#A50062"],
  },
  {
    name: "gay",
    pattern: /\bgay\b|\bhomosexual/,
    colors: ["#078D70", "#98E8C1", "#7BADE2", "#3D1A78"],
  },
];

export function getIdentityColors(identityText) {
  const text = normalizeIdentityText(identityText);
  for (const rule of COLOR_RULES) {
    if (rule.pattern.test(text)) return rule.colors;
  }
  return null;
}
