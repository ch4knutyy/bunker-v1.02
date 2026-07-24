// Special card icon SVG registry — frozen key→SVG-path map for special card visual variants.
const specialCardIconSvgRegistry = Object.freeze({
	star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
	eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
	shield: '<path d="M12 2 4 5v6c0 5 3 9 8 11 5-2 8-6 8-11V5l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
	hand: '<path d="M6 12V7a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v7c0 5-3 8-8 8-4 0-7-2-8-6l-1-4a2 2 0 0 1 4-1l1 1Z"/>',
	swap: '<path d="m7 7 3-3-3-3M10 4H5a3 3 0 0 0-3 3v3M17 17l-3 3 3 3M14 20h5a3 3 0 0 0 3-3v-3"/><path d="M5 14h14M19 10H5"/>',
	dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
	refresh: '<path d="M20 7V3l-3 3a8 8 0 1 0 2 9M4 17v4l3-3"/>',
	globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
	warning: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
	backpack: '<path d="M7 8V6c0-5 10-5 10 0v2M5 8h14v13H5V8Z"/><path d="M8 13h8M3 11v7M21 11v7"/>',
	briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
	heart: '<path d="M12 21S3 16 3 9c0-5 6-7 9-3 3-4 9-2 9 3 0 7-9 12-9 12Z"/><path d="M7 12h3l2-4 2 8 2-4h2"/>',
	brain: '<path d="M9 4a3 3 0 0 0-5 3 4 4 0 0 0 0 7 3 3 0 0 0 5 4M15 4a3 3 0 0 1 5 3 4 4 0 0 1 0 7 3 3 0 0 1-5 4M9 4v16M15 4v16M9 8h3M12 15h3"/>'
});
