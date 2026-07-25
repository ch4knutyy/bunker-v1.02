// GM SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.gm = {
	OmniscientHiddenStateUpdated() {
		connection.off("OmniscientHiddenStateUpdated");
		connection.on("OmniscientHiddenStateUpdated", function (state) {
			const version = Number(state?.stateVersion ?? state?.StateVersion ?? 0);
			if (!version || version <= omniscientHiddenStateVersion) return;
			omniscientHiddenStateVersion = version;
			omniscientHiddenState = state;
			renderOmniscientHiddenState();
			renderCurrentGameUI();
		});
	},

	AllPlayersData() {
		connection.off("AllPlayersData");
		connection.on("AllPlayersData", function (data) {
			console.log("All players data received:", data);
			gmPlayersData = {};
			data.forEach(p => {
				const connectionId = p.connectionId || p.ConnectionId;
				gmPlayersData[connectionId] = {
					...p,
					connectionId: connectionId,
					revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
					fact: normalizeFactFromPlayer(p)
				};
			});
			updateGMPlayerSelect();
			updateSpecialCardsUI();
			if (selectedPlayerForGM && !gmPlayersData[selectedPlayerForGM]) {
				selectedPlayerForGM = null;
			}
			if (selectedPlayerForGM) loadPlayerDataForGM();
		});
	},

	GMActionSuccess() {
		connection.off("GMActionSuccess");
		connection.on("GMActionSuccess", function (info) {
			console.log("GM action success:", info);
			const action = info.action || info.Action || 'Дію виконано';
			addEventMessage(`<span class="event-gm">GM</span> ${escapeHtml(action)}`);
			const result = document.getElementById('gmThreatCommandResult');
			if (result) result.textContent = action;
			gmLastCommandError = '';
			gmPlayerCommandPending = false;
			setGmSnapshotPending(false);
			document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
			const playerResult = document.getElementById('gmPlayerCommandResult');
			if (playerResult) playerResult.textContent = action;
			markGMServerUpdate();
			// Оновлюємо дані гравців
			if (isHost) {
				connection.invoke("GetAllPlayersData").catch(err => console.error(err));
			}
		});
	},

	CharacteristicPeeked() {
		connection.off("CharacteristicPeeked");
		connection.on("CharacteristicPeeked", function (info) {
			console.log("Characteristic peeked:", info);
			showPeekModal(info.playerName, info.characteristicKey, info.data, info.isRevealed);
		});
	},

	RoomLocalEditorUpdated() {
		connection.off("RoomLocalEditorUpdated");
		connection.on("RoomLocalEditorUpdated", function (data) {
			gmRoomLocalEditorData = {
				bunkerFields: data.bunkerFields || data.BunkerFields || [],
				apocalypseFields: data.apocalypseFields || data.ApocalypseFields || [],
				players: data.players || data.Players || []
			};
			setRoomLocalEditorPending(false);
			renderRoomLocalEditor();
		});
	},

	RoomLocalEditPreviewed() {
		connection.off("RoomLocalEditPreviewed");
		connection.on("RoomLocalEditPreviewed", function (data) {
			gmRoomLocalEditPreview = {
				category: data.category || data.Category || '', targetPlayerId: data.targetPlayerId || data.TargetPlayerId || null,
				fieldId: data.fieldId || data.FieldId || '', sanitizedProposedValue: data.sanitizedProposedValue || data.SanitizedProposedValue || '',
				canApply: data.canApply ?? data.CanApply ?? false, warning: data.warning || data.Warning || ''
			};
			setRoomLocalEditorPending(false);
			const feedback = document.getElementById('gmEditorFeedback');
			if (feedback) feedback.textContent = gmRoomLocalEditPreview.canApply ? gmRoomLocalEditPreview.sanitizedProposedValue : gmRoomLocalEditPreview.warning;
			const apply = document.getElementById('gmEditorApplyButton');
			if (apply) apply.disabled = !gmRoomLocalEditPreview.canApply;
		});
	},

	GmAuditLogUpdated() {
		connection.off("GmAuditLogUpdated");
		connection.on("GmAuditLogUpdated", function (data) {
			gmAuditData = { entries: data.entries || data.Entries || [] };
			setGmDiagnosticsPending(false);
			renderUnifiedGmAudit();
		});
	},

	GMThreatControlData() {
		connection.off("GMThreatControlData");
		connection.on("GMThreatControlData", function (data) {
			gmThreatControlData = {
				threats: data.threats || data.Threats || [],
				currentThreat: data.currentThreat || data.CurrentThreat || null,
				auditLog: data.auditLog || data.AuditLog || [],
				canBrowseFutureThreatCatalog: data.canBrowseFutureThreatCatalog ?? data.CanBrowseFutureThreatCatalog ?? false
			};
			if (!(gmThreatControlData.currentThreat?.canForceOutcome ?? gmThreatControlData.currentThreat?.CanForceOutcome ?? false)) {
				setGMThreatForcePending(false);
				closeGMThreatForceModal();
			}
			renderGMThreatControl();
			markGMServerUpdate();
		});
	},

	GMThreatForcePreview() {
		connection.off("GMThreatForcePreview");
		connection.on("GMThreatForcePreview", function (data) {
			gmThreatForcePreview = data;
			gmThreatForceRequestedOutcome = data.requestedOutcome || data.RequestedOutcome || '';
			setGMThreatForcePending(false);
			renderGMThreatForcePreview();
			const modal = document.getElementById('gmThreatForceModal');
			if (modal) modal.style.display = 'flex';
		});
	},

	GMThreatForceRejected() {
		connection.off("GMThreatForceRejected");
		connection.on("GMThreatForceRejected", function (data) {
			setGMThreatForcePending(false);
			gmThreatForcePreview = null;
			const error = document.getElementById('gmThreatForceError');
			if (error) error.textContent = t('gmThreatForceStale');
			const refresh = document.getElementById('gmThreatForceRefresh');
			if (refresh) refresh.style.display = '';
			const confirmButton = document.getElementById('gmThreatForceConfirm');
			if (confirmButton) confirmButton.disabled = true;
		});
	}
};
