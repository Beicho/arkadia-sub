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
