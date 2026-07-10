import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

/*
  Feed
  ----
  Muro social en tiempo real: cualquiera puede publicar un texto corto,
  y todos ven las publicaciones de todos, más recientes primero.

  Estructura en Firestore:
  - "posts/{postId}" -> { authorId, authorName, authorIdentity, text, createdAt }

  Usa onSnapshot, así que un post nuevo aparece para todos sin recargar.
*/

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
  wrapper: {
    minHeight: "100vh",
    background: THEME.bg,
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: THEME.text,
    boxSizing: "border-box",
  },
  column: {
    width: "100%",
    maxWidth: "560px",
  },
  composer: {
    background: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: "16px",
    padding: "18px",
    marginBottom: "20px",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: THEME.surfaceAlt,
    border: `1px solid ${THEME.border}`,
    borderRadius: "10px",
    padding: "12px 14px",
    fontSize: "14px",
    color: THEME.text,
    outline: "none",
    resize: "none",
    minHeight: "70px",
    fontFamily: "inherit",
  },
  postBtn: {
    marginTop: "10px",
    padding: "10px 20px",
    borderRadius: "10px",
    border: "none",
    background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`,
    color: "#14102b",
    fontWeight: 600,
    cursor: "pointer",
    float: "right",
  },
  post: {
    background: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: "16px",
    padding: "16px 18px",
    marginBottom: "14px",
  },
  postHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "10px",
  },
  avatar: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    fontWeight: 700,
    color: "#14102b",
    flexShrink: 0,
  },
  authorName: { fontSize: "14px", fontWeight: 600, margin: 0 },
  authorIdentity: { fontSize: "12px", color: THEME.textMuted, margin: 0 },
  postText: { fontSize: "14px", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" },
  empty: {
    textAlign: "center",
    color: THEME.textMuted,
    fontSize: "14px",
    padding: "40px 0",
  },
  loginNotice: {
    textAlign: "center",
    color: THEME.textMuted,
    padding: "40px 24px",
  },
};

export default function Feed() {
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  // Detecta sesión activa y trae tu propio perfil (nombre/identidad para firmar tus posts)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUid(user ? user.uid : null);
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setMyProfile(snap.data());
      } else {
        setMyProfile(null);
      }
    });
    return unsub;
  }, []);

  // Escucha el feed completo en tiempo real, más reciente primero
  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!text.trim() || !currentUid || !myProfile) return;
    setPosting(true);
    try {
      await addDoc(collection(db, "posts"), {
        authorId: currentUid,
        authorName: myProfile.displayName || "Sin nombre",
        authorIdentity: myProfile.identity || "",
        text: text.trim(),
        createdAt: serverTimestamp(),
      });
      setText("");
    } finally {
      setPosting(false);
    }
  };

  if (!currentUid) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <p style={styles.loginNotice}>Inicia sesión primero para ver el muro.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <form style={styles.composer} onSubmit={handlePost}>
          <textarea
            style={styles.textarea}
            placeholder="¿Qué estás pensando o sintiendo?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" style={styles.postBtn} disabled={posting}>
            {posting ? "Publicando..." : "Publicar"}
          </button>
          <div style={{ clear: "both" }} />
        </form>

        {posts.length === 0 && (
          <p style={styles.empty}>Todavía no hay publicaciones. ¡Sé el primero!</p>
        )}

        {posts.map((p) => {
          const initial = (p.authorIdentity || p.authorName || "?").charAt(0).toUpperCase();
          return (
            <div key={p.id} style={styles.post}>
              <div style={styles.postHeader}>
                <div style={styles.avatar}>{initial}</div>
                <div>
                  <p style={styles.authorName}>{p.authorName}</p>
                  <p style={styles.authorIdentity}>{p.authorIdentity}</p>
                </div>
              </div>
              <p style={styles.postText}>{p.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
