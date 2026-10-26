import React, { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  collection,
  query,
  where,
  writeBatch,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import Avatar from "./Avatar";
import ProfilePhotoUploader from "./ProfilePhotoUploader";
import { PostCard } from "./Feed";
import FollowListModal from "./FollowListModal";
import ProfileAbout from "./ProfileAbout";
import VerifiedBadge from "./VerifiedBadge";
import { useLanguage } from "./LanguageContext";
import { useFollowerUids, useUserProfile } from "./AllUsersContext";
import { markOffline } from "./presence";
import { unblockUser, useMyBlocks } from "./Blocks";
import { formatMonthYear, formatLongDate } from "./utils";
import { authStyles as styles, IdentityForm } from "./AuthForms";

/*
  AuthProfile
  -----------
  Tu perfil (pestaña "Perfil") y editar tu identidad. Entrar y registrarse
  viven aparte, en AuthScreen.jsx (punto 68, commit 7): Root.jsx solo
  muestra la app, y por lo tanto este perfil, con sesión y perfil creado.

  YA CONECTADO A FIREBASE (Auth + Firestore reales):
  - Auth real -> signOut (crear cuenta y entrar: AuthScreen.jsx)
  - Firestore write -> setDoc(doc(db, "users", uid), perfil) al editar
  - Firestore read  -> getDoc de users/{uid} y users/{uid}/private/data (loadOwnProfile)

  Ahora los datos SÍ persisten al recargar la página, y dos personas
  distintas (tú y tu socio) ven la misma base de datos real.
*/

// Auditoría de seguridad (2026-07-28, hallazgo H2): los posts guardan una
// COPIA de isPrivate/isWallPrivate en el momento de publicarse
// (authorIsPrivate/authorIsWallPrivate, ver el docstring de Feed.jsx) para
// que firestore.rules pueda validar la privacidad directo sobre el post,
// sin tener que leer el perfil del autor aparte. Esta copia queda
// desactualizada si no se sincroniza cuando el usuario cambia el toggle
// más tarde — este helper actualiza TODOS los posts existentes de ese
// usuario en lotes de hasta 500 (el máximo de un writeBatch), llamado
// desde handleTogglePrivacy/handleToggleWallPrivacy más abajo.
async function syncPostsPrivacyField(uid, fieldName, newValue) {
  const snap = await getDocs(query(collection(db, "posts"), where("authorId", "==", uid)));
  const allDocs = snap.docs;
  for (let i = 0; i < allDocs.length; i += 500) {
    const chunk = allDocs.slice(i, i + 500);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.update(d.ref, { [fieldName]: newValue }));
    await batch.commit();
  }
}

function BlockedUserRow({ uid, onUnblock }) {
  const { t } = useLanguage();
  // De AllUsersContext (punto 70, commit 9c), sin un listener por fila.
  const profile = useUserProfile(uid);

  return (
    <div style={styles.blockedRow}>
      <Avatar
        uid={uid}
        name={profile?.displayName || profile?.identity}
        identity={profile?.identity}
        photoURL={profile?.photoURL}
        size="sm"
      />
      <div style={styles.blockedInfo}>
        <p style={styles.blockedName}>{profile?.displayName || t("profile.defaultUser")}</p>
        <p style={styles.blockedIdentity}>{profile?.identity}</p>
      </div>
      <button style={styles.unblockBtn} onClick={() => onUnblock(uid)}>
        {t("profile.unblock")}
      </button>
    </div>
  );
}

function ProfileView({
  user,
  uid,
  onLogout,
  onEdit,
  onTogglePrivacy,
  onToggleWallPrivacy,
  onToggleSoundMuted,
  onUnblock,
  onOpenProfile,
  onOpenSaved,
}) {
  const { language, setLanguage, t } = useLanguage();
  const { blockedByMe: blockedUsers } = useMyBlocks(uid);
  // Seguidores = usuarios cuyo "following" contiene tu uid, de
  // AllUsersContext (punto 70, commit 9c; antes, una consulta propia que
  // cada latido de presencia de un seguidor volvía a leer).
  const followersCount = useFollowerUids(uid).length;
  const [followModal, setFollowModal] = useState(null); // null | "followers" | "following"
  const [profileTab, setProfileTab] = useState("info"); // "info" | "posts"
  const [myPosts, setMyPosts] = useState([]);
  const followingCount = (user.following || []).length;

  // Pestaña "Posts": TODOS tus propios posts, sin filtrar por
  // authorIsPrivate/authorIsWallPrivate (sos el dueño, siempre te ves a vos
  // mismo — mismo criterio que usa la regla de posts/{postId} en
  // firestore.rules y que UserProfile.jsx usa cuando isMe). Sin orderBy()
  // en la consulta a propósito (evita un índice compuesto); se ordena acá.
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "posts"), where("authorId", "==", uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setMyPosts(list);
    });
    return unsub;
  }, [uid]);

  return (
    <div>
      <div style={styles.tabsRow}>
        <button style={styles.tabBtn(profileTab === "info")} onClick={() => setProfileTab("info")}>
          {t("profile.tabInfo")}
        </button>
        <button style={styles.tabBtn(profileTab === "posts")} onClick={() => setProfileTab("posts")}>
          {t("profile.tabPosts")}
        </button>
      </div>

      {profileTab === "info" && (
        <>
          <div style={styles.profileHeader}>
            <Avatar
              uid={uid}
              name={user.displayName || user.identity}
              identity={user.identity}
              photoURL={user.photoURL}
              size="lg"
            />
            <div>
              <h1 style={{ ...styles.title, fontSize: "20px", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                {user.displayName}
                {user.isVerified && <VerifiedBadge size="md" />}
              </h1>
              <p style={{ ...styles.subtitle, margin: 0 }}>{user.identity}</p>
              {user.bio && <p style={styles.bioText}>{user.bio}</p>}
            </div>
          </div>

          {/* Punto 58: único lugar de la app donde se cambia la foto de
              perfil — siempre la propia (el uploader recibe TU uid). */}
          <div style={styles.photoUploaderRow}>
            <ProfilePhotoUploader uid={uid} photoURL={user.photoURL} />
          </div>

          <div style={styles.countsRow}>
            <div style={styles.countItem} onClick={() => setFollowModal("followers")}>
              <p style={styles.countNumber}>{followersCount}</p>
              <p style={styles.countLabel}>{t("profile.followers")}</p>
            </div>
            <div style={styles.countItem} onClick={() => setFollowModal("following")}>
              <p style={styles.countNumber}>{followingCount}</p>
              <p style={styles.countLabel}>{t("profile.following")}</p>
            </div>
          </div>

          {followModal && (
            <FollowListModal
              mode={followModal}
              targetUid={uid}
              currentUid={uid}
              myProfile={user}
              onClose={() => setFollowModal(null)}
              onOpenProfile={onOpenProfile}
            />
          )}

          <div style={{ marginBottom: "24px" }}>
            <div style={styles.fieldRow}>
              <span style={styles.fieldLabel}>{t("profile.emailField")}</span>
              <span style={styles.fieldValue}>{auth.currentUser?.email}</span>
            </div>
            <div style={styles.fieldRow}>
              <span style={styles.fieldLabel}>{t("profile.identityField")}</span>
              <span style={styles.fieldValue}>{user.identity}</span>
            </div>
            {user.identityUpdatedAt && (
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>{t("profile.lastUpdated")}</span>
                <span style={styles.fieldValue}>{formatLongDate(user.identityUpdatedAt, t)}</span>
              </div>
            )}
            {user.joinedAt && (
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>{t("profile.memberSince")}</span>
                <span style={styles.fieldValue}>{formatMonthYear(user.joinedAt, t)}</span>
              </div>
            )}

            <div style={styles.privacyRow}>
              <div>
                <p style={{ ...styles.privacyText, margin: 0, fontWeight: 600 }}>
                  {t("profile.privateProfile")}
                </p>
                <p style={styles.privacyHint}>
                  {user.isPrivate ? t("profile.privateOn") : t("profile.privateOff")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!user.isPrivate}
                aria-label={t("profile.privateProfile")}
                style={styles.toggle(!!user.isPrivate)}
                onClick={() => onTogglePrivacy(!user.isPrivate)}
              >
                <span style={styles.toggleDot(!!user.isPrivate)} />
              </button>
            </div>

            <div style={styles.privacyRow}>
              <div>
                <p style={{ ...styles.privacyText, margin: 0, fontWeight: 600 }}>
                  {t("profile.privateWall")}
                </p>
                <p style={styles.privacyHint}>{t("profile.privateWallHint")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!user.isWallPrivate}
                aria-label={t("profile.privateWall")}
                style={styles.toggle(!!user.isWallPrivate)}
                onClick={() => onToggleWallPrivacy(!user.isWallPrivate)}
              >
                <span style={styles.toggleDot(!!user.isWallPrivate)} />
              </button>
            </div>

            <div style={styles.privacyRow}>
              <div>
                <p style={{ ...styles.privacyText, margin: 0, fontWeight: 600 }}>
                  {t("profile.muteSounds")}
                </p>
                <p style={styles.privacyHint}>
                  {user.soundMuted ? t("profile.muteSoundsOn") : t("profile.muteSoundsOff")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!user.soundMuted}
                aria-label={t("profile.muteSounds")}
                style={styles.toggle(!!user.soundMuted)}
                onClick={() => onToggleSoundMuted(!user.soundMuted)}
              >
                <span style={styles.toggleDot(!!user.soundMuted)} />
              </button>
            </div>

            <div style={styles.privacyRow}>
              <p style={{ ...styles.privacyText, margin: 0, fontWeight: 600 }}>
                {t("profile.language")}
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  style={styles.chip(language === "es")}
                  aria-pressed={language === "es"}
                  onClick={() => setLanguage("es")}
                >
                  ES
                </button>
                <button
                  type="button"
                  style={styles.chip(language === "en")}
                  aria-pressed={language === "en"}
                  onClick={() => setLanguage("en")}
                >
                  EN
                </button>
              </div>
            </div>
          </div>

          <ProfileAbout profileUser={user} />

          <p style={styles.sectionTitle}>{t("profile.blockedUsers")}</p>
          {blockedUsers.length === 0 ? (
            <p style={styles.blockedEmpty}>{t("profile.blockedEmpty")}</p>
          ) : (
            blockedUsers.map((buid) => (
              <BlockedUserRow key={buid} uid={buid} onUnblock={onUnblock} />
            ))
          )}

          <button style={{ ...styles.buttonGhost, marginTop: "20px" }} onClick={onOpenSaved}>
            {t("saved.openButton")}
          </button>
          <button style={{ ...styles.buttonGhost, marginTop: "10px" }} onClick={onEdit}>
            {t("profile.changeIdentity")}
          </button>
          <button
            style={{ ...styles.buttonGhost, marginTop: "10px" }}
            onClick={onLogout}
          >
            {t("profile.logout")}
          </button>
        </>
      )}

      {profileTab === "posts" && (
        <>
          {myPosts.length === 0 ? (
            <p style={styles.blockedEmpty}>{t("profile.noPostsYet")}</p>
          ) : (
            myPosts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                currentUid={uid}
                myProfile={user}
                onOpenProfile={onOpenProfile}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

// Auto-repara users/{uid}.joinedAt para cuentas viejas (de antes del
// 2026-08-04, cuando este campo se guardaba como string ya formateado en
// español en vez de un Timestamp — ver el punto 56 en CONTEXTO.md): si
// "data.joinedAt" sigue siendo un string, lo reemplaza acá mismo por un
// Timestamp construido con la fecha de creación REAL de la cuenta, que
// Firebase Auth ya guarda solo para toda cuenta (auth.currentUser.metadata.
// creationTime) — más preciso que poner "ahora" (perderíamos la fecha real
// de cuándo se unió) y no requiere entrar a mano a Firebase console. Se
// dispara solo, la primera vez que carga tu perfil después de este cambio;
// si "joinedAt" ya es un Timestamp (cuenta nueva, o ya reparada antes), no
// hace nada. El setDoc corre en segundo plano (no se espera, mismo patrón
// que markOnline/markOffline en presence.js) porque el valor corregido ya
// se devuelve acá mismo para el estado local — no hace falta bloquear la
// pantalla esperando a que la escritura termine.
function repairJoinedAtIfLegacy(uid, data) {
  if (typeof data?.joinedAt !== "string") return data;
  const creationTime = auth.currentUser?.metadata?.creationTime;
  if (!creationTime) return data;
  const repaired = Timestamp.fromDate(new Date(creationTime));
  setDoc(doc(db, "users", uid), { joinedAt: repaired }, { merge: true }).catch(() => {});
  return { ...data, joinedAt: repaired };
}

// Hallazgo H1 (2026-10-24): los datos personales del registro y los
// ajustes privados viven en users/{uid}/private/data (solo el dueño los
// lee), no en users/{uid}. Tu propio perfil necesita los dos documentos
// juntos (ProfileAbout, interruptor de sonidos), así que se leen los dos
// y se mezclan en el estado local "user". Los campos no se repiten: las
// cuentas viejas se migraron con scripts/migrate-private-profile.js y
// firestore.rules no deja volver a escribirlos en el documento público.
async function loadOwnProfile(uid) {
  const [publicSnap, privateSnap] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDoc(doc(db, "users", uid, "private", "data")),
  ]);
  if (!publicSnap.exists()) return null;
  const data = { ...publicSnap.data(), ...(privateSnap.exists() ? privateSnap.data() : {}) };
  return repairJoinedAtIfLegacy(uid, data);
}

export default function AuthProfile({ onOpenProfile, onOpenSaved }) {
  const { t } = useLanguage();
  // profile | identity (editar)
  const [step, setStep] = useState("profile");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  // Carga tu perfil (público + privado). Root.jsx ya garantiza que hay
  // sesión y que users/{uid} existe.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) return;
      const profile = await loadOwnProfile(firebaseUser.uid);
      if (profile) setUser(profile);
    });
    return unsub;
  }, []);

  const handleIdentitySubmit = async ({ displayName, identity, bio, datingPreference }) => {
    setLoading(true);
    setError("");
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // Al editar no se reenvían los datos personales: no tocarlos deja
    // intactos los que ya están guardados (país, fecha de nacimiento, etc.).
    const profileUpdate = {
      displayName,
      identity,
      bio: bio || "",
      datingPreference: datingPreference || "",
      // Timestamp, no string (ver joinedAt en AuthScreen.jsx).
      identityUpdatedAt: serverTimestamp(),
    };

    try {
      // FIREBASE: firestore write (real) - guarda el perfil en Firestore.
      await setDoc(doc(db, "users", uid), profileUpdate, { merge: true });
      // serverTimestamp() escribe bien en Firestore, pero devuelve un
      // sentinel (FieldValue) sin .toDate() — reflejarlo tal cual en el
      // estado local deja a formatMonthYear/formatLongDate sin nada que
      // formatear (ni Timestamp ni string) hasta el próximo getDoc real
      // (recién en el siguiente login/recarga). Timestamp.now() sí es un
      // Timestamp real con .toDate(), usado SOLO para esta actualización
      // optimista local — lo que se escribió en Firestore no cambia.
      setUser({ ...user, ...profileUpdate, identityUpdatedAt: Timestamp.now() });
      setStep("profile");
    } catch (err) {
      setError(t("errors.profileSaveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePrivacy = async (newValue) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setUser({ ...user, isPrivate: newValue });
    try {
      // FIREBASE: firestore write (real) - guarda la preferencia de
      // privacidad. Solo este campo, nunca el objeto "user" entero: ese
      // estado local también tiene los datos de private/data (ver
      // loadOwnProfile), que no deben volver al documento público.
      await setDoc(doc(db, "users", uid), { isPrivate: newValue }, { merge: true });
    } catch (err) {
      setUser(user); // revierte si falla
      return;
    }
    try {
      // Hallazgo H2: sincroniza la copia guardada en cada post existente
      // (ver syncPostsPrivacyField arriba). Si esto falla, la preferencia
      // ya quedó guardada igual — los posts viejos pueden quedar
      // desincronizados temporalmente hasta el próximo toggle, no hace
      // falta revertir el cambio que el usuario sí pidió.
      await syncPostsPrivacyField(uid, "authorIsPrivate", newValue);
    } catch (err) {
      // silencioso a propósito, ver comentario de arriba.
    }
  };

  const handleToggleWallPrivacy = async (newValue) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setUser({ ...user, isWallPrivate: newValue });
    try {
      // FIREBASE: firestore write (real) - guarda la preferencia de muro
      // privado (solo este campo, ver handleTogglePrivacy).
      await setDoc(doc(db, "users", uid), { isWallPrivate: newValue }, { merge: true });
    } catch (err) {
      setUser(user); // revierte si falla
      return;
    }
    try {
      // Hallazgo H2 — ver el comentario en handleTogglePrivacy de arriba.
      await syncPostsPrivacyField(uid, "authorIsWallPrivate", newValue);
    } catch (err) {
      // silencioso a propósito, ver comentario de arriba.
    }
  };

  // Interruptor general de sonidos (2026-07-29): a diferencia de
  // isPrivate/isWallPrivate, no hay ningún otro documento que sincronizar
  // — SoundContext.jsx ya escucha users/{uid}/private/data en vivo y
  // actualiza el flag interno de sound.js apenas cambia este campo.
  const handleToggleSoundMuted = async (newValue) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setUser({ ...user, soundMuted: newValue });
    try {
      await setDoc(doc(db, "users", uid, "private", "data"), { soundMuted: newValue }, { merge: true });
    } catch (err) {
      setUser(user); // revierte si falla
    }
  };

  const handleUnblock = async (targetUid) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // FIREBASE: firestore write (real) - borra el documento en blocks/
    // (ver Blocks.js). La lista de "Usuarios bloqueados" se actualiza sola
    // vía useMyBlocks (onSnapshot en vivo), no hace falta estado optimista.
    await unblockUser(uid, targetUid);
  };

  const handleLogout = async () => {
    // Marca "offline" ANTES de cerrar sesión: una vez cerrada, la
    // escritura ya no pasaría las reglas de Firestore (exigen estar
    // autenticado) — ver presence.js.
    await markOffline(auth.currentUser?.uid);
    // FIREBASE: auth (real) - cierra la sesión. Root.jsx ve que ya no hay
    // sesión y vuelve a la pantalla de entrada.
    await signOut(auth);
  };

  if (!user) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, textAlign: "center", color: "var(--text-muted)" }}>
          {t("common.loading")}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {step === "identity" && (
          <IdentityForm
            onSubmit={handleIdentitySubmit}
            loading={loading}
            initialValues={user}
            isEdit
            error={error}
          />
        )}
        {step === "profile" && (
          <ProfileView
            user={user}
            uid={auth.currentUser?.uid}
            onLogout={handleLogout}
            onEdit={() => setStep("identity")}
            onTogglePrivacy={handleTogglePrivacy}
            onToggleWallPrivacy={handleToggleWallPrivacy}
            onToggleSoundMuted={handleToggleSoundMuted}
            onUnblock={handleUnblock}
            onOpenProfile={onOpenProfile}
            onOpenSaved={onOpenSaved}
          />
        )}
      </div>
    </div>
  );
}
