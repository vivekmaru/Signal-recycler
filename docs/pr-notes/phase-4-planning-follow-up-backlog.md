# Phase 4 Planning Follow-Up Backlog

## P1: Verify Codex CLI Event Shape During Implementation

Residual risk: the plan assumes `codex exec --json` can produce parseable structured events, but exact event shapes can vary by CLI version.

Next action: during Task 5, verify local `codex exec --json` output and adjust parser tests to match observed event types before opening the PR.

## P1: Keep Claude Code Evaluation Honest

Residual risk: Claude Code support is easy to over-claim because Phase 4 only requires evaluation, not full implementation.

Next action: complete `docs/research/claude-code-headless-adapter-evaluation.md` in Phase 4 and keep adapter implementation in backlog unless command/event behavior is verified.

## P2: Revisit Plan Granularity After Task 4

Residual risk: the compatibility wrapper and shared context envelope extraction may overlap more than expected once implementation starts.

Next action: after Task 4, review whether the old mock path still duplicates envelope behavior and either remove duplication in-branch or record it as a blocking cleanup before PR.
