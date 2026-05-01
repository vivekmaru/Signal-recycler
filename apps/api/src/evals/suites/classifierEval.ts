import { classifyTurn } from "../../classifier.js";
import { metric, suiteResult } from "../report.js";
import { type EvalCaseResult, type EvalSuiteResult } from "../types.js";

type ClassifierCase = {
  id: string;
  title: string;
  prompt: string;
  finalResponse: string;
  expectedRuleNeedles: string[];
  expectRule: boolean;
};

export async function runClassifierEval(): Promise<EvalSuiteResult> {
  const cases: ClassifierCase[] = [
    {
      id: "package-manager-correction",
      title: "Extracts package manager correction",
      prompt: "Validate fixtures/demo-repo by running npm test.",
      finalResponse: "The script says: Use `pnpm test` instead of `npm test`.",
      expectedRuleNeedles: ["pnpm", "npm"],
      expectRule: true
    },
    {
      id: "intentional-error-prose",
      title: "Does not learn from intentional error prose",
      prompt: "Review this test.",
      finalResponse: "The test intentionally throws 401 to verify error handling.",
      expectedRuleNeedles: [],
      expectRule: false
    },
    {
      id: "missing-tool",
      title: "Extracts missing tool environment rule",
      prompt: "Run the format command.",
      finalResponse: "prettier is not found in this environment.",
      expectedRuleNeedles: ["prettier", "not available"],
      expectRule: true
    }
  ];

  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;

    const results: EvalCaseResult[] = [];
    for (const testCase of cases) {
      const classification = await classifyTurn({
        prompt: testCase.prompt,
        finalResponse: testCase.finalResponse,
        items: []
      });
      const rules = classification.candidateRules.map((rule) => rule.rule.toLowerCase());
      const hasExpectedRule =
        testCase.expectedRuleNeedles.length === 0 ||
        rules.some((rule) =>
          testCase.expectedRuleNeedles.every((needle) => rule.includes(needle.toLowerCase()))
        );
      const emittedRule = classification.candidateRules.length > 0;
      if (testCase.expectRule && emittedRule && hasExpectedRule) truePositive += 1;
      if (!testCase.expectRule && emittedRule) falsePositive += 1;
      if (testCase.expectRule && (!emittedRule || !hasExpectedRule)) falseNegative += 1;
      const status =
        testCase.expectRule === emittedRule && (!testCase.expectRule || hasExpectedRule)
          ? "pass"
          : "fail";

      results.push({
        id: `classifier.${testCase.id}`,
        title: testCase.title,
        status,
        summary:
          status === "pass"
            ? `rules=${classification.candidateRules.length}`
            : `expectedRule=${testCase.expectRule}, emitted=${classification.candidateRules.length}`,
        metrics: [metric("candidate_rules", classification.candidateRules.length, "rules")],
        details: { classification }
      });
    }

    const precision =
      truePositive + falsePositive === 0 ? 1 : truePositive / (truePositive + falsePositive);
    const recall =
      truePositive + falseNegative === 0 ? 1 : truePositive / (truePositive + falseNegative);

    return suiteResult({
      id: "classifier",
      title: "Rule Extraction",
      cases: results,
      metrics: [
        metric("candidate_rule_precision", Number(precision.toFixed(3)), "ratio"),
        metric("candidate_rule_recall", Number(recall.toFixed(3)), "ratio"),
        metric("false_positive_rule_candidates", falsePositive, "rules")
      ]
    });
  } finally {
    if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
  }
}
