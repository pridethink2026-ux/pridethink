// scripts/backfill-notification-expiry.js
//
// Relleno ÚNICO (punto 64, 2026-10-24): "expireAt" en notificaciones viejas.
//
// Por qué hace falta: la política TTL de Firestore (grupo de colecciones
// "items", campo "expireAt") borra sola cada notificación 30 días después
// de creada. Las notificaciones NUEVAS ya traen "expireAt" (notify() en
// src/utils.js), pero las que YA EXISTÍAN no — y la TTL ignora los
// documentos sin ese campo, así que nunca se borrarían.
//
// Qué hace: recorre el grupo de colecciones "items" y, SOLO para los
// documentos de notifications/{uid}/items (nunca savedPosts/{uid}/items
// ni savedProducts/{uid}/items, que comparten el nombre "items" — si
// tuvieran "expireAt", la TTL los borraría), les pone
// expireAt = createdAt + 30 días (o "ahora + 30 días" si no tienen un
// createdAt válido). Se salta las que ya tienen "expireAt", así que es
// seguro correrlo más de una vez. No borra nada ni hace falta respaldo:
// solo agrega un campo.
//
// Uso (desde la carpeta del proyecto, con scripts/serviceAccountKey.json —
// ver los pasos en migrate-post-privacy.js):
//
//   node scripts/backfill-notification-expiry.js --dry-run
//       Solo reporta números. No escribe nada.
//
//   node scripts/backfill-notification-expiry.js
//       Rellena y reporta lo mismo. Nunca imprime uids ni contenido.

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // mismo plazo que NOTIFICATION_TTL_MS en src/utils.js
const BATCH_SIZE = 500; // límite máximo de un writeBatch en Firestore

const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
} catch (err) {
  console.error(
    "No encontré scripts/serviceAccountKey.json. Seguí los pasos del comentario al" +
      " principio de migrate-post-privacy.js para descargar la credencial desde Firebase console."
  );
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

// notifications/{uid}/items/{id}: el padre de "items" es el documento
// {uid}, y el padre de ese documento es la colección "notifications".
function isNotification(ref) {
  const ownerDoc = ref.parent.parent;
  return !!ownerDoc && ownerDoc.parent.id === "notifications" && !ownerDoc.parent.parent;
}

async function commitInChunks(toUpdate) {
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(({ ref, expireAt }) => batch.update(ref, { expireAt }));
    await batch.commit();
    updated += chunk.length;
    console.log(`  ...${updated}/${toUpdate.length} notificaciones actualizadas`);
  }
  return updated;
}

async function main() {
  console.log('Leyendo el grupo de colecciones "items"...');
  const snap = await db.collectionGroup("items").get();
  console.log(`  ${snap.size} documentos leídos.`);

  const nowMs = Date.now();
  const toUpdate = [];
  let notifications = 0;
  let alreadyHave = 0;
  let ignoredOther = 0; // savedPosts/savedProducts (u otra colección "items")
  let withoutCreatedAt = 0;
  let alreadyExpired = 0;

  snap.forEach((d) => {
    if (!isNotification(d.ref)) {
      ignoredOther += 1;
      return;
    }
    notifications += 1;
    const data = d.data();
    if (data.expireAt instanceof Timestamp) {
      alreadyHave += 1;
      return;
    }
    let baseMs;
    if (data.createdAt instanceof Timestamp) {
      baseMs = data.createdAt.toMillis();
    } else {
      baseMs = nowMs;
      withoutCreatedAt += 1;
    }
    const expireMs = baseMs + TTL_MS;
    if (expireMs <= nowMs) alreadyExpired += 1;
    toUpdate.push({ ref: d.ref, expireAt: Timestamp.fromMillis(expireMs) });
  });

  console.log(`\nNotificaciones: ${notifications}`);
  console.log(`  ya tienen expireAt (sin tocar): ${alreadyHave}`);
  console.log(`  a rellenar: ${toUpdate.length}`);
  console.log(`    sin createdAt válido (se usa "ahora + 30 días"): ${withoutCreatedAt}`);
  console.log(
    `    quedarían YA vencidas (creadas hace más de 30 días — la TTL las borra dentro de ~24 h): ${alreadyExpired}`
  );
  console.log(`Documentos "items" que NO son notificaciones (ignorados): ${ignoredOther}`);

  if (DRY_RUN) {
    console.log("\n=== DRY RUN: no se escribió nada ===");
    return;
  }

  const updated = toUpdate.length > 0 ? await commitInChunks(toUpdate) : 0;
  console.log("\n=== Relleno terminado ===");
  console.log(`Notificaciones actualizadas ahora: ${updated}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error durante el relleno:", err);
    process.exit(1);
  });
