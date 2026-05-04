# Phase 4.5 Terminal-Owned Session Launch Follow-Up Backlog

## P0: Implement Terminal-Owned Session Launch

Status: complete in `apps/cli`.

Next action: review the PR and verify `sr run` against a local mock API.

## P1: Decide Install And Invocation Polish

Residual risk: the implementation uses a real `sr` package binary shape but does not decide global install, `pnpm dlx`, local workspace script, or release packaging details.

Next action: after the local binary works in the workspace, decide whether the first documented install path is npm global install, `pnpm --filter @signal-recycler/cli`, or a root helper script.

## P1: Add Dashboard Deep Links

Residual risk: the CLI prints the dashboard base URL, but the current web route state may not support direct links to a specific session.

Next action: add route/deep-link support for opening Session Detail by session id, then update `sr run` output to print the exact session URL.

## P1: Add `sr run --last` And `sr sessions`

Residual risk: `sr run --session <id>` gives explicit durable continuation, but long coding sessions still require the user to keep or copy the session id.

Next action: after explicit `--session` continuation works, add `sr sessions` to list recent durable sessions and `sr run --last "prompt"` to continue the most recent session for the active project/worktree.

## P1: Reduce Continuation Verbosity Without Hiding Auditability

Residual risk: `sr run --session <id>` no longer replays previous terminal events, but it still prints all new event categories in a simple flat stream. Longer sessions may need better grouping or compact defaults.

Next action: after reviewers test the CLI, decide whether terminal output should group by turn, collapse classifier events by default, or add a `--verbose` mode.

## P1: Design `sr chat`

Residual risk: `sr chat` is the path toward a full Signal Recycler TUI, but this design intentionally defers it.

Next action: after `sr run` is implemented and tested, design a focused `sr chat --agent codex` phase that keeps Signal Recycler as the owner of conversation history and context assembly.

## P2: Revisit CLI Parser Once Commands Expand

Residual risk: the hand-rolled parser is covered for the current `sr run` flags, including option-token value guards, but more subcommands will make parser behavior easier to regress.

Next action: when adding `sr sessions`, `sr chat`, or `sr run --last`, evaluate a small CLI parser library or shared parser test matrix before growing the current manual parser.

## P2: Embedded Runtime Fallback

Residual risk: requiring a running local API server is acceptable for the first pass, but some developers will expect `sr run` to start or embed the runtime automatically.

Next action: after the API-client implementation is stable, evaluate either auto-starting the local API or embedding the runtime in the CLI without duplicating memory/session logic.

## P2: Vendor TUI Wrapper Research

Residual risk: users may expect `sr codex` or `sr claude`, but wrapping opaque vendor TUIs may not provide enough structured context ownership to justify the feature.

Next action: research whether each vendor exposes a structured turn/event contract that Signal Recycler can own. Only design wrappers where SR can still retrieve, inject, audit, and learn per turn.
