import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCDondNdyUJqqERZkxa0XkNsr132Vs0j4Q",
  authDomain: "pridethink-prototipo.firebaseapp.com",
  projectId: "pridethink-prototipo",
  storageBucket: "pridethink-prototipo.firebasestorage.app",
  messagingSenderId: "796269545095",
  appId: "1:796269545095:web:660430210bb2701e391a22",
};

const app = initializeApp(firebaseConfig);

// initializeAuth en vez de getAuth: misma persistencia que getAuth (la
// sesión guardada sigue valiendo), pero sin popupRedirectResolver, que al
// cargar la página baja el iframe /__/auth/iframe de firebaseapp.com. Solo
// hace falta para iniciar sesión con ventana emergente o redirección
// (Google, etc.); la app usa solo correo y contraseña. Si algún día se
// agrega, pasar browserPopupRedirectResolver a la llamada que lo use.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});
export const db = getFirestore(app);
export const storage = getStorage(app);