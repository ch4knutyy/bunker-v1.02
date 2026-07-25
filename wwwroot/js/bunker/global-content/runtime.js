// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function renderGlobalContentPage(data) {
	const metadata = data.metadata || data.Metadata || {};
	const metadataPanel = document.getElementById('globalCatalogMetadata');
	if (metadataPanel) {
		metadataPanel.replaceChildren();
		const values = [
			`${metadata.category || metadata.Category}: ${metadata.entryCount ?? metadata.EntryCount ?? 0}`,
			`${t('globalCatalogSchema')}: ${metadata.schemaStatus || metadata.SchemaStatus}`,
			`${t('globalCatalogStableIds')}: ${metadata.stableIdStatus || metadata.StableIdStatus}`,
			`${t('globalCatalogLocalization')}: ${metadata.localizationStatus || metadata.LocalizationStatus}`
		];
		values.forEach(value => { const badge = document.createElement('span'); badge.className = 'global-catalog-badge'; badge.textContent = value; metadataPanel.appendChild(badge); });
	}
	const entriesPanel = document.getElementById('globalCatalogEntries');
	if (entriesPanel) {
		entriesPanel.replaceChildren();
		(data.entries || data.Entries || []).forEach(entry => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'global-catalog-entry';
			button.textContent = `${entry.displayName || entry.DisplayName} ${entry.summary || entry.Summary || ''}`.trim();
			const stableId = entry.stableId || entry.StableId;
			button.disabled = !stableId;
			if (stableId) button.addEventListener('click', () => loadGlobalContentEntry(stableId));
			entriesPanel.appendChild(button);
		});
	}
	const pageLabel = document.getElementById('globalCatalogPage');
	if (pageLabel) pageLabel.textContent = `${globalCatalogPage} · ${globalCatalogTotal}`;
	const previous = document.getElementById('globalCatalogPrevious');
	const next = document.getElementById('globalCatalogNext');
	if (previous) previous.disabled = globalCatalogPage <= 1;
	if (next) next.disabled = globalCatalogPage * 25 >= globalCatalogTotal;
}

async function loadGlobalContentEntry(stableId) {
	const category = document.getElementById('globalCatalogCategory')?.value;
	if (!globalCatalogAllowed || !category) return;
	try {
		const entry = await connection.invoke('GetGlobalContentEntry', category, stableId);
		const details = document.getElementById('globalCatalogDetails');
		if (details) details.textContent = Object.entries(entry.fields || entry.Fields || {}).map(([key, value]) => `${key}: ${value}`).join('\n');
	} catch (error) { renderGlobalCatalogError(error); }
}

function changeGlobalContentPage(delta) { loadGlobalContentPage(Math.max(1, globalCatalogPage + delta)); }

function scheduleGlobalContentSearch() {
	clearTimeout(globalCatalogSearchTimer);
	globalCatalogSearchTimer = setTimeout(() => loadGlobalContentPage(1), 250);
}

function renderGlobalCatalogError(error) {
	const details = document.getElementById('globalCatalogDetails');
	if (details) details.textContent = error?.message || t('unavailableNow');
}

function setGlobalDraftPending(pending) {
	globalDraftPending = pending;
	document.querySelectorAll('.global-draft-command').forEach(button => button.disabled = pending);
	if (!pending) {
		const execute = document.getElementById('globalRollbackExecute');
		if (execute) execute.disabled = !(globalRollbackPreview?.canRollback ?? globalRollbackPreview?.CanRollback);
		const migrationApply = document.getElementById('globalMigrationApply');
		if (migrationApply) migrationApply.disabled = !(globalMigrationPreview?.canApply ?? globalMigrationPreview?.CanApply);
		renderGlobalDraftState();
	}
}

function selectedGlobalDraftId() { return document.getElementById('globalDraftSelect')?.value || ''; }

async function loadGlobalContentDrafts() {
	if (!globalCatalogAllowed) return;
	globalDrafts = await connection.invoke('GetGlobalContentDrafts');
	const select = document.getElementById('globalDraftSelect'); if (!select) return;
	const selected = select.value; select.replaceChildren(...globalDrafts.map(draft => { const option = document.createElement('option'); option.value = draft.draftId || draft.DraftId; option.textContent = `${draft.category || draft.Category} · ${draft.status || draft.Status}`; return option; }));
	if (globalDrafts.some(draft => (draft.draftId || draft.DraftId) === selected)) select.value = selected;
	renderGlobalDraftState();
}

function renderGlobalDraftState() {
	const id = selectedGlobalDraftId(); const draft = globalDrafts.find(x => (x.draftId || x.DraftId) === id); const status = document.getElementById('globalDraftStatus');
	if (status) status.textContent = draft ? `${draft.status || draft.Status} · ${draft.entryCount ?? draft.EntryCount} · ${draft.expiresAtUtc || draft.ExpiresAtUtc}` : '';
	const category = document.getElementById('globalCatalogCategory')?.value; const blocked = ['hobbies', 'character_traits'].includes(category); const warning = document.getElementById('globalDraftBlocked');
	if (warning) warning.textContent = blocked ? 'BlockedMissingStableIds' : '';
	const create = document.getElementById('globalDraftCreate'); if (create) create.disabled = globalDraftPending || blocked;
	const migration = document.getElementById('globalStableIdMigration'); if (migration) migration.style.display = blocked ? 'block' : 'none';
	const commit = document.getElementById('globalDraftCommit'); if (commit) commit.disabled = globalDraftPending || !draft || (draft.status || draft.Status) !== 'Validated';
}

async function runGlobalDraftCommand(action) {
	if (globalDraftPending) return; setGlobalDraftPending(true); const result = document.getElementById('globalDraftResult');
	try { const value = await action(); if (result) result.textContent = JSON.stringify(value, null, 2); await loadGlobalContentDrafts(); }
	catch (error) { if (result) result.textContent = error?.message || t('unavailableNow'); }
	finally { setGlobalDraftPending(false); renderGlobalDraftState(); }
}

function createGlobalContentDraft() { const category = document.getElementById('globalCatalogCategory')?.value; if (category) runGlobalDraftCommand(() => connection.invoke('CreateGlobalContentDraft', category, crypto.randomUUID())); }

function applyGlobalDraftCommand() {
	const draftId = selectedGlobalDraftId(); const category = globalDrafts.find(x => (x.draftId || x.DraftId) === draftId)?.category; const type = document.getElementById('globalDraftOperation')?.value; const entryId = document.getElementById('globalDraftEntryId')?.value.trim();
	if (!draftId || !entryId) return; const fields = {}; const name = document.getElementById('globalDraftName')?.value.trim(); const description = document.getElementById('globalDraftDescription')?.value.trim(); const nameField = category === 'professions' ? 'profession' : category === 'items' ? 'item' : category === 'facts' ? 'fact' : 'name'; if (name) fields[nameField] = name; if (description) fields.description = description;
	const deleting = type === 'DeleteEntry'; if (deleting && !confirm('Delete entry from draft?')) return;
	runGlobalDraftCommand(() => connection.invoke('ApplyGlobalContentDraftCommand', { draftId, category, type, entryId, fields: deleting ? null : fields, confirmDelete: deleting, commandId: crypto.randomUUID() }));
}

function validateGlobalDraft() { const id = selectedGlobalDraftId(); if (id) runGlobalDraftCommand(() => connection.invoke('ValidateGlobalContentDraft', id)); }

function previewGlobalDraftDiff() { const id = selectedGlobalDraftId(); if (id) runGlobalDraftCommand(() => connection.invoke('PreviewGlobalContentDraftDiff', id, 1, 100)); }

function discardGlobalDraft() { const id = selectedGlobalDraftId(); if (id && confirm('Discard draft?')) runGlobalDraftCommand(() => connection.invoke('DiscardGlobalContentDraft', id, crypto.randomUUID())); }

async function commitGlobalDraft() {
	const id = selectedGlobalDraftId(); if (!id || globalDraftPending) return;
	setGlobalDraftPending(true); const output = document.getElementById('globalDraftResult');
	try {
		const diff = await connection.invoke('PreviewGlobalContentDraftDiff', id, 1, 100);
		if (!confirm(`Commit draft? +${diff.addedCount ?? diff.AddedCount} ~${diff.updatedCount ?? diff.UpdatedCount} -${diff.deletedCount ?? diff.DeletedCount}`)) return;
		const result = await connection.invoke('CommitGlobalContentDraft', id, crypto.randomUUID()); if (output) output.textContent = JSON.stringify(result, null, 2);
		await loadGlobalContentDrafts(); await loadGlobalContentBackups();
	} catch (error) { if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setGlobalDraftPending(false); renderGlobalDraftState(); }
}

async function loadGlobalContentBackups() {
	if (!globalCatalogAllowed) return; const category = document.getElementById('globalCatalogCategory')?.value; if (!category) return;
	try { const backups = await connection.invoke('GetGlobalContentBackups', category); const select = document.getElementById('globalBackupSelect'); if (select) select.replaceChildren(...backups.map(backup => { const option = document.createElement('option'); option.value = backup.backupId || backup.BackupId; option.textContent = `${backup.sourceVersion ?? backup.SourceVersion} · ${backup.createdAtUtc || backup.CreatedAtUtc} · ${backup.actorId || backup.ActorId} · ${backup.reason || backup.Reason}`; return option; })); }
	catch (error) { const result = document.getElementById('globalRollbackResult'); if (result) result.textContent = error?.message || t('unavailableNow'); }
}

async function previewGlobalRollback() {
	if (globalDraftPending) return; const category = document.getElementById('globalCatalogCategory')?.value; const backupId = document.getElementById('globalBackupSelect')?.value; if (!category || !backupId) return;
	setGlobalDraftPending(true); try { globalRollbackPreview = await connection.invoke('PreviewGlobalContentRollback', category, backupId); const result = document.getElementById('globalRollbackResult'); if (result) result.textContent = JSON.stringify(globalRollbackPreview, null, 2); const execute = document.getElementById('globalRollbackExecute'); if (execute) execute.disabled = !(globalRollbackPreview.canRollback ?? globalRollbackPreview.CanRollback); } finally { setGlobalDraftPending(false); }
}

async function executeGlobalRollback() {
	if (!globalRollbackPreview || globalDraftPending || !confirm('Rollback global content?') || !confirm('Confirm destructive rollback again.')) return;
	const category = globalRollbackPreview.category || globalRollbackPreview.Category; const backupId = globalRollbackPreview.backupId || globalRollbackPreview.BackupId; const token = globalRollbackPreview.previewToken || globalRollbackPreview.PreviewToken;
	await runGlobalDraftCommand(() => connection.invoke('RollbackGlobalContent', category, backupId, token, true, crypto.randomUUID())); globalRollbackPreview = null; await loadGlobalContentBackups();
}

async function previewStableIdMigration() {
	if (globalDraftPending) return; const category = document.getElementById('globalCatalogCategory')?.value; if (!['hobbies', 'character_traits'].includes(category)) return;
	setGlobalDraftPending(true); const output = document.getElementById('globalMigrationResult');
	try { globalMigrationPreview = await connection.invoke('PreviewStableIdMigration', category, 1, 100); if (output) output.textContent = JSON.stringify(globalMigrationPreview, null, 2); const apply = document.getElementById('globalMigrationApply'); if (apply) apply.disabled = !(globalMigrationPreview.canApply ?? globalMigrationPreview.CanApply); }
	catch (error) { if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setGlobalDraftPending(false); const apply = document.getElementById('globalMigrationApply'); if (apply) apply.disabled = !(globalMigrationPreview?.canApply ?? globalMigrationPreview?.CanApply); }
}

async function applyStableIdMigration() {
	if (!globalMigrationPreview || globalDraftPending || !confirm('Apply stable IDs to canonical JSON?') || !confirm('Only missing id fields will be added. Confirm again.')) return;
	const category = globalMigrationPreview.category || globalMigrationPreview.Category; const token = globalMigrationPreview.previewToken || globalMigrationPreview.PreviewToken; const output = document.getElementById('globalMigrationResult'); setGlobalDraftPending(true);
	try { const result = await connection.invoke('ApplyStableIdMigration', category, token, true, crypto.randomUUID()); if (output) output.textContent = JSON.stringify(result, null, 2); globalMigrationPreview = null; await loadGlobalContentCategories(); await loadGlobalContentBackups(); }
	catch (error) { if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setGlobalDraftPending(false); }
}
