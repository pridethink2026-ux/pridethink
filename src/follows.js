import { useEffect, useRef } from "react";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

/*
  follows.js
  ----------
  Fuga B (punto 82): "following" vive en users/{uid}, que lee cualquier
  autenticado, así que cualquiera podía ver a quién sigue un perfil
  privado. Se muda a su propia colección, mismo patrón que blocks
  (Blocks.js): un documento por seguimiento,

    follows/{followerUid}_{followedUid} →
      { follower, followed, followerIsPrivate, createdAt }

  "followerIsPrivate" es una copia de users/{follower}.isPrivate (mismo
  criterio que authorIsPrivate en los posts): firestore.rules deja leer
  la fila a las dos personas involucradas o, si quien sigue no es
  privado, a cualquiera — así las consultas siguen siendo demostrables.

  Commit 1 de 4 escribía las dos cosas; commit 2 pasó todas las lecturas a
  follows/ (FollowsContext.jsx). Desde el commit 3, follows/ es la única
  fuente de verdad: seguir/dejar de seguir escribe solo la fila, y el
  arreglo viejo se copia una última vez y se borra de users/{uid} al
  iniciar sesión (repairMyFollows), que es lo que cierra la fuga para esa
  cuenta.
*/

export function getFollowId(followerUid, followedUid) {
  return `${followerUid}_${followedUid}`;
}

export async function followUser(myUid, theirUid, myIsPrivate) {
  await setDoc(doc(db, "follows", getFollowId(myUid, theirUid)), {
    follower: myUid,
    followed: theirUid,
    followerIsPrivate: !!myIsPrivate,
    createdAt: serverTimestamp(),
  });
}

export async function unfollowUser(myUid, theirUid) {
  await deleteDoc(doc(db, "follows", getFollowId(myUid, theirUid)));
}

// Una vez por sesión: corrige followerIsPrivate en tus filas (por si
// falló syncFollowsPrivacy) y, si tu perfil todavía tiene el arreglo
// "following" (cuenta sin migrar, o una pestaña vieja que lo volvió a
// escribir), crea las filas que falten y recién después borra el arreglo
// — si algo falla antes, el arreglo queda y se reintenta al próximo
// inicio de sesión. Nunca borra filas: desde el commit 3 el arreglo ya no
// manda. En lotes de hasta 500, como syncPostsPrivacyField.
export async function repairMyFollows(myUid, legacyFollowing, myIsPrivate) {
  const wanted = new Set((legacyFollowing || []).filter((uid) => uid && uid !== myUid));
  const snap = await getDocs(query(collection(db, "follows"), where("follower", "==", myUid)));
  const ops = [];
  snap.docs.forEach((d) => {
    wanted.delete(d.data().followed);
    if (d.data().followerIsPrivate !== !!myIsPrivate) {
      ops.push((batch) => batch.update(d.ref, { followerIsPrivate: !!myIsPrivate }));
    }
  });
  wanted.forEach((followed) => {
    ops.push((batch) =>
      batch.set(doc(db, "follows", getFollowId(myUid, followed)), {
        follower: myUid,
        followed,
        followerIsPrivate: !!myIsPrivate,
        createdAt: serverTimestamp(),
      })
    );
  });
  for (let i = 0; i < ops.length; i += 500) {
    const batch = writeBatch(db);
    ops.slice(i, i + 500).forEach((op) => op(batch));
    await batch.commit();
  }
  if (legacyFollowing !== undefined) {
    await updateDoc(doc(db, "users", myUid), { following: deleteField() });
  }
}

// Al cambiar "perfil privado" (AuthProfile.jsx): actualiza la copia en
// todas tus filas. Va DESPUÉS de guardar users/{uid}.isPrivate, porque la
// regla compara contra ese valor.
export async function syncFollowsPrivacy(myUid, newValue) {
  const snap = await getDocs(query(collection(db, "follows"), where("follower", "==", myUid)));
  const docs = snap.docs.filter((d) => d.data().followerIsPrivate !== !!newValue);
  for (let i = 0; i < docs.length; i += 500) {
    const batch = writeBatch(db);
    docs.slice(i, i + 500).forEach((d) => batch.update(d.ref, { followerIsPrivate: !!newValue }));
    await batch.commit();
  }
}

// Una vez por sesión, apenas llega tu perfil (App.js). Si falla, no
// reintenta: lo hará el próximo inicio de sesión.
export function useFollowsMigration(myUid, myProfile) {
  const doneFor = useRef(null);
  useEffect(() => {
    if (!myUid || !myProfile || doneFor.current === myUid) return;
    doneFor.current = myUid;
    repairMyFollows(myUid, myProfile.following, myProfile.isPrivate).catch((err) =>
      console.error("follows: no se pudo reparar", err.code)
    );
  }, [myUid, myProfile]);
}
