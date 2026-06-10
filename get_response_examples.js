import fs from 'fs';

const data = JSON.parse(fs.readFileSync('sayan_collection.json', 'utf8'));

function findAndPrintResponses(itemArray) {
  for (const item of itemArray) {
    if (item.response && item.response.length > 0) {
      const urlPath = item.request?.urlObject?.path 
        ? "/api/" + item.request.urlObject.path.join("/")
        : item.request?.url || "Unknown";
        
      if (urlPath.includes("People") || urlPath.includes("Ware") || urlPath.includes("Factor")) {
        console.log(`\n===========================================`);
        console.log(`URL: ${urlPath}`);
        console.log(`RESPONSE NAME: ${item.response[0].name}`);
        console.log(`STATUS: ${item.response[0].status}`);
        const body = item.response[0].body;
        console.log(`BODY PREVIEW (first 1000 char):`, body?.substring(0, 1000));
      }
    }
    if (item.item) {
      findAndPrintResponses(item.item);
    }
  }
}

findAndPrintResponses(data.item || []);
