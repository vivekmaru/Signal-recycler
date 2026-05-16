# Phase 5 Context Index Dashboard Wiring Follow-Up Backlog

## Scope Anchor

Phase 5 indexes repository and project context because indexing is core to the Signal Recycler vision. The relevant success criteria are that repo docs, agent instruction files, package files, and selected source chunks are indexed with path, line range, hash, and timestamp provenance; prompts can retrieve relevant docs/source chunks with measurable retrieval quality; source/doc chunks stay separate from durable memories; and optional QMD-backed indexing remains an evaluation path before building a custom full retrieval stack.

Explicitly out of scope here: Phase 6 deterministic command-output compression, source/doc chunk injection into owned-session context envelopes, and Phase 7 JIT rehydration.

## P1: Promote Source Chunk Inspection From Row Summary To Detail Panel

Beads: `idea-1-rzc`

Residual risk: the preview table proves which chunks were selected, but reviewers cannot inspect chunk text from the dashboard yet.

Concrete next action: add a selected chunk inspector that fetches or displays bounded chunk content with path, line range, hash, indexed timestamp, and source type.

## P1: Add Session Context Envelope Integration After Phase 5 Coverage Settles

Beads: `idea-1-dt9`

Residual risk: the dashboard now proves source retrieval works, but owned-session context envelopes still only use memory decisions.

Concrete next action: after retrieval quality is validated, add an explicit context-envelope integration PR that records selected source chunks, skipped chunks, and provenance in session events.

## P2: Add First-Class Mobile Navigation For The App Shell

Beads: `idea-1-pp3`

Residual risk: dense dashboard surfaces are readable on narrow viewports via horizontal overflow, but the app shell still behaves like a desktop tool.

Concrete next action: design and implement a compact sidebar or top navigation mode for narrow screens without reducing the density of desktop dashboard views.

## P2: Add Retrieval Preview Regression Fixtures

Beads: `idea-1-dkp`

Residual risk: presenter tests cover formatting, but there is no browser-level or API-level regression fixture asserting that filters change retrieval payloads.

Concrete next action: add a lightweight web integration test or API-contract test that verifies source-type filters are sent and reflected in retrieval results.

## P2: Improve Error Messages From API Client Helpers

Beads: `idea-1-wrx`

Residual risk: `readJson` preserves raw API response text, which is useful for debugging but can be noisy in user-facing error boxes.

Concrete next action: add typed API error parsing that preserves debug detail in metadata while rendering a concise dashboard message.
