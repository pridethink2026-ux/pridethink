import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import Avatar from "./Avatar";

/*
  FollowListModal
  ---------------
  Modal que muestra la lista de "Seguidores" o "Siguiendo" de un usuario,
  reutilizable desde UserProfile.jsx (perfiles públicos) y AuthProfile.jsx
  (tu propio perfil).

  mode="following": lee en tiempo real users/{targetUid}.following (el
  arreglo de uids que esa persona sigue).
  mode="followers": consulta en tiempo real users donde
  "following" array-contains targetUid (quiénes la siguen). Ningún conteo
  se guarda como número aparte, todo se deriva en vivo de Firestore.

  Cada uid se resuelve a su perfil completo con su propio onSnapshot (mismo
  patrón que BlockedUserRow en AuthProfile.jsx), y se filtra la lista final
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
    boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
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

export default function FollowListModal({ mode, targetUid, currentUid, myProfile, onClose, onOpenProfile }) {
  const [rawUids, setRawUids] = useState([]);
  const [uidsReady, setUidsReady] = useState(false);
  const [profiles, setProfiles] = useState({});

  // Paso 1: obtener la lista de uids (seguidores o seguidos) en tiempo real.
  useEffect(() => {
    setUidsReady(false);
    if (!targetUid) return;

    if (mode === "following") {
      const unsub = onSnapshot(doc(db, "users", targetUid), (snap) => {
        setRawUids(snap.exists() ? snap.data().following || [] : []);
        setUidsReady(true);
      });
      return unsub;
    }

    const q = query(collection(db, "users"), where("following", "array-contains", targetUid));
    const unsub = onSnapshot(q, (snap) => {
      setRawUids(snap.docs.map((d) => d.id));
      setUidsReady(true);
    });
    return unsub;
  }, [mode, targetUid]);

  // Paso 2: resolver cada uid a su perfil completo (nombre, identidad, privacidad, bloqueos).
  useEffect(() => {
    if (rawUids.length === 0) {
      setProfiles({});
      return;
    }
    const unsubs = rawUids.map((id) =>
      onSnapshot(doc(db, "users", id), (snap) => {
        setProfiles((prev) => ({
          ...prev,
          [id]: snap.exists() ? { uid: id, ...snap.data() } : null,
        }));
      })
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawUids.join(",")]);

  const myBlocked = myProfile?.blockedUsers || [];
  const stillResolving = !uidsReady || rawUids.some((id) => !(id in profiles));

  const visible = rawUids
    .map((id) => profiles[id])
    .filter((p) => {
      if (!p) return false;
      if (p.isPrivate) return false;
      if (myBlocked.includes(p.uid)) return false;
      if ((p.blockedUsers || []).includes(currentUid)) return false;
      return true;
    });

  const title = mode === "followers" ? "Seguidores" : "Siguiendo";

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
          <button style={styles.closeBtn} onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>
        <div style={styles.list}>
          {stillResolving && visible.length === 0 && (
            <p style={styles.empty}>Cargando...</p>
          )}
          {!stillResolving && visible.length === 0 && (
            <p style={styles.empty}>
              {mode === "followers" ? "Todavía no tiene seguidores." : "Todavía no sigue a nadie."}
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
                size="md"
              />
              <div>
                <p style={styles.rowName}>{p.displayName || "Sin nombre"}</p>
                <p style={styles.rowIdentity}>{p.identity}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
