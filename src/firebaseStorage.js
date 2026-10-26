import { getStorage } from "firebase/storage";
import { app } from "./firebase";

// Cloud Storage aparte de firebase.js (punto 68, commit 8): firebase.js lo
// usa la pantalla de entrada, y así el SDK de Storage (fotos, notas de
// voz, momentos) solo viaja en los archivos de la app con sesión.
export const storage = getStorage(app);
