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
- When using Superpowers planning workflows, follow the gates explicitly: do not create a design spec unless the brainstorming workflow calls for one, do not create the implementation plan until the spec/review gate is satisfied, and always end planning by asking whether to use Subagent-Driven or Inline Execution.
- If the user asks directly to "plan" an already-scoped phase, create the implementation plan first. Add a separate design spec only when the phase has unresolved architecture choices or the user asks for one.
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

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Codex Setup (Generated)

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.
<!-- END BEADS CODEX SETUP -->
