import React, { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import Avatar from "./Avatar";
import ReportButton from "./ReportButton";
import { useAllUsersContext } from "./AllUsersContext";
import { useLanguage } from "./LanguageContext";
import { useMoments } from "./MomentsContext";
import { MOMENT_DURATION_MS, deleteMoment } from "./moments";
import { timeAgo } from "./utils";

/*
  MomentViewer
  ------------
  Visor de Momentos a pantalla completa (punto 66). Cada foto se muestra
  MOMENT_DURATION_MS (17 s) con una barra de progreso por momento arriba;
  los momentos de una persona pasan uno tras otro.

  - Tocar el tercio izquierdo retrocede, el resto avanza.
  - Mantener presionado (más de HOLD_MS) pausa; soltar sigue.
  - ✕ o Escape cierran; ← / → del teclado retroceden/avanzan.
  - El tiempo corre recién cuando la foto terminó de cargar.
  - En tus momentos, 🗑 los borra (pide confirmar, moments.js →
    deleteMoment); en los ajenos, "⋮" los reporta (ReportButton.jsx,
    targetType "moment"). Mientras está abierta la confirmación o el
    reporte, el tiempo se detiene y tocar la foto no avanza.

  Props:
  - `authorUids` (array): los autores en el orden de la tira.
  - `startIndex` (número): con qué autor empezar.
  - `continueToNext` (booleano): al terminar los momentos de un autor,
    pasar al siguiente de `authorUids` que tenga momentos sin ver
    (abierto desde la tira) o cerrar (abierto desde un perfil). Empieza
    siempre por el primer momento sin ver de cada autor.
  - `onClose()` (obligatoria).

  Los ids salen de MomentsContext (momentIndex) y cada momento se lee de a
  uno por id (getDoc) — nunca con una consulta, ver firestore.rules. Si un
  momento ya no se puede leer (venció, se borró, o cambió la privacidad
  o el bloqueo en el medio), simplemente se salta.

  Colores fijos a propósito (mismo criterio que ImageViewer.jsx): el fondo
  negro, las barras y el texto blanco tienen que verse sobre CUALQUIER
  foto, sin importar el tema activo.
*/

const HOLD_MS = 200;
const PREV_ZONE = 1 / 3;

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#000",
    zIndex: 60,
    display: "flex",
    justifyContent: "center",
  },
  column: {
    position: "relative",
    width: "100%",
    maxWidth: "520px",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  bars: {
    display: "flex",
    gap: "4px",
    padding: "10px 12px 0",
  },
  barTrack: {
    flex: 1,
    height: "3px",
    borderRadius: "2px",
    background: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  barFill: (fraction) => ({
    width: `${Math.min(1, Math.max(0, fraction)) * 100}%`,
    height: "100%",
    background: "#fff",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    color: "#fff",
  },
  headerText: { flex: 1, minWidth: 0 },
  name: {
    margin: 0,
    fontSize: "14px",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  time: { margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.7)" },
  iconBtn: (hover) => ({
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.3)",
    background: hover ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.4)",
    color: "#fff",
    fontSize: "20px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  }),
  stage: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    cursor: "pointer",
  },
  image: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    display: "block",
    pointerEvents: "none",
  },
  status: { color: "rgba(255,255,255,0.7)", fontSize: "14px" },
  reportBtn: {
    width: "40px",
    height: "40px",
    border: "1px solid rgba(255,255,255,0.3)",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    fontSize: "20px",
  },
  confirm: {
    position: "absolute",
    left: "12px",
    right: "12px",
    bottom: "16px",
    padding: "14px",
    borderRadius: "16px",
    background: "rgba(20,20,20,0.92)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "#fff",
    fontSize: "14px",
    textAlign: "center",
  },
  confirmText: { margin: "0 0 12px" },
  // El botón de borrar y el error usan --accent2, como el resto de los
  // errores de la app (sobre el panel oscuro fijo de arriba).
  confirmError: { margin: "0 0 12px", color: "var(--accent2)", fontSize: "13px" },
  confirmRow: { display: "flex", gap: "10px" },
  confirmBtn: (danger, hover) => ({
    flex: 1,
    padding: "10px",
    borderRadius: "12px",
    border: danger ? "none" : "1px solid rgba(255,255,255,0.3)",
    background: danger ? "var(--accent2)" : hover ? "rgba(255,255,255,0.15)" : "transparent",
    opacity: danger && hover ? 0.85 : 1,
    color: danger ? "var(--bg)" : "#fff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  }),
};

export default function MomentViewer({ authorUids, startIndex = 0, continueToNext = false, onClose }) {
  const { t } = useLanguage();
  const { currentUid, myIndex, getVisibleMoments, getMomentState, getFirstUnseenIndex, markSeen, flushSeen } =
    useMoments();
  const allUsers = useAllUsersContext();

  const [authorPos, setAuthorPos] = useState(startIndex);
  const [moments, setMoments] = useState(null); // null = cargando
  const [momentPos, setMomentPos] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [closeHover, setCloseHover] = useState(false);
  const [deleteHover, setDeleteHover] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [cancelHover, setCancelHover] = useState(false);
  const [yesHover, setYesHover] = useState(false);

  const elapsedRef = useRef(0);
  const holdTimerRef = useRef(null);
  const heldRef = useRef(false);
  const blockedRef = useRef(false);

  const authorUid = authorUids[authorPos];
  const author = allUsers.find((u) => u.uid === authorUid);
  const current = moments ? moments[momentPos] : null;
  const currentId = current ? current.id : null;
  const isMine = authorUid === currentUid;
  // Con la confirmación de borrar o el reporte abiertos, todo se detiene.
  const dialogOpen = reportOpen || confirmDelete;

  // Desde la tira: el siguiente autor que todavía tenga algo sin ver.
  // Desde un perfil (continueToNext false): cerrar.
  const goNextAuthor = () => {
    const nextPos = continueToNext
      ? authorUids.findIndex((uid, i) => i > authorPos && getMomentState(uid) === "unseen")
      : -1;
    if (nextPos !== -1) setAuthorPos(nextPos);
    else onClose();
  };

  const next = () => {
    if (moments && momentPos < moments.length - 1) setMomentPos(momentPos + 1);
    else goNextAuthor();
  };

  const prev = () => {
    if (momentPos > 0) setMomentPos(momentPos - 1);
    else if (continueToNext && authorPos > 0) setAuthorPos(authorPos - 1);
    else {
      elapsedRef.current = 0;
      setProgress(0);
    }
  };

  // Los handlers del teclado y del temporizador viven fuera del render:
  // se leen desde un ref para usar siempre la versión con el estado actual.
  const actionsRef = useRef({ next, prev, onClose, dialogOpen });
  actionsRef.current = { next, prev, onClose, dialogOpen };

  // Al cambiar de autor: leer sus momentos de a uno por id. Se toma la
  // lista de ids de ESE momento (no se sigue en vivo) para que la
  // secuencia no cambie mientras se mira. Cada momento guarda el createdAt
  // de su entrada del índice (indexCreatedAt), que es con lo que se
  // marcan los vistos (MomentsContext). Empieza en el primero sin ver.
  // Al irse de este autor (o cerrar) se guardan los vistos.
  useEffect(() => {
    let cancelled = false;
    setMoments(null);
    setMomentPos(0);
    const entries = getVisibleMoments(authorUid);
    Promise.all(
      entries.map((e) =>
        getDoc(doc(db, "moments", e.id))
          .then((snap) => (snap.exists() ? { id: snap.id, ...snap.data(), indexCreatedAt: e.createdAt } : null))
          .catch(() => null)
      )
    ).then((docs) => {
      if (cancelled) return;
      const readable = docs.filter(Boolean);
      if (readable.length === 0) actionsRef.current.next();
      else {
        setMomentPos(getFirstUnseenIndex(authorUid, readable.map((m) => ({ createdAt: m.indexCreatedAt }))));
        setMoments(readable);
      }
    });
    return () => {
      cancelled = true;
      flushSeen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorUid]);

  // Cada momento nuevo arranca de cero y espera a que su foto cargue.
  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
    setImgLoaded(false);
    setConfirmDelete(false);
    setDeleteError(false);
  }, [currentId]);

  // Un momento cuenta como visto apenas su foto se muestra.
  useEffect(() => {
    if (imgLoaded && current) markSeen(authorUid, current.indexCreatedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, currentId]);

  // Precarga la foto siguiente para que no haya espera al avanzar.
  useEffect(() => {
    const following = moments && moments[momentPos + 1];
    if (following) new Image().src = following.imageURL;
  }, [moments, momentPos]);

  // Temporizador: corre solo con la foto cargada y sin pausa.
  useEffect(() => {
    if (!current || !imgLoaded || paused || dialogOpen) return;
    let frame;
    const start = performance.now() - elapsedRef.current;
    const tick = (time) => {
      elapsedRef.current = time - start;
      if (elapsedRef.current >= MOMENT_DURATION_MS) {
        actionsRef.current.next();
        return;
      }
      setProgress(elapsedRef.current / MOMENT_DURATION_MS);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current, imgLoaded, paused, dialogOpen]);

  useEffect(() => {
    const handleKey = (e) => {
      if (actionsRef.current.dialogOpen) return;
      if (e.key === "Escape") actionsRef.current.onClose();
      else if (e.key === "ArrowLeft") actionsRef.current.prev();
      else if (e.key === "ArrowRight") actionsRef.current.next();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => () => clearTimeout(holdTimerRef.current), []);

  const handlePointerDown = () => {
    // Un toque que cierra el menú de reportar no cuenta como avanzar.
    blockedRef.current = dialogOpen;
    if (blockedRef.current) return;
    heldRef.current = false;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      heldRef.current = true;
      setPaused(true);
    }, HOLD_MS);
  };

  const handlePointerUp = (e) => {
    if (blockedRef.current) {
      blockedRef.current = false;
      return;
    }
    clearTimeout(holdTimerRef.current);
    if (heldRef.current) {
      heldRef.current = false;
      setPaused(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * PREV_ZONE) prev();
    else next();
  };

  const handlePointerCancel = () => {
    clearTimeout(holdTimerRef.current);
    heldRef.current = false;
    setPaused(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteMoment(currentUid, current, myIndex);
      const rest = moments.filter((m) => m.id !== current.id);
      setConfirmDelete(false);
      if (rest.length === 0) goNextAuthor();
      else {
        setMoments(rest);
        setMomentPos(Math.min(momentPos, rest.length - 1));
      }
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={t("moments.viewerLabel")}>
      <div style={styles.column}>
        <div style={styles.bars}>
          {(moments || [null]).map((m, i) => (
            <div key={m ? m.id : i} style={styles.barTrack}>
              <div style={styles.barFill(i < momentPos ? 1 : i === momentPos ? progress : 0)} />
            </div>
          ))}
        </div>

        <div style={styles.header}>
          <Avatar
            uid={authorUid}
            name={author?.displayName}
            identity={author?.identity}
            photoURL={author?.photoURL}
            size="md"
          />
          <div style={styles.headerText}>
            <p style={styles.name}>{author?.displayName || ""}</p>
            {current && <p style={styles.time}>{timeAgo(current.createdAt, t)}</p>}
          </div>
          {current && isMine && (
            <button
              type="button"
              style={styles.iconBtn(deleteHover)}
              onClick={() => setConfirmDelete(true)}
              onMouseEnter={() => setDeleteHover(true)}
              onMouseLeave={() => setDeleteHover(false)}
              aria-label={t("moments.delete")}
              title={t("moments.delete")}
            >
              🗑
            </button>
          )}
          {current && !isMine && (
            <ReportButton
              key={current.id}
              targetType="moment"
              targetId={current.id}
              currentUid={currentUid}
              extraFields={{
                momentAuthorId: current.authorId,
                momentImageURL: current.imageURL,
                momentCaption: current.caption,
              }}
              menuButtonStyle={styles.reportBtn}
              onOpenChange={setReportOpen}
            />
          )}
          <button
            type="button"
            style={styles.iconBtn(closeHover)}
            onClick={onClose}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            aria-label={t("moments.close")}
            title={t("moments.close")}
          >
            ✕
          </button>
        </div>

        <div
          style={styles.stage}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          {current ? (
            <img
              key={current.id}
              src={current.imageURL}
              alt={current.caption || t("moments.imageAlt", { name: author?.displayName || "" })}
              style={styles.image}
              draggable={false}
              onLoad={() => setImgLoaded(true)}
              onError={next}
            />
          ) : (
            <span style={styles.status}>{t("moments.loading")}</span>
          )}
        </div>

        {confirmDelete && (
          <div style={styles.confirm} role="alertdialog" aria-label={t("moments.delete")}>
            <p style={styles.confirmText}>{t("moments.deleteConfirm")}</p>
            {deleteError && <p style={styles.confirmError}>{t("moments.errorDelete")}</p>}
            <div style={styles.confirmRow}>
              <button
                type="button"
                style={styles.confirmBtn(false, cancelHover)}
                onClick={() => setConfirmDelete(false)}
                onMouseEnter={() => setCancelHover(true)}
                onMouseLeave={() => setCancelHover(false)}
                disabled={deleting}
              >
                {t("moments.deleteCancel")}
              </button>
              <button
                type="button"
                style={styles.confirmBtn(true, yesHover)}
                onClick={handleDelete}
                onMouseEnter={() => setYesHover(true)}
                onMouseLeave={() => setYesHover(false)}
                disabled={deleting}
              >
                {deleting ? t("moments.deleting") : t("moments.deleteYes")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
