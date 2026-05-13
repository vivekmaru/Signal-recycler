# Phase 4.5 Codex SDK-Owned Sessions Follow-Up Backlog

## P1: Add First-Class Session Metadata

Residual risk: Codex thread ids are persisted through timeline event metadata. That is sufficient for this PR, but it couples runtime continuation to event history lookup.

Next action: add a small session metadata store for adapter-owned state such as `codexThreadId`, then migrate `codex_cli` continuation lookup to that store while keeping event metadata for auditability.

## P1: Rename Or Deprecate The Proxy `codex_sdk` Adapter

Residual risk: after this branch, `codex_cli` is SDK-backed while `codex_sdk` means proxy-compatible SDK path. The names are technically accurate historically but confusing in the UI.

Next action: decide whether to introduce a clearer public adapter label such as `codex_proxy` while keeping `codex_sdk` as a backwards-compatible alias.

## P1: Add Real Codex SDK Smoke Fixture

Residual risk: unit tests cover SDK event handling with fake streams, but a deterministic recorded fixture from an authenticated local Codex run would catch upstream event shape drift earlier.

Next action: capture a small successful `runStreamed()` event transcript without secrets and add it as a parser/mapping fixture.

## P1: Server-Sent Events For Live Session Detail

Residual risk: the dashboard still polls data. SDK events are now streamed into the store, but the browser sees them on the polling cadence.

Next action: add an SSE endpoint for session events and switch Session Detail to live streaming while keeping polling as a fallback.

## P2: Richer SDK Event Presentation

Residual risk: SDK event bodies are readable but minimal. Command, file-change, MCP, todo, and usage events can be made more scannable in the dashboard.

Next action: extend event presenters with dedicated rendering for `metadata.sdkEventType`, `metadata.itemType`, and `metadata.usage`.

## P2: Codex Runtime Capability Detection

Residual risk: `SIGNAL_RECYCLER_CODEX_CLI=1` controls adapter availability, but it does not preflight whether the local Codex CLI can start and write to `~/.codex`.

Next action: add a lightweight capability check endpoint that reports Codex CLI availability/auth/session-directory status without running a full agent task.
