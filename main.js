

try {


	rapidPreloadBody = document.querySelector('body');
	if(rapidPreloadBody){
		rapidPreloadBody.addEventListener('mouseover', e => {
			if(e.target.tagName.toLowerCase() === 'a'){
				if(e.target.href){
					fetchAndCacheHTMLImagesList(e.target.href).then(async images => handleImagesPreloading(images));
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

		links.map(link => fetchAndCacheHTMLImagesList(link.href).then(async images => handleImagesPreloading(images)));
	}

} catch (error) {
	console.error('CANNOT SOME PRELOAD:', error);
}
