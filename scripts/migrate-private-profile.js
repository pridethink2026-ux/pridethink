// scripts/migrate-private-profile.js
//
// Migración del hallazgo H1 (2026-10-24): datos sensibles del perfil a una
// subcolección privada.
//
// Por qué hace falta: users/{uid} lo puede leer cualquier persona
// autenticada (y AllUsersContext.jsx lo descarga entero para TODOS los
// usuarios), así que los datos personales del registro viajaban a los
// clientes de todos los demás. El código nuevo ya los escribe en
// users/{uid}/private/data (solo el dueño lee), pero las cuentas que YA
// EXISTÍAN los siguen teniendo en el documento público.
//
// Qué hace, por cada usuario:
//   - COPIA a users/{uid}/private/data: fullName, birthDate, gender,
//     genderOther, country, language, soundMuted. Si private/data ya tiene
//     un valor para ese campo (ej. la persona cambió de idioma con el
//     código nuevo), NO se pisa: lo privado es lo más reciente.
//   - BORRA del documento público esos 7 campos más los dos heredados que
//     ya no usa nadie: email y blockedUsers.
//   - Usuarios ya limpios se saltan, así que es seguro correrlo varias
//     veces (se corre de nuevo después de publicar las reglas de la fase B).
//
// Uso (desde la carpeta del proyecto, con scripts/serviceAccountKey.json —
// ver los pasos en migrate-post-privacy.js):
//
//   node scripts/migrate-private-profile.js --dry-run
//       Solo reporta qué usuarios y qué campos cambiaría. No escribe nada.
//       Imprime NOMBRES de campos, nunca sus valores.
//
//   node scripts/migrate-private-profile.js
//       Antes de escribir, guarda un respaldo JSON con los valores
//       originales en scripts/backups/ (ignorada por .gitignore — el
//       script verifica eso con "git check-ignore" y se niega a seguir si
//       no lo está). Después migra y, al final, vuelve a leer la colección
//       y reporta cuántos usuarios siguen con algún campo sensible en el
//       documento público (tiene que dar 0).

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

// Se copian a private/data y se borran del documento público.
const FIELDS_TO_MOVE = [
  "fullName",
  "birthDate",
  "gender",
  "genderOther",
  "country",
  "language",
  "soundMuted",
];
// Solo se borran del documento público (ya nadie los lee).
const FIELDS_TO_DROP = ["email", "blockedUsers"];
const SENSITIVE_FIELDS = [...FIELDS_TO_MOVE, ...FIELDS_TO_DROP];

const BACKUP_DIR = path.join(__dirname, "backups");
const USERS_PER_BATCH = 250; // 2 escrituras por usuario, 500 = máximo de un batch

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

function sensitiveFieldsIn(data) {
  return SENSITIVE_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(data, f));
}

// Timestamp de Firestore -> objeto JSON legible y reconstruible a mano.
function toJsonValue(value) {
  if (value instanceof Timestamp) {
    return { __timestamp: value.toDate().toISOString() };
  }
  return value;
}

function assertBackupDirIsIgnored() {
  const probe = path.join(BACKUP_DIR, "probe.json");
  try {
    // Sale con código 0 solo si la ruta está ignorada.
    execSync(`git check-ignore -q "${probe}"`, { cwd: path.join(__dirname, ".."), stdio: "ignore" });
  } catch (err) {
    console.error(
      `La carpeta de respaldo (${BACKUP_DIR}) NO está ignorada por git. ` +
        "Agregá scripts/backups/ al .gitignore antes de correr la migración real."
    );
    process.exit(1);
  }
}

async function buildPlan() {
  console.log("Leyendo la colección users...");
  const usersSnap = await db.collection("users").get();
  console.log(`  ${usersSnap.size} usuarios leídos.`);

  const plan = [];
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const present = sensitiveFieldsIn(data);
    if (present.length === 0) continue;

    const privateRef = userDoc.ref.collection("private").doc("data");
    const privateSnap = await privateRef.get();
    const existingPrivate = privateSnap.exists ? privateSnap.data() : {};

    const toCopy = {};
    const keptPrivate = [];
    FIELDS_TO_MOVE.forEach((f) => {
      if (!Object.prototype.hasOwnProperty.call(data, f)) return;
      if (Object.prototype.hasOwnProperty.call(existingPrivate, f)) {
        keptPrivate.push(f);
      } else {
        toCopy[f] = data[f];
      }
    });

    plan.push({
      uid: userDoc.id,
      publicRef: userDoc.ref,
      privateRef,
      present,
      toCopy,
      keptPrivate,
      originalPublic: Object.fromEntries(present.map((f) => [f, data[f]])),
      originalPrivate: existingPrivate,
    });
  }
  return { total: usersSnap.size, plan };
}

function printPlan(plan) {
  plan.forEach((p) => {
    console.log(`\n  ${p.uid}`);
    console.log(`    se borran del documento público: ${p.present.join(", ")}`);
    const copied = Object.keys(p.toCopy);
    console.log(`    se copian a private/data: ${copied.length ? copied.join(", ") : "(ninguno)"}`);
    if (p.keptPrivate.length) {
      console.log(`    ya estaban en private/data (no se pisan): ${p.keptPrivate.join(", ")}`);
    }
  });
}

function writeBackup(plan) {
  assertBackupDirIsIgnored();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(BACKUP_DIR, `private-profile-${stamp}.json`);
  const backup = {};
  plan.forEach((p) => {
    backup[p.uid] = {
      public: Object.fromEntries(Object.entries(p.originalPublic).map(([k, v]) => [k, toJsonValue(v)])),
      private: Object.fromEntries(Object.entries(p.originalPrivate).map(([k, v]) => [k, toJsonValue(v)])),
    };
  });
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`\nRespaldo guardado en ${file}`);
}

async function commitPlan(plan) {
  let done = 0;
  for (let i = 0; i < plan.length; i += USERS_PER_BATCH) {
    const chunk = plan.slice(i, i + USERS_PER_BATCH);
    const batch = db.batch();
    chunk.forEach((p) => {
      if (Object.keys(p.toCopy).length > 0) {
        batch.set(p.privateRef, p.toCopy, { merge: true });
      }
      batch.update(
        p.publicRef,
        Object.fromEntries(p.present.map((f) => [f, FieldValue.delete()]))
      );
    });
    await batch.commit();
    done += chunk.length;
    console.log(`  ...${done}/${plan.length} usuarios migrados`);
  }
}

async function countPending() {
  const usersSnap = await db.collection("users").get();
  return usersSnap.docs.filter((d) => sensitiveFieldsIn(d.data()).length > 0).map((d) => d.id);
}

async function main() {
  const { total, plan } = await buildPlan();
  console.log(
    `\n${plan.length} de ${total} usuarios tienen algún campo sensible en el documento público.`
  );
  printPlan(plan);

  if (DRY_RUN) {
    console.log("\n=== DRY RUN: no se escribió nada ===");
    return;
  }

  if (plan.length > 0) {
    writeBackup(plan);
    console.log("\nMigrando...");
    await commitPlan(plan);
  }

  console.log("\nVerificando...");
  const pending = await countPending();
  console.log("\n=== Migración terminada ===");
  console.log(`Usuarios revisados: ${total}`);
  console.log(`Usuarios migrados ahora: ${plan.length}`);
  console.log(`Usuarios que SIGUEN con algún campo sensible en el documento público: ${pending.length}`);
  if (pending.length > 0) {
    console.log(`  ${pending.join(", ")}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error("Error durante la migración:", err);
    process.exit(1);
  });
