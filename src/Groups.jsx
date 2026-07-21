import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, addDoc, setDoc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { useLanguage } from "./LanguageContext";

/*
  Groups
  ------
  Pantalla "Grupos": lista de comunidades temáticas (solo texto, sin
  imagen de portada por ahora — subir archivos requiere el plan Blaze de
  Firebase, pospuesto igual que las fotos de perfil). Vive como una
  pestaña más dentro de Feed.jsx ("Grupos", junto a Todos/Siguiendo/
  Explorar) en vez de un ícono aparte en la nav principal, para no sumar
  un sexto ícono a la barra inferior fija de móvil. Por eso este
  componente NO trae su propio wrapper de página entera: se renderiza ya
  metido dentro de la columna de Feed.jsx.

  Entrar a un grupo específico (unirse/salir, miembros, muro del grupo)
  es GroupView.jsx, una vista superpuesta más manejada desde App.js
  (mismo patrón que UserProfile/SavedPosts/PostView), a la que se llega
  con onOpenGroup(groupId).

  Estructura en Firestore:
  - "groups/{groupId}" -> { name, description, createdBy, createdAt }
  - "groups/{groupId}/members/{uid}" -> { joinedAt }
    El número de miembros NUNCA se guarda como campo aparte: se escucha la
    subcolección en tiempo real y se cuenta directo (mismo principio que
    comentarios/seguidores en el resto de la app) — ver GroupRow más abajo.

  Los posts de cada grupo viven en la MISMA colección "posts" de siempre
  (con un campo "groupId" nuevo) para poder reutilizar PostCard tal cual
  — ver GroupView.jsx. Por eso el muro principal (Feed.jsx) y Explorar
  (Explore.jsx) excluyen cualquier post que tenga "groupId": no aparecen
  mezclados fuera de su grupo.
*/

const styles = {
  headerRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "16px",
    flexWrap: "wrap",
  },
  searchInput: {
    flex: 1,
    minWidth: "160px",
    boxSizing: "border-box",
    background: "var(--surface-alt)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    padding: "10px 16px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
  },
  createBtn: {
    padding: "10px 18px",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
    color: "var(--bg)",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
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
  groupRow: {
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
  groupIcon: {
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
  groupName: { fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--text)" },
  groupDescription: {
    fontSize: "12px",
    color: "var(--text-muted)",
    margin: "2px 0 4px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  groupMeta: { fontSize: "11px", color: "var(--text-muted)", margin: 0 },
  empty: {
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "14px",
    padding: "40px 0",
  },
};

function GroupRow({ group, onOpen }) {
  const { t } = useLanguage();
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "groups", group.id, "members"), (snap) => {
      setMemberCount(snap.size);
    });
    return unsub;
  }, [group.id]);

  return (
    <div style={styles.groupRow} onClick={() => onOpen(group.id)}>
      <div style={styles.groupIcon}>👥</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={styles.groupName}>{group.name}</p>
        {group.description && <p style={styles.groupDescription}>{group.description}</p>}
        <p style={styles.groupMeta}>{t("groups.memberCount", { count: memberCount })}</p>
      </div>
    </div>
  );
}

function CreateGroupForm({ currentUid, onCreated, onCancel }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim() || !currentUid) return;
    setCreating(true);
    try {
      const groupRef = await addDoc(collection(db, "groups"), {
        name: name.trim(),
        description: description.trim(),
        createdBy: currentUid,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "groups", groupRef.id, "members", currentUid), {
        joinedAt: serverTimestamp(),
      });
      onCreated(groupRef.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <form style={styles.createForm} onSubmit={handleCreate}>
      <input
        style={styles.input}
        type="text"
        placeholder={t("groups.namePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <textarea
        style={styles.textarea}
        placeholder={t("groups.descriptionPlaceholder")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div style={styles.formActions}>
        <button type="submit" style={styles.submitBtn} disabled={creating || !name.trim()}>
          {creating ? t("groups.creating") : t("groups.createSubmit")}
        </button>
        <button type="button" style={styles.cancelBtn} onClick={onCancel}>
          {t("groups.cancel")}
        </button>
      </div>
    </form>
  );
}

export default function Groups({ onOpenGroup }) {
  const { t } = useLanguage();
  const [currentUid, setCurrentUid] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUid(u ? u.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "groups"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const search_ = search.trim().toLowerCase();
  const filtered = search_
    ? groups.filter((g) => (g.name || "").toLowerCase().includes(search_))
    : groups;

  return (
    <div>
      <div style={styles.headerRow}>
        <input
          style={styles.searchInput}
          type="text"
          placeholder={t("groups.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button style={styles.createBtn} onClick={() => setCreating((v) => !v)}>
          {creating ? t("groups.cancel") : t("groups.createButton")}
        </button>
      </div>

      {creating && (
        <CreateGroupForm
          currentUid={currentUid}
          onCreated={(id) => {
            setCreating(false);
            onOpenGroup(id);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {!loading && filtered.length === 0 && <p style={styles.empty}>{t("groups.empty")}</p>}

      {filtered.map((g) => (
        <GroupRow key={g.id} group={g} onOpen={onOpenGroup} />
      ))}
    </div>
  );
}
