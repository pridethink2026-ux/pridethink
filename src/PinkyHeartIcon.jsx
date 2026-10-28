/*
  PinkyHeartIcon
  --------------
  Ícono del tema Pinky (punto 73): el corazón rosa 🩷 dibujado como SVG
  propio, porque ese emoji es nuevo (2022) y en teléfonos o computadoras
  viejos sale como un cuadrado vacío. Colores fijos, no del tema activo
  (representa una opción concreta, misma excepción que PaintDropIcon en
  App.js): relleno rosa del 🩷, contorno más oscuro para que se vea nítido
  en tamaños chicos y sobre fondos claros, y un brillo blanco.

  Lleva role="img" y aria-label "Pinky" para cuando se usa solo. En el menú
  de temas va dentro de un contenedor aria-hidden, como los otros íconos,
  porque el nombre ya está escrito al lado.
*/

export default function PinkyHeartIcon({ size = "1.15em", label = "Pinky" }) {
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
      <path
        d="M12 20.6s-7.6-4.6-9.4-9.3C1.3 7.9 3.3 4.4 6.8 4.1c2.1-.2 3.9.9 5.2 2.7 1.3-1.8 3.1-2.9 5.2-2.7 3.5.3 5.5 3.8 4.2 7.2-1.8 4.7-9.4 9.3-9.4 9.3z"
        fill="#ff8fc4"
        stroke="#e0447f"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse cx="7.6" cy="8.4" rx="1.9" ry="1.2" transform="rotate(-35 7.6 8.4)" fill="#ffffff" opacity="0.75" />
    </svg>
  );
}
