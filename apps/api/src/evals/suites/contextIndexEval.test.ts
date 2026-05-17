import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("context index eval must not call the network");
      })
    );

    const result = runContextIndexEval();
    const authCase = result.cases.find(
      (testCase) => testCase.id === "context-index.auth-middleware-source"
    );

    expect(authCase?.details).toMatchObject({
      goldPaths: ["apps/web/src/middleware.ts"],
      selectedPaths: expect.arrayContaining(["apps/web/src/middleware.ts"])
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deduplicates multiple selected chunks from the same path before scoring", () => {
    const workdir = mkdtempSync(join(tmpdir(), "signal-recycler-context-index-eval-dupe-"));
    const tempRoot = mkdtempSync(join(tmpdir(), "signal-recycler-context-index-eval-temp-root-"));
    const sourceDir = join(workdir, "apps/web/src");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, "middleware.ts"),
      Array.from({ length: 170 }, (_, index) =>
        index === 0 || index === 90
          ? `export const marker${index} = "authentication middleware unauthorized response";\n`
          : `export const filler${index} = "ordinary source line";\n`
      ).join(""),
      "utf8"
    );

    const result = runContextIndexEval({
      fixtureRoot: workdir,
      cases: [
        {
          id: "context-index.duplicate-path-scoring",
          title: "Duplicate path selections score once",
          query: "authentication middleware unauthorized response",
          goldPaths: ["apps/web/src/middleware.ts"],
          limit: 3,
          sourceTypes: ["source"]
        }
      ],
      tempRoot
    });

    expect(result.status).toBe("pass");
    expect(result.cases[0]).toMatchObject({
      id: "context-index.duplicate-path-scoring",
      status: "pass",
      summary: "recall@3=1, precision@3=1"
    });
    expect(result.cases[0]?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "context_index_recall_at_3", value: 1 }),
        expect.objectContaining({ name: "context_index_precision_at_3", value: 1 })
      ])
    );
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "context_index_recall_at_3", value: 1 }),
        expect.objectContaining({ name: "context_index_precision_at_3", value: 1 })
      ])
    );
    expect(result.cases[0]?.details).toMatchObject({
      selectedPaths: ["apps/web/src/middleware.ts"]
    });
    expect(readdirSync(tempRoot)).toHaveLength(0);
  });

  it("reports temp store setup failures as suite failures", () => {
    const missingTempRoot = join(
      mkdtempSync(join(tmpdir(), "signal-recycler-context-index-eval-missing-parent-")),
      "missing"
    );

    const result = runContextIndexEval({ tempRoot: missingTempRoot });

    expect(result.status).toBe("fail");
    expect(result.cases[0]).toMatchObject({
      id: "context-index.store",
      title: "Temporary context index store",
      status: "fail"
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "context_index_store_errors", value: 1, unit: "errors" })
      ])
    );
  });
});
