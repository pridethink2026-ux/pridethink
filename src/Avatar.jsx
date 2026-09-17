import React, { useState } from "react";
import { getIdentityColors } from "./identityStyles";

/*
  Avatar
  ------
  Foto de perfil del usuario (prop `photoURL`) o, si no tiene, un círculo
  con sus iniciales sobre un gradiente de color. En los dos casos lleva
  alrededor el mismo anillo que refleja su identidad libre (`identity`),
  usando la misma detección de palabras clave/paleta que ya usa el ícono de
  Inicio de la nav (`identityStyles.js`, compartido con `homeIcon.js`).

  El color de fondo de las iniciales se genera de forma determinista a
  partir del uid (un hash simple elige un tono), así que el mismo usuario
  siempre tiene el mismo color en toda la app.

  FOTO DE PERFIL (`photoURL`, punto 58): es la URL de descarga que
  `ProfilePhotoUploader.jsx` deja en `users/{uid}.photoURL` tras subir la
  imagen a Cloud Storage. Es una prop NORMAL, que cada pantalla pasa desde
  el documento del usuario que ya tiene en la mano — a propósito NO se
  resuelve acá adentro leyendo `AllUsersContext` por uid, aunque sería más
  cómodo: `Avatar` es el componente que más veces se instancia en toda la
  app (muro, comentarios, chat, notificaciones, búsqueda...), y suscribirlo
  al contexto de `users` haría que TODOS los avatares en pantalla se
  volvieran a renderizar con cada latido de presencia (`presence.js`
  reescribe el documento de cada usuario conectado cada 60 segundos) — que
  es exactamente el problema de rendimiento que se resolvió en la auditoría
  del 2026-07-28. Si falta la prop, simplemente se muestran las iniciales.

  Si la imagen no carga (URL vencida, foto borrada del bucket, sin
  conexión), `onError` la descarta y se vuelve a las iniciales, así que
  nunca queda un cuadro roto.

  EXCEPCIONES INTENCIONALES a la regla de "solo variables CSS de temas":
  - El gradiente de fondo (iniciales) es un color de IDENTIDAD por usuario,
    no un color de tema — por diseño debe verse igual sin importar qué tema
    visual esté activo, para que sigas reconociendo a cada persona por su
    color. El texto se deja en blanco fijo porque debe tener buen contraste
    contra cualquiera de los tonos generados, algo que las variables de
    tema no garantizan.
  - El anillo, cuando `identity` matchea una bandera pride conocida, usa los
    colores fijos de esa bandera (misma excepción que `homeIcon.js`): son
    los colores oficiales de la bandera, no colores de identidad visual de
    la app, así que no deben cambiar con el tema. Si no se detecta ninguna
    bandera, el anillo cae al degradado de acento del tema activo
    (`var(--accent)` / `var(--accent2)`), igual que hace `HomeNavIcon.jsx`
    como fallback — ese sí respeta los 4 temas y el modo Rotativo.
  - El puntito de "en línea" (prop `online`, ver presence.js -> useOnlinePresence
    / isEffectivelyOnline) usa un verde fijo, no un color de tema: es una
    señal semántica universal ("verde = conectado") que debe verse igual
    sin importar qué tema visual esté activo, mismo criterio que las
    banderas pride de arriba. El borde del puntito sí usa `var(--surface)`
    (para "recortarlo" del fondo detrás del avatar, que en casi todos los
    lugares donde se usa `Avatar` es justo esa variable).

  Tamaños: "sm" (comentarios), "md" (posts, contactos), "lg" (perfil).
*/

const SIZES = {
  sm: { box: 26, font: 11, ring: 3 },
  md: { box: 38, font: 15, ring: 3 },
  lg: { box: 72, font: 26, ring: 4 },
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

export default function Avatar({
  uid,
  name,
  identity,
  photoURL,
  size = "md",
  online = false,
  onClick,
}) {
  // Se guarda la URL que falló (no un booleano) para que, si la persona
  // cambia su foto por otra, la nueva se vuelva a intentar sola sin
  // necesidad de un useEffect que resetee el estado.
  const [failedPhoto, setFailedPhoto] = useState(null);
  const showPhoto = !!photoURL && failedPhoto !== photoURL;

  const { box, font, ring } = SIZES[size] || SIZES.md;
  const seed = uid || name || "?";
  const hue = hashToHue(seed);
  const hue2 = (hue + 40) % 360;

  const identityColors = getIdentityColors(identity);
  const ringStops =
    identityColors && identityColors.length > 0
      ? identityColors
      : ["var(--accent)", "var(--accent2)"];

  const ringStyle = {
    position: "relative",
    width: `${box}px`,
    height: `${box}px`,
    minWidth: `${box}px`,
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${ringStops.join(", ")})`,
    padding: `${ring}px`,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: onClick ? "pointer" : "default",
    userSelect: "none",
    overflow: "hidden",
  };

  const style = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    background: `linear-gradient(135deg, hsl(${hue}, 65%, 55%), hsl(${hue2}, 70%, 45%))`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${font}px`,
    lineHeight: 1,
    fontWeight: 700,
    color: "#fff",
    overflow: "hidden",
  };

  const photoStyle = {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    objectFit: "cover",
    display: "block",
  };

  const dotSize = Math.max(10, Math.round(box * 0.28));
  const onlineDotStyle = {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: `${dotSize}px`,
    height: `${dotSize}px`,
    borderRadius: "50%",
    background: "#22c55e",
    border: "2px solid var(--surface)",
    boxSizing: "border-box",
  };

  return (
    <div style={ringStyle} onClick={onClick} title={name || undefined}>
      {showPhoto ? (
        <img
          src={photoURL}
          alt={name || ""}
          style={photoStyle}
          onError={() => setFailedPhoto(photoURL)}
        />
      ) : (
        <div style={style}>{getInitials(name)}</div>
      )}
      {online && <span style={onlineDotStyle} />}
    </div>
  );
}
