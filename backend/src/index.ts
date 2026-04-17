import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  path: '/rnh/socket.io'
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Load Routers
import adminRoutes from './routes/admin.routes';
import judgeRoutes from './routes/judge.routes';

app.use('/rnh/api/admin', adminRoutes);
app.use('/rnh/api/judges', judgeRoutes);

// In-Memory Global State (Simulates the DB state for fast Live Sync)
let globalState = {
  status: "setup", // setup, torneo_iniciado, grupo_activo, pasada_activa, pasada_cerrada, transicion
  activeParticipantId: null as string | null,
  activeParticipantName: "N/A" as string | null,
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
    } catch (e) {
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
    } else if (data.action === 'next_participant') {
      globalState.status = "pasada_activa";
      
      const firstPart = await prisma.participant.findFirst({ include: { category: true } });
      const firstRound = await prisma.round.findFirst();

      globalState.activeParticipantId = firstPart?.id || null;
      globalState.activeParticipantName = firstPart ? `${firstPart.name} (${firstPart.category?.name})` : "Esperando Skaters...";
      globalState.activeRoundId = firstRound?.id || null;
      
      globalState.consensusCount = 0;
    } else if (data.action === 'set_active_participant') {
      globalState.status = "pasada_activa";
      globalState.activeParticipantId = data.participantId;
      globalState.activeParticipantName = data.participantName;
      globalState.activeRoundId = data.roundId;
      globalState.consensusCount = 0;
    } else if (data.action === 'force_close') {
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
