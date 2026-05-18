# Session Detail Live Events Review Guide

## Scope Summary

This branch addresses Beads `idea-1-dye`: Session Detail should update from `/api/sessions/:id/events` while owned-session runs are active instead of depending on complete post-run refreshes or the dashboard firehose.

The implementation keeps the slice polling-based and local-first. It does not replace the existing firehose, add websocket infrastructure, or change session event persistence.

## Subsystem-By-Subsystem Change Map

### Session Detail Data Flow

- Adds detail-route polling in `apps/web/src/App.tsx`.
- Polls `/api/sessions/:id/events` quickly while the selected session is running.
- Backs off to a slower idle interval while the selected session remains open.
- Keeps already-loaded events visible between polling ticks and avoids clearing the timeline on every refresh.
- Treats optimistic new-session runs as active when the new session is the selected detail session.

### Polling Policy

- Adds `apps/web/src/lib/sessionDetailPolling.ts` for the active/idle polling policy and run-active detection.
- Adds unit tests for no-session, active-run, idle, continued-run, and optimistic-new-session cases.
- Scopes continued-run activity to the same selected session so navigating to another detail page does not keep that page on active cadence.

### PR Review Follow-Up

- Preserves continue-run errors when polling cadence flips from active to idle.
- Keeps repeated event-fetch retry errors visible instead of re-entering loading state on every automatic retry.
- Adds explicit helper coverage for `selectedSessionId: null` while run flags are true.
- Associates continued-run errors with the source session before rendering them in Session Detail.

## Reviewer Focus Areas

- Confirm Session Detail now polls the detail events endpoint directly.
- Confirm active new sessions and continued sessions both receive fast polling.
- Confirm idle sessions back off instead of staying on active-run cadence forever.
- Confirm event lists do not visibly reset on every polling tick.
- Confirm this does not alter global dashboard firehose behavior.

## Known Non-Blockers And Expected Warnings

- This is polling, not SSE. The existing API has a short-lived SSE shape, but it does not yet stream future events.
- The idle poll interval is intentionally simple and fixed for this slice.
- Browser-level live-run testing may still depend on mock adapter timing because most local runs complete quickly.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/web test -- sessionDetailPolling.test.ts`
  - Result: passed, 9 files / 47 tests.
- `pnpm --filter @signal-recycler/web type-check`
  - Result: passed.
- `pnpm test`
  - Result: passed, CLI 32 tests, API 201 tests, Web 47 tests.
- `pnpm type-check`
  - Result: passed across CLI, shared, API, and Web.
- `pnpm build`
  - Result: passed across CLI, shared, API, and Web.
- `git diff --check`
  - Result: passed.
- Browser smoke with `SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev`
  - Result: passed. Created a new session through the dashboard and verified Session Detail rendered the new session timeline and context operations.

## Explicit Out-Of-Scope Items

- Long-lived SSE stream implementation.
- Websocket infrastructure.
- Session progress bars or run cancellation.
- Compare/replay execution.
- Session Detail memory audit integration.
