// === GLOBAL CACHE MAPS ===
const RapidCacheState = new Map(); // pageURL -> 'loading' | 'cached' | 'error'
const PreloadedAssets = new Set(); // assetURL -> true (глобальный кэш всех ассетов)

// === HELPERS ===
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

// === CORE LOADER ===
async function handleProcessingAssetsFromUrl(url) {
	if (!url) return [];


	url = normalizeUrl(url);
	if (RapidCacheState.get(url) === 'loading') {
		console.log(`⏳ Skipping — already loading: ${ url }`);
		return [];
	}
	if (RapidCacheState.get(url) === 'cached') {
		const cached = localStorage.getItem(`rapidAssetCache__${ url }`);
		if (cached) {
			console.log(`📦 Loaded from page cache: ${ url }`);
			return JSON.parse(cached);
		}
	}

	RapidCacheState.set(url, 'loading');
	const cacheKey = `rapidAssetCache__${ url }`;

	try {
		const response = await fetch(url, { method: 'GET', credentials: 'omit' });
		if (!response.ok) throw new Error(`HTTP ${ response.status }`);
		const html = await response.text();

		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');

		const images = [...doc.querySelectorAll('img[src], img[data-src]')]
			.flatMap(img => {
				
				let rawSrc = img.getAttribute('src');
				// если src — base64, то берём data-src
				if (rawSrc?.startsWith('data:image')) {
					rawSrc = img.dataset.src || rawSrc;
				} else {
					rawSrc = rawSrc || img.dataset.src;
				}

				if (!rawSrc) return [];				
				
				const src = correctAssetPath(rawSrc);
				if (!src) return [];

				const result = [src];

				// Проверяем наличие двойного расширения (например .jpg.webp)
				const match = src.match(/(.*)\.(jpg|jpeg|png|gif|webp|avif)(?:\.(webp|avif))$/i);
				if (match) {
					const base = match[1];
					const firstExt = match[2];
					const secondExt = match[3];

					// добавляем оба варианта
					result.push(`${ base }.${ firstExt }`);
					result.push(`${ base }.${ secondExt }`);
				} else {
					// если просто один формат, добавим возможные дополнительные
					const baseMatch = src.match(/(.*)\.(jpg|jpeg|png)$/i);
					if (baseMatch) {
						const base = baseMatch[1];
						result.push(`${ base }.webp`);
					}
				}

				// нормализуем и убираем дубли
				return [...new Set(result.map(correctAssetPath))];
			});


		const css = [...doc.querySelectorAll('link[rel="stylesheet"][href]')]
			.map(link => correctAssetPath(link.href));

		const scripts = [...doc.querySelectorAll('script[src]')]
			.map(script => correctAssetPath(script.src));

		const allAssets = [...new Set([...images, ...css, ...scripts].filter(Boolean))];

		try {
			localStorage.setItem(cacheKey, JSON.stringify(allAssets));
			RapidCacheState.set(url, 'cached');
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

		// Уже предзагружен — пропускаем
		if (PreloadedAssets.has(src)) {
			// console.log(`⚡ Skipping cached asset: ${ src }`);
			return resolve();
		}

		const markDone = () => {
			PreloadedAssets.add(src);
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
	await Promise.all(newAssets.map(src => preloadAsset(src)));
	console.log(`✅ Finished preloading (${ newAssets.length })`);
}

// === MAIN LISTENERS ===
document.addEventListener('mouseover', e => {
	const a = e.target.closest('a');
	if (!a || !a.href) return;
	if (!a.href.includes(location.origin)) return;
	if (a.dataset.preloading) return;

	a.dataset.preloading = 'true';
	const match = a.href.match(/(.*)\.(css|js|jpg|jpeg|png|gif|webp|avif)(?:\.(webp|avif))$/i);
	if (!match) {
		handleProcessingAssetsFromUrl(a.href)
			.then(assets => handleAssetsPreloading(assets))
			.finally(() => {
				setTimeout(() => delete a.dataset.preloading, 2000);
		});		
	}

});

// === OPTIONAL: preload pagination or other known links ===
(async () => {
	const rapidPreLoadAllPages = true;
	let links = [...document.querySelectorAll('a[href*="page-"], a[href*="?page="]')];
	if (!rapidPreLoadAllPages && links.length > 1) links = [links[0]];
	for (const link of links) {
		const match = link.href.match(/(.*)\.(css|js|jpg|jpeg|png|gif|webp|avif)(?:\.(webp|avif))$/i);
		if (!match) {
			const assets = await handleProcessingAssetsFromUrl(link.href);
		}
		await handleAssetsPreloading(assets);
	}
})();

// === NEW FEATURE: preload all links on the site ===
async function preloadAllSiteContent() {
	console.log('🌍 Starting full site preloading...');
	const allLinks = [...document.querySelectorAll('a[href]')]
		.map(a => a.href)
		.filter(h => h.includes(location.origin));

	const uniqueLinks = [...new Set(allLinks)];

	let i = 0;
	for (const url of uniqueLinks) {
		i++;
		console.log(`➡️ [${ i }/${ uniqueLinks.length } ] Preloading page: ${ url }`);
		const assets = await handleProcessingAssetsFromUrl(url);
		await handleAssetsPreloading(assets);
	}
	console.log('✅ Finished full site preloading!');
}

    window.addEventListener('load', function() {
        setTimeout(preloadAllSiteContent, 3000);
    });  