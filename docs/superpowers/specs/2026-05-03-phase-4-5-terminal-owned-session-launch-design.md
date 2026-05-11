# Phase 4.5 Terminal-Owned Session Launch Design

Date: 2026-05-03

## Scope Anchor

Roadmap phase: **Phase 4.5: Signal Recycler-Owned Session UX**.

Relevant goal from `docs/validation-roadmap.md`: make the dashboard the primary way to run and inspect memory-managed sessions while keeping CLI entry points available.

Relevant success criterion:

- A terminal command can launch the same owned-session flow for users who do not want to use the browser UI.

Explicitly out of scope for this phase:

- Phase 5 source/context indexing.
- Vector retrieval, hybrid retrieval, reranking, or source chunk recall metrics.
- Compare/replay execution.
- Cloud sync.
- A full interactive TUI.
- Wrapping a vendor TUI in a way that Signal Recycler cannot inspect or own.

## Product Decision

The next terminal UX should be a real package binary named `sr`, starting with:

```sh
sr run --agent codex "fix the failing tests"
```

This is intentionally different from `sr codex` as the first product slice. `sr codex` sounds like a vendor TUI launcher, but launching the raw Codex TUI would likely hand context ownership back to Codex and limit Signal Recycler to weak observation. The core product promise is that Signal Recycler owns the context loop: session state, memory retrieval, injection, audit, and post-run learning.

The first implementation should therefore support non-interactive terminal-owned sessions. Non-interactive does not mean ephemeral: the terminal process exits after one turn, but the Signal Recycler session remains durable and can be continued by id. It should use the same owned-session flow as dashboard runs and stream progress into both the terminal and dashboard.

Future terminal UX should add:

```sh
sr chat --agent codex
```

`sr chat` can evolve into a full Signal Recycler TUI. In that model, Signal Recycler owns conversation history and context assembly on every turn, while Codex, Claude, Gemini, or another tool acts as an execution adapter.

## UX Model

Developers typically use coding agents in three ways:

- Vendor TUI: `codex`, `claude`, or `gemini`.
- Fast terminal command: one prompt, one headless run.
- Web chat or dashboard, when available.

Signal Recycler should not compete primarily as another web chat. The dashboard should remain the control plane and audit surface. Terminal commands should be the natural run surface.

Phase 4.5 terminal launch should provide:

```sh
sr run "fix the failing tests"
sr run --agent codex "fix the failing tests"
sr run --session session_abc123 "now add regression coverage"
sr run --agent mock "show me the context envelope"
sr run --api http://127.0.0.1:3001 --agent codex "run validation"
```

The first release can require the local Signal Recycler API server to be running. If it is not running, the command should fail with a clear next action:

```text
Signal Recycler API is not running at http://127.0.0.1:3001.
Start it with: pnpm dev
```

This keeps the first implementation thin and aligned with the existing dashboard/runtime path. A future release can add embedded runtime fallback after the server-owned path is proven.

## Architecture

The `sr` binary is a terminal client over the existing local API.

Initial command:

```text
sr run [options] <prompt...>
```

Data flow:

```text
terminal prompt
  -> sr CLI
  -> POST /api/sessions, unless --session is provided
  -> POST /api/sessions/:id/run
  -> existing processTurn(...)
  -> existing context envelope / retrieval / adapter path
  -> dashboard session/events
  -> terminal final status and dashboard URL
```

The CLI should not duplicate memory retrieval, adapter selection, or post-run learning. It should call the API so `processTurn(...)` remains the single owned-session runtime path.

Session semantics:

- `sr run "prompt"` creates a durable session and records one turn in it.
- `sr run --session <id> "prompt"` appends a new turn to an existing durable session.
- The terminal process is ephemeral; the Signal Recycler session is not.
- The dashboard should show continued turns in one timeline for the same session id.
- Long coding sessions should be modeled as a sequence of `sr run --session <id> ...` turns now, and as `sr chat --agent codex` later.

The API already has the main pieces:

- `POST /api/sessions`
- `POST /api/sessions/:id/run`
- `GET /api/sessions/:id/events`
- Adapter registry and `codex_cli` support behind `SIGNAL_RECYCLER_CODEX_CLI=1`
- Session/event/memory persistence through SQLite

The CLI should add the missing terminal ergonomics around those APIs.

## Package Shape

Add a workspace package:

```text
apps/cli/
  package.json
  src/main.ts
  src/apiClient.ts
  src/runCommand.ts
  src/output.ts
  tsconfig.json
```

Package name:

```json
{
  "name": "@signal-recycler/cli",
  "bin": {
    "sr": "dist/main.js"
  }
}
```

The root package can expose scripts for local development:

```json
{
  "scripts": {
    "cli": "pnpm --filter @signal-recycler/cli dev"
  }
}
```

The first implementation does not need publishing polish, installation docs for npm global installs, or a generated native binary. It only needs a real package binary shape that can later be published.

## Command Contract

Supported options for the first pass:

- `--agent <agent>`: `default`, `codex`, `codex_cli`, or `mock`.
- `--api <url>`: defaults to `http://127.0.0.1:3001`.
- `--session <id>`: append the prompt as a new turn in an existing Signal Recycler session.
- `--title <title>`: optional session title.
- `--json`: print machine-readable output at the end.
- `--no-watch`: create/run the session and print the final API result without polling events.

Agent aliases:

- `codex` maps to `codex_cli`.
- `mock` maps to `mock`.
- `default` maps to the server default adapter.

The CLI should validate unsupported agents locally before calling `/api/sessions/:id/run` when possible, but the API remains authoritative. When `--session` is provided, `--title` should be ignored or rejected with a clear error; the existing session title remains durable state owned by the server.

Planned but not first-pass commands:

- `sr run --last "prompt"`: append to the most recent session for the current project/worktree.
- `sr sessions`: list recent durable sessions and ids.

These are useful ergonomics, but `--session <id>` is the minimal explicit continuation primitive needed to make long coding sessions coherent.

## Terminal Output

Default output should be concise and useful:

```text
Signal Recycler session session_abc123
Agent: codex_cli
Dashboard: http://127.0.0.1:5173

[memory] Retrieved 2 approved memories; skipped 1
[context] Injected 2 memories
[agent] Running Codex CLI...

Final response:
...
```

The first pass can poll `GET /api/sessions/:id/events` every one second and print newly seen events in a compact format. This is sufficient because the server already persists events during the run.

When a new session is created, output should make continuation obvious:

```text
Continue this session:
sr run --session session_abc123 "next prompt"
```

When `--session` is used, output should state that an existing session is being continued.

If `--no-watch` is supplied, only print session id, run status, and final response.

If `--json` is supplied, print a final JSON object:

```json
{
  "sessionId": "session_abc123",
  "agent": "codex_cli",
  "status": "completed",
  "finalResponse": "...",
  "dashboardUrl": "http://127.0.0.1:5173",
  "events": 8
}
```

## Dashboard Relationship

The dashboard remains the audit surface. A terminal-owned run should appear like a dashboard-created run:

- Session appears in Sessions.
- Session Detail shows raw transcript, memory retrieval, memory injection, skipped context, classifier result, and candidates.
- Multiple terminal turns run with `--session <id>` appear in the same Session Detail timeline.
- The session title should be derived from `--title` or the prompt prefix.
- Events should carry adapter metadata as they do today.

No new dashboard route is required for the first pass. If the current route state cannot deep-link to a session, the CLI can print the base dashboard URL only. Deep links can be added later.

## Error Handling

The CLI should handle these cases explicitly:

- API server unavailable: print the local start command.
- API returns 404 for session run: print that the session id was not found or does not belong to the active project, then exit non-zero.
- Adapter unavailable: print available adapters from `/api/config` and tell the user how to enable Codex CLI.
- Codex CLI auth/API-key failure: surface the server error without hiding it, but do not ask for `OPENAI_API_KEY` when `codex_cli` was selected.
- Empty prompt: print usage and exit non-zero.
- Invalid `--api` URL: print a URL validation error and exit non-zero.
- `--session` combined with `--title`: reject the command and explain that titles are only used when creating a new session.

## Testing Strategy

Use TDD in the implementation plan.

Unit-level tests:

- Argument parsing maps `--agent codex` to `codex_cli`.
- Argument parsing accepts `--session <id>` and rejects `--session` combined with `--title`.
- Empty prompt fails before network calls.
- API unavailable returns the clear start-server message.
- CLI API client calls the expected session and run endpoints.
- CLI API client skips session creation when `--session` is provided.
- Event polling prints each event once.

API integration smoke:

- Start the dev server with `SIGNAL_RECYCLER_MOCK_CODEX=1`.
- Run `sr run --agent mock "post-merge smoke"`.
- Verify session events are visible through `/api/sessions/:id/events`.

Workspace verification:

- `pnpm test`
- `pnpm type-check`
- `pnpm build`

## Future UX: `sr chat`

`sr chat` is not part of this implementation, but the design should keep room for it.

The future TUI should:

- Keep a Signal Recycler session open across turns.
- Build a new context envelope before every turn.
- Show compact turn status in the terminal.
- Stream events to the dashboard.
- Allow memory review or rejection through terminal shortcuts only after the dashboard memory model is stable.

The important product boundary: `sr chat` should be Signal Recycler's TUI, not a wrapper around an opaque vendor TUI.

## Non-Goals

- Do not implement `sr codex` in this phase.
- Do not implement `sr run --last` or `sr sessions` in this phase unless the implementation remains smaller than expected.
- Do not try to capture or control raw vendor TUI internals.
- Do not add Phase 5 source chunk indexing.
- Do not add interactive prompt editing, shell history, syntax highlighting, panes, or terminal widgets.
- Do not publish to npm as part of the first implementation unless explicitly requested.

## Open Questions Resolved

- **Should terminal UX be a real binary or repo script?** Use a real package binary shape now so the product can later install cleanly.
- **Should the first command be `sr codex`?** No. Start with `sr run --agent codex` because it makes Signal Recycler the owner of the session.
- **Is `sr run` ephemeral?** The process is ephemeral, but the Signal Recycler session is durable. New prompts can continue the same session with `sr run --session <id>`.
- **Should the first command require the API server?** Yes. It keeps the first implementation thin and ensures the dashboard sees the same session/events path.
- **Does this remain aligned with the roadmap?** Yes. It completes a Phase 4.5 success criterion before Phase 5 Context Index.
