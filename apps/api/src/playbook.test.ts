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

  it("prepends approved rules to the first text item in a structured input array", () => {
    const input = [
      { type: "text", text: "Diagnose this failing test." },
      { type: "local_image", path: "./screen.png" }
    ];

    const result = injectPlaybookRules(input, [
      { id: "rule_1", rule: "Never use library-x in this repo.", category: "dependency" }
    ]);

    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Never use library-x in this repo.")
    });
    expect(result[1]).toEqual(input[1]);
  });
});
