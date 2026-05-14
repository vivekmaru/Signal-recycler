# Phase 5 Context Index Planning Review Guide

## Scope Summary

This planning branch defines the implementation plan for Phase 5: Context Index. It does not implement runtime indexing yet.

The plan keeps Phase 5 aligned to the roadmap: repo docs, agent instruction files, package files, and selected source chunks should be indexed with path, line range, hash, and timestamp provenance. Source/doc chunks remain separate from durable memory.

## Change Map

- `docs/superpowers/plans/2026-05-14-phase-5-context-index.md`
  - Adds the Phase 5 scope anchor.
  - Defines SQLite FTS5/BM25 as the first local baseline.
  - Defines QMD as an optional evaluation path, not a required dependency.
  - Breaks implementation into schemas, context index store, scanner, retrieval, API routes, evals, UI, QMD evaluation, and docs.
- `docs/pr-notes/phase-5-context-index-planning-review-guide.md`
  - Documents how to review this planning PR.
- `docs/pr-notes/phase-5-context-index-planning-follow-up-backlog.md`
  - Captures residual planning risks and next actions.

## Reviewer Focus Areas

- Confirm the plan starts Phase 5, not Phase 6 compression or Phase 7 rehydration.
- Confirm source chunks are modeled separately from durable memories.
- Confirm `apps/api/src/store.ts` is not expanded further for context-index persistence.
- Confirm QMD is evaluated before vector/hybrid work, but is not a hard dependency for the first implementation.
- Confirm the plan includes measurable recall@k and precision@k evals.
- Confirm the Context Index UI will stop being memory-only once backend data exists.

## Known Non-Blockers And Expected Warnings

- QMD `docs` collection currently has 0 indexed files even though the backing path is configured.
- QMD embeddings are present, but CPU-only query/rerank behavior may be slow or unstable.
- The plan intentionally starts with line-based chunks; AST-aware chunking is deferred until after baseline evals exist.
- The plan keeps source-context injection out of the first implementation until retrieval quality is measurable.

## Verification Commands And Results

- `git status --short --branch`
  - Started from clean `main`, then created `feat/phase-5-context-index-planning`.
- `bd ready`
  - Showed Phase 4.5 leftovers plus `idea-1-9xd` QMD readiness issue.
- `qmd status`
  - QMD index is available at `/Users/vivek/.cache/qmd/index.sqlite`; embeddings are present; `docs`, `notes`, and `personal` have 0 files; `agents` has indexed files.
- `qmd collection show docs`
  - Confirms `qmd://docs` points to `/Users/vivek/Documents/wiki/docs`.
- `qmd collection show agents`
  - Confirms `qmd://agents` points to `/Users/vivek/Documents/wiki/agents`.
- `qmd search "Phase 5 Context Index Signal Recycler" -c agents -n 8`
  - No results found.
- `qmd search "Signal Recycler Phase 5 context index source indexing QMD" -c docs -n 5`
  - No results found because the docs collection has no indexed files.

## Explicit Out Of Scope

- Runtime implementation of Phase 5.
- Vector retrieval, reranking, or embeddings in Signal Recycler.
- JIT rehydration.
- Cloud sync.
- Compare/replay execution.
