# Phase 4.5 Session Detail SDK Events Follow-Up Backlog

## P1: Add First-Class Session Metadata

Residual risk: Session Detail still infers Codex thread id and continuation state from timeline events.

Next action: add a small session metadata store for adapter-owned state such as `codexThreadId`, then keep event metadata as the audit trail.

## P1: Add Live Event Streaming To Session Detail

Residual risk: SDK events stream into the server-side store, but the browser still sees them through polling.

Next action: add an SSE endpoint for session events and use it in Session Detail with polling as fallback.

## P1: Connect Dashboard New Session To The Same Owned Runtime Path

Residual risk: terminal-owned sessions and dashboard session inspection now line up, but dashboard-created runs still need an explicit UX pass to feel like the primary entry point.

Next action: make dashboard New Session use the same owned-session API path and adapter choices as `sr run`, then deep-link into Session Detail immediately.

## P2: Richer Per-Item SDK Rendering

Residual risk: timeline chips expose SDK event shape, but command execution, file change, todo, reasoning, and MCP events still share a generic row body.

Next action: add item-type-specific presenters for command output, file changes, todos, reasoning summaries, and MCP calls.

## P2: Runtime Capability Status For Codex CLI

Residual risk: adapter availability depends on `SIGNAL_RECYCLER_CODEX_CLI=1`, but the dashboard does not preflight whether local Codex auth and session storage are usable.

Next action: add a lightweight health/capability check that reports Codex CLI availability without running a full agent task.
