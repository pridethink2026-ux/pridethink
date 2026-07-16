/*
  homeIcon.js
  -----------
  Logica pura (sin JSX) para decidir que forma y que colores debe tener el
  icono de "Inicio" (Muro) de la navegacion, segun la identidad libre que el
  usuario escribio en su perfil (`users/{uid}.identity`).

  getHomeIcon(identityText) devuelve { shape, colors }:
  - shape: nombre de una de las formas dibujadas por HomeIcon.jsx ("house",
    "doghouse", "litterbox", "birdhouse", "castle"). Por defecto "house".
  - colors: arreglo de colores hex de una bandera pride (2 a 5 tonos, para
    un degradado), o null si no se detecto ninguna identidad con bandera
    conocida -- en ese caso HomeIcon.jsx usa el color de acento del tema
    activo (var(--accent) / var(--accent2) de themes.js) en vez de esto.

  Para agregar una forma o una bandera nueva solo hay que sumar una entrada
  a SHAPE_RULES o COLOR_RULES; el resto del archivo no cambia.
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

function normalize(text) {
  return stripDiacritics((text || "").toString().normalize("NFD"))
    .toLowerCase()
    .trim();
}

// Orden de evaluacion: se usa la primera regla cuyo patron encuentre una
// coincidencia. \b (limite de palabra) evita falsos positivos como que
// "can" (perro) dispare dentro de "cansado", o "bi" dentro de "binario".
const SHAPE_RULES = [
  { shape: "doghouse", pattern: /\b(perro|perra|dog|can)\b/ },
  { shape: "litterbox", pattern: /\b(gato|gata|cat|felino|felina)\b/ },
  { shape: "birdhouse", pattern: /\b(pajaro|ave|bird)\b/ },
  {
    shape: "castle",
    pattern: /\b(rey|king|reina|queen|princesa|principe|realeza)\b/,
  },
];

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

export function getHomeIcon(identityText) {
  const text = normalize(identityText);

  let shape = "house";
  for (const rule of SHAPE_RULES) {
    if (rule.pattern.test(text)) {
      shape = rule.shape;
      break;
    }
  }

  let colors = null;
  for (const rule of COLOR_RULES) {
    if (rule.pattern.test(text)) {
      colors = rule.colors;
      break;
    }
  }

  return { shape, colors };
}
