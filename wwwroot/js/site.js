function restoreVisibleSections() {
    const ids = [
        "gameArea",
        "playersSection",
        "developerMenu"
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = "block";
            el.style.visibility = "visible";
            el.classList.remove("hidden", "d-none");
        }
    });
}

function safeRenderAll() {
    try {
        if (typeof renderPlayersTable === "function") {
            renderPlayersTable();
        }
    } catch (e) {
        console.error("renderPlayersTable failed", e);
    }

    try {
        if (typeof updateDeveloperMenu === "function") {
            updateDeveloperMenu();
        }
    } catch (e) {
        console.error("updateDeveloperMenu failed", e);
    }
}
