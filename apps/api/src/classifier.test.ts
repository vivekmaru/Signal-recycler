import { describe, expect, it } from "vitest";
import { classifyTurn, parseClassifierResult } from "./classifier.js";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

async function classifyWithoutLLM(input: { prompt: string; finalResponse: string; items: unknown[] }) {
  // Force the heuristic path so tests don't hit the network.
  delete process.env.OPENAI_API_KEY;
  try {
    return await classifyTurn(input);
  } finally {
    if (ORIGINAL_KEY !== undefined) process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  }
}

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

  it("extracts a high-confidence rule from 'invoked by `npm` instead of `pnpm`'", async () => {
    const result = await classifyWithoutLLM({
      prompt: "Validate this project by running `npm test`.",
      finalResponse:
        "`npm test` fails with exit code `1`. The script exits intentionally because it was invoked by `npm` instead of `pnpm`.",
      items: []
    });
    expect(result.candidateRules.length).toBeGreaterThan(0);
    const rule = result.candidateRules[0];
    expect(rule?.rule.toLowerCase()).toContain("pnpm");
    expect(rule?.rule.toLowerCase()).toContain("npm");
    expect(rule?.confidence).toBe("high");
  });

  it("extracts a rule from 'Use `pnpm test` instead of `npm test`'", async () => {
    const result = await classifyWithoutLLM({
      prompt: "Run the test suite.",
      finalResponse:
        "The fixture rejected the run. It told me: Use `pnpm test` instead of `npm test`.",
      items: []
    });
    expect(result.candidateRules.length).toBeGreaterThan(0);
    expect(result.candidateRules[0]?.confidence).toBe("high");
  });

  it("does not duplicate when multiple patterns match the same correction", async () => {
    const result = await classifyWithoutLLM({
      prompt: "Test it.",
      finalResponse:
        "The script was invoked by `npm` instead of `pnpm`. Use `pnpm` instead of `npm` going forward.",
      items: []
    });
    // Both patterns above produce essentially the same rule — dedupe should keep one.
    const rules = result.candidateRules.map((r) => r.rule.toLowerCase());
    const uniqueRules = new Set(rules);
    expect(uniqueRules.size).toBe(rules.length);
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
