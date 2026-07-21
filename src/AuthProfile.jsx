import React, { useState, useEffect, useMemo } from "react";
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
import ProfileAbout from "./ProfileAbout";
import VerifiedBadge from "./VerifiedBadge";
import { useLanguage } from "./LanguageContext";
import { MIN_SIGNUP_AGE, getCountryOptions, LANGUAGE_OPTIONS, getGenderOptions, calculateAge } from "./profileFields";
import { markOffline } from "./presence";

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
  const { t } = useLanguage();
  const [email, setEmail] = useState(initialValues?.email || "");
  const [password, setPassword] = useState(initialValues?.password || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ email, password });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={styles.eyebrow}>
        {mode === "login" ? t("login.eyebrowBack") : t("login.eyebrowSignupStep1")}
      </p>
      <h1 style={styles.title}>
        {mode === "login" ? t("login.titleLogin") : t("login.titleSignup")}
      </h1>
      <p style={styles.subtitle}>
        {mode === "login" ? t("login.subtitleLogin") : t("login.subtitleSignup")}
      </p>

      {error && <div style={styles.error}>{error}</div>}

      <label style={styles.label} htmlFor="email">
        {t("login.emailLabel")}
      </label>
      <input
        id="email"
        style={styles.input}
        type="email"
        placeholder={t("login.emailPlaceholder")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label style={styles.label} htmlFor="password">
        {t("login.passwordLabel")}
      </label>
      <input
        id="password"
        style={styles.input}
        type="password"
        placeholder={t("login.passwordPlaceholder")}
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
          {t("login.forgotPassword")}
        </span>
      )}

      <button type="submit" style={styles.button} disabled={loading}>
        {loading
          ? t("login.submitWait")
          : mode === "login"
          ? t("login.submitLogin")
          : t("login.submitSignup")}
      </button>

      <p style={styles.switchRow}>
        {mode === "login" ? (
          <>
            {t("login.noAccount")}{" "}
            <span style={styles.link} onClick={() => setMode("signup")}>
              {t("login.signupLink")}
            </span>
          </>
        ) : (
          <>
            {t("login.hasAccount")}{" "}
            <span style={styles.link} onClick={() => setMode("login")}>
              {t("login.loginLink")}
            </span>
          </>
        )}
      </p>
    </form>
  );
}

function ResetPasswordForm({ initialEmail, onBack }) {
  const { t } = useLanguage();
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
      setErrorMsg(traducirErrorReset(err.code, t));
    }
  };

  return (
    <div>
      <p style={styles.eyebrow}>{t("reset.eyebrow")}</p>
      <h1 style={styles.title}>{t("reset.title")}</h1>
      <p style={styles.subtitle}>{t("reset.subtitle")}</p>

      {status === "sent" ? (
        <div style={styles.success}>{t("reset.success")}</div>
      ) : (
        <form onSubmit={handleSubmit}>
          {status === "error" && <div style={styles.error}>{errorMsg}</div>}

          <label style={styles.label} htmlFor="resetEmail">
            {t("login.emailLabel")}
          </label>
          <input
            id="resetEmail"
            style={styles.input}
            type="email"
            placeholder={t("login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <button type="submit" style={styles.button} disabled={status === "sending"}>
            {status === "sending" ? t("reset.sending") : t("reset.submit")}
          </button>
        </form>
      )}

      <p style={styles.switchRow}>
        <span style={styles.link} onClick={onBack}>
          {t("reset.backLink")}
        </span>
      </p>
    </div>
  );
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

function PersonalDataForm({ onSubmit, onBack, loading, error }) {
  const { language, setLanguage, t } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState("");
  const [genderOther, setGenderOther] = useState("");
  const [accepted, setAccepted] = useState(false);

  // El selector de país e idioma usan directamente el idioma activo de la
  // interfaz (LanguageContext): elegir un idioma acá cambia la UI al
  // instante, y el valor ya queda listo para guardarse al terminar el
  // registro (ver handleSubmit).
  const countryOptions = useMemo(() => getCountryOptions(language), [language]);
  const genderOptions = getGenderOptions(t);

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
        {t("personal.back")}
      </span>
      <p style={styles.eyebrow}>{t("personal.eyebrow")}</p>
      <h1 style={styles.title}>{t("personal.title")}</h1>
      <p style={styles.subtitle}>{t("personal.subtitle")}</p>

      {error && <div style={styles.error}>{error}</div>}

      <label style={styles.label} htmlFor="fullName">
        {t("personal.fullNameLabel")}
      </label>
      <input
        id="fullName"
        style={styles.input}
        type="text"
        placeholder={t("personal.fullNamePlaceholder")}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />

      <label style={styles.label} htmlFor="birthDate">
        {t("personal.birthDateLabel")}
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
        {t("personal.countryLabel")}
      </label>
      <select
        id="country"
        style={styles.select}
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        required
      >
        <option value="" disabled>
          {t("personal.countryPlaceholder")}
        </option>
        {countryOptions.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>

      <label style={styles.label} htmlFor="language">
        {t("personal.languageLabel")}
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
        {t("personal.genderLabel")}
      </label>
      <select
        id="gender"
        style={styles.select}
        value={gender}
        onChange={(e) => setGender(e.target.value)}
        required
      >
        <option value="" disabled>
          {t("personal.genderPlaceholder")}
        </option>
        {genderOptions.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>

      {gender === "otro" && (
        <>
          <label style={styles.label} htmlFor="genderOther">
            {t("personal.genderOtherLabel")}
          </label>
          <input
            id="genderOther"
            style={styles.input}
            type="text"
            placeholder={t("personal.genderOtherPlaceholder")}
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
          {t("personal.termsCheckbox")}
        </label>
      </div>

      <button type="submit" style={styles.button} disabled={loading}>
        {loading ? t("personal.submitWait") : t("personal.submit")}
      </button>
    </form>
  );
}

function IdentityForm({ onSubmit, loading, initialValues, isEdit }) {
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState(initialValues?.displayName || "");
  const [identity, setIdentity] = useState(initialValues?.identity || "");
  const [bio, setBio] = useState(initialValues?.bio || "");
  const [datingPreference, setDatingPreference] = useState(initialValues?.datingPreference || "");
  const suggestions = getIdentitySuggestions(t);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!identity.trim()) return;
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
          <span
            key={s}
            style={styles.chip(identity === s)}
            onClick={() => setIdentity(s)}
          >
            {s}
          </span>
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

function BlockedUserRow({ uid, onUnblock }) {
  const { t } = useLanguage();
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
        <p style={styles.blockedName}>{profile?.displayName || t("profile.defaultUser")}</p>
        <p style={styles.blockedIdentity}>{profile?.identity}</p>
      </div>
      <button style={styles.unblockBtn} onClick={() => onUnblock(uid)}>
        {t("profile.unblock")}
      </button>
    </div>
  );
}

function ProfileView({
  user,
  uid,
  onLogout,
  onEdit,
  onTogglePrivacy,
  onToggleWallPrivacy,
  onUnblock,
  onOpenProfile,
  onOpenSaved,
}) {
  const { language, setLanguage, t } = useLanguage();
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
          <h1 style={{ ...styles.title, fontSize: "20px", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
            {user.displayName}
            {user.isVerified && <VerifiedBadge size="md" />}
          </h1>
          <p style={{ ...styles.subtitle, margin: 0 }}>{user.identity}</p>
          {user.bio && <p style={styles.bioText}>{user.bio}</p>}
        </div>
      </div>

      <div style={styles.countsRow}>
        <div style={styles.countItem} onClick={() => setFollowModal("followers")}>
          <p style={styles.countNumber}>{followersCount}</p>
          <p style={styles.countLabel}>{t("profile.followers")}</p>
        </div>
        <div style={styles.countItem} onClick={() => setFollowModal("following")}>
          <p style={styles.countNumber}>{followingCount}</p>
          <p style={styles.countLabel}>{t("profile.following")}</p>
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
          <span style={styles.fieldLabel}>{t("profile.emailField")}</span>
          <span style={styles.fieldValue}>{user.email}</span>
        </div>
        <div style={styles.fieldRow}>
          <span style={styles.fieldLabel}>{t("profile.identityField")}</span>
          <span style={styles.fieldValue}>{user.identity}</span>
        </div>
        {user.identityUpdatedAt && (
          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>{t("profile.lastUpdated")}</span>
            <span style={styles.fieldValue}>{user.identityUpdatedAt}</span>
          </div>
        )}
        {user.joinedAt && (
          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>{t("profile.memberSince")}</span>
            <span style={styles.fieldValue}>{user.joinedAt}</span>
          </div>
        )}

        <div style={styles.privacyRow}>
          <div>
            <p style={{ ...styles.privacyText, margin: 0, fontWeight: 600 }}>
              {t("profile.privateProfile")}
            </p>
            <p style={styles.privacyHint}>
              {user.isPrivate ? t("profile.privateOn") : t("profile.privateOff")}
            </p>
          </div>
          <div
            style={styles.toggle(!!user.isPrivate)}
            onClick={() => onTogglePrivacy(!user.isPrivate)}
          >
            <div style={styles.toggleDot(!!user.isPrivate)} />
          </div>
        </div>

        <div style={styles.privacyRow}>
          <div>
            <p style={{ ...styles.privacyText, margin: 0, fontWeight: 600 }}>
              {t("profile.privateWall")}
            </p>
            <p style={styles.privacyHint}>{t("profile.privateWallHint")}</p>
          </div>
          <div
            style={styles.toggle(!!user.isWallPrivate)}
            onClick={() => onToggleWallPrivacy(!user.isWallPrivate)}
          >
            <div style={styles.toggleDot(!!user.isWallPrivate)} />
          </div>
        </div>

        <div style={styles.privacyRow}>
          <p style={{ ...styles.privacyText, margin: 0, fontWeight: 600 }}>
            {t("profile.language")}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <span style={styles.chip(language === "es")} onClick={() => setLanguage("es")}>
              ES
            </span>
            <span style={styles.chip(language === "en")} onClick={() => setLanguage("en")}>
              EN
            </span>
          </div>
        </div>
      </div>

      <ProfileAbout profileUser={user} />

      <p style={styles.sectionTitle}>{t("profile.blockedUsers")}</p>
      {blockedUsers.length === 0 ? (
        <p style={styles.blockedEmpty}>{t("profile.blockedEmpty")}</p>
      ) : (
        blockedUsers.map((buid) => (
          <BlockedUserRow key={buid} uid={buid} onUnblock={onUnblock} />
        ))
      )}

      <button style={{ ...styles.buttonGhost, marginTop: "20px" }} onClick={onOpenSaved}>
        {t("saved.openButton")}
      </button>
      <button style={{ ...styles.buttonGhost, marginTop: "10px" }} onClick={onEdit}>
        {t("profile.changeIdentity")}
      </button>
      <button
        style={{ ...styles.buttonGhost, marginTop: "10px" }}
        onClick={onLogout}
      >
        {t("profile.logout")}
      </button>
    </div>
  );
}

export default function AuthProfile({ onOpenProfile, onOpenSaved }) {
  const { t } = useLanguage();
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
      setError(traducirErrorFirebase(err.code, t));
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
      setError(t("personal.invalidBirthDate"));
      return;
    }
    if (age < MIN_SIGNUP_AGE) {
      setError(t("personal.underage"));
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
      setError(traducirErrorFirebase(err.code, t));
    } finally {
      setLoading(false);
    }
  };

  const handleIdentitySubmit = async ({ displayName, identity, bio, datingPreference }) => {
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
          isWallPrivate: false,
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
      bio: bio || "",
      datingPreference: datingPreference || "",
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
      setError(t("errors.profileSaveFailed"));
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

  const handleToggleWallPrivacy = async (newValue) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const updated = { ...user, isWallPrivate: newValue };
    setUser(updated);
    try {
      // FIREBASE: firestore write (real) - guarda la preferencia de muro privado
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
    // Marca "offline" ANTES de cerrar sesión: una vez cerrada, la
    // escritura ya no pasaría las reglas de Firestore (exigen estar
    // autenticado) — ver presence.js.
    await markOffline(auth.currentUser?.uid);
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
          {t("common.loading")}
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
            onToggleWallPrivacy={handleToggleWallPrivacy}
            onUnblock={handleUnblock}
            onOpenProfile={onOpenProfile}
            onOpenSaved={onOpenSaved}
          />
        )}
      </div>
    </div>
  );
}

// Traduce los códigos de error de Firebase a un mensaje entendible, en el
// idioma activo (t viene de useLanguage()).
const KNOWN_AUTH_ERROR_CODES = [
  "auth/email-already-in-use",
  "auth/invalid-email",
  "auth/weak-password",
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/too-many-requests",
];

function traducirErrorFirebase(code, t) {
  return KNOWN_AUTH_ERROR_CODES.includes(code) ? t(`errors.${code}`) : t("errors.generic");
}

// Traduce los códigos de error de sendPasswordResetEmail, en el idioma activo.
const KNOWN_RESET_ERROR_CODES = [
  "auth/invalid-email",
  "auth/missing-email",
  "auth/user-not-found",
  "auth/too-many-requests",
];

function traducirErrorReset(code, t) {
  return KNOWN_RESET_ERROR_CODES.includes(code)
    ? t(`errors.reset.${code}`)
    : t("errors.reset.generic");
}
