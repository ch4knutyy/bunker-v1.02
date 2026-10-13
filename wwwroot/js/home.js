(function () {
    const sessionKeys = [
        'bunker_roomId', 'bunker_playerName', 'bunker_hostToken', 'bunker_isHost',
        'currentRoomId', 'currentPlayerId', 'currentRoom', 'playerCharacter', 'currentPlayerCharacter'
    ];
    const labels = { uk: { room: 'Кімната' }, en: { room: 'Room' }, ru: { room: 'Комната' } };

    function currentLanguage() {
        const language = localStorage.getItem('language');
        return Object.prototype.hasOwnProperty.call(labels, language) ? language : 'uk';
    }

    function getSession() {
        return {
            roomId: sessionStorage.getItem('bunker_roomId') || localStorage.getItem('bunker_roomId') || '',
            playerName: sessionStorage.getItem('bunker_playerName') || localStorage.getItem('bunker_playerName') || ''
        };
    }

    function renderSession() {
        const session = getSession();
        const sessionBlock = document.getElementById('previousSession');
        const sessionName = document.getElementById('previousSessionName');
        const sessionRoom = document.getElementById('previousSessionRoom');
        if (!sessionBlock) return;

        sessionBlock.hidden = !(session.roomId && session.playerName);
        if (sessionName) sessionName.textContent = session.playerName || '-';
        if (sessionRoom) sessionRoom.textContent = session.roomId ? `${labels[currentLanguage()].room} ${session.roomId}` : '-';
    }

    function forgetSession() {
        sessionKeys.forEach(function (key) {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
        });
        renderSession();
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.getElementById('previousSessionForget')?.addEventListener('click', forgetSession);
        renderSession();
        window.addEventListener('bunker:language-changed', renderSession);
    });
})();
