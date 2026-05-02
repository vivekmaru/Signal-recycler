# Phase 4 Owned Session Adapter Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Signal Recycler from a Codex-specific proxy runner toward owned sessions backed by thin agent adapters and a shared memory/context runtime.

**Architecture:** Add an adapter abstraction under the existing `/api/sessions/:id/run` path. The first adapter is a deterministic mock adapter, the second is the existing Codex SDK proxy adapter wrapped to the same interface, and the third is an opt-in Codex CLI headless adapter that runs `codex exec --json`. Memory retrieval, injection, audit, and post-run learning stay in shared services instead of adapter-specific code.

**Tech Stack:** TypeScript, Fastify, Node child process APIs, SQLite-backed store, Vitest route/service tests.

---

## Scope Anchor

Roadmap phase: **Phase 4: Owned Session Adapter Layer**.

Goal from roadmap: move from Codex-specific proxy behavior toward Signal Recycler-owned sessions backed by headless CLI adapters and a general memory service API.

Success criteria covered in this plan:

- Existing proxy/runner path remains available with maintenance-level changes only.
- Codex headless mode is supported through `codex exec --json` behind an explicit adapter option.
- Claude Code headless mode is evaluated as a second adapter path without becoming a full implementation dependency in this PR.
- Additional integrations can call stable memory service APIs to retain, retrieve, inject, and audit memory.
- Agent-specific adapters are thin; core memory logic is shared.
- CLI adapters stream structured events into the dashboard/event log.
- `AGENTS.md` and `CLAUDE.md` sync remains an adapter/export path, not the primary memory store.

Explicitly out of scope:

- Full Phase 4.5 dashboard session UX.
- Resume UI and context envelope preview UI.
- Repo context indexing.
- JIT rehydration.
- Cloud sync.
- Making the proxy adapter the primary future path.

## File Structure

- Modify `packages/shared/src/index.ts`
  - Add `agentAdapterSchema` and extend run request validation with optional adapter/mode fields.
- Modify `apps/api/src/types.ts`
  - Replace `CodexRunner` with adapter-oriented types while preserving compatibility aliases where useful.
- Create `apps/api/src/services/contextEnvelope.ts`
  - Shared pre-run retrieval/injection/audit builder for owned-session adapters.
- Create `apps/api/src/services/agentAdapters.ts`
  - Adapter registry and adapter selection helpers.
- Create `apps/api/src/services/mockAdapter.ts`
  - Deterministic adapter used by tests and `SIGNAL_RECYCLER_MOCK_CODEX=1`.
- Create `apps/api/src/services/codexSdkAdapter.ts`
  - Thin wrapper around the current Codex SDK proxy runner behavior.
- Create `apps/api/src/services/codexCliAdapter.ts`
  - Headless Codex CLI adapter using `codex exec --json`.
- Modify `apps/api/src/codexRunner.ts`
  - Reduce to compatibility factory that delegates to the adapter registry, or move its implementation into `codexSdkAdapter.ts`.
- Modify `apps/api/src/services/turnProcessor.ts`
  - Process an owned-session adapter run and keep classification shared.
- Modify `apps/api/src/routes/sessions.ts`
  - Accept adapter selection and pass it into `processTurn`.
- Modify `apps/api/src/server.test.ts`
  - Add route coverage for adapter selection, CLI event streaming, and adapter errors.
- Create `apps/api/src/services/contextEnvelope.test.ts`
  - Unit tests for memory retrieval/injection/audit outside adapter code.
- Create `apps/api/src/services/agentAdapters.test.ts`
  - Unit tests for adapter registry behavior.
- Create `apps/api/src/services/codexCliAdapter.test.ts`
  - Unit tests for JSONL parsing and child-process error behavior with mocked process spawning.
- Modify `README.md`
  - Document the adapter modes truthfully.
- Create `docs/pr-notes/phase-4-owned-session-adapter-layer-review-guide.md`
  - Review guide.
- Create `docs/pr-notes/phase-4-owned-session-adapter-layer-follow-up-backlog.md`
  - Residual risks and Phase 4.5 handoff.

---

### Task 1: Shared Run Request Adapter Selection

**Files:**

- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/routes/sessions.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Add failing route test for adapter selection**

Add this test in `apps/api/src/server.test.ts` near existing session run tests:

```ts
it("runs a session with an explicitly selected mock adapter", async () => {
  const store = createStore(":memory:");
  const app = await createApp({
    ...TEST_APP_OPTIONS,
    store,
    codexRunner: {
      run: async () => {
        throw new Error("default runner should not be used");
      }
    }
  });
  const session = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });

  const run = await app.inject({
    method: "POST",
    url: `/api/sessions/${session.json().id}/run`,
    payload: {
      prompt: "Run package manager validation for this repo.",
      adapter: "mock"
    }
  });

  expect(run.statusCode).toBe(200);
  expect(run.json().finalResponse).toContain("Encountered a failure");
  expect(store.listEvents(session.json().id).map((event) => event.category)).toContain(
    "codex_event"
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: request schema rejects `adapter`, or route still uses the default runner.

- [ ] **Step 3: Extend shared schema**

In `packages/shared/src/index.ts`, add:

```ts
export const agentAdapterSchema = z.enum(["default", "mock", "codex_sdk", "codex_cli"]);
export type AgentAdapter = z.infer<typeof agentAdapterSchema>;
```

Replace `runRequestSchema` with:

```ts
export const runRequestSchema = z.object({
  prompt: z.string().min(1),
  adapter: agentAdapterSchema.default("default")
});
```

- [ ] **Step 4: Pass adapter through session route**

In `apps/api/src/routes/sessions.ts`, pass adapter into `processTurn`:

```ts
return await processTurn({
  store: options.store,
  codexRunner: options.codexRunner,
  projectId,
  sessionId: id,
  prompt: parsed.prompt,
  adapter: parsed.adapter
});
```

- [ ] **Step 5: Add temporary processTurn adapter handling**

In `apps/api/src/services/turnProcessor.ts`, extend input type:

```ts
adapter?: AgentAdapter;
```

For now, if `input.adapter === "mock"`, call a local deterministic mock runner helper. This will be replaced by the formal registry in Task 3:

```ts
const turn =
  input.adapter === "mock"
    ? await runMockTurn(input)
    : await input.codexRunner.run({
        sessionId: input.sessionId,
        prompt: input.prompt,
        ...(input.workingDirectory ? { workingDirectory: input.workingDirectory } : {})
      });
```

Implement `runMockTurn` by returning the same no-memory fallback as existing mock mode:

```ts
async function runMockTurn(input: ProcessTurnInput): Promise<{ finalResponse: string; items: unknown[] }> {
  return {
    finalResponse: "Encountered a failure. The correction should be captured as a durable rule.",
    items: [{ type: "mock", injected: input.prompt }]
  };
}
```

- [ ] **Step 6: Run route test**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: test passes.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/routes/sessions.ts apps/api/src/services/turnProcessor.ts apps/api/src/server.test.ts
git commit -m "feat: accept owned-session adapter selection"
```

---

### Task 2: Extract Shared Context Envelope Builder

**Files:**

- Create: `apps/api/src/services/contextEnvelope.ts`
- Create: `apps/api/src/services/contextEnvelope.test.ts`
- Modify: `apps/api/src/codexRunner.ts`
- Modify: `apps/api/src/services/turnProcessor.ts`

- [ ] **Step 1: Write context envelope tests**

Create `apps/api/src/services/contextEnvelope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createStore } from "../store.js";
import { buildContextEnvelope } from "./contextEnvelope.js";

describe("context envelope", () => {
  it("retrieves, injects, and audits selected memory", () => {
    const store = createStore(":memory:");
    const memory = store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "package-manager",
        rule: "Use pnpm test instead of npm test.",
        reason: "This repo uses pnpm workspaces."
      }).id
    );

    const envelope = buildContextEnvelope({
      store,
      projectId: "demo",
      sessionId: "session_demo",
      adapter: "mock",
      prompt: "Run package manager validation for this repo."
    });

    expect(envelope.prompt).toContain("Use pnpm test instead of npm test.");
    expect(envelope.retrieval.metrics).toMatchObject({
      approvedMemories: 1,
      selectedMemories: 1,
      skippedMemories: 0
    });
    expect(store.listEvents("session_demo").map((event) => event.category)).toEqual([
      "memory_retrieval",
      "memory_injection"
    ]);
    expect(store.listMemoryUsages(memory.id)).toHaveLength(1);
  });

  it("does not audit injection when no memory is selected", () => {
    const store = createStore(":memory:");
    store.approveRule(
      store.createRuleCandidate({
        projectId: "demo",
        category: "theme",
        rule: "Use approved theme tokens.",
        reason: "Theme work follows design system."
      }).id
    );

    const envelope = buildContextEnvelope({
      store,
      projectId: "demo",
      sessionId: "session_demo",
      adapter: "mock",
      prompt: "Run package manager validation."
    });

    expect(envelope.prompt).toBe("Run package manager validation.");
    expect(store.listEvents("session_demo").map((event) => event.category)).toEqual([
      "memory_retrieval"
    ]);
  });
});
```

- [ ] **Step 2: Verify failing tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- contextEnvelope.test.ts
```

Expected: fails because `contextEnvelope.ts` does not exist.

- [ ] **Step 3: Implement `buildContextEnvelope`**

Create `apps/api/src/services/contextEnvelope.ts`:

```ts
import { injectPlaybookRules } from "../playbook.js";
import { type SignalRecyclerStore } from "../store.js";
import { recordMemoryInjection } from "./memoryInjection.js";
import { retrieveRelevantMemories } from "./memoryRetrieval.js";

export type ContextEnvelopeInput = {
  store: SignalRecyclerStore;
  projectId: string;
  sessionId: string;
  adapter: string;
  prompt: string;
  limit?: number;
};

export function buildContextEnvelope(input: ContextEnvelopeInput) {
  const retrieval = retrieveRelevantMemories({
    store: input.store,
    projectId: input.projectId,
    query: input.prompt,
    limit: input.limit ?? 5
  });

  input.store.createEvent({
    sessionId: input.sessionId,
    category: "memory_retrieval",
    title: `Retrieved ${retrieval.metrics.selectedMemories} of ${retrieval.metrics.approvedMemories} approved memories`,
    body: `Selected ${retrieval.metrics.selectedMemories} approved memor${retrieval.metrics.selectedMemories === 1 ? "y" : "ies"}; skipped ${retrieval.metrics.skippedMemories}.`,
    metadata: {
      projectId: input.projectId,
      query: retrieval.query,
      selected: retrieval.selected,
      skipped: retrieval.skipped,
      metrics: retrieval.metrics
    }
  });

  const prompt = injectPlaybookRules(input.prompt, retrieval.memories);
  recordMemoryInjection({
    store: input.store,
    projectId: input.projectId,
    sessionId: input.sessionId,
    adapter: input.adapter,
    memories: retrieval.memories,
    reason: "approved_project_memory",
    metadata: {
      retrieval: {
        query: retrieval.query,
        selected: retrieval.selected,
        skipped: retrieval.skipped,
        metrics: retrieval.metrics
      }
    }
  });

  return {
    prompt,
    retrieval,
    memoryIds: retrieval.memories.map((memory) => memory.id)
  };
}
```

- [ ] **Step 4: Use context envelope in mock runner path**

Modify `turnProcessor.ts` mock adapter path to call `buildContextEnvelope` and pass the injected prompt into mock output.

- [ ] **Step 5: Defer Codex SDK migration until Task 4**

Do not edit `codexRunner.ts` yet if tests pass. It will become the compatibility adapter in Task 4.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @signal-recycler/api test -- contextEnvelope.test.ts server.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/contextEnvelope.ts apps/api/src/services/contextEnvelope.test.ts apps/api/src/services/turnProcessor.ts
git commit -m "feat: share owned-session context envelope"
```

---

### Task 3: Add Agent Adapter Registry

**Files:**

- Create: `apps/api/src/services/agentAdapters.ts`
- Create: `apps/api/src/services/agentAdapters.test.ts`
- Create: `apps/api/src/services/mockAdapter.ts`
- Modify: `apps/api/src/services/turnProcessor.ts`
- Modify: `apps/api/src/types.ts`

- [ ] **Step 1: Add registry tests**

Create `apps/api/src/services/agentAdapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAgentAdapterRegistry } from "./agentAdapters.js";

describe("agent adapter registry", () => {
  it("resolves default to the configured default adapter", () => {
    const registry = createAgentAdapterRegistry({ defaultAdapter: "mock" });
    expect(registry.resolve("default").id).toBe("mock");
  });

  it("throws for codex_cli when command is unavailable", () => {
    const registry = createAgentAdapterRegistry({ defaultAdapter: "mock", codexCliCommand: null });
    expect(() => registry.resolve("codex_cli")).toThrow("Codex CLI adapter is not configured");
  });
});
```

- [ ] **Step 2: Verify failing tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- agentAdapters.test.ts
```

- [ ] **Step 3: Define adapter types**

Modify `apps/api/src/types.ts`:

```ts
import { type AgentAdapter as AgentAdapterId } from "@signal-recycler/shared";

export type AgentRunInput = {
  sessionId: string;
  prompt: string;
  workingDirectory?: string;
};

export type AgentRunResult = {
  finalResponse: string;
  items: unknown[];
};

export type AgentAdapter = {
  id: Exclude<AgentAdapterId, "default">;
  run(input: AgentRunInput): Promise<AgentRunResult>;
};

export type CodexRunner = AgentAdapter;
```

- [ ] **Step 4: Add mock adapter**

Create `apps/api/src/services/mockAdapter.ts`:

```ts
import { type AgentAdapter } from "../types.js";

export function createMockAdapter(): AgentAdapter {
  return {
    id: "mock",
    async run(input) {
      return {
        finalResponse: input.prompt.includes("<signal-recycler-playbook>")
          ? "Checking learned constraints from playbook... Applying rules before proceeding."
          : "Encountered a failure. The correction should be captured as a durable rule.",
        items: [{ type: "mock", injected: input.prompt }]
      };
    }
  };
}
```

- [ ] **Step 5: Add registry**

Create `apps/api/src/services/agentAdapters.ts`:

```ts
import { type AgentAdapter as AgentAdapterId } from "@signal-recycler/shared";
import { type AgentAdapter } from "../types.js";
import { createMockAdapter } from "./mockAdapter.js";

type RegistryOptions = {
  defaultAdapter: Exclude<AgentAdapterId, "default">;
  codexCliCommand?: string | null;
  adapters?: Partial<Record<Exclude<AgentAdapterId, "default">, AgentAdapter>>;
};

export function createAgentAdapterRegistry(options: RegistryOptions) {
  const mock = options.adapters?.mock ?? createMockAdapter();
  const adapters: Partial<Record<Exclude<AgentAdapterId, "default">, AgentAdapter>> = {
    mock,
    ...options.adapters
  };

  return {
    resolve(id: AgentAdapterId): AgentAdapter {
      const resolvedId = id === "default" ? options.defaultAdapter : id;
      if (resolvedId === "codex_cli" && !options.codexCliCommand && !adapters.codex_cli) {
        throw new Error("Codex CLI adapter is not configured");
      }
      const adapter = adapters[resolvedId];
      if (!adapter) throw new Error(`Agent adapter is not configured: ${resolvedId}`);
      return adapter;
    }
  };
}
```

- [ ] **Step 6: Wire registry into turn processor**

Update `processTurn` to accept optional `adapterRegistry` or a resolved adapter. Keep existing `codexRunner` as fallback for compatibility. The route can still pass `codexRunner`; Task 4 will finish registry wiring.

- [ ] **Step 7: Run tests**

```bash
pnpm --filter @signal-recycler/api test -- agentAdapters.test.ts server.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/services/agentAdapters.ts apps/api/src/services/agentAdapters.test.ts apps/api/src/services/mockAdapter.ts apps/api/src/services/turnProcessor.ts
git commit -m "feat: add owned-session adapter registry"
```

---

### Task 4: Codex SDK Compatibility Adapter

**Files:**

- Create: `apps/api/src/services/codexSdkAdapter.ts`
- Modify: `apps/api/src/codexRunner.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Move current Codex SDK runner into adapter file**

Create `apps/api/src/services/codexSdkAdapter.ts` by moving the current `createCodexRunner` implementation from `apps/api/src/codexRunner.ts`. Keep the internal retrieval and mock behavior unchanged until the shared envelope migration is complete; this task is a compatibility wrapper, not behavior cleanup.

```ts
import { Codex } from "@openai/codex-sdk";
import { injectPlaybookRules } from "../playbook.js";
import { recordMemoryInjection } from "./memoryInjection.js";
import { retrieveRelevantMemories } from "./memoryRetrieval.js";
import { type SignalRecyclerStore } from "../store.js";
import { type AgentAdapter } from "../types.js";

type ThreadLike = {
  run(prompt: string): Promise<{ finalResponse?: string; items?: unknown[] }>;
};

export function createCodexSdkAdapter(input: {
  store: SignalRecyclerStore;
  apiPort: number;
  projectId: string;
  workingDirectory: string;
}): AgentAdapter {
  const threads = new Map<string, ThreadLike>();
  const codex = new Codex({
    baseUrl: `http://127.0.0.1:${input.apiPort}/proxy/v1`,
    ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {}),
    env: stringEnv(process.env)
  });

  return {
    id: "codex_sdk",
    async run({ sessionId, prompt, workingDirectory: overrideDir }) {
      const effectiveDir = overrideDir ?? input.workingDirectory;
      const rules = input.store.listApprovedRules(input.projectId);
      input.store.createEvent({
        sessionId,
        category: "proxy_request",
        title: "Codex SDK routed through proxy",
        body: `Running in ${effectiveDir} — Signal Recycler will intercept and compress traffic before Codex sees it.`,
        metadata: { approvedRulesAvailable: rules.length, workingDirectory: effectiveDir }
      });

      if (process.env.SIGNAL_RECYCLER_MOCK_CODEX === "1") {
        const retrieval = retrieveRelevantMemories({
          store: input.store,
          projectId: input.projectId,
          query: prompt,
          limit: 5
        });
        input.store.createEvent({
          sessionId,
          category: "memory_retrieval",
          title: `Retrieved ${retrieval.metrics.selectedMemories} of ${retrieval.metrics.approvedMemories} approved memories`,
          body: `Selected ${retrieval.metrics.selectedMemories} approved memor${retrieval.metrics.selectedMemories === 1 ? "y" : "ies"}; skipped ${retrieval.metrics.skippedMemories}.`,
          metadata: {
            projectId: input.projectId,
            query: retrieval.query,
            selected: retrieval.selected,
            skipped: retrieval.skipped,
            metrics: retrieval.metrics
          }
        });
        const injected = injectPlaybookRules(prompt, retrieval.memories);
        recordMemoryInjection({
          store: input.store,
          projectId: input.projectId,
          sessionId,
          adapter: "mock-codex",
          memories: retrieval.memories,
          reason: "approved_project_memory",
          metadata: {
            retrieval: {
              query: retrieval.query,
              selected: retrieval.selected,
              skipped: retrieval.skipped,
              metrics: retrieval.metrics
            }
          }
        });
        return {
          finalResponse:
            retrieval.memories.length > 0
              ? `Checking learned constraints from playbook... ${retrieval.memories[0]?.rule ?? ""} Applying rules before proceeding.`
              : "Encountered a failure. The correction should be captured as a durable rule.",
          items: [{ type: "mock", injected }]
        };
      }

      const threadKey = `${sessionId}::${effectiveDir}`;
      let thread = threads.get(threadKey);
      if (!thread) {
        thread = codex.startThread({
          workingDirectory: effectiveDir,
          skipGitRepoCheck: true
        }) as ThreadLike;
        threads.set(threadKey, thread);
      }

      const turn = await thread.run(prompt);
      return {
        finalResponse: turn.finalResponse ?? "",
        items: turn.items ?? []
      };
    }
  };
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}
```

- [ ] **Step 2: Keep compatibility export**

Replace `apps/api/src/codexRunner.ts` with:

```ts
export { createCodexSdkAdapter as createCodexRunner } from "./services/codexSdkAdapter.js";
```

- [ ] **Step 3: Add app options for adapter registry**

Modify `apps/api/src/app.ts`:

```ts
agentAdapterRegistry?: ReturnType<typeof createAgentAdapterRegistry>;
```

Pass registry into `registerSessionRoutes`.

- [ ] **Step 4: Wire server registry**

Modify `apps/api/src/server.ts` so the existing runner construction is assigned once and reused by both the compatibility option and the adapter registry:

```ts
const codexSdkAdapter = createCodexSdkAdapter({
  store,
  apiPort: port,
  projectId,
  workingDirectory
});
const agentAdapterRegistry = createAgentAdapterRegistry({
  defaultAdapter: process.env.SIGNAL_RECYCLER_MOCK_CODEX === "1" ? "mock" : "codex_sdk",
  adapters: { codex_sdk: codexSdkAdapter }
});
```

Pass `codexRunner: codexSdkAdapter` for compatibility and `agentAdapterRegistry`.

- [ ] **Step 5: Route uses registry**

Modify `registerSessionRoutes` to pass the parsed adapter into `processTurn` and the app-provided registry.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts agentAdapters.test.ts
pnpm --filter @signal-recycler/api type-check
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/server.ts apps/api/src/codexRunner.ts apps/api/src/services/codexSdkAdapter.ts apps/api/src/routes/sessions.ts apps/api/src/server.test.ts
git commit -m "feat: wrap codex sdk as owned-session adapter"
```

---

### Task 5: Codex CLI Headless Adapter

**Files:**

- Create: `apps/api/src/services/codexCliAdapter.ts`
- Create: `apps/api/src/services/codexCliAdapter.test.ts`
- Modify: `apps/api/src/services/agentAdapters.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `README.md`

- [ ] **Step 1: Add JSONL parser tests**

Create `apps/api/src/services/codexCliAdapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { parseCodexJsonLine } from "./codexCliAdapter.js";

describe("codex CLI adapter", () => {
  it("parses assistant message events", () => {
    expect(parseCodexJsonLine(JSON.stringify({ type: "message", role: "assistant", content: "Done" }))).toEqual({
      kind: "message",
      body: "Done",
      raw: { type: "message", role: "assistant", content: "Done" }
    });
  });

  it("preserves unknown JSONL events as raw events", () => {
    expect(parseCodexJsonLine(JSON.stringify({ type: "tool_call", name: "shell" }))).toEqual({
      kind: "raw",
      body: "{\"type\":\"tool_call\",\"name\":\"shell\"}",
      raw: { type: "tool_call", name: "shell" }
    });
  });

  it("preserves non-json lines as raw text", () => {
    expect(parseCodexJsonLine("not json")).toEqual({
      kind: "raw",
      body: "not json",
      raw: "not json"
    });
  });
});
```

- [ ] **Step 2: Verify failing tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- codexCliAdapter.test.ts
```

- [ ] **Step 3: Implement parser and adapter skeleton**

Create `apps/api/src/services/codexCliAdapter.ts`:

```ts
import { spawn } from "node:child_process";
import { type SignalRecyclerStore } from "../store.js";
import { type AgentAdapter, type AgentRunInput, type AgentRunResult } from "../types.js";

type ParsedCliEvent = {
  kind: "message" | "raw";
  body: string;
  raw: unknown;
};

export function parseCodexJsonLine(line: string): ParsedCliEvent {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (parsed.type === "message" && parsed.role === "assistant" && typeof parsed.content === "string") {
      return { kind: "message", body: parsed.content, raw: parsed };
    }
    return { kind: "raw", body: JSON.stringify(parsed), raw: parsed };
  } catch {
    return { kind: "raw", body: line, raw: line };
  }
}

export function createCodexCliAdapter(input: {
  store: SignalRecyclerStore;
  command?: string;
}): AgentAdapter {
  const command = input.command ?? "codex";
  return {
    id: "codex_cli",
    run(runInput) {
      return runCodexCli({ ...runInput, store: input.store, command });
    }
  };
}

function runCodexCli(input: AgentRunInput & { store: SignalRecyclerStore; command: string }): Promise<AgentRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, ["exec", "--json", input.prompt], {
      cwd: input.workingDirectory,
      env: process.env
    });
    const messages: string[] = [];
    const items: unknown[] = [];
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const event = parseCodexJsonLine(line);
        items.push(event.raw);
        if (event.kind === "message") messages.push(event.body);
        input.store.createEvent({
          sessionId: input.sessionId,
          category: "codex_event",
          title: event.kind === "message" ? "Codex CLI message" : "Codex CLI event",
          body: event.body,
          metadata: { adapter: "codex_cli", raw: event.raw }
        });
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`codex exec failed with exit code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve({ finalResponse: messages.join("\n").trim(), items });
    });
  });
}
```

- [ ] **Step 4: Wire adapter registry**

In `agentAdapters.ts`, accept an optional `codex_cli` adapter in `adapters`. In `server.ts`, if `SIGNAL_RECYCLER_CODEX_CLI=1`, register `createCodexCliAdapter({ store })`.

- [ ] **Step 5: Document CLI adapter**

Update `README.md` with:

```markdown
Codex CLI adapter is opt-in:

```bash
SIGNAL_RECYCLER_CODEX_CLI=1 pnpm dev
```

Then run a session with `{ "adapter": "codex_cli" }`. This uses local Codex CLI auth and does not require `OPENAI_API_KEY` for the agent run.
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @signal-recycler/api test -- codexCliAdapter.test.ts agentAdapters.test.ts server.test.ts
pnpm --filter @signal-recycler/api type-check
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/codexCliAdapter.ts apps/api/src/services/codexCliAdapter.test.ts apps/api/src/services/agentAdapters.ts apps/api/src/server.ts README.md
git commit -m "feat: add codex cli owned-session adapter"
```

---

### Task 6: Memory Service API For Integrations

**Files:**

- Modify: `apps/api/src/routes/rules.ts`
- Modify: `apps/api/src/server.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Add stable retain/retrieve endpoint tests**

In `apps/api/src/server.test.ts`, add:

```ts
it("retains memory through the stable memory service API", async () => {
  const store = createStore(":memory:");
  const app = await createApp({
    ...TEST_APP_OPTIONS,
    store,
    codexRunner: { run: async () => ({ finalResponse: "ok", items: [] }) }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/memory/retain",
    payload: {
      category: "package-manager",
      rule: "Use pnpm test instead of npm test.",
      reason: "External integration retained this memory.",
      memoryType: "command_convention",
      scope: { type: "project", value: null }
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    status: "approved",
    source: { kind: "import", label: "api" }
  });
});
```

- [ ] **Step 2: Implement `/api/memory/retain`**

In `apps/api/src/routes/rules.ts`, add a POST route that mirrors `/api/memories` but stores `source: { kind: "import", label: "api" }`.

- [ ] **Step 3: Keep `/api/memory/retrieve` as the retrieval API**

Do not rename existing retrieval route. Update README to document retain/retrieve together.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/rules.ts apps/api/src/server.test.ts README.md
git commit -m "feat: add stable memory retain api"
```

---

### Task 7: Claude Code Headless Adapter Evaluation

**Files:**

- Create: `docs/research/claude-code-headless-adapter-evaluation.md`

- [ ] **Step 1: Create the evaluation note**

Create `docs/research/claude-code-headless-adapter-evaluation.md`:

```markdown
# Claude Code Headless Adapter Evaluation

## Phase 4 Question

Can Signal Recycler support Claude Code as a thin owned-session adapter in the same shape as the Codex CLI adapter?

## Required Adapter Contract

Signal Recycler adapters need to provide:

- A non-interactive command path that accepts a complete prompt/context envelope.
- Structured or parseable event output for assistant messages, tool calls, errors, and final result.
- Local authentication reuse without Signal Recycler owning provider API keys.
- A way to set the working directory.
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
- Whether tool events are available before the final answer.
- Whether working-directory behavior is controlled by `cwd` or a CLI flag.
- Whether auth comes from the user's existing Claude Code setup.

## Phase 4 Decision Gate

Implementing the full Claude Code adapter should wait until the command/event shape is verified. Phase 4 should only claim that Claude Code has been evaluated unless tests prove the adapter can stream structured events reliably.
```

- [ ] **Step 2: Commit**

```bash
git add docs/research/claude-code-headless-adapter-evaluation.md
git commit -m "docs: evaluate claude code adapter path"
```

---

### Task 8: PR Notes And Final Verification

**Files:**

- Create: `docs/pr-notes/phase-4-owned-session-adapter-layer-review-guide.md`
- Create: `docs/pr-notes/phase-4-owned-session-adapter-layer-follow-up-backlog.md`

- [ ] **Step 1: Add review guide**

Create `docs/pr-notes/phase-4-owned-session-adapter-layer-review-guide.md`:

```markdown
# Phase 4 Owned Session Adapter Layer Review Guide

## Scope Summary

This PR introduces the owned-session adapter layer. It keeps the existing proxy/Codex SDK path available, adds a shared context envelope builder, introduces adapter selection, and adds an opt-in Codex CLI adapter.

## Change Map

- Shared schemas: adapter selection on session runs.
- Context envelope: shared retrieval/injection/audit path.
- Adapter registry: mock, Codex SDK compatibility, Codex CLI.
- Session route: adapter-aware run requests.
- Memory service API: stable retain/retrieve surface for integrations.
- Docs: adapter mode documentation and verification notes.

## Reviewer Focus Areas

- Core memory retrieval/injection should stay shared, not duplicated per adapter.
- Existing proxy/Codex SDK behavior should remain available.
- Codex CLI adapter should be opt-in and should not require `OPENAI_API_KEY`.
- CLI JSONL events should be visible as session events.
- Internal classifier/proxy hardening from Phase 3.1 should remain intact.

## Known Non-Blockers

- Claude Code adapter is evaluated in `docs/research/claude-code-headless-adapter-evaluation.md` but not fully implemented in this PR.
- Dashboard UX remains Phase 4.5.
- CLI resume semantics are adapter-specific and deferred.

## Verification

- Before opening the PR, replace this line with the actual command results from Step 3.

## Out Of Scope

- Repo context index.
- Context envelope preview UI.
- JIT rehydration.
- Cloud sync.
```

- [ ] **Step 2: Add follow-up backlog**

Create `docs/pr-notes/phase-4-owned-session-adapter-layer-follow-up-backlog.md`:

```markdown
# Phase 4 Owned Session Adapter Layer Follow-Up Backlog

## P1: Claude Code Adapter Implementation

Residual risk: Phase 4 evaluates Claude Code headless mode, but this PR does not implement it until the command/event shape is confirmed.

Next action: use `docs/research/claude-code-headless-adapter-evaluation.md` to verify local CLI behavior, then implement `createClaudeCodeAdapter` behind an explicit `SIGNAL_RECYCLER_CLAUDE_CODE=1` flag.

## P1: Phase 4.5 Dashboard UX

Residual risk: adapter selection exists at API level but dashboard owned-session UX is still thin.

Next action: add dashboard adapter selector, context envelope preview, and event filters in Phase 4.5.

## P1: CLI Adapter Integration Smoke

Residual risk: unit tests mock JSONL parsing, but real Codex CLI availability varies by developer machine.

Next action: add an optional smoke guarded by `SIGNAL_RECYCLER_CODEX_CLI_SMOKE=1`.

## P2: Session Resume Semantics

Residual risk: adapters differ in how they resume prior context.

Next action: define per-adapter resume contracts before claiming session resume is supported.
```

- [ ] **Step 3: Final verification**

Run:

```bash
pnpm test
pnpm type-check
pnpm build
pnpm smoke:memory
git diff --check
```

For `pnpm smoke:memory`, start the API first:

```bash
PORT=3002 SIGNAL_RECYCLER_MOCK_CODEX=1 SIGNAL_RECYCLER_DB=/tmp/signal-recycler-phase4-smoke.sqlite pnpm --filter @signal-recycler/api dev
SIGNAL_RECYCLER_API_URL=http://127.0.0.1:3002 pnpm smoke:memory
```

- [ ] **Step 4: Update review guide verification section**

Replace the review guide verification line with the exact commands run and their pass/fail results.

- [ ] **Step 5: Commit docs**

```bash
git add docs/pr-notes/phase-4-owned-session-adapter-layer-review-guide.md docs/pr-notes/phase-4-owned-session-adapter-layer-follow-up-backlog.md
git commit -m "docs: add phase 4 review notes"
```

---

## Plan Self-Review

- Scope coverage: covers the Phase 4 adapter layer success criteria while leaving Phase 4.5 dashboard UX out of scope.
- Placeholder scan: no unresolved TODO/TBD placeholders remain.
- Type consistency: adapter names match the planned shared schema values: `default`, `mock`, `codex_sdk`, `codex_cli`.
- Risk check: the largest implementation risk is Codex CLI event shape. The plan mitigates this with parser tests and keeps the adapter opt-in.
