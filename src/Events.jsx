import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { useLanguage } from "./LanguageContext";

/*
  Events
  ------
  Pantalla "Eventos": lista ordenada por fecha (próximos primero, pasados
  después) + botón "Crear evento". Vive como una quinta pestaña dentro de
  Feed.jsx ("Eventos", junto a Todos/Siguiendo/Explorar/Grupos), mismo
  criterio que Explorar y Grupos: no suma un ícono aparte a la nav
  principal. Por eso este componente NO trae su propio wrapper de página
  entera: se renderiza ya metido dentro de la columna de Feed.jsx.

  Entrar a un evento específico (detalle completo, asistir/no asistir,
  lista de asistentes) es EventView.jsx, una vista superpuesta más
  manejada desde App.js (mismo patrón que UserProfile/SavedPosts/PostView/
  GroupView), a la que se llega con onOpenEvent(eventId).

  Estructura en Firestore:
  - "events/{eventId}" -> { title, description, date (Timestamp), location, createdBy, createdAt }
  - "events/{eventId}/attendees/{uid}" -> { respondedAt }
    El número de asistentes NUNCA se guarda como campo aparte: se escucha
    la subcolección en tiempo real y se cuenta directo (mismo principio
    que comentarios/seguidores/miembros de grupo en el resto de la app) —
    ver useAttendeeCount más abajo. El id del documento ES el uid de quien
    responde (no autogenerado), así que "¿voy a asistir?" es simplemente
    "¿existe el documento?" — el botón "Asistiré"/"No asistiré" es un
    setDoc/deleteDoc sobre ese mismo id (ver EventView.jsx).
*/

// Fecha + hora en el idioma activo (mismo patrón que ProfileAbout.jsx para
// la fecha de nacimiento): "15 de marzo de 2026, 18:00" / "March 15, 2026,
// 6:00 PM".
export function formatEventDateTime(dateTimestamp, language) {
  if (!dateTimestamp?.toDate) return "";
  const date = dateTimestamp.toDate();
  const locale = language === "en" ? "en-US" : "es-ES";
  return date.toLocaleString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Cuenta de asistentes en vivo (subcolección "attendees") — usado tanto
// acá (EventRow) como en EventView.jsx.
export function useAttendeeCount(eventId) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!eventId) return;
    const unsub = onSnapshot(collection(db, "events", eventId, "attendees"), (snap) => {
      setCount(snap.size);
    });
    return unsub;
  }, [eventId]);
  return count;
}

const styles = {
  headerRow: { display: "flex", justifyContent: "flex-end", marginBottom: "16px" },
  createBtn: {
    padding: "10px 18px",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  createForm: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "18px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
    padding: "16px",
    marginBottom: "18px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
    marginBottom: "10px",
    fontFamily: "inherit",
  },
  dateTimeRow: { display: "flex", gap: "10px" },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
    resize: "none",
    minHeight: "60px",
    marginBottom: "10px",
    fontFamily: "inherit",
  },
  formActions: { display: "flex", gap: "8px" },
  submitBtn: {
    padding: "9px 18px",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  cancelBtn: {
    padding: "9px 18px",
    borderRadius: "10px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  sectionTitle: {
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
    margin: "0 0 10px",
  },
  eventRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "14px 16px",
    borderRadius: "16px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
    marginBottom: "10px",
    cursor: "pointer",
  },
  eventIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
  },
  eventTitle: { fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--text)" },
  eventMeta: { fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "40px 0",
  },
};

function EventRow({ event, language, t, onOpen }) {
  const attendeeCount = useAttendeeCount(event.id);
  return (
    <div style={styles.eventRow} onClick={() => onOpen(event.id)}>
      <div style={styles.eventIcon}>📅</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={styles.eventTitle}>{event.title}</p>
        <p style={styles.eventMeta}>{formatEventDateTime(event.date, language)}</p>
        {event.location && <p style={styles.eventMeta}>📍 {event.location}</p>}
        <p style={styles.eventMeta}>{t("events.attendeeCount", { count: attendeeCount })}</p>
      </div>
    </div>
  );
}

function CreateEventForm({ currentUid, onCreated, onCancel }) {
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !dateStr || !timeStr || !currentUid) return;
    const when = new Date(`${dateStr}T${timeStr}`);
    if (Number.isNaN(when.getTime())) return;
    setCreating(true);
    try {
      const eventRef = await addDoc(collection(db, "events"), {
        title: title.trim(),
        description: description.trim(),
        date: Timestamp.fromDate(when),
        location: location.trim(),
        createdBy: currentUid,
        createdAt: serverTimestamp(),
      });
      onCreated(eventRef.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <form style={styles.createForm} onSubmit={handleCreate}>
      <input
        style={styles.input}
        type="text"
        placeholder={t("events.titlePlaceholder")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <div style={styles.dateTimeRow}>
        <input
          style={styles.input}
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
        />
        <input
          style={styles.input}
          type="time"
          value={timeStr}
          onChange={(e) => setTimeStr(e.target.value)}
        />
      </div>
      <input
        style={styles.input}
        type="text"
        placeholder={t("events.locationPlaceholder")}
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />
      <textarea
        style={styles.textarea}
        placeholder={t("events.descriptionPlaceholder")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div style={styles.formActions}>
        <button
          type="submit"
          style={styles.submitBtn}
          disabled={creating || !title.trim() || !dateStr || !timeStr}
        >
          {creating ? t("events.creating") : t("events.createSubmit")}
        </button>
        <button type="button" style={styles.cancelBtn} onClick={onCancel}>
          {t("events.cancel")}
        </button>
      </div>
    </form>
  );
}

export default function Events({ onOpenEvent }) {
  const { t, language } = useLanguage();
  const [currentUid, setCurrentUid] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUid(u ? u.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "events"), orderBy("date", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // "Próximos primero": se parten en próximos (orden ascendente, el más
  // cercano primero) y pasados (orden descendente, el más reciente
  // primero) y se muestran los próximos arriba — nunca se ocultan los
  // pasados, solo quedan más abajo.
  const now = Date.now();
  const withMillis = events.map((e) => ({
    ...e,
    _millis: e.date?.toMillis ? e.date.toMillis() : 0,
  }));
  const upcoming = withMillis.filter((e) => e._millis >= now).sort((a, b) => a._millis - b._millis);
  const past = withMillis.filter((e) => e._millis < now).sort((a, b) => b._millis - a._millis);

  return (
    <div>
      <div style={styles.headerRow}>
        <button style={styles.createBtn} onClick={() => setCreating((v) => !v)}>
          {creating ? t("events.cancel") : t("events.createButton")}
        </button>
      </div>

      {creating && (
        <CreateEventForm
          currentUid={currentUid}
          onCreated={(id) => {
            setCreating(false);
            onOpenEvent(id);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {!loading && events.length === 0 && <p style={styles.empty}>{t("events.empty")}</p>}

      {upcoming.length > 0 && (
        <>
          <p style={styles.sectionTitle}>{t("events.upcoming")}</p>
          {upcoming.map((ev) => (
            <EventRow key={ev.id} event={ev} language={language} t={t} onOpen={onOpenEvent} />
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <p style={styles.sectionTitle}>{t("events.past")}</p>
          {past.map((ev) => (
            <EventRow key={ev.id} event={ev} language={language} t={t} onOpen={onOpenEvent} />
          ))}
        </>
      )}
    </div>
  );
}
