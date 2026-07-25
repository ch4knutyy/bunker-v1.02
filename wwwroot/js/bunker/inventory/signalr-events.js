// Inventory SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.inventory = {
	AdditionalInventoryGranted() {
		connection.off("AdditionalInventoryGranted");
		connection.on("AdditionalInventoryGranted", function (data) {
			console.log("Additional inventory granted:", data);
			const grants = data.grants || data.Grants || [];
			const receivedItems = [];

			grants.forEach(grant => {
				const connId = grant.connectionId || grant.ConnectionId;
				const stableId = grant.stablePlayerId || grant.StablePlayerId || "";
				const inventory = grant.inventory || grant.Inventory;
				const item = grant.item || grant.Item || {};
				const itemName = getLocalizedValue(item, 'item') || getLocalizedValue(item, 'name') || grant.itemName || grant.ItemName || item.name || item.Name || t('unknown');
				const normalizedInventory = normalizeInventoryData(inventory);

				let playerKey = connId;
				if (!roomPlayers[playerKey] && stableId) {
					playerKey = Object.keys(roomPlayers).find(key => roomPlayers[key]?.stablePlayerId === stableId) || connId;
				}

				if (roomPlayers[playerKey]) {
					roomPlayers[playerKey].revealedSources = roomPlayers[playerKey].revealedSources || {};
					roomPlayers[playerKey].revealedData = roomPlayers[playerKey].revealedData || {};
					roomPlayers[playerKey].revealedTooltips = roomPlayers[playerKey].revealedTooltips || {};

					if (grant.isInventoryRevealed || grant.IsInventoryRevealed) {
						roomPlayers[playerKey].revealedSources.inventory = inventory;
						roomPlayers[playerKey].revealedData.inventory = normalizedInventory.items
							.map(inventoryItem => getLocalizedValue(inventoryItem, 'item') || getLocalizedValue(inventoryItem, 'name') || inventoryItem.name)
							.filter(Boolean)
							.join(', ');
					}
				}

				const isMine = connId === myConnectionId || (stableId && roomPlayers[myConnectionId]?.stablePlayerId === stableId);
				if (isMine && myPlayerData) {
					myPlayerData.inventory = normalizedInventory;
					receivedItems.push(itemName);
				}
			});

			applyRoundState(data.roundState || data.RoundState);
			renderCurrentGameUI();

			if (receivedItems.length > 0) {
				addEventMessage(`<span class="event-success">📦 Ви отримали додатковий інвентар:</span> ${receivedItems.join(', ')}`);
			} else if (grants.length > 0) {
				addEventMessage(`<span class="event-success">📦 Активні гравці отримали додатковий інвентар після 3 раунду.</span>`);
			}
		});
	}
};
