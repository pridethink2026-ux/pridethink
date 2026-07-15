import React from "react";

/*
  Avatar
  ------
  Círculo con las iniciales del usuario sobre un gradiente de color.
  El color se genera de forma determinista a partir del uid (un hash simple
  elige un tono), así que el mismo usuario siempre tiene el mismo color en
  toda la app, sin necesidad de guardar una foto de perfil real.

  EXCEPCIÓN INTENCIONAL a la regla de "solo variables CSS de temas": el
  gradiente de cada avatar es un color de IDENTIDAD por usuario, no un color
  de tema — por diseño debe verse igual sin importar qué tema visual esté
  activo, para que sigas reconociendo a cada persona por su color. El texto
  se deja en blanco fijo porque debe tener buen contraste contra cualquiera
  de los tonos generados, algo que las variables de tema no garantizan.

  Tamaños: "sm" (comentarios), "md" (posts, contactos), "lg" (perfil).
*/

const SIZES = {
  sm: { box: 26, font: 11 },
  md: { box: 38, font: 15 },
  lg: { box: 72, font: 26 },
};

function hashToHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

function getInitials(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Avatar({ uid, name, size = "md", onClick }) {
  const { box, font } = SIZES[size] || SIZES.md;
  const seed = uid || name || "?";
  const hue = hashToHue(seed);
  const hue2 = (hue + 40) % 360;

  const style = {
    width: `${box}px`,
    height: `${box}px`,
    minWidth: `${box}px`,
    borderRadius: "50%",
    background: `linear-gradient(135deg, hsl(${hue}, 65%, 55%), hsl(${hue2}, 70%, 45%))`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${font}px`,
    fontWeight: 700,
    color: "#fff",
    flexShrink: 0,
    cursor: onClick ? "pointer" : "default",
    userSelect: "none",
  };

  return (
    <div style={style} onClick={onClick} title={name || undefined}>
      {getInitials(name)}
    </div>
  );
}
