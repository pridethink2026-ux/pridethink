import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import Avatar from "./Avatar";
import { timeAgo } from "./utils";

/*
  Search
  ------
  Busca, entre lo ya cargado en tiempo real (mismo patrón que Feed.jsx y
  Chat.jsx: se escuchan las colecciones completas y se filtra en el
  cliente), usuarios por nombre y publicaciones por texto o hashtag.

  Se excluyen de los resultados los usuarios bloqueados (en cualquier
  dirección) y los perfiles privados, igual que en el resto de la app.
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
  searchBox: {
    marginBottom: "20px",
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "12px 18px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
  },
  sectionTitle: {
    fontSize: "12px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--accent2)",
    fontWeight: 700,
    margin: "22px 0 10px",
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px",
    borderRadius: "12px",
    cursor: "pointer",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    marginBottom: "8px",
  },
  userName: { fontSize: "14px", fontWeight: 600, margin: 0 },
  userIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: 0 },
  postRow: {
    display: "flex",
    gap: "10px",
    padding: "12px",
    borderRadius: "12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    marginBottom: "8px",
  },
  postAuthor: { fontSize: "13px", fontWeight: 600, margin: 0, cursor: "pointer" },
  postTime: { fontSize: "11px", color: "var(--text-muted)", margin: "1px 0 6px" },
  postText: { fontSize: "13px", lineHeight: 1.4, margin: 0, whiteSpace: "pre-wrap" },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "40px 0",
  },
  hint: {
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

export default function Search({ onOpenProfile }) {
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");

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
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  if (!currentUid) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <p style={styles.loginNotice}>Inicia sesión primero para buscar.</p>
        </div>
      </div>
    );
  }

  const myBlocked = myProfile?.blockedUsers || [];
  const isVisibleAuthor = (authorId, author) => {
    if (authorId === currentUid) return true;
    if (author?.isPrivate) return false;
    if (myBlocked.includes(authorId)) return false;
    if ((author?.blockedUsers || []).includes(currentUid)) return false;
    return true;
  };

  const q = search.trim().toLowerCase();
  const qHashtag = q.replace(/^#/, "");

  const usersMap = {};
  users.forEach((u) => {
    usersMap[u.uid] = u;
  });

  const matchedUsers = q
    ? users.filter((u) => {
        if (u.uid === currentUid) return false;
        if (u.isPrivate) return false;
        if (myBlocked.includes(u.uid)) return false;
        if ((u.blockedUsers || []).includes(currentUid)) return false;
        return (u.displayName || "").toLowerCase().includes(q);
      })
    : [];

  const matchedPosts = q
    ? posts.filter((p) => {
        if (!isVisibleAuthor(p.authorId, usersMap[p.authorId])) return false;
        const textMatch = (p.text || "").toLowerCase().includes(q);
        const hashtagMatch = (p.hashtags || []).includes(qHashtag);
        return textMatch || hashtagMatch;
      })
    : [];

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <div style={styles.searchBox}>
          <input
            style={styles.searchInput}
            type="text"
            placeholder="Buscar personas, texto o #hashtags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {!q && <p style={styles.hint}>Escribe para buscar personas y publicaciones.</p>}

        {q && matchedUsers.length === 0 && matchedPosts.length === 0 && (
          <p style={styles.empty}>No encontramos nada para "{search.trim()}".</p>
        )}

        {matchedUsers.length > 0 && (
          <>
            <p style={styles.sectionTitle}>Personas</p>
            {matchedUsers.map((u) => (
              <div key={u.uid} style={styles.userRow} onClick={() => onOpenProfile(u.uid)}>
                <Avatar uid={u.uid} name={u.displayName || u.identity} size="md" />
                <div>
                  <p style={styles.userName}>{u.displayName || "Sin nombre"}</p>
                  <p style={styles.userIdentity}>{u.identity}</p>
                </div>
              </div>
            ))}
          </>
        )}

        {matchedPosts.length > 0 && (
          <>
            <p style={styles.sectionTitle}>Publicaciones</p>
            {matchedPosts.map((p) => (
              <div key={p.id} style={styles.postRow}>
                <Avatar
                  uid={p.authorId}
                  name={p.authorName}
                  size="sm"
                  onClick={() => onOpenProfile(p.authorId)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={styles.postAuthor} onClick={() => onOpenProfile(p.authorId)}>
                    {p.authorName}
                  </p>
                  <p style={styles.postTime}>{timeAgo(p.createdAt)}</p>
                  <p style={styles.postText}>{p.text}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
