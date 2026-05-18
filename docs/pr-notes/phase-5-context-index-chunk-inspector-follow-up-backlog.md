# Phase 5 Context Index Chunk Inspector Follow-Up Backlog

## P0

- None.

## P1

- None from this slice. Existing Phase 5 beads still cover source context-envelope integration, retrieval evals, and the QMD indexing decision.

## P2

- Consider moving the chunk inspector into the long-term dashboard right inspector once the broader dashboard shell lands.
  - Next action: revisit after dashboard session/detail surfaces converge on the mockup direction.
- Consider adding a copy button for chunk ids or chunk text.
  - Next action: wait for manual smoke feedback before adding controls.
- Consider exposing a compact chunk-detail schema alias in `@signal-recycler/shared` if more clients begin consuming the detail endpoint.
  - Next action: defer until a second client needs the schema.

## Residual Risk

- The UI currently fetches chunk detail after selection rather than embedding text in retrieval preview responses. This keeps preview payloads small, but adds one request per inspected chunk.
