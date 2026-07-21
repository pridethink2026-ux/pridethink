import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, deleteDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import Avatar from "./Avatar";
import { useLanguage } from "./LanguageContext";
import { formatEventDateTime } from "./Events";

/*
  EventView
  ---------
  Vista superpuesta de un evento específico (mismo patrón que
  UserProfile.jsx/SavedPosts.jsx/PostView.jsx/GroupView.jsx, manejada
  desde App.js con su propio estado "viewingEventId"): detalle completo
  (título, fecha y hora en el idioma activo, lugar, descripción), botón
  "Asistiré"/"No asistiré", y la lista completa de quiénes van a asistir
  (avatar con anillo de identidad + nombre, click va a su perfil).

  "¿Voy a asistir?" es simplemente "¿existe events/{id}/attendees/{miUid}?"
  — el id del documento es tu propio uid (no autogenerado), así que
  asistir es un setDoc y desistir es un deleteDoc sobre ese mismo id
  (mismo patrón que unirse/salir de un grupo en GroupView.jsx). El
  contador de asistentes NUNCA se guarda como campo aparte: acá se deriva
  directo de la lista completa que ya se está escuchando (attendeeUids.length).
*/

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
  column: { width: "100%", maxWidth: "560px" },
  backBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "8px 16px",
    color: "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "18px",
  },
  notice: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "30px 20px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
  },
  headerCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
    padding: "20px",
    marginBottom: "18px",
  },
  eventTitle: {
    fontFamily: "var(--font-display)",
    fontSize: "22px",
    fontWeight: 700,
    margin: "0 0 10px",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    display: "inline-block",
  },
  metaRow: { fontSize: "14px", color: "var(--text)", margin: "0 0 6px" },
  metaLabel: { color: "var(--text-muted)" },
  description: { fontSize: "14px", color: "var(--text)", lineHeight: 1.5, margin: "12px 0 16px" },
  joinBtn: (attending) => ({
    padding: "9px 20px",
    borderRadius: "999px",
    border: attending ? "1px solid var(--border)" : "none",
    background: attending ? "transparent" : "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: attending ? "var(--text-muted)" : "var(--bg)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  }),
  sectionTitle: {
    fontSize: "13px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 700,
    fontFamily: "var(--font-display)",
    margin: "18px 0 12px",
    color: "var(--text-muted)",
  },
  attendeesList: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
    padding: "10px 16px",
  },
  attendeeRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
  },
  attendeeName: { fontSize: "13px", fontWeight: 600, margin: 0 },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "13px",
    padding: "16px 0",
  },
};

export default function EventView({ eventId, onBack, onOpenProfile }) {
  const { t, language } = useLanguage();
  const [currentUid, setCurrentUid] = useState(null);
  const [event, setEvent] = useState(undefined); // undefined: cargando | null: no existe
  const [attendeeUids, setAttendeeUids] = useState([]);
  const [attendeeProfiles, setAttendeeProfiles] = useState({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUid(u ? u.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!eventId) return;
    setEvent(undefined);
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      setEvent(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return unsub;
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const unsub = onSnapshot(collection(db, "events", eventId, "attendees"), (snap) => {
      setAttendeeUids(snap.docs.map((d) => d.id));
    });
    return unsub;
  }, [eventId]);

  // Resuelve cada uid asistente a su perfil (avatar/nombre/identidad),
  // igual patrón de dos pasos que SavedPosts.jsx (ids -> documentos completos).
  useEffect(() => {
    if (attendeeUids.length === 0) {
      setAttendeeProfiles({});
      return;
    }
    const unsubs = attendeeUids.map((uid) =>
      onSnapshot(doc(db, "users", uid), (snap) => {
        setAttendeeProfiles((prev) => ({ ...prev, [uid]: snap.exists() ? snap.data() : null }));
      })
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendeeUids.join(",")]);

  const isAttending = !!currentUid && attendeeUids.includes(currentUid);

  const handleToggleAttending = async () => {
    if (!currentUid) return;
    const ref = doc(db, "events", eventId, "attendees", currentUid);
    if (isAttending) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, { respondedAt: serverTimestamp() });
    }
  };

  if (event === undefined) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            {t("events.backLink")}
          </button>
          <p style={styles.notice}>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (event === null) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <button style={styles.backBtn} onClick={onBack}>
            {t("events.backLink")}
          </button>
          <p style={styles.notice}>{t("events.notFound")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        <button style={styles.backBtn} onClick={onBack}>
          {t("events.backLink")}
        </button>

        <div style={styles.headerCard}>
          <h1 style={styles.eventTitle}>{event.title}</h1>
          <p style={styles.metaRow}>
            <span style={styles.metaLabel}>🗓️ </span>
            {formatEventDateTime(event.date, language)}
          </p>
          {event.location && (
            <p style={styles.metaRow}>
              <span style={styles.metaLabel}>📍 </span>
              {event.location}
            </p>
          )}
          {event.description && <p style={styles.description}>{event.description}</p>}

          {currentUid && (
            <button style={styles.joinBtn(isAttending)} onClick={handleToggleAttending}>
              {isAttending ? t("events.notAttending") : t("events.attending")}
            </button>
          )}
        </div>

        <p style={styles.sectionTitle}>{t("events.attendeeCount", { count: attendeeUids.length })}</p>

        <div style={styles.attendeesList}>
          {attendeeUids.length === 0 && <p style={styles.empty}>{t("events.noAttendeesYet")}</p>}
          {attendeeUids.map((uid) => {
            const u = attendeeProfiles[uid];
            return (
              <div key={uid} style={styles.attendeeRow} onClick={() => onOpenProfile(uid)}>
                <Avatar uid={uid} name={u?.displayName || u?.identity} identity={u?.identity} size="sm" />
                <p style={styles.attendeeName}>{u?.displayName || "Sin nombre"}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
