const fs = require('fs');

try {
  const data = JSON.parse(fs.readFileSync('/app/applet/gateway_storage.json', 'utf8'));
  const logs = data.logs || [];
  
  // Show only sql-direct
  const sqlLogs = logs.filter(l => l.source === 'sql-direct');
  if (sqlLogs.length > 0) {
     console.log("LAST SQL ERRORS:");
     sqlLogs.slice(0, 10).forEach(l => {
       console.log(l.timestamp, l.url, "ERROR:", l.error);
     });
  } else {
     console.log("No sql-direct errors found in gateway_storage.json");
  }
} catch (e) {
  console.log("error", e);
}
