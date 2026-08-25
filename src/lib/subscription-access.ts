export function requiresUpdateCredit(input: {
  lockedMode: boolean;
  freeUntil: Date | null;
  updateCredits: number;
  lastPulledBatchDate: string | null;
  batchDate: string;
}): boolean {
  return (
    !input.lockedMode &&
    !input.freeUntil &&
    input.updateCredits <= 0 &&
    input.lastPulledBatchDate !== input.batchDate
  );
}

export function shouldFallbackToPreviousBatch(input: {
  lockedMode: boolean;
  freeUntil: Date | null;
  updateCredits: number;
  lastPulledBatchDate: string | null;
  activeBatchDate: string;
  previousBatchDate: string | null;
}): boolean {
  return (
    !input.lockedMode &&
    !input.freeUntil &&
    input.updateCredits <= 0 &&
    input.lastPulledBatchDate !== input.activeBatchDate &&
    input.previousBatchDate !== null &&
    input.previousBatchDate === input.lastPulledBatchDate
  );
}
