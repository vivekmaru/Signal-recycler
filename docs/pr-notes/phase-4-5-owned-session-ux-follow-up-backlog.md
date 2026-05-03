# Phase 4.5 Owned Session UX Follow-Up Backlog

## P1: Stream Or Poll Complete Session Detail Events

Residual risk: Session Detail refetches complete events when the selected session changes, retry is clicked, or the dashboard event identity changes. It is not a streaming detail subscription.

Next action: add a detail-route polling or server-sent event strategy that always uses `/api/sessions/:id/events` as the complete source of truth and backs off when the session is no longer active.

## P1: Add Incremental Overview Event Summaries

Residual risk: Dashboard and Sessions overview polling intentionally uses a bounded project firehose to keep refresh cost stable. Older sessions can therefore have less precise derived summaries in the overview than in Session Detail.

Next action: add a local summary endpoint or cursor-based event delta API that returns stable per-session lifecycle, memory, and token aggregates without polling all historical events every 1.5 seconds.

## P1: Terminal-Owned Session Launch

Residual risk: Phase 4.5 now has dashboard-owned session launch, but it does not yet provide a terminal-first owned-session launch flow that can be used naturally from a developer shell.

Next action: design and implement a CLI entry point that creates a Signal Recycler-owned session, assembles the context envelope, launches the selected agent adapter, streams events into the dashboard, and records post-run learning.

## P1: Real Compare And Replay Execution

Residual risk: Session Detail shows disabled Compare and Replay controls, but there is no backed execution path for comparing with-memory versus without-memory runs or replaying a prior session.

Next action: design the compare/replay contract, capture the artifacts needed for deterministic replay where possible, and expose results through Session Detail only when backed by real run data.

## P1: Session Detail Memory Audit Integration

Residual risk: Memory Review loads recorded local injection usage, but Session Detail memory selections still show only durable memory properties and point users to the Memory view for usage audit.

Next action: reuse the Memory Review audit data model in Session Detail when a memory is selected from a candidate or injection event.

## P1: Harden Superseded Memory Mutation At The API Boundary

Residual risk: the Memory Review UI disables approve/reject actions for superseded records, but a direct API caller may still attempt mutation unless the backend rejects it explicitly.

Next action: add server-side guards and regression tests for approving or rejecting superseded memory records. Return a clear 4xx error and keep the durable memory record unchanged.

## P2: Run Visual Browser And Mobile Layout Smoke

Residual risk: unit tests, type-check, build, and local dev/API smoke pass, but desktop and narrow viewport rendering were not screenshot-tested because the workspace does not include a Playwright/browser automation binary.

Next action: add a browser automation dependency or use the available in-app browser, then run a visual smoke covering Dashboard, Sessions, Session Detail, Memory Review, Context Index preview, Evals preview, New Session modal adapter filtering, and dense selected/skipped retrieval metadata at desktop and mobile widths.

## P2: Add Adapter Availability UI Coverage

Residual risk: `/api/config` now exposes available adapters and the New Session modal filters unavailable adapters, but this behavior is covered by API/type/build checks rather than a component or browser test.

Next action: add a lightweight UI test or browser smoke that starts without `SIGNAL_RECYCLER_CODEX_CLI=1` and verifies the Codex CLI option is absent, then starts with the flag and verifies the option is present.

## P2: Add Registry Availability Tests

Residual risk: `listAvailable()` currently reflects registry construction and always includes `default`, which matches current server wiring. Future alternate default-adapter wiring could accidentally expose a default that resolves to an unavailable adapter.

Next action: add direct tests for `createAgentAdapterRegistry().listAvailable()` that cover default resolution, optional Codex CLI registration, and unavailable adapter exclusion.

## P1: Add A Stable Eval Report Endpoint

Residual risk: Evals is preview-only and cannot display local eval report output through the web app.

Next action: design and add a read-only local endpoint for eval report summaries, then update `EvalsView` to display only fields backed by that endpoint.

## P1: Implement Phase 5 Source Indexing

Residual risk: Context Index currently previews implemented memory retrieval only. It does not index repository docs, agent instruction files, package files, or selected source chunks.

Next action: in Phase 5, implement source indexing with path, line range, hash, timestamp provenance, project isolation, and an honest UI that distinguishes durable memory retrieval from source-context retrieval.

## P2: Polish New Session Modal Focus Behavior

Residual risk: the modal has functional controls but does not yet provide a full focus trap, escape-key close behavior, or focus restoration to the opener.

Next action: add focus management tests and implement focus trap, escape handling, and opener focus restoration without changing the owned-session run flow.

## P2: Compact Candidate Lifecycle Rows

Residual risk: Session Detail dedupes candidate lifecycle events by durable rule id, but grouped candidates are still represented by badges and explanatory copy rather than a compact lifecycle table.

Next action: replace repeated lifecycle badges with a small event table if review feedback shows the current card format is hard to scan.
