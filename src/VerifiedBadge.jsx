import React, { useId } from "react";
import { useLanguage } from "./LanguageContext";

/*
  VerifiedBadge
  -------------
  Ícono de "cuenta verificada": un sello con forma de estrella redondeada
  (mismo espíritu que las insignias de verificación de redes sociales
  conocidas, pero con trazo propio, no una copia) y un checkmark adentro.
  Se muestra junto al nombre cuando users/{uid}.isVerified es true.

  El relleno usa un degradado con las variables de tema activo
  (var(--accent)/var(--accent2)), así que respeta los 4 temas y el modo
  Rotativo — mismo patrón que HomeNavIcon.jsx. El checkmark usa
  var(--bg) (siempre oscuro en los 4 temas) para que tenga buen contraste
  contra el relleno, sin necesidad de un color fijo.

  isVerified se activa a mano desde la consola de Firebase — la app nunca
  ofrece ninguna forma de auto-verificarse (ver el punto correspondiente
  en CONTEXTO.md y la protección en firestore.rules, que bloquea que el
  propio usuario cambie este campo).

  Cada instancia genera su propio id de degradado (useId, mismo patrón que
  HomeNavIcon.jsx) para poder aparecer varias veces a la vez en una misma
  pantalla (lista de posts, de miembros, de asistentes) sin que los ids de
  <linearGradient> choquen entre sí.
*/

const SIZES = { sm: 13, md: 15, lg: 18 };

export default function VerifiedBadge({ size = "md" }) {
  const { t } = useLanguage();
  const gradId = `pt-verified-grad-${useId()}`;
  const px = SIZES[size] || SIZES.md;
  const label = t("verified.badge");

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent2)" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5l2.1 1.9 2.8-.7 1.1 2.6 2.6 1.1-.7 2.8 1.9 2.1-1.9 2.1.7 2.8-2.6 1.1-1.1 2.6-2.8-.7L12 22.5l-2.1-1.9-2.8.7-1.1-2.6-2.6-1.1.7-2.8L2.2 12l1.9-2.1-.7-2.8 2.6-1.1 1.1-2.6 2.8.7L12 1.5z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M8.2 12.3l2.4 2.4 5.2-5.2"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
