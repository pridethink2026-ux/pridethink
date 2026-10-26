import React from "react";
import App from "./App";
import { AllUsersProvider } from "./AllUsersContext";
import { BlocksProvider } from "./BlocksContext";
import { MomentsProvider } from "./MomentsContext";
import { SoundProvider } from "./SoundContext";

// La app con sesión: sus proveedores (usuarios, bloqueos, momentos,
// sonidos) y App. Root.jsx la carga diferida (punto 68, commit 8), así la
// pantalla de entrada no baja nada de esto.
export default function LoggedInApp() {
  return (
    <AllUsersProvider>
      <BlocksProvider>
        <MomentsProvider>
          <SoundProvider>
            <App />
          </SoundProvider>
        </MomentsProvider>
      </BlocksProvider>
    </AllUsersProvider>
  );
}
