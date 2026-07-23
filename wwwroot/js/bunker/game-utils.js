// ==================== GLOBAL HELPER FUNCTIONS ====================

// Escape HTML to prevent XSS
function escapeHtml(text) {
	if (text == null) return '';
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// ==================== NAME VALIDATION ====================

// Sanitize player name input - max 10 chars
function sanitizeNameInput(input) {
	// Trim and limit to 10 characters
	let value = input.value;
	if (value.length > 10) {
		input.value = value.substring(0, 10);
	}
}

window.escapeHtml = escapeHtml;
window.sanitizeNameInput = sanitizeNameInput;
