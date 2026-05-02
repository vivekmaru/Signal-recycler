# Phase 4.5 UI Design Review Guide

## Scope Summary

This branch documents the Phase 4.5 owned-session dashboard UX direction and adds the implementation plan. It does not implement UI code.

The design captures decisions from the provided mockups and reframes the dashboard as a local-first memory runtime and context control plane instead of a Codex proxy demo.

## Change Map

- `docs/superpowers/specs/2026-05-03-phase-4-5-owned-session-ux-design.md`
  - Adds the Phase 4.5 scope anchor.
  - Documents the hybrid real-data plus clearly labeled derived/demo-data strategy.
  - Defines the target information architecture.
  - Defines the main surfaces: Dashboard, Sessions, Session Detail, Memory, Context Index, Evals, New Session.
  - Records design adjustments from the mockups and open decisions before implementation planning.
- `docs/superpowers/plans/2026-05-03-phase-4-5-owned-session-ux.md`
  - Adds the implementation task breakdown.
  - Locks in route-level web module boundaries instead of growing `apps/web/src/App.tsx`.
  - Defines pure presenter helpers and tests for event, memory, and session summaries.
  - Plans the shell, dashboard, sessions, session detail, memory, context preview, eval preview, and verification sequence.
- `docs/pr-notes/phase-4-5-ui-design-follow-up-backlog.md`
  - Tracks execution risks discovered while planning.

## Reviewer Focus Areas

- Confirm the spec stays inside Phase 4.5 and does not claim Phase 5 context indexing exists.
- Confirm the hybrid data strategy is acceptable and has enough guardrails against fake product claims.
- Confirm Session Detail and Memory are prioritized above broader polish.
- Confirm terminology such as `Token delta`, `selected`, `skipped`, and `pending review` matches product direction.
- Confirm the new dashboard framing is agent-agnostic and not Codex-only.
- Confirm the implementation plan is appropriately decomposed and can be executed task-by-task.

## Known Non-Blockers

- The spec references Context Index and Evals as light or preview surfaces because the backend is not ready for full versions yet.
- The spec does not include pixel-perfect styling tokens.
- The plan intentionally avoids a frontend router dependency for Phase 4.5.
- The plan keeps Compare, Replay, Sync, and full eval report integration as disabled/preview unless backed by real APIs.

## Verification

- Documentation-only change.
- Reviewed for scope against `docs/validation-roadmap.md`.
- Checked for unsupported claims around vector retrieval, cloud sync, context indexing, and Claude Code runtime support.
- Checked implementation plan for placeholder language, type consistency, and scope coverage.

## Out Of Scope

- Implementing the UI.
- Adding backend APIs.
- Adding source indexing.
- Adding vector retrieval or reranking.
- Adding cloud sync.
