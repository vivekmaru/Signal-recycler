# Phase 2 Memory Model And Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize Signal Recycler from Codex playbook rules to durable memory records with provenance, sync metadata, and auditable injection history.

**Architecture:** Keep the existing `rules` table as the storage base for Phase 2 so current dashboard, demo, and playbook injection behavior continue to work. Add memory metadata columns, a `memory_usages` audit table, shared schemas, and a small service that records every memory injection before Phase 3 adds scoped retrieval. The runtime remains local-first; `AGENTS.md` and `CLAUDE.md` are compatibility/export surfaces, not the source of truth.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Fastify, SQLite via `node:sqlite`, Zod shared schemas, existing playbook/compressor/classifier/proxy modules.

---

## Scope

In scope:

- Add a first-class `MemoryRecord` shared schema while keeping `PlaybookRule` as a compatibility alias.
- Add memory metadata: type, scope, source, confidence, created timestamp, last-used timestamp, supersession, and sync status.
- Represent manual, extracted, synced-file, imported, and source-derived memories differently.
- Record every injected memory in a queryable `memory_usages` table.
- Emit timeline events for memory injection so the dashboard can show what was sent and why.
- Add API surfaces for listing memories and inspecting a memory audit trail.
- Keep `/api/rules` and playbook export working for existing UI and demo flows.
- Add deterministic evals proving memory provenance coverage and usage audit coverage.

Out of scope:

- FTS5/BM25 retrieval and top-k memory selection.
- Source code and docs chunk indexing.
- Vector search.
- Cloud sync.
- Automatic filesystem writes to `AGENTS.md` or `CLAUDE.md`.
- Headless owned session adapters.
- Dashboard redesign.

## File Structure

Create:

- `apps/api/src/services/memoryInjection.ts`: records memory injection timeline events, inserts `memory_usages` rows, and updates `last_used_at`.
- `apps/api/src/services/memorySync.ts`: parses and renders compatibility memory blocks for `AGENTS.md` and `CLAUDE.md` without writing files.
- `apps/api/src/evals/suites/memoryAuditEval.ts`: deterministic eval for provenance completeness and usage audit coverage.

Modify:

- `packages/shared/src/index.ts`: add memory schemas, memory source/scope/sync enums, usage schema, and request schemas.
- `apps/api/src/store.ts`: migrate schema version `1` to `2`, map memory metadata, and add usage/audit methods.
- `apps/api/src/store.test.ts`: cover migration defaults, source metadata, supersession, and memory usage audit rows.
- `apps/api/src/routes/rules.ts`: keep `/api/rules` compatibility, add `/api/memories` aliases and memory audit routes.
- `apps/api/src/routes/proxy.ts`: record memory injection when approved memories are injected into API-compatible proxy traffic.
- `apps/api/src/codexRunner.ts`: record memory injection for mock/demo runs that inject memory without passing through `/proxy/*`.
- `apps/api/src/services/turnProcessor.ts`: persist classifier confidence and extracted-memory source metadata.
- `apps/api/src/evals/run.ts`: include the Phase 2 memory audit eval in local evals.
- `apps/api/src/server.test.ts`: test memory routes and proxy injection audit.
- `apps/web/src/api.ts`: consume richer memory records through existing `PlaybookRule` shape.
- `apps/web/src/App.tsx`: rename visible rule copy to memory copy only where the existing UI already describes durable memory.
- `README.md`: document Phase 2 memory model and audit endpoints.
- `docs/validation-roadmap.md`: link this plan under Phase 2.

Do not modify:

- `apps/api/src/compressor.ts`.
- `apps/api/src/classifier.ts` classification heuristics.
- `apps/api/src/playbook.ts` injection formatting except for type imports if needed.
- Phase 1 eval report renderer behavior.

## Data Model Decisions

Keep the database table name `rules` for Phase 2 to avoid a risky data migration and keep current routes stable. Treat each row as a `MemoryRecord` in TypeScript.

Use JSON text columns for `scope` and `source` because scope and provenance have different shapes per memory kind. Validate and parse them through shared Zod schemas before returning API data.

Add a separate `memory_usages` table rather than trying to query JSON arrays inside timeline event metadata. This gives Phase 3 and the dashboard a reliable audit source.

Memory injection in Phase 2 still injects all approved, non-superseded memories for the project. Scoped retrieval belongs to Phase 3.

## Task 1: Add Shared Memory Schemas

**Files:**

- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Replace rule-only schemas with memory schemas**

In `packages/shared/src/index.ts`, keep `ruleStatusSchema`, then add these schemas before `eventCategorySchema`:

```ts
export const memoryStatusSchema = ruleStatusSchema;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

export const memoryTypeSchema = z.enum([
  "rule",
  "preference",
  "project_fact",
  "command_convention",
  "source_derived",
  "synced_file"
]);
export type MemoryType = z.infer<typeof memoryTypeSchema>;

export const memoryConfidenceSchema = z.enum(["high", "medium", "low"]);
export type MemoryConfidence = z.infer<typeof memoryConfidenceSchema>;

export const memorySyncStatusSchema = z.enum(["local", "imported", "exported", "synced"]);
export type MemorySyncStatus = z.infer<typeof memorySyncStatusSchema>;

export const memoryScopeSchema = z.object({
  type: z.enum(["project", "repo_path", "package", "file", "agent", "user"]),
  value: z.string().nullable()
});
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

export const memorySourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("manual"),
    author: z.string().min(1)
  }),
  z.object({
    kind: z.literal("event"),
    sessionId: z.string().min(1),
    eventId: z.string().min(1)
  }),
  z.object({
    kind: z.literal("synced_file"),
    path: z.enum(["AGENTS.md", "CLAUDE.md"]),
    section: z.string().nullable()
  }),
  z.object({
    kind: z.literal("import"),
    label: z.string().min(1)
  }),
  z.object({
    kind: z.literal("source_chunk"),
    path: z.string().min(1),
    lineStart: z.number().int().positive().nullable(),
    lineEnd: z.number().int().positive().nullable()
  })
]);
export type MemorySource = z.infer<typeof memorySourceSchema>;
```

- [ ] **Step 2: Add event category for memory injection**

Change `eventCategorySchema` to include `"memory_injection"`:

```ts
export const eventCategorySchema = z.enum([
  "codex_event",
  "proxy_request",
  "compression_result",
  "classifier_result",
  "rule_candidate",
  "rule_auto_approved",
  "memory_injection"
]);
```

- [ ] **Step 3: Replace `ruleSchema` while preserving compatibility names**

Replace the current `ruleSchema` block with:

```ts
export const memoryRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: memoryStatusSchema,
  category: z.string(),
  rule: z.string(),
  reason: z.string(),
  sourceEventId: z.string().nullable(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  memoryType: memoryTypeSchema,
  scope: memoryScopeSchema,
  source: memorySourceSchema,
  confidence: memoryConfidenceSchema,
  lastUsedAt: z.string().nullable(),
  supersededBy: z.string().nullable(),
  syncStatus: memorySyncStatusSchema,
  updatedAt: z.string()
});
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;

export const ruleSchema = memoryRecordSchema;
export type PlaybookRule = MemoryRecord;
```

- [ ] **Step 4: Add usage and request schemas**

After `eventSchema`, add:

```ts
export const memoryUsageSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  memoryId: z.string(),
  sessionId: z.string(),
  eventId: z.string(),
  adapter: z.string(),
  reason: z.string(),
  injectedAt: z.string()
});
export type MemoryUsage = z.infer<typeof memoryUsageSchema>;
```

Replace `ruleConfidenceSchema` with an alias:

```ts
export const ruleConfidenceSchema = memoryConfidenceSchema;
export type RuleConfidence = MemoryConfidence;
```

Replace `createManualRuleRequestSchema` with:

```ts
export const createManualMemoryRequestSchema = z.object({
  category: z.string().min(2),
  rule: z.string().min(8),
  reason: z.string().min(8),
  memoryType: memoryTypeSchema.default("rule"),
  scope: memoryScopeSchema.default({ type: "project", value: null })
});

export const createManualRuleRequestSchema = createManualMemoryRequestSchema;
```

Add synced-memory request schema:

```ts
export const createSyncedMemoryRequestSchema = z.object({
  category: z.string().min(2),
  rule: z.string().min(8),
  reason: z.string().min(8),
  path: z.enum(["AGENTS.md", "CLAUDE.md"]),
  section: z.string().nullable().default(null),
  scope: memoryScopeSchema.default({ type: "project", value: null })
});
```

- [ ] **Step 5: Run shared package type-check**

Run:

```bash
pnpm --filter @signal-recycler/shared type-check
```

Expected: exits `0`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat: add shared memory schemas"
```

## Task 2: Migrate SQLite Schema To Memory Version 2

**Files:**

- Modify: `apps/api/src/store.ts`
- Modify: `apps/api/src/store.test.ts`

- [ ] **Step 1: Add failing store tests for version 2 defaults**

Add this test to `apps/api/src/store.test.ts`:

```ts
it("migrates rule rows into memory records with provenance defaults", () => {
  const store = createStore(":memory:");

  const candidate = store.createRuleCandidate({
    projectId: "demo",
    category: "package-manager",
    rule: "Use pnpm for package management.",
    reason: "The workspace is configured for pnpm.",
    sourceEventId: null
  });

  expect(store.inspectSchema().schemaVersion).toBe(2);
  expect(candidate.memoryType).toBe("rule");
  expect(candidate.scope).toEqual({ type: "project", value: null });
  expect(candidate.source).toEqual({ kind: "manual", author: "local-user" });
  expect(candidate.confidence).toBe("medium");
  expect(candidate.lastUsedAt).toBeNull();
  expect(candidate.supersededBy).toBeNull();
  expect(candidate.syncStatus).toBe("local");
  expect(candidate.updatedAt).toBe(candidate.createdAt);
});
```

Run:

```bash
pnpm --filter @signal-recycler/api test -- store.test.ts
```

Expected: fails because the new memory fields and schema version do not exist.

- [ ] **Step 2: Add store input types**

In `apps/api/src/store.ts`, update imports:

```ts
import {
  type EventCategory,
  type MemoryConfidence,
  type MemoryRecord,
  type MemoryScope,
  type MemorySource,
  type MemorySyncStatus,
  type MemoryType,
  type MemoryUsage,
  type PlaybookRule,
  type SessionRecord,
  type TimelineEvent,
  memoryScopeSchema,
  memorySourceSchema
} from "@signal-recycler/shared";
```

Extend `CreateRuleInput`:

```ts
type CreateRuleInput = {
  projectId: string;
  category: string;
  rule: string;
  reason: string;
  sourceEventId?: string | null;
  memoryType?: MemoryType;
  scope?: MemoryScope;
  source?: MemorySource;
  confidence?: MemoryConfidence;
  syncStatus?: MemorySyncStatus;
};
```

- [ ] **Step 3: Create versioned schema migration helper**

After the initial `db.exec(...)` block in `createStore`, call:

```ts
  migrateSchema(db);
```

Add this helper below `createStore`:

```ts
function migrateSchema(db: DatabaseSync): void {
  const versionRow = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
    .get() as { value?: string } | undefined;
  const version = Number(versionRow?.value ?? 1);

  if (version < 2) {
    db.exec(`
      ALTER TABLE rules ADD COLUMN memory_type TEXT NOT NULL DEFAULT 'rule';
      ALTER TABLE rules ADD COLUMN scope TEXT NOT NULL DEFAULT '{"type":"project","value":null}';
      ALTER TABLE rules ADD COLUMN source TEXT NOT NULL DEFAULT '{"kind":"manual","author":"local-user"}';
      ALTER TABLE rules ADD COLUMN confidence TEXT NOT NULL DEFAULT 'medium';
      ALTER TABLE rules ADD COLUMN last_used_at TEXT;
      ALTER TABLE rules ADD COLUMN superseded_by TEXT;
      ALTER TABLE rules ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local';
      ALTER TABLE rules ADD COLUMN updated_at TEXT;
      UPDATE rules SET updated_at = created_at WHERE updated_at IS NULL;
      UPDATE schema_meta SET value = '2' WHERE key = 'schema_version';
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_usages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      adapter TEXT NOT NULL,
      reason TEXT NOT NULL,
      injected_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_usages_memory_injected
      ON memory_usages (memory_id, injected_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memory_usages_project_injected
      ON memory_usages (project_id, injected_at DESC);
  `);
}
```

- [ ] **Step 4: Insert memory metadata in `createRuleCandidate`**

Update `createRuleCandidate` to set defaults:

```ts
      const timestamp = now();
      const rule: PlaybookRule = {
        id: createId("rule"),
        projectId: input.projectId,
        status: "pending",
        category: input.category,
        rule: input.rule,
        reason: input.reason,
        sourceEventId: input.sourceEventId ?? null,
        createdAt: timestamp,
        approvedAt: null,
        memoryType: input.memoryType ?? "rule",
        scope: input.scope ?? { type: "project", value: null },
        source: input.source ?? defaultMemorySource(input.sourceEventId ?? null),
        confidence: input.confidence ?? "medium",
        lastUsedAt: null,
        supersededBy: null,
        syncStatus: input.syncStatus ?? "local",
        updatedAt: timestamp
      };
```

Change the insert statement to include all new columns:

```ts
      db.prepare(
        `INSERT INTO rules (
          id, project_id, status, category, rule, reason, source_event_id, created_at, approved_at,
          memory_type, scope, source, confidence, last_used_at, superseded_by, sync_status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        rule.id,
        rule.projectId,
        rule.status,
        rule.category,
        rule.rule,
        rule.reason,
        rule.sourceEventId,
        rule.createdAt,
        rule.approvedAt,
        rule.memoryType,
        JSON.stringify(rule.scope),
        JSON.stringify(rule.source),
        rule.confidence,
        rule.lastUsedAt,
        rule.supersededBy,
        rule.syncStatus,
        rule.updatedAt
      );
```

- [ ] **Step 5: Add parse helpers and update mapper**

Add:

```ts
function defaultMemorySource(sourceEventId: string | null): MemorySource {
  if (sourceEventId) {
    return { kind: "event", sessionId: "unknown", eventId: sourceEventId };
  }
  return { kind: "manual", author: "local-user" };
}

function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
```

Update `mapRule`:

```ts
function mapRule(row: Record<string, unknown>): PlaybookRule {
  const scope = memoryScopeSchema.parse(
    parseJsonColumn(row.scope, { type: "project", value: null })
  );
  const source = memorySourceSchema.parse(
    parseJsonColumn(row.source, { kind: "manual", author: "local-user" })
  );

  return {
    id: String(row.id),
    projectId: String(row.project_id),
    status: row.status as PlaybookRule["status"],
    category: String(row.category),
    rule: String(row.rule),
    reason: String(row.reason),
    sourceEventId: row.source_event_id === null ? null : String(row.source_event_id),
    createdAt: String(row.created_at),
    approvedAt: row.approved_at === null ? null : String(row.approved_at),
    memoryType: String(row.memory_type ?? "rule") as PlaybookRule["memoryType"],
    scope,
    source,
    confidence: String(row.confidence ?? "medium") as PlaybookRule["confidence"],
    lastUsedAt: row.last_used_at === null || row.last_used_at === undefined ? null : String(row.last_used_at),
    supersededBy: row.superseded_by === null || row.superseded_by === undefined ? null : String(row.superseded_by),
    syncStatus: String(row.sync_status ?? "local") as PlaybookRule["syncStatus"],
    updatedAt: String(row.updated_at ?? row.created_at)
  };
}
```

- [ ] **Step 6: Update `inspectSchema` expected version**

No code change is needed in `inspectSchema`; the migration sets `schema_version` to `2`.

- [ ] **Step 7: Run store tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- store.test.ts
```

Expected: exits `0`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/store.ts apps/api/src/store.test.ts
git commit -m "feat: migrate store to memory records"
```

## Task 3: Add Memory Usage Audit Store Methods

**Files:**

- Modify: `apps/api/src/store.ts`
- Modify: `apps/api/src/store.test.ts`

- [ ] **Step 1: Add failing tests for usage rows and last-used updates**

Add:

```ts
it("records memory usages and updates last used timestamp", () => {
  const store = createStore(":memory:");
  const memory = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "The workspace uses pnpm."
    }).id
  );
  const event = store.createEvent({
    sessionId: "session_1",
    category: "memory_injection",
    title: "Injected memory",
    body: "Injected 1 memory.",
    metadata: { projectId: "demo", memoryIds: [memory.id] }
  });

  const usage = store.recordMemoryUsage({
    projectId: "demo",
    memoryId: memory.id,
    sessionId: "session_1",
    eventId: event.id,
    adapter: "proxy",
    reason: "approved_project_memory"
  });

  const updated = store.getRule(memory.id);
  expect(usage.memoryId).toBe(memory.id);
  expect(usage.eventId).toBe(event.id);
  expect(updated?.lastUsedAt).toBe(usage.injectedAt);
  expect(store.listMemoryUsages(memory.id)).toEqual([usage]);
});
```

Run:

```bash
pnpm --filter @signal-recycler/api test -- store.test.ts
```

Expected: fails because `recordMemoryUsage` and `listMemoryUsages` do not exist.

- [ ] **Step 2: Add store input type**

Add near other input types:

```ts
type RecordMemoryUsageInput = {
  projectId: string;
  memoryId: string;
  sessionId: string;
  eventId: string;
  adapter: string;
  reason: string;
};
```

- [ ] **Step 3: Add store methods**

Inside the returned store object, after `listApprovedRules`, add:

```ts
    recordMemoryUsage(input: RecordMemoryUsageInput): MemoryUsage {
      const injectedAt = now();
      const usage: MemoryUsage = {
        id: createId("usage"),
        projectId: input.projectId,
        memoryId: input.memoryId,
        sessionId: input.sessionId,
        eventId: input.eventId,
        adapter: input.adapter,
        reason: input.reason,
        injectedAt
      };
      db.prepare(
        `INSERT INTO memory_usages (
          id, project_id, memory_id, session_id, event_id, adapter, reason, injected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        usage.id,
        usage.projectId,
        usage.memoryId,
        usage.sessionId,
        usage.eventId,
        usage.adapter,
        usage.reason,
        usage.injectedAt
      );
      db.prepare("UPDATE rules SET last_used_at = ?, updated_at = ? WHERE id = ?").run(
        usage.injectedAt,
        usage.injectedAt,
        usage.memoryId
      );
      return usage;
    },

    listMemoryUsages(memoryId: string): MemoryUsage[] {
      return db
        .prepare("SELECT * FROM memory_usages WHERE memory_id = ? ORDER BY injected_at DESC")
        .all(memoryId)
        .map(mapMemoryUsage);
    },
```

- [ ] **Step 4: Add usage mapper**

Add below `mapRule`:

```ts
function mapMemoryUsage(row: Record<string, unknown>): MemoryUsage {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    memoryId: String(row.memory_id),
    sessionId: String(row.session_id),
    eventId: String(row.event_id),
    adapter: String(row.adapter),
    reason: String(row.reason),
    injectedAt: String(row.injected_at)
  };
}
```

- [ ] **Step 5: Exclude superseded memories from injection**

Change `listApprovedRules` query:

```ts
          "SELECT * FROM rules WHERE project_id = ? AND status = 'approved' AND superseded_by IS NULL ORDER BY approved_at ASC"
```

- [ ] **Step 6: Add supersession method and test**

Add this test:

```ts
it("supersedes approved memory so old memory is no longer injectable", () => {
  const store = createStore(":memory:");
  const oldMemory = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use npm for package management.",
      reason: "Old instruction."
    }).id
  );
  const newMemory = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "Corrected instruction."
    }).id
  );

  const superseded = store.supersedeRule(oldMemory.id, newMemory.id);

  expect(superseded.supersededBy).toBe(newMemory.id);
  expect(store.listApprovedRules("demo").map((r) => r.id)).toEqual([newMemory.id]);
});
```

Add store method:

```ts
    supersedeRule(id: string, replacementId: string): PlaybookRule {
      const updatedAt = now();
      db.prepare("UPDATE rules SET superseded_by = ?, updated_at = ? WHERE id = ?").run(
        replacementId,
        updatedAt,
        id
      );
      const rule = this.getRule(id);
      if (!rule) throw new Error(`Rule not found: ${id}`);
      return rule;
    },
```

- [ ] **Step 7: Run store tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- store.test.ts
```

Expected: exits `0`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/store.ts apps/api/src/store.test.ts
git commit -m "feat: record memory usage audit"
```

## Task 4: Preserve Source Metadata During Memory Creation

**Files:**

- Modify: `apps/api/src/services/turnProcessor.ts`
- Modify: `apps/api/src/routes/rules.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Add API tests for manual and extracted source metadata**

In `apps/api/src/server.test.ts`, add a test that posts a manual memory:

```ts
it("creates manual memories with manual provenance", async () => {
  const store = createStore(":memory:");
  const app = await createApp({
    projectId: "demo",
    workingDirectory: "/tmp/demo",
    store,
    codexRunner: {
      run: async () => ({ finalResponse: "ok", items: [] })
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/memories",
    payload: {
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "The repository uses pnpm workspaces.",
      memoryType: "command_convention",
      scope: { type: "project", value: null }
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    status: "approved",
    memoryType: "command_convention",
    source: { kind: "manual", author: "local-user" },
    syncStatus: "local"
  });
});
```

Add a turn-processing test or extend an existing session run test to assert extracted memory source:

```ts
expect(candidate.source).toMatchObject({
  kind: "event",
  sessionId: session.id,
  eventId: expect.stringMatching(/^event_/)
});
expect(candidate.confidence).toBe("high");
```

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: fails because `/api/memories` does not exist and extracted source lacks `sessionId`.

- [ ] **Step 2: Update turn processor memory creation**

In `apps/api/src/services/turnProcessor.ts`, change `createRuleCandidate` call:

```ts
    let rule = input.store.createRuleCandidate({
      projectId: input.projectId,
      category: candidate.category,
      rule: candidate.rule,
      reason: candidate.reason,
      sourceEventId: codexEvent.id,
      source: { kind: "event", sessionId: input.sessionId, eventId: codexEvent.id },
      confidence: candidate.confidence,
      memoryType: "rule",
      scope: { type: "project", value: null },
      syncStatus: "local"
    });
```

- [ ] **Step 3: Add memory routes while keeping rule routes**

In `apps/api/src/routes/rules.ts`, update imports:

```ts
import {
  createManualMemoryRequestSchema,
  createManualRuleRequestSchema,
  createSyncedMemoryRequestSchema
} from "@signal-recycler/shared";
```

Add before `/api/rules`:

```ts
  app.get("/api/memories", async () => options.store.listRules(projectId));

  app.post("/api/memories", async (request) => {
    const parsed = createManualMemoryRequestSchema.parse(request.body ?? {});
    const memory = options.store.createRuleCandidate({
      projectId,
      category: parsed.category,
      rule: parsed.rule,
      reason: parsed.reason,
      memoryType: parsed.memoryType,
      scope: parsed.scope,
      source: { kind: "manual", author: "local-user" },
      confidence: "high",
      syncStatus: "local",
      sourceEventId: null
    });
    return options.store.approveRule(memory.id);
  });

  app.post("/api/memories/synced", async (request) => {
    const parsed = createSyncedMemoryRequestSchema.parse(request.body ?? {});
    const memory = options.store.createRuleCandidate({
      projectId,
      category: parsed.category,
      rule: parsed.rule,
      reason: parsed.reason,
      memoryType: "synced_file",
      scope: parsed.scope,
      source: { kind: "synced_file", path: parsed.path, section: parsed.section },
      confidence: "high",
      syncStatus: "imported",
      sourceEventId: null
    });
    return options.store.approveRule(memory.id);
  });
```

Change existing `/api/rules` POST to parse `createManualRuleRequestSchema` and call the same memory creation fields as `/api/memories`.

- [ ] **Step 4: Run route tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: exits `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/turnProcessor.ts apps/api/src/routes/rules.ts apps/api/src/server.test.ts
git commit -m "feat: preserve memory source metadata"
```

## Task 5: Record Injection Events And Usage Rows

**Files:**

- Create: `apps/api/src/services/memoryInjection.ts`
- Modify: `apps/api/src/routes/proxy.ts`
- Modify: `apps/api/src/codexRunner.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Add proxy audit test**

In `apps/api/src/server.test.ts`, add a proxy test that approves a memory, sends a request through `/proxy/responses`, and asserts:

```ts
const events = store.listEvents("proxy");
const memoryEvent = events.find((event) => event.category === "memory_injection");
expect(memoryEvent?.metadata).toMatchObject({
  projectId: "demo",
  adapter: "proxy",
  memoryIds: [memory.id]
});
expect(store.listMemoryUsages(memory.id)).toHaveLength(1);
expect(store.getRule(memory.id)?.lastUsedAt).not.toBeNull();
```

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: fails because memory injection audit is not recorded.

- [ ] **Step 2: Create memory injection service**

Create `apps/api/src/services/memoryInjection.ts`:

```ts
import { type MemoryRecord } from "@signal-recycler/shared";
import { type SignalRecyclerStore } from "../store.js";

type RecordMemoryInjectionInput = {
  store: SignalRecyclerStore;
  projectId: string;
  sessionId: string;
  adapter: string;
  memories: MemoryRecord[];
  reason: string;
};

export function recordMemoryInjection(input: RecordMemoryInjectionInput): void {
  if (input.memories.length === 0) return;

  const event = input.store.createEvent({
    sessionId: input.sessionId,
    category: "memory_injection",
    title: `Injected ${input.memories.length} memor${input.memories.length === 1 ? "y" : "ies"}`,
    body: input.memories.map((memory) => `- ${memory.category}: ${memory.rule}`).join("\n"),
    metadata: {
      projectId: input.projectId,
      adapter: input.adapter,
      reason: input.reason,
      memoryIds: input.memories.map((memory) => memory.id),
      sources: input.memories.map((memory) => ({
        id: memory.id,
        source: memory.source,
        scope: memory.scope,
        syncStatus: memory.syncStatus
      }))
    }
  });

  for (const memory of input.memories) {
    input.store.recordMemoryUsage({
      projectId: input.projectId,
      memoryId: memory.id,
      sessionId: input.sessionId,
      eventId: event.id,
      adapter: input.adapter,
      reason: input.reason
    });
  }
}
```

- [ ] **Step 3: Record proxy injections**

In `apps/api/src/routes/proxy.ts`, import:

```ts
import { recordMemoryInjection } from "../services/memoryInjection.js";
```

After `const body = rawBody ? injectProxyBody(rawBody, rules) : undefined;`, add:

```ts
    recordMemoryInjection({
      store: options.store,
      projectId: options.projectId,
      sessionId,
      adapter: "proxy",
      memories: rules,
      reason: "approved_project_memory"
    });
```

- [ ] **Step 4: Record mock/demo Codex injections**

In `apps/api/src/codexRunner.ts`, import `recordMemoryInjection`. In the mock path where approved rules are injected without an HTTP proxy request, call:

```ts
        recordMemoryInjection({
          store: input.store,
          projectId: input.projectId,
          sessionId,
          adapter: "mock-codex",
          memories: rules,
          reason: "approved_project_memory"
        });
```

The mock branch should become:

```ts
      if (process.env.SIGNAL_RECYCLER_MOCK_CODEX === "1") {
        const injected = injectPlaybookRules(prompt, rules);
        recordMemoryInjection({
          store: input.store,
          projectId: input.projectId,
          sessionId,
          adapter: "mock-codex",
          memories: rules,
          reason: "approved_project_memory"
        });
        return {
          finalResponse:
            rules.length > 0
              ? `Checking learned constraints from playbook... ${rules[0]?.rule ?? ""} Applying rules before proceeding.`
              : "Encountered a failure. The correction should be captured as a durable rule.",
          items: [{ type: "mock", injected }]
        };
      }
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts store.test.ts
```

Expected: exits `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/memoryInjection.ts apps/api/src/routes/proxy.ts apps/api/src/codexRunner.ts apps/api/src/server.test.ts
git commit -m "feat: audit memory injections"
```

## Task 6: Add Memory Audit API

**Files:**

- Modify: `apps/api/src/routes/rules.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Add failing audit endpoint test**

In `apps/api/src/server.test.ts`, add:

```ts
it("returns memory audit trail with source and usages", async () => {
  const store = createStore(":memory:");
  const app = await createApp({
    projectId: "demo",
    workingDirectory: "/tmp/demo",
    store,
    codexRunner: {
      run: async () => ({ finalResponse: "ok", items: [] })
    }
  });
  const memory = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "The workspace uses pnpm.",
      source: { kind: "manual", author: "local-user" },
      confidence: "high"
    }).id
  );
  const event = store.createEvent({
    sessionId: "proxy",
    category: "memory_injection",
    title: "Injected memory",
    body: "Injected 1 memory.",
    metadata: { projectId: "demo", memoryIds: [memory.id] }
  });
  store.recordMemoryUsage({
    projectId: "demo",
    memoryId: memory.id,
    sessionId: "proxy",
    eventId: event.id,
    adapter: "proxy",
    reason: "approved_project_memory"
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/memories/${memory.id}/audit`
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    memory: { id: memory.id, source: { kind: "manual", author: "local-user" } },
    usages: [{ memoryId: memory.id, adapter: "proxy" }]
  });
});
```

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: fails because the route does not exist.

- [ ] **Step 2: Add audit route**

In `apps/api/src/routes/rules.ts`, add:

```ts
  app.get("/api/memories/:id/audit", async (request, reply) => {
    const { id } = request.params as { id: string };
    const memory = options.store.getRule(id);
    if (!memory || memory.projectId !== projectId) {
      return reply.code(404).send({ error: "Memory not found" });
    }
    return {
      memory,
      usages: options.store.listMemoryUsages(id)
    };
  });
```

- [ ] **Step 3: Run route tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: exits `0`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/rules.ts apps/api/src/server.test.ts
git commit -m "feat: expose memory audit API"
```

## Task 7: Add Compatibility Sync Parser And Renderer

**Files:**

- Create: `apps/api/src/services/memorySync.ts`
- Create: `apps/api/src/services/memorySync.test.ts`

- [ ] **Step 1: Add sync service tests**

Create `apps/api/src/services/memorySync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSyncedMemoryBlock, renderSyncedMemoryBlock } from "./memorySync.js";

describe("memory sync compatibility blocks", () => {
  it("renders approved memories as an AGENTS.md compatibility block", () => {
    const rendered = renderSyncedMemoryBlock("AGENTS.md", [
      {
        id: "rule_1",
        projectId: "demo",
        status: "approved",
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm.",
        sourceEventId: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        approvedAt: "2026-05-01T00:00:00.000Z",
        memoryType: "command_convention",
        scope: { type: "project", value: null },
        source: { kind: "manual", author: "local-user" },
        confidence: "high",
        lastUsedAt: null,
        supersededBy: null,
        syncStatus: "local",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    ]);

    expect(rendered).toContain("<!-- signal-recycler:start -->");
    expect(rendered).toContain("- **package-manager:** Use pnpm for package management.");
    expect(rendered).toContain("<!-- signal-recycler:end -->");
  });

  it("parses synced compatibility block entries", () => {
    const parsed = parseSyncedMemoryBlock(
      "AGENTS.md",
      [
        "<!-- signal-recycler:start -->",
        "- **package-manager:** Use pnpm for package management.",
        "  - Reason: The workspace uses pnpm.",
        "<!-- signal-recycler:end -->"
      ].join("\n")
    );

    expect(parsed).toEqual([
      {
        category: "package-manager",
        rule: "Use pnpm for package management.",
        reason: "The workspace uses pnpm.",
        path: "AGENTS.md",
        section: "signal-recycler"
      }
    ]);
  });
});
```

Run:

```bash
pnpm --filter @signal-recycler/api test -- memorySync.test.ts
```

Expected: fails because the service does not exist.

- [ ] **Step 2: Create service**

Create `apps/api/src/services/memorySync.ts`:

```ts
import { type MemoryRecord } from "@signal-recycler/shared";

type SyncPath = "AGENTS.md" | "CLAUDE.md";

export type ParsedSyncedMemory = {
  category: string;
  rule: string;
  reason: string;
  path: SyncPath;
  section: string;
};

export function renderSyncedMemoryBlock(path: SyncPath, memories: MemoryRecord[]): string {
  const lines = [
    "<!-- signal-recycler:start -->",
    `# Signal Recycler Memory Export (${path})`,
    "",
    "Signal Recycler remains the runtime source of truth. This block is exported for agent compatibility.",
    ""
  ];
  for (const memory of memories) {
    lines.push(`- **${memory.category}:** ${memory.rule}`);
    lines.push(`  - Reason: ${memory.reason}`);
    lines.push(`  - Source: ${memory.source.kind}`);
  }
  lines.push("<!-- signal-recycler:end -->");
  return lines.join("\n");
}

export function parseSyncedMemoryBlock(path: SyncPath, content: string): ParsedSyncedMemory[] {
  const start = content.indexOf("<!-- signal-recycler:start -->");
  const end = content.indexOf("<!-- signal-recycler:end -->");
  if (start === -1 || end === -1 || end <= start) return [];

  const block = content.slice(start, end);
  const lines = block.split(/\r?\n/);
  const parsed: ParsedSyncedMemory[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^- \*\*(.+?):\*\* (.+)$/);
    if (!match) continue;
    const reasonLine = lines[index + 1] ?? "";
    const reasonMatch = reasonLine.match(/^  - Reason: (.+)$/);
    parsed.push({
      category: match[1],
      rule: match[2],
      reason: reasonMatch?.[1] ?? "Imported from Signal Recycler compatibility block.",
      path,
      section: "signal-recycler"
    });
  }

  return parsed;
}
```

- [ ] **Step 3: Run sync tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- memorySync.test.ts
```

Expected: exits `0`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/memorySync.ts apps/api/src/services/memorySync.test.ts
git commit -m "feat: add memory compatibility sync helpers"
```

## Task 8: Add Phase 2 Memory Audit Eval

**Files:**

- Create: `apps/api/src/evals/suites/memoryAuditEval.ts`
- Modify: `apps/api/src/evals/run.ts`
- Modify: `apps/api/src/evals/suites/scenarioEval.test.ts`

- [ ] **Step 1: Add eval suite**

Create `apps/api/src/evals/suites/memoryAuditEval.ts`:

```ts
import { createStore } from "../../store.js";
import { recordMemoryInjection } from "../../services/memoryInjection.js";
import { metric, suiteResult } from "../report.js";
import { type EvalSuiteResult } from "../types.js";

export async function runMemoryAuditEval(): Promise<EvalSuiteResult> {
  const store = createStore(":memory:");
  const session = store.createSession({ projectId: "demo", title: "Memory audit eval" });
  const manual = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "package-manager",
      rule: "Use pnpm for package management.",
      reason: "The workspace uses pnpm.",
      source: { kind: "manual", author: "local-user" },
      confidence: "high"
    }).id
  );
  const synced = store.approveRule(
    store.createRuleCandidate({
      projectId: "demo",
      category: "agent-instructions",
      rule: "Check approved memory before suggesting package commands.",
      reason: "Imported from AGENTS.md compatibility block.",
      source: { kind: "synced_file", path: "AGENTS.md", section: "signal-recycler" },
      memoryType: "synced_file",
      confidence: "high",
      syncStatus: "imported"
    }).id
  );

  recordMemoryInjection({
    store,
    projectId: "demo",
    sessionId: session.id,
    adapter: "eval",
    memories: [manual, synced],
    reason: "approved_project_memory"
  });

  const memories = store.listApprovedRules("demo");
  const usageCount = memories.reduce(
    (count, memory) => count + store.listMemoryUsages(memory.id).length,
    0
  );
  const provenanceComplete = memories.every(
    (memory) => memory.source.kind === "manual" || memory.source.kind === "synced_file"
  );

  return suiteResult({
    id: "memory-audit",
    title: "Memory Audit Evals",
    cases: [
      {
        id: "memory-audit.provenance",
        title: "Approved memories retain distinct provenance",
        status: provenanceComplete ? "pass" : "fail",
        summary: provenanceComplete
          ? "Manual and synced memories keep distinct source metadata."
          : "At least one memory lost source metadata."
      },
      {
        id: "memory-audit.usage",
        title: "Injected memories produce usage rows",
        status: usageCount === 2 ? "pass" : "fail",
        summary: `Recorded ${usageCount} usage rows for 2 injected memories.`
      }
    ],
    metrics: [
      metric("memory_provenance_coverage", provenanceComplete ? 1 : 0, "ratio"),
      metric("memory_usage_rows", usageCount, "rows")
    ]
  });
}
```

- [ ] **Step 2: Register suite**

In `apps/api/src/evals/run.ts`, import and include:

```ts
import { runMemoryAuditEval } from "./suites/memoryAuditEval.js";
```

Add `await runMemoryAuditEval()` to the local suite list before live evals.

- [ ] **Step 3: Add eval regression test**

In `apps/api/src/evals/suites/scenarioEval.test.ts`, add:

```ts
import { runMemoryAuditEval } from "./memoryAuditEval.js";

it("proves memory provenance and usage audit coverage", async () => {
  const result = await runMemoryAuditEval();

  expect(result.status).toBe("pass");
  expect(result.metrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "memory_provenance_coverage", value: 1 }),
      expect.objectContaining({ name: "memory_usage_rows", value: 2 })
    ])
  );
});
```

- [ ] **Step 4: Run eval tests and local eval**

Run:

```bash
pnpm --filter @signal-recycler/api test -- scenarioEval.test.ts
pnpm eval
```

Expected: both commands exit `0`; eval output includes `Memory Audit Evals`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/evals/suites/memoryAuditEval.ts apps/api/src/evals/run.ts apps/api/src/evals/suites/scenarioEval.test.ts
git commit -m "feat: add memory audit evals"
```

## Task 9: Update UI Compatibility Copy

**Files:**

- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Keep API types compiling**

In `apps/web/src/api.ts`, keep existing function names but update visible labels and comments from "rules" to "memories" where the UI is not calling a legacy endpoint. The exported TypeScript type can remain `PlaybookRule` because it is now a `MemoryRecord` alias.

- [ ] **Step 2: Update high-signal UI copy**

In `apps/web/src/App.tsx`, replace user-facing copy that says durable "rules" when it means approved memory:

```tsx
Approved memory
```

```tsx
Candidate memory
```

```tsx
Memory injected
```

Do not redesign layout in this task.

- [ ] **Step 3: Run web type-check**

Run:

```bash
pnpm --filter @signal-recycler/web type-check
```

Expected: exits `0`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/App.tsx
git commit -m "chore: align dashboard copy with memory model"
```

## Task 10: Update Documentation And Roadmap

**Files:**

- Modify: `README.md`
- Modify: `docs/validation-roadmap.md`

- [ ] **Step 1: Document memory model**

In `README.md`, add a section named `Memory Model` with:

```md
## Memory Model

Signal Recycler stores durable memories locally in SQLite. A memory records:

- type: rule, preference, project fact, command convention, source-derived, or synced file
- scope: project, repo path, package, file, agent, or user
- source: manual user entry, agent event, synced instruction file, import, or source chunk
- confidence: high, medium, or low
- sync status: local, imported, exported, or synced
- audit usage: every injection records the session, adapter, event, and timestamp

`AGENTS.md` and `CLAUDE.md` are compatibility/export surfaces. Signal Recycler remains the runtime source of truth.
```

- [ ] **Step 2: Document API endpoints**

In `README.md`, add:

```md
### Memory APIs

- `GET /api/memories`: list project memories.
- `POST /api/memories`: create and approve a manual memory.
- `POST /api/memories/synced`: import a memory from an `AGENTS.md` or `CLAUDE.md` compatibility block.
- `GET /api/memories/:id/audit`: return the memory plus usage rows showing where it was injected.

Legacy `/api/rules` endpoints remain available during the transition from playbook rules to general memories.
```

- [ ] **Step 3: Link Phase 2 implementation plan**

Under `docs/validation-roadmap.md` Phase 2, add:

```md
Implementation plan: `docs/superpowers/plans/2026-05-01-phase-2-memory-model-audit-trail.md`
```

- [ ] **Step 4: Run docs diff check**

Run:

```bash
git diff -- README.md docs/validation-roadmap.md
```

Expected: diff contains only Phase 2 memory-model documentation and the plan link.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/validation-roadmap.md
git commit -m "docs: document phase 2 memory model"
```

## Task 11: Final Verification

**Files:**

- No new files.

- [ ] **Step 1: Run full type-check**

Run:

```bash
pnpm type-check
```

Expected: exits `0`.

- [ ] **Step 2: Run full tests**

Run:

```bash
pnpm test
```

Expected: exits `0`.

- [ ] **Step 3: Run local evals**

Run:

```bash
pnpm eval
```

Expected: exits `0` and includes `Memory Audit Evals`.

- [ ] **Step 4: Inspect generated report**

Run:

```bash
ls -la .signal-recycler/evals
```

Expected: shows the latest JSON and Markdown eval reports.

- [ ] **Step 5: Commit verification-only fixes if needed**

If verification reveals type or test failures, list the changed paths and commit the minimal fix with:

```bash
git status --short
git commit -m "fix: stabilize phase 2 verification"
```

Only create this commit when verification required code or documentation changes. Run `git add` with the exact paths shown by `git status --short` before committing.

## Phase 2 Acceptance Criteria

- `PlaybookRule` remains usable by current code, but new code can depend on `MemoryRecord`.
- Manual, extracted, and synced-file memories return different `source.kind` values.
- Approved memories include `memoryType`, `scope`, `confidence`, `syncStatus`, `lastUsedAt`, `supersededBy`, and `updatedAt`.
- Superseded approved memories are excluded from injection.
- Every injection path that adds memory to a request records a `memory_injection` timeline event and `memory_usages` rows.
- `/api/memories/:id/audit` returns provenance and usage history.
- `pnpm eval` includes a deterministic memory audit suite.
- README and roadmap state that `AGENTS.md` and `CLAUDE.md` are compatibility/export paths, not the runtime source of truth.

## Self-Review

Spec coverage:

- Phase 2 memory fields are covered by Tasks 1, 2, and 3.
- Injection traceability is covered by Tasks 3, 5, and 6.
- Manual, extracted, and synced-file differentiation is covered by Tasks 4 and 7.
- Runtime source of truth versus file export is covered by Tasks 7 and 10.
- Evals for measurable claims are covered by Task 8.

Boundary check:

- Retrieval ranking is excluded and remains Phase 3.
- Context indexing is excluded and remains Phase 5.
- Owned sessions are excluded and remain Phase 4.
- Dashboard redesign is excluded and remains Phase 4 or Phase 6.

Type consistency:

- `MemoryRecord` is the canonical name.
- `PlaybookRule` remains a compatibility alias.
- Database columns use snake_case; API and shared types use camelCase.
- Usage rows use `memoryId`, `sessionId`, `eventId`, `adapter`, `reason`, and `injectedAt` consistently.
