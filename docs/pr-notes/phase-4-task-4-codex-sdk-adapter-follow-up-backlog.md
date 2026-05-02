# Phase 4 Task 4 Codex SDK Adapter Follow-Up Backlog

## P1: Implement Real Codex CLI Adapter In Task 5

Residual risk: the registry can route to configured adapters, but `codex_cli` still intentionally has no execution adapter in this task.

Next action: in Task 5, add the Codex CLI adapter with command validation, headless execution, and verified event parsing.

## P2: Revisit Legacy Non-Registry Fallback After CLI Adapter Lands

Residual risk: `processTurn` still keeps a non-registry fallback for compatibility, which can preserve slightly different missing-adapter error text for callers that bypass app-provided registry wiring.

Next action: after the CLI adapter exists and routes always provide a registry in server startup, decide whether to keep or remove the legacy fallback path.

## P2: Add Direct Unit Coverage For Codex SDK Adapter Identity

Residual risk: route tests prove registry use and existing runner tests prove behavior through the compatibility export, but there is no direct unit assertion that `createCodexSdkAdapter(...).id === "codex_sdk"`.

Next action: add direct adapter service coverage when the test suite next touches adapter internals.
