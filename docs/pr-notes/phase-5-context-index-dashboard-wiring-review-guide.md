# Phase 5 Context Index Dashboard Wiring Review Guide

## Scope Summary

This PR wires the dashboard Context Index view to the implemented Phase 5 context-index API routes:

- `GET /api/context-index/status`
- `POST /api/context-index/reindex`
- `POST /api/context-index/retrieve`

The UI now shows real source/doc index coverage, can trigger a local reindex, and previews ranked indexed chunks for a prompt. It keeps Phase 5 boundaries explicit: indexed source/doc chunks are separate from durable memory and are not yet injected into owned-session context envelopes.

## Change Map

### Web API Client

- Adds context-index client helpers in `apps/web/src/api.ts`.
- Keeps existing memory retrieval helpers unchanged.

### Context Index Presentation

- Adds `apps/web/src/lib/contextIndexPresenters.ts` for formatting:
  - status metric tiles,
  - source-type coverage rows,
  - retrieval preview rows,
  - source-type labels.
- Adds focused presenter tests in `apps/web/src/lib/contextIndexPresenters.test.ts`.

### Dashboard UI

- Replaces the old memory-only Context Index placeholder in `apps/web/src/views/ContextIndexView.tsx`.
- Adds loading, empty, indexed, reindex error, retrieval error, and result states.
- Adds source-type filters for retrieval preview requests.
- Shows path, line range, source type, hash prefix, rank, score, and retrieval reason for selected chunks.

### App Shell

- Adds horizontal overflow handling to the shell main region so dense dashboard surfaces remain readable on narrow viewports.

## Reviewer Focus Areas

- Confirm the Context Index page no longer calls memory retrieval endpoints.
- Confirm the page wording does not claim source chunks are injected into agent sessions yet.
- Check that failed status, failed reindex, empty index, and no-match preview states are understandable.
- Check source-type filters send the selected filter set to `/api/context-index/retrieve`.
- Check the app shell overflow change does not regress existing dashboard, session, or memory pages.

## Known Non-Blockers

- Context retrieval is still lexical/BM25-backed by the backend implementation; no vector or hybrid retrieval is claimed here.
- Retrieved source/doc chunks are inspectable in the dashboard only. Injection into owned-session context envelopes remains out of scope.
- Narrow viewports use horizontal scrolling for dense dashboard surfaces instead of a full mobile navigation redesign.

## Verification

- `pnpm --filter @signal-recycler/web test -- src/lib/contextIndexPresenters.test.ts`
  - Result: passed, 8 files / 36 tests.
- `pnpm --filter @signal-recycler/web type-check`
  - Result: passed.
- `pnpm --filter @signal-recycler/web test`
  - Result: passed, 8 files / 36 tests.
- Browser QA at `http://127.0.0.1:5173/context-index`
  - Page identity: `Signal Recycler`, `/context-index`.
  - Empty state: status loaded with zero chunks before reindex.
  - Reindex interaction: populated 201 files, 564 chunks, 6 source types.
  - Retrieval interaction: prompt preview returned ranked chunks with path, line range, hash prefix, score, and reason.
  - Source filter interaction: `Tests` filter narrowed retrieval to test chunks.
  - Console health: no relevant browser errors or warnings during checks.
  - Narrow viewport smoke: Context Index surface remained accessible with horizontal overflow for dense content.

- `pnpm test`
  - Result: passed, CLI 32 tests, API 176 tests, Web 36 tests.
- `pnpm type-check`
  - Result: passed across CLI, shared, API, and Web.
- `pnpm build`
  - Result: passed across CLI, shared, API, and Web.
- `git diff --check`
  - Result: passed.

## Explicit Out Of Scope

- Phase 6 context compression.
- Injecting indexed source/doc chunks into owned-session context envelopes.
- Vector embeddings or hybrid retrieval.
- Cloud sync.
- Full dashboard redesign or mobile navigation redesign.
