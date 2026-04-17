import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import prisma from './db';
import dotenv from 'dotenv';
import {
  calculatePasadaRanking,
  calculateGroupRanking,
  calculateRoundClassification,
  generateNextRound,
  getGroupParticipants
} from './engine/tournament.engine';
import {
  registerConsensus,
  resetConsensus,
  resetAllConsensus
} from './engine/consensus.manager';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/rnh/socket.io'
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Routes ─────────────────────────────────
import adminRoutes from './routes/admin.routes';
import judgeRoutes from './routes/judge.routes';

app.use('/rnh/api/admin', adminRoutes);
app.use('/rnh/api/judges', judgeRoutes);

app.get('/rnh/api/health', (_req, res) => {
  res.json({ status: 'RNH API is running' });
});

// ─── Helpers ────────────────────────────────

async function getState() {
  let state = await prisma.systemState.findUnique({ where: { id: 'global' } });
  if (!state) {
    state = await prisma.systemState.create({ data: { id: 'global' } });
  }
  return state;
}

async function updateState(data: any) {
  return prisma.systemState.update({ where: { id: 'global' }, data });
}

/**
 * Build a rich state object to broadcast to all clients.
 * Includes everything the UI needs to render.
 */
async function buildBroadcastState() {
  const state = await getState();

  let activeParticipantName: string | null = null;
  let activeCategoryName: string | null = null;
  let activeGroupName: string | null = null;
  let activeRoundNumber: number | null = null;
  let groupParticipants: any[] = [];
  let totalPasadas = 2;
  let judgesRequired = 3;

  if (state.activeParticipantId) {
    const p = await prisma.participant.findUnique({
      where: { id: state.activeParticipantId },
      include: { category: true }
    });
    activeParticipantName = p ? `${p.name}` : null;
    activeCategoryName = p?.category?.name || null;
  }

  if (state.activeCategoryId) {
    const cat = await prisma.category.findUnique({ where: { id: state.activeCategoryId } });
    if (cat) {
      totalPasadas = cat.pasadasCount;
      judgesRequired = cat.judgesCount;
    }
  }

  if (state.activeGroupId) {
    const g = await prisma.group.findUnique({ where: { id: state.activeGroupId } });
    activeGroupName = g?.name || null;
    groupParticipants = await getGroupParticipants(state.activeGroupId);
  }

  if (state.activeRoundId) {
    const r = await prisma.round.findUnique({ where: { id: state.activeRoundId } });
    activeRoundNumber = r?.number || null;
  }

  return {
    status: state.status,
    activeTournamentId: state.activeTournamentId,
    activeCategoryId: state.activeCategoryId,
    activeCategoryName,
    activeRoundId: state.activeRoundId,
    activeRoundNumber,
    activeGroupId: state.activeGroupId,
    activeGroupName,
    activeParticipantId: state.activeParticipantId,
    activeParticipantName,
    activePasadaNumber: state.activePasadaNumber,
    totalPasadas,
    judgesRequired,
    groupParticipants: groupParticipants.map(gp => ({
      id: gp.participant.id,
      name: gp.participant.name,
      order: gp.order
    })),
    consensus: {
      endPasada: JSON.parse(state.consensusEndPasada || '[]'),
      nextPasada: JSON.parse(state.consensusNextPasada || '[]'),
      nextGroup: JSON.parse(state.consensusNextGroup || '[]')
    }
  };
}

async function broadcastState() {
  const state = await buildBroadcastState();
  io.emit('state_update', state);
}

// ─── Socket.io Events ────────────────────────

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // ── Request current state ──
  socket.on('request_state', async () => {
    const state = await buildBroadcastState();
    socket.emit('state_update', state);
  });

  // ── JUDGE: Submit score ──
  socket.on('submit_score', async (data: { score: number; judgeId: string; participantId: string }) => {
    const state = await getState();
    if (state.status !== 'pasada_activa' || !state.activeRoundId) {
      return;
    }

    try {
      await prisma.score.upsert({
        where: {
          judgeId_participantId_roundId_pasadaNumber: {
            judgeId: data.judgeId,
            participantId: data.participantId,
            roundId: state.activeRoundId,
            pasadaNumber: state.activePasadaNumber
          }
        },
        update: { value: data.score },
        create: {
          value: data.score,
          judgeId: data.judgeId,
          participantId: data.participantId,
          roundId: state.activeRoundId,
          pasadaNumber: state.activePasadaNumber
        }
      });
      console.log(`Score: Juez ${data.judgeId} → Participante ${data.participantId} = ${data.score} (Pasada ${state.activePasadaNumber})`);

      // Notify all clients about the score update  
      io.emit('score_submitted', {
        judgeId: data.judgeId,
        participantId: data.participantId,
        score: data.score,
        pasadaNumber: state.activePasadaNumber
      });
    } catch (e) {
      console.error("Error saving score:", e);
    }
  });

  // ── JUDGE: End pasada (consensus) ──
  socket.on('judge_end_pasada', async (data: { judgeId: string }) => {
    const state = await getState();
    if (state.status !== 'pasada_activa' || !state.activeCategoryId) return;

    const cat = await prisma.category.findUnique({ where: { id: state.activeCategoryId } });
    if (!cat) return;

    const result = await registerConsensus(data.judgeId, 'consensusEndPasada', cat.judgesCount);
    console.log(`Consenso terminar pasada: ${result.total}/${result.required}`);

    // Broadcast consensus progress
    io.emit('consensus_progress', { type: 'endPasada', ...result });

    if (result.reached && state.activeGroupId && state.activeRoundId) {
      // Close the pasada
      await resetConsensus('consensusEndPasada');

      // Calculate ranking for this pasada
      const ranking = await calculatePasadaRanking(
        state.activeGroupId,
        state.activeRoundId,
        state.activePasadaNumber
      );

      await updateState({ status: 'pasada_cerrada' });

      io.emit('pasada_results', {
        pasadaNumber: state.activePasadaNumber,
        ranking
      });

      await broadcastState();
    }
  });

  // ── JUDGE: Next pasada (consensus) ──
  socket.on('judge_next_pasada', async (data: { judgeId: string }) => {
    const state = await getState();
    if (state.status !== 'pasada_cerrada' || !state.activeCategoryId) return;

    const cat = await prisma.category.findUnique({ where: { id: state.activeCategoryId } });
    if (!cat) return;

    const result = await registerConsensus(data.judgeId, 'consensusNextPasada', cat.judgesCount);
    console.log(`Consenso siguiente pasada: ${result.total}/${result.required}`);

    io.emit('consensus_progress', { type: 'nextPasada', ...result });

    if (result.reached) {
      await resetConsensus('consensusNextPasada');

      const nextPasada = state.activePasadaNumber + 1;

      if (nextPasada <= cat.pasadasCount) {
        // More pasadas to go
        await updateState({
          status: 'pasada_activa',
          activePasadaNumber: nextPasada,
          activeParticipantId: null
        });
      } else {
        // All pasadas done → show group ranking
        let groupRanking: any[] = [];
        if (state.activeGroupId && state.activeRoundId) {
          groupRanking = await calculateGroupRanking(
            state.activeGroupId,
            state.activeRoundId,
            cat.pasadasCount
          );

          await prisma.group.update({
            where: { id: state.activeGroupId },
            data: { status: 'completed', currentPasada: cat.pasadasCount }
          });
        }

        await updateState({
          status: 'grupo_cerrado',
          activeParticipantId: null
        });

        io.emit('group_results', { ranking: groupRanking });
      }

      await broadcastState();
    }
  });

  // ── JUDGE: Next group (consensus) ──
  socket.on('judge_next_group', async (data: { judgeId: string }) => {
    const state = await getState();
    if (state.status !== 'grupo_cerrado' || !state.activeRoundId || !state.activeCategoryId) return;

    const cat = await prisma.category.findUnique({ where: { id: state.activeCategoryId } });
    if (!cat) return;

    const result = await registerConsensus(data.judgeId, 'consensusNextGroup', cat.judgesCount);
    console.log(`Consenso siguiente grupo: ${result.total}/${result.required}`);

    io.emit('consensus_progress', { type: 'nextGroup', ...result });

    if (result.reached) {
      await resetConsensus('consensusNextGroup');

      // Find next pending group in this round
      const nextGroup = await prisma.group.findFirst({
        where: { roundId: state.activeRoundId, status: 'pending' },
        orderBy: { name: 'asc' }
      });

      if (nextGroup) {
        // Advance to next group
        await prisma.group.update({
          where: { id: nextGroup.id },
          data: { status: 'active', currentPasada: 1 }
        });

        await updateState({
          status: 'pasada_activa',
          activeGroupId: nextGroup.id,
          activePasadaNumber: 1,
          activeParticipantId: null
        });
      } else {
        // All groups done → round classification
        const classification = await calculateRoundClassification(state.activeRoundId, state.activeCategoryId);

        await prisma.round.update({
          where: { id: state.activeRoundId },
          data: { status: 'completed' }
        });

        await updateState({
          status: 'ronda_cerrada',
          activeGroupId: null,
          activeParticipantId: null
        });

        io.emit('round_classification', classification);
      }

      await broadcastState();
    }
  });

  // ── ADMIN: Start tournament ──
  socket.on('admin_start_tournament', async (data: { tournamentId: string; categoryId: string }) => {
    const cat = await prisma.category.findUnique({
      where: { id: data.categoryId },
      include: { rounds: { include: { groups: true }, orderBy: { number: 'asc' } } }
    });
    if (!cat || cat.rounds.length === 0) return;

    const firstRound = cat.rounds[0];
    const firstGroup = firstRound.groups.sort((a, b) => a.name.localeCompare(b.name))[0];
    if (!firstGroup) return;

    await prisma.tournament.update({ where: { id: data.tournamentId }, data: { status: 'active' } });
    await prisma.round.update({ where: { id: firstRound.id }, data: { status: 'active' } });
    await prisma.group.update({ where: { id: firstGroup.id }, data: { status: 'active', currentPasada: 1 } });

    await resetAllConsensus();

    await updateState({
      status: 'pasada_activa',
      activeTournamentId: data.tournamentId,
      activeCategoryId: data.categoryId,
      activeRoundId: firstRound.id,
      activeGroupId: firstGroup.id,
      activePasadaNumber: 1,
      activeParticipantId: null
    });

    await broadcastState();
    console.log(`Torneo iniciado: Cat ${cat.name}, Ronda ${firstRound.number}, ${firstGroup.name}`);
  });

  // ── ADMIN: Set active participant ──
  socket.on('admin_set_participant', async (data: { participantId: string }) => {
    await updateState({
      status: 'pasada_activa',
      activeParticipantId: data.participantId
    });
    await broadcastState();
  });

  // ── ADMIN: Force close pasada ──
  socket.on('admin_force_close_pasada', async () => {
    const state = await getState();
    if (state.status !== 'pasada_activa' || !state.activeGroupId || !state.activeRoundId) return;

    await resetConsensus('consensusEndPasada');

    const ranking = await calculatePasadaRanking(
      state.activeGroupId,
      state.activeRoundId,
      state.activePasadaNumber
    );

    await updateState({ status: 'pasada_cerrada' });

    io.emit('pasada_results', {
      pasadaNumber: state.activePasadaNumber,
      ranking
    });

    await broadcastState();
    console.log('Admin forzó cierre de pasada');
  });

  // ── ADMIN: Force next group ──
  socket.on('admin_force_next_group', async () => {
    const state = await getState();
    if (!state.activeRoundId || !state.activeCategoryId) return;

    await resetAllConsensus();

    // Mark current group as completed
    if (state.activeGroupId) {
      await prisma.group.update({
        where: { id: state.activeGroupId },
        data: { status: 'completed' }
      });
    }

    const nextGroup = await prisma.group.findFirst({
      where: { roundId: state.activeRoundId, status: 'pending' },
      orderBy: { name: 'asc' }
    });

    if (nextGroup) {
      await prisma.group.update({
        where: { id: nextGroup.id },
        data: { status: 'active', currentPasada: 1 }
      });
      await updateState({
        status: 'pasada_activa',
        activeGroupId: nextGroup.id,
        activePasadaNumber: 1,
        activeParticipantId: null
      });
    } else {
      // All groups done
      const classification = await calculateRoundClassification(state.activeRoundId, state.activeCategoryId);
      await prisma.round.update({ where: { id: state.activeRoundId }, data: { status: 'completed' } });
      await updateState({ status: 'ronda_cerrada', activeGroupId: null, activeParticipantId: null });
      io.emit('round_classification', classification);
    }

    await broadcastState();
    console.log('Admin forzó siguiente grupo');
  });

  // ── ADMIN: Generate next round ──
  socket.on('admin_generate_next_round', async (data: { qualifiedIds: string[] }) => {
    const state = await getState();
    if (!state.activeCategoryId) return;

    const newRound = await generateNextRound(state.activeCategoryId, data.qualifiedIds);
    const firstGroup = await prisma.group.findFirst({
      where: { roundId: newRound.id },
      orderBy: { name: 'asc' }
    });

    if (firstGroup) {
      await prisma.round.update({ where: { id: newRound.id }, data: { status: 'active' } });
      await prisma.group.update({ where: { id: firstGroup.id }, data: { status: 'active', currentPasada: 1 } });

      await resetAllConsensus();
      await updateState({
        status: 'pasada_activa',
        activeRoundId: newRound.id,
        activeGroupId: firstGroup.id,
        activePasadaNumber: 1,
        activeParticipantId: null
      });
    }

    await broadcastState();
    console.log('Nueva ronda generada');
  });

  // ── ADMIN: Edit score (post-pasada) ──
  socket.on('admin_edit_score', async (data: {
    judgeId: string; participantId: string; roundId: string; pasadaNumber: number; value: number
  }) => {
    try {
      await prisma.score.upsert({
        where: {
          judgeId_participantId_roundId_pasadaNumber: {
            judgeId: data.judgeId,
            participantId: data.participantId,
            roundId: data.roundId,
            pasadaNumber: data.pasadaNumber
          }
        },
        update: { value: data.value },
        create: {
          judgeId: data.judgeId,
          participantId: data.participantId,
          roundId: data.roundId,
          pasadaNumber: data.pasadaNumber,
          value: data.value
        }
      });
      console.log(`Admin editó score: Juez ${data.judgeId}, Participante ${data.participantId} = ${data.value}`);
      io.emit('score_edited', data);
    } catch (e) {
      console.error("Error editing score:", e);
    }
  });

  // ── ADMIN: Reset tournament ──
  socket.on('admin_reset', async () => {
    await updateState({
      status: 'setup',
      activeTournamentId: null,
      activeCategoryId: null,
      activeRoundId: null,
      activeGroupId: null,
      activeParticipantId: null,
      activePasadaNumber: 1,
      consensusEndPasada: '[]',
      consensusNextPasada: '[]',
      consensusNextGroup: '[]'
    });
    await broadcastState();
    console.log('Sistema reseteado');
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`RNH Backend running on port ${PORT}`);
});
