# Phase 4 Task 5 Codex CLI Adapter Follow-Up Backlog

## P1 Verify Local CLI Event Shapes

Residual risk: the parser handles verified assistant message shapes, `item.completed` `agent_message`, and generic raw events, but local Codex CLI versions may emit additional structured message variants.

Next action: run an authenticated local `codex exec --json` smoke after review and add parser fixtures for any stable event shapes worth elevating above raw audit events.

## P2 Add Chunk-Boundary Stream Coverage

Residual risk: adapter run tests cover persistence failure, retained item caps, and stderr truncation, but do not explicitly split one JSON line across multiple stdout chunks.

Next action: add a mocked child-process test for chunked stdout parsing if future changes touch stream buffering.
