# Phase 4.5 Owned Session UX Follow-Up Backlog

## P1: Stream Or Poll Complete Session Detail Events

Residual risk: Session Detail refetches complete events when the selected session changes, retry is clicked, or the capped dashboard firehose count changes. It is not a streaming detail subscription.

Next action: add a detail-route polling or server-sent event strategy that always uses `/api/sessions/:id/events` as the complete source of truth and backs off when the session is no longer active.

## P1: Harden Superseded Memory Mutation At The API Boundary

Residual risk: the Memory Review UI disables approve/reject actions for superseded records, but a direct API caller may still attempt mutation unless the backend rejects it explicitly.

Next action: add server-side guards and regression tests for approving or rejecting superseded memory records. Return a clear 4xx error and keep the durable memory record unchanged.

## P2: Run Browser And Mobile Layout Smoke

Residual risk: unit tests, type-check, and build pass, but desktop and narrow viewport rendering were not smoke-tested in this task because no long-lived dev server was started.

Next action: run a local browser smoke covering Dashboard, Sessions, Session Detail, Memory Review, Context Index preview, Evals preview, and New Session modal at desktop and mobile widths.

## P1: Add A Stable Eval Report Endpoint

Residual risk: Evals is preview-only and cannot display local eval report output through the web app.

Next action: design and add a read-only local endpoint for eval report summaries, then update `EvalsView` to display only fields backed by that endpoint.

## P1: Implement Phase 5 Source Indexing

Residual risk: Context Index currently previews implemented memory retrieval only. It does not index repository docs, agent instruction files, package files, or selected source chunks.

Next action: in Phase 5, implement source indexing with path, line range, hash, timestamp provenance, project isolation, and an honest UI that distinguishes durable memory retrieval from source-context retrieval.

## P2: Polish New Session Modal Focus Behavior

Residual risk: the modal has functional controls but does not yet provide a full focus trap, escape-key close behavior, or focus restoration to the opener.

Next action: add focus management tests and implement focus trap, escape handling, and opener focus restoration without changing the owned-session run flow.
