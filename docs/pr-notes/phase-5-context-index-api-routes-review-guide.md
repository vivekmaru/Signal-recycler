# Phase 5 Context Index API Routes Review Guide

## Scope Summary

This PR exposes the Phase 5 context-index backend baseline through API routes. It adds explicit status, reindex, and retrieval endpoints for local source/doc chunks while keeping durable memory retrieval separate.

It does not update the dashboard, add eval suites, or inject source chunks into owned-session context envelopes.

## Change Map

- `apps/api/src/routes/contextIndex.ts`
  - Adds `GET /api/context-index/status`.
  - Adds `POST /api/context-index/reindex`.
  - Adds `POST /api/context-index/retrieve`.
  - Lazily owns a dedicated context-index store handle and closes it with the Fastify app.
  - Returns a route-level `503` when context-index storage is unavailable instead of failing app startup, and retries store initialization on later requests.
  - Normalizes unknown store initialization failures before returning unavailable responses.
  - Preserves an existing index when a reindex scan has file or directory read errors.
  - Allows a clean empty workdir scan to clear the project index.
- `apps/api/src/services/contextIndexStore.ts`
  - Closes the SQLite handle if schema setup fails during store creation.
- `apps/api/src/app.ts`
  - Registers context-index routes.
  - Adds `contextIndexDbPath` as an optional app option, defaulting to the app database path or in-memory storage.
- `apps/api/src/server.test.ts`
  - Covers empty status, explicit reindex, source-filtered retrieval, malformed retrieval requests, store retry, non-Error initialization failures, valid empty workdirs, and partial scan failure preservation.
- `apps/api/src/services/contextIndexStore.lifecycle.test.ts`
  - Covers failed schema setup cleanup for the SQLite handle.
- `apps/api/src/services/contextIndexScanner.ts`
  - Reports scanner read errors separately from clean skips such as large, binary, excluded, or non-indexable files.

## Reviewer Focus Areas

- Confirm source/doc context chunks remain separate from durable memories.
- Confirm context indexing remains explicit via `POST /api/context-index/reindex` and does not auto-scan on server start.
- Confirm context-index store creation is lazy so missing FTS5 support does not break non-context-index API startup.
- Confirm transient context-index store creation failures can recover on a later request.
- Confirm failed store initialization returns useful unavailable responses even if the thrown value is not an `Error`.
- Confirm failed schema setup closes the opened SQLite handle before retrying later.
- Confirm a failed scan does not wipe previously indexed source context.
- Confirm a valid empty workdir scan clears the project index.
- Confirm scanner error reporting distinguishes unreadable files/directories from clean skipped files.
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
  - Red during review hardening: lazy store and failed-scan preservation regressions failed.
  - Passed after latest store-initialization hardening: 1 test file, 58 tests.
- `pnpm --filter @signal-recycler/api exec vitest run src/server.test.ts src/services/contextIndexStore.lifecycle.test.ts src/services/contextIndexStore.test.ts`
  - Passed after latest store-initialization hardening: 3 test files, 68 tests.
- `pnpm --filter @signal-recycler/api exec vitest run src/server.test.ts src/services/contextIndexScanner.test.ts`
  - Passed after latest review hardening: 2 test files, 69 tests.
- `pnpm --filter @signal-recycler/api exec vitest run src/server.test.ts src/services/contextIndexStore.lifecycle.test.ts src/services/contextIndexStore.test.ts src/services/contextIndexScanner.test.ts src/services/contextIndexRetrieval.test.ts`
  - Passed after latest store-initialization hardening: 5 test files, 84 tests.
- `pnpm --filter @signal-recycler/api exec vitest run src/server.test.ts src/services/contextIndexStore.test.ts src/services/contextIndexScanner.test.ts src/services/contextIndexRetrieval.test.ts`
  - Passed after latest review hardening: 4 test files, 81 tests.
- `pnpm --filter @signal-recycler/api type-check`
  - Passed.
- `pnpm --filter @signal-recycler/shared type-check`
  - Passed.
- `pnpm test`
  - Passed: CLI 5 files / 32 tests, API 21 files / 176 tests, Web 7 files / 32 tests, Shared no tests with `--passWithNoTests`.
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
