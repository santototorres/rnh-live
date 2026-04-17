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
// In-Memory Global State (Simulates the DB state for fast Live Sync)
let globalState = {
    status: "setup", // setup, torneo_iniciado, grupo_activo, pasada_activa, pasada_cerrada, transicion
    activeParticipantId: null,
    activeParticipantName: "N/A",
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
    socket.on('submit_score', (data) => {
        console.log(`Puntaje Recibido: ${data.score} del socket ${socket.id}`);
        // Save to DB here using prisma...
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
    socket.on('admin_command', (data) => {
        console.log(`Admin Cmd: ${data.action}`);
        if (data.action === 'start_tournament') {
            globalState.status = "torneo_iniciado";
        }
        else if (data.action === 'next_participant') {
            globalState.status = "pasada_activa";
            globalState.activeParticipantName = "Skater Test " + Math.floor(Math.random() * 100);
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
