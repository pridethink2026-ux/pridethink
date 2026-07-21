import React, { useEffect, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { normalizeIdentityText } from "./identityStyles";
import Avatar from "./Avatar";

/*
  Mentions
  --------
  Menciones @usuario en publicaciones y comentarios. Comparte el mismo
  espíritu que Reactions.jsx: un solo archivo con la lógica pura Y la UI
  compartida entre Feed.jsx (post y comentarios) y quien más lo necesite.

  Cómo funciona, de punta a punta:
  1. Mientras se escribe (useMentionAutocomplete), al detectar un "@"
     seguido de letras sin espacio hasta el cursor, se arma una lista de
     sugerencias (getMentionSuggestions) buscando en tiempo real contra
     TODOS los usuarios (useAllUsers, mismo patrón de onSnapshot sobre la
     colección completa ya usado en Feed.jsx/Search.jsx), filtrando por
     nombre o identidad — mismo criterio de "quién es visible" que ya usa
     Search.jsx (sin bloqueados en ninguna dirección, sin perfiles
     privados).
  2. Al elegir a alguien del menú (MentionSuggestions), se inserta
     "@NombreCompleto " en el texto en el lugar del cursor.
  3. NO se guarda la posición de la mención dentro del texto: al publicar
     o editar, y al renderizar, se vuelve a detectar el patrón "@Nombre"
     comparando contra los nombres de usuarios reales (parseMentions) —
     así que también funciona si alguien escribe "@NombreExacto" a mano,
     sin pasar por el menú de sugerencias. Si "@algo" no matchea a nadie,
     queda como texto normal (no rompe nada).
  4. extractMentionedUids usa lo mismo para saber a quién notificar al
     publicar/comentar/editar (guardado como post.mentionedUids /
     comment.mentionedUids, solo la lista de uids — nunca se duplica el
     nombre ni ningún otro dato del usuario mencionado).
  5. renderTextWithMentions usa lo mismo para mostrar cada "@Nombre" como
     texto clickeable (color de acento del tema activo) que abre el perfil
     público de esa persona.
*/

export function useAllUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    });
    return unsub;
  }, []);
  return users;
}

// Candidatos que se OFRECEN en el menú de sugerencias: mismo criterio de
// visibilidad que Search.jsx (sin ti mismo, sin bloqueados en ninguna
// dirección, sin perfiles privados).
function isSuggestable(user, currentUid, myBlocked) {
  if (!user || user.uid === currentUid) return false;
  if (!(user.displayName || "").trim()) return false;
  if (user.isPrivate) return false;
  if (myBlocked.includes(user.uid)) return false;
  if ((user.blockedUsers || []).includes(currentUid)) return false;
  return true;
}

export function getMentionSuggestions(users, currentUid, myBlocked, query) {
  const q = normalizeIdentityText(query || "");
  return (users || [])
    .filter((u) => isSuggestable(u, currentUid, myBlocked || []))
    .filter((u) => {
      if (!q) return true;
      return (
        normalizeIdentityText(u.displayName || "").includes(q) ||
        normalizeIdentityText(u.identity || "").includes(q)
      );
    })
    .slice(0, 6);
}

// Busca, dentro de "text" (lo que sigue a un "@"), el nombre de usuario
// conocido más largo que matchee desde el principio — así "@Ana Torres" no
// se corta en "Ana" si hace falta el nombre completo para distinguir a dos
// personas. Exige que el caracter siguiente (si hay uno) no sea letra ni
// número, para no matchear a medias una palabra más larga.
function findLongestMention(text, users) {
  let best = null;
  for (const u of users) {
    const name = (u.displayName || "").trim();
    if (!name || text.length < name.length) continue;
    const candidate = text.slice(0, name.length);
    if (normalizeIdentityText(candidate) !== normalizeIdentityText(name)) continue;
    const nextChar = text[name.length];
    if (nextChar && /[\p{L}\p{N}]/u.test(nextChar)) continue;
    if (!best || candidate.length > best.name.length) {
      best = { user: u, name: candidate };
    }
  }
  return best;
}

// Parte el texto en piezas de texto normal + menciones detectadas, contra
// la lista completa de usuarios conocidos. Cada pieza es
// { text, mention: null } o { text: "@Nombre", mention: userObj }.
export function parseMentions(text, users) {
  const usable = (users || []).filter((u) => (u.displayName || "").trim());
  if (!text || usable.length === 0) return [{ text: text || "", mention: null }];

  const segments = [];
  let buffer = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "@") {
      const match = findLongestMention(text.slice(i + 1), usable);
      if (match) {
        if (buffer) {
          segments.push({ text: buffer, mention: null });
          buffer = "";
        }
        segments.push({ text: `@${match.name}`, mention: match.user });
        i += 1 + match.name.length;
        continue;
      }
    }
    buffer += ch;
    i += 1;
  }
  if (buffer) segments.push({ text: buffer, mention: null });
  return segments;
}

// Uids distintos mencionados en el texto (excluyendo a quien escribe), para
// guardar en post.mentionedUids/comment.mentionedUids y para notificar.
export function extractMentionedUids(text, users, excludeUid) {
  const uids = new Set();
  parseMentions(text, users).forEach((seg) => {
    if (seg.mention && seg.mention.uid !== excludeUid) uids.add(seg.mention.uid);
  });
  return Array.from(uids);
}

const styles = {
  mention: {
    color: "var(--accent)",
    fontWeight: 600,
    cursor: "pointer",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: "4px",
    width: "240px",
    maxWidth: "90vw",
    maxHeight: "220px",
    overflowY: "auto",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "14px",
    padding: "6px",
    zIndex: 40,
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
  dropdownItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    borderRadius: "10px",
    cursor: "pointer",
  },
  dropdownName: { fontSize: "13px", fontWeight: 600, margin: 0, color: "var(--text)" },
  dropdownIdentity: {
    fontSize: "11px",
    color: "var(--text-muted)",
    margin: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};

// Convierte un texto plano (sin hashtags, o ya separado de ellos) en nodos
// de React: texto normal + spans clickeables por cada mención detectada.
export function renderTextWithMentions(text, users, onOpenProfile) {
  return parseMentions(text, users).map((seg, i) =>
    seg.mention ? (
      <span key={i} style={styles.mention} onClick={() => onOpenProfile(seg.mention.uid)}>
        {seg.text}
      </span>
    ) : (
      <React.Fragment key={i}>{seg.text}</React.Fragment>
    )
  );
}

// Hook para conectar cualquier <textarea>/<input> controlado al
// autocompletado de menciones: detecta el "@palabra" en curso (desde el
// último "@" antes del cursor hasta el cursor, sin espacios de por medio),
// arma sugerencias, e inserta "@NombreCompleto " al elegir una.
export function useMentionAutocomplete(users, currentUid, myBlocked) {
  const [state, setState] = useState({ query: null, start: -1 });
  const inputRef = useRef(null);
  const pendingCaret = useRef(null);

  // Después de insertar una mención, mueve el cursor justo después del
  // texto insertado (una vez que React ya aplicó el nuevo value al DOM).
  useEffect(() => {
    if (pendingCaret.current != null && inputRef.current) {
      const pos = pendingCaret.current;
      pendingCaret.current = null;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(pos, pos);
    }
  });

  const handleMentionChange = (e, setText) => {
    const text = e.target.value;
    const caret = e.target.selectionStart;
    setText(text);
    const upToCaret = text.slice(0, caret);
    const atIndex = upToCaret.lastIndexOf("@");
    if (atIndex === -1 || /[\s@]/.test(upToCaret.slice(atIndex + 1))) {
      setState({ query: null, start: -1 });
      return;
    }
    setState({ query: upToCaret.slice(atIndex + 1), start: atIndex });
  };

  const selectMention = (user, text, setText) => {
    const caret = inputRef.current ? inputRef.current.selectionStart : text.length;
    const before = text.slice(0, state.start);
    const after = text.slice(caret);
    const inserted = `@${user.displayName} `;
    pendingCaret.current = (before + inserted).length;
    setText(before + inserted + after);
    setState({ query: null, start: -1 });
  };

  const closeMentions = () => setState({ query: null, start: -1 });

  const mentionOpen = state.query !== null;
  const mentionSuggestions = mentionOpen
    ? getMentionSuggestions(users, currentUid, myBlocked, state.query)
    : [];

  return { inputRef, mentionOpen, mentionSuggestions, handleMentionChange, selectMention, closeMentions };
}

// Menú desplegable de sugerencias, pensado para colgar de un contenedor
// con position:"relative" (el mismo que envuelve el textarea/input).
export function MentionSuggestions({ suggestions, onSelect }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div style={styles.dropdown}>
      {suggestions.map((u) => (
        <div
          key={u.uid}
          style={styles.dropdownItem}
          // onMouseDown (no onClick) para que dispare ANTES de que el
          // textarea pierda el foco y cierre el menú.
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(u);
          }}
        >
          <Avatar uid={u.uid} name={u.displayName} identity={u.identity} size="sm" />
          <div style={{ minWidth: 0 }}>
            <p style={styles.dropdownName}>{u.displayName}</p>
            {u.identity && <p style={styles.dropdownIdentity}>{u.identity}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
