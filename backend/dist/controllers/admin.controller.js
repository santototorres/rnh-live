"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStructure = exports.uploadParticipants = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const uploadParticipants = async (req, res) => {
    try {
        const { participants, groupSize = 4 } = req.body;
        if (!Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ error: "No participants provided" });
        }
        // 1. Ensure we have an active Tournament
        let tournament = await prisma.tournament.findFirst({ where: { status: "setup" } });
        if (!tournament) {
            tournament = await prisma.tournament.create({
                data: { name: "RNH Live Event", status: "setup" }
            });
        }
        // 2. Group participants by their "Categoria" column from Google Sheets
        const participantsByCategory = {};
        for (const p of participants) {
            const catName = p.Categoria || "Open";
            if (!participantsByCategory[catName]) {
                participantsByCategory[catName] = [];
            }
            participantsByCategory[catName].push(p);
        }
        let totalGroups = 0;
        let totalParticipants = 0;
        // 3. Process each Category
        for (const [catName, catParticipants] of Object.entries(participantsByCategory)) {
            // Find or create category
            let category = await prisma.category.findFirst({
                where: { tournamentId: tournament.id, name: catName }
            });
            if (!category) {
                category = await prisma.category.create({
                    data: { name: catName, tournamentId: tournament.id, groupSize }
                });
            }
            // Insert Participants (Nombre, Alias)
            const createdParticipants = await Promise.all(catParticipants.map(async (p) => {
                return prisma.participant.create({
                    data: {
                        name: p.Nombre || p.name || 'Unknown',
                        alias: p.Alias || p.alias || null,
                        categoryId: category.id
                    }
                });
            }));
            totalParticipants += createdParticipants.length;
            // Generate Round 1
            let round1 = await prisma.round.findFirst({
                where: { categoryId: category.id, number: 1 }
            });
            if (!round1) {
                round1 = await prisma.round.create({
                    data: { number: 1, categoryId: category.id }
                });
            }
            // Shuffle participants randomly
            const shuffled = [...createdParticipants].sort(() => Math.random() - 0.5);
            const chunks = [];
            for (let i = 0; i < shuffled.length; i += groupSize) {
                chunks.push(shuffled.slice(i, i + groupSize));
            }
            // Create Groups
            for (let i = 0; i < chunks.length; i++) {
                const groupData = await prisma.group.create({
                    data: {
                        name: `Heat ${i + 1}`,
                        roundId: round1.id
                    }
                });
                // Assign participants to group with specific skating order
                await Promise.all(chunks[i].map((p, index) => {
                    return prisma.groupParticipant.create({
                        data: {
                            groupId: groupData.id,
                            participantId: p.id,
                            order: index + 1
                        }
                    });
                }));
            }
            totalGroups += chunks.length;
        }
        res.status(200).json({
            message: "Participantes importados y agrupados por categoría.",
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
const getStructure = async (req, res) => {
    try {
        const tournament = await prisma.tournament.findFirst({
            where: { status: "setup" },
            include: {
                categories: {
                    include: {
                        rounds: {
                            include: {
                                groups: {
                                    include: {
                                        participants: {
                                            include: {
                                                participant: true
                                            },
                                            orderBy: {
                                                order: 'asc'
                                            }
                                        }
                                    },
                                    orderBy: {
                                        name: 'asc'
                                    }
                                }
                            },
                            orderBy: {
                                number: 'asc'
                            }
                        }
                    }
                }
            }
        });
        if (!tournament) {
            return res.status(404).json({ error: "No active tournament found." });
        }
        res.status(200).json(tournament);
    }
    catch (error) {
        console.error("Error fetching structure:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getStructure = getStructure;
