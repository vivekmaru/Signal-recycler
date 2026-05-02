# Phase 4 Task 5 Codex CLI Adapter Review Guide

## Scope Summary

Phase 4 Task 5 adds an opt-in Codex CLI owned-session adapter. The default server adapter remains `codex_sdk`; `codex_cli` is only registered when `SIGNAL_RECYCLER_CODEX_CLI=1`.

## Change Map

- Codex CLI adapter service: adds `parseCodexJsonLine` and `createCodexCliAdapter`, spawning `codex exec --json <prompt>` and recording stdout lines as bounded `codex_event` timeline events.
- Codex CLI adapter hardening: recognizes `item.completed` `agent_message` output, ignores `user_message` echoes as assistant messages, rejects and kills the child on event persistence failure, and caps event bodies, raw metadata previews, retained items, and stderr.
- Server startup: conditionally registers the `codex_cli` adapter behind `SIGNAL_RECYCLER_CODEX_CLI=1`.
- README: documents opt-in startup, `{ "adapter": "codex_cli" }` session selection, and local Codex CLI auth behavior.
- Tests: adds parser coverage for assistant messages, Codex `item.completed` agent/user message shapes, unknown JSON events, and non-JSON lines; adds adapter run coverage for event persistence failure, item retention caps, and stderr truncation.

## Reviewer Focus Areas

- Confirm `codex_cli` is never selected by default.
- Confirm non-zero CLI exits include bounded collected stderr in the rejection message.
- Confirm timeline event metadata preserves raw parsed events for auditability when small, and bounded previews when large.

## Known Non-Blockers And Expected Warnings

- The adapter assumes the planned `codex exec --json` command shape and does not perform CLI discovery.
- Parser extraction remains intentionally conservative: unrecognized Codex JSONL shapes are still recorded as raw events.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/api test -- codexCliAdapter.test.ts agentAdapters.test.ts server.test.ts` - passed, 17 files / 130 tests.
- `pnpm --filter @signal-recycler/api type-check` - passed.

## Explicit Out Of Scope

- Claude Code adapter implementation.
- Changing Codex SDK or proxy default behavior.
- Memory retrieval changes, context indexing, cloud sync, or owned-session behavior beyond this adapter registration.
