# Phase 4 Task 6 Memory Service API Review Guide

## Scope Summary

Phase 4 Task 6 adds `POST /api/memory/retain` as a stable integration API that immediately creates an approved durable memory with API import provenance. Existing retrieval behavior at `POST /api/memory/retrieve` is unchanged.

## Change Map

- API routes: adds `POST /api/memory/retain` in `apps/api/src/routes/rules.ts`, reusing the existing manual memory request schema and project-scoped store path.
- API validation: malformed retain requests return a controlled 400 response with `Invalid memory retain request` before store writes.
- Tests: adds server coverage for retaining a `command_convention` memory and asserting approved status plus `{ kind: "import", label: "api" }` source metadata; adds malformed retain request coverage.
- README: documents `/api/memory/retain` and `/api/memory/retrieve` together as stable memory service APIs for integrations.

## Reviewer Focus Areas

- Confirm retained memories are approved immediately and do not become pending candidates.
- Confirm provenance is distinguishable from manual and synced memories.
- Confirm malformed retain requests use the stable memory service error shape.
- Confirm retrieval scoring and selection behavior were not changed.

## Known Non-Blockers And Expected Warnings

- The retain endpoint currently uses the existing manual memory request shape; it does not add integration-specific request fields.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- server.test.ts` - passed, 17 files / 132 tests.
- `pnpm --filter @signal-recycler/api type-check` - passed.

## Explicit Out Of Scope

- Renaming existing endpoints.
- Changing retrieval scoring, selection, indexing, or injection behavior.
- Adding cloud sync or cross-project memory behavior.
