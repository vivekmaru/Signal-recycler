# Phase 4 Task 3 Adapter Registry Review Guide

## Scope Summary

Phase 4 Task 3 adds an owned-session agent adapter registry without wiring it into app/server construction. The runtime still preserves the existing Codex runner fallback for current routes, while `processTurn` can now prefer a supplied registry or resolved adapter.

## Subsystem-By-Subsystem Change Map

- API types: adds adapter-oriented run input/result/adapter types and keeps `CodexRunner` compatible with existing `run`-only callers.
- Mock adapter service: extracts deterministic mock behavior from `turnProcessor`, including the playbook-aware response branch.
- Adapter registry service: adds default adapter resolution, built-in mock registration, and explicit missing-adapter errors.
- Turn processor: supports optional registry/resolved adapter execution, keeps context envelope injection for mock adapter runs, and preserves legacy codex runner fallback behavior for current routes.
- Tests: adds registry coverage for default-to-mock resolution and unavailable Codex CLI behavior.

## Reviewer Focus Areas

- Confirm registry resolution does not accidentally wire into routes or app startup before Task 4.
- Confirm `default` is only an alias at registry resolution time and is not a concrete adapter id.
- Confirm mock adapter runs still receive the shared context envelope from `turnProcessor`.
- Confirm `CodexRunner` compatibility remains broad enough for existing route and test callers.

## Known Non-Blockers And Expected Warnings

- `codexCliCommand` is accepted by the registry options but no CLI execution adapter is implemented in this task.
- The legacy non-registry `codex_cli` fallback keeps its existing route-facing error message to avoid changing server behavior before Task 4.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- agentAdapters.test.ts server.test.ts contextEnvelope.test.ts`: passed, 16 test files and 120 tests.
- `pnpm --filter @signal-recycler/api type-check`: passed.

## Explicit Out-Of-Scope Items

- Task 4 server/app registry wiring.
- Codex CLI process execution.
- Codex SDK adapter refactor beyond compatibility typing.
- Route payload or API schema changes.
- Repo context indexing, JIT rehydration, cloud sync, or owned-session behavior beyond the adapter selection seam.
