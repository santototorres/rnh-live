const { io } = require("socket.io-client");

const socket = io("https://xtreetx.com", {
  path: "/rnh/socket.io",
  transports: ["websocket", "polling"]
});

socket.on("connect", () => {
  console.log("Connected as", socket.id);
  
  socket.emit("submit_score", {
    score: 5,
    judgeId: "TEST_JUDGE",
    participantId: "TEST_PARTICIPANT"
  });

  console.log("Emitted submit_score");
});

socket.on("score_submitted", (data) => {
  console.log("Backend responded with score_submitted:", data);
  process.exit(0);
});

socket.on("disconnect", () => {
  console.log("Disconnected");
  process.exit(0);
});

setTimeout(() => {
  console.log("Timeout waiting for response");
  process.exit(0);
}, 5000);
