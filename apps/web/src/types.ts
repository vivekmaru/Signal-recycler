import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";

export type AppRoute = "dashboard" | "sessions" | "session" | "memory" | "context" | "evals" | "sync" | "settings";

export type SessionStatus = "running" | "needs_review" | "done" | "failed";

export type InspectorSelection =
  | { type: "empty" }
  | { type: "event"; event: TimelineEvent }
  | { type: "memory"; memory: MemoryRecord }
  | { type: "session"; session: SessionRecord };

export type SessionSummary = {
  session: SessionRecord;
  title: string;
  status: SessionStatus;
  adapter: string;
  startedAt: string;
  durationLabel: string;
  memoryIn: number;
  newMemory: number;
  tokenDelta: number;
  eventCount: number;
};

export type TimelineGroupId = "agent" | "context" | "memory" | "tools" | "errors" | "files";

export type TimelineGroup = {
  id: TimelineGroupId;
  title: string;
  events: TimelineEvent[];
};
