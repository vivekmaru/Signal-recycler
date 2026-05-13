# Phase 4.5 Session Detail SDK Events Review Guide

## Scope Summary

This branch keeps Phase 4.5 focused on making SDK-owned Codex sessions inspectable in the dashboard before Phase 5 context indexing starts.

It does not change the session runtime, adapter contracts, memory retrieval, or source/context indexing. It improves how existing SDK event metadata is summarized and presented in Session Detail.

## Change Map

- Web presenter layer:
  - Adds SDK event presenters for Codex thread id, SDK lifecycle, event counts, item counts, usage token totals, and compact event facts.
  - Treats multi-prompt sessions with a persisted Codex thread id as resumed/continued sessions.
- Session Detail:
  - Shows Codex thread id and SDK lifecycle in the session header when available.
  - Adds SDK event and SDK token metric tiles.
  - Keeps existing memory, retrieval, candidate, and compression metrics intact.
- Timeline:
  - Adds compact SDK badges such as `item.completed` and `agent_message` to SDK-backed timeline rows.
- Inspector:
  - Adds a structured Codex SDK facts section before raw metadata for selected SDK events.

## Reviewer Focus Areas

- Confirm the dashboard now makes SDK-owned sessions easier to audit without requiring raw JSON first.
- Confirm non-SDK sessions still render cleanly with zero SDK counts and no SDK header noise.
- Confirm resumed Signal Recycler sessions are labeled as resumed when multiple prompts share a Codex thread.
- Confirm raw metadata remains available for debugging.
- Confirm this branch does not introduce Phase 5 context indexing or change memory retrieval behavior.

## Known Non-Blockers And Expected Warnings

- SDK lifecycle is inferred from existing event metadata. A dedicated session metadata table is still deferred.
- Usage totals only appear when SDK `turn.completed` events include usage metadata.
- Session Detail still polls for events; live SSE remains a follow-up.

## Verification

- Baseline before edits:
  - `pnpm test` passed.
  - `pnpm type-check` passed.
- TDD/regression checks:
  - `pnpm --filter @signal-recycler/web test -- src/lib/sdkEventPresenters.test.ts` failed before the presenter module existed.
  - `pnpm --filter @signal-recycler/web test -- src/lib/sdkEventPresenters.test.ts` failed until multi-prompt sessions were classified as resumed.
  - `pnpm --filter @signal-recycler/web test -- src/lib/sdkEventPresenters.test.ts` passed after implementation.
- Focused checks:
  - `pnpm --filter @signal-recycler/web test -- src/lib/sdkEventPresenters.test.ts src/lib/eventPresenters.test.ts src/lib/sessionPresenters.test.ts` passed.
  - `pnpm --filter @signal-recycler/web type-check` passed.
- Full checks:
  - `pnpm test` passed.
  - `pnpm type-check` passed.
  - `pnpm build` passed.
- Local smoke:
  - Seeded a temporary local database with SDK-backed session events.
  - `SIGNAL_RECYCLER_DB=/tmp/signal-recycler-session-detail-sdk-events.sqlite pnpm dev` started API and web locally after sandbox escalation for `tsx` IPC.
  - `curl -s http://127.0.0.1:3001/health` returned `{"ok":true}`.
  - `curl -s http://127.0.0.1:5173/sessions/<session-id>` returned the Vite app shell.
  - `curl -s http://127.0.0.1:3001/api/sessions/<session-id>/events` returned the seeded SDK event metadata.
  - Browser screenshot verification was attempted, but Playwright/browser automation was not available in this session.

## Out Of Scope

- Phase 5 source/context indexing.
- Claude runtime adapter.
- full `sr chat` TUI.
- Server-sent events for live Session Detail.
- Renaming or deprecating the `codex_sdk` compatibility adapter.
