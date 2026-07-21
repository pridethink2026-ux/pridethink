import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  setDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import Avatar from "./Avatar";
import VerifiedBadge from "./VerifiedBadge";
import { PostCard } from "./Feed";
import { notify, extractHashtags } from "./utils";
import { useLanguage } from "./LanguageContext";
import { useAllUsers, useMentionAutocomplete, MentionSuggestions, extractMentionedUids } from "./Mentions";

/*
  GroupView
  ---------
  Vista superpuesta de un grupo específico (mismo patrón que
  UserProfile.jsx/SavedPosts.jsx/PostView.jsx, manejada desde App.js con
  su propio estado "viewingGroupId"): encabezado (nombre, descripción,
  cantidad de miembros en vivo, botón unirse/salir, botón eliminar si sos
  quien creó el grupo), lista de miembros desplegable, y el muro de
  publicaciones del grupo (reutiliza PostCard de Feed.jsx tal cual).

  Los posts del grupo viven en la colección "posts" de siempre (con un
  campo "groupId" nuevo) — se escucha TODA la colección (mismo patrón que
  Feed.jsx/Search.jsx) y se filtra por groupId en el cliente, para no
  necesitar un índice compuesto nuevo en Firestore (habría hecho falta uno
  para combinar where("groupId","==",...) con orderBy("createdAt")).

  Solo miembros pueden publicar (se oculta el composer si no sos
  miembro); las reglas de Firestore también lo exigen del lado del
  servidor (ver firestore.rules -> posts/{postId} -> allow create).
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
  headerCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
    padding: "20px",
    marginBottom: "18px",
  },
  groupTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "22px",
    fontWeight: 700,
    margin: "0 0 6px",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    display: "inline-block",
  },
  groupDescription: { fontSize: "14px", color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.4 },
  actionsRow: { display: "flex", gap: "8px", flexWrap: "wrap" },
  membersToggle: {
    padding: "8px 16px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  joinBtn: (joined) => ({
    padding: "8px 18px",
    borderRadius: "999px",
    border: joined ? "1px solid var(--border)" : "none",
    background: joined ? "transparent" : "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: joined ? "var(--text-muted)" : "var(--bg)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  }),
  deleteBtn: {
    padding: "8px 16px",
    borderRadius: "999px",
    border: "1px solid var(--accent2)",
    background: "var(--accent2-soft)",
    color: "var(--accent2)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  membersList: {
    marginTop: "14px",
    paddingTop: "14px",
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  memberRow: { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" },
  memberName: { fontSize: "13px", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "4px" },
  composer: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
    padding: "20px",
    marginBottom: "18px",
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
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontWeight: 600,
    cursor: "pointer",
    float: "right",
  },
  joinNotice: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "13px",
    padding: "14px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    marginBottom: "18px",
  },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "30px 0",
  },
};

export default function GroupView({ groupId, onBack, onOpenProfile }) {
  const { t } = useLanguage();
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [group, setGroup] = useState(undefined); // undefined: cargando | null: no existe
  const [memberUids, setMemberUids] = useState([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const allUsers = useAllUsers();
  const mention = useMentionAutocomplete(allUsers, currentUid, myProfile?.blockedUsers || []);

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
    if (!groupId) return;
    setGroup(undefined);
    const unsub = onSnapshot(doc(db, "groups", groupId), (snap) => {
      setGroup(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return unsub;
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(collection(db, "groups", groupId, "members"), (snap) => {
      setMemberUids(snap.docs.map((d) => d.id));
    });
    return unsub;
  }, [groupId]);

  // Se escucha TODA la colección "posts" (mismo patrón que Feed.jsx) y se
  // filtra por groupId en el cliente — ver docstring de arriba.
  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.groupId === groupId)
      );
      setPostsLoading(false);
    });
    return unsub;
  }, [groupId]);

  const isMember = !!currentUid && memberUids.includes(currentUid);
  const usersById = {};
  allUsers.forEach((u) => {
    usersById[u.uid] = u;
  });

  const handleToggleMembership = async () => {
    if (!currentUid) return;
    const ref = doc(db, "groups", groupId, "members", currentUid);
    if (isMember) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, { joinedAt: serverTimestamp() });
    }
  };

  const handlePost = async (e) => {
    e.preventDefault();
    if (!text.trim() || !currentUid || !myProfile || !isMember) return;
    setPosting(true);
    try {
      const trimmed = text.trim();
      const mentionedUids = extractMentionedUids(trimmed, allUsers, currentUid);
      const postRef = await addDoc(collection(db, "posts"), {
        authorId: currentUid,
        authorName: myProfile.displayName || "Sin nombre",
        authorIdentity: myProfile.identity || "",
        text: trimmed,
        hashtags: extractHashtags(trimmed),
        mentionedUids,
        groupId,
        createdAt: serverTimestamp(),
        reactions: {},
      });
      await Promise.all(
        mentionedUids.map((uid) =>
          notify(uid, {
            type: "mention",
            fromUid: currentUid,
            fromName: myProfile.displayName || "Alguien",
            fromIdentity: myProfile.identity || "",
            postId: postRef.id,
          })
        )
      );
      setText("");
      mention.closeMentions();
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm(t("groups.deleteConfirm"))) return;
    const memberSnap = await getDocs(collection(db, "groups", groupId, "members"));
    const batch = writeBatch(db);
    memberSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, "groups", groupId));
    await batch.commit();
    onBack();
  };

  if (group === undefined) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            {t("groups.backLink")}
          </button>
          <p style={styles.notice}>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (group === null) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            {t("groups.backLink")}
          </button>
          <p style={styles.notice}>{t("groups.notFound")}</p>
        </div>
      </div>
    );
  }

  const isCreator = group.createdBy === currentUid;

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <button style={styles.backBtn} onClick={onBack}>
          {t("groups.backLink")}
        </button>

        <div style={styles.headerCard}>
          <h1 style={styles.groupTitle}>{group.name}</h1>
          {group.description && <p style={styles.groupDescription}>{group.description}</p>}
          <div style={styles.actionsRow}>
            <button style={styles.membersToggle} onClick={() => setMembersOpen((v) => !v)}>
              👥 {t("groups.memberCount", { count: memberUids.length })}
            </button>
            {currentUid && (
              <button style={styles.joinBtn(isMember)} onClick={handleToggleMembership}>
                {isMember ? t("groups.leave") : t("groups.join")}
              </button>
            )}
            {isCreator && (
              <button style={styles.deleteBtn} onClick={handleDeleteGroup}>
                {t("groups.deleteGroup")}
              </button>
            )}
          </div>

          {membersOpen && (
            <div style={styles.membersList}>
              {memberUids.map((uid) => {
                const u = usersById[uid];
                return (
                  <div key={uid} style={styles.memberRow} onClick={() => onOpenProfile(uid)}>
                    <Avatar uid={uid} name={u?.displayName || u?.identity} identity={u?.identity} size="sm" />
                    <p style={styles.memberName}>
                      {u?.displayName || "Sin nombre"}
                      {u?.isVerified && <VerifiedBadge size="sm" />}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {isMember ? (
          <form style={styles.composer} onSubmit={handlePost}>
            <div style={{ position: "relative" }}>
              <textarea
                ref={mention.inputRef}
                style={styles.textarea}
                placeholder={t("groups.composerPlaceholder")}
                value={text}
                onChange={(e) => mention.handleMentionChange(e, setText)}
              />
              {mention.mentionOpen && (
                <MentionSuggestions
                  suggestions={mention.mentionSuggestions}
                  onSelect={(u) => mention.selectMention(u, text, setText)}
                />
              )}
            </div>
            <button type="submit" style={styles.postBtn} disabled={posting}>
              {posting ? t("feed.posting") : t("feed.postButton")}
            </button>
            <div style={{ clear: "both" }} />
          </form>
        ) : (
          <p style={styles.joinNotice}>{t("groups.joinToPost")}</p>
        )}

        {!postsLoading && posts.length === 0 && <p style={styles.empty}>{t("groups.emptyWall")}</p>}

        {!postsLoading &&
          posts.map((p) => (
            <PostCard key={p.id} post={p} currentUid={currentUid} myProfile={myProfile} onOpenProfile={onOpenProfile} />
          ))}
      </div>
    </div>
  );
}
