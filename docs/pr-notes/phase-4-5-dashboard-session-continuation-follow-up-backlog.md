# Phase 4.5 Dashboard Session Continuation Follow-Up Backlog

## P0

- None.

## P1

- Add live event streaming to Session Detail continuation runs.
  - Residual risk: the current panel refreshes after completion, so long-running CLI sessions still feel less live than terminal-owned `sr run`.
  - Next action: reuse the existing session events endpoint or add a small polling/SSE wrapper scoped to the selected session.

- Add first-class session metadata storage for adapter thread IDs.
  - Residual risk: Codex thread ID persistence currently relies on event metadata lookup.
  - Next action: add a dedicated session metadata table when event lookup becomes brittle or when multiple adapters need durable thread IDs.

- Add component-level tests for the Session Detail continuation panel.
  - Residual risk: presenter logic is covered, but form behavior is not exercised by a DOM test.
  - Next action: introduce a lightweight React test harness for Session Detail actions if UI behavior grows further.

## P2

- Add a compact context-envelope preview tab for the next run.
  - Residual risk: the current pre-run preview shows memory retrieval only, while the post-run Context Envelope tab remains event-driven.
  - Next action: add a dry-run envelope endpoint after retrieval and compression inputs are stable.

- Improve adapter capability labels.
  - Residual risk: `codex_sdk` remains visible as a compatibility path but the UI does not explain proxy-vs-local-auth tradeoffs.
  - Next action: extend `/api/config` with adapter capabilities and render descriptions/tooltips.

- Add keyboard shortcuts for preview and run.
  - Residual risk: repeated dashboard-owned sessions still require mouse interaction.
  - Next action: add command-key shortcuts after the continuation flow settles.
