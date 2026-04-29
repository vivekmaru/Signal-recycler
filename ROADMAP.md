# Signal Recycler — Roadmap

## Shipped

- Local Codex/OpenAI-compatible proxy for Responses API traffic.
- Codex SDK runner configured to route through the local proxy.
- Codex CLI provider installer via `pnpm codex:install` / `pnpm codex:uninstall`.
- History compression that strips noisy shell outputs, stack traces, and error dumps before forwarding requests upstream.
- Playbook injection that prepends approved rules as a system message on every proxied turn.
- Manual rule creation from the dashboard for proactive constraints before any failure happens.
- LLM-based classifier with heuristic fallback for extracting rule candidates from completed turns.
- Human approval loop for pending rules, plus high-confidence auto-approval.
- SQLite persistence for sessions, events, rules, and project-scoped memory.
- Firehose timeline endpoint for dashboard-wide live context history.
- Dashboard metrics for request count, compression count, approved rules, and estimated tokens saved.
- End-to-end demo flow that resets memory, teaches a rule, then proves the next run uses it.
- Markdown playbook export for approved rules.
- Mock Codex mode for low-cost UI demos.

## Planned

### Timeline grouping

Group consecutive proxy requests from the same logical Codex task into one collapsible timeline card. The proxy request cards already include compression and injected-rule chips, but multi-turn Codex runs can still produce several similar rows.

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
