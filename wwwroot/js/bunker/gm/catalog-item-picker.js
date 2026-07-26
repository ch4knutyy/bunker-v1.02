(function setupCatalogItemPicker() {
	"use strict";

	const pageSize = 30;
	const basicActions = new Set(["replace", "add", "remove", "issue", "markUsed", "restoreUsed"]);
	let state = null;
	let searchTimer = null;

	const get = (source, camel, pascal) => source?.[camel] ?? source?.[pascal];
	const label = (key, fallback) => {
		if (typeof t !== "function") return fallback;
		const value = t(key);
		return value && value !== key ? value : fallback;
	};
	const dialog = () => document.getElementById("catalogItemPicker");

	function normalizeCategory(value) {
		const map = {
			Profession: "profession",
			PhysicalHealth: "physicalHealth",
			MentalHealth: "mentalHealth",
			Hobby: "hobby",
			Phobia: "phobia",
			CharacterTrait: "characterTrait",
			Fact: "fact",
			Inventory: "inventory",
			Property: "property",
			SpecialCard: "specialCard"
		};
		return map[value] || value;
	}

	function playerEntries() {
		const players = typeof gmPlayersData !== "undefined" ? gmPlayersData : {};
		return Object.entries(players || {}).map(([connectionId, player]) => ({
			id: get(player, "stablePlayerId", "StablePlayerId") || connectionId,
			connectionId,
			name: get(player, "name", "Name") || label("gmValueUnknown", "—")
		}));
	}

	async function loadCategories(requestedCategory) {
		const categories = await connection.invoke(
			"GetCatalogPickerCategories",
			typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "uk");
		state.categories = categories || [];
		const select = document.getElementById("catalogPickerCategory");
		select.replaceChildren();
		state.categories.forEach(category => {
			const option = document.createElement("option");
			option.value = get(category, "key", "Key");
			option.textContent = get(category, "title", "Title");
			select.append(option);
		});
		select.value = state.categories.some(category =>
			get(category, "key", "Key") === requestedCategory)
			? requestedCategory
			: select.options[0]?.value || "";
		state.category = select.value;
		renderActions();
	}

	function renderActions() {
		const definition = state.categories.find(category =>
			get(category, "key", "Key") === state.category);
		const actions = (get(definition, "actions", "Actions") || [])
			.filter(action => basicActions.has(action));
		const select = document.getElementById("catalogPickerAction");
		select.replaceChildren();
		actions.forEach(action => {
			const option = document.createElement("option");
			option.value = action;
			option.textContent = label(`catalogAction${action[0].toUpperCase()}${action.slice(1)}`, action);
			select.append(option);
		});
		state.action = actions[0] || "replace";
		select.value = state.action;
	}

	async function loadPage(page = 1) {
		if (!state?.category) return;
		setLoading(label("catalogPickerLoading", "Loading…"));
		try {
			const result = await connection.invoke(
				"GetCatalogPickerPage",
				state.category,
				state.playerId,
				typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "uk",
				page,
				pageSize,
				document.getElementById("catalogPickerSearch")?.value || "");
			state.page = get(result, "page", "Page") || 1;
			state.total = get(result, "total", "Total") || 0;
			state.currentRecordId = get(result, "currentRecordId", "CurrentRecordId") || null;
			state.version = get(result, "version", "Version") || "";
			state.items = get(result, "items", "Items") || [];
			state.selected = null;
			renderList();
			renderPreview();
		} catch (error) {
			setLoading(errorCode(error));
		}
	}

	function setLoading(message) {
		const list = document.getElementById("catalogPickerList");
		if (!list) return;
		list.replaceChildren();
		const status = document.createElement("p");
		status.className = "catalog-picker-state";
		status.textContent = message;
		list.append(status);
	}

	function renderList() {
		const list = document.getElementById("catalogPickerList");
		list.replaceChildren();
		if (!state.items.length) {
			setLoading(label("catalogPickerEmpty", "No catalog entries"));
		} else {
			state.items.forEach(item => {
				const id = get(item, "recordId", "RecordId");
				const button = document.createElement("button");
				button.type = "button";
				button.className = "catalog-picker-card";
				button.dataset.catalogRecordId = id;
				button.setAttribute("role", "option");
				button.setAttribute("aria-selected", String(state.selected &&
					get(state.selected, "recordId", "RecordId") === id));
				const title = document.createElement("strong");
				title.textContent = get(item, "title", "Title") || "—";
				const description = document.createElement("span");
				description.textContent = get(item, "description", "Description") || "";
				const metadata = document.createElement("small");
				metadata.textContent = get(item, "category", "Category") || "";
				button.append(title, description, metadata);
				list.append(button);
			});
		}
		const page = document.getElementById("catalogPickerPage");
		if (page) page.textContent = `${state.page} · ${state.total}`;
		const previous = document.querySelector('[data-catalog-picker-action="previous"]');
		const next = document.querySelector('[data-catalog-picker-action="next"]');
		if (previous) previous.disabled = state.page <= 1;
		if (next) next.disabled = state.page * pageSize >= state.total;
	}

	function renderPreview() {
		const item = state?.selected;
		document.getElementById("catalogPickerSelectedTitle").textContent =
			item ? get(item, "title", "Title") : "—";
		document.getElementById("catalogPickerSelectedDescription").textContent =
			item ? get(item, "description", "Description") || "" : "";
		const tags = document.getElementById("catalogPickerSelectedTags");
		tags.replaceChildren();
		(get(item, "tags", "Tags") || []).forEach(value => {
			const tag = document.createElement("span");
			tag.textContent = value;
			tags.append(tag);
		});
		const severityCodes = get(item, "severityCodes", "SeverityCodes") || [];
		const severityField = document.getElementById("catalogPickerSeverityField");
		const severity = document.getElementById("catalogPickerSeverity");
		severity.replaceChildren();
		severityCodes.forEach(code => {
			const option = document.createElement("option");
			option.value = code;
			option.textContent = label(`severity_${code}`, code);
			severity.append(option);
		});
		severityField.hidden = severityCodes.length === 0;
		const actionWithoutRecord = state.category === "specialCard" &&
			["remove", "markUsed", "restoreUsed"].includes(state.action);
		document.getElementById("catalogPickerApply").disabled = !item && !actionWithoutRecord;
		document.getElementById("catalogPickerPreviewResult").textContent = "";
	}

	function replacementCommand() {
		return {
			category: state.category,
			targetPlayerId: state.playerId,
			recordId: state.selected ? get(state.selected, "recordId", "RecordId") : "",
			actionType: state.action,
			severityCode: document.getElementById("catalogPickerSeverityField").hidden
				? null
				: document.getElementById("catalogPickerSeverity").value,
			expectedCurrentRecordId: state.currentRecordId,
			commandId: crypto.randomUUID()
		};
	}

	async function previewReplacement() {
		const preview = await connection.invoke("PreviewCatalogReplacement", replacementCommand());
		const target = document.getElementById("catalogPickerPreviewResult");
		target.textContent = get(preview, "allowed", "Allowed")
			? `${get(preview, "beforeSource", "BeforeSource") || "—"} → ${get(preview, "afterSource", "AfterSource") || "—"}`
			: get(preview, "code", "Code");
		return preview;
	}

	async function applyReplacement(button) {
		if (button.disabled) return;
		button.disabled = true;
		try {
			const command = replacementCommand();
			const preview = await connection.invoke("PreviewCatalogReplacement", command);
			if (!get(preview, "allowed", "Allowed")) {
				throw new Error(get(preview, "code", "Code"));
			}
			await connection.invoke("ApplyCatalogReplacement", command);
			await refreshAfterMutation();
			closePicker();
		} catch (error) {
			feedback(errorCode(error));
		} finally {
			button.disabled = false;
		}
	}

	function renderAdvancedPlayers() {
		const select = document.getElementById("catalogPickerTargetPlayer");
		select.replaceChildren();
		playerEntries().filter(player =>
			player.id !== state.playerId && player.connectionId !== state.playerId).forEach(player => {
			const option = document.createElement("option");
			option.value = player.id;
			option.textContent = player.name;
			select.append(option);
		});
	}

	async function operationCommand() {
		const operation = document.getElementById("catalogPickerOperation").value;
		const targetId = operation === "oppositeSex"
			? null
			: document.getElementById("catalogPickerTargetPlayer").value || null;
		let expectedTargetRecordId = null;
		if (targetId && state.category !== "property") {
			const targetPage = await connection.invoke(
				"GetCatalogPickerPage",
				state.category,
				targetId,
				typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "uk",
				1,
				1,
				"");
			expectedTargetRecordId = get(targetPage, "currentRecordId", "CurrentRecordId") || null;
		}
		return {
			operation,
			category: operation === "oppositeSex" ? "personalitySex" : state.category,
			sourcePlayerId: state.playerId,
			targetPlayerId: targetId,
			sourceReplacementRecordId: state.selected
				? get(state.selected, "recordId", "RecordId")
				: null,
			severityCode: document.getElementById("catalogPickerSeverityField").hidden
				? null
				: document.getElementById("catalogPickerSeverity").value,
			expectedSourceRecordId: operation === "oppositeSex" ? null : state.currentRecordId,
			expectedTargetRecordId,
			commandId: crypto.randomUUID()
		};
	}

	async function previewOperation() {
		try {
			const command = await operationCommand();
			const preview = await connection.invoke("PreviewCharacteristicOperation", command);
			state.operationPreview = preview;
			const output = document.getElementById("catalogPickerOperationPreview");
			output.textContent = get(preview, "allowed", "Allowed")
				? [
					`${get(preview, "beforeSource", "BeforeSource") || "—"} → ${get(preview, "afterSource", "AfterSource") || "—"}`,
					get(preview, "targetPlayerId", "TargetPlayerId")
						? `${get(preview, "beforeTarget", "BeforeTarget") || "—"} → ${get(preview, "afterTarget", "AfterTarget") || "—"}`
						: ""
				].filter(Boolean).join("\n")
				: get(preview, "code", "Code");
			document.querySelector('[data-catalog-picker-action="apply-operation"]').disabled =
				!get(preview, "allowed", "Allowed");
		} catch (error) {
			feedback(errorCode(error));
		}
	}

	async function applyOperation(button) {
		if (button.disabled || !state.operationPreview) return;
		const operation = document.getElementById("catalogPickerOperation").value;
		if (["steal", "transfer"].includes(operation) &&
			!globalThis.confirm(label("catalogPickerDangerConfirm", "Apply dangerous operation?"))) return;
		button.disabled = true;
		try {
			const command = await operationCommand();
			await connection.invoke("ApplyCharacteristicOperation", command);
			await refreshAfterMutation();
			closePicker();
		} catch (error) {
			feedback(errorCode(error));
		} finally {
			button.disabled = false;
		}
	}

	async function refreshAfterMutation() {
		if (typeof refreshGmPanelV2State === "function") await refreshGmPanelV2State();
		await connection.invoke("GetAllPlayersData");
	}

	function feedback(message) {
		const target = document.getElementById("catalogPickerFeedback");
		if (target) target.textContent = message;
	}

	function errorCode(error) {
		const text = String(error?.message || error || "");
		const match = text.match(/(?:HubException: )?([a-z][a-z0-9_]+)/i);
		return match?.[1] || label("catalogPickerError", "Catalog operation failed");
	}

	function closePicker() {
		globalThis.clearTimeout(searchTimer);
		const picker = dialog();
		if (picker?.open) picker.close();
		document.getElementById("catalogPickerList")?.replaceChildren();
		document.getElementById("catalogPickerOperationPreview").textContent = "";
		state = null;
	}

	globalThis.openCatalogItemPicker = async function openCatalogItemPicker(category, playerId) {
		if (!playerId || typeof connection === "undefined") return;
		const picker = dialog();
		state = {
			playerId,
			category: normalizeCategory(category),
			page: 1,
			total: 0,
			items: [],
			selected: null,
			operationPreview: null,
			categories: []
		};
		feedback("");
		const player = playerEntries().find(entry =>
			entry.id === playerId || entry.connectionId === playerId);
		document.getElementById("catalogPickerContext").textContent =
			player?.name || label("gmValueUnknown", "—");
		renderAdvancedPlayers();
		picker.showModal();
		try {
			await loadCategories(state.category);
			await loadPage(1);
		} catch (error) {
			feedback(errorCode(error));
		}
	};

	const root = dialog();
	if (!root || root.dataset.catalogPickerBound === "true") return;
	root.dataset.catalogPickerBound = "true";
	root.addEventListener("click", async event => {
		const record = event.target.closest("[data-catalog-record-id]");
		if (record && state) {
			state.selected = state.items.find(item =>
				get(item, "recordId", "RecordId") === record.dataset.catalogRecordId) || null;
			renderList();
			renderPreview();
			if (state.selected) {
				try { await previewReplacement(); } catch (error) { feedback(errorCode(error)); }
			}
			return;
		}
		const action = event.target.closest("[data-catalog-picker-action]");
		if (!action) return;
		switch (action.dataset.catalogPickerAction) {
			case "close": closePicker(); break;
			case "previous": await loadPage(state.page - 1); break;
			case "next": await loadPage(state.page + 1); break;
			case "apply": await applyReplacement(action); break;
			case "preview-operation": await previewOperation(); break;
			case "apply-operation": await applyOperation(action); break;
		}
	});
	document.getElementById("catalogPickerCategory")?.addEventListener("change", async event => {
		if (!state) return;
		state.category = event.target.value;
		state.page = 1;
		renderActions();
		await loadPage(1);
	});
	document.getElementById("catalogPickerAction")?.addEventListener("change", async event => {
		if (!state) return;
		state.action = event.target.value;
		renderPreview();
		if (state.selected || ["remove", "markUsed", "restoreUsed"].includes(state.action)) {
			try { await previewReplacement(); } catch (error) { feedback(errorCode(error)); }
		}
	});
	document.getElementById("catalogPickerSeverity")?.addEventListener("change", async () => {
		if (state?.selected) {
			try { await previewReplacement(); } catch (error) { feedback(errorCode(error)); }
		}
	});
	document.getElementById("catalogPickerSearch")?.addEventListener("input", () => {
		globalThis.clearTimeout(searchTimer);
		searchTimer = globalThis.setTimeout(() => loadPage(1), 250);
	});
	document.getElementById("catalogPickerOperation")?.addEventListener("change", () => {
		state.operationPreview = null;
		document.querySelector('[data-catalog-picker-action="apply-operation"]').disabled = true;
	});
})();
