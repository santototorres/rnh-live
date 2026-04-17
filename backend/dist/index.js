"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const db_1 = __importDefault(require("./db"));
const dotenv_1 = __importDefault(require("dotenv"));
const tournament_engine_1 = require("./engine/tournament.engine");
const consensus_manager_1 = require("./engine/consensus.manager");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/rnh/socket.io'
});
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ─── Routes ─────────────────────────────────
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const judge_routes_1 = __importDefault(require("./routes/judge.routes"));
app.use('/rnh/api/admin', admin_routes_1.default);
app.use('/rnh/api/judges', judge_routes_1.default);
app.get('/rnh/api/health', (_req, res) => {
    res.json({ status: 'RNH API is running' });
});
// ─── Helpers ────────────────────────────────
async function getState() {
    let state = await db_1.default.systemState.findUnique({ where: { id: 'global' } });
    if (!state) {
        state = await db_1.default.systemState.create({ data: { id: 'global' } });
    }
    return state;
}
async function updateState(data) {
    return db_1.default.systemState.update({ where: { id: 'global' }, data });
}
/**
 * Build a rich state object to broadcast to all clients.
 * Includes everything the UI needs to render.
 */
async function buildBroadcastState() {
    const state = await getState();
    let activeParticipantName = null;
    let activeCategoryName = null;
    let activeGroupName = null;
    let activeRoundNumber = null;
    let groupParticipants = [];
    let totalPasadas = 2;
    let judgesRequired = 3;
    if (state.activeParticipantId) {
        const p = await db_1.default.participant.findUnique({
            where: { id: state.activeParticipantId },
            include: { category: true }
        });
        activeParticipantName = p ? `${p.name}` : null;
        activeCategoryName = p?.category?.name || null;
    }
    if (state.activeCategoryId) {
        const cat = await db_1.default.category.findUnique({ where: { id: state.activeCategoryId } });
        if (cat) {
            totalPasadas = cat.pasadasCount;
            judgesRequired = cat.judgesCount;
        }
    }
    if (state.activeGroupId) {
        const g = await db_1.default.group.findUnique({ where: { id: state.activeGroupId } });
        activeGroupName = g?.name || null;
        groupParticipants = await (0, tournament_engine_1.getGroupParticipants)(state.activeGroupId);
    }
    if (state.activeRoundId) {
        const r = await db_1.default.round.findUnique({ where: { id: state.activeRoundId } });
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
    socket.on('submit_score', async (data) => {
        const state = await getState();
        if (state.status !== 'pasada_activa' || !state.activeRoundId) {
            return;
        }
        try {
            await db_1.default.score.upsert({
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
        }
        catch (e) {
            console.error("Error saving score:", e);
        }
    });
    // ── JUDGE: End pasada (consensus) ──
    socket.on('judge_end_pasada', async (data) => {
        const state = await getState();
        if (state.status !== 'pasada_activa' || !state.activeCategoryId)
            return;
        const cat = await db_1.default.category.findUnique({ where: { id: state.activeCategoryId } });
        if (!cat)
            return;
        const result = await (0, consensus_manager_1.registerConsensus)(data.judgeId, 'consensusEndPasada', cat.judgesCount);
        console.log(`Consenso terminar pasada: ${result.total}/${result.required}`);
        // Broadcast consensus progress
        io.emit('consensus_progress', { type: 'endPasada', ...result });
        if (result.reached && state.activeGroupId && state.activeRoundId) {
            // Close the pasada
            await (0, consensus_manager_1.resetConsensus)('consensusEndPasada');
            // Calculate ranking for this pasada
            const ranking = await (0, tournament_engine_1.calculatePasadaRanking)(state.activeGroupId, state.activeRoundId, state.activePasadaNumber);
            await updateState({ status: 'pasada_cerrada' });
            io.emit('pasada_results', {
                pasadaNumber: state.activePasadaNumber,
                ranking
            });
            await broadcastState();
        }
    });
    // ── JUDGE: Next pasada (consensus) ──
    socket.on('judge_next_pasada', async (data) => {
        const state = await getState();
        if (state.status !== 'pasada_cerrada' || !state.activeCategoryId)
            return;
        const cat = await db_1.default.category.findUnique({ where: { id: state.activeCategoryId } });
        if (!cat)
            return;
        const result = await (0, consensus_manager_1.registerConsensus)(data.judgeId, 'consensusNextPasada', cat.judgesCount);
        console.log(`Consenso siguiente pasada: ${result.total}/${result.required}`);
        io.emit('consensus_progress', { type: 'nextPasada', ...result });
        if (result.reached) {
            await (0, consensus_manager_1.resetConsensus)('consensusNextPasada');
            const nextPasada = state.activePasadaNumber + 1;
            if (nextPasada <= cat.pasadasCount) {
                // More pasadas to go
                await updateState({
                    status: 'pasada_activa',
                    activePasadaNumber: nextPasada,
                    activeParticipantId: null
                });
            }
            else {
                // All pasadas done → show group ranking
                let groupRanking = [];
                if (state.activeGroupId && state.activeRoundId) {
                    groupRanking = await (0, tournament_engine_1.calculateGroupRanking)(state.activeGroupId, state.activeRoundId, cat.pasadasCount);
                    await db_1.default.group.update({
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
    socket.on('judge_next_group', async (data) => {
        const state = await getState();
        if (state.status !== 'grupo_cerrado' || !state.activeRoundId || !state.activeCategoryId)
            return;
        const cat = await db_1.default.category.findUnique({ where: { id: state.activeCategoryId } });
        if (!cat)
            return;
        const result = await (0, consensus_manager_1.registerConsensus)(data.judgeId, 'consensusNextGroup', cat.judgesCount);
        console.log(`Consenso siguiente grupo: ${result.total}/${result.required}`);
        io.emit('consensus_progress', { type: 'nextGroup', ...result });
        if (result.reached) {
            await (0, consensus_manager_1.resetConsensus)('consensusNextGroup');
            // Find next pending group in this round
            const nextGroup = await db_1.default.group.findFirst({
                where: { roundId: state.activeRoundId, status: 'pending' },
                orderBy: { name: 'asc' }
            });
            if (nextGroup) {
                // Advance to next group
                await db_1.default.group.update({
                    where: { id: nextGroup.id },
                    data: { status: 'active', currentPasada: 1 }
                });
                await updateState({
                    status: 'pasada_activa',
                    activeGroupId: nextGroup.id,
                    activePasadaNumber: 1,
                    activeParticipantId: null
                });
            }
            else {
                // All groups done → round classification
                const classification = await (0, tournament_engine_1.calculateRoundClassification)(state.activeRoundId, state.activeCategoryId);
                await db_1.default.round.update({
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
    socket.on('admin_start_tournament', async (data) => {
        const cat = await db_1.default.category.findUnique({
            where: { id: data.categoryId },
            include: { rounds: { include: { groups: true }, orderBy: { number: 'asc' } } }
        });
        if (!cat || cat.rounds.length === 0)
            return;
        const firstRound = cat.rounds[0];
        const firstGroup = firstRound.groups.sort((a, b) => a.name.localeCompare(b.name))[0];
        if (!firstGroup)
            return;
        await db_1.default.tournament.update({ where: { id: data.tournamentId }, data: { status: 'active' } });
        await db_1.default.round.update({ where: { id: firstRound.id }, data: { status: 'active' } });
        await db_1.default.group.update({ where: { id: firstGroup.id }, data: { status: 'active', currentPasada: 1 } });
        await (0, consensus_manager_1.resetAllConsensus)();
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
    socket.on('admin_set_participant', async (data) => {
        await updateState({
            status: 'pasada_activa',
            activeParticipantId: data.participantId
        });
        await broadcastState();
    });
    // ── ADMIN: Force close pasada ──
    socket.on('admin_force_close_pasada', async () => {
        const state = await getState();
        if (state.status !== 'pasada_activa' || !state.activeGroupId || !state.activeRoundId)
            return;
        await (0, consensus_manager_1.resetConsensus)('consensusEndPasada');
        const ranking = await (0, tournament_engine_1.calculatePasadaRanking)(state.activeGroupId, state.activeRoundId, state.activePasadaNumber);
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
        if (!state.activeRoundId || !state.activeCategoryId)
            return;
        await (0, consensus_manager_1.resetAllConsensus)();
        // Mark current group as completed
        if (state.activeGroupId) {
            await db_1.default.group.update({
                where: { id: state.activeGroupId },
                data: { status: 'completed' }
            });
        }
        const nextGroup = await db_1.default.group.findFirst({
            where: { roundId: state.activeRoundId, status: 'pending' },
            orderBy: { name: 'asc' }
        });
        if (nextGroup) {
            await db_1.default.group.update({
                where: { id: nextGroup.id },
                data: { status: 'active', currentPasada: 1 }
            });
            await updateState({
                status: 'pasada_activa',
                activeGroupId: nextGroup.id,
                activePasadaNumber: 1,
                activeParticipantId: null
            });
        }
        else {
            // All groups done
            const classification = await (0, tournament_engine_1.calculateRoundClassification)(state.activeRoundId, state.activeCategoryId);
            await db_1.default.round.update({ where: { id: state.activeRoundId }, data: { status: 'completed' } });
            await updateState({ status: 'ronda_cerrada', activeGroupId: null, activeParticipantId: null });
            io.emit('round_classification', classification);
        }
        await broadcastState();
        console.log('Admin forzó siguiente grupo');
    });
    // ── ADMIN: Generate next round ──
    socket.on('admin_generate_next_round', async (data) => {
        const state = await getState();
        if (!state.activeCategoryId)
            return;
        const newRound = await (0, tournament_engine_1.generateNextRound)(state.activeCategoryId, data.qualifiedIds);
        const firstGroup = await db_1.default.group.findFirst({
            where: { roundId: newRound.id },
            orderBy: { name: 'asc' }
        });
        if (firstGroup) {
            await db_1.default.round.update({ where: { id: newRound.id }, data: { status: 'active' } });
            await db_1.default.group.update({ where: { id: firstGroup.id }, data: { status: 'active', currentPasada: 1 } });
            await (0, consensus_manager_1.resetAllConsensus)();
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
    socket.on('admin_edit_score', async (data) => {
        try {
            await db_1.default.score.upsert({
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
        }
        catch (e) {
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
