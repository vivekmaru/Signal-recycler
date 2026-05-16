# Phase 5 Context Index Chunk Inspector Plan

## Scope Anchor

Phase 5 is about source and documentation context indexing. This slice supports the Phase 5 success criteria that indexed chunks carry path, line range, hash, timestamp provenance, and that retrieval can be inspected. It stays out of Phase 6 compression and Phase 7 just-in-time rehydration.

## Goal

Add a Context Index chunk detail inspector so a reviewer can click a retrieved chunk and inspect its bounded text plus provenance.

## Implementation

1. Add store/API tests for project-scoped chunk detail reads.
2. Add a `ContextIndexStore.getChunk(projectId, chunkId)` method.
3. Add `GET /api/context-index/chunks/:chunkId` returning the full indexed chunk for the current project only.
4. Add web API and presenter support for chunk details.
5. Update `ContextIndexView` so retrieval preview rows are selectable and load a detail inspector with path, source type, line range, hash, indexed timestamp, size, and bounded content.
6. Add PR review guide and follow-up backlog under `docs/pr-notes/`.

## Verification

- Targeted RED/GREEN tests for store, API, and presenters.
- Full `pnpm test`, `pnpm type-check`, `pnpm build`, and `git diff --check`.
- Browser smoke of Context Index preview and chunk inspector when callable browser automation is available; otherwise use an API-backed running-app smoke and record the limitation in the review guide.
