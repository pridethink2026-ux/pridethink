import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";

/*
  Reactions
  ---------
  Lógica y UI COMPARTIDA de reacciones, usada tanto en publicaciones
  (`Feed.jsx` -> `PostCard`) como en mensajes de chat (`Chat.jsx` ->
  `MessageBubble`). Ambos guardan la reacción de cada persona como
  `{ [uid]: tipo }` dentro del propio documento (post o mensaje) — un solo
  tipo de reacción por persona, la última que eligió pisa la anterior.

  Exporta:
  - REACTION_TYPES: los 5 tipos disponibles (código fijo + emoji + clave de
    traducción para el "title"). El código NO se traduce (se guarda tal
    cual en Firestore, como los códigos de género); solo la etiqueta que
    se usa de tooltip cambia de idioma.
  - getReactionEmoji(type): emoji de un tipo, o null.
  - getReactionSummary(reactions): para posts — cuenta cuántas reacciones
    de cada tipo hay, en el orden fijo de REACTION_TYPES (no alfabético),
    lista solo los tipos con al menos una reacción. Ej: para armar
    "❤️ 12 · 🔥 3".
  - getDistinctReactionEmojis(reactions): para mensajes de chat, donde como
    mucho reaccionan 2 personas (los participantes) — la lista de emojis
    DISTINTOS presentes, sin contar cuántas veces (si ambos reaccionaron
    igual, aparece una sola vez).
  - useReactionPicker(): hook con la interacción de abrir el selector al
    pasar el mouse (desktop) o mantener presionado (mobile), y cerrarlo al
    tocar/clickear afuera. En desktop, cerrar por "mouse afuera" tiene un
    pequeño retraso (ver CLOSE_DELAY_MS) para poder mover el mouse del
    botón al selector sin que se cierre en el camino.
  - ReactionPicker: la fila de botones con los 5 emojis.
*/

export const REACTION_TYPES = [
  { value: "like", emoji: "❤️", labelKey: "reaction.like" },
  { value: "applause", emoji: "👏", labelKey: "reaction.applause" },
  { value: "fire", emoji: "🔥", labelKey: "reaction.fire" },
  { value: "pride", emoji: "🏳️‍🌈", labelKey: "reaction.pride" },
  { value: "funny", emoji: "😂", labelKey: "reaction.funny" },
];

export function getReactionEmoji(type) {
  return REACTION_TYPES.find((r) => r.value === type)?.emoji || null;
}

export function getReactionSummary(reactions) {
  const counts = {};
  Object.values(reactions || {}).forEach((type) => {
    counts[type] = (counts[type] || 0) + 1;
  });
  return REACTION_TYPES.filter((r) => counts[r.value] > 0).map((r) => ({
    emoji: r.emoji,
    count: counts[r.value],
  }));
}

export function getDistinctReactionEmojis(reactions) {
  const typesPresent = new Set(Object.values(reactions || {}));
  return REACTION_TYPES.filter((r) => typesPresent.has(r.value)).map((r) => r.emoji);
}

const LONG_PRESS_MS = 450;
// Cuánto se espera después de que el mouse sale del contenedor (botón +
// selector) antes de cerrar de verdad. Cubre el instante en que el cursor
// viaja de uno a otro y momentáneamente no está sobre ninguno de los dos
// (por ejemplo, un movimiento diagonal rápido que "corta camino" por fuera
// de ambas cajas) — sin este margen, ese instante alcanza para disparar el
// mouseleave del contenedor y cerrar el selector antes de llegar a él.
const CLOSE_DELAY_MS = 180;

export function useReactionPicker() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const closeTimer = useRef(null);

  // Cierra el selector al tocar/clickear afuera (mousedown cubre desktop,
  // touchstart cubre mobile, donde no existe un "mouse leave" natural).
  useEffect(() => {
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("touchstart", handleOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  // Si el componente se desmonta con un timeout pendiente (p.ej. el post
  // se borró justo cuando el mouse estaba saliendo), lo cancela para no
  // llamar setState sobre un componente ya desmontado.
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Entrar (con el mouse) cancela cualquier cierre pendiente y abre ya
  // mismo — así volver a entrar antes de que se cumpla el retraso de
  // cierre no lo cierra.
  const handleMouseEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };

  // Salir (con el mouse) NO cierra al toque: agenda el cierre para dentro
  // de CLOSE_DELAY_MS, dando tiempo a que el cursor llegue al selector
  // (que es hijo del mismo contenedor) aunque haya pasado un instante por
  // fuera de las dos cajas en el camino.
  const handleMouseLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, CLOSE_DELAY_MS);
  };

  const triggerProps = {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onTouchStart: () => {
      longPressFired.current = false;
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        setOpen(true);
      }, LONG_PRESS_MS);
    },
    onTouchEnd: cancelLongPress,
    onTouchMove: cancelLongPress,
  };

  // Después de un long-press, el navegador dispara igual un "click"
  // sintético al soltar el dedo. Quien use el hook debe llamar esto al
  // principio de su propio onClick e ignorar el click si ya vino de un
  // long-press (si no, se dispararía también la reacción rápida).
  const consumeLongPress = () => {
    const fired = longPressFired.current;
    longPressFired.current = false;
    return fired;
  };

  return { open, setOpen, containerRef, triggerProps, consumeLongPress };
}

const pickerStyles = {
  wrapper: {
    position: "absolute",
    display: "flex",
    gap: "2px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "5px 6px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
    zIndex: 30,
  },
  btn: (active) => ({
    background: active ? "var(--accent2-soft)" : "transparent",
    border: "none",
    borderRadius: "999px",
    width: "32px",
    height: "32px",
    fontSize: "17px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  }),
};

export function ReactionPicker({ myReaction, onSelect, style }) {
  const { t } = useLanguage();
  return (
    <div style={{ ...pickerStyles.wrapper, ...style }} onClick={(e) => e.stopPropagation()}>
      {REACTION_TYPES.map((r) => (
        <button
          key={r.value}
          type="button"
          style={pickerStyles.btn(myReaction === r.value)}
          onClick={() => onSelect(myReaction === r.value ? null : r.value)}
          title={t(r.labelKey)}
        >
          {r.emoji}
        </button>
      ))}
    </div>
  );
}
