# Signal Recycler

A local Codex SDK proxy that turns failed agent work into durable project memory.

## Status

Build is implemented as a 1-day MVP:

- React/Vite dashboard at `apps/web`
- Fastify API and Codex SDK proxy at `apps/api`
- Shared TypeScript schemas at `packages/shared`
- Bundled demo repo at `fixtures/demo-repo`
- SQLite persistence for sessions, events, and rules
- Live Codex SDK path wired through the local proxy
- Mock Codex mode available only as a fallback when you do not want to spend API calls

## Quick Start

```bash
pnpm install
cp .env.example .env
# Add your real key to .env:
# OPENAI_API_KEY=sk-...
pnpm dev
```

Open http://127.0.0.1:5173.

The API runs on http://127.0.0.1:3001.

## Environment

Use `.env.example` as the reference.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `3001` | API server port. |
| `SIGNAL_RECYCLER_DB` | No | `./signal-recycler.sqlite` | SQLite database path. |
| `SIGNAL_RECYCLER_LOG_LEVEL` | No | unset | Set to `error` for useful failure logs. Avoid `info` unless you want every request logged. |
| `SIGNAL_RECYCLER_CONNECT_TIMEOUT_MS` | No | `60000` | Upstream OpenAI connect timeout used by the proxy. |
| `OPENAI_API_KEY` | Yes for real demo | unset | Required for live Codex/OpenAI calls. |
| `OPENAI_BASE_URL` | No | `https://api.openai.com` | Upstream API base for proxy pass-through. |
| `SIGNAL_RECYCLER_CLASSIFIER_MODEL` | No | `gpt-5.1-mini` | Model used for structured rule extraction. |
| `SIGNAL_RECYCLER_MOCK_CODEX` | No | `0` | Set to `1` only for deterministic local fallback mode. |

Recommended hackathon mode with real Codex:

```bash
OPENAI_API_KEY=sk-... pnpm dev
```

Fallback UI-only mode:

```bash
SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev
```

In real mode, the API creates Codex SDK threads against `fixtures/demo-repo` and configures the SDK with the local Signal Recycler proxy base URL. That is the “not possible before Codex” part: the app is not just summarizing chat; it is supervising an actual Codex agent loop, observing tool-backed repo work, and feeding approved lessons into future Codex turns.

## Demo Script

The demo has two turns:

- `Teach memory`: Codex is asked to validate the fixture by trying `npm test`. The fixture is designed to reject npm-driven script execution, so this creates a concrete failure and correction: use pnpm.
- `Use memory`: After you approve the generated rule, a fresh Codex turn receives the Signal Recycler Playbook through the proxy and should avoid repeating the npm path.

1. Start the app with your real OpenAI key:

   ```bash
   OPENAI_API_KEY=sk-... pnpm dev
   ```

2. Open http://127.0.0.1:5173.

3. Click `Teach memory`, then `Run prompt`.

4. In the right Playbook panel, approve the pending rule:

   ```text
   Use pnpm instead of npm for package and script operations in this repo.
   ```

5. Click `Use memory`, then `Run prompt`.

6. Confirm the timeline includes `proxy request` and `proxy injection`, and the second response references the injected playbook rule.

For a deterministic fallback demo without API calls, run `SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev` and follow the same steps.

## Terminal Smoke Test

With the API server already running:

```bash
pnpm smoke:demo
```

Expected result:

- Creates a session.
- Runs Teach memory.
- Approves the first generated rule.
- Runs Use memory.
- Prints `hasProxyInjection: true`.
- Prints a second response that references the approved pnpm rule.

By default, this smoke script is most reliable in mock mode. Use the browser flow for the real Codex demo.

## Verification

```bash
pnpm test
pnpm type-check
pnpm build
```

Current verified state:

- `pnpm test` passes.
- `pnpm type-check` passes.
- `pnpm build` passes.

## API Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/sessions` | Create a demo Codex session. |
| `POST` | `/api/sessions/:id/run` | Run a prompt through Signal Recycler. |
| `GET` | `/api/sessions/:id/events` | Read timeline events. |
| `GET` | `/api/rules` | List playbook rules. |
| `POST` | `/api/rules/:id/approve` | Approve a candidate rule. |
| `POST` | `/api/rules/:id/reject` | Reject a candidate rule. |
| `GET` | `/api/playbook/export` | Export approved rules as Markdown. |
| `POST` | `/proxy/*` | Proxy Codex/OpenAI-compatible traffic upstream. |

## Notes

- This repo currently requires a recent Node version with `node:sqlite`; it was built and verified with Node `v25.8.1`.
- The root `signal-recycler.sqlite` file is runtime state and is ignored by git.
- Playwright screenshot verification is not configured yet.
