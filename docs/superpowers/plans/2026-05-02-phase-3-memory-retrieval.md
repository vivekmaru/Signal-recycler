# Phase 3 Memory Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inject-all memory behavior with deterministic top-k retrieval over approved memories.

**Architecture:** Keep `rules` as the canonical memory table and add a SQLite FTS5 mirror for lexical retrieval. Route proxy and mock Codex injection through a shared retrieval service, emit retrieval audit events, and add evals that prove relevant memories are selected while stale/superseded memories are skipped.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Fastify, SQLite `node:sqlite`, SQLite FTS5/BM25, existing memory/audit services.

---

## Scope Anchor

Roadmap phase: **Phase 3: Retrieval Before More Memory Creation**.

In scope:

- SQLite FTS5/BM25 retrieval over approved memories.
- Top-k memory selection before injection.
- Stale/superseded/cross-project memory exclusion.
- Retrieval audit events and injection metadata.
- Retrieval preview API.
- Evals proving retrieval quality and token reduction versus inject-all.

Out of scope:

- Owned Codex/Claude CLI sessions.
- Repo docs/source indexing.
- Vector or hybrid retrieval.
- Cloud sync.
- Dashboard redesign.

## File Structure

Create:

- `apps/api/src/services/memoryRetrieval.ts`: query builder, retrieval orchestration, scoring, skip reasons.
- `apps/api/src/services/memoryRetrieval.test.ts`: service-level retrieval behavior.
- `apps/api/src/evals/suites/retrievalEval.ts`: deterministic retrieval eval suite.
- `apps/api/src/evals/suites/retrievalEval.test.ts`: eval expectations.

Modify:

- `packages/shared/src/index.ts`: add `memory_retrieval` event category and retrieval request/result schemas.
- `apps/api/src/store.ts`: schema version `3`, `memory_fts`, search-index sync methods, retrieval query method.
- `apps/api/src/store.test.ts`: FTS migration, sync, project isolation, supersession exclusion.
- `apps/api/src/routes/rules.ts`: add `POST /api/memory/retrieve`.
- `apps/api/src/routes/proxy.ts`: retrieve selected memories before injection.
- `apps/api/src/codexRunner.ts`: retrieve selected memories in mock Codex mode.
- `apps/api/src/services/memoryInjection.ts`: accept retrieval metadata in audit events.
- `apps/api/src/evals/run.ts`: include retrieval eval.
- `apps/api/src/evals/suites/scenarioEval.ts`: turn stale-memory warning into retrieval-backed pass.
- `apps/api/src/server.test.ts`: API, proxy, and mock runner regression tests.
- `apps/web/src/App.tsx`: minimal timeline rendering for `memory_retrieval` event details.
- `README.md`: document retrieval behavior and preview API.
- `docs/validation-roadmap.md`: link this implementation plan under Phase 3.
- `docs/pr-notes/phase-3-review-guide.md`: reviewer guide.
- `docs/pr-notes/phase-3-follow-up-backlog.md`: residual risks and future work.

## Task 1: Add Shared Retrieval Schemas

**Files:**

- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write shared schema tests through API/server expectations**

No dedicated shared test file exists. The first failing checks will be API tests in later tasks. Add the shared schemas before API tests consume them.

- [ ] **Step 2: Add `memory_retrieval` event category**

Change `eventCategorySchema`:

```ts
export const eventCategorySchema = z.enum([
  "codex_event",
  "proxy_request",
  "compression_result",
  "classifier_result",
  "rule_candidate",
  "rule_auto_approved",
  "memory_injection",
  "memory_retrieval"
]);
```

- [ ] **Step 3: Add retrieval request/result schemas**

Add after `memoryUsageSchema`:

```ts
export const memoryRetrievalDecisionSchema = z.object({
  memoryId: z.string(),
  rank: z.number().int().positive().nullable(),
  score: z.number(),
  reason: z.string(),
  category: z.string(),
  memoryType: memoryTypeSchema,
  scope: memoryScopeSchema,
  source: memorySourceSchema
});
export type MemoryRetrievalDecision = z.infer<typeof memoryRetrievalDecisionSchema>;

export const skippedMemorySchema = z.object({
  memoryId: z.string(),
  reason: z.enum(["not_approved", "superseded", "scope_mismatch", "not_relevant", "cross_project"])
});
export type SkippedMemory = z.infer<typeof skippedMemorySchema>;

export const memoryRetrievalResultSchema = z.object({
  query: z.string(),
  selected: z.array(memoryRetrievalDecisionSchema),
  skipped: z.array(skippedMemorySchema),
  metrics: z.object({
    approvedMemories: z.number().int().nonnegative(),
    selectedMemories: z.number().int().nonnegative(),
    skippedMemories: z.number().int().nonnegative(),
    limit: z.number().int().positive()
  })
});
export type MemoryRetrievalResult = z.infer<typeof memoryRetrievalResultSchema>;
```

Add near request schemas:

```ts
export const memoryRetrievalRequestSchema = z.object({
  prompt: z.string().min(1),
  limit: z.number().int().positive().max(20).default(5)
});
```

- [ ] **Step 4: Run shared type-check**

Run:

```bash
pnpm --filter @signal-recycler/shared type-check
```

Expected: exits `0`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat: add memory retrieval schemas"
```

## Task 2: Add SQLite FTS5 Memory Index

**Files:**

- Modify: `apps/api/src/store.ts`
- Modify: `apps/api/src/store.test.ts`

- [ ] **Step 1: Add failing store tests**

Add to `apps/api/src/store.test.ts`:

```ts
it("searches approved memories with FTS and BM25 ranking", () => {
  const store = createStore(":memory:");
  const relevant = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm test instead of npm test.",
      reason: "The repo uses pnpm workspaces."
    }).id
  );
  store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "theme",
      rule: "Use the approved theme tokens.",
      reason: "Theme work follows the design system."
    }).id
  );

  const results = store.searchApprovedMemories({
    projectId: "demo",
    query: "validate tests with package manager",
    limit: 1
  });

  expect(results.map((result) => result.memory.id)).toEqual([relevant.id]);
  expect(results[0]?.rank).toBe(1);
});

it("does not return rejected, superseded, or cross-project memories from search", () => {
  const store = createStore(":memory:");
  const current = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm test for validation.",
      reason: "Current project convention."
    }).id
  );
  const old = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use npm test for validation.",
      reason: "Old convention."
    }).id
  );
  store.supersedeRule(old.id, current.id);
  const rejected = store.createRuleCandidate({
    projectId: "demo",
    category: "package-manager",
    rule: "Use yarn test for validation.",
    reason: "Rejected convention."
  });
  store.rejectRule(rejected.id);
  store.approveRule(
    store.createRuleCandidate({
      projectId: "other",
      category: "package-manager",
      rule: "Use npm test for validation.",
      reason: "Other project convention."
    }).id
  );

  const results = store.searchApprovedMemories({
    projectId: "demo",
    query: "validation test command",
    limit: 10
  });

  expect(results.map((result) => result.memory.id)).toEqual([current.id]);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm --filter @signal-recycler/api test -- store.test.ts
```

Expected: FAIL because `searchApprovedMemories` does not exist.

- [ ] **Step 3: Add store types**

In `apps/api/src/store.ts`, add:

```ts
type SearchApprovedMemoriesInput = {
  projectId: string;
  query: string;
  limit: number;
};

type SearchApprovedMemoryResult = {
  memory: PlaybookRule;
  rank: number;
  score: number;
};
```

- [ ] **Step 4: Add schema version 3 migration**

In `migrateSchema`, after the version 2 migration and before `memory_usages` table creation, add:

```ts
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      memory_id UNINDEXED,
      project_id UNINDEXED,
      category,
      rule,
      reason,
      source_text,
      tokenize = 'porter unicode61'
    );
  `);

  rebuildMemorySearchIndex(db);
  db.prepare("UPDATE schema_meta SET value = '3' WHERE key = 'schema_version'").run();
```

Keep this idempotent: `rebuildMemorySearchIndex` should delete and repopulate `memory_fts` from current `rules` rows.

- [ ] **Step 5: Add index sync helpers**

Add helper functions near existing mapping helpers:

```ts
function rebuildMemorySearchIndex(db: DatabaseSync): void {
  db.prepare("DELETE FROM memory_fts").run();
  const rows = db.prepare("SELECT * FROM rules").all();
  for (const row of rows) {
    upsertMemorySearchRow(db, mapRule(row));
  }
}

function upsertMemorySearchRow(db: DatabaseSync, memory: PlaybookRule): void {
  db.prepare("DELETE FROM memory_fts WHERE memory_id = ?").run(memory.id);
  db.prepare(
    `INSERT INTO memory_fts (memory_id, project_id, category, rule, reason, source_text)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    memory.id,
    memory.projectId,
    memory.category,
    memory.rule,
    memory.reason,
    renderSourceForSearch(memory.source)
  );
}

function deleteMemorySearchRow(db: DatabaseSync, memoryId: string): void {
  db.prepare("DELETE FROM memory_fts WHERE memory_id = ?").run(memoryId);
}

function renderSourceForSearch(source: MemorySource): string {
  if (source.kind === "manual") return source.author;
  if (source.kind === "event") return `${source.sessionId} ${source.eventId}`;
  if (source.kind === "synced_file") return `${source.path} ${source.section ?? ""}`;
  if (source.kind === "import") return source.label;
  return `${source.path} ${source.lineStart ?? ""} ${source.lineEnd ?? ""}`;
}
```

- [ ] **Step 6: Keep FTS rows synced**

After each create/update that changes injection eligibility or searchable text, refresh the row:

```ts
const rule = this.getRule(id);
if (!rule) throw new Error(`Rule not found: ${id}`);
upsertMemorySearchRow(db, rule);
return rule;
```

Apply this pattern in:

- `createRuleCandidate`
- `approveRule`
- `rejectRule`
- `supersedeRule` for the original memory

Rejected and superseded memories may remain in FTS; search must still filter them by joining canonical `rules`.

- [ ] **Step 7: Add search method**

Inside the returned store object, add:

```ts
searchApprovedMemories(input: SearchApprovedMemoriesInput): SearchApprovedMemoryResult[] {
  const ftsQuery = buildFtsQuery(input.query);
  if (!ftsQuery) return [];

  const rows = db
    .prepare(
      `SELECT rules.*, bm25(memory_fts, 0.8, 4.0, 2.0, 1.5) AS rank_score
       FROM memory_fts
       JOIN rules ON rules.id = memory_fts.memory_id
       WHERE memory_fts MATCH ?
         AND memory_fts.project_id = ?
         AND rules.project_id = ?
         AND rules.status = 'approved'
         AND rules.superseded_by IS NULL
       ORDER BY rank_score ASC, rules.approved_at ASC
       LIMIT ?`
    )
    .all(ftsQuery, input.projectId, input.projectId, input.limit) as Array<Record<string, unknown>>;

  return rows.map((row, index) => ({
    memory: mapRule(row),
    rank: index + 1,
    score: Number(row.rank_score ?? 0)
  }));
}
```

Add query builder:

```ts
function buildFtsQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .match(/[a-z0-9_./-]{2,}/g)
    ?.filter((term) => !STOP_WORDS.has(term))
    .slice(0, 12);
  if (!terms || terms.length === 0) return "";
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" OR ");
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "please",
  "repo",
  "project"
]);
```

- [ ] **Step 8: Run store tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- store.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/store.ts apps/api/src/store.test.ts
git commit -m "feat: index memories for lexical retrieval"
```

## Task 3: Add Memory Retrieval Service

**Files:**

- Create: `apps/api/src/services/memoryRetrieval.ts`
- Create: `apps/api/src/services/memoryRetrieval.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/src/services/memoryRetrieval.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { retrieveRelevantMemories } from "./memoryRetrieval.js";
import { createStore } from "../store.js";

describe("memory retrieval", () => {
  it("returns relevant selected memories and skipped not-relevant decisions", () => {
    const store = createStore(":memory:");
    const selected = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "The repo uses pnpm workspaces."
      }).id
    );
    const unrelated = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "theme",
        rule: "Use approved color tokens for UI theme changes.",
        reason: "Theme changes should follow design tokens."
      }).id
    );

    const result = retrieveRelevantMemories({
      store,
      projectId: "demo",
      query: "run package manager validation",
      limit: 1
    });

    expect(result.selected.map((decision) => decision.memoryId)).toEqual([selected.id]);
    expect(result.skipped).toContainEqual({
      memoryId: unrelated.id,
      reason: "not_relevant"
    });
    expect(result.metrics).toMatchObject({
      approvedMemories: 2,
      selectedMemories: 1,
      skippedMemories: 1,
      limit: 1
    });
  });

  it("does not inject every memory when a prompt has no searchable terms", () => {
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "tooling",
        rule: "Use pnpm for package scripts.",
        reason: "Manual setup rule."
      }).id
    );

    const result = retrieveRelevantMemories({
      store,
      projectId: "demo",
      query: "a",
      limit: 5
    });

    expect(result.selected).toEqual([]);
    expect(result.skipped).toContainEqual({
      memoryId: memory.id,
      reason: "not_relevant"
    });
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm --filter @signal-recycler/api test -- memoryRetrieval.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement retrieval service**

Create `apps/api/src/services/memoryRetrieval.ts`:

```ts
import {
  type MemoryRecord,
  type MemoryRetrievalDecision,
  type MemoryRetrievalResult,
  type SkippedMemory
} from "@signal-recycler/shared";
import { type SignalRecyclerStore } from "../store.js";

type RetrieveRelevantMemoriesInput = {
  store: SignalRecyclerStore;
  projectId: string;
  query: string;
  limit?: number;
};

export function retrieveRelevantMemories(
  input: RetrieveRelevantMemoriesInput
): MemoryRetrievalResult & { memories: MemoryRecord[] } {
  const limit = input.limit ?? 5;
  const approved = input.store.listApprovedRules(input.projectId);
  const hits = input.store.searchApprovedMemories({
    projectId: input.projectId,
    query: input.query,
    limit
  });
  const hitIds = new Set(hits.map((hit) => hit.memory.id));
  const selected: MemoryRetrievalDecision[] = hits.map((hit) => ({
    memoryId: hit.memory.id,
    rank: hit.rank,
    score: hit.score,
    reason: retrievalReason(hit.memory, input.query),
    category: hit.memory.category,
    memoryType: hit.memory.memoryType,
    scope: hit.memory.scope,
    source: hit.memory.source
  }));
  const skipped: SkippedMemory[] = approved
    .filter((memory) => !hitIds.has(memory.id))
    .map((memory) => ({ memoryId: memory.id, reason: "not_relevant" }));

  return {
    query: input.query,
    selected,
    skipped,
    memories: hits.map((hit) => hit.memory),
    metrics: {
      approvedMemories: approved.length,
      selectedMemories: selected.length,
      skippedMemories: skipped.length,
      limit
    }
  };
}

function retrievalReason(memory: MemoryRecord, query: string): string {
  const lowered = query.toLowerCase();
  if (lowered.includes(memory.category.toLowerCase())) {
    return `Matched category "${memory.category}"`;
  }
  if (memory.scope.value && lowered.includes(memory.scope.value.toLowerCase())) {
    return `Matched ${memory.scope.type} scope "${memory.scope.value}"`;
  }
  return "Matched memory text with lexical retrieval";
}
```

- [ ] **Step 4: Run service tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- memoryRetrieval.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/memoryRetrieval.ts apps/api/src/services/memoryRetrieval.test.ts
git commit -m "feat: retrieve relevant memories"
```

## Task 4: Add Retrieval Preview API

**Files:**

- Modify: `apps/api/src/routes/rules.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Add failing API test**

Add to `apps/api/src/server.test.ts`:

```ts
it("previews relevant memory retrieval for a prompt", async () => {
  const store = createStore(":memory:");
  const relevant = store.approveRule(
    store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "package-manager",
      rule: "Use pnpm test instead of npm test.",
      reason: "The repo uses pnpm workspaces."
    }).id
  );
  store.approveRule(
    store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "theme",
      rule: "Use approved theme tokens.",
      reason: "Theme work follows the design system."
    }).id
  );
  const app = await createApp({
    ...TEST_APP_OPTIONS,
    store,
    codexRunner: {
      run: async () => ({ finalResponse: "ok", items: [] })
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/memory/retrieve",
    payload: { prompt: "run package manager validation", limit: 1 }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().selected.map((decision: { memoryId: string }) => decision.memoryId)).toEqual([
    relevant.id
  ]);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: FAIL with route not found or missing schema import.

- [ ] **Step 3: Add route**

In `apps/api/src/routes/rules.ts`, import:

```ts
import { memoryRetrievalRequestSchema } from "@signal-recycler/shared";
import { retrieveRelevantMemories } from "../services/memoryRetrieval.js";
```

Add inside `registerRuleRoutes`:

```ts
  app.post("/api/memory/retrieve", async (request) => {
    const parsed = memoryRetrievalRequestSchema.parse(request.body ?? {});
    const result = retrieveRelevantMemories({
      store: options.store,
      projectId,
      query: parsed.prompt,
      limit: parsed.limit
    });
    return {
      query: result.query,
      selected: result.selected,
      skipped: result.skipped,
      metrics: result.metrics
    };
  });
```

- [ ] **Step 4: Run API test**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/rules.ts apps/api/src/server.test.ts
git commit -m "feat: add memory retrieval preview API"
```

## Task 5: Integrate Retrieval Into Proxy And Mock Codex Injection

**Files:**

- Modify: `apps/api/src/routes/proxy.ts`
- Modify: `apps/api/src/codexRunner.ts`
- Modify: `apps/api/src/services/memoryInjection.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Add failing proxy and mock tests**

Add to `apps/api/src/server.test.ts`:

```ts
it("injects only retrieved memories into proxy requests", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
  );
  const store = createStore(":memory:");
  const relevant = store.approveRule(
    store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "package-manager",
      rule: "Use pnpm test instead of npm test.",
      reason: "The repo uses pnpm workspaces."
    }).id
  );
  const unrelated = store.approveRule(
    store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "theme",
      rule: "Use approved theme tokens.",
      reason: "Theme work follows the design system."
    }).id
  );
  const app = await createApp({
    ...TEST_APP_OPTIONS,
    store,
    codexRunner: {
      run: async () => ({ finalResponse: "ok", items: [] })
    }
  });

  await app.inject({
    method: "POST",
    url: "/proxy/v1/responses",
    headers: {
      "content-type": "application/json",
      "x-signal-recycler-session-id": "proxy-retrieval"
    },
    payload: JSON.stringify({ input: "run package manager validation" })
  });

  const fetchBody = JSON.parse(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body));
  expect(JSON.stringify(fetchBody)).toContain(relevant.rule);
  expect(JSON.stringify(fetchBody)).not.toContain(unrelated.rule);
  expect(store.listMemoryUsages(relevant.id)).toHaveLength(1);
  expect(store.listMemoryUsages(unrelated.id)).toHaveLength(0);
});

it("mock Codex uses retrieved memory instead of all approved memories", async () => {
  vi.stubEnv("SIGNAL_RECYCLER_MOCK_CODEX", "1");
  const store = createStore(":memory:");
  store.approveRule(
    store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "theme",
      rule: "Use approved theme tokens.",
      reason: "Theme work follows the design system."
    }).id
  );
  const relevant = store.approveRule(
    store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "package-manager",
      rule: "Use pnpm test instead of npm test.",
      reason: "The repo uses pnpm workspaces."
    }).id
  );
  const runner = createCodexRunner({
    store,
    apiPort: 3001,
    projectId: TEST_APP_OPTIONS.projectId,
    workingDirectory: TEST_APP_OPTIONS.workingDirectory
  });

  const result = await runner.run({
    sessionId: "mock-retrieval",
    prompt: "run package manager validation"
  });

  expect(result.finalResponse).toContain(relevant.rule);
  expect(store.listEvents("mock-retrieval").map((event) => event.category)).toContain(
    "memory_retrieval"
  );
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: FAIL because runtime still injects all rules and emits no retrieval event.

- [ ] **Step 3: Add prompt extraction helper in proxy route**

In `apps/api/src/routes/proxy.ts`, add:

```ts
function extractQueryText(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const record = body as Record<string, unknown>;
  if (typeof record.input === "string") return record.input;
  if (Array.isArray(record.input)) return record.input.map(extractMessageText).join("\n");
  if (Array.isArray(record.messages)) return record.messages.map(extractMessageText).join("\n");
  if (typeof record.instructions === "string") return record.instructions;
  return "";
}

function extractMessageText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) return record.content.map(extractMessageText).join("\n");
  if (typeof record.text === "string") return record.text;
  return "";
}
```

- [ ] **Step 4: Retrieve before injection in proxy**

Replace:

```ts
const rules = options.store.listApprovedRules(options.projectId);
```

with retrieval after compression:

```ts
const retrieval = rawBody
  ? retrieveRelevantMemories({
      store: options.store,
      projectId: options.projectId,
      query: extractQueryText(rawBody),
      limit: 5
    })
  : emptyRetrieval();
const rules = retrieval.memories;
```

Emit event when there are approved memories or selected/skipped decisions:

```ts
if (retrieval.metrics.approvedMemories > 0) {
  options.store.createEvent({
    sessionId,
    category: "memory_retrieval",
    title: `Retrieved ${retrieval.selected.length} memor${retrieval.selected.length === 1 ? "y" : "ies"}`,
    body: retrieval.selected.map((decision) => `- ${decision.category}: ${decision.reason}`).join("\n"),
    metadata: {
      projectId: options.projectId,
      query: retrieval.query,
      selected: retrieval.selected,
      skipped: retrieval.skipped,
      metrics: retrieval.metrics
    }
  });
}
```

Pass retrieval metadata into `recordMemoryInjection`:

```ts
metadata: {
  method: request.method,
  path: tail,
  retrieval: {
    query: retrieval.query,
    selected: retrieval.selected,
    skipped: retrieval.skipped,
    metrics: retrieval.metrics
  }
}
```

- [ ] **Step 5: Retrieve before injection in mock Codex**

In `apps/api/src/codexRunner.ts`, replace all-rules lookup with:

```ts
const retrieval = retrieveRelevantMemories({
  store: input.store,
  projectId: input.projectId,
  query: prompt,
  limit: 5
});
const rules = retrieval.memories;
```

Emit a `memory_retrieval` event before injection with the same metadata shape as proxy.

- [ ] **Step 6: Run server tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/proxy.ts apps/api/src/codexRunner.ts apps/api/src/services/memoryInjection.ts apps/api/src/server.test.ts
git commit -m "feat: inject retrieved memories"
```

## Task 6: Add Retrieval Evals And Retire Stale-Memory Warning

**Files:**

- Create: `apps/api/src/evals/suites/retrievalEval.ts`
- Create: `apps/api/src/evals/suites/retrievalEval.test.ts`
- Modify: `apps/api/src/evals/run.ts`
- Modify: `apps/api/src/evals/suites/scenarioEval.ts`
- Modify: `apps/api/src/evals/suites/scenarioEval.test.ts`

- [ ] **Step 1: Add retrieval eval**

Create `apps/api/src/evals/suites/retrievalEval.ts` with cases for relevant selection, token reduction, superseded rejection, project isolation, and no-query fallback.

Use metrics:

```ts
metric("retrieval_recall_at_1", recallAt1, "ratio")
metric("retrieval_precision_at_1", precisionAt1, "ratio")
metric("tokens_added_delta_vs_inject_all", tokenDelta, "tokens")
metric("stale_memory_failures", staleFailures, "failures")
```

- [ ] **Step 2: Add eval test**

Create `apps/api/src/evals/suites/retrievalEval.test.ts`:

```ts
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
});
```

- [ ] **Step 3: Include eval in runner**

In `apps/api/src/evals/run.ts`, import and add `runRetrievalEval()` to the suites list.

- [ ] **Step 4: Update stale scenario**

Change `scenario.stale-memory-exposure` from `warn` to a passing case that demonstrates superseded memory is not selected.

- [ ] **Step 5: Run eval tests and eval command**

Run:

```bash
pnpm --filter @signal-recycler/api test -- retrievalEval.test.ts scenarioEval.test.ts
pnpm eval
```

Expected: tests pass; `pnpm eval` exits `0` with retrieval suite status `pass`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/evals apps/api/src/evals/run.ts
git commit -m "test: add memory retrieval evals"
```

## Task 7: Minimal Dashboard And Docs Updates

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `README.md`
- Modify: `docs/validation-roadmap.md`
- Create: `docs/pr-notes/phase-3-review-guide.md`
- Create: `docs/pr-notes/phase-3-follow-up-backlog.md`

- [ ] **Step 1: Add dashboard timeline copy**

In the existing event timeline rendering, ensure `memory_retrieval` is displayed as memory context, not a generic event. Show selected/skipped counts from metadata when available.

- [ ] **Step 2: Document retrieval behavior**

In `README.md`, update current product claims:

```md
- **Retrieve memory**: selects relevant approved memories before injection instead of injecting every approved memory.
```

Add API docs:

```md
| `POST` | `/api/memory/retrieve` | Preview which memories would be selected for a prompt. |
```

- [ ] **Step 3: Update roadmap**

Under Phase 3 in `docs/validation-roadmap.md`, add:

```md
Implementation plan: `docs/superpowers/plans/2026-05-02-phase-3-memory-retrieval.md`
```

- [ ] **Step 4: Add PR review guide and backlog**

Create `docs/pr-notes/phase-3-review-guide.md` with scope, subsystem map, reviewer focus areas, known non-blockers, verification commands, and explicit out-of-scope items.

Create `docs/pr-notes/phase-3-follow-up-backlog.md` with residual risks:

- `P1`: richer scope hints from owned sessions in Phase 4/4.5
- `P1`: repo docs/source index in Phase 5
- `P2`: vector/hybrid retrieval after lexical eval baseline
- `P2`: better UI for retrieval rationale

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm test
pnpm type-check
pnpm build
pnpm eval
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx README.md docs/validation-roadmap.md docs/pr-notes/phase-3-review-guide.md docs/pr-notes/phase-3-follow-up-backlog.md
git commit -m "docs: document phase 3 retrieval"
```

## Self-Review Checklist

- [ ] The plan is anchored to Phase 3 retrieval, not owned sessions.
- [ ] Every runtime injection path uses retrieval before injection.
- [ ] Retrieval never falls back to inject-all.
- [ ] Superseded and cross-project memories are excluded by canonical store filtering.
- [ ] Evals measure retrieval precision/recall and token reduction.
- [ ] Dashboard work is minimal and does not become a redesign.
- [ ] README does not claim repo indexing, vectors, or owned CLI sessions.
