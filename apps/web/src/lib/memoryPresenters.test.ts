import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@signal-recycler/shared";
import { countMemoriesByStatus, memorySourceLabel, memoryStatusLabel, memoryTypeLabel } from "./memoryPresenters";

function memory(id: string, status: MemoryRecord["status"], source: MemoryRecord["source"]): MemoryRecord {
  return {
    id,
    projectId: "demo",
    status,
    category: "tooling",
    rule: "Use pnpm.",
    reason: "Manual rule.",
    sourceEventId: null,
    createdAt: "2026-05-03T00:00:00.000Z",
    approvedAt: status === "approved" ? "2026-05-03T00:00:00.000Z" : null,
    memoryType: "rule",
    scope: { type: "project", value: null },
    source,
    confidence: "high",
    lastUsedAt: null,
    supersededBy: null,
    syncStatus: "local",
    updatedAt: "2026-05-03T00:00:00.000Z"
  };
}

describe("memory presenters", () => {
  it("counts memory status buckets", () => {
    expect(
      countMemoriesByStatus([
        memory("a", "approved", { kind: "manual", author: "local-user" }),
        memory("b", "pending", { kind: "manual", author: "local-user" }),
        memory("c", "rejected", { kind: "manual", author: "local-user" })
      ])
    ).toEqual({ all: 3, approved: 1, pending: 1, rejected: 1, superseded: 0 });
  });

  it("formats memory provenance source labels", () => {
    expect(memorySourceLabel({ kind: "manual", author: "local-user" })).toBe("manual");
    expect(memorySourceLabel({ kind: "import", label: "api" })).toBe("api import");
    expect(memorySourceLabel({ kind: "synced_file", path: "AGENTS.md", section: null })).toBe("AGENTS.md");
  });

  it("formats memory status labels with superseded records as their own review bucket", () => {
    expect(memoryStatusLabel(memory("approved", "approved", { kind: "manual", author: "local-user" }))).toBe(
      "approved"
    );
    expect(
      memoryStatusLabel({
        ...memory("old", "approved", { kind: "manual", author: "local-user" }),
        supersededBy: "new"
      })
    ).toBe("superseded");
  });

  it("formats memory type labels for review surfaces", () => {
    expect(
      memoryTypeLabel({
        ...memory("command", "approved", { kind: "manual", author: "local-user" }),
        memoryType: "command_convention"
      })
    ).toBe("command convention");
    expect(
      memoryTypeLabel({
        ...memory("source", "approved", { kind: "manual", author: "local-user" }),
        memoryType: "source_derived"
      })
    ).toBe("source derived");
  });
});
