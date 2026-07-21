import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import Avatar from "./Avatar";
import { notify, timeAgo, extractHashtags, splitTextWithHashtags } from "./utils";
import { useLanguage } from "./LanguageContext";
import ReportButton from "./ReportButton";
import { getReactionEmoji, getReactionSummary, useReactionPicker, ReactionPicker } from "./Reactions";
import SharePostModal from "./SharePostModal";
import {
  useAllUsers,
  useMentionAutocomplete,
  MentionSuggestions,
  extractMentionedUids,
  renderTextWithMentions,
} from "./Mentions";
import {
  TrendingHashtags,
  PeopleSuggestions,
  getTrendingHashtags,
  buildAuthorHashtagMap,
  getPeopleSuggestions,
  useCommentCounts,
  rankByPopularity,
} from "./Explore";
import Groups from "./Groups";
import Events from "./Events";

/*
  Feed
  ----
  Muro social en tiempo real: publicaciones + reacciones + comentarios +
  edición/borrado de tus propios posts + notificaciones a otros usuarios.
  También: pestañas "Todos" / "Siguiendo", hashtags clickeables con filtro,
  y perfiles públicos al tocar el avatar o el nombre de cualquier autor.

  Estructura en Firestore:
  - "posts/{postId}"
      -> { authorId, authorName, authorIdentity, text, createdAt, reactions: { [uid]: tipo }, hashtags: ["..."] }
  - "posts/{postId}/comments/{commentId}"
      -> { authorId, authorName, authorIdentity, text, createdAt }
  - "notifications/{uid}/items/{itemId}"
      -> { type: 'like' | 'comment' | 'message' | 'follow', fromUid, fromName, fromIdentity, createdAt, read }

  El número de comentarios NO se guarda como campo aparte: se escucha la
  subcolección de comentarios de cada post todo el tiempo (no solo cuando
  se abre) y el contador es simplemente la cantidad real de documentos.
  Así nunca puede desincronizarse. Lo mismo aplica a "Siguiendo": no se
  guarda una lista de posts filtrados, se filtra en el momento comparando
  contra myProfile.following (mismo patrón que el filtro de bloqueados).

  Los hashtags se detectan al publicar (utils.extractHashtags) y se guardan
  en minúsculas en el post. Al tocar un hashtag dentro de un post se activa
  un filtro sobre el muro (chip visible para quitarlo).

  REACCIONES (ver Reactions.jsx para la lista de tipos y el selector
  compartido con Chat.jsx): antes esto era un simple "like" guardado como
  arreglo de uids (arrayUnion/arrayRemove). Ahora es un mapa
  `{ [uid]: tipoDeReaccion }` — una reacción por persona, la última que
  elige pisa la anterior. Se actualiza con `updateDoc` sobre la ruta
  `reactions.${uid}` (no se puede usar arrayUnion/arrayRemove porque ya no
  es un arreglo) y se borra con `deleteField()` cuando alguien quita su
  reacción. Un clic simple en el botón alterna entre "sin reacción" y
  "❤️" (el comportamiento de "Me gusta" de siempre); mantener presionado
  (mobile) o pasar el mouse (desktop) abre el selector con los 5 tipos.

  GUARDAR: el botón 🔖 en cada post crea/borra un documento en
  savedPosts/{miUid}/items/{postId} — SOLO una referencia (el id del post
  ya es el propio id del documento; no se copia texto ni autor), igual que
  el botón "Guardados" del perfil (SavedPosts.jsx) resuelve esa lista de
  ids a posts completos en tiempo real. El id del documento (no
  autogenerado) hace que "está guardado" sea tan simple como que el
  documento exista — nunca hay dos referencias al mismo post.

  COMPARTIR POR CHAT: el botón 📤 abre SharePostModal.jsx (selector de
  contactos, mismo criterio de "quién es visible" que Chat.jsx) para
  mandar el post como un mensaje tipo "shared_post" en la conversación
  elegida — ver Chat.jsx para el formato de ese mensaje y cómo se muestra.

  MENCIONES (ver Mentions.jsx para la lógica y UI compartida): al escribir
  "@" + letras en el composer, un comentario, o al editar un post, se abre
  un menú de sugerencias de usuarios. Al publicar/comentar/editar se guarda
  `mentionedUids` (array de uids, sin duplicar ningún otro dato) y se
  notifica a cada persona mencionada (`type: "mention"`, con el id del post
  para poder llevar directo a él). Al renderizar, cualquier "@Nombre" que
  matchee a un usuario real se muestra clickeable; si no matchea a nadie,
  queda como texto normal.

  EXPLORAR (ver Explore.jsx para la lógica y UI compartida): tercera
  pestaña junto a "Todos"/"Siguiendo" (`feedTab === "explorar"`). Muestra
  hashtags en tendencia (últimas 72h), sugerencias de personas que no
  seguís, y un feed de publicaciones de gente que no seguís ordenado por
  popularidad (reacciones + comentarios) en vez de por fecha. A diferencia
  de "Todos", acá también se excluye a quien tiene el muro privado
  (`isWallPrivate`) — ver Explore.jsx para el porqué.

  GRUPOS (ver Groups.jsx/GroupView.jsx): cuarta pestaña (`feedTab ===
  "grupos"`), muestra la lista de grupos en vez de un feed de posts (se
  oculta el composer y todo lo demás de esta pantalla). Los posts DE UN
  GRUPO viven en esta misma colección "posts" con un campo "groupId"
  nuevo, así que "Todos"/"Siguiendo" y Explorar los excluyen explícitamente
  (`!p.groupId`) — nunca se mezclan con el muro general, solo se ven
  entrando al grupo (GroupView.jsx).

  EVENTOS (ver Events.jsx/EventView.jsx): quinta pestaña (`feedTab ===
  "eventos"`), muestra la lista de eventos en vez de un feed de posts
  (mismo patrón que "grupos": se oculta el composer y todo lo demás). Los
  eventos son una colección totalmente aparte ("events", sin relación con
  "posts"), así que no hace falta excluir nada de "Todos"/"Siguiendo"/
  Explorar por esto.
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
  column: {
    width: "100%",
    maxWidth: "560px",
  },
  composer: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
    padding: "20px",
    marginBottom: "18px",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "12px 14px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
    resize: "none",
    minHeight: "70px",
    fontFamily: "inherit",
  },
  postBtn: {
    marginTop: "10px",
    padding: "10px 20px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontWeight: 600,
    cursor: "pointer",
    float: "right",
  },
  tabsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "12px",
  },
  tabBtn: (active) => ({
    padding: "7px 16px",
    borderRadius: "999px",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--accent2-soft)" : "transparent",
    color: active ? "var(--accent2)" : "var(--text-muted)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  }),
  hashtagFilterChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "var(--accent2-soft)",
    color: "var(--accent2)",
    fontSize: "13px",
    fontWeight: 600,
    marginBottom: "16px",
  },
  hashtagFilterClose: {
    cursor: "pointer",
    fontWeight: 700,
  },
  post: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
    padding: "18px 20px",
    marginBottom: "16px",
  },
  postHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    marginBottom: "10px",
  },
  postHeaderText: { cursor: "pointer" },
  authorName: { fontSize: "14px", fontWeight: 600, margin: 0 },
  authorIdentity: { fontSize: "12px", color: "var(--text-muted)", margin: 0 },
  timeText: { fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 0" },
  postText: { fontSize: "14px", lineHeight: 1.5, margin: "0 0 12px", whiteSpace: "pre-wrap" },
  hashtag: {
    color: "var(--accent2)",
    fontWeight: 600,
    cursor: "pointer",
  },
  headerRight: { marginLeft: "auto", display: "flex", gap: "10px" },
  smallLink: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "12px",
    color: "var(--text-muted)",
    padding: 0,
  },
  editTextarea: {
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
    fontFamily: "inherit",
    marginBottom: "8px",
  },
  editRow: { display: "flex", gap: "8px", marginBottom: "12px" },
  smallBtn: {
    padding: "6px 14px",
    borderRadius: "8px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  smallBtnGhost: {
    padding: "6px 14px",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  actionsRow: {
    display: "flex",
    gap: "16px",
    borderTop: "1px solid var(--border)",
    paddingTop: "10px",
  },
  reactionWrapper: {
    position: "relative",
  },
  actionBtn: (active) => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    color: active ? "var(--accent2)" : "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: 0,
  }),
  commentsBox: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid var(--border)",
  },
  comment: {
    display: "flex",
    gap: "8px",
    marginBottom: "10px",
  },
  commentBubble: {
    background: "var(--surface-alt)",
    borderRadius: "10px",
    padding: "8px 12px",
    fontSize: "13px",
    lineHeight: 1.4,
  },
  commentAuthor: { fontWeight: 600, marginRight: "6px", cursor: "pointer" },
  commentForm: {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  },
  commentInputWrapper: { position: "relative", flex: 1 },
  commentInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "13px",
    color: "var(--text)",
    outline: "none",
  },
  commentSendBtn: {
    padding: "8px 16px",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "40px 0",
  },
  loginNotice: {
    textAlign: "center",
    color: "var(--text-muted)",
    padding: "40px 24px",
  },
  skeletonCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "20px",
    padding: "18px 20px",
    marginBottom: "16px",
  },
  skeletonHeader: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" },
  skeletonAvatar: { width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0 },
  skeletonLine: (width, height) => ({ width, height, marginBottom: "8px" }),
};

// Convierte el texto de un post en piezas de texto normal + hashtags
// clickeables (utils.splitTextWithHashtags), y dentro de cada pieza de
// texto normal, además detecta menciones @usuario clickeables
// (Mentions.renderTextWithMentions).
function renderPostText(text, users, onHashtagClick, onOpenProfile) {
  return splitTextWithHashtags(text).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("#")) {
      const tag = part.slice(1).toLowerCase();
      return (
        <span key={i} style={styles.hashtag} onClick={() => onHashtagClick(tag)}>
          {part}
        </span>
      );
    }
    return (
      <React.Fragment key={i}>{renderTextWithMentions(part, users, onOpenProfile)}</React.Fragment>
    );
  });
}

function PostSkeleton() {
  return (
    <div style={styles.skeletonCard}>
      <div style={styles.skeletonHeader}>
        <div className="pt-skeleton" style={styles.skeletonAvatar} />
        <div style={{ flex: 1 }}>
          <div className="pt-skeleton" style={styles.skeletonLine("40%", "12px")} />
          <div className="pt-skeleton" style={styles.skeletonLine("25%", "10px")} />
        </div>
      </div>
      <div className="pt-skeleton" style={styles.skeletonLine("100%", "12px")} />
      <div className="pt-skeleton" style={styles.skeletonLine("70%", "12px")} />
    </div>
  );
}

export function PostCard({ post, currentUid, myProfile, onOpenProfile, onHashtagClick = () => {} }) {
  const { t } = useLanguage();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const [likePop, setLikePop] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { open: pickerOpen, setOpen: setPickerOpen, containerRef: reactionRef, triggerProps: reactionTriggerProps, consumeLongPress } =
    useReactionPicker();
  const allUsers = useAllUsers();
  const myBlocked = myProfile?.blockedUsers || [];
  const editMention = useMentionAutocomplete(allUsers, currentUid, myBlocked);
  const commentMention = useMentionAutocomplete(allUsers, currentUid, myBlocked);

  const myReaction = (post.reactions || {})[currentUid] || null;
  const reactionSummary = getReactionSummary(post.reactions);
  const isMine = post.authorId === currentUid;

  // Escucha si el post ya está en savedPosts/{miUid}/items/{postId} — el
  // id del documento es el propio id del post, así que "está guardado" es
  // solo que el documento exista.
  useEffect(() => {
    if (!currentUid) return;
    const unsub = onSnapshot(doc(db, "savedPosts", currentUid, "items", post.id), (snap) => {
      setSaved(snap.exists());
    });
    return unsub;
  }, [currentUid, post.id]);

  const toggleSave = async () => {
    const ref = doc(db, "savedPosts", currentUid, "items", post.id);
    if (saved) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, { savedAt: serverTimestamp() });
    }
  };

  // Escucha los comentarios SIEMPRE (no solo al abrir), así el número junto
  // al ícono de comentarios siempre es exacto, sin depender de que alguien
  // haga clic para "activar" el conteo correcto.
  useEffect(() => {
    const q = query(
      collection(db, "posts", post.id, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [post.id]);

  const setMyReaction = async (type) => {
    const postRef = doc(db, "posts", post.id);
    const hadReaction = !!myReaction;
    if (type) {
      if (!hadReaction) {
        setLikePop(true);
        setTimeout(() => setLikePop(false), 350);
      }
      await updateDoc(postRef, { [`reactions.${currentUid}`]: type });
      if (!hadReaction) {
        await notify(post.authorId, {
          type: "like",
          fromUid: currentUid,
          fromName: myProfile?.displayName || "Alguien",
          fromIdentity: myProfile?.identity || "",
        });
      }
    } else {
      await updateDoc(postRef, { [`reactions.${currentUid}`]: deleteField() });
    }
  };

  // Clic simple (sin long-press ni hover previo): alterna "sin reacción" /
  // "❤️", igual que el botón de "Me gusta" de siempre.
  const handleQuickReact = () => {
    if (consumeLongPress()) return;
    setMyReaction(myReaction ? null : "like");
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const trimmed = commentText.trim();
    const mentionedUids = extractMentionedUids(trimmed, allUsers, currentUid);
    await addDoc(collection(db, "posts", post.id, "comments"), {
      authorId: currentUid,
      authorName: myProfile?.displayName || "Sin nombre",
      authorIdentity: myProfile?.identity || "",
      text: trimmed,
      mentionedUids,
      createdAt: serverTimestamp(),
    });
    await notify(post.authorId, {
      type: "comment",
      fromUid: currentUid,
      fromName: myProfile?.displayName || "Alguien",
      fromIdentity: myProfile?.identity || "",
    });
    await Promise.all(
      mentionedUids.map((uid) =>
        notify(uid, {
          type: "mention",
          fromUid: currentUid,
          fromName: myProfile?.displayName || "Alguien",
          fromIdentity: myProfile?.identity || "",
          postId: post.id,
        })
      )
    );
    setCommentText("");
    commentMention.closeMentions();
  };

  const handleSaveEdit = async () => {
    if (!editText.trim()) return;
    const trimmed = editText.trim();
    const mentionedUids = extractMentionedUids(trimmed, allUsers, currentUid);
    const previouslyMentioned = post.mentionedUids || [];
    const newlyMentioned = mentionedUids.filter((uid) => !previouslyMentioned.includes(uid));
    await updateDoc(doc(db, "posts", post.id), {
      text: trimmed,
      hashtags: extractHashtags(trimmed),
      mentionedUids,
    });
    await Promise.all(
      newlyMentioned.map((uid) =>
        notify(uid, {
          type: "mention",
          fromUid: currentUid,
          fromName: myProfile?.displayName || "Alguien",
          fromIdentity: myProfile?.identity || "",
          postId: post.id,
        })
      )
    );
    setEditing(false);
    editMention.closeMentions();
  };

  const handleDelete = async () => {
    if (!window.confirm(t("feed.deleteConfirm"))) return;
    await deleteDoc(doc(db, "posts", post.id));
  };

  return (
    <div style={styles.post}>
      <div style={styles.postHeader}>
        <Avatar
          uid={post.authorId}
          name={post.authorName || post.authorIdentity}
          identity={post.authorIdentity}
          size="md"
          onClick={() => onOpenProfile(post.authorId)}
        />
        <div style={styles.postHeaderText} onClick={() => onOpenProfile(post.authorId)}>
          <p style={styles.authorName}>{post.authorName}</p>
          <p style={styles.authorIdentity}>{post.authorIdentity}</p>
          <p style={styles.timeText}>{timeAgo(post.createdAt)}</p>
        </div>
        {isMine ? (
          !editing && (
            <div style={styles.headerRight}>
              <button style={styles.smallLink} onClick={() => setEditing(true)}>
                {t("feed.edit")}
              </button>
              <button style={styles.smallLink} onClick={handleDelete}>
                {t("feed.delete")}
              </button>
            </div>
          )
        ) : (
          <div style={styles.headerRight}>
            <ReportButton targetType="post" targetId={post.id} currentUid={currentUid} />
          </div>
        )}
      </div>

      {editing ? (
        <>
          <div style={{ position: "relative" }}>
            <textarea
              ref={editMention.inputRef}
              style={styles.editTextarea}
              value={editText}
              onChange={(e) => editMention.handleMentionChange(e, setEditText)}
            />
            {editMention.mentionOpen && (
              <MentionSuggestions
                suggestions={editMention.mentionSuggestions}
                onSelect={(u) => editMention.selectMention(u, editText, setEditText)}
              />
            )}
          </div>
          <div style={styles.editRow}>
            <button style={styles.smallBtn} onClick={handleSaveEdit}>
              {t("feed.save")}
            </button>
            <button
              style={styles.smallBtnGhost}
              onClick={() => {
                setEditText(post.text);
                setEditing(false);
                editMention.closeMentions();
              }}
            >
              {t("feed.cancelEdit")}
            </button>
          </div>
        </>
      ) : (
        <p style={styles.postText}>{renderPostText(post.text, allUsers, onHashtagClick, onOpenProfile)}</p>
      )}

      <div style={styles.actionsRow}>
        <div ref={reactionRef} style={styles.reactionWrapper} {...reactionTriggerProps}>
          <button style={styles.actionBtn(!!myReaction)} onClick={handleQuickReact}>
            <span className={likePop ? "pt-like-pop" : ""}>
              {myReaction ? getReactionEmoji(myReaction) : "🤍"}
            </span>{" "}
            {reactionSummary.length > 0
              ? reactionSummary.map((r) => `${r.emoji} ${r.count}`).join(" · ")
              : t("feed.like")}
          </button>
          {pickerOpen && (
            // bottom: "100%" pega el borde inferior del selector justo al
            // borde superior del botón (cero espacio entre los dos), para
            // que mover el mouse de uno a otro no pase por una "zona
            // muerta" fuera de ambos que dispare el cierre por accidente.
            <ReactionPicker
              myReaction={myReaction}
              onSelect={(type) => {
                setMyReaction(type);
                setPickerOpen(false);
              }}
              style={{ bottom: "100%", left: 0 }}
            />
          )}
        </div>
        <button
          style={styles.actionBtn(commentsOpen)}
          onClick={() => setCommentsOpen((v) => !v)}
        >
          💬 {comments.length > 0 ? comments.length : t("feed.comment")}
        </button>
        <button
          style={{ ...styles.actionBtn(false), marginLeft: "auto" }}
          onClick={() => setShareOpen(true)}
          title={t("feed.sharePost")}
        >
          📤
        </button>
        <button
          style={styles.actionBtn(saved)}
          onClick={toggleSave}
          title={t(saved ? "feed.unsavePost" : "feed.savePost")}
        >
          🔖
        </button>
      </div>

      {shareOpen && (
        <SharePostModal
          post={post}
          currentUid={currentUid}
          myProfile={myProfile}
          onClose={() => setShareOpen(false)}
        />
      )}

      {commentsOpen && (
        <div style={styles.commentsBox}>
          {comments.map((c) => (
            <div key={c.id} style={styles.comment}>
              <Avatar
                uid={c.authorId}
                name={c.authorName || c.authorIdentity}
                identity={c.authorIdentity}
                size="sm"
                onClick={() => onOpenProfile(c.authorId)}
              />
              <div style={styles.commentBubble}>
                <span
                  style={styles.commentAuthor}
                  onClick={() => onOpenProfile(c.authorId)}
                >
                  {c.authorName}
                </span>
                {renderTextWithMentions(c.text, allUsers, onOpenProfile)}
              </div>
            </div>
          ))}

          <form style={styles.commentForm} onSubmit={handleComment}>
            <div style={styles.commentInputWrapper}>
              <input
                ref={commentMention.inputRef}
                style={styles.commentInput}
                type="text"
                placeholder={t("feed.commentPlaceholder")}
                value={commentText}
                onChange={(e) => commentMention.handleMentionChange(e, setCommentText)}
              />
              {commentMention.mentionOpen && (
                <MentionSuggestions
                  suggestions={commentMention.mentionSuggestions}
                  onSelect={(u) => commentMention.selectMention(u, commentText, setCommentText)}
                />
              )}
            </div>
            <button type="submit" style={styles.commentSendBtn}>
              {t("feed.send")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function Feed({ onOpenProfile, onOpenGroup, onOpenEvent }) {
  const { t } = useLanguage();
  const [currentUid, setCurrentUid] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [usersMap, setUsersMap] = useState({});
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [feedTab, setFeedTab] = useState("todos"); // "todos" | "siguiendo"
  const [activeHashtag, setActiveHashtag] = useState(null);
  const allUsers = useAllUsers();
  const postMention = useMentionAutocomplete(allUsers, currentUid, myProfile?.blockedUsers || []);

  // Detecta sesión activa y trae tu propio perfil (nombre/identidad para firmar tus posts)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user ? user.uid : null);
    });
    return unsub;
  }, []);

  // Escucha tu propio perfil en tiempo real (para saber a quién bloqueaste y a quién sigues)
  useEffect(() => {
    if (!currentUid) return;
    const unsub = onSnapshot(doc(db, "users", currentUid), (snap) => {
      if (snap.exists()) setMyProfile(snap.data());
    });
    return unsub;
  }, [currentUid]);

  // Escucha todos los perfiles (solo isPrivate/blockedUsers) para filtrar el feed en vivo
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const map = {};
      snap.forEach((d) => {
        map[d.id] = d.data();
      });
      setUsersMap(map);
    });
    return unsub;
  }, []);

  // Escucha el feed completo en tiempo real, más reciente primero
  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPostsLoading(false);
    });
    return unsub;
  }, []);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!text.trim() || !currentUid || !myProfile) return;
    setPosting(true);
    try {
      const trimmed = text.trim();
      const mentionedUids = extractMentionedUids(trimmed, allUsers, currentUid);
      const postRef = await addDoc(collection(db, "posts"), {
        authorId: currentUid,
        authorName: myProfile.displayName || "Sin nombre",
        authorIdentity: myProfile.identity || "",
        text: trimmed,
        hashtags: extractHashtags(trimmed),
        mentionedUids,
        createdAt: serverTimestamp(),
        reactions: {},
      });
      await Promise.all(
        mentionedUids.map((uid) =>
          notify(uid, {
            type: "mention",
            fromUid: currentUid,
            fromName: myProfile.displayName || "Alguien",
            fromIdentity: myProfile.identity || "",
            postId: postRef.id,
          })
        )
      );
      setText("");
      postMention.closeMentions();
    } finally {
      setPosting(false);
    }
  };

  const myBlocked = myProfile?.blockedUsers || [];
  const myFollowing = myProfile?.following || [];
  const visiblePosts = posts.filter((p) => {
    if (p.groupId) return false; // los posts de grupo solo se ven dentro del grupo
    if (p.authorId === currentUid) return true; // siempre ves tus propios posts
    const author = usersMap[p.authorId];
    if (author?.isPrivate) return false;
    if (myBlocked.includes(p.authorId)) return false;
    if ((author?.blockedUsers || []).includes(currentUid)) return false;
    return true;
  });

  const tabPosts =
    feedTab === "siguiendo"
      ? visiblePosts.filter((p) => myFollowing.includes(p.authorId))
      : visiblePosts;

  const finalPosts = activeHashtag
    ? tabPosts.filter((p) => (p.hashtags || []).includes(activeHashtag))
    : tabPosts;

  // EXPLORAR: candidatos = de gente que NO seguís (ni sos vos), excluyendo
  // bloqueados en cualquier dirección, perfiles privados Y muro privado —
  // esto último a propósito distinto de "Todos" (ver docstring más arriba).
  const exploreCandidates =
    feedTab === "explorar"
      ? posts.filter((p) => {
          if (p.groupId) return false; // los posts de grupo no aparecen en Explorar
          if (p.authorId === currentUid) return false;
          const author = usersMap[p.authorId];
          if (author?.isPrivate || author?.isWallPrivate) return false;
          if (myBlocked.includes(p.authorId)) return false;
          if ((author?.blockedUsers || []).includes(currentUid)) return false;
          if (myFollowing.includes(p.authorId)) return false;
          return true;
        })
      : [];

  const exploreFiltered = activeHashtag
    ? exploreCandidates.filter((p) => (p.hashtags || []).includes(activeHashtag))
    : exploreCandidates;

  // Un pre-orden barato (solo reacciones, ya disponibles sin consultas
  // extra) para acotar a cuántas publicaciones les pedimos el conteo de
  // comentarios (EXPLORE_CANDIDATE_CAP) — evita una consulta por cada post
  // del muro entero a medida que crezca la cantidad de publicaciones.
  const EXPLORE_CANDIDATE_CAP = 60;
  const roughRanked = [...exploreFiltered]
    .sort((a, b) => {
      const rA = Object.keys(a.reactions || {}).length;
      const rB = Object.keys(b.reactions || {}).length;
      if (rB !== rA) return rB - rA;
      const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tB - tA;
    })
    .slice(0, EXPLORE_CANDIDATE_CAP);

  const commentCounts = useCommentCounts(roughRanked.map((p) => p.id));
  const explorePosts = rankByPopularity(roughRanked, commentCounts);

  const trendingHashtags = getTrendingHashtags(visiblePosts);
  const authorHashtagMap = buildAuthorHashtagMap(posts);
  const peopleSuggestions = getPeopleSuggestions(
    Object.entries(usersMap).map(([uid, data]) => ({ uid, ...data })),
    currentUid,
    myProfile,
    authorHashtagMap
  );

  if (!currentUid) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.column}>
          <p style={styles.loginNotice}>{t("feed.loginNotice")}</p>
        </div>
      </div>
    );
  }

  let emptyMessage = t("feed.emptyDefault");
  if (activeHashtag) emptyMessage = t("feed.emptyHashtag", { hashtag: activeHashtag });
  else if (feedTab === "siguiendo") emptyMessage = t("feed.emptyFollowing");

  // "Grupos" y "Eventos" reemplazan por completo el feed de posts (lista de
  // grupos/eventos en su lugar) — ocultan composer, hashtags, skeletons y
  // la lista de PostCard, que solo tienen sentido en Todos/Siguiendo/Explorar.
  const isSpecialTab = feedTab === "grupos" || feedTab === "eventos";

  return (
    <div style={styles.wrapper}>
      <div style={styles.column}>
        {feedTab !== "explorar" && !isSpecialTab && (
          <form style={styles.composer} onSubmit={handlePost}>
            <div style={{ position: "relative" }}>
              <textarea
                ref={postMention.inputRef}
                style={styles.textarea}
                placeholder={t("feed.composerPlaceholder")}
                value={text}
                onChange={(e) => postMention.handleMentionChange(e, setText)}
              />
              {postMention.mentionOpen && (
                <MentionSuggestions
                  suggestions={postMention.mentionSuggestions}
                  onSelect={(u) => postMention.selectMention(u, text, setText)}
                />
              )}
            </div>
            <button type="submit" style={styles.postBtn} disabled={posting}>
              {posting ? t("feed.posting") : t("feed.postButton")}
            </button>
            <div style={{ clear: "both" }} />
          </form>
        )}

        <div style={styles.tabsRow}>
          <button style={styles.tabBtn(feedTab === "todos")} onClick={() => setFeedTab("todos")}>
            {t("feed.tabAll")}
          </button>
          <button
            style={styles.tabBtn(feedTab === "siguiendo")}
            onClick={() => setFeedTab("siguiendo")}
          >
            {t("feed.tabFollowing")}
          </button>
          <button
            style={styles.tabBtn(feedTab === "explorar")}
            onClick={() => setFeedTab("explorar")}
          >
            {t("feed.tabExplore")}
          </button>
          <button
            style={styles.tabBtn(feedTab === "grupos")}
            onClick={() => setFeedTab("grupos")}
          >
            {t("feed.tabGroups")}
          </button>
          <button
            style={styles.tabBtn(feedTab === "eventos")}
            onClick={() => setFeedTab("eventos")}
          >
            {t("feed.tabEvents")}
          </button>
        </div>

        {feedTab === "grupos" && <Groups onOpenGroup={onOpenGroup} />}
        {feedTab === "eventos" && <Events onOpenEvent={onOpenEvent} />}

        {feedTab === "explorar" && (
          <>
            <TrendingHashtags
              hashtags={trendingHashtags}
              activeHashtag={activeHashtag}
              onSelect={setActiveHashtag}
            />
            <PeopleSuggestions
              suggestions={peopleSuggestions}
              currentUid={currentUid}
              myProfile={myProfile}
              onOpenProfile={onOpenProfile}
            />
          </>
        )}

        {!isSpecialTab && activeHashtag && (
          <div style={styles.hashtagFilterChip}>
            #{activeHashtag}
            <span
              style={styles.hashtagFilterClose}
              onClick={() => setActiveHashtag(null)}
            >
              ✕
            </span>
          </div>
        )}

        {!isSpecialTab && postsLoading && (
          <>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </>
        )}

        {!isSpecialTab && !postsLoading && feedTab === "explorar" && explorePosts.length === 0 && (
          <p style={styles.empty}>{t("explore.emptyFeed")}</p>
        )}

        {!isSpecialTab && !postsLoading && feedTab !== "explorar" && finalPosts.length === 0 && (
          <p style={styles.empty}>{emptyMessage}</p>
        )}

        {!isSpecialTab &&
          !postsLoading &&
          (feedTab === "explorar" ? explorePosts : finalPosts).map((p) => (
            <PostCard
              key={p.id}
              post={p}
              currentUid={currentUid}
              myProfile={myProfile}
              onOpenProfile={onOpenProfile}
              onHashtagClick={setActiveHashtag}
            />
          ))}
      </div>
    </div>
  );
}
