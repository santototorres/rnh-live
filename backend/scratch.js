const { Client } = require('pg');

async function test() {
  const client = new Client({
    connectionString: "postgresql://rnh:rnhpassword@xtreetx.com:5432/rnh_db?schema=public",
  });
  
  try {
    await client.connect();
    console.log("Connected to remote DB");
    
    const state = await client.query('SELECT * FROM "SystemState"');
    console.log("SystemState:", state.rows[0]);

    const scores = await client.query('SELECT * FROM "Score"');
    console.log(`Scores Count: ${scores.rowCount}`);
    console.log("Scores:", scores.rows);

  } catch (e) {
    console.error("DB Error:", e.message);
  } finally {
    await client.end();
  }
}
test();
