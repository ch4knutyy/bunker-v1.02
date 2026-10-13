// Narrative threat SignalR registrations.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};
window.BunkerSignalREvents.threats = (() => ({
    ThreatRevealed() {
        connection.off('ThreatRevealed');
        connection.on('ThreatRevealed', data => {
            currentThreat = data.threat || data.Threat || null;
            applyRoundState(data.roundState || data.RoundState);
            renderThreatPanel(currentThreat);
            updateRoundStatusUI();
            const name = currentThreat ? (getLocalizedValue(currentThreat, 'name') || currentThreat.name || currentThreat.Name) : t('threat');
            addEventMessage(`<span class="event-warning">${t('threatRevealed')}:</span> ${escapeHtml(name)}`);
        });
    },
    ThreatStateUpdated() {
        connection.off('ThreatStateUpdated');
        connection.on('ThreatStateUpdated', data => {
            currentThreatState = normalizeThreatState(data.threatState || data.ThreatState);
            applyRoundState(data.roundState || data.RoundState);
            renderThreatPanel(currentThreat);
            updateRoundStatusUI();
        });
    },
    ThreatImageUpdated() {
        connection.off('ThreatImageUpdated');
        connection.on('ThreatImageUpdated', data => {
            const threatId = currentThreat?.id || currentThreat?.Id;
            const updatedThreatId = data.threatId || data.ThreatId;
            const imageUrl = data.imageUrl || data.ImageUrl || null;

            if (!currentThreat || threatId !== updatedThreatId) return;

            currentThreat.imageUrl = imageUrl;
            currentThreat.uploadedImagePath = imageUrl;
            renderThreatPanel(currentThreat);
        });
    },
    ThreatImageRemoved() {
        connection.off('ThreatImageRemoved');
        connection.on('ThreatImageRemoved', data => {
            const threatId = currentThreat?.id || currentThreat?.Id;
            const removedThreatId = data.threatId || data.ThreatId;

            if (!currentThreat || threatId !== removedThreatId) return;

            currentThreat.imageUrl = null;
            currentThreat.uploadedImagePath = null;
            renderThreatPanel(currentThreat);
        });
    }
}))();
