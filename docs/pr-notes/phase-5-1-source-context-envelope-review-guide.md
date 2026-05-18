# Phase 5.1 Source Context Envelope Review Guide

## Scope Summary

This PR connects the implemented Phase 5 context index to owned-session context envelopes.

Owned sessions already retrieved and injected approved durable memory. They now also retrieve relevant indexed source/doc chunks from the local context index, inject a bounded project-context block into `mock` and `codex_cli` adapter prompts, and record explicit audit events for selected, skipped, and injected source context.

This keeps the Phase 5 boundary intact: source/doc chunks remain separate from durable memory, use the existing SQLite FTS5/BM25 retrieval baseline, and do not start Phase 6 compression or Phase 7 rehydration.

## Change Map

### Shared Event Contract

- Adds `context_retrieval` and `context_injection` event categories in `packages/shared/src/index.ts`.

### Context Envelope Runtime

- Extends `apps/api/src/services/contextEnvelope.ts` to optionally receive a context index store.
- Retrieves top-k indexed chunks using the existing `retrieveContextChunks` implementation.
- Hydrates selected chunks for prompt injection.
- Injects a bounded `<signal-recycler-project-context>` block with source type, path, line range, hash, and chunk text.
- Escapes indexed chunk text and chunk metadata before rendering it inside Signal Recycler control tags.
- Emits:
  - `context_retrieval` with selected/skipped decisions and retrieval metrics.
  - `context_injection` with injected chunk ids and source provenance.
- Caps skipped chunk audit samples while preserving full skipped counts in retrieval metrics.

### Session Runtime

- Wires session-owned runs to the context index store in `apps/api/src/routes/sessions.ts`.
- Uses `contextIndexDbPath` when provided, otherwise falls back to the app `databasePath`, matching the existing context-index API route behavior.
- Shares one lazy context-index store instance between context-index routes and session routes, including the default in-memory app setup.
- Keeps context index storage lazy so app startup and non-indexed projects still work.
- Passes the context index store into `processTurn` only as optional envelope input.

### Dashboard Presentation

- Treats `context_retrieval` and `context_injection` as context activity in dashboard metrics.
- Groups source context events under timeline context operations.
- Shows source context events in the Session Detail Context Envelope tab.
- Renders selected/skipped context chunks and injected source metadata with chunk ids, source type, path, and line range.

### Tests

- Adds envelope unit coverage for source context retrieval, injection, and audit metadata.
- Adds API integration coverage for:
  - owned-session source context injection through `codex_cli`,
  - `databasePath` fallback for session context index lookup.
- Adds web presenter coverage for source context event grouping and dashboard context activity counts.

## Reviewer Focus Areas

- Confirm source/doc chunk decisions are audited separately from durable memory decisions.
- Confirm source/doc chunks are not stored as memory records and do not affect memory usage counters.
- Confirm the prompt block is bounded and clearly labeled as retrieved project context.
- Confirm session runtime uses the same context index database as the context-index routes.
- Confirm dashboard wording does not imply rehydration, vector retrieval, cloud sync, or automatic indexing.

## Known Non-Blockers

- The context block uses character truncation per chunk, not a tokenizer-backed budget.
- Source context injection depends on the existing index; this PR does not auto-index before a run.
- Staleness checks are limited to stored provenance. Live file freshness validation is tracked separately.
- Session Detail shows chunk metadata but does not yet deep-link directly to the chunk inspector.

## Verification

- `pnpm --filter @signal-recycler/api test -- contextEnvelope.test.ts`
  - Result: passed, 22 files / 196 tests.
- `pnpm --filter @signal-recycler/api test -- server.test.ts`
  - Result: passed, 22 files / 195 tests.
- `pnpm --filter @signal-recycler/web test -- eventPresenters.test.ts sessionPresenters.test.ts`
  - Result: passed, 8 files / 38 tests.
- `pnpm test`
  - Result: passed, CLI 32 tests, API 196 tests, Web 38 tests.
- `pnpm type-check`
  - Result: passed across CLI, shared, API, and Web.
- `pnpm build`
  - Result: passed across CLI, shared, API, and Web.
- `git diff --check`
  - Result: passed.

## Explicit Out Of Scope

- Phase 6 deterministic command-output compression.
- Phase 7 just-in-time rehydration.
- Vector, hybrid, or QMD-backed runtime retrieval.
- Automatic reindexing before session runs.
- Cloud sync.
- Full dashboard redesign.
