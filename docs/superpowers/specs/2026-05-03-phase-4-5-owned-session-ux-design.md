# Phase 4.5 Owned Session UX Design

Date: 2026-05-03

## Scope Anchor

Roadmap phase: **Phase 4.5: Signal Recycler-Owned Session UX**.

Goal: make the dashboard the primary way to run and inspect memory-managed sessions while keeping CLI entry points available.

Success criteria from `docs/validation-roadmap.md`:

- Users can start a Codex headless session from the dashboard without entering an OpenAI API key if Codex CLI auth is already configured.
- Users can resume a Signal Recycler session and see the compact context envelope that will be sent next.
- The dashboard separates raw transcript, durable memory, retrieved context, skipped context, and rehydrated artifacts.
- The dashboard can replay or compare "with memory" versus "without memory" eval runs.
- A terminal command can launch the same owned-session flow for users who do not want to use the browser UI.

Explicitly out of scope for Phase 4.5:

- Full repository source indexing. That remains Phase 5.
- Vector retrieval, embedding search, rerankers, or cosine scores unless they already exist in runtime code.
- Cloud sync implementation.
- A full Claude Code runtime adapter unless Phase 4 adapter evaluation has produced a verified command/event contract.
- Replacing the memory backend. The existing SQLite memory/session/event model remains the source.

## Product Decision

Phase 4.5 should replace the hackathon dashboard framing with a local control plane for owned agent sessions.

The current UI helped prove the concept, but it still frames the product as "Codex traffic" and a proxy demo. The new dashboard should frame Signal Recycler as a local-first memory runtime and context control plane for multiple agents.

The user's mockups are the reference direction. We will keep the strongest parts:

- Persistent app shell with sidebar navigation.
- Top project, branch, adapter, sync, search, and new-session controls.
- Dashboard overview for active sessions, memory review, context activity, and eval status.
- Dense Sessions table for navigation.
- Session Detail as the north-star screen.
- Grouped timeline with right-side inspector.
- Memory table with review-style inspector.
- Context Index preview screen.
- Evals proof screen.

The implementation should adapt spacing, color, and data mapping to the current codebase instead of copying the mockups pixel-for-pixel.

## Data Strategy

Phase 4.5 should use a hybrid data strategy:

- Use real backend data wherever it exists.
- Derive display data from existing sessions, events, memory records, usage records, eval reports, adapter metadata, and retrieval metadata where possible.
- Use demo or scaffolded data only for surfaces whose backend is intentionally future-phase, and label those surfaces clearly as preview, sample, or not yet connected.
- Do not show unsupported metrics as if they are real. For example, do not show embedding model, cosine score, vector cluster, or reranker details until those systems exist.
- Do not claim cloud sync, repo source indexing, rehydrated artifacts, or agent support that is not implemented.

This choice gives the UI enough realistic material to validate product shape without undermining trust.

## Information Architecture

Primary navigation:

- Dashboard
- Sessions
- Memory
- Context Index
- Evals
- Sync
- Settings

The dashboard is not a marketing page. It is an operational overview for the current project.

The Session Detail screen is the primary product surface. Memory is the main trust-building secondary surface for Phase 4.5. Context Index is included as a preview/trust surface only where it can honestly reflect implemented retrieval behavior. Evals prove product value.

## Global Shell

The shell should make local-first ownership visible on every screen.

Top bar:

- Product mark and version.
- Project selector.
- Branch or worktree indicator.
- Adapter selector, initially showing implemented adapters only.
- Local/cloud sync indicator, with local-first as the default.
- Search shortcut.
- `New session` action.

Left sidebar:

- Workspace navigation.
- Counts for sessions, memory, and indexed context where backed by data.
- Local store status at the bottom, including path and approximate storage size if available.

Design tone:

- Dense, calm, technical.
- Neutral surfaces with a restrained amber accent for active/running/review states.
- Status colors must be semantic and paired with labels, not color-only.
- Use tables, rows, inspectors, tabs, and filters more than decorative cards.
- Avoid hero sections, marketing copy, and oversized demo controls.

## Dashboard Overview

Purpose: answer "what needs attention right now?"

Sections:

- Active sessions.
- Memory status: approved, pending review, superseded.
- Indexed context status, initially derived or preview if Phase 5 indexing is not implemented.
- Last eval result from existing eval reports where available.
- Recent sessions.
- Memory review queue.
- Recent context activity.

Allowed Phase 4.5 shortcuts:

- Recent sessions can be derived from the existing sessions API and event counts.
- Memory review queue can be backed by candidate/pending memory records.
- Context activity can be derived from memory retrieval, injection, compression, and classifier events.
- Eval status can read `.signal-recycler/evals/latest.json` only if a backend endpoint exists or is added as a small read-only support endpoint.

Avoid:

- Token-saving claims that cannot be traced to a specific event.
- Treating "memories injected" as the main success metric. The dashboard should also show skipped and pending-review signals.

## Sessions List

Purpose: navigate session history and compare outcomes.

Columns:

- Prompt/title.
- Status.
- Session id.
- Agent/adapter.
- Duration.
- Memory in.
- New memory.
- Token delta.

Filters:

- All.
- Running.
- Needs review.
- Completed.
- Failed.

Search should cover prompt/title, adapter, branch, and session id.

`Token delta` should replace ambiguous "tokens saved" labels. If the net result is more tokens, show it as added context rather than negative savings.

## Session Detail

Purpose: inspect exactly what happened in one owned session.

This is the north-star screen for Phase 4.5.

Header:

- Breadcrumb back to Sessions.
- Prompt/title.
- Session id.
- Status.
- Adapter and model where known.
- Branch/workdir.
- Start time and duration.
- Actions: Compare, Replay, Abort where implemented. Disabled or hidden if unsupported.

Summary strip:

- Memories selected/injected.
- Context chunks retrieved.
- Memories or chunks skipped.
- Tokens in/out or context size.
- Token delta.
- New memory candidates.

Tabs:

- Timeline.
- Context envelope.
- Diff.
- Memory candidates.

Only tabs backed by real data should be fully active. Others may be placeholders with clear empty states.

Timeline default:

- Grouped by event class:
  - Agent Activity.
  - Context Operations.
  - Memory Events.
  - Tool Calls.
  - Errors.
  - Files.
- Filters should allow all/agent/tools/memory/context/errors/files.
- Raw chronological ordering should remain available, but grouped scanning should be the default for long sessions.

Inspector:

- Persistent right panel on desktop.
- Collapsible or drawer-based on smaller screens.
- Shows details for the selected event, memory, context envelope, tool call, error, or candidate.
- Must show provenance and "affected this run" when available.

Error handling:

- Long adapter/API errors should not spill across the timeline.
- Timeline shows a concise error row.
- Inspector shows full error message, source, and suggested next action.

## Context Envelope Tab

Purpose: make "what did the agent receive?" inspectable.

Sections:

- Original prompt.
- Adapter and mode.
- Retrieved memories.
- Skipped memories with reasons.
- Injected context.
- Compressed artifacts.
- Rehydrated artifacts, only if implemented.
- Size/token estimate.

Phase 4.5 can use existing retrieval and memory injection metadata. It should not imply source/doc chunk retrieval until Phase 5 context indexing exists.

## Memory Page

Purpose: review and manage durable memory with provenance.

Layout:

- Dense table on the left/main area.
- Inspector on the right.

Table columns:

- Status.
- Memory text.
- Type.
- Scope.
- Confidence.
- Used count.
- Source.
- Last used.

Filters:

- All.
- Approved.
- Pending review.
- Superseded.
- Rejected.

Inspector:

- Memory id and status.
- Memory content.
- Why it exists.
- Properties: type, scope, confidence, usage, last used.
- Provenance: manual, learned from event/session, synced source, API retain.
- Related sessions and recent injections.
- Actions: approve, reject, edit, supersede, open memory.

Decision: memory review should feel like reviewing a PR, not clearing notifications.

## Context Index Page

Purpose: build trust in retrieval and prepare Phase 5.

Phase 4.5 version:

- Show this as a preview surface unless real source indexing exists.
- If only memory retrieval exists, the retrieval preview should focus on memories that would inject and deterministic retrieval metadata.
- Do not show embedding/rerank/cosine/vector debug fields unless implemented.

Future Phase 5 version:

- Coverage cards by source type.
- Coverage bar by chunk category.
- Prompt retrieval preview.
- Retrieved source/doc chunks.
- Memories that would inject.
- Debug metadata.

## Evals Page

Purpose: prove Signal Recycler improves correctness and/or cost.

Phase 4.5 version:

- Prefer read-only display of existing eval reports.
- Show with-memory vs without-memory comparisons only where eval data supports it.
- If demo comparisons are shown, label them as sample until connected to real eval output.

Important metrics:

- With memory result.
- Without memory result.
- Token delta vs no memory.
- Latency delta vs no memory.
- Precision/recall.
- Stale memory failures.

The side-by-side comparison panel from the mockup is the right direction for the proof surface.

## New Session Flow

Purpose: make owned sessions real from the dashboard.

Initial Phase 4.5 fields:

- Prompt.
- Adapter: implemented adapters only.
- Working directory.
- Mode:
  - Normal.
  - Dry run context envelope, if easy to support.
  - Compare with/without memory, if backend supports it.
- Memory policy:
  - Auto-retrieve.
  - No memory.

The default adapter should prefer `codex_cli` when `SIGNAL_RECYCLER_CODEX_CLI=1` and Codex CLI is available, because that path uses existing Codex auth/subscription and does not require an OpenAI API key.

## Phase 4.5 Implementation Shape

Recommended implementation order:

1. Build the app shell and navigation.
2. Convert existing dashboard data into the new Dashboard overview.
3. Add Sessions list from existing session/event data.
4. Build Session Detail with grouped timeline and inspector.
5. Build Memory table and inspector from existing memory APIs.
6. Add Context Envelope tab from retrieval/injection event metadata.
7. Add light Context Index and Evals pages with honest preview/read-only behavior.
8. Wire New Session to the existing `/api/sessions/:id/run` flow with adapter selection.

This order keeps the product useful throughout the implementation and avoids blocking the whole redesign on future indexing or eval UI work.

## Design Adjustments From Mockups

- Rename "Tokens saved" to `Token delta` or `Net context`.
- Avoid showing negative savings.
- Use "selected", "skipped", and "pending review" alongside "injected" so the UI does not incentivize over-injection.
- Keep grouped Session Detail as the default timeline view.
- Make the inspector collapsible.
- Reserve strong amber backgrounds for active selection, running state, or review-needed state.
- Keep code/tool output readable with dark terminal blocks where appropriate.
- Use placeholder/empty states for unsupported tabs instead of fake data.

## Decisions To Carry Into The Implementation Plan

- `Compare` should be hidden or disabled unless the backend can run or display a real with-memory vs without-memory comparison.
- Context Index should be included as a preview surface only after Session Detail and Memory are credible. The first implementation PR may defer it if the shell, Session Detail, and Memory surfaces are already large.
- Evals should start as read-only. If implementation cost is low, add a small read-only endpoint for the latest eval report; otherwise show a clear empty state and defer the page.
- The current web app should be split into route-level modules before or during the redesign. Avoid continuing to grow `apps/web/src/App.tsx` as one large component.

## Acceptance Criteria For The Design

- The dashboard no longer frames Signal Recycler as a Codex-only proxy demo.
- The primary user path is session creation and inspection.
- Memory decisions are inspectable with provenance.
- Retrieved, skipped, injected, compressed, and learned context are visually separated.
- Unsupported future behavior is either hidden, disabled, or explicitly labeled.
- The UI can show enough derived/demo state to validate product shape without making false claims.
