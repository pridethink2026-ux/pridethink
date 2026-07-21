import React, { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useLanguage } from "./LanguageContext";

/*
  ReportButton
  ------------
  Botón "⋮" con un menú de un solo ítem ("Reportar") + el modal para elegir
  el motivo y enviarlo. Reutilizable: se usa en `PostCard` (Feed.jsx, para
  reportar una publicación) y en `UserProfile.jsx` (para reportar a un
  usuario) — quien lo usa decide `targetType`/`targetId`, y nunca lo
  renderiza sobre contenido propio (isMine/isMe se revisa en cada lugar
  donde se usa, no acá).

  Colección en Firestore: "reports/{reportId}"
    -> { reporterUid, targetType: "post"|"user", targetId, reason, details, createdAt, status: "pending" }

  CÓMO SE EVITA REPORTAR DOS VECES LO MISMO (sin necesitar leer la
  colección "reports" desde el cliente, que las reglas de seguridad NO
  permiten — ver firestore.rules): el id del documento NO es autogenerado,
  es determinista: `${reporterUid}_${targetType}_${targetId}`. Si ya existe
  un reporte con ese mismo id, Firestore trata el intento de volver a
  escribirlo como una operación "update" (no "create") — y como las reglas
  solo permiten `create` para esta colección (nunca `update`), el intento
  se rechaza solo, sin que el cliente tenga que leer nada primero. Acá se
  interpreta cualquier error "permission-denied" al enviar como "ya
  reportaste esto" (en este flujo específico, con un usuario autenticado y
  un reporte bien formado, esa es la única razón por la que fallaría).
*/

const REPORT_REASONS = [
  { value: "spam", labelKey: "report.reasonSpam" },
  { value: "hate_speech", labelKey: "report.reasonHateSpeech" },
  { value: "harassment", labelKey: "report.reasonHarassment" },
  { value: "inappropriate_content", labelKey: "report.reasonInappropriate" },
  { value: "impersonation", labelKey: "report.reasonImpersonation" },
  { value: "other", labelKey: "report.reasonOther" },
];

const styles = {
  wrapper: { position: "relative", flexShrink: 0 },
  menuBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    width: "28px",
    height: "28px",
    fontSize: "15px",
    lineHeight: 1,
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  menuPanel: {
    position: "absolute",
    top: "34px",
    right: 0,
    minWidth: "150px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "6px",
    zIndex: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 10px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--text)",
    cursor: "pointer",
  },
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
    maxHeight: "85vh",
    overflowY: "auto",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "22px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
    padding: "22px 20px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "17px",
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
  label: {
    display: "block",
    fontSize: "13px",
    color: "var(--text-muted)",
    margin: "0 0 6px",
    fontWeight: 500,
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "15px",
    color: "var(--text)",
    marginBottom: "16px",
    outline: "none",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "14px",
    color: "var(--text)",
    marginBottom: "16px",
    outline: "none",
    resize: "none",
    minHeight: "70px",
    fontFamily: "inherit",
  },
  button: {
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  buttonGhost: {
    width: "100%",
    padding: "10px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    marginTop: "8px",
  },
  error: {
    background: "var(--accent2-softer)",
    border: "1px solid var(--accent2-soft-border)",
    color: "var(--accent2)",
    fontSize: "13px",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "14px",
  },
  success: {
    background: "var(--accent-softer)",
    border: "1px solid var(--accent-soft-border)",
    color: "var(--accent)",
    fontSize: "14px",
    lineHeight: 1.5,
    borderRadius: "10px",
    padding: "16px",
    textAlign: "center",
  },
};

function ReportModal({ targetType, targetId, currentUid, onClose }) {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | duplicate | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setStatus("sending");
    try {
      const reportId = `${currentUid}_${targetType}_${targetId}`;
      await setDoc(doc(db, "reports", reportId), {
        reporterUid: currentUid,
        targetType,
        targetId,
        reason,
        details: reason === "other" ? details.trim() : "",
        createdAt: serverTimestamp(),
        status: "pending",
      });
      setStatus("sent");
    } catch (err) {
      setStatus(err.code === "permission-denied" ? "duplicate" : "error");
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{t("report.action")}</h2>
          <button style={styles.closeBtn} onClick={onClose} title={t("report.close")}>
            ✕
          </button>
        </div>

        {status === "sent" ? (
          <div style={styles.success}>{t("report.success")}</div>
        ) : status === "duplicate" ? (
          <div style={styles.success}>{t("report.alreadyReported")}</div>
        ) : (
          <form onSubmit={handleSubmit}>
            {status === "error" && <div style={styles.error}>{t("report.error")}</div>}

            <label style={styles.label} htmlFor="reportReason">
              {t("report.reasonLabel")}
            </label>
            <select
              id="reportReason"
              style={styles.select}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            >
              <option value="" disabled>
                {t("report.reasonPlaceholder")}
              </option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.labelKey)}
                </option>
              ))}
            </select>

            {reason === "other" && (
              <>
                <label style={styles.label} htmlFor="reportDetails">
                  {t("report.detailsLabel")}
                </label>
                <textarea
                  id="reportDetails"
                  style={styles.textarea}
                  placeholder={t("report.detailsPlaceholder")}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </>
            )}

            <button type="submit" style={styles.button} disabled={status === "sending"}>
              {status === "sending" ? t("report.submitting") : t("report.submit")}
            </button>
            <button type="button" style={styles.buttonGhost} onClick={onClose}>
              {t("report.cancel")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ReportButton({ targetType, targetId, currentUid }) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (!currentUid) return null;

  return (
    <div style={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        style={styles.menuBtn}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        title={t("report.action")}
      >
        ⋮
      </button>
      {menuOpen && (
        <div style={styles.menuPanel}>
          <div
            style={styles.menuItem}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              setModalOpen(true);
            }}
          >
            🚩 {t("report.action")}
          </div>
        </div>
      )}
      {modalOpen && (
        <ReportModal
          targetType={targetType}
          targetId={targetId}
          currentUid={currentUid}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
