# Phase 5 Context Index Eval Suite Review Guide

## Scope Summary

Adds a deterministic local eval suite for Phase 5 Context Index retrieval. The suite scans `fixtures/context-index-repo`, runs fixed retrieval prompts, and reports `recall@5`, `precision@5`, selected-token count, and token-efficiency ratio.

This is measurement work only. It does not inject source/doc chunks into session context envelopes.

## Change Map

- `apps/api/src/evals/suites/contextIndexEval.ts`
  - Creates an in-memory Context Index store.
  - Scans the existing fixture repo.
  - Scores gold-path retrieval cases for source, docs, package files, and no-searchable-term prompts.
  - Emits aggregate recall, precision, selected-token, and efficiency metrics.
- `apps/api/src/evals/suites/contextIndexEval.test.ts`
  - Proves the suite is offline, passing, and includes reviewable selected/gold paths.
- `apps/api/src/evals/run.ts`
  - Registers the suite in local eval runs.
- `docs/superpowers/plans/2026-05-17-context-index-eval-suite.md`
  - Captures the implementation plan.

## Reviewer Focus Areas

- Confirm the gold cases are fair for the current fixture repo.
- Confirm source/doc/package retrieval remains separate from durable memory retrieval.
- Confirm the no-searchable-term case measures stop-word behavior rather than legitimate terms such as `test`.
- Confirm metrics are useful enough to gate future source context-envelope integration.

## Known Non-Blockers And Expected Warnings

- The eval uses source-type filters for the class-specific cases. That keeps each case precise while still using the real Context Index retrieval path.
- Token efficiency is a coarse character-count estimate, consistent with other local deterministic evals.
- QMD-backed indexing is still a separate decision/evaluation item.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- src/evals/suites/contextIndexEval.test.ts` - passed.
- `pnpm --filter @signal-recycler/api eval` - passed; report includes `Context Index Retrieval`.
- `pnpm test` - passed.
- `pnpm type-check` - passed.
- `pnpm build` - passed.
- `git diff --check` - passed.

## Explicit Out Of Scope

- Source chunk context-envelope injection.
- Dashboard eval report UI.
- QMD-backed indexing integration.
- Compression and rehydration evals.
