import { describe, expect, it } from "vitest";
import { type MemoryRecord } from "@signal-recycler/shared";
import { createStore } from "../store.js";
import { retrieveRelevantMemories } from "./memoryRetrieval.js";

describe("memory retrieval", () => {
  it("returns relevant selected memories and skipped not-relevant decisions", () => {
    const store = createStore(":memory:");
    const selected = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "The repo uses pnpm workspaces.",
        memoryType: "command_convention",
        scope: { type: "package", value: "api" },
        source: { kind: "manual", author: "local-user" }
      }).id
    );
    const unrelated = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "theme",
        rule: "Use approved color tokens for UI theme changes.",
        reason: "Theme changes should follow design tokens."
      }).id
    );

    const result = retrieveRelevantMemories({
      store,
      projectId: "demo",
      query: "package manager run pnpm test",
      limit: 1
    });

    expect(result.memories).toEqual<MemoryRecord[]>([selected]);
    expect(result.selected).toEqual([
      {
        memoryId: selected.id,
        rank: 1,
        score: expect.any(Number),
        reason: 'Matched category "package-manager"',
        category: selected.category,
        memoryType: selected.memoryType,
        scope: selected.scope,
        source: selected.source
      }
    ]);
    expect(result.skipped).toContainEqual({
      memoryId: unrelated.id,
      reason: "not_relevant"
    });
    expect(result.metrics).toMatchObject({
      approvedMemories: 2,
      selectedMemories: 1,
      skippedMemories: 1,
      limit: 1
    });
    expect(result.selected).toHaveLength(result.metrics.selectedMemories);
    expect(result.selected.length).toBeLessThanOrEqual(result.metrics.limit);
  });

  it("selects no memories and skips approved memories when a prompt has no searchable terms", () => {
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "tooling",
        rule: "Use pnpm for package scripts.",
        reason: "Manual setup rule."
      }).id
    );

    const result = retrieveRelevantMemories({
      store,
      projectId: "demo",
      query: "a",
      limit: 5
    });

    expect(result.memories).toEqual([]);
    expect(result.selected).toEqual([]);
    expect(result.skipped).toEqual([
      {
        memoryId: memory.id,
        reason: "not_relevant"
      }
    ]);
    expect(result.metrics).toEqual({
      approvedMemories: 1,
      selectedMemories: 0,
      skippedMemories: 1,
      limit: 5
    });
  });

  it("prefers scope match reasons when category is not present in the query", () => {
    const store = createStore(":memory:");
    const selected = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "validation",
        rule: "Run pnpm test before committing API changes.",
        reason: "API package changes require validation.",
        scope: { type: "package", value: "api" }
      }).id
    );

    const result = retrieveRelevantMemories({
      store,
      projectId: "demo",
      query: "api pnpm test",
      limit: 5
    });

    expect(result.selected[0]).toMatchObject({
      memoryId: selected.id,
      reason: 'Matched package scope "api"'
    });
  });

  it("dedupes equivalent approved memories before selecting injectable records", () => {
    const store = createStore(":memory:");
    const selected = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "The repo uses pnpm workspaces."
      }).id
    );
    const duplicate = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "Duplicate imported compatibility rule."
      }).id
    );
    store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "theme",
        rule: "Use approved color tokens for UI theme changes.",
        reason: "Theme changes should follow design tokens."
      }).id
    );

    const result = retrieveRelevantMemories({
      store,
      projectId: "demo",
      query: "pnpm test package manager",
      limit: 5
    });

    expect(result.selected.map((decision) => decision.memoryId)).toEqual([selected.id]);
    expect(result.selected.map((decision) => decision.memoryId)).not.toContain(duplicate.id);
    expect(result.memories.map((memory) => memory.id)).toEqual([selected.id]);
    expect(result.metrics).toEqual({
      approvedMemories: 2,
      selectedMemories: 1,
      skippedMemories: 1,
      limit: 5
    });
    expect(result.skipped).toHaveLength(result.metrics.skippedMemories);
    expect(result.selected).toHaveLength(result.metrics.selectedMemories);
    expect(result.selected.length).toBeLessThanOrEqual(result.metrics.limit);
    expect(result.metrics.selectedMemories + result.metrics.skippedMemories).toBe(
      result.metrics.approvedMemories
    );
  });
});
