export const ACTIVE_SESSION_DETAIL_POLL_INTERVAL_MS = 1000;
export const IDLE_SESSION_DETAIL_POLL_INTERVAL_MS = 5000;

export function sessionDetailPollInterval(input: {
  hasSelectedSession: boolean;
  runActive: boolean;
}): number | null {
  if (!input.hasSelectedSession) return null;
  return input.runActive
    ? ACTIVE_SESSION_DETAIL_POLL_INTERVAL_MS
    : IDLE_SESSION_DETAIL_POLL_INTERVAL_MS;
}

export function isSessionDetailRunActive(input: {
  selectedSessionId: string | null;
  continuedSessionRunning: boolean;
  continuedSessionId: string | null;
  newSessionRunning: boolean;
  optimisticSessionId: string | null;
}): boolean {
  if (!input.selectedSessionId) return false;
  const continuedRunActive =
    input.continuedSessionRunning && input.selectedSessionId === input.continuedSessionId;
  const newRunActive = input.newSessionRunning && input.selectedSessionId === input.optimisticSessionId;
  return continuedRunActive || newRunActive;
}
