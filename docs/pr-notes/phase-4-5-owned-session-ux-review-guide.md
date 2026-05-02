# Phase 4.5 Owned Session UX Review Guide

## Scope Anchor

Roadmap phase: Phase 4.5, "Signal Recycler-Owned Session UX".

Goal: make the dashboard the primary way to run and inspect memory-managed sessions while keeping CLI entry points available.

Success criteria covered by this implementation pass:

- Dashboard-owned session launch with adapter selection.
- Session inspection surfaces for transcript events, durable memory candidates, retrieved and skipped context metadata, and context-envelope preview.
- Memory review surfaces backed by local durable memory records and memory audit data.
- Preview-only Context Index and Evals screens that do not claim Phase 5 source indexing or connected eval reports.

Phase 4.5 is not complete after this PR. This is the owned-session dashboard foundation pass. Remaining Phase 4.5 success criteria are tracked as follow-up work: Codex CLI-auth dashboard launch polish, resumable next-envelope previews, terminal-owned session launch, and backed compare/replay execution.

Explicit deferred items remain out of scope for this PR: Phase 5 source indexing, vector retrieval, cloud sync, full compare/replay execution, terminal-owned session launch, and connected eval report loading.

## Scope Summary

Phase 4.5 replaces the old hackathon dashboard framing with a local-first owned-session control plane. The web app now presents route-level surfaces for Dashboard, Sessions, Session Detail, Memory Review, Context Index preview, Evals preview, Sync placeholder, and Settings placeholder.

Task 9 also scanned `apps/web/src/App.tsx` for obsolete old UI strings and code. No matches were found for `Codex traffic`, `Run end-to-end demo`, `Use from your terminal`, or old approved-memory side panel wording, so no App cleanup was needed in this task.

## Subsystem-By-Subsystem Change Map

- App shell and routing: `apps/web/src/App.tsx`, `apps/web/src/components/AppShell.tsx`, and `apps/web/src/types.ts` coordinate local route state, navigation counts, new-session modal state, selected session state, and route placeholders without adding a frontend router dependency.
- API client: `apps/web/src/api.ts` exposes dashboard data, configured adapters, session creation/run, per-session events, memory audit, memory review actions, and retrieval preview helpers used by the route views.
- Dashboard and sessions: `apps/web/src/views/DashboardView.tsx`, `apps/web/src/views/SessionsView.tsx`, and `apps/web/src/lib/sessionPresenters.ts` summarize runtime activity from local sessions, events, and durable memory.
- Session detail: `apps/web/src/views/SessionDetailView.tsx`, `apps/web/src/components/Timeline.tsx`, `apps/web/src/components/InspectorPanel.tsx`, and `apps/web/src/lib/eventPresenters.ts` show complete per-session event history from `/api/sessions/:id/events`, candidate memory groups, context-envelope retrieval details including selected/skipped ids and reasons, and preview-only disabled actions for unsupported replay/compare workflows.
- Memory review: `apps/web/src/views/MemoryView.tsx`, `apps/web/src/lib/memoryPresenters.ts`, and shared inspector components list local durable memories, filter by status including superseded records, load memory audit data, and disable mutation actions for superseded rows in the UI.
- Context Index preview: `apps/web/src/views/ContextIndexView.tsx` calls the implemented memory retrieval preview endpoint and explicitly avoids source chunks, embeddings, vector scores, and reranking claims.
- Evals preview: `apps/web/src/views/EvalsView.tsx` is read-only and states that no eval report endpoint is connected.
- Shared UI primitives: `apps/web/src/components/Badge.tsx`, `Button.tsx`, `MetricTile.tsx`, `apps/web/src/lib/format.ts`, and `apps/web/src/styles.css` support the dense review-oriented layout.
- Presenter tests: `apps/web/src/lib/eventPresenters.test.ts`, `memoryPresenters.test.ts`, and `sessionPresenters.test.ts` cover UI-facing aggregation and formatting behavior.
- PR notes: this review guide and `docs/pr-notes/phase-4-5-owned-session-ux-follow-up-backlog.md` consolidate implementation verification and residual risks from the Phase 4.5 review loops.

## Reviewer Focus Areas

- Confirm the UI does not claim source/vector retrieval, source indexing, cloud sync, compare/replay execution, or connected eval reports beyond what is implemented.
- Confirm Session Detail treats `/api/sessions/:id/events` as authoritative for complete detail history instead of capped dashboard firehose rows.
- Confirm durable memory provenance, audit, status, supersession, and project isolation remain visible enough for review.
- Confirm Context Index remains an honest memory retrieval preview and does not imply Phase 5 repository source indexing.
- Confirm disabled or preview-only controls are visibly unavailable and do not look like failed actions.
- Confirm App shell copy now frames Signal Recycler as the memory runtime/control plane, not a Codex traffic proxy demo.

## Known Non-Blockers And Expected Warnings

- Session Detail refreshes full events through refetching and firehose-count triggers; it is not a streaming subscription.
- Terminal-owned session launch remains a Phase 4.5 follow-up. The implemented New Session flow is dashboard-owned.
- Compare/replay controls are visible but disabled preview controls; real execution remains a Phase 4.5 follow-up.
- Session Detail can inspect loaded memory records, but usage audit history is currently surfaced in Memory Review rather than inside Session Detail.
- Memory mutation hardening for superseded records is enforced in the UI, but the API should also reject direct approve/reject mutation attempts for superseded records.
- Evals is intentionally preview-only because no web eval report endpoint is connected.
- Context Index is intentionally retrieval-preview-only until Phase 5 source indexing exists.
- Local dev/API smoke passed with `SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev`, but visual browser screenshot smoke was not run because the repo does not include a Playwright/browser automation binary.
- The new-session modal does not yet implement full focus trap and escape-key polish.

## Verification Commands And Results

- `pnpm --filter @signal-recycler/web test`: passed. Vitest reported 3 test files passed and 12 tests passed.
- `pnpm --filter @signal-recycler/web type-check`: passed. `tsc -p tsconfig.json --noEmit` exited 0 for `apps/web`.
- `pnpm test`: passed. Workspace test run reported `packages/shared` no tests with `--passWithNoTests`, `apps/web` 3 files and 12 tests passed, and `apps/api` 17 files and 137 tests passed.
- `pnpm type-check`: passed. Workspace type-check completed for `packages/shared`, `apps/web`, and `apps/api`.
- `pnpm build`: passed. Workspace build completed for `packages/shared`, `apps/api`, and `apps/web`; Vite built 1718 modules and emitted `dist/index.html`, `dist/assets/index-CvF7CtH7.css`, and `dist/assets/index-CnOrrsz1.js`.
- `rg -n "Codex traffic|Run end-to-end demo|Use from your terminal|approved-memory|approved memory|Approved memory|Approved Memory" apps/web/src/App.tsx`: no matches. Command exited 1 because ripgrep found no obsolete strings.
- `SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev`: passed for local serving. Vite served `http://127.0.0.1:5173/`, the API served `http://127.0.0.1:3001`, and `/health` returned `{"ok":true}`.
- Local mock session smoke: passed. A mock session run returned 5 complete session events from `/api/sessions/:id/events`, including `codex_event`, `memory_retrieval`, `memory_injection`, and `classifier_result`.
- Local retrieval preview smoke: passed. `POST /api/memory/retrieve` for a validation prompt returned `approvedMemories: 2`, `selectedMemories: 1`, `skippedMemories: 1`, and `limit: 5`.
- Visual screenshot smoke: not run. `pnpm exec playwright screenshot` failed because the workspace does not provide a `playwright` binary.

## Explicit Out-Of-Scope Items

- Phase 5 repository/source context indexing with path, line range, hash, timestamp, embeddings, vector search, cosine score, or reranking.
- Cloud sync, remote memory storage, or owned-session cloud runtime behavior.
- Terminal-owned session launch and lifecycle UX.
- Full compare/replay execution for "with memory" versus "without memory" eval runs.
- Full Phase 4.5 completion. This PR is the dashboard foundation pass, not the terminal launch or compare/replay execution pass.
- Connected eval report loading through a stable web endpoint.
- Streaming Session Detail event updates.
- Session Detail memory usage audit history.
- Backend API hardening for direct superseded-memory mutation attempts.
- Browser/mobile layout smoke and modal focus polish.
