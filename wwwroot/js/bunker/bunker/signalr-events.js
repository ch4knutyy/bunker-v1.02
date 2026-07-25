// Bunker SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.bunker = {
	BunkerCapacityUpdated() {
		connection.off("BunkerCapacityUpdated");
		connection.on("BunkerCapacityUpdated", function (data) {
			console.log("Bunker capacity updated:", data);
			const bunker = data.bunker || data.Bunker;
			const capacity = data.capacity ?? data.Capacity ?? getBunkerCapacityValue(bunker, currentBunkerCapacity);
			if (bunker) currentBunker = bunker;
			else if (currentBunker) {
				currentBunker.capacity = capacity;
				if ('Capacity' in currentBunker) currentBunker.Capacity = capacity;
			}
			currentBunkerCapacity = capacity;
			const input = document.getElementById('gmBunkerCapacity');
			if (input) input.value = capacity;
			setBunkerCapacityPending(false);
			const feedback = document.getElementById('gmBunkerCapacityFeedback');
			if (feedback) feedback.textContent = t('gmCapacitySaved');
			renderBunker(currentBunker);
			addEventMessage(`<span class="event-gm">GM</span> ${escapeHtml(t('capacity'))}: <strong>${escapeHtml(capacity)}</strong>`);
		});
	},

	BunkerCapacityRejected() {
		connection.off("BunkerCapacityRejected");
		connection.on("BunkerCapacityRejected", function (data) {
			currentBunkerCapacity = data.capacity ?? data.Capacity ?? currentBunkerCapacity;
			const input = document.getElementById('gmBunkerCapacity');
			if (input) input.value = currentBunkerCapacity;
			setBunkerCapacityPending(false);
			const feedback = document.getElementById('gmBunkerCapacityFeedback');
			if (feedback) feedback.textContent = t('gmCapacityInvalid');
		});
	},

	BunkerChanged() {
		connection.off("BunkerChanged");
		connection.on("BunkerChanged", function (data) {
			console.log("Bunker changed:", data);
			const bunker = data.bunker || data.Bunker || data;
			currentBunker = bunker;
			currentBunkerCapacity = getBunkerCapacityValue(bunker, currentBunkerCapacity);
			const capacityInput = document.getElementById('gmBunkerCapacity');
			if (capacityInput) capacityInput.value = currentBunkerCapacity;
			renderBunker(currentBunker);
			addEventMessage(`<span class="event-bunker">🏠 ${escapeHtml(t('bunker'))}:</span> ${escapeHtml(getLocalizedValue(bunker, 'name'))}`);
		});
	},

	BunkerUpdated() {
		connection.off("BunkerUpdated");
		connection.on("BunkerUpdated", function (data) {
			const bunker = data.bunker || data.Bunker;
			if (!bunker) return;
			currentBunker = bunker;
			currentBunkerCapacity = getBunkerCapacityValue(bunker, currentBunkerCapacity);
			renderBunker(currentBunker);
		});
	},

	BunkerIntelRevealed() {
		connection.off("BunkerIntelRevealed");
		connection.on("BunkerIntelRevealed", function (data) {
			const panel = document.getElementById('bunkerPanel');
			panel?.classList.add('bunker-intel-highlight');
			setTimeout(() => panel?.classList.remove('bunker-intel-highlight'), 2200);
			addEventMessage(`🔎 Відкрито нові дані бункера: ${escapeHtml(data.category || data.Category || '')}`);
		});
	},

	BunkerImageUpdated() {
		connection.off("BunkerImageUpdated");
		connection.on("BunkerImageUpdated", function (data) {
			console.log("[BunkerImageUpdated]", data);
			if (currentBunker && (currentBunker.id || currentBunker.Id) === (data.bunkerId || data.BunkerId)) {
				const imageUrl = data.imageUrl || data.ImageUrl || null;
				currentBunker.imageUrl = imageUrl;
				if ('ImageUrl' in currentBunker) currentBunker.ImageUrl = imageUrl;
				renderBunker(currentBunker);
				addEventMessage(`<span class="event-image">🖼️</span> Зображення бункера оновлено`);
			}
		});
	},

	BunkerImageRemoved() {
		connection.off("BunkerImageRemoved");
		connection.on("BunkerImageRemoved", function (data) {
			console.log("[BunkerImageRemoved]", data);
			if (currentBunker && (currentBunker.id || currentBunker.Id) === (data.bunkerId || data.BunkerId)) {
				currentBunker.imageUrl = null;
				if ('ImageUrl' in currentBunker) currentBunker.ImageUrl = null;
				renderBunker(currentBunker);
				addEventMessage(`<span class="event-image">🗑️</span> Зображення бункера видалено`);
			}
		});
	},

	BunkerSuppliesAdded() {
		connection.off("BunkerSuppliesAdded");
		connection.on("BunkerSuppliesAdded", function (data) {
			console.log("[BunkerSuppliesAdded]", data);

			if (currentBunker) {
				const supplies = data.totalSuppliesMonths ?? data.TotalSuppliesMonths;
				currentBunker.suppliesMonths = supplies;
				if ('SuppliesMonths' in currentBunker) currentBunker.SuppliesMonths = supplies;
				renderBunker(currentBunker);
			}

			addEventMessage(`<span class="event-success">📦 ${escapeHtml(t('supplies'))}: +${data.addedMonths} ${escapeHtml(t('bunkerMonths'))}</span>`);
		});
	},

	BunkerSuppliesRemoved() {
		connection.off("BunkerSuppliesRemoved");
		connection.on("BunkerSuppliesRemoved", function (data) {
			console.log("[BunkerSuppliesRemoved]", data);

			if (currentBunker) {
				const supplies = data.totalSuppliesMonths ?? data.TotalSuppliesMonths;
				currentBunker.suppliesMonths = supplies;
				if ('SuppliesMonths' in currentBunker) currentBunker.SuppliesMonths = supplies;
				renderBunker(currentBunker);
			}

			addEventMessage(`<span class="event-warning">📦 ${escapeHtml(t('supplies'))}: −${data.removedMonths} ${escapeHtml(t('bunkerMonths'))}</span>`);
		});
	},

	BunkerWaterAdded() {
		connection.off("BunkerWaterAdded");
		connection.on("BunkerWaterAdded", function (data) {
			if (currentBunker) {
				const water = data.totalWaterMonths ?? data.TotalWaterMonths;
				currentBunker.waterMonths = water;
				if ('WaterMonths' in currentBunker) currentBunker.WaterMonths = water;
				renderBunker(currentBunker);
			}
			addEventMessage(`<span class="event-success">💧 ${escapeHtml(t('water'))}: +${data.addedMonths} ${escapeHtml(t('bunkerMonths'))}</span>`);
		});
	},

	BunkerWaterRemoved() {
		connection.off("BunkerWaterRemoved");
		connection.on("BunkerWaterRemoved", function (data) {
			if (currentBunker) {
				const water = data.totalWaterMonths ?? data.TotalWaterMonths;
				currentBunker.waterMonths = water;
				if ('WaterMonths' in currentBunker) currentBunker.WaterMonths = water;
				renderBunker(currentBunker);
			}
			addEventMessage(`<span class="event-warning">💧 ${escapeHtml(t('water'))}: −${data.removedMonths} ${escapeHtml(t('bunkerMonths'))}</span>`);
		});
	}
};
