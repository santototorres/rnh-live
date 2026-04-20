const Papa = require('papaparse');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

async function run() {
  const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLVC-7KTW8mhUZiiyR7fvTfYEZ3S6AP7jkmC4_2S-SpK-NCQF6DpT4NWERQO8rGIBZ0dkaSiYhXK1E/pubhtml";
  let csvUrl = sheetUrl;
  if (sheetUrl.includes('/pubhtml')) {
    csvUrl = sheetUrl.replace('/pubhtml', '/pub?output=csv');
  }

  console.log("Fetching: " + csvUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(csvUrl, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!response.ok) {
        console.error("HTTP error:", response.status);
        return;
    }
    
    const csvText = await response.text();
    console.log("Downloaded CSV length: " + csvText.length);
    if (csvText.length < 500) {
        console.log("Preview:\n" + csvText);
    }
    
    const results = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });
    console.log("Parsed rows:", results.data.length);
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
