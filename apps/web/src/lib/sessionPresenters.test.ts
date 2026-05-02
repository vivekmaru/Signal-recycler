import { describe, expect, it } from "vitest";
import type { SessionRecord, TimelineEvent } from "@signal-recycler/shared";
import { deriveTokenDelta, summarizeSession } from "./sessionPresenters";

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

describe("session presenters", () => {
  it("derives session status and memory counts from events", () => {
    const summary = summarizeSession(session, [
      event({ id: "e1", category: "codex_event", title: "User prompt", body: "Test" }),
      event({
        id: "e2",
        category: "memory_injection",
        metadata: { memoryIds: ["mem_1", "mem_2"], adapter: "codex_cli" }
      }),
      event({ id: "e3", category: "rule_candidate", title: "Rule candidate", body: "Use pnpm." })
    ]);

    expect(summary).toMatchObject({
      title: "Run validation",
      status: "needs_review",
      adapter: "codex_cli",
      memoryIn: 2,
      newMemory: 1,
      eventCount: 3
    });
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
});
