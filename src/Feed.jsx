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
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

/*
  Feed
  ----
  Muro social en tiempo real: publicaciones + reacciones (like) + comentarios.

  Estructura en Firestore:
  - "posts/{postId}"
      -> { authorId, authorName, authorIdentity, text, createdAt, likes: [uid, uid, ...] }
  - "posts/{postId}/comments/{commentId}"
      -> { authorId, authorName, authorIdentity, text, createdAt }

  "likes" se guarda como array de UID dentro del post (arrayUnion/arrayRemove),
  así el conteo y el estado "¿ya di like?" salen del mismo documento sin
  necesitar una subcolección aparte.

  Los comentarios sí son subcolección, porque pueden crecer mucho y
  solo se cargan cuando alguien abre esa publicación.
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
  postText: { fontSize: "14px", lineHeight: 1.5, margin: "0 0 12px", whiteSpace: "pre-wrap" },
  actionsRow: {
    display: "flex",
    gap: "16px",
    borderTop: `1px solid ${THEME.border}`,
    paddingTop: "10px",
  },
  actionBtn: (active) => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    color: active ? THEME.accent2 : THEME.textMuted,
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: 0,
  }),
  commentsBox: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: `1px solid ${THEME.border}`,
  },
  comment: {
    display: "flex",
    gap: "8px",
    marginBottom: "10px",
  },
  commentAvatar: {
    width: "26px",
    height: "26px",
    borderRadius: "50%",
    background: THEME.surfaceAlt,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: 700,
    color: THEME.accent2,
    flexShrink: 0,
  },
  commentBubble: {
    background: THEME.surfaceAlt,
    borderRadius: "10px",
    padding: "8px 12px",
    fontSize: "13px",
    lineHeight: 1.4,
  },
  commentAuthor: { fontWeight: 600, marginRight: "6px" },
  commentForm: {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  },
  commentInput: {
    flex: 1,
    background: THEME.surfaceAlt,
    border: `1px solid ${THEME.border}`,
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "13px",
    color: THEME.text,
    outline: "none",
  },
  commentSendBtn: {
    padding: "8px 16px",
    borderRadius: "999px",
    border: "none",
    background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent2})`,
    color: "#14102b",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
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

function PostCard({ post, currentUid, myProfile }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");

  const likes = post.likes || [];
  const iLiked = likes.includes(currentUid);

  // Escucha los comentarios solo mientras el bloque está abierto (ahorra lecturas)
  useEffect(() => {
    if (!commentsOpen) return;
    const q = query(
      collection(db, "posts", post.id, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [commentsOpen, post.id]);

  const toggleLike = async () => {
    const postRef = doc(db, "posts", post.id);
    await updateDoc(postRef, {
      likes: iLiked ? arrayRemove(currentUid) : arrayUnion(currentUid),
    });
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    await addDoc(collection(db, "posts", post.id, "comments"), {
      authorId: currentUid,
      authorName: myProfile?.displayName || "Sin nombre",
      authorIdentity: myProfile?.identity || "",
      text: commentText.trim(),
      createdAt: serverTimestamp(),
    });
    setCommentText("");
  };

  const initial = (post.authorIdentity || post.authorName || "?").charAt(0).toUpperCase();

  return (
    <div style={styles.post}>
      <div style={styles.postHeader}>
        <div style={styles.avatar}>{initial}</div>
        <div>
          <p style={styles.authorName}>{post.authorName}</p>
          <p style={styles.authorIdentity}>{post.authorIdentity}</p>
        </div>
      </div>
      <p style={styles.postText}>{post.text}</p>

      <div style={styles.actionsRow}>
        <button style={styles.actionBtn(iLiked)} onClick={toggleLike}>
          {iLiked ? "❤️" : "🤍"} {likes.length > 0 ? likes.length : "Me gusta"}
        </button>
        <button
          style={styles.actionBtn(commentsOpen)}
          onClick={() => setCommentsOpen((v) => !v)}
        >
          💬 Comentar
        </button>
      </div>

      {commentsOpen && (
        <div style={styles.commentsBox}>
          {comments.map((c) => (
            <div key={c.id} style={styles.comment}>
              <div style={styles.commentAvatar}>
                {(c.authorIdentity || c.authorName || "?").charAt(0).toUpperCase()}
              </div>
              <div style={styles.commentBubble}>
                <span style={styles.commentAuthor}>{c.authorName}</span>
                {c.text}
              </div>
            </div>
          ))}

          <form style={styles.commentForm} onSubmit={handleComment}>
            <input
              style={styles.commentInput}
              type="text"
              placeholder="Escribe un comentario..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <button type="submit" style={styles.commentSendBtn}>
              Enviar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

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
        likes: [],
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

        {posts.map((p) => (
          <PostCard key={p.id} post={p} currentUid={currentUid} myProfile={myProfile} />
        ))}
      </div>
    </div>
  );
}
