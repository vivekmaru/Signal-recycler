# Session Detail Live Events Review Guide

## Scope Summary

This branch addresses Beads `idea-1-dye` and follow-up `idea-1-ae8`: Session Detail should update from `/api/sessions/:id/events` while owned-session runs are active instead of depending on complete post-run refreshes or the dashboard firehose.

The implementation keeps the path local-first, upgrades the detail events endpoint to true SSE for live clients, and preserves polling as the browser fallback. It does not replace the existing firehose, add websocket infrastructure, or change session event persistence.

## Subsystem-By-Subsystem Change Map

### Session Detail Data Flow

- Adds detail-route event streaming in `apps/web/src/App.tsx` using `EventSource`.
- Falls back to the existing polling loop when `EventSource` is unavailable or the stream errors.
- Polls `/api/sessions/:id/events` quickly while the selected session is running during fallback mode.
- Backs off to a slower idle interval while the selected session remains open during fallback mode.
- Keeps already-loaded events visible between polling ticks and avoids clearing the timeline on every refresh.
- Treats optimistic new-session runs as active when the new session is the selected detail session.

### Session Events SSE

- Adds in-process session event subscriptions in `apps/api/src/store.ts`.
- Keeps `GET /api/sessions/:id/events` SSE responses open until client disconnect.
- Streams the initial event snapshot and future `createEvent(...)` calls for the selected session.
- Subscribes before loading the snapshot and deduplicates written event ids so events are not missed during stream setup.

### Polling Policy

- Adds `apps/web/src/lib/sessionDetailPolling.ts` for the active/idle polling policy and run-active detection.
- Adds unit tests for no-session, active-run, idle, continued-run, and optimistic-new-session cases.
- Scopes continued-run activity to the same selected session so navigating to another detail page does not keep that page on active cadence.
- Adds stream-vs-poll mode coverage so polling remains an explicit fallback.

### PR Review Follow-Up

- Preserves continue-run errors when polling cadence flips from active to idle.
- Keeps repeated event-fetch retry errors visible instead of re-entering loading state on every automatic retry.
- Adds explicit helper coverage for `selectedSessionId: null` while run flags are true.
- Associates continued-run errors with the source session before rendering them in Session Detail.
- Preserves the in-flight continued-run owner while navigating between detail pages.
- Keeps populated timelines visible through transient background poll failures.
- Treats selected optimistic new-session runs as active even when another continued run is also in flight.
- Tracks successful detail event loads by selected session id instead of event count, so previous-session events cannot mask first-load failures and empty sessions remain successfully loaded.

## Reviewer Focus Areas

- Confirm Session Detail now polls the detail events endpoint directly.
- Confirm Session Detail prefers the SSE stream when available.
- Confirm stream failures or missing `EventSource` fall back to polling.
- Confirm active new sessions and continued sessions both receive fast polling.
- Confirm idle sessions back off instead of staying on active-run cadence forever.
- Confirm event lists do not visibly reset on every polling tick.
- Confirm this does not alter global dashboard firehose behavior.

## Known Non-Blockers And Expected Warnings

- The idle poll interval is intentionally simple and fixed for this slice.
- The SSE broadcaster is in-process and covers events written through this API store instance; external database writes are still picked up by polling fallback, not pushed through this stream.
- Automated browser-level live-run regression coverage remains deferred; local browser smoke covered the rendered path for this slice.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- server.test.ts --runInBand`
  - Result: passed, 22 files / 204 tests. Includes SSE future-event delivery regression.
- `pnpm --filter @signal-recycler/web test -- sessionDetailPolling.test.ts`
  - Result: passed, 9 files / 51 tests. Includes stream preference and polling fallback mode coverage.
- `pnpm --filter @signal-recycler/api type-check`
  - Result: passed.
- `pnpm --filter @signal-recycler/web type-check`
  - Result: passed.
- `pnpm test`
  - Result: passed, CLI 32 tests, API 204 tests, Web 51 tests.
- `pnpm type-check`
  - Result: passed across CLI, shared, API, and Web.
- `pnpm build`
  - Result: passed across CLI, shared, API, and Web.
- `git diff --check`
  - Result: passed.
- Browser smoke with this worktree's API on `PORT=3002` and built web bundle on `127.0.0.1:5175`
  - Result: passed. Opened an empty Session Detail page, triggered a mock run through the API, and verified the `User prompt` timeline event rendered without a page reload.

## Explicit Out-Of-Scope Items

- Websocket infrastructure.
- Cross-process SQLite change notification for events written outside this store instance.
- Session progress bars or run cancellation.
- Compare/replay execution.
- Session Detail memory audit integration.
