# Context Index Eval Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Use `bd` for durable task tracking; the task sections below are execution guidance, not markdown TODO state.

**Goal:** Add a deterministic Phase 5 eval suite that measures Context Index retrieval recall, precision, and context/token efficiency over `fixtures/context-index-repo`.

**Architecture:** The suite scans the existing fixture repo into an in-memory Context Index store, runs fixed prompt/gold-chunk cases through `retrieveContextChunks`, and emits eval cases plus aggregate metrics. It stays local/offline and plugs into the existing eval runner/report structure.

**Tech Stack:** TypeScript, Vitest, SQLite FTS5 Context Index store, existing `EvalSuiteResult` and report helpers.

---

## Scope Anchor

Phase 5 success criteria require docs/source chunks to be retrievable with measurable `recall@k` and `precision@k`. This slice adds measurement only. It does not inject source chunks into session context envelopes, add compression, or evaluate QMD-backed indexing.

## Files

- Create: `apps/api/src/evals/suites/contextIndexEval.ts`
  - Owns fixture scan, eval cases, scoring, and aggregate metrics.
- Create: `apps/api/src/evals/suites/contextIndexEval.test.ts`
  - Proves the suite passes offline and emits recall, precision, and efficiency metrics.
- Modify: `apps/api/src/evals/run.ts`
  - Registers the Context Index eval suite in local eval runs.
- Create: `docs/pr-notes/phase-5-context-index-eval-suite-review-guide.md`
  - Reviewer guide for the PR.
- Create: `docs/pr-notes/phase-5-context-index-eval-suite-follow-up-backlog.md`
  - Residual risks and deferred Phase 5 follow-ups.

### Task 1: Add Failing Context Index Eval Tests

- **Step 1: Write the failing test**

Add `apps/api/src/evals/suites/contextIndexEval.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runContextIndexEval } from "./contextIndexEval.js";

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
```

- **Step 2: Run test to verify RED**

Run:

```bash
pnpm --filter @signal-recycler/api test -- src/evals/suites/contextIndexEval.test.ts
```

Expected: fail because `./contextIndexEval.js` does not exist.

### Task 2: Implement The Eval Suite

- **Step 1: Add minimal implementation**

Create `apps/api/src/evals/suites/contextIndexEval.ts` with:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createContextIndexStore } from "../../services/contextIndexStore.js";
import { retrieveContextChunks } from "../../services/contextIndexRetrieval.js";
import { scanContextIndex } from "../../services/contextIndexScanner.js";
import { metric, suiteResult } from "../report.js";
import { type EvalCaseResult, type EvalMetric, type EvalSuiteResult } from "../types.js";

type ContextEvalCase = {
  id: string;
  title: string;
  query: string;
  goldPaths: string[];
  limit: number;
};

const fixtureRoot = resolve(process.cwd(), "../../fixtures/context-index-repo");
const projectId = "context-index-eval";
const evalCases: ContextEvalCase[] = [
  {
    id: "context-index.auth-middleware-source",
    title: "Auth middleware source is retrieved",
    query: "where is authentication middleware handled",
    goldPaths: ["apps/web/src/middleware.ts"],
    limit: 5
  },
  {
    id: "context-index.project-docs",
    title: "Project docs are retrieved",
    query: "where do docs mention pnpm workspaces and auth middleware",
    goldPaths: ["README.md"],
    limit: 5
  },
  {
    id: "context-index.package-scripts",
    title: "Package scripts are retrieved",
    query: "which package scripts run tests and type checking",
    goldPaths: ["package.json"],
    limit: 5
  },
  {
    id: "context-index.low-signal-query",
    title: "Low-signal query does not retrieve context",
    query: "test",
    goldPaths: [],
    limit: 5
  }
];

export function runContextIndexEval(): EvalSuiteResult {
  const store = createContextIndexStore(
    join(mkdtempSync(join(tmpdir(), "signal-recycler-context-index-eval-")), "index.sqlite")
  );
  const scanned = scanContextIndex({
    projectId,
    workdir: fixtureRoot,
    indexedAt: "2026-05-14T00:00:00.000Z"
  });
  if (scanned.errors.length > 0) {
    return suiteResult({
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
  }

  store.replaceProjectIndex({
    projectId,
    workdir: fixtureRoot,
    chunks: scanned.chunks.map(({ projectId: _projectId, ...chunk }) => chunk)
  });

  const totalIndexedTokens = scanned.chunks.reduce((sum, chunk) => sum + estimateTokens(chunk.text), 0);
  const cases = evalCases.map((testCase) => scoreCase(testCase, store));
  const recall = averageMetric(cases, "context_index_recall_at_5");
  const precision = averageMetric(cases, "context_index_precision_at_5");
  const selectedTokens = sumMetric(cases, "context_index_selected_tokens");
  const tokenEfficiency =
    totalIndexedTokens === 0 ? 0 : Number((selectedTokens / totalIndexedTokens).toFixed(3));

  store.close();

  return suiteResult({
    id: "context-index",
    title: "Context Index Retrieval",
    cases,
    metrics: [
      metric("context_index_recall_at_5", recall, "ratio"),
      metric("context_index_precision_at_5", precision, "ratio"),
      metric("context_index_tokens_selected", selectedTokens, "tokens"),
      metric("context_index_token_efficiency_ratio", tokenEfficiency, "ratio")
    ]
  });
}
```

Then add the helper functions needed by the file:

```ts
function scoreCase(
  testCase: ContextEvalCase,
  store: ReturnType<typeof createContextIndexStore>
): EvalCaseResult {
  const retrieval = retrieveContextChunks({
    store,
    projectId,
    query: testCase.query,
    limit: testCase.limit
  });
  const selectedPaths = retrieval.selected.map((decision) => decision.path);
  const gold = new Set(testCase.goldPaths);
  const truePositiveCount = selectedPaths.filter((path) => gold.has(path)).length;
  const recall =
    testCase.goldPaths.length === 0 ? (selectedPaths.length === 0 ? 1 : 0) : truePositiveCount / gold.size;
  const precision =
    selectedPaths.length === 0 ? (testCase.goldPaths.length === 0 ? 1 : 0) : truePositiveCount / selectedPaths.length;
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
      metric("context_index_recall_at_5", round(recall), "ratio"),
      metric("context_index_precision_at_5", round(precision), "ratio"),
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

function averageMetric(cases: EvalCaseResult[], name: string): number {
  const values = cases.flatMap((testCase) => testCase.metrics ?? []).filter((item) => item.name === name);
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
```

- **Step 2: Run test to verify GREEN**

Run:

```bash
pnpm --filter @signal-recycler/api test -- src/evals/suites/contextIndexEval.test.ts
```

Expected: pass.

### Task 3: Register The Suite

- **Step 1: Add failing integration expectation**

Update an existing eval runner/report test if present; if no direct runner test exists, add an assertion to `apps/api/src/evals/suites/contextIndexEval.test.ts` that `runContextIndexEval().id` is `"context-index"` and then register the suite in `run.ts`.

- **Step 2: Modify `apps/api/src/evals/run.ts`**

Add:

```ts
import { runContextIndexEval } from "./suites/contextIndexEval.js";
```

and insert after retrieval:

```ts
suites.push(await timed("context-index", runContextIndexEval));
```

- **Step 3: Verify eval command**

Run:

```bash
pnpm --filter @signal-recycler/api eval
```

Expected: report status is `pass` and report includes `Context Index Retrieval`.

### Task 4: Required PR Notes And Final Verification

- **Step 1: Create PR review guide**

Create `docs/pr-notes/phase-5-context-index-eval-suite-review-guide.md` with scope, change map, reviewer focus, verification commands, and out-of-scope Phase 5 items.

- **Step 2: Create follow-up backlog**

Create `docs/pr-notes/phase-5-context-index-eval-suite-follow-up-backlog.md` with P0/P1/P2 residual work. Do not hide blocking correctness bugs in the backlog.

- **Step 3: Full verification**

Run:

```bash
pnpm test
pnpm type-check
pnpm build
pnpm --filter @signal-recycler/api eval
git diff --check
```

Expected: all pass.
