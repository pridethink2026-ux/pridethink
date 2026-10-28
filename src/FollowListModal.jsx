import React, { useMemo } from "react";
import { useAllUsersContext, useAllUsersReady, useFollowerUids, useUserProfile } from "./AllUsersContext";
import Avatar from "./Avatar";
import { useMyBlocks, isBlockedEitherWay } from "./Blocks";
import { useLanguage } from "./LanguageContext";

/*
  FollowListModal
  ---------------
  Modal que muestra la lista de "Seguidores" o "Siguiendo" de un usuario,
  reutilizable desde UserProfile.jsx (perfiles públicos) y AuthProfile.jsx
  (tu propio perfil).

  mode="following": users/{targetUid}.following (el arreglo de uids que
  esa persona sigue).
  mode="followers": los usuarios cuyo "following" contiene targetUid
  (quiénes la siguen). Ningún conteo se guarda como número aparte, todo se
  deriva en vivo.

  Todo sale de AllUsersContext (punto 70, commit 9c): antes, una consulta
  más un onSnapshot por cada persona de la lista, que leían otra vez
  documentos que esa lista ya tiene. Se filtra la lista final
  para respetar bloqueos (en cualquier dirección) y perfiles privados, igual
  que en Search.jsx y Chat.jsx.
*/

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 50,
    boxSizing: "border-box",
  },
  panel: {
    width: "100%",
    maxWidth: "400px",
    maxHeight: "80vh",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "22px",
    boxShadow: "0 20px 50px rgba(var(--shadow-rgb), 0.45)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 700,
    margin: 0,
  },
  closeBtn: {
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    width: "30px",
    height: "30px",
    color: "var(--text-muted)",
    fontSize: "14px",
    cursor: "pointer",
    flexShrink: 0,
  },
  list: {
    overflowY: "auto",
    padding: "10px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 10px",
    borderRadius: "14px",
    cursor: "pointer",
  },
  rowName: { fontSize: "14px", fontWeight: 600, margin: 0 },
  rowIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: "1px 0 0" },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "13px",
    padding: "30px 20px",
  },
};

export default function FollowListModal({ mode, targetUid, currentUid, onClose, onOpenProfile }) {
  const { t } = useLanguage();
  const allUsers = useAllUsersContext();
  const usersReady = useAllUsersReady();
  const target = useUserProfile(targetUid);
  const followerUids = useFollowerUids(targetUid);
  const rawUids = mode === "following" ? target?.following || [] : followerUids;
  const profiles = useMemo(() => {
    const map = {};
    allUsers.forEach((u) => {
      map[u.uid] = u;
    });
    return map;
  }, [allUsers]);

  const { blockedByMe, blockedMe } = useMyBlocks(currentUid);
  const stillResolving = !usersReady;

  const visible = rawUids
    .map((id) => profiles[id])
    .filter((p) => {
      if (!p) return false;
      if (p.isPrivate) return false;
      if (isBlockedEitherWay(blockedByMe, blockedMe, p.uid)) return false;
      return true;
    });

  const title = mode === "followers" ? t("followList.titleFollowers") : t("followList.titleFollowing");

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
          <button style={styles.closeBtn} onClick={onClose} title={t("report.close")}>
            ✕
          </button>
        </div>
        <div style={styles.list}>
          {stillResolving && visible.length === 0 && (
            <p style={styles.empty}>{t("common.loading")}</p>
          )}
          {!stillResolving && visible.length === 0 && (
            <p style={styles.empty}>
              {mode === "followers" ? t("followList.emptyFollowers") : t("followList.emptyFollowing")}
            </p>
          )}
          {visible.map((p) => (
            <div
              key={p.uid}
              style={styles.row}
              onClick={() => {
                onClose();
                onOpenProfile(p.uid);
              }}
            >
              <Avatar
                uid={p.uid}
                name={p.displayName || p.identity}
                identity={p.identity}
                photoURL={p.photoURL}
                size="md"
              />
              <div>
                <p style={styles.rowName}>{p.displayName || t("chat.defaultName")}</p>
                <p style={styles.rowIdentity}>{p.identity}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
