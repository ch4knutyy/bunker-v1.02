// Diagnostics and developer access SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.diagnostics = {
	DeveloperPresenceChanged() {
		connection.off('DeveloperPresenceChanged');
		connection.on('DeveloperPresenceChanged', applyDeveloperPresence);
	},

	DeveloperAuthorityChanged() {
		connection.off('DeveloperAuthorityChanged');
		connection.on('DeveloperAuthorityChanged', applyDeveloperAccessState);
	},

	StaleConnectionInspected() {
		connection.off("StaleConnectionInspected");
		connection.on("StaleConnectionInspected", function (data) {
			gmPlayerCommandPending = false;
			document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
			const result = document.getElementById('gmPlayerCommandResult');
			if (result) result.textContent = data.message || data.Message || '';
		});
	},

	RoomDiagnosticsUpdated() {
		connection.off("RoomDiagnosticsUpdated");
		connection.on("RoomDiagnosticsUpdated", function (data) {
			gmDiagnosticsData = {
				isHealthy: data.isHealthy ?? data.IsHealthy ?? false,
				checkedAtUtc: data.checkedAtUtc || data.CheckedAtUtc,
				errorCount: data.errorCount ?? data.ErrorCount ?? 0,
				warningCount: data.warningCount ?? data.WarningCount ?? 0,
				infoCount: data.infoCount ?? data.InfoCount ?? 0,
				issues: data.issues || data.Issues || [],
				serverTimestampUtc: data.serverTimestampUtc || data.ServerTimestampUtc
			};
			gmAutoFixPreview = null;
			gmDiagnosticsPending = false;
			setGmDiagnosticsPending(false);
			renderRoomDiagnostics();
			markGMServerUpdate();
		});
	},

	RoomAutoFixPreviewed() {
		connection.off("RoomAutoFixPreviewed");
		connection.on("RoomAutoFixPreviewed", function (data) {
			gmAutoFixPreview = {
				changes: data.changes || data.Changes || [],
				changeCount: data.changeCount ?? data.ChangeCount ?? 0,
				hasChanges: data.hasChanges ?? data.HasChanges ?? false
			};
			setGmDiagnosticsPending(false);
			const feedback = document.getElementById('gmDiagnosticsFeedback');
			if (feedback) feedback.textContent = gmAutoFixPreview.hasChanges
				? `${gmAutoFixPreview.changeCount} safe fix(es)` : t('gmNoAutoFix');
			const apply = document.getElementById('gmApplyAutoFix');
			if (apply) apply.disabled = !gmAutoFixPreview.hasChanges;
		});
	},

	RoomSnapshotsUpdated() {
		connection.off("RoomSnapshotsUpdated");
		connection.on("RoomSnapshotsUpdated", function (data) {
			gmSnapshotsData = data.snapshots || data.Snapshots || [];
			setGmSnapshotPending(false);
			renderRoomSnapshots();
		});
	},

	RoomSnapshotRestorePreviewed() {
		connection.off("RoomSnapshotRestorePreviewed");
		connection.on("RoomSnapshotRestorePreviewed", function (data) {
			gmSnapshotRestorePreview = {
				snapshot: data.snapshot || data.Snapshot || null,
				canRestore: data.canRestore ?? data.CanRestore ?? false,
				blockedReason: data.blockedReason || data.BlockedReason || '',
				changes: data.changes || data.Changes || []
			};
			setGmSnapshotPending(false);
			renderRoomSnapshots();
		});
	}
};
