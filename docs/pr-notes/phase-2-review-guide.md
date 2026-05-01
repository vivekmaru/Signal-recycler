# Phase 2 Review Guide

Branch: `phase-2-memory-model-audit-trail`

## Scope

Phase 2 generalizes Signal Recycler from Codex playbook rules to durable memory records with provenance and auditable injection history.

This PR does not add retrieval, context indexing, cloud sync, or owned headless agent sessions. It builds the memory and audit foundation those later phases need.

## Change Map

### Shared Types

- Adds `MemoryRecord`, memory type/scope/source/sync schemas, and memory usage schemas in `packages/shared/src/index.ts`.
- Keeps `PlaybookRule` as a compatibility alias so existing UI and playbook code can migrate gradually.
- Adds `memory_injection` as a timeline event category.

Review focus:

- Enum names match API docs.
- Existing rule-compatible flows still compile.

### Store And Migration

- Migrates SQLite schema to version `2`.
- Adds memory metadata columns to `rules`.
- Adds `memory_usages`.
- Adds project-scoped usage lookup and atomic memory injection event recording.
- Backfills extracted-rule provenance from existing `source_event_id`, including already-migrated v2 rows that still had manual provenance.

Review focus:

- Fresh DB creation.
- v1 migration.
- partially applied migration recovery.
- already-v2 provenance repair.
- reset cleanup of memory usage rows.

### Memory Creation

- Manual memories use `source.kind = "manual"`.
- Extracted memories use `source.kind = "event"` with `sessionId` and `eventId`.
- Synced compatibility imports use `source.kind = "synced_file"`.
- Legacy `/api/rules` remains available but rejects explicit non-`rule` memory types.

Review focus:

- No silent provenance loss.
- Legacy route compatibility remains intentional.

### Audit APIs

- Adds `GET /api/memories/:id/audit`.
- Returns a memory plus project-scoped usage rows.
- Adds route-level project isolation for sessions, firehose events, session events, session runs, and rule approve/reject.

Review focus:

- Cross-project memory/session/event data is not exposed or mutated.
- Audit rows are scoped by both project and memory.

### Runtime Injection Audit

- Records `memory_injection` events and usage rows for proxy and mock Codex paths.
- Proxy audit is recorded only when memory was actually injected and the upstream request was forwarded.
- Event and usage rows are recorded in a single store transaction.

Review focus:

- No false usage rows for GET/no-body/non-injectable proxy requests.
- No partial audit rows when a memory is not injectable.

### Compatibility Blocks

- Adds pure render/parse helpers for Signal Recycler blocks in `AGENTS.md` and `CLAUDE.md`.
- Does not write files automatically.
- Escapes/normalizes exported text to avoid marker or multiline injection corrupting the block.

Review focus:

- Helpers remain side-effect free.
- Exported block format is safe and parseable.

### Evals

- Adds deterministic `Memory Audit Evals`.
- Measures exact provenance coverage and usage audit coverage.
- Runs without `OPENAI_API_KEY` or live agent configuration.

Known non-blocker:

- `pnpm eval` aggregate status is `warn` because the pre-existing stale-memory scenario is intentionally warning for Phase 3. `Memory Audit Evals` itself is `pass`.

### Dashboard And Docs

- Updates visible dashboard copy from rule/playbook language to memory language where it reflects durable memory.
- Documents memory model, API enum values, memory APIs, and the compatibility/export boundary.

Review focus:

- README does not overclaim retrieval, indexing, automatic file writes, cloud sync, or owned sessions.

## Verification

Latest verification on this branch:

```bash
pnpm type-check
pnpm test
pnpm eval
git diff --check
```

Results:

- `pnpm type-check`: passed.
- `pnpm test`: passed, API `11` files and `79` tests.
- `pnpm eval`: exited `0`; aggregate status `warn` from existing stale-memory scenario; `Memory Audit Evals` status `pass`.
- `git diff --check`: passed.

## Suggested Review Order

1. `apps/api/src/store.ts` and `apps/api/src/store.test.ts`.
2. `apps/api/src/services/memoryInjection.ts` and proxy/session/rule routes.
3. `apps/api/src/server.test.ts` project isolation and audit API tests.
4. `apps/api/src/services/memorySync.ts`.
5. `apps/api/src/evals/suites/memoryAuditEval.ts`.
6. README and roadmap claims.

## Out Of Scope

- Top-k retrieval or FTS5 search.
- Source/docs context indexing.
- Automatic writes to `AGENTS.md` or `CLAUDE.md`.
- Cloud sync.
- Owned CLI sessions.
- Dashboard redesign.

