import https from 'https';

https.get('https://documenter.getpostman.com/view/4432611/TzCS45GQ', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    // Find the collection ID or the injected data
    const match = body.match(/window\.__INITIAL_STATE__\s*=\s*(.*?);\n/);
    if (match) {
      try {
        const state = JSON.parse(match[1]);
        const collection = state.collection.collection || state.collection.data;
        
        console.log("Collection Name: ", collection?.info?.name);
        // Print out all endpoint URLs
        if (collection && collection.item) {
          collection.item.forEach(item => {
             if (item.item) { // Group
               item.item.forEach(subItem => {
                  if(subItem.request) {
                     console.log(subItem.name, subItem.request.url.raw || (subItem.request.url.path && subItem.request.url.path.join('/')));
                  }
               })
             } else if (item.request) {
               console.log(item.name, item.request.url.raw || (item.request.url.path && item.request.url.path.join('/')));
             }
          });
        }
      } catch (e) {
        console.log("Error parsing state", e);
      }
    } else {
      console.log("INITIAL_STATE not found");
      const match2 = body.match(/window\.__NUXT__\s*=\s*(.*?);<\/script>/);
      if (match2) {
          console.log("Found Nuxt state");
      }
      
      const apiInfo = body.match(/https:\/\/postman.com\/collections\/[\w-]+/g);
      console.log("Collections:", apiInfo);
      
      const parts = body.split('url":"');
      for(let i=1; i<parts.length && i < 30; i++) {
        console.log(parts[i].substring(0, parts[i].indexOf('"')));
      }
    }
  });
});
