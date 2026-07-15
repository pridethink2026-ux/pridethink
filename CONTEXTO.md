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
- `utils.js` — helpers compartidos: `useIsMobile`, `notify()` (crear notificaciones), `timeAgo()` (tiempo relativo en español), `extractHashtags()` / `splitTextWithHashtags()` (hashtags)
- `Avatar.jsx` — círculo con iniciales sobre gradiente de color determinista por uid (mismo usuario = mismo color siempre). Tamaños `sm`/`md`/`lg`. Se usa en el muro, comentarios, chat, notificaciones, búsqueda y perfil
- `App.js` — navegación principal: barra superior en escritorio (Perfil / Muro / Chat / Buscar + botón 🎨 de temas + campanita), barra inferior fija en móvil (Muro / Buscar / Chat / Avisos / Perfil), y el enrutamiento a perfiles públicos (`UserProfile`)
- `AuthProfile.jsx` — login/registro, TU perfil (cambio de identidad, privacidad)
- `UserProfile.jsx` — perfil PÚBLICO de cualquier usuario (avatar grande, contadores de seguidores/seguidos, sus publicaciones, botón seguir)
- `Feed.jsx` — muro social (posts, likes, comentarios, editar/borrar, hashtags, pestañas Todos/Siguiendo). Exporta también `PostCard`, reutilizado por `UserProfile.jsx`
- `Search.jsx` — buscador de personas y publicaciones
- `Chat.jsx` — mensajería en tiempo real entre usuarios, con notas de voz
- `Notifications.jsx` — lógica y UI de notificaciones: hook `useNotifications`, campanita de escritorio (default export) y `NotificationsScreen` (pantalla completa para la barra inferior en móvil)
- `public/logo-icon.png`, `logo192.png`, `logo512.png`, `favicon.ico` — logo de la marca

## Estructura de datos en Firestore

- `users/{uid}` → `{ email, displayName, identity, joinedAt, identityUpdatedAt, isPrivate, blockedUsers: [uid...], following: [uid...] }`
  - `following` es nuevo: la lista de uids que ESTE usuario sigue (mismo patrón que `blockedUsers`, con `arrayUnion`/`arrayRemove`). Los seguidores de alguien NO se guardan aparte: se derivan en tiempo real con una consulta `where("following", "array-contains", uid)` sobre toda la colección `users`.
- `posts/{postId}` → `{ authorId, authorName, authorIdentity, text, createdAt, likes: [uid...], hashtags: ["..."] }`
  - `hashtags` es nuevo: se detectan automáticamente del texto al publicar o editar (`utils.extractHashtags`), guardados en minúsculas y sin duplicados.
- `posts/{postId}/comments/{commentId}` → `{ authorId, authorName, authorIdentity, text, createdAt }`
  - El conteo de comentarios NO se guarda como campo aparte: se escucha la subcolección en tiempo real y se cuenta directo, para que nunca se desincronice. Lo mismo aplica a seguidores (contados en vivo) y a la pestaña "Siguiendo" del muro (filtrada en el momento, no guardada).
- `chats/{chatId}/messages/{msgId}` → mensaje de texto: `{ senderId, text, createdAt }`; mensaje de nota de voz: `{ senderId, type: "audio", audioData, audioDuration, createdAt }` (chatId = los dos UID ordenados y unidos con "_")
  - `audioData` es el audio codificado en base64 (formato webm/opus, ~32kbps) guardado directo en el documento — no se usa Firebase Storage. Con el límite de 60 segundos de grabación pesa ~300KB como máximo, bien por debajo del límite de 1MB por documento de Firestore.
- `notifications/{uid}/items/{itemId}` → `{ type: 'like'|'comment'|'message'|'follow', fromUid, fromName, fromIdentity, createdAt, read }`
  - `'follow'` es nuevo: se crea cuando alguien te empieza a seguir.

## Funcionalidades ya construidas

1. Registro/login real con Firebase Auth
2. Sesión persistente (no vuelve al login al recargar)
3. Cambiar identidad libremente cuando quieras (con historial de última actualización)
4. Perfil privado (oculta tus posts y tu presencia en el chat de otros usuarios; en tu perfil público solo se ve un aviso, sin publicaciones)
5. Muro social: publicar, dar like (❤️ con animación de "latido"), comentar, editar y borrar tus propios posts
6. Chat en tiempo real entre usuarios, con buscador y bloqueo mutuo de usuarios
7. Diseño responsivo del chat: una columna a la vez en móvil (con botón "volver"), lado a lado en escritorio
8. Notificaciones en tiempo real (like, comentario, mensaje, seguidor nuevo) con campanita/pantalla y contador de no leídas
9. Logo de la marca en la pantalla de login y en el encabezado de navegación (responsivo, sin superponerse en móvil)
10. Temas visuales rotativos: botón 🎨 junto a la campanita abre un menú para elegir entre 4 temas — "Noche Violeta 🌙" (el original), "Arcoíris 🌈", "Océano 🌊" y "Atardecer 🌅" — o el modo "Rotativo 🔄", que cambia de tema automáticamente según el día del año. La preferencia se guarda en `localStorage` y se aplica al cargar la app seteando variables CSS (`--bg`, `--surface`, `--accent`, etc.) en `document.documentElement`, así que toda la app cambia de color al instante sin recargar.
11. Notas de voz en el chat: botón 🎤 junto al campo de texto graba audio (MediaRecorder, webm/opus, ~32kbps) con indicador de grabación y contador de tiempo, corta sola a los 60 segundos, y se puede cancelar o enviar. Se guarda en base64 dentro del propio documento del mensaje en Firestore (sin Firebase Storage). Los mensajes de audio se muestran con un reproductor simple (play/pausa + duración).
12. **Avatares con iniciales**: componente `Avatar.jsx` reutilizable — círculo con 1-2 iniciales sobre un gradiente de color determinista según el uid (mismo usuario, mismo color, siempre, en toda la app), en tamaños chico/mediano/grande.
13. **Tarjetas de publicación rediseñadas**: avatar + nombre + identidad + tiempo relativo en español ("hace 5 min", "hace 2 h", "ayer", o fecha si es más vieja).
14. **Navegación tipo app**: en móvil, barra de navegación fija inferior (Muro / Buscar / Chat / Avisos / Perfil) con puntito rojo en Avisos si hay notificaciones sin leer; en escritorio se conserva la barra superior con pestañas + campanita. Transición suave (fundido) al cambiar de vista.
15. **Skeletons de carga**: rectángulos con efecto shimmer mientras llegan las publicaciones del muro por primera vez.
16. **Perfiles públicos**: al tocar el avatar o el nombre de cualquier persona (muro, comentarios, chat, notificaciones, búsqueda) se abre su perfil — avatar grande, nombre, identidad, fecha de registro, contadores de seguidores/seguidos, y sus publicaciones (reutilizando el mismo `PostCard` del muro, con like/comentarios funcionando igual). Respeta bloqueo (en cualquier dirección, no se puede ver el perfil) y privacidad (se ve lo mínimo con un aviso). Botón "Volver" que regresa a la pestaña donde estabas.
17. **Seguir usuarios**: botón Seguir/Dejar de seguir en cualquier perfil público (nunca en el tuyo). Notifica al usuario seguido. En el muro, pestañas "Todos" / "Siguiendo" para filtrar solo publicaciones de gente que sigues.
18. **Hashtags**: se detectan automáticamente al publicar o editar un post (`#loquesea`) y se muestran como texto clickeable en color de acento; al tocar uno se filtra el muro por ese hashtag, con un chip visible para quitar el filtro.
19. **Búsqueda**: pantalla dedicada (ícono 🔍 en la navegación) que busca, entre lo ya cargado, personas por nombre y publicaciones por texto o `#hashtag`. Excluye usuarios bloqueados y perfiles privados de los resultados. Los resultados de personas abren su perfil público.

## Pendientes / ideas para seguir

- **Foto de perfil real** — requiere Firebase Storage, que a su vez requiere activar el plan Blaze (pago por uso) en el proyecto de Firebase con una tarjeta de respaldo (el uso normal seguiría siendo gratis dentro de los límites). Se decidió posponer esto; por ahora los avatares son iniciales sobre color generado, no fotos.
- **Tienda (Stripe, modo test)** — parte del plan original, aún no iniciada.
- Posibles mejoras futuras: reportar usuarios (moderación), lista de conversaciones recientes en el chat (actualmente solo se ve la lista completa de personas), previsualización de quién te bloqueó explicado al usuario, hashtags clickeables también dentro del perfil público (hoy solo filtran desde el muro), solicitudes de seguimiento para perfiles privados (hoy seguir es siempre directo, sin aprobación).

## Notas importantes de configuración

- Firestore está en **modo de prueba** (test mode) desde su creación — las reglas de seguridad abiertas expiran automáticamente 30 días después de creado el proyecto. Si en algún momento deja de funcionar la lectura/escritura, revisar esto primero.
- **CUIDADO con imports no usados en el código**: Vercel compila con `CI=true`, lo que convierte cualquier advertencia de ESLint (como una importación no utilizada) en un error que **rompe el despliegue por completo**, aunque en el navegador local (`npm start`) solo se vea como advertencia amarilla sin problema. Esto ya causó que 5 despliegues seguidos fallaran en silencio sin que se notara hasta revisar el dashboard de Vercel. Cualquier cambio de código debe revisarse contra esto antes de hacer `git push`.
- **Colores del código = variables CSS, no valores fijos**: ningún archivo de pantalla (`App.js`, `AuthProfile.jsx`, `UserProfile.jsx`, `Chat.jsx`, `Feed.jsx`, `Search.jsx`, `Notifications.jsx`) usa colores hex/rgba fijos — todos usan `var(--bg)`, `var(--surface)`, `var(--accent2)`, etc. Si se agrega una pantalla o componente nuevo, debe seguir el mismo patrón para que respete el tema activo. Las paletas viven únicamente en `src/themes.js`.
  - **Única excepción intencional**: `Avatar.jsx` genera colores con HSL a partir de un hash del uid (para que cada persona tenga SIEMPRE el mismo color de identidad, sin importar el tema activo) y usa texto blanco fijo para garantizar contraste contra cualquier tono generado. Está documentado en un comentario dentro del propio archivo.
- **Conteos derivados, nunca guardados**: comentarios por post, seguidores por usuario, y la pestaña "Siguiendo" del muro se calculan siempre en tiempo real desde Firestore (subcolecciones o consultas `array-contains`/filtro en el cliente), nunca como un campo numérico aparte. Así nunca pueden desincronizarse.
- El dueño del proyecto (Rorby) prefiere comunicación en español y un enfoque guiado paso a paso; no tiene experiencia previa de programación, así que las instrucciones deben ser explícitas y sin dar por sentado conocimiento técnico.
- Flujo de publicación establecido: editar código → probar en local con `npm start` → confirmar que funciona → `git add . && git commit -m "..." && git push` → Vercel despliega automático → revisar pestaña "Deployments" en vercel.com para confirmar que quedó "Ready" (no "Error").
