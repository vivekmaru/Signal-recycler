# Phase 5 Context Index API Routes Review Guide

## Scope Summary

This PR exposes the Phase 5 context-index backend baseline through API routes. It adds explicit status, reindex, and retrieval endpoints for local source/doc chunks while keeping durable memory retrieval separate.

It does not update the dashboard, add eval suites, or inject source chunks into owned-session context envelopes.

## Change Map

- `apps/api/src/routes/contextIndex.ts`
  - Adds `GET /api/context-index/status`.
  - Adds `POST /api/context-index/reindex`.
  - Adds `POST /api/context-index/retrieve`.
  - Owns a dedicated context-index store handle and closes it with the Fastify app.
- `apps/api/src/app.ts`
  - Registers context-index routes.
  - Adds `contextIndexDbPath` as an optional app option, defaulting to the app database path or in-memory storage.
- `apps/api/src/server.test.ts`
  - Covers empty status, explicit reindex, source-filtered retrieval, and malformed retrieval requests.

## Reviewer Focus Areas

- Confirm source/doc context chunks remain separate from durable memories.
- Confirm context indexing remains explicit via `POST /api/context-index/reindex` and does not auto-scan on server start.
- Confirm retrieval validates request shape and returns 400 for malformed prompts.
- Confirm the route uses the existing scanner, store, and retrieval services rather than duplicating retrieval logic.
- Confirm no UI, eval, vector retrieval, reranking, source injection, or QMD runtime dependency was added.

## Known Non-Blockers And Expected Warnings

- The Context Index web page is still a preview surface until a follow-up PR wires it to these routes.
- Retrieval is still SQLite FTS5/BM25 only.
- Reindex is full-project replacement, not incremental watching.
- The fixture query uses `sourceTypes: ["source"]` because unfiltered lexical retrieval may correctly rank docs first when docs point to the source file.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api exec vitest run src/server.test.ts`
  - Red before implementation: context-index routes returned 404.
  - Passed after implementation: 1 test file, 53 tests.
- `pnpm --filter @signal-recycler/api exec vitest run src/server.test.ts src/services/contextIndexStore.test.ts src/services/contextIndexScanner.test.ts src/services/contextIndexRetrieval.test.ts`
  - Passed: 4 test files, 76 tests.
- `pnpm --filter @signal-recycler/api type-check`
  - Passed.
- `pnpm --filter @signal-recycler/shared type-check`
  - Passed.
- `pnpm test`
  - Passed: CLI 5 files / 32 tests, API 20 files / 168 tests, Web 7 files / 32 tests, Shared no tests with `--passWithNoTests`.
- `pnpm type-check`
  - Passed across shared, CLI, API, and web packages.
- `pnpm build`
  - Passed across shared, CLI, API, and web packages.
- `git diff --check`
  - Passed.

## Explicit Out Of Scope

- Dashboard Context Index wiring.
- Context-index eval suite.
- Source context injection into owned sessions.
- Incremental file watching.
- Vector retrieval, reranking, hybrid retrieval, and embeddings.
- QMD as a runtime dependency.
- Cloud sync.
