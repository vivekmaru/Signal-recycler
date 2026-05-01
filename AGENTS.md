# Agent Instructions

## Project Direction

Signal Recycler is a local-first memory runtime and context control plane for coding agents and agentic apps.

Core priorities, in order:

1. Correctness improvement.
2. Transparent auditability.
3. Cost and latency reduction.

Signal Recycler remains the runtime source of truth for memory. `AGENTS.md` and `CLAUDE.md` compatibility blocks are export/import surfaces for agents that do not yet integrate directly with Signal Recycler.

## Working Rules

- Keep changes scoped to the current task.
- Prefer existing repo patterns over new abstractions.
- Do not claim retrieval, context indexing, cloud sync, or owned-session behavior exists unless it is implemented and verified.
- For phase work, treat the explicit phase heading and success criteria in `docs/validation-roadmap.md` as the binding scope. Long-term product direction can inform design, but it must not rename, expand, or reorder the current phase without user approval.
- Name phase branches from the explicit phase title, not from future-phase architecture terms. Example: Phase 3 "Retrieval Before More Memory Creation" should use a retrieval-focused branch name, not an owned-session or context-envelope branch name.
- Before writing a phase spec or implementation plan, include a short "scope anchor" that quotes or paraphrases the roadmap phase goal, success criteria, and explicit out-of-scope next-phase items.
- Preserve local-first behavior by default.
- Treat memory provenance and project isolation as correctness requirements, not polish.
- When a review surfaces a residual risk, either fix it in the branch or record it in the follow-up backlog with enough detail to be actionable.

## Required End-Of-Task Documentation

After every implementation or planning task, update or create:

1. A PR review guide.
2. A follow-up backlog.

For a task branch, place these under `docs/pr-notes/` using a descriptive filename, for example:

- `docs/pr-notes/phase-2-review-guide.md`
- `docs/pr-notes/phase-2-follow-up-backlog.md`

The PR review guide must include:

- Scope summary.
- Subsystem-by-subsystem change map.
- Reviewer focus areas.
- Known non-blockers and expected warnings.
- Verification commands and results.
- Explicit out-of-scope items.

The follow-up backlog must include:

- Residual risks surfaced during implementation or review.
- Deferred cleanup that should not block the current task.
- Future phase prerequisites discovered during the task.
- Priority labels: `P0`, `P1`, `P2`.
- Concrete next action for each item.

Do not use the backlog to hide a correctness bug that should block the current PR.
