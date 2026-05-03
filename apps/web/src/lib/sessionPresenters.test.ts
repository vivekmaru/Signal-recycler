import { describe, expect, it } from "vitest";
import type { MemoryRecord, SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { buildDashboardMetrics, deriveTokenDelta, summarizeSession } from "./sessionPresenters";

const session: SessionRecord = {
  id: "session_1",
  projectId: "demo",
  title: "Run validation",
  createdAt: "2026-05-03T00:00:00.000Z"
};

function event(input: Partial<TimelineEvent> & Pick<TimelineEvent, "id" | "category">): TimelineEvent {
  return {
    sessionId: session.id,
    title: input.title ?? "Event",
    body: input.body ?? "",
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? "2026-05-03T00:00:00.000Z",
    ...input
  };
}

function memory(input: Partial<MemoryRecord> & Pick<MemoryRecord, "id" | "status">): MemoryRecord {
  return {
    projectId: session.projectId,
    category: "tooling",
    rule: "Use pnpm.",
    reason: "Learned from this session.",
    sourceEventId: "e3",
    createdAt: "2026-05-03T00:00:00.000Z",
    approvedAt: null,
    memoryType: "rule",
    scope: { type: "project", value: null },
    source: { kind: "event", sessionId: session.id, eventId: "e3" },
    confidence: "medium",
    lastUsedAt: null,
    supersededBy: null,
    syncStatus: "local",
    updatedAt: "2026-05-03T00:00:00.000Z",
    ...input
  };
}

describe("session presenters", () => {
  it("derives session status and memory counts from events", () => {
    const summary = summarizeSession(
      session,
      [
        event({ id: "e1", category: "codex_event", title: "User prompt", body: "Test" }),
        event({
          id: "e2",
          category: "memory_injection",
          metadata: { memoryIds: ["mem_1", "mem_2"], adapter: "codex_cli" }
        }),
        event({ id: "e3", category: "rule_candidate", title: "Rule candidate", body: "Use pnpm." })
      ],
      [memory({ id: "mem_3", status: "pending" })]
    );

    expect(summary).toMatchObject({
      title: "Run validation",
      status: "needs_review",
      adapter: "codex_cli",
      memoryIn: 2,
      newMemory: 1,
      eventCount: 3
    });
  });

  it("does not keep an auto-approved candidate session in needs_review", () => {
    const summary = summarizeSession(
      session,
      [
        event({ id: "e1", category: "codex_event", title: "User prompt", body: "Test" }),
        event({ id: "e2", category: "codex_event", title: "Codex response", body: "Done." }),
        event({ id: "e3", category: "rule_candidate", title: "Rule candidate", body: "Use pnpm." }),
        event({ id: "e4", category: "rule_auto_approved", title: "Rule auto-approved", body: "Use pnpm." })
      ],
      [memory({ id: "mem_3", status: "approved", approvedAt: "2026-05-03T00:00:01.000Z" })]
    );

    expect(summary.status).toBe("done");
  });

  it("marks a session as running while the latest lifecycle event is only the input prompt", () => {
    const summary = summarizeSession(session, [
      event({ id: "e1", category: "codex_event", title: "User prompt", metadata: { phase: "input" } })
    ]);

    expect(summary.status).toBe("running");
  });

  it("keeps a session running while context events follow the input before terminal response", () => {
    const summary = summarizeSession(session, [
      event({ id: "e1", category: "codex_event", title: "User prompt", metadata: { phase: "input" } }),
      event({ id: "e2", category: "memory_retrieval", title: "Retrieved memory" }),
      event({ id: "e3", category: "memory_injection", title: "Injected memory", metadata: { memoryIds: ["mem_1"] } })
    ]);

    expect(summary.status).toBe("running");
  });

  it("marks a session done after terminal response even when post-run events follow", () => {
    const summary = summarizeSession(session, [
      event({ id: "e1", category: "codex_event", title: "User prompt", metadata: { phase: "input" } }),
      event({ id: "e2", category: "memory_injection", title: "Injected memory", metadata: { memoryIds: ["mem_1"] } }),
      event({ id: "e3", category: "codex_event", title: "Codex response", body: "Done." }),
      event({ id: "e4", category: "classifier_result", title: "Mark and distill complete" })
    ]);

    expect(summary.status).toBe("done");
  });

  it("derives token savings from compression events", () => {
    expect(
      deriveTokenDelta([
        event({ id: "e1", category: "codex_event" }),
        event({ id: "e2", category: "compression_result", metadata: { tokensRemoved: 1200 } })
      ])
    ).toBe(-1200);
  });

  it("does not summarize events from other sessions", () => {
    const summary = summarizeSession(session, [
      event({ id: "e1", category: "codex_event", title: "User prompt", body: "Test" }),
      event({
        id: "e2",
        sessionId: "session_2",
        category: "memory_injection",
        title: "Injected",
        metadata: { memoryIds: ["mem_1", "mem_2"], adapter: "codex_cli" }
      }),
      event({ id: "e3", sessionId: "session_2", category: "codex_event", title: "Run failed" })
    ]);

    expect(summary).toMatchObject({
      status: "done",
      adapter: "default",
      memoryIn: 0,
      newMemory: 0,
      tokenDelta: 0,
      eventCount: 1
    });
  });

  it("derives duration from chronological event order even when firehose events are newest first", () => {
    const summary = summarizeSession(session, [
      event({ id: "e2", category: "codex_event", createdAt: "2026-05-03T00:02:00.000Z" }),
      event({ id: "e1", category: "codex_event", createdAt: "2026-05-03T00:00:30.000Z" })
    ]);

    expect(summary.durationLabel).toBe("2m 00s");
  });

  it("ignores malformed token metadata", () => {
    expect(
      deriveTokenDelta([
        event({ id: "e1", category: "compression_result", metadata: { tokensRemoved: "many" } }),
        event({ id: "e2", category: "compression_result", metadata: { tokensRemoved: true } }),
        event({ id: "e3", category: "compression_result", metadata: { tokensRemoved: [300] } }),
        event({ id: "e4", category: "compression_result", metadata: { tokensRemoved: 300 } })
      ])
    ).toBe(-300);
  });

  it("counts active sessions from lifecycle summaries", () => {
    expect(
      buildDashboardMetrics({
        sessions: [session],
        events: [event({ id: "e1", category: "codex_event", title: "User prompt", metadata: { phase: "input" } })],
        memories: []
      }).activeSessions
    ).toBe(1);
  });
});
