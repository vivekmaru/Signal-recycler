# Superseded Memory Mutation Guards Review Guide

## Scope Summary

This branch addresses Beads `idea-1-rmm`: direct API callers should not be able to approve or reject superseded memory records after the UI has already disabled those actions.

The slice is intentionally narrow. It adds server-side guards and regression tests for superseded rule mutations without changing the Memory Review UI, supersession workflow, retrieval behavior, or sync behavior.

## Subsystem-By-Subsystem Change Map

### Store Mutation Guard

- Updates `apps/api/src/store.ts` so `approveRule` and `rejectRule` read the target rule before mutation.
- Missing rules still throw `Rule not found`.
- Superseded rules now throw before any status, approval timestamp, FTS, or `updatedAt` mutation occurs.

### Rules API

- Updates `apps/api/src/routes/rules.ts` for `POST /api/rules/:id/approve` and `POST /api/rules/:id/reject`.
- Keeps cross-project and missing rules as 404s.
- Returns 409 Conflict for superseded rules with the replacement memory id in `supersededBy`.

### Regression Tests

- Adds store coverage proving superseded memory cannot be approved or rejected and remains unchanged.
- Adds API coverage proving both direct endpoints return clear 409 responses and leave the superseded memory unchanged.

## Reviewer Focus Areas

- Confirm the guard happens before mutation.
- Confirm missing/cross-project rules remain 404 rather than becoming 409.
- Confirm the API response gives callers enough information to understand the conflict.
- Confirm this does not prevent creating or approving brand-new manual/synced memories.

## Known Non-Blockers And Expected Warnings

- The UI already disables these actions; this branch protects API callers and store consumers.
- The error payload is intentionally small and does not introduce a shared error schema.
- Other memory mutation routes are not added in this slice because approve/reject only exist on the legacy rules endpoints.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- store.test.ts server.test.ts`
  - Result: passed, 22 API test files / 203 tests.
- `pnpm --filter @signal-recycler/api type-check`
  - Result: passed.
- `pnpm test`
  - Result: passed, CLI 5 files / 32 tests, API 22 files / 203 tests, Web 9 files / 48 tests.
- `pnpm type-check`
  - Result: passed across CLI, shared, API, and Web.
- `pnpm build`
  - Result: passed across CLI, shared, API, and Web.
- `git diff --check`
  - Result: passed.

## Explicit Out-Of-Scope Items

- Memory Review UI changes.
- Supersession workflow redesign.
- Shared API error envelope refactor.
- Compare/replay execution.
- Session Detail memory audit integration.
