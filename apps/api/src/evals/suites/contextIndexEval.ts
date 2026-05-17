import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ContextSourceType } from "@signal-recycler/shared";
import {
  createContextIndexStore,
  type ContextIndexStore
} from "../../services/contextIndexStore.js";
import { retrieveContextChunks } from "../../services/contextIndexRetrieval.js";
import { scanContextIndex } from "../../services/contextIndexScanner.js";
import { metric, suiteResult } from "../report.js";
import { type EvalCaseResult, type EvalSuiteResult } from "../types.js";

type ContextEvalCase = {
  id: string;
  title: string;
  query: string;
  goldPaths: string[];
  limit: number;
  sourceTypes?: ContextSourceType[];
};

type RunContextIndexEvalInput = {
  fixtureRoot?: string;
  cases?: ContextEvalCase[];
  tempRoot?: string;
  storeFactory?: (path: string) => ContextIndexStore;
  tempDirRemover?: (path: string) => void;
};

const defaultFixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../fixtures/context-index-repo"
);
const projectId = "context-index-eval";
const evalCases: ContextEvalCase[] = [
  {
    id: "context-index.auth-middleware-source",
    title: "Auth middleware source is retrieved",
    query: "authentication middleware unauthorized response",
    goldPaths: ["apps/web/src/middleware.ts"],
    limit: 5,
    sourceTypes: ["source"]
  },
  {
    id: "context-index.project-docs",
    title: "Project docs are retrieved",
    query: "context index fixture pnpm workspaces auth middleware",
    goldPaths: ["README.md"],
    limit: 5,
    sourceTypes: ["docs"]
  },
  {
    id: "context-index.package-scripts",
    title: "Package scripts are retrieved",
    query: "package scripts test type-check",
    goldPaths: ["package.json"],
    limit: 5,
    sourceTypes: ["package"]
  },
  {
    id: "context-index.low-signal-query",
    title: "Low-signal query does not retrieve context",
    query: "the and of to",
    goldPaths: [],
    limit: 5
  }
];

export function runContextIndexEval(input: RunContextIndexEvalInput = {}): EvalSuiteResult {
  const fixtureRoot = input.fixtureRoot ?? defaultFixtureRoot;
  const activeCases = input.cases ?? evalCases;
  const removeTempDir = input.tempDirRemover ?? removeTempDirectory;
  let tempDir: string | undefined;
  let store: ContextIndexStore;

  try {
    tempDir = mkdtempSync(
      join(input.tempRoot ?? tmpdir(), "signal-recycler-context-index-eval-")
    );
    store = (input.storeFactory ?? createContextIndexStore)(join(tempDir, "index.sqlite"));
  } catch (error) {
    const cleanupError = cleanupTempDir(tempDir, removeTempDir);
    return suiteResult({
      id: "context-index",
      title: "Context Index Retrieval",
      cases: [
        {
          id: "context-index.store",
          title: "Temporary context index store",
          status: "fail",
          summary: `store_error=${errorSummary(error)}`,
          details: {
            error: errorDetails(error),
            ...(cleanupError ? { cleanupError: errorDetails(cleanupError) } : {})
          }
        }
      ],
      metrics: [
        metric("context_index_store_errors", 1, "errors"),
        ...(cleanupError ? [metric("context_index_cleanup_errors", 1, "errors")] : [])
      ]
    });
  }

  let result: EvalSuiteResult;
  try {
    const scanned = scanContextIndex({
      projectId,
      workdir: fixtureRoot,
      indexedAt: "2026-05-14T00:00:00.000Z"
    });
    if (scanned.errors.length > 0) {
      result = suiteResult({
        id: "context-index",
        title: "Context Index Retrieval",
        cases: [
          {
            id: "context-index.scan",
            title: "Fixture context index scan",
            status: "fail",
            summary: `scan_errors=${scanned.errors.length}`,
            details: { errors: scanned.errors }
          }
        ],
        metrics: [metric("context_index_scan_errors", scanned.errors.length, "errors")]
      });
    } else {
      store.replaceProjectIndex({
        projectId,
        workdir: fixtureRoot,
        chunks: scanned.chunks.map(({ projectId: _projectId, ...chunk }) => chunk)
      });

      const totalIndexedTokens = scanned.chunks.reduce(
        (sum, chunk) => sum + estimateTokens(chunk.text),
        0
      );
      const cases = activeCases.map((testCase) => scoreCase(testCase, store));
      const limitMetrics = Array.from(new Set(activeCases.map((testCase) => testCase.limit)))
        .sort((left, right) => left - right)
        .flatMap((limit) => [
          metric(recallMetricName(limit), averageMetric(cases, recallMetricName(limit)), "ratio"),
          metric(
            precisionMetricName(limit),
            averageMetric(cases, precisionMetricName(limit)),
            "ratio"
          )
        ]);
      const selectedTokens = sumMetric(cases, "context_index_selected_tokens");
      const tokenEfficiency =
        totalIndexedTokens === 0 ? 0 : Number((selectedTokens / totalIndexedTokens).toFixed(3));

      result = suiteResult({
        id: "context-index",
        title: "Context Index Retrieval",
        cases,
        metrics: [
          ...limitMetrics,
          metric("context_index_tokens_selected", selectedTokens, "tokens"),
          metric("context_index_token_efficiency_ratio", tokenEfficiency, "ratio")
        ]
      });
    }
  } catch (error) {
    result = suiteResult({
      id: "context-index",
      title: "Context Index Retrieval",
      cases: [
        {
          id: "context-index.eval",
          title: "Context Index eval execution",
          status: "fail",
          summary: `eval_error=${errorSummary(error)}`,
          details: { error: errorDetails(error) }
        }
      ],
      metrics: [metric("context_index_eval_errors", 1, "errors")]
    });
  }

  let closeError: unknown;
  try {
    store.close();
  } catch (error) {
    closeError = error;
  }
  const cleanupError = cleanupTempDir(tempDir, removeTempDir);

  if ((closeError || cleanupError) && result.status === "pass") {
    return suiteResult({
      id: "context-index",
      title: "Context Index Retrieval",
      cases: [
        ...(closeError
          ? [
              {
                id: "context-index.close",
                title: "Temporary context index store close",
                status: "fail" as const,
                summary: `close_error=${errorSummary(closeError)}`,
                details: { error: errorDetails(closeError) }
              }
            ]
          : []),
        ...(cleanupError
          ? [
              {
                id: "context-index.cleanup",
                title: "Temporary context index cleanup",
                status: "fail" as const,
                summary: `cleanup_error=${errorSummary(cleanupError)}`,
                details: { error: errorDetails(cleanupError) }
              }
            ]
          : [])
      ],
      metrics: [
        ...(closeError ? [metric("context_index_close_errors", 1, "errors")] : []),
        ...(cleanupError ? [metric("context_index_cleanup_errors", 1, "errors")] : [])
      ]
    });
  }

  return result;
}

function cleanupTempDir(
  tempDir: string | undefined,
  removeTempDir: (path: string) => void
): unknown {
  if (!tempDir) return undefined;
  try {
    removeTempDir(tempDir);
    return undefined;
  } catch (error) {
    return error;
  }
}

function removeTempDirectory(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

function scoreCase(testCase: ContextEvalCase, store: ContextIndexStore): EvalCaseResult {
  const retrieval = retrieveContextChunks({
    store,
    projectId,
    query: testCase.query,
    limit: testCase.limit,
    ...(testCase.sourceTypes ? { sourceTypes: testCase.sourceTypes } : {})
  });
  const selectedPaths = Array.from(new Set(retrieval.selected.map((decision) => decision.path)));
  const gold = new Set(testCase.goldPaths);
  const truePositiveCount = selectedPaths.filter((path) => gold.has(path)).length;
  const recall =
    testCase.goldPaths.length === 0
      ? selectedPaths.length === 0
        ? 1
        : 0
      : truePositiveCount / gold.size;
  const precision =
    selectedPaths.length === 0
      ? testCase.goldPaths.length === 0
        ? 1
        : 0
      : truePositiveCount / selectedPaths.length;
  const selectedTokens = retrieval.selected.reduce((sum, decision) => {
    const chunk = store.getChunk(projectId, decision.chunkId);
    return sum + estimateTokens(chunk?.text ?? "");
  }, 0);
  const passed = recall === 1 && precision === 1;

  return {
    id: testCase.id,
    title: testCase.title,
    status: passed ? "pass" : "fail",
    summary: `recall@${testCase.limit}=${round(recall)}, precision@${testCase.limit}=${round(precision)}`,
    metrics: [
      metric(recallMetricName(testCase.limit), round(recall), "ratio"),
      metric(precisionMetricName(testCase.limit), round(precision), "ratio"),
      metric("context_index_selected_tokens", selectedTokens, "tokens")
    ],
    details: {
      query: testCase.query,
      goldPaths: testCase.goldPaths,
      selectedPaths,
      selected: retrieval.selected
    }
  };
}

function recallMetricName(limit: number): string {
  return `context_index_recall_at_${limit}`;
}

function precisionMetricName(limit: number): string {
  return `context_index_precision_at_${limit}`;
}

function errorSummary(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }
  return { message: String(error) };
}

function averageMetric(cases: EvalCaseResult[], name: string): number {
  const values = cases
    .flatMap((testCase) => testCase.metrics ?? [])
    .filter((item) => item.name === name);
  if (values.length === 0) return 0;
  return round(values.reduce((sum, item) => sum + item.value, 0) / values.length);
}

function sumMetric(cases: EvalCaseResult[], name: string): number {
  return cases
    .flatMap((testCase) => testCase.metrics ?? [])
    .filter((item) => item.name === name)
    .reduce((sum, item) => sum + item.value, 0);
}

function estimateTokens(text: string): number {
  return Math.max(0, Math.round(text.length / 4));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
