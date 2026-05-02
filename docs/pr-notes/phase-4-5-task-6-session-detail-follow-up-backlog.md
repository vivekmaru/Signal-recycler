# Phase 4.5 Task 6 Session Detail Follow-Up Backlog

## P1: Live Session Detail Refresh

Residual risk: Session Detail refetches complete events on route selection, retry, and selected firehose count changes, but it is not subscribed to complete event streams.

Next action: add a detail-route polling or event-stream strategy that always calls `listEvents(sessionId)` as the source of truth and backs off when a session is no longer active.

## P1: Memory Audit Inspector Integration

Residual risk: Session Detail can inspect a candidate's durable memory record when loaded, but usage/audit history is still intentionally deferred.

Next action: when the Memory View audit inspector lands, reuse its audit data model for memory selections opened from Session Detail.

## P2: Browser Layout Smoke

Residual risk: Type-check and build pass, but the dense two-column detail layout was not verified with a browser screenshot in this fix pass.

Next action: run a desktop and narrow-viewport browser smoke once a dev server is active, focusing on tab overflow, inspector width, and empty/error states.

## P2: Candidate Lifecycle Labels

Deferred cleanup: Grouped candidate cards show lifecycle event badges but do not yet compact repeated lifecycle metadata into a table.

Next action: add a small lifecycle row inside each candidate group if reviewers find multiple badges hard to scan.
