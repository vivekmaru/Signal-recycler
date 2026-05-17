import { afterEach, describe, expect, it, vi } from "vitest";
import { runContextIndexEval } from "./contextIndexEval.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("context index eval", () => {
  it("measures source/doc retrieval recall, precision, and efficiency offline", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("context index eval must not call the network");
      })
    );

    const result = runContextIndexEval();

    expect(result.status).toBe("pass");
    expect(result.cases.map((testCase) => [testCase.id, testCase.status])).toEqual([
      ["context-index.auth-middleware-source", "pass"],
      ["context-index.project-docs", "pass"],
      ["context-index.package-scripts", "pass"],
      ["context-index.low-signal-query", "pass"]
    ]);
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "context_index_recall_at_5", value: 1, unit: "ratio" }),
        expect.objectContaining({ name: "context_index_precision_at_5", value: 1, unit: "ratio" }),
        expect.objectContaining({ name: "context_index_tokens_selected", unit: "tokens" }),
        expect.objectContaining({ name: "context_index_token_efficiency_ratio", unit: "ratio" })
      ])
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports gold and selected chunk paths for reviewable failures", () => {
    const result = runContextIndexEval();
    const authCase = result.cases.find(
      (testCase) => testCase.id === "context-index.auth-middleware-source"
    );

    expect(authCase?.details).toMatchObject({
      goldPaths: ["apps/web/src/middleware.ts"],
      selectedPaths: expect.arrayContaining(["apps/web/src/middleware.ts"])
    });
  });
});
