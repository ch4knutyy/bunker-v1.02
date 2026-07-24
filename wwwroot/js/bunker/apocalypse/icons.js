// ==================== APOCALYPSE ICON REGISTRIES ====================

const apocalypseIconSvgRegistry = Object.freeze({
	nuclear: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="7"/><path d="M29 25 18 7A28 28 0 0 1 46 7L35 25a10 10 0 0 0-6 0ZM38 31h21a28 28 0 0 1-14 24L35 38a10 10 0 0 0 3-7ZM29 38 19 55A28 28 0 0 1 5 31h21a10 10 0 0 0 3 7Z"/></svg>',
	biological: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="6"/><path d="M32 26c-8-14-24-9-24 5h17M38 32c16 0 19 16 7 23l-8-15M29 38c-8 14-24 8-24-6h17" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="4"/></svg>',
	climate: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 37h40a11 11 0 0 0-4-21 16 16 0 0 0-30 7A8 8 0 0 0 9 37Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="m18 46-4 8m18-8-4 8m18-8-4 8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
	cosmic: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="31" cy="32" r="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M7 42c9 7 29 4 43-7 7-6 9-11 6-14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="49" cy="10" r="3"/></svg>',
	ai: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="14" width="36" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 25h16v14H24zM6 24h8M6 40h8M50 24h8M50 40h8M24 6v8M40 6v8M24 50v8M40 50v8" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	alien: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 7c15 0 23 10 19 25-3 13-12 24-19 25-7-1-16-12-19-25C9 17 17 7 32 7Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M18 27c7-3 11 1 12 9-7 1-11-2-12-9Zm28 0c-7-3-11 1-12 9 7 1 11-2 12-9ZM26 46h12" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
	fungal: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 32C15 16 25 8 36 9c12 1 19 10 20 23H13Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M27 32c2 8 1 15-4 22h21c-5-7-6-14-4-22" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="25" cy="23" r="2"/><circle cx="39" cy="18" r="2"/><circle cx="47" cy="26" r="2"/></svg>',
	zombie: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 48c-5-6-8-13-8-21C10 14 20 6 32 6s22 8 22 21c0 8-3 15-8 21v8H18v-8Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="m20 28 9 5-9 4m24-9-9 5 9 4M28 45h8M25 56v-7m14 7v-7" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	mystical: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M5 32s10-17 27-17 27 17 27 17-10 17-27 17S5 32 5 32Z" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 4v7M8 9l6 6m42-6-6 6M32 53v7" stroke="currentColor" stroke-width="3"/></svg>',
	anomaly: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 5 8 17 19 2-14 13 4 19-17-9-17 9 4-19L5 24l19-2 8-17Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="m25 20 14 24M40 18 23 45" stroke="currentColor" stroke-width="3"/></svg>',
	collapse: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 57h46M15 57V13h19v44M34 24h15v33M21 21h7m-7 10h7m-7 10h7m19-9-8 8 7 6-9 11" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	generic: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 59 55H5L32 6Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 22v17m0 8v2" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>'
});

const apocalypseCategoryIconRegistry = Object.freeze({
	armageddon: 'nuclear', weather: 'climate', biological: 'biological', geological: 'collapse', cosmic: 'cosmic',
	technology: 'ai', ecological: 'collapse', social: 'collapse', anomaly: 'anomaly', supernatural: 'mystical'
});
