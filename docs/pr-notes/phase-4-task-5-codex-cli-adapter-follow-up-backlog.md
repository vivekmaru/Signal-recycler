# Phase 4 Task 5 Codex CLI Adapter Follow-Up Backlog

## P1 Verify Local CLI Event Shapes

Residual risk: the parser handles the planned assistant message shape and generic raw events, but local Codex CLI versions may emit additional structured message variants.

Next action: run an authenticated local `codex exec --json` smoke after review and add parser fixtures for any stable event shapes worth elevating above raw audit events.

## P2 Add Adapter Run Unit Coverage

Residual risk: parser behavior is directly tested, while process spawn behavior is covered by type-checking and code review rather than a mocked child-process test.

Next action: add a small dependency-injected spawn test if future changes touch CLI lifecycle, stderr handling, or chunked stdout parsing.
