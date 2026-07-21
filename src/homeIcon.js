/*
  homeIcon.js
  -----------
  Logica pura (sin JSX) para decidir que forma debe tener el icono de
  "Inicio" (Muro) de la navegacion, segun la identidad libre que el usuario
  escribio en su perfil (`users/{uid}.identity`). La deteccion de la
  paleta de colores (bandera pride) es compartida con Avatar.jsx y vive en
  identityStyles.js -- este archivo solo agrega la deteccion de FORMA, que
  es exclusiva del icono de Inicio.

  getHomeIcon(identityText) devuelve { shape, colors }:
  - shape: nombre de una de las formas dibujadas por HomeNavIcon.jsx
    ("house", "doghouse", "litterbox", "birdhouse", "castle"). Por defecto
    "house".
  - colors: arreglo de colores hex de una bandera pride (2 a 5 tonos, para
    un degradado), o null si no se detecto ninguna identidad con bandera
    conocida -- en ese caso HomeNavIcon.jsx usa el color de acento del tema
    activo (var(--accent) / var(--accent2) de themes.js) en vez de esto.

  Para agregar una forma nueva alcanza con sumar una entrada a SHAPE_RULES;
  para una bandera nueva hay que sumarla en identityStyles.js (COLOR_RULES).
*/

import { normalizeIdentityText, getIdentityColors } from "./identityStyles";

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

export function getHomeIcon(identityText) {
  const text = normalizeIdentityText(identityText);

  let shape = "house";
  for (const rule of SHAPE_RULES) {
    if (rule.pattern.test(text)) {
      shape = rule.shape;
      break;
    }
  }

  const colors = getIdentityColors(identityText);

  return { shape, colors };
}
