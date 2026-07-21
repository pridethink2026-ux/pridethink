import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, updateDoc, arrayRemove } from "firebase/firestore";
import { PostCard } from "./Feed";
import { useLanguage } from "./LanguageContext";

/*
  PostView
  --------
  Publicación individual ("post original"), a donde navega tocar la vista
  previa de un post compartido en el chat (ver Chat.jsx -> onOpenPost,
  conectado desde App.js). Reutiliza el mismo PostCard del muro.

  Reglas de visibilidad, A PROPÓSITO más simples que UserProfile.jsx:
  - Bloqueo (en cualquier dirección): NO se puede ver, mismo patrón que en
    cualquier otro lado de la app (con botón "Desbloquear" si el bloqueo
    fue tuyo).
  - isPrivate / isWallPrivate del autor: acá NO aplican. Esos dos campos
    controlan si se puede REPASAR el muro de alguien desde su perfil (ver
    el punto 31 de CONTEXTO.md) — no impiden ver un post puntual al que ya
    llegaste por un enlace directo (te lo compartió alguien por chat), algo
    coherente con que las reglas de Firestore ya permiten leer cualquier
    post a cualquier autenticado sin mirar esos campos.
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
  notice: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "30px 20px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
  },
  unblockBtn: {
    marginTop: "14px",
    padding: "9px 20px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
};

export default function PostView({ postId, onBack, onOpenProfile }) {
  const { t } = useLanguage();
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [post, setPost] = useState(undefined); // undefined: cargando | null: no existe
  const [authorProfile, setAuthorProfile] = useState(null);

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

  useEffect(() => {
    if (!postId) return;
    setPost(undefined);
    const unsub = onSnapshot(doc(db, "posts", postId), (snap) => {
      setPost(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return unsub;
  }, [postId]);

  const authorId = post?.authorId || null;

  useEffect(() => {
    if (!authorId) {
      setAuthorProfile(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", authorId), (snap) => {
      setAuthorProfile(snap.exists() ? snap.data() : null);
    });
    return unsub;
  }, [authorId]);

  const myBlocked = myProfile?.blockedUsers || [];
  const isBlocked =
    !!post &&
    (myBlocked.includes(post.authorId) || (authorProfile?.blockedUsers || []).includes(currentUid));

  const handleUnblock = async () => {
    if (!currentUid || !post) return;
    await updateDoc(doc(db, "users", currentUid), { blockedUsers: arrayRemove(post.authorId) });
  };

  if (post === undefined) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            {t("postView.backLink")}
          </button>
          <p style={styles.notice}>{t("postView.loading")}</p>
        </div>
      </div>
    );
  }

  if (post === null) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            {t("postView.backLink")}
          </button>
          <p style={styles.notice}>{t("postView.notFound")}</p>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    const iBlockedThem = myBlocked.includes(post.authorId);
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            {t("postView.backLink")}
          </button>
          <div style={styles.notice}>
            <p style={{ margin: 0 }}>{t("postView.blocked")}</p>
            {iBlockedThem && (
              <button style={styles.unblockBtn} onClick={handleUnblock}>
                {t("profile.unblock")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <button style={styles.backBtn} onClick={onBack}>
          {t("postView.backLink")}
        </button>
        <PostCard post={post} currentUid={currentUid} myProfile={myProfile} onOpenProfile={onOpenProfile} />
      </div>
    </div>
  );
}
