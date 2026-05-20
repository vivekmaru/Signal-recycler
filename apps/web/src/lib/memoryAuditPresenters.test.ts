import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@signal-recycler/shared";
import { memoryAuditPanelState } from "./memoryAuditPresenters";

function memory(id: string): MemoryRecord {
  return {
    id,
    projectId: "demo",
    status: "approved",
    category: "tooling",
    rule: "Use pnpm.",
    reason: "Project convention.",
    sourceEventId: null,
    createdAt: "2026-05-03T00:00:00.000Z",
    approvedAt: "2026-05-03T00:00:00.000Z",
    memoryType: "rule",
    scope: { type: "project", value: null },
    source: { kind: "manual", author: "local-user" },
    confidence: "high",
    lastUsedAt: null,
    supersededBy: null,
    syncStatus: "local",
    updatedAt: "2026-05-03T00:00:00.000Z"
  };
}

describe("memory audit presenters", () => {
  it("does not request a usage count without a selected memory", () => {
    expect(memoryAuditPanelState({ selected: null, audit: null, loading: false, error: null })).toEqual({
      status: "empty",
      usageCount: 0
    });
  });

  it("keeps stale audit data in loading state after memory selection changes", () => {
    expect(
      memoryAuditPanelState({
        selected: memory("current"),
        audit: { memory: memory("previous"), usages: [] },
        loading: false,
        error: null
      })
    ).toEqual({ status: "loading", usageCount: 0 });
  });

  it("summarizes loaded usage count for the selected memory", () => {
    expect(
      memoryAuditPanelState({
        selected: memory("rule_1"),
        audit: {
          memory: memory("rule_1"),
          usages: [
            {
              id: "usage_1",
              memoryId: "rule_1",
              projectId: "demo",
              sessionId: "session_1",
              eventId: "event_1",
              adapter: "mock",
              reason: "approved_project_memory",
              injectedAt: "2026-05-03T00:00:00.000Z"
            }
          ]
        },
        loading: false,
        error: null
      })
    ).toEqual({ status: "ready", usageCount: 1 });
  });
});
