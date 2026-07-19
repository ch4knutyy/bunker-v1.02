(function setupOwnerContentEditor() {
    const root = document.getElementById("ownerContentEditor");
    if (!root) return;

    const elements = {
        token: root.querySelector('input[name="__RequestVerificationToken"]'),
        search: document.getElementById("ownerContentSearch"),
        fileList: document.getElementById("ownerContentFileList"),
        fileName: document.getElementById("ownerContentFileName"),
        relativePath: document.getElementById("ownerContentRelativePath"),
        hash: document.getElementById("ownerContentHash"),
        modified: document.getElementById("ownerContentModified"),
        reloadStatus: document.getElementById("ownerContentReloadStatus"),
        dirty: document.getElementById("ownerContentDirty"),
        editor: document.getElementById("ownerContentText"),
        reload: document.getElementById("ownerContentReload"),
        format: document.getElementById("ownerContentFormat"),
        validate: document.getElementById("ownerContentValidate"),
        preview: document.getElementById("ownerContentPreview"),
        save: document.getElementById("ownerContentSave"),
        backups: document.getElementById("ownerContentBackups"),
        validation: document.getElementById("ownerContentValidation"),
        diff: document.getElementById("ownerContentDiff"),
        backupList: document.getElementById("ownerContentBackupList"),
        toast: document.getElementById("ownerContentToast"),
        cursor: document.getElementById("ownerContentCursor")
    };

    const state = {
        files: [],
        selected: null,
        currentHash: "",
        originalContent: "",
        dirty: false,
        previewedContent: null,
        loading: false
    };

    function endpoint(name) {
        return root.dataset[name];
    }

    function setToast(message, isError) {
        elements.toast.textContent = message || "";
        elements.toast.classList.toggle("is-error", Boolean(isError));
    }

    function setDirty(value) {
        state.dirty = value;
        elements.dirty.hidden = !value;
        if (value) state.previewedContent = null;
        updateControls();
    }

    function updateControls() {
        const hasDocument = Boolean(state.selected);
        elements.editor.disabled = !hasDocument || state.loading;
        [elements.reload, elements.format, elements.validate, elements.preview, elements.backups]
            .forEach(button => button.disabled = !hasDocument || state.loading);
        elements.save.disabled = !hasDocument ||
            state.loading ||
            !state.dirty ||
            state.previewedContent !== elements.editor.value;
    }

    async function request(url, options) {
        const response = await fetch(url, options);
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
            ? await response.json()
            : { code: `http_${response.status}` };
        if (!response.ok) {
            const error = new Error(payload.code || `http_${response.status}`);
            error.code = payload.code || `http_${response.status}`;
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    function post(url, body) {
        return request(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "RequestVerificationToken": elements.token.value
            },
            body: JSON.stringify(body)
        });
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "—"
            : new Intl.DateTimeFormat("uk-UA", {
                dateStyle: "medium",
                timeStyle: "short"
            }).format(date);
    }

    function renderFiles() {
        const query = elements.search.value.trim().toLocaleLowerCase();
        const files = state.files.filter(file =>
            `${file.displayName} ${file.relativePath} ${file.group}`
                .toLocaleLowerCase()
                .includes(query));
        elements.fileList.replaceChildren();
        let currentGroup = null;
        files.forEach(file => {
            if (file.group !== currentGroup) {
                currentGroup = file.group;
                const group = document.createElement("h3");
                group.className = "owner-content-file-group";
                group.textContent = currentGroup;
                elements.fileList.append(group);
            }
            const button = document.createElement("button");
            button.type = "button";
            button.className = "owner-content-file";
            button.classList.toggle("is-active", state.selected?.key === file.key);
            const name = document.createElement("strong");
            name.textContent = file.displayName;
            const metadata = document.createElement("small");
            metadata.textContent = `${formatBytes(file.sizeBytes)} · ${file.reloadStatus}`;
            button.append(name, metadata);
            button.addEventListener("click", () => selectFile(file));
            elements.fileList.append(button);
        });
        if (!files.length) {
            const empty = document.createElement("p");
            empty.className = "owner-content-muted";
            empty.textContent = "JSON-файлів не знайдено.";
            elements.fileList.append(empty);
        }
    }

    async function loadFiles() {
        try {
            state.files = await request(endpoint("filesUrl"));
            renderFiles();
        } catch (error) {
            setToast(`Не вдалося завантажити список: ${error.code}`, true);
        }
    }

    async function selectFile(file, force) {
        if (!force && state.dirty &&
            !window.confirm("Незбережені зміни буде втрачено. Продовжити?")) {
            return;
        }
        state.loading = true;
        updateControls();
        setToast("");
        try {
            const documentData = await request(
                `${endpoint("documentUrl")}/${encodeURIComponent(file.key)}`);
            state.selected = documentData.descriptor;
            state.currentHash = documentData.sha256;
            state.originalContent = documentData.content;
            state.previewedContent = null;
            elements.editor.value = documentData.content;
            elements.fileName.textContent = documentData.descriptor.displayName;
            elements.relativePath.textContent = documentData.descriptor.relativePath;
            elements.hash.textContent = documentData.sha256;
            elements.modified.textContent = formatDate(documentData.lastModifiedAtUtc);
            elements.reloadStatus.textContent = documentData.descriptor.reloadStatus;
            elements.validation.innerHTML = '<p class="owner-content-muted">Ще не виконувалась.</p>';
            elements.diff.innerHTML = '<p class="owner-content-muted">Спочатку відкрийте preview.</p>';
            elements.backupList.innerHTML = '<p class="owner-content-muted">Натисніть «Резервні копії».</p>';
            setDirty(false);
            renderFiles();
            updateCursor();
        } catch (error) {
            setToast(`Не вдалося відкрити файл: ${error.code}`, true);
        } finally {
            state.loading = false;
            updateControls();
        }
    }

    function renderValidation(validation) {
        elements.validation.replaceChildren();
        const message = document.createElement("p");
        message.className = validation.isValid
            ? "owner-content-validation-success"
            : "owner-content-validation-error";
        message.textContent = validation.isValid
            ? "JSON валідний."
            : "JSON містить помилки.";
        elements.validation.append(message);
        const issues = [...validation.errors, ...validation.warnings];
        if (issues.length) {
            const list = document.createElement("ul");
            issues.forEach(issue => {
                const item = document.createElement("li");
                const position = issue.lineNumber == null
                    ? ""
                    : ` (рядок ${issue.lineNumber + 1}, позиція ${issue.bytePositionInLine + 1})`;
                item.textContent = `${issue.message}${issue.path ? ` — ${issue.path}` : ""}${position}`;
                list.append(item);
            });
            elements.validation.append(list);
        }
    }

    async function validateDocument() {
        if (!state.selected) return null;
        try {
            const validation = await post(endpoint("validateUrl"), {
                fileKey: state.selected.key,
                proposedContent: elements.editor.value
            });
            renderValidation(validation);
            return validation;
        } catch (error) {
            setToast(`Помилка перевірки: ${error.code}`, true);
            return null;
        }
    }

    async function previewChanges() {
        if (!state.selected) return null;
        try {
            const preview = await post(endpoint("previewUrl"), {
                fileKey: state.selected.key,
                expectedHash: state.currentHash,
                proposedContent: elements.editor.value
            });
            renderValidation(preview.validation);
            elements.diff.replaceChildren();
            const summary = document.createElement("p");
            summary.textContent = `Додано: ${preview.addedCount}; видалено: ${preview.removedCount}; змінено: ${preview.modifiedCount}.`;
            elements.diff.append(summary);
            if (preview.isConflict) {
                const conflict = document.createElement("p");
                conflict.className = "owner-content-validation-error";
                conflict.textContent = "Файл змінився на диску. Перезавантажте актуальну версію.";
                elements.diff.append(conflict);
                state.previewedContent = null;
            } else if (preview.validation.isValid) {
                state.previewedContent = elements.editor.value;
            } else {
                state.previewedContent = null;
            }
            if (preview.changedPaths.length) {
                const list = document.createElement("ul");
                preview.changedPaths.forEach(path => {
                    const item = document.createElement("li");
                    item.textContent = path;
                    list.append(item);
                });
                elements.diff.append(list);
            }
            if (preview.hiddenChangedPathCount > 0) {
                const hidden = document.createElement("p");
                hidden.textContent = `Ще ${preview.hiddenChangedPathCount} шляхів приховано.`;
                elements.diff.append(hidden);
            }
            updateControls();
            return preview;
        } catch (error) {
            setToast(`Preview не виконано: ${error.code}`, true);
            return null;
        }
    }

    async function saveDocument() {
        if (!state.selected ||
            state.previewedContent !== elements.editor.value) {
            setToast("Спочатку перегляньте актуальні зміни.", true);
            return;
        }
        if (!window.confirm("Зберегти підтверджені зміни та створити резервну копію?")) {
            return;
        }
        state.loading = true;
        updateControls();
        try {
            const result = await post(endpoint("saveUrl"), {
                fileKey: state.selected.key,
                expectedHash: state.currentHash,
                proposedContent: elements.editor.value,
                confirmation: true,
                commandId: crypto.randomUUID()
            });
            state.currentHash = result.currentHash;
            state.originalContent = elements.editor.value;
            state.previewedContent = null;
            elements.hash.textContent = result.currentHash;
            elements.modified.textContent = formatDate(result.lastModifiedAtUtc);
            elements.reloadStatus.textContent = result.reloadStatus;
            setDirty(false);
            setToast(result.reloadStatus === "restart_required"
                ? "Збережено. Для цього loader потрібен перезапуск сервера."
                : "Збережено й кеш оновлено.");
            await loadBackups();
        } catch (error) {
            if (error.status === 409 || error.code === "content_conflict") {
                setToast("Конфлікт: файл змінився в іншій вкладці. Локальні зміни збережені в редакторі.", true);
            } else {
                setToast(`Не вдалося зберегти: ${error.code}`, true);
            }
        } finally {
            state.loading = false;
            updateControls();
        }
    }

    async function loadBackups() {
        if (!state.selected) return;
        try {
            const backups = await request(
                `${endpoint("backupsUrl")}/${encodeURIComponent(state.selected.key)}`);
            elements.backupList.replaceChildren();
            if (!backups.length) {
                elements.backupList.innerHTML = '<p class="owner-content-muted">Резервних копій ще немає.</p>';
                return;
            }
            backups.forEach(backup => {
                const row = document.createElement("div");
                row.className = "owner-content-backup";
                const date = document.createElement("strong");
                date.textContent = formatDate(backup.createdAtUtc);
                const metadata = document.createElement("span");
                metadata.textContent = `${backup.action} · ${formatBytes(backup.sizeBytes)} · ${backup.originalHash.slice(0, 12)}`;
                const restore = document.createElement("button");
                restore.type = "button";
                restore.textContent = "Restore";
                restore.addEventListener("click", () => restoreBackup(backup));
                row.append(date, metadata, restore);
                elements.backupList.append(row);
            });
        } catch (error) {
            setToast(`Не вдалося завантажити backups: ${error.code}`, true);
        }
    }

    async function restoreBackup(backup) {
        if (!state.selected) return;
        if (state.dirty &&
            !window.confirm("Локальні незбережені зміни буде втрачено. Продовжити restore?")) {
            return;
        }
        if (!window.confirm(`Відновити backup від ${formatDate(backup.createdAtUtc)}? Поточний стан також буде збережено.`)) {
            return;
        }
        state.loading = true;
        updateControls();
        try {
            await post(endpoint("restoreUrl"), {
                fileKey: state.selected.key,
                backupId: backup.backupId,
                expectedHash: state.currentHash,
                confirmation: true,
                commandId: crypto.randomUUID()
            });
            const selected = state.selected;
            setToast("Backup відновлено.");
            await selectFile(selected, true);
            await loadBackups();
        } catch (error) {
            setToast(error.status === 409
                ? "Restore скасовано: файл змінився на диску."
                : `Restore не виконано: ${error.code}`, true);
        } finally {
            state.loading = false;
            updateControls();
        }
    }

    function formatDocument() {
        try {
            elements.editor.value = JSON.stringify(JSON.parse(elements.editor.value), null, 2);
            setDirty(elements.editor.value !== state.originalContent);
            setToast("JSON відформатовано локально. Перевірте preview перед збереженням.");
        } catch {
            setToast("Неможливо форматувати невалідний JSON.", true);
        }
    }

    function updateCursor() {
        const beforeCursor = elements.editor.value.slice(0, elements.editor.selectionStart);
        const lines = beforeCursor.split("\n");
        elements.cursor.textContent = `Рядок ${lines.length}, колонка ${lines[lines.length - 1].length + 1}`;
    }

    elements.search.addEventListener("input", renderFiles);
    elements.editor.addEventListener("input", () => {
        setDirty(elements.editor.value !== state.originalContent);
        updateCursor();
    });
    elements.editor.addEventListener("click", updateCursor);
    elements.editor.addEventListener("keyup", updateCursor);
    elements.editor.addEventListener("keydown", event => {
        if (event.key === "Tab") {
            event.preventDefault();
            const start = elements.editor.selectionStart;
            const end = elements.editor.selectionEnd;
            elements.editor.setRangeText("  ", start, end, "end");
            setDirty(elements.editor.value !== state.originalContent);
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            previewChanges();
        }
    });
    elements.reload.addEventListener("click", () => selectFile(state.selected));
    elements.format.addEventListener("click", formatDocument);
    elements.validate.addEventListener("click", validateDocument);
    elements.preview.addEventListener("click", previewChanges);
    elements.save.addEventListener("click", saveDocument);
    elements.backups.addEventListener("click", loadBackups);
    window.addEventListener("beforeunload", event => {
        if (!state.dirty) return;
        event.preventDefault();
        event.returnValue = "";
    });

    updateControls();
    loadFiles();
})();
