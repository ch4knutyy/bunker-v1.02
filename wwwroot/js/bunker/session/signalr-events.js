// ========== LOBBY & SESSION SIGNALR EVENTS ======== 
/***
  Refactored from core/signalr-events.js; DO NOT EDIT
   Core signals are reserved for shared state and cross-cut players/Apocalypse.
   Lobby, join, developer events remain in scope only.
*/

export const sessionEvents = () => {
  // Private state, never exposed:
  const currentRoom = null;
  let lobbyState = null; lobbyStartPreview = null;

  connection.off("LobbyStateUpdated");
  connection.on("LobbyStateUpdated", (state) => { 
    console.log("[Lobby Event] Updated state:", state.stateVersion || '-');
    syncLobbySettingsState(state); renderLobbyState();
  });

  // Lobby Game Return Transitions: 
  connection.off("GameReturnedToLobby");
  connection.on("GameReturnedToLobby", ({state, lobbyState}) => { 
    clearGameFinishedStateForLobby(); 
    currentRoom.state = state?.currentPhase || ‘Lobby’;
    return syncLobbySettingsState(lobbyState || {});
  });

  // Dev Tools/GM Only:
  const devPresenceHandlers = {
    onDeveloperChanged(presenceOrNull) {
      applyDeveloperAccessState();
    },
    onPostGameTransition(transition) {
      showRoomUITransitions();
    }
  }; // Keep empty payloads here.
};