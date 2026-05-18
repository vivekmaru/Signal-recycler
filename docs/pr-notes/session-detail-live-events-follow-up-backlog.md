# Session Detail Live Events Follow-Up Backlog

## Scope Anchor

This branch implements a polling-backed Session Detail live event path for Beads `idea-1-dye`. It is meant to make owned-session runs observable while they are in progress without introducing a broader realtime transport.

## Completed In This Slice

Beads:

- `idea-1-dye`: Session Detail has direct detail-route event polling with active and idle cadences.
- `idea-1-y7s`: PR #31 review comments addressed for run-error visibility, continued-run scoping, retry loading state, and null-selected active-run coverage.
- `idea-1-el4`: Second PR #31 review pass addressed run-owner preservation across navigation, populated-timeline resilience during transient poll failures, and overlapping run-active detection.
- `idea-1-d5f`: Third PR #31 review pass addressed selected-session load-state tracking and empty-session background error handling.

## P1: Replace Short-Lived SSE With True Event Streaming

Residual risk: `/api/sessions/:id/events` currently supports `text/event-stream`, but it writes current events and ends. That is not a live stream.

Concrete next action: add a store/event broadcaster or polling-to-SSE bridge so SSE clients receive future events until disconnect.

## P2: Make Polling Cadence Configurable Or Adaptive

Residual risk: active and idle intervals are fixed constants.

Concrete next action: expose interval policy through a small config object or derive a backoff sequence after consecutive unchanged event responses.

## P2: Add Browser-Level Live-Run Regression Coverage

Residual risk: pure tests cover polling policy, but browser-level verification for an actually running session depends on run duration.

Concrete next action: add a test-only delayed mock adapter path or Playwright smoke that proves Session Detail changes while `/run` is still pending.
