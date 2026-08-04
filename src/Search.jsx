import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import Avatar from "./Avatar";
import VerifiedBadge from "./VerifiedBadge";
import { timeAgo } from "./utils";
import { useMyBlocks, isBlockedEitherWay } from "./Blocks";
import { useAllUsers } from "./Mentions";
import { useLanguage } from "./LanguageContext";

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
    fontFamily: "var(--font-body)",
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
    margin: "22px 0 10px",
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px",
    borderRadius: "16px",
    cursor: "pointer",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
    marginBottom: "10px",
  },
  userName: { fontSize: "14px", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "4px" },
  userIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: 0 },
  postRow: {
    display: "flex",
    gap: "10px",
    padding: "14px",
    borderRadius: "16px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
    marginBottom: "10px",
  },
  postAuthor: {
    fontSize: "13px",
    fontWeight: 600,
    margin: 0,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
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
  const { t } = useLanguage();
  const [currentUid, setCurrentUid] = useState(null);
  const users = useAllUsers();
  // Separado en dos consultas (auditoría de seguridad, 2026-07-28,
  // hallazgo H2) — mismo motivo y mismo patrón que Feed.jsx: firestore.rules
  // ahora exige authorIsPrivate == false O ser el autor para poder leer un
  // post, así que una consulta sin where() se rechazaría entera.
  const [publicPosts, setPublicPosts] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUid(u ? u.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "posts"), where("authorIsPrivate", "==", false));
    const unsub = onSnapshot(q, (snap) => {
      setPublicPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setMyPosts([]);
      return;
    }
    const q = query(collection(db, "posts"), where("authorId", "==", currentUid));
    const unsub = onSnapshot(q, (snap) => {
      setMyPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [currentUid]);

  // Junta las dos consultas de arriba, ordenadas por fecha (orderBy() no
  // se usa en las consultas a propósito, para no necesitar un índice
  // compuesto — ver el mismo comentario en Feed.jsx).
  const posts = useMemo(() => {
    const merged = new Map();
    publicPosts.forEach((p) => merged.set(p.id, p));
    myPosts.forEach((p) => merged.set(p.id, p));
    return Array.from(merged.values()).sort(
      (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );
  }, [publicPosts, myPosts]);

  const { blockedByMe, blockedMe } = useMyBlocks(currentUid);

  if (!currentUid) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <p style={styles.loginNotice}>{t("search.loginRequired")}</p>
        </div>
      </div>
    );
  }

  const isVisibleAuthor = (authorId, author) => {
    if (authorId === currentUid) return true;
    if (author?.isPrivate) return false;
    if (isBlockedEitherWay(blockedByMe, blockedMe, authorId)) return false;
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
        if (isBlockedEitherWay(blockedByMe, blockedMe, u.uid)) return false;
        return (u.displayName || "").toLowerCase().includes(q);
      })
    : [];

  const matchedPosts = q
    ? posts.filter((p) => {
        if (p.groupId) return false; // los posts de grupo solo se ven dentro del grupo
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
            placeholder={t("search.placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {!q && <p style={styles.hint}>{t("search.hint")}</p>}

        {q && matchedUsers.length === 0 && matchedPosts.length === 0 && (
          <p style={styles.empty}>{t("search.noResults", { query: search.trim() })}</p>
        )}

        {matchedUsers.length > 0 && (
          <>
            <p style={styles.sectionTitle}>{t("search.peopleTitle")}</p>
            {matchedUsers.map((u) => (
              <div key={u.uid} style={styles.userRow} onClick={() => onOpenProfile(u.uid)}>
                <Avatar
                  uid={u.uid}
                  name={u.displayName || u.identity}
                  identity={u.identity}
                  size="md"
                />
                <div>
                  <p style={styles.userName}>
                    {u.displayName || t("chat.defaultName")}
                    {u.isVerified && <VerifiedBadge size="sm" />}
                  </p>
                  <p style={styles.userIdentity}>{u.identity}</p>
                </div>
              </div>
            ))}
          </>
        )}

        {matchedPosts.length > 0 && (
          <>
            <p style={styles.sectionTitle}>{t("search.postsTitle")}</p>
            {matchedPosts.map((p) => (
              <div key={p.id} style={styles.postRow}>
                <Avatar
                  uid={p.authorId}
                  name={p.authorName}
                  identity={p.authorIdentity}
                  size="sm"
                  onClick={() => onOpenProfile(p.authorId)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={styles.postAuthor} onClick={() => onOpenProfile(p.authorId)}>
                    {p.authorName}
                    {usersMap[p.authorId]?.isVerified && <VerifiedBadge size="sm" />}
                  </p>
                  <p style={styles.postTime}>{timeAgo(p.createdAt, t)}</p>
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
