# Signal Recycler — Roadmap

## Shipped

- Transparent Codex SDK proxy via `OPENAI_BASE_URL`
- History compression — strips noisy shell outputs before they reach Codex
- Playbook injection — approved rules prepended as a system message on every turn
- LLM-based classifier (gpt-5.1-mini) with heuristic fallback
- Human approval loop — rules are pending until you approve or reject
- SQLite persistence across sessions
- `GET /api/config` — exposes working directory to the UI dynamically
- Token savings metric derived from real compression events

## Planned

### `pnpm playbook:sync`

Export approved rules directly into the project's `AGENTS.md` (or `CLAUDE.md`) file so they persist without Signal Recycler running. Useful for rules that have stabilised and should become permanent project conventions.

```bash
pnpm playbook:sync                  # writes to AGENTS.md in SIGNAL_RECYCLER_WORKDIR
pnpm playbook:sync --file CLAUDE.md # target a specific file
pnpm playbook:sync --dry-run        # preview the diff without writing
```

Rules already present in the file are not duplicated. Rejected rules are never written.

### Passive observation mode

Watch `~/.codex/` or a configured log path for Codex session files without requiring `OPENAI_BASE_URL` to be set. Lower friction for developers who don't want to route traffic through a proxy.

### VS Code sidebar extension

Show the active playbook and compression stats inline. Approve or reject rule candidates without switching to the browser dashboard.

### Multi-project support

Switch between projects in the dashboard without restarting the server. Rules and sessions are already namespaced by `projectId` in the DB.

### Auto-approve threshold

Rules that appear in N consecutive sessions with no contradictions could be surfaced for batch approval. Keeps the approval queue manageable on long-running projects.
