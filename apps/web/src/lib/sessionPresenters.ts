import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import type { SessionStatus, SessionSummary } from "../types";
import { formatDuration } from "./format";

export function summarizeSession(
  session: SessionRecord,
  events: TimelineEvent[],
  memories: MemoryRecord[] = []
): SessionSummary {
  const sessionEvents = events
    .filter((event) => event.sessionId === session.id)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const hasError = sessionEvents.some((event) => event.metadata["phase"] === "codex_error" || /failed/i.test(event.title));
  const hasPendingMemory = memories.some(
    (memory) => memory.status === "pending" && memoryBelongsToSession(memory, session.id, sessionEvents)
  );
  const latestEvent = sessionEvents.at(-1);
  const hasRunning = latestEvent?.category === "codex_event" && latestEvent.metadata["phase"] === "input";
  const status: SessionStatus = hasError
    ? "failed"
    : hasPendingMemory
      ? "needs_review"
      : hasRunning
        ? "running"
        : "done";
  const memoryIn = sessionEvents.reduce((sum, event) => {
    if (event.category !== "memory_injection") return sum;
    const ids = event.metadata["memoryIds"];
    return sum + (Array.isArray(ids) ? ids.length : 0);
  }, 0);
  const newMemory = sessionEvents.filter((event) => event.category === "rule_candidate").length;
  const adapterEvent = sessionEvents.find((event) => typeof event.metadata["adapter"] === "string");

  return {
    session,
    title: session.title,
    status,
    adapter: String(adapterEvent?.metadata["adapter"] ?? "default"),
    startedAt: session.createdAt,
    durationLabel: formatDuration(session.createdAt, sessionEvents.at(-1)?.createdAt),
    memoryIn,
    newMemory,
    tokenDelta: deriveTokenDelta(sessionEvents),
    eventCount: sessionEvents.length
  };
}

export function buildDashboardMetrics(input: {
  sessions: SessionRecord[];
  events: TimelineEvent[];
  memories: MemoryRecord[];
}) {
  return {
    activeSessions: input.sessions.filter(
      (session) => summarizeSession(session, input.events, input.memories).status === "running"
    ).length,
    approvedMemory: input.memories.filter((memory) => memory.status === "approved" && !memory.supersededBy).length,
    pendingMemory: input.memories.filter((memory) => memory.status === "pending").length,
    recentContextEvents: input.events.filter((event) =>
      ["memory_retrieval", "memory_injection", "compression_result"].includes(event.category)
    ).length
  };
}

function memoryBelongsToSession(memory: MemoryRecord, sessionId: string, sessionEvents: TimelineEvent[]): boolean {
  if (memory.source.kind === "event" && memory.source.sessionId === sessionId) return true;
  return Boolean(memory.sourceEventId && sessionEvents.some((event) => event.id === memory.sourceEventId));
}

export function deriveTokenDelta(events: TimelineEvent[]): number {
  return events.reduce((sum, event) => {
    if (event.category !== "compression_result") return sum;
    const tokensRemoved = event.metadata["tokensRemoved"];
    if (typeof tokensRemoved !== "number" || !Number.isFinite(tokensRemoved)) return sum;
    return sum - tokensRemoved;
  }, 0);
}
