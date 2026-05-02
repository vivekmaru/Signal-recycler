# Phase 3 Review Guide

Branch: `phase-3-memory-retrieval`

## Scope Summary

Phase 3 replaces "inject every approved memory" with deterministic top-k SQLite FTS5/BM25 retrieval over approved local memories before injection.

This phase does not add owned CLI sessions, repo context indexing, vector search, cloud sync, or a dashboard redesign.

## Subsystem Map

- Shared schemas: retrieval request/result types and `memory_retrieval` timeline event category.
- Store: SQLite schema version 3, `memory_fts`, search-index sync, approved-memory search.
- Retrieval service: query sanitization, top-k selection, selected/skipped decisions, duplicate-hit guard.
- Runtime integration: proxy and mock Codex runner use retrieval before playbook injection and do not fall back to inject-all on no-hit prompts.
- Audit: retrieval events plus retrieval metadata on memory injection events.
- API: retrieval preview endpoint for prompt debugging.
- Evals: retrieval precision/recall, token reduction versus inject-all, stale/superseded rejection.
- UI/docs: minimal timeline support for memory context events and README/API/roadmap documentation.

## Reviewer Focus Areas

- Retrieval must not silently fall back to injecting all approved memories.
- Store search must filter by canonical `rules` rows, not only by FTS rows.
- Superseded, rejected, pending, and cross-project memories must not be injected.
- Audit metadata must explain why selected memories were injected.
- Proxy no-hit and stopword paths should keep forwarding without injected memory.
- Mock Codex path should use the same retrieval service and emit retrieval/audit metadata.
- Evals should keep the stale-memory warning converted into a passing Phase 3 proof.
- Dashboard changes should stay limited to existing timeline rendering.

## Known Non-Blockers

- Lexical retrieval can miss vague prompts. That is acceptable before vectors and repo indexing.
- UI only needs minimal retrieval event visibility in this phase.
- Scope matching can stay conservative.
- The retrieval service has a service-level duplicate guard; consolidating that with store identity is tracked in the follow-up backlog.
- Tooling note: eval runs that write reports under `.signal-recycler/evals` can require sandbox escalation if the environment reports `EPERM`; rerun with approval rather than treating that as a product failure.

## Verification Commands

Known results from earlier Phase 3 tasks on this branch:

```bash
pnpm --filter @signal-recycler/shared type-check
pnpm --filter @signal-recycler/api test -- store.test.ts
pnpm --filter @signal-recycler/api test -- memoryRetrieval.test.ts
pnpm --filter @signal-recycler/api test -- server.test.ts
pnpm --filter @signal-recycler/api test -- retrievalEval.test.ts scenarioEval.test.ts
pnpm eval
```

`pnpm eval` latest local report: `pass`, generated `2026-05-02T00:31:11.378Z`. Retrieval suite cases passed for relevant-memory ranking, token reduction versus inject-all, superseded-memory exclusion, project isolation, and empty-query no-inject-all.

Task 7 documentation/UI verification:

```bash
pnpm --filter @signal-recycler/web type-check
pnpm --filter @signal-recycler/web build
git diff --check
```

Results:

- `pnpm --filter @signal-recycler/web type-check`: pass.
- `pnpm --filter @signal-recycler/web build`: pass.
- `git diff --check`: pass.

## Out Of Scope

- `codex exec --json` or Claude headless adapters.
- Full context-envelope/owned-session UI.
- Source/docs indexing.
- QMD integration.
- Vector/hybrid search.
- Cloud sync.
