import { describe, expect, it } from "vitest";
import type { EvalReportSummary } from "@signal-recycler/shared";
import {
  buildEvalMetricRows,
  buildEvalSuiteRows,
  evalStatusTone,
  primaryEvalSuite
} from "./evalPresenters";

const report = {
  available: true,
  generatedAt: "2026-05-20T01:02:03.000Z",
  mode: "local",
  status: "pass",
  reportPath: "/repo/.signal-recycler/evals/latest.json",
  markdownPath: "/repo/.signal-recycler/evals/latest.md",
  metrics: [
    { name: "context_index_recall_at_5", value: 1, unit: "ratio" },
    { name: "context_index_precision_at_5", value: 0.75, unit: "ratio" }
  ],
  suites: [
    {
      id: "retrieval",
      title: "Memory Retrieval",
      status: "pass",
      metrics: [],
      cases: []
    },
    {
      id: "context-index",
      title: "Context Index Retrieval",
      status: "pass",
      metrics: [{ name: "context_index_tokens_selected", value: 98, unit: "tokens" }],
      cases: [
        {
          id: "context-index.auth-middleware-source",
          title: "Auth middleware source is retrieved",
          status: "pass",
          summary: "recall@5=1, precision@5=1"
        }
      ]
    }
  ]
} satisfies EvalReportSummary;

describe("eval presenters", () => {
  it("prioritizes the context-index suite while preserving real report metrics only", () => {
    expect(primaryEvalSuite(report)?.id).toBe("context-index");
    expect(buildEvalMetricRows(report)).toEqual([
      { label: "context index recall at 5", value: "1", unit: "ratio" },
      { label: "context index precision at 5", value: "0.75", unit: "ratio" }
    ]);
    expect(
      buildEvalMetricRows({
        ...report,
        metrics: [
          { name: "stale_memory_failures", value: 0, unit: "failures" },
          { name: "stale_memory_failures", value: 0, unit: "failures" }
        ]
      })
    ).toEqual([
      { label: "stale memory failures", value: "0", unit: "failures" },
      { label: "stale memory failures", value: "0", unit: "failures" }
    ]);
    expect(buildEvalSuiteRows(report)[0]).toMatchObject({
      id: "context-index",
      title: "Context Index Retrieval",
      status: "pass",
      cases: "1 case",
      metrics: "1 metric"
    });
  });

  it("maps eval statuses to existing badge tones", () => {
    expect(evalStatusTone("pass")).toBe("green");
    expect(evalStatusTone("warn")).toBe("amber");
    expect(evalStatusTone("skip")).toBe("neutral");
    expect(evalStatusTone("fail")).toBe("red");
  });
});
