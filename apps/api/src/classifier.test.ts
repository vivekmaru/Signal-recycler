import { describe, expect, it } from "vitest";
import { parseClassifierResult } from "./classifier.js";

describe("parseClassifierResult", () => {
  it("accepts strict classifier JSON with candidate rules", () => {
    const parsed = parseClassifierResult({
      signal: ["User prefers pnpm."],
      noise: ["Repeated stack trace."],
      failure: ["npm install failed."],
      candidateRules: [
        {
          category: "tooling",
          rule: "Use pnpm instead of npm in this repo.",
          reason: "The user corrected a failed npm workflow."
        }
      ]
    });

    expect(parsed.candidateRules[0]?.rule).toBe("Use pnpm instead of npm in this repo.");
  });

  it("rejects malformed classifier JSON", () => {
    expect(() =>
      parseClassifierResult({
        signal: ["ok"],
        noise: [],
        failure: [],
        candidateRules: [
          {
            category: "tooling",
            rule: "",
            reason: "Missing useful rule text."
          }
        ]
      })
    ).toThrow();
  });
});
