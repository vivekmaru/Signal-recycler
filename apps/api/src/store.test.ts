import { describe, expect, it } from "vitest";
import { createStore } from "./store.js";

describe("store", () => {
  it("approves a candidate rule and exports only approved rules", () => {
    const store = createStore(":memory:");
    const session = store.createSession({ projectId: "demo", title: "Demo session" });
    const candidate = store.createRuleCandidate({
      projectId: "demo",
      category: "tooling",
      rule: "Use pnpm for package operations.",
      reason: "The npm path failed in the first run.",
      sourceEventId: session.id
    });
    store.createRuleCandidate({
      projectId: "demo",
      category: "style",
      rule: "Keep UI copy terse.",
      reason: "Rejected candidate fixture.",
      sourceEventId: session.id
    });

    const approved = store.approveRule(candidate.id);
    const markdown = store.exportPlaybook("demo");

    expect(approved.status).toBe("approved");
    expect(markdown).toContain("Use pnpm for package operations.");
    expect(markdown).not.toContain("Keep UI copy terse.");
  });
});
