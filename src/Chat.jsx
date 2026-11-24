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
import { useIsMobile, getChatId, timeAgo } from "./utils";
import {
  newMessageId,
  sendChatMessage,
  useRecentChats,
  useChatSummary,
  isChatUnread,
  canChatWithUser,
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
import { blockUser, unblockUser, useMyBlocks } from "./Blocks";
import { useAllUsers } from "./Mentions";
import {
  playReactionSound,
  playRecordStartSound,
  playRecordSendSound,
  playRecordCancelSound,
  vibrateShort,
} from "./sound";
import { usePushStatus, useViewingChatBeacon } from "./push";
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
  Quién aparece (en la lista y en el buscador), canChatWith: sin bloqueo en ninguna dirección y, si es
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
// que siempre haya buen contraste.
//
// Punto 99 (como WhatsApp): con `progress` (0 a 1) las barras ya
// reproducidas van con el color completo, las que faltan más tenues, y un
// punto marca la posición. Sin `progress` (nota enviándose) todas las
// barras van llenas y no hay punto. Ya no hay animación de ecualizador.
// El margen del viewBox deja lugar al punto en los extremos; es el mismo
// con o sin punto, así la burbuja "Enviando…" mide lo mismo que la real.
const WAVEFORM_DOT_R = 3.5;
const WAVEFORM_WIDTH =
  WAVEFORM_BARS * WAVEFORM_BAR_WIDTH + (WAVEFORM_BARS - 1) * WAVEFORM_BAR_GAP;
const WAVEFORM_OUTER_WIDTH = WAVEFORM_WIDTH + 2 * WAVEFORM_DOT_R;
const WAVEFORM_UNPLAYED_OPACITY = 0.45;

function AudioWaveform({ seed, mine, progress = null }) {
  const heights = useMemo(() => getWaveformHeights(seed), [seed]);
  const withProgress = progress != null;
  const dotX = withProgress ? Math.min(Math.max(progress, 0), 1) * WAVEFORM_WIDTH : 0;

  return (
    <svg
      viewBox={`${-WAVEFORM_DOT_R} 0 ${WAVEFORM_OUTER_WIDTH} ${WAVEFORM_VIEW_HEIGHT}`}
      width={WAVEFORM_OUTER_WIDTH}
      height={WAVEFORM_VIEW_HEIGHT}
      style={styles.waveform(mine)}
      aria-hidden="true"
    >
      {heights.map((h, i) => {
        const x = i * (WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP);
        const played = !withProgress || x + WAVEFORM_BAR_WIDTH / 2 <= dotX;
        return (
          <rect
            key={i}
            x={x}
            y={(WAVEFORM_VIEW_HEIGHT - h) / 2}
            width={WAVEFORM_BAR_WIDTH}
            height={h}
            rx={WAVEFORM_BAR_WIDTH / 2}
            fill="currentColor"
            opacity={played ? 1 : WAVEFORM_UNPLAYED_OPACITY}
          />
        );
      })}
      {withProgress && (
        <circle cx={dotX} cy={WAVEFORM_VIEW_HEIGHT / 2} r={WAVEFORM_DOT_R} fill="currentColor" />
      )}
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
  // Punto 104, parte 4: lista de conversaciones en celular, a pantalla
  // completa: sin caja, sin margen y con el fondo de la página; la lista
  // se desplaza con la página.
  wrapperList: { padding: 0 },
  shellList: {
    maxWidth: "none",
    height: "auto",
    minHeight: "60vh",
    background: "transparent",
    borderRadius: 0,
    border: "none",
    boxShadow: "none",
    overflow: "visible",
  },
  // Punto 96: el padding de abajo deja la fila de escribir arriba de la
  // línea de inicio del iPhone; useChatViewport lo pone en 0 con el teclado
  // abierto. Va en la caja (no en la fila) para que el fondo llegue al borde.
  shellFull: {
    maxWidth: "none",
    height: "100%",
    boxSizing: "border-box",
    paddingBottom: "var(--pt-safe-bottom, 0px)",
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
  // Punto 104, parte 4: título de la lista (con el degradado de la app),
  // sin línea debajo.
  contactsHeader: {
    margin: 0,
    flex: 1,
    minWidth: 0,
    fontSize: "20px",
    fontWeight: 700,
    fontFamily: "var(--font-display)",
    background: "var(--gradient-text)",
    filter: "var(--title-depth)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  },
  // Punto 104: fila de arriba de la lista: título y, a la derecha, el
  // lápiz de "Nueva conversación" (o la flecha para volver).
  listTopBar: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "14px 10px 8px 16px",
  },
  listIconBtn: (hover) => ({
    width: "38px",
    height: "38px",
    flexShrink: 0,
    borderRadius: "50%",
    border: "none",
    padding: 0,
    background: hover ? "var(--surface-alt)" : "transparent",
    color: "var(--text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
    fontSize: "18px",
  }),
  // Punto 104: buscador más delgado y suave: sin borde, con lupa.
  searchBox: {
    position: "relative",
    padding: "2px 16px 10px",
  },
  searchIcon: {
    position: "absolute",
    left: "28px",
    top: "calc(50% - 4px)",
    transform: "translateY(-50%)",
    color: "var(--text-muted)",
    display: "flex",
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "none",
    borderRadius: "999px",
    padding: "8px 14px 8px 36px",
    fontSize: "14px",
    lineHeight: "20px",
    fontFamily: "inherit",
    color: "var(--text)",
    outline: "none",
  },
  contactsList: {
    flex: 1,
    overflowY: "auto",
  },
  // Cada fila es un <button> (se abre con el teclado), sin borde, con la
  // fuente y el color de la app. La abierta (solo en PC) va resaltada.
  contactItem: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "10px 16px",
    cursor: "pointer",
    border: "none",
    background: active ? "var(--surface-alt)" : "transparent",
    color: "var(--text)",
    fontFamily: "inherit",
    textAlign: "left",
    boxSizing: "border-box",
  }),
  // Punto 104: fila de una conversación que se desliza a la izquierda
  // (ConversationRow). Sin selección de texto ni el menú del iPhone al
  // mantener presionado; touch-action pan-y: el desplazamiento vertical
  // lo sigue haciendo el navegador.
  swipeRow: {
    position: "relative",
    overflow: "hidden",
    touchAction: "pan-y",
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
  },
  swipeContent: (offset, dragging) => ({
    position: "relative",
    transform: `translateX(${offset}px)`,
    transition: dragging ? "none" : "transform 0.2s ease",
  }),
  swipeDeleteBtn: (width) => ({
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: `${width}px`,
    border: "none",
    padding: 0,
    background: "var(--danger)",
    color: "var(--on-danger)",
    fontFamily: "inherit",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    overflow: "hidden",
    whiteSpace: "nowrap",
  }),
  // En PC, 🗑 al pasar el mouse por la fila (no hay deslizar).
  hoverDeleteBtn: (hover) => ({
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: hover ? "var(--surface-alt)" : "var(--surface)",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "14px",
    padding: 0,
    fontFamily: "inherit",
  }),
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
  contactTime: (unread) => ({
    fontSize: "11px",
    color: unread ? "var(--accent2)" : "var(--text-muted)",
    fontWeight: unread ? 700 : 400,
    flexShrink: 0,
  }),
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
    width: "10px",
    height: "10px",
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
  listNote: { padding: "16px", fontSize: "13px", color: "var(--text-muted)", margin: 0 },
  // Punto 97: aviso para activar las notificaciones push.
  pushBanner: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "10px 12px 0",
    padding: "8px 6px 8px 12px",
    borderRadius: "14px",
    border: "1px solid var(--border)",
    background: "var(--accent2-soft)",
  },
  pushBannerText: { flex: 1, minWidth: 0, margin: 0, fontSize: "12px", lineHeight: 1.4, color: "var(--text)" },
  pushBannerBtn: {
    flexShrink: 0,
    padding: "6px 12px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    boxShadow: "var(--chip-shine)",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  pushBannerClose: {
    flexShrink: 0,
    width: "28px",
    height: "28px",
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: "13px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
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
    padding: "12px 10px 12px 16px",
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
  // Punto 104, parte 3: "⋯" del encabezado (en lugar del botón Bloquear) y
  // su menú.
  optionsWrapper: { position: "relative", flexShrink: 0 },
  optionsBtn: (active) => ({
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "none",
    padding: 0,
    background: active ? "var(--surface-alt)" : "transparent",
    color: "var(--text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }),
  optionsMenu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    zIndex: 20,
    minWidth: "180px",
    padding: "6px",
    borderRadius: "14px",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    boxShadow: "0 12px 30px rgba(var(--shadow-rgb), 0.28)",
  },
  optionsItem: (hover) => ({
    display: "block",
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "none",
    background: hover ? "var(--surface-alt)" : "transparent",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: "14px",
    fontWeight: 500,
    textAlign: "left",
    cursor: "pointer",
  }),
  // Punto 104: sin gap; el espacio entre mensajes lo pone cada fila
  // (bubbleRow): poco dentro de un grupo, más entre grupos.
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 16px 16px",
    display: "flex",
    flexDirection: "column",
    overscrollBehavior: "contain",
  },
  // Punto 104: columna (burbuja y, debajo, la hora), pegada a su lado.
  bubbleRow: (mine, marginTop = 12) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: mine ? "flex-end" : "flex-start",
    marginTop: `${marginTop}px`,
  }),
  bubbleWrapper: {
    position: "relative",
    maxWidth: "78%",
  },
  // Con reacción, espacio para la pastilla que cuelga abajo.
  bubbleWrapperReacted: { marginBottom: "10px" },
  // Punto 104: la hora, chica y tenue, debajo del último mensaje del grupo.
  messageTime: {
    fontSize: "11px",
    lineHeight: 1.2,
    color: "var(--text-muted)",
    margin: "3px 6px 0",
    fontVariantNumeric: "tabular-nums",
  },
  // Punto 104: "Hoy", "Ayer" o la fecha, centrado entre los mensajes.
  daySeparator: {
    display: "flex",
    justifyContent: "center",
    margin: "18px 0 4px",
  },
  daySeparatorLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--surface-alt)",
    borderRadius: "999px",
    padding: "3px 10px",
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
    padding: "9px 14px",
    borderRadius: "20px",
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
    borderRadius: "18px",
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
  // Zona tocable de la onda (punto 99): 6px más arriba y abajo para el
  // dedo, sin cambiar el alto de la burbuja. pan-y deja hacer scroll
  // vertical del chat empezando sobre la onda.
  audioScrubber: (enabled) => ({
    flexShrink: 0,
    display: "flex",
    padding: "6px 0",
    margin: "-6px 0",
    touchAction: "pan-y",
    cursor: enabled ? "pointer" : "default",
    WebkitTapHighlightColor: "transparent",
    borderRadius: "6px",
  }),
  audioDuration: (mine) => ({
    fontSize: "12px",
    fontWeight: 600,
    flexShrink: 0,
    // Cifras del mismo ancho: el contador no "baila" al avanzar.
    fontVariantNumeric: "tabular-nums",
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

// ---------------------------------------------------------------------
// Punto 99: reproducir notas de voz como en WhatsApp.
// - Sin reproducir: duración total. Reproduciendo o en pausa: el tiempo
//   que va. Al terminar vuelve a 0 y a la duración total.
// - La onda se llena según el avance (requestAnimationFrame solo mientras
//   suena) y se puede tocar o arrastrar para adelantar o retroceder. El
//   arrastre solo mueve el punto; el audio salta al soltar (en webm largo
//   cada salto puede tardar).
// - Solo una nota suena a la vez (activeVoiceNoteAudio).
// - Duración faltante o 0 (notas viejas): esa nota carga sus datos
//   básicos y toma la duración del audio. El webm de Chrome/Android no la
//   trae en el archivo (da Infinity): se salta "al final" para que el
//   navegador la calcule y se vuelve a 0.
// ---------------------------------------------------------------------
let activeVoiceNoteAudio = null;

const SEEK_STEP_SECONDS = 5;
const SCRUB_START_PX = 6;
// Un salto justo al final puede disparar "ended" y volver a 0.
const SEEK_END_MARGIN = 0.05;

function AudioMessage({ src, duration, mine, id }) {
  const { t } = useLanguage();
  const audioRef = useRef(null);
  const scrubberRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [realDuration, setRealDuration] = useState(null);

  const savedDuration = Number(duration) > 0 ? Number(duration) : 0;
  const needsProbe = savedDuration === 0;
  const total = realDuration || savedDuration;
  const totalRef = useRef(total);
  totalRef.current = total;

  const probingRef = useRef(false); // calculando la duración de un webm
  const pendingSeekRef = useRef(null); // salto pedido antes de que cargue
  const loadRequestedRef = useRef(false);
  const scrubbingRef = useRef(false);
  const pointerRef = useRef(null); // { id, startX, moved }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const readDuration = () => {
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) {
        setRealDuration(d);
        return true;
      }
      return false;
    };
    const applyPendingSeek = (fallback) => {
      const target = pendingSeekRef.current ?? fallback;
      pendingSeekRef.current = null;
      if (target != null) audio.currentTime = target;
    };
    const onMetadata = () => {
      if (readDuration()) {
        applyPendingSeek(null);
        return;
      }
      if (audio.duration === Infinity && !probingRef.current) {
        probingRef.current = true;
        audio.currentTime = 1e101;
      }
    };
    const onDurationChange = () => {
      if (readDuration() && probingRef.current) {
        probingRef.current = false;
        applyPendingSeek(0);
      }
    };
    const onPlay = () => {
      if (activeVoiceNoteAudio && activeVoiceNoteAudio !== audio) {
        activeVoiceNoteAudio.pause();
      }
      activeVoiceNoteAudio = audio;
      setPlaying(true);
    };
    const onPause = () => {
      setPlaying(false);
      if (activeVoiceNoteAudio === audio) activeVoiceNoteAudio = null;
      if (!scrubbingRef.current && !probingRef.current) setPosition(audio.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      setPosition(0);
      audio.currentTime = 0;
      if (activeVoiceNoteAudio === audio) activeVoiceNoteAudio = null;
    };

    audio.addEventListener("loadedmetadata", onMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      if (activeVoiceNoteAudio === audio) activeVoiceNoteAudio = null;
      audio.pause();
    };
  }, []);

  // Avance en tiempo real, solo mientras suena.
  useEffect(() => {
    if (!playing) return undefined;
    const audio = audioRef.current;
    let frame = 0;
    const tick = () => {
      if (!scrubbingRef.current) setPosition(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (probingRef.current) {
      // Play mientras se calculaba la duración: arrancar desde donde iba.
      probingRef.current = false;
      audio.currentTime = pendingSeekRef.current ?? 0;
      pendingSeekRef.current = null;
    }
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  const seekTo = (seconds) => {
    const audio = audioRef.current;
    const tot = totalRef.current;
    if (!audio || !tot) return;
    const target = Math.min(Math.max(seconds, 0), Math.max(0, tot - SEEK_END_MARGIN));
    setPosition(target);
    if (audio.readyState >= 1 && !probingRef.current) {
      audio.currentTime = target;
      return;
    }
    // Todavía no cargó (preload "none"): el salto se aplica al cargar.
    pendingSeekRef.current = target;
    if (audio.readyState === 0 && !loadRequestedRef.current) {
      loadRequestedRef.current = true;
      audio.preload = "metadata";
      audio.load();
    }
  };

  const ratioFromEvent = (e) => {
    const rect = scrubberRef.current.getBoundingClientRect();
    // El viewBox tiene el margen del punto a cada lado.
    const pad = (WAVEFORM_DOT_R * rect.width) / WAVEFORM_OUTER_WIDTH;
    const ratio = (e.clientX - rect.left - pad) / (rect.width - 2 * pad);
    return Math.min(Math.max(ratio, 0), 1);
  };

  // Tocar = saltar al soltar. Arrastrar (más de 6px de lado) = el punto
  // sigue al dedo y el audio salta al soltar. Si el dedo hace scroll
  // vertical, el navegador cancela y no se salta.
  const onPointerDown = (e) => {
    if (!total || (e.pointerType === "mouse" && e.button !== 0)) return;
    pointerRef.current = { id: e.pointerId, startX: e.clientX, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // sin captura: el arrastre funciona igual mientras el dedo siga encima
    }
  };
  const onPointerMove = (e) => {
    const p = pointerRef.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.moved && Math.abs(e.clientX - p.startX) < SCRUB_START_PX) return;
    p.moved = true;
    scrubbingRef.current = true;
    setPosition(ratioFromEvent(e) * totalRef.current);
  };
  const onPointerUp = (e) => {
    const p = pointerRef.current;
    if (!p || p.id !== e.pointerId) return;
    pointerRef.current = null;
    scrubbingRef.current = false;
    seekTo(ratioFromEvent(e) * totalRef.current);
  };
  const onPointerCancel = () => {
    pointerRef.current = null;
    if (scrubbingRef.current) {
      scrubbingRef.current = false;
      const audio = audioRef.current;
      if (audio && !probingRef.current) setPosition(audio.currentTime);
    }
  };

  const onKeyDown = (e) => {
    if (!total) return;
    let target = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") target = position + SEEK_STEP_SECONDS;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") target = position - SEEK_STEP_SECONDS;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = total;
    if (target == null) return;
    e.preventDefault();
    seekTo(target);
  };

  const started = playing || position > 0;
  const progress = total ? Math.min(position / total, 1) : 0;
  // Notas de menos de 1 s: 0:01, como WhatsApp.
  const totalShown = total > 0 ? Math.max(1, total) : 0;
  const elapsedShown = Math.floor(position);
  const label = started ? formatDuration(elapsedShown) : formatDuration(totalShown);

  return (
    <div style={styles.audioMessage}>
      <audio ref={audioRef} src={src} preload={needsProbe ? "metadata" : "none"} />
      <button
        type="button"
        style={styles.audioPlayBtn(mine)}
        onClick={toggle}
        title={playing ? t("chat.pauseAudio") : t("chat.playAudio")}
        aria-label={playing ? t("chat.pauseAudio") : t("chat.playAudio")}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <div
        ref={scrubberRef}
        role="slider"
        tabIndex={0}
        aria-label={t("chat.voiceNotePosition")}
        aria-valuemin={0}
        aria-valuemax={Math.round(totalShown)}
        aria-valuenow={elapsedShown}
        aria-valuetext={`${formatDuration(elapsedShown)} / ${formatDuration(totalShown)}`}
        style={styles.audioScrubber(total > 0)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <AudioWaveform seed={id || src} mine={mine} progress={progress} />
      </div>
      <span style={styles.audioDuration(mine)}>{label}</span>
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
// Punto 98b: nota de voz propia que se está enviando. Misma burbuja que
// AudioMessage (misma forma de onda, porque usa el id del mensaje real),
// con un círculo girando en lugar de ▶ y "Enviando…".
function SendingVoiceNote({ id, duration, groupFirst = true }) {
  const { t } = useLanguage();
  return (
    <div style={styles.bubbleRow(true, groupFirst ? 12 : 2)}>
      <div style={styles.bubbleWrapper}>
        <div style={{ ...styles.bubble(true), ...bubbleCorners(true, groupFirst, true), opacity: 0.8 }}>
          <div style={styles.audioMessage} aria-live="polite">
            <span style={{ ...styles.audioPlayBtn(true), cursor: "default" }}>
              <span
                className="pt-spin"
                style={{ ...styles.sendingSpinner, borderColor: "var(--border)", borderTopColor: "var(--accent2)" }}
              />
            </span>
            <AudioWaveform seed={id} mine />
            <span style={styles.audioDuration(true)}>
              {formatDuration(duration)} · {t("chat.sendingVoice")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Punto 104: groupFirst/groupLast (lugar en el grupo, ver sameGroup),
// marginTop (espacio con el de arriba), timeLabel (la hora, solo en el
// último del grupo) y touch (letra un poco más grande en el celular).
function MessageBubble({
  message,
  mine,
  currentUid,
  chatId,
  onOpenPost,
  onOpenProduct,
  senderName,
  groupFirst = true,
  groupLast = true,
  marginTop = 12,
  timeLabel = null,
  touch = false,
}) {
  const { open, setOpen, containerRef, triggerProps } = useReactionPicker();
  const corners = bubbleCorners(mine, groupFirst, groupLast);
  const bubbleStyle = { ...styles.bubble(mine), ...corners, ...(touch ? { fontSize: "15px" } : null) };
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
    <div style={styles.bubbleRow(mine, marginTop)}>
      <div
        ref={containerRef}
        style={
          reactionEmojis.length > 0 ? { ...styles.bubbleWrapper, ...styles.bubbleWrapperReacted } : styles.bubbleWrapper
        }
        {...triggerProps}
      >
        {message.imageUrl ? (
          <div style={styles.imageBubble}>
            <img
              src={message.imageUrl}
              alt=""
              style={{ ...styles.imageBubbleImg, ...bubbleCorners(mine, groupFirst, groupLast, 18) }}
              onClick={() => setImageViewerOpen(true)}
            />
            {message.text && (
              <div style={bubbleStyle}>
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
          <div style={bubbleStyle}>
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
      {timeLabel && <span style={styles.messageTime}>{timeLabel}</span>}
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

// ---------------------------------------------------------------------
// Punto 104: grupos de mensajes, hora y separadores de día
// ---------------------------------------------------------------------
// Mensajes seguidos de la misma persona, el mismo día y con menos de 5
// minutos entre uno y otro forman un grupo: van más juntos, con la
// esquina de su lado más chica, y solo el último lleva la hora.
const GROUP_GAP_MS = 5 * 60 * 1000;
const BUBBLE_RADIUS = 20;
const BUBBLE_RADIUS_JOINED = 6;

// Un mensaje recién enviado todavía no tiene la hora del servidor: se usa
// la estimada (serverTimestamps: "estimate") o, si falta, ahora.
function messageMs(message) {
  const at = message && message.createdAt;
  return at && typeof at.toMillis === "function" ? at.toMillis() : Date.now();
}

function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function sameGroup(a, b) {
  if (!a || !b || a.senderId !== b.senderId) return false;
  const aMs = messageMs(a);
  const bMs = messageMs(b);
  return startOfDay(aMs) === startOfDay(bMs) && bMs - aMs < GROUP_GAP_MS;
}

function dateLocale(language) {
  return language === "en" ? "en-US" : "es";
}

function formatMessageTime(ms, language) {
  try {
    return new Intl.DateTimeFormat(dateLocale(language), { hour: "numeric", minute: "2-digit" }).format(ms);
  } catch (e) {
    return "";
  }
}

// "Hoy", "Ayer", el día de la semana (esta semana) o la fecha (con el año
// solo si no es este año).
function formatDayLabel(ms, language, t) {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / 86400000);
  if (days === 0) return t("chat.today");
  if (days === 1) return t("chat.yesterday");
  const sameYear = new Date(ms).getFullYear() === new Date().getFullYear();
  const options =
    days > 1 && days < 7
      ? { weekday: "long" }
      : sameYear
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" };
  try {
    const label = new Intl.DateTimeFormat(dateLocale(language), options).format(ms);
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch (e) {
    return "";
  }
}

// Esquinas de una burbuja según su lugar en el grupo: del lado de quien
// escribe, chica arriba si no es la primera y chica abajo si no es la
// última.
function bubbleCorners(mine, groupFirst, groupLast, big = BUBBLE_RADIUS) {
  const side = mine ? "Right" : "Left";
  return {
    borderRadius: `${big}px`,
    [`borderTop${side}Radius`]: `${groupFirst ? big : BUBBLE_RADIUS_JOINED}px`,
    [`borderBottom${side}Radius`]: `${groupLast ? big : BUBBLE_RADIUS_JOINED}px`,
  };
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="4" cy="10" r="1.8" fill="currentColor" />
      <circle cx="10" cy="10" r="1.8" fill="currentColor" />
      <circle cx="16" cy="10" r="1.8" fill="currentColor" />
    </svg>
  );
}

// Punto 104, parte 3: "⋯" en el encabezado de la conversación, con "Ver
// perfil" y "Bloquear"/"Desbloquear". Se cierra al elegir, al tocar
// afuera o con Escape.
function ChatOptionsMenu({ isBlocked, onToggleBlock, onViewProfile }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { key: "profile", label: t("chat.viewProfile"), run: onViewProfile },
    { key: "block", label: isBlocked ? t("chat.unblock") : t("chat.block"), run: onToggleBlock },
  ];

  return (
    <div ref={ref} style={styles.optionsWrapper}>
      <button
        type="button"
        style={styles.optionsBtn(open || hovered === "button")}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHovered("button")}
        onMouseLeave={() => setHovered(null)}
        aria-label={t("chat.moreOptions")}
        title={t("chat.moreOptions")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreIcon />
      </button>
      {open && (
        <div role="menu" style={styles.optionsMenu}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              style={styles.optionsItem(hovered === item.key)}
              onMouseEnter={() => setHovered(item.key)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                setOpen(false);
                setHovered(null);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Punto 104, parte 4: fila de conversación que se borra deslizando o
// manteniendo presionado
// ---------------------------------------------------------------------
// - Deslizar a la izquierda: aparece "Eliminar" (rojo, --danger) detrás de
//   la fila; tocarlo pide la confirmación de siempre (onDelete). Solo
//   cuenta si el dedo va claramente de lado (el desplazamiento vertical
//   lo sigue haciendo el navegador: touch-action pan-y). Una sola fila
//   abierta a la vez (openRowId); tocar en otro lado la cierra.
// - Mantener presionado ~0,5 s (dedo o mouse), o clic derecho: la
//   confirmación directo, sin abrir el chat.
// - En PC (sin pantalla táctil): además, 🗑 al pasar el mouse.
const SWIPE_ACTION_WIDTH = 88;
const SWIPE_START_PX = 10;
const LONG_PRESS_MS = 500;

function ConversationRow({ rowId, openRowId, setOpenRowId, touch, active, disabled, onOpen, onDelete, children }) {
  const { t } = useLanguage();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(null); // null | "row" | "trash"
  const rowRef = useRef(null);
  const gestureRef = useRef(null); // { x, y, startOffset, mode: null | "swipe" | "scroll" }
  const pressTimerRef = useRef(null);
  const suppressClickRef = useRef(false);
  const isOpen = openRowId === rowId;

  // Otra fila se abrió (o se pidió cerrar): esta vuelve a su lugar.
  useEffect(() => {
    if (!isOpen && !dragging) setOffset(0);
  }, [isOpen, dragging]);

  // Abierta: tocar fuera de la fila la cierra.
  useEffect(() => {
    if (!isOpen) return undefined;
    const outside = (e) => {
      if (rowRef.current && !rowRef.current.contains(e.target)) setOpenRowId(null);
    };
    document.addEventListener("touchstart", outside);
    document.addEventListener("mousedown", outside);
    return () => {
      document.removeEventListener("touchstart", outside);
      document.removeEventListener("mousedown", outside);
    };
  }, [isOpen, setOpenRowId]);

  useEffect(() => () => clearTimeout(pressTimerRef.current), []);

  const cancelPress = () => {
    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  };

  // onDelete muestra la confirmación (window.confirm, que frena todo hasta
  // que se responde). El clic que el navegador manda al soltar el dedo no
  // tiene que abrir el chat; pasado un momento, los clics vuelven a valer.
  const askDelete = () => {
    if (disabled) return;
    suppressClickRef.current = true;
    setOpenRowId(null);
    setOffset(0);
    onDelete();
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 600);
  };

  const startPress = () => {
    cancelPress();
    if (disabled) return;
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      gestureRef.current = null;
      setDragging(false);
      askDelete();
    }, LONG_PRESS_MS);
  };

  const handleTouchStart = (e) => {
    const p = e.touches[0];
    suppressClickRef.current = false;
    gestureRef.current = { x: p.clientX, y: p.clientY, startOffset: offset, mode: null };
    startPress();
  };

  const handleTouchMove = (e) => {
    const g = gestureRef.current;
    if (!g) return;
    const p = e.touches[0];
    const dx = p.clientX - g.x;
    const dy = p.clientY - g.y;
    if (!g.mode) {
      if (Math.abs(dx) < SWIPE_START_PX && Math.abs(dy) < SWIPE_START_PX) return;
      cancelPress();
      g.mode = Math.abs(dx) > Math.abs(dy) * 1.2 && !disabled ? "swipe" : "scroll";
      if (g.mode === "swipe") setDragging(true);
    }
    if (g.mode !== "swipe") return;
    // Hasta un poco más que el botón, con resistencia; nunca a la derecha.
    const raw = Math.min(0, g.startOffset + dx);
    const limit = -SWIPE_ACTION_WIDTH;
    setOffset(raw < limit ? limit + (raw - limit) * 0.3 : raw);
  };

  const handleTouchEnd = () => {
    cancelPress();
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || g.mode !== "swipe") return;
    suppressClickRef.current = true;
    setDragging(false);
    if (offset < -SWIPE_ACTION_WIDTH / 2) {
      setOffset(-SWIPE_ACTION_WIDTH);
      setOpenRowId(rowId);
    } else {
      setOffset(0);
      if (isOpen) setOpenRowId(null);
    }
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // Abierta: tocarla la cierra en lugar de abrir el chat.
    if (isOpen || offset !== 0) {
      setOpenRowId(null);
      setOffset(0);
      return;
    }
    onOpen();
  };

  const actionWidth = Math.max(0, -offset);

  return (
    <div
      ref={rowRef}
      style={styles.swipeRow}
      onMouseEnter={() => setHover("row")}
      onMouseLeave={() => {
        setHover(null);
        cancelPress();
      }}
    >
      {actionWidth > 0 && (
        <button
          type="button"
          style={styles.swipeDeleteBtn(actionWidth)}
          onClick={askDelete}
          aria-label={t("chat.deleteConversation")}
        >
          {t("chat.delete")}
        </button>
      )}
      <div style={styles.swipeContent(offset, dragging)}>
        <button
          type="button"
          style={styles.contactItem(active)}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          // El mouse (PC) también puede mantener presionado; el táctil
          // usa los eventos de arriba (sin esto, el toque contaría dos
          // veces: el navegador también simula el mouse).
          onMouseDown={(e) => {
            if (touch) return;
            suppressClickRef.current = false;
            if (e.button === 0) startPress();
          }}
          onMouseUp={cancelPress}
          // Clic derecho en PC y, en Android, el mantener presionado del
          // sistema: la misma confirmación (una sola vez por toque).
          onContextMenu={(e) => {
            e.preventDefault();
            if (pressTimerRef.current || !suppressClickRef.current) {
              cancelPress();
              askDelete();
            }
          }}
        >
          {children}
        </button>
        {!touch && (hover === "row" || hover === "trash") && (
          <button
            type="button"
            style={styles.hoverDeleteBtn(hover === "trash")}
            disabled={disabled}
            onMouseEnter={() => setHover("trash")}
            onMouseLeave={() => setHover("row")}
            onClick={askDelete}
            aria-label={t("chat.deleteConversation")}
            title={t("chat.deleteConversation")}
          >
            🗑
          </button>
        )}
      </div>
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
// Cuánto se tiene que achicar el área visible (respecto de la más alta vista
// con el chat abierto) para dar el teclado por abierto. La barra de Safari
// que aparece o se esconde mide menos.
const KEYBOARD_MIN_HEIGHT = 150;
const FIELD_TAGS = new Set(["INPUT", "TEXTAREA"]);

function useChatViewport(wrapperRef, mode) {
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el || mode === "flow") return undefined;
    const vv = window.visualViewport;
    // Punto 96b: alto visible más grande visto desde que se abrió el chat,
    // por ancho de pantalla (al girar el celular cambia). No se compara con
    // innerHeight: en la app instalada de iOS también se achica con el
    // teclado y la diferencia no llegaba al umbral.
    const tallestByWidth = new Map();

    // Teclado abierto: un cuadro del chat con foco en pantalla táctil, o el
    // área visible bastante más baja que la más alta vista.
    const isKeyboardOpen = (visibleHeight) => {
      const focused = document.activeElement;
      if (
        isTouchScreen() &&
        focused &&
        FIELD_TAGS.has(focused.tagName) &&
        el.contains(focused)
      ) {
        return true;
      }
      const width = window.innerWidth;
      const tallest = Math.max(tallestByWidth.get(width) || 0, visibleHeight);
      tallestByWidth.set(width, tallest);
      return tallest - visibleHeight > KEYBOARD_MIN_HEIGHT;
    };

    const sync = () => {
      // Con zoom de dedos el área visible se achica, pero la caja no debe.
      if (vv && vv.scale > 1.01) return;
      const visibleHeight = vv ? vv.height : window.innerHeight;
      if (mode === "full") {
        el.style.top = `${vv ? vv.offsetTop : 0}px`;
        el.style.height = `${visibleHeight}px`;
        el.style.setProperty("--pt-chat-height", `${visibleHeight}px`);
        // Punto 96: con el teclado abierto (el área visible se achica) la
        // línea de inicio queda tapada: sin espacio extra, la fila de
        // escribir va pegada al teclado. En Android y PC env() vale 0.
        el.style.setProperty(
          "--pt-safe-bottom",
          isKeyboardOpen(visibleHeight) ? "0px" : "env(safe-area-inset-bottom, 0px)"
        );
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
    // Punto 96b: al tocar el cuadro de escribir (o salir de él) se recalcula
    // en el momento, sin esperar a que el área visible cambie de alto. El
    // setTimeout deja que document.activeElement ya sea el nuevo.
    let focusTimer = null;
    const syncAfterFocus = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(sync, 0);
    };
    if (mode === "full") {
      document.addEventListener("focusin", syncAfterFocus);
      document.addEventListener("focusout", syncAfterFocus);
    }
    // En PC, el alto disponible cambia si se cierra el banner.
    const observer =
      mode === "page" && typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    if (observer) observer.observe(body);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("focusin", syncAfterFocus);
      document.removeEventListener("focusout", syncAfterFocus);
      window.removeEventListener("resize", sync);
      if (vv) {
        vv.removeEventListener("resize", sync);
        vv.removeEventListener("scroll", sync);
      }
      if (observer) observer.disconnect();
      el.style.removeProperty("top");
      el.style.removeProperty("height");
      el.style.removeProperty("--pt-chat-height");
      el.style.removeProperty("--pt-safe-bottom");
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
  openRequest = null,
  onOpenRequestDone = () => {},
}) {
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const [touch] = useState(isTouchScreen);
  const [currentUid, setCurrentUid] = useState(null);
  // Tu perfil en vivo, de AllUsersContext (punto 70, commit 9c).
  const myProfile = useUserProfile(currentUid);
  const [activeContact, setActiveContact] = useState(null);
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

  // Estado del grabador de notas de voz: "idle" | "starting" | "recording" | "ready"
  // ("starting" = ya se ve "Grabando" pero el micrófono todavía se está
  // abriendo, punto 98b; "ready" = ya se detuvo por el límite de 60s,
  // esperando que se envíe o cancele)
  const [recordingState, setRecordingState] = useState("idle");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState(null); // { blob, duration } mientras está en "ready"
  // Punto 98b: notas de voz enviándose, que ya se ven en el chat con
  // "Enviando…" (SendingVoiceNote) hasta que llega el mensaje real.
  // [{ id, chatId, duration }]; id es el del mensaje que se va a escribir.
  const [sendingVoiceNotes, setSendingVoiceNotes] = useState([]);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const secondsRef = useRef(0);
  // Qué hacer cuando el grabador termine de cerrarse: { action, send }.
  // Uno por grabación, así una nota que todavía se está cerrando no se
  // mezcla con la siguiente.
  const recordSessionRef = useRef(null);
  // Sube con cada intento de grabar y al cancelar mientras el micrófono se
  // abre: un micrófono que abre tarde para un intento viejo se apaga solo.
  const recordAttemptRef = useRef(0);
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
  const canChatWith = (user, writers) =>
    canChatWithUser(user, currentUid, writers, { blockedByMe, blockedMe, following, followers });

  // "recent": tus conversaciones; "new": buscador de "Nueva conversación".
  const [listMode, setListMode] = useState("recent");
  // Punto 104: la fila deslizada (con "Eliminar" a la vista), una a la vez,
  // y el hover de los íconos de arriba de la lista (lápiz / flecha).
  const [openRowId, setOpenRowId] = useState(null);
  const [listIconHover, setListIconHover] = useState(null);

  // Punto 97: aviso para activar las notificaciones (nunca se piden solas
  // al abrir la app). En iPhone sin instalar, explica cómo instalarla.
  // Se cierra con ✕ y no vuelve en este navegador.
  const push = usePushStatus(currentUid);
  const pushBanner =
    push.enabled || push.bannerHidden
      ? null
      : push.support === "supported" && push.permission !== "denied"
      ? "enable"
      : push.support === "ios-install"
      ? "install"
      : null;
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

  // Punto 97: mientras ves esta conversación, no te llegan notificaciones
  // push de ella en este dispositivo (ver push.js).
  useViewingChatBeacon(currentUid, pageVisible ? activeChatId : null);

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
    setListMode("recent");
    setSearch("");
  };

  // Punto 97: al tocar una notificación push, App.js pide abrir el chat con
  // esa persona ({ uid, at }). Se espera a que su perfil esté cargado; un
  // uid que no existe simplemente no abre nada.
  useEffect(() => {
    if (!openRequest || !currentUid) return;
    const user = usersByUid[openRequest.uid];
    if (!user) return;
    onOpenRequestDone();
    openConversation(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest, currentUid, usersByUid]);

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
      // "estimate": un mensaje recién enviado ya trae una hora (la local)
      // mientras el servidor pone la suya (punto 104: hora y día).
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) })));
    });
    return unsub;
  }, [currentUid, activeContact, activeSummaryLoaded, activeHiddenMs]);

  // Punto 104: al abrir una conversación se aparece YA en el último mensaje
  // (sin animación, antes de pintar); el desplazamiento suave queda solo
  // para un mensaje NUEVO (llega o lo envías), y solo si estabas abajo o es
  // tuyo. Una reacción o un cambio en un mensaje viejo no mueve nada. Solo
  // mueve la lista: scrollIntoView desplazaría también la página (punto 91).
  // - Lo primero que llega de esa conversación, y todo lo que llegue el
  //   primer segundo después de abrirla (openedAt: la caché y después el
  //   servidor), va directo al final, sin animación.
  // - followingRef: mientras corre el desplazamiento suave, la lista
  //   todavía no está "al final"; esto evita que el scroll la dé por
  //   despegada (si la persona toca la lista, se corta).
  const scrollStateRef = useRef({ chatKey: null, openedAt: 0, lastKey: null });
  const followingRef = useRef(false);
  const visibleSendingCount = activeChatId
    ? sendingVoiceNotes.filter((n) => n.chatId === activeChatId && !messages.some((m) => m.id === n.id)).length
    : 0;
  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const lastKey = `${lastMessage ? lastMessage.id : ""}|${visibleSendingCount}`;
  useLayoutEffect(() => {
    const area = messagesAreaRef.current;
    const state = scrollStateRef.current;
    if (state.chatKey !== activeChatId) {
      state.chatKey = activeChatId;
      state.openedAt = Date.now();
      state.lastKey = null;
    }
    if (!area || !lastMessage) return;
    if (state.lastKey === lastKey) return;
    const firstContent = state.lastKey === null;
    state.lastKey = lastKey;
    if (firstContent || Date.now() - state.openedAt < 1000) {
      area.scrollTop = area.scrollHeight;
      stuckToEndRef.current = true;
      return;
    }
    const mine = lastMessage.senderId === currentUid || visibleSendingCount > 0;
    if (!stuckToEndRef.current && !mine) return;
    stuckToEndRef.current = true;
    followingRef.current = true;
    area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
  }, [activeChatId, lastKey, lastMessage, currentUid, visibleSendingCount]);

  // Una foto, un sticker o un post compartido que termina de cargar hace
  // crecer la lista: si estabas al final, sigues al final.
  const handleMessagesMediaLoad = () => {
    const area = messagesAreaRef.current;
    if (area && stuckToEndRef.current) area.scrollTop = area.scrollHeight;
  };
  const stopFollowing = () => {
    followingRef.current = false;
  };

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
    const atEnd = area.scrollHeight - area.scrollTop - area.clientHeight < 40;
    if (atEnd) followingRef.current = false;
    // Durante el desplazamiento suave sigue "al final" (ver followingRef).
    stuckToEndRef.current = atEnd || followingRef.current;
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
    const attempts = recordAttemptRef;
    const streams = streamRef;
    return () => {
      attempts.current += 1;
      streams.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") {
      alert(t("chat.noMicSupport"));
      return;
    }
    // Punto 98b: la fila de grabación aparece en el mismo toque, aunque el
    // micrófono tarde en abrir (en iPhone puede tardar). El contador corre
    // recién cuando de verdad graba.
    const attempt = ++recordAttemptRef.current;
    secondsRef.current = 0;
    setRecordSeconds(0);
    setRecordingState("starting");
    // Punto 98: bip y vibración en el mismo toque (Safari solo deja sonar
    // audio que nace de un gesto), antes de abrir el micrófono. En iPhone
    // no suena (punto 98b), así que no hay nada que esperar.
    const beepEndsAt = Date.now() + playRecordStartSound();
    vibrateShort();
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Se graba recién cuando terminó el bip, para que no quede en la nota.
      const beepLeft = beepEndsAt - Date.now();
      if (beepLeft > 0) await new Promise((resolve) => setTimeout(resolve, beepLeft));
      // Se canceló, se cerró el chat o empezó otra grabación mientras tanto.
      if (attempt !== recordAttemptRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
        ? AUDIO_MIME_TYPE
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
      const chunks = [];
      const session = { action: null, send: null };

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (streamRef.current === stream) streamRef.current = null;

        // Con el micrófono ya apagado, así el sonido no se graba. La
        // pantalla ya volvió al cuadro de escribir al tocar (punto 98b).
        if (session.action === "cancel") {
          playRecordCancelSound();
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });

        if (session.action === "send") {
          playRecordSendSound();
          uploadAudioMessage(blob, session.send);
        } else {
          // se detuvo sola al llegar al límite: espera confirmación del usuario
          setPendingAudio({ blob, duration: secondsRef.current });
          setRecordingState("ready");
        }
      };

      mediaRecorderRef.current = recorder;
      recordSessionRef.current = session;
      recorder.start();
      setRecordingState("recording");
    } catch (err) {
      stream?.getTracks().forEach((tr) => tr.stop());
      if (attempt !== recordAttemptRef.current) return;
      setRecordingState("idle");
      alert(t("chat.micPermissionError"));
    }
  };

  // Punto 98b: muestra la nota en el chat con "Enviando…" al instante y
  // devuelve a dónde mandarla. El destinatario se fija al tocar: si
  // cambias de conversación mientras se sube, va igual a la correcta.
  const beginVoiceNoteSend = (duration) => {
    if (!activeContact || !currentUid) return null;
    const chatId = getChatId(currentUid, activeContact.uid);
    const id = doc(collection(db, "chats", chatId, "messages")).id;
    setSendingVoiceNotes((list) => [...list, { id, chatId, duration }]);
    return { id, otherUid: activeContact.uid, duration };
  };

  const resetRecorderUi = () => {
    setRecordingState("idle");
    setRecordSeconds(0);
    secondsRef.current = 0;
  };

  // ✕ o ➤ mientras graba: la pantalla responde en el mismo toque y el
  // grabador se cierra por detrás (en iPhone puede tardar). "auto" (límite
  // de 60 s) deja la fila hasta que la nota quede lista.
  function requestStopRecording(action) {
    if (recordingState === "starting") {
      // El micrófono todavía no abrió: no hay nada grabado.
      recordAttemptRef.current += 1;
      resetRecorderUi();
      return;
    }
    const recorder = mediaRecorderRef.current;
    const session = recordSessionRef.current;
    if (!recorder || !session || recorder.state === "inactive") return;
    if (action === "send") {
      session.send = beginVoiceNoteSend(secondsRef.current);
      session.action = session.send ? "send" : "cancel";
    } else {
      session.action = action;
    }
    if (action !== "auto") resetRecorderUi();
    recorder.stop();
  }

  const cancelReadyRecording = () => {
    playRecordCancelSound();
    setPendingAudio(null);
    resetRecorderUi();
  };

  const sendReadyRecording = () => {
    if (!pendingAudio) return;
    playRecordSendSound();
    const { blob, duration } = pendingAudio;
    setPendingAudio(null);
    resetRecorderUi();
    const target = beginVoiceNoteSend(duration);
    if (target) uploadAudioMessage(blob, target);
  };

  // Corre por detrás: la nota ya se ve con "Enviando…". En cuanto se
  // escribe, Firestore la muestra en el chat sin esperar al servidor y la
  // provisoria se oculta (mismo id); se quita del todo al terminar.
  const uploadAudioMessage = async (blob, { id, otherUid, duration }) => {
    const removeSending = () => setSendingVoiceNotes((list) => list.filter((n) => n.id !== id));
    if (!currentUid) {
      removeSending();
      return;
    }
    try {
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > MAX_AUDIO_BASE64_LENGTH) {
        alert(t("chat.audioTooLarge"));
        return;
      }

      await sendChatMessage(
        currentUid,
        otherUid,
        {
          type: "audio",
          audioData: dataUrl,
          audioDuration: duration,
        },
        id
      );
    } catch (err) {
      alert(t("chat.audioSendError"));
    } finally {
      removeSending();
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

  // Punto 104: en celular, la lista va a pantalla completa (sin caja).
  const mobileList = isMobile && !activeContact;
  const wrapperStyle =
    viewportMode === "full"
      ? { ...styles.wrapper, ...styles.wrapperFull }
      : viewportMode === "page"
      ? { ...styles.wrapper, ...styles.wrapperPage }
      : mobileList
      ? { ...styles.wrapper, ...styles.wrapperList }
      : styles.wrapper;
  const shellStyle =
    viewportMode === "full"
      ? { ...styles.shell, ...styles.shellFull }
      : viewportMode === "page"
      ? { ...styles.shell, ...styles.shellPage }
      : mobileList
      ? { ...styles.shell, ...styles.shellList }
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
                <div style={styles.listTopBar}>
                  <h2 style={styles.contactsHeader}>{t("chat.conversationsHeader")}</h2>
                  <button
                    type="button"
                    style={styles.listIconBtn(listIconHover === "new")}
                    onMouseEnter={() => setListIconHover("new")}
                    onMouseLeave={() => setListIconHover(null)}
                    onClick={() => {
                      setListIconHover(null);
                      setOpenRowId(null);
                      setListMode("new");
                      setSearch("");
                    }}
                    aria-label={t("chat.newConversation")}
                    title={t("chat.newConversation")}
                  >
                    <NewChatIcon />
                  </button>
                </div>
                {pushBanner && (
                  <div style={styles.pushBanner}>
                    <p style={styles.pushBannerText}>
                      {pushBanner === "install" ? t("push.hintIosInstall") : t("push.bannerText")}
                      {push.error && (
                        <>
                          {" "}
                          {t(push.error === "no-sw" ? "push.errorNoSw" : "push.errorFailed")}
                        </>
                      )}
                    </p>
                    {pushBanner === "enable" && (
                      <button
                        type="button"
                        style={styles.pushBannerBtn}
                        disabled={push.busy}
                        onClick={push.enable}
                      >
                        {t("push.bannerEnable")}
                      </button>
                    )}
                    <button
                      type="button"
                      style={styles.pushBannerClose}
                      onClick={push.hideBanner}
                      aria-label={t("push.bannerClose")}
                      title={t("push.bannerClose")}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ ...styles.listTopBar, paddingLeft: "6px" }}>
                <button
                  type="button"
                  style={styles.listIconBtn(listIconHover === "back")}
                  onMouseEnter={() => setListIconHover("back")}
                  onMouseLeave={() => setListIconHover(null)}
                  onClick={() => {
                    setListIconHover(null);
                    setListMode("recent");
                    setSearch("");
                  }}
                  aria-label={t("chat.backToConversations")}
                  title={t("chat.backToConversations")}
                >
                  ←
                </button>
                <h2 style={styles.contactsHeader}>{t("chat.newConversation")}</h2>
              </div>
            )}
            <div style={styles.searchBox}>
              <span style={styles.searchIcon}>
                <SearchIcon />
              </span>
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
                      <ConversationRow
                        key={chat.id}
                        rowId={chat.id}
                        openRowId={openRowId}
                        setOpenRowId={setOpenRowId}
                        touch={touch}
                        active={isActive && !isMobile}
                        disabled={recordingState !== "idle"}
                        onOpen={() => openConversation(c)}
                        onDelete={() => handleDeleteConversation(chat, c)}
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
                              <span style={styles.contactTime(unread)}>{timeAgo(chat.lastMessageAt, t)}</span>
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
                      </ConversationRow>
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
                  <ChatOptionsMenu
                    key={activeContact.uid}
                    isBlocked={isBlocked}
                    onToggleBlock={handleToggleBlock}
                    onViewProfile={() => onOpenProfile(activeContact.uid)}
                  />
                </div>
                <div
                  ref={messagesAreaRef}
                  style={styles.messagesArea}
                  onScroll={handleMessagesScroll}
                  onLoadCapture={handleMessagesMediaLoad}
                  onTouchStart={stopFollowing}
                  onWheel={stopFollowing}
                >
                  {messages.map((m, i) => {
                    // Punto 104: separador al cambiar de día; grupos de
                    // mensajes seguidos (sameGroup); hora en el último.
                    const prev = messages[i - 1];
                    const next = messages[i + 1];
                    const ms = messageMs(m);
                    const newDay = !prev || startOfDay(messageMs(prev)) !== startOfDay(ms);
                    const groupFirst = newDay || !sameGroup(prev, m);
                    const groupLast = !sameGroup(m, next);
                    return (
                      <React.Fragment key={m.id}>
                        {newDay && (
                          <div style={styles.daySeparator}>
                            <span style={styles.daySeparatorLabel}>{formatDayLabel(ms, language, t)}</span>
                          </div>
                        )}
                        <MessageBubble
                          message={m}
                          mine={m.senderId === currentUid}
                          currentUid={currentUid}
                          chatId={getChatId(currentUid, activeContact.uid)}
                          onOpenPost={onOpenPost}
                          onOpenProduct={onOpenProduct}
                          senderName={
                            m.senderId === currentUid ? myProfile?.displayName : activeContact.displayName
                          }
                          groupFirst={groupFirst}
                          groupLast={groupLast}
                          marginTop={newDay ? 6 : groupFirst ? 12 : 2}
                          timeLabel={groupLast ? formatMessageTime(ms, language) : null}
                          touch={touch}
                        />
                      </React.Fragment>
                    );
                  })}
                  {sendingVoiceNotes
                    .filter(
                      (n) =>
                        n.chatId === getChatId(currentUid, activeContact.uid) &&
                        !messages.some((m) => m.id === n.id)
                    )
                    .map((n, i) => (
                      <SendingVoiceNote
                        key={n.id}
                        id={n.id}
                        duration={n.duration}
                        groupFirst={i > 0 ? false : !lastMessage || lastMessage.senderId !== currentUid}
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
                      <MicIcon pulsing={recordingState !== "ready"} />
                    </span>
                    <span style={styles.recordingLabel}>
                      {recordingState === "ready"
                        ? t("chat.recordingReady")
                        : t("chat.recording")}
                    </span>
                    <span style={styles.recordingTime}>{formatDuration(recordSeconds)}</span>
                    <button
                      type="button"
                      style={styles.recordCancelBtn}
                      onClick={
                        recordingState !== "ready"
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
                        recordingState !== "ready"
                          ? () => requestStopRecording("send")
                          : sendReadyRecording
                      }
                      disabled={recordingState === "starting"}
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
