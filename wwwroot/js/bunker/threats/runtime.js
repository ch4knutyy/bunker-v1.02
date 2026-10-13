// Narrative threat renderer. Interactive operations are archived and are not loaded.
function normalizeThreatState(source) {
    if (!source) return null;
    return {
        currentThreatId: source.currentThreatId || source.CurrentThreatId || '',
        threatStatus: source.threatStatus || source.ThreatStatus || 'revealed'
    };
}

function getThreatText(threat, field) {
    return getLocalizedValue(threat, field) ||
        threat?.[field] ||
        threat?.[field.charAt(0).toUpperCase() + field.slice(1)] ||
        '';
}

function renderThreatPanel(threat) {
    const panel = document.getElementById('threatPanel');
    if (!panel) return;

    if (!threat) {
        panel.hidden = true;
        panel.style.display = 'none';
        panel.replaceChildren();
        return;
    }

    const name = getThreatText(threat, 'name') || t('threat');
    const description = getThreatText(threat, 'description') || getThreatText(threat, 'shortDescription');
    const imageUrl = threat.imageUrl || threat.ImageUrl || threat.uploadedImagePath || threat.UploadedImagePath;
    const article = document.createElement('article');
    article.className = 'threat-story';

    const title = document.createElement('h3');
    title.className = 'threat-panel-title';
    title.textContent = name;
    article.append(title);

    if (description) {
        const details = document.createElement('p');
        details.className = 'threat-description';
        details.textContent = description;
        article.append(details);
    }

    if (imageUrl) {
        const image = document.createElement('img');
        image.className = 'threat-story-image';
        image.src = imageUrl;
        image.alt = name;
        article.append(image);
    }

    panel.hidden = false;
    panel.style.display = '';
    panel.replaceChildren(article);
}
