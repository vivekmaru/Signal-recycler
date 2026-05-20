# Superseded Memory Mutation Guards Follow-Up Backlog

## Scope Anchor

This branch protects superseded memory records from direct approve/reject mutations in the store and rules API. It is a correctness hardening slice for Beads `idea-1-rmm`, not a broader memory workflow redesign.

## Completed In This Slice

Beads:

- `idea-1-rmm`: Superseded memory approve/reject attempts are rejected server-side and covered by regression tests.

## P2: Add Shared API Error Shape

Residual risk: superseded-memory conflicts now return a clear 409 payload, but API errors remain endpoint-local shapes.

Concrete next action: define a small shared error response helper or schema once more endpoints need consistent machine-readable conflict handling.

## P2: Surface Superseded Conflict Details In API Client Helpers

Residual risk: web API helpers currently return parsed error text through generic fetch handling, so callers do not have a typed conflict object.

Concrete next action: after API error handling is typed, preserve `supersededBy` on conflict responses for UI surfaces that want to deep-link to the replacement memory.
