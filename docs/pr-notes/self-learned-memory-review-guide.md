# Self-Learned Memory Fix Review Guide

## Scope Summary

This branch fixes two memory feedback-loop bugs found during manual product smoke:

1. When an approved memory was injected into a run and the agent echoed that memory back, the classifier could create and auto-approve a duplicate or broader memory.
2. When proxy traffic already contained a Signal Recycler playbook block, retrieval could use that injected memory text as query input and select memories that were not relevant to the user's prompt.
3. When Signal Recycler's own classifier call was routed through the proxy, the proxy could inject project memory into the classifier request and count it as runtime context injection.

The fix prevents candidate rule creation when the candidate is already covered by existing approved memory, ensures proxy retrieval is driven by user task text rather than previously injected playbook/system context, and skips retrieval/injection for internal classifier requests.

## Change Map

### Turn Processing

- `apps/api/src/services/turnProcessor.ts`
  - Checks classifier candidates against approved project memory before persistence.
  - Treats exact normalized matches as already covered.
  - Treats candidates whose reason quotes an approved memory as already covered.
  - Treats equivalent command corrections, such as `use pnpm ... instead of npm`, as already covered even when the candidate wording is broader.

### Proxy Retrieval

- `apps/api/src/routes/proxy.ts`
  - Extracts retrieval queries from user-role input/messages first.
  - Ignores system/developer/assistant/tool messages for retrieval query extraction.
  - Strips existing Signal Recycler playbook blocks before using text for retrieval.
  - Detects Signal Recycler internal classifier requests and forwards them unchanged without memory retrieval or injection.

### Playbook Utilities

- `apps/api/src/playbook.ts`
  - Exports playbook stripping so injection and proxy retrieval share the same cleanup behavior.

### Store Retrieval

- `apps/api/src/store.ts`
  - Uses insertion order as the duplicate tie-breaker when approved duplicate memories share the same approval timestamp.

### API Tests

- `apps/api/src/server.test.ts`
  - Adds a regression test for the smoke scenario where the run echoes injected pnpm memory.
  - Asserts no new `rule_candidate` or `rule_auto_approved` event is created.
  - Adds a regression test for proxy requests that already contain an injected playbook block.
  - Asserts only the user-prompt-relevant memory is reinjected.
  - Adds a regression test for classifier-shaped proxy requests.
  - Asserts internal classifier requests do not create retrieval or injection events.
  - Adds coverage for classifier requests where the marker appears in `input[].content` without schema metadata.
  - Adds coverage for normal user requests that quote the classifier marker and must still receive memory injection.

## Reviewer Focus Areas

- Confirm the duplicate suppression is narrow enough not to block genuinely new memories.
- Confirm the command correction equivalence check is deterministic and easy to reason about.
- Confirm the behavior applies only before persisting candidates, not before writing the classifier audit event.
- Confirm proxy retrieval should ignore non-user messages in agent request packets.
- Confirm stripping existing playbook blocks does not weaken the actual injection path.
- Confirm internal classifier detection is narrow enough to avoid disabling normal agent requests.
- Confirm quoted classifier-marker text in user prompts does not bypass normal proxy behavior.

## Known Non-Blockers

- The classifier still reports the raw candidate in the `classifier_result` metadata. This preserves auditability of what the distiller saw, while preventing duplicate memory persistence.
- The command correction parser is intentionally simple and covers the current `use X instead of Y` family. Broader semantic dedupe remains future work.
- If a proxy request has no user-role input/messages, retrieval still falls back to sanitized `instructions` text.
- Internal classifier proxy requests still emit a `proxy_request` audit event, but not `memory_retrieval` or `memory_injection`.

## Verification

- `pnpm --filter @signal-recycler/api test -- server.test.ts store.test.ts`
  - Passed: 13 files, 108 tests.
- `pnpm --filter @signal-recycler/api type-check`
  - Passed.
- Manual local API smoke on port `3002`
  - Reset memory, added two approved memories, ran `Run package manager validation for this repo.`
  - Observed one retrieval selection and one injected memory.
- `git diff --check`
  - Passed.

## Out Of Scope

- Full semantic duplicate detection.
- Cross-project duplicate memory analysis.
- UI changes for suppressed candidates.
- Changes to retrieval ranking or injection policy.
