import { describe, expect, it } from "vitest";
import { aggregateStatus, buildReport, renderMarkdownReport } from "./report.js";

describe("eval report", () => {
  it("promotes fail above warn, skip, and pass", () => {
    expect(aggregateStatus(["pass", "skip", "warn", "fail"])).toBe("fail");
  });

  it("renders markdown with suite and case status", () => {
    const report = buildReport({
      generatedAt: "2026-05-01T00:00:00.000Z",
      mode: "local",
      suites: [
        {
          id: "example",
          title: "Example Suite",
          status: "pass",
          metrics: [{ name: "task_success_delta", value: 1, unit: "count" }],
          cases: [
            {
              id: "example.case",
              title: "Example Case",
              status: "pass",
              summary: "Measured with memory."
            }
          ]
        }
      ]
    });

    expect(report.status).toBe("pass");
    expect(renderMarkdownReport(report)).toContain("| Example Case | pass | Measured with memory. |");
  });
});
