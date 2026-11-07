import React, { useId } from "react";

/*
  AngelWingsIcon
  --------------
  Ícono del tema Ángel (punto 85): dos alas de ángel blancas de perfil,
  una delante de la otra, con las puntas de las plumas en los colores
  pride (rojo en la punta del ala → violeta junto al cuerpo). Redibujo
  propio y simplificado de referencia-angel-ala.jpg para tamaño chico: en
  cada ala, el borde curvo de arriba, una fila de plumas largas que cuelgan
  de él (blancas, con la punta de color) y una fila de plumas cortas
  blancas encima. La de atrás asoma arriba, un poco más chica y en gris
  perla; un contorno gris fino recorta las dos sobre fondos blancos.
  Colores fijos, no del tema activo (misma excepción que PinkyHeartIcon).

  Lleva role="img" y aria-label "Ángel" para cuando se usa solo. En el
  menú de temas va dentro de un contenedor aria-hidden, como los otros
  íconos, porque el nombre ya está escrito al lado. Cada instancia genera
  sus propios ids de degradado (useId).
*/

const OUTLINE = "#9d97ae";

// Plumas largas, de la punta del ala al cuerpo: [x, y del nacimiento
// sobre el borde, ángulo en grados (0 = derecha, positivo = hacia abajo),
// largo, color de la punta].
const PRIMARIES = [
  [13.6, 6.1, -8, 9.5, "#ff3d57"],
  [11.5, 7.1, 4, 10.5, "#ff8a2a"],
  [9.3, 8.5, 16, 11, "#ffc21a"],
  [7.3, 10.3, 28, 10.5, "#2fbf63"],
  [5.7, 12.5, 40, 9.5, "#2f7bff"],
  [4.4, 15, 54, 8, "#8a4dff"],
];

// Borde de arriba del ala: del hombro (abajo a la izquierda) a la punta.
const EDGE = "M3 20Q5 9 14 6";

// Una pluma a lo largo del eje x local (0 → largo), con punta redondeada.
const feather = (len, half) =>
  `M0 0C${len * 0.25} ${-half} ${len * 0.7} ${-half} ${len} 0C${len * 0.7} ${half} ${len * 0.25} ${half} 0 0Z`;

function Wing({ tipId, covert, edge, tipOpacity }) {
  return (
    <g stroke={OUTLINE} strokeWidth="0.45" strokeLinejoin="round">
      {PRIMARIES.map(([x, y, a, len], i) => (
        <path
          key={`p${i}`}
          d={feather(len, 1.9)}
          transform={`translate(${x} ${y}) rotate(${a})`}
          fill={`url(#${tipId}${i})`}
          fillOpacity={tipOpacity}
        />
      ))}
      {PRIMARIES.map(([x, y, a, len], i) => (
        <path
          key={`c${i}`}
          d={feather(len * 0.42, 1.35)}
          transform={`translate(${x} ${y}) rotate(${a - 4})`}
          fill={covert}
        />
      ))}
      {/* Borde: trazo gris ancho y encima el blanco, más angosto */}
      <path d={EDGE} fill="none" stroke={OUTLINE} strokeWidth="2.7" strokeLinecap="round" />
      <path d={EDGE} fill="none" stroke={edge} strokeWidth="1.9" strokeLinecap="round" />
    </g>
  );
}

export default function AngelWingsIcon({ size = "1.15em", label = "Ángel" }) {
  const tipId = `angel-tip-${useId().replace(/:/g, "")}-`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      focusable="false"
      style={{ display: "inline-block", verticalAlign: "-0.2em" }}
    >
      <defs>
        {PRIMARIES.map(([, , , , color], i) => (
          // A lo largo de cada pluma (objectBoundingBox, antes de rotarla):
          // blanco en la base, el color en la mitad de afuera (desde 0,55:
          // más corto no se veía a 16 px).
          <linearGradient key={color} id={`${tipId}${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.38" stopColor="#f3f1f7" />
            <stop offset="0.55" stopColor={color} />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        ))}
      </defs>
      {/* Ala de atrás: asoma arriba, más chica y en sombra perla */}
      <g transform="translate(3.2 -3) scale(0.86)">
        <Wing tipId={tipId} covert="#e2dfe9" edge="#e9e6ef" tipOpacity={0.85} />
      </g>
      {/* Ala de adelante */}
      <g transform="translate(-1.6 1.6)">
        <Wing tipId={tipId} covert="#ffffff" edge="#ffffff" tipOpacity={1} />
      </g>
    </svg>
  );
}
