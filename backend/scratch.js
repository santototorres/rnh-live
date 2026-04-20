const Papa = require('papaparse');

async function test() {
  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLVC-7KTW8mhUZiiyR7fvTfYEZ3S6AP7jkmC4_2S-SpK-NCQF6DpT4NWERQO8rGIBZ0dkaSiYhXK1E/pub?gid=0&single=true&output=csv";
  const res = await fetch(url);
  const text = await res.text();
  console.log("TEXT LENGTH:", text.length);
  Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      console.log("PARSED ROWS:", results.data.length);
      console.log("FIRST ROW:", results.data[0]);
    }
  });
}
test();
