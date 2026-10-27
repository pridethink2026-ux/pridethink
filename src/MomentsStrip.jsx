import React, { useRef, useState } from "react";
import Avatar from "./Avatar";
import ImageEditor from "./ImageEditor";
import MomentTextEditor from "./MomentTextEditor";
import MomentViewer from "./MomentViewer";
import { useAllUsersContext } from "./AllUsersContext";
import { useLanguage } from "./LanguageContext";
import { useMoments } from "./MomentsContext";
import { MAX_ACTIVE_MOMENTS, MomentLimitError, MomentTimeoutError, publishMoment } from "./moments";

/*
  MomentsStrip
  ------------
  Tira horizontal de Momentos arriba del muro (punto 66, Feed.jsx).

  - Primero "Tu momento": si no tienes momentos activos, tocarlo publica
    uno; si tienes, tocarlo los muestra, y el "+" chico publica otro.
  - Después, las personas que sigues con momentos activos (MomentsContext
    ya excluye privados y bloqueados): primero las que tienen algo sin ver
    (con destello, Avatar momentRing="unseen"), después las ya vistas (aro
    fino), y en cada grupo la más reciente primero. Tocar una abre
    MomentViewer en esa persona y, al terminar, sigue con la siguiente de
    la tira que tenga algo sin ver.

  Publicar: elegir foto (misma validación de tipo y 10 MB que
  MultiImageUploader.jsx) → ImageEditor (girar/recortar, 1080 px de lado
  como máximo) → MomentTextEditor (texto encima, opcional; con perfil
  privado avisa ahí mismo que solo lo verás tú) → publishMoment
  (moments.js). Con 30 momentos activos se
  avisa en vez de intentar.
*/

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_MB = 10;
const MOMENT_MAX_SIZE = 1080;

const styles = {
  card: {
    background: "var(--surface-sheen)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18), var(--shine)",
    padding: "14px 14px 10px",
    marginBottom: "18px",
  },
  row: {
    display: "flex",
    gap: "14px",
    overflowX: "auto",
    // Margen para que el destello (box-shadow) no lo recorte el scroll.
    padding: "8px 6px 4px",
  },
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    width: "76px",
    flexShrink: 0,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
  },
  avatarWrap: {
    position: "relative",
    borderRadius: "50%",
  },
  addBadge: (hover) => ({
    position: "absolute",
    right: "-2px",
    bottom: "-2px",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    border: "2px solid var(--surface)",
    background: hover ? "var(--accent2)" : "var(--accent)",
    color: "var(--bg)",
    fontSize: "16px",
    fontWeight: 700,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  }),
  label: {
    width: "100%",
    fontSize: "11px",
    color: "var(--text-muted)",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  message: (isError) => ({
    margin: "8px 0 0",
    padding: "8px 12px",
    borderRadius: "10px",
    background: isError ? "var(--accent2-soft)" : "var(--accent-soft)",
    border: isError ? "1px solid var(--accent2-soft-border)" : "1px solid var(--accent-soft-border)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
  }),
};

export default function MomentsStrip({ currentUid, myProfile }) {
  const { t } = useLanguage();
  const { myIndex, myMoments, authors } = useMoments();
  const allUsers = useAllUsersContext();
  const fileInputRef = useRef(null);
  const [editingFile, setEditingFile] = useState(null);
  const [textBlob, setTextBlob] = useState(null); // foto ya recortada, esperando el paso de texto
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState(null); // { text, isError }
  const [viewer, setViewer] = useState(null); // { authorUids, startIndex }
  const [addHover, setAddHover] = useState(false);

  if (!currentUid) return null;

  const hasMine = myMoments.length > 0;
  const queue = [...(hasMine ? [currentUid] : []), ...authors.map((a) => a.uid)];

  const startAdd = () => {
    if (publishing) return;
    if (myMoments.length >= MAX_ACTIVE_MOMENTS) {
      setMessage({ text: t("moments.limitReached", { max: MAX_ACTIVE_MOMENTS }), isError: true });
      return;
    }
    setMessage(null);
    fileInputRef.current?.click();
  };

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      setMessage({ text: t("image.errorType"), isError: true });
    } else if (file.size > MAX_INPUT_MB * 1024 * 1024) {
      setMessage({ text: t("image.errorTooLarge", { max: MAX_INPUT_MB }), isError: true });
    } else {
      setEditingFile(file);
    }
  };

  const handleEdited = (blob) => {
    setEditingFile(null);
    setTextBlob(blob);
  };

  const handleTextDone = async (blob, caption) => {
    setTextBlob(null);
    setPublishing(true);
    try {
      await publishMoment(currentUid, blob, myIndex, caption);
      setMessage({
        text: myProfile?.isPrivate ? t("moments.privateNotice") : t("moments.published"),
        isError: !!myProfile?.isPrivate,
      });
    } catch (err) {
      let text;
      if (err instanceof MomentLimitError) {
        text = t("moments.limitReached", { max: MAX_ACTIVE_MOMENTS });
      } else if (err instanceof MomentTimeoutError) {
        text = err.stage === "save" ? t("moments.errorSlowSave") : t("moments.errorSlowUpload");
      } else {
        text = t("moments.errorPublish");
      }
      // Queda en la consola para diagnosticar reportes desde el celular.
      console.error("No se pudo publicar el momento:", err?.code || err?.message || err);
      setMessage({ text, isError: true });
    } finally {
      setPublishing(false);
    }
  };

  const openViewer = (uid) => setViewer({ authorUids: queue, startIndex: queue.indexOf(uid) });

  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <div style={styles.item}>
          <div
            style={styles.avatarWrap}
            onClick={hasMine ? () => openViewer(currentUid) : startAdd}
            role="button"
            aria-label={hasMine ? t("moments.viewMine") : t("moments.add")}
          >
            <Avatar
              uid={currentUid}
              name={myProfile?.displayName}
              identity={myProfile?.identity}
              photoURL={myProfile?.photoURL}
              size="lg"
              momentRing={hasMine ? "seen" : null}
            />
            <button
              type="button"
              style={styles.addBadge(addHover)}
              onClick={(e) => {
                e.stopPropagation();
                startAdd();
              }}
              onMouseEnter={() => setAddHover(true)}
              onMouseLeave={() => setAddHover(false)}
              aria-label={t("moments.add")}
              title={t("moments.add")}
            >
              +
            </button>
          </div>
          <span style={styles.label}>{publishing ? t("moments.publishing") : t("moments.yours")}</span>
        </div>

        {authors.map((a) => {
          const user = allUsers.find((u) => u.uid === a.uid);
          return (
            <button key={a.uid} type="button" style={styles.item} onClick={() => openViewer(a.uid)}>
              <div style={styles.avatarWrap}>
                <Avatar
                  uid={a.uid}
                  name={user?.displayName}
                  identity={user?.identity}
                  photoURL={user?.photoURL}
                  size="lg"
                  momentRing={a.state}
                />
              </div>
              <span style={styles.label}>{user?.displayName || ""}</span>
            </button>
          );
        })}
      </div>

      {message && <p style={styles.message(message.isError)}>{message.text}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFile}
      />

      {editingFile && (
        <ImageEditor
          file={editingFile}
          maxSize={MOMENT_MAX_SIZE}
          onConfirm={handleEdited}
          onCancel={() => setEditingFile(null)}
          onError={() => {
            setEditingFile(null);
            setMessage({ text: t("image.errorRead"), isError: true });
          }}
        />
      )}

      {textBlob && (
        <MomentTextEditor
          blob={textBlob}
          isPrivate={!!myProfile?.isPrivate}
          onConfirm={handleTextDone}
          onCancel={() => setTextBlob(null)}
          onError={() => {
            setTextBlob(null);
            setMessage({ text: t("image.errorRead"), isError: true });
          }}
        />
      )}

      {viewer && (
        <MomentViewer
          authorUids={viewer.authorUids}
          startIndex={viewer.startIndex}
          continueToNext
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
