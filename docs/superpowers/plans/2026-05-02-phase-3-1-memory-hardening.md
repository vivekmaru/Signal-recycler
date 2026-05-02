# Phase 3.1 Memory Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Phase 3 retrieval/injection behavior before Phase 4 owned sessions by making recent memory feedback-loop regressions repeatable and easier to diagnose.

**Architecture:** Keep this as a small hardening PR. Do not add owned-session architecture, repo context indexing, vector retrieval, or dashboard redesign. Extract proxy request classification into a focused helper, add regression coverage around retrieval/injection counts, and add a smoke script that reproduces the manual two-memory flow against a running API.

**Tech Stack:** TypeScript, Fastify route tests with Vitest, Node smoke scripts, SQLite-backed in-memory test stores.

---

## Scope Anchor

Phase 3 is complete enough to retrieve and inject scoped approved memory. Phase 3.1 only protects that behavior.

Included backlog items:

- `self-learned-memory-follow-up-backlog.md`: Add UI/API-level smoke for retrieval and injection counts.
- `self-learned-memory-follow-up-backlog.md`: Add internal request classifier contract tests.
- `phase-3-follow-up-backlog.md`: Add direct mock negative coverage.
- `self-learned-memory-follow-up-backlog.md`: Expose enough proxy debug metadata to understand query source.

Explicitly out of scope:

- Phase 4 owned-session adapters.
- Repo context index.
- Vector or hybrid retrieval.
- Memory naming cleanup.
- Full browser automation infrastructure.

## File Structure

- Modify `apps/api/src/routes/proxy.ts`
  - Use a helper for proxy retrieval query analysis and internal Signal Recycler request detection.
  - Add debug metadata such as `querySource` and `strippedPlaybookBlocks`.
- Create `apps/api/src/services/proxyRequestContext.ts`
  - Own internal classifier detection and retrieval query extraction for proxy requests.
  - Export small pure functions with no Fastify dependencies.
- Create `apps/api/src/services/proxyRequestContext.test.ts`
  - Cover classifier schema detection, system/developer marker detection, user-quoted marker false positives, playbook stripping, and query-source metadata.
- Modify `apps/api/src/server.test.ts`
  - Keep route integration tests focused on persistence/events.
  - Add the direct mock negative regression if it fits existing runner test grouping.
- Create `scripts/smoke-memory-retrieval.mjs`
  - Reset memory, add two approved memories, run a package-manager prompt, assert one retrieval and one injection.
- Modify `package.json`
  - Add `smoke:memory`.
- Create `docs/pr-notes/phase-3-1-memory-hardening-review-guide.md`
  - Include scope, change map, verification, and reviewer focus.
- Create `docs/pr-notes/phase-3-1-memory-hardening-follow-up-backlog.md`
  - Carry forward residual risks that do not belong in this hardening PR.

---

### Task 1: Extract Proxy Request Context Analysis

**Files:**

- Create: `apps/api/src/services/proxyRequestContext.ts`
- Create: `apps/api/src/services/proxyRequestContext.test.ts`
- Modify: `apps/api/src/routes/proxy.ts`

- [ ] **Step 1: Write failing helper tests**

Create `apps/api/src/services/proxyRequestContext.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  analyzeProxyRequestContext,
  isSignalRecyclerInternalRequest
} from "./proxyRequestContext.js";
import { renderPlaybookBlock } from "../playbook.js";

const packageMemory = {
  id: "rule_package",
  category: "package-manager",
  rule: "Use pnpm test instead of npm test."
};

const themeMemory = {
  id: "rule_theme",
  category: "theme",
  rule: "Use approved theme tokens for UI theme changes."
};

describe("proxy request context", () => {
  it("detects classifier requests by schema name", () => {
    expect(
      isSignalRecyclerInternalRequest({
        input: [{ role: "user", content: "anything" }],
        text: { format: { name: "signal_recycler_classifier" } }
      })
    ).toBe(true);
  });

  it("detects classifier requests by system marker", () => {
    expect(
      isSignalRecyclerInternalRequest({
        input: [
          { role: "system", content: "Classify this Codex turn for Signal Recycler." },
          { role: "user", content: "{}" }
        ]
      })
    ).toBe(true);
  });

  it("does not treat user-quoted classifier marker as internal", () => {
    expect(
      isSignalRecyclerInternalRequest({
        input: [
          {
            role: "user",
            content: "Please document this text: Classify this Codex turn for Signal Recycler."
          }
        ]
      })
    ).toBe(false);
  });

  it("extracts retrieval query from user prompt and strips existing playbook blocks", () => {
    const result = analyzeProxyRequestContext({
      input: [
        { role: "system", content: renderPlaybookBlock([packageMemory, themeMemory]) },
        { role: "user", content: "Run package manager validation for this repo." }
      ]
    });

    expect(result).toEqual({
      internalSignalRecyclerRequest: false,
      query: "Run package manager validation for this repo.",
      querySource: "user_input",
      strippedPlaybookBlocks: 1
    });
  });
});
```

- [ ] **Step 2: Run the helper test and verify it fails**

Run:

```bash
pnpm --filter @signal-recycler/api test -- proxyRequestContext.test.ts
```

Expected: fails because `proxyRequestContext.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/services/proxyRequestContext.ts` with pure functions:

```ts
import { countPlaybookBlocks, stripPlaybookBlocks } from "../playbook.js";

export type ProxyRequestContext = {
  internalSignalRecyclerRequest: boolean;
  query: string;
  querySource: "user_input" | "instructions" | "none";
  strippedPlaybookBlocks: number;
};

export function analyzeProxyRequestContext(body: unknown): ProxyRequestContext {
  const internalSignalRecyclerRequest = isSignalRecyclerInternalRequest(body);
  const userQuery = extractUserTextFromRequest(body);
  if (userQuery.text.length > 0) {
    return {
      internalSignalRecyclerRequest,
      query: userQuery.text,
      querySource: "user_input",
      strippedPlaybookBlocks: userQuery.strippedPlaybookBlocks
    };
  }

  const instructionQuery = extractInstructionsText(body);
  if (instructionQuery.text.length > 0) {
    return {
      internalSignalRecyclerRequest,
      query: instructionQuery.text,
      querySource: "instructions",
      strippedPlaybookBlocks: instructionQuery.strippedPlaybookBlocks
    };
  }

  return {
    internalSignalRecyclerRequest,
    query: "",
    querySource: "none",
    strippedPlaybookBlocks: 0
  };
}

export function isSignalRecyclerInternalRequest(body: unknown): boolean {
  if (!isPlainObject(body)) return false;
  if (hasSignalRecyclerClassifierSchema(body)) return true;
  return hasClassifierPromptMarker(body.input) || hasClassifierPromptMarker(body.messages);
}

function hasSignalRecyclerClassifierSchema(body: Record<string, unknown>): boolean {
  const textFormat = body.text;
  if (!isPlainObject(textFormat)) return false;
  const format = textFormat.format;
  if (!isPlainObject(format)) return false;
  return format.name === "signal_recycler_classifier";
}

function hasClassifierPromptMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasClassifierPromptMarker);
  if (!isPlainObject(value)) return false;

  const role = typeof value.role === "string" ? value.role.toLowerCase() : null;
  if (role !== "system" && role !== "developer") return false;

  const text = [extractPlainText(value.text).text, extractPlainText(value.content).text]
    .filter((part) => part.length > 0)
    .join("\n");
  return text.includes("Classify this Codex turn for Signal Recycler.");
}

function extractUserTextFromRequest(body: unknown): { text: string; strippedPlaybookBlocks: number } {
  const parsed = parseStringBody(body);
  if (!isPlainObject(parsed)) return { text: "", strippedPlaybookBlocks: 0 };
  const input = extractUserText(parsed.input);
  const messages = extractUserText(parsed.messages);
  return joinTextResults([input, messages]);
}

function extractInstructionsText(body: unknown): { text: string; strippedPlaybookBlocks: number } {
  const parsed = parseStringBody(body);
  if (!isPlainObject(parsed)) return { text: "", strippedPlaybookBlocks: 0 };
  return extractPlainText(parsed.instructions);
}

function extractUserText(value: unknown): { text: string; strippedPlaybookBlocks: number } {
  if (typeof value === "string") return cleanRetrievalText(value);
  if (Array.isArray(value)) return joinTextResults(value.map(extractUserText));
  if (!isPlainObject(value)) return { text: "", strippedPlaybookBlocks: 0 };

  const role = typeof value.role === "string" ? value.role.toLowerCase() : null;
  if (role && role !== "user") {
    return {
      text: "",
      strippedPlaybookBlocks: countPlaybookBlocks(extractPlainText(value).text)
    };
  }

  return joinTextResults([extractUserText(value.text), extractUserText(value.content)]);
}

function extractPlainText(value: unknown): { text: string; strippedPlaybookBlocks: number } {
  if (typeof value === "string") return cleanRetrievalText(value);
  if (Array.isArray(value)) return joinTextResults(value.map(extractPlainText));
  if (!isPlainObject(value)) return { text: "", strippedPlaybookBlocks: 0 };

  return joinTextResults([
    extractPlainText(value.instructions),
    extractPlainText(value.input),
    extractPlainText(value.messages),
    extractPlainText(value.text),
    extractPlainText(value.content)
  ]);
}

function cleanRetrievalText(value: string): { text: string; strippedPlaybookBlocks: number } {
  return {
    text: stripPlaybookBlocks(value).trim(),
    strippedPlaybookBlocks: countPlaybookBlocks(value)
  };
}

function joinTextResults(
  results: Array<{ text: string; strippedPlaybookBlocks: number }>
): { text: string; strippedPlaybookBlocks: number } {
  return {
    text: results
      .map((result) => result.text)
      .filter((part) => part.length > 0)
      .join("\n"),
    strippedPlaybookBlocks: results.reduce(
      (sum, result) => sum + result.strippedPlaybookBlocks,
      0
    )
  };
}

function parseStringBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Export playbook block counting**

Modify `apps/api/src/playbook.ts`:

```ts
export function countPlaybookBlocks(text: string): number {
  let count = 0;
  let cursor = text;
  while (true) {
    const start = cursor.indexOf(PLAYBOOK_START);
    const end = cursor.indexOf(PLAYBOOK_END);
    if (start === -1 || end === -1 || end < start) return count;
    count += 1;
    cursor = cursor.slice(end + PLAYBOOK_END.length);
  }
}
```

- [ ] **Step 5: Wire helper into proxy route**

Modify `apps/api/src/routes/proxy.ts`:

- Import `analyzeProxyRequestContext`.
- Replace local internal detection and query extraction with one call:

```ts
const proxyContext = analyzeProxyRequestContext(rawBody);
const internalSignalRecyclerRequest = proxyContext.internalSignalRecyclerRequest;
...
const retrievalQuery = proxyContext.query;
```

- Include the new metadata:

```ts
querySource: proxyContext.querySource,
strippedPlaybookBlocks: proxyContext.strippedPlaybookBlocks,
```

- Remove duplicated local helper functions that moved to `proxyRequestContext.ts`.

- [ ] **Step 6: Run helper and route tests**

Run:

```bash
pnpm --filter @signal-recycler/api test -- proxyRequestContext.test.ts server.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/playbook.ts apps/api/src/routes/proxy.ts apps/api/src/services/proxyRequestContext.ts apps/api/src/services/proxyRequestContext.test.ts apps/api/src/server.test.ts
git commit -m "test: harden proxy request context detection"
```

---

### Task 2: Add Direct Mock Negative Coverage

**Files:**

- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Add failing test**

Add near the existing mock Codex runner retrieval tests:

```ts
it("does not inject an unrelated approved memory from the mock Codex runner", async () => {
  vi.stubEnv("SIGNAL_RECYCLER_MOCK_CODEX", "1");
  const store = createStore(":memory:");
  const unrelated = store.approveRule(
    store.createRuleCandidate({
      projectId: TEST_APP_OPTIONS.projectId,
      category: "theme",
      rule: "Use approved theme tokens for UI changes.",
      reason: "Theme work follows the design system."
    }).id
  );
  const runner = createCodexRunner({
    store,
    apiPort: 3001,
    projectId: TEST_APP_OPTIONS.projectId,
    workingDirectory: TEST_APP_OPTIONS.workingDirectory
  });

  const result = await runner.run({
    sessionId: "codex-runner-no-relevant-memory",
    prompt: "Run package manager validation for this repo."
  });
  const events = store.listEvents("codex-runner-no-relevant-memory");

  expect(result.finalResponse).not.toContain("Use approved theme tokens");
  expect(result.items).toEqual([{ type: "mock", injected: "Run package manager validation for this repo." }]);
  expect(events.find((event) => event.category === "memory_retrieval")?.metadata).toMatchObject({
    selected: [],
    skipped: [expect.objectContaining({ memoryId: unrelated.id })],
    metrics: expect.objectContaining({ selectedMemories: 0, skippedMemories: 1 })
  });
  expect(events.some((event) => event.category === "memory_injection")).toBe(false);
  expect(store.listMemoryUsages(unrelated.id)).toHaveLength(0);
});
```

- [ ] **Step 2: Run the test and verify current behavior**

Run:

```bash
pnpm --filter @signal-recycler/api test -- server.test.ts
```

Expected: pass if the current implementation is already correct, fail if a regression exists.

- [ ] **Step 3: Fix only if needed**

If the test fails because mock runner still injects unrelated memory, update `apps/api/src/codexRunner.ts` so mock mode uses `retrieval.memories` only. Do not change real Codex runner behavior in this task.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/server.test.ts apps/api/src/codexRunner.ts
git commit -m "test: cover mock runner no-hit retrieval"
```

---

### Task 3: Add Memory Retrieval Smoke Script

**Files:**

- Create: `scripts/smoke-memory-retrieval.mjs`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Create smoke script**

Create `scripts/smoke-memory-retrieval.mjs`:

```js
const base = process.env.SIGNAL_RECYCLER_API_URL ?? "http://127.0.0.1:3001";

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${path}`, { headers, ...options });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

const config = await request("/api/config");
if (!process.env.SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB && !config.database?.isSmoke) {
  const databaseName = config.database?.basename ?? "unknown database";
  throw new Error(
    `Refusing to run memory smoke against ${databaseName}. Start the API with SIGNAL_RECYCLER_DB pointing at a temporary smoke database, or set SIGNAL_RECYCLER_ALLOW_SHARED_SMOKE_DB=1.`
  );
}

await request("/api/memory/reset", { method: "POST" });

const theme = await request("/api/memories", {
  method: "POST",
  body: JSON.stringify({
    category: "theme",
    rule: "Use approved theme tokens for UI theme changes.",
    reason: "Theme work follows the design system.",
    memoryType: "preference",
    scope: { type: "project", value: null }
  })
});

const packageManager = await request("/api/memories", {
  method: "POST",
  body: JSON.stringify({
    category: "package-manager",
    rule: "Use pnpm test instead of npm test.",
    reason: "This repo uses pnpm workspaces.",
    memoryType: "command_convention",
    scope: { type: "project", value: null }
  })
});

const session = await request("/api/sessions", {
  method: "POST",
  body: JSON.stringify({ title: "Memory retrieval smoke" })
});

const run = await request(`/api/sessions/${session.id}/run`, {
  method: "POST",
  body: JSON.stringify({ prompt: "Run package manager validation for this repo." })
});

const events = await request(`/api/sessions/${session.id}/events`);
const retrievalEvents = events.filter((event) => event.category === "memory_retrieval");
const injectionEvents = events.filter((event) => event.category === "memory_injection");

const selected = retrievalEvents.flatMap((event) => event.metadata?.selected ?? []);
const injectedIds = injectionEvents.flatMap((event) => event.metadata?.memoryIds ?? []);

if (run.candidateRules.length !== 0) {
  throw new Error(`Expected no new candidate rules; found ${run.candidateRules.length}.`);
}
if (retrievalEvents.length !== 1) {
  throw new Error(`Expected exactly 1 retrieval event; found ${retrievalEvents.length}.`);
}
if (injectionEvents.length !== 1) {
  throw new Error(`Expected exactly 1 injection event; found ${injectionEvents.length}.`);
}
if (!selected.some((memory) => memory.memoryId === packageManager.id)) {
  throw new Error("Expected package-manager memory to be selected.");
}
if (selected.some((memory) => memory.memoryId === theme.id)) {
  throw new Error("Expected theme memory not to be selected.");
}
if (injectedIds.length !== 1 || injectedIds[0] !== packageManager.id) {
  throw new Error(`Expected only package-manager memory to be injected; got ${injectedIds.join(", ")}.`);
}

console.log(
  JSON.stringify(
    {
      sessionId: session.id,
      selectedMemories: selected.map((memory) => memory.memoryId),
      injectedMemoryIds: injectedIds,
      candidateRules: run.candidateRules.length
    },
    null,
    2
  )
);
```

- [ ] **Step 2: Add package script**

Modify root `package.json`:

```json
"smoke:memory": "node scripts/smoke-memory-retrieval.mjs"
```

- [ ] **Step 3: Document the smoke**

Add under README smoke section:

```markdown
For the Phase 3 retrieval/injection smoke:

```bash
SIGNAL_RECYCLER_MOCK_CODEX=1 SIGNAL_RECYCLER_DB=/tmp/signal-recycler-memory-smoke.sqlite pnpm dev
pnpm smoke:memory
```

The smoke resets memory, creates one relevant and one irrelevant approved memory, runs a package-manager prompt, and fails unless exactly one memory is retrieved and injected.
```

- [ ] **Step 4: Run syntax/build checks**

Run:

```bash
node --check scripts/smoke-memory-retrieval.mjs
pnpm type-check
```

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-memory-retrieval.mjs package.json README.md
git commit -m "test: add memory retrieval smoke"
```

---

### Task 4: PR Notes And Verification

**Files:**

- Create: `docs/pr-notes/phase-3-1-memory-hardening-review-guide.md`
- Create: `docs/pr-notes/phase-3-1-memory-hardening-follow-up-backlog.md`

- [ ] **Step 1: Add review guide**

Create `docs/pr-notes/phase-3-1-memory-hardening-review-guide.md` with:

```markdown
# Phase 3.1 Memory Hardening Review Guide

## Scope Summary

This PR hardens Phase 3 memory retrieval and injection before Phase 4 owned sessions.

## Change Map

- Proxy request context analysis moved into a focused helper.
- Internal classifier detection has contract tests.
- Existing playbook stripping exposes debug metadata.
- Mock Codex no-hit retrieval has direct negative coverage.
- `pnpm smoke:memory` reproduces the two-memory retrieval/injection product smoke.

## Reviewer Focus Areas

- Internal classifier requests should skip memory injection.
- User prompts quoting classifier text should still receive normal retrieval/injection.
- Existing playbook text should not make unrelated memories relevant.
- The smoke script must refuse non-smoke databases unless explicitly overridden.

## Verification

- Fill in final command results before opening the PR.

## Out Of Scope

- Owned-session adapters.
- Repo context index.
- Browser automation.
- Vector retrieval.
```

- [ ] **Step 2: Add follow-up backlog**

Create `docs/pr-notes/phase-3-1-memory-hardening-follow-up-backlog.md` with:

```markdown
# Phase 3.1 Memory Hardening Follow-Up Backlog

## P1: Browser-Level Dashboard Smoke

Residual risk: `pnpm smoke:memory` verifies API behavior, but not rendered dashboard timeline text.

Next action: add browser automation after deciding whether the repo should adopt Playwright or Vitest browser mode.

## P1: Structured Context Envelope Preview

Residual risk: proxy debug metadata helps, but users still cannot preview the full context envelope before an owned-session run.

Next action: include this in Phase 4/4.5 owned-session planning.

## P2: Retrieval Quality Fixture Expansion

Residual risk: hardening tests protect known regressions, not broad lexical retrieval quality.

Next action: expand retrieval eval fixtures after Phase 4 adapter boundaries are clear.
```

- [ ] **Step 3: Run final verification**

Run:

```bash
pnpm --filter @signal-recycler/api test -- proxyRequestContext.test.ts server.test.ts store.test.ts
pnpm type-check
pnpm build
git diff --check
```

If a smoke server is available, run:

```bash
pnpm smoke:memory
```

- [ ] **Step 4: Update review guide verification section**

Replace the placeholder verification section with the actual commands and pass/fail status.

- [ ] **Step 5: Commit docs**

```bash
git add docs/pr-notes/phase-3-1-memory-hardening-review-guide.md docs/pr-notes/phase-3-1-memory-hardening-follow-up-backlog.md
git commit -m "docs: add phase 3.1 review notes"
```

---

## Plan Self-Review

- Spec coverage: the plan covers the selected Phase 3.1 backlog items and explicitly excludes Phase 4 architecture.
- Placeholder scan: no `TODO` or unspecified implementation steps remain.
- Type consistency: helper names and metadata fields are used consistently across route, tests, and docs.
- Scope check: the plan is small enough for a single PR and avoids adding browser automation infrastructure.
