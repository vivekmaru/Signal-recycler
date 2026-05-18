# Phase 5 Context Index Chunk Inspector Review Guide

## Scope Summary

Adds an inspectable bounded-content path for Context Index retrieval preview rows. A reviewer can retrieve source/doc chunks, select a row, and see the full indexed chunk text plus provenance fields.

This is Phase 5 work only. It does not inject source chunks into owned-session context envelopes, add compression, or implement just-in-time rehydration.

## Change Map

- `apps/api/src/services/contextIndexStore.ts`
  - Adds project-scoped `getChunk(projectId, chunkId)`.
- `apps/api/src/routes/contextIndex.ts`
  - Adds `GET /api/context-index/chunks/:chunkId`.
  - Returns `404` when the chunk is missing for the current project.
- `apps/web/src/api.ts`
  - Adds `fetchContextChunk`.
- `apps/web/src/lib/contextIndexPresenters.ts`
  - Adds chunk detail presenter fields for inspector rendering.
- `apps/web/src/views/ContextIndexView.tsx`
  - Makes retrieval preview rows selectable.
  - Loads and renders chunk text/provenance in an inspector panel.
- Tests
  - Store project isolation for chunk details.
  - API detail route and missing chunk behavior.
  - Presenter mapping for bounded chunk content.

## Reviewer Focus Areas

- Confirm chunk detail lookup remains project-scoped.
- Confirm the dashboard inspector does not present source chunks as durable memory.
- Confirm UI state clears selected chunk detail when preview inputs, source filters, or reindex state change.
- Confirm the API returns only indexed chunk content, not whole files.

## Known Non-Blockers And Expected Warnings

- Chunk detail timestamps are shown as stored ISO strings for deterministic auditability.
- The inspector is inline below the retrieval table rather than a full right-hand panel. That keeps this slice small and can evolve with the broader dashboard shell.
- Source chunks are still retrieval-preview only; session context-envelope integration remains separate Phase 5 work.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- src/services/contextIndexStore.test.ts` - passed.
- `pnpm --filter @signal-recycler/api test -- src/server.test.ts --runInBand` - passed.
- `pnpm --filter @signal-recycler/web test -- src/lib/contextIndexPresenters.test.ts` - passed.
- `pnpm --filter @signal-recycler/api type-check` - passed.
- `pnpm --filter @signal-recycler/web type-check` - passed.
- `pnpm test` - passed.
- `pnpm type-check` - passed.
- `pnpm build` - passed.
- `git diff --check` - passed.
- Running-app API smoke against `http://127.0.0.1:3001` - passed:
  - `POST /api/context-index/reindex` returned `573` chunks across `206` files.
  - `POST /api/context-index/retrieve` returned `5` selected chunks.
  - `GET /api/context-index/chunks/:chunkId` returned bounded chunk content and provenance for the selected chunk.

Browser automation note: the Browser plugin did not expose callable browser tools in this session, and Playwright was not installed in the available Node runtime. The frontend build and API-backed product smoke were used instead.

## Explicit Out Of Scope

- Context-envelope source chunk injection.
- Context Index eval suite.
- QMD-backed indexing decision.
- Compression summaries.
- Just-in-time artifact rehydration.
