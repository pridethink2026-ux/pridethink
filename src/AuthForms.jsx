import React, { useState } from "react";
import { useLanguage } from "./LanguageContext";

/*
  AuthForms
  ---------
  Lo que comparten la pantalla de entrada (AuthScreen.jsx: registro) y el
  perfil (AuthProfile.jsx: editar identidad): los estilos de las tarjetas
  y el formulario de identidad. Vive aparte para que la pantalla de
  entrada no tenga que importar el perfil (que trae el muro, las fotos,
  etc.).
*/

// Sugerencias de identidad: se muestran traducidas (son solo ideas para
// inspirar, parte de la interfaz), pero una vez que alguien toca una, ESE
// texto (en el idioma que se le mostró) pasa a ser su identidad libre —
// contenido suyo desde ese momento, ya no se vuelve a traducir.
function getIdentitySuggestions(t) {
  return [
    t("identity.suggestion.cat"),
    t("identity.suggestion.squirrel"),
    t("identity.suggestion.free"),
    t("identity.suggestion.king"),
    t("identity.suggestion.queen"),
    t("identity.suggestion.creator"),
    t("identity.suggestion.fox"),
    t("identity.suggestion.phoenix"),
  ];
}

export const authStyles = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "var(--font-body)",
    color: "var(--text)",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "var(--surface)",
    borderRadius: "24px",
    border: "1px solid var(--border)",
    boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
    padding: "34px 28px",
    boxSizing: "border-box",
  },
  logo: {
    display: "block",
    width: "72px",
    height: "72px",
    borderRadius: "18px",
    margin: "0 auto 20px",
  },
  eyebrow: {
    fontSize: "12px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--accent2)",
    fontWeight: 500,
    margin: "0 0 8px",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "26px",
    fontWeight: 700,
    margin: "0 0 4px",
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: "14px",
    color: "var(--text-muted)",
    margin: "0 0 28px",
    lineHeight: 1.5,
  },
  label: {
    display: "block",
    fontSize: "13px",
    color: "var(--text-muted)",
    margin: "0 0 6px",
    fontWeight: 500,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "15px",
    color: "var(--text)",
    marginBottom: "18px",
    outline: "none",
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "15px",
    color: "var(--text)",
    marginBottom: "18px",
    outline: "none",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "15px",
    color: "var(--text)",
    marginBottom: "4px",
    outline: "none",
    resize: "none",
    minHeight: "70px",
    fontFamily: "inherit",
  },
  // backLink/link/forgotLink van en <button type="button"> (antes <span>
  // con onClick, sin teclado ni lector de pantalla): sin fondo, borde ni
  // relleno, con la fuente del texto que los rodea.
  backLink: {
    display: "block",
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    color: "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    margin: "0 0 14px",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    marginBottom: "20px",
  },
  checkboxInput: {
    width: "18px",
    height: "18px",
    marginTop: "2px",
    flexShrink: 0,
    accentColor: "var(--accent2)",
    cursor: "pointer",
  },
  checkboxLabel: {
    fontSize: "13px",
    color: "var(--text-muted)",
    lineHeight: 1.4,
    cursor: "pointer",
  },
  button: {
    width: "100%",
    padding: "13px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "6px",
  },
  buttonGhost: {
    width: "100%",
    padding: "11px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    marginTop: "10px",
  },
  switchRow: {
    textAlign: "center",
    fontSize: "13px",
    color: "var(--text-muted)",
    marginTop: "18px",
  },
  link: {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    color: "var(--accent2)",
    cursor: "pointer",
    fontWeight: 500,
  },
  forgotLink: {
    display: "block",
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    color: "var(--text-muted)",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    margin: "-10px 0 18px auto",
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "20px",
  },
  chip: (active) => ({
    padding: "7px 14px",
    borderRadius: "999px",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--accent2-soft)" : "var(--surface-alt)",
    color: active ? "var(--accent2)" : "var(--text-muted)",
    fontFamily: "inherit",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    userSelect: "none",
  }),
  error: {
    background: "var(--accent2-softer)",
    border: "1px solid var(--accent2-soft-border)",
    color: "var(--accent2)",
    fontSize: "13px",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "16px",
  },
  success: {
    background: "var(--accent-softer)",
    border: "1px solid var(--accent-soft-border)",
    color: "var(--accent)",
    fontSize: "13px",
    lineHeight: 1.5,
    borderRadius: "8px",
    padding: "12px 14px",
    marginBottom: "16px",
  },
  profileHeader: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    marginBottom: "18px",
  },
  photoUploaderRow: {
    marginBottom: "18px",
  },
  tabsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "18px",
  },
  tabBtn: (active) => ({
    padding: "7px 16px",
    borderRadius: "999px",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--accent2-soft)" : "transparent",
    color: active ? "var(--accent2)" : "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  }),
  bioText: {
    fontSize: "13px",
    color: "var(--text)",
    lineHeight: 1.4,
    margin: "6px 0 0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  bioCounter: {
    fontSize: "11px",
    color: "var(--text-muted)",
    textAlign: "right",
    margin: "0 0 18px",
  },
  countsRow: {
    display: "flex",
    gap: "28px",
    marginBottom: "24px",
  },
  countItem: { cursor: "pointer" },
  countNumber: { fontSize: "16px", fontWeight: 700, margin: 0 },
  countLabel: { fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" },
  fieldRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: "14px",
  },
  fieldLabel: { color: "var(--text-muted)" },
  fieldValue: { fontWeight: 500 },
  privacyRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 0",
    borderBottom: "1px solid var(--border)",
  },
  privacyText: { fontSize: "13px" },
  privacyHint: { fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 0" },
  toggle: (on) => ({
    width: "44px",
    height: "24px",
    borderRadius: "999px",
    background: on ? "var(--accent2)" : "var(--surface-alt)",
    border: `1px solid ${on ? "var(--accent2)" : "var(--border)"}`,
    position: "relative",
    boxSizing: "content-box",
    padding: 0,
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.15s",
  }),
  toggleDot: (on) => ({
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "#fff",
    position: "absolute",
    top: "2px",
    left: on ? "23px" : "2px",
    transition: "left 0.15s",
  }),
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
  blockedEmpty: {
    fontSize: "13px",
    color: "var(--text-muted)",
    margin: "0 0 4px",
  },
  blockedRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
  },
  blockedInfo: { flex: 1, minWidth: 0 },
  blockedName: { fontSize: "13px", fontWeight: 600, margin: 0 },
  blockedIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: "1px 0 0" },
  unblockBtn: {
    padding: "6px 14px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
};

const styles = authStyles;

export function IdentityForm({ onSubmit, loading, initialValues, isEdit, error }) {
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState(initialValues?.displayName || "");
  const [identity, setIdentity] = useState(initialValues?.identity || "");
  const [bio, setBio] = useState(initialValues?.bio || "");
  const [datingPreference, setDatingPreference] = useState(initialValues?.datingPreference || "");
  const [validationError, setValidationError] = useState("");
  const suggestions = getIdentitySuggestions(t);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Antes este chequeo cortaba en silencio, sin ningún aviso: "identity"
    // tiene el atributo HTML "required", pero eso solo exige que el campo
    // no esté vacío, no que tenga contenido real — un valor de solo
    // espacios pasa la validación nativa del navegador igual, y después
    // .trim() lo trata como vacío acá. Ahora se avisa en vez de no hacer
    // nada (bug reportado en producción, 2026-07-28).
    if (!identity.trim()) {
      setValidationError(t("identity.emptyIdentity"));
      return;
    }
    setValidationError("");
    onSubmit({
      displayName: displayName.trim() || "Sin nombre",
      identity: identity.trim(),
      bio: bio.trim(),
      datingPreference: datingPreference.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={styles.eyebrow}>
        {isEdit ? t("identity.eyebrowEdit") : t("identity.eyebrowSignupStep3")}
      </p>
      <h1 style={styles.title}>{isEdit ? t("identity.titleEdit") : t("identity.titleSignup")}</h1>
      <p style={styles.subtitle}>
        {isEdit ? t("identity.subtitleEdit") : t("identity.subtitleSignup")}
      </p>
      {(validationError || error) && (
        <div role="alert" style={styles.error}>{validationError || error}</div>
      )}

      <label style={styles.label} htmlFor="displayName">
        {t("identity.displayNameLabel")}
      </label>
      <input
        id="displayName"
        style={styles.input}
        type="text"
        placeholder={t("identity.displayNamePlaceholder")}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <label style={styles.label} htmlFor="identity">
        {t("identity.identityLabel")} {isEdit ? t("identity.identityLabelToday") : ""}
      </label>
      <input
        id="identity"
        style={styles.input}
        type="text"
        placeholder={t("identity.identityPlaceholder")}
        value={identity}
        onChange={(e) => setIdentity(e.target.value)}
        required
        autoFocus={isEdit}
      />

      <div style={styles.chipRow}>
        {suggestions.map((s) => (
          <button
            type="button"
            key={s}
            style={styles.chip(identity === s)}
            aria-pressed={identity === s}
            onClick={() => setIdentity(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <label style={styles.label} htmlFor="bio">
        {t("identity.bioLabel")}
      </label>
      <textarea
        id="bio"
        style={styles.textarea}
        placeholder={t("identity.bioPlaceholder")}
        value={bio}
        onChange={(e) => setBio(e.target.value.slice(0, 150))}
        maxLength={150}
      />
      <p style={styles.bioCounter}>{bio.length}/150</p>

      <label style={styles.label} htmlFor="datingPreference">
        {t("identity.datingPreferenceLabel")}
      </label>
      <input
        id="datingPreference"
        style={styles.input}
        type="text"
        placeholder={t("identity.datingPreferencePlaceholder")}
        value={datingPreference}
        onChange={(e) => setDatingPreference(e.target.value)}
      />

      <button type="submit" style={styles.button} disabled={loading}>
        {loading
          ? t("identity.submitSaving")
          : isEdit
          ? t("identity.submitUpdate")
          : t("identity.submitSave")}
      </button>
    </form>
  );
}
