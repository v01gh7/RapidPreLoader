// === CONFIG ===
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 6 часов
const LS_PAGE_PREFIX = 'rapidAssetCache__';
const LS_META_KEY = 'rapidCacheMeta';

// === GLOBAL CACHE MAPS ===
const RapidCacheState = new Map(); // pageURL -> 'loading' | 'cached' | 'error'
const PreloadedAssets = new Set(); // assetURL -> true

// === RESTORE STATE FROM LOCALSTORAGE ===
try {
	const meta = JSON.parse(localStorage.getItem(LS_META_KEY) || '{}');
	if (meta.preloaded) meta.preloaded.forEach(a => PreloadedAssets.add(a));
	if (meta.state) Object.entries(meta.state).forEach(([url, state]) => RapidCacheState.set(url, state));
	console.log(`♻️ Restored cache state (${ PreloadedAssets.size } assets, ${ RapidCacheState.size } pages)`);
} catch {
	console.warn('⚠️ Failed to restore cache meta');
}

// === HELPERS ===
function saveMeta() {
	const meta = {
		preloaded: Array.from(PreloadedAssets),
		state: Object.fromEntries(RapidCacheState.entries()),
		time: Date.now(),
	};
	localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
}

function cleanLocalStorage() {
	console.log('🧹 Clearing localStorage...');
	localStorage.clear();
}

function normalizeUrl(url) {
	try {
		const u = new URL(url, location.origin);
		return u.href;
	} catch {
		return url;
	}
}

function correctAssetPath(assetPath) {
	if (!assetPath) return '';
	if (!assetPath.startsWith('http')) {
		if (assetPath[0] !== '/') assetPath = '/' + assetPath;
		assetPath = location.origin + assetPath;
	}
	return normalizeUrl(assetPath);
}

function isItPageUrl(url) {
	return !/\.(css|js|jpg|jpeg|png|gif|webp|avif)$/i.test(url);
}

// === TTL CHECKER ===
function isCacheValid(url) {
	const key = `${ LS_PAGE_PREFIX }${ url }`;
	const stored = localStorage.getItem(key);
	if (!stored) return false;

	try {
		const data = JSON.parse(stored);
		if (!data.timestamp || !data.assets) return false;
		const expired = Date.now() - data.timestamp > CACHE_TTL_MS;
		return !expired;
	} catch {
		return false;
	}
}

// === CLEANUP OLD CACHES ===
function cleanupExpiredCaches() {
	const now = Date.now();
	const keysToDelete = [];

	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key && key.startsWith(LS_PAGE_PREFIX)) {
			try {
				const data = JSON.parse(localStorage.getItem(key));
				if (!data?.timestamp || now - data.timestamp > CACHE_TTL_MS) {
					keysToDelete.push(key);
				}
			} catch {
				keysToDelete.push(key);
			}
		}
	}

	if (keysToDelete.length) {
		console.log(`🧼 Removing ${ keysToDelete.length } expired caches...`);
		keysToDelete.forEach(k => localStorage.removeItem(k));
		saveMeta();
	}
}

// === CORE LOADER ===
async function handleProcessingAssetsFromUrl(url) {
	if (!isItPageUrl(url)) return [];
	if (!url) return [];

	url = normalizeUrl(url);

	// Проверяем TTL и наличие кэша
	if (isCacheValid(url)) {
		const cached = JSON.parse(localStorage.getItem(`${ LS_PAGE_PREFIX }${ url }`));
		console.log(`📦 Using cached assets for: ${ url }`);
		RapidCacheState.set(url, 'cached');
		return cached.assets;
	}

	if (RapidCacheState.get(url) === 'loading') {
		console.log(`⏳ Already loading: ${ url }`);
		return [];
	}

	RapidCacheState.set(url, 'loading');

	try {
		const response = await fetch(url, { method: 'GET', credentials: 'omit' });
		if (!response.ok) throw new Error(`HTTP ${ response.status }`);
		const html = await response.text();

		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');

		const images = [...doc.querySelectorAll('img[src], img[data-src]')].flatMap(img => {
			let rawSrc = img.getAttribute('src');
			if (rawSrc?.startsWith('data:image')) rawSrc = img.dataset.src || rawSrc;
			else rawSrc = rawSrc || img.dataset.src;
			if (!rawSrc) return [];

			const src = correctAssetPath(rawSrc);
			if (!src) return [];

			const result = [src];
			const match = src.match(/(.*)\.(jpg|jpeg|png|gif|webp|avif)(?:\.(webp|avif))$/i);
			if (match) {
				const base = match[1];
				const firstExt = match[2];
				const secondExt = match[3];
				result.push(`${ base }.${ firstExt }`, `${ base }.${ secondExt }`);
			} else {
				const baseMatch = src.match(/(.*)\.(jpg|jpeg|png)$/i);
				if (baseMatch) result.push(`${ baseMatch[1] }.webp`);
			}
			return [...new Set(result.map(correctAssetPath))];
		});

		const css = [...doc.querySelectorAll('link[rel="stylesheet"][href]')].map(link => correctAssetPath(link.href));
		const scripts = [...doc.querySelectorAll('script[src]')].map(script => correctAssetPath(script.src));
		const allAssets = [...new Set([...images, ...css, ...scripts].filter(Boolean))];

		try {
			localStorage.setItem(`${ LS_PAGE_PREFIX }${ url }`, JSON.stringify({ timestamp: Date.now(), assets: allAssets }));
			RapidCacheState.set(url, 'cached');
			saveMeta();
		} catch (e) {
			console.warn('⚠️ LocalStorage full — cleaning...');
			cleanLocalStorage();
		}

		return allAssets;
	} catch (error) {
		console.error(`❌ Error fetching ${ url }:`, error.message);
		RapidCacheState.set(url, 'error');
		return [];
	}
}

// === PRELOADERS ===
const preloadAsset = src =>
	new Promise(resolve => {
		if (!src) return resolve();
		src = normalizeUrl(src);
		if (PreloadedAssets.has(src)) return resolve();

		const markDone = () => {
			PreloadedAssets.add(src);
			saveMeta();
			resolve();
		};

		if (src.endsWith('.js')) {
			const s = document.createElement('script');
			s.src = src;
			s.async = true;
			s.onload = markDone;
			s.onerror = markDone;
			document.head.appendChild(s);
		} else if (src.endsWith('.css')) {
			const l = document.createElement('link');
			l.rel = 'stylesheet';
			l.href = src;
			l.onload = markDone;
			l.onerror = markDone;
			document.head.appendChild(l);
		} else {
			const img = new Image();
			img.onload = markDone;
			img.onerror = markDone;
			img.src = src;
		}
	});

async function handleAssetsPreloading(assets) {
	if (!assets?.length) return;
	const newAssets = assets.filter(src => !PreloadedAssets.has(normalizeUrl(src)));
	if (!newAssets.length) return;
	console.log(`🌀 Preloading ${ newAssets.length } new assets...`);
	await Promise.all(newAssets.map(preloadAsset));
	console.log(`✅ Finished preloading (${ newAssets.length })`);
	saveMeta();
}

// === EVENT LISTENERS ===
document.addEventListener('mouseover', e => {
	const a = e.target.closest('a');
	if (!a?.href || !a.href.includes(location.origin) || a.dataset.preloading) return;

	a.dataset.preloading = 'true';
	if (isItPageUrl(a.href)) {
		handleProcessingAssetsFromUrl(a.href)
			.then(handleAssetsPreloading)
			.finally(() => setTimeout(() => delete a.dataset.preloading, 2000));
	}
});

// === PAGINATION AUTO PRELOAD ===
(async () => {
	cleanupExpiredCaches(); // 🧹 вызываем при старте
	const rapidPreLoadAllPages = true;
	let links = [...document.querySelectorAll('a[href*="page-"], a[href*="?page="]')];
	if (!rapidPreLoadAllPages && links.length > 1) links = [links[0]];
	for (const link of links) {
		if (isItPageUrl(link.href)) {
			const assets = await handleProcessingAssetsFromUrl(link.href);
			await handleAssetsPreloading(assets);
		}
	}
})();

// === FULL SITE PRELOAD ===
async function preloadAllSiteContent() {
	console.log('🌍 Starting full site preloading...');
	const allLinks = [...document.querySelectorAll('a[href]')]
		.map(a => a.href)
		.filter(h => h.includes(location.origin));

	const uniqueLinks = [...new Set(allLinks)];
	let i = 0;
	for (const url of uniqueLinks) {
		if (!isItPageUrl(url)) continue;
		i++;
		console.log(`➡️ [${ i }/${ uniqueLinks.length }] Preloading page: ${ url }`);
		const assets = await handleProcessingAssetsFromUrl(url);
		await handleAssetsPreloading(assets);
	}
	console.log('✅ Finished full site preloading!');
	saveMeta();
}

window.addEventListener('load', () => {
	cleanupExpiredCaches(); // 🧽 вызываем ещё раз при загрузке
	setTimeout(preloadAllSiteContent, 3000);
});
