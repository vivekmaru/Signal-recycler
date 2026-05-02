# Phase 4 Task 6 Memory Service API Follow-Up Backlog

## P1 Stable API Error Contract

Residual risk: `POST /api/memory/retain` reuses existing schema parsing behavior, so validation error formatting may differ from `/api/memory/retrieve`.

Next action: define a shared stable error response contract for memory service APIs before external integrations depend on validation details.

## P2 Integration Provenance Labels

Residual risk: all retain calls currently use the fixed source label `api`, which proves API import provenance but does not identify a specific integration.

Next action: decide whether a future authenticated integration layer should accept a constrained integration label while preserving auditability.
