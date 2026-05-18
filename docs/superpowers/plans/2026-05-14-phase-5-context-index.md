# Phase 5 Context Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Use Beads (`bd`) for durable task tracking; the step labels below are execution order, not markdown task state.

**Goal:** Add a local repository context index that stores docs, agent instruction files, package files, and selected source chunks with provenance, then retrieves relevant chunks for prompts without mixing them into durable memory.

**Architecture:** Build a deterministic SQLite FTS5/BM25 source index first, using focused context-index store/service modules instead of expanding `apps/api/src/store.ts`. Keep durable memory retrieval and source/doc chunk retrieval as separate data models and audit streams. Evaluate QMD as an optional retrieval backend after the first local baseline exists; do not make Phase 5 depend on QMD collection health.

**Tech Stack:** TypeScript, pnpm workspaces, Fastify, `node:sqlite`, SQLite FTS5/BM25, Vitest, React/Vite/Tailwind, existing Signal Recycler session/event/memory services.

---

## Scope Anchor

Roadmap phase: **Phase 5: Context Index**.

Phase goal: index repository and project context because indexing is core to the vision.

Success criteria this plan covers:

- Repo docs, agent instruction files, package files, and selected source chunks are indexed with path, line range, hash, and timestamp provenance.
- Prompts retrieve relevant docs/source chunks with measurable recall@k and precision@k.
- Source/doc chunks and durable memories remain separate concepts in the data model.
- Optional QMD-backed indexing is evaluated before building vectors, hybrid retrieval, or reranking.

Explicitly out of scope:

- Vector embeddings, cosine score UI, reranking, or model-backed retrieval.
- JIT rehydration by touched path/symbol. That remains Phase 7.
- Cloud sync.
- Compare/replay execution.
- Replacing durable memory retrieval.
- Making QMD a hard runtime dependency.

## Current Reality

- `apps/api/src/store.ts` already owns sessions, events, memories, migrations, memory FTS, memory usages, and exports. Phase 5 should not add source-index schema and queries directly to this file.
- `apps/api/src/services/memoryRetrieval.ts` is the right pattern to copy: retrieval logic in a focused service, persistence behind a store-like interface.
- `apps/web/src/views/ContextIndexView.tsx` is currently an honest memory retrieval preview. Phase 5 should replace that preview with real source-index coverage and retrieval data.
- `qmd status` now reports embeddings are present, but `qmd://docs`, `qmd://notes`, and `qmd://personal` still show 0 indexed files. QMD backing folders are configured; content/index population still needs verification before relying on QMD for product behavior.

## Target File Structure

Create:

- `apps/api/src/services/contextIndexStore.ts`
  - Owns source-index SQLite schema, migrations, writes, deletes, FTS sync, coverage queries, and lexical search.
- `apps/api/src/services/contextIndexStore.test.ts`
  - Tests schema creation, upsert behavior, stale hash replacement, project isolation, BM25 search, and deletion for removed files.
- `apps/api/src/services/contextIndexScanner.ts`
  - Walks a workdir, applies include/exclude rules, reads files, classifies source type, chunks content, hashes chunks, and emits indexable records.
- `apps/api/src/services/contextIndexScanner.test.ts`
  - Tests file selection, ignore behavior, chunk provenance, line ranges, hash stability, and binary/large-file skipping.
- `apps/api/src/services/contextIndexRetrieval.ts`
  - Retrieves top-k source/doc chunks for a prompt and returns selected/skipped decisions with metrics.
- `apps/api/src/services/contextIndexRetrieval.test.ts`
  - Tests recall@k, precision@k fixtures, no empty-query fallback, project isolation, and source-type filters.
- `apps/api/src/routes/contextIndex.ts`
  - Adds API routes for indexing status, reindex, and retrieval preview.
- `apps/api/src/evals/suites/contextIndexEval.ts`
  - Deterministic local eval suite for source/doc recall and precision.
- `apps/api/src/evals/suites/contextIndexEval.test.ts`
  - Test wrapper for the eval suite.
- `fixtures/context-index-repo/`
  - Small fixture repo with docs, AGENTS.md, package files, config, source, tests, ignored files, and expected retrieval cases.

Modify:

- `packages/shared/src/index.ts`
  - Add source chunk schemas and context-index request/response schemas.
- `apps/api/src/app.ts`
  - Register context index routes.
- `apps/api/src/evals/run.ts`
  - Include the context-index eval suite.
- `apps/web/src/api.ts`
  - Add context-index API helpers.
- `apps/web/src/views/ContextIndexView.tsx`
  - Replace memory-only preview with real coverage and source-context retrieval preview.
- `docs/validation-roadmap.md`
  - Mark Phase 5 status only after implementation lands.
- `README.md`
  - Document source index behavior and commands only after routes work.
- `docs/pr-notes/phase-5-context-index-review-guide.md`
  - Add verification results during implementation.
- `docs/pr-notes/phase-5-context-index-follow-up-backlog.md`
  - Track deferred QMD, vectors, rehydration, and scale concerns.

Avoid:

- Adding source-index tables to `apps/api/src/store.ts`.
- Reusing `MemoryRecord` for source chunks.
- Returning fake vector fields in the UI.
- Auto-indexing huge repos on server startup.
- Reading `node_modules`, `.git`, `.beads`, SQLite DBs, build output, lock cache folders, or binary files.

## Public API Shape

Add shared schemas:

```ts
export const contextSourceTypeSchema = z.enum([
  "docs",
  "agent_instructions",
  "package",
  "source",
  "config",
  "tests"
]);

export const contextChunkSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sourceType: contextSourceTypeSchema,
  path: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  hash: z.string().min(16),
  mtimeMs: z.number().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  text: z.string(),
  indexedAt: z.string()
});

export const contextIndexStatusSchema = z.object({
  projectId: z.string(),
  workdir: z.string(),
  totalChunks: z.number().int().nonnegative(),
  totalFiles: z.number().int().nonnegative(),
  lastIndexedAt: z.string().nullable(),
  bySourceType: z.array(z.object({
    sourceType: contextSourceTypeSchema,
    files: z.number().int().nonnegative(),
    chunks: z.number().int().nonnegative()
  }))
});

export const contextRetrievalRequestSchema = z.object({
  prompt: z.string().min(1),
  limit: z.number().int().positive().max(20).default(8),
  sourceTypes: z.array(contextSourceTypeSchema).optional()
});

export const contextRetrievalResultSchema = z.object({
  query: z.string(),
  selected: z.array(z.object({
    chunkId: z.string(),
    rank: z.number().int().positive(),
    score: z.number(),
    reason: z.string(),
    sourceType: contextSourceTypeSchema,
    path: z.string(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    hash: z.string()
  })),
  skipped: z.array(z.object({
    chunkId: z.string(),
    reason: z.enum(["not_relevant", "source_type_filter", "project_mismatch"])
  })),
  metrics: z.object({
    indexedChunks: z.number().int().nonnegative(),
    selectedChunks: z.number().int().nonnegative(),
    skippedChunks: z.number().int().nonnegative(),
    limit: z.number().int().positive()
  })
});
```

Add API routes:

```text
GET  /api/context-index/status
POST /api/context-index/reindex
POST /api/context-index/retrieve
```

`POST /api/context-index/reindex` should be explicit. Phase 5 should not auto-index on every server start because users will point Signal Recycler at arbitrary workdirs.

## Task 1: Add Shared Context Index Schemas

**Files:**

- Modify: `packages/shared/src/index.ts`

Step 1: **Add failing schema tests through API/service imports**

Run:

```bash
pnpm --filter @signal-recycler/shared type-check
```

Expected: passes before edits. This establishes the baseline.

Step 2: **Add context source and retrieval schemas**

Append the schema block from **Public API Shape** after `memoryRetrievalResultSchema`.

Step 3: **Export inferred types**

Add:

```ts
export type ContextSourceType = z.infer<typeof contextSourceTypeSchema>;
export type ContextChunk = z.infer<typeof contextChunkSchema>;
export type ContextIndexStatus = z.infer<typeof contextIndexStatusSchema>;
export type ContextRetrievalRequest = z.infer<typeof contextRetrievalRequestSchema>;
export type ContextRetrievalResult = z.infer<typeof contextRetrievalResultSchema>;
```

Step 4: **Verify shared package**

Run:

```bash
pnpm --filter @signal-recycler/shared type-check
```

Expected: passes.

Step 5: **Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat: add context index schemas"
```

## Task 2: Add Context Index Store

**Files:**

- Create: `apps/api/src/services/contextIndexStore.ts`
- Create: `apps/api/src/services/contextIndexStore.test.ts`

Step 1: **Write failing store tests**

Create `apps/api/src/services/contextIndexStore.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createContextIndexStore } from "./contextIndexStore.js";

function dbPath() {
  return join(mkdtempSync(join(tmpdir(), "signal-recycler-context-index-")), "index.sqlite");
}

describe("context index store", () => {
  it("upserts chunks and reports coverage by source type", () => {
    const store = createContextIndexStore(dbPath());
    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        {
          sourceType: "docs",
          path: "README.md",
          lineStart: 1,
          lineEnd: 5,
          hash: "hash_readme_00000001",
          mtimeMs: 10,
          sizeBytes: 120,
          text: "Use pnpm for package management.",
          indexedAt: "2026-05-14T00:00:00.000Z"
        },
        {
          sourceType: "source",
          path: "apps/api/src/server.ts",
          lineStart: 1,
          lineEnd: 3,
          hash: "hash_server_00000001",
          mtimeMs: 20,
          sizeBytes: 240,
          text: "Fastify server listens on the configured port.",
          indexedAt: "2026-05-14T00:00:00.000Z"
        }
      ]
    });

    expect(store.status("demo", "/repo")).toMatchObject({
      projectId: "demo",
      workdir: "/repo",
      totalChunks: 2,
      totalFiles: 2,
      bySourceType: expect.arrayContaining([
        { sourceType: "docs", files: 1, chunks: 1 },
        { sourceType: "source", files: 1, chunks: 1 }
      ])
    });
  });

  it("searches chunks with project isolation", () => {
    const store = createContextIndexStore(dbPath());
    store.upsertChunks({
      projectId: "demo",
      workdir: "/repo",
      chunks: [
        {
          sourceType: "package",
          path: "package.json",
          lineStart: 1,
          lineEnd: 20,
          hash: "hash_package_00000001",
          mtimeMs: 10,
          sizeBytes: 500,
          text: "scripts include pnpm test and pnpm type-check",
          indexedAt: "2026-05-14T00:00:00.000Z"
        }
      ]
    });
    store.upsertChunks({
      projectId: "other",
      workdir: "/other",
      chunks: [
        {
          sourceType: "package",
          path: "package.json",
          lineStart: 1,
          lineEnd: 20,
          hash: "hash_other_00000001",
          mtimeMs: 10,
          sizeBytes: 500,
          text: "scripts include npm test",
          indexedAt: "2026-05-14T00:00:00.000Z"
        }
      ]
    });

    const hits = store.search({
      projectId: "demo",
      query: "how do we run package validation",
      limit: 5
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.chunk.path).toBe("package.json");
    expect(hits[0]?.chunk.projectId).toBe("demo");
  });

  it("removes stale chunks for files no longer present", () => {
    const store = createContextIndexStore(dbPath());
    const chunk = {
      sourceType: "docs" as const,
      path: "OLD.md",
      lineStart: 1,
      lineEnd: 1,
      hash: "hash_old_00000001",
      mtimeMs: 10,
      sizeBytes: 20,
      text: "old content",
      indexedAt: "2026-05-14T00:00:00.000Z"
    };
    store.upsertChunks({ projectId: "demo", workdir: "/repo", chunks: [chunk] });
    store.replaceProjectIndex({
      projectId: "demo",
      workdir: "/repo",
      indexedAt: "2026-05-14T00:01:00.000Z",
      chunks: []
    });

    expect(store.status("demo", "/repo").totalChunks).toBe(0);
  });
});
```

Step 2: **Run tests to verify failure**

```bash
pnpm --filter @signal-recycler/api test -- contextIndexStore.test.ts
```

Expected: fails because `contextIndexStore.ts` does not exist.

Step 3: **Implement context index store**

Create `apps/api/src/services/contextIndexStore.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import {
  type ContextChunk,
  type ContextIndexStatus,
  type ContextSourceType
} from "@signal-recycler/shared";

type IndexableContextChunk = Omit<ContextChunk, "id" | "projectId">;

type UpsertChunksInput = {
  projectId: string;
  workdir: string;
  chunks: IndexableContextChunk[];
};

type ReplaceProjectIndexInput = UpsertChunksInput & {
  indexedAt: string;
};

type SearchInput = {
  projectId: string;
  query: string;
  limit: number;
  sourceTypes?: ContextSourceType[];
};

type SearchHit = {
  chunk: ContextChunk;
  rank: number;
  score: number;
};

export type ContextIndexStore = ReturnType<typeof createContextIndexStore>;

export function createContextIndexStore(path: string) {
  const db = new DatabaseSync(path);
  ensureSchema(db);

  return {
    upsertChunks(input: UpsertChunksInput): void {
      db.exec("BEGIN");
      try {
        for (const chunk of input.chunks) {
          upsertChunk(db, input.projectId, chunk);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    replaceProjectIndex(input: ReplaceProjectIndexInput): void {
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM context_chunks WHERE project_id = ?").run(input.projectId);
        db.prepare("DELETE FROM context_chunk_fts WHERE project_id = ?").run(input.projectId);
        for (const chunk of input.chunks) {
          upsertChunk(db, input.projectId, { ...chunk, indexedAt: input.indexedAt });
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    status(projectId: string, workdir: string): ContextIndexStatus {
      const totalRow = db
        .prepare(
          `SELECT COUNT(*) AS chunks,
                  COUNT(DISTINCT path) AS files,
                  MAX(indexed_at) AS last_indexed_at
           FROM context_chunks
           WHERE project_id = ?`
        )
        .get(projectId) as { chunks: number; files: number; last_indexed_at: string | null };
      const bySourceType = db
        .prepare(
          `SELECT source_type,
                  COUNT(DISTINCT path) AS files,
                  COUNT(*) AS chunks
           FROM context_chunks
           WHERE project_id = ?
           GROUP BY source_type
           ORDER BY source_type ASC`
        )
        .all(projectId)
        .map((row) => ({
          sourceType: String((row as { source_type: unknown }).source_type) as ContextSourceType,
          files: Number((row as { files: unknown }).files),
          chunks: Number((row as { chunks: unknown }).chunks)
        }));

      return {
        projectId,
        workdir,
        totalChunks: Number(totalRow.chunks),
        totalFiles: Number(totalRow.files),
        lastIndexedAt: totalRow.last_indexed_at,
        bySourceType
      };
    },

    search(input: SearchInput): SearchHit[] {
      const terms = tokenizeSearchQuery(input.query);
      if (terms.length === 0 || input.limit <= 0) return [];
      const matchQuery = terms.map((term) => `"${term}"`).join(" OR ");
      const sourceFilter =
        input.sourceTypes && input.sourceTypes.length > 0
          ? `AND context_chunks.source_type IN (${input.sourceTypes.map(() => "?").join(", ")})`
          : "";
      const rows = db
        .prepare(
          `SELECT context_chunks.*,
                  bm25(context_chunk_fts, 0.0, 0.0, 2.0, 6.0) AS search_score
           FROM context_chunk_fts
           JOIN context_chunks ON context_chunks.id = context_chunk_fts.chunk_id
           WHERE context_chunk_fts MATCH ?
             AND context_chunk_fts.project_id = ?
             AND context_chunks.project_id = ?
             ${sourceFilter}
           ORDER BY search_score ASC, context_chunks.path ASC, context_chunks.line_start ASC
           LIMIT ?`
        )
        .all(
          matchQuery,
          input.projectId,
          input.projectId,
          ...(input.sourceTypes ?? []),
          input.limit
        ) as Array<Record<string, unknown> & { search_score: number }>;

      return rows.map((row, index) => ({
        chunk: mapChunk(row),
        rank: index + 1,
        score: Math.max(0, -Number(row.search_score))
      }));
    }
  };
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      path TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      hash TEXT NOT NULL,
      mtime_ms REAL NOT NULL,
      size_bytes INTEGER NOT NULL,
      text TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_context_chunks_project_path_hash
      ON context_chunks (project_id, path, hash);

    CREATE INDEX IF NOT EXISTS idx_context_chunks_project_source
      ON context_chunks (project_id, source_type, path);

    CREATE VIRTUAL TABLE IF NOT EXISTS context_chunk_fts USING fts5(
      chunk_id UNINDEXED,
      project_id UNINDEXED,
      path,
      text,
      tokenize = 'porter unicode61'
    );
  `);
}

function upsertChunk(db: DatabaseSync, projectId: string, chunk: IndexableContextChunk): void {
  const id = contextChunkId(projectId, chunk.path, chunk.hash);
  db.prepare("DELETE FROM context_chunks WHERE id = ?").run(id);
  db.prepare("DELETE FROM context_chunk_fts WHERE chunk_id = ?").run(id);
  db.prepare(
    `INSERT INTO context_chunks (
      id, project_id, source_type, path, line_start, line_end, hash,
      mtime_ms, size_bytes, text, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    chunk.sourceType,
    chunk.path,
    chunk.lineStart,
    chunk.lineEnd,
    chunk.hash,
    chunk.mtimeMs,
    chunk.sizeBytes,
    chunk.text,
    chunk.indexedAt
  );
  db.prepare(
    `INSERT INTO context_chunk_fts (chunk_id, project_id, path, text)
     VALUES (?, ?, ?, ?)`
  ).run(id, projectId, chunk.path, chunk.text);
}

function mapChunk(row: Record<string, unknown>): ContextChunk {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    sourceType: String(row.source_type) as ContextSourceType,
    path: String(row.path),
    lineStart: Number(row.line_start),
    lineEnd: Number(row.line_end),
    hash: String(row.hash),
    mtimeMs: Number(row.mtime_ms),
    sizeBytes: Number(row.size_bytes),
    text: String(row.text),
    indexedAt: String(row.indexed_at)
  };
}

function contextChunkId(projectId: string, path: string, hash: string): string {
  return `chunk_${stableId(`${projectId}:${path}:${hash}`)}`;
}

function stableId(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "do",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "we",
  "with"
]);

function tokenizeSearchQuery(query: string): string[] {
  const seen = new Set<string>();
  const matches = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const terms: string[] = [];
  for (const match of matches) {
    if (SEARCH_STOP_WORDS.has(match)) continue;
    if (seen.has(match)) continue;
    seen.add(match);
    terms.push(match);
  }
  return terms;
}
```

Step 4: **Run store tests**

```bash
pnpm --filter @signal-recycler/api test -- contextIndexStore.test.ts
```

Expected: 3 tests pass.

Step 5: **Commit**

```bash
git add apps/api/src/services/contextIndexStore.ts apps/api/src/services/contextIndexStore.test.ts
git commit -m "feat: add context index store"
```

## Task 3: Add Workdir Scanner And Chunker

**Files:**

- Create: `apps/api/src/services/contextIndexScanner.ts`
- Create: `apps/api/src/services/contextIndexScanner.test.ts`
- Create fixture files under `fixtures/context-index-repo/`

Step 1: **Create fixture repo**

Create:

```text
fixtures/context-index-repo/README.md
fixtures/context-index-repo/AGENTS.md
fixtures/context-index-repo/package.json
fixtures/context-index-repo/apps/web/src/middleware.ts
fixtures/context-index-repo/apps/web/src/auth.ts
fixtures/context-index-repo/apps/web/src/auth.test.ts
fixtures/context-index-repo/.gitignore
fixtures/context-index-repo/node_modules/ignored.md
```

Use these contents:

`fixtures/context-index-repo/README.md`

```md
# Context Index Fixture

This repository uses pnpm workspaces.

Authentication middleware lives in apps/web/src/middleware.ts.
```

`fixtures/context-index-repo/AGENTS.md`

```md
# Agent Instructions

Use pnpm type-check before reporting TypeScript changes as complete.
Never edit files under apps/web/src/generated.
```

`fixtures/context-index-repo/package.json`

```json
{
  "scripts": {
    "test": "pnpm vitest",
    "type-check": "tsc --noEmit"
  }
}
```

`fixtures/context-index-repo/apps/web/src/middleware.ts`

```ts
export function middleware(request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie?.includes("session=")) {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response("OK");
}
```

`fixtures/context-index-repo/apps/web/src/auth.ts`

```ts
export function readSessionCookie(cookie: string | null) {
  return cookie?.match(/session=([^;]+)/)?.[1] ?? null;
}
```

`fixtures/context-index-repo/apps/web/src/auth.test.ts`

```ts
import { readSessionCookie } from "./auth";

test("reads session cookie", () => {
  expect(readSessionCookie("session=abc")).toBe("abc");
});
```

`fixtures/context-index-repo/.gitignore`

```gitignore
node_modules
dist
```

`fixtures/context-index-repo/node_modules/ignored.md`

```md
This file must not be indexed.
```

Step 2: **Write failing scanner tests**

Create `apps/api/src/services/contextIndexScanner.test.ts`:

```ts
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scanContextIndex } from "./contextIndexScanner.js";

const fixtureRoot = resolve(process.cwd(), "../../fixtures/context-index-repo");

describe("context index scanner", () => {
  it("indexes docs, agent instructions, package files, source, and tests", () => {
    const result = scanContextIndex({
      projectId: "fixture",
      workdir: fixtureRoot,
      indexedAt: "2026-05-14T00:00:00.000Z"
    });

    expect(result.chunks.map((chunk) => chunk.path)).toEqual(
      expect.arrayContaining([
        "README.md",
        "AGENTS.md",
        "package.json",
        "apps/web/src/middleware.ts",
        "apps/web/src/auth.ts",
        "apps/web/src/auth.test.ts"
      ])
    );
    expect(result.chunks.some((chunk) => chunk.path.includes("node_modules"))).toBe(false);
    expect(result.chunks.find((chunk) => chunk.path === "AGENTS.md")?.sourceType).toBe(
      "agent_instructions"
    );
    expect(result.chunks.find((chunk) => chunk.path === "package.json")?.sourceType).toBe(
      "package"
    );
    expect(result.chunks.find((chunk) => chunk.path.endsWith(".test.ts"))?.sourceType).toBe(
      "tests"
    );
  });

  it("records stable line ranges and hashes", () => {
    const first = scanContextIndex({
      projectId: "fixture",
      workdir: fixtureRoot,
      indexedAt: "2026-05-14T00:00:00.000Z"
    });
    const second = scanContextIndex({
      projectId: "fixture",
      workdir: fixtureRoot,
      indexedAt: "2026-05-14T00:01:00.000Z"
    });
    const firstReadme = first.chunks.find((chunk) => chunk.path === "README.md");
    const secondReadme = second.chunks.find((chunk) => chunk.path === "README.md");

    expect(firstReadme).toMatchObject({ lineStart: 1, lineEnd: 5 });
    expect(firstReadme?.hash).toBe(secondReadme?.hash);
  });
});
```

Step 3: **Run tests to verify failure**

```bash
pnpm --filter @signal-recycler/api test -- contextIndexScanner.test.ts
```

Expected: fails because `contextIndexScanner.ts` does not exist.

Step 4: **Implement scanner**

Create `apps/api/src/services/contextIndexScanner.ts`:

```ts
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { type ContextChunk, type ContextSourceType } from "@signal-recycler/shared";

type ScanInput = {
  projectId: string;
  workdir: string;
  indexedAt: string;
  maxFileBytes?: number;
};

type IndexableChunk = Omit<ContextChunk, "id">;

const DEFAULT_MAX_FILE_BYTES = 120_000;
const MAX_LINES_PER_CHUNK = 80;

const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".beads",
  ".signal-recycler",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".vite"
]);

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".html",
  ".txt"
]);

export function scanContextIndex(input: ScanInput): { chunks: IndexableChunk[] } {
  const chunks: IndexableChunk[] = [];
  for (const absolutePath of walk(input.workdir)) {
    const relPath = normalizePath(relative(input.workdir, absolutePath));
    if (!shouldIndexPath(relPath)) continue;
    const stats = statSync(absolutePath);
    if (stats.size > (input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES)) continue;
    const text = readFileSync(absolutePath, "utf8");
    if (looksBinary(text)) continue;
    chunks.push(...chunkFile({
      projectId: input.projectId,
      path: relPath,
      text,
      sourceType: classifySourceType(relPath),
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
      indexedAt: input.indexedAt
    }));
  }
  return { chunks };
}

function walk(root: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(absolutePath));
    } else if (entry.isFile()) {
      out.push(absolutePath);
    }
  }
  return out;
}

function shouldIndexPath(path: string): boolean {
  const extension = path.match(/\.[^.]+$/)?.[0] ?? "";
  return TEXT_EXTENSIONS.has(extension) || path === "AGENTS.md" || path === "CLAUDE.md";
}

function classifySourceType(path: string): ContextSourceType {
  if (path === "AGENTS.md" || path === "CLAUDE.md") return "agent_instructions";
  if (path.endsWith(".md") || path.startsWith("docs/")) return "docs";
  if (path.endsWith("package.json") || path.endsWith("pnpm-workspace.yaml")) return "package";
  if (path.includes(".test.") || path.includes(".spec.")) return "tests";
  if (path.match(/\.(jsonc?|ya?ml|toml)$/)) return "config";
  return "source";
}

function chunkFile(input: {
  projectId: string;
  path: string;
  text: string;
  sourceType: ContextSourceType;
  mtimeMs: number;
  sizeBytes: number;
  indexedAt: string;
}): IndexableChunk[] {
  const lines = input.text.split(/\r?\n/);
  const chunks: IndexableChunk[] = [];
  for (let start = 0; start < lines.length; start += MAX_LINES_PER_CHUNK) {
    const selected = lines.slice(start, start + MAX_LINES_PER_CHUNK);
    const text = selected.join("\n").trim();
    if (!text) continue;
    chunks.push({
      projectId: input.projectId,
      sourceType: input.sourceType,
      path: input.path,
      lineStart: start + 1,
      lineEnd: start + selected.length,
      hash: hashText(`${input.path}:${start + 1}:${text}`),
      mtimeMs: input.mtimeMs,
      sizeBytes: input.sizeBytes,
      text,
      indexedAt: input.indexedAt
    });
  }
  return chunks;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function looksBinary(value: string): boolean {
  return value.includes("\u0000");
}
```

Step 5: **Run scanner tests**

```bash
pnpm --filter @signal-recycler/api test -- contextIndexScanner.test.ts
```

Expected: 2 tests pass.

Step 6: **Commit**

```bash
git add fixtures/context-index-repo apps/api/src/services/contextIndexScanner.ts apps/api/src/services/contextIndexScanner.test.ts
git commit -m "feat: scan repo context chunks"
```

## Task 4: Add Retrieval Service

**Files:**

- Create: `apps/api/src/services/contextIndexRetrieval.ts`
- Create: `apps/api/src/services/contextIndexRetrieval.test.ts`

Step 1: **Write failing retrieval tests**

Create `apps/api/src/services/contextIndexRetrieval.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createContextIndexStore } from "./contextIndexStore.js";
import { retrieveContextChunks } from "./contextIndexRetrieval.js";

function storeWithFixture() {
  const store = createContextIndexStore(join(mkdtempSync(join(tmpdir(), "ctx-retrieval-")), "db.sqlite"));
  store.upsertChunks({
    projectId: "demo",
    workdir: "/repo",
    chunks: [
      {
        sourceType: "agent_instructions",
        path: "AGENTS.md",
        lineStart: 1,
        lineEnd: 4,
        hash: "hash_agents_00000001",
        mtimeMs: 1,
        sizeBytes: 80,
        text: "Use pnpm type-check before reporting TypeScript changes.",
        indexedAt: "2026-05-14T00:00:00.000Z"
      },
      {
        sourceType: "source",
        path: "apps/web/src/middleware.ts",
        lineStart: 1,
        lineEnd: 9,
        hash: "hash_middleware_00000001",
        mtimeMs: 1,
        sizeBytes: 200,
        text: "Authentication middleware reads session cookies and returns unauthorized responses.",
        indexedAt: "2026-05-14T00:00:00.000Z"
      },
      {
        sourceType: "docs",
        path: "README.md",
        lineStart: 1,
        lineEnd: 4,
        hash: "hash_readme_00000001",
        mtimeMs: 1,
        sizeBytes: 120,
        text: "The project dashboard is a local control plane for agent memory.",
        indexedAt: "2026-05-14T00:00:00.000Z"
      }
    ]
  });
  return store;
}

describe("context index retrieval", () => {
  it("selects relevant source chunks without returning durable memory objects", () => {
    const result = retrieveContextChunks({
      store: storeWithFixture(),
      projectId: "demo",
      query: "where is auth middleware handled",
      limit: 3
    });

    expect(result.selected[0]).toMatchObject({
      path: "apps/web/src/middleware.ts",
      sourceType: "source"
    });
    expect(result.metrics.selectedChunks).toBe(1);
    expect(result.selected[0]).not.toHaveProperty("memoryId");
  });

  it("supports source type filters", () => {
    const result = retrieveContextChunks({
      store: storeWithFixture(),
      projectId: "demo",
      query: "pnpm type-check",
      limit: 3,
      sourceTypes: ["docs"]
    });

    expect(result.selected).toHaveLength(0);
    expect(result.skipped.length).toBeGreaterThan(0);
  });
});
```

Step 2: **Run tests to verify failure**

```bash
pnpm --filter @signal-recycler/api test -- contextIndexRetrieval.test.ts
```

Expected: fails because `contextIndexRetrieval.ts` does not exist.

Step 3: **Implement retrieval service**

Create `apps/api/src/services/contextIndexRetrieval.ts`:

```ts
import {
  type ContextRetrievalResult,
  type ContextSourceType
} from "@signal-recycler/shared";
import { type ContextIndexStore } from "./contextIndexStore.js";

type RetrieveContextChunksInput = {
  store: ContextIndexStore;
  projectId: string;
  query: string;
  limit?: number;
  sourceTypes?: ContextSourceType[];
};

const DEFAULT_CONTEXT_RETRIEVAL_LIMIT = 8;

export function retrieveContextChunks(input: RetrieveContextChunksInput): ContextRetrievalResult {
  const limit = normalizeLimit(input.limit);
  const allHits = input.store.search({
    projectId: input.projectId,
    query: input.query,
    limit,
    sourceTypes: input.sourceTypes
  });

  const selected = allHits.map((hit) => ({
    chunkId: hit.chunk.id,
    rank: hit.rank,
    score: hit.score,
    reason: `Matched ${hit.chunk.sourceType} context with lexical retrieval`,
    sourceType: hit.chunk.sourceType,
    path: hit.chunk.path,
    lineStart: hit.chunk.lineStart,
    lineEnd: hit.chunk.lineEnd,
    hash: hit.chunk.hash
  }));

  return {
    query: input.query,
    selected,
    skipped: [],
    metrics: {
      indexedChunks: selected.length,
      selectedChunks: selected.length,
      skippedChunks: 0,
      limit
    }
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_CONTEXT_RETRIEVAL_LIMIT;
  const normalized = Math.floor(limit);
  return normalized > 0 ? normalized : DEFAULT_CONTEXT_RETRIEVAL_LIMIT;
}
```

Step 4: **Improve skipped accounting**

Extend `ContextIndexStore` with `listChunkIds(projectId: string, sourceTypes?: ContextSourceType[])` and use it to report non-selected chunks as `not_relevant` or `source_type_filter`.

Expected service behavior:

```ts
const selectedIds = new Set(selected.map((decision) => decision.chunkId));
const skipped = input.store
  .listChunkIds(input.projectId)
  .filter((chunk) => !selectedIds.has(chunk.id))
  .map((chunk) => ({
    chunkId: chunk.id,
    reason: input.sourceTypes && !input.sourceTypes.includes(chunk.sourceType)
      ? "source_type_filter"
      : "not_relevant"
  }));
```

Step 5: **Run retrieval tests**

```bash
pnpm --filter @signal-recycler/api test -- contextIndexRetrieval.test.ts contextIndexStore.test.ts
```

Expected: tests pass.

Step 6: **Commit**

```bash
git add apps/api/src/services/contextIndexRetrieval.ts apps/api/src/services/contextIndexRetrieval.test.ts apps/api/src/services/contextIndexStore.ts apps/api/src/services/contextIndexStore.test.ts
git commit -m "feat: retrieve indexed source context"
```

## Task 5: Add Context Index API Routes

**Files:**

- Create: `apps/api/src/routes/contextIndex.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.test.ts`

Step 1: **Write route tests**

Add tests to `apps/api/src/server.test.ts`:

```ts
it("reindexes repository context and retrieves source chunks", async () => {
  const app = await buildTestApp({ workingDirectory: fixtureContextRepoPath });

  const reindex = await app.inject({
    method: "POST",
    url: "/api/context-index/reindex"
  });
  expect(reindex.statusCode).toBe(200);

  const status = await app.inject({
    method: "GET",
    url: "/api/context-index/status"
  });
  expect(status.statusCode).toBe(200);
  expect(status.json()).toMatchObject({
    totalChunks: expect.any(Number),
    totalFiles: expect.any(Number)
  });

  const retrieval = await app.inject({
    method: "POST",
    url: "/api/context-index/retrieve",
    payload: { prompt: "where is auth middleware", limit: 5 }
  });
  expect(retrieval.statusCode).toBe(200);
  expect(retrieval.json().selected[0]).toMatchObject({
    path: "apps/web/src/middleware.ts",
    sourceType: "source"
  });
});
```

Use the existing `server.test.ts` helper style. If there is no fixture helper, add `const fixtureContextRepoPath = resolve(process.cwd(), "../../fixtures/context-index-repo");`.

Step 2: **Run route tests to verify failure**

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: fails because routes do not exist.

Step 3: **Implement route module**

Create `apps/api/src/routes/contextIndex.ts`:

```ts
import { type FastifyInstance } from "fastify";
import {
  contextRetrievalRequestSchema,
  type ContextChunk
} from "@signal-recycler/shared";
import { createContextIndexStore } from "../services/contextIndexStore.js";
import { retrieveContextChunks } from "../services/contextIndexRetrieval.js";
import { scanContextIndex } from "../services/contextIndexScanner.js";

export type ContextIndexRouteOptions = {
  contextIndexDbPath: string;
  projectId: string;
  workingDirectory: string;
};

export async function registerContextIndexRoutes(
  app: FastifyInstance,
  options: ContextIndexRouteOptions
): Promise<void> {
  const contextStore = createContextIndexStore(options.contextIndexDbPath);

  app.get("/api/context-index/status", async () =>
    contextStore.status(options.projectId, options.workingDirectory)
  );

  app.post("/api/context-index/reindex", async () => {
    const indexedAt = new Date().toISOString();
    const scanned = scanContextIndex({
      projectId: options.projectId,
      workdir: options.workingDirectory,
      indexedAt
    });
    contextStore.replaceProjectIndex({
      projectId: options.projectId,
      workdir: options.workingDirectory,
      indexedAt,
      chunks: scanned.chunks.map(stripProjectId)
    });
    return contextStore.status(options.projectId, options.workingDirectory);
  });

  app.post("/api/context-index/retrieve", async (request, reply) => {
    const parsed = contextRetrievalRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid context retrieval request",
        message: parsed.error.issues.map((issue) => issue.message).join("; ")
      });
    }
    return retrieveContextChunks({
      store: contextStore,
      projectId: options.projectId,
      query: parsed.data.prompt,
      limit: parsed.data.limit,
      sourceTypes: parsed.data.sourceTypes
    });
  });
}

function stripProjectId(chunk: Omit<ContextChunk, "id">): Omit<ContextChunk, "id" | "projectId"> {
  const { projectId: _projectId, ...rest } = chunk;
  return rest;
}
```

Step 4: **Register routes**

In `apps/api/src/app.ts`, import `registerContextIndexRoutes` and register it after rule routes:

```ts
import { registerContextIndexRoutes } from "./routes/contextIndex.js";
```

Add `contextIndexDbPath?: string` to `AppOptions`, then:

```ts
await registerContextIndexRoutes(app, {
  projectId,
  workingDirectory,
  contextIndexDbPath: options.contextIndexDbPath ?? options.databasePath ?? ":memory:"
});
```

Step 5: **Run route tests**

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts contextIndexStore.test.ts contextIndexScanner.test.ts contextIndexRetrieval.test.ts
```

Expected: tests pass.

Step 6: **Commit**

```bash
git add apps/api/src/routes/contextIndex.ts apps/api/src/app.ts apps/api/src/server.test.ts
git commit -m "feat: add context index api"
```

## Task 6: Add Context Index Evals

**Files:**

- Create: `apps/api/src/evals/suites/contextIndexEval.ts`
- Create: `apps/api/src/evals/suites/contextIndexEval.test.ts`
- Modify: `apps/api/src/evals/run.ts`

Step 1: **Write eval suite**

Create `apps/api/src/evals/suites/contextIndexEval.ts`:

```ts
import { resolve } from "node:path";
import { createContextIndexStore } from "../../services/contextIndexStore.js";
import { retrieveContextChunks } from "../../services/contextIndexRetrieval.js";
import { scanContextIndex } from "../../services/contextIndexScanner.js";
import { metric, suiteResult } from "../types.js";

const fixtureRoot = resolve(process.cwd(), "../../fixtures/context-index-repo");

export async function runContextIndexEval() {
  const store = createContextIndexStore(":memory:");
  const scanned = scanContextIndex({
    projectId: "fixture",
    workdir: fixtureRoot,
    indexedAt: "2026-05-14T00:00:00.000Z"
  });
  store.replaceProjectIndex({
    projectId: "fixture",
    workdir: fixtureRoot,
    indexedAt: "2026-05-14T00:00:00.000Z",
    chunks: scanned.chunks.map(({ projectId: _projectId, ...chunk }) => chunk)
  });

  const cases = [
    {
      id: "context-index.auth-middleware",
      title: "Auth middleware source is retrieved",
      prompt: "where is authentication middleware handled",
      expectedPath: "apps/web/src/middleware.ts"
    },
    {
      id: "context-index.agent-instructions",
      title: "Agent instruction context is retrieved",
      prompt: "what validation should agents run before reporting typescript changes",
      expectedPath: "AGENTS.md"
    }
  ].map((testCase) => {
    const result = retrieveContextChunks({
      store,
      projectId: "fixture",
      query: testCase.prompt,
      limit: 3
    });
    const selectedPaths = result.selected.map((decision) => decision.path);
    const hit = selectedPaths.includes(testCase.expectedPath);
    return {
      id: testCase.id,
      title: testCase.title,
      status: hit ? "pass" as const : "fail" as const,
      summary: hit
        ? `retrieved ${testCase.expectedPath}`
        : `expected ${testCase.expectedPath}; got ${selectedPaths.join(", ")}`,
      metrics: [
        metric("context_recall_at_3", hit ? 1 : 0, "ratio"),
        metric(
          "context_precision_at_3",
          result.selected.length > 0 && hit ? 1 / result.selected.length : 0,
          "ratio"
        )
      ],
      details: { selectedPaths }
    };
  });

  const recall = averageMetric(cases, "context_recall_at_3");
  const precision = averageMetric(cases, "context_precision_at_3");

  return suiteResult({
    id: "context-index",
    title: "Context Index Retrieval",
    cases,
    metrics: [
      metric("context_recall_at_3", recall, "ratio"),
      metric("context_precision_at_3", precision, "ratio"),
      metric("indexed_context_chunks", scanned.chunks.length, "chunks")
    ]
  });
}

function averageMetric(
  cases: Array<{ metrics: Array<{ name: string; value: number }> }>,
  name: string
): number {
  const values = cases.flatMap((testCase) =>
    testCase.metrics.filter((item) => item.name === name).map((item) => item.value)
  );
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
```

Step 2: **Add eval test**

Create `apps/api/src/evals/suites/contextIndexEval.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runContextIndexEval } from "./contextIndexEval.js";

describe("context index eval", () => {
  it("proves source/doc retrieval recall and precision", async () => {
    const suite = await runContextIndexEval();
    expect(suite.status).toBe("pass");
    expect(suite.cases.map((testCase) => [testCase.id, testCase.status])).toEqual([
      ["context-index.auth-middleware", "pass"],
      ["context-index.agent-instructions", "pass"]
    ]);
    expect(suite.metrics).toEqual(
      expect.arrayContaining([
        { name: "context_recall_at_3", value: 1, unit: "ratio" },
        { name: "indexed_context_chunks", value: expect.any(Number), unit: "chunks" }
      ])
    );
  });
});
```

Step 3: **Register eval suite**

In `apps/api/src/evals/run.ts`, import and include `runContextIndexEval()` in the local suite list.

Step 4: **Run eval tests**

```bash
pnpm --filter @signal-recycler/api test -- contextIndexEval.test.ts
pnpm eval
```

Expected: context index eval passes and the report includes `Context Index Retrieval`.

Step 5: **Commit**

```bash
git add apps/api/src/evals/suites/contextIndexEval.ts apps/api/src/evals/suites/contextIndexEval.test.ts apps/api/src/evals/run.ts .signal-recycler/evals/latest.json .signal-recycler/evals/latest.md
git commit -m "feat: add context index evals"
```

## Task 7: Update Context Index UI

**Files:**

- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/views/ContextIndexView.tsx`
- Add or modify web presenter tests if helper extraction is needed.

Step 1: **Add API helpers**

In `apps/web/src/api.ts`, add:

```ts
import type {
  ContextIndexStatus,
  ContextRetrievalRequest,
  ContextRetrievalResult
} from "@signal-recycler/shared";
```

Add:

```ts
export async function fetchContextIndexStatus(): Promise<ContextIndexStatus> {
  return readJson(await fetch("/api/context-index/status"));
}

export async function reindexContext(): Promise<ContextIndexStatus> {
  return readJson(await fetch("/api/context-index/reindex", { method: "POST" }));
}

export async function previewContextRetrieval(
  input: ContextRetrievalRequest
): Promise<ContextRetrievalResult> {
  const response = await fetch("/api/context-index/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readJson(response);
}
```

Step 2: **Replace preview text and API calls**

In `apps/web/src/views/ContextIndexView.tsx`:

- Load `fetchContextIndexStatus()` on mount.
- Add a `Reindex` button that calls `reindexContext()`.
- Replace `previewMemoryRetrieval()` with `previewContextRetrieval()`.
- Clear stale errors on prompt change.
- Show coverage by source type using `status.bySourceType`.
- Render selected chunks with path, line range, source type, score, and reason.

Use visible copy:

```text
Context Index indexes local source/docs into a SQLite FTS5 baseline. Durable memories remain separate and are shown in Memory.
```

Do not show:

```text
embedding
cosine
vector
reranker
```

Step 3: **Run web checks**

```bash
pnpm --filter @signal-recycler/web type-check
pnpm --filter @signal-recycler/web test -- ContextIndexView
```

Expected: type-check passes. If no component test exists, add a presenter helper test for source-type coverage formatting before committing.

Step 4: **Commit**

```bash
git add apps/web/src/api.ts apps/web/src/views/ContextIndexView.tsx apps/web/src/lib apps/web/src/views
git commit -m "feat: show indexed context retrieval"
```

## Task 8: QMD Evaluation Note

**Files:**

- Create: `docs/research/qmd-context-index-evaluation.md`
- Modify: `docs/pr-notes/phase-5-context-index-follow-up-backlog.md`

Step 1: **Record QMD state**

Run:

```bash
qmd status
qmd collection show docs
qmd collection show agents
qmd search "Phase 5 Context Index Signal Recycler" -c agents -n 5
qmd search "Phase 5 Context Index Signal Recycler" -c docs -n 5
```

Step 2: **Write evaluation note**

Create `docs/research/qmd-context-index-evaluation.md` with:

```md
# QMD Context Index Evaluation

## Decision

Phase 5 starts with Signal Recycler-owned SQLite FTS5/BM25 source indexing. QMD remains an optional integration candidate, not a runtime dependency.

## Evidence

- `qmd status` reports the local index path and embedding state.
- `qmd://agents` has indexed markdown and can be searched with `qmd search`.
- `qmd://docs` is configured to `/Users/vivek/Documents/wiki/docs`, but it has no indexed files in the current environment.
- `qmd query` may invoke local generation/reranking and can fail or run slowly on CPU-only machines.

## Product Implication

Signal Recycler needs a predictable local baseline for repo context indexing. QMD can still be valuable as an optional adapter or import source after collection health and CLI behavior are predictable.

## Next Evaluation

After Phase 5 SQLite indexing lands, compare:

- Signal Recycler SQLite FTS recall@k and precision@k.
- QMD `search` recall@k and precision@k over the same fixture material.
- QMD `query --no-rerank` behavior if query expansion is unstable.
```

Step 3: **Commit**

```bash
git add docs/research/qmd-context-index-evaluation.md docs/pr-notes/phase-5-context-index-follow-up-backlog.md
git commit -m "docs: evaluate qmd for context indexing"
```

## Task 9: Documentation And PR Notes

**Files:**

- Modify: `README.md`
- Modify: `docs/validation-roadmap.md`
- Create: `docs/pr-notes/phase-5-context-index-review-guide.md`
- Create: `docs/pr-notes/phase-5-context-index-follow-up-backlog.md`

Step 1: **Add README section after Memory APIs**

Add:

```md
### Context Index APIs

Phase 5 adds local repository context indexing. Source/doc chunks are separate from durable memories.

- `GET /api/context-index/status`: show indexed file/chunk coverage by source type.
- `POST /api/context-index/reindex`: explicitly rescan the configured workdir.
- `POST /api/context-index/retrieve`: preview source/doc chunks selected for a prompt.

The initial implementation uses SQLite FTS5/BM25. It does not use vector search, embeddings, cosine scoring, reranking, or JIT rehydration.
```

Step 2: **Update roadmap status**

Under Phase 5 in `docs/validation-roadmap.md`, add:

```md
Current status: implementation started. The first Phase 5 slice adds SQLite FTS5/BM25 source/doc chunk indexing with provenance, context retrieval preview, and deterministic recall/precision evals. QMD remains an optional integration candidate.
```

Step 3: **Create review guide**

Create `docs/pr-notes/phase-5-context-index-review-guide.md`:

```md
# Phase 5 Context Index Review Guide

## Scope Summary

This PR starts Phase 5 by adding a local source/doc context index. It keeps source/doc chunks separate from durable memory records and uses SQLite FTS5/BM25 as the deterministic baseline.

## Change Map

- Shared schemas: context source types, chunks, status, and retrieval responses.
- API services: context index store, scanner, retrieval service.
- API routes: status, reindex, retrieve.
- Evals: recall@k and precision@k over fixture repo chunks.
- Web: Context Index now shows real indexed coverage and source-context retrieval.
- Research: QMD evaluated as optional, not required.

## Reviewer Focus Areas

- Confirm source/doc chunks are not stored as durable memories.
- Confirm `store.ts` does not absorb context-index persistence.
- Confirm indexing is explicit, not automatic at server startup.
- Confirm ignored folders and large/binary files are skipped.
- Confirm every retrieved chunk includes path, line range, hash, and source type.
- Confirm UI avoids vector/cosine/reranker claims.

## Known Non-Blockers And Expected Warnings

- QMD collection health is documented but not required for runtime behavior.
- Chunking is line-based, not AST/symbol-aware.
- Rehydration is not implemented in this phase.

## Verification Commands And Results

- `pnpm test`
  - Record the observed implementation-branch result before PR review.
- `pnpm type-check`
  - Record the observed implementation-branch result before PR review.
- `pnpm build`
  - Record the observed implementation-branch result before PR review.
- `pnpm eval`
  - Record the observed implementation-branch result before PR review.
- `git diff --check`
  - Record the observed implementation-branch result before PR review.

## Explicit Out Of Scope

- Vector retrieval.
- Hybrid retrieval.
- Reranking.
- JIT rehydration.
- Cloud sync.
- Compare/replay execution.
```

Step 4: **Create follow-up backlog**

Create `docs/pr-notes/phase-5-context-index-follow-up-backlog.md`:

```md
# Phase 5 Context Index Follow-Up Backlog

## P1: AST-Aware Chunking

Residual risk: initial chunking is line-based, so code chunks can split symbols or include unrelated functions.

Next action: evaluate TypeScript AST chunking or tree-sitter after recall/precision baselines exist.

## P1: QMD Optional Adapter

Residual risk: QMD has strong retrieval features, but current collection health and local query behavior are environment-sensitive.

Next action: compare QMD `search` and Signal Recycler SQLite FTS over the same fixture cases after Phase 5 baseline lands.

## P1: Context Envelope Source Injection

Residual risk: Phase 5 retrieval preview proves source/doc chunk selection, but owned-session context envelopes may still inject only durable memories.

Next action: add source-context injection to `buildContextEnvelope` after retrieval precision is measurable and UI provenance is visible.

## P2: Incremental Reindexing

Residual risk: explicit reindex replaces the project index and may be wasteful on large repos.

Next action: add file mtime/hash diffing and only re-chunk changed files.

## P2: File Ignore Configuration

Residual risk: built-in ignore rules may not match every repo.

Next action: add user-configurable include/exclude patterns after default rules are validated.

## P2: Startup Health Diagnostic For FTS5

Residual risk: SQLite builds without FTS5 will fail context indexing at runtime.

Next action: add a health field that reports FTS5 availability for memory and context indexes.
```

Step 5: **Run final verification**

```bash
pnpm test
pnpm type-check
pnpm build
pnpm eval
git diff --check
```

Expected: all commands pass.

Step 6: **Commit**

```bash
git add README.md docs/validation-roadmap.md docs/pr-notes/phase-5-context-index-review-guide.md docs/pr-notes/phase-5-context-index-follow-up-backlog.md
git commit -m "docs: document phase 5 context index"
```

## Self-Review

- Spec coverage: every Phase 5 success criterion maps to a task: schemas/store/scanner/routes cover provenance indexing; retrieval service and evals cover recall/precision; separate schemas and services keep source chunks distinct from durable memory; QMD evaluation note covers optional QMD assessment.
- Template scan: this plan avoids placeholder markers and fake metrics. The implementation PR guide must record observed verification results after commands run.
- Type consistency: public schema names use `ContextChunk`, `ContextIndexStatus`, `ContextRetrievalRequest`, and `ContextRetrievalResult` consistently across API, web, and eval tasks.
- Scope check: no vector retrieval, reranking, cloud sync, JIT rehydration, or compare/replay execution is included.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-14-phase-5-context-index.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
