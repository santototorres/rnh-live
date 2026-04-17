"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConsensus = registerConsensus;
exports.resetConsensus = resetConsensus;
exports.resetAllConsensus = resetAllConsensus;
exports.getConsensusState = getConsensusState;
const db_1 = __importDefault(require("../db"));
/**
 * Register a judge's consensus for a specific action.
 * Returns { registered, total, required, reached }
 */
async function registerConsensus(judgeId, field, requiredCount) {
    const state = await db_1.default.systemState.findUnique({ where: { id: 'global' } });
    if (!state)
        throw new Error('SystemState not initialized');
    const current = JSON.parse(state[field] || '[]');
    // Don't double count
    if (current.includes(judgeId)) {
        return {
            registered: false,
            judgeIds: current,
            total: current.length,
            required: requiredCount,
            reached: current.length >= requiredCount
        };
    }
    current.push(judgeId);
    await db_1.default.systemState.update({
        where: { id: 'global' },
        data: { [field]: JSON.stringify(current) }
    });
    return {
        registered: true,
        judgeIds: current,
        total: current.length,
        required: requiredCount,
        reached: current.length >= requiredCount
    };
}
/**
 * Reset a consensus field back to empty array.
 */
async function resetConsensus(field) {
    await db_1.default.systemState.update({
        where: { id: 'global' },
        data: { [field]: '[]' }
    });
}
/**
 * Reset ALL consensus fields.
 */
async function resetAllConsensus() {
    await db_1.default.systemState.update({
        where: { id: 'global' },
        data: {
            consensusEndPasada: '[]',
            consensusNextPasada: '[]',
            consensusNextGroup: '[]'
        }
    });
}
/**
 * Get the current consensus state for a field.
 */
async function getConsensusState(field) {
    const state = await db_1.default.systemState.findUnique({ where: { id: 'global' } });
    if (!state)
        return { judgeIds: [], total: 0 };
    const current = JSON.parse(state[field] || '[]');
    return { judgeIds: current, total: current.length };
}
