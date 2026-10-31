import { useEffect, useRef } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
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

  Commit 1 de 4 (escritura doble): el arreglo users/{uid}.following sigue
  siendo la fuente de verdad y lo siguen leyendo todas las pantallas; acá
  solo se escribe, además, la fila de follows. Si esa segunda escritura
  falla (por ejemplo, reglas sin publicar), seguir/dejar de seguir
  funciona igual y reconcileMyFollows lo corrige al próximo inicio de
  sesión.
*/

export function getFollowId(followerUid, followedUid) {
  return `${followerUid}_${followedUid}`;
}

export async function followUser(myUid, theirUid, myIsPrivate) {
  await updateDoc(doc(db, "users", myUid), { following: arrayUnion(theirUid) });
  try {
    await setDoc(doc(db, "follows", getFollowId(myUid, theirUid)), {
      follower: myUid,
      followed: theirUid,
      followerIsPrivate: !!myIsPrivate,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("follows: no se pudo crear la fila", err.code);
  }
}

export async function unfollowUser(myUid, theirUid) {
  await updateDoc(doc(db, "users", myUid), { following: arrayRemove(theirUid) });
  try {
    await deleteDoc(doc(db, "follows", getFollowId(myUid, theirUid)));
  } catch (err) {
    console.error("follows: no se pudo borrar la fila", err.code);
  }
}

// Deja tus filas de follows iguales al arreglo "following": crea las que
// faltan, borra las que sobran y corrige followerIsPrivate. Es la
// migración (cada cuenta se migra sola al iniciar sesión, sin claves de
// administrador) y también repara cualquier escritura doble que haya
// fallado. En lotes de hasta 500, como syncPostsPrivacyField.
export async function reconcileMyFollows(myUid, following, myIsPrivate) {
  const wanted = new Set((following || []).filter((uid) => uid && uid !== myUid));
  const snap = await getDocs(query(collection(db, "follows"), where("follower", "==", myUid)));
  const ops = [];
  snap.docs.forEach((d) => {
    const followed = d.data().followed;
    if (!wanted.has(followed)) {
      ops.push((batch) => batch.delete(d.ref));
    } else {
      wanted.delete(followed);
      if (d.data().followerIsPrivate !== !!myIsPrivate) {
        ops.push((batch) => batch.update(d.ref, { followerIsPrivate: !!myIsPrivate }));
      }
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
    reconcileMyFollows(myUid, myProfile.following, myProfile.isPrivate).catch((err) =>
      console.error("follows: no se pudo migrar", err.code)
    );
  }, [myUid, myProfile]);
}
