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
});
