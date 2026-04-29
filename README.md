# Signal Recycler

A local Codex SDK proxy that compresses noisy agent history and turns failed work into durable, human-approved project memory — injected automatically into every future turn.

## How it works

```
Your prompt
    │
    ▼
Signal Recycler Proxy  ◄── sits between Codex CLI / SDK and OpenAI
    │
    ├─ 1. Compress  — strips large stack traces & error dumps from history
    ├─ 2. Inject    — prepends approved playbook rules as a system message
    │
    ▼
OpenAI Responses API   ◄── leaner context, better focus, real token savings
    │
    ▼
Codex response
    │
    ▼
Signal Recycler Classifier  ◄── marks signal / noise / failure
    │
    ▼
Rule candidates  ◄── you approve or reject in the dashboard
```

## Quick Start

```bash
pnpm install
cp .env.example .env
# Add a Project API key (sk-proj-...) — required for the Responses API:
# OPENAI_API_KEY=sk-proj-...
pnpm dev
```

Open http://127.0.0.1:5173. The API runs on http://127.0.0.1:3001.

## Use with your own project

Point Signal Recycler at any directory:

```bash
SIGNAL_RECYCLER_WORKDIR=/path/to/your/project pnpm dev
```

Or set it in `.env`:

```
SIGNAL_RECYCLER_WORKDIR=/path/to/your/project
SIGNAL_RECYCLER_PROJECT_ID=my-project
```

## Use with Codex CLI (shell integration)

The Codex CLI authenticates via ChatGPT OAuth by default, which **bypasses `OPENAI_BASE_URL`**. To route it through Signal Recycler, register a custom `model_provider`. We ship two scripts that manage `~/.codex/config.toml` for you safely (they back up your file the first time and only edit a clearly-marked managed block):

```bash
pnpm codex:install      # add the signal_recycler model_provider block
pnpm codex:uninstall    # remove it, restoring your config.toml
```

Both commands are idempotent. A backup is written to `~/.codex/config.toml.bak.signal-recycler` the first time we modify the file.

**Then in any terminal:**

```bash
export OPENAI_API_KEY=sk-proj-...
codex -c model_provider='"signal_recycler"' "your prompt..."
```

Or set `model_provider = "signal_recycler"` at the top of `~/.codex/config.toml` to make it the default for every `codex` invocation.

Start Signal Recycler once (`pnpm dev`) and leave it running. Every CLI turn is now intercepted, compressed, and given the approved playbook — visible live in the dashboard timeline.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | — | Project API key (`sk-proj-...`) — required for the Responses API. |
| `SIGNAL_RECYCLER_WORKDIR` | No | repo root | Directory Codex operates in. |
| `SIGNAL_RECYCLER_PROJECT_ID` | No | basename of workdir | Namespace for rules and sessions. |
| `PORT` | No | `3001` | API server port. |
| `SIGNAL_RECYCLER_DB` | No | `./signal-recycler.sqlite` | SQLite database path. |
| `SIGNAL_RECYCLER_UPSTREAM_URL` | No | `https://api.openai.com` | Where the proxy forwards traffic. Never set this to the proxy URL. |
| `SIGNAL_RECYCLER_CLASSIFIER_MODEL` | No | `gpt-5.1-mini` | Model used for rule extraction. |
| `SIGNAL_RECYCLER_MOCK_CODEX` | No | `0` | Set to `1` for UI-only demos without API calls. |
| `OPENAI_BASE_URL` | Shell only | — | Set this in your shell (not `.env`) to route the Codex CLI through the proxy. |

## Meta demo (Signal Recycler on itself)

By default, `SIGNAL_RECYCLER_WORKDIR` resolves to this repo. The **Teach memory** button runs `pnpm test` against Signal Recycler itself. Failures become candidate rules. Approve them, then run **Use memory** — the proxy injects the rules into the next Codex turn automatically.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/config` | Working directory and project ID. |
| `POST` | `/api/sessions` | Create a session. |
| `POST` | `/api/sessions/:id/run` | Run a prompt through Signal Recycler. |
| `GET` | `/api/sessions/:id/events` | Read timeline events. |
| `GET` | `/api/rules` | List playbook rules. |
| `POST` | `/api/rules/:id/approve` | Approve a candidate rule. |
| `POST` | `/api/rules/:id/reject` | Reject a candidate rule. |
| `GET` | `/api/playbook/export` | Export approved rules as Markdown. |
| `POST` | `/proxy/*` | Proxy Codex/OpenAI-compatible traffic. |

## Verification

```bash
pnpm test
pnpm type-check
pnpm build
```

## Notes

- Requires Node.js with `node:sqlite` (verified on v25.8.1).
- `signal-recycler.sqlite` is runtime state — git-ignored.
- See [ROADMAP.md](./ROADMAP.md) for planned features.
