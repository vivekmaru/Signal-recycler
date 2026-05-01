import { describe, expect, it } from "vitest";
import { runMemoryAuditEval } from "./memoryAuditEval.js";

describe("memory audit eval", () => {
  it("proves exact memory provenance and usage audit coverage", async () => {
    const result = await runMemoryAuditEval();

    expect(result.status).toBe("pass");
    expect(result.cases.map((testCase) => [testCase.id, testCase.status])).toEqual([
      ["memory-audit.provenance", "pass"],
      ["memory-audit.usage", "pass"]
    ]);
    expect(result.metrics).toEqual([
      { name: "memory_provenance_coverage", value: 1, unit: "ratio" },
      { name: "approved_memory_count", value: 2, unit: "memories" },
      { name: "memory_usage_rows", value: 2, unit: "rows" },
      { name: "memory_usage_audit_coverage", value: 1, unit: "ratio" }
    ]);
  });
});
