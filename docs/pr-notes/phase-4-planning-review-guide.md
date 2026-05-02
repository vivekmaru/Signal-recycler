# Phase 4 Planning Review Guide

## Scope Summary

This planning branch defines the implementation plan for Phase 4: Owned Session Adapter Layer. It does not implement runtime behavior yet.

## Change Map

- Roadmap: updates Phase 3 status now that retrieval and Phase 3.1 hardening have merged.
- Plan: adds the Phase 4 task breakdown for adapter selection, shared context envelope construction, adapter registry, Codex SDK compatibility, Codex CLI headless execution, stable memory APIs, Claude Code evaluation, and PR verification notes.

## Reviewer Focus Areas

- Check that the plan stays inside Phase 4 and does not pull in Phase 4.5 dashboard UX.
- Check that Codex SDK proxy behavior remains maintenance-only and compatibility-focused.
- Check that shared memory retrieval/injection/audit logic remains outside individual adapters.
- Check that Claude Code is explicitly evaluated, not silently claimed as implemented.

## Known Non-Blockers And Expected Warnings

- This branch is documentation/planning only.
- No app behavior changes until implementation starts.
- The Codex CLI JSONL event shape still needs verification during implementation.

## Verification Commands And Results

- Not run: planning-only branch with markdown changes.

## Out Of Scope

- Implementing Phase 4 runtime code.
- Phase 4.5 dashboard UX.
- Repo context indexing.
- JIT rehydration.
- Cloud sync.
