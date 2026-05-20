# Session Detail Memory Audit Review Guide

## Scope Summary

This branch addresses Beads `idea-1-8qn`: Session Detail should reuse the backed Memory Review audit model when a user selects an injected or candidate memory.

The implementation is read-only. It does not change memory mutation actions, compare/replay behavior, session execution, or the memory audit API contract.

## Subsystem-By-Subsystem Change Map

### Shared Memory Audit UI

- Adds `apps/web/src/components/MemoryAuditPanel.tsx`.
- Reuses the existing `/api/memories/:id/audit` result shape for recorded memory usage.
- Keeps the same usage list details from Memory Review: adapter, injected time, reason, session id, and event id.

### Session Detail Integration

- Updates `apps/web/src/views/SessionDetailView.tsx` to fetch memory audit data when the inspector selection is a memory.
- Adds the audit panel below the existing inspector column.
- Makes memory IDs in memory retrieval and memory injection metadata selectable when the durable memory record is loaded.
- Keeps candidate memory selection on the same read-only path.

### Memory Review Reuse

- Updates `apps/web/src/views/MemoryView.tsx` to use the shared audit panel instead of carrying a local duplicate.

### Presenter Coverage

- Adds `apps/web/src/lib/memoryAuditPresenters.ts` and tests for empty, loading/stale, error, and ready audit states.

## Reviewer Focus Areas

- Confirm Session Detail only fetches audit data for memory selections, not plain event/session selections.
- Confirm stale audit results are not shown after switching memory selections.
- Confirm memory IDs in context metadata remain plain badges when the durable memory record is not loaded.
- Confirm Memory Review still renders the same usage audit behavior after the panel extraction.

## Known Non-Blockers And Expected Warnings

- The audit panel is read-only and does not add approve/reject actions to Session Detail.
- The panel depends on loaded memory records; missing memory IDs stay non-clickable.
- Compare and Replay remain disabled preview actions.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/web test -- memoryAuditPresenters.test.ts memoryPresenters.test.ts sessionPresenters.test.ts`
  - Result: passed, 10 web test files / 51 tests.
- `pnpm --filter @signal-recycler/web type-check`
  - Result: passed.
- `pnpm test`
  - Result: passed, CLI 5 files / 32 tests, API 22 files / 203 tests, Web 10 files / 51 tests.
- `pnpm type-check`
  - Result: passed across CLI, shared, API, and Web.
- `pnpm build`
  - Result: passed across CLI, shared, API, and Web.
- `git diff --check`
  - Result: passed.
- Smoke with `SIGNAL_RECYCLER_MOCK_CODEX=1 SIGNAL_RECYCLER_DB=/tmp/signal-recycler-audit-smoke.XXXXXX.sqlite pnpm dev`
  - Result: passed with `pnpm smoke:memory`, then `GET /api/memories/:id/audit` returned the injected memory usage for the smoke session.
- Browser automation
  - Result: not run. The Browser/Chrome automation tools were not exposed in this session and Playwright was not installed, so local smoke verification used the dev server plus API-backed audit checks.

## Explicit Out-Of-Scope Items

- Compare/replay execution.
- Memory mutation actions from Session Detail.
- A shared typed API error system.
- Backend audit API changes.
