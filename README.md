# Signal Recycler

**A Codex memory proxy that compresses noisy context and injects durable project rules into every future Codex turn.**

Signal Recycler turns Codex from a fresh assistant on every run into a project-aware operator. It sits between Codex and the OpenAI API, removes context noise, records what happened, extracts useful rules from failures, and lets developers add proactive rules before Codex starts work.

The result is simple: a vague future prompt can behave precisely because Signal Recycler carries the project's memory forward.

## Why this matters

Long agentic coding sessions rot. The useful facts are surrounded by stack traces, failed attempts, old logs, and repeated corrections. Codex can technically see the history, but the signal-to-noise ratio gets worse as the session grows.

Signal Recycler fixes that with a local memory layer:

- **Compress noise**: trims large shell outputs, stack traces, and error dumps before they are forwarded.
- **Learn from failures**: classifies completed turns and extracts reusable rule candidates.
- **Accept proactive rules**: lets you manually add constraints before running Codex.
- **Inject memory**: prepends approved playbook rules into every future Codex request.
- **Show the proof**: the dashboard displays proxy traffic, compression, token savings, injected rules, and the live playbook.

## Hackathon demo

The strongest demo is a before-and-after Codex run:

1. Start Signal Recycler.
2. Add or auto-learn a playbook rule.
3. Run a vague Codex prompt.
4. Watch the proxy inject the rule.
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

3. Signal Recycler injects the rule into the Codex request, so Codex follows the linked theme source even though the prompt itself stays intentionally vague.

That is the core product claim: **Codex plus durable project memory can execute intent that a stateless Codex run would have to guess.**

## How it works

```text
Prompt from dashboard or Codex CLI
    |
    v
Signal Recycler proxy
    |
    |-- compress noisy history
    |-- inject approved playbook rules
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
| `OPENAI_API_KEY` | Yes | - | Project API key used by the proxy when forwarding requests to OpenAI. |
| `PORT` | No | `3001` | API server port. |
| `SIGNAL_RECYCLER_DB` | No | `./signal-recycler.sqlite` | SQLite database path. |
| `SIGNAL_RECYCLER_WORKDIR` | No | repo root | Directory Codex operates in. |
| `SIGNAL_RECYCLER_PROJECT_ID` | No | basename of workdir | Namespace for rules, sessions, and events. |
| `SIGNAL_RECYCLER_CLASSIFIER_MODEL` | No | `gpt-5.4-mini` | Model used to classify turns and extract rule candidates. |
| `SIGNAL_RECYCLER_UPSTREAM_URL` | No | `https://api.openai.com` | Upstream OpenAI-compatible API target. Do not set this to the proxy URL. |
| `SIGNAL_RECYCLER_LOG_LEVEL` | No | unset | Set to `info` or `error` when debugging server behavior. |
| `SIGNAL_RECYCLER_MOCK_CODEX` | No | `0` | Set to `1` for UI-only demos without live Codex/OpenAI calls. |

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

## Dashboard

The dashboard is the main product surface:

- **Codex traffic**: send prompts through the local Codex runner.
- **Live context timeline**: see proxied requests, compression results, classifier output, and Codex events.
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
| `POST` | `/api/memory/reset` | Clear local demo memory for the current project. |
| `POST` | `/proxy/*` | Proxy OpenAI-compatible Codex traffic. |

## Verification

```bash
pnpm test
pnpm type-check
pnpm build
```

## Notes

- Requires a Node.js version with `node:sqlite`.
- Runtime state is stored in `signal-recycler.sqlite`, which is git-ignored.
- See [ROADMAP.md](./ROADMAP.md) for planned improvements.
