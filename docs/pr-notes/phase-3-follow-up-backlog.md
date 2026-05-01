# Phase 3 Follow-Up Backlog

## P1: Owned Sessions Should Provide Better Retrieval Hints

Residual risk: Phase 3 retrieval is prompt-only. Owned sessions can later provide richer hints such as touched files, active package, adapter, branch, and recent tool events.

Next action: in Phase 4/4.5, pass session-derived scope hints into `retrieveRelevantMemories`.

## P1: Repo Context Index Remains Separate

Residual risk: Memory retrieval may be blamed for missing facts that are really source/docs context.

Next action: keep Phase 5 focused on source/docs indexing with separate provenance from durable memories.

## P2: Vector Or Hybrid Retrieval Needs Baseline Comparison

Residual risk: adding vectors too early could hide poor lexical evals and increase cost/complexity.

Next action: after Phase 3 lands, compare lexical retrieval failures against a small vector/hybrid prototype using the same eval fixtures.

## P2: Retrieval Rationale UI Can Become Richer

Residual risk: raw BM25 scores are hard for users to interpret.

Next action: after dashboard session UX work starts, show rank, matched fields, source provenance, and skip reasons in a dedicated inspector.

## P2: FTS5 Runtime Availability Should Be Documented

Residual risk: SQLite builds without FTS5 would fail retrieval setup.

Next action: document the expected Node/SQLite runtime and add a startup diagnostic if tests reveal environment variance.
