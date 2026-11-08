import React, { useEffect, useState } from "react";

/*
  StarRain (punto 86)
  -------------------
  Lluvia de estrellas que cae sobre toda la pantalla durante 2 s y se
  quita sola. Es solo decoración:
  - `pointer-events: none` y `aria-hidden`: no bloquea ningún toque (el
    visor de Momentos sigue respondiendo debajo) ni la leen los lectores
    de pantalla.
  - Solo anima transform y opacity (@keyframes pt-star-fall en index.css),
    que el navegador delega a la GPU: va fluida en celular.
  - Colores: --star-rain-1/2/3 (themes.js, EFFECT_DEFAULTS; cada tema los
    puede cambiar). Se usa el carácter ★ y no el emoji ⭐ porque los emojis
    a color ignoran `color`.
  - Con "reducir movimiento" del sistema no se muestra nada.

  Dos formas de usarla:
  - `<StarRain onDone={...} />`: el componente suelto (props opcionales
    `count` y `durationMs`). Llama a onDone cuando terminó.
  - `triggerStarRain()` desde cualquier parte, con `<StarRainHost />`
    montado una sola vez (App.js, por encima del visor de Momentos). Si se
    dispara otra mientras hay una en curso, la nueva reemplaza a la
    anterior (no se acumulan).

  La usa MomentViewer.jsx: al poner una estrella, y al abrir tu momento
  tocando por primera vez su notificación "momentLike" (starRainOnOpen).
*/

const EVENT_NAME = "pt-star-rain";
const DEFAULT_DURATION_MS = 2000;
const DEFAULT_COUNT = 26;
const COLORS = ["var(--star-rain-1)", "var(--star-rain-2)", "var(--star-rain-3)"];

export function triggerStarRain() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT_NAME));
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const between = (min, max) => min + Math.random() * (max - min);

// Cada estrella empieza en un punto al azar (algunas un poco por encima
// del borde), cae entre 55 y 80 vh con una leve deriva y giro, y termina
// antes de durationMs: retraso hasta el 25 % + caída del 45 % al 72 %.
function makeStars(count, durationMs) {
  return Array.from({ length: count }, (_, i) => {
    const color = COLORS[i % COLORS.length];
    return {
      id: i,
      left: between(0, 100),
      top: between(-10, 35),
      size: between(12, 26),
      delay: between(0, durationMs * 0.25),
      duration: between(durationMs * 0.45, durationMs * 0.72),
      fall: between(55, 80),
      drift: between(-30, 30),
      spin: between(-200, 200),
      color,
    };
  });
}

const styles = {
  layer: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: 70, // por encima del visor de Momentos (60)
  },
  star: (s) => ({
    position: "absolute",
    left: `${s.left}%`,
    top: `${s.top}%`,
    fontSize: `${s.size}px`,
    lineHeight: 1,
    color: s.color,
    textShadow: `0 0 6px ${s.color}`,
    opacity: 0,
    "--pt-star-fall": `${s.fall}vh`,
    "--pt-star-drift": `${s.drift}px`,
    "--pt-star-spin": `${s.spin}deg`,
    animation: `pt-star-fall ${Math.round(s.duration)}ms cubic-bezier(0.3, 0.5, 0.6, 1) ${Math.round(s.delay)}ms both`,
  }),
};

export default function StarRain({ count = DEFAULT_COUNT, durationMs = DEFAULT_DURATION_MS, onDone }) {
  const [stars] = useState(() => (prefersReducedMotion() ? [] : makeStars(count, durationMs)));

  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), durationMs);
    return () => clearTimeout(timer);
    // Una sola vez por lluvia: un onDone nuevo en cada render del padre no
    // debe reiniciar el tiempo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stars.length === 0) return null;
  return (
    <div style={styles.layer} aria-hidden="true">
      {stars.map((s) => (
        <span key={s.id} className="pt-star-rain-star" style={styles.star(s)}>
          ★
        </span>
      ))}
    </div>
  );
}

// Escucha triggerStarRain(). Cada disparo monta una lluvia nueva (key
// distinta), que desmonta a la anterior y cancela su temporizador.
export function StarRainHost() {
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const onRain = () => setRunId((id) => id + 1);
    window.addEventListener(EVENT_NAME, onRain);
    return () => window.removeEventListener(EVENT_NAME, onRain);
  }, []);

  if (!runId) return null;
  return <StarRain key={runId} onDone={() => setRunId(0)} />;
}
