/*
  profileFields.js
  ----------------
  Lógica pura (sin JSX) COMPARTIDA sobre los datos personales del registro
  (país, idioma, género, fecha de nacimiento). Vive en su propio archivo
  porque la usan dos lugares: `AuthProfile.jsx` (paso 2 del registro,
  `PersonalDataForm`) y `ProfileAbout.jsx` (sección "Acerca de" del perfil,
  propio y público) — mismo patrón que `identityStyles.js` para no repetir
  listas ni funciones entre componentes.

  - getCountryOptions(locale) / COUNTRY_CODES: lista de países (código ISO
    + nombre en el idioma pedido).
  - LANGUAGE_OPTIONS: idiomas soportados por la app, con su nombre legible.
  - getGenderOptions(t): opciones de género con etiqueta traducida (el
    VALOR guardado en Firestore es un código fijo que no cambia con el
    idioma).
  - calculateAge(birthDateLike): edad exacta a partir de una fecha (acepta
    tanto un string "YYYY-MM-DD" como un objeto Date, p. ej. el resultado
    de `Timestamp.toDate()`).
  - MIN_SIGNUP_AGE: edad mínima para registrarse.
*/

export const MIN_SIGNUP_AGE = 18;

// Códigos ISO 3166-1 alpha-2 de países. Los nombres se generan con
// Intl.DisplayNames (ver getCountryOptions), así que agregar un país nuevo
// es tan simple como sumar su código acá; no hay que escribir el nombre a
// mano ni mantenerlo traducido.
export const COUNTRY_CODES = [
  // América
  "AR", "BO", "BR", "CA", "CL", "CO", "CR", "CU", "DO", "EC", "SV", "US",
  "GT", "GY", "HT", "HN", "JM", "MX", "NI", "PA", "PY", "PE", "PR", "SR",
  "TT", "UY", "VE", "AG", "BS", "BB", "BZ", "DM", "GD", "KN", "LC", "VC",
  // Europa
  "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE",
  "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI", "LT",
  "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU",
  "SM", "RS", "SK", "SI", "ES", "SE", "CH", "UA", "GB", "VA",
  // África
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG",
  "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN",
  "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ",
  "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD",
  "TZ", "TG", "TN", "UG", "ZM", "ZW",
  // Asia y Medio Oriente
  "AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CN", "GE", "IN", "ID",
  "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MY", "MV",
  "MN", "MM", "NP", "KP", "OM", "PK", "PS", "PH", "QA", "SA", "SG", "KR",
  "LK", "SY", "TW", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ", "VN", "YE",
  "HK", "MO",
  // Oceanía
  "AU", "FJ", "KI", "MH", "FM", "NR", "NZ", "PW", "PG", "WS", "SB", "TO",
  "TV", "VU",
];

// Convierte los códigos de arriba en { code, name } en el idioma pedido
// (Intl.DisplayNames), ordenados alfabéticamente por nombre. El campo que
// se GUARDA siempre es el código ISO (no el nombre), así que el país
// queda igual sin importar en qué idioma se registró o se mira la persona.
// Si el navegador no soporta Intl.DisplayNames (muy poco probable hoy),
// cae a mostrar el código tal cual.
export function getCountryOptions(locale) {
  let displayNames = null;
  try {
    displayNames = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    displayNames = null;
  }
  return COUNTRY_CODES.map((code) => ({
    code,
    name: displayNames ? displayNames.of(code) || code : code,
  })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

// Nombre legible de un solo país (para mostrar uno ya guardado, sin
// construir la lista completa de ~190 países solo para buscar uno).
export function getCountryName(code, locale) {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

export const LANGUAGE_OPTIONS = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

// El VALOR de cada género es un código fijo (no cambia con el idioma, así
// el dato guardado en Firestore es siempre el mismo); solo la ETIQUETA que
// se muestra se traduce.
export function getGenderOptions(t) {
  return [
    { value: "mujer", label: t("personal.genderWoman") },
    { value: "hombre", label: t("personal.genderMan") },
    { value: "no_binario", label: t("personal.genderNonBinary") },
    { value: "prefiero_no_decir", label: t("personal.genderPreferNotToSay") },
    { value: "otro", label: t("personal.genderOther") },
  ];
}

// Edad exacta (no solo restar años) a partir de una fecha: solo cuenta el
// cumpleaños de este año si ya pasó (o es hoy). Acepta un string
// "YYYY-MM-DD" (como devuelve un <input type="date">) o un objeto Date
// (como Timestamp.toDate() de Firestore) — new Date(x) entiende ambos.
export function calculateAge(birthDateLike) {
  if (!birthDateLike) return null;
  const birth = new Date(birthDateLike);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const yaCumplioEsteAno =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!yaCumplioEsteAno) age -= 1;
  return age;
}
