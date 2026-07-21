import React, { useEffect, useState, useRef, useMemo } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import Avatar from "./Avatar";
import { notify, useIsMobile } from "./utils";
import { useLanguage } from "./LanguageContext";
import { getDistinctReactionEmojis, useReactionPicker, ReactionPicker } from "./Reactions";
import { isEffectivelyOnline, formatLastSeen } from "./presence";
import { StickerImage, StickerPicker } from "./Stickers";

/*
  Chat
  ----
  Módulo de chat en tiempo real entre usuarios registrados.

  Estructura en Firestore:
  - "users/{uid}"                        -> perfil (ya existente, de AuthProfile.jsx)
  - "chats/{chatId}/messages/{msgId}"    -> mensajes de una conversación
      chatId = los dos UID ordenados alfabéticamente y unidos con "_"
      (así dos personas siempre llegan al mismo chatId, sin duplicados)

  Todo es en tiempo real: usa onSnapshot, no hace falta recargar la página
  para ver mensajes nuevos ni contactos nuevos.

  DISEÑO RESPONSIVO:
  En pantallas angostas (celular) se muestra una sola columna a la vez
  (lista de contactos O conversación activa, con botón "← Volver").
  En pantallas anchas (escritorio) se muestran lado a lado, como antes.
  Esto evita que el ancho fijo de la lista de contactos aplaste la
  conversación en celulares, que era lo que causaba el texto partido
  en una palabra por línea.

  NOTAS DE VOZ:
  Se graban con MediaRecorder (webm/opus, ~32kbps) y se guardan como
  base64 directo en el documento del mensaje (campo audioData), sin usar
  Firebase Storage (seguimos en el plan gratuito). Con el límite de 60
  segundos a ese bitrate el audio en base64 pesa unos 300KB como máximo,
  muy por debajo del límite de 1MB por documento de Firestore.
  Mensaje de audio: { senderId, type: "audio", audioData, audioDuration, createdAt }
  Mensaje de texto (como antes): { senderId, text, createdAt }
  Los tres tipos de mensaje pueden tener además `reactions: { [uid]: tipo }`
  (ver Reactions.jsx, compartido con Feed.jsx) — como mucho reaccionan las
  2 personas de la conversación. Mantener presionado (mobile) o pasar el
  mouse (desktop) sobre CUALQUIER mensaje (texto, nota de voz o post
  compartido) abre el mismo selector de 5 reacciones que en el muro; lo
  elegido se muestra como una burbujita superpuesta en la esquina del
  mensaje.

  POST COMPARTIDO (armado desde SharePostModal.jsx, que exporta getChatId
  de acá para escribir en el mismo chat): mensaje tipo
  { senderId, type: "shared_post", sharedPostId, createdAt }. A propósito
  NO guarda una copia del autor/texto del post (mismo principio que
  savedPosts/{uid}/items/{postId}: solo una referencia) — SharedPostPreview
  lee el post en vivo con onSnapshot, así que si se edita después de
  compartirlo la vista previa se actualiza sola, y si se borra muestra un
  aviso en vez de romperse. Tocar la vista previa llama a onOpenPost(id),
  que en App.js abre PostView.jsx.

  STICKERS (ver Stickers.jsx para el set de imágenes y la lógica
  compartida): botón nuevo junto al de grabar audio que abre un panel con
  una grilla de 10 stickers propios (SVG empaquetados en
  src/assets/stickers/, NO subidos por usuarios — no requieren Firebase
  Storage ni el plan Blaze). Mensaje tipo
  { senderId, type: "sticker", stickerId, createdAt }: solo guarda el id
  del sticker (nunca la imagen ni ninguna copia — mismo principio de "no
  duplicar datos" que ya usan los posts compartidos y las publicaciones
  guardadas). Se muestra en tamaño grande, SIN el fondo de burbuja de
  siempre (a diferencia del texto, la nota de voz y el post compartido,
  que sí lo tienen) — mismo estilo que las apps de chat conocidas.

  ESTADO "EN LÍNEA" / "ÚLTIMA CONEXIÓN" (ver presence.js): el puntito verde
  sobre el avatar aparece tanto en cada fila de la lista de contactos como
  en el encabezado de la conversación activa (`isEffectivelyOnline`, que
  ya combina el flag guardado con la frescura de "lastSeen" — ver
  presence.js). No hace falta filtrar por privacidad acá: `visibleContacts`
  YA excluye del todo a cualquier perfil privado (`if (c.isPrivate) return
  false`, ver más abajo), así que ningún contacto que aparezca en esta
  pantalla puede ser privado. El encabezado de la conversación usa la
  versión MÁS RECIENTE del contacto activo (buscada en `allUsers`, que se
  actualiza en vivo) en vez de la copia guardada en `activeContact` al
  hacer clic, para que el estado en línea se actualice mientras estás dentro
  de la conversación. Si no está en línea, debajo del nombre se muestra
  "Últ. vez hace X" (`formatLastSeen`, reutiliza `timeAgo()` — formato
  relativo en español, igual que los posts).
*/

const MAX_RECORD_SECONDS = 60;
const AUDIO_MIME_TYPE = "audio/webm;codecs=opus";
const MAX_AUDIO_BASE64_LENGTH = 900000; // margen de seguridad bajo el límite de 1MB por documento de Firestore

// Exportada porque SharePostModal.jsx también necesita armar el mismo
// chatId al compartir una publicación por chat.
export function getChatId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Ícono de micrófono SVG inline (trazo redondeado, currentColor para
// heredar el color del botón/estado y adaptarse al tema activo). Cuando
// "pulsing" es true (grabando), recibe la animación de pulso de index.css.
function MicIcon({ pulsing }) {
  return (
    <svg
      className={pulsing ? "pt-mic-pulse" : undefined}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8.5" y1="22" x2="15.5" y2="22" />
    </svg>
  );
}

// Ícono del botón de stickers: una "etiqueta" con la esquina despegada
// (forma clásica de sticker) y una carita simple adentro — mismo estilo de
// trazo (currentColor, redondeado) que MicIcon, para que los dos botones
// combinen.
function StickerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h7l6-6V7a4 4 0 0 0-4-4z" />
      <path d="M14 21v-4a2 2 0 0 1 2-2h4" />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="10" r="1" fill="currentColor" stroke="none" />
      <path d="M8.5 14a3.5 3.5 0 0 0 6 0" />
    </svg>
  );
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Waveform decorativa de las notas de voz: no representa el audio real
// (no lo analizamos), son barras con alturas pseudo-aleatorias pero FIJAS
// por mensaje, para que cada nota se vea distinta sin cambiar en cada
// render. La semilla es el id del mensaje en Firestore, así que tanto
// quien la envía como quien la recibe ven exactamente el mismo patrón.
const WAVEFORM_BARS = 24;
const WAVEFORM_BAR_WIDTH = 1.8;
const WAVEFORM_BAR_GAP = 1.8;
const WAVEFORM_VIEW_HEIGHT = 22;
const WAVEFORM_MIN_BAR = 4;
const WAVEFORM_MAX_BAR = 20;

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// PRNG determinista (mulberry32) a partir de la semilla numérica de arriba.
function seededRandom(seed) {
  let t = seed;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function getWaveformHeights(seedText) {
  const next = seededRandom(hashSeed(String(seedText)));
  const heights = [];
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    heights.push(WAVEFORM_MIN_BAR + next() * (WAVEFORM_MAX_BAR - WAVEFORM_MIN_BAR));
  }
  return heights;
}

// Barras SVG delgadas. El color sale de una variable de tema distinta según
// el tipo de burbuja (fondo degradado propio vs. fondo oscuro ajeno) para
// que siempre haya buen contraste, y solo se animan (efecto ecualizador)
// mientras el audio se está reproduciendo.
function AudioWaveform({ seed, playing, mine }) {
  const heights = useMemo(() => getWaveformHeights(seed), [seed]);
  const totalWidth =
    WAVEFORM_BARS * WAVEFORM_BAR_WIDTH + (WAVEFORM_BARS - 1) * WAVEFORM_BAR_GAP;

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${WAVEFORM_VIEW_HEIGHT}`}
      width={totalWidth}
      height={WAVEFORM_VIEW_HEIGHT}
      style={styles.waveform(mine)}
      aria-hidden="true"
    >
      {heights.map((h, i) => (
        <rect
          key={i}
          className={playing ? "pt-wave-bar pt-wave-playing" : "pt-wave-bar"}
          x={i * (WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP)}
          y={(WAVEFORM_VIEW_HEIGHT - h) / 2}
          width={WAVEFORM_BAR_WIDTH}
          height={h}
          rx={WAVEFORM_BAR_WIDTH / 2}
          fill="currentColor"
          style={{ animationDelay: `${i * 0.045}s` }}
        />
      ))}
    </svg>
  );
}

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
  shell: {
    width: "100%",
    maxWidth: "760px",
    height: "80vh",
    background: "var(--surface)",
    borderRadius: "24px",
    border: "1px solid var(--border)",
    boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
    display: "flex",
    overflow: "hidden",
  },
  contactsCol: (isMobile) => ({
    width: isMobile ? "100%" : "240px",
    borderRight: isMobile ? "none" : "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  }),
  contactsHeader: {
    padding: "18px 16px 12px",
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
    borderBottom: "1px solid var(--border)",
  },
  searchBox: {
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "7px 12px",
    fontSize: "12px",
    color: "var(--text)",
    outline: "none",
  },
  contactsList: {
    flex: 1,
    overflowY: "auto",
  },
  contactItem: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    cursor: "pointer",
    background: active ? "var(--surface-alt)" : "transparent",
    borderLeft: active ? "3px solid var(--accent2)" : "3px solid transparent",
  }),
  contactName: { fontSize: "14px", fontWeight: 600, margin: 0 },
  contactIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" },
  chatHeaderInfo: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
  },
  chatCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  chatHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    fontSize: "15px",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "18px",
    cursor: "pointer",
    padding: 0,
    lineHeight: 1,
  },
  chatHeaderText: { flex: 1, minWidth: 0, overflow: "hidden" },
  chatHeaderName: { margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  chatHeaderIdentity: {
    margin: "1px 0 0",
    fontSize: "12px",
    fontWeight: 400,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  chatHeaderLastSeen: {
    margin: "1px 0 0",
    fontSize: "11px",
    fontWeight: 400,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  blockBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  bubbleRow: (mine) => ({
    display: "flex",
    justifyContent: mine ? "flex-end" : "flex-start",
  }),
  bubbleWrapper: {
    position: "relative",
    maxWidth: "75%",
  },
  reactionBadge: (mine) => ({
    position: "absolute",
    bottom: "-9px",
    [mine ? "left" : "right"]: "-6px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "1px 5px",
    fontSize: "11px",
    lineHeight: 1.3,
    boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
    zIndex: 5,
  }),
  bubble: (mine) => ({
    padding: "10px 14px",
    borderRadius: "16px",
    fontSize: "14px",
    lineHeight: 1.4,
    wordBreak: "break-word",
    background: mine
      ? "linear-gradient(135deg, var(--accent), var(--accent2))"
      : "var(--surface-alt)",
    color: mine ? "var(--bg)" : "var(--text)",
  }),
  // Sin fondo de burbuja a propósito (pedido explícito: "como en
  // WhatsApp") — solo un poco de padding para que la reacción no quede
  // pegada al borde de la imagen.
  stickerBubble: {
    padding: "2px",
    lineHeight: 0,
  },
  inputRow: {
    display: "flex",
    gap: "10px",
    padding: "14px 16px",
    borderTop: "1px solid var(--border)",
  },
  input: {
    flex: 1,
    minWidth: 0,
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "10px 14px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
  },
  sendBtn: {
    padding: "10px 18px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  micBtn: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stickerBtnWrapper: { position: "relative", flexShrink: 0 },
  stickerBtn: (active) => ({
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--accent2-soft)" : "transparent",
    color: active ? "var(--accent2)" : "var(--text)",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  }),
  recordingRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 16px",
    borderTop: "1px solid var(--border)",
  },
  recordingMic: {
    display: "flex",
    alignItems: "center",
    color: "var(--accent2)",
    flexShrink: 0,
  },
  recordingLabel: {
    fontSize: "13px",
    color: "var(--text)",
    flex: 1,
  },
  recordingTime: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--accent2)",
    fontVariantNumeric: "tabular-nums",
  },
  recordCancelBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "50%",
    width: "34px",
    height: "34px",
    color: "var(--text-muted)",
    fontSize: "15px",
    cursor: "pointer",
    flexShrink: 0,
  },
  recordSendBtn: {
    border: "none",
    borderRadius: "50%",
    width: "34px",
    height: "34px",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "14px",
    cursor: "pointer",
    flexShrink: 0,
  },
  audioMessage: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: "0",
    maxWidth: "100%",
  },
  audioPlayBtn: (mine) => ({
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    flexShrink: 0,
    background: mine ? "var(--bg)" : "var(--accent2)",
    color: mine ? "var(--accent2)" : "var(--bg)",
  }),
  // Barras de la waveform: contraste distinto según la burbuja sea propia
  // (fondo degradado rosa, necesita un color oscuro) o ajena (fondo oscuro,
  // necesita un color claro/muted) — mismas variables ya usadas para el
  // texto de duración de al lado, así que siempre combinan.
  waveform: (mine) => ({
    flexShrink: 0,
    maxWidth: "100%",
    color: mine ? "var(--bg)" : "var(--text-muted)",
  }),
  audioDuration: (mine) => ({
    fontSize: "12px",
    fontWeight: 600,
    flexShrink: 0,
    color: mine ? "var(--bg)" : "var(--text-muted)",
  }),
  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "24px",
    textAlign: "center",
  },
  // Tarjeta del post compartido: un borde de acento a la izquierda y un
  // fondo más oscuro que la burbuja que la contiene (var(--bg) sobre el
  // degradado propio, var(--surface) sobre el fondo ajeno) la distinguen
  // de un mensaje de texto normal a simple vista, sin agregar ningún color
  // nuevo fuera de las variables de tema.
  sharedPostCard: (mine) => ({
    padding: "10px 12px",
    borderRadius: "12px",
    borderLeft: "3px solid var(--accent2)",
    background: mine ? "var(--bg)" : "var(--surface)",
    cursor: "pointer",
    minWidth: "170px",
    maxWidth: "220px",
  }),
  sharedPostLabel: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    margin: "0 0 6px",
    color: "var(--accent2)",
  },
  sharedPostAuthor: {
    fontSize: "13px",
    fontWeight: 700,
    margin: "0 0 2px",
    color: "var(--text)",
  },
  sharedPostText: {
    fontSize: "13px",
    lineHeight: 1.4,
    margin: 0,
    color: "var(--text-muted)",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
  },
  sharedPostUnavailable: {
    fontSize: "13px",
    fontStyle: "italic",
    margin: 0,
    color: "var(--text-muted)",
  },
};

function AudioMessage({ src, duration, mine, id }) {
  const { t } = useLanguage();
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  return (
    <div style={styles.audioMessage}>
      <audio ref={audioRef} src={src} preload="none" />
      <button
        type="button"
        style={styles.audioPlayBtn(mine)}
        onClick={toggle}
        title={playing ? t("chat.pauseAudio") : t("chat.playAudio")}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <AudioWaveform seed={id || src} playing={playing} mine={mine} />
      <span style={styles.audioDuration(mine)}>{formatDuration(duration)}</span>
    </div>
  );
}

// Vista previa de un post compartido, dentro de la burbuja del mensaje.
// Lee el post EN VIVO por su id (no hay copia guardada del autor/texto en
// el mensaje) — si el post se editó después de compartirlo, la vista
// previa muestra la versión actual; si se borró, muestra un aviso en vez
// de romperse.
function SharedPostPreview({ postId, mine, onOpenPost }) {
  const { t } = useLanguage();
  const [post, setPost] = useState(undefined); // undefined: cargando | null: no existe

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "posts", postId), (snap) => {
      setPost(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return unsub;
  }, [postId]);

  if (post === null) {
    return (
      <div style={styles.sharedPostCard(mine)}>
        <p style={styles.sharedPostLabel}>📝 {t("chat.sharedPostLabel")}</p>
        <p style={styles.sharedPostUnavailable}>{t("chat.sharedPostUnavailable")}</p>
      </div>
    );
  }

  return (
    <div style={styles.sharedPostCard(mine)} onClick={() => post && onOpenPost(postId)}>
      <p style={styles.sharedPostLabel}>📝 {t("chat.sharedPostLabel")}</p>
      {post && (
        <>
          <p style={styles.sharedPostAuthor}>{post.authorName}</p>
          <p style={styles.sharedPostText}>{post.text}</p>
        </>
      )}
    </div>
  );
}

// Una burbuja de mensaje (texto, nota de voz o post compartido) + su
// selector de reacciones. Es su propio componente (no un simple .map()
// inline) porque useReactionPicker() es un hook y cada mensaje necesita su
// propia instancia de estado (si abriste el selector no debe abrirse en
// todos).
function MessageBubble({ message, mine, currentUid, chatId, onOpenPost }) {
  const { open, setOpen, containerRef, triggerProps } = useReactionPicker();
  const myReaction = (message.reactions || {})[currentUid] || null;
  const reactionEmojis = getDistinctReactionEmojis(message.reactions);

  const setMyReaction = async (type) => {
    const msgRef = doc(db, "chats", chatId, "messages", message.id);
    await updateDoc(msgRef, {
      [`reactions.${currentUid}`]: type || deleteField(),
    });
  };

  return (
    <div style={styles.bubbleRow(mine)}>
      <div ref={containerRef} style={styles.bubbleWrapper} {...triggerProps}>
        {message.type === "sticker" ? (
          <div style={styles.stickerBubble}>
            <StickerImage stickerId={message.stickerId} size={96} />
          </div>
        ) : (
          <div style={styles.bubble(mine)}>
            {message.type === "audio" ? (
              <AudioMessage
                id={message.id}
                src={message.audioData}
                duration={message.audioDuration}
                mine={mine}
              />
            ) : message.type === "shared_post" ? (
              <SharedPostPreview
                postId={message.sharedPostId}
                mine={mine}
                onOpenPost={onOpenPost}
              />
            ) : (
              message.text
            )}
          </div>
        )}
        {reactionEmojis.length > 0 && (
          <div style={styles.reactionBadge(mine)}>{reactionEmojis.join("")}</div>
        )}
        {open && (
          // bottom: "100%" (sin sumarle espacio) pega el selector justo
          // arriba de la burbuja, sin gap — igual que en Feed.jsx, para
          // que mover el mouse de la burbuja al selector no cruce una
          // "zona muerta" que dispare el cierre antes de tiempo.
          <ReactionPicker
            myReaction={myReaction}
            onSelect={(type) => {
              setMyReaction(type);
              setOpen(false);
            }}
            style={{
              bottom: "100%",
              [mine ? "right" : "left"]: 0,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function Chat({ onOpenProfile, onOpenPost }) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const stickerPanelRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Estado del grabador de notas de voz: "idle" | "recording" | "ready"
  // ("ready" = ya se detuvo por el límite de 60s, esperando que se envíe o cancele)
  const [recordingState, setRecordingState] = useState("idle");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState(null); // { blob, duration } mientras está en "ready"
  const [sendingAudio, setSendingAudio] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const secondsRef = useRef(0);
  const pendingActionRef = useRef(null); // "cancel" | "send" | "auto"

  // Escucha si hay sesión activa (viene del mismo login de AuthProfile)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user ? user.uid : null);
    });
    return unsub;
  }, []);

  // Escucha tu propio perfil en tiempo real (necesario para saber a quién bloqueaste)
  useEffect(() => {
    if (!currentUid) return;
    const unsub = onSnapshot(doc(db, "users", currentUid), (snap) => {
      if (snap.exists()) setMyProfile(snap.data());
    });
    return unsub;
  }, [currentUid]);

  // Lista de todos los usuarios registrados en tiempo real (se filtra abajo)
  useEffect(() => {
    if (!currentUid) return;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        if (d.id !== currentUid) {
          list.push({ uid: d.id, ...d.data() });
        }
      });
      setAllUsers(list);
    });
    return unsub;
  }, [currentUid]);

  // Contactos visibles: sin perfiles privados, sin bloqueos en ninguna dirección
  const myBlocked = myProfile?.blockedUsers || [];
  const visibleContacts = allUsers.filter((c) => {
    if (c.isPrivate) return false;
    if (myBlocked.includes(c.uid)) return false;
    if ((c.blockedUsers || []).includes(currentUid)) return false;
    return true;
  });

  const searchLower = search.trim().toLowerCase();
  const contacts = searchLower
    ? visibleContacts.filter(
        (c) =>
          (c.displayName || "").toLowerCase().includes(searchLower) ||
          (c.identity || "").toLowerCase().includes(searchLower)
      )
    : visibleContacts;

  const isBlocked = activeContact ? myBlocked.includes(activeContact.uid) : false;

  // Versión más reciente del contacto activo (allUsers se actualiza en
  // vivo) — activeContact es solo una copia tomada al momento del clic,
  // así que usarlo directo dejaría el estado en línea "congelado".
  const liveActiveContact = activeContact
    ? allUsers.find((u) => u.uid === activeContact.uid) || activeContact
    : null;

  const handleToggleBlock = async () => {
    if (!activeContact || !currentUid) return;
    await updateDoc(doc(db, "users", currentUid), {
      blockedUsers: isBlocked
        ? arrayRemove(activeContact.uid)
        : arrayUnion(activeContact.uid),
    });
    if (!isBlocked) setActiveContact(null); // al bloquear, sale de la conversación
  };

  // Mensajes en tiempo real de la conversación activa
  useEffect(() => {
    if (!currentUid || !activeContact) {
      setMessages([]);
      return;
    }
    const chatId = getChatId(currentUid, activeContact.uid);
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [currentUid, activeContact]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cierra el panel de stickers al tocar/clickear afuera, mismo patrón que
  // el resto de los paneles desplegables de la app (menú de temas, notificaciones).
  useEffect(() => {
    function handleClickOutside(e) {
      if (stickerPanelRef.current && !stickerPanelRef.current.contains(e.target)) {
        setStickerPanelOpen(false);
      }
    }
    if (stickerPanelOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [stickerPanelOpen]);

  // Cuenta los segundos mientras se está grabando
  useEffect(() => {
    if (recordingState !== "recording") return;
    const id = setInterval(() => {
      secondsRef.current += 1;
      setRecordSeconds(secondsRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [recordingState]);

  // Corta la grabación automáticamente al llegar al límite de 60 segundos
  useEffect(() => {
    if (recordingState === "recording" && recordSeconds >= MAX_RECORD_SECONDS) {
      requestStopRecording("auto");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordSeconds, recordingState]);

  // Si el componente se desmonta (por ejemplo, cambias de pestaña) mientras
  // el micrófono está activo, apaga el micrófono para no dejarlo encendido.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") {
      alert(t("chat.noMicSupport"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      secondsRef.current = 0;
      setRecordSeconds(0);

      const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
        ? AUDIO_MIME_TYPE
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        const chunks = chunksRef.current;
        chunksRef.current = [];

        if (action === "cancel") {
          setRecordingState("idle");
          setRecordSeconds(0);
          secondsRef.current = 0;
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        const duration = secondsRef.current;

        if (action === "send") {
          setRecordingState("idle");
          setRecordSeconds(0);
          secondsRef.current = 0;
          uploadAudioMessage(blob, duration);
        } else {
          // se detuvo sola al llegar al límite: espera confirmación del usuario
          setPendingAudio({ blob, duration });
          setRecordingState("ready");
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState("recording");
    } catch (err) {
      alert(t("chat.micPermissionError"));
    }
  };

  function requestStopRecording(action) {
    pendingActionRef.current = action;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  const cancelReadyRecording = () => {
    setPendingAudio(null);
    setRecordingState("idle");
    setRecordSeconds(0);
    secondsRef.current = 0;
  };

  const sendReadyRecording = () => {
    if (!pendingAudio) return;
    const { blob, duration } = pendingAudio;
    setPendingAudio(null);
    setRecordingState("idle");
    setRecordSeconds(0);
    secondsRef.current = 0;
    uploadAudioMessage(blob, duration);
  };

  const uploadAudioMessage = async (blob, duration) => {
    if (!activeContact || !currentUid) return;
    setSendingAudio(true);
    try {
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > MAX_AUDIO_BASE64_LENGTH) {
        alert(t("chat.audioTooLarge"));
        return;
      }

      const chatId = getChatId(currentUid, activeContact.uid);
      await setDoc(
        doc(db, "chats", chatId),
        { participants: [currentUid, activeContact.uid] },
        { merge: true }
      );

      await addDoc(collection(db, "chats", chatId, "messages"), {
        senderId: currentUid,
        type: "audio",
        audioData: dataUrl,
        audioDuration: duration,
        createdAt: serverTimestamp(),
      });

      await notify(activeContact.uid, {
        type: "message",
        fromUid: currentUid,
        fromName: myProfile?.displayName || "Alguien",
        fromIdentity: myProfile?.identity || "",
      });
    } catch (err) {
      alert(t("chat.audioSendError"));
    } finally {
      setSendingAudio(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeContact || !currentUid) return;

    const chatId = getChatId(currentUid, activeContact.uid);

    // Aseguramos que el documento "padre" del chat exista (útil a futuro
    // para listar conversaciones recientes, no estrictamente necesario ahora)
    await setDoc(
      doc(db, "chats", chatId),
      { participants: [currentUid, activeContact.uid] },
      { merge: true }
    );

    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: currentUid,
      text: text.trim(),
      createdAt: serverTimestamp(),
    });

    // Notifica al destinatario que le llegó un mensaje nuevo
    await notify(activeContact.uid, {
      type: "message",
      fromUid: currentUid,
      fromName: myProfile?.displayName || "Alguien",
      fromIdentity: myProfile?.identity || "",
    });

    setText("");
  };

  const handleSendSticker = async (stickerId) => {
    setStickerPanelOpen(false);
    if (!activeContact || !currentUid) return;

    const chatId = getChatId(currentUid, activeContact.uid);
    await setDoc(
      doc(db, "chats", chatId),
      { participants: [currentUid, activeContact.uid] },
      { merge: true }
    );

    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderId: currentUid,
      type: "sticker",
      stickerId,
      createdAt: serverTimestamp(),
    });

    await notify(activeContact.uid, {
      type: "message",
      fromUid: currentUid,
      fromName: myProfile?.displayName || "Alguien",
      fromIdentity: myProfile?.identity || "",
    });
  };

  if (!currentUid) {
    return (
      <div style={styles.wrapper}>
        <div style={{ ...styles.shell, alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--text-muted)", padding: "0 24px", textAlign: "center" }}>
            {t("chat.loginNotice")}
          </p>
        </div>
      </div>
    );
  }

  // En móvil: si hay conversación activa, solo se muestra el chat.
  // Si no hay conversación activa, solo se muestra la lista de contactos.
  const showContactsList = !isMobile || !activeContact;
  const showChatPane = !isMobile || !!activeContact;

  return (
    <div style={styles.wrapper}>
      <div style={styles.shell}>
        {showContactsList && (
          <div style={styles.contactsCol(isMobile)}>
            <p style={styles.contactsHeader}>{t("chat.peopleHeader")}</p>
            <div style={styles.searchBox}>
              <input
                style={styles.searchInput}
                type="text"
                placeholder={t("chat.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={styles.contactsList}>
              {contacts.length === 0 && (
                <p style={{ padding: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
                  {search ? t("chat.noSearchResults") : t("chat.noContacts")}
                </p>
              )}
              {contacts.map((c) => (
                <div
                  key={c.uid}
                  style={styles.contactItem(activeContact?.uid === c.uid)}
                  onClick={() => {
                    if (recordingState === "idle") {
                      setActiveContact(c);
                      setStickerPanelOpen(false);
                    }
                  }}
                >
                  <Avatar
                    uid={c.uid}
                    name={c.displayName || c.identity}
                    identity={c.identity}
                    size="md"
                    online={isEffectivelyOnline(c)}
                  />
                  <div>
                    <p style={styles.contactName}>{c.displayName || t("chat.defaultName")}</p>
                    <p style={styles.contactIdentity}>{c.identity}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showChatPane && (
          <div style={styles.chatCol}>
            {activeContact ? (
              <>
                <div style={styles.chatHeader}>
                  {isMobile && (
                    <button style={styles.backBtn} onClick={() => setActiveContact(null)}>
                      ←
                    </button>
                  )}
                  <div
                    style={styles.chatHeaderInfo}
                    onClick={() => onOpenProfile(activeContact.uid)}
                  >
                    <Avatar
                      uid={activeContact.uid}
                      name={activeContact.displayName || activeContact.identity}
                      identity={activeContact.identity}
                      size="sm"
                      online={isEffectivelyOnline(liveActiveContact)}
                    />
                    <div style={styles.chatHeaderText}>
                      <p style={styles.chatHeaderName}>{activeContact.displayName}</p>
                      <p style={styles.chatHeaderIdentity}>{activeContact.identity}</p>
                      {!isEffectivelyOnline(liveActiveContact) && formatLastSeen(liveActiveContact) && (
                        <p style={styles.chatHeaderLastSeen}>{formatLastSeen(liveActiveContact)}</p>
                      )}
                    </div>
                  </div>
                  <button style={styles.blockBtn} onClick={handleToggleBlock}>
                    {isBlocked ? t("chat.unblock") : t("chat.block")}
                  </button>
                </div>
                <div style={styles.messagesArea}>
                  {messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      mine={m.senderId === currentUid}
                      currentUid={currentUid}
                      chatId={getChatId(currentUid, activeContact.uid)}
                      onOpenPost={onOpenPost}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                {recordingState === "idle" ? (
                  <form style={styles.inputRow} onSubmit={handleSend}>
                    <input
                      style={styles.input}
                      type="text"
                      placeholder={t("chat.messagePlaceholder")}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <div style={styles.stickerBtnWrapper} ref={stickerPanelRef}>
                      <button
                        type="button"
                        style={styles.stickerBtn(stickerPanelOpen)}
                        onClick={() => setStickerPanelOpen((v) => !v)}
                        title={t("chat.openStickers")}
                      >
                        <StickerIcon />
                      </button>
                      {stickerPanelOpen && <StickerPicker onSelect={handleSendSticker} />}
                    </div>
                    <button
                      type="button"
                      style={styles.micBtn}
                      onClick={startRecording}
                      title={t("chat.recordVoice")}
                    >
                      <MicIcon />
                    </button>
                    <button type="submit" style={styles.sendBtn}>
                      {t("chat.send")}
                    </button>
                  </form>
                ) : (
                  <div style={styles.recordingRow}>
                    <span style={styles.recordingMic}>
                      <MicIcon pulsing={recordingState === "recording"} />
                    </span>
                    <span style={styles.recordingLabel}>
                      {recordingState === "recording"
                        ? t("chat.recording")
                        : t("chat.recordingReady")}
                    </span>
                    <span style={styles.recordingTime}>{formatDuration(recordSeconds)}</span>
                    <button
                      type="button"
                      style={styles.recordCancelBtn}
                      onClick={
                        recordingState === "recording"
                          ? () => requestStopRecording("cancel")
                          : cancelReadyRecording
                      }
                      title={t("chat.cancel")}
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      style={styles.recordSendBtn}
                      onClick={
                        recordingState === "recording"
                          ? () => requestStopRecording("send")
                          : sendReadyRecording
                      }
                      disabled={sendingAudio}
                      title={t("chat.sendVoice")}
                    >
                      ➤
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={styles.emptyState}>
                {t("chat.emptyState")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
