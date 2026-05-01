# Signal Recycler Validation Roadmap

Date: 2026-05-01

## Executive Position

Signal Recycler is on a promising path, but the current app is narrower than the broader memory-service vision.

What exists today is a Codex-focused memory and compression proxy:

- It captures Codex traffic and dashboard runs.
- It compresses noisy Responses API input items.
- It stores sessions, events, and playbook rules in SQLite.
- It extracts reusable rule candidates from turns.
- It injects approved rules back into future Codex requests.

What does not exist yet:

- A live repo state graph.
- Dead-code or stale-documentation detection.
- Repository-wide source indexing.
- Just-in-time rehydration from a vector, FTS, or graph store.
- Objective evals proving that injected memory improves agent outcomes beyond the demo fixture.

The divergence is meaningful, not fatal. The strongest product direction is not "repo janitor that cleans everything"; it is a local-first memory runtime and context control plane for coding agents and agentic apps. That framing preserves the original insight while matching the code that already works.

## Product Direction

Decisions:

- Signal Recycler should become a general memory service for any agent or app, including Codex, Claude, Gemini, Antigravity, Cursor, and custom agent runtimes.
- The optimization order is correctness improvement first, transparent auditability second, and cost/latency reduction third. All three remain core product values.
- Local-first is the default state because it reduces setup friction and matches developer expectations.
- Cloud sync is part of the vision, but it should be additive rather than required for the local workflow.
- Signal Recycler remains the runtime source of truth for memory.
- `AGENTS.md` and `CLAUDE.md` should stay in sync as compatibility surfaces for agents that do not yet integrate with Signal Recycler directly.
- Repo hygiene is not a core feature. Context indexing is core. Hygiene findings can exist later as one diagnostic output of indexing, but they should not drive product architecture.
- Signal Recycler-owned sessions are the target product path. The API-compatible proxy is the existing v1 adapter, not the main forward roadmap unless a concrete use case asks for deeper proxy support.
- The dashboard should stay as the local control plane for launching runs, watching live events, approving memory, inspecting provenance, viewing eval results, and monitoring sync status.

## Target Runtime Architecture

Signal Recycler should have one shared memory runtime with multiple agent adapters. The preferred path is for users to start or resume agent sessions through Signal Recycler so it can rebuild the context envelope each turn instead of relying on an agent TUI's opaque internal session state.

Shared pre-run pipeline:

```text
incoming prompt/history
  -> retrieve relevant memory
  -> deterministic compression/pruning
  -> inject scoped memory and context
  -> run agent through an adapter
  -> stream/audit events
  -> post-run distill/learn/audit async
```

Existing v1 API-compatible proxy adapter:

```text
agent or app sends OpenAI-compatible request
  -> Signal Recycler proxy transforms request locally
  -> upstream model provider receives compressed/injected request
  -> response streams back through proxy
  -> request/response metadata is recorded for audit and async learning
```

Headless CLI adapter:

```text
Signal Recycler receives prompt
  -> retrieve/inject memory into prompt
  -> spawn headless CLI, e.g. `codex exec --json ...`
  -> stream JSONL events into dashboard
  -> capture final message, command events, file changes, and failures
  -> post-run distill/learn/audit async
```

The proxy adapter remains useful for API-compatible agents and custom apps, but it should be maintained as the v1 compatibility path. The headless CLI adapter and Signal Recycler-owned session flow are the next product focus because they support developer tools where users already authenticate through local subscriptions, such as Codex CLI or Claude Code, and do not want to provide a separate API key.

Post-run distillation should not block the agent run unless explicitly requested. Deterministic extraction should run first. LLM-based classification should be optional, asynchronous, and reserved for ambiguous memory extraction, conflict analysis, or high-value summaries.

Dashboard role:

- Start, resume, and compare Signal Recycler-owned sessions.
- Stream adapter events from owned-session runs and supported adapter runs.
- Show what memory/context was retrieved, pruned, injected, skipped, or rehydrated.
- Approve, reject, edit, supersede, and sync memories.
- Show provenance from injected memory back to source turns, files, docs, or manual entries.
- Display eval reports and regression history.

## Local Verification

Commands run:

```bash
pnpm test
pnpm type-check
pnpm build
SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev
pnpm smoke:demo
```

Results:

- Tests passed: 5 API test files, 19 tests.
- Type-check passed across shared, API, and web packages.
- Production build passed for shared, API, and web.
- Mock demo smoke script passed, but it used the existing local SQLite state, so it is not yet an isolated eval.

## README Truth Check

Accurate claims:

- Local OpenAI-compatible proxy exists.
- Codex SDK runner points at the local proxy.
- Compression exists for large noisy Responses API `input` items.
- Approved playbook rule injection exists.
- Manual rule creation exists.
- LLM classifier plus heuristic fallback exists.
- SQLite persistence exists.
- Dashboard shows events, rules, compression, and token-saving metrics.
- Codex CLI provider installer exists.
- Mock Codex mode exists.

Claims needing correction or qualification:

- README says classifier default is `gpt-5.4-mini`; code defaults to `gpt-5.1-mini` in `apps/api/src/classifier.ts`.
- "Every future Codex turn" is only true for traffic routed through the dashboard runner or configured proxy provider.
- "Compress noise" currently means pattern-based trimming of selected tool-output item types, not general context pruning.
- "Learn from failures" mostly means extracting explicit reusable rules; it is not broader repo understanding.
- "Project-aware operator" is aspirational unless the playbook has enough manually or automatically learned rules.

Original idea terms that should not be claimed yet:

- Live State Graph.
- Context rehydration.
- Vector-store recall.
- Dead-code pruning.
- Outdated comments or diverging documentation detection.

## Codebase Assessment

The codebase is not a mess. It is small, typed, and testable. The rushed part is product architecture, not baseline code quality.

Current shape:

- `apps/api/src/app.ts` owns too many product flows: dashboard sessions, demo orchestration, rules API, proxy transformation, and upstream forwarding.
- `apps/api/src/store.ts` is simple and works, but has no migrations, indexes, constraints, or typed persistence boundary beyond in-process functions.
- `apps/api/src/compressor.ts` is intentionally cheap and deterministic. Good for demo and safety, but too shallow to compete with command-aware compressors.
- `apps/api/src/classifier.ts` is useful, but candidate generation and confidence policy need eval-backed thresholds before auto-approval is trustworthy.
- `apps/web/src/App.tsx` is a single large dashboard component. Acceptable for hackathon, but it is now a maintainability bottleneck.
- `packages/shared/src/index.ts` has event categories that are no longer emitted, such as `proxy_injection`, which creates schema drift.

Immediate cleanup should focus on boundaries, not rewrites.

## Roadmap v1 From Local Audit

### Phase 0: Tighten Truth and Boundaries

Goal: make the project honest, stable, and easier to change.

- Update README to match implemented behavior.
- Rename product framing from "Context Hygienist" to "local-first agent memory runtime" or "agent context control plane."
- Split `apps/api/src/app.ts` into route modules or service functions:
  - sessions/run service
  - rules service
  - proxy service
  - demo service
- Add SQLite indexes and a simple migration/version table.
- Remove unused event categories or reintroduce them intentionally.
- Make `smoke:demo` use a temporary isolated database by default.

### Phase 1: Evaluation Harness

Goal: stop relying on demos as proof.

- Add deterministic unit evals for:
  - compression precision and recall
  - rule extraction precision and recall
  - injection placement and dedupe
  - project/session isolation
- Add scenario evals with fixture repos:
  - package-manager correction
  - framework convention memory
  - forbidden dependency memory
  - path ownership memory
  - stale rule conflict
- Track metrics:
  - task success delta with and without Signal Recycler
  - tokens in, tokens saved, tokens reintroduced
  - latency added by proxy/classifier/retrieval
  - false-positive rule candidates
  - false-positive auto-approvals
  - stale memory rate

### Phase 2: Deterministic Context Compression

Goal: reduce LLM cost before spending tokens on classification.

- Replace generic long-error trimming with command-aware adapters.
- Start with high-value commands:
  - `git status`
  - `git diff`
  - `rg`
  - `pnpm test` / `vitest`
  - `tsc`
  - package install logs
- Preserve raw output references so compressed summaries can be expanded later.
- Add a "loss budget": every compressor needs tests proving it keeps actionable failure lines.

### Phase 3: Memory Retrieval

Goal: inject only relevant memory, not every approved rule forever.

- Add memory fields: scope, confidence, created_at, last_used_at, source, contradiction status.
- Retrieve rules by query and repo scope before injection.
- Keep deterministic lexical retrieval first: SQLite FTS5/BM25 over rule text, category, reason, and source excerpts.
- Add vector/hybrid retrieval only after lexical retrieval has baseline evals.
- Add stale-memory handling: a new correction should supersede or invalidate an older rule.

### Phase 4: Repo Context Index

Goal: move from playbook memory to code-aware context.

- Index repo docs, `AGENTS.md`/`CLAUDE.md`, README, package files, and high-signal source files.
- Store chunk provenance: file path, line range, hash, last modified time, and git commit if available.
- Add retrieval API for "what context should be injected for this prompt?"
- Treat source files and memories differently: source context should be rehydrated by path/hash; playbook rules should be concise instructions.

### Phase 5: Rehydration

Goal: approach the original just-in-time context recovery idea without making repo hygiene a core pillar.

- When compression drops or summarizes content, store a recoverable raw reference.
- If the agent later touches a related file/path/symbol, inject a compact rehydration packet.
- Rehydrate source/doc chunks from the context index by path, symbol, hash, or prior memory provenance.
- Keep repo hygiene as a later diagnostic layer, not a primary roadmap phase.

## External Project Analysis

### RTK

RTK validates the low-cost compression direction. Its advantage is deterministic command-aware filtering, not LLM summarization. Its architecture preserves exit codes, falls back safely, tracks token savings, and applies command-specific strategies such as stats extraction, error-only output, grouping, dedupe, code filtering, and failure focus.

Decision: do not integrate RTK as a hard dependency yet. Borrow the design pattern. A future optional adapter could call `rtk` when installed, but Signal Recycler should own its own compact representation format and recovery metadata.

### QMD

QMD is closest to a practical local retrieval backend for repo/docs memory. It combines FTS5 BM25, vectors, query expansion, reranking, structured output, path context, doc IDs, line retrieval, and SQLite storage.

Decision: consider integration before building a custom retrieval stack. The best first experiment is an optional QMD-backed repo index for docs and source chunks, while keeping playbook rules in Signal Recycler's SQLite store.

### Hindsight

Hindsight is a full agent-memory system built around retain, recall, and reflect operations. It uses world facts, experiences, mental models, metadata scoping, parallel semantic/keyword/graph/temporal retrieval, RRF, reranking, and token-limit trimming.

Decision: do not integrate immediately. Hindsight is broader than this product's immediate need. Borrow the API vocabulary and eval framing: retain raw experience, recall relevant memory, reflect into durable rules.

### Honcho

Honcho focuses on stateful agents and entity-centric memory: workspaces, peers, sessions, messages, collections, documents, background reasoning, and summaries.

Decision: useful as a model for multi-agent/multi-user abstraction, but too heavy for the current local developer-tool shape. Revisit if Signal Recycler becomes a general memory service instead of a coding-agent proxy.

### Graphiti/Zep

Graphiti is relevant to the original Live State Graph ambition. Its strongest ideas are temporal validity windows, provenance from derived facts back to raw episodes, incremental graph construction, automatic invalidation of outdated facts, and hybrid retrieval across semantic, keyword, and graph traversal.

Decision: do not start here. Graph infrastructure is premature until the app has measured wins from lexical and hybrid retrieval. Borrow temporal invalidation and provenance concepts for the SQLite model first.

## Revised Roadmap After External Research

This replaces the local-audit roadmap above as the current roadmap. The earlier draft mixed phases and priorities; the project should use one ordered phase list.

### Phase 0: Tighten Truth and Boundaries

Make the current project honest, stable, and easier to change before adding larger memory infrastructure.

Success criteria:

- README accurately describes the implemented product and avoids unbuilt claims.
- `apps/api/src/app.ts` is split into clear service/route boundaries.
- SQLite has indexes and a migration/version mechanism.
- Event categories match emitted behavior.
- `smoke:demo` uses an isolated temporary database by default.
- The product name and copy position Signal Recycler as a local-first agent memory runtime, not a repo hygiene tool.
- The README documents Signal Recycler-owned sessions as the forward path and API-compatible proxy mode as the existing v1 adapter.

### Phase 1: Isolated Product Evals

Make evals the product spine before broadening the architecture.

Implementation plan: `docs/superpowers/plans/2026-05-01-phase-1-isolated-product-evals.md`.

Success criteria:

- `pnpm eval` runs local deterministic evals without OpenAI calls.
- `pnpm eval:live` runs optional adapter-backed scenarios through explicitly configured local agent CLIs.
- Reports include success delta, token delta, latency, rule precision, and stale-memory failures.
- At least one fixture proves correctness improvement from injected memory, not just cost reduction.

### Phase 2: Memory Model and Audit Trail

Generalize from Codex playbook rules to agent/app memories with provenance.

Success criteria:

- Memory records support type, scope, source, confidence, created_at, last_used_at, superseded_by, and sync status.
- Every injected memory can be traced back to a user action, agent turn, source chunk, or imported rule.
- Manual memories, extracted memories, and synced `AGENTS.md`/`CLAUDE.md` entries are represented differently.
- Signal Recycler remains runtime source of truth while file sync remains a compatibility/export layer.

### Phase 3: Retrieval Before More Memory Creation

The current app can create rules but cannot select among them well. Injection should become scoped and relevant.

Success criteria:

- Top-k retrieval over approved memories beats "inject all rules" on task success and token cost.
- Stale or superseded memories are not injected in conflict scenarios.
- Every injected memory has provenance visible in the UI/API.
- Initial retrieval uses SQLite FTS5/BM25; vectors or hybrid retrieval are added only after lexical baselines exist.

### Phase 4: Owned Session Adapter Layer

Move from Codex-specific proxy behavior toward Signal Recycler-owned sessions backed by headless CLI adapters and a general memory service API.

Success criteria:

- The existing proxy/runner path remains available but receives only maintenance-level investment unless a concrete use case requires more.
- Codex headless mode is supported through `codex exec --json` so users can rely on their existing Codex CLI authentication/subscription.
- Claude Code headless mode is evaluated as a second adapter path.
- Additional integrations can call a stable API to retain, retrieve, inject, and audit memory.
- Agent-specific adapters are thin; core memory logic is shared.
- CLI adapters stream structured events into the dashboard instead of only showing final responses.
- `AGENTS.md` and `CLAUDE.md` sync is implemented as an adapter/export path, not the primary memory store.

### Phase 4.5: Signal Recycler-Owned Session UX

Make the dashboard the primary way to run and inspect memory-managed sessions while keeping CLI entry points available.

Success criteria:

- Users can start a Codex headless session from the dashboard without entering an OpenAI API key if Codex CLI auth is already configured.
- Users can resume a Signal Recycler session and see the compact context envelope that will be sent next.
- The dashboard separates raw transcript, durable memory, retrieved context, skipped context, and rehydrated artifacts.
- The dashboard can replay or compare "with memory" versus "without memory" eval runs.
- A terminal command can launch the same owned-session flow for users who do not want to use the browser UI.

### Phase 5: Context Index

Index repository and project context because indexing is core to the vision.

Success criteria:

- Repo docs, agent instruction files, package files, and selected source chunks are indexed with path, line range, hash, and timestamp provenance.
- Prompts retrieve relevant docs/source chunks with measurable recall@k and precision@k.
- Source/doc chunks and durable memories remain separate concepts in the data model.
- Optional QMD-backed indexing is evaluated before building a custom full retrieval stack.

### Phase 6: Context Compressor With Proof

Build RTK-style deterministic compressors for high-volume command outputs. This lowers cost and latency without introducing new LLM dependency.

Success criteria:

- At least 70% token reduction on selected noisy command outputs.
- At least 95% retention of human-labeled actionable error lines.
- Less than 20ms p95 local compression overhead per request body.

### Phase 7: JIT Rehydration

Add source/docs retrieval after scoped memory retrieval works.

Success criteria:

- If compressed/pruned context is later relevant to a touched path or symbol, rehydrate the original source excerpt.
- Retrieval improves task success on fixture repo scenarios without increasing total token budget.
- Rehydration events are auditable: why this context was injected, where it came from, and what raw material it references.

### Phase 8: Cloud Sync

Add cloud sync without weakening local-first behavior.

Success criteria:

- Local SQLite continues to work without signup or network setup.
- Sync supports project/workspace identity, conflict handling, and audit history.
- Developers can choose what memory types sync.
- Cloud state never silently overrides local runtime memory.

## Evals To Add

### Local Deterministic Evals

- `compressor.eval.ts`: fixtures of command outputs with gold retained lines and target reduction ratios.
- `classifier.eval.ts`: labeled Codex-turn transcripts with expected candidate rules and expected non-rules.
- `retrieval.eval.ts`: prompts plus gold relevant rules, measuring recall@k, precision@k, and stale-rule rejection.
- `injection.eval.ts`: Responses API payload variants, ensuring instructions land in the right field and dedupe works.
- `adapter.eval.ts`: fake proxy and fake CLI adapters proving consistent memory injection, event streaming, final-response capture, and async learning hooks.
- `context-index.eval.ts`: prompts plus gold source/doc chunks, measuring context recall, precision, and efficiency.

### Agent Outcome Evals

Fixture repos should contain tasks that fail without memory and pass with correct memory:

- package manager convention
- framework-specific command
- preferred testing command
- forbidden dependency
- source ownership boundary
- context indexing and source/doc recall
- superseded rule conflict

Metrics:

- pass/fail
- number of tool calls
- wall time
- request tokens
- response tokens
- tokens saved by compression
- tokens added by memory
- candidate rule precision
- candidate rule recall
- stale rule injection count

### External Benchmark Alignment

- LongMemEval is useful for general long-term memory shape: information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.
- SWE-ContextBench is directly relevant because it tests whether programming agents reuse prior experience across related tasks and measures accuracy, time, and cost.
- ContextBench is relevant for repo context retrieval because it measures context recall, precision, and efficiency against human-annotated gold contexts.
- SWE-bench is useful later for end-to-end issue-resolution tasks, but it is too coarse for early Signal Recycler iteration unless paired with intermediate retrieval metrics.

## Tech Stack Position

Keep:

- TypeScript monorepo with pnpm workspaces.
- Fastify API.
- React/Vite dashboard.
- SQLite for local-first state.
- Zod/shared types.

Reconsider:

- `node:sqlite`: good for Node 25 locally, but document exact Node requirement and consider `better-sqlite3` or `sqlite` if broader Node LTS compatibility matters.
- OpenAI classifier in the dashboard-run hot path: keep optional, but deterministic heuristics and retrieval should handle obvious cases before spending a model call on classification.
- Single React file: split once roadmap work resumes.

Add:

- Migration layer for SQLite.
- FTS5 tables for memory retrieval.
- Eval runner and JSON/Markdown reports.
- Optional QMD integration experiment.
- Optional command-aware compressor adapters.
- Agent adapter APIs for retain, retrieve, inject, audit, and sync.
- Headless CLI process-runner abstraction with JSONL event parsing.

Avoid for now:

- Full graph database.
- Always-on vector store.
- Automatic dead-code deletion.
- Multi-agent platform abstractions.

## Resolved Product Questions

1. Signal Recycler should become a general memory service for any agent or app, not only a Codex developer tool.
2. Optimization order: correctness improvement, then transparent auditability, then cost/latency reduction.
3. Cloud sync is part of the vision, but local-first remains the default state.
4. Signal Recycler remains the runtime source of truth; `AGENTS.md` and `CLAUDE.md` are synced compatibility surfaces.
5. Repo hygiene is not a core feature. Context indexing is core.

## Sources Reviewed

- RTK: https://github.com/rtk-ai/rtk
- RTK architecture: https://github.com/rtk-ai/rtk/blob/master/ARCHITECTURE.md
- QMD: https://github.com/tobi/qmd
- Hindsight: https://github.com/vectorize-io/hindsight
- Honcho: https://github.com/plastic-labs/honcho
- Graphiti: https://github.com/getzep/graphiti
- LongMemEval: https://huggingface.co/papers/2410.10813
- SWE-ContextBench: https://huggingface.co/papers/2602.08316
- ContextBench: https://www.catalyzex.com/paper/contextbench-a-benchmark-for-context
- SWE-bench: https://www.swebench.com/SWE-bench/
