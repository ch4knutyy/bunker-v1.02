// Characteristic and profession icon registries — frozen metadata for card UI rendering.
const characteristicIconRegistry = Object.freeze({
	personality: 'user', body: 'body', profession: 'briefcase', physicalHealth: 'heart', mentalHealth: 'brain',
	hobby: 'star', characterTrait: 'mask', phobia: 'eye', inventory: 'backpack', property: 'home', fact: 'document'
});

const professionIconRegistry = Object.freeze({
	violin: 'violin', string_instrument: 'violin', guitar: 'guitar', music: 'music', medical: 'medical', medicine: 'medical', healthcare: 'medical',
	engineering: 'engineering', engineer: 'engineering', military: 'shield', agriculture: 'wheat', transport: 'steeringWheel', science: 'flask',
	technology: 'cpu', education: 'book', construction: 'hammer', law: 'scales', food: 'utensils', restaurant: 'cloche', hospitality: 'cloche',
	food_service: 'cloche', service: 'serviceBell', chef: 'chefHat', waiter: 'serviceBell', generic: 'briefcase'
});

const characteristicIconSvgRegistry = Object.freeze({
	user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7"/>',
	body: '<path d="M8 3h8l2 6-3 12H9L6 9l2-6Z"/><path d="M8 8h8M9 14h6"/>',
	briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/>',
	violin: '<path d="M15 3c-2 1-2 4-1 6l-4 4c-2-1-5-1-6 1s1 6 4 6c2 0 3-2 3-4l4-4c2 1 5 0 5-2 0-3-3-5-5-4"/><path d="m16 8 5-5M18 5l2 2"/>',
	guitar: '<path d="m15 3 6 6-3 3-2-2-5 5c1 3-2 6-5 5s-3-5-1-7 4-2 6-1l5-5-2-2 1-3Z"/>',
	music: '<path d="M9 18V5l11-2v13M9 8l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
	medical: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
	engineering: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
	shield: '<path d="M12 2 20 5v6c0 5-3 9-8 11-5-2-8-6-8-11V5l8-3Z"/>',
	wheat: '<path d="M12 22V6M12 10C7 9 6 6 6 4c4 0 6 2 6 6ZM12 15c-5-1-6-4-6-6 4 0 6 2 6 6ZM12 10c5-1 6-4 6-6-4 0-6 2-6 6ZM12 15c5-1 6-4 6-6-4 0-6 2-6 6Z"/>',
	steeringWheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M3 11h18M12 14v7M10 10 6 6M14 10l4-4"/>',
	flask: '<path d="M9 2h6M10 2v6l-6 11c-.5 1 .2 2 1.5 2h13c1.3 0 2-1 1.5-2L14 8V2M7 15h10"/>',
	cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M18 9h5M1 15h5M18 15h5"/>',
	book: '<path d="M3 4h7c2 0 2 2 2 2v15s0-2-2-2H3V4Zm18 0h-7c-2 0-2 2-2 2v15s0-2 2-2h7V4Z"/>',
	hammer: '<path d="m4 20 9-9M10 4l3-2 7 7-2 3-8-8ZM2 18l4 4"/>',
	scales: '<path d="M12 3v18M6 21h12M4 7h16M7 7 3 14h8L7 7Zm10 0-4 7h8l-4-7Z"/>',
	utensils: '<path d="M6 2v8M3 2v5c0 2 6 2 6 0V2M6 10v12M16 2v20M16 2c5 3 5 9 0 11"/>',
	cloche: '<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 7V5M9 5h6"/>',
	serviceBell: '<path d="M4 17h16M6 17c0-5 2-8 6-8s6 3 6 8M12 9V7M9 7h6M3 20h18"/>',
	chefHat: '<path d="M7 11a4 4 0 1 1 2-7 4 4 0 0 1 7 0 4 4 0 1 1 2 7v9H6v-9M9 15v5M15 15v5"/>',
	heart: '<path d="M12 21S3 16 3 9c0-5 6-7 9-3 3-4 9-2 9 3 0 7-9 12-9 12Z"/><path d="M7 12h3l2-4 2 8 2-4h2"/>',
	brain: '<path d="M9 4a3 3 0 0 0-5 3 4 4 0 0 0 0 7 3 3 0 0 0 5 4M15 4a3 3 0 0 1 5 3 4 4 0 0 1 0 7 3 3 0 0 1-5 4M9 4v16M15 4v16M9 8h3M12 15h3"/>',
	star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
	mask: '<path d="M3 5c6-3 12-3 18 0v7c0 6-5 10-9 10S3 18 3 12V5Z"/><path d="M6 10c2-2 4-2 5 0M13 10c2-2 4-2 5 0M9 16c2 1 4 1 6 0"/>',
	eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
	backpack: '<path d="M7 8V6c0-5 10-5 10 0v2M5 8h14v13H5V8Z"/><path d="M8 13h8M3 11v7M21 11v7"/>',
	home: '<path d="m3 11 9-8 9 8v10H3V11Z"/><path d="M9 21v-7h6v7M7 10h10"/>',
	document: '<path d="M6 2h9l4 4v16H6V2Z"/><path d="M14 2v5h5M9 12h7M9 16h7"/>'
	, lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>'
});

const publicCharacteristicDefinitions = Object.freeze([
	{ key: 'personality', labelKey: 'personality', icon: 'user' },
	{ key: 'body', labelKey: 'body', icon: 'body' },
	{ key: 'profession', labelKey: 'profession', icon: 'briefcase' },
	{ key: 'physicalHealth', labelKey: 'physicalHealth', icon: 'heart' },
	{ key: 'mentalHealth', labelKey: 'mentalHealth', icon: 'brain' },
	{ key: 'hobby', labelKey: 'hobby', icon: 'star' },
	{ key: 'characterTrait', labelKey: 'characterTrait', icon: 'mask' },
	{ key: 'phobia', labelKey: 'phobia', icon: 'eye' },
	{ key: 'inventory', labelKey: 'inventory', icon: 'backpack' },
	{ key: 'property', labelKey: 'property', icon: 'home' },
	{ key: 'fact', labelKey: 'fact', icon: 'document' }
]);
