# Phase 4 Task 3 Adapter Registry Follow-Up Backlog

## P1: Wire Registry At App Boundary In Task 4

Residual risk: `processTurn` can accept a registry, but app and route construction still pass only the existing `codexRunner`.

Next action: in Task 4, create the app/server registry wiring and update route construction without changing the registry contract added here.

## P1: Implement Real Codex CLI Adapter In Task 5

Residual risk: `codexCliCommand` is modeled in registry options, but no command execution adapter is provided yet.

Next action: in Task 5, add a `codex_cli` adapter that validates the command, executes headless Codex, and parses verified JSONL events.

## P2: Revisit Legacy Codex CLI Error Message After Route Wiring

Residual risk: registry resolution now has the clearer `Codex CLI adapter is not configured` message, while the legacy route fallback still returns `Agent adapter is not configured: codex_cli` for compatibility.

Next action: after Task 4 routes use registry resolution, update or remove the legacy fallback path and align user-facing tests around the registry error.
