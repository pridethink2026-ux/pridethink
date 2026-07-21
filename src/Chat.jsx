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
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import Avatar from "./Avatar";
import { notify, useIsMobile } from "./utils";

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
*/

const MAX_RECORD_SECONDS = 60;
const AUDIO_MIME_TYPE = "audio/webm;codecs=opus";
const MAX_AUDIO_BASE64_LENGTH = 900000; // margen de seguridad bajo el límite de 1MB por documento de Firestore

function getChatId(uidA, uidB) {
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
  bubble: (mine) => ({
    maxWidth: "75%",
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
};

function AudioMessage({ src, duration, mine, id }) {
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
        title={playing ? "Pausar" : "Reproducir"}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <AudioWaveform seed={id || src} playing={playing} mine={mine} />
      <span style={styles.audioDuration(mine)}>{formatDuration(duration)}</span>
    </div>
  );
}

export default function Chat({ onOpenProfile }) {
  const isMobile = useIsMobile();
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
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
      alert("Tu navegador no soporta grabación de audio.");
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
      alert("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
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
        alert("La nota de voz quedó muy pesada para enviarse. Intenta con una más corta.");
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
      alert("No se pudo enviar la nota de voz. Intenta de nuevo.");
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

  if (!currentUid) {
    return (
      <div style={styles.wrapper}>
        <div style={{ ...styles.shell, alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--text-muted)", padding: "0 24px", textAlign: "center" }}>
            Inicia sesión primero para usar el chat.
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
            <p style={styles.contactsHeader}>Personas</p>
            <div style={styles.searchBox}>
              <input
                style={styles.searchInput}
                type="text"
                placeholder="Buscar por nombre o identidad..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={styles.contactsList}>
              {contacts.length === 0 && (
                <p style={{ padding: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
                  {search ? "Nadie coincide con tu búsqueda." : "Todavía no hay más personas registradas."}
                </p>
              )}
              {contacts.map((c) => (
                <div
                  key={c.uid}
                  style={styles.contactItem(activeContact?.uid === c.uid)}
                  onClick={() => {
                    if (recordingState === "idle") setActiveContact(c);
                  }}
                >
                  <Avatar
                    uid={c.uid}
                    name={c.displayName || c.identity}
                    identity={c.identity}
                    size="md"
                  />
                  <div>
                    <p style={styles.contactName}>{c.displayName || "Sin nombre"}</p>
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
                    />
                    <div style={styles.chatHeaderText}>
                      <p style={styles.chatHeaderName}>{activeContact.displayName}</p>
                      <p style={styles.chatHeaderIdentity}>{activeContact.identity}</p>
                    </div>
                  </div>
                  <button style={styles.blockBtn} onClick={handleToggleBlock}>
                    {isBlocked ? "Desbloquear" : "Bloquear"}
                  </button>
                </div>
                <div style={styles.messagesArea}>
                  {messages.map((m) => (
                    <div key={m.id} style={styles.bubbleRow(m.senderId === currentUid)}>
                      <div style={styles.bubble(m.senderId === currentUid)}>
                        {m.type === "audio" ? (
                          <AudioMessage
                            id={m.id}
                            src={m.audioData}
                            duration={m.audioDuration}
                            mine={m.senderId === currentUid}
                          />
                        ) : (
                          m.text
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                {recordingState === "idle" ? (
                  <form style={styles.inputRow} onSubmit={handleSend}>
                    <input
                      style={styles.input}
                      type="text"
                      placeholder="Escribe un mensaje..."
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <button
                      type="button"
                      style={styles.micBtn}
                      onClick={startRecording}
                      title="Grabar nota de voz"
                    >
                      <MicIcon />
                    </button>
                    <button type="submit" style={styles.sendBtn}>
                      Enviar
                    </button>
                  </form>
                ) : (
                  <div style={styles.recordingRow}>
                    <span style={styles.recordingMic}>
                      <MicIcon pulsing={recordingState === "recording"} />
                    </span>
                    <span style={styles.recordingLabel}>
                      {recordingState === "recording"
                        ? "Grabando nota de voz..."
                        : "Nota de voz lista"}
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
                      title="Cancelar"
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
                      title="Enviar nota de voz"
                    >
                      ➤
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={styles.emptyState}>
                Elige a alguien de la lista para empezar a chatear.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
