# Phase 5.1 Source Context Envelope Follow-Up Backlog

## Scope Anchor

Phase 5 indexes repository and project context because indexing is core to the Signal Recycler vision. The relevant success criteria are that docs, agent instructions, package files, and selected source chunks are indexed with path, line range, hash, and timestamp provenance; prompts can retrieve relevant docs/source chunks with measurable retrieval quality; and source/doc chunks remain separate from durable memory.

This PR connects that index to owned-session context envelopes. It does not start Phase 6 command-output compression, Phase 7 rehydration, vector retrieval, or automatic indexing.

## Completed In This Slice

Beads:

- `idea-1-dt9`: source retrieval is now integrated into owned-session context envelopes.
- `idea-1-5kd`: decision resolved in favor of a small Phase 5.1 implementation PR, not delaying until a larger future phase.

## P1: Add Stale-Index Safeguards To Session Source Context Injection

Beads: `idea-1-j96`

Residual risk: source chunks carry `hash`, `mtimeMs`, and `indexedAt` provenance, but the runtime does not yet compare those against the live file before injecting the chunk.

Concrete next action: before or during injection, check whether indexed files have changed and either skip stale chunks with an audit reason or show a clear stale-index warning.

## P2: Tune Source Context Envelope Token Budget And Low-Signal Thresholds

Beads: `idea-1-ug2`

Residual risk: Phase 5.1 uses a bounded character limit per chunk and the existing lexical top-k retrieval. Larger repositories may need stricter budgets and threshold tuning to avoid noisy context.

Concrete next action: add configurable envelope budgets and retrieval thresholds, then extend eval coverage for low-signal prompts and large indexes.

## P2: Deep-Link Injected Context Chunks From Session Detail To Chunk Inspector

Beads: `idea-1-d2u`

Residual risk: Session Detail now shows injected chunk ids and provenance, but reviewers cannot jump directly from an injection event to the chunk inspector.

Concrete next action: add UI navigation from `context_retrieval` and `context_injection` records to the existing context chunk detail surface.

## P2: Consider A Dedicated Context Envelope Metadata Table

Residual risk: event metadata is sufficient for this PR, but richer context-envelope analytics may become awkward if all source decisions remain event-only.

Concrete next action: revisit after Phase 5.1 review and decide whether context-envelope decisions need a first-class store table before Phase 6/7 work.
