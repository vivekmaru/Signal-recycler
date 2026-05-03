import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "@signal-recycler/shared";
import { groupCandidateEvents, groupTimelineEvents, summarizeMemoryRetrieval } from "./eventPresenters";

const baseEvent = {
  id: "event_1",
  sessionId: "session_1",
  createdAt: "2026-05-03T00:00:00.000Z",
  metadata: {}
} satisfies Omit<TimelineEvent, "category" | "title" | "body">;

describe("event presenters", () => {
  it("groups events by product concern", () => {
    const groups = groupTimelineEvents([
      { ...baseEvent, id: "e1", category: "codex_event", title: "Agent message", body: "ok" },
      { ...baseEvent, id: "e2", category: "memory_retrieval", title: "Retrieved", body: "selected" },
      { ...baseEvent, id: "e3", category: "memory_injection", title: "Injected", body: "memory" },
      { ...baseEvent, id: "e4", category: "compression_result", title: "Compressed", body: "logs" }
    ]);

    expect(groups.map((group) => [group.id, group.events.map((event) => event.id)])).toEqual([
      ["agent", ["e1"]],
      ["context", ["e2", "e4"]],
      ["memory", ["e3"]]
    ]);
  });

  it("summarizes memory retrieval metadata", () => {
    expect(
      summarizeMemoryRetrieval({
        approvedMemories: 3,
        selectedMemories: 1,
        skippedMemories: 2,
        limit: 5
      })
    ).toBe("Selected 1 · skipped 2 · approved 3");
  });

  it("deduplicates candidate events by durable rule id", () => {
    const groups = groupCandidateEvents([
      {
        ...baseEvent,
        id: "candidate_event",
        category: "rule_candidate",
        title: "Rule candidate created",
        body: "Use pnpm.",
        metadata: { ruleId: "rule_1" }
      },
      {
        ...baseEvent,
        id: "approved_event",
        category: "rule_auto_approved",
        title: "Rule auto-approved",
        body: "Use pnpm.",
        metadata: { ruleId: "rule_1" }
      },
      {
        ...baseEvent,
        id: "missing_rule_id",
        category: "rule_candidate",
        title: "Rule candidate created",
        body: "Use vitest.",
        metadata: {}
      }
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => [group.id, group.events.map((event) => event.id)])).toEqual([
      ["rule_1", ["candidate_event", "approved_event"]],
      ["missing_rule_id", ["missing_rule_id"]]
    ]);
  });
});
