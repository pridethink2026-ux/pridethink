import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCDondNdyUJqqERZkxa0XkNsr132Vs0j4Q",
  authDomain: "pridethink-prototipo.firebaseapp.com",
  projectId: "pridethink-prototipo",
  storageBucket: "pridethink-prototipo.firebasestorage.app",
  messagingSenderId: "796269545095",
  appId: "1:796269545095:web:660430210bb2701e391a22",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);