import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { PostCard } from "./Feed";
import { useLanguage } from "./LanguageContext";

/*
  SavedPosts
  ----------
  Pantalla "Guardados", accesible desde tu propio perfil
  (AuthProfile.jsx -> ProfileView -> botón "Ver guardados"). Lista tus
  publicaciones guardadas reutilizando el mismo PostCard del muro.

  savedPosts/{uid}/items/{postId} guarda SOLO una referencia (el id del
  post es el propio id del documento; no se copia texto ni autor). Mismo
  patrón de dos pasos que FollowListModal.jsx: primero se escucha la
  subcolección para obtener la lista de ids guardados (ordenada por
  savedAt, más reciente primero), después se resuelve cada id a su post
  completo con su propio onSnapshot — así la lista de posts guardados
  siempre refleja el contenido actual (si editaste un post guardado, se ve
  editado; si lo borraste, desaparece solo de esta lista).
*/

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "var(--bg)",
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "var(--font-body)",
    color: "var(--text)",
    boxSizing: "border-box",
  },
  column: { width: "100%", maxWidth: "560px" },
  backBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "8px 16px",
    color: "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "18px",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "22px",
    fontWeight: 700,
    margin: "0 0 18px",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    display: "inline-block",
  },
  notice: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "40px 20px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
  },
};

export default function SavedPosts({ onBack, onOpenProfile }) {
  const { t } = useLanguage();
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [savedIds, setSavedIds] = useState([]);
  const [idsReady, setIdsReady] = useState(false);
  const [postsById, setPostsById] = useState({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUid(u ? u.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUid) return;
    const unsub = onSnapshot(doc(db, "users", currentUid), (snap) => {
      if (snap.exists()) setMyProfile(snap.data());
    });
    return unsub;
  }, [currentUid]);

  // Paso 1: ids de los posts guardados, más reciente primero.
  useEffect(() => {
    if (!currentUid) return;
    setIdsReady(false);
    const q = query(collection(db, "savedPosts", currentUid, "items"), orderBy("savedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setSavedIds(snap.docs.map((d) => d.id));
      setIdsReady(true);
    });
    return unsub;
  }, [currentUid]);

  // Paso 2: resuelve cada id a su post completo (o null si ya no existe).
  useEffect(() => {
    if (savedIds.length === 0) {
      setPostsById({});
      return;
    }
    const unsubs = savedIds.map((id) =>
      onSnapshot(doc(db, "posts", id), (snap) => {
        setPostsById((prev) => ({ ...prev, [id]: snap.exists() ? { id, ...snap.data() } : null }));
      })
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedIds.join(",")]);

  const resolvedPosts = savedIds.map((id) => postsById[id]).filter(Boolean);

  if (!currentUid) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <p style={styles.notice}>{t("saved.loginNotice")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <button style={styles.backBtn} onClick={onBack}>
          {t("saved.backLink")}
        </button>
        <h1 style={styles.title}>{t("saved.title")}</h1>

        {idsReady && resolvedPosts.length === 0 && (
          <p style={styles.notice}>{t("saved.empty")}</p>
        )}

        {resolvedPosts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            currentUid={currentUid}
            myProfile={myProfile}
            onOpenProfile={onOpenProfile}
          />
        ))}
      </div>
    </div>
  );
}
