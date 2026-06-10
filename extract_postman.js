const http = require('https');

http.get('https://documenter.getpostman.com/view/4432611/TzCS45GQ', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    // Find the collection ID or the injected data
    const match = body.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/);
    if (match) {
      try {
        const state = JSON.parse(match[1]);
        const collection = state.collection.collection;
        
        console.log("Collection Name: ", collection.info.name);
        // Print out all endpoint URLs
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
      } catch (e) {
        console.log("Error parsing state", e);
      }
    } else {
      console.log("INITIAL_STATE not found");
    }
  });
});
