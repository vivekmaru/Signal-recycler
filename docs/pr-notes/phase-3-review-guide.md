# Phase 3 Review Guide

Branch: `phase-3-memory-retrieval`

## Scope Summary

Phase 3 plans deterministic memory retrieval before injection. The implementation should replace "inject every approved memory" with top-k SQLite FTS5/BM25 retrieval over approved memories.

This phase does not add owned CLI sessions, repo context indexing, vector search, cloud sync, or a dashboard redesign.

## Subsystem Map

- Shared schemas: retrieval request/result types and `memory_retrieval` timeline event category.
- Store: SQLite schema version 3, `memory_fts`, search-index sync, approved-memory search.
- Retrieval service: query sanitization, top-k selection, selected/skipped decisions.
- Runtime integration: proxy and mock Codex runner use retrieval before playbook injection.
- Audit: retrieval events plus retrieval metadata on memory injection events.
- API: retrieval preview endpoint for prompt debugging.
- Evals: retrieval precision/recall, token reduction versus inject-all, stale/superseded rejection.
- UI/docs: minimal timeline support and README/API documentation.

## Reviewer Focus Areas

- Retrieval must not silently fall back to injecting all approved memories.
- Store search must filter by canonical `rules` rows, not only by FTS rows.
- Superseded, rejected, pending, and cross-project memories must not be injected.
- Audit metadata must explain why selected memories were injected.
- Tests should cover both proxy and mock Codex paths.
- Evals should turn the current stale-memory warning into a passing Phase 3 proof.

## Known Non-Blockers

- Lexical retrieval can miss vague prompts. That is acceptable before vectors and repo indexing.
- UI only needs minimal retrieval event visibility in this phase.
- Scope matching can stay conservative.

## Verification Commands

Expected implementation verification:

```bash
pnpm test
pnpm type-check
pnpm build
pnpm eval
git diff --check
```

## Out Of Scope

- `codex exec --json` or Claude headless adapters.
- Full context-envelope/owned-session UI.
- Source/docs indexing.
- QMD integration.
- Vector/hybrid search.
- Cloud sync.
