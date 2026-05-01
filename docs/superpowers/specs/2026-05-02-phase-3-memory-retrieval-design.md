# Phase 3 Memory Retrieval Design

## Scope Anchor

Roadmap phase: **Phase 3: Retrieval Before More Memory Creation**.

Goal: the app can already create memories, but it cannot select among them well. Injection should become scoped and relevant.

Success criteria:

- Top-k retrieval over approved memories beats "inject all rules" on task success and token cost.
- Stale or superseded memories are not injected in conflict scenarios.
- Every injected memory has provenance visible in the UI/API.
- Initial retrieval uses SQLite FTS5/BM25; vectors or hybrid retrieval are added only after lexical baselines exist.

Explicitly out of scope:

- Headless Codex or Claude owned-session adapters.
- Repo source/docs indexing.
- Vector search.
- QMD integration.
- Cloud sync.
- Dashboard redesign.

## Design Summary

Phase 3 adds a deterministic memory retrieval layer between prompt intake and playbook injection. Runtime paths that currently call `listApprovedRules(projectId)` for injection will instead ask a retrieval service for the top relevant approved memories. The service uses SQLite FTS5/BM25 over existing memory fields and filters out rejected, pending, superseded, cross-project, and scope-ineligible records before injection.

The implementation keeps the existing `rules` table as the memory source of truth. A new FTS5 virtual table mirrors searchable memory text for retrieval. Store methods keep the search table in sync when memories are created, approved, rejected, or superseded.

## Data Model

Add schema version `3` with a new FTS5 table:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  memory_id UNINDEXED,
  project_id UNINDEXED,
  category,
  rule,
  reason,
  source_text,
  tokenize = 'porter unicode61'
);
```

The table mirrors searchable text only. Injection eligibility remains enforced by the canonical `rules` row:

- `project_id` matches the current project.
- `status = 'approved'`.
- `superseded_by IS NULL`.

## Retrieval Service

Create `apps/api/src/services/memoryRetrieval.ts`.

Inputs:

- `projectId`
- prompt/query text
- optional `limit`, default `5`
- optional scope hints, derived from prompt text for Phase 3

Outputs:

- selected memories with score, rank, and match metadata
- skipped memories with reason, where useful for audit/debug
- metrics: approved memory count, selected count, skipped count, retrieval query

Ranking:

1. Query SQLite FTS5 with sanitized terms from the prompt.
2. Use `bm25(memory_fts, ...)` as the base rank.
3. Apply deterministic boosts for:
   - high confidence
   - exact category match in prompt
   - scope value appearing in prompt
   - recently used memories only as a tie-breaker
4. Return top-k approved, non-superseded memories.

If the query has no searchable terms, retrieval returns no memories instead of injecting all memories. This is intentionally conservative and measurable.

## Runtime Integration

### Proxy Adapter

`apps/api/src/routes/proxy.ts` currently injects all approved rules into proxied request bodies. Phase 3 changes it to:

1. Extract prompt text from `input`, `messages`, or `instructions`.
2. Retrieve top-k memories for that text.
3. Inject only selected memories.
4. Emit a `memory_retrieval` event.
5. Record `memory_injection` audit metadata with retrieval scores and skipped reasons.

### Mock Codex Runner

`apps/api/src/codexRunner.ts` currently injects all approved rules in mock mode. Phase 3 changes it to retrieve memories from the prompt before injection, so deterministic demos and server tests exercise the same selection policy as proxy traffic.

### Preview API

Add a lightweight preview endpoint:

```text
POST /api/memory/retrieve
```

Request:

```json
{
  "prompt": "Validate the repo and run the right package manager command.",
  "limit": 5
}
```

Response:

```json
{
  "query": "Validate the repo and run the right package manager command.",
  "selected": [],
  "skipped": [],
  "metrics": {
    "approvedMemories": 0,
    "selectedMemories": 0,
    "skippedMemories": 0
  }
}
```

This is a retrieval preview, not the owned-session context-envelope system. Owned sessions remain Phase 4/4.5.

## Audit And UI

Add `memory_retrieval` as a timeline event category. Its metadata should include:

- retrieval query
- selected memory IDs
- selected score/rank/reason
- skipped memory IDs and skip reasons where available
- configured limit

Existing `memory_injection` events remain the durable proof of what was actually injected. Phase 3 expands their metadata to include retrieval decisions so a user can trace from injected memory back to source/provenance and retrieval rationale.

Dashboard changes should stay small:

- show `memory_retrieval` events in the existing timeline
- show selected/skipped counts in event details
- keep full dashboard redesign out of scope

## Evals

Add `retrieval.eval.ts` and include it in `pnpm eval`.

Required cases:

- relevant memory is selected over unrelated approved memory
- top-k retrieval adds fewer tokens than inject-all
- superseded memory is not selected
- cross-project memory is not selected
- no-query fallback does not inject every memory

Update the existing stale-memory scenario from a Phase 3 warning into a passing case once superseded memory is rejected by retrieval/injection.

## Risks

- SQLite FTS5 availability may differ by runtime build. The implementation should fail fast in tests and expose a clear server startup error if FTS5 is unavailable.
- BM25 scores are not intuitive to users. UI/API should expose rank and reason labels rather than raw scores alone.
- Prompt-only lexical retrieval can miss relevant memories when the user prompt is vague. That is acceptable for Phase 3 and should be measured before adding vectors or repo indexing.
- Scope matching can become complex. Phase 3 should implement conservative project/path/package/file scope filtering and defer richer repo context to Phase 5.
