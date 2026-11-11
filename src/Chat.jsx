import React, { useEffect, useLayoutEffect, useState, useRef, useMemo } from "react";
import { auth, db } from "./firebase";
import { useUserProfile } from "./AllUsersContext";
import { storage } from "./firebaseStorage";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  startAfter,
  Timestamp,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Avatar from "./Avatar";
import { notify, useIsMobile, getChatId, timeAgo } from "./utils";
import {
  newMessageId,
  sendChatMessage,
  useRecentChats,
  useChatSummary,
  isChatUnread,
  markChatRead,
  deleteChatForMe,
  RECENT_CHATS_PAGE,
} from "./chatMessages";
import { useLanguage } from "./LanguageContext";
import { getDistinctReactionEmojis, useReactionPicker, ReactionPicker } from "./Reactions";
import { isEffectivelyOnline, formatLastSeen, usePresences, canSeeOnlineStatus } from "./presence";
import { useMyFollows } from "./FollowsContext";
import {
  StickerImage,
  StickerPicker,
  AnimatedEmojiText,
  DEFAULT_PICKER_TAB,
  DEFAULT_EMOJI_CATEGORY,
} from "./Stickers";
import { blockUser, unblockUser, useMyBlocks, isBlockedEitherWay } from "./Blocks";
import { useAllUsers } from "./Mentions";
import { playReactionSound } from "./sound";
import GiftNotification from "./GiftNotification";
import ImageViewer from "./ImageViewer";
import ImageEditor from "./ImageEditor";

/*
  Chat
  ----
  Módulo de chat en tiempo real entre usuarios registrados.

  Estructura en Firestore:
  - "users/{uid}"                        -> perfil (ya existente, de AuthProfile.jsx)
  - "chats/{chatId}/messages/{msgId}"    -> mensajes de una conversación
      chatId = los dos UID ordenados alfabéticamente y unidos con "_"
      (así dos personas siempre llegan al mismo chatId, sin duplicados)
  - "chats/{chatId}"                     -> resumen de la conversación
      (último mensaje, hora, quién escribió; ver chatMessages.js, punto 84)

  Todo es en tiempo real: usa onSnapshot, no hace falta recargar la página
  para ver mensajes nuevos ni contactos nuevos.

  LISTA DE CONVERSACIONES (punto 84, commit 3): la columna izquierda
  muestra tus conversaciones recientes (useRecentChats, chatMessages.js:
  una consulta sobre chats/{chatId}, la más reciente primero, de a
  RECENT_CHATS_PAGE con "Cargar más"), sin abrir los mensajes. Cada fila:
  avatar con punto de en línea, nombre, vista previa del último mensaje
  (chatPreview), hora relativa y, si no la leíste (isChatUnread), un punto
  y el nombre en negrita. Al abrir una conversación con mensajes sin leer
  se escribe tu lastReadAt (useChatSummary + markChatRead, una vez por
  mensaje). Nombre y foto salen de AllUsersContext (sin lecturas extra).
  "Nueva conversación" cambia la columna a un buscador de personas; la
  conversación aparece en la lista recién con el primer mensaje.
  Quién aparece (en la lista, en el buscador y al llegar desde una
  notificación), canChatWith: sin bloqueo en ninguna dirección y, si es
  privado, con seguimiento mutuo o si ya te escribió en ese chat
  (`writers`, commit 4; en el buscador solo el seguimiento mutuo). Quien
  ya no existe no se muestra. Si con la conversación abierta deja de
  cumplirse (bloqueo, por ejemplo), el campo de texto se cambia por un
  aviso (activeWriteState); si un envío falla, se avisa (sendError).

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
  Mensaje de imagen (punto 61): { senderId, type: "image", imageUrl, createdAt }
  — A DIFERENCIA de una nota de voz, la imagen SÍ usa Cloud Storage (una
  sola foto por mensaje pesa mucho más que 1MB si se guardara base64
  directo en el documento, como sí es viable con el audio comprimido a
  32kbps). Sube a "chatImages/{chatId}/{messageId}/img.jpg" — el
  messageId se genera del lado del cliente ANTES de crear el mensaje
  (mismo patrón que "postId"/"productId" en Feed.jsx/
  CreateProductScreen.jsx), y se le pasa a sendChatMessage (chatMessages.js,
  punto 84), que crea el mensaje y el resumen del chat juntos. El envío sigue el mismo esqueleto que una nota de voz:
  elegir el archivo abre ImageEditor.jsx (punto 65: girar/recortar), y
  "Usar foto" lo deja "listo" para confirmar o cancelar (pendingImage),
  nunca se sube directo — ver
  handlePickImage/sendPendingImage/cancelPendingImage.
  Todos los tipos de mensaje pueden tener además `reactions: { [uid]: tipo }`
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

  RESPUESTA A UN MOMENTO (punto 66, commit 7, la envía MomentViewer.jsx
  con moments.js → sendMomentReply): mensaje tipo
  { senderId, type: "moment_reply", text, momentId, momentImageURL,
  momentExpireAt, createdAt }. A diferencia del post compartido, SÍ guarda
  una copia de la miniatura y del vencimiento, porque el momento dura
  24 h y nadie más que su autor y sus seguidores lo puede leer.
  MomentReplyPreview muestra la miniatura solo mientras el momento no
  venció (sin volver a leerlo); después, o si la foto ya no carga (el
  autor lo borró), muestra "Momento no disponible". El texto de la
  respuesta se ve siempre.

  STICKERS (ver Stickers.jsx para el set de imágenes y la lógica
  compartida): botón nuevo junto al de grabar audio que abre un panel con
  dos pestañas, "Stickers" (15 caricaturas propias, punto 88) y "Emojis"
  (animados, se insertan en el cuadro de texto) (SVG empaquetados en
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
  presence.js). La presencia sale de presence/{uid} (commit 9g) con
  `usePresences`: un listener por cada fila de la lista de conversaciones
  en pantalla (filtrada por la búsqueda; como mucho las que trajo la
  lista) más el de la conversación activa, solo mientras el Chat está
  abierto. El buscador de "Nueva conversación" no pide presencia. Se
  filtra con canSeeOnlineStatus para no abrir listeners que las reglas
  van a rechazar. Si no está en línea, debajo del nombre se muestra
  "Últ. vez hace X" (`formatLastSeen`, reutiliza `timeAgo()` — formato
  relativo en español, igual que los posts).
*/

const MAX_RECORD_SECONDS = 60;
const AUDIO_MIME_TYPE = "audio/webm;codecs=opus";
const MAX_AUDIO_BASE64_LENGTH = 900000; // margen de seguridad bajo el límite de 1MB por documento de Firestore

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

// Ícono del botón "enviar una imagen": mismo estilo de trazo (currentColor,
// redondeado) que MicIcon/StickerIcon, para que los tres combinen.
function ImageIcon() {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M21 15l-5-5-9 9" />
    </svg>
  );
}

// Validación de tipo/peso de la imagen elegida (mismos valores que
// MultiImageUploader.jsx). El redimensionado (máximo PENDING_IMAGE_MAX_SIZE
// de lado, JPEG 0.85) ya no vive acá: lo hace ImageEditor.jsx (punto 65)
// junto con el giro/recorte, y devuelve el Blob final.
const PENDING_IMAGE_MAX_MB = 10;
const PENDING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PENDING_IMAGE_MAX_SIZE = 1024;

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

// Medidas del cuadro de escribir. En táctil, 16px: con menos, iPhone hace
// zoom al enfocar. oneLine y fiveLines son el alto del <textarea> (padding
// 10+10; el borde lo lleva composerField, por eso roundBtn suma 2).
function composerMetrics(touch) {
  const fontSize = touch ? 16 : 14;
  const lineHeight = touch ? 22 : 20;
  const oneLine = lineHeight + 20;
  return { fontSize, lineHeight, oneLine, fiveLines: lineHeight * 5 + 20, roundBtn: oneLine + 2 };
}

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "var(--page-bg)",
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "var(--font-body)",
    color: "var(--text)",
    boxSizing: "border-box",
  },
  // Punto 91: en PC la caja ocupa justo lo que queda bajo la barra superior
  // (useChatViewport pone el alto), así la página no tiene scroll.
  wrapperPage: { minHeight: 0 },
  // Punto 91: conversación abierta en celular, a pantalla completa. top y
  // height los pone useChatViewport según el área visible. z-index 46: tapa
  // la barra inferior (30) y queda debajo de los modales (50). Fondo --bg
  // porque --page-bg es transparente en algunos temas.
  wrapperFull: {
    position: "fixed",
    left: 0,
    right: 0,
    zIndex: 46,
    minHeight: 0,
    padding: 0,
    background: "var(--bg)",
    overflow: "hidden",
    overscrollBehavior: "none",
  },
  shellPage: { height: "100%" },
  shellFull: {
    maxWidth: "none",
    height: "100%",
    borderRadius: 0,
    border: "none",
    boxShadow: "none",
  },
  shell: {
    width: "100%",
    maxWidth: "760px",
    height: "80vh",
    background: "var(--surface-sheen)",
    borderRadius: "24px",
    border: "1px solid var(--border)",
    boxShadow: "0 12px 36px rgba(var(--shadow-rgb), 0.25), var(--shine)",
    display: "flex",
    overflow: "hidden",
  },
  contactsCol: (isMobile) => ({
    // 280 (antes 240): la fila lleva vista previa y hora.
    width: isMobile ? "100%" : "280px",
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
    background: "var(--gradient-text)",
    filter: "var(--title-depth)",
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
    boxShadow: "var(--field-shine)",
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
  // Cada fila es un <button> (se abre con el teclado): sin borde propio
  // salvo el de la izquierda, con la fuente y el color de la app.
  contactItem: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    padding: "12px 16px",
    cursor: "pointer",
    border: "none",
    borderLeft: active ? "3px solid var(--accent2)" : "3px solid transparent",
    background: active ? "var(--surface-alt)" : "transparent",
    color: "var(--text)",
    fontFamily: "inherit",
    textAlign: "left",
    boxSizing: "border-box",
  }),
  // Punto 90: la fila de una conversación es este contenedor con dos
  // botones hermanos (un <button> no puede ir dentro de otro).
  contactRow: (active) => ({
    display: "flex",
    alignItems: "stretch",
    background: active ? "var(--surface-alt)" : "transparent",
  }),
  contactRowOpen: { flex: 1, width: "auto", minWidth: 0, background: "transparent" },
  contactDeleteBtn: {
    flexShrink: 0,
    width: "44px",
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "15px",
    fontFamily: "inherit",
  },
  contactText: { flex: 1, minWidth: 0 },
  contactTopLine: { display: "flex", alignItems: "baseline", gap: "8px" },
  contactName: (unread) => ({
    flex: 1,
    minWidth: 0,
    fontSize: "14px",
    fontWeight: unread ? 800 : 600,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  contactTime: { fontSize: "11px", color: "var(--text-muted)", flexShrink: 0 },
  contactBottomLine: { display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" },
  contactPreview: (unread) => ({
    flex: 1,
    minWidth: 0,
    fontSize: "12px",
    margin: 0,
    color: unread ? "var(--text)" : "var(--text-muted)",
    fontWeight: unread ? 600 : 400,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  unreadDot: {
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    background: "var(--accent2)",
    flexShrink: 0,
  },
  contactIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" },
  // "Nueva conversación" (arriba de la lista) y "Cargar más" (abajo).
  listActionBtn: {
    display: "block",
    width: "calc(100% - 24px)",
    margin: "10px 12px 0",
    padding: "8px 12px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    boxShadow: "var(--chip-shine)",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  listHeaderRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    borderBottom: "1px solid var(--border)",
  },
  listBackBtn: {
    background: "none",
    border: "none",
    color: "var(--text)",
    fontSize: "18px",
    cursor: "pointer",
    padding: "14px 0 10px 12px",
  },
  listNote: { padding: "16px", fontSize: "13px", color: "var(--text-muted)", margin: 0 },
  // Aviso sobre el campo de texto (commit 4): no se pudo enviar, o ya no
  // se puede escribir en esta conversación (en lugar del campo).
  composerNote: {
    margin: 0,
    padding: "12px 16px",
    fontSize: "13px",
    textAlign: "center",
    color: "var(--text-muted)",
    borderTop: "1px solid var(--border)",
  },
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
    overscrollBehavior: "contain",
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
    boxShadow: "0 4px 10px rgba(var(--shadow-rgb), 0.25)",
    zIndex: 5,
  }),
  bubble: (mine) => ({
    padding: "10px 14px",
    borderRadius: "16px",
    fontSize: "14px",
    lineHeight: 1.4,
    wordBreak: "break-word",
    background: mine
      ? "var(--gradient-primary)"
      : "var(--surface-alt)",
    // Texto propio sobre --gradient-primary: --on-primary, como los botones
    // (en Pinky el degradado es blanco y --bg rosa claro no se lee).
    color: mine ? "var(--on-primary)" : "var(--text)",
  }),
  // Respeta los saltos de línea del cuadro de escribir (punto 91).
  bubbleText: { whiteSpace: "pre-wrap" },
  // Sin fondo de burbuja a propósito (pedido explícito: "como en
  // WhatsApp") — solo un poco de padding para que la reacción no quede
  // pegada al borde de la imagen.
  stickerBubble: {
    padding: "2px",
    lineHeight: 0,
  },
  inputRow: {
    // relative: ancla el panel de stickers/emojis (Stickers.jsx) al ancho
    // de la fila de escritura, para que nunca se salga de la caja del chat.
    position: "relative",
    display: "flex",
    // Los botones se quedan abajo cuando el cuadro crece.
    alignItems: "flex-end",
    gap: "8px",
    padding: "8px 10px",
    borderTop: "1px solid var(--border)",
  },
  // Punto 91: el "cuadro" que se ve, con los iconos de stickers e imagen
  // dentro. Sin position propio, para que el panel de stickers se siga
  // anclando a inputRow.
  composerField: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "flex-end",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    boxShadow: "var(--field-shine)",
    borderRadius: "22px",
    padding: "0 4px",
  },
  // Punto 91: crece hasta 5 líneas (ComposerTextarea pone el alto). El tope
  // también respeta el alto visible, para no tapar el nombre con el teclado.
  input: (touch) => {
    const { fontSize, lineHeight, oneLine, fiveLines } = composerMetrics(touch);
    return {
      flex: 1,
      minWidth: 0,
      display: "block",
      boxSizing: "border-box",
      resize: "none",
      maxHeight: `max(${oneLine}px, min(${fiveLines}px, calc(var(--pt-chat-height, 80vh) - 130px)))`,
      background: "transparent",
      border: "none",
      padding: "10px 4px",
      fontFamily: "inherit",
      fontSize: `${fontSize}px`,
      lineHeight: `${lineHeight}px`,
      wordBreak: "break-word",
      color: "var(--text)",
      outline: "none",
    };
  },
  // Punto 91: un solo botón redondo, micrófono o flecha de enviar.
  composerRoundBtn: (size) => ({
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    border: "none",
    padding: 0,
    background: "var(--gradient-primary)",
    boxShadow: "var(--button-shine)",
    color: "var(--on-primary)",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  }),
  // Iconos dentro del cuadro de escribir.
  composerIconBtn: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    border: "none",
    padding: 0,
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  // Sin position propio: el panel se posiciona respecto de inputRow.
  stickerBtnWrapper: { flexShrink: 0 },
  stickerBtnActive: { background: "var(--accent2-soft)", color: "var(--accent2)" },
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
    background: "var(--gradient-primary)",
    boxShadow: "var(--button-shine)",
    color: "var(--on-primary)",
    fontSize: "14px",
    cursor: "pointer",
    flexShrink: 0,
  },
  // Punto 61: mismo esqueleto que recordingRow (fila que reemplaza al
  // input normal mientras hay "algo listo" para confirmar/cancelar), con
  // una miniatura de la imagen elegida en vez del ícono de micrófono.
  imagePreviewRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 16px",
    borderTop: "1px solid var(--border)",
  },
  imagePreviewThumb: {
    width: "40px",
    height: "40px",
    borderRadius: "8px",
    objectFit: "cover",
    flexShrink: 0,
  },
  sendingSpinner: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.4)",
    borderTopColor: "var(--on-primary)",
    boxSizing: "border-box",
    display: "inline-block",
  },
  // Burbuja de imagen en el chat (punto 61): sin fondo de color, mismo
  // criterio que stickerBubble — la propia foto ya da el peso visual, un
  // fondo de acento detrás se vería raro. maxWidth acota el tamaño dentro
  // de bubbleWrapper (75% del ancho del chat).
  imageBubble: {
    padding: "2px",
    lineHeight: 0,
  },
  imageBubbleImg: {
    maxWidth: "240px",
    width: "100%",
    borderRadius: "14px",
    display: "block",
    cursor: "pointer",
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
    // En la burbuja propia, anillo de 3:1 (punto 85, solo Ángel: --bg
    // perla sobre el tornasol claro no se distingue).
    boxShadow: mine ? "var(--control-ring)" : "none",
    color: mine ? "var(--accent2)" : "var(--bg)",
  }),
  // Barras de la waveform: contraste distinto según la burbuja sea propia
  // (sobre --gradient-primary, con --on-primary como el texto) o ajena
  // (sobre --surface-alt, con --text-muted) — mismas variables ya usadas
  // para el texto de duración de al lado, así que siempre combinan.
  waveform: (mine) => ({
    flexShrink: 0,
    maxWidth: "100%",
    color: mine ? "var(--on-primary)" : "var(--text-muted)",
  }),
  audioDuration: (mine) => ({
    fontSize: "12px",
    fontWeight: 600,
    flexShrink: 0,
    color: mine ? "var(--on-primary)" : "var(--text-muted)",
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
  // Tarjeta del post compartido: un borde de acento a la izquierda y el
  // fondo var(--bg), distinto de la burbuja que la contiene (degradado
  // propio o --surface-alt ajeno), la distinguen de un mensaje de texto
  // normal a simple vista, sin agregar ningún color nuevo fuera de las
  // variables de tema. Siempre --bg, también en la ajena: --accent2 sobre
  // --surface no llegaba a 4,5 con la paleta anterior de Atardecer.
  sharedPostCard: {
    padding: "10px 12px",
    borderRadius: "12px",
    borderLeft: "3px solid var(--accent2)",
    background: "var(--bg)",
    cursor: "pointer",
    minWidth: "170px",
    maxWidth: "220px",
  },
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
  momentReplyThumb: {
    display: "block",
    width: "64px",
    height: "96px",
    objectFit: "cover",
    borderRadius: "8px",
    margin: "4px 0 6px",
  },
  momentReplyUnavailable: {
    fontSize: "13px",
    fontStyle: "italic",
    margin: "4px 0 6px",
    color: "var(--text-muted)",
  },
  momentReplyText: {
    margin: 0,
    fontSize: "13px",
    color: "var(--text)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
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
function SharedPostPreview({ postId, onOpenPost }) {
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
      <div style={styles.sharedPostCard}>
        <p style={styles.sharedPostLabel}>📝 {t("chat.sharedPostLabel")}</p>
        <p style={styles.sharedPostUnavailable}>{t("chat.sharedPostUnavailable")}</p>
      </div>
    );
  }

  return (
    <div style={styles.sharedPostCard} onClick={() => post && onOpenPost(postId)}>
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

// Respuesta a un momento (commit 7): miniatura del momento mientras siga
// activo (momentExpireAt, copia guardada en el mensaje) y el texto. Si ya
// venció o la foto no carga (se borró antes), "Momento no disponible".
function MomentReplyPreview({ message, mine }) {
  const { t } = useLanguage();
  const [broken, setBroken] = useState(false);
  const expireMs = message.momentExpireAt?.toMillis ? message.momentExpireAt.toMillis() : 0;
  const available = !broken && Date.now() < expireMs;

  return (
    // Misma tarjeta que el post compartido, pero no se toca (no lleva a
    // ningún lado).
    <div style={{ ...styles.sharedPostCard, cursor: "default" }}>
      <p style={styles.sharedPostLabel}>✨ {mine ? t("chat.momentReplyMine") : t("chat.momentReplyTheirs")}</p>
      {available ? (
        <img
          src={message.momentImageURL}
          alt={t("chat.momentReplyThumbAlt")}
          style={styles.momentReplyThumb}
          onError={() => setBroken(true)}
        />
      ) : (
        <p style={styles.momentReplyUnavailable}>{t("chat.momentUnavailable")}</p>
      )}
      <p style={styles.momentReplyText}>{message.text}</p>
    </div>
  );
}

// Una burbuja de mensaje (texto, nota de voz o post compartido) + su
// selector de reacciones. Es su propio componente (no un simple .map()
// inline) porque useReactionPicker() es un hook y cada mensaje necesita su
// propia instancia de estado (si abriste el selector no debe abrirse en
// todos).
function MessageBubble({ message, mine, currentUid, chatId, onOpenPost, onOpenProduct, senderName }) {
  const { open, setOpen, containerRef, triggerProps } = useReactionPicker();
  const myReaction = (message.reactions || {})[currentUid] || null;
  const reactionEmojis = getDistinctReactionEmojis(message.reactions);
  // Punto 61: se chequea "message.imageUrl" (no "message.type === 'image'")
  // a propósito — cubre tanto un mensaje SOLO imagen (type:"image", el
  // único caso que hoy produce el composer) como uno de texto que
  // TAMBIÉN tuviera imagen, si algún día se conecta esa combinación (ver
  // el docstring de sendPendingImage). Un solo "click abre el visor" con
  // esa única foto — ImageViewer.jsx acepta un array de 1 sin problema.
  const [imageViewerOpen, setImageViewerOpen] = useState(false);

  const setMyReaction = async (type) => {
    const msgRef = doc(db, "chats", chatId, "messages", message.id);
    playReactionSound(!!type);
    await updateDoc(msgRef, {
      [`reactions.${currentUid}`]: type || deleteField(),
    });
  };

  return (
    <div style={styles.bubbleRow(mine)}>
      <div ref={containerRef} style={styles.bubbleWrapper} {...triggerProps}>
        {message.imageUrl ? (
          <div style={styles.imageBubble}>
            <img
              src={message.imageUrl}
              alt=""
              style={styles.imageBubbleImg}
              onClick={() => setImageViewerOpen(true)}
            />
            {message.text && (
              <div style={styles.bubble(mine)}>
                <span style={styles.bubbleText}><AnimatedEmojiText text={message.text} /></span>
              </div>
            )}
          </div>
        ) : message.type === "sticker" ? (
          <div style={styles.stickerBubble}>
            <StickerImage stickerId={message.stickerId} size={96} />
          </div>
        ) : message.type === "gift" ? (
          <GiftNotification
            message={message}
            mine={mine}
            senderName={senderName}
            onOpenProduct={onOpenProduct}
          />
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
                onOpenPost={onOpenPost}
              />
            ) : message.type === "moment_reply" ? (
              <MomentReplyPreview message={message} mine={mine} />
            ) : (
              <span style={styles.bubbleText}><AnimatedEmojiText text={message.text} /></span>
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
      {imageViewerOpen && (
        <ImageViewer
          images={[message.imageUrl]}
          startIndex={0}
          onClose={() => setImageViewerOpen(false)}
        />
      )}
    </div>
  );
}

// Vista previa del último mensaje de una conversación (fila de la lista),
// con "Tú:" si lo enviaste vos. Los tipos sin texto llevan una etiqueta;
// la respuesta a un momento, la misma frase que su burbuja.
function chatPreview(chat, myUid, t) {
  const mine = chat.lastSenderId === myUid;
  if (chat.lastType === "moment_reply") {
    const label = t(mine ? "chat.momentReplyMine" : "chat.momentReplyTheirs");
    return chat.lastText ? `${label}: ${chat.lastText}` : label;
  }
  const labels = {
    audio: "chat.previewAudio",
    image: "chat.previewPhoto",
    sticker: "chat.previewSticker",
    gift: "chat.previewGift",
    shared_post: "chat.previewSharedPost",
  };
  const body = labels[chat.lastType] ? t(labels[chat.lastType]) : chat.lastText || "";
  return mine ? t("chat.previewMine", { text: body }) : body;
}

// Punto 91: pantalla táctil como puntero principal (celular o tablet). Una
// ventana angosta de PC o una laptop con pantalla táctil no cuentan.
function isTouchScreen() {
  return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

// Punto 91: mantiene la ventana del chat dentro del área visible.
// - "full" (conversación abierta en celular): capa fija del alto visible
//   real, que sigue al teclado, con el scroll de la página bloqueado. En
//   iPhone el teclado desplaza el área visible (offsetTop), por eso se
//   ajusta también top y no solo el alto.
// - "page" (PC): el chat ocupa lo que queda bajo la barra superior y el
//   banner, así la página no tiene scroll que el navegador pueda mover.
// - "flow" (lista de conversaciones en celular): no hace nada.
// --pt-chat-height es el alto de la caja; lo usan el cuadro de escribir y
// el panel de stickers para no salirse.
const DESKTOP_MIN_CHAT_HEIGHT = 420;
const WRAPPER_VERTICAL_PADDING = 48;

function useChatViewport(wrapperRef, mode) {
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el || mode === "flow") return undefined;
    const vv = window.visualViewport;

    const sync = () => {
      // Con zoom de dedos el área visible se achica, pero la caja no debe.
      if (vv && vv.scale > 1.01) return;
      const visibleHeight = vv ? vv.height : window.innerHeight;
      if (mode === "full") {
        el.style.top = `${vv ? vv.offsetTop : 0}px`;
        el.style.height = `${visibleHeight}px`;
        el.style.setProperty("--pt-chat-height", `${visibleHeight}px`);
      } else {
        const top = el.getBoundingClientRect().top + window.scrollY;
        const height = Math.max(visibleHeight - top, DESKTOP_MIN_CHAT_HEIGHT);
        el.style.height = `${height}px`;
        el.style.setProperty("--pt-chat-height", `${height - WRAPPER_VERTICAL_PADDING}px`);
      }
    };

    const { body, documentElement: html } = document;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
    };
    if (mode === "full") {
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.overflow = "hidden";
      html.style.overflow = "hidden";
    }

    sync();
    window.addEventListener("resize", sync);
    if (vv) {
      vv.addEventListener("resize", sync);
      vv.addEventListener("scroll", sync);
    }
    // En PC, el alto disponible cambia si se cierra el banner.
    const observer =
      mode === "page" && typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    if (observer) observer.observe(body);

    return () => {
      window.removeEventListener("resize", sync);
      if (vv) {
        vv.removeEventListener("resize", sync);
        vv.removeEventListener("scroll", sync);
      }
      if (observer) observer.disconnect();
      el.style.removeProperty("top");
      el.style.removeProperty("height");
      el.style.removeProperty("--pt-chat-height");
      if (mode === "full") {
        body.style.position = previous.position;
        body.style.top = previous.top;
        body.style.left = previous.left;
        body.style.right = previous.right;
        body.style.overflow = previous.bodyOverflow;
        html.style.overflow = previous.htmlOverflow;
        window.scrollTo(0, scrollY);
      }
    };
  }, [wrapperRef, mode]);
}

// Punto 91: cuadro de escribir que crece con el texto hasta el tope de
// styles.input (5 líneas); después tiene scroll por dentro.
function fitComposer(el, oneLine) {
  if (!el) return;
  el.style.height = "auto";
  const borders = el.offsetHeight - el.clientHeight;
  el.style.height = `${el.scrollHeight + borders}px`;
  el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? "auto" : "hidden";
  // Lo que creció: el panel de stickers lo descuenta de su alto máximo.
  if (el.form) el.form.style.setProperty("--pt-composer-extra", `${el.offsetHeight - oneLine}px`);
}

function ComposerTextarea({ inputRef, touch, value, onChange, onKeyDown, placeholder }) {
  const { oneLine } = composerMetrics(touch);

  useLayoutEffect(() => {
    fitComposer(inputRef.current, oneLine);
  }, [inputRef, value, oneLine]);

  // Al cambiar el ancho (girar el celular) el texto ocupa otras líneas.
  useEffect(() => {
    const onResize = () => fitComposer(inputRef.current, oneLine);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [inputRef, oneLine]);

  return (
    <textarea
      ref={inputRef}
      style={styles.input(touch)}
      rows={1}
      enterKeyHint="enter"
      placeholder={placeholder}
      aria-label={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
    />
  );
}

export default function Chat({
  onOpenProfile,
  onOpenPost,
  onOpenProduct,
  initialContactUid,
  onConsumeInitialContactUid,
}) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [touch] = useState(isTouchScreen);
  const [currentUid, setCurrentUid] = useState(null);
  // Tu perfil en vivo, de AllUsersContext (punto 70, commit 9c).
  const myProfile = useUserProfile(currentUid);
  const [activeContact, setActiveContact] = useState(null);
  // Se llegó desde una notificación de mensaje (initialContactUid) pero esa
  // persona no aparece entre los contactos visibles — ver el efecto que
  // consume initialContactUid más abajo.
  const [chatUnavailable, setChatUnavailable] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const stickerPanelRef = useRef(null);
  // Última pestaña del panel ("stickers"/"emojis") y última categoría de
  // emojis usadas DENTRO del chat abierto: el panel se cierra al enviar,
  // pero al reabrirlo vuelve donde estabas. Solo en memoria (nada en el
  // dispositivo ni en Firestore): se reinician al cambiar de chat, al
  // salir del chat (activeContact null) y al recargar.
  const [stickerPickerTab, setStickerPickerTab] = useState(DEFAULT_PICKER_TAB);
  const [stickerPickerCategory, setStickerPickerCategory] = useState(DEFAULT_EMOJI_CATEGORY);
  const activeContactUid = activeContact ? activeContact.uid : null;
  useEffect(() => {
    setStickerPickerTab(DEFAULT_PICKER_TAB);
    setStickerPickerCategory(DEFAULT_EMOJI_CATEGORY);
  }, [activeContactUid]);
  const messagesAreaRef = useRef(null);
  // ¿La lista estaba al final? Si sí, sigue al final cuando se achica.
  const stuckToEndRef = useRef(true);
  const wrapperRef = useRef(null);
  const viewportMode = !currentUid ? "flow" : !isMobile ? "page" : activeContact ? "full" : "flow";
  useChatViewport(wrapperRef, viewportMode);

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
  // Hora del último envío de texto: ver el botón redondo (punto 91).
  const lastTextSendAtRef = useRef(0);

  // Punto 61: enviar una imagen sigue el mismo esqueleto que una nota de
  // voz — elegir/grabar deja algo "listo" (pendingImage/pendingAudio) que
  // hay que confirmar o cancelar ANTES de que se suba/envíe nada. La
  // preview usa una URL de objeto local (revocada al cancelar o al
  // terminar de enviar, para no filtrar memoria).
  const [pendingImage, setPendingImage] = useState(null); // { blob, previewUrl } | null
  const [editingImageFile, setEditingImageFile] = useState(null); // File abierto en ImageEditor (punto 65)
  const [sendingImage, setSendingImage] = useState(false);
  const imageInputRef = useRef(null);
  const textInputRef = useRef(null);

  // Escucha si hay sesión activa (viene del mismo login de AuthProfile)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user ? user.uid : null);
    });
    return unsub;
  }, []);

  // Lista de todos los usuarios registrados en tiempo real (se filtra abajo),
  // del listener único de AllUsersContext (ver Mentions.jsx/AllUsersContext.jsx)
  // en vez de un onSnapshot propio sobre toda la colección "users".
  const allUsersRaw = useAllUsers();
  const allUsers = useMemo(
    () => allUsersRaw.filter((u) => u.uid !== currentUid),
    [allUsersRaw, currentUid]
  );

  // Con quién se puede chatear (lista, buscador, notificación y la
  // conversación abierta, punto 84): sin bloqueo en ninguna dirección y, si
  // es privado, con seguimiento mutuo o si ya te escribió en ese chat
  // (`writers` del resumen, commit 4). Mismo criterio que las reglas
  // (puedeEscribirEnChat). El buscador de "Nueva conversación" no pasa
  // `writers`: ahí solo cuenta el seguimiento mutuo.
  const { blockedByMe, blockedMe } = useMyBlocks(currentUid);
  const { following, followers, ready: followsReady } = useMyFollows();
  const canChatWith = (user, writers) => {
    if (!user || user.uid === currentUid) return false;
    if (isBlockedEitherWay(blockedByMe, blockedMe, user.uid)) return false;
    if (!user.isPrivate) return true;
    if (writers?.[user.uid] === true) return true;
    return following.includes(user.uid) && followers.includes(user.uid);
  };

  // "recent": tus conversaciones; "new": buscador de "Nueva conversación".
  const [listMode, setListMode] = useState("recent");
  const [maxChats, setMaxChats] = useState(RECENT_CHATS_PAGE);
  const recent = useRecentChats(currentUid, maxChats);
  const usersByUid = useMemo(() => {
    const map = {};
    allUsersRaw.forEach((u) => (map[u.uid] = u));
    return map;
  }, [allUsersRaw]);

  const searchLower = search.trim().toLowerCase();
  const matchesSearch = (u) =>
    !searchLower ||
    (u.displayName || "").toLowerCase().includes(searchLower) ||
    (u.identity || "").toLowerCase().includes(searchLower);

  // Filas de la lista: la otra persona de cada chat, con su perfil.
  const recentRows = recent.chats
    .map((chat) => {
      const otherUid = (chat.participants || []).find((uid) => uid !== currentUid);
      return { chat, user: usersByUid[otherUid] };
    })
    .filter((row) => canChatWith(row.user, row.chat.writers) && matchesSearch(row.user));

  // Buscador de "Nueva conversación": todas las personas con las que se
  // puede chatear (sin presencia).
  const newContacts = listMode === "new" ? allUsers.filter((u) => canChatWith(u) && matchesSearch(u)) : [];

  const isBlocked = activeContact ? blockedByMe.includes(activeContact.uid) : false;

  // Versión más reciente del contacto activo (allUsers se actualiza en
  // vivo) — activeContact es solo una copia tomada al momento del clic,
  // así que usarlo directo dejaría la foto "congelada".
  const liveActiveContact = activeContact
    ? allUsers.find((u) => u.uid === activeContact.uid) || activeContact
    : null;

  // Presencia solo de las filas en pantalla y de la conversación activa,
  // y solo de quien se puede ver (canSeeOnlineStatus).
  const canSeePresence = (user) => canSeeOnlineStatus(user, user?.uid, currentUid, following, followers);
  const presenceUids = [
    ...(listMode === "recent" ? recentRows.filter((r) => canSeePresence(r.user)).map((r) => r.user.uid) : []),
    liveActiveContact && canSeePresence(liveActiveContact) ? liveActiveContact.uid : null,
  ];
  const presenceByUid = usePresences(presenceUids);
  const activePresence = activeContact ? presenceByUid[activeContact.uid] : null;

  // Marcar leída la conversación abierta (punto 84, commit 3): si el último
  // mensaje es de la otra persona y es posterior a tu lastReadAt, se
  // escribe la hora — una sola vez por mensaje (markedReadRef), aunque el
  // resumen vuelva a llegar con la hora local estimada, y solo con la
  // pestaña visible (si no, quedaría leído algo que no viste).
  const activeChatId = currentUid && activeContact ? getChatId(currentUid, activeContact.uid) : null;
  const activeSummary = useChatSummary(activeChatId);
  const markedReadRef = useRef("");
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const onChange = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  useEffect(() => {
    if (!activeChatId || !pageVisible || !isChatUnread(activeSummary, currentUid)) return;
    const markKey = `${activeChatId}:${activeSummary.lastMessageAt.toMillis()}`;
    if (markedReadRef.current === markKey) return;
    markedReadRef.current = markKey;
    markChatRead(currentUid, activeChatId).catch((err) =>
      console.error("chats: no se pudo marcar como leída", err.code)
    );
  }, [activeChatId, activeSummary, currentUid, pageVisible]);

  // ¿Todavía se puede escribir en la conversación abierta? (commit 4) Si
  // mientras está abierta hay un bloqueo, o un privado deja de seguirte y
  // nunca te escribió, el campo de texto se cambia por un aviso: las
  // reglas rechazarían el envío. Mientras el resumen o los seguimientos
  // cargan, se asume que sí (no parpadea el aviso al abrir).
  const activeWriteState = !liveActiveContact
    ? "ok"
    : blockedByMe.includes(liveActiveContact.uid)
    ? "blockedByMe"
    : activeSummary === undefined || !followsReady || canChatWith(liveActiveContact, activeSummary?.writers)
    ? "ok"
    : "unavailable";

  // Error al enviar texto o sticker (por ejemplo, un bloqueo que todavía
  // no llegó a esta pestaña). Se borra al cambiar de conversación.
  const [sendError, setSendError] = useState(false);

  // Abrir una conversación desde la lista o el buscador.
  const openConversation = (user) => {
    if (recordingState !== "idle") return;
    setActiveContact(user);
    setSendError(false);
    setStickerPanelOpen(false);
    setChatUnavailable(false);
    setListMode("recent");
    setSearch("");
  };

  // Punto 90: eliminar una conversación de TU lista, con confirmación. Si
  // es la que está abierta, se cierra.
  const [deleteError, setDeleteError] = useState(false);
  const handleDeleteConversation = async (chat, user) => {
    const name = user.displayName || t("chat.defaultName");
    if (!window.confirm(t("chat.deleteConversationConfirm", { name }))) return;
    try {
      await deleteChatForMe(currentUid, chat.id);
      setDeleteError(false);
      if (activeContact?.uid === user.uid) {
        setActiveContact(null);
        setSendError(false);
        setStickerPanelOpen(false);
      }
    } catch (err) {
      console.error("chats: no se pudo eliminar la conversación", err.code);
      setDeleteError(true);
    }
  };

  // Abrir una conversación puntual al llegar desde una notificación de
  // mensaje (App.js -> openChat, mismo patrón que initialProductId en
  // StoreScreen.jsx). Espera a que lleguen la lista de usuarios y tus
  // seguimientos para no marcar "no disponible" mientras todavía cargan.
  // Mismo criterio que la lista (canChatWith): si es privado sin
  // seguimiento mutuo, hay bloqueo en cualquier dirección o ya no existe,
  // no se abre nada y se muestra un aviso genérico — el mismo texto en
  // los tres casos, para no revelar quién bloqueó a quién.
  // Además espera el resumen de ese chat: un privado que ya te escribió
  // (writers) también se abre.
  const pendingChatId =
    initialContactUid && currentUid && initialContactUid !== currentUid
      ? getChatId(currentUid, initialContactUid)
      : null;
  const pendingSummary = useChatSummary(pendingChatId);
  useEffect(() => {
    if (!initialContactUid || !currentUid || allUsersRaw.length === 0 || !followsReady) return;
    if (pendingChatId && pendingSummary === undefined) return;
    const target = allUsersRaw.find((u) => u.uid === initialContactUid);
    const available = canChatWith(target, pendingSummary?.writers);
    if (available) {
      setSendError(false);
      setActiveContact(target);
      setStickerPanelOpen(false);
      setChatUnavailable(false);
    } else {
      setActiveContact(null);
      setChatUnavailable(true);
    }
    onConsumeInitialContactUid?.();
    // canChatWith depende de lo mismo que ya está en la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContactUid, currentUid, allUsersRaw, blockedByMe, blockedMe, followsReady, following, followers, pendingChatId, pendingSummary, onConsumeInitialContactUid]);

  const handleToggleBlock = async () => {
    if (!activeContact || !currentUid) return;
    if (isBlocked) {
      await unblockUser(currentUid, activeContact.uid);
    } else {
      await blockUser(currentUid, activeContact.uid);
    }
  };

  // Punto 90: si eliminaste esta conversación, para vos empieza desde cero.
  // Se espera al resumen antes de pedir mensajes para que los viejos no
  // lleguen a descargarse ni a verse un instante.
  const activeSummaryLoaded = activeSummary !== undefined;
  const activeHiddenMs = activeSummary?.hiddenAt?.[currentUid]?.toMillis() || 0;

  // Mensajes en tiempo real de la conversación activa
  useEffect(() => {
    if (!currentUid || !activeContact || !activeSummaryLoaded) {
      setMessages([]);
      return;
    }
    const chatId = getChatId(currentUid, activeContact.uid);
    // startAfter y no where(">"): un where no incluye un mensaje recién
    // enviado hasta que el servidor le pone la hora, y tardaría en verse.
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc"),
      ...(activeHiddenMs ? [startAfter(Timestamp.fromMillis(activeHiddenMs))] : [])
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [currentUid, activeContact, activeSummaryLoaded, activeHiddenMs]);

  // Auto-scroll al último mensaje. Solo mueve la lista: scrollIntoView
  // desplazaría también la página (punto 91).
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (area) area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Si estabas al final, sigues viendo el último mensaje cuando la lista se
  // achica (sale el teclado o crece el cuadro de escribir).
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area || typeof ResizeObserver === "undefined") return undefined;
    stuckToEndRef.current = true;
    const observer = new ResizeObserver(() => {
      if (stuckToEndRef.current) area.scrollTop = area.scrollHeight;
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, [activeContactUid, currentUid, isMobile]);

  const handleMessagesScroll = (e) => {
    const area = e.currentTarget;
    stuckToEndRef.current = area.scrollHeight - area.scrollTop - area.clientHeight < 40;
  };

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

      await sendChatMessage(currentUid, activeContact.uid, {
        type: "audio",
        audioData: dataUrl,
        audioDuration: duration,
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

  // Elegir archivo -> validar -> ImageEditor.jsx (punto 65: girar/recortar,
  // Libre/Cuadrado) -> "Usar foto" lo deja "listo" en pendingImage con una
  // preview local (handleImageEdited), como antes. Recién se sube al tocar
  // "Enviar" (sendPendingImage); Cancelar en el editor no deja nada listo.
  // Errores con alert(), mismo criterio que startRecording()/
  // uploadAudioMessage() en este mismo archivo.
  const handlePickImage = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    if (!PENDING_IMAGE_TYPES.includes(file.type)) {
      alert(t("image.errorType"));
      return;
    }
    if (file.size > PENDING_IMAGE_MAX_MB * 1024 * 1024) {
      alert(t("image.errorTooLarge", { max: PENDING_IMAGE_MAX_MB }));
      return;
    }

    setEditingImageFile(file);
  };

  // "Usar foto": el Blob ya viene girado, recortado, reducido a
  // PENDING_IMAGE_MAX_SIZE y en JPEG 0.85. Si ya había una imagen lista
  // (no debería: el botón de imagen no se muestra mientras hay una), se
  // libera su preview antes de reemplazarla.
  const handleImageEdited = (blob) => {
    setEditingImageFile(null);
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { blob, previewUrl: URL.createObjectURL(blob) };
    });
  };

  // "decode"/"empty"/"nocontext"/"noblob" de ImageEditor: no se pudo abrir.
  const handleImageEditorError = () => {
    setEditingImageFile(null);
    alert(t("image.errorRead"));
  };

  const cancelPendingImage = () => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  };

  // Sube a "chatImages/{chatId}/{messageId}/img.jpg" — el messageId se
  // genera del lado del cliente ANTES de crear el mensaje (mismo problema
  // y misma solución que "postId"/"productId" en Feed.jsx/
  // CreateProductScreen.jsx: la ruta de Storage necesita un id que
  // Firestore recién asignaría al crearlo), así que acá se genera antes
  // (newMessageId) y se le pasa a sendChatMessage.
  const sendPendingImage = async () => {
    if (!pendingImage || !activeContact || !currentUid) return;
    setSendingImage(true);
    try {
      const chatId = getChatId(currentUid, activeContact.uid);
      const messageId = newMessageId(chatId);
      const fileRef = ref(storage, `chatImages/${chatId}/${messageId}/img.jpg`);
      await uploadBytes(fileRef, pendingImage.blob, { contentType: "image/jpeg" });
      const imageUrl = await getDownloadURL(fileRef);

      await sendChatMessage(currentUid, activeContact.uid, { type: "image", imageUrl }, messageId);

      await notify(activeContact.uid, {
        type: "message",
        fromUid: currentUid,
        fromName: myProfile?.displayName || "Alguien",
        fromIdentity: myProfile?.identity || "",
      });

      URL.revokeObjectURL(pendingImage.previewUrl);
      setPendingImage(null);
    } catch (err) {
      alert(t("image.errorUpload"));
    } finally {
      setSendingImage(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeContact || !currentUid) return;

    // Punto 91: el cuadro se vacía ya y conserva el foco (el teclado sigue
    // abierto), para poder seguir escribiendo mientras esto se envía y sin
    // que un doble toque mande el mensaje dos veces.
    const sentText = text;
    lastTextSendAtRef.current = Date.now();
    setText("");
    if (textInputRef.current) textInputRef.current.focus();

    // Mensaje y resumen de la conversación juntos (chatMessages.js, punto 84).
    // Si las reglas lo rechazan (bloqueo o privacidad, commit 5), se avisa
    // y el texto vuelve al campo, salvo que ya estés escribiendo otra cosa.
    try {
      await sendChatMessage(currentUid, activeContact.uid, { text: sentText.trim() });
    } catch (err) {
      console.error("chat: no se pudo enviar el mensaje", err.code);
      setSendError(true);
      setText((current) => (current.trim() ? current : sentText));
      return;
    }
    setSendError(false);

    // Notifica al destinatario que le llegó un mensaje nuevo
    await notify(activeContact.uid, {
      type: "message",
      fromUid: currentUid,
      fromName: myProfile?.displayName || "Alguien",
      fromIdentity: myProfile?.identity || "",
    });
  };

  // Punto 91: en PC, Enter envía y Shift+Enter hace línea nueva; en táctil,
  // Enter hace línea nueva y se envía con el botón. No envía mientras se
  // compone texto (acentos, teclados de otros idiomas).
  const handleComposerKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || touch) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    handleSend(e);
  };

  // Inserta un emoji del panel en el cuadro de texto, en la posición del
  // cursor (o al final). No envía nada: se manda junto con el texto, como
  // un mensaje de texto normal. En PC devuelve el foco al cuadro; en
  // pantallas táctiles no, para que el teclado no tape el panel.
  const handlePickEmoji = (emoji) => {
    const input = textInputRef.current;
    const start = input && input.selectionStart != null ? input.selectionStart : text.length;
    const end = input && input.selectionEnd != null ? input.selectionEnd : text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    const caret = start + emoji.length;
    requestAnimationFrame(() => {
      if (!input) return;
      if (!touch) input.focus();
      try {
        input.setSelectionRange(caret, caret);
      } catch (_) {
        // algunos navegadores no permiten mover el cursor sin foco
      }
    });
  };

  const handleSendSticker = async (stickerId) => {
    setStickerPanelOpen(false);
    if (!activeContact || !currentUid) return;

    try {
      await sendChatMessage(currentUid, activeContact.uid, { type: "sticker", stickerId });
    } catch (err) {
      console.error("chat: no se pudo enviar el sticker", err.code);
      setSendError(true);
      return;
    }
    setSendError(false);

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

  const wrapperStyle =
    viewportMode === "full"
      ? { ...styles.wrapper, ...styles.wrapperFull }
      : viewportMode === "page"
      ? { ...styles.wrapper, ...styles.wrapperPage }
      : styles.wrapper;
  const shellStyle =
    viewportMode === "full"
      ? { ...styles.shell, ...styles.shellFull }
      : viewportMode === "page"
      ? { ...styles.shell, ...styles.shellPage }
      : styles.shell;
  const composerSizes = composerMetrics(touch);
  // Centra los iconos de 34px con la última línea del cuadro.
  const composerIconOffset = { marginBottom: `${(composerSizes.oneLine - 34) / 2}px` };
  const hasText = !!text.trim();
  // Tras enviar, el botón pasa a micrófono al instante: un doble toque en
  // la flecha no debe empezar a grabar.
  const handleMicClick = () => {
    if (Date.now() - lastTextSendAtRef.current < 600) return;
    startRecording();
  };

  return (
    <div ref={wrapperRef} style={wrapperStyle}>
      <div style={shellStyle}>
        {showContactsList && (
          <div style={styles.contactsCol(isMobile)}>
            {listMode === "recent" ? (
              <>
                <p style={styles.contactsHeader}>{t("chat.conversationsHeader")}</p>
                <button
                  type="button"
                  style={styles.listActionBtn}
                  onClick={() => {
                    setListMode("new");
                    setSearch("");
                  }}
                >
                  ✏️ {t("chat.newConversation")}
                </button>
              </>
            ) : (
              <div style={styles.listHeaderRow}>
                <button
                  type="button"
                  style={styles.listBackBtn}
                  onClick={() => {
                    setListMode("recent");
                    setSearch("");
                  }}
                  aria-label={t("chat.backToConversations")}
                  title={t("chat.backToConversations")}
                >
                  ←
                </button>
                <p style={{ ...styles.contactsHeader, borderBottom: "none", paddingLeft: "4px" }}>
                  {t("chat.newConversation")}
                </p>
              </div>
            )}
            {chatUnavailable && (
              <p style={{ padding: "8px 16px 0", fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
                {t("chat.conversationUnavailable")}
              </p>
            )}
            <div style={styles.searchBox}>
              <input
                style={touch ? { ...styles.searchInput, fontSize: "16px" } : styles.searchInput}
                type="text"
                placeholder={t(listMode === "recent" ? "chat.searchConversations" : "chat.searchPlaceholder")}
                aria-label={t(listMode === "recent" ? "chat.searchConversations" : "chat.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={styles.contactsList}>
              {listMode === "recent" ? (
                <>
                  {recent.loading && <p style={styles.listNote}>{t("chat.loadingConversations")}</p>}
                  {recent.error && <p style={styles.listNote}>{t("chat.conversationsError")}</p>}
                  {deleteError && <p style={styles.listNote}>{t("chat.deleteConversationError")}</p>}
                  {!recent.loading && !recent.error && recentRows.length === 0 && (
                    <p style={styles.listNote}>
                      {search ? t("chat.noSearchResults") : t("chat.noConversations")}
                    </p>
                  )}
                  {recentRows.map(({ chat, user: c }) => {
                    const unread = isChatUnread(chat, currentUid);
                    const isActive = activeContact?.uid === c.uid;
                    return (
                      <div key={chat.id} style={styles.contactRow(isActive)}>
                        <button
                          type="button"
                          style={{ ...styles.contactItem(isActive), ...styles.contactRowOpen }}
                          onClick={() => openConversation(c)}
                        >
                          <Avatar
                            uid={c.uid}
                            name={c.displayName || c.identity}
                            identity={c.identity}
                            photoURL={c.photoURL}
                            size="md"
                            online={isEffectivelyOnline(presenceByUid[c.uid])}
                          />
                          <span style={styles.contactText}>
                            <span style={styles.contactTopLine}>
                              <span style={styles.contactName(unread)}>{c.displayName || t("chat.defaultName")}</span>
                              <span style={styles.contactTime}>{timeAgo(chat.lastMessageAt, t)}</span>
                            </span>
                            <span style={styles.contactBottomLine}>
                              <span style={styles.contactPreview(unread)}>{chatPreview(chat, currentUid, t)}</span>
                              {unread && (
                                <span
                                  style={styles.unreadDot}
                                  role="img"
                                  aria-label={t("chat.unread")}
                                  title={t("chat.unread")}
                                />
                              )}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          style={styles.contactDeleteBtn}
                          disabled={recordingState !== "idle"}
                          onClick={() => handleDeleteConversation(chat, c)}
                          aria-label={t("chat.deleteConversation")}
                          title={t("chat.deleteConversation")}
                        >
                          🗑
                        </button>
                      </div>
                    );
                  })}
                  {recent.hasMore && (
                    <button
                      type="button"
                      style={{ ...styles.listActionBtn, margin: "10px 12px 14px" }}
                      onClick={() => setMaxChats((n) => n + RECENT_CHATS_PAGE)}
                    >
                      {t("chat.loadMore")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {newContacts.length === 0 && (
                    <p style={styles.listNote}>
                      {search ? t("chat.noSearchResults") : t("chat.noContacts")}
                    </p>
                  )}
                  {newContacts.map((c) => (
                    <button
                      type="button"
                      key={c.uid}
                      style={styles.contactItem(activeContact?.uid === c.uid)}
                      onClick={() => openConversation(c)}
                    >
                      <Avatar
                        uid={c.uid}
                        name={c.displayName || c.identity}
                        identity={c.identity}
                        photoURL={c.photoURL}
                        size="md"
                      />
                      <span style={styles.contactText}>
                        <span style={{ ...styles.contactName(false), display: "block" }}>
                          {c.displayName || t("chat.defaultName")}
                        </span>
                        <span style={{ ...styles.contactIdentity, display: "block" }}>{c.identity}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
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
                      photoURL={liveActiveContact?.photoURL}
                      size="sm"
                      online={isEffectivelyOnline(activePresence)}
                    />
                    <div style={styles.chatHeaderText}>
                      <p style={styles.chatHeaderName}>{activeContact.displayName}</p>
                      <p style={styles.chatHeaderIdentity}>{activeContact.identity}</p>
                      {!isEffectivelyOnline(activePresence) && formatLastSeen(activePresence, t) && (
                        <p style={styles.chatHeaderLastSeen}>{formatLastSeen(activePresence, t)}</p>
                      )}
                    </div>
                  </div>
                  <button style={styles.blockBtn} onClick={handleToggleBlock}>
                    {isBlocked ? t("chat.unblock") : t("chat.block")}
                  </button>
                </div>
                <div ref={messagesAreaRef} style={styles.messagesArea} onScroll={handleMessagesScroll}>
                  {messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      mine={m.senderId === currentUid}
                      currentUid={currentUid}
                      chatId={getChatId(currentUid, activeContact.uid)}
                      onOpenPost={onOpenPost}
                      onOpenProduct={onOpenProduct}
                      senderName={
                        m.senderId === currentUid ? myProfile?.displayName : activeContact.displayName
                      }
                    />
                  ))}
                </div>
                {sendError && activeWriteState === "ok" && (
                  <p style={styles.composerNote} role="alert">
                    {t("chat.sendError")}
                  </p>
                )}
                {/* Con una nota de voz en curso se deja su fila (para poder
                    cancelarla y apagar el micrófono). */}
                {activeWriteState !== "ok" && recordingState === "idle" ? (
                  <p style={styles.composerNote} role="status">
                    {activeWriteState === "blockedByMe" ? t("chat.youBlocked") : t("chat.cannotWrite")}
                  </p>
                ) : pendingImage ? (
                  <div style={styles.imagePreviewRow}>
                    <img src={pendingImage.previewUrl} alt="" style={styles.imagePreviewThumb} />
                    <span style={styles.recordingLabel}>{t("chat.imageReady")}</span>
                    <button
                      type="button"
                      style={styles.recordCancelBtn}
                      onClick={cancelPendingImage}
                      disabled={sendingImage}
                      title={t("chat.cancel")}
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      className="pt-relief"
                      style={styles.recordSendBtn}
                      onClick={sendPendingImage}
                      disabled={sendingImage}
                      title={t("chat.send")}
                    >
                      {sendingImage ? <span className="pt-spin" style={styles.sendingSpinner} /> : "➤"}
                    </button>
                  </div>
                ) : recordingState === "idle" ? (
                  <form style={styles.inputRow} onSubmit={handleSend}>
                    <div style={styles.composerField}>
                      <div style={{ ...styles.stickerBtnWrapper, ...composerIconOffset }} ref={stickerPanelRef}>
                        <button
                          type="button"
                          style={
                            stickerPanelOpen
                              ? { ...styles.composerIconBtn, ...styles.stickerBtnActive }
                              : styles.composerIconBtn
                          }
                          onClick={() => setStickerPanelOpen((v) => !v)}
                          title={t("chat.openStickers")}
                          aria-label={t("chat.openStickers")}
                        >
                          <StickerIcon />
                        </button>
                        {stickerPanelOpen && (
                          <StickerPicker
                            onSelect={handleSendSticker}
                            onPickEmoji={handlePickEmoji}
                            tab={stickerPickerTab}
                            onTabChange={setStickerPickerTab}
                            emojiCategory={stickerPickerCategory}
                            onEmojiCategoryChange={setStickerPickerCategory}
                          />
                        )}
                      </div>
                      <ComposerTextarea
                        inputRef={textInputRef}
                        touch={touch}
                        placeholder={t("chat.messagePlaceholder")}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleComposerKeyDown}
                      />
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePickImage}
                        style={{ display: "none" }}
                      />
                      <button
                        type="button"
                        style={{ ...styles.composerIconBtn, ...composerIconOffset }}
                        onClick={() => imageInputRef.current && imageInputRef.current.click()}
                        title={t("chat.sendImage")}
                        aria-label={t("chat.sendImage")}
                      >
                        <ImageIcon />
                      </button>
                    </div>
                    {/* key distinta: son dos botones, no uno que cambia de
                        tipo mientras se lo está tocando. */}
                    {hasText ? (
                      <button
                        key="send"
                        type="submit"
                        className="pt-relief"
                        style={styles.composerRoundBtn(composerSizes.roundBtn)}
                        // Que tocar el botón no le quite el foco al cuadro.
                        onMouseDown={(e) => e.preventDefault()}
                        title={t("chat.send")}
                        aria-label={t("chat.send")}
                      >
                        ➤
                      </button>
                    ) : (
                      <button
                        key="mic"
                        type="button"
                        className="pt-relief"
                        style={styles.composerRoundBtn(composerSizes.roundBtn)}
                        onClick={handleMicClick}
                        title={t("chat.recordVoice")}
                        aria-label={t("chat.recordVoice")}
                      >
                        <MicIcon />
                      </button>
                    )}
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
                      className="pt-relief"
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

      {editingImageFile && (
        <ImageEditor
          file={editingImageFile}
          maxSize={PENDING_IMAGE_MAX_SIZE}
          onConfirm={handleImageEdited}
          onCancel={() => setEditingImageFile(null)}
          onError={handleImageEditorError}
        />
      )}
    </div>
  );
}
