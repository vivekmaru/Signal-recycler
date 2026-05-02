# Phase 4 Owned Session Adapter Layer Review Guide

## Scope Summary

Phase 4 adds the owned-session adapter layer while preserving the existing proxy and Codex SDK compatibility path. The branch introduces a shared context envelope for memory retrieval and injection, adapter selection through a registry, an opt-in Codex CLI adapter, stable memory retain/retrieve APIs, and a Claude Code headless adapter evaluation document. Claude Code is evaluated only; no Claude Code runtime adapter is implemented.

## Subsystem-By-Subsystem Change Map

- Shared API contract: adds adapter selection to session run input while keeping `default` as the route-facing default selection.
- Context envelope: centralizes memory retrieval, playbook injection, and memory usage audit events so adapter implementations do not each duplicate retrieval/injection behavior.
- Adapter registry: adds built-in mock resolution, configurable default adapter selection, explicit missing-adapter errors, and server startup wiring.
- Codex SDK adapter: wraps the existing SDK/proxy-compatible runner as `codex_sdk` and preserves the legacy `createCodexRunner` export surface, mock-mode behavior, proxy base URL handling, optional API key handling, session/workdir thread keys, and Phase 3.1 retrieval hardening.
- Codex CLI adapter: adds an opt-in `codex_cli` adapter behind `SIGNAL_RECYCLER_CODEX_CLI=1`, shells out to `codex exec --json`, uses local CLI auth, records bounded JSONL output as session timeline events, and does not require `OPENAI_API_KEY` for the agent run.
- Session routes and app/server construction: pass an app-provided adapter registry into session turns, keep `codex_sdk` as the default adapter, and preserve compatibility fallbacks for callers/tests that do not provide a registry.
- Memory service API: adds stable `POST /api/memory/retain` alongside existing `POST /api/memory/retrieve`; retain creates approved local memories with API import provenance.
- Claude Code evaluation: adds `docs/research/claude-code-headless-adapter-evaluation.md` as the decision gate for a future Claude Code adapter.
- README and tests: document adapter usage and memory APIs, with coverage for registry resolution, SDK compatibility, CLI JSONL parsing/events, memory retain/retrieve behavior, and Phase 3.1 classifier/proxy hardening.

## Reviewer Focus Areas

- Confirm memory retrieval, injection, and usage audit behavior are shared through the context envelope rather than duplicated per adapter.
- Confirm proxy and Codex SDK compatibility are preserved, including mock-mode audit events, proxy retrieval hardening, and legacy runner imports.
- Confirm the Codex CLI adapter is opt-in, never selected by default, and does not require `OPENAI_API_KEY` for the agent run.
- Confirm Codex CLI JSONL events are visible as session events with bounded raw metadata and stderr/body retention.
- Confirm Phase 3.1 classifier/proxy hardening remains intact: classifier requests bypass retrieval/injection, proxy retrieval uses user task text, existing playbook blocks are stripped, and no-hit/stopword retrieval does not inject all memories.
- Confirm memory retain creates approved local memories with explicit API import provenance and does not change retrieval scoring.

## Known Non-Blockers And Expected Warnings

- Claude Code has been evaluated with a documented decision gate, but no Claude Code runtime adapter is implemented.
- Dashboard UX for adapter selector, context envelope preview, and event filters is deferred to Phase 4.5.
- CLI resume semantics are deferred.
- Real authenticated Codex CLI smoke is optional; automated coverage uses parser and mocked process behavior.
- Legacy non-registry fallback paths remain for compatibility with existing callers and tests.

## Verification Commands And Results

- `pnpm test`: passed. Workspace tests completed; API suite reported 17 files and 132 tests passed. Shared and web packages had no test files and exited successfully with `--passWithNoTests`.
- `pnpm type-check`: passed across shared, API, and web packages.
- `pnpm build`: passed across shared, API, and web packages; Vite production build completed for web.
- `git diff --check`: passed with no whitespace errors.
- Temporary API for memory smoke: started on `http://127.0.0.1:4317` with `PORT=4317`, `SIGNAL_RECYCLER_MOCK_CODEX=1`, and `SIGNAL_RECYCLER_DB=/private/tmp/signal-recycler-phase-4-smoke.sqlite`. Initial sandboxed start failed with `EPERM` on the `tsx` IPC pipe, then passed when run with approved escalation.
- `SIGNAL_RECYCLER_API_URL=http://127.0.0.1:4317 pnpm smoke:memory`: passed when run against the temporary API. The sandboxed first attempt could not connect to local port 4317 (`connect EPERM`), then passed with approved escalation. Result: one package-manager memory selected and injected, zero candidate rules.
- Temporary API shutdown: completed; no process remained listening on port 4317.

## Explicit Out-Of-Scope Items

- Repo context index.
- Context envelope preview UI.
- JIT rehydration.
- Cloud sync.
- Claude Code runtime adapter.
