# Phase 4.5 Dashboard Session Continuation Review Guide

## Scope Summary

This PR keeps Phase 4.5 focused on owned-session UX. It adds a continuation surface to Session Detail so a user can run another prompt through the current Signal Recycler session and inspect memory retrieval before submission.

The scope anchor is Phase 4.5: dashboard-owned sessions should become a primary way to run and inspect memory-managed sessions. This PR does not begin Phase 5 source/context indexing.

## Change Map

### Web App

- Adds a Session Detail "Continue session" panel.
- Runs follow-up prompts through the existing `POST /api/sessions/:id/run` path.
- Keeps users on the same session detail route after a run.
- Shows run errors locally in Session Detail.
- Reuses the same adapter option filtering for New Session and Continue Session.

### Memory Retrieval Preview

- Adds a memory-only preview before running a continuation prompt.
- Calls the existing `/api/memory/retrieve` endpoint.
- Shows selected, skipped, approved, and limit counts.
- Shows selected memory IDs, category, memory type, rank, score, and reason.
- Shows skipped memory IDs and skip reasons.
- Labels the preview as implemented memory retrieval only.

### Presenter Layer

- Adds `sessionRunPresenters` for adapter filtering and memory preview row formatting.
- Adds tests for adapter filtering and selected/skipped memory preview summaries.

## Reviewer Focus Areas

- Confirm the Session Detail continuation flow does not create a new Signal Recycler session.
- Confirm the adapter selected in the continuation panel is passed to the run API.
- Confirm memory preview language does not imply source chunks or Phase 5 indexing exists.
- Confirm New Session still uses the same adapter options as before.
- Confirm failed runs surface errors without clearing the prompt.
- Confirm stale preview failures do not render after the user edits or clears the prompt.
- Confirm preview errors are cleared as soon as the prompt changes after a failed preview request.

## Known Non-Blockers And Expected Warnings

- The preview is memory-only; source chunks, embeddings, reranking, and rehydrated artifacts are out of scope.
- The UI refreshes events after the run completes. It does not add live streaming for the continuation panel in this PR.
- Adapter availability still comes from existing API config.
- Compare, replay, and abort remain disabled placeholders.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/web test -- --runInBand`
  - Baseline before edits: 6 files passed, 29 tests passed.
- `pnpm --filter @signal-recycler/web test -- sessionRunPresenters.test.ts`
  - Red: failed because `sessionRunPresenters` did not exist.
  - Green: 7 files passed, 32 tests passed.
- `pnpm --filter @signal-recycler/web type-check`
  - Passed after implementation.
- `pnpm test`
  - Passed: CLI 5 files / 32 tests, web 7 files / 32 tests, API 17 files / 143 tests.
- `pnpm type-check`
  - Passed for shared, CLI, API, and web workspaces.
- `pnpm build`
  - Passed for shared, CLI, API, and web workspaces.
- `git diff --check`
  - Passed.
- Browser smoke with `SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev`
  - Opened Session Detail.
  - Confirmed the Continue Session panel rendered.
  - Previewed `Run package manager validation for this repo.` and saw `Selected 1`.
  - Ran the prompt with the mock adapter and confirmed the browser stayed on the same `/sessions/:sessionId` URL.
- Review follow-up checks:
  - `pnpm --filter @signal-recycler/web test -- sessionRunPresenters.test.ts` passed.
  - `pnpm --filter @signal-recycler/web type-check` passed.
  - `git diff --check` passed.

The dev server was stopped after smoke verification.

## Explicit Out Of Scope

- Phase 5 source/context indexing.
- Vector retrieval, embeddings, cosine scores, or reranking.
- Claude-owned session adapter work.
- Replay/compare eval UX.
- File diff rendering.
- Running-session abort support.
