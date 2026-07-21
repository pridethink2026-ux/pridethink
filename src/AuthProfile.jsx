import React, { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  arrayRemove,
  collection,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";
import FollowListModal from "./FollowListModal";

/*
  AuthProfile
  -----------
  Flujo: Login/Registro -> Elegir identidad libre -> Perfil guardado.

  YA CONECTADO A FIREBASE (Auth + Firestore reales):
  - Auth real -> createUserWithEmailAndPassword / signInWithEmailAndPassword
  - Firestore write -> setDoc(doc(db, "users", uid), perfil)
  - Firestore read  -> getDoc(doc(db, "users", uid))

  Ahora los datos SÍ persisten al recargar la página, y dos personas
  distintas (tú y tu socio) ven la misma base de datos real.
*/

const IDENTITY_SUGGESTIONS = [
  "Gato",
  "Ardilla",
  "Libre",
  "Rey",
  "Reina",
  "Creador",
  "Zorro",
  "Fenix",
];

const MIN_SIGNUP_AGE = 18;

// Códigos ISO 3166-1 alpha-2 de países. Los nombres en español se generan
// con Intl.DisplayNames (ver getCountryOptions), así que agregar un país
// nuevo es tan simple como sumar su código acá; no hay que escribir el
// nombre a mano ni mantenerlo traducido.
const COUNTRY_CODES = [
  // América
  "AR", "BO", "BR", "CA", "CL", "CO", "CR", "CU", "DO", "EC", "SV", "US",
  "GT", "GY", "HT", "HN", "JM", "MX", "NI", "PA", "PY", "PE", "PR", "SR",
  "TT", "UY", "VE", "AG", "BS", "BB", "BZ", "DM", "GD", "KN", "LC", "VC",
  // Europa
  "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE",
  "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI", "LT",
  "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU",
  "SM", "RS", "SK", "SI", "ES", "SE", "CH", "UA", "GB", "VA",
  // África
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG",
  "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN",
  "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ",
  "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD",
  "TZ", "TG", "TN", "UG", "ZM", "ZW",
  // Asia y Medio Oriente
  "AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CN", "GE", "IN", "ID",
  "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MY", "MV",
  "MN", "MM", "NP", "KP", "OM", "PK", "PS", "PH", "QA", "SA", "SG", "KR",
  "LK", "SY", "TW", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ", "VN", "YE",
  "HK", "MO",
  // Oceanía
  "AU", "FJ", "KI", "MH", "FM", "NR", "NZ", "PW", "PG", "WS", "SB", "TO",
  "TV", "VU",
];

// Convierte los códigos de arriba en { code, name } en español, ordenados
// alfabéticamente por nombre. Si el navegador no soporta Intl.DisplayNames
// (muy poco probable hoy), cae a mostrar el código tal cual.
function getCountryOptions() {
  let displayNames = null;
  try {
    displayNames = new Intl.DisplayNames(["es"], { type: "region" });
  } catch {
    displayNames = null;
  }
  return COUNTRY_CODES.map((code) => ({
    code,
    name: displayNames ? displayNames.of(code) || code : code,
  })).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

const COUNTRY_OPTIONS = getCountryOptions();

const LANGUAGE_OPTIONS = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

// Idioma por defecto según el navegador: si no reporta explícitamente
// inglés, se queda en español (el idioma principal de la app).
function detectDefaultLanguage() {
  const nav =
    (typeof navigator !== "undefined" &&
      (navigator.language || (navigator.languages && navigator.languages[0]))) ||
    "";
  return nav.toLowerCase().startsWith("en") ? "en" : "es";
}

const GENDER_OPTIONS = [
  { value: "mujer", label: "Mujer" },
  { value: "hombre", label: "Hombre" },
  { value: "no_binario", label: "No binario" },
  { value: "prefiero_no_decir", label: "Prefiero no decir" },
  { value: "otro", label: "Otro" },
];

// Edad exacta (no solo restar años) a partir de una fecha "YYYY-MM-DD":
// solo cuenta el cumpleaños de este año si ya pasó (o es hoy).
function calculateAge(birthDateStr) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const yaCumplioEsteAno =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!yaCumplioEsteAno) age -= 1;
  return age;
}

const styles = {
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
  backLink: {
    display: "inline-block",
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
    color: "var(--accent2)",
    cursor: "pointer",
    fontWeight: 500,
  },
  forgotLink: {
    display: "block",
    textAlign: "right",
    color: "var(--text-muted)",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    margin: "-10px 0 18px",
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

function LoginForm({ onSubmit, mode, setMode, error, loading, onForgotPassword, initialValues }) {
  const [email, setEmail] = useState(initialValues?.email || "");
  const [password, setPassword] = useState(initialValues?.password || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ email, password });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={styles.eyebrow}>
        {mode === "login" ? "Bienvenido de vuelta" : "Paso 1 de 3"}
      </p>
      <h1 style={styles.title}>
        {mode === "login" ? "Entra a tu espacio" : "Sé lo que quieras ser"}
      </h1>
      <p style={styles.subtitle}>
        {mode === "login"
          ? "Ingresa con tu correo y contraseña."
          : "Sin cajas, sin etiquetas impuestas. Empieza creando tu cuenta."}
      </p>

      {error && <div style={styles.error}>{error}</div>}

      <label style={styles.label} htmlFor="email">
        Correo
      </label>
      <input
        id="email"
        style={styles.input}
        type="email"
        placeholder="nombre@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label style={styles.label} htmlFor="password">
        Contraseña
      </label>
      <input
        id="password"
        style={styles.input}
        type="password"
        placeholder="Mínimo 6 caracteres"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={6}
        required
      />

      {mode === "login" && (
        <span
          style={styles.forgotLink}
          onClick={() => onForgotPassword(email)}
        >
          ¿Olvidaste tu contraseña?
        </span>
      )}

      <button type="submit" style={styles.button} disabled={loading}>
        {loading ? "Un momento..." : mode === "login" ? "Entrar" : "Crear cuenta"}
      </button>

      <p style={styles.switchRow}>
        {mode === "login" ? (
          <>
            ¿No tienes cuenta?{" "}
            <span style={styles.link} onClick={() => setMode("signup")}>
              Regístrate
            </span>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <span style={styles.link} onClick={() => setMode("login")}>
              Entra
            </span>
          </>
        )}
      </p>
    </form>
  );
}

function ResetPasswordForm({ initialEmail, onBack }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(traducirErrorReset(err.code));
    }
  };

  return (
    <div>
      <p style={styles.eyebrow}>Recuperar acceso</p>
      <h1 style={styles.title}>¿Olvidaste tu contraseña?</h1>
      <p style={styles.subtitle}>
        Escribe el correo con el que te registraste. Te mandaremos un enlace
        para crear una contraseña nueva.
      </p>

      {status === "sent" ? (
        <div style={styles.success}>
          Te enviamos un correo para restablecer tu contraseña, revisa
          también spam.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {status === "error" && <div style={styles.error}>{errorMsg}</div>}

          <label style={styles.label} htmlFor="resetEmail">
            Correo
          </label>
          <input
            id="resetEmail"
            style={styles.input}
            type="email"
            placeholder="nombre@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <button type="submit" style={styles.button} disabled={status === "sending"}>
            {status === "sending" ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>
      )}

      <p style={styles.switchRow}>
        <span style={styles.link} onClick={onBack}>
          ← Volver a entrar
        </span>
      </p>
    </div>
  );
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

function PersonalDataForm({ onSubmit, onBack, loading, error }) {
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState(detectDefaultLanguage());
  const [gender, setGender] = useState("");
  const [genderOther, setGenderOther] = useState("");
  const [accepted, setAccepted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      fullName: fullName.trim(),
      birthDate,
      country,
      language,
      gender,
      genderOther: gender === "otro" ? genderOther.trim() : "",
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <span style={styles.backLink} onClick={onBack}>
        ← Atrás
      </span>
      <p style={styles.eyebrow}>Paso 2 de 3</p>
      <h1 style={styles.title}>Cuéntanos un poco de ti</h1>
      <p style={styles.subtitle}>
        Estos datos nos ayudan a mantener Pridethink como un espacio seguro.
        Tu identidad libre la eliges en el siguiente paso.
      </p>

      {error && <div style={styles.error}>{error}</div>}

      <label style={styles.label} htmlFor="fullName">
        Nombre completo
      </label>
      <input
        id="fullName"
        style={styles.input}
        type="text"
        placeholder="Tu nombre y apellido"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />

      <label style={styles.label} htmlFor="birthDate">
        Fecha de nacimiento
      </label>
      <input
        id="birthDate"
        style={styles.input}
        type="date"
        value={birthDate}
        max={TODAY_ISO}
        onChange={(e) => setBirthDate(e.target.value)}
        required
      />

      <label style={styles.label} htmlFor="country">
        País
      </label>
      <select
        id="country"
        style={styles.select}
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        required
      >
        <option value="" disabled>
          Selecciona tu país
        </option>
        {COUNTRY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>

      <label style={styles.label} htmlFor="language">
        Idioma preferido
      </label>
      <select
        id="language"
        style={styles.select}
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        required
      >
        {LANGUAGE_OPTIONS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>

      <label style={styles.label} htmlFor="gender">
        Género
      </label>
      <select
        id="gender"
        style={styles.select}
        value={gender}
        onChange={(e) => setGender(e.target.value)}
        required
      >
        <option value="" disabled>
          Selecciona una opción
        </option>
        {GENDER_OPTIONS.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>

      {gender === "otro" && (
        <>
          <label style={styles.label} htmlFor="genderOther">
            Cuéntanos cuál
          </label>
          <input
            id="genderOther"
            style={styles.input}
            type="text"
            placeholder="Escribe tu género"
            value={genderOther}
            onChange={(e) => setGenderOther(e.target.value)}
            required
          />
        </>
      )}

      <div style={styles.checkboxRow}>
        <input
          id="acceptedTerms"
          style={styles.checkboxInput}
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          required
        />
        <label style={styles.checkboxLabel} htmlFor="acceptedTerms">
          Acepto que soy mayor de 18 años y los términos de uso de Pridethink.
        </label>
      </div>

      <button type="submit" style={styles.button} disabled={loading}>
        {loading ? "Un momento..." : "Continuar"}
      </button>
    </form>
  );
}

function IdentityForm({ onSubmit, loading, initialValues, isEdit }) {
  const [displayName, setDisplayName] = useState(initialValues?.displayName || "");
  const [identity, setIdentity] = useState(initialValues?.identity || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!identity.trim()) return;
    onSubmit({ displayName: displayName.trim() || "Sin nombre", identity: identity.trim() });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={styles.eyebrow}>{isEdit ? "Tu identidad de hoy" : "Paso 3 de 3"}</p>
      <h1 style={styles.title}>{isEdit ? "¿Cómo te sientes hoy?" : "¿Qué eres tú?"}</h1>
      <p style={styles.subtitle}>
        {isEdit
          ? "Cámbiala cuantas veces quieras, cuando quieras. Hoy puedes ser algo distinto a ayer."
          : "No elijas una casilla. Escribe lo que sientes que eres — puede ser una de estas ideas o algo completamente tuyo."}
      </p>

      <label style={styles.label} htmlFor="displayName">
        Nombre para mostrar
      </label>
      <input
        id="displayName"
        style={styles.input}
        type="text"
        placeholder="Como quieres que te vean"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <label style={styles.label} htmlFor="identity">
        Tu identidad {isEdit ? "de hoy" : ""}
      </label>
      <input
        id="identity"
        style={styles.input}
        type="text"
        placeholder="Escribe lo que eres..."
        value={identity}
        onChange={(e) => setIdentity(e.target.value)}
        required
        autoFocus={isEdit}
      />

      <div style={styles.chipRow}>
        {IDENTITY_SUGGESTIONS.map((s) => (
          <span
            key={s}
            style={styles.chip(identity === s)}
            onClick={() => setIdentity(s)}
          >
            {s}
          </span>
        ))}
      </div>

      <button type="submit" style={styles.button} disabled={loading}>
        {loading ? "Guardando..." : isEdit ? "Actualizar mi identidad" : "Guardar mi identidad"}
      </button>
    </form>
  );
}

function BlockedUserRow({ uid, onUnblock }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      setProfile(snap.exists() ? snap.data() : null);
    });
    return unsub;
  }, [uid]);

  return (
    <div style={styles.blockedRow}>
      <Avatar
        uid={uid}
        name={profile?.displayName || profile?.identity}
        identity={profile?.identity}
        size="sm"
      />
      <div style={styles.blockedInfo}>
        <p style={styles.blockedName}>{profile?.displayName || "Usuario"}</p>
        <p style={styles.blockedIdentity}>{profile?.identity}</p>
      </div>
      <button style={styles.unblockBtn} onClick={() => onUnblock(uid)}>
        Desbloquear
      </button>
    </div>
  );
}

function ProfileView({ user, uid, onLogout, onEdit, onTogglePrivacy, onUnblock, onOpenProfile }) {
  const blockedUsers = user.blockedUsers || [];
  const [followersCount, setFollowersCount] = useState(0);
  const [followModal, setFollowModal] = useState(null); // null | "followers" | "following"
  const followingCount = (user.following || []).length;

  // Seguidores = usuarios cuyo campo "following" contiene tu uid (en tiempo real)
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "users"), where("following", "array-contains", uid));
    const unsub = onSnapshot(q, (snap) => setFollowersCount(snap.size));
    return unsub;
  }, [uid]);

  return (
    <div>
      <div style={styles.profileHeader}>
        <Avatar
          uid={uid}
          name={user.displayName || user.identity}
          identity={user.identity}
          size="lg"
        />
        <div>
          <h1 style={{ ...styles.title, fontSize: "20px", margin: 0 }}>
            {user.displayName}
          </h1>
          <p style={{ ...styles.subtitle, margin: 0 }}>{user.identity}</p>
        </div>
      </div>

      <div style={styles.countsRow}>
        <div style={styles.countItem} onClick={() => setFollowModal("followers")}>
          <p style={styles.countNumber}>{followersCount}</p>
          <p style={styles.countLabel}>Seguidores</p>
        </div>
        <div style={styles.countItem} onClick={() => setFollowModal("following")}>
          <p style={styles.countNumber}>{followingCount}</p>
          <p style={styles.countLabel}>Siguiendo</p>
        </div>
      </div>

      {followModal && (
        <FollowListModal
          mode={followModal}
          targetUid={uid}
          currentUid={uid}
          myProfile={user}
          onClose={() => setFollowModal(null)}
          onOpenProfile={onOpenProfile}
        />
      )}

      <div style={{ marginBottom: "24px" }}>
        <div style={styles.fieldRow}>
          <span style={styles.fieldLabel}>Correo</span>
          <span style={styles.fieldValue}>{user.email}</span>
        </div>
        <div style={styles.fieldRow}>
          <span style={styles.fieldLabel}>Identidad</span>
          <span style={styles.fieldValue}>{user.identity}</span>
        </div>
        {user.identityUpdatedAt && (
          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>Última actualización</span>
            <span style={styles.fieldValue}>{user.identityUpdatedAt}</span>
          </div>
        )}
        <div style={styles.fieldRow}>
          <span style={styles.fieldLabel}>Miembro desde</span>
          <span style={styles.fieldValue}>{user.joinedAt}</span>
        </div>

        <div style={styles.privacyRow}>
          <div>
            <p style={{ ...styles.privacyText, margin: 0, fontWeight: 600 }}>
              Perfil privado
            </p>
            <p style={styles.privacyHint}>
              {user.isPrivate
                ? "No apareces en el chat ni tus publicaciones son visibles para otros."
                : "Apareces en el chat y tus publicaciones son públicas."}
            </p>
          </div>
          <div
            style={styles.toggle(!!user.isPrivate)}
            onClick={() => onTogglePrivacy(!user.isPrivate)}
          >
            <div style={styles.toggleDot(!!user.isPrivate)} />
          </div>
        </div>
      </div>

      <p style={styles.sectionTitle}>Usuarios bloqueados</p>
      {blockedUsers.length === 0 ? (
        <p style={styles.blockedEmpty}>No has bloqueado a nadie.</p>
      ) : (
        blockedUsers.map((buid) => (
          <BlockedUserRow key={buid} uid={buid} onUnblock={onUnblock} />
        ))
      )}

      <button style={{ ...styles.buttonGhost, marginTop: "20px" }} onClick={onEdit}>
        Cambiar mi identidad
      </button>
      <button
        style={{ ...styles.buttonGhost, marginTop: "10px" }}
        onClick={onLogout}
      >
        Cerrar sesión
      </button>
    </div>
  );
}

export default function AuthProfile({ onOpenProfile }) {
  // login | signup | signupPersonal | identity | profile | reset
  const [step, setStep] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingUid, setPendingUid] = useState(null);
  const [user, setUser] = useState(null);
  const [resetEmailPrefill, setResetEmailPrefill] = useState("");
  // Datos de registro que se van juntando entre los pasos "Cuenta" y "Datos
  // personales" ANTES de crear nada en Firebase, para poder bloquear el
  // registro completo (ni cuenta de Auth ni documento en Firestore) si la
  // persona resulta ser menor de edad.
  const [signupDraft, setSignupDraft] = useState({});

  // Al cargar la página, revisa si Firebase ya tiene una sesión activa guardada.
  // Si la hay, salta directo al perfil (o a "identity" si aún no tiene perfil).
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (snap.exists()) {
          setUser(snap.data());
          setStep("profile");
        } else {
          setPendingUid(firebaseUser.uid);
          setStep("identity");
        }
      }
      setCheckingSession(false);
    });
    return unsub;
  }, []);

  const handleAuthSubmit = async ({ email, password }) => {
    setError("");
    if (step === "signup") {
      // Todavía NO se toca Firebase acá: solo se guarda el borrador y se
      // pasa al paso de datos personales, donde se verifica la edad ANTES
      // de crear la cuenta de verdad (ver handlePersonalSubmit).
      setSignupDraft({ email, password });
      setStep("signupPersonal");
      return;
    }
    setLoading(true);
    try {
      // FIREBASE: auth (real) - inicia sesión con Firebase Authentication
      const cred = await signInWithEmailAndPassword(auth, email, password);

      // FIREBASE: firestore read (real) - revisa si ya tiene perfil guardado
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      if (snap.exists()) {
        setUser(snap.data());
        setStep("profile");
      } else {
        setPendingUid(cred.user.uid);
        setStep("identity");
      }
    } catch (err) {
      setError(traducirErrorFirebase(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = (emailTyped) => {
    setResetEmailPrefill(emailTyped || "");
    setError("");
    setStep("reset");
  };

  // Paso "Datos personales": valida la edad ANTES de crear cualquier cosa
  // en Firebase. Si es menor de edad, bloquea acá mismo y no llega a
  // createUserWithEmailAndPassword ni a Firestore.
  const handlePersonalSubmit = async (personalData) => {
    setError("");
    const age = calculateAge(personalData.birthDate);
    if (age === null) {
      setError("Ingresa una fecha de nacimiento válida.");
      return;
    }
    if (age < MIN_SIGNUP_AGE) {
      setError("Debes ser mayor de 18 años para crear una cuenta en Pridethink.");
      return;
    }

    setLoading(true);
    try {
      // FIREBASE: auth (real) - recién ahora se crea la cuenta, ya
      // confirmada la mayoría de edad
      const cred = await createUserWithEmailAndPassword(
        auth,
        signupDraft.email,
        signupDraft.password
      );
      setPendingUid(cred.user.uid);
      setSignupDraft((prev) => ({ ...prev, ...personalData }));
      setStep("identity");
    } catch (err) {
      setError(traducirErrorFirebase(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleIdentitySubmit = async ({ displayName, identity }) => {
    setLoading(true);
    setError("");
    const uid = pendingUid || auth.currentUser?.uid;
    const isNewSignup = !user;

    // En un registro nuevo se guardan también los datos personales
    // juntados en los pasos anteriores. Al EDITAR (isNewSignup === false)
    // no se reenvían: con merge:true, no tocarlos deja intactos los que ya
    // están guardados en Firestore (país, fecha de nacimiento, etc.).
    const personalFields = isNewSignup
      ? {
          email: auth.currentUser?.email || signupDraft.email || "",
          fullName: signupDraft.fullName || "",
          birthDate: signupDraft.birthDate
            ? Timestamp.fromDate(new Date(signupDraft.birthDate))
            : null,
          country: signupDraft.country || "",
          language: signupDraft.language || "es",
          gender: signupDraft.gender || "",
          genderOther: signupDraft.gender === "otro" ? signupDraft.genderOther || "" : "",
          isPrivate: false,
          blockedUsers: [],
          following: [],
          joinedAt: new Date().toLocaleDateString("es-ES", {
            year: "numeric",
            month: "long",
          }),
        }
      : {};

    const profileUpdate = {
      ...personalFields,
      displayName,
      identity,
      identityUpdatedAt: new Date().toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    };

    try {
      // FIREBASE: firestore write (real) - guarda el perfil en Firestore
      await setDoc(doc(db, "users", uid), profileUpdate, { merge: true });
      setUser({ ...(user || {}), ...profileUpdate });
      setSignupDraft({});
      setStep("profile");
    } catch (err) {
      setError("No se pudo guardar tu perfil. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePrivacy = async (newValue) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const updated = { ...user, isPrivate: newValue };
    setUser(updated);
    try {
      // FIREBASE: firestore write (real) - guarda la preferencia de privacidad
      await setDoc(doc(db, "users", uid), updated, { merge: true });
    } catch (err) {
      setUser(user); // revierte si falla
    }
  };

  const handleUnblock = async (targetUid) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const updated = {
      ...user,
      blockedUsers: (user?.blockedUsers || []).filter((u) => u !== targetUid),
    };
    setUser(updated);
    try {
      // FIREBASE: firestore write (real) - quita al usuario de blockedUsers
      await updateDoc(doc(db, "users", uid), { blockedUsers: arrayRemove(targetUid) });
    } catch (err) {
      setUser(user); // revierte si falla
    }
  };

  const handleLogout = async () => {
    // FIREBASE: auth (real) - cierra la sesión
    await signOut(auth);
    setUser(null);
    setPendingUid(null);
    setSignupDraft({});
    setStep("login");
    setError("");
  };

  if (checkingSession) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, textAlign: "center", color: "var(--text-muted)" }}>
          Cargando...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {(step === "login" || step === "signup") && (
          <>
            <img src="/logo-icon.png" alt="Pridethink" style={styles.logo} />
            <LoginForm
              mode={step}
              setMode={setStep}
              onSubmit={handleAuthSubmit}
              error={error}
              loading={loading}
              onForgotPassword={handleForgotPassword}
              initialValues={step === "signup" ? signupDraft : undefined}
            />
          </>
        )}
        {step === "reset" && (
          <>
            <img src="/logo-icon.png" alt="Pridethink" style={styles.logo} />
            <ResetPasswordForm
              initialEmail={resetEmailPrefill}
              onBack={() => setStep("login")}
            />
          </>
        )}
        {step === "signupPersonal" && (
          <PersonalDataForm
            onSubmit={handlePersonalSubmit}
            onBack={() => {
              setError("");
              setStep("signup");
            }}
            loading={loading}
            error={error}
          />
        )}
        {step === "identity" && (
          <IdentityForm
            onSubmit={handleIdentitySubmit}
            loading={loading}
            initialValues={user}
            isEdit={!!user}
          />
        )}
        {step === "profile" && user && (
          <ProfileView
            user={user}
            uid={auth.currentUser?.uid}
            onLogout={handleLogout}
            onEdit={() => setStep("identity")}
            onTogglePrivacy={handleTogglePrivacy}
            onUnblock={handleUnblock}
            onOpenProfile={onOpenProfile}
          />
        )}
      </div>
    </div>
  );
}

// Traduce los códigos de error de Firebase a mensajes entendibles en español
function traducirErrorFirebase(code) {
  const mensajes = {
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo.",
    "auth/invalid-email": "El correo no es válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/user-not-found": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento e intenta de nuevo.",
  };
  return mensajes[code] || "Ocurrió un error. Intenta de nuevo.";
}

// Traduce los códigos de error de sendPasswordResetEmail a español
function traducirErrorReset(code) {
  const mensajes = {
    "auth/invalid-email": "Ese correo no tiene un formato válido.",
    "auth/missing-email": "Escribe tu correo para poder enviarte el enlace.",
    "auth/user-not-found": "No encontramos ninguna cuenta con ese correo.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento e intenta de nuevo.",
  };
  return mensajes[code] || "No se pudo enviar el correo. Intenta de nuevo.";
}
