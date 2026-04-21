"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetCategory = exports.resetTournament = exports.deleteJudge = exports.getJudges = exports.createJudge = exports.updateCategory = exports.getStructure = exports.randomizeGroups = exports.uploadParticipants = exports.uploadParticipantsUrl = void 0;
const db_1 = __importDefault(require("../db"));
const papaparse_1 = __importDefault(require("papaparse"));
// ─── Upload Participants from Google Sheets CSV ───
const uploadParticipantsUrl = async (req, res) => {
    try {
        const { sheetUrl, groupSize = 4 } = req.body;
        if (!sheetUrl)
            return res.status(400).json({ error: "URL inválida" });
        let csvUrl = sheetUrl;
        // Automatically convert pubhtml to pub?output=csv
        if (sheetUrl.includes('/pubhtml')) {
            csvUrl = sheetUrl.replace('/pubhtml', '/pub?output=csv');
        }
        else if (!sheetUrl.includes('/pub?')) {
            let docId = sheetUrl;
            const match = sheetUrl.match(/\/d\/(.*?)(\/|$)/);
            if (match?.[1])
                docId = match[1];
            csvUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(csvUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) {
            return res.status(400).json({ error: "No se pudo descargar. Verifica que el enlace a la hoja de cálculo sea público (Cualquier persona con el enlace)." });
        }
        const csvText = await response.text();
        const results = papaparse_1.default.parse(csvText, {
            header: true,
            skipEmptyLines: true,
        });
        const participants = results.data;
        let tournament = await db_1.default.tournament.findFirst({ where: { status: "setup" } });
        if (!tournament) {
            tournament = await db_1.default.tournament.create({
                data: { name: "RNH Live Event", status: "setup" }
            });
            const fixedCategories = ["Mujeres Pro", "Hombres Amateur", "Hombres Pro", "Rollerskate", "Mujeres Amateur", "Junior"];
            for (const catName of fixedCategories) {
                await db_1.default.category.create({ data: { name: catName, tournamentId: tournament.id, groupSize: 4 } });
            }
        }
        const participantsByCategory = {};
        for (const p of participants) {
            const catName = p.Categoria || p.categoria || p.category || "Open";
            if (!participantsByCategory[catName])
                participantsByCategory[catName] = [];
            participantsByCategory[catName].push(p);
        }
        let totalGroups = 0;
        let totalParticipants = 0;
        const categories = await db_1.default.category.findMany({ where: { tournamentId: tournament.id } });
        for (const [catName, catParticipants] of Object.entries(participantsByCategory)) {
            let category = categories.find(c => c.name.toLowerCase().trim() === catName.toLowerCase().trim());
            if (!category) {
                category = await db_1.default.category.create({
                    data: { name: catName, tournamentId: tournament.id, groupSize }
                });
            }
            const createdParticipants = await Promise.all(catParticipants.map(async (p) => db_1.default.participant.create({
                data: {
                    name: p.Nombre || p.nombre || p.name || 'Unknown',
                    alias: p.Alias || p.alias || null,
                    categoryId: category.id
                }
            })));
            totalParticipants += createdParticipants.length;
            let round1 = await db_1.default.round.findFirst({ where: { categoryId: category.id, number: 1 } });
            if (!round1) {
                round1 = await db_1.default.round.create({ data: { number: 1, categoryId: category.id } });
            }
            const existingParticipants = await db_1.default.participant.findMany({ where: { categoryId: category.id } });
            const shuffled = [...existingParticipants].sort(() => Math.random() - 0.5);
            const existingGroups = await db_1.default.group.findMany({ where: { roundId: round1.id } });
            if (existingGroups.length > 0) {
                await db_1.default.groupParticipant.deleteMany({ where: { groupId: { in: existingGroups.map(g => g.id) } } });
                await db_1.default.group.deleteMany({ where: { roundId: round1.id } });
            }
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
            message: "Participantes importados correctamente.",
            tournamentId: tournament.id,
            totalParticipants,
            totalGroups
        });
    }
    catch (error) {
        console.error("Error uploadParticipantsUrl:", error);
        res.status(500).json({ error: "Error interno: " + error.message + " | Stack: " + String(error.stack) });
    }
};
exports.uploadParticipantsUrl = uploadParticipantsUrl;
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
            const fixedCategories = ["Mujeres Pro", "Hombres Amateur", "Hombres Pro", "Rollerskate", "Mujeres Amateur", "Junior"];
            for (const catName of fixedCategories) {
                await db_1.default.category.create({ data: { name: catName, tournamentId: tournament.id, groupSize: 4 } });
            }
        }
        // 2. Group participants by their "Categoria" column
        const participantsByCategory = {};
        for (const p of participants) {
            const catName = p.Categoria || p.categoria || p.category || "Open";
            if (!participantsByCategory[catName])
                participantsByCategory[catName] = [];
            participantsByCategory[catName].push(p);
        }
        let totalGroups = 0;
        let totalParticipants = 0;
        const categories = await db_1.default.category.findMany({ where: { tournamentId: tournament.id } });
        // 3. Process each Category
        for (const [catName, catParticipants] of Object.entries(participantsByCategory)) {
            let category = categories.find(c => c.name.toLowerCase().trim() === catName.toLowerCase().trim());
            if (!category) {
                category = await db_1.default.category.create({
                    data: { name: catName, tournamentId: tournament.id, groupSize }
                });
            }
            const createdParticipants = [];
            for (const p of catParticipants) {
                const cp = await db_1.default.participant.create({
                    data: {
                        name: p.Nombre || p.name || 'Unknown',
                        alias: p.Alias || p.alias || null,
                        categoryId: category.id
                    }
                });
                createdParticipants.push(cp);
            }
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
                for (let j = 0; j < chunks[i].length; j++) {
                    const p = chunks[i][j];
                    await db_1.default.groupParticipant.create({
                        data: { groupId: group.id, participantId: p.id, order: j + 1 }
                    });
                }
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
        // Fetch the formed groups with participant names
        const formedGroups = await db_1.default.group.findMany({
            where: { roundId: round1.id },
            orderBy: { name: 'asc' },
            include: { participants: { include: { participant: true }, orderBy: { order: 'asc' } } }
        });
        const groupsData = formedGroups.map(g => ({
            name: g.name,
            participants: g.participants.map(gp => gp.participant.name)
        }));
        res.status(200).json({ message: "Grupos mezclados aleatoriamente.", groups: groupsData });
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
        let tournament = await db_1.default.tournament.findFirst({
            include: {
                judges: true,
                categories: {
                    include: {
                        participants: true,
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
        if (!tournament) {
            const createdTournament = await db_1.default.tournament.create({
                data: { name: "RNH Live Event", status: "setup" }
            });
            const fixedCategories = ["Mujeres Pro", "Hombres Amateur", "Hombres Pro", "Rollerskate", "Mujeres Amateur", "Junior"];
            for (const catName of fixedCategories) {
                await db_1.default.category.create({ data: { name: catName, tournamentId: createdTournament.id, groupSize: 4 } });
            }
            tournament = await db_1.default.tournament.findFirst({
                where: { id: createdTournament.id },
                include: {
                    judges: true,
                    categories: {
                        include: {
                            participants: true,
                            rounds: { include: { groups: { include: { participants: { include: { participant: true }, orderBy: { order: 'asc' } } }, orderBy: { name: 'asc' } } }, orderBy: { number: 'asc' } }
                        }
                    }
                }
            });
        }
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
        const { pasadasCount, groupSize, qualifyCount } = req.body;
        const updated = await db_1.default.category.update({
            where: { id: id },
            data: {
                ...(pasadasCount !== undefined && { pasadasCount }),
                ...(groupSize !== undefined && { groupSize }),
                ...(qualifyCount !== undefined && { qualifyCount })
            }
        });
        if (groupSize !== undefined) {
            const activeRound = await db_1.default.round.findFirst({
                where: { categoryId: updated.id, status: { not: 'completed' } },
                orderBy: { number: 'desc' },
                include: { groups: { include: { participants: true } } }
            });
            if (activeRound) {
                const participantIds = activeRound.groups.flatMap((g) => g.participants.map((p) => p.participantId));
                await db_1.default.groupParticipant.deleteMany({ where: { group: { roundId: activeRound.id } } });
                await db_1.default.group.deleteMany({ where: { roundId: activeRound.id } });
                const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
                const chunks = [];
                for (let i = 0; i < shuffled.length; i += updated.groupSize) {
                    chunks.push(shuffled.slice(i, i + updated.groupSize));
                }
                for (let i = 0; i < chunks.length; i++) {
                    const group = await db_1.default.group.create({
                        data: { name: `Grupo ${i + 1}`, roundId: activeRound.id }
                    });
                    await Promise.all(chunks[i].map((pid, index) => db_1.default.groupParticipant.create({
                        data: { groupId: group.id, participantId: pid, order: index + 1 }
                    })));
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
        const { name, pin, tournamentId } = req.body;
        if (!name || !pin || !tournamentId) {
            return res.status(400).json({ error: "name, pin, and tournamentId are required" });
        }
        const existing = await db_1.default.judge.findUnique({ where: { pin } });
        if (existing)
            return res.status(409).json({ error: "PIN already exists" });
        const judge = await db_1.default.judge.create({
            data: { name, pin, tournamentId }
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
        const tournamentId = req.query.tournamentId;
        const judges = await db_1.default.judge.findMany({
            where: tournamentId ? { tournamentId } : {},
            include: { tournament: true }
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
const resetCategory = async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const cat = await db_1.default.category.findUnique({ where: { id: categoryId } });
        if (!cat)
            return res.status(404).json({ error: "No encontrada" });
        // Get rounds and groups for this category
        const rounds = await db_1.default.round.findMany({ where: { categoryId } });
        const roundIds = rounds.map(r => r.id);
        // Delete scores for this category's rounds
        if (roundIds.length > 0) {
            await db_1.default.score.deleteMany({ where: { roundId: { in: roundIds } } });
        }
        // Delete group participants and groups
        const groups = await db_1.default.group.findMany({ where: { roundId: { in: roundIds } } });
        const groupIds = groups.map(g => g.id);
        if (groupIds.length > 0) {
            await db_1.default.groupParticipant.deleteMany({ where: { groupId: { in: groupIds } } });
            await db_1.default.group.deleteMany({ where: { id: { in: groupIds } } });
        }
        // Delete rounds
        await db_1.default.round.deleteMany({ where: { categoryId } });
        // Recreate Round 1 with participants reshuffled
        const participants = await db_1.default.participant.findMany({ where: { categoryId } });
        if (participants.length > 0) {
            const round1 = await db_1.default.round.create({ data: { number: 1, categoryId } });
            const shuffled = [...participants].sort(() => Math.random() - 0.5);
            const chunks = [];
            for (let i = 0; i < shuffled.length; i += cat.groupSize) {
                chunks.push(shuffled.slice(i, i + cat.groupSize));
            }
            for (let i = 0; i < chunks.length; i++) {
                const group = await db_1.default.group.create({
                    data: { name: `Grupo ${i + 1}`, roundId: round1.id }
                });
                await Promise.all(chunks[i].map((p, index) => db_1.default.groupParticipant.create({
                    data: { groupId: group.id, participantId: p.id, order: index + 1 }
                })));
            }
        }
        // Reset SystemState if this category was active
        const state = await db_1.default.systemState.findUnique({ where: { id: 'global' } });
        if (state && state.activeCategoryId === categoryId) {
            await db_1.default.systemState.update({
                where: { id: 'global' },
                data: {
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
                }
            });
        }
        res.status(200).json({ message: "Datos de categoría limpiados. Participantes y categoría intactos." });
    }
    catch (error) {
        console.error("Error resetCategory:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.resetCategory = resetCategory;
