# Session Detail Live Events Follow-Up Backlog

## Scope Anchor

This branch implements a Session Detail live event path for Beads `idea-1-dye` and follow-up `idea-1-ae8`. It is meant to make owned-session runs observable while they are in progress without introducing websocket infrastructure or cross-process event watching.

## Completed In This Slice

Beads:

- `idea-1-dye`: Session Detail has direct detail-route event polling with active and idle cadences.
- `idea-1-y7s`: PR #31 review comments addressed for run-error visibility, continued-run scoping, retry loading state, and null-selected active-run coverage.
- `idea-1-el4`: Second PR #31 review pass addressed run-owner preservation across navigation, populated-timeline resilience during transient poll failures, and overlapping run-active detection.
- `idea-1-d5f`: Third PR #31 review pass addressed selected-session load-state tracking and empty-session background error handling.
- `idea-1-ae8`: `/api/sessions/:id/events` now keeps `text/event-stream` clients open, streams future events from in-process store subscriptions, and the web Session Detail path prefers SSE while retaining polling fallback.

## Completed P1: Replace Short-Lived SSE With True Event Streaming

Result: `/api/sessions/:id/events` no longer ends SSE responses after the initial snapshot. It subscribes to future events for the session until the client disconnects.

Verification: `pnpm --filter @signal-recycler/api test -- server.test.ts --runInBand` covers initial snapshot plus future-event delivery, and browser smoke confirmed Session Detail rendered a mock run event without a page reload.

Residual risk: the broadcaster is in-process. Events written by another process directly into SQLite are not pushed through existing SSE connections.

Concrete next action: leave cross-process event notification out of this slice unless Signal Recycler later supports multiple writer processes for the same project database.

## P2: Make Polling Cadence Configurable Or Adaptive

Residual risk: active and idle intervals are fixed constants.

Concrete next action: expose interval policy through a small config object or derive a backoff sequence after consecutive unchanged event responses.

## P2: Add Browser-Level Live-Run Regression Coverage

Residual risk: pure tests cover polling policy and API-level SSE delivery, but browser-level live-run regression coverage is still manual.

Concrete next action: add a test-only delayed mock adapter path or Playwright smoke that proves Session Detail changes while `/run` is still pending.
