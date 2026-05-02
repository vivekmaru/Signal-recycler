# Low-Signal Memory Retrieval Review Guide

## Scope

This PR tightens lexical memory retrieval so generic `test`-only prompts do not inject approved memories.

## What To Review

- `apps/api/src/store.ts`
  - Confirm `test`, `tests`, and `testing` are treated as non-discriminating retrieval terms.
  - Confirm specific prompts can still retrieve memory through stronger terms like `pnpm`, `package-manager`, `api`, `theme`, or `validation`.
- `apps/api/src/services/memoryRetrieval.test.ts`
  - Confirm the service returns zero selected memories for query `test` while still reporting skipped approved memories.
- `apps/api/src/server.test.ts`
  - Confirm the proxy forwards a low-signal prompt unchanged and records retrieval metadata without creating a memory injection event.
- `apps/api/src/store.test.ts`
  - Confirm the FTS/BM25 store does not return matches for `test`-only queries.

## Manual Check

1. Start the app with the mock adapter or a live adapter.
2. Reset state and create two approved memories, including one containing `pnpm test`.
3. Run prompt `test`.
4. Expected result:
   - Timeline shows `Retrieved 0 of 2 approved memories`.
   - No `memory_injection` event is created.
   - The forwarded prompt remains `test`.

## Verification

- `pnpm --filter @signal-recycler/api test -- store.test.ts memoryRetrieval.test.ts server.test.ts`
- `pnpm test`
- `pnpm type-check`
- `pnpm eval`

## Reviewer Questions

- Are `test/tests/testing` too broad to use as standalone retrieval terms? This PR assumes yes.
- Do we need a broader query-quality gate for prompts like `run tests`, or should that be handled by a dedicated follow-up eval?
