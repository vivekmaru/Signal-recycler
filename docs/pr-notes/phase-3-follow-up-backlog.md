# Phase 3 Follow-Up Backlog

## P1: Dedupe Key Should Have One Owner

Residual risk: retrieval currently guards against duplicate FTS hits with a service-level `dedupeKey`, while the store owns the canonical memory rows and FTS mirror. If either side changes its idea of memory identity, duplicate selection or skipped-memory accounting can drift.

Next action: move the dedupe key into a shared store/service helper or return canonical unique memory IDs directly from store search.

## P1: Lexical Retrieval Quality And Scale Need More Fixtures

Residual risk: SQLite FTS5/BM25 is deterministic and local, but lexical matching can miss vague prompts, synonyms, and larger memory sets. Current evals prove the initial package-manager and stale-memory cases, not broad retrieval quality.

Next action: add retrieval eval fixtures for ambiguous prompts, category-only matches, longer memory lists, and prompt terms that do not appear verbatim in the rule text.

## P1: Owned Sessions Should Provide Better Retrieval Hints

Residual risk: Phase 3 retrieval is prompt-only. Owned sessions can later provide richer hints such as touched files, active package, adapter, branch, and recent tool events.

Next action: in Phase 4/4.5, pass session-derived scope hints into `retrieveRelevantMemories`.

## P1: Repo Context Index Remains Separate

Residual risk: Memory retrieval may be blamed for missing facts that are really source/docs context.

Next action: keep Phase 5 focused on source/docs indexing with separate provenance from durable memories.

## P1: Direct Mock Negative Coverage Is Thin

Residual risk: proxy tests cover no-hit and stopword retrieval paths. Mock Codex tests cover positive retrieval and audit metadata, but there is not yet a direct mock-runner regression proving no selected memory means no injected playbook block.

Next action: add a mock Codex negative test that seeds an unrelated approved memory, runs an unrelated prompt, and asserts the response/items do not contain that memory.

## P1: FTS5 Runtime Availability Needs A Startup Diagnostic

Residual risk: SQLite builds without FTS5 will fail retrieval setup. Tests catch this in local development, but the runtime should explain the missing SQLite capability clearly.

Next action: add a startup health check or migration-time diagnostic that reports FTS5 availability and the Node/SQLite build requirement.

## P2: Vector Or Hybrid Retrieval Needs Baseline Comparison

Residual risk: adding vectors too early could hide poor lexical evals and increase cost/complexity.

Next action: after Phase 3 lands, compare lexical retrieval failures against a small vector/hybrid prototype using the same eval fixtures.

## P2: Retrieval Rationale UI Can Become Richer

Residual risk: raw BM25 scores are hard for users to interpret.

Next action: after dashboard session UX work starts, show rank, matched fields, source provenance, and skip reasons in a dedicated inspector.

## P2: Future Sync And Compatibility Import Need Duplicate Policy

Residual risk: `AGENTS.md`/`CLAUDE.md` imports and future sync can create semantically duplicate memories that lexical retrieval may rank separately.

Next action: define duplicate detection and supersession behavior before adding richer sync or source-derived memory flows.
