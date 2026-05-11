# Phase 4.5 Terminal-Owned Session Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `sr` package binary that can launch and continue durable Signal Recycler-owned sessions from the terminal through `sr run`.

**Architecture:** Add a new `apps/cli` workspace package. The CLI is a thin typed client over the existing local API and does not duplicate memory retrieval, adapter selection, context-envelope construction, or post-run learning. `sr run "prompt"` creates a durable session; `sr run --session <id> "prompt"` appends another turn to the same session.

**Tech Stack:** TypeScript, Node ESM, built-in `fetch`, Vitest, existing Fastify API routes, existing shared API contracts by shape rather than runtime imports.

---

## Scope Anchor

Roadmap phase: **Phase 4.5: Signal Recycler-Owned Session UX**.

Binding success criterion from `docs/validation-roadmap.md`:

- A terminal command can launch the same owned-session flow for users who do not want to use the browser UI.

This plan implements:

- `sr run [options] <prompt...>`
- `--agent default|codex|codex_cli|mock`
- `--api <url>`
- `--session <id>` continuation
- `--title <title>` for newly created sessions
- `--json`
- `--no-watch`
- terminal event polling while the run is active

This plan does not implement:

- `sr chat`
- `sr codex`
- `sr run --last`
- `sr sessions`
- source/context indexing
- compare/replay
- cloud sync
- embedded API runtime fallback

## File Structure

Create:

- `apps/cli/package.json` - CLI workspace package with `sr` binary metadata and scripts.
- `apps/cli/tsconfig.json` - CLI TypeScript build config.
- `apps/cli/src/types.ts` - CLI-local API and command types. These are shape-compatible with the API but type-only to avoid runtime package export issues.
- `apps/cli/src/args.ts` - argument parser and validation.
- `apps/cli/src/args.test.ts` - parser tests.
- `apps/cli/src/apiClient.ts` - HTTP client for local Signal Recycler API.
- `apps/cli/src/apiClient.test.ts` - HTTP client tests with fake fetch.
- `apps/cli/src/output.ts` - event and summary output formatting.
- `apps/cli/src/output.test.ts` - output formatting tests.
- `apps/cli/src/runCommand.ts` - `sr run` orchestration.
- `apps/cli/src/runCommand.test.ts` - command orchestration tests.
- `apps/cli/src/main.ts` - binary entry point.

Modify:

- `package.json` - add root CLI convenience scripts.
- `README.md` - document `sr run` usage, durable sessions, `--session`, and server requirement.
- `docs/pr-notes/phase-4-5-terminal-owned-session-launch-review-guide.md` - add implementation verification results after execution.
- `docs/pr-notes/phase-4-5-terminal-owned-session-launch-follow-up-backlog.md` - update residual risks after execution.

## Task 1: Scaffold CLI Package And Argument Parser

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/cli/src/types.ts`
- Create: `apps/cli/src/args.ts`
- Create: `apps/cli/src/args.test.ts`
- Create: `apps/cli/src/main.ts`
- Modify: `package.json`

- [ ] **Step 1: Write parser tests first**

Create `apps/cli/src/args.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses default run prompt", () => {
    expect(parseArgs(["run", "fix", "the", "tests"])).toEqual({
      command: "run",
      prompt: "fix the tests",
      agent: "default",
      apiBaseUrl: "http://127.0.0.1:3001",
      watch: true,
      json: false
    });
  });

  it("maps codex alias to codex_cli", () => {
    expect(parseArgs(["run", "--agent", "codex", "fix it"])).toMatchObject({
      command: "run",
      agent: "codex_cli",
      prompt: "fix it"
    });
  });

  it("accepts explicit session continuation", () => {
    expect(parseArgs(["run", "--session", "session_123", "continue work"])).toMatchObject({
      command: "run",
      sessionId: "session_123",
      prompt: "continue work"
    });
  });

  it("rejects title while continuing an existing session", () => {
    expect(() =>
      parseArgs(["run", "--session", "session_123", "--title", "New title", "continue work"])
    ).toThrow("--title can only be used when creating a new session");
  });

  it("rejects empty prompt", () => {
    expect(() => parseArgs(["run"])).toThrow("Prompt is required");
  });

  it("rejects unknown agents", () => {
    expect(() => parseArgs(["run", "--agent", "llama", "fix it"])).toThrow("Unsupported agent: llama");
  });

  it("rejects invalid API URLs", () => {
    expect(() => parseArgs(["run", "--api", "not a url", "fix it"])).toThrow("Invalid --api URL");
  });
});
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run:

```bash
pnpm --filter @signal-recycler/cli test -- src/args.test.ts
```

Expected: fails because `@signal-recycler/cli` and `apps/cli/src/args.ts` do not exist yet.

- [ ] **Step 3: Create CLI package files**

Create `apps/cli/package.json`:

```json
{
  "name": "@signal-recycler/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "sr": "dist/main.js"
  },
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "type-check": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "tsx": "^4.21.0"
  }
}
```

Create `apps/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/cli/src/types.ts`:

```ts
export type Agent = "default" | "mock" | "codex_cli";

export type Command =
  | {
      command: "run";
      prompt: string;
      agent: Agent;
      apiBaseUrl: string;
      sessionId?: string;
      title?: string;
      watch: boolean;
      json: boolean;
    }
  | {
      command: "help";
    };

export type ApiConfig = {
  projectId: string;
  workingDirectory: string;
  workingDirectoryBasename: string;
  availableAdapters: Array<"default" | "mock" | "codex_sdk" | "codex_cli">;
};

export type SessionRecord = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  sessionId: string;
  category: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RunResult = {
  finalResponse: string;
  candidateRules: unknown[];
};

export type RunSummary = {
  sessionId: string;
  agent: Agent;
  finalResponse: string;
  dashboardUrl: string;
  events: number;
  continued: boolean;
};
```

- [ ] **Step 4: Implement parser**

Create `apps/cli/src/args.ts`:

```ts
import { type Agent, type Command } from "./types.js";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001";

const AGENT_ALIASES: Record<string, Agent> = {
  default: "default",
  mock: "mock",
  codex: "codex_cli",
  codex_cli: "codex_cli"
};

export function parseArgs(argv: string[]): Command {
  const [commandName, ...rest] = argv;
  if (!commandName || commandName === "help" || commandName === "--help" || commandName === "-h") {
    return { command: "help" };
  }
  if (commandName !== "run") {
    throw new Error(`Unsupported command: ${commandName}`);
  }

  let agent: Agent = "default";
  let apiBaseUrl = DEFAULT_API_BASE_URL;
  let sessionId: string | undefined;
  let title: string | undefined;
  let watch = true;
  let json = false;
  const promptParts: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) continue;

    if (token === "--agent") {
      const value = rest[index + 1];
      if (!value) throw new Error("--agent requires a value");
      agent = parseAgent(value);
      index += 1;
      continue;
    }

    if (token === "--api") {
      const value = rest[index + 1];
      if (!value) throw new Error("--api requires a value");
      apiBaseUrl = parseApiBaseUrl(value);
      index += 1;
      continue;
    }

    if (token === "--session") {
      const value = rest[index + 1];
      if (!value) throw new Error("--session requires a value");
      sessionId = value;
      index += 1;
      continue;
    }

    if (token === "--title") {
      const value = rest[index + 1];
      if (!value) throw new Error("--title requires a value");
      title = value;
      index += 1;
      continue;
    }

    if (token === "--json") {
      json = true;
      continue;
    }

    if (token === "--no-watch") {
      watch = false;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unsupported option: ${token}`);
    }

    promptParts.push(token);
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("Prompt is required");
  if (sessionId && title) throw new Error("--title can only be used when creating a new session");

  return {
    command: "run",
    prompt,
    agent,
    apiBaseUrl,
    ...(sessionId ? { sessionId } : {}),
    ...(title ? { title } : {}),
    watch,
    json
  };
}

function parseAgent(value: string): Agent {
  const agent = AGENT_ALIASES[value];
  if (!agent) throw new Error(`Unsupported agent: ${value}`);
  return agent;
}

function parseApiBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid --api URL: ${value}`);
  }
}
```

Create temporary `apps/cli/src/main.ts`:

```ts
#!/usr/bin/env node
import { parseArgs } from "./args.js";

try {
  const command = parseArgs(process.argv.slice(2));
  if (command.command === "help") {
    console.log("Usage: sr run [--agent codex|mock|default] [--session id] [--api url] <prompt>");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
```

Modify root `package.json` scripts:

```json
"cli": "pnpm --filter @signal-recycler/cli dev --",
"cli:build": "pnpm --filter @signal-recycler/cli build"
```

- [ ] **Step 5: Run parser tests and workspace type-check**

Run:

```bash
pnpm --filter @signal-recycler/cli test -- src/args.test.ts
pnpm --filter @signal-recycler/cli type-check
```

Expected: parser tests pass and CLI type-check exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json apps/cli
git commit -m "feat(cli): scaffold sr argument parser"
```

## Task 2: Add Local API Client

**Files:**
- Create: `apps/cli/src/apiClient.ts`
- Create: `apps/cli/src/apiClient.test.ts`

- [ ] **Step 1: Write API client tests**

Create `apps/cli/src/apiClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError, createApiClient } from "./apiClient.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("createApiClient", () => {
  it("creates a session with an optional title", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return jsonResponse({
          id: "session_1",
          projectId: "demo",
          title: "Fix tests",
          createdAt: "2026-05-03T00:00:00.000Z"
        });
      }
    });

    await expect(client.createSession("Fix tests")).resolves.toMatchObject({ id: "session_1" });
    expect(calls[0]?.url).toBe("http://127.0.0.1:3001/api/sessions");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ title: "Fix tests" }));
  });

  it("runs an existing session", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ finalResponse: "done", candidateRules: [] });
      }
    });

    await expect(client.runSession("session_1", "fix it", "codex_cli")).resolves.toMatchObject({
      finalResponse: "done"
    });
    expect(calls[0]?.url).toBe("http://127.0.0.1:3001/api/sessions/session_1/run");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ prompt: "fix it", adapter: "codex_cli" }));
  });

  it("lists events for a session", async () => {
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001/",
      fetchImpl: async () =>
        jsonResponse([
          {
            id: "event_1",
            sessionId: "session_1",
            category: "codex_event",
            title: "User prompt",
            body: "fix it",
            metadata: {},
            createdAt: "2026-05-03T00:00:00.000Z"
          }
        ])
    });

    await expect(client.listEvents("session_1")).resolves.toHaveLength(1);
  });

  it("turns non-2xx responses into ApiError", async () => {
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001",
      fetchImpl: async () => jsonResponse({ error: "Session not found" }, { status: 404 })
    });

    await expect(client.listEvents("missing")).rejects.toMatchObject({
      status: 404,
      message: "Session not found"
    });
  });

  it("turns network failures into a clear unavailable error", async () => {
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3001",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      }
    });

    await expect(client.getConfig()).rejects.toThrow("Signal Recycler API is not running");
  });
});
```

- [ ] **Step 2: Run API client tests to verify they fail**

Run:

```bash
pnpm --filter @signal-recycler/cli test -- src/apiClient.test.ts
```

Expected: fails because `apiClient.ts` does not exist.

- [ ] **Step 3: Implement API client**

Create `apps/cli/src/apiClient.ts`:

```ts
import { type Agent, type ApiConfig, type RunResult, type SessionRecord, type TimelineEvent } from "./types.js";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(input: { baseUrl: string; fetchImpl?: FetchLike }) {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    getConfig: () => request<ApiConfig>(fetchImpl, `${baseUrl}/api/config`),
    createSession: (title?: string) =>
      request<SessionRecord>(fetchImpl, `${baseUrl}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(title ? { title } : {})
      }),
    runSession: (sessionId: string, prompt: string, agent: Agent) =>
      request<RunResult>(fetchImpl, `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, adapter: agent })
      }),
    listEvents: (sessionId: string) =>
      request<TimelineEvent[]>(fetchImpl, `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/events`)
  };
}

async function request<T>(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new Error(
      `Signal Recycler API is not running at ${new URL(url).origin}. Start it with: pnpm dev`,
      { cause: error }
    );
  }

  const text = await response.text();
  const body = parseBody(text);
  if (!response.ok) {
    throw new ApiError(errorMessage(body, response.statusText), response.status, body);
  }
  return body as T;
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const message = (body as { message?: unknown; error?: unknown }).message ?? (body as { error?: unknown }).error;
    if (typeof message === "string") return message;
  }
  if (typeof body === "string" && body.trim()) return body;
  return fallback || "Signal Recycler API request failed";
}
```

- [ ] **Step 4: Run API client tests**

Run:

```bash
pnpm --filter @signal-recycler/cli test -- src/apiClient.test.ts
pnpm --filter @signal-recycler/cli type-check
```

Expected: tests pass and type-check exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/apiClient.ts apps/cli/src/apiClient.test.ts
git commit -m "feat(cli): add local API client"
```

## Task 3: Add Output Formatting

**Files:**
- Create: `apps/cli/src/output.ts`
- Create: `apps/cli/src/output.test.ts`

- [ ] **Step 1: Write output tests**

Create `apps/cli/src/output.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatEventLine, formatSummary } from "./output.js";
import { type TimelineEvent } from "./types.js";

function event(input: Partial<TimelineEvent> & Pick<TimelineEvent, "category" | "title">): TimelineEvent {
  return {
    id: input.id ?? "event_1",
    sessionId: "session_1",
    category: input.category,
    title: input.title,
    body: input.body ?? "",
    metadata: input.metadata ?? {},
    createdAt: "2026-05-03T00:00:00.000Z"
  };
}

describe("output formatting", () => {
  it("formats memory retrieval counts", () => {
    expect(
      formatEventLine(
        event({
          category: "memory_retrieval",
          title: "Retrieved 1 of 2 approved memories",
          metadata: {
            retrieval: {
              metrics: { selectedMemories: 1, skippedMemories: 1 }
            }
          }
        })
      )
    ).toBe("[memory] Retrieved 1 of 2 approved memories");
  });

  it("formats generic agent events", () => {
    expect(formatEventLine(event({ category: "codex_event", title: "Codex response", body: "Done." }))).toBe(
      "[agent] Codex response"
    );
  });

  it("formats final text summary", () => {
    expect(
      formatSummary({
        sessionId: "session_1",
        agent: "codex_cli",
        finalResponse: "Done.",
        dashboardUrl: "http://127.0.0.1:5173",
        events: 4,
        continued: false
      })
    ).toContain("Continue this session:\nsr run --session session_1 \"next prompt\"");
  });
});
```

- [ ] **Step 2: Run output tests to verify they fail**

Run:

```bash
pnpm --filter @signal-recycler/cli test -- src/output.test.ts
```

Expected: fails because `output.ts` does not exist.

- [ ] **Step 3: Implement output formatting**

Create `apps/cli/src/output.ts`:

```ts
import { type RunSummary, type TimelineEvent } from "./types.js";

export function formatEventLine(event: TimelineEvent): string {
  if (event.category === "memory_retrieval") return `[memory] ${event.title}`;
  if (event.category === "memory_injection") return `[context] ${event.title}`;
  if (event.category === "classifier_result") return `[learn] ${event.title}`;
  if (event.category === "rule_candidate" || event.category === "rule_auto_approved") return `[memory] ${event.title}`;
  if (event.category === "codex_event") return `[agent] ${event.title}`;
  return `[event] ${event.title}`;
}

export function formatSummary(summary: RunSummary): string {
  const lines = [
    "",
    "Final response:",
    summary.finalResponse || "(no final response)",
    "",
    `Session: ${summary.sessionId}`,
    `Agent: ${summary.agent}`,
    `Dashboard: ${summary.dashboardUrl}`,
    `Events observed: ${summary.events}`
  ];

  if (!summary.continued) {
    lines.push("", "Continue this session:", `sr run --session ${summary.sessionId} "next prompt"`);
  }

  return lines.join("\n");
}

export function formatJsonSummary(summary: RunSummary): string {
  return JSON.stringify(
    {
      sessionId: summary.sessionId,
      agent: summary.agent,
      status: "completed",
      finalResponse: summary.finalResponse,
      dashboardUrl: summary.dashboardUrl,
      events: summary.events,
      continued: summary.continued
    },
    null,
    2
  );
}
```

- [ ] **Step 4: Run output tests**

Run:

```bash
pnpm --filter @signal-recycler/cli test -- src/output.test.ts
pnpm --filter @signal-recycler/cli type-check
```

Expected: tests pass and type-check exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/output.ts apps/cli/src/output.test.ts
git commit -m "feat(cli): format terminal session output"
```

## Task 4: Implement `sr run` Orchestration

**Files:**
- Create: `apps/cli/src/runCommand.ts`
- Create: `apps/cli/src/runCommand.test.ts`

- [ ] **Step 1: Write command orchestration tests**

Create `apps/cli/src/runCommand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runCommand } from "./runCommand.js";
import { type ApiClient } from "./apiClient.js";
import { type TimelineEvent } from "./types.js";

function event(id: string, title: string): TimelineEvent {
  return {
    id,
    sessionId: "session_1",
    category: "codex_event",
    title,
    body: "",
    metadata: {},
    createdAt: "2026-05-03T00:00:00.000Z"
  };
}

describe("runCommand", () => {
  it("creates a durable session before running when no session id is supplied", async () => {
    const calls: string[] = [];
    const output: string[] = [];
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock", "codex_cli"]
      }),
      createSession: async (title?: string) => {
        calls.push(`create:${title ?? ""}`);
        return { id: "session_1", projectId: "demo", title: title ?? "Session", createdAt: "now" };
      },
      runSession: async (sessionId: string, prompt: string) => {
        calls.push(`run:${sessionId}:${prompt}`);
        return { finalResponse: "done", candidateRules: [] };
      },
      listEvents: async () => []
    } satisfies ApiClient;

    const summary = await runCommand(
      { command: "run", prompt: "fix tests", agent: "mock", apiBaseUrl: "http://127.0.0.1:3001", watch: false, json: false },
      { client, write: (line) => output.push(line), sleep: async () => undefined }
    );

    expect(calls).toEqual(["create:fix tests", "run:session_1:fix tests"]);
    expect(summary).toMatchObject({ sessionId: "session_1", continued: false });
    expect(output.join("\n")).toContain("Signal Recycler session session_1");
  });

  it("continues an existing session without creating a new one", async () => {
    const calls: string[] = [];
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock", "codex_cli"]
      }),
      createSession: async () => {
        calls.push("create");
        throw new Error("should not create");
      },
      runSession: async (sessionId: string, prompt: string) => {
        calls.push(`run:${sessionId}:${prompt}`);
        return { finalResponse: "continued", candidateRules: [] };
      },
      listEvents: async () => []
    } satisfies ApiClient;

    const summary = await runCommand(
      {
        command: "run",
        prompt: "continue",
        agent: "mock",
        apiBaseUrl: "http://127.0.0.1:3001",
        sessionId: "session_existing",
        watch: false,
        json: false
      },
      { client, write: () => undefined, sleep: async () => undefined }
    );

    expect(calls).toEqual(["run:session_existing:continue"]);
    expect(summary).toMatchObject({ sessionId: "session_existing", continued: true });
  });

  it("rejects unavailable adapters before running", async () => {
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock"]
      }),
      createSession: async () => ({ id: "session_1", projectId: "demo", title: "Session", createdAt: "now" }),
      runSession: async () => ({ finalResponse: "done", candidateRules: [] }),
      listEvents: async () => []
    } satisfies ApiClient;

    await expect(
      runCommand(
        {
          command: "run",
          prompt: "fix tests",
          agent: "codex_cli",
          apiBaseUrl: "http://127.0.0.1:3001",
          watch: false,
          json: false
        },
        { client, write: () => undefined, sleep: async () => undefined }
      )
    ).rejects.toThrow("Adapter codex_cli is not available");
  });

  it("prints watched events once while run is active", async () => {
    const output: string[] = [];
    let eventCalls = 0;
    const client = {
      getConfig: async () => ({
        projectId: "demo",
        workingDirectory: "/repo",
        workingDirectoryBasename: "repo",
        availableAdapters: ["default", "mock"]
      }),
      createSession: async () => ({ id: "session_1", projectId: "demo", title: "Session", createdAt: "now" }),
      runSession: async () => ({ finalResponse: "done", candidateRules: [] }),
      listEvents: async () => {
        eventCalls += 1;
        return eventCalls === 1 ? [event("event_1", "User prompt")] : [event("event_1", "User prompt"), event("event_2", "Codex response")];
      }
    } satisfies ApiClient;

    await runCommand(
      { command: "run", prompt: "fix tests", agent: "mock", apiBaseUrl: "http://127.0.0.1:3001", watch: true, json: false },
      { client, write: (line) => output.push(line), sleep: async () => undefined }
    );

    expect(output.filter((line) => line.includes("User prompt"))).toHaveLength(1);
    expect(output.filter((line) => line.includes("Codex response"))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run command tests to verify they fail**

Run:

```bash
pnpm --filter @signal-recycler/cli test -- src/runCommand.test.ts
```

Expected: fails because `runCommand.ts` does not exist.

- [ ] **Step 3: Implement command orchestration**

Create `apps/cli/src/runCommand.ts`:

```ts
import { type ApiClient } from "./apiClient.js";
import { formatEventLine, formatJsonSummary, formatSummary } from "./output.js";
import { type Command, type RunSummary, type TimelineEvent } from "./types.js";

type RunCommandDependencies = {
  client: ApiClient;
  write: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  dashboardUrl?: string;
};

export async function runCommand(command: Extract<Command, { command: "run" }>, deps: RunCommandDependencies): Promise<RunSummary> {
  const config = await deps.client.getConfig();
  if (!config.availableAdapters.includes(command.agent)) {
    throw new Error(
      `Adapter ${command.agent} is not available. Available adapters: ${config.availableAdapters.join(", ")}. ` +
        "Enable Codex CLI with SIGNAL_RECYCLER_CODEX_CLI=1."
    );
  }

  const sessionId = command.sessionId ?? (await deps.client.createSession(command.title ?? command.prompt.slice(0, 80))).id;
  const continued = Boolean(command.sessionId);
  deps.write(
    continued
      ? `Continuing Signal Recycler session ${sessionId}`
      : `Signal Recycler session ${sessionId}`
  );
  deps.write(`Agent: ${command.agent}`);

  const seenEventIds = new Set<string>();
  const runPromise = deps.client.runSession(sessionId, command.prompt, command.agent);

  if (command.watch) {
    await pollEventsUntilComplete({
      sessionId,
      seenEventIds,
      listEvents: deps.client.listEvents,
      write: deps.write,
      sleep: deps.sleep,
      runPromise
    });
  }

  const result = await runPromise;
  const events = await deps.client.listEvents(sessionId);
  for (const event of events) {
    if (!seenEventIds.has(event.id)) {
      seenEventIds.add(event.id);
      deps.write(formatEventLine(event));
    }
  }

  const summary: RunSummary = {
    sessionId,
    agent: command.agent,
    finalResponse: result.finalResponse,
    dashboardUrl: deps.dashboardUrl ?? "http://127.0.0.1:5173",
    events: events.length,
    continued
  };

  deps.write(command.json ? formatJsonSummary(summary) : formatSummary(summary));
  return summary;
}

async function pollEventsUntilComplete(input: {
  sessionId: string;
  seenEventIds: Set<string>;
  listEvents: ApiClient["listEvents"];
  write: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  runPromise: Promise<unknown>;
}): Promise<void> {
  let completed = false;
  void input.runPromise.then(
    () => {
      completed = true;
    },
    () => {
      completed = true;
    }
  );

  while (!completed) {
    await printNewEvents(input.sessionId, input.listEvents, input.seenEventIds, input.write);
    await input.sleep(1000);
  }
}

async function printNewEvents(
  sessionId: string,
  listEvents: ApiClient["listEvents"],
  seenEventIds: Set<string>,
  write: (line: string) => void
): Promise<void> {
  const events: TimelineEvent[] = await listEvents(sessionId);
  for (const event of events) {
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);
    write(formatEventLine(event));
  }
}
```

- [ ] **Step 4: Run command tests**

Run:

```bash
pnpm --filter @signal-recycler/cli test -- src/runCommand.test.ts
pnpm --filter @signal-recycler/cli type-check
```

Expected: tests pass and type-check exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/runCommand.ts apps/cli/src/runCommand.test.ts
git commit -m "feat(cli): run durable terminal sessions"
```

## Task 5: Wire Binary Entry Point

**Files:**
- Modify: `apps/cli/src/main.ts`

- [ ] **Step 1: Write a main entry smoke test**

Add `apps/cli/src/main.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { usage } from "./main.js";

describe("main helpers", () => {
  it("documents sr run usage", () => {
    expect(usage()).toContain("sr run");
    expect(usage()).toContain("--session");
    expect(usage()).toContain("--agent");
  });
});
```

- [ ] **Step 2: Run main test to verify it fails**

Run:

```bash
pnpm --filter @signal-recycler/cli test -- src/main.test.ts
```

Expected: fails because `usage` is not exported.

- [ ] **Step 3: Implement main entry point**

Replace `apps/cli/src/main.ts` with:

```ts
#!/usr/bin/env node
import { parseArgs } from "./args.js";
import { createApiClient } from "./apiClient.js";
import { runCommand } from "./runCommand.js";

export function usage(): string {
  return [
    "Usage:",
    "  sr run [--agent default|codex|mock] [--session id] [--api url] [--title title] [--json] [--no-watch] <prompt>",
    "",
    "Examples:",
    "  sr run --agent codex \"fix the failing tests\"",
    "  sr run --session session_abc123 \"now add regression coverage\""
  ].join("\n");
}

async function main(argv: string[]): Promise<number> {
  const command = parseArgs(argv);
  if (command.command === "help") {
    console.log(usage());
    return 0;
  }

  const client = createApiClient({ baseUrl: command.apiBaseUrl });
  await runCommand(command, {
    client,
    write: (line) => console.log(line),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  });
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    console.error(usage());
    process.exitCode = 1;
  }
);
```

- [ ] **Step 4: Run CLI tests, type-check, and build**

Run:

```bash
pnpm --filter @signal-recycler/cli test
pnpm --filter @signal-recycler/cli type-check
pnpm --filter @signal-recycler/cli build
node apps/cli/dist/main.js --help
```

Expected:

- CLI tests pass.
- Type-check exits 0.
- Build exits 0.
- `node apps/cli/dist/main.js --help` prints usage with `sr run` and `--session`.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/main.ts apps/cli/src/main.test.ts
git commit -m "feat(cli): wire sr binary entry"
```

## Task 6: Add Runtime Smoke Coverage And README Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/pr-notes/phase-4-5-terminal-owned-session-launch-review-guide.md`
- Modify: `docs/pr-notes/phase-4-5-terminal-owned-session-launch-follow-up-backlog.md`

- [ ] **Step 1: Add README terminal usage section**

Add a section near the existing owned-session/API usage docs:

````md
## Terminal-Owned Sessions

Signal Recycler also exposes a local `sr` CLI package for terminal-owned sessions.

```sh
pnpm --filter @signal-recycler/cli build
node apps/cli/dist/main.js run --agent mock "check learned constraints"
```

The CLI requires the local Signal Recycler API to be running:

```sh
SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev
```

`sr run` is non-interactive, but it is not disposable. A new run creates a durable Signal Recycler session:

```sh
sr run --agent codex "fix the failing tests"
```

Continue that same session by id:

```sh
sr run --session session_abc123 "now add regression coverage"
```

The dashboard remains the audit surface for terminal-owned sessions. Use it to inspect the raw transcript, retrieved memory, injected context, skipped context, and learned memory candidates.
````

- [ ] **Step 2: Run local mock smoke**

Start the dev server in one terminal:

```bash
SIGNAL_RECYCLER_MOCK_CODEX=1 pnpm dev
```

In another terminal, run:

```bash
node apps/cli/dist/main.js run --agent mock "terminal owned smoke"
```

Expected:

- Output includes `Signal Recycler session`.
- Output includes `Continue this session:`.
- Command exits 0.

Copy the printed session id and run:

```bash
node apps/cli/dist/main.js run --session <printed-session-id> --agent mock "continue terminal owned smoke"
```

Expected:

- Output includes `Continuing Signal Recycler session`.
- Command exits 0.

Verify events:

```bash
curl -s http://127.0.0.1:3001/api/sessions/<printed-session-id>/events
```

Expected:

- JSON includes at least two `User prompt` events for the same session id.

- [ ] **Step 3: Update PR notes**

Update `docs/pr-notes/phase-4-5-terminal-owned-session-launch-review-guide.md` verification section with exact command results from:

```bash
pnpm --filter @signal-recycler/cli test
pnpm --filter @signal-recycler/cli type-check
pnpm --filter @signal-recycler/cli build
pnpm test
pnpm type-check
pnpm build
git diff --check
```

Update `docs/pr-notes/phase-4-5-terminal-owned-session-launch-follow-up-backlog.md` if the smoke exposes residual risks not already listed.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/pr-notes/phase-4-5-terminal-owned-session-launch-review-guide.md docs/pr-notes/phase-4-5-terminal-owned-session-launch-follow-up-backlog.md
git commit -m "docs: document terminal owned sessions"
```

## Task 7: Full Verification And PR Preparation

**Files:**
- Inspect all changed files.
- No expected new files unless verification reveals a blocker.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm --filter @signal-recycler/cli test
pnpm --filter @signal-recycler/cli type-check
pnpm --filter @signal-recycler/cli build
pnpm test
pnpm type-check
pnpm build
git diff --check
```

Expected:

- All commands exit 0.
- Workspace test output includes API and web tests plus CLI tests.
- Workspace build includes `@signal-recycler/cli`.

- [ ] **Step 2: Run a final CLI help check**

Run:

```bash
node apps/cli/dist/main.js --help
```

Expected output contains:

```text
sr run
--session
--agent
```

- [ ] **Step 3: Inspect git diff**

Run:

```bash
git status --short
git diff --stat
git diff -- apps/cli README.md docs/pr-notes/phase-4-5-terminal-owned-session-launch-review-guide.md docs/pr-notes/phase-4-5-terminal-owned-session-launch-follow-up-backlog.md
```

Confirm:

- No source/context indexing was added.
- No `sr chat`, `sr codex`, `sr sessions`, or `--last` implementation slipped in.
- CLI calls existing API endpoints rather than importing API internals.
- `--session <id>` skips session creation.

- [ ] **Step 4: Commit any verification doc updates**

If verification changed PR notes, commit:

```bash
git add docs/pr-notes/phase-4-5-terminal-owned-session-launch-review-guide.md docs/pr-notes/phase-4-5-terminal-owned-session-launch-follow-up-backlog.md
git commit -m "docs: record terminal launch verification"
```

- [ ] **Step 5: Push and open PR**

Run:

```bash
git push -u origin codex/phase-4-5-terminal-owned-session-launch
```

Open a PR with:

```text
Title: Phase 4.5 terminal-owned session launch

Summary:
- Adds @signal-recycler/cli with sr run.
- Supports durable session creation and explicit continuation through --session.
- Keeps CLI as a thin local API client over existing owned-session runtime.
- Documents terminal-owned session usage and follow-up TUI ergonomics.

Verification:
- pnpm --filter @signal-recycler/cli test
- pnpm --filter @signal-recycler/cli type-check
- pnpm --filter @signal-recycler/cli build
- pnpm test
- pnpm type-check
- pnpm build
- git diff --check
```

## Self-Review Checklist

- Spec coverage: the plan implements `sr run`, `--agent`, `--api`, `--session`, `--title`, `--json`, `--no-watch`, terminal polling, and durable continuation.
- Scope check: the plan does not implement Phase 5 indexing, `sr chat`, `sr codex`, `--last`, or `sr sessions`.
- Type consistency: `Agent` is CLI-local and maps `codex` to `codex_cli`; API responses use local shape-compatible types.
- Runtime boundary: the CLI calls `POST /api/sessions`, `POST /api/sessions/:id/run`, and `GET /api/sessions/:id/events`; it does not import `processTurn` or store internals.
