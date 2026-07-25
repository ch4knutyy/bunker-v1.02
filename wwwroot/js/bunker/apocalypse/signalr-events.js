// Apocalypse SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.apocalypse = {
	ApocalypseEffectActivated() {
		connection.off("ApocalypseEffectActivated");
		connection.on("ApocalypseEffectActivated", function (data) {
			if (showApocalypseEffectBanner(data)) triggerApocalypseVisualReaction('apocalypse-effect');
		});
	},

	ApocalypseEffectPersonalChanged() {
		connection.off("ApocalypseEffectPersonalChanged");
		connection.on("ApocalypseEffectPersonalChanged", function (data) {
			showApocalypseEffectPersonalChanges(data);
			const safeFields = new Set(['Personality', 'Body', 'Profession', 'PhysicalHealth', 'MentalHealth', 'Hobby', 'CharacterTrait', 'Phobia', 'Fact', 'Inventory', 'Property']);
			for (const change of (data?.changes ?? data?.Changes ?? [])) {
				const field = String(change?.field ?? change?.Field ?? '');
				if (!safeFields.has(field)) continue;
				const card = document.querySelector(`#myPlayerCards [data-characteristic-type="${field}"]`);
				if (card) {
					card.classList.remove('apocalypse-personal-change');
					void card.offsetWidth;
					card.classList.add('apocalypse-personal-change');
					window.setTimeout(() => card.classList.remove('apocalypse-personal-change'), 700);
				}
			}
		});
	},

	ApocalypseChanged() {
		connection.off("ApocalypseChanged");
		connection.on("ApocalypseChanged", function (data) {
			console.log("Apocalypse changed:", data);
			syncPublicGameSettings(data);
			const apocalypse = data.apocalypse || data.Apocalypse || data;
			currentApocalypse = apocalypse;
			renderApocalypse(currentApocalypse);
			if (triggerApocalypseCardRevealWave(apocalypse))
				triggerApocalypseVisualReaction('apocalypse-reveal', { duration: 900 });
			addEventMessage(`<span class="event-apocalypse">☢️ ${escapeHtml(t('apocalypse'))}:</span> ${escapeHtml(getLocalizedValue(apocalypse, 'name'))}`);
		});
	},

	ApocalypseImageUpdated() {
		connection.off("ApocalypseImageUpdated");
		connection.on("ApocalypseImageUpdated", function (data) {
			console.log("[ApocalypseImageUpdated]", data);
			if (currentApocalypse && (currentApocalypse.id || currentApocalypse.Id) === (data.apocalypseId || data.ApocalypseId)) {
				const imageUrl = data.imageUrl || data.ImageUrl || null;
				currentApocalypse.imageUrl = imageUrl;
				if ('ImageUrl' in currentApocalypse) currentApocalypse.ImageUrl = imageUrl;
				renderApocalypse(currentApocalypse);
				addEventMessage(`<span class="event-image">🖼️</span> Зображення апокаліпсису оновлено`);
			}
		});
	},

	ApocalypseImageRemoved() {
		connection.off("ApocalypseImageRemoved");
		connection.on("ApocalypseImageRemoved", function (data) {
			console.log("[ApocalypseImageRemoved]", data);
			if (currentApocalypse && (currentApocalypse.id || currentApocalypse.Id) === (data.apocalypseId || data.ApocalypseId)) {
				currentApocalypse.imageUrl = null;
				if ('ImageUrl' in currentApocalypse) currentApocalypse.ImageUrl = null;
				renderApocalypse(currentApocalypse);
				addEventMessage(`<span class="event-image">🗑️</span> Зображення апокаліпсису видалено`);
			}
		});
	}
};
