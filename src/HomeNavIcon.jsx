import React, { useId } from "react";
import { getHomeIcon } from "./homeIcon";

/*
  HomeIcon
  --------
  Icono de "Inicio" (pestana Muro) de la navegacion, personalizado segun la
  identidad libre del usuario logueado. La logica de que forma y que
  colores usar vive en homeIcon.js (getHomeIcon); este componente solo se
  encarga de dibujar el SVG correspondiente.

  Formas (trazo solamente, sin relleno, estilo minimalista):
  - "house": casita simple (por defecto, cuando no se detecta nada).
  - "doghouse": casa con entrada en arco redondeado (identidad con perro).
  - "litterbox": caja de arena cubierta con entrada redonda (gato).
  - "birdhouse": casita de pajaro con agujero redondo y palito (ave).
  - "castle": castillo con torres y almenas (identidad de realeza).

  Colores: si homeIcon.js detecto una bandera pride en la identidad, el
  trazo usa un degradado con esos colores (fijos, son los colores oficiales
  de cada bandera, no colores de tema). Si no detecto nada, el degradado
  usa las variables de tema activo (--accent / --accent2 de themes.js), asi
  que sigue respetando el tema visual elegido.

  Cada instancia genera su propio id de gradiente (useId) para poder
  mostrarse a la vez en la nav de escritorio y en la barra inferior movil
  sin que los ids de <linearGradient> choquen entre si.
*/

const SHAPES = {
  house: (
    <path d="M4 12 L12 4 L20 12 L20 20 L4 20 Z" />
  ),
  doghouse: (
    <>
      <path d="M3 12 L12 4 L21 12 L21 20 L3 20 Z" />
      <path d="M9 20 V14 A3 3 0 0 1 15 14 V20" />
    </>
  ),
  litterbox: (
    <>
      <path d="M3 19 V13 Q3 8 8 8 H16 Q21 8 21 13 V19 Z" />
      <circle cx="9" cy="14.5" r="2.4" />
    </>
  ),
  birdhouse: (
    <>
      <path d="M6 14 L12 7 L18 14 Z" />
      <path d="M7 14 H17 V22 H7 Z" />
      <circle cx="12" cy="17.2" r="1.5" />
      <line x1="13.4" y1="18.4" x2="16" y2="19" />
    </>
  ),
  castle: (
    <>
      <path d="M3 20 H21" />
      <path d="M3 20 V8 H7 V20" />
      <path d="M17 20 V8 H21 V20" />
      <path d="M7 20 V11 H17 V20" />
      <path d="M3 8 V6 H4.3 V8" />
      <path d="M5.7 8 V6 H7 V8" />
      <path d="M17 8 V6 H18.3 V8" />
      <path d="M19.7 8 V6 H21 V8" />
      <path d="M7 11 V9 H9.3 V11" />
      <path d="M10.65 11 V9 H12.95 V11" />
      <path d="M14.3 11 V9 H16.6 V11" />
      <path d="M10.5 20 V16 A1.75 1.75 0 0 1 14 16 V20" />
    </>
  ),
};

export default function HomeIcon({ identityText, active, size = 20 }) {
  const { shape, colors } = getHomeIcon(identityText);
  const gradId = `home-icon-grad-${useId()}`;
  const stops = colors && colors.length > 0
    ? colors
    : ["var(--accent)", "var(--accent2)"];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={`url(#${gradId})`}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: active ? 1 : 0.55, flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          {stops.map((color, i) => (
            <stop
              key={i}
              offset={`${(i / Math.max(stops.length - 1, 1)) * 100}%`}
              stopColor={color}
            />
          ))}
        </linearGradient>
      </defs>
      {SHAPES[shape] || SHAPES.house}
    </svg>
  );
}
