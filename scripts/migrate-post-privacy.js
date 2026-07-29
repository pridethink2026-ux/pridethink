// scripts/migrate-post-privacy.js
//
// Migración ÚNICA (auditoría de seguridad, 2026-07-28, hallazgo H2).
//
// Por qué hace falta: los posts NUEVOS ya guardan una copia de
// isPrivate/isWallPrivate del autor en el momento de publicar
// (authorIsPrivate/authorIsWallPrivate — ver el docstring de Feed.jsx y
// syncPostsPrivacyField en AuthProfile.jsx), pero los posts que YA
// EXISTÍAN antes de este cambio no tienen esos dos campos. Como el Paso 4
// de este mismo hallazgo agrega where("authorIsPrivate", "==", false) a
// las consultas del muro, y Firestore NO matchea documentos donde el
// campo simplemente no existe, hace falta que TODOS los posts (no solo
// los de usuarios privados) tengan el campo puesto explícitamente antes
// de publicar esa regla nueva — si no, los posts de usuarios con perfil
// público también desaparecerían del muro.
//
// Qué hace: recorre TODA la colección "users" una vez, arma un mapa
// uid -> { isPrivate, isWallPrivate }, y con eso recorre TODA la
// colección "posts" y le pone a cada uno authorIsPrivate/
// authorIsWallPrivate según su autor (false si el usuario no tiene el
// campo o no existe más). Se salta los posts que YA tienen ambos campos
// puestos, así que es seguro correrlo más de una vez sin gastar cuota de
// más.
//
// Se corre UNA sola vez, a mano, con el SDK de administrador (que
// bypassa firestore.rules por diseño — es el mismo mecanismo que ya usa
// la consola de Firebase). Requiere una credencial de cuenta de
// servicio:
//
//   1. Firebase console -> ⚙️ Configuración del proyecto -> Cuentas de
//      servicio -> "Generar nueva clave privada" -> se descarga un .json.
//   2. Guardalo como scripts/serviceAccountKey.json (ese nombre exacto,
//      ya está en .gitignore — NUNCA se sube al repo, da acceso TOTAL
//      al proyecto).
//   3. Desde la carpeta del proyecto: node scripts/migrate-post-privacy.js
//   4. Cuando termine, podés borrar scripts/serviceAccountKey.json si
//      querés (no hace falta para nada más de la app).

// firebase-admin@14 reemplazó la API vieja namespaced (admin.initializeApp,
// admin.credential.cert, admin.firestore()) por una API modular, igual que
// el SDK de cliente — no hay "admin.credential" en esta versión.
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
} catch (err) {
  console.error(
    "No encontré scripts/serviceAccountKey.json. Seguí los pasos del comentario al" +
      " principio de este archivo para descargar la credencial desde Firebase console."
  );
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);
const BATCH_SIZE = 500; // límite máximo de un writeBatch en Firestore

async function commitInChunks(docsToUpdate) {
  let updated = 0;
  for (let i = 0; i < docsToUpdate.length; i += BATCH_SIZE) {
    const chunk = docsToUpdate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
    updated += chunk.length;
    console.log(`  ...${updated}/${docsToUpdate.length} posts actualizados`);
  }
  return updated;
}

async function main() {
  console.log("Leyendo la colección users...");
  const usersSnap = await db.collection("users").get();
  const privacyByUid = new Map();
  usersSnap.forEach((userDoc) => {
    const data = userDoc.data();
    privacyByUid.set(userDoc.id, {
      isPrivate: !!data.isPrivate,
      isWallPrivate: !!data.isWallPrivate,
    });
  });
  console.log(`  ${usersSnap.size} usuarios leídos.`);

  console.log("Leyendo la colección posts...");
  const postsSnap = await db.collection("posts").get();
  console.log(`  ${postsSnap.size} posts leídos.`);

  const toUpdate = [];
  let alreadyMigrated = 0;
  let orphanPosts = 0; // posts cuyo autor ya no existe (cuenta borrada a mano, etc.)

  postsSnap.forEach((postDoc) => {
    const data = postDoc.data();
    const alreadyHasFields =
      typeof data.authorIsPrivate === "boolean" && typeof data.authorIsWallPrivate === "boolean";
    if (alreadyHasFields) {
      alreadyMigrated += 1;
      return;
    }
    // Los posts de grupo SIEMPRE van en false/false, sin importar la
    // privacidad real del autor (corrección posterior a la primera
    // corrida de este script, cuando currentUid.isPrivate/isWallPrivate
    // eran 0 en los 5 usuarios de prueba, así que no cambió ningún dato
    // ya migrado): los grupos son públicos por diseño, la privacidad
    // personal no se extiende al contenido de un grupo — ver el mismo
    // criterio en GroupView.jsx (handlePost).
    const isGroupPost = !!data.groupId;
    const authorPrivacy = privacyByUid.get(data.authorId);
    if (!authorPrivacy) orphanPosts += 1;
    toUpdate.push({
      ref: postDoc.ref,
      data: {
        authorIsPrivate: isGroupPost ? false : authorPrivacy ? authorPrivacy.isPrivate : false,
        authorIsWallPrivate: isGroupPost ? false : authorPrivacy ? authorPrivacy.isWallPrivate : false,
      },
    });
  });

  console.log(
    `\n${toUpdate.length} posts necesitan migrarse (${alreadyMigrated} ya tenían los campos puestos).`
  );
  if (orphanPosts > 0) {
    console.log(
      `  ${orphanPosts} de esos posts son de un authorId que ya no existe en users/ -- se migran con false/false (mismo criterio que una cuenta pública nunca-privada).`
    );
  }

  const updatedCount = toUpdate.length > 0 ? await commitInChunks(toUpdate) : 0;

  const usersWithPrivate = [...privacyByUid.values()].filter((p) => p.isPrivate).length;
  const usersWithWallPrivate = [...privacyByUid.values()].filter((p) => p.isWallPrivate).length;

  console.log("\n=== Migración terminada ===");
  console.log(`Usuarios revisados: ${usersSnap.size}`);
  console.log(`  con isPrivate = true: ${usersWithPrivate}`);
  console.log(`  con isWallPrivate = true: ${usersWithWallPrivate}`);
  console.log(`Posts revisados: ${postsSnap.size}`);
  console.log(`  ya tenían los campos (sin tocar): ${alreadyMigrated}`);
  console.log(`  actualizados ahora: ${updatedCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error durante la migración:", err);
    process.exit(1);
  });
