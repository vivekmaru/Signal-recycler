# Signal Recycler Validation Report

Based on a review of `ROADMAP.md`, `docs/validation-roadmap.md`, and the current codebase (`apps/api`, `apps/web`, `apps/cli`), here is the validation against the project idea and roadmap.

### 1. Is the project on correct path?
Yes, but the vision has pivoted and expanded.
According to `docs/validation-roadmap.md`, the original `ROADMAP.md` was too narrow (primarily a Codex-focused proxy). The new target architecture correctly frames Signal Recycler as a general **"local-first memory runtime and context control plane for coding agents and agentic apps"**. It introduces a unified "Owned Session" adapter layer to support multiple agents (Codex CLI, Claude) rather than just proxying API traffic.

The core priorities—correctness improvement, transparent auditability, and cost/latency reduction—are intact and actively driving the recent Phase 4 and Phase 5 work.

### 2. What % of project is completed?
Approximately **70-75%**.
Based on the `docs/validation-roadmap.md`, the project defines 9 main phases (Phase 0 through Phase 8).

**Completed (6 / 9 main milestones):**
- **Phase 0:** Tighten Truth and Boundaries
- **Phase 1:** Isolated Product Evals
- **Phase 2:** Memory Model and Audit Trail
- **Phase 3:** Retrieval Before More Memory Creation (including 3.1 Hardening)
- **Phase 4:** Owned Session Adapter Layer (and Phase 4.5 UX)
- **Phase 5:** Context Index (including 5.1 Source Context Envelopes)

**Remaining (3 milestones):**
- **Phase 6:** Context Compressor With Proof
- **Phase 7:** JIT Rehydration
- **Phase 8:** Cloud Sync

### 3. Has current work skipped something?
Yes, a few discrepancies exist between the legacy documentation and recent architectural pivots:
- **`ROADMAP.md` Disconnect:** Several planned items in `ROADMAP.md` have been bypassed or superseded. For example, `pnpm playbook:sync` is not a standalone command; it has been conceptually replaced by `memorySync.ts` and compatibility block importing/exporting for `AGENTS.md`/`CLAUDE.md`. Items like "VS Code sidebar extension" and "Passive observation mode" are not currently tracked in the active `validation-roadmap.md`.
- **Phase 6 Context Compressors:** While there is a basic regex-based text compressor in `apps/api/src/compressor.ts`, it does not yet implement the Phase 6 requirement for **RTK-style deterministic, command-aware compressors** (e.g., specifically targeting `git diff`, `vitest`, or `pnpm test`). Phase 6 is still pending.
- **Phase 4.5 Polish:** According to PR notes (`docs/pr-notes/phase-4-5-owned-session-ux-review-guide.md`), several UX items like "terminal-owned session launch" and "compare/replay real execution" remain disabled previews or follow-up tasks.

### 4. Any open questions / suggestions?
1. **Deprecate or update `ROADMAP.md`:** It conflicts with `docs/validation-roadmap.md` and might confuse contributors about the pivot to a general memory service.
2. **Phase 4.5 Follow-ups:** Should the pending Phase 4.5 dashboard polish (e.g., compare/replay execution) be finished before starting the Phase 6 compression work?
3. **Fix the Test Fixture:** The test suite currently fails on `fixtures/context-index-repo/apps/web/src/auth.test.ts` due to missing `test` and `expect` vitest imports, which consequently causes several `server.test.ts` context-index tests to fail since the indexer crashes or skips the broken fixture.
