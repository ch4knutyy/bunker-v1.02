// ==================== APOCALYPSE MUTABLE STATE ====================

const apocalypseReactionTimers = new Map();
let apocalypseEffectBannerTimer = null;
let apocalypseAmbientSchedulerTimer = null;
let apocalypseAmbientEventTimer = null;
let activeApocalypseCategoryProfile = null;
let lastApocalypseAmbientEventType = '';
let apocalypseParallaxTimer = null;
let apocalypseParallaxInitialized = false;
let apocalypsePendingPointer = null;
let lastApocalypseCardRevealKey = '';
let apocalypseCardRevealTimer = null;
