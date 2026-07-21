import React, { useEffect, useState } from "react";
import { collection, doc, updateDoc, arrayUnion, getCountFromServer } from "firebase/firestore";
import { db } from "./firebase";
import { notify } from "./utils";
import { normalizeIdentityText } from "./identityStyles";
import { useLanguage } from "./LanguageContext";
import Avatar from "./Avatar";

/*
  Explore
  -------
  Lógica y UI de la pestaña "Explorar" (una tercera pestaña dentro de
  Feed.jsx, junto a "Todos"/"Siguiendo"): descubrir publicaciones de gente
  que no seguís, hashtags en tendencia, y sugerencias de personas.

  TENDENCIAS (getTrendingHashtags): cuenta ocurrencias de hashtags en
  publicaciones de las últimas 72 horas — se recalcula cada vez que se
  entra a la pantalla (a partir de los posts ya cargados en Feed.jsx), NUNCA
  se guarda como contador acumulado en Firestore (mismo principio que
  cualquier otro conteo derivado de la app).

  FEED DE EXPLORAR: a diferencia del muro "Todos" (que solo excluye
  bloqueados y perfiles privados), acá TAMBIÉN se excluye a quien tiene el
  muro privado (isWallPrivate) — Explorar es para toparte con gente que NO
  conocés todavía, así que alguien que activó "Muro privado" no quiere que
  desconocidos encuentren sus publicaciones por acá (sí las sigue viendo
  quien ya lo sigue, en el muro "Todos", eso no cambia).
  Se ordena por popularidad: reacciones + comentarios (rankByPopularity).
  Los comentarios no se cuentan con un listener en tiempo real (sería un
  onSnapshot por publicación solo para ordenar) sino con una consulta de
  conteo puntual (getCountFromServer) al entrar a la pantalla — más liviano,
  y sigue sin guardar nada acumulado.

  SUGERENCIAS DE PERSONAS (getPeopleSuggestions): usuarios que no seguís,
  con un puntaje simple = palabras en común entre tu identidad libre y la
  suya + hashtags en común entre tus publicaciones y las suyas. Si nadie
  tiene puntaje (cuenta nueva, sin overlap todavía), el orden cae solo en
  "más reciente primero" (se ordena la lista base por joinedAt ANTES de
  puntuar, y el ordenamiento por puntaje es estable, así que empates en 0
  mantienen ese orden por recencia).
*/

const TRENDING_WINDOW_HOURS = 72;
const TRENDING_LIMIT = 8;
const SUGGESTIONS_LIMIT = 8;

export function getTrendingHashtags(posts, windowHours = TRENDING_WINDOW_HOURS, limitCount = TRENDING_LIMIT) {
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const counts = {};
  (posts || []).forEach((p) => {
    const created = p.createdAt?.toDate ? p.createdAt.toDate().getTime() : null;
    if (!created || created < cutoff) return;
    (p.hashtags || []).forEach((h) => {
      counts[h] = (counts[h] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limitCount)
    .map(([hashtag, count]) => ({ hashtag, count }));
}

// Hashtags usados por cada autor (a partir de sus propias publicaciones),
// para calcular afinidad en las sugerencias de personas.
export function buildAuthorHashtagMap(posts) {
  const map = {};
  (posts || []).forEach((p) => {
    if (!map[p.authorId]) map[p.authorId] = new Set();
    (p.hashtags || []).forEach((h) => map[p.authorId].add(h));
  });
  return map;
}

function wordsOf(text) {
  return normalizeIdentityText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
}

export function getPeopleSuggestions(users, currentUid, myProfile, authorHashtagMap, limitCount = SUGGESTIONS_LIMIT) {
  const myBlocked = myProfile?.blockedUsers || [];
  const myFollowing = myProfile?.following || [];
  const myWords = new Set(wordsOf(myProfile?.identity || ""));
  const myHashtags = authorHashtagMap[currentUid] || new Set();

  const candidates = (users || []).filter((u) => {
    if (!u || u.uid === currentUid) return false;
    if (u.isPrivate) return false;
    if (myFollowing.includes(u.uid)) return false;
    if (myBlocked.includes(u.uid)) return false;
    if ((u.blockedUsers || []).includes(currentUid)) return false;
    return true;
  });

  // Orden base por recencia (más reciente primero) ANTES de puntuar: como
  // el sort de puntaje es estable, si dos personas empatan en puntaje (lo
  // más común, sobre todo con 0 en ambas), este orden por recencia queda.
  candidates.sort((a, b) => {
    const at = a.joinedAt?.toMillis ? a.joinedAt.toMillis() : 0;
    const bt = b.joinedAt?.toMillis ? b.joinedAt.toMillis() : 0;
    return bt - at;
  });

  const scored = candidates.map((u) => {
    let score = 0;
    const theirWords = wordsOf(u.identity || "");
    score += theirWords.filter((w) => myWords.has(w)).length;
    const theirHashtags = authorHashtagMap[u.uid] || new Set();
    theirHashtags.forEach((h) => {
      if (myHashtags.has(h)) score += 2;
    });
    return { user: u, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limitCount).map((s) => s.user);
}

// Cuenta de comentarios por post, con una consulta de conteo puntual
// (getCountFromServer) en vez de un listener en tiempo real — solo se
// recalcula cuando cambia la lista de ids (mismo patrón de "unir ids con
// una coma" que ya usa SavedPosts.jsx para su propio efecto).
export function useCommentCounts(postIds) {
  const [counts, setCounts] = useState({});
  const key = (postIds || []).join(",");

  useEffect(() => {
    let cancelled = false;
    if (!postIds || postIds.length === 0) {
      setCounts({});
      return;
    }
    Promise.all(
      postIds.map((id) =>
        getCountFromServer(collection(db, "posts", id, "comments")).then((snap) => [id, snap.data().count])
      )
    ).then((pairs) => {
      if (!cancelled) setCounts(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return counts;
}

export function rankByPopularity(posts, commentCounts) {
  return [...(posts || [])].sort((a, b) => {
    const scoreA = Object.keys(a.reactions || {}).length + (commentCounts[a.id] || 0);
    const scoreB = Object.keys(b.reactions || {}).length + (commentCounts[b.id] || 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });
}

const styles = {
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
  trendingWrap: { marginBottom: "20px" },
  trendingRow: { display: "flex", flexWrap: "wrap", gap: "8px" },
  trendingChip: (active) => ({
    padding: "7px 14px",
    borderRadius: "999px",
    border: `1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
    background: active ? "var(--accent2-soft)" : "var(--surface)",
    color: active ? "var(--accent2)" : "var(--text)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),
  trendingCount: { color: "var(--text-muted)", fontWeight: 500, marginLeft: "4px" },
  suggestWrap: { marginBottom: "22px" },
  suggestRow: { display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "6px" },
  suggestCard: {
    flexShrink: 0,
    width: "132px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    padding: "14px 10px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "8px",
    cursor: "pointer",
  },
  suggestName: {
    fontSize: "13px",
    fontWeight: 600,
    margin: 0,
    color: "var(--text)",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  suggestIdentity: {
    fontSize: "11px",
    color: "var(--text-muted)",
    margin: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  suggestFollowBtn: {
    padding: "6px 16px",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
};

export function TrendingHashtags({ hashtags, activeHashtag, onSelect }) {
  const { t } = useLanguage();
  if (!hashtags || hashtags.length === 0) return null;
  return (
    <div style={styles.trendingWrap}>
      <p style={styles.sectionTitle}>{t("explore.trendingTitle")}</p>
      <div style={styles.trendingRow}>
        {hashtags.map(({ hashtag, count }) => (
          <span
            key={hashtag}
            style={styles.trendingChip(activeHashtag === hashtag)}
            onClick={() => onSelect(activeHashtag === hashtag ? null : hashtag)}
          >
            #{hashtag}
            <span style={styles.trendingCount}>{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({ user, currentUid, myProfile, onOpenProfile }) {
  const { t } = useLanguage();

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (!currentUid) return;
    await updateDoc(doc(db, "users", currentUid), { following: arrayUnion(user.uid) });
    await notify(user.uid, {
      type: "follow",
      fromUid: currentUid,
      fromName: myProfile?.displayName || "Alguien",
      fromIdentity: myProfile?.identity || "",
    });
  };

  return (
    <div style={styles.suggestCard} onClick={() => onOpenProfile(user.uid)}>
      <Avatar uid={user.uid} name={user.displayName || user.identity} identity={user.identity} size="md" />
      <p style={styles.suggestName}>{user.displayName || "Sin nombre"}</p>
      {user.identity && <p style={styles.suggestIdentity}>{user.identity}</p>}
      <button style={styles.suggestFollowBtn} onClick={handleFollow}>
        {t("explore.follow")}
      </button>
    </div>
  );
}

export function PeopleSuggestions({ suggestions, currentUid, myProfile, onOpenProfile }) {
  const { t } = useLanguage();
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div style={styles.suggestWrap}>
      <p style={styles.sectionTitle}>{t("explore.suggestedPeople")}</p>
      <div style={styles.suggestRow}>
        {suggestions.map((u) => (
          <SuggestionCard
            key={u.uid}
            user={u}
            currentUid={currentUid}
            myProfile={myProfile}
            onOpenProfile={onOpenProfile}
          />
        ))}
      </div>
    </div>
  );
}
