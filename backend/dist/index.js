"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    path: '/rnh/socket.io'
});
const prisma = new client_1.PrismaClient();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Load Routers
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const judge_routes_1 = __importDefault(require("./routes/judge.routes"));
app.use('/rnh/api/admin', admin_routes_1.default);
app.use('/rnh/api/judges', judge_routes_1.default);
// In-Memory Global State (Simulates the DB state for fast Live Sync)
let globalState = {
    status: "setup", // setup, torneo_iniciado, grupo_activo, pasada_activa, pasada_cerrada, transicion
    activeParticipantId: null,
    activeParticipantName: "N/A",
    activeRoundId: null,
    consensusCount: 0
};
// API routes placeholder
app.get('/rnh/api/health', (req, res) => {
    res.json({ status: 'RNH API is running' });
});
// Socket.io events
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    // Send current state to new connections
    socket.on('request_system_state', () => {
        socket.emit('state_changed', globalState);
    });
    // Judge Events
    socket.on('submit_score', async (data) => {
        console.log(`Puntaje Recibido: ${data.score} del juez: ${data.judgeId}`);
        if (!globalState.activeParticipantId || !globalState.activeRoundId || !data.judgeId) {
            console.error("Faltan datos de estado para guardar puntuación en DB");
            return;
        }
        try {
            await prisma.score.upsert({
                where: {
                    judgeId_participantId_roundId: {
                        judgeId: data.judgeId,
                        participantId: globalState.activeParticipantId,
                        roundId: globalState.activeRoundId
                    }
                },
                update: { value: data.score },
                create: {
                    value: data.score,
                    judgeId: data.judgeId,
                    participantId: globalState.activeParticipantId,
                    roundId: globalState.activeRoundId
                }
            });
            console.log("Score Upsert Guardado exitosamente");
        }
        catch (e) {
            console.error("Error guardando score DB:", e);
        }
    });
    socket.on('judge_consensus_ready', () => {
        globalState.consensusCount += 1;
        console.log(`Consensus: ${globalState.consensusCount}`);
        // Assume 3 judges for testing
        if (globalState.consensusCount >= 3) {
            globalState.status = "pasada_cerrada";
            globalState.consensusCount = 0;
            io.emit('state_changed', globalState);
        }
    });
    // Admin Events
    socket.on('admin_command', async (data) => {
        console.log(`Admin Cmd: ${data.action}`);
        if (data.action === 'start_tournament') {
            globalState.status = "torneo_iniciado";
        }
        else if (data.action === 'next_participant') {
            globalState.status = "pasada_activa";
            const firstPart = await prisma.participant.findFirst({ include: { category: true } });
            const firstRound = await prisma.round.findFirst();
            globalState.activeParticipantId = firstPart?.id || null;
            globalState.activeParticipantName = firstPart ? `${firstPart.name} (${firstPart.category?.name})` : "Esperando Skaters...";
            globalState.activeRoundId = firstRound?.id || null;
            globalState.consensusCount = 0;
        }
        else if (data.action === 'set_active_participant') {
            globalState.status = "pasada_activa";
            globalState.activeParticipantId = data.participantId;
            globalState.activeParticipantName = data.participantName;
            globalState.activeRoundId = data.roundId;
            globalState.consensusCount = 0;
        }
        else if (data.action === 'force_close') {
            globalState.status = "pasada_cerrada";
            globalState.consensusCount = 0;
        }
        // Broadcast state to ALL
        io.emit('state_changed', globalState);
    });
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});
server.listen(PORT, () => {
    console.log(`Backend server listener running on port ${PORT}`);
});
