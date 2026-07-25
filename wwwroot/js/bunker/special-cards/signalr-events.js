// Special cards SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.specialCards = {
	EventSpecialCardsUpdated() {
		connection.off("EventSpecialCardsUpdated");
		connection.on("EventSpecialCardsUpdated", function (data) {
			if (!myPlayerData) return;
			myPlayerData.eventSpecialCards = data?.cards || data?.Cards || [];
			renderMyEventCards(myPlayerData);
		});
	},

	SpecialCardStateUpdated() {
		connection.off("SpecialCardStateUpdated");
		connection.on("SpecialCardStateUpdated", function (data) {
			const card = data.card || data.Card;
			const cards = data.cards || data.Cards;
			if (myPlayerData) {
				myPlayerData.specialCards = normalizeSpecialCards(cards, card);
				myPlayerData.specialCard = myPlayerData.specialCards[0] || normalizeSpecialCard(card);
				myPlayerData.specialCards.filter(item => item.isUsed || item.isActive || item.isEffectActive).forEach(item => pendingSpecialCardUses.delete(item.id));
				if (data.inventory || data.Inventory) {
					myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
				}
				if (data.property || data.Property) {
					myPlayerData.property = normalizePropertyData(data.property || data.Property);
				}
			}
			applyRoundState(data.roundState || data.RoundState);
			renderCurrentGameUI();
		});
	},

	SpecialCardActivated() {
		connection.off("SpecialCardActivated");
		connection.on("SpecialCardActivated", function (data) {
			applyRoundState(data.roundState || data.RoundState);
			renderCurrentGameUI();
			const message = data.message || data.Message;
			const ownerName = data.ownerPlayerName || data.OwnerPlayerName || t('unknown');
			addEventMessage(escapeHtml(message || `${ownerName} використав спеціальну карту.`));
		});
	},

	SpecialCardPrivateResult() {
		connection.off("SpecialCardPrivateResult");
		connection.on("SpecialCardPrivateResult", function (data) {
			const message = data.message || data.Message || t('cardUsedSuccessfully');
			addEventMessage(`<span class="event-success">${escapeHtml(message)}</span>`);
		});
	},

	installImpactToast() {
		window.showSpecialCardImpactToast = function (message) {
			const normalizedMessage = String(message || '').trim();
			if (!normalizedMessage) return;

			let container = document.getElementById('specialCardImpactToasts');

			if (!container) {
				container = document.createElement('div');
				container.id = 'specialCardImpactToasts';
				container.className = 'special-card-impact-toasts';
				container.setAttribute('aria-live', 'assertive');
				document.body.appendChild(container);
			}

			const toast = document.createElement('article');
			toast.className = 'special-card-impact-toast';

			toast.innerHTML = `
			<div class="special-card-impact-icon" aria-hidden="true">!</div>

			<div class="special-card-impact-content">
				<strong class="special-card-impact-title">
					${escapeHtml(t('specialCardAffectedYou'))}
				</strong>

				<p class="special-card-impact-message">
					${escapeHtml(normalizedMessage)}
				</p>
			</div>

			<button
				type="button"
				class="special-card-impact-close"
				aria-label="Закрити">
				×
			</button>
		`;

			container.appendChild(toast);

			const removeToast = () => {
				if (toast.classList.contains('is-removing')) return;

				toast.classList.add('is-removing');

				setTimeout(() => {
					toast.remove();

					if (container.children.length === 0) {
						container.remove();
					}
				}, 260);
			};

			toast
				.querySelector('.special-card-impact-close')
				?.addEventListener('click', removeToast);

			requestAnimationFrame(() => {
				toast.classList.add('is-visible');
			});

			setTimeout(removeToast, 7500);
		};
	},

	SpecialCardTargetStateUpdated() {
		connection.off("SpecialCardTargetStateUpdated");
		connection.on("SpecialCardTargetStateUpdated", function (data) {
			if (myPlayerData) {
				if (data.inventory || data.Inventory) {
					myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
				}
				if (data.property || data.Property) {
					myPlayerData.property = normalizePropertyData(data.property || data.Property);
				}
				const cards = data.specialCards || data.SpecialCards;
				if (cards) {
					myPlayerData.specialCards = normalizeSpecialCards(cards);
					myPlayerData.specialCard = myPlayerData.specialCards[0] || normalizeSpecialCard(null);
				}
			}
			renderCurrentGameUI();
			const message = data.message || data.Message;
			if (message) {
				addEventMessage(
					`<span class="event-warning">${escapeHtml(message)}</span>`
				);

				window.showSpecialCardImpactToast(message);
			}
		});
	}
};
