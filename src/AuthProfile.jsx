import React, { useState } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

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

const THEME = {
  bg: "#14102b",
  surface: "#231b47",
  surfaceAlt: "#2c2358",
  accent: "#a78bfa",
  accent2: "#f472b6",
  text: "#f5f3ff",
  textMuted: "#b8adf0",
  border: "rgba(167, 139, 250, 0.25)",
};

const styles = {
  page: {
    minHeight: "100vh",
    background: THEME.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: THEME.text,
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: THEME.surface,
    borderRadius: "20px",
    border: `1px solid ${THEME.border}`,
    padding: "32px 28px",
    boxSizing: "border-box",
  },
  eyebrow: {
    fontSize: "12px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: THEME.accent2,
    fontWeight: 500,
    margin: "0 0 8px",
  },
  title: {
    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
    fontSize: "26px",
    fontWeight: 600,
    margin: "0 0 4px",
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: "14px",
    color: THEME.textMuted,
    margin: "0 0 28px",
    lineHeight: 1.5,
  },
  label: {
    display: "block",
    fontSize: "13px",
    color: THEME.textMuted,
    margin: "0 0 6px",
    fontWeight: 500,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: THEME.surfaceAlt,
    border: `1px solid ${THEME.border}`,
    borderRadius: "10px",
    padding: "11px 14px",
    fontSize: "15px",
    color: THEME.text,
    marginBottom: "18px",
    outline: "none",
  },
  button: {
    width: "100%",
    padding: "13px",
    borderRadius: "10px",
    border: "none",
    background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`,
    color: "#14102b",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "6px",
  },
  buttonGhost: {
    width: "100%",
    padding: "11px",
    borderRadius: "10px",
    border: `1px solid ${THEME.border}`,
    background: "transparent",
    color: THEME.text,
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    marginTop: "10px",
  },
  switchRow: {
    textAlign: "center",
    fontSize: "13px",
    color: THEME.textMuted,
    marginTop: "18px",
  },
  link: {
    color: THEME.accent2,
    cursor: "pointer",
    fontWeight: 500,
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
    border: `1px solid ${active ? THEME.accent2 : THEME.border}`,
    background: active ? "rgba(244, 114, 182, 0.15)" : THEME.surfaceAlt,
    color: active ? THEME.accent2 : THEME.textMuted,
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    userSelect: "none",
  }),
  error: {
    background: "rgba(244, 114, 182, 0.12)",
    border: "1px solid rgba(244, 114, 182, 0.4)",
    color: "#fbb6ce",
    fontSize: "13px",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "16px",
  },
  profileHeader: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    marginBottom: "24px",
  },
  avatarCircle: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
    fontWeight: 700,
    color: "#14102b",
    flexShrink: 0,
  },
  fieldRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: `1px solid ${THEME.border}`,
    fontSize: "14px",
  },
  fieldLabel: { color: THEME.textMuted },
  fieldValue: { fontWeight: 500 },
};

function LoginForm({ onSubmit, mode, setMode, error, loading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ email, password });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={styles.eyebrow}>
        {mode === "login" ? "Bienvenido de vuelta" : "Crear cuenta"}
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

function IdentityForm({ onSubmit, loading }) {
  const [displayName, setDisplayName] = useState("");
  const [identity, setIdentity] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!identity.trim()) return;
    onSubmit({ displayName: displayName.trim() || "Sin nombre", identity: identity.trim() });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={styles.eyebrow}>Paso 2 de 2</p>
      <h1 style={styles.title}>¿Qué eres tú?</h1>
      <p style={styles.subtitle}>
        No elijas una casilla. Escribe lo que sientes que eres — puede ser
        una de estas ideas o algo completamente tuyo.
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
        Tu identidad
      </label>
      <input
        id="identity"
        style={styles.input}
        type="text"
        placeholder="Escribe lo que eres..."
        value={identity}
        onChange={(e) => setIdentity(e.target.value)}
        required
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
        {loading ? "Guardando..." : "Guardar mi identidad"}
      </button>
    </form>
  );
}

function ProfileView({ user, onLogout, onEdit }) {
  const initial = (user.identity || "?").charAt(0).toUpperCase();
  return (
    <div>
      <div style={styles.profileHeader}>
        <div style={styles.avatarCircle}>{initial}</div>
        <div>
          <h1 style={{ ...styles.title, fontSize: "20px", margin: 0 }}>
            {user.displayName}
          </h1>
          <p style={{ ...styles.subtitle, margin: 0 }}>{user.identity}</p>
        </div>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <div style={styles.fieldRow}>
          <span style={styles.fieldLabel}>Correo</span>
          <span style={styles.fieldValue}>{user.email}</span>
        </div>
        <div style={styles.fieldRow}>
          <span style={styles.fieldLabel}>Identidad</span>
          <span style={styles.fieldValue}>{user.identity}</span>
        </div>
        <div style={styles.fieldRow}>
          <span style={styles.fieldLabel}>Miembro desde</span>
          <span style={styles.fieldValue}>{user.joinedAt}</span>
        </div>
      </div>

      <button style={styles.buttonGhost} onClick={onEdit}>
        Editar identidad
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

export default function AuthProfile() {
  const [step, setStep] = useState("login"); // login | signup | identity | profile
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingUid, setPendingUid] = useState(null);
  const [user, setUser] = useState(null);

  const handleAuthSubmit = async ({ email, password }) => {
    setError("");
    setLoading(true);
    try {
      if (step === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        setPendingUid(cred.user.uid);
        setStep("identity");
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const snap = await getDoc(doc(db, "users", cred.user.uid));
        if (snap.exists()) {
          setUser(snap.data());
          setStep("profile");
        } else {
          setPendingUid(cred.user.uid);
          setStep("identity");
        }
      }
    } catch (err) {
      setError(traducirErrorFirebase(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleIdentitySubmit = async ({ displayName, identity }) => {
    setLoading(true);
    setError("");
    const profile = {
      email: auth.currentUser?.email || "",
      displayName,
      identity,
      joinedAt: new Date().toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
      }),
    };

    try {
      await setDoc(doc(db, "users", pendingUid), profile);
      setUser(profile);
      setStep("profile");
    } catch (err) {
      setError("No se pudo guardar tu perfil. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setPendingUid(null);
    setStep("login");
    setError("");
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {(step === "login" || step === "signup") && (
          <LoginForm
            mode={step}
            setMode={setStep}
            onSubmit={handleAuthSubmit}
            error={error}
            loading={loading}
          />
        )}
        {step === "identity" && (
          <IdentityForm onSubmit={handleIdentitySubmit} loading={loading} />
        )}
        {step === "profile" && user && (
          <ProfileView
            user={user}
            onLogout={handleLogout}
            onEdit={() => setStep("identity")}
          />
        )}
      </div>
    </div>
  );
}

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