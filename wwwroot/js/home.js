(function () {
    const profileKey = 'bunker_profile';
    const sessionKeys = [
        'bunker_roomId',
        'bunker_playerName',
        'bunker_hostToken',
        'bunker_isHost',
        'currentRoomId',
        'currentPlayerId',
        'currentRoom',
        'playerCharacter',
        'currentPlayerCharacter'
    ];

    const defaults = {
        name: '',
        avatar: '◎',
        color: '#d89b2b',
        language: 'uk'
    };

    const layoutChangeLanguage = window.changeLanguage;

    function getStoredProfile() {
        try {
            return JSON.parse(localStorage.getItem(profileKey) || '{}') || {};
        } catch (error) {
            return {};
        }
    }

    function normalizeLanguage(lang) {
        if (lang === 'gb') return 'en';
        return ['uk', 'ru', 'en'].includes(lang) ? lang : 'uk';
    }

    function getProfile() {
        const stored = getStoredProfile();
        const language = normalizeLanguage(localStorage.getItem('language') || stored.language || defaults.language);
        const name = stored.name || localStorage.getItem('bunker_lastPlayerName') || localStorage.getItem('bunker_playerName') || '';

        return {
            name,
            avatar: stored.avatar || defaults.avatar,
            color: stored.color || defaults.color,
            language
        };
    }

    function getSession() {
        return {
            roomId: sessionStorage.getItem('bunker_roomId') || localStorage.getItem('bunker_roomId') || '',
            playerName: sessionStorage.getItem('bunker_playerName') || localStorage.getItem('bunker_playerName') || '',
        };
    }

    function validateProfileName(name) {
        const normalized = (name || '').trim();
        if (!normalized) {
            return { valid: false, error: 'Введіть ім’я гравця' };
        }
        if (normalized.length > 10) {
            return { valid: false, error: 'Ім’я гравця не може перевищувати 10 символів' };
        }
        return { valid: true, name: normalized };
    }

    function saveProfile(profile) {
        const normalized = {
            name: (profile.name || '').trim().slice(0, 10),
            avatar: profile.avatar || defaults.avatar,
            color: profile.color || defaults.color,
            language: normalizeLanguage(profile.language)
        };

        localStorage.setItem(profileKey, JSON.stringify(normalized));
        localStorage.setItem('language', normalized.language);

        if (normalized.name) {
            localStorage.setItem('bunker_lastPlayerName', normalized.name);
        }

        return normalized;
    }

    function forgetSession() {
        sessionKeys.forEach(function (key) {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
        });

        renderSession();
        renderProfile();
    }

    function applyLanguageButtons(lang) {
        const normalized = normalizeLanguage(lang);

        if (typeof layoutChangeLanguage === 'function') {
            layoutChangeLanguage(normalized);
        } else {
            document.querySelectorAll('.language-btn').forEach(function (button) {
                button.classList.toggle('active', button.dataset.lang === normalized);
            });
        }
    }

    function setLanguage(lang) {
        const normalized = normalizeLanguage(lang);
        localStorage.setItem('language', normalized);
        applyLanguageButtons(normalized);
    }

    function renderProfile() {
        const profile = getProfile();
        const session = getSession();

        const nameInput = document.getElementById('profileName');
        const languageInput = document.getElementById('profileLanguage');
        const avatarPreview = document.getElementById('profileAvatarPreview');
        const namePreview = document.getElementById('profileNamePreview');
        const languagePreview = document.getElementById('profileLanguagePreview');
        const lastRoom = document.getElementById('profileLastRoom');

        if (nameInput && nameInput.dataset.dirty !== 'true') nameInput.value = profile.name;
        if (languageInput) languageInput.value = profile.language;
        if (avatarPreview) {
            avatarPreview.textContent = profile.avatar;
            avatarPreview.style.color = profile.color;
        }
        if (namePreview) namePreview.textContent = profile.name || 'Гравець';
        if (languagePreview) languagePreview.textContent = profile.language.toUpperCase();
        if (lastRoom) lastRoom.textContent = session.roomId ? `Кімната ${session.roomId}` : 'Немає';

        document.querySelectorAll('.avatar-option').forEach(function (button) {
            button.classList.toggle('is-selected', button.dataset.avatar === profile.avatar);
        });

        document.querySelectorAll('.color-option').forEach(function (button) {
            button.classList.toggle('is-selected', button.dataset.color === profile.color);
        });
    }

    function renderSession() {
        const session = getSession();
        const sessionBlock = document.getElementById('previousSession');
        const sessionName = document.getElementById('previousSessionName');
        const sessionRoom = document.getElementById('previousSessionRoom');

        if (!sessionBlock) return;

        const hasSession = !!(session.roomId && session.playerName);
        sessionBlock.hidden = !hasSession;

        if (sessionName) sessionName.textContent = session.playerName || '-';
        if (sessionRoom) sessionRoom.textContent = session.roomId ? `Кімната ${session.roomId}` : '-';
    }

    function bindProfileForm() {
        const form = document.getElementById('playerProfileForm');
        if (!form) return;

        form.addEventListener('submit', function (event) {
            event.preventDefault();

            const current = getProfile();
            const nameValidation = validateProfileName(document.getElementById('profileName')?.value || '');
            if (!nameValidation.valid) {
                alert(nameValidation.error);
                document.getElementById('profileName')?.focus();
                return;
            }

            const saved = saveProfile({
                name: nameValidation.name,
                avatar: current.avatar,
                color: current.color,
                language: document.getElementById('profileLanguage')?.value || current.language
            });

            const profileNameInput = document.getElementById('profileName');
            if (profileNameInput) delete profileNameInput.dataset.dirty;
            setLanguage(saved.language);
            renderProfile();

            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                const originalText = submitButton.textContent;
                submitButton.textContent = 'Збережено';
                window.setTimeout(function () {
                    submitButton.textContent = originalText;
                }, 1400);
            }
        });

        const nameInput = document.getElementById('profileName');
        if (nameInput) {
            nameInput.addEventListener('input', function () {
                nameInput.dataset.dirty = 'true';

                if (nameInput.value.length > 10) {
                    nameInput.value = nameInput.value.slice(0, 10);
                }

                const namePreview = document.getElementById('profileNamePreview');
                if (namePreview) namePreview.textContent = nameInput.value.trim() || 'Гравець';
            });
        }

        const languageInput = document.getElementById('profileLanguage');
        if (languageInput) {
            languageInput.addEventListener('change', function () {
                const current = getProfile();
                const saved = saveProfile({ ...current, language: languageInput.value });
                setLanguage(saved.language);
                renderProfile();
            });
        }

        document.querySelectorAll('.avatar-option').forEach(function (button) {
            button.addEventListener('click', function () {
                const current = getProfile();
                saveProfile({ ...current, avatar: button.dataset.avatar });
                renderProfile();
            });
        });

        document.querySelectorAll('.color-option').forEach(function (button) {
            button.addEventListener('click', function () {
                const current = getProfile();
                saveProfile({ ...current, color: button.dataset.color });
                renderProfile();
            });
        });

        document.getElementById('forgetSessionBtn')?.addEventListener('click', forgetSession);
        document.getElementById('previousSessionForget')?.addEventListener('click', forgetSession);
    }

    window.changeLanguage = function (lang) {
        const current = getProfile();
        const saved = saveProfile({ ...current, language: normalizeLanguage(lang) });
        applyLanguageButtons(saved.language);
        renderProfile();
    };

    document.addEventListener('DOMContentLoaded', function () {
        const profile = saveProfile(getProfile());
        setLanguage(profile.language);
        bindProfileForm();
        renderProfile();
        renderSession();
    });
})();
