import { describe, expect, it } from "vitest";
import { injectPlaybookRules } from "./playbook.js";

describe("injectPlaybookRules", () => {
  it("prepends approved rules to a string input without duplicating an existing block", () => {
    const prompt = "Implement the next feature.";
    const rules = [
      { id: "rule_1", rule: "Use pnpm instead of npm.", category: "tooling" },
      { id: "rule_2", rule: "Run tests with pnpm test.", category: "testing" }
    ];

    const first = injectPlaybookRules(prompt, rules);
    const second = injectPlaybookRules(first, rules);

    expect(first).toContain("Signal Recycler Playbook");
    expect(first.indexOf("Use pnpm instead of npm.")).toBeLessThan(first.indexOf(prompt));
    expect(second.match(/Signal Recycler Playbook/g)).toHaveLength(1);
  });

  it("prepends a system message to a Responses API input array without duplicating on re-injection", () => {
    const input = [
      { type: "message", role: "user", content: "Diagnose this failing test." },
      { type: "local_image", path: "./screen.png" }
    ];
    const rules = [{ id: "rule_1", rule: "Never use library-x in this repo.", category: "dependency" }];

    const first = injectPlaybookRules(input, rules);
    const second = injectPlaybookRules(first, rules);

    expect(Array.isArray(first)).toBe(true);
    // System message is prepended
    expect(first[0]).toMatchObject({
      type: "message",
      role: "system",
      content: expect.stringContaining("Never use library-x in this repo.")
    });
    // Original items follow
    expect(first[1]).toEqual(input[0]);
    expect(first[2]).toEqual(input[1]);
    // Re-injection deduplicates the system message
    expect(second.filter((item: unknown) => {
      const msg = item as Record<string, unknown>;
      return msg["role"] === "system";
    })).toHaveLength(1);
  });
});
