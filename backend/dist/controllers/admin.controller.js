"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetTournament = exports.deleteJudge = exports.getJudges = exports.createJudge = exports.updateCategory = exports.getStructure = exports.randomizeGroups = exports.uploadParticipants = void 0;
const db_1 = __importDefault(require("../db"));
// ─── Upload Participants from Google Sheets CSV ───
const uploadParticipants = async (req, res) => {
    try {
        const { participants, groupSize = 4 } = req.body;
        if (!Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ error: "No participants provided" });
        }
        // 1. Ensure we have an active Tournament
        let tournament = await db_1.default.tournament.findFirst({ where: { status: "setup" } });
        if (!tournament) {
            tournament = await db_1.default.tournament.create({
                data: { name: "RNH Live Event", status: "setup" }
            });
        }
        // 2. Group participants by their "Categoria" column
        const participantsByCategory = {};
        for (const p of participants) {
            const catName = p.Categoria || "Open";
            if (!participantsByCategory[catName])
                participantsByCategory[catName] = [];
            participantsByCategory[catName].push(p);
        }
        let totalGroups = 0;
        let totalParticipants = 0;
        // 3. Process each Category
        for (const [catName, catParticipants] of Object.entries(participantsByCategory)) {
            let category = await db_1.default.category.findFirst({
                where: { tournamentId: tournament.id, name: catName }
            });
            if (!category) {
                category = await db_1.default.category.create({
                    data: { name: catName, tournamentId: tournament.id, groupSize }
                });
            }
            const createdParticipants = await Promise.all(catParticipants.map(async (p) => db_1.default.participant.create({
                data: {
                    name: p.Nombre || p.name || 'Unknown',
                    alias: p.Alias || p.alias || null,
                    categoryId: category.id
                }
            })));
            totalParticipants += createdParticipants.length;
            // Generate Round 1
            let round1 = await db_1.default.round.findFirst({
                where: { categoryId: category.id, number: 1 }
            });
            if (!round1) {
                round1 = await db_1.default.round.create({ data: { number: 1, categoryId: category.id } });
            }
            // Shuffle and chunk
            const shuffled = [...createdParticipants].sort(() => Math.random() - 0.5);
            const chunks = [];
            for (let i = 0; i < shuffled.length; i += groupSize) {
                chunks.push(shuffled.slice(i, i + groupSize));
            }
            for (let i = 0; i < chunks.length; i++) {
                const group = await db_1.default.group.create({
                    data: { name: `Grupo ${i + 1}`, roundId: round1.id }
                });
                await Promise.all(chunks[i].map((p, index) => db_1.default.groupParticipant.create({
                    data: { groupId: group.id, participantId: p.id, order: index + 1 }
                })));
            }
            totalGroups += chunks.length;
        }
        res.status(200).json({
            message: "Participantes importados.",
            tournamentId: tournament.id,
            totalParticipants,
            totalGroups
        });
    }
    catch (error) {
        console.error("Error uploadParticipants:", error);
        res.status(500).json({ error: "Internal Server Error during upload." });
    }
};
exports.uploadParticipants = uploadParticipants;
// ─── Randomize Groups ───
const randomizeGroups = async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const category = await db_1.default.category.findUnique({ where: { id: categoryId } });
        if (!category)
            return res.status(404).json({ error: "No category found" });
        const round1 = await db_1.default.round.findFirst({
            where: { categoryId: categoryId, number: 1 },
            include: { groups: { include: { participants: true } } }
        });
        if (round1) {
            const participantIds = round1.groups.flatMap((g) => g.participants.map((p) => p.participantId));
            await db_1.default.groupParticipant.deleteMany({ where: { group: { roundId: round1.id } } });
            await db_1.default.group.deleteMany({ where: { roundId: round1.id } });
            const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
            const chunks = [];
            for (let i = 0; i < shuffled.length; i += category.groupSize) {
                chunks.push(shuffled.slice(i, i + category.groupSize));
            }
            for (let i = 0; i < chunks.length; i++) {
                const group = await db_1.default.group.create({
                    data: { name: `Grupo ${i + 1}`, roundId: round1.id }
                });
                await Promise.all(chunks[i].map((pid, index) => db_1.default.groupParticipant.create({
                    data: { groupId: group.id, participantId: pid, order: index + 1 }
                })));
            }
        }
        res.status(200).json({ message: "Grupos mezclados aleatoriamente." });
    }
    catch (error) {
        console.error("Error randomizeGroups:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.randomizeGroups = randomizeGroups;
// ─── Get Full Tournament Structure ───
const getStructure = async (_req, res) => {
    try {
        const tournament = await db_1.default.tournament.findFirst({
            include: {
                categories: {
                    include: {
                        judges: true,
                        rounds: {
                            include: {
                                groups: {
                                    include: {
                                        participants: {
                                            include: { participant: true },
                                            orderBy: { order: 'asc' }
                                        }
                                    },
                                    orderBy: { name: 'asc' }
                                }
                            },
                            orderBy: { number: 'asc' }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        if (!tournament)
            return res.status(404).json({ error: "No tournament found." });
        res.status(200).json(tournament);
    }
    catch (error) {
        console.error("Error fetching structure:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getStructure = getStructure;
// ─── Update Category Config ───
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { pasadasCount, groupSize, qualifyPercent, judgesCount } = req.body;
        const updated = await db_1.default.category.update({
            where: { id: id },
            data: {
                ...(pasadasCount !== undefined && { pasadasCount }),
                ...(groupSize !== undefined && { groupSize }),
                ...(qualifyPercent !== undefined && { qualifyPercent }),
                ...(judgesCount !== undefined && { judgesCount })
            }
        });
        if (groupSize !== undefined) {
            const tournament = await db_1.default.tournament.findUnique({ where: { id: updated.tournamentId } });
            if (tournament?.status === 'setup') {
                const round1 = await db_1.default.round.findFirst({
                    where: { categoryId: updated.id, number: 1 },
                    include: { groups: { include: { participants: true } } }
                });
                if (round1) {
                    const participantIds = round1.groups.flatMap((g) => g.participants.map((p) => p.participantId));
                    await db_1.default.groupParticipant.deleteMany({ where: { group: { roundId: round1.id } } });
                    await db_1.default.group.deleteMany({ where: { roundId: round1.id } });
                    const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
                    const chunks = [];
                    for (let i = 0; i < shuffled.length; i += updated.groupSize) {
                        chunks.push(shuffled.slice(i, i + updated.groupSize));
                    }
                    for (let i = 0; i < chunks.length; i++) {
                        const group = await db_1.default.group.create({
                            data: { name: `Grupo ${i + 1}`, roundId: round1.id }
                        });
                        await Promise.all(chunks[i].map((pid, index) => db_1.default.groupParticipant.create({
                            data: { groupId: group.id, participantId: pid, order: index + 1 }
                        })));
                    }
                }
            }
        }
        res.status(200).json(updated);
    }
    catch (error) {
        console.error("Error updateCategory:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.updateCategory = updateCategory;
// ─── CRUD Judges ───
const createJudge = async (req, res) => {
    try {
        const { name, pin, categoryId } = req.body;
        if (!name || !pin || !categoryId) {
            return res.status(400).json({ error: "name, pin, and categoryId are required" });
        }
        const existing = await db_1.default.judge.findUnique({ where: { pin } });
        if (existing)
            return res.status(409).json({ error: "PIN already exists" });
        const judge = await db_1.default.judge.create({
            data: { name, pin, categoryId }
        });
        res.status(201).json(judge);
    }
    catch (error) {
        console.error("Error createJudge:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.createJudge = createJudge;
const getJudges = async (req, res) => {
    try {
        const categoryId = req.query.categoryId;
        const judges = await db_1.default.judge.findMany({
            where: categoryId ? { categoryId } : {},
            include: { category: true }
        });
        res.status(200).json(judges);
    }
    catch (error) {
        console.error("Error getJudges:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getJudges = getJudges;
const deleteJudge = async (req, res) => {
    try {
        await db_1.default.judge.delete({ where: { id: req.params.id } });
        res.status(200).json({ message: "Judge deleted" });
    }
    catch (error) {
        console.error("Error deleteJudge:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.deleteJudge = deleteJudge;
// ─── Reset Tournament ───
const resetTournament = async (_req, res) => {
    try {
        // Delete all data in order
        await db_1.default.score.deleteMany({});
        await db_1.default.groupParticipant.deleteMany({});
        await db_1.default.group.deleteMany({});
        await db_1.default.round.deleteMany({});
        await db_1.default.participant.deleteMany({});
        await db_1.default.judge.deleteMany();
        await db_1.default.category.deleteMany();
        await db_1.default.tournament.deleteMany();
        await db_1.default.systemState.upsert({
            where: { id: 'global' },
            update: {
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
            },
            create: { id: 'global' }
        });
        res.status(200).json({ message: "Tournament reset complete" });
    }
    catch (error) {
        console.error("Error resetTournament:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.resetTournament = resetTournament;
