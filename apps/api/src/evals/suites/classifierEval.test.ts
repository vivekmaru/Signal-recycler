import { describe, expect, it } from "vitest";
import { scoreRuleExtraction } from "./classifierEval.js";

describe("classifier eval scoring", () => {
  it("counts a wrong emitted rule as both false positive and false negative", () => {
    expect(
      scoreRuleExtraction({
        expectRule: true,
        expectedRuleNeedles: ["pnpm", "npm"],
        emittedRules: ["prettier is not available in this environment"]
      })
    ).toEqual({
      truePositive: 0,
      falsePositive: 1,
      falseNegative: 1,
      status: "fail"
    });
  });

  it("counts a presence-only expected rule with no emissions as a false negative", () => {
    expect(
      scoreRuleExtraction({
        expectRule: true,
        expectedRuleNeedles: [],
        emittedRules: []
      })
    ).toEqual({
      truePositive: 0,
      falsePositive: 0,
      falseNegative: 1,
      status: "fail"
    });
  });

  it("penalizes extra emitted rules when the expected rule is present", () => {
    expect(
      scoreRuleExtraction({
        expectRule: true,
        expectedRuleNeedles: ["pnpm", "npm"],
        emittedRules: [
          "use pnpm instead of npm for package scripts",
          "prettier is not available in this environment"
        ]
      })
    ).toEqual({
      truePositive: 1,
      falsePositive: 1,
      falseNegative: 0,
      status: "fail"
    });
  });
});
