# Signal Recycler

**A local-first memory runtime for coding agents, with an existing v1 OpenAI-compatible proxy for Codex traffic.**

Signal Recycler is moving toward Signal Recycler-owned agent sessions: it stores the observable context around a run, retrieves relevant memory, injects scoped project guidance, streams/audits events, and learns durable memories after the run.

The current v1 implementation is narrower: it provides a local OpenAI-compatible proxy for Codex traffic, compresses selected noisy request items, records telemetry, extracts reusable playbook rules from dashboard runs, and retrieves relevant approved rules before injecting them into later routed requests.

## Why this matters

Long agentic coding sessions rot. The useful facts are surrounded by stack traces, failed attempts, old logs, and repeated corrections. Codex can technically see the history, but the signal-to-noise ratio gets worse as the session grows.

Signal Recycler is designed to fix that with a local memory layer:

- **Compress selected noise**: trims large shell outputs, stack traces, and error dumps before they are forwarded.
- **Learn from failures**: classifies completed turns and extracts reusable rule candidates.
- **Accept proactive rules**: lets you manually add constraints before running Codex.
- **Retrieve memory**: selects relevant approved memories before injection instead of injecting every approved memory.
- **Show the proof**: the dashboard displays proxy traffic, compression, token savings, retrieval events, injected rules, and the live playbook.

## Supported run modes

### Forward path: Signal Recycler-owned sessions

This is the product direction. Signal Recycler should own the session envelope around agent runs: retrieve memory, compress or omit low-value context, inject scoped memory, run an agent adapter, stream events to the dashboard, and learn asynchronously after the run.

This mode is not fully implemented yet. It is the next major direction after Phase 0 cleanup.

### Existing v1: API-compatible proxy adapter

The current app supports an OpenAI-compatible proxy at `/proxy/*`. The proxy can compress selected noisy request items, retrieve relevant approved playbook rules, inject the selected rules, forward the transformed request upstream, and record request telemetry.

Proxy mode remains useful for API-compatible agents and custom apps, but it is the existing v1 adapter rather than the main forward roadmap.

## Hackathon demo

The strongest demo is a before-and-after Codex run:

1. Start Signal Recycler.
2. Add or auto-learn a playbook rule.
3. Run a vague Codex prompt.
4. Watch Signal Recycler retrieve and inject the relevant rule.
5. Confirm Codex behaves according to project memory instead of guessing.

Example proactive-memory demo:

1. Add this rule in the **Active playbook** panel:

   ```text
   Category: theme
   Rule: When the user asks for a UI theme change, fetch and apply https://tweakcn.com/r/themes/supabase.json as the source of truth. Update the app's theme/token files instead of scattering hardcoded Tailwind colors.
   Reason: Theme changes should follow an explicit design-system source, not invented colors.
   ```

2. Prompt Codex from the dashboard:

   ```text
   Implement a different theme for the UI.
   ```

3. Signal Recycler retrieves and injects the relevant rule into the Codex request, so Codex follows the linked theme source even though the prompt itself stays intentionally vague.

That is the current product claim: **Codex plus durable project memory can execute intent that a stateless Codex run would have to guess when the request is routed through Signal Recycler.**

## How it works

```text
Prompt from dashboard or API-compatible client
    |
    v
Signal Recycler proxy
    |
    |-- compress noisy history
    |-- retrieve relevant approved playbook rules
    |-- inject selected memory
    |-- record request telemetry
    v
OpenAI Responses API
    |
    v
Codex response
    |
    v
Signal Recycler classifier
    |
    |-- mark signal / noise / failure
    |-- propose reusable rules
    v
Dashboard playbook
```

## Memory Model

Signal Recycler stores durable memories locally in SQLite. A memory records:

- type: `rule`, `preference`, `project_fact`, `command_convention`, `source_derived`, or `synced_file`
- scope type: `project`, `repo_path`, `package`, `file`, `agent`, or `user`
- source kind: `manual`, `event`, `synced_file`, `import`, or `source_chunk`
- confidence: `high`, `medium`, or `low`
- sync status: `local`, `imported`, `exported`, or `synced`

Memory retrieval uses SQLite FTS5/BM25 over approved local memories and returns a top-k selection for the current prompt. If a prompt has no searchable match, retrieval returns no selected memories rather than falling back to inject-all behavior.

Memory usage audit rows are stored separately from memory records. Every injection records the memory, session, adapter, event, reason, and timestamp.

`AGENTS.md` and `CLAUDE.md` are compatibility/export surfaces. Signal Recycler remains the runtime source of truth.

## Tech stack

- Monorepo: pnpm workspaces, TypeScript
- Frontend: Vite, React, Tailwind CSS, lucide-react
- Backend: Fastify
- Persistence: SQLite via `node:sqlite`
- Codex integration: local OpenAI-compatible proxy for Codex traffic
- Classification: OpenAI model with structured rule extraction plus fallback heuristics

## Quick start

```bash
pnpm install
cp .env.example .env
```

Add a Project API key to `.env`:

```bash
OPENAI_API_KEY=sk-proj-...
```

Start the app:

```bash
pnpm dev
```

Open:

```text
http://127.0.0.1:5173
```

The API runs on:

```text
http://127.0.0.1:3001
```

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Required for live proxy/dashboard Codex runs | - | Project API key used by the proxy when forwarding requests upstream and by the optional classifier. Mock mode can run without it. |
| `PORT` | No | `3001` | API server port. |
| `SIGNAL_RECYCLER_DB` | No | `./signal-recycler.sqlite` | SQLite database path. |
| `SIGNAL_RECYCLER_WORKDIR` | No | repo root | Directory Codex operates in. |
| `SIGNAL_RECYCLER_PROJECT_ID` | No | basename of workdir | Namespace for rules, sessions, and events. |
| `SIGNAL_RECYCLER_CLASSIFIER_MODEL` | No | `gpt-5.1-mini` | Model used by optional post-run classification. Heuristic fallback is used when no API key is available or classification fails. |
| `SIGNAL_RECYCLER_UPSTREAM_URL` | No | `https://api.openai.com` | Upstream OpenAI-compatible API target. Do not set this to the proxy URL. |
| `SIGNAL_RECYCLER_LOG_LEVEL` | No | unset | Set to `info` or `error` when debugging server behavior. |
| `SIGNAL_RECYCLER_MOCK_CODEX` | No | `0` | Set to `1` for UI-only demos without live Codex/OpenAI calls. |
| `SIGNAL_RECYCLER_CODEX_CLI` | No | `0` | Set to `1` to enable the opt-in Codex CLI owned-session adapter. |
| `SIGNAL_RECYCLER_LIVE_AGENT` | No | unset | Optional eval-only adapter selector for `pnpm eval:live`. Supported values: `codex`, `claude`. |
| `SIGNAL_RECYCLER_LIVE_AGENT_TIMEOUT_MS` | No | `120000` | Timeout for the optional live agent eval. |

## Use with any project

Point Signal Recycler at another repo:

```bash
SIGNAL_RECYCLER_WORKDIR=/path/to/project pnpm dev
```

Or set it in `.env`:

```bash
SIGNAL_RECYCLER_WORKDIR=/path/to/project
SIGNAL_RECYCLER_PROJECT_ID=my-project
```

Rules are namespaced by project ID, so different repos can keep separate playbooks.

## Use with Codex CLI

The Codex CLI normally authenticates through ChatGPT OAuth, which can bypass `OPENAI_BASE_URL`. Signal Recycler includes a config helper that registers a custom Codex model provider pointing at the local proxy.

Install the provider:

```bash
pnpm codex:install
```

Then run Codex through Signal Recycler:

```bash
export OPENAI_API_KEY=sk-proj-...
codex -c model_provider='"signal_recycler"' "your prompt..."
```

To remove the provider:

```bash
pnpm codex:uninstall
```

The installer edits only a marked Signal Recycler block in `~/.codex/config.toml` and creates a backup the first time it modifies the file.

### Codex CLI owned-session adapter

The headless Codex CLI adapter is opt-in and is not the default run path:

```bash
SIGNAL_RECYCLER_CODEX_CLI=1 pnpm dev
```

Once enabled, run a session with an explicit adapter selection:

```json
{ "prompt": "Run validation.", "adapter": "codex_cli" }
```

This adapter shells out to the local `codex exec --json` command and uses your local Codex CLI authentication. The agent run does not require `OPENAI_API_KEY`, though the optional post-run classifier still uses `OPENAI_API_KEY` when configured.

## Dashboard

The dashboard is the main product surface:

- **Codex traffic**: send prompts through the local Codex runner.
- **Live context timeline**: see proxied requests, retrieval decisions, compression results, classifier output, and Codex events.
- **Active playbook**: approve, reject, and manually add durable rules.
- **Metrics strip**: request count, compression count, approved rules, and estimated tokens saved.

## API summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/config` | Current project and working directory. |
| `POST` | `/api/sessions` | Create a tracked session. |
| `POST` | `/api/sessions/:id/run` | Run a prompt through Signal Recycler. |
| `GET` | `/api/sessions/:id/events` | Read timeline events for a session. |
| `GET` | `/api/firehose/events` | Read recent events across all sessions. |
| `GET` | `/api/rules` | List playbook rules. |
| `POST` | `/api/rules` | Add a manual approved rule. |
| `POST` | `/api/rules/:id/approve` | Approve a candidate rule. |
| `POST` | `/api/rules/:id/reject` | Reject a candidate rule. |
| `GET` | `/api/playbook/export` | Export approved rules as Markdown. |
| `POST` | `/api/memory/retrieve` | Preview which memories would be selected for a prompt. |
| `POST` | `/api/memory/reset` | Clear local demo memory for the current project. |
| `POST` | `/proxy/*` | Proxy OpenAI-compatible Codex traffic. |

### Memory APIs

- `GET /api/memories`: list project memories.
- `POST /api/memories`: create and approve a manual memory.
- `POST /api/memories/synced`: import a memory from an `AGENTS.md` or `CLAUDE.md` compatibility block.
- `GET /api/memories/:id/audit`: return the memory plus usage rows showing where it was injected.
- `POST /api/memory/retrieve`: preview the approved memories retrieval would select or skip for a prompt. This is a local retrieval preview, not repo indexing or vector search.

Manual memory request:

```json
{
  "category": "tooling",
  "rule": "Use pnpm for package management in this repository.",
  "reason": "The workspace lockfile and scripts are managed with pnpm.",
  "memoryType": "command_convention",
  "scope": { "type": "project", "value": null }
}
```

Synced compatibility-block import request:

```json
{
  "category": "agent-instructions",
  "rule": "Run pnpm type-check before reporting TypeScript changes as complete.",
  "reason": "The AGENTS.md compatibility block records this project convention.",
  "path": "AGENTS.md",
  "section": "signal-recycler",
  "scope": { "type": "repo_path", "value": "apps/api" }
}
```

Legacy `/api/rules` endpoints remain available during the transition from playbook rules to general memories.

## Verification

```bash
pnpm test
pnpm type-check
pnpm build
```

For the smoke demo, run the API against a smoke database:

```bash
SIGNAL_RECYCLER_MOCK_CODEX=1 SIGNAL_RECYCLER_DB=/tmp/signal-recycler-smoke.sqlite pnpm dev
pnpm smoke:demo
```

`pnpm smoke:demo` expects the API to be running against a smoke/test database unless `SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB=1` is set explicitly.

For the Phase 3 retrieval/injection smoke:

```bash
SIGNAL_RECYCLER_MOCK_CODEX=1 SIGNAL_RECYCLER_DB=/tmp/signal-recycler-memory-smoke.sqlite pnpm dev
pnpm smoke:memory
```

The smoke resets memory, creates one relevant and one irrelevant approved memory, runs a package-manager prompt, and fails unless exactly one memory is retrieved and injected.

## Product evals

Phase 1 adds local evals so Signal Recycler can measure product claims without relying on the demo script.

```bash
pnpm eval
```

The local eval command does not call OpenAI. It runs deterministic suites for:

- compression retention and token savings
- rule extraction precision and recall
- playbook injection placement and dedupe
- lexical memory retrieval relevance, project isolation, stale-memory exclusion, and token reduction versus inject-all
- project isolation
- with-memory versus without-memory task outcome
- stale-memory failure exposure

Reports are written to `.signal-recycler/evals/latest.json` and `.signal-recycler/evals/latest.md`.

Optional live agent-backed evals are separate:

```bash
pnpm eval:live
```

By default, the live suite reports `skip`. To run it against an authenticated local CLI, set `SIGNAL_RECYCLER_LIVE_AGENT` to a supported adapter:

```bash
SIGNAL_RECYCLER_LIVE_AGENT=codex pnpm eval:live
SIGNAL_RECYCLER_LIVE_AGENT=claude pnpm eval:live
```

The live eval path is intentionally agent-adapter oriented. `OPENAI_API_KEY` is not required for the default Phase 1 live eval.

## Notes

- Requires a Node.js version with `node:sqlite`.
- Runtime state is stored in `signal-recycler.sqlite`, which is git-ignored.
- See [ROADMAP.md](./ROADMAP.md) for planned improvements.
