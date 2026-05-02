# Self-Learned Memory Fix Review Guide

## Scope Summary

This branch fixes a post-run learning bug found during manual product smoke: when an approved memory was injected into a run and the agent echoed that memory back, the classifier could create and auto-approve a duplicate or broader memory.

The fix prevents candidate rule creation when the candidate is already covered by existing approved memory.

## Change Map

### Turn Processing

- `apps/api/src/services/turnProcessor.ts`
  - Checks classifier candidates against approved project memory before persistence.
  - Treats exact normalized matches as already covered.
  - Treats candidates whose reason quotes an approved memory as already covered.
  - Treats equivalent command corrections, such as `use pnpm ... instead of npm`, as already covered even when the candidate wording is broader.

### API Tests

- `apps/api/src/server.test.ts`
  - Adds a regression test for the smoke scenario where the run echoes injected pnpm memory.
  - Asserts no new `rule_candidate` or `rule_auto_approved` event is created.

## Reviewer Focus Areas

- Confirm the duplicate suppression is narrow enough not to block genuinely new memories.
- Confirm the command correction equivalence check is deterministic and easy to reason about.
- Confirm the behavior applies only before persisting candidates, not before writing the classifier audit event.

## Known Non-Blockers

- The classifier still reports the raw candidate in the `classifier_result` metadata. This preserves auditability of what the distiller saw, while preventing duplicate memory persistence.
- The command correction parser is intentionally simple and covers the current `use X instead of Y` family. Broader semantic dedupe remains future work.

## Verification

- `pnpm --filter @signal-recycler/api test -- server.test.ts classifier.test.ts`
  - Passed: 13 files, 104 tests.
- `pnpm --filter @signal-recycler/api type-check`
  - Passed.
- `git diff --check`
  - Passed.

## Out Of Scope

- Full semantic duplicate detection.
- Cross-project duplicate memory analysis.
- UI changes for suppressed candidates.
- Changes to retrieval ranking or injection policy.
