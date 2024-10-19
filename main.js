

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


} catch (error) {
	console.error('CANNOT SOME PRELOAD:', error);
}
