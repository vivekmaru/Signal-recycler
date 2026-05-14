# Phase 5 Context Index Backend Baseline Review Guide

## Scope Summary

This PR implements the first Phase 5 backend slice: shared context-index schemas, a local SQLite FTS5/BM25 store, a deterministic workdir scanner/chunker, and a source-context retrieval service.

It does not expose API routes or update the dashboard yet. The goal is to make the data model and local retrieval baseline reviewable before wiring it into the product surface.

## Change Map

- `packages/shared/src/index.ts`
  - Adds context source type, chunk, index status, retrieval request, and retrieval result schemas/types.
- `apps/api/src/services/contextIndexStore.ts`
  - Adds a focused context-index SQLite store with `context_chunks` and `context_chunk_fts`.
  - Supports upsert, full project replacement, status, lexical search, chunk id listing, stale same-path replacement, and zero-chunk path replacement.
- `apps/api/src/services/contextIndexScanner.ts`
  - Adds deterministic local file scanning, source classification, line-based chunking, metadata capture, hash generation, and binary/large-file skipping.
  - Preserves original chunk whitespace and line endings, and skips unreadable files or directories without aborting the scan.
- `apps/api/src/services/contextIndexRetrieval.ts`
  - Adds top-k lexical source-context retrieval with selected/skipped decisions and metrics.
- `apps/api/src/services/*contextIndex*.test.ts`
  - Covers store, scanner, and retrieval behavior.
- `fixtures/context-index-repo/`
  - Adds a small repo fixture for scanner and later eval/API tests.

## Reviewer Focus Areas

- Confirm source/doc chunks remain separate from durable memories.
- Confirm context-index persistence stays out of `apps/api/src/store.ts`.
- Confirm same-project same-path re-indexing removes stale FTS rows.
- Confirm project isolation applies to search and listing.
- Confirm scanner excludes dependency/build/runtime folders and skips large/binary files.
- Confirm retrieval reports selected and skipped chunk decisions without memory fields.
- Confirm this PR does not claim API routes, dashboard integration, source injection, vectors, QMD runtime dependency, or rehydration.

## Known Non-Blockers And Expected Warnings

- Chunking is line-based, not AST-aware.
- Retrieval is lexical FTS/BM25 only.
- `POST /api/context-index/reindex` and dashboard Context Index UI wiring are deferred to the next PR.
- QMD remains an optional evaluation path and is not used by this runtime baseline.
- The ignored fixture file under `fixtures/context-index-repo/node_modules/` is intentionally not tracked; tests create ignored-directory coverage dynamically too.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/shared type-check`
  - Passed.
- `pnpm --filter @signal-recycler/api exec vitest run src/services/contextIndexStore.test.ts src/services/contextIndexScanner.test.ts src/services/contextIndexRetrieval.test.ts`
  - Passed: 3 test files, 23 tests.
- `pnpm --filter @signal-recycler/api type-check`
  - Passed.

## Explicit Out Of Scope

- API routes.
- Web UI changes.
- Eval runner integration.
- Source context injection into owned sessions.
- Vector retrieval, reranking, and hybrid retrieval.
- JIT rehydration.
- Cloud sync.
