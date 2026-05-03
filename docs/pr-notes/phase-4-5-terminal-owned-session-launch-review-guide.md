# Phase 4.5 Terminal-Owned Session Launch Review Guide

## Scope Summary

This planning branch defines the product design for a Phase 4.5 terminal-owned session launch. It does not implement CLI runtime code yet.

The design chooses a real package binary shape, `sr`, with the first implementation focused on:

```sh
sr run --agent codex "prompt"
sr run --session session_abc123 "next prompt"
```

The design explicitly treats `sr run` as a durable-session command, not a purely ephemeral one-shot. The terminal process exits after one turn, but the Signal Recycler session remains durable and can be continued with `--session <id>`.

The design keeps `sr chat` as future terminal UX and rejects `sr codex` as the first slice because launching an opaque vendor TUI would weaken Signal Recycler's context ownership.

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
- `docs/pr-notes/phase-4-5-terminal-owned-session-launch-review-guide.md`
  - Documents reviewer focus and verification for this planning branch.
- `docs/pr-notes/phase-4-5-terminal-owned-session-launch-follow-up-backlog.md`
  - Tracks residual risks and deferred work discovered during planning.

## Reviewer Focus Areas

- Confirm this stays inside Phase 4.5 and does not start Phase 5 source/context indexing.
- Confirm `sr run --agent codex "prompt"` is the right first terminal UX.
- Confirm `sr run --session <id> "prompt"` is the right first continuation primitive for long coding sessions.
- Confirm `sr chat` is correctly documented as future UX rather than part of this implementation.
- Confirm the CLI-as-thin-local-API-client approach is acceptable for the first pass.
- Confirm the design keeps `processTurn(...)` as the single runtime path for memory retrieval, injection, adapter execution, and post-run learning.
- Confirm the design avoids overclaiming support for wrapping opaque vendor TUIs.

## Known Non-Blockers

- The design requires the local Signal Recycler API server to be running for the first implementation.
- The design does not add npm publishing polish.
- The design does not add deep links to individual dashboard sessions.
- The design does not add `sr run --last` or `sr sessions`; those are tracked as follow-up ergonomics.
- The design does not implement `sr chat` or a full TUI.
- The design does not implement `sr codex`.

## Verification

- Documentation-only change.
- Reviewed against `docs/validation-roadmap.md` Phase 4.5 success criteria.
- Checked for unsupported claims around Phase 5 source indexing, vector retrieval, cloud sync, compare/replay, and vendor TUI wrapping.
- Checked the current codebase has reusable owned-session API surfaces: `POST /api/sessions`, `POST /api/sessions/:id/run`, `GET /api/sessions/:id/events`, adapter registry, and `processTurn(...)`.
- Checked the existing run route already supports appending another turn to an existing session id.
- Checked the implementation plan for scope coverage, placeholder language, and command/test specificity.

## Out Of Scope

- Implementing `apps/cli`.
- Adding package scripts or build wiring.
- Adding source/context indexing.
- Adding compare/replay.
- Adding cloud sync.
- Adding a full terminal TUI.
- Publishing an npm package.
