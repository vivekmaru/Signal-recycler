# Phase 3.1 Memory Hardening Review Guide

## Scope Summary

This PR hardens Phase 3 memory retrieval and injection before Phase 4 owned sessions. It focuses on repeatability and diagnosability for the memory feedback-loop issues found during manual product smoke.

## Change Map

- Proxy request context analysis moved into a focused helper.
- Internal classifier detection has contract tests.
- Existing playbook stripping exposes debug metadata.
- Mock Codex no-hit retrieval has direct negative coverage.
- `pnpm smoke:memory` reproduces the two-memory retrieval/injection product smoke.

## Reviewer Focus Areas

- Internal classifier requests should skip memory injection.
- User prompts quoting classifier text should still receive normal retrieval/injection.
- Existing playbook text should not make unrelated memories relevant.
- The smoke script must refuse non-smoke databases unless explicitly overridden.
- Proxy metadata should make retrieval query source and stripped playbook count visible.

## Verification

- `pnpm test`
  - Passed across shared, API, and web packages.
  - API tests: 14 files, 113 tests.
- `pnpm type-check`
  - Passed across shared, API, and web packages.
- `pnpm build`
  - Passed across shared, API, and web packages.
- `git diff --check`
  - Passed.
- `SIGNAL_RECYCLER_API_URL=http://127.0.0.1:3002 pnpm smoke:memory`
  - Passed against `SIGNAL_RECYCLER_MOCK_CODEX=1` and `/tmp/signal-recycler-memory-smoke.sqlite`.
  - Selected 1 memory, injected 1 memory, created 0 candidate rules.

## Out Of Scope

- Owned-session adapters.
- Repo context index.
- Browser automation.
- Vector retrieval.
