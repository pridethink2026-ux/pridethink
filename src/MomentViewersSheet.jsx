import React, { useEffect, useState } from "react";
import Avatar from "./Avatar";
import { useLanguage } from "./LanguageContext";
import { timeAgo } from "./utils";

/*
  MomentViewersSheet
  ------------------
  Quién vio uno de tus momentos (punto 66, commit 5). Se abre desde el
  botón "👁 N" de MomentViewer.jsx, que ya trae la lista filtrada (sin
  bloqueos en ninguna dirección y solo personas que existen en
  AllUsersContext), así que el número del botón coincide con lo que se ve
  acá.

  Props:
  - `viewers`: [{ uid, viewedAt, liked, user }], el más reciente primero.
    Quien le dio la estrella (commit 6) lleva ⭐ al lado.
  - `onClose()`.

  Usa los colores del tema (es un panel normal, como el de ReportButton),
  aunque se abra encima del visor negro.
*/

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 1,
  },
  panel: {
    width: "100%",
    maxWidth: "520px",
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "22px 22px 0 0",
    boxShadow: "0 -10px 40px rgba(0,0,0,0.45)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 18px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 700,
    margin: 0,
  },
  closeBtn: (hover) => ({
    background: hover ? "var(--border)" : "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    width: "30px",
    height: "30px",
    color: "var(--text-muted)",
    fontSize: "14px",
    cursor: "pointer",
    flexShrink: 0,
  }),
  list: { overflowY: "auto", padding: "8px 10px 16px" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px",
  },
  rowText: { flex: 1, minWidth: 0 },
  name: {
    margin: 0,
    fontSize: "14px",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  time: { margin: "1px 0 0", fontSize: "12px", color: "var(--text-muted)" },
  star: { fontSize: "18px", flexShrink: 0 },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "13px",
    padding: "26px 16px",
    margin: 0,
  },
};

export default function MomentViewersSheet({ viewers, onClose }) {
  const { t } = useLanguage();
  const [closeHover, setCloseHover] = useState(false);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.panel}
        role="dialog"
        aria-label={t("moments.viewersTitle", { n: viewers.length })}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>{t("moments.viewersTitle", { n: viewers.length })}</h2>
          <button
            type="button"
            style={styles.closeBtn(closeHover)}
            onClick={onClose}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            aria-label={t("moments.close")}
            title={t("moments.close")}
          >
            ✕
          </button>
        </div>
        <div style={styles.list}>
          {viewers.length === 0 && <p style={styles.empty}>{t("moments.viewersEmpty")}</p>}
          {viewers.map((v) => (
            <div key={v.uid} style={styles.row}>
              <Avatar
                uid={v.uid}
                name={v.user.displayName}
                identity={v.user.identity}
                photoURL={v.user.photoURL}
                size="md"
              />
              <div style={styles.rowText}>
                <p style={styles.name}>{v.user.displayName || t("chat.defaultName")}</p>
                <p style={styles.time}>{timeAgo(v.viewedAt, t)}</p>
              </div>
              {v.liked && (
                <span style={styles.star} role="img" aria-label={t("moments.likedBy")} title={t("moments.likedBy")}>
                  ⭐
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
