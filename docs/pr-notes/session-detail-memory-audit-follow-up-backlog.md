# Session Detail Memory Audit Follow-Up Backlog

## Scope Anchor

This branch adds read-only Session Detail memory audit integration for Beads `idea-1-8qn`. It reuses existing Memory Review audit data and keeps execution semantics unchanged.

## Completed In This Slice

Beads:

- `idea-1-8qn`: Session Detail selected memories now show backed usage audit data.

## P1: Implement Compare And Replay Execution

Residual risk: Session Detail has stronger provenance and audit surfaces, but Compare and Replay remain disabled preview controls.

Concrete next action: start Beads `idea-1-1w8` with a backed execution/artifact contract for replaying or comparing with-memory versus without-memory runs.

## P2: Deep-Link From Usage Audit Rows To Events

Residual risk: audit rows show session and event ids, but they do not navigate directly to the referenced event.

Concrete next action: add a Session Detail event deep-link route or selected-event query param before making usage rows clickable.

## P2: Add Browser Regression For Memory Audit Selection

Residual risk: presenter tests cover audit state, but there is no browser-level regression that clicks an injected memory id and verifies the usage audit panel.

Concrete next action: add Playwright/browser smoke once the local browser test harness is settled for dashboard flows.
