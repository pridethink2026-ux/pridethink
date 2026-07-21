import React from "react";
import { useLanguage } from "./LanguageContext";
import { LANGUAGE_OPTIONS, getGenderOptions, getCountryName, calculateAge } from "./profileFields";

/*
  ProfileAbout
  ------------
  Sección "Acerca de" con los datos personales del registro (nombre
  completo, género, país, idioma, fecha de nacimiento), reutilizada tanto
  en tu propio perfil (`AuthProfile.jsx` -> `ProfileView`) como en el
  perfil público de cualquier otra persona (`UserProfile.jsx`) — mismo
  componente, misma lógica, para no mostrar cosas distintas en cada lado.

  Cada campo se muestra SOLO si tiene valor: cuentas creadas antes de que
  existieran estos campos (o editadas solo por el flujo viejo de
  identidad) pueden no tenerlos, y no tiene sentido mostrar una fila vacía.

  La fecha de nacimiento se guarda como Timestamp de Firestore y nunca se
  guarda la edad calculada: se calcula al vuelo con calculateAge() al
  renderizar (mismo principio que los demás conteos derivados de la app).

  Quién puede VER esta sección ya lo decide quien llama: UserProfile.jsx
  no llega a renderizar este componente si hay bloqueo (corta antes, con
  la pantalla "No puedes ver este perfil"). El muro privado (isWallPrivate)
  NO afecta esta sección — solo oculta la lista de publicaciones, la info
  de perfil se sigue mostrando igual.
*/

const styles = {
  sectionTitle: {
    fontSize: "13px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 700,
    fontFamily: "var(--font-display)",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    margin: "24px 0 10px",
    display: "inline-block",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: "14px",
  },
  label: { color: "var(--text-muted)", flexShrink: 0 },
  value: { fontWeight: 500, textAlign: "right" },
};

function formatBirthDate(birthDate, language, t) {
  if (!birthDate?.toDate) return null;
  const date = birthDate.toDate();
  const locale = language === "en" ? "en-US" : "es-ES";
  const formatted = date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const age = calculateAge(date);
  return age === null ? formatted : t("profile.birthDateWithAge", { date: formatted, age });
}

export default function ProfileAbout({ profileUser }) {
  const { language, t } = useLanguage();
  if (!profileUser) return null;

  const genderLabel =
    profileUser.gender === "otro"
      ? profileUser.genderOther
      : getGenderOptions(t).find((g) => g.value === profileUser.gender)?.label;

  const countryName = getCountryName(profileUser.country, language);
  const languageName = LANGUAGE_OPTIONS.find((l) => l.value === profileUser.language)?.label;
  const birthDateText = formatBirthDate(profileUser.birthDate, language, t);

  const fields = [
    profileUser.fullName && { label: t("profile.fullNameField"), value: profileUser.fullName },
    genderLabel && { label: t("profile.genderField"), value: genderLabel },
    countryName && { label: t("profile.countryField"), value: countryName },
    languageName && { label: t("profile.languageField"), value: languageName },
    birthDateText && { label: t("profile.birthDateField"), value: birthDateText },
  ].filter(Boolean);

  if (fields.length === 0) return null;

  return (
    <div>
      <p style={styles.sectionTitle}>{t("profile.about")}</p>
      {fields.map((f) => (
        <div key={f.label} style={styles.row}>
          <span style={styles.label}>{f.label}</span>
          <span style={styles.value}>{f.value}</span>
        </div>
      ))}
    </div>
  );
}
