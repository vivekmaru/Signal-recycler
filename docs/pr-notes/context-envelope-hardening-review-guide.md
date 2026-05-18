# Context Envelope Hardening Review Guide

## Scope Summary

This branch bundles the Phase 5.1 follow-ups for safer source-context injection:

- `idea-1-j96`: stale-index safeguards before injecting indexed source/doc chunks.
- `idea-1-ug2`: configurable source-context score and character budgets.
- `idea-1-d2u`: deep links from Session Detail source context records to the Context Index chunk inspector.

The slice keeps Phase 5 boundaries intact. Indexed source/doc chunks stay separate from durable memory and remain an owned-session context input, not memory records.

## Subsystem Change Map

### Context Envelope Runtime

- Passes the owned-session working directory into source context envelope construction.
- Filters retrieved chunks through score, freshness, and total character budget gates before prompt injection.
- Recomputes the live chunk hash from the current workdir file using the scanner hash contract.
- Skips stale or unavailable chunks with explicit audit reasons instead of injecting them.
- Adds configurable knobs for context limit, minimum score, per-chunk character limit, and total character limit.

### Shared Event Contract

- Extends skipped context reasons with `score_below_threshold`, `stale_index`, `source_unavailable`, and `budget_exceeded`.

### API Tests

- Adds regression tests for stale chunks, fresh chunks, low-score filtering, and total budget gating.
- Updates owned-session source context integration tests to use scanner-derived hashes against real temp workdir files.

### Dashboard Routing And Session Detail

- Adds `/context-index?chunk=<id>` parsing and route building.
- Lets Session Detail source context records open the Context Index chunk inspector.
- Lets Context Index load a chunk inspector directly from the route.
- Preserves keyboard-operable context event selection while keeping chunk links separate from the event card button.

### PR Review Follow-Up

- Applies the total context budget to the first selected chunk, not only subsequent chunks.
- Ensures a route-selected chunk opens once and does not override later manual chunk inspector selections.
- Restores context event card keyboard activation after the deep-link UI change.

## Reviewer Focus Areas

- Confirm stale chunks are not injected when live file content no longer matches the indexed hash.
- Confirm fresh chunks still inject when live file content matches the stored hash.
- Confirm skipped reasons are visible in context retrieval audit metadata.
- Confirm source-context budgets reduce injected chunks without changing durable-memory injection.
- Confirm Session Detail chunk links route to the existing chunk inspector rather than duplicating chunk UI.

## Known Non-Blockers And Expected Warnings

- The source context budget uses character counts, not tokenizer-backed token estimates.
- Freshness checks are live-file/hash based; they do not auto-reindex stale paths.
- If no working directory is available to the envelope builder, source chunks are treated as fresh because there is no practical live-file check.
- Chunk-inspector deep links fetch by indexed chunk id; stale chunks may still be inspectable even when skipped from injection.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- contextEnvelope.test.ts server.test.ts`
  - Result: passed, 22 files / 200 tests.
- `pnpm --filter @signal-recycler/api test -- contextEnvelope.test.ts`
  - Result: passed, 22 files / 201 tests.
- `pnpm --filter @signal-recycler/web test -- routes.test.ts`
  - Result: passed, 8 files / 40 tests.
- `pnpm --filter @signal-recycler/web type-check`
  - Result: passed.
- `pnpm test`
  - Result: passed, CLI 32 tests, API 201 tests, Web 40 tests.
- `pnpm type-check`
  - Result: passed across CLI, shared, API, and Web.
- `pnpm build`
  - Result: passed across CLI, shared, API, and Web.
- `git diff --check`
  - Result: passed.

## Explicit Out Of Scope

- Automatic reindexing before owned-session runs.
- Vector, hybrid, or QMD-backed runtime retrieval.
- Tokenizer-backed source context budgeting.
- Phase 6 command-output compression.
- Phase 7 just-in-time rehydration packets.
- Cloud sync.
