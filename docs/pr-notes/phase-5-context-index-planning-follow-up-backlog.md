# Phase 5 Context Index Planning Follow-Up Backlog

## P1: Fix Or Populate QMD Docs Collection Before QMD Comparison

Residual risk: `qmd://docs` is configured to `/Users/vivek/Documents/wiki/docs`, but `qmd status` and `qmd ls docs` show 0 indexed files.

Next action: before implementing the QMD comparison task, either add project docs to that collection or intentionally compare against `qmd://agents` only and document why.

## P1: Keep Context Index Persistence Out Of `store.ts`

Residual risk: `apps/api/src/store.ts` is already large and central. Adding context-index schema and FTS queries there would make Phase 5 harder to review and maintain.

Next action: implement context index persistence in `apps/api/src/services/contextIndexStore.ts` with its own tests.

## P1: Decide When Source Context Enters The Context Envelope

Residual risk: Phase 5 retrieval can become visible in the Context Index UI before it affects owned-session prompts.

Next action: after recall/precision evals pass, decide whether source chunks are injected in the same PR or deferred to a Phase 5.1 envelope-integration PR.

## P2: Replace Line-Based Chunking After Baseline Evals

Residual risk: line-based chunks are deterministic and simple but can split semantic code boundaries.

Next action: add AST-aware chunking only after line-based recall/precision numbers reveal concrete misses.

## P2: Add Context Index Browser Smoke

Residual risk: API and presenter tests may pass while dense Context Index retrieval rows render poorly.

Next action: run browser smoke against the Context Index page after implementation, covering empty state, indexed coverage, retrieval results, and narrow viewport layout.
