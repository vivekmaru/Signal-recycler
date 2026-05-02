import { describe, expect, it } from "vitest";
import { runRetrievalEval } from "./retrievalEval.js";

describe("retrieval eval", () => {
  it("proves retrieval relevance and stale-memory rejection", () => {
    const result = runRetrievalEval();

    expect(result.status).toBe("pass");
    expect(result.cases.map((testCase) => [testCase.id, testCase.status])).toEqual([
      ["retrieval.relevant-memory", "pass"],
      ["retrieval.token-reduction", "pass"],
      ["retrieval.superseded-memory", "pass"],
      ["retrieval.project-isolation", "pass"],
      ["retrieval.no-query-no-inject-all", "pass"]
    ]);
  });

  it("requires token reduction to keep the useful memory and skip unrelated memory", () => {
    const result = runRetrievalEval();
    const tokenReduction = result.cases.find(
      (testCase) => testCase.id === "retrieval.token-reduction"
    );

    expect(tokenReduction?.status).toBe("pass");
    expect(tokenReduction?.details).toMatchObject({
      relevantMemorySelected: true,
      unrelatedMemorySkipped: true,
      selectedMemoryIds: expect.arrayContaining([expect.any(String)]),
      skippedMemoryIds: expect.arrayContaining([expect.any(String)])
    });
  });
});
