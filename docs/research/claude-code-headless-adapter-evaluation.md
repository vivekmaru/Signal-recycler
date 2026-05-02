# Claude Code Headless Adapter Evaluation

## Phase 4 Question

Can Signal Recycler support Claude Code as a thin owned-session adapter in the same shape as the Codex CLI adapter?

## Required Adapter Contract

Signal Recycler adapters need to provide:

- A non-interactive command path that accepts a complete prompt/context envelope.
- Structured or parseable event output for assistant messages, tool calls, errors, and final result.
- Local authentication reuse without Signal Recycler owning provider API keys.
- Working directory control.
- A failure mode that can be represented as a session event.

## Evaluation Procedure

Run these commands manually on a machine with Claude Code installed and authenticated:

```bash
claude --help
claude -p "Reply with one sentence."
claude -p "List this directory." --output-format json
```

Record:

- Exact command syntax that works.
- Whether output is JSON, JSONL, plain text, or mixed stderr/stdout.
- Whether streaming assistant, tool, error, and final-result events are available.
- Whether working-directory behavior is controlled by process `cwd` or a CLI flag.
- Whether auth comes from the user's existing Claude Code setup.

## Phase 4 Decision Gate

Implementing the full Claude Code adapter should wait until the command/event shape is verified. Phase 4 should only claim that Claude Code has been evaluated unless tests prove the adapter can stream structured events reliably.
