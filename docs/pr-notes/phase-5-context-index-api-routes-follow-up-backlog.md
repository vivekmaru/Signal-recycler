# Phase 5 Context Index API Routes Follow-Up Backlog

## P1: Wire Dashboard Context Index View To API Routes

Residual risk: users cannot yet inspect indexed coverage or source-context retrieval from the dashboard.

Next action: update `apps/web/src/api.ts` and `apps/web/src/views/ContextIndexView.tsx` to call status, reindex, and retrieve routes with honest loading, empty, error, and result states.

## P1: Add Context Index Evals

Residual risk: route tests prove the API surface works, but Phase 5 product claims need measurable recall and precision.

Next action: add `apps/api/src/evals/suites/contextIndexEval.ts` over `fixtures/context-index-repo/` and report recall@k, precision@k, and token/context efficiency.

## P1: Decide Source Context Envelope Integration

Residual risk: source chunks can now be retrieved through the API, but owned sessions still inject durable memories only.

Next action: after context-index evals pass, decide whether source chunks enter the owned-session context envelope in Phase 5 or a smaller Phase 5.1 PR.

## P2: Add Incremental Reindex Or Watch Mode

Residual risk: `POST /api/context-index/reindex` performs full-project replacement, which is simple and auditable but may become slow on large repos.

Next action: after dashboard usage lands, add an incremental path-level reindex path that passes scanner `paths` into store `replacedPaths`.

## P2: Add FTS5 Availability Health

Residual risk: SQLite builds without FTS5 support will fail context indexing at runtime.

Next action: expose context-index FTS5 readiness through `/health` or `/api/config` before treating context indexing as always available in the UI.
