# Phase 4.5 Task 6 Session Detail Review Guide

## Scope Summary

Task 6 replaces the session placeholder with a real Session Detail view backed by complete per-session events from `/api/sessions/:id/events`. Dashboard and Sessions still use capped firehose summaries; only Session Detail treats the per-session endpoint as authoritative for detailed audit inspection.

## Subsystem Change Map

- `apps/web/src/App.tsx`: fetches complete selected-session events with `listEvents(sessionId)`, tracks loading/error/retry state, and passes only that result into Session Detail.
- `apps/web/src/views/SessionDetailView.tsx`: renders session header, summary tiles, accessible tabs, complete timeline, context-envelope preview, deduped candidate list, disabled preview actions, and honest full-event loading/error states.
- `apps/web/src/components/Timeline.tsx`: renders grouped presenter-driven event sections with selectable rows.
- `apps/web/src/components/InspectorPanel.tsx`: renders session, event, memory, and empty inspector states without claiming unsupported audit/replay data.
- `apps/web/src/lib/eventPresenters.ts`: adds candidate grouping by `metadata.ruleId`, falling back to event id.
- `apps/web/src/lib/eventPresenters.test.ts`: covers candidate deduplication for `rule_candidate` plus `rule_auto_approved`.

## Reviewer Focus Areas

- Confirm Session Detail never uses capped firehose rows as complete history.
- Confirm loading and error states are explicit when complete session events are unavailable.
- Confirm candidates tab count and list are deduped by durable `ruleId`.
- Confirm unsupported Compare, Replay, Abort, memory audit, and diff surfaces remain disabled or preview-only.
- Confirm tab semantics are usable and do not disturb dense layout.

## Known Non-Blockers And Expected Warnings

- Session Detail refetches full events on selected-session changes, retry, and selected firehose count changes; it is not a streaming event subscription.
- Memory usage audit details remain deferred to the memory review task.
- No browser screenshot smoke was run for this backend/data-flow fix.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/web test -- apps/web/src/lib/eventPresenters.test.ts`: passed, 3 files and 9 tests.
- `pnpm --filter @signal-recycler/web type-check`: passed.
- `pnpm --filter @signal-recycler/web build`: passed.

## Explicit Out-Of-Scope Items

- Full source/repo indexing.
- Vector retrieval, embeddings, reranking UI, or context-index execution.
- Real Compare, Replay, Abort, or diff execution.
- Full memory audit inspector in Session Detail.
