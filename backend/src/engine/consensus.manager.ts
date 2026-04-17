import prisma from '../db';

// ─────────────────────────────────────────────
// CONSENSUS MANAGER — Tracks judge confirmations
// ─────────────────────────────────────────────

type ConsensusField = 'consensusEndPasada' | 'consensusNextPasada' | 'consensusNextGroup';

/**
 * Register a judge's consensus for a specific action.
 * Returns { registered, total, required, reached }
 */
export async function registerConsensus(
  judgeId: string,
  field: ConsensusField,
  requiredCount: number
) {
  const state = await prisma.systemState.findUnique({ where: { id: 'global' } });
  if (!state) throw new Error('SystemState not initialized');

  const current: string[] = JSON.parse((state as any)[field] || '[]');

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

  await prisma.systemState.update({
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
export async function resetConsensus(field: ConsensusField) {
  await prisma.systemState.update({
    where: { id: 'global' },
    data: { [field]: '[]' }
  });
}

/**
 * Reset ALL consensus fields.
 */
export async function resetAllConsensus() {
  await prisma.systemState.update({
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
export async function getConsensusState(field: ConsensusField) {
  const state = await prisma.systemState.findUnique({ where: { id: 'global' } });
  if (!state) return { judgeIds: [], total: 0 };

  const current: string[] = JSON.parse((state as any)[field] || '[]');
  return { judgeIds: current, total: current.length };
}
