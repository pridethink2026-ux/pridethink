# Contexto del proyecto: Pridethink

App social para la comunidad LGBTQ+ centrada en identidad libre: los usuarios
escriben o eligen su propia etiqueta de identidad en vez de elegir de
categorías fijas. Prototipo funcional en fase de prueba con un socio.

## Stack técnico

- **Frontend:** React (Create React App)
- **Backend:** Firebase Auth (correo/contraseña) + Firestore (base de datos en tiempo real)
- **Hosting:** Vercel, plan Hobby (gratis) — desplegado en `https://pridethink.vercel.app`
- **Repositorio:** GitHub, `pridethink2026-ux/pridethink`, rama `main`
- **Carpeta local:** `C:\Users\HP\pridethink`

## Estructura de archivos (todo en `src/`)

- `firebase.js` — configuración e inicialización de Firebase (auth, db exportados)
- `themes.js` — sistema de temas visuales: define las paletas (variables CSS) y las funciones para aplicar/guardar/leer el tema y calcular el tema "Rotativo"
- `App.js` — navegación principal (pestañas Perfil / Muro / Chat + logo + botón 🎨 de temas + campanita de notificaciones)
- `AuthProfile.jsx` — login/registro, perfil de usuario, cambio de identidad, privacidad
- `Feed.jsx` — muro social (posts, likes, comentarios, editar/borrar)
- `Chat.jsx` — mensajería en tiempo real entre usuarios
- `Notifications.jsx` — campanita de notificaciones (likes, comentarios, mensajes)
- `public/logo-icon.png`, `logo192.png`, `logo512.png`, `favicon.ico` — logo de la marca

## Estructura de datos en Firestore

- `users/{uid}` → `{ email, displayName, identity, joinedAt, identityUpdatedAt, isPrivate, blockedUsers: [uid...] }`
- `posts/{postId}` → `{ authorId, authorName, authorIdentity, text, createdAt, likes: [uid...] }`
- `posts/{postId}/comments/{commentId}` → `{ authorId, authorName, authorIdentity, text, createdAt }`
  - El conteo de comentarios NO se guarda como campo aparte: se escucha la subcolección en tiempo real y se cuenta directo, para que nunca se desincronice.
- `chats/{chatId}/messages/{msgId}` → mensaje de texto: `{ senderId, text, createdAt }`; mensaje de nota de voz: `{ senderId, type: "audio", audioData, audioDuration, createdAt }` (chatId = los dos UID ordenados y unidos con "_")
  - `audioData` es el audio codificado en base64 (formato webm/opus, ~32kbps) guardado directo en el documento — no se usa Firebase Storage. Con el límite de 60 segundos de grabación pesa ~300KB como máximo, bien por debajo del límite de 1MB por documento de Firestore.
- `notifications/{uid}/items/{itemId}` → `{ type: 'like'|'comment'|'message', fromUid, fromName, fromIdentity, createdAt, read }`

## Funcionalidades ya construidas

1. Registro/login real con Firebase Auth
2. Sesión persistente (no vuelve al login al recargar)
3. Cambiar identidad libremente cuando quieras (con historial de última actualización)
4. Perfil privado (oculta tus posts y tu presencia en el chat de otros usuarios)
5. Muro social: publicar, dar like (❤️), comentar, editar y borrar tus propios posts
6. Chat en tiempo real entre usuarios, con buscador y bloqueo mutuo de usuarios
7. Diseño responsivo del chat: una columna a la vez en móvil (con botón "volver"), lado a lado en escritorio
8. Notificaciones en tiempo real (like, comentario, mensaje nuevo) con campanita y contador de no leídas
9. Logo de la marca en la pantalla de login y en el encabezado de navegación (responsivo, sin superponerse en móvil)
10. Temas visuales rotativos: botón 🎨 junto a la campanita abre un menú para elegir entre 4 temas — "Noche Violeta 🌙" (el original), "Arcoíris 🌈", "Océano 🌊" y "Atardecer 🌅" — o el modo "Rotativo 🔄", que cambia de tema automáticamente según el día del año. La preferencia se guarda en `localStorage` y se aplica al cargar la app seteando variables CSS (`--bg`, `--surface`, `--accent`, etc.) en `document.documentElement`, así que toda la app cambia de color al instante sin recargar.
11. Notas de voz en el chat: botón 🎤 junto al campo de texto graba audio (MediaRecorder, webm/opus, ~32kbps) con indicador de grabación y contador de tiempo, corta sola a los 60 segundos, y se puede cancelar o enviar. Se guarda en base64 dentro del propio documento del mensaje en Firestore (sin Firebase Storage). Los mensajes de audio se muestran con un reproductor simple (play/pausa + duración).

## Pendientes / ideas para seguir

- **Foto de perfil real** — requiere Firebase Storage, que a su vez requiere activar el plan Blaze (pago por uso) en el proyecto de Firebase con una tarjeta de respaldo (el uso normal seguiría siendo gratis dentro de los límites). Se decidió posponer esto.
- **Tienda (Stripe, modo test)** — parte del plan original, aún no iniciada.
- Posibles mejoras futuras: reportar usuarios (moderación), lista de conversaciones recientes en el chat (actualmente solo se ve la lista completa de personas), previsualización de quién te bloqueó explicado al usuario, etc.

## Notas importantes de configuración

- Firestore está en **modo de prueba** (test mode) desde su creación — las reglas de seguridad abiertas expiran automáticamente 30 días después de creado el proyecto. Si en algún momento deja de funcionar la lectura/escritura, revisar esto primero.
- **CUIDADO con imports no usados en el código**: Vercel compila con `CI=true`, lo que convierte cualquier advertencia de ESLint (como una importación no utilizada) en un error que **rompe el despliegue por completo**, aunque en el navegador local (`npm start`) solo se vea como advertencia amarilla sin problema. Esto ya causó que 5 despliegues seguidos fallaran en silencio sin que se notara hasta revisar el dashboard de Vercel. Cualquier cambio de código debe revisarse contra esto antes de hacer `git push`.
- **Colores del código = variables CSS, no valores fijos**: desde que se agregó el sistema de temas, ningún archivo (`App.js`, `AuthProfile.jsx`, `Chat.jsx`, `Feed.jsx`, `Notifications.jsx`) usa colores hex/rgba fijos ni una constante `THEME` local — todos usan `var(--bg)`, `var(--surface)`, `var(--accent2)`, etc. Si se agrega una pantalla o componente nuevo, debe seguir el mismo patrón para que respete el tema activo. Las paletas viven únicamente en `src/themes.js`.
- El dueño del proyecto (Rorby) prefiere comunicación en español y un enfoque guiado paso a paso; no tiene experiencia previa de programación, así que las instrucciones deben ser explícitas y sin dar por sentado conocimiento técnico.
- Flujo de publicación establecido: editar código → probar en local con `npm start` → confirmar que funciona → `git add . && git commit -m "..." && git push` → Vercel despliega automático → revisar pestaña "Deployments" en vercel.com para confirmar que quedó "Ready" (no "Error").
