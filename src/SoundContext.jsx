import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { setSoundMuted } from "./sound";

/*
  SoundContext
  ------------
  Sincroniza sound.js (el flag interno que playThemeSound/playReactionSound/
  playCommentSound consultan antes de sonar) con
  users/{uid}/private/data.soundMuted en Firestore (hallazgo H1) — un solo listener para toda la app, mismo patrón que
  BlocksContext.jsx. No expone nada vía useContext: las funciones de
  sonido son funciones planas que se llaman desde manejadores de eventos
  (no desde el render de ningún componente), así que alcanza con mantener
  actualizado el flag interno de sound.js en vez de pasar el valor por
  props o por un contexto de React de verdad.
*/
export function SoundProvider({ children }) {
  const [currentUid, setCurrentUid] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUid(user ? user.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setSoundMuted(false);
      return;
    }
    // Hallazgo H1: soundMuted vive solo en users/{uid}/private/data (el
    // documento público ya no lo tiene y firestore.rules no deja escribirlo
    // ahí).
    const unsub = onSnapshot(doc(db, "users", currentUid, "private", "data"), (snap) => {
      setSoundMuted(!!snap.data()?.soundMuted);
    });
    return unsub;
  }, [currentUid]);

  return children;
}
