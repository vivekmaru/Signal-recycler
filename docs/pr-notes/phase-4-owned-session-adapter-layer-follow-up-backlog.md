# Phase 4 Owned Session Adapter Layer Follow-Up Backlog

## P1 Claude Code Adapter Implementation

Residual risk: Claude Code support is easy to over-claim because Phase 4 only includes evaluation, not a runtime adapter.

Next action: complete the command/event/auth/cwd checks in `docs/research/claude-code-headless-adapter-evaluation.md`, then implement a Claude Code adapter behind an explicit opt-in flag only after structured event behavior is verified.

## P1 Phase 4.5 Dashboard UX

Residual risk: the backend can select adapters and emit context/CLI events, but the dashboard does not yet provide an adapter selector, context envelope preview, or event filters tailored to owned sessions.

Next action: scope Phase 4.5 UI work for adapter selection, context envelope preview, and filtering of retrieval/injection/Codex CLI event categories without changing Phase 4 runtime contracts.

## P1 Optional Real Codex CLI Integration Smoke

Residual risk: automated tests cover parser behavior and mocked child-process execution, but they do not prove a locally installed authenticated Codex CLI emits the same stable JSONL shapes.

Next action: add an env-guarded smoke, disabled by default, that runs only when local Codex CLI auth is available and an explicit environment variable opts in.

## P1 Codex CLI Chunk-Boundary Coverage

Residual risk: adapter tests cover JSONL parsing, event persistence failure, retained item caps, and stderr truncation, but they do not explicitly split one JSON line across multiple stdout chunks.

Next action: add a mocked child-process test for chunked stdout parsing if future changes touch stream buffering or parser retention.

## P2 Session Resume Semantics

Residual risk: owned-session adapter selection and event capture exist, but resume semantics for CLI-backed sessions are not defined.

Next action: design resume behavior after adapter event models stabilize, including what state belongs to Signal Recycler versus the underlying CLI.

## P2 Shared Retrieval Summary Helper Cleanup

Residual risk: Phase 4 keeps retrieval/injection behavior shared, but review notes flagged possible helper overlap around retrieval summaries and adapter-facing metadata.

Next action: when the next retrieval or context-envelope change lands, consolidate repeated retrieval summary formatting into a single helper without changing event metadata shape.

## P2 Configurable Retain Source Labels

Residual risk: `POST /api/memory/retain` records source kind `import` with the fixed label `api`, which proves API import provenance but does not distinguish individual future integrations.

Next action: decide whether a future authenticated integration layer should accept a constrained integration label while preserving local auditability and project isolation.
