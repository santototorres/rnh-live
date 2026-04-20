"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGroupParticipants = getGroupParticipants;
exports.calculatePasadaRanking = calculatePasadaRanking;
exports.calculateGroupRanking = calculateGroupRanking;
exports.calculateRoundClassification = calculateRoundClassification;
exports.generateNextRound = generateNextRound;
const db_1 = __importDefault(require("../db"));
// ─────────────────────────────────────────────
// TOURNAMENT ENGINE — Pure calculation functions
// ─────────────────────────────────────────────
/**
 * Get all participants of a group, ordered by skating order
 */
async function getGroupParticipants(groupId) {
    return db_1.default.groupParticipant.findMany({
        where: { groupId },
        include: { participant: { include: { category: true } } },
        orderBy: { order: 'asc' }
    });
}
/**
 * Calculate ranking for a specific pasada within a group.
 * Returns participants sorted by their average score descending.
 */
async function calculatePasadaRanking(groupId, roundId, pasadaNumber) {
    const groupParts = await getGroupParticipants(groupId);
    const participantIds = groupParts.map(gp => gp.participantId);
    const scores = await db_1.default.score.findMany({
        where: {
            participantId: { in: participantIds },
            roundId,
            pasadaNumber
        },
        include: { judge: true }
    });
    // Group scores by participant
    const scoreMap = {};
    for (const s of scores) {
        if (!scoreMap[s.participantId]) {
            scoreMap[s.participantId] = { total: 0, count: 0, scores: [] };
        }
        scoreMap[s.participantId].total += s.value;
        scoreMap[s.participantId].count += 1;
        scoreMap[s.participantId].scores.push(s.value);
    }
    const ranking = groupParts.map(gp => {
        const data = scoreMap[gp.participantId] || { total: 0, count: 0, scores: [] };
        return {
            participantId: gp.participantId,
            name: gp.participant.name,
            category: gp.participant.category?.name || '',
            totalScore: data.total,
            avgScore: data.count > 0 ? data.total / data.count : 0,
            judgeScores: data.scores,
            pasadaNumber
        };
    });
    ranking.sort((a, b) => b.totalScore - a.totalScore);
    return ranking.map((r, i) => ({ ...r, position: i + 1 }));
}
/**
 * Calculate accumulated ranking for ALL pasadas in a group.
 * Sum of all scores across all pasadas.
 */
async function calculateGroupRanking(groupId, roundId, totalPasadas) {
    const groupParts = await getGroupParticipants(groupId);
    const participantIds = groupParts.map(gp => gp.participantId);
    const scores = await db_1.default.score.findMany({
        where: {
            participantId: { in: participantIds },
            roundId,
            pasadaNumber: { lte: totalPasadas }
        }
    });
    const scoreMap = {};
    for (const s of scores) {
        if (!scoreMap[s.participantId]) {
            scoreMap[s.participantId] = { total: 0, best: 0, scores: [] };
        }
        scoreMap[s.participantId].total += s.value;
        scoreMap[s.participantId].scores.push(s.value);
        if (s.value > scoreMap[s.participantId].best) {
            scoreMap[s.participantId].best = s.value;
        }
    }
    const ranking = groupParts.map(gp => {
        const data = scoreMap[gp.participantId] || { total: 0, best: 0, scores: [] };
        return {
            participantId: gp.participantId,
            name: gp.participant.name,
            category: gp.participant.category?.name || '',
            totalScore: data.total,
            bestScore: data.best,
            allScores: data.scores
        };
    });
    // Sort: highest total first, then highest best individual score
    ranking.sort((a, b) => {
        if (b.totalScore !== a.totalScore)
            return b.totalScore - a.totalScore;
        return b.bestScore - a.bestScore;
    });
    // Detect ties
    return ranking.map((r, i) => {
        const prev = i > 0 ? ranking[i - 1] : null;
        const isTied = prev && prev.totalScore === r.totalScore && prev.bestScore === r.bestScore;
        return { ...r, position: i + 1, isTied: !!isTied };
    });
}
/**
 * Calculate classification for an entire round.
 * Gathers all group rankings and selects the top qualifyCount.
 */
async function calculateRoundClassification(roundId, categoryId) {
    const category = await db_1.default.category.findUnique({ where: { id: categoryId } });
    if (!category)
        return { qualified: [], eliminated: [], qualifyCount: 0 };
    const round = await db_1.default.round.findUnique({
        where: { id: roundId },
        include: { groups: true }
    });
    if (!round)
        return { qualified: [], eliminated: [], qualifyCount: category.qualifyCount };
    let allParticipants = [];
    for (const group of round.groups) {
        const ranking = await calculateGroupRanking(group.id, round.id, category.pasadasCount);
        allParticipants.push(...ranking);
    }
    // Sort all participants globally
    allParticipants.sort((a, b) => {
        if (b.totalScore !== a.totalScore)
            return b.totalScore - a.totalScore;
        return b.bestScore - a.bestScore;
    });
    const qualifyCount = category.qualifyCount;
    const qualified = allParticipants.slice(0, qualifyCount);
    const eliminated = allParticipants.slice(qualifyCount);
    return {
        qualified: qualified.map((p, i) => ({ ...p, globalPosition: i + 1 })),
        eliminated: eliminated.map((p, i) => ({ ...p, globalPosition: qualifyCount + i + 1 })),
        qualifyCount,
        totalParticipants: allParticipants.length,
        roundNumber: round.number,
        categoryName: category.name
    };
}
/**
 * Generate a new round with qualified participants reshuffled into groups.
 */
async function generateNextRound(categoryId, qualifiedParticipantIds) {
    const category = await db_1.default.category.findUnique({ where: { id: categoryId } });
    if (!category)
        throw new Error("Category not found");
    const currentRounds = await db_1.default.round.count({ where: { categoryId } });
    const nextRoundNumber = currentRounds + 1;
    const round = await db_1.default.round.create({
        data: {
            number: nextRoundNumber,
            categoryId,
            status: 'pending'
        }
    });
    // Shuffle
    const shuffled = [...qualifiedParticipantIds].sort(() => Math.random() - 0.5);
    const groupSize = category.groupSize;
    const chunks = [];
    for (let i = 0; i < shuffled.length; i += groupSize) {
        chunks.push(shuffled.slice(i, i + groupSize));
    }
    for (let i = 0; i < chunks.length; i++) {
        const group = await db_1.default.group.create({
            data: {
                name: `Grupo ${i + 1}`,
                roundId: round.id
            }
        });
        await Promise.all(chunks[i].map((pid, index) => db_1.default.groupParticipant.create({
            data: { groupId: group.id, participantId: pid, order: index + 1 }
        })));
    }
    return round;
}
