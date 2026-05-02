import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import type { SessionStatus, SessionSummary } from "../types";
import { formatDuration } from "./format";

export function summarizeSession(session: SessionRecord, events: TimelineEvent[]): SessionSummary {
  const sessionEvents = events.filter((event) => event.sessionId === session.id);
  const hasError = sessionEvents.some((event) => event.metadata["phase"] === "codex_error" || /failed/i.test(event.title));
  const hasPendingMemory = sessionEvents.some((event) => event.category === "rule_candidate");
  const hasRunning = sessionEvents.some((event) => /running/i.test(event.title));
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
    activeSessions: input.sessions.filter((session) =>
      input.events.some((event) => event.sessionId === session.id && /running/i.test(event.title))
    ).length,
    approvedMemory: input.memories.filter((memory) => memory.status === "approved" && !memory.supersededBy).length,
    pendingMemory: input.memories.filter((memory) => memory.status === "pending").length,
    recentContextEvents: input.events.filter((event) =>
      ["memory_retrieval", "memory_injection", "compression_result"].includes(event.category)
    ).length
  };
}

export function deriveTokenDelta(events: TimelineEvent[]): number {
  return events.reduce((sum, event) => {
    if (event.category !== "compression_result") return sum;
    const tokensRemoved = event.metadata["tokensRemoved"];
    if (typeof tokensRemoved !== "number" || !Number.isFinite(tokensRemoved)) return sum;
    return sum - tokensRemoved;
  }, 0);
}
