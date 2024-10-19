const correctImagePath = imagePath => {
	if(!imagePath.includes(location.origin)){
		if(imagePath[0] != '/'){
			imagePath = '/' + imagePath;
		}		
		imagePath = location.origin + imagePath;
	}
	return imagePath;
};

async function handleProcessingImagesFromUrl(url) {
	cacheName = `rapidImageCacher__${ url }`;
	try {
		// Check if the images is already cached
		const cachedImagesSrcs = localStorage.getItem(cacheName);
		if (cachedImagesSrcs) {
			console.log('Loading from cache!');
			return JSON.parse(cachedImagesSrcs);
		}

		// Fetch the HTML from the server
		const response = await fetch(url);
		const html = await response.text();

		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const imagesSrcs = [...doc.querySelectorAll('img')]
		.filter(image => image.src) // Filter out images without src
		.map(image => {
			if (image.src.includes('data:image')) {
				// If src contains 'data:image', use data-src if available
				return correctImagePath(image.dataset.src) || image.src;
			} else {
				// Otherwise, use the original src
				return correctImagePath(image.src);
			}
		});

		// Cache the images in localStorage
		localStorage.setItem(cacheName, JSON.stringify(imagesSrcs));

		return imagesSrcs;
	} catch (error) {
		console.error('Error fetching:', error);
		return null;
	}
}

const preloadImage = src =>
	new Promise((resolve, reject) => {
		if (!src) {
			resolve(); // Resolve immediately if src is empty
			return;
		}
		const image = new Image()
		image.onload = resolve
		image.onerror = resolve // Resolve on error too
		image.src = src
	})

// Example usage

const handleImagesPreloading = async (images) => {
	await Promise.all(images.map(src => preloadImage(src))); 
};

const keepFirstElement = array => {
	if (array.length > 1) {
		return array.slice(0, 1); // Slice from index 0 to 1 (exclusive), keeping only the first element
	} else {
		return array; // Return the array as is if it has only one element or is empty
	}
}

try {


	rapidPreloadBody = document.querySelector('body');
	if(rapidPreloadBody){
		rapidPreloadBody.addEventListener('mouseover', e => {
			if(e.target.tagName.toLowerCase() === 'a'){
				if(e.target.href){
					handleProcessingImagesFromUrl(e.target.href).then(async images => handleImagesPreloading(images));
				}

			}
		});
	}


	// TODO: track current page and load next page if rapidPreLoadAllPages is false (means load only next page not all from navigation)

	// prealod next page
	const rapidPreLoadAllPages = true;
	let links = [...document.querySelectorAll('a[href*="page-"], a[href*="?page="]')]; // Select all links containing "page-"


	if(links.length > 0){
		if(!rapidPreLoadAllPages){
			links = keepFirstElement(links);
		}

		links.map(link => handleProcessingImagesFromUrl(link.href).then(async images => handleImagesPreloading(images)));
	}

} catch (error) {
	console.error('CANNOT SOME PRELOAD:', error);
}
