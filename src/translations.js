/*
  translations.js
  ---------------
  Textos FIJOS de la interfaz (botones, labels, títulos, mensajes de error,
  estados vacíos) en español e inglés, para las pantallas principales:
  login/registro, nav, muro, perfil, chat, notificaciones.

  Esto NO traduce contenido generado por los usuarios (posts, comentarios,
  identidad libre, nombre) — ese texto se guarda y se muestra tal cual lo
  escribió cada persona, sin importar el idioma de la interfaz.

  Formato: un objeto plano por idioma, con claves "seccion.nombre" (no hace
  falta que la clave sea un identificador válido de JS, es solo un string).
  Los valores pueden tener placeholders "{variable}" que se reemplazan con
  translate() cuando hace falta meter un dato dinámico (p.ej. el nombre de
  quien te mandó una notificación) sin traducir ESE dato.

  CÓMO AGREGAR UN TEXTO NUEVO:
  1. Agrega la clave con su texto en español dentro de `es` y su traducción
     dentro de `en` (mismo nombre de clave en los dos).
  2. En el componente, usa `t("tu.clave")` (el hook `useLanguage()` de
     LanguageContext.jsx te da la función `t`). Si el texto necesita un dato
     dinámico, escribe `{loQueSea}` en el texto y llama
     `t("tu.clave", { loQueSea: valor })`.
  3. Si el texto es contenido escrito por un usuario (post, comentario,
     identidad, nombre), NO pasa por acá: se muestra tal cual está guardado.
*/

export const DEFAULT_LANGUAGE = "es";

export const translations = {
  es: {
    // Genérico, usado en más de una pantalla
    "common.loading": "Cargando...",

    // Navegación (App.js)
    "nav.wall": "Muro",
    "nav.search": "Buscar",
    "nav.chat": "Chat",
    "nav.profile": "Perfil",
    "nav.alerts": "Avisos",
    "nav.themeRotating": "Rotativo",

    // Login (LoginForm, dentro de AuthProfile.jsx)
    "login.eyebrowBack": "Bienvenido de vuelta",
    "login.eyebrowSignupStep1": "Paso 1 de 3",
    "login.titleLogin": "Entra a tu espacio",
    "login.titleSignup": "Sé lo que quieras ser",
    "login.subtitleLogin": "Ingresa con tu correo y contraseña.",
    "login.subtitleSignup": "Sin cajas, sin etiquetas impuestas. Empieza creando tu cuenta.",
    "login.emailLabel": "Correo",
    "login.emailPlaceholder": "nombre@correo.com",
    "login.passwordLabel": "Contraseña",
    "login.passwordPlaceholder": "Mínimo 6 caracteres",
    "login.forgotPassword": "¿Olvidaste tu contraseña?",
    "login.submitWait": "Un momento...",
    "login.submitLogin": "Entrar",
    "login.submitSignup": "Crear cuenta",
    "login.noAccount": "¿No tienes cuenta?",
    "login.signupLink": "Regístrate",
    "login.hasAccount": "¿Ya tienes cuenta?",
    "login.loginLink": "Entra",

    // Recuperar contraseña (ResetPasswordForm)
    "reset.eyebrow": "Recuperar acceso",
    "reset.title": "¿Olvidaste tu contraseña?",
    "reset.subtitle":
      "Escribe el correo con el que te registraste. Te mandaremos un enlace para crear una contraseña nueva.",
    "reset.success":
      "Te enviamos un correo para restablecer tu contraseña, revisa también spam.",
    "reset.sending": "Enviando...",
    "reset.submit": "Enviar enlace",
    "reset.backLink": "← Volver a entrar",

    // Registro, paso 2: Datos personales (PersonalDataForm)
    "personal.back": "← Atrás",
    "personal.eyebrow": "Paso 2 de 3",
    "personal.title": "Cuéntanos un poco de ti",
    "personal.subtitle":
      "Estos datos nos ayudan a mantener Pridethink como un espacio seguro. Tu identidad libre la eliges en el siguiente paso.",
    "personal.fullNameLabel": "Nombre completo",
    "personal.fullNamePlaceholder": "Tu nombre y apellido",
    "personal.birthDateLabel": "Fecha de nacimiento",
    "personal.countryLabel": "País",
    "personal.countryPlaceholder": "Selecciona tu país",
    "personal.languageLabel": "Idioma preferido",
    "personal.genderLabel": "Género",
    "personal.genderPlaceholder": "Selecciona una opción",
    "personal.genderOtherLabel": "Cuéntanos cuál",
    "personal.genderOtherPlaceholder": "Escribe tu género",
    "personal.genderWoman": "Mujer",
    "personal.genderMan": "Hombre",
    "personal.genderNonBinary": "No binario",
    "personal.genderPreferNotToSay": "Prefiero no decir",
    "personal.genderOther": "Otro",
    "personal.termsCheckbox":
      "Acepto que soy mayor de 18 años y los términos de uso de Pridethink.",
    "personal.submitWait": "Un momento...",
    "personal.submit": "Continuar",
    "personal.invalidBirthDate": "Ingresa una fecha de nacimiento válida.",
    "personal.underage": "Debes ser mayor de 18 años para crear una cuenta en Pridethink.",

    // Registro, paso 3 / editar identidad (IdentityForm)
    "identity.eyebrowEdit": "Tu identidad de hoy",
    "identity.eyebrowSignupStep3": "Paso 3 de 3",
    "identity.titleEdit": "¿Cómo te sientes hoy?",
    "identity.titleSignup": "¿Qué eres tú?",
    "identity.subtitleEdit":
      "Cámbiala cuantas veces quieras, cuando quieras. Hoy puedes ser algo distinto a ayer.",
    "identity.subtitleSignup":
      "No elijas una casilla. Escribe lo que sientes que eres — puede ser una de estas ideas o algo completamente tuyo.",
    "identity.displayNameLabel": "Nombre para mostrar",
    "identity.displayNamePlaceholder": "Como quieres que te vean",
    "identity.identityLabel": "Tu identidad",
    "identity.identityLabelToday": "de hoy",
    "identity.identityPlaceholder": "Escribe lo que eres...",
    "identity.submitSaving": "Guardando...",
    "identity.submitUpdate": "Actualizar mi identidad",
    "identity.submitSave": "Guardar mi identidad",
    "identity.suggestion.cat": "Gato",
    "identity.suggestion.squirrel": "Ardilla",
    "identity.suggestion.free": "Libre",
    "identity.suggestion.king": "Rey",
    "identity.suggestion.queen": "Reina",
    "identity.suggestion.creator": "Creador",
    "identity.suggestion.fox": "Zorro",
    "identity.suggestion.phoenix": "Fenix",

    // Perfil (ProfileView / BlockedUserRow, dentro de AuthProfile.jsx)
    "profile.followers": "Seguidores",
    "profile.following": "Siguiendo",
    "profile.emailField": "Correo",
    "profile.identityField": "Identidad",
    "profile.lastUpdated": "Última actualización",
    "profile.memberSince": "Miembro desde",
    "profile.privateProfile": "Perfil privado",
    "profile.privateOn":
      "No apareces en el chat ni tus publicaciones son visibles para otros.",
    "profile.privateOff": "Apareces en el chat y tus publicaciones son públicas.",
    "profile.language": "Idioma",
    "profile.privateWall": "Muro privado",
    "profile.privateWallHint":
      "Solo oculta tus publicaciones cuando alguien visita tu perfil; el resto de tu información sigue visible.",
    "profile.blockedUsers": "Usuarios bloqueados",
    "profile.blockedEmpty": "No has bloqueado a nadie.",
    "profile.unblock": "Desbloquear",
    "profile.changeIdentity": "Cambiar mi identidad",
    "profile.logout": "Cerrar sesión",
    "profile.defaultUser": "Usuario",
    "profile.about": "Acerca de",
    "profile.fullNameField": "Nombre completo",
    "profile.countryField": "País",
    "profile.languageField": "Idioma",
    "profile.genderField": "Género",
    "profile.birthDateField": "Nacimiento",
    "profile.birthDateWithAge": "{date} ({age} años)",

    // Reacciones (Reactions.jsx, compartido entre Feed.jsx y Chat.jsx)
    "reaction.like": "Me gusta",
    "reaction.applause": "Aplauso",
    "reaction.fire": "Fuego",
    "reaction.pride": "Orgullo",
    "reaction.funny": "Me divierte",

    // Muro (Feed.jsx)
    "feed.composerPlaceholder": "¿Qué estás pensando o sintiendo? Usa #hashtags si quieres",
    "feed.posting": "Publicando...",
    "feed.postButton": "Publicar",
    "feed.tabAll": "Todos",
    "feed.tabFollowing": "Siguiendo",
    "feed.edit": "Editar",
    "feed.delete": "Borrar",
    "feed.save": "Guardar",
    "feed.cancelEdit": "Cancelar",
    "feed.like": "Me gusta",
    "feed.comment": "Comentar",
    "feed.commentPlaceholder": "Escribe un comentario...",
    "feed.send": "Enviar",
    "feed.deleteConfirm": "¿Borrar esta publicación? No se puede deshacer.",
    "feed.loginNotice": "Inicia sesión primero para ver el muro.",
    "feed.emptyDefault": "Todavía no hay publicaciones. ¡Sé el primero!",
    "feed.emptyHashtag": "Nadie ha publicado con #{hashtag} todavía.",
    "feed.emptyFollowing": "Sigue a alguien para ver sus publicaciones aquí.",
    "feed.savePost": "Guardar publicación",
    "feed.unsavePost": "Quitar de guardados",
    "feed.sharePost": "Compartir por chat",

    // Guardados (SavedPosts.jsx)
    "saved.title": "Guardados",
    "saved.backLink": "← Volver",
    "saved.openButton": "Ver guardados",
    "saved.empty": "Todavía no guardaste ninguna publicación.",
    "saved.loginNotice": "Inicia sesión primero para ver tus guardados.",

    // Publicación individual (PostView.jsx)
    "postView.backLink": "← Volver",
    "postView.loading": "Cargando publicación...",
    "postView.notFound": "Esta publicación ya no existe.",
    "postView.blocked": "No puedes ver esta publicación.",

    // Chat (Chat.jsx)
    "chat.peopleHeader": "Personas",
    "chat.searchPlaceholder": "Buscar por nombre o identidad...",
    "chat.noSearchResults": "Nadie coincide con tu búsqueda.",
    "chat.noContacts": "Todavía no hay más personas registradas.",
    "chat.defaultName": "Sin nombre",
    "chat.block": "Bloquear",
    "chat.unblock": "Desbloquear",
    "chat.messagePlaceholder": "Escribe un mensaje...",
    "chat.recordVoice": "Grabar nota de voz",
    "chat.send": "Enviar",
    "chat.recording": "Grabando nota de voz...",
    "chat.recordingReady": "Nota de voz lista",
    "chat.cancel": "Cancelar",
    "chat.sendVoice": "Enviar nota de voz",
    "chat.emptyState": "Elige a alguien de la lista para empezar a chatear.",
    "chat.loginNotice": "Inicia sesión primero para usar el chat.",
    "chat.playAudio": "Reproducir",
    "chat.pauseAudio": "Pausar",
    "chat.noMicSupport": "Tu navegador no soporta grabación de audio.",
    "chat.micPermissionError":
      "No se pudo acceder al micrófono. Revisa los permisos del navegador.",
    "chat.audioTooLarge":
      "La nota de voz quedó muy pesada para enviarse. Intenta con una más corta.",
    "chat.audioSendError": "No se pudo enviar la nota de voz. Intenta de nuevo.",
    "chat.shareModalTitle": "Compartir por chat",
    "chat.shareSent": "¡Compartido!",
    "chat.sharedPostLabel": "Publicación compartida",
    "chat.sharedPostUnavailable": "Esta publicación ya no está disponible.",

    // Notificaciones (Notifications.jsx)
    "notifications.empty": "Todavía no tienes notificaciones.",
    "notifications.title": "Notificaciones",
    "notifications.loginNotice": "Inicia sesión primero para ver tus notificaciones.",
    "notifications.like": "{name} le dio like a tu publicación",
    "notifications.comment": "{name} comentó tu publicación",
    "notifications.message": "{name} te envió un mensaje",
    "notifications.follow": "{name} empezó a seguirte",
    "notifications.generic": "Notificación",

    // Errores de Firebase Auth (login/registro/recuperar contraseña)
    "errors.auth/email-already-in-use": "Ya existe una cuenta con ese correo.",
    "errors.auth/invalid-email": "El correo no es válido.",
    "errors.auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "errors.auth/user-not-found": "Correo o contraseña incorrectos.",
    "errors.auth/wrong-password": "Correo o contraseña incorrectos.",
    "errors.auth/invalid-credential": "Correo o contraseña incorrectos.",
    "errors.auth/too-many-requests": "Demasiados intentos. Espera un momento e intenta de nuevo.",
    "errors.generic": "Ocurrió un error. Intenta de nuevo.",
    "errors.reset.auth/invalid-email": "Ese correo no tiene un formato válido.",
    "errors.reset.auth/missing-email": "Escribe tu correo para poder enviarte el enlace.",
    "errors.reset.auth/user-not-found": "No encontramos ninguna cuenta con ese correo.",
    "errors.reset.auth/too-many-requests":
      "Demasiados intentos. Espera un momento e intenta de nuevo.",
    "errors.reset.generic": "No se pudo enviar el correo. Intenta de nuevo.",
    "errors.profileSaveFailed": "No se pudo guardar tu perfil. Intenta de nuevo.",

    // Reportar publicaciones/usuarios (ReportButton.jsx)
    "report.action": "Reportar",
    "report.reasonLabel": "Motivo",
    "report.reasonPlaceholder": "Selecciona un motivo",
    "report.reasonSpam": "Spam",
    "report.reasonHateSpeech": "Discurso de odio",
    "report.reasonHarassment": "Acoso",
    "report.reasonInappropriate": "Contenido inapropiado",
    "report.reasonImpersonation": "Suplantación de identidad",
    "report.reasonOther": "Otro",
    "report.detailsLabel": "Cuéntanos más (opcional)",
    "report.detailsPlaceholder": "Describe qué está pasando...",
    "report.submit": "Enviar reporte",
    "report.submitting": "Enviando...",
    "report.success": "Gracias, revisaremos tu reporte.",
    "report.alreadyReported": "Ya habías reportado esto. Gracias de todas formas.",
    "report.error": "No se pudo enviar el reporte. Intenta de nuevo.",
    "report.close": "Cerrar",
    "report.cancel": "Cancelar",
  },
  en: {
    // Generic, used across more than one screen
    "common.loading": "Loading...",

    // Nav (App.js)
    "nav.wall": "Wall",
    "nav.search": "Search",
    "nav.chat": "Chat",
    "nav.profile": "Profile",
    "nav.alerts": "Alerts",
    "nav.themeRotating": "Rotating",

    // Login (LoginForm, inside AuthProfile.jsx)
    "login.eyebrowBack": "Welcome back",
    "login.eyebrowSignupStep1": "Step 1 of 3",
    "login.titleLogin": "Enter your space",
    "login.titleSignup": "Be whatever you want to be",
    "login.subtitleLogin": "Sign in with your email and password.",
    "login.subtitleSignup": "No boxes, no imposed labels. Start by creating your account.",
    "login.emailLabel": "Email",
    "login.emailPlaceholder": "name@email.com",
    "login.passwordLabel": "Password",
    "login.passwordPlaceholder": "At least 6 characters",
    "login.forgotPassword": "Forgot your password?",
    "login.submitWait": "One moment...",
    "login.submitLogin": "Sign in",
    "login.submitSignup": "Create account",
    "login.noAccount": "Don't have an account?",
    "login.signupLink": "Sign up",
    "login.hasAccount": "Already have an account?",
    "login.loginLink": "Sign in",

    // Forgot password (ResetPasswordForm)
    "reset.eyebrow": "Recover access",
    "reset.title": "Forgot your password?",
    "reset.subtitle":
      "Enter the email you signed up with. We'll send you a link to create a new password.",
    "reset.success": "We sent you an email to reset your password — check spam too.",
    "reset.sending": "Sending...",
    "reset.submit": "Send link",
    "reset.backLink": "← Back to sign in",

    // Signup, step 2: Personal data (PersonalDataForm)
    "personal.back": "← Back",
    "personal.eyebrow": "Step 2 of 3",
    "personal.title": "Tell us a bit about yourself",
    "personal.subtitle":
      "This information helps us keep Pridethink a safe space. You'll choose your free identity in the next step.",
    "personal.fullNameLabel": "Full name",
    "personal.fullNamePlaceholder": "Your first and last name",
    "personal.birthDateLabel": "Date of birth",
    "personal.countryLabel": "Country",
    "personal.countryPlaceholder": "Select your country",
    "personal.languageLabel": "Preferred language",
    "personal.genderLabel": "Gender",
    "personal.genderPlaceholder": "Select an option",
    "personal.genderOtherLabel": "Tell us which",
    "personal.genderOtherPlaceholder": "Write your gender",
    "personal.genderWoman": "Woman",
    "personal.genderMan": "Man",
    "personal.genderNonBinary": "Non-binary",
    "personal.genderPreferNotToSay": "Prefer not to say",
    "personal.genderOther": "Other",
    "personal.termsCheckbox": "I confirm I'm over 18 and accept Pridethink's terms of use.",
    "personal.submitWait": "One moment...",
    "personal.submit": "Continue",
    "personal.invalidBirthDate": "Enter a valid date of birth.",
    "personal.underage": "You must be over 18 to create a Pridethink account.",

    // Signup, step 3 / edit identity (IdentityForm)
    "identity.eyebrowEdit": "Your identity today",
    "identity.eyebrowSignupStep3": "Step 3 of 3",
    "identity.titleEdit": "How do you feel today?",
    "identity.titleSignup": "What are you?",
    "identity.subtitleEdit":
      "Change it as many times as you want, whenever you want. Today you can be something different from yesterday.",
    "identity.subtitleSignup":
      "Don't pick a box. Write what you feel you are — it can be one of these ideas or something completely your own.",
    "identity.displayNameLabel": "Display name",
    "identity.displayNamePlaceholder": "How you want to be seen",
    "identity.identityLabel": "Your identity",
    "identity.identityLabelToday": "today",
    "identity.identityPlaceholder": "Write what you are...",
    "identity.submitSaving": "Saving...",
    "identity.submitUpdate": "Update my identity",
    "identity.submitSave": "Save my identity",
    "identity.suggestion.cat": "Cat",
    "identity.suggestion.squirrel": "Squirrel",
    "identity.suggestion.free": "Free",
    "identity.suggestion.king": "King",
    "identity.suggestion.queen": "Queen",
    "identity.suggestion.creator": "Creator",
    "identity.suggestion.fox": "Fox",
    "identity.suggestion.phoenix": "Phoenix",

    // Profile (ProfileView / BlockedUserRow, inside AuthProfile.jsx)
    "profile.followers": "Followers",
    "profile.following": "Following",
    "profile.emailField": "Email",
    "profile.identityField": "Identity",
    "profile.lastUpdated": "Last updated",
    "profile.memberSince": "Member since",
    "profile.privateProfile": "Private profile",
    "profile.privateOn": "You don't appear in chat and your posts aren't visible to others.",
    "profile.privateOff": "You appear in chat and your posts are public.",
    "profile.language": "Language",
    "profile.privateWall": "Private wall",
    "profile.privateWallHint":
      "Only hides your posts when someone visits your profile; the rest of your info stays visible.",
    "profile.blockedUsers": "Blocked users",
    "profile.blockedEmpty": "You haven't blocked anyone.",
    "profile.unblock": "Unblock",
    "profile.about": "About",
    "profile.fullNameField": "Full name",
    "profile.countryField": "Country",
    "profile.languageField": "Language",
    "profile.genderField": "Gender",
    "profile.birthDateField": "Born",
    "profile.birthDateWithAge": "{date} ({age} years old)",
    "profile.changeIdentity": "Change my identity",
    "profile.logout": "Log out",
    "profile.defaultUser": "User",

    // Reactions (Reactions.jsx, shared between Feed.jsx and Chat.jsx)
    "reaction.like": "Like",
    "reaction.applause": "Applause",
    "reaction.fire": "Fire",
    "reaction.pride": "Pride",
    "reaction.funny": "Funny",

    // Wall (Feed.jsx)
    "feed.composerPlaceholder": "What are you thinking or feeling? Use #hashtags if you want",
    "feed.posting": "Posting...",
    "feed.postButton": "Post",
    "feed.tabAll": "All",
    "feed.tabFollowing": "Following",
    "feed.edit": "Edit",
    "feed.delete": "Delete",
    "feed.save": "Save",
    "feed.cancelEdit": "Cancel",
    "feed.like": "Like",
    "feed.comment": "Comment",
    "feed.commentPlaceholder": "Write a comment...",
    "feed.send": "Send",
    "feed.deleteConfirm": "Delete this post? This can't be undone.",
    "feed.loginNotice": "Sign in first to see the wall.",
    "feed.emptyDefault": "No posts yet. Be the first!",
    "feed.emptyHashtag": "No one has posted with #{hashtag} yet.",
    "feed.emptyFollowing": "Follow someone to see their posts here.",
    "feed.savePost": "Save post",
    "feed.unsavePost": "Remove from saved",
    "feed.sharePost": "Share via chat",

    // Saved posts (SavedPosts.jsx)
    "saved.title": "Saved",
    "saved.backLink": "← Back",
    "saved.openButton": "View saved posts",
    "saved.empty": "You haven't saved any posts yet.",
    "saved.loginNotice": "Sign in first to see your saved posts.",

    // Single post view (PostView.jsx)
    "postView.backLink": "← Back",
    "postView.loading": "Loading post...",
    "postView.notFound": "This post no longer exists.",
    "postView.blocked": "You can't see this post.",

    // Chat (Chat.jsx)
    "chat.peopleHeader": "People",
    "chat.searchPlaceholder": "Search by name or identity...",
    "chat.noSearchResults": "No one matches your search.",
    "chat.noContacts": "No other people registered yet.",
    "chat.defaultName": "No name",
    "chat.block": "Block",
    "chat.unblock": "Unblock",
    "chat.messagePlaceholder": "Write a message...",
    "chat.recordVoice": "Record voice note",
    "chat.send": "Send",
    "chat.recording": "Recording voice note...",
    "chat.recordingReady": "Voice note ready",
    "chat.cancel": "Cancel",
    "chat.sendVoice": "Send voice note",
    "chat.emptyState": "Choose someone from the list to start chatting.",
    "chat.loginNotice": "Sign in first to use chat.",
    "chat.playAudio": "Play",
    "chat.pauseAudio": "Pause",
    "chat.noMicSupport": "Your browser doesn't support audio recording.",
    "chat.micPermissionError": "Couldn't access the microphone. Check your browser permissions.",
    "chat.audioTooLarge": "The voice note is too large to send. Try a shorter one.",
    "chat.audioSendError": "Couldn't send the voice note. Try again.",
    "chat.shareModalTitle": "Share via chat",
    "chat.shareSent": "Shared!",
    "chat.sharedPostLabel": "Shared post",
    "chat.sharedPostUnavailable": "This post is no longer available.",

    // Notifications (Notifications.jsx)
    "notifications.empty": "You don't have any notifications yet.",
    "notifications.title": "Notifications",
    "notifications.loginNotice": "Sign in first to see your notifications.",
    "notifications.like": "{name} liked your post",
    "notifications.comment": "{name} commented on your post",
    "notifications.message": "{name} sent you a message",
    "notifications.follow": "{name} started following you",
    "notifications.generic": "Notification",

    // Firebase Auth errors (login/signup/forgot password)
    "errors.auth/email-already-in-use": "An account with that email already exists.",
    "errors.auth/invalid-email": "That email isn't valid.",
    "errors.auth/weak-password": "Password must be at least 6 characters.",
    "errors.auth/user-not-found": "Incorrect email or password.",
    "errors.auth/wrong-password": "Incorrect email or password.",
    "errors.auth/invalid-credential": "Incorrect email or password.",
    "errors.auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "errors.generic": "Something went wrong. Try again.",
    "errors.reset.auth/invalid-email": "That email isn't a valid format.",
    "errors.reset.auth/missing-email": "Enter your email so we can send you the link.",
    "errors.reset.auth/user-not-found": "We couldn't find an account with that email.",
    "errors.reset.auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "errors.reset.generic": "Couldn't send the email. Try again.",
    "errors.profileSaveFailed": "Couldn't save your profile. Try again.",

    // Reporting posts/users (ReportButton.jsx)
    "report.action": "Report",
    "report.reasonLabel": "Reason",
    "report.reasonPlaceholder": "Select a reason",
    "report.reasonSpam": "Spam",
    "report.reasonHateSpeech": "Hate speech",
    "report.reasonHarassment": "Harassment",
    "report.reasonInappropriate": "Inappropriate content",
    "report.reasonImpersonation": "Impersonation",
    "report.reasonOther": "Other",
    "report.detailsLabel": "Tell us more (optional)",
    "report.detailsPlaceholder": "Describe what's going on...",
    "report.submit": "Send report",
    "report.submitting": "Sending...",
    "report.success": "Thanks, we'll review your report.",
    "report.alreadyReported": "You already reported this. Thanks anyway.",
    "report.error": "Couldn't send the report. Try again.",
    "report.close": "Close",
    "report.cancel": "Cancel",
  },
};

// Reemplaza placeholders "{variable}" en un texto ya traducido, p.ej.
// translate("es", "notifications.like", { name: "Ana" })
// -> "Ana le dio like a tu publicación"
export function translate(language, key, vars) {
  const dict = translations[language] || translations[DEFAULT_LANGUAGE];
  let text = dict[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([name, value]) => {
      text = text.replace(`{${name}}`, value);
    });
  }
  return text;
}
