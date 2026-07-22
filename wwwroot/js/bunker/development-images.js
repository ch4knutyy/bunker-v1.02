// Завантаження зображення апокаліпсису
async function uploadApocalypseImage(input) {
	if (!input.files || !input.files[0]) return;

	const file = input.files[0];

	// Валідація розміру (5 MB)
	if (file.size > 5 * 1024 * 1024) {
		alert('Файл занадто великий. Максимум 5 MB');
		return;
	}

	// Валідація типу
	const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
	if (!allowedTypes.includes(file.type)) {
		alert('Непідтримуваний формат. Дозволено: JPG, PNG, WebP, GIF');
		return;
	}

	const formData = new FormData();
	formData.append('file', file);
	formData.append('roomId', currentRoom?.id || '');
	formData.append('apocalypseId', currentApocalypse?.id || '');

	try {
		const response = await fetch('/api/ScenarioImage/apocalypse', {
			method: 'POST',
			credentials: 'same-origin',
			body: formData
		});

		if (!response.ok) {
			const error = await response.json();
			alert(error.error || 'Помилка завантаження');
			return;
		}

		console.log('[uploadApocalypseImage] Success');
	} catch (error) {
		console.error('[uploadApocalypseImage] Error:', error);
		alert('Помилка завантаження зображення');
	}

	// Очищаємо input
	input.value = '';
}

// Завантаження зображення бункера
async function uploadBunkerImage(input) {
	if (!input.files || !input.files[0]) return;

	const file = input.files[0];

	// Валідація розміру (5 MB)
	if (file.size > 5 * 1024 * 1024) {
		alert('Файл занадто великий. Максимум 5 MB');
		return;
	}

	// Валідація типу
	const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
	if (!allowedTypes.includes(file.type)) {
		alert('Непідтримуваний формат. Дозволено: JPG, PNG, WebP, GIF');
		return;
	}

	const formData = new FormData();
	formData.append('file', file);
	formData.append('roomId', currentRoom?.id || '');
	formData.append('bunkerId', currentBunker?.id || currentBunker?.Id || '');

	try {
		const response = await fetch('/api/ScenarioImage/bunker', {
			method: 'POST',
			credentials: 'same-origin',
			body: formData
		});

		if (!response.ok) {
			const error = await response.json();
			alert(error.error || 'Помилка завантаження');
			return;
		}

		console.log('[uploadBunkerImage] Success');
	} catch (error) {
		console.error('[uploadBunkerImage] Error:', error);
		alert('Помилка завантаження зображення');
	}

	// Очищаємо input
	input.value = '';
}

// Завантаження зображення загрози
async function uploadThreatImage(input) {
	if (!input.files || !input.files[0]) return;
	if (!currentRoundState?.threatRevealed || !currentThreat) {
		alert(t('threatUnknownDescription'));
		input.value = '';
		return;
	}

	const file = input.files[0];

	if (file.size > 5 * 1024 * 1024) {
		alert('Файл занадто великий. Максимум 5 MB');
		input.value = '';
		return;
	}

	const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
	if (!allowedTypes.includes(file.type)) {
		alert('Непідтримуваний формат. Дозволено: JPG, PNG, WebP, GIF');
		input.value = '';
		return;
	}

	const formData = new FormData();
	formData.append('file', file);
	formData.append('roomId', currentRoom?.id || '');
	formData.append('threatId', currentThreat?.id || currentThreat?.Id || '');

	try {
		const response = await fetch('/api/ScenarioImage/threat', {
			method: 'POST',
			credentials: 'same-origin',
			body: formData
		});

		if (!response.ok) {
			const error = await response.json();
			alert(error.error || 'Помилка завантаження');
			return;
		}

		console.log('[uploadThreatImage] Success');
	} catch (error) {
		console.error('[uploadThreatImage] Error:', error);
		alert('Помилка завантаження зображення');
	}

	input.value = '';
}

// Видалення зображення апокаліпсису
async function removeApocalypseImage() {
	if (!confirm('Видалити зображення апокаліпсису?')) return;

	try {
		const params = new URLSearchParams({
			roomId: currentRoom?.id || '',
			apocalypseId: currentApocalypse?.id || ''
		});

		const response = await fetch(`/api/ScenarioImage/apocalypse?${params}`, {
			method: 'DELETE',
			credentials: 'same-origin'
		});

		if (!response.ok) {
			const error = await response.json();
			alert(error.error || 'Помилка видалення');
			return;
		}

		console.log('[removeApocalypseImage] Success');
	} catch (error) {
		console.error('[removeApocalypseImage] Error:', error);
		alert('Помилка видалення зображення');
	}
}

// Видалення зображення бункера
async function removeBunkerImage() {
	if (!confirm('Видалити зображення бункера?')) return;

	try {
		const params = new URLSearchParams({
			roomId: currentRoom?.id || '',
			bunkerId: currentBunker?.id || currentBunker?.Id || ''
		});

		const response = await fetch(`/api/ScenarioImage/bunker?${params}`, {
			method: 'DELETE',
			credentials: 'same-origin'
		});

		if (!response.ok) {
			const error = await response.json();
			alert(error.error || 'Помилка видалення');
			return;
		}

		console.log('[removeBunkerImage] Success');
	} catch (error) {
		console.error('[removeBunkerImage] Error:', error);
		alert('Помилка видалення зображення');
	}
}

// Видалення зображення загрози
async function removeThreatImage() {
	if (!currentRoundState?.threatRevealed || !currentThreat) {
		alert(t('threatUnknownDescription'));
		return;
	}

	if (!confirm('Видалити зображення загрози?')) return;

	try {
		const params = new URLSearchParams({
			roomId: currentRoom?.id || '',
			threatId: currentThreat?.id || currentThreat?.Id || ''
		});

		const response = await fetch(`/api/ScenarioImage/threat?${params}`, {
			method: 'DELETE',
			credentials: 'same-origin'
		});

		if (!response.ok) {
			const error = await response.json();
			alert(error.error || 'Помилка видалення');
			return;
		}

		console.log('[removeThreatImage] Success');
	} catch (error) {
		console.error('[removeThreatImage] Error:', error);
		alert('Помилка видалення зображення');
	}
}

// Генерація промпту для апокаліпсису
async function generateApocalypsePrompt() {
	try {
		const response = await fetch(`/api/ScenarioImage/apocalypse/prompt?roomId=${currentRoom?.id || ''}`, { credentials: 'same-origin' });

		if (!response.ok) {
			alert('Помилка отримання промпту');
			return;
		}

		const data = await response.json();
		showPromptModal('Промпт для апокаліпсису', data.prompt);
	} catch (error) {
		console.error('[generateApocalypsePrompt] Error:', error);
		alert('Помилка отримання промпту');
	}
}

// Генерація промпту для бункера
async function generateBunkerPrompt() {
	try {
		const response = await fetch(`/api/ScenarioImage/bunker/prompt?roomId=${currentRoom?.id || ''}`, { credentials: 'same-origin' });

		if (!response.ok) {
			alert('Помилка отримання промпту');
			return;
		}

		const data = await response.json();
		showPromptModal('Промпт для бункера', data.prompt);
	} catch (error) {
		console.error('[generateBunkerPrompt] Error:', error);
		alert('Помилка отримання промпту');
	}
}

// Генерація промпту для загрози
async function generateThreatPrompt() {
	if (!currentRoundState?.threatRevealed || !currentThreat) {
		alert(t('threatUnknownDescription'));
		return;
	}

	try {
		const response = await fetch(`/api/ScenarioImage/threat/prompt?roomId=${currentRoom?.id || ''}`, { credentials: 'same-origin' });

		if (!response.ok) {
			alert('Помилка отримання промпту');
			return;
		}

		const data = await response.json();
		showPromptModal(`${t('generatePrompt')}: ${t('threat')}`, data.prompt);
	} catch (error) {
		console.error('[generateThreatPrompt] Error:', error);
		alert('Помилка отримання промпту');
	}
}

// Показати модальне вікно з промптом
function showPromptModal(title, prompt) {
	// Створюємо модальне вікно якщо його немає
	let modal = document.getElementById('promptModal');
	if (!modal) {
		modal = document.createElement('div');
		modal.id = 'promptModal';
		modal.className = 'prompt-modal-overlay';
		modal.innerHTML = `
            <div class="prompt-modal">
                <div class="prompt-modal-header">
                    <h3 id="promptModalTitle"></h3>
                    <button class="prompt-modal-close" onclick="closePromptModal()">×</button>
                </div>
                <div class="prompt-modal-body">
                    <textarea id="promptModalText" readonly></textarea>
                    <button class="btn-copy-prompt" onclick="copyPromptToClipboard()">📋 Копіювати промпт</button>
                </div>
            </div>
        `;
		document.body.appendChild(modal);
	}

	document.getElementById('promptModalTitle').textContent = title;
	document.getElementById('promptModalText').value = prompt;
	modal.style.display = 'flex';
}

// Закрити модальне вікно з промптом
function closePromptModal() {
	const modal = document.getElementById('promptModal');
	if (modal) {
		modal.style.display = 'none';
	}
}

// Копіювати промпт в буфер обміну
function copyPromptToClipboard() {
	const textarea = document.getElementById('promptModalText');
	if (textarea) {
		textarea.select();
		document.execCommand('copy');

		// Показуємо підтвердження
		const btn = document.querySelector('.btn-copy-prompt');
		const originalText = btn.textContent;
		btn.textContent = '✓ Скопійовано!';
		setTimeout(() => { btn.textContent = originalText; }, 2000);
	}
}
