# Phase 4.5 Terminal-Owned Session Launch Review Guide

## Scope Summary

This branch implements the first Phase 4.5 terminal-owned session launch path.

It adds a real workspace CLI package, `@signal-recycler/cli`, with an `sr` binary shape focused on:

```sh
sr run --agent codex "prompt"
sr run --session session_abc123 "next prompt"
```

`sr run` is a durable-session command, not a purely ephemeral one-shot. The terminal process exits after one turn, but the Signal Recycler session remains durable and can be continued with `--session <id>`.

The implementation keeps `sr chat` as future terminal UX and does not implement `sr codex`.

## Change Map

- `docs/superpowers/specs/2026-05-03-phase-4-5-terminal-owned-session-launch-design.md`
  - Adds the Phase 4.5 scope anchor.
  - Defines `sr run` as the first terminal-owned session UX.
  - Defines durable session continuation through `sr run --session <id>`.
  - Documents why the CLI should call the existing local API rather than duplicating `processTurn`.
  - Defines the package shape, command contract, terminal output, dashboard relationship, error handling, test strategy, and future `sr chat` boundary.
- `docs/superpowers/plans/2026-05-03-phase-4-5-terminal-owned-session-launch.md`
  - Adds the task-by-task TDD implementation plan for the CLI package.
  - Scopes the first runtime implementation to `sr run`, `--agent`, `--api`, `--session`, `--title`, `--json`, and `--no-watch`.
  - Keeps `sr chat`, `sr codex`, `sr sessions`, and `sr run --last` out of the first implementation.
- `apps/cli`
  - Adds the `@signal-recycler/cli` workspace package.
  - Adds parser, API client, terminal formatter, run orchestration, binary entry point, and tests.
  - Calls the existing local API endpoints instead of importing API internals.
  - Keeps `--json` stdout machine-readable by suppressing human banners and event lines.
  - Honors `--no-watch` by skipping terminal event streaming and final event dumps.
  - Seeds existing event ids before continuation runs so terminal output does not replay previous turns.
  - Excludes built `dist` files from CLI test discovery and excludes source test files from the CLI build output.
- `package.json`
  - Adds root `cli` and `cli:build` convenience scripts.
- `README.md`
  - Documents terminal-owned sessions, local API requirement, new session launch, and explicit session continuation.
- `docs/pr-notes/phase-4-5-terminal-owned-session-launch-review-guide.md`
  - Documents reviewer focus and verification for this implementation branch.
- `docs/pr-notes/phase-4-5-terminal-owned-session-launch-follow-up-backlog.md`
  - Tracks residual risks and deferred work discovered during planning and implementation.

## Reviewer Focus Areas

- Confirm this stays inside Phase 4.5 and does not start Phase 5 source/context indexing.
- Confirm `sr run --agent codex "prompt"` is the right first terminal UX.
- Confirm `sr run --session <id> "prompt"` is the right first continuation primitive for long coding sessions.
- Confirm `sr chat` is correctly documented as future UX rather than part of this implementation.
- Confirm the CLI-as-thin-local-API-client approach is acceptable for the first pass.
- Confirm the implementation keeps `processTurn(...)` as the single runtime path for memory retrieval, injection, adapter execution, and post-run learning.
- Confirm watched continuation does not replay prior session events in terminal output.
- Confirm `--json` writes only the final JSON summary to stdout.
- Confirm `--no-watch` avoids timeline event output while still returning the final summary.
- Confirm the README avoids overclaiming support for wrapping opaque vendor TUIs.

## Known Non-Blockers

- The CLI requires the local Signal Recycler API server to be running.
- The CLI prints the dashboard base URL, not a session-specific deep link.
- The CLI package is workspace-local and does not add npm publishing polish.
- The implementation does not add `sr run --last` or `sr sessions`; those are tracked as follow-up ergonomics.
- The implementation does not add `sr chat` or a full TUI.
- The implementation does not add `sr codex`.

## Verification

- Reviewed against `docs/validation-roadmap.md` Phase 4.5 success criteria.
- Checked for unsupported claims around Phase 5 source indexing, vector retrieval, cloud sync, compare/replay, and vendor TUI wrapping.
- Checked the current codebase has reusable owned-session API surfaces: `POST /api/sessions`, `POST /api/sessions/:id/run`, `GET /api/sessions/:id/events`, adapter registry, and `processTurn(...)`.
- Checked the existing run route already supports appending another turn to an existing session id.
- Checked the implementation plan for scope coverage, placeholder language, and command/test specificity.
- `pnpm --filter @signal-recycler/cli test -- src/args.test.ts` passed.
- `pnpm --filter @signal-recycler/cli test -- src/apiClient.test.ts` passed.
- `pnpm --filter @signal-recycler/cli test -- src/output.test.ts` passed.
- `pnpm --filter @signal-recycler/cli test -- src/runCommand.test.ts` passed after adding the watched-continuation no-replay regression.
- `pnpm --filter @signal-recycler/cli test` passed.
- `pnpm --filter @signal-recycler/cli type-check` passed.
- `pnpm --filter @signal-recycler/cli build` passed.
- PR review follow-up: `pnpm --filter @signal-recycler/cli test -- src/runCommand.test.ts` passed with regression coverage for JSON-only stdout, `--no-watch` event suppression, and non-watched continuation no-replay.
- PR review follow-up: `pnpm --filter @signal-recycler/cli test` passed with 24 CLI source tests.
- PR review follow-up: `pnpm --filter @signal-recycler/cli type-check` passed.
- PR review follow-up: `pnpm --filter @signal-recycler/cli build` passed.
- PR review follow-up: `git diff --check` passed.
- `pnpm test` passed: CLI 24 tests, web 18 tests, API 145 tests, shared package no-test pass.
- `pnpm type-check` passed.
- `pnpm build` passed.
- `git diff --check` passed.
- `node apps/cli/dist/main.js --help` printed usage with `sr run`, `--session`, and `--agent`.
- Mock runtime smoke passed with `SIGNAL_RECYCLER_MOCK_CODEX=1 SIGNAL_RECYCLER_DB=/tmp/signal-recycler-cli-smoke.sqlite pnpm dev`.
- `node apps/cli/dist/main.js run --agent mock "terminal owned smoke after replay fix"` created `session_21ce2acc-23d6-43e5-8eb0-50c61748d6f1` and printed the continuation command.
- `node apps/cli/dist/main.js run --session session_21ce2acc-23d6-43e5-8eb0-50c61748d6f1 --agent mock "continue terminal owned smoke after replay fix"` reused the same session and did not replay prior-turn terminal events.
- `curl -s http://127.0.0.1:3001/api/sessions/session_21ce2acc-23d6-43e5-8eb0-50c61748d6f1/events` returned eight events with two `User prompt` events for the same session id.

## Out Of Scope

- Adding source/context indexing.
- Adding compare/replay.
- Adding cloud sync.
- Adding a full terminal TUI.
- Adding `sr run --last`, `sr sessions`, or `sr chat`.
- Publishing an npm package.
