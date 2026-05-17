import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createContextIndexStore,
  type ContextIndexStore
} from "../../services/contextIndexStore.js";
import { runContextIndexEval } from "./contextIndexEval.js";

afterEach(() => {
  vi.unstubAllGlobals();
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

const tempRoots: string[] = [];

function makeTempRoot(prefix: string): string {
  const tempRoot = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(tempRoot);
  return tempRoot;
}

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
    const workdir = makeTempRoot("signal-recycler-context-index-eval-dupe-");
    const tempRoot = makeTempRoot("signal-recycler-context-index-eval-temp-root-");
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
          limit: 3.7,
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

  it("labels metrics with the default effective limit for non-positive limits", () => {
    const result = runContextIndexEval({
      cases: [
        {
          id: "context-index.default-effective-limit",
          title: "Default effective limit is reported",
          query: "package scripts test type-check",
          goldPaths: ["package.json"],
          limit: 0,
          sourceTypes: ["package"]
        }
      ]
    });

    expect(result.status).toBe("pass");
    expect(result.cases[0]).toMatchObject({
      id: "context-index.default-effective-limit",
      summary: "recall@8=1, precision@8=1"
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "context_index_recall_at_8", value: 1 }),
        expect.objectContaining({ name: "context_index_precision_at_8", value: 1 })
      ])
    );
    expect(result.metrics).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "context_index_recall_at_0" })])
    );
  });

  it("reports temp store setup failures as suite failures", () => {
    const tempRootParent = makeTempRoot("signal-recycler-context-index-eval-missing-parent-");
    const missingTempRoot = join(tempRootParent, "missing");

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

  it("keeps setup cleanup failures contained in the suite result", () => {
    const tempRoot = makeTempRoot("signal-recycler-context-index-eval-setup-root-");

    const result = runContextIndexEval({
      tempRoot,
      storeFactory() {
        throw new Error("simulated store setup failure");
      },
      tempDirRemover() {
        throw new Error("simulated cleanup failure");
      }
    });

    expect(result.status).toBe("fail");
    expect(result.cases[0]).toMatchObject({
      id: "context-index.store",
      status: "fail",
      summary: "store_error=simulated store setup failure",
      details: {
        cleanupError: {
          message: "simulated cleanup failure"
        }
      }
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "context_index_store_errors", value: 1, unit: "errors" }),
        expect.objectContaining({ name: "context_index_cleanup_errors", value: 1, unit: "errors" })
      ])
    );
  });

  it("reports index write failures as suite failures", () => {
    const tempRoot = makeTempRoot("signal-recycler-context-index-eval-write-root-");
    let closed = false;

    const result = runContextIndexEval({
      tempRoot,
      storeFactory: () =>
        ({
          replaceProjectIndex() {
            throw new Error("simulated write failure");
          },
          close() {
            closed = true;
            throw new Error("simulated close failure");
          }
        }) as unknown as ContextIndexStore
    });

    expect(result.status).toBe("fail");
    expect(result.cases[0]).toMatchObject({
      id: "context-index.eval",
      title: "Context Index eval execution",
      status: "fail",
      summary: "eval_error=simulated write failure"
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "context_index_eval_errors", value: 1, unit: "errors" })
      ])
    );
    expect(closed).toBe(true);
    expect(readdirSync(tempRoot)).toHaveLength(0);
  });

  it("reports close failures as suite failures after successful eval execution", () => {
    const tempRoot = makeTempRoot("signal-recycler-context-index-eval-close-root-");

    const result = runContextIndexEval({
      tempRoot,
      storeFactory(path) {
        const store = createContextIndexStore(path);
        return {
          ...store,
          close() {
            store.close();
            throw new Error("simulated close failure");
          }
        };
      }
    });

    expect(result.status).toBe("fail");
    expect(result.cases[0]).toMatchObject({
      id: "context-index.close",
      title: "Temporary context index store close",
      status: "fail",
      summary: "close_error=simulated close failure"
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "context_index_close_errors", value: 1, unit: "errors" })
      ])
    );
    expect(readdirSync(tempRoot)).toHaveLength(0);
  });

  it("reports cleanup failures as suite failures after successful eval execution", () => {
    const tempRoot = makeTempRoot("signal-recycler-context-index-eval-cleanup-root-");

    const result = runContextIndexEval({
      tempRoot,
      tempDirRemover() {
        throw new Error("simulated cleanup failure");
      }
    });

    expect(result.status).toBe("fail");
    expect(result.cases[0]).toMatchObject({
      id: "context-index.cleanup",
      title: "Temporary context index cleanup",
      status: "fail",
      summary: "cleanup_error=simulated cleanup failure"
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "context_index_cleanup_errors", value: 1, unit: "errors" })
      ])
    );
  });
});
