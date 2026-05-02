import { describe, expect, it } from "vitest";
import { createStore } from "../store.js";
import { buildContextEnvelope } from "./contextEnvelope.js";

describe("context envelope", () => {
  it("retrieves selected memory, injects it into the prompt, emits audit events, and records usage", () => {
    const store = createStore(":memory:");
    const selected = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm for package scripts.",
        reason: "The workspace uses pnpm."
      }).id
    );
    const skipped = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "theme",
        rule: "Use approved theme tokens for UI changes.",
        reason: "Theme work follows the design system."
      }).id
    );

    const result = buildContextEnvelope({
      store,
      projectId: "demo",
      sessionId: "session-context",
      adapter: "mock",
      prompt: "Please run package manager validation with pnpm."
    });
    const events = store.listEvents("session-context");

    expect(result.prompt).toContain("Use pnpm for package scripts.");
    expect(result.prompt).not.toContain("Use approved theme tokens for UI changes.");
    expect(result.memoryIds).toEqual([selected.id]);
    expect(result.retrieval).toMatchObject({
      query: "Please run package manager validation with pnpm.",
      selected: [expect.objectContaining({ memoryId: selected.id })],
      skipped: [expect.objectContaining({ memoryId: skipped.id })],
      metrics: {
        approvedMemories: 2,
        selectedMemories: 1,
        skippedMemories: 1,
        limit: 5
      }
    });
    expect(events.map((event) => event.category)).toEqual([
      "memory_retrieval",
      "memory_injection"
    ]);
    expect(events.find((event) => event.category === "memory_retrieval")).toMatchObject({
      title: "Retrieved 1 of 2 approved memories",
      body: "Selected 1 approved memory; skipped 1.",
      metadata: {
        projectId: "demo",
        query: "Please run package manager validation with pnpm.",
        selected: [expect.objectContaining({ memoryId: selected.id })],
        skipped: [expect.objectContaining({ memoryId: skipped.id })],
        metrics: expect.objectContaining({ selectedMemories: 1 })
      }
    });
    expect(events.find((event) => event.category === "memory_injection")?.metadata).toMatchObject({
      projectId: "demo",
      adapter: "mock",
      reason: "approved_project_memory",
      memoryIds: [selected.id],
      retrieval: expect.objectContaining({
        query: "Please run package manager validation with pnpm.",
        metrics: expect.objectContaining({ selectedMemories: 1 })
      })
    });
    expect(store.listMemoryUsages(selected.id)).toHaveLength(1);
    expect(store.listMemoryUsages(skipped.id)).toHaveLength(0);
  });

  it("skips irrelevant approved memory, keeps the prompt unchanged, and emits only retrieval audit", () => {
    const store = createStore(":memory:");
    const skipped = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "theme",
        rule: "Use approved theme tokens for UI changes.",
        reason: "Theme work follows the design system."
      }).id
    );
    const prompt = "Run package manager validation for this repo.";

    const result = buildContextEnvelope({
      store,
      projectId: "demo",
      sessionId: "session-no-context",
      adapter: "mock",
      prompt
    });
    const events = store.listEvents("session-no-context");

    expect(result.prompt).toBe(prompt);
    expect(result.memoryIds).toEqual([]);
    expect(result.retrieval).toMatchObject({
      query: prompt,
      selected: [],
      skipped: [expect.objectContaining({ memoryId: skipped.id })],
      metrics: {
        approvedMemories: 1,
        selectedMemories: 0,
        skippedMemories: 1,
        limit: 5
      }
    });
    expect(events.map((event) => event.category)).toEqual(["memory_retrieval"]);
    expect(events[0]).toMatchObject({
      title: "Retrieved 0 of 1 approved memories",
      body: "Selected 0 approved memories; skipped 1.",
      metadata: {
        projectId: "demo",
        query: prompt,
        selected: [],
        skipped: [expect.objectContaining({ memoryId: skipped.id })],
        metrics: expect.objectContaining({ selectedMemories: 0 })
      }
    });
    expect(store.listMemoryUsages(skipped.id)).toHaveLength(0);
  });
});
