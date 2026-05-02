# Phase 4.5 UI Design Follow-Up Backlog

## P0: Convert The Design Into An Implementation Plan

Status: complete in `docs/superpowers/plans/2026-05-03-phase-4-5-owned-session-ux.md`.

Next action: choose Subagent-Driven or Inline Execution for implementation.

## P0: Avoid Unsupported Context Index Claims

Residual risk: the mockups show source chunks, embedding model, cosine score, rerank, and vector debug details that are not implemented yet.

Next action: in the implementation plan, mark Context Index as preview/read-only unless a real endpoint exists, and hide vector-specific fields until Phase 5.

## P1: Define Web Component Boundaries Before Editing `App.tsx`

Residual risk: `apps/web/src/App.tsx` is currently a large single dashboard component. A direct visual rewrite could make it harder to maintain.

Next action: plan route-level components for app shell, dashboard overview, sessions, session detail, memory table, inspector, and shared event rendering.

## P1: Add UI Smoke Coverage For Retrieval Counts

Residual risk: recent manual testing caught mismatches between retrieved and injected memory counts.

Next action: include a browser or component-level smoke that proves selected, skipped, and injected counts render consistently for a session.

## P1: Decide How Evals Are Exposed To The Web App

Residual risk: eval reports exist on disk, but the UI needs a stable way to read them without coupling directly to local filesystem assumptions.

Next action: decide whether Phase 4.5 adds a read-only eval report endpoint or defers the Evals screen to static/sample data.

## P2: Define Empty And Disabled States

Residual risk: preview surfaces can look broken if unsupported actions are visible but inert.

Next action: document and implement empty states for Compare, Replay, Context Index, Evals, Sync, and unsupported adapters.

## P1: Plan May Need Adjustment After First Web Type-Check

Residual risk: the implementation plan uses concrete snippets against a rapidly changing `apps/web` surface. Minor TypeScript shape differences may appear during execution.

Next action: during Task 1 and Task 2 execution, prefer the plan's component boundaries and test intent over copying snippets blindly if type-check exposes better local names.
