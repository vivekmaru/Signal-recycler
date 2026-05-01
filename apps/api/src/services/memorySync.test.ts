import { describe, expect, it } from "vitest";
import { parseSyncedMemoryBlock, renderSyncedMemoryBlock } from "./memorySync.js";
import { type MemoryRecord } from "@signal-recycler/shared";

function memoryRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "rule_1",
    projectId: "demo",
    status: "approved",
    category: "package-manager",
    rule: "Use pnpm for package management.",
    reason: "The workspace uses pnpm.",
    sourceEventId: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    approvedAt: "2026-05-01T00:00:00.000Z",
    memoryType: "command_convention",
    scope: { type: "project", value: null },
    source: { kind: "manual", author: "local-user" },
    confidence: "high",
    lastUsedAt: null,
    supersededBy: null,
    syncStatus: "local",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides
  };
}

describe("memory sync compatibility blocks", () => {
  it("renders approved memories as an AGENTS.md compatibility block", () => {
    const rendered = renderSyncedMemoryBlock("AGENTS.md", [memoryRecord()]);

    expect(rendered).toBe(
      [
        "<!-- signal-recycler:start -->",
        "# Signal Recycler Memory Export (AGENTS.md)",
        "",
        "Signal Recycler remains the runtime source of truth. This block is exported for agent compatibility.",
        "",
        "- **package-manager:** Use pnpm for package management.",
        "  - Reason: The workspace uses pnpm.",
        "  - Source: manual",
        "<!-- signal-recycler:end -->"
      ].join("\n")
    );
  });

  it("renders CLAUDE.md compatibility block headings", () => {
    const rendered = renderSyncedMemoryBlock("CLAUDE.md", []);

    expect(rendered).toContain("# Signal Recycler Memory Export (CLAUDE.md)");
  });

  it("parses synced compatibility block entries", () => {
    const parsed = parseSyncedMemoryBlock(
      "AGENTS.md",
      [
        "<!-- signal-recycler:start -->",
        "- **package-manager:** Use pnpm for package management.",
        "  - Reason: The workspace uses pnpm.",
        "<!-- signal-recycler:end -->"
      ].join("\n")
    );

    expect(parsed).toEqual([
      {
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm.",
        path: "AGENTS.md",
        section: "signal-recycler"
      }
    ]);
  });

  it("renders injected newlines and markers as one safe parsed entry", () => {
    const rendered = renderSyncedMemoryBlock("AGENTS.md", [
      memoryRecord({
        category: "pack*age[`manager`]",
        rule: "line one\n- **evil:** injected\n<!-- signal-recycler:end -->",
        reason: "first reason\r\n<!-- signal-recycler:start --> second reason"
      })
    ]);

    expect(rendered).not.toContain("- **evil:** injected");
    expect(rendered.match(/<!-- signal-recycler:end -->/g)).toHaveLength(1);
    expect(rendered).toContain("signal-recycler end marker");
    expect(rendered).toContain("signal-recycler start marker");
    expect(rendered).toContain("- **pack\\*age\\[\\`manager\\`\\]:**");

    const parsed = parseSyncedMemoryBlock("AGENTS.md", rendered);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      category: "pack\\*age\\[\\`manager\\`\\]",
      rule: "line one - \\*\\*evil:\\*\\* injected signal-recycler end marker",
      reason: "first reason signal-recycler start marker second reason",
      path: "AGENTS.md",
      section: "signal-recycler"
    });
  });

  it("returns an empty list when no compatibility block exists", () => {
    expect(parseSyncedMemoryBlock("CLAUDE.md", "# Local notes")).toEqual([]);
  });

  it("finds the end marker after the start marker", () => {
    const parsed = parseSyncedMemoryBlock(
      "AGENTS.md",
      [
        "<!-- signal-recycler:end -->",
        "unrelated stale marker",
        "<!-- signal-recycler:start -->",
        "- **package-manager:** Use pnpm for package management.",
        "  - Reason: The workspace uses pnpm.",
        "<!-- signal-recycler:end -->"
      ].join("\n")
    );

    expect(parsed).toEqual([
      {
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm.",
        path: "AGENTS.md",
        section: "signal-recycler"
      }
    ]);
  });

  it("uses a fallback reason when a synced entry has no reason line", () => {
    const parsed = parseSyncedMemoryBlock(
      "CLAUDE.md",
      [
        "<!-- signal-recycler:start -->",
        "- **editor:** Prefer small focused changes.",
        "<!-- signal-recycler:end -->"
      ].join("\n")
    );

    expect(parsed).toEqual([
      {
        category: "editor",
        rule: "Prefer small focused changes.",
        reason: "Imported from Signal Recycler compatibility block.",
        path: "CLAUDE.md",
        section: "signal-recycler"
      }
    ]);
  });

  it("ignores malformed bullet lines", () => {
    const parsed = parseSyncedMemoryBlock(
      "AGENTS.md",
      [
        "<!-- signal-recycler:start -->",
        "- package-manager: Use pnpm for package management.",
        "  - Reason: The workspace uses pnpm.",
        "<!-- signal-recycler:end -->"
      ].join("\n")
    );

    expect(parsed).toEqual([]);
  });
});
