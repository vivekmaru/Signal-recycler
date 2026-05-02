# Phase 4 Task 4 Codex SDK Adapter Review Guide

## Scope Summary

Phase 4 Task 4 wraps the existing Codex SDK runner as an owned-session `AgentAdapter` while preserving the legacy `createCodexRunner` export for compatibility. The app/server boundary now creates a shared adapter registry and passes it into session runs.

## Subsystem-By-Subsystem Change Map

- Codex SDK adapter service: moves the existing SDK runner implementation into `createCodexSdkAdapter` with `id: "codex_sdk"` and preserves proxy base URL, optional API key handling, mock path behavior, memory retrieval/injection audit events, and session/workdir thread keys.
- Compatibility runner export: replaces `codexRunner.ts` with a re-export from the new adapter service.
- App construction: accepts an optional `agentAdapterRegistry` and passes it through to session routes.
- Server startup: creates one Codex SDK adapter, registers it as `codex_sdk`, selects `mock` as default only when `SIGNAL_RECYCLER_MOCK_CODEX=1`, and passes both compatibility runner and registry into `createApp`.
- Session routes: forwards the app-provided registry into `processTurn` with parsed adapter selection.
- Tests: adds route coverage proving default session runs resolve through the app-provided registry instead of the legacy runner fallback.

## Reviewer Focus Areas

- Confirm the SDK adapter body is a compatibility move, not a semantic rewrite of proxy, mock, retrieval, or thread behavior.
- Confirm the server creates a single `codexSdkAdapter` instance and reuses it for both `codexRunner` and registry registration.
- Confirm optional registry plumbing is omitted when unset so existing tests and `exactOptionalPropertyTypes` remain compatible.
- Confirm no Codex CLI execution path was added in this task.

## Known Non-Blockers And Expected Warnings

- Legacy non-registry fallback paths remain in `processTurn` for compatibility with tests and callers that do not provide a registry.
- The mock default in server startup is environment-gated by `SIGNAL_RECYCLER_MOCK_CODEX=1`; the Codex SDK adapter still retains its existing internal mock branch for compatibility.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- server.test.ts agentAdapters.test.ts contextEnvelope.test.ts`: passed, 16 test files and 121 tests.
- `pnpm --filter @signal-recycler/api type-check`: passed.

## Explicit Out-Of-Scope Items

- Codex CLI adapter implementation.
- Proxy route behavior changes.
- New retrieval, context indexing, cloud sync, or owned-session behavior beyond adapter registry wiring.
- Renaming or removing the legacy `createCodexRunner` import surface.
