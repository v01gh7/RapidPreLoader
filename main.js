
// === GLOBAL CACHE MAP ===
const RapidCacheState = new Map(); // key: url, value: 'loading' | 'cached' | 'error'

// === HELPERS ===
function cleanLocalStorage() {
	console.log('Clearing localStorage...');
	localStorage.clear();
}

function correctAssetPath(imagePath) {
	if (!imagePath) return '';
	if (!imagePath.includes('http') && !imagePath.includes(location.origin)) {
		if (imagePath[0] !== '/') imagePath = '/' + imagePath;
		imagePath = location.origin + imagePath;
	}
	return imagePath;
}

// === CORE LOADER ===
async function handleProccesingAssetFromUrl(url) {
	if (!url) return [];
	if (RapidCacheState.get(url) === 'loading') {
		console.log(`Skipping: already loading ${ url }`);
		return [];
	}
	if (RapidCacheState.get(url) === 'cached') {
		console.log(`Loaded from cache state: ${ url }`);
		const cached = localStorage.getItem(`rapidImageCacher__${ url }`);
		if (cached) return JSON.parse(cached);
	}

	RapidCacheState.set(url, 'loading');
	const cacheName = `rapidImageCacher__${ url }`;

	try {
		// localStorage cache
		const cachedImagesSrcs = localStorage.getItem(cacheName);
		if (cachedImagesSrcs) {
			RapidCacheState.set(url, 'cached');
			return JSON.parse(cachedImagesSrcs);
		}

		const response = await fetch(url);
		const html = await response.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');

		const images = [...doc.querySelectorAll('img[src], img[data-src]')]
			.map(img => correctAssetPath(img.src || img.dataset.src));

		const css = [...doc.querySelectorAll('link[rel="stylesheet"]')]
			.map(link => correctAssetPath(link.href));

		const scripts = [...doc.querySelectorAll('script[src]')]
			.map(script => correctAssetPath(script.src));

		const allAssets = [...images, ...css, ...scripts].filter(Boolean);

		try {
			localStorage.setItem(cacheName, JSON.stringify(allAssets));
			RapidCacheState.set(url, 'cached');
		} catch (e) {
			console.warn('LocalStorage full — cleaning...');
			cleanLocalStorage();
		}

		return allAssets;
	} catch (error) {
		console.error('Error fetching:', url, error);
		RapidCacheState.set(url, 'error');
		return [];
	}
}

// === PRELOADERS ===
const preloadAsset = src =>
	new Promise(resolve => {
		if (!src) return resolve();
		if (src.endsWith('.js')) {
			const s = document.createElement('script');
			s.src = src;
			s.onload = resolve;
			s.onerror = resolve;
			document.head.appendChild(s);
		} else if (src.endsWith('.css')) {
			const l = document.createElement('link');
			l.rel = 'stylesheet';
			l.href = src;
			l.onload = resolve;
			l.onerror = resolve;
			document.head.appendChild(l);
		} else {
			const img = new Image();
			img.onload = resolve;
			img.onerror = resolve;
			img.src = src;
		}
	});

async function handleImagesPreloading(assets) {
	if (!assets?.length) return;
	console.log(`Preloading ${ assets.length } assets...`);
	await Promise.all(assets.map(src => preloadAsset(src)));
	console.log('✅ Preloaded:', assets.length);
}

// === MAIN LISTENERS ===
document.addEventListener('mouseover', e => {
	const a = e.target.closest('a');
	if (!a || !a.href) return;
	if (!a.href.includes(location.origin)) return;
	if (a.dataset.preloading) return; // don't double trigger

	a.dataset.preloading = 'true';
	handleProccesingAssetFromUrl(a.href)
		.then(assets => handleImagesPreloading(assets))
		.finally(() => {
			setTimeout(() => delete a.dataset.preloading, 2000);
		});
});

// === OPTIONAL: preload pagination or other known links ===
(async () => {
	const rapidPreLoadAllPages = true;
	let links = [...document.querySelectorAll('a[href*="page-"], a[href*="?page="]')];
	if (!rapidPreLoadAllPages && links.length > 1) links = [links[0]];
	for (const link of links) {
		const assets = await handleProccesingAssetFromUrl(link.href);
		await handleImagesPreloading(assets);
	}
})();

// === NEW FEATURE: preload all links on the site ===
async function preloadAllSiteContent() {
	console.log('???? Starting full site preloading...');
	const allLinks = [...document.querySelectorAll('a[href]')]
		.map(a => a.href)
		.filter(h => h.includes(location.origin));

	const uniqueLinks = [...new Set(allLinks)];
	for (const url of uniqueLinks) {
		console.log(`➡️ Preloading page: ${ url }`);
		const assets = await handleProccesingAssetFromUrl(url);
		await handleImagesPreloading(assets);
	}
	console.log('✅ Finished full site preloading!');
}
