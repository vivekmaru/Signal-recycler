# Phase 5 Context Index Eval Suite Follow-Up Backlog

## P0

- None.

## P1

- Use the Context Index eval suite as the gate before source chunk context-envelope integration.
  - Existing bead: `idea-1-dt9`.
  - Next action: when this PR lands, inspect the eval report and decide whether `idea-1-dt9` should inject source chunks in Phase 5 or remain a Phase 5.1 bridge.

## P2

- Add more fixture cases once the source retrieval surface grows beyond README/package/source basics.
  - Next action: extend `fixtures/context-index-repo` with config and agent-instruction prompts when those become integration targets.
- Expose eval report summaries in the dashboard.
  - Existing bead: `idea-1-e5b`.
  - Next action: wait until the report endpoint shape is stable.

## Residual Risk

- The suite currently uses source-type filters for precision-focused cases. That is appropriate for this measurement slice, but later envelope integration should add an unfiltered mixed-context eval once source/doc chunks are injected into sessions.
