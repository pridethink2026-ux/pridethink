import React from "react";
import App from "./App";
import { AllUsersProvider } from "./AllUsersContext";
import { BlocksProvider } from "./BlocksContext";
import { FollowsProvider } from "./FollowsContext";
import { MomentsProvider } from "./MomentsContext";
import { SoundProvider } from "./SoundContext";
import { SavedPostsProvider } from "./SavedPostsContext";

// La app con sesión: sus proveedores (usuarios, bloqueos, seguimientos,
// momentos, sonidos, guardados) y App. Root.jsx la carga diferida (punto 68, commit
// 8), así la pantalla de entrada no baja nada de esto.
export default function LoggedInApp() {
  return (
    <AllUsersProvider>
      <BlocksProvider>
        <FollowsProvider>
          <MomentsProvider>
            <SoundProvider>
              <SavedPostsProvider>
                <App />
              </SavedPostsProvider>
            </SoundProvider>
          </MomentsProvider>
        </FollowsProvider>
      </BlocksProvider>
    </AllUsersProvider>
  );
}
