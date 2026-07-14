import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
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
  Muro social en tiempo real: publicaciones + reacciones (like) + comentarios
  + edición/borrado de tus propios posts + notificaciones a otros usuarios.

  Estructura en Firestore:
  - "posts/{postId}"
      -> { authorId, authorName, authorIdentity, text, createdAt, likes: [uid...] }
  - "posts/{postId}/comments/{commentId}"
      -> { authorId, authorName, authorIdentity, text, createdAt }
  - "notifications/{uid}/items/{itemId}"
      -> { type: 'like' | 'comment' | 'message', fromUid, fromName, fromIdentity, createdAt, read }

  El número de comentarios NO se guarda como campo aparte: se escucha la
  subcolección de comentarios de cada post todo el tiempo (no solo cuando
  se abre) y el contador es simplemente la cantidad real de documentos.
  Así nunca puede desincronizarse.
*/

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "var(--bg)",
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "var(--text)",
    boxSizing: "border-box",
  },
  column: {
    width: "100%",
    maxWidth: "560px",
  },
  composer: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    padding: "18px",
    marginBottom: "20px",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "12px 14px",
    fontSize: "14px",
    color: "var(--text)",
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
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontWeight: 600,
    cursor: "pointer",
    float: "right",
  },
  post: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
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
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    fontWeight: 700,
    color: "var(--bg)",
    flexShrink: 0,
  },
  authorName: { fontSize: "14px", fontWeight: 600, margin: 0 },
  authorIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: 0 },
  postText: { fontSize: "14px", lineHeight: 1.5, margin: "0 0 12px", whiteSpace: "pre-wrap" },
  headerRight: { marginLeft: "auto", display: "flex", gap: "10px" },
  smallLink: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "12px",
    color: "var(--text-muted)",
    padding: 0,
  },
  editTextarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
    resize: "none",
    fontFamily: "inherit",
    marginBottom: "8px",
  },
  editRow: { display: "flex", gap: "8px", marginBottom: "12px" },
  smallBtn: {
    padding: "6px 14px",
    borderRadius: "8px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  smallBtnGhost: {
    padding: "6px 14px",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  actionsRow: {
    display: "flex",
    gap: "16px",
    borderTop: "1px solid var(--border)",
    paddingTop: "10px",
  },
  actionBtn: (active) => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    color: active ? "var(--accent2)" : "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: 0,
  }),
  commentsBox: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid var(--border)",
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
    background: "var(--surface-alt)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: 700,
    color: "var(--accent2)",
    flexShrink: 0,
  },
  commentBubble: {
    background: "var(--surface-alt)",
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
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "13px",
    color: "var(--text)",
    outline: "none",
  },
  commentSendBtn: {
    padding: "8px 16px",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "40px 0",
  },
  loginNotice: {
    textAlign: "center",
    color: "var(--text-muted)",
    padding: "40px 24px",
  },
};

// Crea una notificación para otra persona (nunca para ti mismo)
async function notify(targetUid, { type, fromUid, fromName, fromIdentity }) {
  if (!targetUid || targetUid === fromUid) return;
  await addDoc(collection(db, "notifications", targetUid, "items"), {
    type,
    fromUid,
    fromName,
    fromIdentity,
    createdAt: serverTimestamp(),
    read: false,
  });
}

function PostCard({ post, currentUid, myProfile }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);

  const likes = post.likes || [];
  const iLiked = likes.includes(currentUid);
  const isMine = post.authorId === currentUid;

  // Escucha los comentarios SIEMPRE (no solo al abrir), así el número junto
  // al ícono de comentarios siempre es exacto, sin depender de que alguien
  // haga clic para "activar" el conteo correcto.
  useEffect(() => {
    const q = query(
      collection(db, "posts", post.id, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [post.id]);

  const toggleLike = async () => {
    const postRef = doc(db, "posts", post.id);
    await updateDoc(postRef, {
      likes: iLiked ? arrayRemove(currentUid) : arrayUnion(currentUid),
    });
    if (!iLiked) {
      await notify(post.authorId, {
        type: "like",
        fromUid: currentUid,
        fromName: myProfile?.displayName || "Alguien",
        fromIdentity: myProfile?.identity || "",
      });
    }
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
    await notify(post.authorId, {
      type: "comment",
      fromUid: currentUid,
      fromName: myProfile?.displayName || "Alguien",
      fromIdentity: myProfile?.identity || "",
    });
    setCommentText("");
  };

  const handleSaveEdit = async () => {
    if (!editText.trim()) return;
    await updateDoc(doc(db, "posts", post.id), { text: editText.trim() });
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Borrar esta publicación? No se puede deshacer.")) return;
    await deleteDoc(doc(db, "posts", post.id));
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
        {isMine && !editing && (
          <div style={styles.headerRight}>
            <button style={styles.smallLink} onClick={() => setEditing(true)}>
              Editar
            </button>
            <button style={styles.smallLink} onClick={handleDelete}>
              Borrar
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            style={styles.editTextarea}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <div style={styles.editRow}>
            <button style={styles.smallBtn} onClick={handleSaveEdit}>
              Guardar
            </button>
            <button
              style={styles.smallBtnGhost}
              onClick={() => {
                setEditText(post.text);
                setEditing(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <p style={styles.postText}>{post.text}</p>
      )}

      <div style={styles.actionsRow}>
        <button style={styles.actionBtn(iLiked)} onClick={toggleLike}>
          {iLiked ? "❤️" : "🤍"} {likes.length > 0 ? likes.length : "Me gusta"}
        </button>
        <button
          style={styles.actionBtn(commentsOpen)}
          onClick={() => setCommentsOpen((v) => !v)}
        >
          💬 {comments.length > 0 ? comments.length : "Comentar"}
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
  const [usersMap, setUsersMap] = useState({});
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  // Detecta sesión activa y trae tu propio perfil (nombre/identidad para firmar tus posts)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user ? user.uid : null);
    });
    return unsub;
  }, []);

  // Escucha tu propio perfil en tiempo real (para saber a quién bloqueaste)
  useEffect(() => {
    if (!currentUid) return;
    const unsub = onSnapshot(doc(db, "users", currentUid), (snap) => {
      if (snap.exists()) setMyProfile(snap.data());
    });
    return unsub;
  }, [currentUid]);

  // Escucha todos los perfiles (solo isPrivate/blockedUsers) para filtrar el feed en vivo
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const map = {};
      snap.forEach((d) => {
        map[d.id] = d.data();
      });
      setUsersMap(map);
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

  const myBlocked = myProfile?.blockedUsers || [];
  const visiblePosts = posts.filter((p) => {
    if (p.authorId === currentUid) return true; // siempre ves tus propios posts
    const author = usersMap[p.authorId];
    if (author?.isPrivate) return false;
    if (myBlocked.includes(p.authorId)) return false;
    if ((author?.blockedUsers || []).includes(currentUid)) return false;
    return true;
  });

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

        {visiblePosts.length === 0 && (
          <p style={styles.empty}>Todavía no hay publicaciones. ¡Sé el primero!</p>
        )}

        {visiblePosts.map((p) => (
          <PostCard key={p.id} post={p} currentUid={currentUid} myProfile={myProfile} />
        ))}
      </div>
    </div>
  );
}
