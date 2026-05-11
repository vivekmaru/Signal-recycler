# Phase 4.5 Codex SDK-Owned Sessions Review Guide

## Scope Summary

This branch keeps the public `codex_cli` adapter but replaces its hand-rolled `codex exec --json` spawn/parser with `@openai/codex-sdk`.

The goal is to keep local Codex CLI authentication, add Codex thread resume for durable Signal Recycler sessions, and stream structured SDK events into the dashboard. It also adds session-specific dashboard deep links for terminal-owned sessions.

## Change Map

- API adapter runtime:
  - `codex_cli` now uses `Codex.startThread(...)`, `Codex.resumeThread(...)`, and `runStreamed(...)`.
  - Codex thread ids are persisted in timeline event metadata as `codexThreadId` and reused on later `sr run --session ...` turns.
  - SDK stream events are normalized into existing `codex_event` timeline rows with `sdkEventType`, `itemType`, bounded raw payload, and usage metadata where available.
- Terminal UX:
  - `sr run` summaries now include an exact session URL such as `http://127.0.0.1:5173/sessions/<id>`.
  - JSON summaries include `sessionUrl` while preserving machine-readable stdout.
- Dashboard UX:
  - The web app can open `/sessions/:sessionId` directly and handles browser back/forward navigation.
  - The new-session adapter labels distinguish SDK-backed Codex CLI from the proxy-compatible Codex SDK path.
- Documentation:
  - README and roadmap language now describe the structured Codex CLI adapter instead of a manual `codex exec --json` parser.

## Reviewer Focus Areas

- Confirm `codex_cli` remains the local-auth owned-session adapter and does not require `OPENAI_API_KEY`.
- Confirm `codex_sdk` remains available as the existing proxy compatibility path.
- Confirm continuation uses the prior Codex thread id for the same Signal Recycler session.
- Confirm dashboard events expose enough provenance for SDK event type, item type, usage, and bounded raw payload inspection.
- Confirm SDK fatal `error` stream events fail the run the same way `turn.failed` does.
- Confirm session deep links do not break existing dashboard navigation.
- Confirm malformed session deep links fall back safely instead of throwing during app startup or popstate handling.
- Confirm this branch stays inside Phase 4/4.5 and does not introduce Phase 5 source/context indexing.

## Known Non-Blockers And Expected Warnings

- Codex CLI auth/runtime smoke may still require local Codex permissions outside the sandbox because Codex writes under `~/.codex`.
- Codex SDK internally still shells out to the local Codex CLI; this branch removes Signal Recycler's manual spawn/parser, not the underlying Codex binary dependency.
- `codex_sdk` naming remains confusing because it is the older proxy compatibility path. Renaming or deprecating that public adapter is deferred to avoid a breaking API change.
- Codex thread id persistence uses event metadata first. A dedicated session metadata table is a follow-up if event lookup becomes too brittle.

## Verification

- Baseline before edits:
  - `pnpm test` passed.
  - `pnpm type-check` passed.
  - Mock `sr run --agent mock "check learned constraints"` passed against a temp local server.
- Implementation checks:
  - `pnpm --filter @signal-recycler/api test -- src/services/codexCliAdapter.test.ts` passed.
  - `pnpm --filter @signal-recycler/cli test -- src/runCommand.test.ts src/output.test.ts` passed.
  - `pnpm --filter @signal-recycler/web test -- src/lib/routes.test.ts` passed.
  - `pnpm test` passed.
  - `pnpm type-check` passed.
  - `pnpm build` passed.
  - Mock runtime smoke passed with `SIGNAL_RECYCLER_MOCK_CODEX=1 SIGNAL_RECYCLER_DB=/tmp/signal-recycler-sdk-smoke.sqlite pnpm dev`.
  - SDK-backed Codex runtime smoke passed with `OPENAI_API_KEY= SIGNAL_RECYCLER_CODEX_CLI=1 SIGNAL_RECYCLER_DB=/tmp/signal-recycler-sdk-codex-smoke.sqlite pnpm dev`.
  - Continuation smoke reused Codex thread id `019e170b-cd64-7421-9646-13d51bce9d35` for session `session_93fc8730-f45a-4c51-b899-8a62c7f1cb8f`.
- PR review follow-up:
  - `pnpm --filter @signal-recycler/api test -- src/services/codexCliAdapter.test.ts` passed after adding fatal SDK `error` event coverage.
  - `pnpm --filter @signal-recycler/web test -- src/lib/routes.test.ts` passed after adding malformed session deep-link coverage.

## Out Of Scope

- Source/context indexing.
- Compare/replay eval UX.
- Cloud sync.
- Full `sr chat` TUI.
- Removing or renaming the existing `codex_sdk` proxy compatibility adapter.
