# Context Envelope Hardening Follow-Up Backlog

## Scope Anchor

Phase 5.1 connects indexed source/doc chunks to owned-session context envelopes. This branch hardens that behavior by preventing stale source injection, adding configurable budget gates, and making injected chunks easier to inspect.

This backlog records residual work that should not block the current hardening branch.

## Completed In This Slice

Beads:

- `idea-1-j96`: stale-index safeguards before source context injection.
- `idea-1-ug2`: configurable score and character budget gates for source context envelopes.
- `idea-1-d2u`: Session Detail chunk links to the Context Index chunk inspector.

## P1: Add Reindex Prompt For Stale Context Decisions

Residual risk: stale chunks are skipped and audited, but the user still has to know to reindex manually.

Concrete next action: when `stale_index` appears in recent retrieval metadata, show a contextual reindex action or warning in Session Detail and Context Index.

## P1: Add Eval Coverage For Budget Defaults

Residual risk: the default character budgets are conservative implementation defaults, not yet calibrated against larger fixture repositories.

Concrete next action: add an eval scenario with a larger index and assert useful chunks survive while low-signal chunks are skipped.

## P2: Move Source Context Knobs Into Visible Runtime Config

Residual risk: source-context limits can be set through environment variables, but the dashboard does not expose the active values.

Concrete next action: include the effective source-context envelope config in `/api/config` and render it in the Context Index or Settings surface.

## P2: Add Tokenizer-Backed Budgeting

Residual risk: character budgets are only an approximation of model-visible token cost.

Concrete next action: after Phase 6 compression work clarifies token accounting, replace or supplement character budgets with tokenizer-backed estimates.
