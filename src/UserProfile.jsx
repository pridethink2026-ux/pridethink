import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import Avatar from "./Avatar";
import { PostCard } from "./Feed";
import { notify } from "./utils";
import FollowListModal from "./FollowListModal";
import ProfileAbout from "./ProfileAbout";

/*
  UserProfile
  -----------
  Perfil público de cualquier usuario: avatar grande, nombre, identidad,
  fecha de registro, contadores de seguidores/seguidos, sus publicaciones,
  y botón para seguir/dejar de seguir (nunca en tu propio perfil).

  Reglas de visibilidad:
  - Si hay bloqueo en cualquiera de las dos direcciones (mismo criterio que
    ya se usa en Chat.jsx y Feed.jsx para ocultar contactos/posts), el
    perfil no se puede ver en absoluto.
  - Si el perfil es privado (isPrivate) y no eres tú, se muestra lo mínimo
    (avatar, nombre, identidad, contadores) con un aviso, sin publicaciones.

  "following" vive en users/{uid}.following: [uid...] (mismo patrón que
  blockedUsers). Los seguidores de un usuario NO se guardan aparte: se
  derivan en tiempo real con una consulta array-contains sobre following.
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
  header: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "22px",
    boxShadow: "0 8px 26px rgba(0,0,0,0.2)",
    padding: "30px 22px",
    textAlign: "center",
    marginBottom: "22px",
  },
  name: {
    fontFamily: "var(--font-display)",
    fontSize: "21px",
    fontWeight: 700,
    margin: "14px 0 0",
  },
  identity: {
    fontSize: "14px",
    color: "var(--text-muted)",
    margin: "2px 0 0",
  },
  joined: {
    fontSize: "12px",
    color: "var(--text-muted)",
    margin: "8px 0 0",
  },
  countsRow: {
    display: "flex",
    justifyContent: "center",
    gap: "36px",
    margin: "18px 0 4px",
  },
  countItem: { cursor: "pointer" },
  countNumber: { fontSize: "17px", fontWeight: 700, margin: 0 },
  countLabel: { fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" },
  followBtn: (following) => ({
    marginTop: "18px",
    padding: "10px 26px",
    borderRadius: "999px",
    border: following ? "1px solid var(--border)" : "none",
    background: following ? "transparent" : "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: following ? "var(--text-muted)" : "var(--bg)",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  }),
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

export default function UserProfile({ uid, onBack, onOpenProfile }) {
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [posts, setPosts] = useState([]);
  const [followModal, setFollowModal] = useState(null); // null | "followers" | "following"

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
    if (!uid) return;
    setProfileLoading(true);
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      setProfileUser(snap.exists() ? snap.data() : null);
      setProfileLoading(false);
    });
    return unsub;
  }, [uid]);

  // Seguidores = usuarios cuyo campo "following" contiene este uid (en tiempo real)
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "users"), where("following", "array-contains", uid));
    const unsub = onSnapshot(q, (snap) => setFollowersCount(snap.size));
    return unsub;
  }, [uid]);

  const isMe = uid === currentUid;
  const myBlocked = myProfile?.blockedUsers || [];
  const isBlocked =
    myBlocked.includes(uid) || (profileUser?.blockedUsers || []).includes(currentUid);
  const isPrivateForMe = !!profileUser?.isPrivate && !isMe;
  // isWallPrivate es independiente de isPrivate: solo oculta la lista de
  // publicaciones (el resto del perfil sigue visible), mientras que
  // isPrivate ya ocultaba el muro además de otras cosas (chat, feed
  // principal). El dueño del perfil (isMe) siempre ve su propio muro.
  const isWallPrivateForMe = !!profileUser?.isWallPrivate && !isMe;
  const isWallHidden = isPrivateForMe || isWallPrivateForMe;

  useEffect(() => {
    if (!uid || isBlocked || isWallHidden) {
      setPosts([]);
      return;
    }
    const q = query(collection(db, "posts"), where("authorId", "==", uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setPosts(list);
    });
    return unsub;
  }, [uid, isBlocked, isWallHidden]);

  const isFollowing = (myProfile?.following || []).includes(uid);
  const followingCount = (profileUser?.following || []).length;

  const handleUnblock = async () => {
    if (!currentUid) return;
    await updateDoc(doc(db, "users", currentUid), { blockedUsers: arrayRemove(uid) });
  };

  const handleToggleFollow = async () => {
    if (!currentUid || isMe) return;
    await updateDoc(doc(db, "users", currentUid), {
      following: isFollowing ? arrayRemove(uid) : arrayUnion(uid),
    });
    if (!isFollowing) {
      await notify(uid, {
        type: "follow",
        fromUid: currentUid,
        fromName: myProfile?.displayName || "Alguien",
        fromIdentity: myProfile?.identity || "",
      });
    }
  };

  if (profileLoading) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            ← Volver
          </button>
          <p style={styles.notice}>Cargando perfil...</p>
        </div>
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            ← Volver
          </button>
          <p style={styles.notice}>Este perfil ya no existe.</p>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    // Si el bloqueo lo hiciste tú, te dejamos desbloquear desde aquí mismo.
    // Si te bloquearon a ti, dejamos el mensaje genérico: no revelamos quién bloqueó a quién.
    const iBlockedThem = myBlocked.includes(uid);
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            ← Volver
          </button>
          <div style={styles.notice}>
            <p style={{ margin: 0 }}>No puedes ver este perfil.</p>
            {iBlockedThem && (
              <button style={styles.unblockBtn} onClick={handleUnblock}>
                Desbloquear
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
          ← Volver
        </button>

        <div style={styles.header}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Avatar
              uid={uid}
              name={profileUser.displayName || profileUser.identity}
              identity={profileUser.identity}
              size="lg"
            />
          </div>
          <h1 style={styles.name}>{profileUser.displayName}</h1>
          <p style={styles.identity}>{profileUser.identity}</p>
          {profileUser.joinedAt && (
            <p style={styles.joined}>Miembro desde {profileUser.joinedAt}</p>
          )}

          <div style={styles.countsRow}>
            <div style={styles.countItem} onClick={() => setFollowModal("followers")}>
              <p style={styles.countNumber}>{followersCount}</p>
              <p style={styles.countLabel}>Seguidores</p>
            </div>
            <div style={styles.countItem} onClick={() => setFollowModal("following")}>
              <p style={styles.countNumber}>{followingCount}</p>
              <p style={styles.countLabel}>Siguiendo</p>
            </div>
          </div>

          {!isMe && currentUid && (
            <button style={styles.followBtn(isFollowing)} onClick={handleToggleFollow}>
              {isFollowing ? "Dejar de seguir" : "Seguir"}
            </button>
          )}

          <ProfileAbout profileUser={profileUser} />
        </div>

        {isPrivateForMe ? (
          <p style={styles.notice}>🔒 Este perfil es privado. No comparte sus publicaciones.</p>
        ) : isWallPrivateForMe ? (
          <p style={styles.notice}>🔒 Este muro es privado.</p>
        ) : posts.length === 0 ? (
          <p style={styles.notice}>Todavía no tiene publicaciones.</p>
        ) : (
          posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              currentUid={currentUid}
              myProfile={myProfile}
              onOpenProfile={onOpenProfile}
            />
          ))
        )}
      </div>

      {followModal && (
        <FollowListModal
          mode={followModal}
          targetUid={uid}
          currentUid={currentUid}
          myProfile={myProfile}
          onClose={() => setFollowModal(null)}
          onOpenProfile={onOpenProfile}
        />
      )}
    </div>
  );
}
