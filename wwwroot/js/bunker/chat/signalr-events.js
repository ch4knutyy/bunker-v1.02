window.BunkerSignalREvents = window.BunkerSignalREvents || {};
window.BunkerSignalREvents.chat = {
	RoomChatMessageReceived() { connection.off('RoomChatMessageReceived'); connection.on('RoomChatMessageReceived', renderRoomChatMessage); },
	RoomChatHistory() { connection.off('RoomChatHistory'); connection.on('RoomChatHistory', replaceRoomChatHistory); },
	RoomChatCompanionsUpdated() { connection.off('RoomChatCompanionsUpdated'); connection.on('RoomChatCompanionsUpdated', updateRoomChatControls); },
	RoomChatSettingsUpdated() { connection.off('RoomChatSettingsUpdated'); connection.on('RoomChatSettingsUpdated', data => { roomChatState.aiEnabled = data?.aiResponsesEnabled ?? data?.AiResponsesEnabled ?? true; updateRoomChatControls(); }); }
	, RoomChatAiStatus() { connection.off('RoomChatAiStatus'); connection.on('RoomChatAiStatus', updateRoomChatAiStatus); }
	, AiPresentationUpdated() { connection.off('AiPresentationUpdated'); connection.on('AiPresentationUpdated', updateAiPresentation); }
	, AiDiscussionRoundUpdated() { connection.off('AiDiscussionRoundUpdated'); connection.on('AiDiscussionRoundUpdated', updateAiDiscussionRound); }
};
