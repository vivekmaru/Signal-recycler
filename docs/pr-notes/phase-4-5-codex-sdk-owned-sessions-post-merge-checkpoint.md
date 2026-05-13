# Phase 4.5 Codex SDK-Owned Sessions Post-Merge Checkpoint

## Where To Start After PR #13 Merges

Start with a tiny follow-up branch from `main`, for example:

```sh
git switch main
git pull --ff-only
git switch -c codex/phase-4-5-session-detail-sdk-events
```

## Current State At Merge

- `codex_cli` is SDK-backed and uses local Codex CLI auth without requiring `OPENAI_API_KEY`.
- Signal Recycler sessions persist the Codex thread id in event metadata and resume that thread on `sr run --session ...`.
- `sr run` prints a session-specific dashboard deep link.
- Dashboard direct links open `/sessions/:sessionId`.

## Recommended Next PR

Make Session Detail render SDK-backed events as first-class audit data.

Focus:

- show Codex thread id and continuation status in Session Detail.
- render `metadata.sdkEventType`, `metadata.itemType`, and `metadata.usage` clearly.
- make final response, prompt, memory retrieval, memory injection, skipped memories, and usage easy to scan.
- keep source/context indexing out of scope.

## Suggested Smoke Before Starting

- `pnpm test`
- `pnpm type-check`
- `SIGNAL_RECYCLER_CODEX_CLI=1 pnpm dev`
- `OPENAI_API_KEY= node apps/cli/dist/main.js run --agent codex "Say hello. Do not edit files or run commands."`
- Open the printed `/sessions/<id>` URL and inspect SDK events.

## Do Not Start Yet

- Phase 5 source/context indexing.
- Claude runtime adapter.
- full `sr chat` TUI.
- renaming `codex_sdk` unless doing a dedicated compatibility PR.
