import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import Avatar from "./Avatar";
import MomentViewersSheet from "./MomentViewersSheet";
import ReportButton from "./ReportButton";
import { useBlocksContext } from "./BlocksContext";
import { isBlockedEitherWay } from "./Blocks";
import { useAllUsersContext } from "./AllUsersContext";
import { useLanguage } from "./LanguageContext";
import { useMoments } from "./MomentsContext";
import { localized } from "./musicLibrary";
import { isSoundMuted } from "./sound";
import { useMomentMusic } from "./useMomentMusic";
import {
  MAX_REPLY_LENGTH,
  MOMENT_DURATION_MS,
  deleteMoment,
  registerView,
  sendMomentReply,
  setMomentLike,
} from "./moments";
import { notify, timeAgo } from "./utils";

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
  - Quién vio (commit 5): al mostrarse un momento ajeno (no visto antes)
    te registra en moments/{id}/momentViewers (moments.js →
    registerView). En tus momentos, "👁 N" abre MomentViewersSheet con la
    lista en vivo; N cuenta solo a quienes aparecen en ella (sin bloqueos
    en ninguna dirección). La primera vez que miras un momento ajeno en
    este dispositivo se avisa que el autor puede ver quién lo vio.
  - Estrella (commit 6): en los momentos ajenos, ⭐ la pone o la quita
    (moments.js → setMomentLike, sobre tu propio documento de
    momentViewers, que se escucha en vivo); solo la primera estrella
    notifica al autor (notify tipo "momentLike"). En tus momentos el botón
    pasa a "👁 N · ⭐ M", con el mismo filtro de la lista.
  - Responder (commit 7): en los momentos ajenos, el campo de abajo manda
    la respuesta como mensaje al chat con el autor (moments.js →
    sendMomentReply, notificación "message"). Mientras el campo tiene el
    foco o se está enviando, el tiempo se pausa. Con perfil privado se
    avisa que el autor no podrá contestarte por chat (Chat.jsx no muestra
    perfiles privados).
  - Música (punto 79, commit C): si el momento tiene `music`, suena ese
    tramo sincronizado con el tiempo del momento (useMomentMusic.js): se
    pausa con todo lo que pausa el tiempo y se detiene al avanzar o
    cerrar. Arriba se ve "♪ Título · Compositor" y un botón 🔊/🔇 que
    silencia solo la música de este visor (empieza silenciado si
    "Silenciar sonidos" está activo en el perfil). Si el navegador no deja
    reproducir solo, aparece "Toca para escuchar".

  Props:
  - `authorUids` (array): los autores en el orden de la tira.
  - `startIndex` (número): con qué autor empezar.
  - `continueToNext` (booleano): al terminar los momentos de un autor,
    pasar al siguiente de `authorUids` que tenga momentos sin ver
    (abierto desde la tira) o cerrar (abierto desde un perfil). Empieza
    siempre por el primer momento sin ver de cada autor.
  - `startMomentId` (opcional): abrir en ese momento del primer autor (lo
    usa App.js al tocar una notificación "momentLike"). Si ya no está
    activo, se muestra "Este momento ya no está disponible".
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
const VIEWERS_NOTICE_KEY = "pt-moment-viewers-notice";

// El aviso de "el autor ve quién vio" se muestra una vez por dispositivo.
// localStorage puede fallar (modo privado): en ese caso se muestra igual.
function viewersNoticeSeen() {
  try {
    return localStorage.getItem(VIEWERS_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberViewersNotice() {
  try {
    localStorage.setItem(VIEWERS_NOTICE_KEY, "1");
  } catch {
    // sin almacenamiento: el aviso vuelve a salir la próxima vez
  }
}

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
  musicLabel: {
    margin: "1px 0 0",
    fontSize: "12px",
    color: "rgba(255,255,255,0.85)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tapToListen: (hover) => ({
    position: "absolute",
    top: "84px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2,
    padding: "8px 16px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.4)",
    background: hover ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),
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
  footer: {
    display: "flex",
    justifyContent: "center",
    padding: "8px 12px 14px",
    minHeight: "40px",
  },
  likeBtn: (liked, hover) => ({
    flexShrink: 0,
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.3)",
    background: hover ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.4)",
    color: "#fff",
    fontSize: liked ? "22px" : "24px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  }),
  replyRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
  },
  replyInput: {
    flex: 1,
    minWidth: 0,
    height: "44px",
    boxSizing: "border-box",
    padding: "0 16px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.4)",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    fontSize: "14px",
    fontFamily: "inherit",
    outline: "none",
  },
  sendBtn: (hover, disabled) => ({
    height: "44px",
    padding: "0 16px",
    borderRadius: "999px",
    border: "none",
    background: "var(--accent)",
    opacity: disabled ? 0.5 : hover ? 0.85 : 1,
    color: "var(--bg)",
    fontSize: "14px",
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    flexShrink: 0,
  }),
  replyNote: (isError) => ({
    margin: "0 12px 6px",
    fontSize: "12px",
    textAlign: "center",
    color: isError ? "var(--accent2)" : "rgba(255,255,255,0.8)",
  }),
  viewersBtn: (hover) => ({
    padding: "8px 16px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.3)",
    background: hover ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.4)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  }),
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

export default function MomentViewer({ authorUids, startIndex = 0, continueToNext = false, startMomentId, onClose }) {
  const { t, language } = useLanguage();
  const {
    currentUid,
    myIndex,
    getVisibleMoments,
    getMomentState,
    getFirstUnseenIndex,
    hasSeen,
    markSeen,
    flushSeen,
  } = useMoments();
  const allUsers = useAllUsersContext();
  const { blockedByMe, blockedMe } = useBlocksContext();

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
  const [viewerDocs, setViewerDocs] = useState([]); // momentViewers del momento actual (solo los míos)
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersHover, setViewersHover] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeHover, setNoticeHover] = useState(false);
  const [myView, setMyView] = useState(undefined); // mi documento de momentViewers: undefined = cargando, null = no existe
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeHover, setLikeHover] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyFocused, setReplyFocused] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [replyStatus, setReplyStatus] = useState(null); // null | "sent" | "error"
  const [sendHover, setSendHover] = useState(false);
  // Música (punto 79): solo de este visor; arranca como "Silenciar sonidos".
  const [musicMuted, setMusicMuted] = useState(() => isSoundMuted());
  const [muteHover, setMuteHover] = useState(false);
  const [tapHover, setTapHover] = useState(false);

  const elapsedRef = useRef(0);
  // Id del momento cuya foto terminó de cargar: imgLoaded se reinicia en un
  // efecto, así que en el primer render de un momento nuevo todavía vale
  // true por el anterior; con esto la música no arranca antes de tiempo.
  const loadedIdRef = useRef(null);
  const holdTimerRef = useRef(null);
  const heldRef = useRef(false);
  const blockedRef = useRef(false);
  const replyInputRef = useRef(null);
  const startMomentRef = useRef(startMomentId); // se usa una sola vez, en el primer autor

  const authorUid = authorUids[authorPos];
  const author = allUsers.find((u) => u.uid === authorUid);
  const current = moments ? moments[momentPos] : null;
  const currentId = current ? current.id : null;
  const isMine = authorUid === currentUid;
  const me = allUsers.find((u) => u.uid === currentUid);
  // Con la confirmación de borrar, el reporte, la lista de quién vio, el
  // aviso abiertos, o mientras escribes una respuesta, todo se detiene.
  const dialogOpen = reportOpen || confirmDelete || viewersOpen || noticeOpen || replyFocused || replySending;

  // La lista de quién vio, con el mismo filtro que el número del botón:
  // solo personas que existen y sin bloqueo en ninguna dirección.
  const viewers = useMemo(() => {
    const usersMap = {};
    allUsers.forEach((u) => {
      usersMap[u.uid] = u;
    });
    return viewerDocs
      .filter((v) => usersMap[v.uid] && !isBlockedEitherWay(blockedByMe, blockedMe, v.uid))
      .map((v) => ({ ...v, user: usersMap[v.uid] }));
  }, [viewerDocs, allUsers, blockedByMe, blockedMe]);
  const likeCount = viewers.filter((v) => v.liked).length;

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

  const nextMoment = moments ? moments[momentPos + 1] : null;
  const music = useMomentMusic({
    momentId: currentId,
    music: current?.music,
    nextMusic: nextMoment?.music,
    running: !!current && imgLoaded && loadedIdRef.current === currentId && !paused && !dialogOpen,
    elapsedRef,
    muted: musicMuted,
  });
  const musicTitle = music.track
    ? `${localized(music.track.title, language)} · ${localized(music.track.composer, language)}`
    : "";

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
      const wanted = startMomentRef.current;
      startMomentRef.current = null;
      if (wanted) {
        // Desde una notificación: ese momento puntual, o el aviso si venció.
        const pos = readable.findIndex((m) => m.id === wanted);
        if (pos === -1) setUnavailable(true);
        else {
          setMomentPos(pos);
          setMoments(readable);
        }
      } else if (readable.length === 0) actionsRef.current.next();
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
    setViewersOpen(false);
    setReplyText("");
    setReplyStatus(null);
  }, [currentId]);

  // En mis momentos: quién lo vio, en vivo, el más reciente primero.
  useEffect(() => {
    setViewerDocs([]);
    if (!currentId || !isMine) return;
    const unsub = onSnapshot(
      collection(db, "moments", currentId, "momentViewers"),
      (snap) => {
        const list = snap.docs.map((d) => ({ uid: d.id, viewedAt: d.data().viewedAt, liked: d.data().liked === true }));
        list.sort((a, b) => (b.viewedAt?.toMillis?.() || 0) - (a.viewedAt?.toMillis?.() || 0));
        setViewerDocs(list);
      },
      () => setViewerDocs([])
    );
    return unsub;
  }, [currentId, isMine]);

  // En momentos ajenos: mi propio documento de momentViewers, para saber
  // si ya le di la estrella (y si ya existe el documento).
  useEffect(() => {
    setMyView(undefined);
    if (!currentId || isMine || !currentUid) return;
    const unsub = onSnapshot(
      doc(db, "moments", currentId, "momentViewers", currentUid),
      (snap) => setMyView(snap.exists() ? snap.data() : null),
      () => setMyView(null)
    );
    return unsub;
  }, [currentId, isMine, currentUid]);

  // Un momento cuenta como visto apenas su foto se muestra. Si es ajeno y
  // no lo habías visto, además te registra en su lista de quién vio (y la
  // primera vez en este dispositivo, se avisa que el autor la ve).
  useEffect(() => {
    if (!imgLoaded || !current) return;
    if (!isMine) {
      if (!hasSeen(authorUid, current.indexCreatedAt)) registerView(currentUid, current.id, current.expireAt);
      if (!viewersNoticeSeen()) setNoticeOpen(true);
    }
    markSeen(authorUid, current.indexCreatedAt);
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

  const toggleLike = async () => {
    if (likeBusy || myView === undefined || !current) return;
    const moment = current;
    setLikeBusy(true);
    try {
      const first = await setMomentLike(currentUid, moment, !myView?.liked, myView);
      if (first) {
        notify(moment.authorId, {
          type: "momentLike",
          fromUid: currentUid,
          fromName: me?.displayName || "Alguien",
          fromIdentity: me?.identity || "",
          momentId: moment.id,
        }).catch(() => {});
      }
    } catch {
      // Sin permiso (venció o cambió la privacidad o un bloqueo): la
      // estrella simplemente no cambia.
    } finally {
      setLikeBusy(false);
    }
  };

  const handleSendReply = async () => {
    const text = replyText.trim();
    if (!text || replySending || !current) return;
    const moment = current;
    setReplySending(true);
    setReplyStatus(null);
    try {
      await sendMomentReply(currentUid, moment, text);
      notify(moment.authorId, {
        type: "message",
        fromUid: currentUid,
        fromName: me?.displayName || "Alguien",
        fromIdentity: me?.identity || "",
      }).catch(() => {});
      setReplyText("");
      setReplyStatus("sent");
      replyInputRef.current?.blur();
    } catch {
      // Venció, se borró o cambió el permiso mientras escribías: el texto
      // queda en el campo.
      setReplyStatus("error");
    } finally {
      setReplySending(false);
    }
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
            {current && music.track && (
              <p style={styles.musicLabel} aria-label={t("moments.musicLabel", { track: musicTitle })}>
                ♪ {musicTitle}
              </p>
            )}
          </div>
          {current && music.track && (
            <button
              type="button"
              style={styles.iconBtn(muteHover)}
              onClick={() => setMusicMuted(!musicMuted)}
              onMouseEnter={() => setMuteHover(true)}
              onMouseLeave={() => setMuteHover(false)}
              aria-pressed={musicMuted}
              aria-label={musicMuted ? t("moments.musicUnmute") : t("moments.musicMute")}
              title={musicMuted ? t("moments.musicUnmute") : t("moments.musicMute")}
            >
              {musicMuted ? "🔇" : "🔊"}
            </button>
          )}
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

        {current && music.track && music.needsTap && !musicMuted && (
          <button
            type="button"
            style={styles.tapToListen(tapHover)}
            onClick={music.tapToPlay}
            onMouseEnter={() => setTapHover(true)}
            onMouseLeave={() => setTapHover(false)}
          >
            {t("moments.tapToListen")}
          </button>
        )}

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
              onLoad={() => {
                loadedIdRef.current = current.id;
                setImgLoaded(true);
              }}
              onError={next}
            />
          ) : (
            <span style={styles.status}>{unavailable ? t("moments.unavailable") : t("moments.loading")}</span>
          )}
        </div>

        {current && !isMine && replyStatus && (
          <p style={styles.replyNote(replyStatus === "error")} role="status">
            {replyStatus === "sent" ? t("moments.replySent") : t("moments.replyError")}
          </p>
        )}
        {current && !isMine && replyFocused && me?.isPrivate && (
          <p style={styles.replyNote(false)}>
            {t("moments.replyPrivateNotice", { name: author?.displayName || "" })}
          </p>
        )}

        <div style={styles.footer}>
          {current && isMine && (
            <button
              type="button"
              style={styles.viewersBtn(viewersHover)}
              onClick={() => setViewersOpen(true)}
              onMouseEnter={() => setViewersHover(true)}
              onMouseLeave={() => setViewersHover(false)}
              aria-label={`${t("moments.viewersTitle", { n: viewers.length })} · ${t("moments.likesCount", { n: likeCount })}`}
            >
              👁 {viewers.length} · ⭐ {likeCount}
            </button>
          )}
          {current && !isMine && (
            <div style={styles.replyRow}>
              <input
                ref={replyInputRef}
                className="pt-native-placeholder"
                style={styles.replyInput}
                value={replyText}
                maxLength={MAX_REPLY_LENGTH}
                placeholder={t("moments.replyPlaceholder", { name: author?.displayName || "" })}
                aria-label={t("moments.replyPlaceholder", { name: author?.displayName || "" })}
                onChange={(e) => {
                  setReplyText(e.target.value);
                  if (replyStatus) setReplyStatus(null);
                }}
                onFocus={() => setReplyFocused(true)}
                onBlur={() => setReplyFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendReply();
                  } else if (e.key === "Escape") {
                    e.currentTarget.blur();
                  }
                }}
                disabled={replySending}
              />
              {replyText.trim() && (
                <button
                  type="button"
                  style={styles.sendBtn(sendHover, replySending)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSendReply}
                  onMouseEnter={() => setSendHover(true)}
                  onMouseLeave={() => setSendHover(false)}
                  disabled={replySending}
                >
                  {replySending ? t("moments.replySending") : t("moments.replySend")}
                </button>
              )}
              <button
                type="button"
                style={styles.likeBtn(!!myView?.liked, likeHover)}
                onClick={toggleLike}
                onMouseEnter={() => setLikeHover(true)}
                onMouseLeave={() => setLikeHover(false)}
                disabled={likeBusy || myView === undefined}
                aria-pressed={!!myView?.liked}
                aria-label={myView?.liked ? t("moments.unlike") : t("moments.like")}
                title={myView?.liked ? t("moments.unlike") : t("moments.like")}
              >
                {myView?.liked ? "⭐" : "☆"}
              </button>
            </div>
          )}
        </div>

        {viewersOpen && <MomentViewersSheet viewers={viewers} onClose={() => setViewersOpen(false)} />}

        {noticeOpen && (
          <div style={styles.confirm} role="alertdialog" aria-label={t("moments.viewersNoticeTitle")}>
            <p style={styles.confirmText}>{t("moments.viewersNotice")}</p>
            <div style={styles.confirmRow}>
              <button
                type="button"
                style={styles.confirmBtn(false, noticeHover)}
                onClick={() => {
                  rememberViewersNotice();
                  setNoticeOpen(false);
                }}
                onMouseEnter={() => setNoticeHover(true)}
                onMouseLeave={() => setNoticeHover(false)}
              >
                {t("moments.viewersNoticeOk")}
              </button>
            </div>
          </div>
        )}

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
