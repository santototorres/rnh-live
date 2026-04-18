const { Client } = require('pg');
const { io } = require("socket.io-client");

async function test() {
  const client = new Client({
    connectionString: "postgresql://rnh:rnhpassword@xtreetx.com:5432/rnh_db?schema=public",
  });
  
  await client.connect();
  
  // Force state
  await client.query(`UPDATE "SystemState" SET status = 'pasada_activa' WHERE id = 'global'`);
  console.log("State forced to pasada_activa");
  
  const socket = io("https://xtreetx.com", {
    path: "/rnh/socket.io",
    transports: ["websocket", "polling"]
  });

  socket.on("connect", () => {
    console.log("Connected as", socket.id);
    
    socket.emit("submit_score", {
      score: 5,
      judgeId: "TEST_J",
      participantId: "TEST_P"
    });
    console.log("Emitted submit_score");
  });

  socket.on("score_submitted", async (data) => {
    console.log("Success! backend responded with score_submitted:", data);
    
    // verify db
    const scores = await client.query('SELECT * FROM "Score"');
    console.log("Scores Count in DB:", scores.rowCount);
    
    // restore state
    await client.query(`UPDATE "SystemState" SET status = 'grupo_cerrado' WHERE id = 'global'`);
    process.exit(0);
  });

  setTimeout(async () => {
    console.log("Timeout waiting for response");
    await client.query(`UPDATE "SystemState" SET status = 'grupo_cerrado' WHERE id = 'global'`);
    process.exit(0);
  }, 5000);
}

test();
