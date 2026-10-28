import React, { useState, useEffect, useMemo } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { doc, writeBatch, Timestamp, serverTimestamp } from "firebase/firestore";
import { useLanguage } from "./LanguageContext";
import { MIN_SIGNUP_AGE, getCountryOptions, LANGUAGE_OPTIONS, getGenderOptions, calculateAge } from "./profileFields";
import { authStyles as styles, IdentityForm } from "./AuthForms";
import { ENTRY_THEME_VARS } from "./themes";

/*
  AuthScreen
  ----------
  Pantalla de entrada, separada de la app (punto 68, commit 7): entrar,
  registrarse (Cuenta -> Datos personales -> Identidad) y recuperar la
  contraseña. La muestra Root.jsx mientras no hay sesión o la cuenta
  todavía no tiene perfil (users/{uid}); en cuanto el perfil existe,
  Root.jsx pasa a la app sola, así que acá no hace falta "ir" a ningún
  lado después de entrar o de terminar el registro.

  needsIdentity: hay sesión pero falta el perfil. Si es un registro en
  curso (ya están los datos personales del paso 2) -> paso "identity". Si
  no (registro a medias: la cuenta se creó pero se cerró antes de guardar
  la identidad, y ahora se volvió a entrar), los datos personales se
  perdieron con la pestaña -> se vuelven a pedir ("signupPersonal", sin
  crear la cuenta otra vez) y después la identidad. Sin la fecha de
  nacimiento las reglas no dejan crear el perfil.

  Colores: paleta fija de marca (ENTRY_THEME_VARS en themes.js), puesta en
  el contenedor de la pantalla; no usa el tema elegido en la app.
*/

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

      {error && <div role="alert" style={styles.error}>{error}</div>}

      <label style={styles.label} htmlFor="email">
        {t("login.emailLabel")}
      </label>
      <input
        id="email"
        style={styles.input}
        type="email"
        autoComplete="email"
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
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        placeholder={t("login.passwordPlaceholder")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={6}
        required
      />

      {mode === "login" && (
        <button
          type="button"
          style={styles.forgotLink}
          onClick={() => onForgotPassword(email)}
        >
          {t("login.forgotPassword")}
        </button>
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
            <button type="button" style={styles.link} onClick={() => setMode("signup")}>
              {t("login.signupLink")}
            </button>
          </>
        ) : (
          <>
            {t("login.hasAccount")}{" "}
            <button type="button" style={styles.link} onClick={() => setMode("login")}>
              {t("login.loginLink")}
            </button>
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
          {status === "error" && <div role="alert" style={styles.error}>{errorMsg}</div>}

          <label style={styles.label} htmlFor="resetEmail">
            {t("login.emailLabel")}
          </label>
          <input
            id="resetEmail"
            style={styles.input}
            type="email"
            autoComplete="email"
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
        <button type="button" style={styles.link} onClick={onBack}>
          {t("reset.backLink")}
        </button>
      </p>
    </div>
  );
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

function PersonalDataForm({ onSubmit, onBack, loading, error, resuming }) {
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
      <button type="button" style={styles.backLink} onClick={onBack}>
        {resuming ? t("personal.exit") : t("personal.back")}
      </button>
      <p style={styles.eyebrow}>{t("personal.eyebrow")}</p>
      <h1 style={styles.title}>{t("personal.title")}</h1>
      <p style={styles.subtitle}>{t("personal.subtitle")}</p>

      {error && <div role="alert" style={styles.error}>{error}</div>}

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

export default function AuthScreen({ needsIdentity }) {
  const { t } = useLanguage();
  // login | signup | signupPersonal | identity | reset
  const [step, setStep] = useState(needsIdentity ? "signupPersonal" : "login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetEmailPrefill, setResetEmailPrefill] = useState("");
  // Datos de registro que se van juntando entre los pasos "Cuenta" y "Datos
  // personales" ANTES de crear nada en Firebase, para poder bloquear el
  // registro completo (ni cuenta de Auth ni documento en Firestore) si la
  // persona resulta ser menor de edad.
  const [signupDraft, setSignupDraft] = useState({});

  // Se entró con una cuenta sin perfil (o se acaba de crear la cuenta):
  // Root.jsx lo avisa. Con los datos personales ya juntados se pasa a la
  // identidad; sin ellos (registro a medias) primero se vuelven a pedir.
  const hasPersonalData = !!signupDraft.birthDate;
  useEffect(() => {
    if (needsIdentity) {
      setStep(hasPersonalData ? "identity" : "signupPersonal");
      setLoading(false);
    }
  }, [needsIdentity, hasPersonalData]);

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
      // FIREBASE: auth (real) - inicia sesión con Firebase Authentication.
      // Si todo sale bien no se hace nada más: Root.jsx ve la sesión y
      // muestra la app (o pide la identidad si la cuenta no tiene perfil),
      // así que el botón queda en "Espera…" hasta entonces.
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(traducirErrorFirebase(err.code, t));
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
      // confirmada la mayoría de edad. Si ya hay sesión es un registro a
      // medias que se retoma: la cuenta ya existe.
      if (!auth.currentUser) {
        await createUserWithEmailAndPassword(
          auth,
          signupDraft.email,
          signupDraft.password
        );
      }
      setSignupDraft((prev) => ({ ...prev, ...personalData }));
      setStep("identity");
    } catch (err) {
      setError(traducirErrorFirebase(err.code, t));
    } finally {
      setLoading(false);
    }
  };

  // Último paso del registro: crea el perfil. Al guardarse, Root.jsx ve
  // que users/{uid} ya existe y muestra la app.
  const handleIdentitySubmit = async ({ displayName, identity, bio, datingPreference }) => {
    setLoading(true);
    setError("");
    const uid = auth.currentUser?.uid;

    // Los datos personales juntados en los pasos anteriores van en
    // users/{uid}/private/data, no en el documento público (hallazgo H1,
    // ver loadOwnProfile en AuthProfile.jsx).
    const privateFields = {
      fullName: signupDraft.fullName || "",
      birthDate: signupDraft.birthDate ? Timestamp.fromDate(new Date(signupDraft.birthDate)) : null,
      country: signupDraft.country || "",
      language: signupDraft.language || "es",
      gender: signupDraft.gender || "",
      genderOther: signupDraft.gender === "otro" ? signupDraft.genderOther || "" : "",
    };
    const profile = {
      isPrivate: false,
      isWallPrivate: false,
      following: [],
      // Timestamp de Firestore, NUNCA un string ya formateado — así se
      // puede mostrar en el idioma activo al vuelo (formatMonthYear en
      // utils.js), en vez de quedar congelado en el idioma que estaba
      // activo el día del registro. Mismo criterio que birthDate.
      joinedAt: serverTimestamp(),
      displayName,
      identity,
      bio: bio || "",
      datingPreference: datingPreference || "",
      identityUpdatedAt: serverTimestamp(),
    };

    try {
      // FIREBASE: firestore write (real) - público y privado van en el
      // MISMO batch: la regla de create de users/{uid} mira la fecha de
      // nacimiento de private/data tal como queda al terminar el batch
      // (getAfter).
      const batch = writeBatch(db);
      batch.set(doc(db, "users", uid), profile, { merge: true });
      batch.set(doc(db, "users", uid, "private", "data"), privateFields, { merge: true });
      await batch.commit();
    } catch (err) {
      setError(t("errors.profileSaveFailed"));
      setLoading(false);
    }
  };

  return (
    <div className="pt-native-placeholder" style={{ ...ENTRY_THEME_VARS, ...styles.page }}>
      <div style={styles.card}>
        {(step === "login" || step === "signup") && (
          <>
            <img src="/logo-icon.webp" alt="Pridethink" width="72" height="72" style={styles.logo} />
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
            <img src="/logo-icon.webp" alt="Pridethink" width="72" height="72" style={styles.logo} />
            <ResetPasswordForm
              initialEmail={resetEmailPrefill}
              onBack={() => setStep("login")}
            />
          </>
        )}
        {step === "signupPersonal" && (
          <PersonalDataForm
            onSubmit={handlePersonalSubmit}
            resuming={needsIdentity}
            onBack={async () => {
              setError("");
              if (needsIdentity) {
                // Registro a medias: no hay paso "Cuenta" al que volver
                // (la cuenta ya existe), así que "Salir" cierra la sesión.
                await signOut(auth);
                setSignupDraft({});
                setStep("login");
                return;
              }
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
            isEdit={false}
            error={error}
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
