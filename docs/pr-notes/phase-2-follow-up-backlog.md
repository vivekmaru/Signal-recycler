# Phase 2 Follow-Up Backlog

This backlog captures residual risks and cleanup discovered while implementing Phase 2. These items should not block the Phase 2 PR unless a reviewer finds a concrete correctness bug.

## P1: Rename Rule Compatibility Surfaces To Memory APIs Internally

Current state:

- The database table is still `rules`.
- Store methods are still named `createRuleCandidate`, `approveRule`, `rejectRule`, and `listApprovedRules`.
- `/api/rules` remains as a compatibility route.

Why it matters:

- The compatibility naming is intentional for Phase 2, but it creates mental overhead as the product becomes a general memory service.

Next action:

- In a separate cleanup PR, introduce memory-named store methods as wrappers or replacements.
- Keep `/api/rules` as a legacy adapter until callers move to `/api/memories`.

## P1: Add Retrieval Readiness Checks Before Phase 3

Current state:

- Phase 2 records scope, type, source, confidence, usage, and supersession.
- Injection still uses approved memories, not ranked retrieval.

Why it matters:

- Phase 3 should not add FTS5/BM25 until the product can prove stale/superseded memories are excluded and provenance remains visible.

Next action:

- Add a Phase 3 planning check for:
  - approved non-superseded memory corpus size,
  - scope fields populated enough for retrieval,
  - stale-memory fixtures,
  - retrieval precision/recall eval targets.

## P1: Improve Audit Failure Handling In Proxy Responses

Current state:

- Proxy records memory audit after upstream `fetch` resolves.
- If local audit persistence fails after upstream response is available, the request can still fail before returning the upstream response.

Why it matters:

- Audit durability is important, but a local audit write failure should probably not break a successful agent call in normal mode.

Next action:

- Decide whether audit write failure should:
  - fail closed in debug/strict mode,
  - fail open in normal mode with an error event,
  - or queue a retry.

## P2: Add Dedicated Store Transaction Helper

Current state:

- Store methods use local `BEGIN` / `COMMIT` / `ROLLBACK` blocks.
- `recordMemoryInjectionEvent` now makes injection event plus usage rows atomic, but transaction handling is still hand-rolled.

Why it matters:

- More memory operations will need multi-row atomicity in Phase 3 and Phase 4.

Next action:

- Add a small internal transaction helper in `store.ts`.
- Refactor existing transaction blocks to use it.
- Add rollback tests for a forced mid-transaction failure.

## P2: Expose Compatibility Block Preview In Dashboard

Current state:

- `memorySync.ts` can render and parse Signal Recycler blocks for `AGENTS.md` and `CLAUDE.md`.
- No dashboard preview exists yet.

Why it matters:

- Users should see exactly what would be exported before writing compatibility files.

Next action:

- Add a read-only preview surface in the future Sync view.
- Keep actual file writes explicit and user-triggered.

## P2: Add Route-Level Isolation Evals

Current state:

- Tests cover project isolation for sessions, firehose, session events, audit route, and approve/reject.
- Existing isolation eval focuses mostly on store/list behavior.

Why it matters:

- Project isolation is now a product-level guarantee because memory injection events contain provenance and rule text.

Next action:

- Add an eval suite that exercises API route isolation with two projects and verifies no cross-project sessions, events, memories, or usages leak.

## P2: Decide How To Represent Already-Imported Compatibility Memories

Current state:

- `POST /api/memories/synced` records imported compatibility memories with `syncStatus = "imported"`.
- Rendered compatibility blocks do not mark whether an exported memory later came back through import.

Why it matters:

- Round-tripping compatibility blocks can create duplicates unless Phase 3 or a cleanup pass adds import de-duping.

Next action:

- Add a stable exported memory identifier to compatibility block lines or metadata.
- Use it to avoid duplicate imports.

