# Phase 5 Context Index Backend Baseline Follow-Up Backlog

## P1: Expose Context Index API Routes

Residual risk: the backend store/scanner/retrieval code is not reachable from the app yet.

Next action: add `GET /api/context-index/status`, `POST /api/context-index/reindex`, and `POST /api/context-index/retrieve` using the new backend services.

## P1: Add Context Index Evals

Residual risk: targeted unit tests prove behavior, but the product claim needs recall@k and precision@k eval reporting.

Next action: add `apps/api/src/evals/suites/contextIndexEval.ts` over `fixtures/context-index-repo/` and wire it into the eval runner.

## P1: Wire Dashboard Context Index View To Real Data

Residual risk: the dashboard Context Index page still cannot inspect source coverage or source-context retrieval.

Next action: after routes land, update `apps/web/src/views/ContextIndexView.tsx` and `apps/web/src/api.ts` to show status, reindex, and retrieval preview.

## P1: Decide Source Context Envelope Integration

Residual risk: Phase 5 retrieval may be measurable before it is injected into owned-session prompts.

Next action: after recall/precision evals pass, decide whether source chunks join the context envelope in Phase 5 or a Phase 5.1 PR.

## P2: Replace Line-Based Chunking If Evals Show Recall Gaps

Residual risk: line chunks are deterministic and reviewable but may split meaningful source symbols.

Next action: inspect failed eval cases before considering AST-aware or markdown-heading-aware chunking.

## P2: Revisit QMD Comparison Once Docs Collection Has Content

Residual risk: QMD is configured but `qmd://docs` was empty during planning, and query behavior has been unstable on the local LLM backend.

Next action: populate or update QMD docs, then compare QMD retrieval against Signal Recycler's SQLite FTS baseline before adding vectors or hybrid retrieval.
